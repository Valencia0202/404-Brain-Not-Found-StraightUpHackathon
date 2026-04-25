const navButtons = document.querySelectorAll('.nav-btn');
const panels = document.querySelectorAll('.panel');
const chatLog = document.getElementById('chat-log');
const chatMeta = document.getElementById('chat-meta');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const fileInput = document.getElementById('file-input');
const uploadInChatButton = document.getElementById('upload-in-chat');
const modeCards = document.querySelectorAll('.mode-card');
const expandBtn = document.getElementById('expand-btn');
const chatPanel = document.getElementById('chat-panel');

let dashboardTimer = null;
let selectedMode = 'study';
let isExpanded = false;

// ── PANEL SWITCHING ──
function switchPanel(panelId) {
  const panelExists = Array.from(panels).some(p => p.id === panelId);
  const resolvedPanelId = panelExists ? panelId : 'chat-panel';

  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.panel === resolvedPanelId));
  panels.forEach(panel => panel.classList.toggle('active', panel.id === resolvedPanelId));

  if (resolvedPanelId === 'progress-panel' || resolvedPanelId === 'stats-panel') {
    startDashboardPolling();
  } else {
    stopDashboardPolling();
  }

  if (window.location.hash !== `#${resolvedPanelId}`) {
    window.location.hash = resolvedPanelId;
  }
}

navButtons.forEach(btn =>
  btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
);

// ── MODE CARDS ──
modeCards.forEach(card => {
  card.addEventListener('click', () => {
    modeCards.forEach(c => c.classList.remove('active-mode'));
    card.classList.add('active-mode');
    selectedMode = card.dataset.mode;
    const uploadMode = document.getElementById('upload-mode');
    if (uploadMode) uploadMode.value = selectedMode === 'summarise' ? 'summarise' : 'guide';
  });
});

// ── EXPAND / COLLAPSE CHAT ──
if (expandBtn) {
  expandBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    chatPanel.classList.toggle('chat-expanded', isExpanded);
    expandBtn.textContent = isExpanded ? '⤡' : '⤢';
    expandBtn.title = isExpanded ? 'Exit full screen' : 'Expand chat to full screen';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isExpanded) {
      isExpanded = false;
      chatPanel.classList.remove('chat-expanded');
      expandBtn.textContent = '⤢';
      expandBtn.title = 'Expand chat to full screen';
    }
  });
}

