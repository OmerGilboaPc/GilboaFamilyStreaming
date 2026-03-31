// ============================================================
//  GILBOASTREAMFAMILY — watchparty.js
//  ייבא את הקובץ הזה ב-index.html:
//  <script type="module" src="js/watchparty.js"></script>
//  (אחרי שורת app.js)
// ============================================================

import { initializeApp, getApps }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, push, remove, update, get, off, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── שימוש באותו Firebase app שכבר הופעל ב-app.js ──────────
const app  = getApps()[0];
const auth = getAuth(app);
const db   = getDatabase(app);

const ADMIN_EMAIL  = "omergilboapc@gmail.com";
const SYNC_THRESHOLD = 3; // שניות מקסימום קפיצה לפני resync

// ── State ────────────────────────────────────────────────────
let wpRoomId       = null;   // ID חדר נוכחי
let wpIsHost       = false;
let wpVideo        = null;   // <video> element
let wpMovieData    = null;
let wpProfileData  = null;
let wpReplyTo      = null;   // הודעה לציטוט
let wpSyncUnsub    = null;
let wpChatUnsub    = null;
let wpMembersUnsub = null;
let wpInviteUnsub  = null;
let wpBroadcastUnsub = null;
let lastSyncTime   = 0;

// ── Helpers ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function uid()  { return auth.currentUser?.uid; }
function email(){ return auth.currentUser?.email; }
function isAdmin() { return email() === ADMIN_EMAIL; }

// ── Wait for profile to be set by app.js ─────────────────────
export function initWatchParty(profile) {
  wpProfileData = profile;
  startBroadcastListener();
  startInviteListener();
}

// ════════════════════════════════════════════════════════════
//  📢  BROADCAST
// ════════════════════════════════════════════════════════════
function startBroadcastListener() {
  if (wpBroadcastUnsub) wpBroadcastUnsub();
  const bRef = ref(db, 'broadcast/current');
  wpBroadcastUnsub = onValue(bRef, snap => {
    const data = snap.val();
    if (!data) return;
    // מציג רק הודעות שנשלחו אחרי שהמשתמש נכנס
    const now = Date.now();
    if (data.sentAt && now - data.sentAt < 60000) {
      showBroadcastBanner(data.message, data.icon || '📢');
    }
  });
}

