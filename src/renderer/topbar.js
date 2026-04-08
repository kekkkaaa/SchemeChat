const { ipcRenderer } = require('electron');

const settingsBtn = document.getElementById('settingsBtn');
const discussionConsoleBtn = document.getElementById('discussionConsoleBtn');

discussionConsoleBtn.addEventListener('click', () => {
  ipcRenderer.invoke('set-discussion-console-expanded', true).catch((error) => {
    console.error('Failed to open discussion console:', error);
  });
});

ipcRenderer.on('discussion-console-expanded-changed', (event, nextExpanded) => {
  discussionConsoleBtn.classList.toggle('is-active', Boolean(nextExpanded));
});

settingsBtn.addEventListener('click', () => {
  ipcRenderer.invoke('open-settings-modal').catch((error) => {
    console.error('Failed to open settings modal:', error);
  });
});
