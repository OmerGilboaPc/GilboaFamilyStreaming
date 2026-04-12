// ============================================================
//  GILBOASTREAMFAMILY — app.js v3.0
//  פיצ'רים: wishlist, history, notifications, trailer, PIN,
//           "חדש השבוע", המלצות, מיון, המשך צפייה
// ============================================================

import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, signOut }
                                from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, remove, update, get }
                                from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── 🔧 Firebase Config — החלף בשלך ──────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCPDS6U9LokVN-f4uQj9rdaWuCnut72bts",
  authDomain:        "netflixfamilystreaming-b0ca4.firebaseapp.com",
  databaseURL:       "https://netflixfamilystreaming-b0ca4-default-rtdb.firebaseio.com",
  projectId:         "netflixfamilystreaming-b0ca4",
  storageBucket:     "netflixfamilystreaming-b0ca4.firebasestorage.app",
  messagingSenderId: "116100612969",
  appId:             "1:116100612969:web:29387c89e455e36d8373f8"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

const ADMIN_EMAIL = "omergilboapc@gmail.com";
const NEW_DAYS    = 7; // כמה ימים נחשב "חדש"

// ── Activity Log ─────────────────────────────────────────────
async function logActivity(action, details = {}) {
  if (!currentUser) return;
  try {
    await push(ref(db, 'activityLog'), {
      action,
      uid:         currentUser.uid,
      email:       currentUser.email,
      profileName: currentProfile?.name || 'לא ידוע',
      profileId:   currentProfile?.id   || '',
      timestamp:   Date.now(),
      ...details
    });
  } catch(e) { /* fail silently */ }
}

// ── State ────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let allMovies      = {};
let allSeries      = {};
let allEpisodes    = {};
let wishlist       = {};   // { itemId: { type, id, addedAt } }
let watchHistory   = [];   // [{ id, type, title, poster, watchedAt, ... }]
let continueData   = {};   // { itemId: { progress, timestamp, ... } }
let currentWishlistFilter = 'all';
let unsubscribers  = [];
let allScheduled   = {};
let allQuizzes     = {};

// ── Helpers ──────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (html) e.innerHTML   = html;
  return e;
};

function showScreen(id) {
  ['authScreen','profilesScreen','appScreen'].forEach(s => {
    $(s)?.classList.toggle('hidden', s !== id);
  });
}

function isNew(item) {
  if (!item.createdAt) return false;
  const diff = Date.now() - item.createdAt;
  return diff < NEW_DAYS * 24 * 60 * 60 * 1000;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 2)  return 'עכשיו';
  if (m < 60) return `לפני ${m} דקות`;
  if (h < 24) return `לפני ${h} שעות`;
  return `לפני ${d} ימים`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Splash ───────────────────────────────────────────────────
setTimeout(() => {
  const splash = $('splash');
  if (splash) {
    splash.style.transition = 'opacity 0.6s ease';
    splash.style.opacity    = '0';
    setTimeout(() => splash.remove(), 700);
  }
}, 2200);

// ── Auth Tabs ────────────────────────────────────────────────
let authMode = 'login';
document.querySelectorAll('[data-auth-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    authMode = btn.dataset.authMode;
    document.querySelectorAll('[data-auth-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.authMode === authMode));
    $('authActionBtn').textContent = authMode === 'login' ? 'התחברות' : 'הרשמה';
    $('authError').textContent = '';
  });
});

$('authActionBtn')?.addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  const pass  = $('authPassword').value.trim();
  $('authError').textContent = '';
  try {
    if (authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, pass);
    } else {
      await createUserWithEmailAndPassword(auth, email, pass);
    }
  } catch (e) {
    $('authError').textContent = e.message;
  }
});

// ── Auth State ───────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    showScreen('profilesScreen');
    loadProfiles();
  } else {
    currentProfile = null;
    showScreen('authScreen');
    unsubscribers.forEach(u => u());
    unsubscribers = [];
  }
});

$('signOutBtn')?.addEventListener('click',         () => signOut(auth));
$('signOutProfilesBtn')?.addEventListener('click', () => signOut(auth));
$('switchProfileBtn')?.addEventListener('click',   () => {
  currentProfile = null;
  showScreen('profilesScreen');
  loadProfiles();
});

// ── Profiles ─────────────────────────────────────────────────
function loadProfiles() {
  const grid = $('profilesGrid');
  if (!grid || !currentUser) return;
  get(ref(db, `users/${currentUser.uid}/profiles`)).then(snap => {
    const profiles = snap.val() || {};
    grid.innerHTML = '';

    Object.entries(profiles).forEach(([pid, profile]) => {
      const card = el('div', 'profile-card');
      card.innerHTML = `
        <div class="profile-avatar" style="${profile.picUrl ? 'padding:0;overflow:hidden;background:none;' : ''}">
          ${profile.picUrl
            ? `<img src="${profile.picUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:24px;" onerror="this.style.display='none'" />`
            : (profile.avatar || '🎬')}
        </div>
        <div class="profile-name">${profile.name}</div>
        ${profile.pin ? '<div class="small muted" style="margin-top:4px;">🔒 מוגן</div>' : ''}
      `;
      card.addEventListener('click', () => {
        if (profile.pin) {
          window.openPinModal(profile.name, profile.avatar || '🎬', 4, entered => {
            if (entered === profile.pin) {
              selectProfile(pid, profile);
              return true;
            }
            return false;
          });
        } else {
          selectProfile(pid, profile);
        }
      });
      grid.appendChild(card);
    });

    // Add new profile card
    const addCard = el('div', 'profile-card', `
      <div class="profile-avatar" style="font-size:32px; color:var(--muted);">➕</div>
      <div class="profile-name" style="color:var(--muted);">הוסף פרופיל</div>
    `);
    addCard.style.cursor = 'pointer';
    addCard.addEventListener('click', () => openModal('profilesModal'));
    grid.appendChild(addCard);
  });
}

function selectProfile(pid, profile) {
  currentProfile = { id: pid, ...profile };
  $('activeProfileLabel').textContent = profile.name;
  $('adminBtn').classList.toggle('hidden', currentUser.email !== ADMIN_EMAIL);
  showScreen('appScreen');
  loadAll();
  checkNotifications();
  initWrappedMonthSelector();
  logActivity('כניסה לפרופיל', { profileName: profile.name });
}

// ── Profiles Manager ─────────────────────────────────────────
$('openProfilesManagerBtn')?.addEventListener('click', () => openModal('profilesModal'));

$('addProfileBtn')?.addEventListener('click', async () => {
  const name   = $('newProfileName').value.trim();
  const avatar = $('newProfileAvatar').value.trim() || '🎬';
  const pin    = $('newProfilePin')?.value.trim() || '';
  if (!name) return;
  const picUrl = $('newProfilePicUrl')?.value.trim() || '';
  const profileData = { name, avatar, createdAt: Date.now() };
  if (picUrl) profileData.picUrl = picUrl;
  if (pin.length === 4 && /^\d{4}$/.test(pin)) profileData.pin = pin;
  await push(ref(db, `users/${currentUser.uid}/profiles`), profileData);
  $('newProfileName').value  = '';
  $('newProfileAvatar').value = '';
  if ($('newProfilePin')) $('newProfilePin').value = '';
  loadProfilesManageList();
  loadProfiles();
  window.showToast('פרופיל נוסף!', 'success');
});

