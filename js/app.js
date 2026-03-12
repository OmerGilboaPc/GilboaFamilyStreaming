import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const state = { user:null, isAdmin:false, authMode:"login", profiles:{}, currentProfileId:null, movies:{}, series:{}, requests:{}, ratings:{}, progress:{}, ytPlayer:null, ytTimer:null };
const $ = (id) => document.getElementById(id);
const els = {
  splash:$("splash"), authScreen:$("authScreen"), profilesScreen:$("profilesScreen"), appScreen:$("appScreen"),
  authEmail:$("authEmail"), authPassword:$("authPassword"), authActionBtn:$("authActionBtn"), authError:$("authError"),
  profilesGrid:$("profilesGrid"), openProfilesManagerBtn:$("openProfilesManagerBtn"), signOutProfilesBtn:$("signOutProfilesBtn"),
  adminBtn:$("adminBtn"), requestsBtn:$("requestsBtn"), heroRequestsBtn:$("heroRequestsBtn"),
  randomBtn:$("randomBtn"), heroRandomBtn:$("heroRandomBtn"), switchProfileBtn:$("switchProfileBtn"), signOutBtn:$("signOutBtn"),
  searchInput:$("searchInput"), activeProfileLabel:$("activeProfileLabel"),
  continueGrid:$("continueGrid"), moviesGrid:$("moviesGrid"), seriesGrid:$("seriesGrid"),
  detailsBody:$("detailsBody"), playerHost:$("playerHost"), playerTitle:$("playerTitle"), playerMeta:$("playerMeta"), nextEpisodeBtn:$("nextEpisodeBtn"), playerStatus:$("playerStatus"),
  requestTitle:$("requestTitle"), requestNote:$("requestNote"), sendRequestBtn:$("sendRequestBtn"), requestsList:$("requestsList"),
  newProfileName:$("newProfileName"), newProfileAvatar:$("newProfileAvatar"), addProfileBtn:$("addProfileBtn"), profilesManageList:$("profilesManageList"),
  moviesCount:$("moviesCount"), seriesCount:$("seriesCount"), episodesCount:$("episodesCount")
};

