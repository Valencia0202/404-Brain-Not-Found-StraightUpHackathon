const navButtons = document.querySelectorAll('.nav-btn');
const panels = document.querySelectorAll('.panel');
const chatLog = document.getElementById('chat-log');
const chatMeta = document.getElementById('chat-meta');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const dashboardSummary = document.getElementById('dashboard-summary');
const dashboardUsers = document.getElementById('dashboard-users');
const fileInput = document.getElementById('file-input');
const uploadInChatButton = document.getElementById('upload-in-chat');
const modeCards = document.querySelectorAll('.mode-card');

let dashboardTimer = null;
let selectedMode = 'study';

// ── PANEL SWITCHING ──
function switchPanel(panelId) {
  const panelExists = Array.from(panels).some((p) => p.id === panelId);
  const resolvedPanelId = panelExists ? panelId : 'chat-panel';

  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === resolvedPanelId));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === resolvedPanelId));

  if (resolvedPanelId === 'progress-panel' || resolvedPanelId === 'stats-panel') {
    startDashboardPolling();
  } else {
    stopDashboardPolling();
  }

  if (window.location.hash !== `#${resolvedPanelId}`) {
    window.location.hash = resolvedPanelId;
  }
}

navButtons.forEach((btn) =>
  btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
);

// ── MODE CARDS ──
modeCards.forEach((card) => {
  card.addEventListener('click', () => {
    modeCards.forEach((c) => c.classList.remove('active-mode'));
    card.classList.add('active-mode');
    selectedMode = card.dataset.mode;
    const uploadMode = document.getElementById('upload-mode');
    if (uploadMode) uploadMode.value = selectedMode === 'summarise' ? 'summarise' : 'guide';
  });
});

// ── MESSAGES ──
function appendMessage(role, text) {
  const line = document.createElement('div');
  line.className = 'msg';
  line.innerHTML = `<b>${role}:</b> ${text}`;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Safe helpers — won't crash if element is missing
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
  } catch (err) {
    // server not ready, skip silently
  }
}

// ── CHAT SUBMIT ──
if (chatForm) {
  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage('You', message);
    chatInput.value = '';

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
      appendMessage('Tutor', data.reply || 'No response.');

      if (data.meta) {
        chatMeta.textContent = `intent: ${data.meta.intent} | profile: ${data.meta.profile} | policy: ${data.meta.policyMode} | language: ${data.meta.responseLanguage}`;
      }
    } catch (err) {
      appendMessage('System', 'Error contacting server.');
    }
  });
}

// ── FILE UPLOAD ──
if (uploadInChatButton) {
  uploadInChatButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      appendMessage('System', 'Attach a file first using the 📎 button.');
      return;
    }

    appendMessage('You', `Uploaded file: ${file.name}`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', val('upload-mode'));

    try {
      const response = await fetch('/upload', { method: 'POST', body: formData });
      const data = await response.json();
      appendMessage('Tutor', data.reply || data.error || 'No output from upload endpoint.');
    } catch (err) {
      appendMessage('System', 'Upload failed.');
    }

    fileInput.value = '';
  });
}

// ── SETTINGS SAVE ──
if (settingsForm) {
  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (settingsStatus) settingsStatus.textContent = 'Saving...';

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
      if (settingsStatus) settingsStatus.textContent = data.message || 'Saved.';

      // keep chat panel dropdowns in sync
      setVal('hintLevel', hl);
      setVal('personality', pers);
    } catch (err) {
      if (settingsStatus) settingsStatus.textContent = 'Failed to save.';
    }
  });
}

// ── DASHBOARD ──
function renderDashboard(data) {
  if (dashboardSummary) {
    dashboardSummary.innerHTML = `
      <strong>Total users: ${data.totalUsers}</strong>
      <table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:0.85rem">
        <thead>
          <tr style="color:var(--text-muted);text-align:left;border-bottom:1px solid var(--border)">
            <th style="padding:8px">User</th>
            <th style="padding:8px">Profile</th>
            <th style="padding:8px">Intent</th>
            <th style="padding:8px">Policy</th>
            <th style="padding:8px">Attempts</th>
            <th style="padding:8px">Hints</th>
            <th style="padding:8px">Follow-ups</th>
          </tr>
        </thead>
        <tbody>
          ${data.users.map((u) => `
            <tr style="border-bottom:1px solid var(--border-light)">
              <td style="padding:8px">${u.userId}</td>
              <td style="padding:8px">${u.profile}</td>
              <td style="padding:8px">${u.intent}</td>
              <td style="padding:8px">${u.policyMode}</td>
              <td style="padding:8px">${u.attempts}</td>
              <td style="padding:8px">${u.hintRequests}</td>
              <td style="padding:8px">${u.followUpDepth}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  if (dashboardUsers) {
    dashboardUsers.innerHTML = '';
    data.users.forEach((user) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <strong>${user.userId}</strong>
        <div>Profile: ${user.profile}</div>
        <div>Intent: ${user.intent}</div>
        <div>Policy: ${user.policyMode}</div>
        <div>Attempts: ${user.attempts}</div>
        <div>Hint requests: ${user.hintRequests}</div>
        <div>Follow-up depth: ${user.followUpDepth}</div>
      `;
      dashboardUsers.appendChild(card);
    });
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