function loadProfilesManageList() {
  const list = $('profilesManageList');
  if (!list || !currentUser) return;
  get(ref(db, `users/${currentUser.uid}/profiles`)).then(snap => {
    const profiles = snap.val() || {};
    list.innerHTML = '';
    Object.entries(profiles).forEach(([pid, p]) => {
      const item = el('div', 'request-card');
      item.innerHTML = `
        <span style="font-size:24px;">${p.avatar || '🎬'}</span>
        <span style="flex:1; font-weight:700;">${p.name}</span>
        ${p.pin ? '<span class="badge">🔒 PIN</span>' : ''}
        <button class="btn btn-secondary small" style="padding:6px 10px; font-size:12px;" data-del="${pid}">🗑</button>
      `;
      item.querySelector('[data-del]').addEventListener('click', async () => {
        await remove(ref(db, `users/${currentUser.uid}/profiles/${pid}`));
        loadProfilesManageList();
        loadProfiles();
        window.showToast('פרופיל נמחק', 'info');
      });
      list.appendChild(item);
    });
  });
}

$('openProfilesManagerBtn')?.addEventListener('click', loadProfilesManageList);

// ── Load All Data ────────────────────────────────────────────
function loadAll() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];

  // Movies
  const moviesUnsub = onValue(ref(db, 'movies'), snap => {
    allMovies = snap.val() || {};
    renderMovies();
    renderNewThisWeek();
    updateStats();
    renderWishlist();
  });
  unsubscribers.push(moviesUnsub);

  // Series
  const seriesUnsub = onValue(ref(db, 'series'), snap => {
    allSeries = snap.val() || {};
    renderSeries();
    renderNewThisWeek();
    updateStats();
    renderWishlist();
  });
  unsubscribers.push(seriesUnsub);

  // Scheduled content (בקרוב)
  const scheduledUnsub = onValue(ref(db, 'scheduled'), snap => {
    allScheduled = snap.val() || {};
    renderComingSoon();
    renderHomeComingSoon();
    checkAndPublishScheduled();
  });
  unsubscribers.push(scheduledUnsub);

  // Quizzes
  const quizzesUnsub = onValue(ref(db, 'quizzes'), snap => {
    allQuizzes = snap.val() || {};
    renderQuizzesList();
  });
  unsubscribers.push(quizzesUnsub);

  // Episodes — מבנה: series/{id}/seasons/{n}/episodes/{n}
  // הפרקים נטענים מתוך allSeries ישירות, לא collection נפרד
  // allEpisodes משמש לספירה בלבד — נבנה מ-allSeries
  const epsUnsub = onValue(ref(db, 'series'), snap => {
    const seriesData = snap.val() || {};
    // ספור פרקים מכל הסדרות
    let count = 0;
    Object.values(seriesData).forEach(s => {
      const seasons = s.seasons || {};
      Object.values(seasons).forEach(season => {
        const eps = season.episodes || {};
        count += Object.keys(eps).length;
      });
    });
    allEpisodes = { _count: count }; // just for stats
    updateStats();
  });
  unsubscribers.push(epsUnsub);

  // Wishlist (per profile)
  if (currentProfile) {
    const wlUnsub = onValue(
      ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/wishlist`), snap => {
        wishlist = snap.val() || {};
        renderWishlist();
        updateWishlistBtns();
      });
    unsubscribers.push(wlUnsub);

    // Continue watching
    const contUnsub = onValue(
      ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/continue`), snap => {
        continueData = snap.val() || {};
        renderContinue();
      });
    unsubscribers.push(contUnsub);

    // History
    const histUnsub = onValue(
      ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/history`), snap => {
        const raw = snap.val() || {};
        watchHistory = Object.values(raw).sort((a, b) => b.watchedAt - a.watchedAt);
        renderHistory();
      });
    unsubscribers.push(histUnsub);
  }
}

// ── Stats ────────────────────────────────────────────────────
function updateStats() {
  // ספור פרקים מכל הסדרות (מבנה series/{id}/seasons/{n}/episodes/{n})
  let epCount = 0;
  Object.values(allSeries).forEach(s => {
    const seasons = s.seasons || {};
    Object.values(seasons).forEach(season => {
      epCount += Object.keys(season.episodes || {}).length;
    });
  });
  $('moviesCount').textContent   = Object.keys(allMovies).length;
  $('seriesCount').textContent   = Object.keys(allSeries).length;
  $('episodesCount').textContent = epCount;
}

// ── Build Card ───────────────────────────────────────────────
function buildCard(id, item, type) {
  const inWishlist = !!wishlist[id];
  const novel      = isNew(item);
  const progress   = continueData[id];

  const card = el('div', 'card');
  card.dataset.id   = id;
  card.dataset.type = type;

  const pct = progress
    ? Math.round((progress.position / (progress.duration || 1)) * 100)
    : 0;

  card.innerHTML = `
    <div class="poster-wrap">
      <img class="poster" src="${item.poster || ''}"
           alt="${item.title}"
           loading="lazy"
           onerror="this.style.background='#1a1a28'; this.src='';" />
      ${novel ? '<div class="new-badge">חדש</div>' : ''}
      <button class="wishlist-btn ${inWishlist ? 'in-list' : ''}"
              title="${inWishlist ? 'הסר מהרשימה' : 'הוסף לרשימה'}">
        ${inWishlist ? '❤️' : '🤍'}
      </button>
    </div>
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-meta">
        <span class="badge">${type === 'movie' ? '🎬 סרט' : '📺 סדרה'}</span>
        ${item.category ? `<span class="badge">${item.category}</span>` : ''}
        ${item.year     ? `<span class="badge">${item.year}</span>`     : ''}
        ${item.trailer  ? '<span class="badge badge-red">🎬 טריילר</span>' : ''}
      </div>
      ${progress && pct > 0 ? `
        <div class="series-progress-wrap" style="margin-top:10px;">
          <div class="series-progress-track">
            <div class="series-progress-fill" style="width:${pct}%"></div>
          </div>
          <span>${pct}%</span>
        </div>` : ''}
    </div>
  `;

  // Wishlist button
  card.querySelector('.wishlist-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleWishlist(id, item, type, e.currentTarget);
  });

  // Open details
  card.addEventListener('click', () => openDetails(id, item, type));

  return card;
}

// ── Render Movies ────────────────────────────────────────────
function renderMovies(sortBy = 'default') {
  const grid = $('moviesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  let items = Object.entries(allMovies);
  items = sortItems(items, sortBy);

  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎬</div><p>אין סרטים עדיין</p></div>';
    return;
  }

  items.forEach(([id, movie], i) => {
    const card = buildCard(id, movie, 'movie');
    card.style.animationDelay = `${i * 0.04}s`;
    grid.appendChild(card);
  });
}

// ── Render Series ────────────────────────────────────────────
function renderSeries(sortBy = 'default') {
  const grid = $('seriesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  let items = Object.entries(allSeries);
  items = sortItems(items, sortBy);

  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📺</div><p>אין סדרות עדיין</p></div>';
    return;
  }

  items.forEach(([id, series], i) => {
    const card = buildCard(id, series, 'series');
    card.style.animationDelay = `${i * 0.04}s`;
    grid.appendChild(card);
  });
}

// ── Sort ─────────────────────────────────────────────────────
function sortItems(entries, sortBy) {
  switch (sortBy) {
    case 'name':    return entries.sort((a, b) => (a[1].title || '').localeCompare(b[1].title || '', 'he'));
    case 'rating':  return entries.sort((a, b) => (b[1].rating || 0) - (a[1].rating || 0));
    case 'year':    return entries.sort((a, b) => (b[1].year || 0) - (a[1].year || 0));
    case 'new':     return entries.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    default:        return entries;
  }
}

window.addEventListener('sortChanged', e => {
  const { type, value } = e.detail;
  if (type === 'movieSort')  renderMovies(value);
  if (type === 'seriesSort') renderSeries(value);
});

// ── New This Week ────────────────────────────────────────────
function renderNewThisWeek() {
  const section = $('newThisWeekSection');
  const grid    = $('newThisWeekGrid');
  if (!section || !grid) return;

  const newItems = [
    ...Object.entries(allMovies).filter(([, m]) => isNew(m)).map(([id, m]) => [id, m, 'movie']),
    ...Object.entries(allSeries).filter(([, s]) => isNew(s)).map(([id, s]) => [id, s, 'series']),
  ].sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  section.style.display = newItems.length > 0 ? '' : 'none';
  grid.innerHTML = '';
  newItems.forEach(([id, item, type]) => grid.appendChild(buildCard(id, item, type)));
}

// ── Continue Watching ────────────────────────────────────────
function renderContinue() {
  const grid    = $('continueGrid');
  const section = $('continueSection');
  if (!grid) return;
  grid.innerHTML = '';

  const items = Object.entries(continueData)
    .filter(([, d]) => d.progress > 0 && d.progress < 95)
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

  if (section) section.style.display = items.length > 0 ? '' : 'none';

  items.forEach(([id, data]) => {
    const item = allMovies[id] || allSeries[id];
    if (!item) return;
    const type = allMovies[id] ? 'movie' : 'series';
    const card = buildCard(id, item, type);

    // Continue badge
    const badge = el('div', 'continue-badge', '▶ המשך');
    card.querySelector('.poster-wrap').appendChild(badge);

    grid.appendChild(card);
  });
}

$('clearContinueBtn')?.addEventListener('click', async () => {
  if (!currentProfile) return;
  await remove(ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/continue`));
  window.showToast('המשך צפייה נוקה', 'info');
});