// ── MESSAGE RENDERING ──
function appendMessage(role, text) {
  const isUser = role === 'You';
  const rowClass = isUser ? 'user' : 'ai';
  const avatarEmoji = isUser ? '🧑' : '🧠';

  const row = document.createElement('div');
  row.className = `msg-row ${rowClass}`;
  row.innerHTML = `
    <div class="msg-avatar">${avatarEmoji}</div>
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;

  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function showTyping() {
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="msg-avatar">🧠</div>
    <div class="msg-bubble">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-row');
  if (el) el.remove();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ── HELPERS ──
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

// ── LOAD SETTINGS ──
async function loadSettings() {
  try {
    const response = await fetch('/settings');
    const data = await response.json();
    const hl = data.settings.hintLevel || '1';
    const pers = data.settings.personality || 'friendly';
    const lang = data.settings.language || 'English';

    setVal('language', lang);
    setVal('hintLevel', hl);
    setVal('personality', pers);
    setVal('hintLevelSettings', hl);
    setVal('personalitySettings', pers);
  } catch (err) {}
}

// ── CHAT SUBMIT ──
if (chatForm) {
  chatForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage('You', message);
    chatInput.value = '';
    showTyping();

    const payload = {
      message,
      language: val('language'),
      hintLevel: val('hintLevel'),
      personality: val('personality')
    };

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      removeTyping();
      appendMessage('Tutor', data.reply || 'No response.');
    } catch (err) {
      removeTyping();
      appendMessage('System', 'Could not reach the server. Please try again.');
    }
  });
}

// ── FILE UPLOAD ──
if (uploadInChatButton) {
  uploadInChatButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      appendMessage('System', 'Please attach a file first using the 📎 button.');
      return;
    }

    appendMessage('You', `Uploaded file: ${file.name}`);
    showTyping();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', val('upload-mode'));

    try {
      const response = await fetch('/upload', { method: 'POST', body: formData });
      const data = await response.json();
      removeTyping();
      appendMessage('Tutor', data.reply || data.error || 'No output from upload.');
    } catch (err) {
      removeTyping();
      appendMessage('System', 'Upload failed. Please try again.');
    }

    fileInput.value = '';
  });
}

// ── SETTINGS SAVE ──
if (settingsForm) {
  settingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (settingsStatus) {
      settingsStatus.textContent = 'Saving…';
      settingsStatus.className = 'small';
    }

    const hl = val('hintLevelSettings');
    const pers = val('personalitySettings');
    const lang = val('language');
    const payload = { language: lang, hintLevel: hl, personality: pers, sampleMessage: '' };

    try {
      const response = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      settingsStatus.textContent = '✓ ' + (data.message || 'Settings saved!');
      settingsStatus.className = 'status-msg success';

      setVal('hintLevel', hl);
      setVal('personality', pers);
    } catch (err) {
      settingsStatus.textContent = 'Could not save. Please try again.';
      settingsStatus.className = 'status-msg error';
    }
  });
}

// ── DASHBOARD RENDERING ──
function labelForProfile(profile) {
  const map = { novice: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
  return map[profile] || profile || 'Learner';
}

function labelForMode(mode) {
  const map = {
    study: 'Study Help', coding: 'Coding Help', essay: 'Essay Help',
    summarise: 'Summarise', quiz: 'Quiz Mode'
  };
  return map[mode] || mode || '—';
}

function renderDashboard(data) {
  const summaryRow = document.getElementById('stats-summary-row');
  const usersGrid = document.getElementById('dashboard-users');

  if (summaryRow) {
    summaryRow.innerHTML = `
      <div class="stat-tile">
        <div class="stat-tile-value">${data.totalUsers}</div>
        <div class="stat-tile-label">Active Learners</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-value">${data.users.reduce((a, u) => a + (u.attempts || 0), 0)}</div>
        <div class="stat-tile-label">Total Attempts</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-value">${data.users.reduce((a, u) => a + (u.hintRequests || 0), 0)}</div>
        <div class="stat-tile-label">Hints Asked</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-value">${data.users.reduce((a, u) => a + (u.followUpDepth || 0), 0)}</div>
        <div class="stat-tile-label">Follow-up Questions</div>
      </div>
    `;
  }

  if (usersGrid) {
    if (data.users.length === 0) {
      usersGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon">🏅</div>
          <div class="empty-state-title">No learners yet</div>
          <p>Stats will appear once students start chatting.</p>
        </div>`;
      return;
    }

    usersGrid.innerHTML = '';
    data.users.forEach(user => {
      const maxAttempts = Math.max(...data.users.map(u => u.attempts || 1), 1);
      const pct = Math.round(((user.attempts || 0) / maxAttempts) * 100);

      const card = document.createElement('div');
      card.className = 'learner-card';
      card.innerHTML = `
        <div class="learner-card-name">
          👤 ${user.userId}
          <span class="learner-badge">${labelForProfile(user.profile)}</span>
        </div>
        <div class="learner-stat-row">
          <span>Current topic</span>
          <span>${labelForMode(user.intent)}</span>
        </div>
        <div class="learner-stat-row">
          <span>Attempts</span>
          <span>${user.attempts || 0}</span>
        </div>
        <div class="mini-bar-wrap">
          <div class="mini-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="learner-stat-row">
          <span>Hints asked</span>
          <span>${user.hintRequests || 0}</span>
        </div>
        <div class="learner-stat-row">
          <span>Follow-up questions</span>
          <span>${user.followUpDepth || 0}</span>
        </div>
      `;
      usersGrid.appendChild(card);
    });
  }

  // PROGRESS panel
  const tableContainer = document.getElementById('progress-table-container');
  if (tableContainer) {
    if (data.users.length === 0) {
      tableContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No learner data yet</div>
          <p>Progress will appear here once students start chatting.</p>
        </div>`;
      return;
    }

    tableContainer.innerHTML = `
      <table class="progress-table">
        <thead>
          <tr>
            <th>Learner</th>
            <th>Level</th>
            <th>Current topic</th>
            <th>Attempts</th>
            <th>Hints asked</th>
            <th>Follow-ups</th>
          </tr>
        </thead>
        <tbody>
          ${data.users.map(u => `
            <tr>
              <td>${u.userId}</td>
              <td><span class="mode-chip">${labelForProfile(u.profile)}</span></td>
              <td>${labelForMode(u.intent)}</td>
              <td>${u.attempts || 0}</td>
              <td>${u.hintRequests || 0}</td>
              <td>${u.followUpDepth || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

async function pollDashboard() {
  try {
    const response = await fetch('/dashboard-data');
    const data = await response.json();
    renderDashboard(data);
  } catch (err) {}
}

function startDashboardPolling() {
  if (dashboardTimer) return;
  pollDashboard();
  dashboardTimer = setInterval(pollDashboard, 2000);
}

function stopDashboardPolling() {
  if (!dashboardTimer) return;
  clearInterval(dashboardTimer);
  dashboardTimer = null;
}

// ── INIT ──
loadSettings();
const initialPanel = window.location.hash.replace('#', '') || 'chat-panel';
switchPanel(initialPanel);

window.addEventListener('hashchange', () => {
  const panelFromHash = window.location.hash.replace('#', '') || 'chat-panel';
  switchPanel(panelFromHash);
});
