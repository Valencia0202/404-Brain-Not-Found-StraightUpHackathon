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

let dashboardTimer = null;

function switchPanel(panelId) {
  const panelExists = Array.from(panels).some((panel) => panel.id === panelId);
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

function appendMessage(role, text) {
  const line = document.createElement('div');
  line.className = 'msg';
  line.innerHTML = `<b>${role}:</b> ${text}`;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function loadSettings() {
  const response = await fetch('/settings');
  const data = await response.json();
  document.getElementById('language').value = data.settings.language || 'English';
  document.getElementById('hintLevel').value = data.settings.hintLevel || '1';
  document.getElementById('personality').value = data.settings.personality || 'friendly';
}

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
});

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

  const response = await fetch('/upload', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  appendMessage('Tutor', data.reply || data.error || 'No output from upload endpoint.');
  fileInput.value = '';
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  settingsStatus.textContent = 'Saving...';

  const payload = {
    language: document.getElementById('language').value,
    hintLevel: document.getElementById('hintLevel').value,
    personality: document.getElementById('personality').value,
    sampleMessage: chatInput.value || ''
  };

  const response = await fetch('/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  settingsStatus.textContent = data.message || 'Saved.';
});

function renderDashboard(data) {
  dashboardSummary.textContent = `Total users: ${data.totalUsers}`;
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

async function pollDashboard() {
  const response = await fetch('/dashboard-data');
  const data = await response.json();
  renderDashboard(data);
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

loadSettings();
const initialPanel = window.location.hash.replace('#', '') || 'chat-panel';
switchPanel(initialPanel);

window.addEventListener('hashchange', () => {
  const panelFromHash = window.location.hash.replace('#', '') || 'chat-panel';
  switchPanel(panelFromHash);
});
