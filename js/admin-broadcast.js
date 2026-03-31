// ============================================================
//  GILBOASTREAMFAMILY — admin-broadcast.js
//  הדבק את כל זה בסוף js/admin.js
// ============================================================

// ════════════════════════════════════════════════════════════
//  📢  BROADCAST
// ════════════════════════════════════════════════════════════

// ── DOM refs (נוצרים ב-admin.html) ──────────────────────────
const broadcastInput   = () => document.getElementById('broadcastInput');
const broadcastIconSel = () => document.getElementById('broadcastIconSelect');
const broadcastPreview = () => document.getElementById('broadcastPreviewText');
const sendBroadcastBtn = () => document.getElementById('sendBroadcastBtn');

// עדכן preview בזמן הקלדה
document.getElementById('broadcastInput')?.addEventListener('input', () => {
  const el = document.getElementById('broadcastPreviewText');
  const icon = document.getElementById('broadcastIconSelect')?.value || '📢';
  const txt  = document.getElementById('broadcastInput')?.value.trim();
  if (el) {
    el.innerHTML = txt
      ? `${icon} ${txt}`
      : '<span class="broadcast-preview-placeholder">Preview ההודעה יופיע כאן...</span>';
  }
});

document.getElementById('broadcastIconSelect')?.addEventListener('change', () => {
  document.getElementById('broadcastInput')?.dispatchEvent(new Event('input'));
});

document.getElementById('sendBroadcastBtn')?.addEventListener('click', async () => {
  const msg  = document.getElementById('broadcastInput')?.value.trim();
  const icon = document.getElementById('broadcastIconSelect')?.value || '📢';
  if (!msg) { showToast('הכנס הודעה', 'error'); return; }

  await set(ref(db, 'broadcast/current'), {
    message: msg,
    icon,
    sentAt:  Date.now(),
    sentBy:  auth.currentUser?.email || 'admin',
  });

  // שמור בהיסטוריה
  await push(ref(db, 'broadcast/history'), {
    message: msg, icon, sentAt: Date.now()
  });

  document.getElementById('broadcastInput').value = '';
  document.getElementById('broadcastPreviewText').innerHTML =
    '<span class="broadcast-preview-placeholder">Preview ההודעה יופיע כאן...</span>';

  showToast('📢 ההודעה נשלחה לכולם!', 'success');
  loadBroadcastHistory();
});

function loadBroadcastHistory() {
  const list = document.getElementById('broadcastHistoryList');
  if (!list) return;

  get(ref(db, 'broadcast/history')).then(snap => {
    const hist = snap.val() || {};
    list.innerHTML = '';
    const entries = Object.entries(hist).sort((a, b) => (b[1].sentAt || 0) - (a[1].sentAt || 0)).slice(0, 10);
    if (entries.length === 0) {
      list.innerHTML = '<div class="muted small">אין היסטוריית שידורים</div>';
      return;
    }
    entries.forEach(([, h]) => {
      const d = document.createElement('div');
      d.className = 'admin-item';
      d.style.cssText = 'padding:10px 14px;';
      d.innerHTML = `
        <span style="font-size:20px;">${h.icon || '📢'}</span>
        <div class="admin-item-info">
          <div class="admin-item-title" style="font-size:14px;">${h.message}</div>
          <div class="admin-item-meta">${timeAgo(h.sentAt)}</div>
        </div>
      `;
      list.appendChild(d);
    });
  });
}