function showBroadcastBanner(message, icon = '📢') {
  // הסר banner קיים
  document.getElementById('broadcastBanner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'broadcastBanner';
  banner.innerHTML = `
    <div class="broadcast-content">
      <span class="broadcast-icon">${icon}</span>
      <span class="broadcast-text">${message}</span>
    </div>
    <button class="broadcast-close" id="broadcastCloseBtn">✕</button>
  `;
  document.body.prepend(banner);

  document.getElementById('broadcastCloseBtn').addEventListener('click', () => {
    banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    banner.style.transform  = 'translateY(-100%)';
    banner.style.opacity    = '0';
    setTimeout(() => banner.remove(), 350);
  });

  // סגירה אוטומטית אחרי 15 שניות
  setTimeout(() => {
    if (document.getElementById('broadcastBanner')) {
      banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      banner.style.transform  = 'translateY(-100%)';
      banner.style.opacity    = '0';
      setTimeout(() => banner.remove(), 350);
    }
  }, 15000);
}

// ════════════════════════════════════════════════════════════
//  🔔  WATCH PARTY INVITE LISTENER
// ════════════════════════════════════════════════════════════
function startInviteListener() {
  if (!uid() || !wpProfileData) return;
  if (wpInviteUnsub) wpInviteUnsub();

  const invRef = ref(db, `users/${uid()}/profiles/${wpProfileData.id}/wpInvite`);
  wpInviteUnsub = onValue(invRef, snap => {
    const inv = snap.val();
    if (!inv) return;
    // הצג הזמנה
    showWpInviteToast(inv);
    // נקה מ-Firebase כדי שלא יוצג שוב
    remove(invRef);
  });
}

function showWpInviteToast(inv) {
  const container = $('toastContainer');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'wp-invite-toast';
  div.innerHTML = `
    <div class="wp-invite-title">🎬 הוזמנת ל-Watch Party!</div>
    <div class="wp-invite-sub">
      <strong>${inv.hostName}</strong> מזמין/ת אותך לצפות ב:<br/>
      <strong>${inv.movieTitle}</strong>
    </div>
    <div class="wp-invite-actions">
      <button class="btn btn-primary" id="wpAcceptBtn_${inv.roomId}">✅ הצטרף</button>
      <button class="btn btn-secondary" id="wpDeclineBtn_${inv.roomId}">❌ דחה</button>
    </div>
  `;
  container.appendChild(div);

  document.getElementById(`wpAcceptBtn_${inv.roomId}`)?.addEventListener('click', () => {
    div.remove();
    joinWatchParty(inv.roomId);
  });
  document.getElementById(`wpDeclineBtn_${inv.roomId}`)?.addEventListener('click', () => {
    div.remove();
  });

  setTimeout(() => div.remove(), 30000);
}

// ════════════════════════════════════════════════════════════
//  🎬  CREATE / JOIN WATCH PARTY
// ════════════════════════════════════════════════════════════
export async function createWatchParty(movieId, movieTitle, movieUrl) {
  if (!uid() || !wpProfileData) return;

  // צור חדר חדש
  const roomRef = push(ref(db, 'watchParties'));
  wpRoomId  = roomRef.key;
  wpIsHost  = true;
  wpMovieData = { movieId, movieTitle, movieUrl };

  await set(roomRef, {
    hostId:      uid(),
    hostProfile: wpProfileData.id,
    hostName:    wpProfileData.name,
    movieId,
    movieTitle,
    movieUrl,
    state:       'waiting',
    currentTime: 0,
    lastUpdated: Date.now(),
    createdAt:   Date.now(),
    members: {
      [wpProfileData.id]: {
        name:     wpProfileData.name,
        avatar:   wpProfileData.avatar || '🎬',
        uid:      uid(),
        joinedAt: Date.now(),
        online:   true,
      }
    }
  });

  openWatchPartyModal();
  await sendSystemMessage(`${wpProfileData.name} יצר/ה את החדר 🎬`);

  // פתח modal הזמנות
  setTimeout(() => openInviteModal(), 300);
}

export async function joinWatchParty(roomId) {
  if (!uid() || !wpProfileData) return;
  wpRoomId  = roomId;
  wpIsHost  = false;

  const snap = await get(ref(db, `watchParties/${roomId}`));
  const room = snap.val();
  if (!room) { alert('החדר לא קיים'); return; }

  wpMovieData = {
    movieId:    room.movieId,
    movieTitle: room.movieTitle,
    movieUrl:   room.movieUrl,
  };

  // הוסף את עצמך כחבר
  await set(ref(db, `watchParties/${roomId}/members/${wpProfileData.id}`), {
    name:     wpProfileData.name,
    avatar:   wpProfileData.avatar || '🎬',
    uid:      uid(),
    joinedAt: Date.now(),
    online:   true,
  });

  openWatchPartyModal();
  await sendSystemMessage(`${wpProfileData.name} הצטרף/ה 👋`);
}

// ════════════════════════════════════════════════════════════
//  🖥  WATCH PARTY MODAL
// ════════════════════════════════════════════════════════════
function openWatchPartyModal() {
  let modal = $('watchPartyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = 'watchPartyModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-backdrop" id="wpBackdrop"></div>
    <div class="modal-dialog" style="padding:0;max-width:min(1400px,calc(100vw - 16px));overflow:hidden;">
      <div class="wp-layout">

        <!-- ── VIDEO SIDE ── -->
        <div class="wp-video-side">
          <div class="wp-header">
            <div class="wp-title-area">
              <div class="wp-movie-title" id="wpMovieTitleEl">${wpMovieData.movieTitle}</div>
              <div class="wp-room-id">חדר: ${wpRoomId?.slice(-6)?.toUpperCase()}</div>
            </div>
            <div id="wpMembersRow" class="wp-members"></div>
            <div id="wpSyncBadge" class="wp-sync-badge">
              <div class="wp-sync-dot"></div>
              <span>מסונכרן</span>
            </div>
            <button class="btn btn-secondary" id="wpInviteMoreBtn" style="padding:8px 14px;font-size:13px;">
              👥 הזמן
            </button>
            <button class="modal-close" id="wpCloseBtn" style="position:static;margin-right:4px;">✕</button>
          </div>

          <div class="wp-video-wrap">
            <!-- Waiting overlay -->
            <div class="wp-waiting" id="wpWaiting">
              <div class="wp-waiting-icon">🎬</div>
              <h3>${wpIsHost ? 'מוכן להתחיל?' : 'ממתינים למארח'}</h3>
              <p id="wpWaitingSubText">${wpIsHost
                ? 'לחץ "התחל צפייה" כשכולם מוכנים'
                : 'המארח יתחיל את הסרט בקרוב<span class="wp-waiting-dots"></span>'
              }</p>
              ${wpIsHost ? `
                <button class="btn btn-primary" id="wpStartBtn" style="margin-top:8px;">
                  ▶ התחל צפייה
                </button>` : ''}
            </div>
            <video id="wpVideoEl" preload="metadata"></video>
          </div>

          <!-- Host controls -->
          ${wpIsHost ? `
            <div class="wp-controls" id="wpControls">
              <button class="btn btn-primary"  id="wpPlayBtn">▶ המשך</button>
              <button class="btn btn-secondary" id="wpPauseBtn">⏸ עצור</button>
              <button class="btn btn-secondary" id="wpSeekBackBtn">⏪ 10s</button>
              <button class="btn btn-secondary" id="wpSeekFwdBtn">⏩ 10s</button>
              <span class="wp-time" id="wpTimeEl">0:00 / 0:00</span>
              <button class="btn btn-danger"    id="wpEndBtn"
                      style="background:rgba(229,9,20,0.15);border:1px solid rgba(229,9,20,0.3);color:#ff7a83;">
                ⏹ סיים
              </button>
            </div>` : `
            <div class="wp-controls">
              <span class="muted small">המארח שולט בנגן</span>
              <span class="wp-time" id="wpTimeEl">0:00 / 0:00</span>
            </div>`}
        </div>

        <!-- ── CHAT SIDE ── -->
        <div class="wp-chat-side">
          <div class="wp-chat-header">💬 צ'אט חי</div>

          <div class="emoji-picker-row" id="wpEmojiBar">
            ${['😂','❤️','🔥','😮','👏','😢','😡','🤣','💀','🍿'].map(e =>
              `<button class="emoji-pick-btn" data-emoji="${e}">${e}</button>`
            ).join('')}
          </div>

          <div class="wp-chat-messages" id="wpChatMessages"></div>

          <div id="wpReplyBar" class="wp-reply-bar hidden">
            <span>↩️ מגיב/ת ל:</span>
            <span class="wp-reply-bar-text" id="wpReplyText"></span>
            <button class="wp-reply-cancel" id="wpReplyCancelBtn">✕</button>
          </div>

          <div class="wp-chat-input-wrap">
            <textarea class="wp-chat-input" id="wpChatInput"
                      placeholder="כתוב הודעה..." rows="1"></textarea>
            <button class="wp-chat-send" id="wpChatSendBtn">➤</button>
          </div>
        </div>

      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  setupWatchPartyEvents();
  subscribeToRoom();
  subscribeToChatMessages();
  subscribeToMembers();
}

// ════════════════════════════════════════════════════════════
//  🎮  EVENT HANDLERS
// ════════════════════════════════════════════════════════════
function setupWatchPartyEvents() {
  const video = $('wpVideoEl');
  wpVideo = video;

  if (wpMovieData.movieUrl) {
    video.src = wpMovieData.movieUrl;
  }

  // Close
  $('wpCloseBtn')?.addEventListener('click', leaveWatchParty);
  $('wpBackdrop')?.addEventListener('click', leaveWatchParty);

  // Host start button
  $('wpStartBtn')?.addEventListener('click', async () => {
    await hostPlay(0);
    $('wpWaiting')?.remove();
  });

  // Host controls
  if (wpIsHost) {
    $('wpPlayBtn')?.addEventListener('click',     () => hostPlay());
    $('wpPauseBtn')?.addEventListener('click',    () => hostPause());
    $('wpSeekBackBtn')?.addEventListener('click', () => hostSeek(video.currentTime - 10));
    $('wpSeekFwdBtn')?.addEventListener('click',  () => hostSeek(video.currentTime + 10));
    $('wpEndBtn')?.addEventListener('click',      () => hostEnd());
  }

  // Time display
  video.addEventListener('timeupdate', () => {
    const el = $('wpTimeEl');
    if (el) el.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration || 0)}`;
  });

  // Invite
  $('wpInviteMoreBtn')?.addEventListener('click', openInviteModal);

  // Emoji bar (insert into input)
  $('wpEmojiBar')?.querySelectorAll('.emoji-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('wpChatInput');
      if (input) input.value += btn.dataset.emoji;
      input?.focus();
    });
  });

  // Chat send
  $('wpChatSendBtn')?.addEventListener('click', sendChatMessage);
  $('wpChatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Reply cancel
  $('wpReplyCancelBtn')?.addEventListener('click', () => {
    wpReplyTo = null;
    $('wpReplyBar')?.classList.add('hidden');
  });
}

// ════════════════════════════════════════════════════════════
//  🔄  FIREBASE SYNC — ROOM STATE
// ════════════════════════════════════════════════════════════
function subscribeToRoom() {
  if (wpSyncUnsub) wpSyncUnsub();
  if (!wpRoomId) return;

  wpSyncUnsub = onValue(ref(db, `watchParties/${wpRoomId}`), snap => {
    const room = snap.val();
    if (!room) { leaveWatchParty(); return; }

    if (!wpVideo) return;
    const { state, currentTime, lastUpdated } = room;

    // אם החדר הסתיים
    if (state === 'ended') {
      if (!wpIsHost) {
        showSystemOverlay('הסרט הסתיים 🎬');
        setTimeout(leaveWatchParty, 3000);
      }
      return;
    }

    // רק אורחים מסונכרנים — המארח שולט
    if (wpIsHost) return;

    const staleness = (Date.now() - (lastUpdated || 0)) / 1000;
    const targetTime = currentTime + (state === 'playing' ? staleness : 0);

    if (state === 'waiting') {
      // הצג waiting overlay
      if (!$('wpWaiting')) {
        const wrap = $('wpVideoEl')?.parentElement;
        if (wrap) {
          const ov = document.createElement('div');
          ov.id = 'wpWaiting';
          ov.className = 'wp-waiting';
          ov.innerHTML = `
            <div class="wp-waiting-icon">🎬</div>
            <h3>ממתינים למארח</h3>
            <p>המארח יתחיל את הסרט בקרוב<span class="wp-waiting-dots"></span></p>
          `;
          wrap.appendChild(ov);
        }
      }
      wpVideo.pause();
      return;
    }

    // הסר waiting overlay
    $('wpWaiting')?.remove();

    // Sync check
    const drift = Math.abs(wpVideo.currentTime - targetTime);
    const syncBadge = $('wpSyncBadge');

    if (drift > SYNC_THRESHOLD) {
      wpVideo.currentTime = targetTime;
      if (syncBadge) {
        syncBadge.className = 'wp-sync-badge desynced';
        syncBadge.innerHTML = '<div class="wp-sync-dot"></div><span>מסנכרן...</span>';
        setTimeout(() => {
          if (syncBadge) {
            syncBadge.className = 'wp-sync-badge';
            syncBadge.innerHTML = '<div class="wp-sync-dot"></div><span>מסונכרן</span>';
          }
        }, 2000);
      }
    }

    if (state === 'playing') {
      wpVideo.play().catch(() => {});
    } else if (state === 'paused') {
      wpVideo.pause();
    }
  });
}

// ════════════════════════════════════════════════════════════
//  🎮  HOST CONTROLS
// ════════════════════════════════════════════════════════════
async function hostPlay(startAt = null) {
  if (!wpIsHost || !wpVideo) return;
  const t = startAt !== null ? startAt : wpVideo.currentTime;
  wpVideo.currentTime = t;
  wpVideo.play().catch(() => {});
  $('wpWaiting')?.remove();
  await update(ref(db, `watchParties/${wpRoomId}`), {
    state: 'playing', currentTime: t, lastUpdated: Date.now()
  });
  await sendSystemMessage('▶ הסרט התחיל');
}

async function hostPause() {
  if (!wpIsHost || !wpVideo) return;
  wpVideo.pause();
  await update(ref(db, `watchParties/${wpRoomId}`), {
    state: 'paused', currentTime: wpVideo.currentTime, lastUpdated: Date.now()
  });
  await sendSystemMessage(`⏸ המארח עצר ב-${fmtTime(wpVideo.currentTime)}`);
}

async function hostSeek(t) {
  if (!wpIsHost || !wpVideo) return;
  const clamped = Math.max(0, Math.min(t, wpVideo.duration || 9999));
  wpVideo.currentTime = clamped;
  const state = wpVideo.paused ? 'paused' : 'playing';
  await update(ref(db, `watchParties/${wpRoomId}`), {
    state, currentTime: clamped, lastUpdated: Date.now()
  });
}

async function hostEnd() {
  if (!wpIsHost) return;
  if (!confirm('לסיים את ה-Watch Party לכולם?')) return;
  await update(ref(db, `watchParties/${wpRoomId}`), { state: 'ended', lastUpdated: Date.now() });
  await sendSystemMessage('⏹ ה-Watch Party הסתיים');
  setTimeout(leaveWatchParty, 1500);
}

// ════════════════════════════════════════════════════════════
//  👥  MEMBERS
// ════════════════════════════════════════════════════════════
function subscribeToMembers() {
  if (wpMembersUnsub) wpMembersUnsub();
  if (!wpRoomId) return;

  wpMembersUnsub = onValue(ref(db, `watchParties/${wpRoomId}/members`), snap => {
    const members = snap.val() || {};
    const row = $('wpMembersRow');
    if (!row) return;
    row.innerHTML = '';
    Object.values(members).forEach(m => {
      const av = document.createElement('div');
      av.className = `wp-member-avatar ${m.online ? 'online' : ''}`;
      av.title     = m.name;
      av.textContent = m.avatar || '🎬';
      row.appendChild(av);
    });
  });
}

// ════════════════════════════════════════════════════════════
//  💬  CHAT
// ════════════════════════════════════════════════════════════
function subscribeToChatMessages() {
  if (wpChatUnsub) wpChatUnsub();
  if (!wpRoomId) return;

  wpChatUnsub = onValue(ref(db, `watchParties/${wpRoomId}/chat`), snap => {
    const msgs = snap.val() || {};
    const container = $('wpChatMessages');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(msgs)
      .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0))
      .forEach(([msgId, msg]) => renderChatMessage(msgId, msg, container));
    container.scrollTop = container.scrollHeight;
  });
}

function renderChatMessage(msgId, msg, container) {
  const isOwn    = msg.senderId === wpProfileData?.id;
  const isSystem = msg.type === 'system';

  const wrap = document.createElement('div');
  wrap.className   = 'chat-msg-wrap';
  wrap.dataset.mid = msgId;

  const msgEl = document.createElement('div');
  msgEl.className  = `chat-msg ${isSystem ? 'system' : isOwn ? 'own' : 'other'}`;

  if (!isSystem) {
    msgEl.innerHTML = `<div class="chat-msg-sender">${msg.senderName}</div>`;
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';

  // Reply quote
  if (msg.replyTo) {
    const quote = document.createElement('div');
    quote.className   = 'chat-reply-quote';
    quote.textContent = `${msg.replyTo.senderName}: ${msg.replyTo.text}`;
    bubble.appendChild(quote);
  }

  const textNode = document.createElement('span');
  textNode.textContent = msg.text;
  bubble.appendChild(textNode);
  msgEl.appendChild(bubble);

  // Reactions
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    const reactRow = document.createElement('div');
    reactRow.className = 'chat-reactions';
    const counts = {};
    const myReacts = new Set();
    Object.entries(msg.reactions).forEach(([pid, emoji]) => {
      counts[emoji] = (counts[emoji] || 0) + 1;
      if (pid === wpProfileData?.id) myReacts.add(emoji);
    });
    Object.entries(counts).forEach(([emoji, count]) => {
      const pill = document.createElement('button');
      pill.className   = `reaction-pill ${myReacts.has(emoji) ? 'mine' : ''}`;
      pill.innerHTML   = `${emoji} <span class="reaction-count">${count}</span>`;
      pill.addEventListener('click', () => toggleReaction(msgId, emoji));
      reactRow.appendChild(pill);
    });
    msgEl.appendChild(reactRow);
  }

  wrap.appendChild(msgEl);

  // Hover actions (reply + react) — לא על הודעות מערכת
  if (!isSystem) {
    const actions = document.createElement('div');
    actions.className = 'chat-msg-actions';
    actions.innerHTML = `
      <button class="chat-action-btn" title="הגב" data-reply="${msgId}">↩️</button>
      <button class="chat-action-btn" title="React" data-react="${msgId}">😊</button>
    `;
    // Reply
    actions.querySelector('[data-reply]').addEventListener('click', () => {
      wpReplyTo = { id: msgId, text: msg.text, senderName: msg.senderName };
      const bar = $('wpReplyBar');
      bar?.classList.remove('hidden');
      if ($('wpReplyText')) $('wpReplyText').textContent = `${msg.senderName}: ${msg.text}`;
      $('wpChatInput')?.focus();
    });
    // React picker (quick)
    actions.querySelector('[data-react]').addEventListener('click', e => {
      openQuickReactPicker(msgId, e.currentTarget);
    });
    wrap.appendChild(actions);
  }

  container.appendChild(wrap);
}

function openQuickReactPicker(msgId, anchor) {
  document.getElementById('quickReactPicker')?.remove();
  const picker = document.createElement('div');
  picker.id    = 'quickReactPicker';
  picker.style.cssText = `
    position:fixed;background:#13131f;border:1px solid rgba(255,255,255,0.12);
    border-radius:12px;padding:8px;display:flex;gap:6px;z-index:9999;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
  `;
  const rect = anchor.getBoundingClientRect();
  picker.style.top  = (rect.top - 52) + 'px';
  picker.style.left = rect.left + 'px';

  ['❤️','😂','🔥','😮','👏','😢','😡','🤣','💀','🍿'].forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent  = emoji;
    btn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;padding:4px;border-radius:6px;transition:transform .1s;';
    btn.onmouseenter = () => btn.style.transform = 'scale(1.2)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.addEventListener('click', () => {
      toggleReaction(msgId, emoji);
      picker.remove();
    });
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50);
}

async function toggleReaction(msgId, emoji) {
  if (!wpRoomId || !wpProfileData) return;
  const reactRef = ref(db, `watchParties/${wpRoomId}/chat/${msgId}/reactions/${wpProfileData.id}`);
  const snap = await get(reactRef);
  if (snap.val() === emoji) {
    await remove(reactRef);
  } else {
    await set(reactRef, emoji);
  }
}

async function sendChatMessage() {
  const input = $('wpChatInput');
  if (!input || !wpRoomId || !wpProfileData) return;
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    text,
    senderId:   wpProfileData.id,
    senderName: wpProfileData.name,
    timestamp:  Date.now(),
    type:       'user',
  };
  if (wpReplyTo) {
    msg.replyTo = {
      id:         wpReplyTo.id,
      text:       wpReplyTo.text.slice(0, 80),
      senderName: wpReplyTo.senderName,
    };
    wpReplyTo = null;
    $('wpReplyBar')?.classList.add('hidden');
  }

  input.value = '';
  await push(ref(db, `watchParties/${wpRoomId}/chat`), msg);
}

async function sendSystemMessage(text) {
  if (!wpRoomId) return;
  await push(ref(db, `watchParties/${wpRoomId}/chat`), {
    text, type: 'system', timestamp: Date.now()
  });
}

function showSystemOverlay(text) {
  const wrap = $('wpVideoEl')?.parentElement;
  if (!wrap) return;
  const ov = document.createElement('div');
  ov.className = 'wp-waiting';
  ov.innerHTML = `<div class="wp-waiting-icon">🎬</div><h3>${text}</h3>`;
  wrap.appendChild(ov);
}

// ════════════════════════════════════════════════════════════
//  👥  INVITE MODAL
// ════════════════════════════════════════════════════════════
async function openInviteModal() {
  if (!wpRoomId) return;

  // טען את כל המשתמשים ופרופילים
  const usersSnap = await get(ref(db, 'users'));
  const usersData = usersSnap.val() || {};

  // בנה רשימה שטוחה של כל הפרופילים (לא שלי, לא אדמין)
  const allProfiles = [];
  Object.entries(usersData).forEach(([targetUid, userData]) => {
    if (targetUid === uid()) return; // לא אני
    const profiles = userData.profiles || {};
    Object.entries(profiles).forEach(([pid, p]) => {
      allProfiles.push({ uid: targetUid, pid, name: p.name, avatar: p.avatar || '🎬' });
    });
  });

  // Modal
  let invModal = $('wpInviteModal');
  if (!invModal) {
    invModal = document.createElement('div');
    invModal.id        = 'wpInviteModal';
    invModal.className = 'modal';
    invModal.style.zIndex = '250';
    document.body.appendChild(invModal);
  }

  invModal.innerHTML = `
    <div class="modal-backdrop" id="inviteBackdrop"></div>
    <div class="modal-dialog" style="max-width:480px;">
      <button class="modal-close" id="inviteCloseBtn">✕</button>
      <h3 style="margin-bottom:6px;">👥 הזמן לWatch Party</h3>
      <p class="muted small" style="margin-bottom:14px;">
        בחר פרופילים — הם יקבלו התראה ויוכלו להצטרף
      </p>
      <div class="invite-profiles-grid" id="inviteGrid">
        ${allProfiles.length === 0
          ? '<div class="muted small">אין משתמשים אחרים רשומים</div>'
          : allProfiles.map(p => `
            <div class="invite-profile-card" data-uid="${p.uid}" data-pid="${p.pid}">
              <div class="invite-profile-avatar">${p.avatar}</div>
              <div class="invite-profile-name">${p.name}</div>
              <div class="invite-check" id="check_${p.pid}"></div>
            </div>`).join('')}
      </div>
      <button class="btn btn-primary" id="sendInvitesBtn" style="width:100%;margin-top:8px;">
        📨 שלח הזמנות
      </button>
    </div>
  `;

  invModal.classList.remove('hidden');
  const selected = new Set();

  invModal.querySelectorAll('.invite-profile-card').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.pid;
      if (selected.has(pid)) {
        selected.delete(pid);
        card.classList.remove('selected');
        $(`check_${pid}`).textContent = '';
      } else {
        selected.add(pid);
        card.classList.add('selected');
        $(`check_${pid}`).textContent = '✅';
      }
    });
  });

  $('inviteCloseBtn')?.addEventListener('click', () => invModal.classList.add('hidden'));
  $('inviteBackdrop')?.addEventListener('click', () => invModal.classList.add('hidden'));

  $('sendInvitesBtn')?.addEventListener('click', async () => {
    if (selected.size === 0) return;
    const roomSnap = await get(ref(db, `watchParties/${wpRoomId}`));
    const room     = roomSnap.val();
    if (!room) return;

    for (const p of allProfiles) {
      if (!selected.has(p.pid)) continue;
      await set(
        ref(db, `users/${p.uid}/profiles/${p.pid}/wpInvite`),
        {
          roomId:     wpRoomId,
          hostName:   wpProfileData.name,
          movieTitle: wpMovieData.movieTitle,
          sentAt:     Date.now(),
        }
      );
    }

    window.showToast?.(`הזמנות נשלחו ל-${selected.size} משתמשים`, 'success', '📨');
    invModal.classList.add('hidden');
  });
}

// ════════════════════════════════════════════════════════════
//  🚪  LEAVE
// ════════════════════════════════════════════════════════════
async function leaveWatchParty() {
  if (wpRoomId && wpProfileData) {
    // סמן offline
    await update(
      ref(db, `watchParties/${wpRoomId}/members/${wpProfileData.id}`),
      { online: false }
    ).catch(() => {});

    if (wpIsHost) {
      await update(ref(db, `watchParties/${wpRoomId}`), { state: 'ended' }).catch(() => {});
    }
  }

  // Unsubscribe listeners
  wpSyncUnsub?.();
  wpChatUnsub?.();
  wpMembersUnsub?.();

  // Stop video
  if (wpVideo) { wpVideo.pause(); wpVideo.src = ''; }

  // Remove modals
  $('watchPartyModal')?.remove();
  $('wpInviteModal')?.remove();

  // Reset state
  wpRoomId  = null;
  wpIsHost  = false;
  wpVideo   = null;
  wpReplyTo = null;
}

// ════════════════════════════════════════════════════════════
//  🔌  EXPOSE to app.js (window globals)
// ════════════════════════════════════════════════════════════
window.wpCreateParty = createWatchParty;
window.wpJoinParty   = joinWatchParty;
window.wpInit        = initWatchParty;
