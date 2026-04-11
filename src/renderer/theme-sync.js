const { ipcRenderer } = require('electron');

function normalizeThemeMode(mode) {
  return mode === 'dark' ? 'dark' : 'light';
}

function normalizeThemeState(rawState = {}) {
  const mode = normalizeThemeMode(rawState?.mode);
  return {
    mode,
    isDark: mode === 'dark',
  };
}

function applyThemeState(rawState) {
  const themeState = normalizeThemeState(rawState);
  document.documentElement.dataset.theme = themeState.mode;
  document.body.dataset.theme = themeState.mode;
  return themeState;
}

function initThemeSync(options = {}) {
  const onChange = typeof options.onChange === 'function'
    ? options.onChange
    : null;

  const handleThemeUpdate = (rawState) => {
    const themeState = applyThemeState(rawState);
    if (onChange) {
      onChange(themeState);
    }
    return themeState;
  };

  ipcRenderer.invoke('get-theme-state')
    .then((themeState) => {
      handleThemeUpdate(themeState);
    })
    .catch((error) => {
      console.error('Failed to load theme state:', error);
    });

  ipcRenderer.on('app-theme-updated', (event, themeState) => {
    handleThemeUpdate(themeState);
  });

  return {
    getThemeMode() {
      return normalizeThemeMode(document.documentElement.dataset.theme);
    },
    setThemeMode(mode) {
      return ipcRenderer.invoke('set-theme-mode', normalizeThemeMode(mode));
    },
  };
}

module.exports = {
  initThemeSync,
  normalizeThemeMode,
  normalizeThemeState,
};
