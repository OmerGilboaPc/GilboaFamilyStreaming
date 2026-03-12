import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const state = { 
    user: null, isAdmin: false, profiles: {}, currentProfileId: null, 
    movies: {}, series: {}, requests: {} 
};

const $ = (id) => document.getElementById(id);

// מיפוי אלמנטים לפי ה-HTML שלך
const els = {
    splash: $("splash"), authScreen: $("authScreen"), profilesScreen: $("profilesScreen"), appScreen: $("appScreen"),
    authEmail: $("authEmail"), authPassword: $("authPassword"), authActionBtn: $("authActionBtn"),
    profilesGrid: $("profilesGrid"), activeProfileLabel: $("activeProfileLabel"),
    moviesGrid: $("moviesGrid"), seriesGrid: $("seriesGrid"),
    requestsBtn: $("requestsBtn"), requestsList: $("requestsList"),
    requestTitle: $("requestTitle"), searchInput: $("searchInput")
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

// --- טעינת נתונים (כדי שהעונה שהעלית תחזור להופיע) ---
onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.isAdmin = !!(user && user.email === ADMIN_EMAIL);
    
    if (!user) {
        window.showOnly("auth");
        return;
    }

    // מאזין לשינויים ב-Database בזמן אמת
    onValue(ref(db, `users/${user.uid}/profiles`), s => { state.profiles = s.val() || {}; renderProfiles(); });
    onValue(ref(db, "movies"), s => { state.movies = s.val() || {}; renderContent(); });
    onValue(ref(db, "series"), s => { state.series = s.val() || {}; renderContent(); });
    onValue(ref(db, "requests"), s => { state.requests = s.val() || {}; renderRequests(); });

    window.showOnly("profiles");
});

// --- רינדור (Rendering) ---
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
    
    // רינדור סרטים
    if (els.moviesGrid) {
        els.moviesGrid.innerHTML = Object.entries(state.movies)
            .filter(([_, m]) => m.title.toLowerCase().includes(query))
            .map(([id, m]) => `
                <div class="card" onclick="openDetails('movie', '${id}')">
                    ${state.isAdmin ? `<button class="admin-del" onclick="event.stopPropagation(); deleteItem('movies','${id}')">×</button>` : ''}
                    <img class="poster" src="${esc(m.poster)}">
                    <div class="card-title">${esc(m.title)}</div>
                </div>
            `).join("");
    }

    // רינדור סדרות (כאן תופיע העונה שהעלית)
    if (els.seriesGrid) {
        els.seriesGrid.innerHTML = Object.entries(state.series)
            .filter(([_, s]) => s.title.toLowerCase().includes(query))
            .map(([id, s]) => `
                <div class="card" onclick="openDetails('series', '${id}')">
                    ${state.isAdmin ? `<button class="admin-del" onclick="event.stopPropagation(); deleteItem('series','${id}')">×</button>` : ''}
                    <img class="poster" src="${esc(s.poster)}">
                    <div class="card-title">${esc(s.title)}</div>
                </div>
            `).join("");
    }
}

// --- ניהול תוכן ובקשות ---
window.showRequests = () => {
    renderRequests();
    window.openModal("requestsModal");
};

function renderRequests() {
    if (!els.requestsList) return;
    els.requestsList.innerHTML = Object.entries(state.requests).map(([id, r]) => `
        <div class="request-card">
            <div>
                <strong>${esc(r.title)}</strong>
                <div class="small muted">${esc(r.profileName)}</div>
            </div>
            ${state.isAdmin ? `<button onclick="deleteItem('requests','${id}')">🗑️</button>` : ''}
        </div>
    `).join("");
}

window.deleteItem = async (path, id) => {
    if (confirm("למחוק לצמיתות?")) await remove(ref(db, `${path}/${id}`));
};

// --- אירועים ---
if (els.authActionBtn) {
    els.authActionBtn.onclick = async () => {
        try {
            await signInWithEmailAndPassword(auth, els.authEmail.value, els.authPassword.value);
        } catch (e) { alert("שגיאה: " + e.message); }
    };
}

if (els.requestsBtn) els.requestsBtn.onclick = window.showRequests;

// חשוב: חשיפת פונקציות ל-window כדי שה-HTML יזהה אותן
window.enterApp = window.enterApp;
window.deleteItem = window.deleteItem;

setTimeout(() => els.splash?.classList.add("hidden"), 2000);