// ── ❤️ Wishlist ───────────────────────────────────────────────
async function toggleWishlist(id, item, type, btn) {
  if (!currentProfile) return;
  const wlRef = ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/wishlist/${id}`);
  if (wishlist[id]) {
    await remove(wlRef);
    window.showToast(`"${item.title}" הוסר מהרשימה`, 'info', '💔');
  } else {
    await set(wlRef, { type, title: item.title, poster: item.poster || '', addedAt: Date.now() });
    window.showToast(`"${item.title}" נוסף לרשימה!`, 'success', '❤️');
    btn?.classList.add('pop');
    setTimeout(() => btn?.classList.remove('pop'), 400);
  }
}

function updateWishlistBtns() {
  document.querySelectorAll('.card').forEach(card => {
    const id  = card.dataset.id;
    const btn = card.querySelector('.wishlist-btn');
    if (!btn || !id) return;
    const inList = !!wishlist[id];
    btn.classList.toggle('in-list', inList);
    btn.textContent = inList ? '❤️' : '🤍';
    btn.title       = inList ? 'הסר מהרשימה' : 'הוסף לרשימה';
  });
}

function renderWishlist() {
  const grid  = $('wishlistGrid');
  const empty = $('wishlistEmpty');
  if (!grid) return;
  grid.innerHTML = '';

  const filter = currentWishlistFilter;
  const items  = Object.entries(wishlist).filter(([, v]) =>
    filter === 'all' || v.type === filter
  );

  if (items.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  items.sort((a, b) => (b[1].addedAt || 0) - (a[1].addedAt || 0));
  items.forEach(([id, data]) => {
    const source = data.type === 'movie' ? allMovies : allSeries;
    const item   = source[id];
    if (!item) return;
    grid.appendChild(buildCard(id, item, data.type));
  });
}

window.addEventListener('wishlistFilter', e => {
  currentWishlistFilter = e.detail;
  renderWishlist();
});

// ── 🕒 History ───────────────────────────────────────────────
async function addToHistory(id, type, item, extra = {}) {
  if (!currentProfile) return;
  const entry = {
    id, type,
    title:     item.title,
    poster:    item.poster || '',
    watchedAt: Date.now(),
    ...extra
  };
  await push(ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/history`), entry);
}

function renderHistory() {
  const list  = $('historyList');
  const empty = $('historyEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (watchHistory.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  watchHistory.forEach((entry, i) => {
    const div = el('div', 'history-item');
    div.innerHTML = `
      <img class="history-thumb" src="${entry.poster}" alt="${entry.title}"
           onerror="this.style.background='#1a1a28'; this.src='';" />
      <div class="history-info">
        <div class="history-title">${entry.title}</div>
        <div class="history-meta">
          ${entry.type === 'movie' ? '🎬 סרט' : '📺 סדרה'}
          ${entry.episode ? ` • עונה ${entry.season} פרק ${entry.episode}` : ''}
        </div>
        <div class="history-time">${timeAgo(entry.watchedAt)}</div>
      </div>
      <button class="history-delete" title="מחק מהיסטוריה" data-key="${entry._key || i}">🗑</button>
    `;

    div.querySelector('.history-item, img, .history-info')?.addEventListener?.('click', () => {
      const item = entry.type === 'movie' ? allMovies[entry.id] : allSeries[entry.id];
      if (item) openDetails(entry.id, item, entry.type);
    });
    div.addEventListener('click', e => {
      if (e.target.closest('.history-delete')) return;
      const item = entry.type === 'movie' ? allMovies[entry.id] : allSeries[entry.id];
      if (item) openDetails(entry.id, item, entry.type);
    });

    list.appendChild(div);
  });
}

