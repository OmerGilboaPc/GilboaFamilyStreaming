import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, onValue, push, set, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const $ = (id) => document.getElementById(id);
const els = {
  movieTitle:$("movieTitle"), moviePoster:$("moviePoster"), movieVideo:$("movieVideo"), movieCategory:$("movieCategory"), movieDescription:$("movieDescription"), addMovieBtn:$("addMovieBtn"),
  seriesTitle:$("seriesTitle"), seriesPoster:$("seriesPoster"), seriesCategory:$("seriesCategory"), seriesDescription:$("seriesDescription"), addSeriesBtn:$("addSeriesBtn"),
  episodeSeriesSelect:$("episodeSeriesSelect"), episodeSeason:$("episodeSeason"), episodeNumber:$("episodeNumber"), episodeTitle:$("episodeTitle"), episodePoster:$("episodePoster"), episodeVideo:$("episodeVideo"), episodeDescription:$("episodeDescription"), addEpisodeBtn:$("addEpisodeBtn"),
  adminRequestsList:$("adminRequestsList"), adminMoviesList:$("adminMoviesList"), adminSeriesList:$("adminSeriesList"), adminUsersList:$("adminUsersList")
};
let state = { movies:{}, series:{}, users:{}, requests:{} };
function esc(v){ return String(v ?? "").replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }

onAuthStateChanged(auth, (user) => {
  if(!user || user.email !== ADMIN_EMAIL){
    alert("אין לך הרשאה לעמוד הזה.");
    location.href = "index.html";
    return;
  }
  wire();
});

function wire(){
  onValue(ref(db,"movies"), snap => { state.movies = snap.val() || {}; renderMovies(); });
  onValue(ref(db,"series"), snap => { state.series = snap.val() || {}; renderSeries(); fillSeriesSelect(); });
  onValue(ref(db,"users"), snap => { state.users = snap.val() || {}; renderUsers(); });
  onValue(ref(db,"requests"), snap => { state.requests = snap.val() || {}; renderRequests(); });
}

els.addMovieBtn.addEventListener("click", async () => {
  const title = els.movieTitle.value.trim(), poster = els.moviePoster.value.trim(), video = els.movieVideo.value.trim(), category = els.movieCategory.value.trim(), description = els.movieDescription.value.trim();
  if(!title || !poster || !video) return alert("יש למלא שם, פוסטר ווידאו");
  const pRef = push(ref(db, "movies"));
  await set(pRef, { title, poster, video, category, description, createdAt: Date.now() });
  els.movieTitle.value = els.moviePoster.value = els.movieVideo.value = els.movieCategory.value = els.movieDescription.value = "";
  alert("הסרט נוסף");
});

els.addSeriesBtn.addEventListener("click", async () => {
  const title = els.seriesTitle.value.trim(), poster = els.seriesPoster.value.trim(), category = els.seriesCategory.value.trim(), description = els.seriesDescription.value.trim();
  if(!title || !poster) return alert("יש למלא שם סדרה ופוסטר");
  const pRef = push(ref(db, "series"));
  await set(pRef, { title, poster, category, description, seasons:{}, createdAt: Date.now() });
  els.seriesTitle.value = els.seriesPoster.value = els.seriesCategory.value = els.seriesDescription.value = "";
  alert("הסדרה נוספה");
});

els.addEpisodeBtn.addEventListener("click", async () => {
  const seriesId = els.episodeSeriesSelect.value;
  const season = String(Number(els.episodeSeason.value || 0));
  const episode = String(Number(els.episodeNumber.value || 0));
  const title = els.episodeTitle.value.trim(), poster = els.episodePoster.value.trim(), video = els.episodeVideo.value.trim(), description = els.episodeDescription.value.trim();
  if(!seriesId || season === "0" || episode === "0" || !title || !video) return alert("יש למלא את כל שדות הפרק");
  await update(ref(db, `series/${seriesId}/seasons/${season}/episodes/${episode}`), { title, poster, video, description, updatedAt: Date.now() });
  els.episodeSeason.value = els.episodeNumber.value = "";
  els.episodeTitle.value = els.episodePoster.value = els.episodeVideo.value = els.episodeDescription.value = "";
  alert("הפרק נוסף");
});

function fillSeriesSelect(){
  els.episodeSeriesSelect.innerHTML = `<option value="">בחר סדרה</option>` + Object.entries(state.series).map(([id, s]) => `<option value="${id}">${esc(s.title)}</option>`).join("");
}

function renderMovies(){
  els.adminMoviesList.innerHTML = Object.entries(state.movies).map(([id, m]) => `
    <div class="admin-item">
      <div><strong>${esc(m.title)}</strong><div class="small muted">${esc(m.category || "ללא קטגוריה")}</div></div>
      <button class="btn btn-secondary" data-del-movie="${id}">מחק</button>
    </div>
  `).join("") || '<div class="muted">אין סרטים</div>';
  els.adminMoviesList.querySelectorAll("[data-del-movie]").forEach(btn => btn.addEventListener("click", async () => {
    if(!confirm("למחוק סרט?")) return;
    await remove(ref(db, `movies/${btn.dataset.delMovie}`));
  }));
}

