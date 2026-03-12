import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const state = { 
    user: null, isAdmin: false, profiles: {}, currentProfileId: null, 
    movies: {}, series: {}, requests: {} 
};

const $ = (id) => document.getElementById(id);

// מיפוי אלמנטים בדיוק לפי ה-HTML ששלחת
const els = {
    splash: $("splash"), authScreen: $("authScreen"), profilesScreen: $("profilesScreen"), appScreen: $("appScreen"),
    authEmail: $("authEmail"), authPassword: $("authPassword"), authActionBtn: $("authActionBtn"),
    profilesGrid: $("profilesGrid"), activeProfileLabel: $("activeProfileLabel"),
    moviesGrid: $("moviesGrid"), seriesGrid: $("seriesGrid"),
    requestsBtn: $("requestsBtn"), heroRequestsBtn: $("heroRequestsBtn"),
    requestsList: $("requestsList"), requestTitle: $("requestTitle"), requestNote: $("requestNote"),
    sendRequestBtn: $("sendRequestBtn"), searchInput: $("searchInput"),
    randomBtn: $("randomBtn"), heroRandomBtn: $("heroRandomBtn"),
    signOutBtn: $("signOutBtn"), detailsBody: $("detailsBody"),
    playerHost: $("playerHost"), playerTitle: $("playerTitle"), adminBtn: $("adminBtn")
};

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));

// --- פונקציות תצוגה ---
window.showOnly = (which) => {
    els.authScreen?.classList.toggle("hidden", which !== "auth");
    els.profilesScreen?.classList.toggle("hidden", which !== "profiles");
    els.appScreen?.classList.toggle("hidden", which !== "app");
};

window.openModal = (id) => $(id)?.classList.remove("hidden");
window.closeModal = (id) => {
    $(id)?.classList.add("hidden");
    if (id === "playerModal") {
        const p = videojs.getPlayer("mainPlayer");
        if (p) p.dispose();
    }
};

// --- טעינת נתונים (כאן יחזרו הסדרות שלך) ---
onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.isAdmin = !!(user && user.email === ADMIN_EMAIL);
    if (els.adminBtn) els.adminBtn.classList.toggle("hidden", !state.isAdmin);

    if (!user) { window.showOnly("auth"); return; }

    onValue(ref(db, `users/${user.uid}/profiles`), s => { state.profiles = s.val() || {}; renderProfiles(); });
    onValue(ref(db, "movies"), s => { state.movies = s.val() || {}; renderContent(); });
    onValue(ref(db, "series"), s => { state.series = s.val() || {}; renderContent(); });
    onValue(ref(db, "requests"), s => { state.requests = s.val() || {}; renderRequests(); });

    window.showOnly("profiles");
});

// --- רינדור ---
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
};

function renderContent() {
    const query = (els.searchInput?.value || "").toLowerCase();
    const createCard = (type, id, item) => `
        <div class="card" onclick="openDetails('${type}', '${id}')">
            ${state.isAdmin ? `<button class="admin-del" onclick="event.stopPropagation(); deleteItem('${type === 'movie' ? 'movies' : 'series'}','${id}')">×</button>` : ''}
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

// --- פרטים ונגן ---
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

// --- בקשות ---
function renderRequests() {
    if (!els.requestsList) return;
    els.requestsList.innerHTML = Object.entries(state.requests).map(([id, r]) => `
        <div class="request-card">
            <strong>${esc(r.title)}</strong>
            <div class="small muted">${esc(r.profileName)}</div>
            ${state.isAdmin ? `<button onclick="deleteItem('requests','${id}')">🗑️</button>` : ''}
        </div>
    `).join("") || "אין בקשות";
}

window.deleteItem = async (path, id) => {
    if (confirm("למחוק?")) await remove(ref(db, `${path}/${id}`));
};

// --- חיבור אירועים לכפתורי ה-HTML (Event Listeners) ---
if (els.authActionBtn) {
    els.authActionBtn.onclick = async () => {
        const email = els.authEmail.value.trim(), pass = els.authPassword.value.trim();
        try { await signInWithEmailAndPassword(auth, email, pass); } catch (e) { alert(e.message); }
    };
}

if (els.requestsBtn) els.requestsBtn.onclick = () => { renderRequests(); window.openModal("requestsModal"); };
if (els.heroRequestsBtn) els.heroRequestsBtn.onclick = () => { renderRequests(); window.openModal("requestsModal"); };
if (els.sendRequestBtn) {
    els.sendRequestBtn.onclick = async () => {
        const title = els.requestTitle.value.trim();
        if (!title) return;
        await push(ref(db, "requests"), { title, profileName: state.profiles[state.currentProfileId]?.name || "אורח", createdAt: Date.now() });
        els.requestTitle.value = "";
        alert("נשלח!");
    };
}

if (els.signOutBtn) els.signOutBtn.onclick = () => signOut(auth);
if (els.searchInput) els.searchInput.oninput = () => renderContent();

// חשיפה ל-window עבור onclick בתוך ה-HTML (כרטיסיות וסגירת מודאלים)
window.enterApp = window.enterApp;
window.openDetails = window.openDetails;
window.playContent = window.playContent;
window.deleteItem = window.deleteItem;
window.closeModal = window.closeModal;

// סגירת מודאלים בלחיצה על הרקע (תואם ל-data-close ב-HTML שלך)
document.addEventListener("click", (e) => {
    if (e.target.dataset.close) window.closeModal(e.target.dataset.close);
});

setTimeout(() => els.splash?.classList.add("hidden"), 2000);