window.addEventListener('clearHistory', async () => {
  if (!currentProfile) return;
  await remove(ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/history`));
  window.showToast('היסטוריה נוקתה', 'info');
});

// ── 🔔 Notifications ─────────────────────────────────────────
// מבנה Firebase:
//   /notifications/{id} = { title, body, icon, createdAt, expiresAt, type:'custom'|'content' }
//   /users/{uid}/profiles/{pid}/lastSeen = timestamp
//   /users/{uid}/profiles/{pid}/readNotifs/{notifId} = true

let notifUnsub = null;

async function checkNotifications() {
  if (!currentProfile) return;

  // Update lastSeen
  const lastSeenRef = ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/lastSeen`);
  const lastSeenSnap = await get(lastSeenRef);
  const lastSeen = lastSeenSnap.val() || 0;
  await set(lastSeenRef, Date.now());

  // Listen to /notifications in real-time
  if (notifUnsub) notifUnsub();
  notifUnsub = onValue(ref(db, 'notifications'), async snap => {
    const allNotifs = snap.val() || {};
    const now = Date.now();

    // Read status for this profile
    const readSnap = await get(ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/readNotifs`));
    const readMap = readSnap.val() || {};

    // Filter: not expired, not read
    const active = Object.entries(allNotifs)
      .filter(([nid, n]) => {
        if (readMap[nid]) return false;                     // כבר נקרא
        if (n.expiresAt && now > n.expiresAt) return false; // פג תוקף
        return true;
      })
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

    // Content notifications (חדש מאז הכניסה)
    const newContent = [
      ...Object.entries(allMovies).filter(([, m]) => (m.createdAt || 0) > lastSeen).map(([id, m]) => ({ id, ...m, type: 'movie' })),
      ...Object.entries(allSeries).filter(([, s]) => (s.createdAt || 0) > lastSeen).map(([id, s]) => ({ id, ...s, type: 'series' })),
    ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const totalCount = active.length + (lastSeen > 0 ? newContent.length : 0);
    const badge = $('notifBadge');
    const panel = $('notifPanel');

    if (badge) {
      if (totalCount > 0) {
        badge.textContent = totalCount > 9 ? '9+' : totalCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (!panel) return;
    panel.innerHTML = '';

    if (totalCount === 0) {
      panel.innerHTML = '<div class="notif-empty">🎉 אין התראות חדשות</div>';
      return;
    }

    // ── Custom notifications (מהאדמין) ──────────────────
    if (active.length > 0) {
      const head = document.createElement('div');
      head.className = 'notif-panel-head';
      head.innerHTML = `<span>📢 הודעות מהמנהל</span><span class="badge badge-red">${active.length}</span>`;
      panel.appendChild(head);

      active.forEach(([nid, n]) => {
        const row = el('div', 'notif-item notif-item-custom');
        row.style.cssText = 'background:rgba(229,9,20,0.05);border-bottom:1px solid rgba(229,9,20,0.1);';
        row.innerHTML = `
          <div style="font-size:26px;flex-shrink:0;">${n.icon || '📢'}</div>
          <div class="notif-item-info" style="flex:1;">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-sub" style="white-space:normal;line-height:1.4;">${n.body || ''}</div>
            <div class="notif-item-sub" style="margin-top:4px;opacity:.6;">${timeAgo(n.createdAt)}</div>
          </div>
          <button class="notif-dismiss-btn" data-nid="${nid}" title="סמן כנקרא"
                  style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;padding:4px;flex-shrink:0;">✕</button>
        `;
        row.querySelector('.notif-dismiss-btn').addEventListener('click', async e => {
          e.stopPropagation();
          await set(ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/readNotifs/${nid}`), true);
        });
        panel.appendChild(row);
      });
    }

    // ── Content notifications (תוכן חדש) ────────────────
    if (lastSeen > 0 && newContent.length > 0) {
      const head2 = document.createElement('div');
      head2.className = 'notif-panel-head';
      head2.innerHTML = `<span>✨ חדש מאז הכניסה האחרונה</span><span class="badge badge-red">${newContent.length}</span>`;
      panel.appendChild(head2);

      newContent.slice(0, 6).forEach(item => {
        const row = el('div', 'notif-item');
        row.innerHTML = `
          <img src="${item.poster || ''}" alt="${item.title}"
               onerror="this.style.background='#1a1a28'; this.src='';" />
          <div class="notif-item-info">
            <div class="notif-item-title">${item.title}</div>
            <div class="notif-item-sub">${item.type === 'movie' ? '🎬 סרט חדש' : '📺 סדרה חדשה'} • ${timeAgo(item.createdAt)}</div>
          </div>
        `;
        row.addEventListener('click', () => {
          panel.classList.add('hidden');
          openDetails(item.id, item, item.type);
        });
        panel.appendChild(row);
      });
    }
  });
}

window.addEventListener('notifOpened', () => {
  // לא מסיר את ה-badge — הוא ייעלם רק כשקוראים/פג תוקף
});

// ── Details Modal ────────────────────────────────────────────
function openDetails(id, item, type) {
  const body     = $('detailsBody');
  const modal    = $('detailsModal');
  if (!body || !modal) return;

  const inWishlist = !!wishlist[id];
  const myRating   = item.ratings?.[currentProfile?.id] || 0;

  if (type === 'movie') {
    body.innerHTML = `
      <div class="details-layout">
        <div>
          <img class="details-poster"
               src="${item.poster || ''}"
               alt="${item.title}"
               onerror="this.style.background='#1a1a28'; this.src='';" />
        </div>
        <div>
          <div class="eyebrow">${item.category || ''} ${item.year ? '• ' + item.year : ''}</div>
          <h2 class="details-title">${item.title}</h2>
          <p class="details-desc">${item.description || ''}</p>

          <div class="details-actions">
            ${item.video ? `
              <button class="btn btn-primary" id="playMovieBtn">
                ▶ הפעל סרט
              </button>` : ''}
            ${item.trailer ? `
              <button class="btn btn-trailer btn-secondary" id="playTrailerBtn">
                🎬 צפה בטריילר
              </button>` : ''}
            <button class="btn btn-wishlist-detail ${inWishlist ? 'in-list' : ''}" id="detailWishlistBtn">
              ${inWishlist ? '❤️ ברשימה שלי' : '🤍 הוסף לרשימה'}
            </button>
          </div>

          <div class="rating-stars">
            <span class="small muted" style="margin-left:6px;">דירוג שלך:</span>
            ${[1,2,3,4,5].map(n => `
              <button class="star-btn ${myRating >= n ? 'active' : ''}" data-star="${n}">
                ${'⭐'.repeat(n)}
              </button>`).join('')}
          </div>
        </div>
      </div>
    `;

    // Play movie
    body.querySelector('#playMovieBtn')?.addEventListener('click', () => {
      closeModal('detailsModal');
      playVideo(item.video, item.title, '', false);
      addToHistory(id, 'movie', item);
    });

    // Play trailer
    body.querySelector('#playTrailerBtn')?.addEventListener('click', () => {
      closeModal('detailsModal');
      playVideo(item.trailer, item.title, 'טריילר', false, true);
    });

    // Wishlist
    body.querySelector('#detailWishlistBtn')?.addEventListener('click', async e => {
      await toggleWishlist(id, item, type, null);
      // Refresh button
      const inList = !!wishlist[id];
      e.target.textContent = inList ? '❤️ ברשימה שלי' : '🤍 הוסף לרשימה';
      e.target.classList.toggle('in-list', inList);
    });

  } else {
    // Series — מבנה: series/{id}/seasons/{seasonNum}/episodes/{epNum}
    // פורמט episodes: [ [uniqueKey, { season, number, title, video, ... }], ... ]
    const seasonsData = item.seasons || {};
    const episodes = [];
    Object.entries(seasonsData).forEach(([seasonNum, seasonObj]) => {
      const eps = seasonObj.episodes || {};
      Object.entries(eps).forEach(([epNum, ep]) => {
        // המפתח הייחודי: seriesId_season_epNum
        const uniqueKey = `${id}_s${seasonNum}_e${epNum}`;
        episodes.push([uniqueKey, {
          ...ep,
          season: Number(seasonNum),
          number: Number(epNum),
          _seasonKey: seasonNum,
          _epKey: epNum,
        }]);
      });
    });
    episodes.sort((a, b) => {
      if (a[1].season !== b[1].season) return a[1].season - b[1].season;
      return a[1].number - b[1].number;
    });

    const seasons = [...new Set(episodes.map(([, ep]) => ep.season))].sort((a, b) => a - b);
    const totalEps  = episodes.length;
    const watchedEps = episodes.filter(([eid]) => continueData[eid]?.progress > 80).length;
    const pct       = totalEps > 0 ? Math.round((watchedEps / totalEps) * 100) : 0;

    body.innerHTML = `
      <div class="details-layout">
        <div>
          <img class="details-poster"
               src="${item.poster || ''}"
               alt="${item.title}"
               onerror="this.style.background='#1a1a28'; this.src='';" />
          ${totalEps > 0 ? `
            <div class="series-progress-wrap" style="margin-top:14px;">
              <div class="series-progress-track">
                <div class="series-progress-fill" style="width:${pct}%"></div>
              </div>
              <span>${watchedEps}/${totalEps} פרקים</span>
            </div>` : ''}
        </div>
        <div>
          <div class="eyebrow">${item.category || ''} ${item.year ? '• ' + item.year : ''}</div>
          <h2 class="details-title">${item.title}</h2>
          <p class="details-desc">${item.description || ''}</p>

          <div class="details-actions">
            ${item.trailer ? `
              <button class="btn btn-trailer btn-secondary" id="playTrailerBtn">
                🎬 צפה בטריילר
              </button>` : ''}
            <button class="btn btn-wishlist-detail ${inWishlist ? 'in-list' : ''}" id="detailWishlistBtn">
              ${inWishlist ? '❤️ ברשימה שלי' : '🤍 הוסף לרשימה'}
            </button>
          </div>

          <div class="rating-stars">
            <span class="small muted" style="margin-left:6px;">דירוג שלך:</span>
            ${[1,2,3,4,5].map(n => `
              <button class="star-btn ${myRating >= n ? 'active' : ''}" data-star="${n}">
                ${'⭐'.repeat(n)}
              </button>`).join('')}
          </div>

          ${seasons.length > 0 ? `
            <div class="seasons-nav" id="seasonsNav">
              ${seasons.map((s, i) => `
                <button class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} season-btn"
                        data-season="${s}">עונה ${s}</button>
              `).join('')}
            </div>
            <div id="episodeList" class="episode-list"></div>
          ` : '<div class="muted" style="margin-top:18px;">אין פרקים עדיין</div>'}
        </div>
      </div>
    `;

    // Trailer
    body.querySelector('#playTrailerBtn')?.addEventListener('click', () => {
      closeModal('detailsModal');
      playVideo(item.trailer, item.title, 'טריילר', false, true);
    });

    // Wishlist
    body.querySelector('#detailWishlistBtn')?.addEventListener('click', async e => {
      await toggleWishlist(id, item, type, null);
      const inList = !!wishlist[id];
      e.target.textContent = inList ? '❤️ ברשימה שלי' : '🤍 הוסף לרשימה';
      e.target.classList.toggle('in-list', inList);
    });

    // Seasons nav
    if (seasons.length > 0) {
      renderEpisodes(episodes, seasons[0], id, item);

      body.querySelectorAll('.season-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          body.querySelectorAll('.season-btn').forEach(b =>
            b.className = b === btn ? 'btn btn-primary season-btn' : 'btn btn-secondary season-btn');
          renderEpisodes(episodes, +btn.dataset.season, id, item);
        });
      });
    }
  }

  // Rating stars
  body.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = +btn.dataset.star;
      set(ref(db, `${type === 'movie' ? 'movies' : 'series'}/${id}/ratings/${currentProfile.id}`), n);
      body.querySelectorAll('.star-btn').forEach((b, i) =>
        b.classList.toggle('active', i < n));
      window.showToast(`דירגת ${n} כוכבים!`, 'success', '⭐');
      logActivity('דירוג', { contentTitle: item?.title || id, stars: n });
    });
  });

  openModal('detailsModal');
}