function renderSeries(){
  els.adminSeriesList.innerHTML = Object.entries(state.series).map(([id, s]) => {
    const episodes = Object.values(s.seasons || {}).reduce((sum, seasonObj) => sum + Object.keys(seasonObj.episodes || {}).length, 0);
    return `
      <div class="admin-item">
        <div><strong>${esc(s.title)}</strong><div class="small muted">${episodes} פרקים</div></div>
        <div class="row">
          <button class="btn btn-secondary" data-manage-series="${id}">עונות</button>
          <button class="btn btn-secondary" data-del-series="${id}">מחק</button>
        </div>
      </div>
      <div class="stack" id="series_manage_${id}"></div>
    `;
  }).join("") || '<div class="muted">אין סדרות</div>';

  els.adminSeriesList.querySelectorAll("[data-del-series]").forEach(btn => btn.addEventListener("click", async () => {
    if(!confirm("למחוק סדרה?")) return;
    await remove(ref(db, `series/${btn.dataset.delSeries}`));
  }));

  els.adminSeriesList.querySelectorAll("[data-manage-series]").forEach(btn => btn.addEventListener("click", () => {
    const id = btn.dataset.manageSeries;
    const host = document.getElementById(`series_manage_${id}`);
    const s = state.series[id];
    host.innerHTML = Object.entries(s.seasons || {}).map(([seasonNum, seasonObj]) => `
      <div class="admin-item">
        <div><strong>עונה ${seasonNum}</strong></div>
        <button class="btn btn-secondary" data-del-season="${id}|${seasonNum}">מחק עונה</button>
      </div>
      ${(Object.entries(seasonObj.episodes || {}).map(([epNum, ep]) => `
        <div class="admin-item" style="margin-inline-start:24px">
          <div><span class="small muted">פרק ${epNum}</span> — ${esc(ep.title)}</div>
          <button class="btn btn-secondary" data-del-episode="${id}|${seasonNum}|${epNum}">מחק פרק</button>
        </div>
      `).join("")) || '<div class="small muted" style="margin-inline-start:24px">אין פרקים</div>'}
    `).join("") || '<div class="small muted">אין עונות</div>';

    host.querySelectorAll("[data-del-season]").forEach(del => del.addEventListener("click", async () => {
      const [seriesId, seasonNum] = del.dataset.delSeason.split("|");
      if(!confirm("למחוק עונה שלמה?")) return;
      await remove(ref(db, `series/${seriesId}/seasons/${seasonNum}`));
    }));
    host.querySelectorAll("[data-del-episode]").forEach(del => del.addEventListener("click", async () => {
      const [seriesId, seasonNum, epNum] = del.dataset.delEpisode.split("|");
      if(!confirm("למחוק פרק?")) return;
      await remove(ref(db, `series/${seriesId}/seasons/${seasonNum}/episodes/${epNum}`));
    }));
  }));
}

function renderUsers(){
  els.adminUsersList.innerHTML = Object.entries(state.users).map(([uid, u]) => {
    const profiles = Object.values(u.profiles || {}).map(p => `${esc(p.avatar || "🎬")} ${esc(p.name)}`).join(" • ");
    return `<div class="user-card"><div><strong>${esc(u.email || uid)}</strong><div class="small muted">${profiles || "ללא פרופילים"}</div></div></div>`;
  }).join("") || '<div class="muted">אין משתמשים</div>';
}

function renderRequests(){
  els.adminRequestsList.innerHTML = Object.entries(state.requests).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)).map(([id, r]) => `
    <div class="request-card">
      <div>
        <strong>${esc(r.title)}</strong>
        <div class="small muted">${esc(r.profileName || "")} • ${esc(r.userEmail || "")}</div>
        ${r.note ? `<div class="small">${esc(r.note)}</div>` : ""}
      </div>
      <div class="row">
        <span class="badge">${esc(r.status || "new")}</span>
        <button class="btn btn-secondary" data-req-done="${id}">סומן</button>
        <button class="btn btn-secondary" data-req-del="${id}">מחק</button>
      </div>
    </div>
  `).join("") || '<div class="muted">אין בקשות</div>';

  els.adminRequestsList.querySelectorAll("[data-req-done]").forEach(btn => btn.addEventListener("click", async () => {
    await update(ref(db, `requests/${btn.dataset.reqDone}`), { status: "done" });
  }));
  els.adminRequestsList.querySelectorAll("[data-req-del]").forEach(btn => btn.addEventListener("click", async () => {
    await remove(ref(db, `requests/${btn.dataset.reqDel}`));
  }));
}