// ════════════════════════════════════════════════════════════
//  🎬  WATCH PARTIES ADMIN
// ════════════════════════════════════════════════════════════
function loadWatchParties() {
  onValue(ref(db, 'watchParties'), snap => {
    const parties = snap.val() || {};
    const list    = document.getElementById('wpAdminList');
    if (!list) return;
    list.innerHTML = '';

    const active = Object.entries(parties)
      .filter(([, p]) => p.state !== 'ended')
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

    if (active.length === 0) {
      list.innerHTML = '<div class="muted small" style="padding:14px;">אין Watch Parties פעילים כרגע</div>';
      return;
    }

    active.forEach(([roomId, party]) => {
      const memberCount = Object.values(party.members || {}).filter(m => m.online).length;
      const div = document.createElement('div');
      div.className = 'wp-admin-room';
      div.innerHTML = `
        <div class="wp-admin-room-header">
          <span style="font-size:22px;">🎬</span>
          <div class="wp-admin-room-title">${party.movieTitle || 'ללא שם'}</div>
          <span class="wp-room-status ${party.state}">${
            party.state === 'playing' ? '▶ מתנגן' :
            party.state === 'paused'  ? '⏸ מושהה'  :
            party.state === 'waiting' ? '⏳ ממתין'  : party.state
          }</span>
        </div>
        <div class="small muted" style="margin-bottom:10px;">
          מארח: <strong>${party.hostName}</strong> •
          ${memberCount} משתתפים •
          חדר: ${roomId.slice(-6).toUpperCase()} •
          ${timeAgo(party.createdAt)}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <button class="btn btn-secondary" style="padding:7px 12px;font-size:12px;"
                  onclick="wpAdminJoin('${roomId}')">👁 הצטרף כאדמין</button>
          <button class="btn btn-secondary" style="padding:7px 12px;font-size:12px;"
                  onclick="wpAdminPause('${roomId}')">⏸ עצור</button>
          <button class="btn btn-danger" style="padding:7px 12px;font-size:12px;background:rgba(229,9,20,0.1);border:1px solid rgba(229,9,20,0.3);color:#ff7a83;"
                  onclick="wpAdminClose('${roomId}')">⏹ סגור חדר</button>
        </div>
        <div class="wp-admin-chat-log" id="wpChatLog_${roomId}">
          <div class="muted small">טוען צ'אט...</div>
        </div>
      `;
      list.appendChild(div);
      loadWpChatLog(roomId);
    });
  });
}

function loadWpChatLog(roomId) {
  const log = document.getElementById(`wpChatLog_${roomId}`);
  if (!log) return;

  onValue(ref(db, `watchParties/${roomId}/chat`), snap => {
    const msgs = snap.val() || {};
    log.innerHTML = '';
    const entries = Object.entries(msgs).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    if (entries.length === 0) {
      log.innerHTML = '<div class="wp-admin-msg" style="opacity:.5">אין הודעות עדיין</div>';
      return;
    }
    entries.forEach(([, msg]) => {
      const d = document.createElement('div');
      d.className = 'wp-admin-msg';
      const ts = new Date(msg.timestamp || 0).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      if (msg.type === 'system') {
        d.innerHTML = `<em style="color:var(--muted2);">${msg.text}</em><span class="ts">${ts}</span>`;
      } else {
        d.innerHTML = `<strong>${msg.senderName}:</strong> ${msg.text}<span class="ts">${ts}</span>`;
      }
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  });
}

// Admin actions
window.wpAdminJoin = async function(roomId) {
  // אדמין נכנס כמארח גם ללא הזמנה
  const snap = await get(ref(db, `watchParties/${roomId}`));
  const room = snap.val();
  if (!room) return;

  // הפעל watchparty modal - האדמין נכנס כ-host
  if (window.wpJoinParty) {
    window.wpJoinParty(roomId);
  } else {
    window.open(`../index.html#wp_${roomId}`, '_blank');
  }
};

window.wpAdminPause = async function(roomId) {
  await update(ref(db, `watchParties/${roomId}`), {
    state: 'paused', lastUpdated: Date.now()
  });
  await push(ref(db, `watchParties/${roomId}/chat`), {
    text: '⏸ האדמין עצר את הסרט', type: 'system', timestamp: Date.now()
  });
  showToast('החדר הושהה', 'info');
};

window.wpAdminClose = async function(roomId) {
  if (!confirm('לסגור את החדר לכולם?')) return;
  await update(ref(db, `watchParties/${roomId}`), {
    state: 'ended', lastUpdated: Date.now()
  });
  await push(ref(db, `watchParties/${roomId}/chat`), {
    text: '⏹ האדמין סגר את החדר', type: 'system', timestamp: Date.now()
  });
  showToast('החדר נסגר', 'info');
};

// ── Init ────────────────────────────────────────────────────
loadBroadcastHistory();
loadWatchParties();