function renderEpisodes(episodes, season, seriesId, seriesItem) {
  const list = $('episodeList');
  if (!list) return;
  list.innerHTML = '';

  const filtered = episodes.filter(([, ep]) => ep.season === season);

  if (filtered.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:14px;">אין פרקים בעונה זו</div>';
    return;
  }

  filtered.forEach(([epId, ep]) => {
    const epNum    = ep.number  ?? ep._epKey ?? '?';
    const epSeason = ep.season  ?? season;
    const epTitle  = ep.title   ?? ep.name  ?? '';
    const epVideo  = ep.video   ?? ep.url   ?? ep.videoUrl ?? ep.link ?? '';
    const epDesc   = ep.description ?? ep.desc ?? '';
    const epPoster = ep.poster  ?? ep.thumbnail ?? ep.image ?? ep.thumb ?? '';

    // continueData key = seriesId_season_epNum (אותו uniqueKey שבנינו)
    const watched = (continueData[epId]?.progress || 0) > 80;

    const item = el('div', 'episode-item');
    item.innerHTML = `
      <img src="${epPoster}" alt="${epTitle}"
           onerror="this.style.background='#222'; this.src='';" />
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:14px;">
          פרק ${epNum}${epTitle ? ' — ' + epTitle : ''}
          ${watched ? '<span class="badge" style="margin-right:6px; font-size:10px;">✅ נצפה</span>' : ''}
        </div>
        ${epDesc ? `<div class="small muted" style="margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${epDesc}</div>` : ''}
      </div>
      <button class="btn btn-primary" style="padding:9px 14px; flex-shrink:0;">▶</button>
    `;

    item.querySelector('button').addEventListener('click', () => {
      closeModal('detailsModal');
      playVideo(
        epVideo,
        seriesItem.title,
        `עונה ${epSeason} • פרק ${epNum}`,
        true, false,
        epId, episodes, seriesId, seriesItem
      );
      addToHistory(seriesId, 'series', seriesItem, { episode: epNum, season: epSeason });
    });

    list.appendChild(item);
  });
}

// ── Player ───────────────────────────────────────────────────
let currentEpId       = null;
let currentEpisodes   = [];
let currentSeriesId   = null;
let currentSeriesItem = null;
let progressInterval  = null;

function playVideo(url, title, meta, isEpisode = false, isTrailer = false,
                   epId = null, episodes = [], seriesId = null, seriesItem = null) {
  const host     = $('playerHost');
  const titleEl  = $('playerTitle');
  const metaEl   = $('playerMeta');
  const nextBtn  = $('nextEpisodeBtn');
  const typeLabel = $('playerTypeLabel');

  if (!host) return;

  currentEpId       = epId;
  currentEpisodes   = episodes;
  currentSeriesId   = seriesId;
  currentSeriesItem = seriesItem;

  if (titleEl)   titleEl.textContent  = title;
  if (metaEl)    metaEl.textContent   = meta;
  if (typeLabel) typeLabel.textContent = isTrailer ? '🎬 טריילר' : '▶ צופה';

  // Next episode button
  if (nextBtn) {
    if (isEpisode && !isTrailer && epId && episodes.length > 0) {
      const allEpIds = episodes.map(([id]) => id);
      const idx      = allEpIds.indexOf(epId);
      nextBtn.classList.toggle('hidden', idx === allEpIds.length - 1);
      nextBtn.onclick = () => {
        if (idx + 1 < allEpIds.length) {
          const [nextId, nextEp] = episodes[idx + 1];
          closeModal('playerModal');
          setTimeout(() => {
            playVideo(nextEp.video, seriesItem?.title || title,
              `עונה ${nextEp.season} • פרק ${nextEp.number}`,
              true, false, nextId, episodes, seriesId, seriesItem);
            if (seriesItem) addToHistory(seriesId, 'series', seriesItem,
              { episode: nextEp.number, season: nextEp.season });
          }, 200);
        }
      };
    } else {
      nextBtn.classList.add('hidden');
    }
  }

  // Build player
  host.innerHTML = '';
  clearInterval(progressInterval);

  if (!url) {
    host.innerHTML = '<div class="empty-state" style="height:300px;"><p>אין קישור וידאו</p></div>';
    openModal('playerModal');
    return;
  }

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  if (isYouTube) {
    const iframe = document.createElement('iframe');
    iframe.src             = url + (url.includes('?') ? '&' : '?') + 'autoplay=1&rel=0';
    iframe.allow           = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    host.appendChild(iframe);
  } else {
    const video = document.createElement('video');
    video.src      = url;
    video.controls = true;
    video.autoplay = true;
    video.className = 'plyr__video-embed';
    host.appendChild(video);

    // Save progress
    if (!isTrailer && epId) {
      video.addEventListener('loadedmetadata', () => {
        const saved = continueData[epId];
        if (saved?.position) video.currentTime = saved.position;
      });

      progressInterval = setInterval(() => {
        if (!video.paused && video.duration) {
          const pct = Math.round((video.currentTime / video.duration) * 100);
          set(ref(db, `users/${currentUser.uid}/profiles/${currentProfile.id}/continue/${epId}`), {
            progress:  pct,
            position:  Math.floor(video.currentTime),
            duration:  Math.floor(video.duration),
            timestamp: Date.now()
          });
        }
      }, 10000);
    }
  }

  // Log activity
  if (!isTrailer) {
    logActivity(isEpisode ? 'צפייה בפרק' : 'צפייה בסרט', {
      contentTitle: title,
      meta: meta || ''
    });
  }
  openModal('playerModal');
}

// ── Stop player completely (audio bug fix) ───────────────────
function stopPlayer() {
  clearInterval(progressInterval);
  const host = $('playerHost');
  if (!host) return;
  // מנקה את כל התוכן — עוצר iframe YouTube וגם video tag
  host.innerHTML = '';
}

// Close player → stop audio + clear interval
$('playerModal')?.querySelector('.modal-close')?.addEventListener('click', () => {
  stopPlayer();
  closeModal('playerModal');
});
$('playerModal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
  stopPlayer();
  closeModal('playerModal');
});

// ── Random ───────────────────────────────────────────────────
function pickRandom() {
  const all = [
    ...Object.entries(allMovies).map(([id, m]) => [id, m, 'movie']),
    ...Object.entries(allSeries).map(([id, s]) => [id, s, 'series']),
  ];
  if (all.length === 0) return;
  const [id, item, type] = all[Math.floor(Math.random() * all.length)];
  openDetails(id, item, type);
}
$('randomBtn')?.addEventListener('click', pickRandom);
$('heroRandomBtn')?.addEventListener('click', pickRandom);

// ── Requests ─────────────────────────────────────────────────
function openRequestsModal() {
  openModal('requestsModal');
  loadRequests();
}
$('requestsBtn')?.addEventListener('click', openRequestsModal);
$('heroRequestsBtn')?.addEventListener('click', openRequestsModal);

$('sendRequestBtn')?.addEventListener('click', async () => {
  const title = $('requestTitle').value.trim();
  const note  = $('requestNote').value.trim();
  if (!title) return;
  await push(ref(db, 'requests'), {
    title, note,
    user:      currentProfile?.name || currentUser?.email || 'Unknown',
    createdAt: Date.now(),
    status:    'pending'
  });
  $('requestTitle').value = '';
  $('requestNote').value  = '';
  loadRequests();
  window.showToast('הבקשה נשלחה!', 'success');
});

function loadRequests() {
  const list = $('requestsList');
  if (!list) return;
  get(ref(db, 'requests')).then(snap => {
    const reqs = snap.val() || {};
    list.innerHTML = '';
    Object.entries(reqs)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
      .forEach(([rid, req]) => {
        const item = el('div', 'request-card');
        item.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:700;">${req.title}</div>
            <div class="small muted">${req.user} • ${timeAgo(req.createdAt)}</div>
            ${req.note ? `<div class="small muted" style="margin-top:4px;">${req.note}</div>` : ''}
          </div>
          <span class="badge ${req.status === 'done' ? 'badge-red' : ''}">${req.status === 'done' ? '✅ הושלם' : '⏳ ממתין'}</span>
        `;
        list.appendChild(item);
      });
  });
}