function esc(v){ return String(v ?? "").replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function toast(msg){ alert(msg); }
function showOnly(which){
  els.authScreen.classList.toggle("hidden", which !== "auth");
  els.profilesScreen.classList.toggle("hidden", which !== "profiles");
  els.appScreen.classList.toggle("hidden", which !== "app");
}
function openModal(id){ $(id).classList.remove("hidden"); }
function closeModal(id){ $(id).classList.add("hidden"); if(id === "playerModal") destroyPlayer(); }
function isYouTube(url){ return /youtube\.com|youtu\.be/.test(url || ""); }
function normalizeYouTube(url){
  if (!url) return "";
  if (url.includes("/embed/")) return url.includes("enablejsapi=1") ? url : `${url}${url.includes("?") ? "&" : "?"}enablejsapi=1`;
  const short = url.match(/youtu\.be\/([^?&/]+)/);
  if (short) return `https://www.youtube.com/embed/${short[1]}?enablejsapi=1`;
  const watch = url.match(/[?&]v=([^?&/]+)/);
  if (watch) return `https://www.youtube.com/embed/${watch[1]}?enablejsapi=1`;
  return url;
}
function uid(){ return state.user?.uid; }
function contentIdForMovie(id){ return `movie__${id}`; }
function contentIdForEpisode(seriesId, season, episode){ return `series__${seriesId}__s${season}e${episode}`; }
function getAverageRating(contentId){
  const data = state.ratings[contentId] || {};
  const vals = Object.values(data).map(v => Number(v.value || 0)).filter(Boolean);
  if (!vals.length) return null;
  return (vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(1);
}
function currentProfileName(){ return state.profiles?.[state.currentProfileId]?.name || "פרופיל"; }
function getProgress(contentId){ return (((state.progress || {})[state.currentProfileId] || {})[contentId]) || null; }
function formatTime(seconds){
  const s = Math.floor(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2,"0")}:${r}` : `${m}:${r}`;
}
setTimeout(() => els.splash.classList.add("hidden"), 2100);

document.querySelectorAll("[data-auth-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-mode]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.authMode = btn.dataset.authMode;
    els.authActionBtn.textContent = state.authMode === "login" ? "התחברות" : "הרשמה";
    els.authError.textContent = "";
  });
});

els.authActionBtn.addEventListener("click", async () => {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value.trim();
  els.authError.textContent = "";
  if(!email || !password) return els.authError.textContent = "יש למלא אימייל וסיסמה";
  try{
    if(state.authMode === "login"){
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await set(ref(db, `users/${cred.user.uid}`), { email, createdAt: Date.now() });
      const pRef = push(ref(db, `users/${cred.user.uid}/profiles`));
      await set(pRef, { name: email.split("@")[0], avatar: "🎬", createdAt: Date.now() });
    }
  } catch(err){
    els.authError.textContent = err.message;
  }
});

els.signOutBtn.addEventListener("click", () => signOut(auth));
els.signOutProfilesBtn.addEventListener("click", () => signOut(auth));
els.switchProfileBtn.addEventListener("click", () => showProfiles());
els.openProfilesManagerBtn.addEventListener("click", () => { renderProfilesManage(); openModal("profilesModal"); });
els.addProfileBtn.addEventListener("click", addProfile);
els.requestsBtn.addEventListener("click", showRequests);
els.heroRequestsBtn.addEventListener("click", showRequests);
els.sendRequestBtn.addEventListener("click", sendRequest);
els.randomBtn.addEventListener("click", randomPick);
els.heroRandomBtn.addEventListener("click", randomPick);
els.adminBtn.addEventListener("click", () => location.href = "admin.html");
els.searchInput.addEventListener("input", renderAll);
document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => closeModal(el.dataset.close)));

onAuthStateChanged(auth, async user => {
  state.user = user;
  state.isAdmin = !!(user && user.email === ADMIN_EMAIL);
  els.adminBtn.classList.toggle("hidden", !state.isAdmin);
  if(!user){
    state.currentProfileId = null;
    showOnly("auth");
    return;
  }
  await ensureUser();
  wireRealtime();
  showProfiles();
});

async function ensureUser(){
  const snap = await get(ref(db, `users/${uid()}`));
  if(!snap.exists()){
    await set(ref(db, `users/${uid()}`), { email: state.user.email, createdAt: Date.now() });
  }
  const profSnap = await get(ref(db, `users/${uid()}/profiles`));
  if(!profSnap.exists()){
    const pRef = push(ref(db, `users/${uid()}/profiles`));
    await set(pRef, { name: state.user.email.split("@")[0], avatar: "🎬", createdAt: Date.now() });
  }
}

function wireRealtime(){
  onValue(ref(db, `users/${uid()}/profiles`), snap => {
    state.profiles = snap.val() || {};
    renderProfiles();
    renderProfilesManage();
  });
  onValue(ref(db, "movies"), snap => { state.movies = snap.val() || {}; updateStats(); renderAll(); });
  onValue(ref(db, "series"), snap => { state.series = snap.val() || {}; updateStats(); renderAll(); });
  onValue(ref(db, "requests"), snap => { state.requests = snap.val() || {}; renderRequests(); });
  onValue(ref(db, "ratings"), snap => { state.ratings = snap.val() || {}; renderAll(); });
  onValue(ref(db, `progress/${uid()}`), snap => { state.progress = snap.val() || {}; renderContinueWatching(); });
}

function showProfiles(){
  showOnly("profiles");
  renderProfiles();
}

function renderProfiles(){
  const entries = Object.entries(state.profiles || {});
  els.profilesGrid.innerHTML = entries.map(([id, p]) => `
    <button class="profile-card" data-profile-id="${id}">
      <div class="profile-avatar">${esc(p.avatar || "🎬")}</div>
      <div class="profile-name">${esc(p.name)}</div>
    </button>
  `).join("");
  els.profilesGrid.querySelectorAll("[data-profile-id]").forEach(btn => btn.addEventListener("click", () => enterApp(btn.dataset.profileId)));
}

function enterApp(profileId){
  state.currentProfileId = profileId;
  els.activeProfileLabel.textContent = currentProfileName();
  showOnly("app");
  renderAll();
}

function renderProfilesManage(){
  const entries = Object.entries(state.profiles || {});
  els.profilesManageList.innerHTML = entries.map(([id, p]) => `
    <div class="admin-item">
      <div><strong>${esc(p.name)}</strong> <span class="muted">${esc(p.avatar || "🎬")}</span></div>
      <button class="btn btn-secondary" data-delete-profile="${id}">מחק</button>
    </div>
  `).join("") || '<div class="muted">אין פרופילים</div>';
  els.profilesManageList.querySelectorAll("[data-delete-profile]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!confirm("למחוק פרופיל?")) return;
      await remove(ref(db, `users/${uid()}/profiles/${btn.dataset.deleteProfile}`));
    });
  });
}

async function addProfile(){
  const name = els.newProfileName.value.trim();
  const avatar = els.newProfileAvatar.value.trim() || "🎬";
  if(!name) return toast("יש למלא שם פרופיל");
  const pRef = push(ref(db, `users/${uid()}/profiles`));
  await set(pRef, { name, avatar, createdAt: Date.now() });
  els.newProfileName.value = ""; els.newProfileAvatar.value = "";
}

function updateStats(){
  els.moviesCount.textContent = Object.keys(state.movies).length;
  els.seriesCount.textContent = Object.keys(state.series).length;
  const totalEpisodes = Object.values(state.series).reduce((sum, s) => {
    const seasons = s.seasons || {};
    return sum + Object.values(seasons).reduce((a, seasonObj) => a + Object.keys((seasonObj || {}).episodes || {}).length, 0);
  }, 0);
  els.episodesCount.textContent = totalEpisodes;
}

function filterSearch(entries, extractor){
  const q = els.searchInput.value.trim().toLowerCase();
  if(!q) return entries;
  return entries.filter(([id, item]) => extractor(id, item).toLowerCase().includes(q));
}

function cardHtml({type,id,title,poster,meta,progressPct=null}){
  return `
    <article class="card" data-open-type="${type}" data-open-id="${id}">
      <img class="poster" src="${esc(poster || "")}" alt="${esc(title)}" onerror="this.src='https://placehold.co/400x600/1a1a26/ffffff?text=Poster'">
      <div class="card-body">
        <div class="card-title">${esc(title)}</div>
        <div class="card-meta">${meta || ""}</div>
        ${progressPct !== null ? `<div class="progress-wrap"><div class="progress-bar" style="width:${progressPct}%"></div></div>` : ""}
      </div>
    </article>
  `;
}
function wireCards(){
  document.querySelectorAll("[data-open-type]").forEach(el => el.addEventListener("click", () => openDetails(el.dataset.openType, el.dataset.openId)));
}

function renderMovies(){
  const items = filterSearch(Object.entries(state.movies), (id,item) => `${item.title} ${item.description || ""} ${item.category || ""}`);
  els.moviesGrid.innerHTML = items.map(([id, item]) => {
    const avg = getAverageRating(contentIdForMovie(id));
    const prog = getProgress(contentIdForMovie(id));
    const pct = prog && prog.duration ? Math.max(2, Math.min(100, Math.round((prog.time / prog.duration) * 100))) : (prog ? 25 : null);
    const meta = `<span class="badge">🎬 סרט</span>${item.category ? `<span class="badge">${esc(item.category)}</span>` : ""}${avg ? `<span class="badge">⭐ ${avg}</span>` : ""}`;
    return cardHtml({ type:"movie", id, title:item.title, poster:item.poster, meta, progressPct:pct });
  }).join("") || '<div class="muted">אין סרטים</div>';
  wireCards();
}

function renderSeries(){
  const items = filterSearch(Object.entries(state.series), (id,item) => {
    const eps = Object.values(item.seasons || {}).flatMap(season => Object.values(season.episodes || {}).map(ep => ep.title)).join(" ");
    return `${item.title} ${item.description || ""} ${item.category || ""} ${eps}`;
  });
  els.seriesGrid.innerHTML = items.map(([id, item]) => {
    const epCount = Object.values(item.seasons || {}).reduce((sum, season) => sum + Object.keys(season.episodes || {}).length, 0);
    const meta = `<span class="badge">📺 סדרה</span>${item.category ? `<span class="badge">${esc(item.category)}</span>` : ""}<span class="badge">${epCount} פרקים</span>`;
    return cardHtml({ type:"series", id, title:item.title, poster:item.poster, meta });
  }).join("") || '<div class="muted">אין סדרות</div>';
  wireCards();
}

function renderContinueWatching(){
  if(!state.currentProfileId){ els.continueGrid.innerHTML = ""; return; }
  const profileProg = (state.progress || {})[state.currentProfileId] || {};
  const items = Object.entries(profileProg).map(([contentId, prog]) => {
    if(contentId.startsWith("movie__")){
      const movieId = contentId.replace("movie__", "");
      const movie = state.movies[movieId];
      if(!movie) return null;
      const pct = prog.duration ? Math.max(2, Math.min(100, Math.round((prog.time / prog.duration) * 100))) : 25;
      return cardHtml({ type:"movie", id:movieId, title:movie.title, poster:movie.poster, meta:'<span class="badge">⏯ המשך צפייה</span>', progressPct:pct });
    }
    if(contentId.startsWith("series__")){
      const parts = contentId.split("__");
      const seriesId = parts[1];
      const match = (parts[2] || "").match(/s(\d+)e(\d+)/);
      if(!match) return null;
      const season = match[1], episode = match[2];
      const series = state.series[seriesId];
      const ep = series?.seasons?.[season]?.episodes?.[episode];
      if(!series || !ep) return null;
      const pct = prog.duration ? Math.max(2, Math.min(100, Math.round((prog.time / prog.duration) * 100))) : 25;
      return cardHtml({ type:"series", id:seriesId, title:`${series.title} • S${season}E${episode}`, poster:ep.poster || series.poster, meta:'<span class="badge">⏯ המשך צפייה</span>', progressPct:pct });
    }
    return null;
  }).filter(Boolean);
  els.continueGrid.innerHTML = items.join("") || '<div class="muted">עדיין אין המשך צפייה</div>';
  wireCards();
}

function renderAll(){
  if(!state.currentProfileId) return;
  els.activeProfileLabel.textContent = currentProfileName();
  renderMovies();
  renderSeries();
  renderContinueWatching();
}

function getEpisodeList(seriesId){
  const series = state.series[seriesId];
  const seasons = series?.seasons || {};
  const out = [];
  Object.keys(seasons).sort((a,b)=>Number(a)-Number(b)).forEach(seasonNum => {
    const eps = seasons[seasonNum].episodes || {};
    Object.keys(eps).sort((a,b)=>Number(a)-Number(b)).forEach(epNum => {
      out.push({ seriesId, season:Number(seasonNum), episode:Number(epNum), ...eps[epNum] });
    });
  });
  return out;
}

function renderStars(contentId){
  const rateKey = `${uid()}__${state.currentProfileId}`;
  const mine = state.ratings[contentId]?.[rateKey]?.value || 0;
  return [1,2,3,4,5].map(n => `<button class="star-btn ${mine>=n ? "active":""}" data-rate-content="${contentId}" data-rate-value="${n}">${n}★</button>`).join("");
}
function wireStars(){
  document.querySelectorAll("[data-rate-content]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const contentId = btn.dataset.rateContent;
      const value = Number(btn.dataset.rateValue);
      const rateKey = `${uid()}__${state.currentProfileId}`;
      await set(ref(db, `ratings/${contentId}/${rateKey}`), { value, updatedAt: Date.now() });
    });
  });
}

function openDetails(type, id){
  if(type === "movie") renderMovieDetails(id);
  if(type === "series") renderSeriesDetails(id);
  openModal("detailsModal");
}

function renderMovieDetails(id){
  const movie = state.movies[id];
  if(!movie) return;
  const contentId = contentIdForMovie(id);
  const avg = getAverageRating(contentId);
  const prog = getProgress(contentId);
  els.detailsBody.innerHTML = `
    <div class="details-layout">
      <img class="details-poster" src="${esc(movie.poster || "")}" onerror="this.src='https://placehold.co/400x600/1a1a26/ffffff?text=Poster'">
      <div>
        <h2 class="details-title">${esc(movie.title)}</h2>
        <div class="card-meta">
          <span class="badge">🎬 סרט</span>
          ${movie.category ? `<span class="badge">${esc(movie.category)}</span>` : ""}
          ${avg ? `<span class="badge">⭐ ${avg}</span>` : ""}
        </div>
        <p class="details-desc">${esc(movie.description || "אין תיאור כרגע.")}</p>
        <div class="row">
          <button class="btn btn-primary" id="playMovieBtn">▶ צפייה</button>
          ${prog ? `<span class="badge">המשך מ־${formatTime(prog.time || 0)}</span>` : ""}
        </div>
        <h3>דירוג</h3>
        <div class="rating-stars">${renderStars(contentId)}</div>
      </div>
    </div>
  `;
  $("playMovieBtn").addEventListener("click", () => openPlayer({ contentId, title:movie.title, meta:movie.category || "סרט", video:movie.video, resumeAt:prog?.time || 0 }));
  wireStars();
}

function renderSeriesDetails(id){
  const series = state.series[id];
  if(!series) return;
  const episodes = getEpisodeList(id);
  const seasons = [...new Set(episodes.map(e => e.season))];
  let activeSeason = seasons[0] || 1;

  function draw(){
    const list = episodes.filter(ep => ep.season === Number(activeSeason));
    els.detailsBody.innerHTML = `
      <div class="details-layout">
        <img class="details-poster" src="${esc(series.poster || "")}" onerror="this.src='https://placehold.co/400x600/1a1a26/ffffff?text=Poster'">
        <div>
          <h2 class="details-title">${esc(series.title)}</h2>
          <div class="card-meta">
            <span class="badge">📺 סדרה</span>
            ${series.category ? `<span class="badge">${esc(series.category)}</span>` : ""}
            <span class="badge">${episodes.length} פרקים</span>
          </div>
          <p class="details-desc">${esc(series.description || "אין תיאור כרגע.")}</p>
          ${episodes[0] ? `<button class="btn btn-primary" id="playFirstEpisodeBtn">▶ נגן מהפרק הראשון</button>` : ""}
          <h3>עונות</h3>
          <div class="seasons-nav">
            ${seasons.map(s => `<button class="btn ${Number(s)===Number(activeSeason) ? "btn-primary":"btn-secondary"}" data-season-tab="${s}">עונה ${s}</button>`).join("")}
          </div>
          <div class="episode-list">
            ${list.map(ep => {
              const cid = contentIdForEpisode(id, ep.season, ep.episode);
              const prog = getProgress(cid);
              return `
                <div class="episode-item">
                  <img src="${esc(ep.poster || series.poster || "")}" onerror="this.src='https://placehold.co/320x180/1a1a26/ffffff?text=Episode'">
                  <div style="flex:1">
                    <div><strong>פרק ${ep.episode}: ${esc(ep.title)}</strong></div>
                    <div class="small muted">${esc(ep.description || "")}</div>
                    ${prog ? `<div class="small">המשך מ־${formatTime(prog.time || 0)}</div>` : ""}
                  </div>
                  <button class="btn btn-secondary" data-play-episode="${ep.season}|${ep.episode}">▶ נגן</button>
                </div>
              `;
            }).join("") || '<div class="muted">אין פרקים</div>'}
          </div>
        </div>
      </div>
    `;
    $("playFirstEpisodeBtn")?.addEventListener("click", () => playEpisode(id, episodes[0].season, episodes[0].episode));
    document.querySelectorAll("[data-season-tab]").forEach(btn => btn.addEventListener("click", () => { activeSeason = btn.dataset.seasonTab; draw(); }));
    document.querySelectorAll("[data-play-episode]").forEach(btn => btn.addEventListener("click", () => {
      const [season, episode] = btn.dataset.playEpisode.split("|");
      playEpisode(id, season, episode);
    }));
  }
  draw();
}

function getNextEpisode(seriesId, season, episode){
  const list = getEpisodeList(seriesId);
  const idx = list.findIndex(ep => Number(ep.season)===Number(season) && Number(ep.episode)===Number(episode));
  return idx >= 0 ? list[idx+1] || null : null;
}
function playEpisode(seriesId, season, episode){
  const ep = state.series[seriesId]?.seasons?.[season]?.episodes?.[episode];
  const series = state.series[seriesId];
  if(!ep || !series) return;
  const contentId = contentIdForEpisode(seriesId, season, episode);
  const prog = getProgress(contentId);
  const next = getNextEpisode(seriesId, season, episode);
  openPlayer({
    contentId,
    title:`${series.title} • S${season}E${episode} • ${ep.title}`,
    meta:`סדרה • עונה ${season} • פרק ${episode}`,
    video:ep.video,
    resumeAt:prog?.time || 0,
    nextEpisode: next ? () => playEpisode(seriesId, next.season, next.episode) : null
  });
}

async function saveProgress(contentId, time, duration){
  if(!uid() || !state.currentProfileId) return;
  await set(ref(db, `progress/${uid()}/${state.currentProfileId}/${contentId}`), {
    time: Math.floor(time || 0),
    duration: Math.floor(duration || 0),
    updatedAt: Date.now()
  });
}

function destroyPlayer(){
  if(state.ytTimer){ clearInterval(state.ytTimer); state.ytTimer = null; }
  if(state.ytPlayer && typeof state.ytPlayer.destroy === "function"){ try{ state.ytPlayer.destroy(); }catch{} }
  state.ytPlayer = null;
  els.playerHost.innerHTML = "";
  els.playerStatus.textContent = "";
}

function openPlayer({ contentId, title, meta, video, resumeAt = 0, nextEpisode = null }){

  els.playerTitle.textContent = title;
  els.playerMeta.textContent = meta || "";

  openModal("playerModal");

  els.playerHost.innerHTML = `
    <video
      id="streamPlayer"
      class="video-js vjs-big-play-centered"
      controls
      preload="auto"
      width="100%"
      height="auto"
      data-setup='{}'
    >
      <source src="${video}" type="video/mp4">
    </video>
  `;

  // האתחול הקיים שלך
const player = videojs("streamPlayer", {
    controls: true,
    autoplay: true,
    preload: "auto",
    fluid: true
});

player.ready(function() {
    if (typeof this.hotkeys === 'function') {
        this.hotkeys({
            seekStep: 10,
            volumeStep: 0.1,
            enableModifiersForNumbers: false,
            alwaysCaptureHotkeys: false,
            captureDocumentHotkeys: true
        });
    }
    this.addClass('vjs-theme-city');
});

// השורה הזו מחברת את הנגן לעיצוב הכהה (ה-CSS שהוספנו קודם ב-Header)
player.addClass('vjs-theme-city');

function showRequests(){ renderRequests(); openModal("requestsModal"); }
function renderRequests(){
  const list = Object.entries(state.requests).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  els.requestsList.innerHTML = list.map(([id, r]) => `
    <div class="request-card">
      <div>
        <strong>${esc(r.title)}</strong>
        <div class="small muted">${esc(r.profileName || "")} • ${new Date(r.createdAt || Date.now()).toLocaleString("he-IL")}</div>
        ${r.note ? `<div class="small">${esc(r.note)}</div>` : ""}
      </div>
      <span class="badge">${esc(r.status || "new")}</span>
    </div>
  `).join("") || '<div class="muted">אין בקשות עדיין</div>';
}
async function sendRequest(){
  const title = els.requestTitle.value.trim();
  const note = els.requestNote.value.trim();
  if(!title) return toast("יש לכתוב שם סרט או סדרה");
  const pRef = push(ref(db, "requests"));
  await set(pRef, { title, note, status:"new", userEmail: state.user.email, profileName: currentProfileName(), createdAt: Date.now() });
  els.requestTitle.value = ""; els.requestNote.value = "";
  toast("הבקשה נשלחה");
}
function randomPick(){
  const movies = Object.entries(state.movies);
  if(!movies.length) return toast("אין סרטים כרגע");
  const [id] = movies[Math.floor(Math.random()*movies.length)];
  openDetails("movie", id);
}

function extractYoutubeId(url){

  const reg =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/;

  const match = url.match(reg);

  return match ? match[1] : url;
}
}
}
