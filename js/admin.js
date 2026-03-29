// ============================================================
//  GILBOASTREAMFAMILY — admin.js v3.0
//  פיצ'רים: טריילרים, סטטיסטיקות, createdAt אוטומטי,
//           ניהול סרטים/סדרות/פרקים/בקשות/משתמשים
// ============================================================

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, remove, update, get }
                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── 🔧 Firebase Config — אותו config כמו ב-app.js ──────────
const firebaseConfig = {
  apiKey:            "AIzaSyCPDS6U9LokVN-f4uQj9rdaWuCnut72bts",
  authDomain:        "netflixfamilystreaming-b0ca4.firebaseapp.com",
  databaseURL:       "https://netflixfamilystreaming-b0ca4-default-rtdb.firebaseio.com",
  projectId:         "netflixfamilystreaming-b0ca4",
  storageBucket:     "netflixfamilystreaming-b0ca4.firebasestorage.app",
  messagingSenderId: "116100612969",
  appId:             "1:116100612969:web:29387c89e455e36d8373f8"
};

const ADMIN_EMAIL = "omergilboapc@gmail.com";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

// ── State ────────────────────────────────────────────────────
let allMovies   = {};
let allSeries   = {};
let allEpisodes = {};
let allRequests = {};
let allUsers    = {};

// ── Helpers ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showToast(msg, type = 'info') {
  // fallback toast אם אין container
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:28px;left:28px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(container);
  }
  const icons  = { success: '✅', error: '❌', info: 'ℹ️' };
  const colors = { success: 'rgba(34,197,94,0.15)', error: 'rgba(229,9,20,0.15)', info: 'rgba(255,255,255,0.06)' };
  const t = document.createElement('div');
  t.style.cssText = `
    background:${colors[type]};border:1px solid rgba(255,255,255,0.1);border-radius:14px;
    padding:14px 18px;font-size:14px;font-weight:600;color:#fff;
    box-shadow:0 8px 32px rgba(0,0,0,.5);display:flex;align-items:center;
    gap:10px;min-width:220px;max-width:340px;font-family:Heebo,sans-serif;
    animation:toastIn .3s cubic-bezier(.16,1,.3,1);
  `;
  t.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function val(id) { return $(id)?.value.trim() || ''; }
function clear(...ids) { ids.forEach(id => { if ($(id)) $(id).value = ''; }); }

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return 'היום';
  if (d === 1) return 'אתמול';
  return `לפני ${d} ימים`;
}

// ── Auth Guard ────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user || user.email !== ADMIN_EMAIL) {
    showToast('גישה מותרת לאדמין בלבד', 'error');
    setTimeout(() => window.location.href = 'index.html', 1800);
    return;
  }
  initAdmin();
});

// ── Init ──────────────────────────────────────────────────────
function initAdmin() {
  loadMovies();
  loadSeries();
  loadEpisodes();
  loadRequests();
  loadUsers();
}

// ══════════════════════════════════════════════════════════════
//  🎬 MOVIES
// ══════════════════════════════════════════════════════════════
function loadMovies() {
  onValue(ref(db, 'movies'), snap => {
    allMovies = snap.val() || {};
    renderMoviesList();
    updateStats();
    populateEpisodeSeriesSelects();
  });
}

$('addMovieBtn')?.addEventListener('click', async () => {
  const title       = val('movieTitle');
  const poster      = val('moviePoster');
  const video       = val('movieVideo');
  const trailer     = val('movieTrailer');
  const category    = val('movieCategory');
  const year        = val('movieYear');
  const description = val('movieDescription');

  if (!title) { showToast('שם הסרט חובה', 'error'); return; }

  const data = {
    title,
    createdAt: Date.now(),   // ← חשוב לפיצ'ר "חדש השבוע" ו-notifications
    ...(poster      && { poster }),
    ...(video       && { video }),
    ...(trailer     && { trailer }),
    ...(category    && { category }),
    ...(year        && { year: +year }),
    ...(description && { description }),
  };

  await push(ref(db, 'movies'), data);
  clear('movieTitle','moviePoster','movieVideo','movieTrailer','movieCategory','movieYear','movieDescription');
  showAdminSuccess('movieSuccess');
  showToast(`"${title}" נוסף!`, 'success');
});