// ── Admin button ─────────────────────────────────────────────
$('adminBtn')?.addEventListener('click', () => {
  window.open('admin.html', '_blank');
});

// ── Search ───────────────────────────────────────────────────
const searchInput   = $('searchInput');
const searchResults = $('searchResults');

searchInput?.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults?.classList.add('hidden'); return; }

  const results = [
    ...Object.entries(allMovies).map(([id, m]) => ({ id, ...m, type: 'movie' })),
    ...Object.entries(allSeries).map(([id, s]) => ({ id, ...s, type: 'series' })),
  ].filter(item => item.title?.toLowerCase().includes(q)).slice(0, 8);

  if (!searchResults) return;
  searchResults.innerHTML = '';

  if (results.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item"><span class="title">לא נמצאו תוצאות</span></div>';
  } else {
    results.forEach(item => {
      const row = el('div', 'search-result-item');
      row.innerHTML = `
        <img src="${item.poster || ''}" alt="${item.title}"
             onerror="this.style.background='#1a1a28'; this.src='';" />
        <div>
          <div class="title">${item.title}</div>
          <div class="type">${item.type === 'movie' ? '🎬 סרט' : '📺 סדרה'}</div>
        </div>
      `;
      row.addEventListener('click', () => {
        searchResults.classList.add('hidden');
        searchInput.value = '';
        openDetails(item.id, item, item.type);
      });
      searchResults.appendChild(row);
    });
  }
  searchResults.classList.remove('hidden');
});

