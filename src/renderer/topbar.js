const { ipcRenderer } = require('electron');

const settingsBtn = document.getElementById('settingsBtn');

settingsBtn.addEventListener('click', () => {
  ipcRenderer.invoke('open-settings-modal').catch((error) => {
    console.error('Failed to open settings modal:', error);
  });
});
