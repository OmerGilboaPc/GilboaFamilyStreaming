import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- State ---
const state = { 
    user: null, isAdmin: false, authMode: "login", 
    profiles: {}, currentProfileId: null, 
    movies: {}, series: {}, requests: {}, 
    ratings: {}, progress: {}, ytPlayer: null, ytTimer: null 
};

const $ = (id) => document.getElementById(id);

// --- UI Elements (מבטיח שכל האלמנטים מה-HTML ממופים) ---
const els = {
    splash: $("splash"), authScreen: $("authScreen"), profilesScreen: $("profilesScreen"), appScreen: $("appScreen"),
    authEmail: $("authEmail"), authPassword: $("authPassword"), authActionBtn: $("authActionBtn"), authError: $("authError"),
    profilesGrid: $("profilesGrid"), activeProfileLabel: $("activeProfileLabel"),
    adminBtn: $("adminBtn"), requestsBtn: $("requestsBtn"), heroRequestsBtn: $("heroRequestsBtn"),
    randomBtn: $("randomBtn"), heroRandomBtn: $("heroRandomBtn"), signOutBtn: $("signOutBtn"),
    searchInput: $("searchInput"), continueGrid: $("continueGrid"), 
    moviesGrid: $("moviesGrid"), seriesGrid: $("seriesGrid"),
    detailsBody: $("detailsBody"), playerHost: $("playerHost"), playerTitle: $("playerTitle"),
    requestTitle: $("requestTitle"), requestNote: $("requestNote"), requestsList: $("requestsList")
};

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));

// --- פונקציות ניווט (חובה שיהיו ב-window) ---
window.showOnly = (which) => {
    if(els.authScreen) els.authScreen.classList.toggle("hidden", which !== "auth");
    if(els.profilesScreen) els.profilesScreen.classList.toggle("hidden", which !== "profiles");
    if(els.appScreen) els.appScreen.classList.toggle("hidden", which !== "app");
};

window.openModal = (id) => {
    const m = $(id);
    if(m) m.classList.remove("hidden");
};

window.closeModal = (id) => {
    const m = $(id);
    if(m) {
        m.classList.add("hidden");
        if(id === "playerModal") window.destroyPlayer();
    }
};

// --- Auth & Data Loading ---
onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.isAdmin = !!(user && user.email === ADMIN_EMAIL);
    if (els.adminBtn) els.adminBtn.classList.toggle("hidden", !state.isAdmin);

    if (!user) {
        window.showOnly("auth");
        return;
    }

    // טעינת כל הנתונים בזמן אמת (זה יחזיר את הסדרות והסרטים)
    onValue(ref(db, `users/${user.uid}/profiles`), s => { state.profiles = s.val() || {}; renderProfiles(); });
    onValue(ref(db, "movies"), s => { state.movies = s.val() || {}; renderAll(); });
    onValue(ref(db, "series"), s => { state.series = s.val() || {}; renderAll(); });
    onValue(ref(db, "requests"), s => { state.requests = s.val() || {}; renderRequests(); });

    window.showOnly("profiles");
});

// --- Profiles ---
function renderProfiles() {
    if (!els.profilesGrid) return;
    els.profilesGrid.innerHTML = Object.entries(state.profiles).map(([id, p]) => `
        <div class="profile-card" onclick="enterApp('${id}')">
            <div class="profile-avatar">${esc(p.avatar || "👤")}</div>
            <div class="profile-name">${esc(p.name)}</div>
        </div>
    `).join("");
}

window.enterApp = (profileId) => {
    state.currentProfileId = profileId;
    if (els.activeProfileLabel) els.activeProfileLabel.textContent = state.profiles[profileId]?.name || "פרופיל";
    window.showOnly("app");
    renderAll();
};