document.addEventListener('click', e => {
  if (!searchInput?.contains(e.target)) searchResults?.classList.add('hidden');
});

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id)  { $(id)?.classList.remove('hidden'); }
function closeModal(id) { $(id)?.classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// ════════════════════════════════════════════════════════════
//  🕐  COMING SOON / SCHEDULED
// ════════════════════════════════════════════════════════════

async function checkAndPublishScheduled() {
  const now = Date.now();
  for (const [sid, item] of Object.entries(allScheduled)) {
    if (!item.publishAt || item.published) continue;
    if (now >= item.publishAt) {
      // הגיע הזמן לפרסם
      if (item.type === 'movie') {
        const { publishAt, visible, published, type, ...movieData } = item;
        await set(ref(db, `movies/${sid}`), { ...movieData, createdAt: now });
      } else if (item.type === 'series') {
        const { publishAt, visible, published, type, ...seriesData } = item;
        await set(ref(db, `series/${sid}`), { ...seriesData, createdAt: now });
      } else if (item.type === 'episode' && item.seriesId) {
        await set(
          ref(db, `series/${item.seriesId}/seasons/${item.season}/episodes/${item.number}`),
          { title: item.title, video: item.video || '', poster: item.poster || '',
            description: item.description || '', updatedAt: now }
        );
      }
      await update(ref(db, `scheduled/${sid}`), { published: true });
    }
  }
}

function renderComingSoon() {
  const grid  = document.getElementById('comingGrid');
  const empty = document.getElementById('comingEmpty');
  if (!grid) return;
  grid.innerHTML = '';

  const now   = Date.now();
  const items = Object.entries(allScheduled)
    .filter(([, s]) => s.visible && !s.published && s.publishAt > now)
    .sort((a, b) => a[1].publishAt - b[1].publishAt);

  if (items.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  items.forEach(([sid, item]) => {
    const card = document.createElement('div');
    card.className = 'card coming-card';
    const timeLeft = formatTimeLeft(item.publishAt - now);
    card.innerHTML = `
      <div class="poster-wrap" style="position:relative;">
        <img class="poster" src="${item.poster || ''}" alt="${item.title}"
             loading="lazy" onerror="this.style.background='#1a1a28';this.src='';" />
        <div class="coming-overlay">
          <div class="coming-clock">🕐</div>
          <div class="coming-time">${timeLeft}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-title">${item.title}</div>
        <div class="card-meta">
          <span class="badge">${item.type === 'movie' ? '🎬 סרט' : item.type === 'series' ? '📺 סדרה' : '🎞 פרק'}</span>
          ${item.category ? `<span class="badge">${item.category}</span>` : ''}
        </div>
        <div class="coming-date small muted" style="margin-top:8px;">
          📅 עולה ב: ${new Date(item.publishAt).toLocaleString('he-IL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
        </div>
        ${item.description ? `<div class="small muted" style="margin-top:6px;line-height:1.5;">${item.description.slice(0,120)}${item.description.length>120?'...':''}</div>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

function formatTimeLeft(ms) {
  if (ms <= 0) return 'עולה עכשיו!';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  const m = Math.floor(ms / 60000);
  if (d >= 1) return `בעוד ${d} ימים`;
  if (h >= 1) return `בעוד ${h} שעות`;
  return `בעוד ${m} דקות`;
}

// רענן ספירת זמן כל דקה
setInterval(() => {
  if (Object.keys(allScheduled).length > 0) {
    renderComingSoon();
    renderHomeComingSoon();
    checkAndPublishScheduled();
  }
}, 60000);

window.addEventListener('viewChanged', e => {
  if (e.detail === 'coming') renderComingSoon();
  if (e.detail === 'wrapped') renderWrapped();
  if (e.detail === 'quizzes') renderQuizzesList();
});

// ════════════════════════════════════════════════════════════
//  🧠  QUIZZES
// ════════════════════════════════════════════════════════════

function renderQuizzesList() {
  const list  = document.getElementById('quizzesList');
  const empty = document.getElementById('quizzesEmpty');
  if (!list) return;
  list.innerHTML = '';

  const entries = Object.entries(allQuizzes)
    .filter(([, q]) => q.active !== false)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (entries.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  entries.forEach(([qid, quiz]) => {
    const contentItem = quiz.contentType === 'movie'
      ? allMovies[quiz.contentId]
      : allSeries[quiz.contentId];

    const card = document.createElement('div');
    card.className = 'quiz-card glass';
    card.innerHTML = `
      <div class="quiz-card-poster">
        <img src="${contentItem?.poster || quiz.poster || ''}" alt="${quiz.title}"
             onerror="this.style.background='#1a1a28';this.src='';" />
      </div>
      <div class="quiz-card-body">
        <div class="quiz-card-eyebrow">${quiz.contentType === 'movie' ? '🎬 סרט' : '📺 סדרה'}</div>
        <div class="quiz-card-title">${quiz.title}</div>
        <div class="quiz-card-meta">
          ${contentItem?.title ? `<span class="badge">${contentItem.title}</span>` : ''}
          <span class="badge">${(quiz.questions || []).length} שאלות</span>
        </div>
        <button class="btn btn-primary quiz-start-btn" style="margin-top:14px;" data-qid="${qid}">
          🧠 התחל חידון
        </button>
      </div>
    `;
    card.querySelector('.quiz-start-btn').addEventListener('click', () => startQuiz(qid, quiz));
    list.appendChild(card);
  });
}

let quizState = { qid: null, quiz: null, current: 0, score: 0, answers: [] };

function startQuiz(qid, quiz) {
  quizState = { qid, quiz, current: 0, score: 0, answers: [] };
  logActivity('התחיל חידון', { quizTitle: quiz.title });
  showQuizQuestion();
  document.getElementById('quizModal')?.classList.remove('hidden');
}

function showQuizQuestion() {
  const body = document.getElementById('quizModalBody');
  if (!body) return;
  const { quiz, current } = quizState;
  const questions = quiz.questions || [];

  if (current >= questions.length) {
    showQuizResults();
    return;
  }

  const q       = questions[current];
  const total   = questions.length;
  const pct     = Math.round((current / total) * 100);

  body.innerHTML = `
    <div class="quiz-progress-wrap">
      <div class="quiz-progress-bar" style="width:${pct}%"></div>
    </div>
    <div class="quiz-counter">${current + 1} / ${total}</div>
    <div class="quiz-question">${q.question}</div>
    <div class="quiz-options">
      ${(q.options || []).map((opt, i) => `
        <button class="quiz-option" data-idx="${i}">${opt}</button>
      `).join('')}
    </div>
  `;

  body.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(+btn.dataset.idx));
  });
}

function handleAnswer(chosen) {
  const body = document.getElementById('quizModalBody');
  const { quiz, current } = quizState;
  const q = quiz.questions[current];
  const correct = q.correctIndex;
  const isRight = chosen === correct;

  if (isRight) quizState.score++;
  quizState.answers.push({ chosen, correct, isRight });

  // הצג תוצאה לפני השאלה הבאה
  body.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('quiz-correct');
    else if (i === chosen && !isRight) btn.classList.add('quiz-wrong');
  });

  const feedback = document.createElement('div');
  feedback.className = `quiz-feedback ${isRight ? 'quiz-feedback-right' : 'quiz-feedback-wrong'}`;
  feedback.innerHTML = isRight
    ? `✅ נכון! ${q.explanation || ''}`
    : `❌ לא נכון. התשובה הנכונה: <strong>${q.options[correct]}</strong>. ${q.explanation || ''}`;
  body.appendChild(feedback);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-primary';
  nextBtn.style.cssText = 'margin-top:16px;width:100%;';
  nextBtn.textContent = current + 1 < (quiz.questions || []).length ? 'השאלה הבאה ▶' : '🏁 סיים ותראה תוצאות';
  nextBtn.addEventListener('click', () => {
    quizState.current++;
    showQuizQuestion();
  });
  body.appendChild(nextBtn);
}

function showQuizResults() {
  const body = document.getElementById('quizModalBody');
  const { quiz, score, answers } = quizState;
  const total   = (quiz.questions || []).length;
  const pct     = Math.round((score / total) * 100);
  const emoji   = pct === 100 ? '🏆' : pct >= 70 ? '🎉' : pct >= 40 ? '👍' : '📚';

  logActivity('סיים חידון', { quizTitle: quiz.title, score, total, pct });

  body.innerHTML = `
    <div class="quiz-results">
      <div class="quiz-results-emoji">${emoji}</div>
      <div class="quiz-results-title">סיימת את החידון!</div>
      <div class="quiz-results-score">${score} / ${total}</div>
      <div class="quiz-results-pct">${pct}% נכון</div>
      <div class="quiz-results-breakdown">
        ${answers.map((a, i) => {
          const q = quiz.questions[i];
          return `<div class="quiz-breakdown-item ${a.isRight ? 'right' : 'wrong'}">
            <span class="quiz-breakdown-icon">${a.isRight ? '✅' : '❌'}</span>
            <span>${q.question}</span>
            <span class="quiz-breakdown-answer">${a.isRight ? q.options[a.correct] : `${q.options[a.chosen]} → ${q.options[a.correct]}`}</span>
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-secondary" id="closeQuizBtn" style="margin-top:20px;width:100%;">סגור</button>
    </div>
  `;

  document.getElementById('closeQuizBtn')?.addEventListener('click', () => {
    document.getElementById('quizModal')?.classList.add('hidden');
  });
}

// ════════════════════════════════════════════════════════════
//  📊  MONTHLY WRAPPED
// ════════════════════════════════════════════════════════════

function initWrappedMonthSelector() {
  const sel = document.getElementById('wrappedMonthSelect');
  if (!sel) return;
  const now   = new Date();
  sel.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = lbl;
    sel.appendChild(opt);
  }
  renderWrapped();
}

function renderWrapped(monthKey = null) {
  const sel = document.getElementById('wrappedMonthSelect');
  const key = monthKey || sel?.value;
  if (!key || !currentProfile) return;

  const [year, month] = key.split('-').map(Number);
  const startTs = new Date(year, month-1, 1).getTime();
  const endTs   = new Date(year, month, 1).getTime();

  // סנן היסטוריה לחודש
  const monthHistory = watchHistory.filter(h => h.watchedAt >= startTs && h.watchedAt < endTs);
  const movies  = monthHistory.filter(h => h.type === 'movie');
  const episodes = monthHistory.filter(h => h.type === 'series');

  // מצא הכי נצפה
  const titleCount = {};
  monthHistory.forEach(h => { titleCount[h.title] = (titleCount[h.title] || 0) + 1; });
  const topTitle = Object.entries(titleCount).sort((a,b)=>b[1]-a[1])[0];

  // דירוגים שנתתי
  const myRatings = [];
  Object.entries(allMovies).forEach(([,m]) => {
    const r = m.ratings?.[currentProfile.id];
    if (r) myRatings.push({ title: m.title, rating: r, type: 'movie' });
  });
  Object.entries(allSeries).forEach(([,s]) => {
    const r = s.ratings?.[currentProfile.id];
    if (r) myRatings.push({ title: s.title, rating: r, type: 'series' });
  });
  const topRated = myRatings.sort((a,b)=>b.rating-a.rating)[0];

  const container = document.getElementById('wrappedContent');
  if (!container) return;

  if (monthHistory.length === 0) {
    container.innerHTML = `
      <div class="empty-panel">
        <div class="empty-panel-icon">📊</div>
        <h3>אין נתונים לחודש זה</h3>
        <p>לא נמצאה פעילות צפייה בחודש הנבחר</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="wrapped-grid">
      <div class="wrapped-card wrapped-card-big glass">
        <div class="wrapped-icon">🎬</div>
        <div class="wrapped-num">${movies.length}</div>
        <div class="wrapped-label">סרטים שצפית</div>
      </div>
      <div class="wrapped-card glass">
        <div class="wrapped-icon">📺</div>
        <div class="wrapped-num">${episodes.length}</div>
        <div class="wrapped-label">פרקים שצפית</div>
      </div>
      <div class="wrapped-card glass">
        <div class="wrapped-icon">🎞</div>
        <div class="wrapped-num">${monthHistory.length}</div>
        <div class="wrapped-label">סה"כ צפיות</div>
      </div>
      ${topTitle ? `
      <div class="wrapped-card glass">
        <div class="wrapped-icon">🏆</div>
        <div class="wrapped-num" style="font-size:18px;">${topTitle[0]}</div>
        <div class="wrapped-label">הכי הרבה פעמים (${topTitle[1]}×)</div>
      </div>` : ''}
      ${topRated ? `
      <div class="wrapped-card glass">
        <div class="wrapped-icon">⭐</div>
        <div class="wrapped-num" style="font-size:18px;">${topRated.title}</div>
        <div class="wrapped-label">דירגת ${'⭐'.repeat(topRated.rating)}</div>
      </div>` : ''}
      <div class="wrapped-card glass">
        <div class="wrapped-icon">📅</div>
        <div class="wrapped-num">${myRatings.length}</div>
        <div class="wrapped-label">סרטים/סדרות שדירגת</div>
      </div>
    </div>

    ${monthHistory.length > 0 ? `
    <div class="section-head" style="margin-top:28px;"><h2>📋 כל הצפיות בחודש</h2></div>
    <div class="history-list">
      ${monthHistory.slice(0,20).map(h => `
        <div class="history-item">
          <img class="history-thumb" src="${h.poster||''}" alt="${h.title}"
               onerror="this.style.background='#1a1a28';this.src='';" />
          <div class="history-info">
            <div class="history-title">${h.title}</div>
            <div class="history-meta">${h.type==='movie'?'🎬 סרט':'📺 סדרה'}${h.episode?` • עונה ${h.season} פרק ${h.episode}`:''}</div>
            <div class="history-time">${new Date(h.watchedAt).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}</div>
          </div>
        </div>`).join('')}
    </div>` : ''}
  `;
}

window.addEventListener('wrappedMonthChanged', e => renderWrapped(e.detail));


// ── Coming Soon — Section בדף הבית ───────────────────────────
function renderHomeComingSoon() {
  const section = document.getElementById('homeComing');
  const grid    = document.getElementById('homeComingGrid');
  if (!section || !grid) return;

  const now   = Date.now();
  const items = Object.entries(allScheduled)
    .filter(([, s]) => s.visible && !s.published && s.publishAt > now)
    .sort((a, b) => a[1].publishAt - b[1].publishAt);

  section.style.display = items.length > 0 ? '' : 'none';
  grid.innerHTML = '';
  items.forEach(([sid, item]) => grid.appendChild(buildComingCard(sid, item)));
}

function buildComingCard(sid, item) {
  const now  = Date.now();
  const ms   = item.publishAt - now;
  const card = document.createElement('div');
  card.className = 'card coming-card';
  card.innerHTML = `
    <div class="poster-wrap" style="position:relative;">
      <img class="poster" src="${item.poster || ''}" alt="${item.title}"
           loading="lazy" onerror="this.style.background='#1a1a28';this.src='';"
           style="filter:brightness(0.7);" />
      <div style="
        position:absolute;inset:0;
        background:linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.2) 60%,transparent 100%);
        display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
        padding:14px;gap:5px;">
        <span style="font-size:24px;">🕐</span>
        <span style="font-size:12px;font-weight:800;color:#fff;
                     background:rgba(229,9,20,0.85);padding:4px 10px;border-radius:999px;">
          ${formatTimeLeftShort(ms)}
        </span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-meta">
        <span class="badge">${item.type === 'movie' ? '🎬 סרט' : item.type === 'series' ? '📺 סדרה' : '🎞 פרק'}</span>
        ${item.category ? `<span class="badge">${item.category}</span>` : ''}
      </div>
      <div class="small muted" style="margin-top:8px;font-weight:600;">
        📅 ${new Date(item.publishAt).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
      </div>
    </div>
  `;
  return card;
}

function formatTimeLeftShort(ms) {
  if (ms <= 0) return 'עולה עכשיו!';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `בעוד ${d} ימים`;
  if (h >= 1) return `בעוד ${h} שע'`;
  return `בעוד ${m} דק'`;
}
