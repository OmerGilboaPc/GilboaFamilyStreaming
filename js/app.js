import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const state = { 
    user: null, isAdmin: false, authMode: "login", 
    profiles: {}, currentProfileId: null, 
    movies: {}, series: {}, requests: {}, 
    ratings: {}, progress: {}, ytPlayer: null 
};

const $ = (id) => document.getElementById(id);

const els = {
    splash: $("splash"), authScreen: $("authScreen"), profilesScreen: $("profilesScreen"), appScreen: $("appScreen"),
    authEmail: $("authEmail"), authPassword: $("authPassword"), authActionBtn: $("authActionBtn"),
    profilesGrid: $("profilesGrid"), activeProfileLabel: $("activeProfileLabel"),
    adminBtn: $("adminBtn"), requestsBtn: $("requestsBtn"),
    moviesGrid: $("moviesGrid"), seriesGrid: $("seriesGrid"),
    detailsBody: $("detailsBody"), playerHost: $("playerHost"), playerTitle: $("playerTitle"),
    requestTitle: $("requestTitle"), requestNote: $("requestNote"), requestsList: $("requestsList"),
    searchInput: $("searchInput"), signOutBtn: $("signOutBtn")
};

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
const toast = (msg) => alert(msg);

// --- פונקציות ניווט חשופות ל-window ---
window.showOnly = (which) => {
    if (els.authScreen) els.authScreen.classList.toggle("hidden", which !== "auth");
    if (els.profilesScreen) els.profilesScreen.classList.toggle("hidden", which !== "profiles");
    if (els.appScreen) els.appScreen.classList.toggle("hidden", which !== "app");
};

window.openModal = (id) => {
    const modal = $(id);
    if (modal) modal.classList.remove("hidden");
};

window.closeModal = (id) => {
    const modal = $(id);
    if (modal) {
        modal.classList.add("hidden");
        if (id === "playerModal") destroyPlayer();
    }
};

// --- Auth ---
onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.isAdmin = !!(user && user.email === ADMIN_EMAIL);
    if (els.adminBtn) els.adminBtn.classList.toggle("hidden", !state.isAdmin);

    if (!user) {
        window.showOnly("auth");
        return;
    }
    wireRealtime();
    window.showOnly("profiles");
});

function wireRealtime() {
    const u = state.user.uid;
    onValue(ref(db, `users/${u}/profiles`), s => { state.profiles = s.val() || {}; renderProfiles(); });
    onValue(ref(db, "movies"), s => { state.movies = s.val() || {}; renderAll(); });
    onValue(ref(db, "series"), s => { state.series = s.val() || {}; renderAll(); });
    onValue(ref(db, "requests"), s => { state.requests = s.val() || {}; renderRequests(); });
}

// --- פרופילים ותוכן ---
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

function renderAll() {
    const query = (els.searchInput?.value || "").toLowerCase();
    
    const mapItem = (type, [id, item]) => `
        <div class="card" style="position: relative;">
            ${state.isAdmin ? `<button onclick="deleteContent('${type === 'movie' ? 'movies' : 'series'}', '${id}')" class="btn-delete" style="position:absolute; top:5px; right:5px; z-index:10; background:rgba(0,0,0,0.6); border-radius:50%; border:none; color:white; width:25px; height:25px; cursor:pointer;">×</button>` : ''}
            <div onclick="openDetails('${type}', '${id}')">
                <img class="poster" src="${esc(item.poster)}">
                <div class="card-title">${esc(item.title)}</div>
            </div>
        </div>
    `;

    if (els.moviesGrid) {
        els.moviesGrid.innerHTML = Object.entries(state.movies)
            .filter(([id, m]) => m.title.toLowerCase().includes(query))
            .map(item => mapItem('movie', item)).join("");
    }
    if (els.seriesGrid) {
        els.seriesGrid.innerHTML = Object.entries(state.series)
            .filter(([id, s]) => s.title.toLowerCase().includes(query))
            .map(item => mapItem('series', item)).join("");
    }
}

// --- נגן ופרטים ---
window.openDetails = (type, id) => {
    const item = type === "movie" ? state.movies[id] : state.series[id];
    if (els.detailsBody) {
        els.detailsBody.innerHTML = `
            <h2>${esc(item.title)}</h2>
            <p>${esc(item.description || "")}</p>
            <button class="btn btn-primary" onclick="playContent('${type}', '${id}')">▶ נגן כעת</button>
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

function destroyPlayer() {
    const p = videojs.getPlayer("mainPlayer");
    if (p) p.dispose();
    if (els.playerHost) els.playerHost.innerHTML = "";
}

// --- מערכת בקשות ואדמין ---
window.showRequests = () => {
    renderRequests();
    window.openModal("requestsModal");
};

function renderRequests() {
    if (!els.requestsList) return;
    const list = Object.entries(state.requests).sort((a,b) => (b[1].createdAt||0)-(a[1].createdAt||0));
    els.requestsList.innerHTML = list.map(([id, r]) => `
        <div class="request-card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${esc(r.title)}</strong>
                <div class="small muted">${esc(r.profileName)} • ${new Date(r.createdAt).toLocaleDateString("he-IL")}</div>
            </div>
            <div>
                ${state.isAdmin ? `
                    <button onclick="deleteContent('requests', '${id}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">🗑️</button>
                ` : `<span class="badge">${esc(r.status || 'new')}</span>`}
            </div>
        </div>
    `).join("") || '<div class="muted">אין בקשות</div>';
}

window.sendRequest = async () => {
    const title = els.requestTitle?.value.trim();
    if (!title) return toast("הכנס שם כותר");
    await push(ref(db, "requests"), {
        title, 
        profileName: state.profiles[state.currentProfileId]?.name || "אורח",
        createdAt: Date.now(), 
        status: "new"
    });
    els.requestTitle.value = "";
    toast("הבקשה נשלחה!");
};

window.deleteContent = async (path, id) => {
    if (confirm("בטוח שברצונך למחוק?")) {
        await remove(ref(db, `${path}/${id}`));
        toast("נמחק בהצלחה");
    }
};

// --- חיבור אירועים סופי ---
if (els.authActionBtn) {
    els.authActionBtn.onclick = async () => {
        const email = els.authEmail.value.trim(), pass = els.authPassword.value.trim();
        try {
            state.authMode === "login" ? await signInWithEmailAndPassword(auth, email, pass) : await createUserWithEmailAndPassword(auth, email, pass);
        } catch (e) { toast(e.message); }
    };
}

if (els.signOutBtn) els.signOutBtn.onclick = () => signOut(auth);
if (els.requestsBtn) els.requestsBtn.onclick = window.showRequests;
if (els.searchInput) els.searchInput.oninput = () => renderAll();

setTimeout(() => { if (els.splash) els.splash.classList.add("hidden"); }, 2100);
