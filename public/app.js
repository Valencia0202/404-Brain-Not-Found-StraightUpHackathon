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
    if (selectedMode === 'summarise') {
      uploadMode.value = 'summarise';
    } else {
      uploadMode.value = 'guide';
    }
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

// ── LOAD SETTINGS ──
async function loadSettings() {
  const response = await fetch('/settings');
  const data = await response.json();
  document.getElementById('language').value = data.settings.language || 'English';

  const hl = data.settings.hintLevel || '1';
  const pers = data.settings.personality || 'friendly';

  document.getElementById('hintLevel').value = hl;
  document.getElementById('personality').value = pers;
  document.getElementById('hintLevelSettings').value = hl;
  document.getElementById('personalitySettings').value = pers;
}

// ── CHAT SUBMIT ──
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  appendMessage('You', message);
  chatInput.value = '';

  const payload = {
    message,
    language: document.getElementById('language').value,
    hintLevel: document.getElementById('hintLevel').value,
    personality: document.getElementById('personality').value
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

// ── FILE UPLOAD ──
uploadInChatButton.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    appendMessage('System', 'Attach a file first using the 📎 button.');
    return;
  }

  appendMessage('You', `Uploaded file: ${file.name}`);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', document.getElementById('upload-mode').value);

  try {
    const response = await fetch('/upload', { method: 'POST', body: formData });
    const data = await response.json();
    appendMessage('Tutor', data.reply || data.error || 'No output from upload endpoint.');
  } catch (err) {
    appendMessage('System', 'Upload failed.');
  }

  fileInput.value = '';
});

// ── SETTINGS SAVE ──
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  settingsStatus.textContent = 'Saving...';

  const hl = document.getElementById('hintLevelSettings').value;
  const pers = document.getElementById('personalitySettings').value;

  const payload = {
    language: document.getElementById('language').value,
    hintLevel: hl,
    personality: pers,
    sampleMessage: ''
  };

  try {
    const response = await fetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    settingsStatus.textContent = data.message || 'Saved.';

    // Sync chat panel dropdowns
    document.getElementById('hintLevel').value = hl;
    document.getElementById('personality').value = pers;
  } catch (err) {
    settingsStatus.textContent = 'Failed to save.';
  }
});

// ── DASHBOARD ──
function renderDashboard(data) {
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
          <tr style="border-bottom:1px solid var(--border-li
