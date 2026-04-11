const { ipcRenderer } = require('electron');

const settingsBtn = document.getElementById('settingsBtn');
const discussionConsoleBtn = document.getElementById('discussionConsoleBtn');
const codexHelpBtn = document.getElementById('codexHelpBtn');

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