function renderMoviesList() {
  const list = $('adminMoviesList');
  if (!list) return;
  list.innerHTML = '';

  const entries = Object.entries(allMovies)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (entries.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;">אין סרטים עדיין</div>';
    return;
  }

  entries.forEach(([id, movie]) => {
    const item = document.createElement('div');
    item.className = 'admin-item';
    item.innerHTML = `
      <img class="admin-item-poster"
           src="${movie.poster || ''}"
           alt="${movie.title}"
           onerror="this.style.background='#1a1a28'; this.src='';" />
      <div class="admin-item-info">
        <div class="admin-item-title">${movie.title}</div>
        <div class="admin-item-meta">
          ${movie.category ? movie.category + ' • ' : ''}
          ${movie.year     ? movie.year + ' • '     : ''}
          ${timeAgo(movie.createdAt)}
        </div>
        <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
          ${movie.video   ? '<span class="badge" style="font-size:10px;">▶ וידאו</span>'    : ''}
          ${movie.trailer ? '<span class="has-trailer-badge">🎬 טריילר</span>'               : ''}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button class="btn btn-secondary" style="padding:7px 10px; font-size:12px;"
                data-edit-movie="${id}">✏️ ערוך</button>
        <button class="btn btn-danger" style="padding:7px 10px; font-size:12px;"
                data-del-movie="${id}">🗑</button>
      </div>
    `;

    item.querySelector(`[data-del-movie="${id}"]`).addEventListener('click', async () => {
      if (!confirm(`למחוק את "${movie.title}"?`)) return;
      await remove(ref(db, `movies/${id}`));
      showToast(`"${movie.title}" נמחק`, 'info');
    });

    item.querySelector(`[data-edit-movie="${id}"]`).addEventListener('click', () => {
      openEditModal('movie', id, movie);
    });

    list.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════════
//  📺 SERIES
// ══════════════════════════════════════════════════════════════
function loadSeries() {
  onValue(ref(db, 'series'), snap => {
    allSeries = snap.val() || {};
    renderSeriesList();
    updateStats();
    populateEpisodeSeriesSelects();
  });
}

$('addSeriesBtn')?.addEventListener('click', async () => {
  const title       = val('seriesTitle');
  const poster      = val('seriesPoster');
  const trailer     = val('seriesTrailer');
  const category    = val('seriesCategory');
  const year        = val('seriesYear');
  const description = val('seriesDescription');

  if (!title) { showToast('שם הסדרה חובה', 'error'); return; }

  const data = {
    title,
    createdAt: Date.now(),
    ...(poster      && { poster }),
    ...(trailer     && { trailer }),
    ...(category    && { category }),
    ...(year        && { year: +year }),
    ...(description && { description }),
  };

  await push(ref(db, 'series'), data);
  clear('seriesTitle','seriesPoster','seriesTrailer','seriesCategory','seriesYear','seriesDescription');
  showAdminSuccess('seriesSuccess');
  showToast(`"${title}" נוסף!`, 'success');
});

function renderSeriesList() {
  const list = $('adminSeriesList');
  if (!list) return;
  list.innerHTML = '';

  const entries = Object.entries(allSeries)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (entries.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;">אין סדרות עדיין</div>';
    return;
  }

  entries.forEach(([id, series]) => {
    const epCount = Object.values(allEpisodes)
      .filter(ep => ep.seriesId === id).length;

    const item = document.createElement('div');
    item.className = 'admin-item';
    item.innerHTML = `
      <img class="admin-item-poster"
           src="${series.poster || ''}"
           alt="${series.title}"
           onerror="this.style.background='#1a1a28'; this.src='';" />
      <div class="admin-item-info">
        <div class="admin-item-title">${series.title}</div>
        <div class="admin-item-meta">
          ${series.category ? series.category + ' • ' : ''}
          ${series.year ? series.year + ' • ' : ''}
          ${epCount} פרקים •
          ${timeAgo(series.createdAt)}
        </div>
        <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
          ${series.trailer ? '<span class="has-trailer-badge">🎬 טריילר</span>' : ''}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button class="btn btn-secondary" style="padding:7px 10px; font-size:12px;"
                data-edit-series="${id}">✏️ ערוך</button>
        <button class="btn btn-danger" style="padding:7px 10px; font-size:12px;"
                data-del-series="${id}">🗑</button>
      </div>
    `;

    item.querySelector(`[data-del-series="${id}"]`).addEventListener('click', async () => {
      if (!confirm(`למחוק את "${series.title}" וכל הפרקים שלה?`)) return;
      await remove(ref(db, `series/${id}`));
      // מחק גם פרקים משויכים
      const toDelete = Object.entries(allEpisodes)
        .filter(([, ep]) => ep.seriesId === id)
        .map(([eid]) => eid);
      await Promise.all(toDelete.map(eid => remove(ref(db, `episodes/${eid}`))));
      showToast(`"${series.title}" נמחקה`, 'info');
    });

    item.querySelector(`[data-edit-series="${id}"]`).addEventListener('click', () => {
      openEditModal('series', id, series);
    });

    list.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════════
//  🎞 EPISODES
// ══════════════════════════════════════════════════════════════
function loadEpisodes() {
  onValue(ref(db, 'episodes'), snap => {
    allEpisodes = snap.val() || {};
    renderEpisodesList();
    renderSeriesList(); // update episode counts
    updateStats();
  });
}

function populateEpisodeSeriesSelects() {
  ['episodeSeriesSelect', 'episodeFilterSelect'].forEach(selectId => {
    const sel = $(selectId);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = selectId === 'episodeFilterSelect'
      ? '<option value="">כל הסדרות</option>'
      : '';
    Object.entries(allSeries)
      .sort((a, b) => a[1].title.localeCompare(b[1].title, 'he'))
      .forEach(([id, s]) => {
        const opt = document.createElement('option');
        opt.value       = id;
        opt.textContent = s.title;
        sel.appendChild(opt);
      });
    if (current) sel.value = current;
  });
}

$('addEpisodeBtn')?.addEventListener('click', async () => {
  const seriesId    = val('episodeSeriesSelect');
  const season      = +val('episodeSeason');
  const number      = +val('episodeNumber');
  const title       = val('episodeTitle');
  const poster      = val('episodePoster');
  const video       = val('episodeVideo');
  const description = val('episodeDescription');

  if (!seriesId) { showToast('בחר סדרה', 'error'); return; }
  if (!season)   { showToast('הכנס מספר עונה', 'error'); return; }
  if (!number)   { showToast('הכנס מספר פרק', 'error'); return; }
  if (!title)    { showToast('שם הפרק חובה', 'error'); return; }
  if (!video)    { showToast('קישור וידאו חובה', 'error'); return; }

  const data = {
    seriesId, season, number, title,
    createdAt: Date.now(),
    ...(poster      && { poster }),
    ...(description && { description }),
    video,
  };

  await push(ref(db, 'episodes'), data);
  clear('episodeSeason','episodeNumber','episodeTitle','episodePoster','episodeVideo','episodeDescription');
  showAdminSuccess('episodeSuccess');
  showToast(`פרק "${title}" נוסף!`, 'success');
});

function renderEpisodesList() {
  const list = $('adminEpisodesList');
  if (!list) return;
  list.innerHTML = '';

  const filterSeries = $('episodeFilterSelect')?.value || '';

  const entries = Object.entries(allEpisodes)
    .filter(([, ep]) => !filterSeries || ep.seriesId === filterSeries)
    .sort((a, b) => {
      const sa = allSeries[a[1].seriesId]?.title || '';
      const sb = allSeries[b[1].seriesId]?.title || '';
      if (sa !== sb) return sa.localeCompare(sb, 'he');
      if (a[1].season !== b[1].season) return a[1].season - b[1].season;
      return a[1].number - b[1].number;
    });

  if (entries.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;">אין פרקים</div>';
    return;
  }

  entries.forEach(([id, ep]) => {
    const seriesName = allSeries[ep.seriesId]?.title || ep.seriesId;
    const item = document.createElement('div');
    item.className = 'admin-item';
    item.innerHTML = `
      <img src="${ep.poster || ''}" alt="${ep.title}"
           style="width:64px;height:40px;object-fit:cover;border-radius:7px;background:#1a1a28;flex-shrink:0;"
           onerror="this.style.background='#1a1a28'; this.src='';" />
      <div class="admin-item-info">
        <div class="admin-item-title" style="font-size:13px;">
          עונה ${ep.season} • פרק ${ep.number} — ${ep.title}
        </div>
        <div class="admin-item-meta">${seriesName}</div>
      </div>
      <button class="btn btn-danger" style="padding:7px 10px; font-size:12px; flex-shrink:0;"
              data-del-ep="${id}">🗑</button>
    `;

    item.querySelector(`[data-del-ep="${id}"]`).addEventListener('click', async () => {
      if (!confirm(`למחוק פרק "${ep.title}"?`)) return;
      await remove(ref(db, `episodes/${id}`));
      showToast('פרק נמחק', 'info');
    });

    list.appendChild(item);
  });
}

$('episodeFilterSelect')?.addEventListener('change', renderEpisodesList);

// ══════════════════════════════════════════════════════════════
//  📩 REQUESTS
// ══════════════════════════════════════════════════════════════
function loadRequests() {
  onValue(ref(db, 'requests'), snap => {
    allRequests = snap.val() || {};
    renderRequests();
    updateStats();
  });
}

function renderRequests() {
  const list = $('adminRequestsList');
  if (!list) return;
  list.innerHTML = '';

  const entries = Object.entries(allRequests)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (entries.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;">אין בקשות פתוחות 🎉</div>';
    return;
  }

  entries.forEach(([rid, req]) => {
    const item = document.createElement('div');
    item.className = 'admin-item';
    item.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:15px;">${req.title}</div>
        <div class="small muted" style="margin-top:4px;">
          👤 ${req.user} • ${timeAgo(req.createdAt)}
        </div>
        ${req.note ? `<div class="small muted" style="margin-top:4px;">💬 ${req.note}</div>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
        <button class="btn btn-secondary" style="padding:7px 10px; font-size:12px;"
                data-toggle-req="${rid}"
                data-status="${req.status || 'pending'}">
          ${req.status === 'done' ? '↩️ בטל' : '✅ סמן הושלם'}
        </button>
        <button class="btn btn-danger" style="padding:7px 10px; font-size:12px;"
                data-del-req="${rid}">🗑</button>
      </div>
    `;

    item.querySelector(`[data-toggle-req="${rid}"]`).addEventListener('click', async e => {
      const newStatus = e.target.dataset.status === 'done' ? 'pending' : 'done';
      await update(ref(db, `requests/${rid}`), { status: newStatus });
      showToast(newStatus === 'done' ? 'סומן כהושלם' : 'סומן כממתין', 'success');
    });

    item.querySelector(`[data-del-req="${rid}"]`).addEventListener('click', async () => {
      await remove(ref(db, `requests/${rid}`));
      showToast('בקשה נמחקה', 'info');
    });

    list.appendChild(item);
  });
}

$('clearDoneRequestsBtn')?.addEventListener('click', async () => {
  const done = Object.entries(allRequests).filter(([, r]) => r.status === 'done');
  await Promise.all(done.map(([rid]) => remove(ref(db, `requests/${rid}`))));
  showToast(`${done.length} בקשות הושלמו נמחקו`, 'success');
});

// ══════════════════════════════════════════════════════════════
//  👥 USERS
// ══════════════════════════════════════════════════════════════
function loadUsers() {
  onValue(ref(db, 'users'), snap => {
    allUsers = snap.val() || {};
    renderUsers();
    updateStats();
  });
}

function renderUsers() {
  const list = $('adminUsersList');
  if (!list) return;
  list.innerHTML = '';

  const entries = Object.entries(allUsers);
  if (entries.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;">אין משתמשים רשומים</div>';
    return;
  }

  entries.forEach(([uid, userData]) => {
    const profiles  = userData.profiles || {};
    const profCount = Object.keys(profiles).length;

    const item = document.createElement('div');
    item.className = 'admin-item';
    item.innerHTML = `
      <div style="font-size:28px;">👤</div>
      <div class="admin-item-info">
        <div class="admin-item-title">${uid.slice(0, 12)}...</div>
        <div class="admin-item-meta">${profCount} פרופילים</div>
        <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          ${Object.values(profiles).map(p =>
            `<span class="badge">${p.avatar || '👤'} ${p.name}${p.pin ? ' 🔒' : ''}</span>`
          ).join('')}
        </div>
      </div>
    `;
    list.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════════
//  📊 STATS (Overview panel)
// ══════════════════════════════════════════════════════════════
function updateStats() {
  const moviesCount  = Object.keys(allMovies).length;
  const seriesCount  = Object.keys(allSeries).length;
  const epCount      = Object.keys(allEpisodes).length;
  const reqCount     = Object.values(allRequests).filter(r => r.status !== 'done').length;
  const usersCount   = Object.keys(allUsers).length;
  const trailerCount = [
    ...Object.values(allMovies).filter(m => m.trailer),
    ...Object.values(allSeries).filter(s => s.trailer),
  ].length;

  const set_ = (id, val) => { if ($(id)) $(id).textContent = val; };
  set_('statMovies',   moviesCount);
  set_('statSeries',   seriesCount);
  set_('statEpisodes', epCount);
  set_('statRequests', reqCount);
  set_('statUsers',    usersCount);
  set_('statTrailers', trailerCount);

  renderRecentContent();
}

function renderRecentContent() {
  const list = $('recentContent');
  if (!list) return;
  list.innerHTML = '';

  const recent = [
    ...Object.entries(allMovies).map(([id, m]) => ({ id, ...m, _type: 'movie' })),
    ...Object.entries(allSeries).map(([id, s]) => ({ id, ...s, _type: 'series' })),
    ...Object.entries(allEpisodes).map(([id, ep]) => ({ id, ...ep, _type: 'episode' })),
  ]
  .filter(i => i.createdAt)
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 8);

  if (recent.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;">אין תוכן עדיין</div>';
    return;
  }

  recent.forEach(item => {
    const typeLabel = item._type === 'movie' ? '🎬 סרט'
      : item._type === 'series' ? '📺 סדרה' : '🎞 פרק';
    const parentSeries = item._type === 'episode'
      ? allSeries[item.seriesId]?.title : '';

    const row = document.createElement('div');
    row.className = 'admin-item';
    row.innerHTML = `
      <img style="width:44px;height:60px;object-fit:cover;border-radius:8px;background:#1a1a28;flex-shrink:0;"
           src="${item.poster || ''}"
           alt="${item.title}"
           onerror="this.style.background='#1a1a28'; this.src='';" />
      <div class="admin-item-info">
        <div class="admin-item-title">${item.title}</div>
        <div class="admin-item-meta">
          ${typeLabel}
          ${parentSeries ? ' • ' + parentSeries : ''}
          ${item.category ? ' • ' + item.category : ''}
        </div>
      </div>
      <div class="small muted" style="flex-shrink:0; white-space:nowrap;">${timeAgo(item.createdAt)}</div>
    `;
    list.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════════════
//  ✏️ EDIT MODAL
// ══════════════════════════════════════════════════════════════
let editModal = null;

function openEditModal(type, id, data) {
  if (editModal) editModal.remove();

  const isMovie  = type === 'movie';
  const isSeries = type === 'series';

  editModal = document.createElement('div');
  editModal.style.cssText = `
    position:fixed;inset:0;z-index:500;display:grid;place-items:center;padding:16px;
  `;
  editModal.innerHTML = `
    <div style="position:absolute;inset:0;background:rgba(0,0,0,0.82);backdrop-filter:blur(10px);"></div>
    <div style="
      position:relative;z-index:1;width:min(600px,100%);max-height:calc(100vh - 32px);
      overflow-y:auto;background:#0f0f1a;border:1px solid rgba(255,255,255,0.08);
      border-radius:24px;padding:28px;box-shadow:0 32px 96px rgba(0,0,0,.7);
    ">
      <button id="closeEditModal" style="
        position:absolute;top:16px;left:16px;width:36px;height:36px;border-radius:10px;
        border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);
        color:#888;font-size:14px;display:grid;place-items:center;cursor:pointer;
      ">✕</button>

      <h3 style="margin-bottom:20px;">✏️ עריכת ${isMovie ? 'סרט' : 'סדרה'}: ${data.title}</h3>

      <div style="display:grid;gap:12px;">
        <div>
          <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">שם</div>
          <input id="editTitle" value="${data.title || ''}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;" />
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Poster URL</div>
          <input id="editPoster" value="${data.poster || ''}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;" />
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">קטגוריה</div>
          <input id="editCategory" value="${data.category || ''}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;" />
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">שנה</div>
          <input id="editYear" type="number" value="${data.year || ''}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;" />
        </div>
        ${isMovie ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">קישור וידאו</div>
          <input id="editVideo" value="${data.video || ''}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;" />
        </div>` : ''}
        <div style="background:rgba(229,9,20,0.05);border:1px solid rgba(229,9,20,0.15);border-radius:12px;padding:14px;">
          <div style="font-size:11px;font-weight:800;color:#ff7a83;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🎬 טריילר</div>
          <input id="editTrailer" value="${data.trailer || ''}" placeholder="https://www.youtube.com/embed/..." style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;" />
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">תיאור</div>
          <textarea id="editDescription" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#fff;font-family:Heebo,sans-serif;min-height:90px;resize:vertical;">${data.description || ''}</textarea>
        </div>
      </div>

      <button id="saveEditBtn" style="
        margin-top:18px;width:100%;padding:14px;border-radius:12px;border:none;
        background:linear-gradient(135deg,#e50914,#ff3b47);color:#fff;font-size:15px;
        font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;
      ">💾 שמור שינויים</button>
    </div>
  `;

  document.body.appendChild(editModal);

  document.getElementById('closeEditModal').addEventListener('click', () => {
    editModal.remove();
    editModal = null;
  });

  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const dbPath = isMovie ? `movies/${id}` : `series/${id}`;
    const updates = {
      title:       document.getElementById('editTitle').value.trim()       || data.title,
      poster:      document.getElementById('editPoster').value.trim()      || '',
      category:    document.getElementById('editCategory').value.trim()    || '',
      year:        +document.getElementById('editYear').value              || null,
      trailer:     document.getElementById('editTrailer').value.trim()     || '',
      description: document.getElementById('editDescription').value.trim() || '',
    };
    if (isMovie) {
      updates.video = document.getElementById('editVideo').value.trim() || '';
    }
    // Remove empty fields
    Object.keys(updates).forEach(k => {
      if (updates[k] === '' || updates[k] === null) delete updates[k];
    });
    await update(ref(db, dbPath), updates);
    showToast('השינויים נשמרו!', 'success');
    editModal.remove();
    editModal = null;
  });
}

// ── Success message helper ────────────────────────────────────
function showAdminSuccess(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}