// --- Content Rendering ---
function renderAll() {
    const query = (els.searchInput?.value || "").toLowerCase();
    
    const createCard = (type, id, item) => `
        <div class="card" onclick="openDetails('${type}', '${id}')">
            ${state.isAdmin ? `<button class="admin-del" onclick="event.stopPropagation(); deleteItem('${type === 'movie' ? 'movies' : 'series'}','${id}')" style="position:absolute; top:5px; right:5px; background:red; border:none; color:white; border-radius:50%; width:25px; height:25px; cursor:pointer; z-index:20;">×</button>` : ''}
            <img class="poster" src="${esc(item.poster)}">
            <div class="card-title">${esc(item.title)}</div>
        </div>
    `;

    if (els.moviesGrid) {
        els.moviesGrid.innerHTML = Object.entries(state.movies)
            .filter(([_, m]) => m.title.toLowerCase().includes(query))
            .map(([id, m]) => createCard('movie', id, m)).join("");
    }
    if (els.seriesGrid) {
        els.seriesGrid.innerHTML = Object.entries(state.series)
            .filter(([_, s]) => s.title.toLowerCase().includes(query))
            .map(([id, s]) => createCard('series', id, s)).join("");
    }
}

// --- Player & Details ---
window.openDetails = (type, id) => {
    const item = type === "movie" ? state.movies[id] : state.series[id];
    if (els.detailsBody) {
        els.detailsBody.innerHTML = `
            <h2>${esc(item.title)}</h2>
            <p>${esc(item.description || "אין תיאור")}</p>
            <button class="btn btn-primary" onclick="playContent('${type}', '${id}')">▶ נגן</button>
        `;
    }
    window.openModal("detailsModal");
};

window.playContent = (type, id) => {
    const item = type === "movie" ? state.movies[id] : state.series[id];
    if (els.playerTitle) els.playerTitle.textContent = item.title;
    window.openModal("playerModal");
    if (els.playerHost) {
        els.playerHost.innerHTML = `<video id="mainPlayer" class="video-js vjs-theme-city" controls autoplay width="100%"><source src="${item.video}" type="video/mp4"></video>`;
        videojs("mainPlayer", { fluid: true });
    }
};

window.destroyPlayer = () => {
    const p = videojs.getPlayer("mainPlayer");
    if (p) p.dispose();
    if (els.playerHost) els.playerHost.innerHTML = "";
};

// --- Requests ---
window.showRequests = () => {
    renderRequests();
    window.openModal("requestsModal");
};

function renderRequests() {
    if (!els.requestsList) return;
    els.requestsList.innerHTML = Object.entries(state.requests).map(([id, r]) => `
        <div class="request-card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${esc(r.title)}</strong>
                <div class="small muted">${esc(r.profileName)}</div>
            </div>
            ${state.isAdmin ? `<button onclick="deleteItem('requests','${id}')" style="background:none; border:none; cursor:pointer;">🗑️</button>` : ''}
        </div>
    `).join("") || "אין בקשות";
}

window.sendRequest = async () => {
    const title = els.requestTitle?.value.trim();
    if (!title) return alert("הכנס שם!");
    await push(ref(db, "requests"), {
        title, profileName: state.profiles[state.currentProfileId]?.name || "אורח",
        createdAt: Date.now(), status: "new"
    });
    els.requestTitle.value = "";
    alert("נשלח!");
};

window.deleteItem = async (path, id) => {
    if (confirm("למחוק?")) await remove(ref(db, `${path}/${id}`));
};

// --- Events ---
if (els.authActionBtn) {
    els.authActionBtn.onclick = async () => {
        try {
            await signInWithEmailAndPassword(auth, els.authEmail.value, els.authPassword.value);
        } catch (e) { alert(e.message); }
    };
}

if (els.signOutBtn) els.signOutBtn.onclick = () => signOut(auth);
if (els.requestsBtn) els.requestsBtn.onclick = window.showRequests;
if (els.searchInput) els.searchInput.oninput = () => renderAll();

// חשיפה ל-window (קריטי לכפתורים ב-HTML)
window.enterApp = window.enterApp;
window.openDetails = window.openDetails;
window.playContent = window.playContent;
window.deleteItem = window.deleteItem;
window.showRequests = window.showRequests;
window.sendRequest = window.sendRequest;

setTimeout(() => els.splash?.classList.add("hidden"), 2100);
