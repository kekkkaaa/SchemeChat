const { ipcRenderer } = require('electron');
const { initThemeSync } = require('./theme-sync');

const settingsBtn = document.getElementById('settingsBtn');
const discussionConsoleBtn = document.getElementById('discussionConsoleBtn');
const codexHelpBtn = document.getElementById('codexHelpBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

let currentThemeMode = 'light';

function syncThemeToggle(themeState) {
  currentThemeMode = themeState?.mode === 'dark' ? 'dark' : 'light';
  const nextModeLabel = currentThemeMode === 'dark' ? '白天模式' : '夜间模式';

  themeToggleBtn.dataset.themeMode = currentThemeMode;
  themeToggleBtn.setAttribute('aria-checked', String(currentThemeMode === 'dark'));
  themeToggleBtn.setAttribute('aria-label', `切换到${nextModeLabel}`);
  themeToggleBtn.setAttribute('title', `切换到${nextModeLabel}`);
}

const themeSync = initThemeSync({
  onChange: syncThemeToggle,
});

themeToggleBtn.addEventListener('click', () => {
  const nextMode = currentThemeMode === 'dark' ? 'light' : 'dark';
  themeSync.setThemeMode(nextMode).catch((error) => {
    console.error('Failed to toggle theme mode:', error);
  });
});

// ─── 工作台 ───
discussionConsoleBtn.addEventListener('click', () => {
  ipcRenderer.invoke('set-discussion-console-expanded', true).catch((error) => {
    console.error('Failed to open discussion console:', error);
  });
});

ipcRenderer.on('discussion-console-expanded-changed', (event, nextExpanded) => {
  discussionConsoleBtn.classList.toggle('is-active', Boolean(nextExpanded));
});

// ─── 设置 ───
settingsBtn.addEventListener('click', () => {
  ipcRenderer.invoke('open-settings-modal').catch((error) => {
    console.error('Failed to open settings modal:', error);
  });
});

// ─── 接入帮助（弹独立 BrowserWindow，与 settings-modal 同一套机制）───
codexHelpBtn.addEventListener('click', () => {
  ipcRenderer.invoke('open-help-modal').catch((error) => {
    console.error('Failed to open help modal:', error);
  });
});
