const { ipcRenderer } = require('electron');
const { initThemeSync } = require('./theme-sync');

const closeBtn = document.getElementById('closeBtn');
const screenTabBtn = document.getElementById('screenTabBtn');
const mcpTabBtn = document.getElementById('mcpTabBtn');
const screenTabPanel = document.getElementById('screenTabPanel');
const mcpTabPanel = document.getElementById('mcpTabPanel');
const decreaseCountBtn = document.getElementById('decreaseCountBtn');
const increaseCountBtn = document.getElementById('increaseCountBtn');
const paneCountValue = document.getElementById('paneCountValue');
const summaryPaneCount = document.getElementById('summaryPaneCount');
const summaryLayoutMode = document.getElementById('summaryLayoutMode');
const previewCaption = document.getElementById('previewCaption');
const layoutPreview = document.getElementById('layoutPreview');
const paneList = document.getElementById('paneList');
const settingsStatus = document.getElementById('settingsStatus');
const applyBtn = document.getElementById('applyBtn');
const mcpWriteToolsToggle = document.getElementById('mcpWriteToolsToggle');
const mcpWriteToolsHint = document.getElementById('mcpWriteToolsHint');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));

const PREVIEW_GAP = 8;

initThemeSync();

let activeTab = 'screen';
let appliedState = null;
let draftState = {
  paneCount: 2,
  layoutMode: 'grid',
  panes: [],
  mcpWriteToolsEnabled: false,
  mcpWriteToolsEffective: false,
  mcpWriteToolsForcedByEnv: false,
};

function closeSettingsModal() {
  ipcRenderer.invoke('close-settings-modal').catch((error) => {
    console.error('Failed to close settings modal:', error);
  });
}

function setStatus(message, isError = false) {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle('error', isError);
}

function normalizeLayoutLabel(layoutMode) {
  if (layoutMode === 'columns') {
    return 'Columns';
  }

  if (layoutMode === 'rows') {
    return 'Rows';
  }

  return 'Grid';
}

function computePreviewFrames(count, layoutMode, width, height) {
  if (count <= 0) {
    return [];
  }

  let rows = 1;
  let columns = 1;

  if (layoutMode === 'columns') {
    columns = count;
  } else if (layoutMode === 'rows') {
    rows = count;
  } else {
    columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    rows = Math.max(1, Math.ceil(count / columns));
  }

  const totalHorizontalGap = PREVIEW_GAP * Math.max(columns - 1, 0);
  const totalVerticalGap = PREVIEW_GAP * Math.max(rows - 1, 0);
  const cellWidth = Math.max((width - totalHorizontalGap) / columns, 0);
  const cellHeight = Math.max((height - totalVerticalGap) / rows, 0);
  const frames = [];

  for (let index = 0; index < count; index += 1) {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;

    frames.push({
      left: columnIndex * (cellWidth + PREVIEW_GAP),
      top: rowIndex * (cellHeight + PREVIEW_GAP),
      width: cellWidth,
      height: cellHeight,
    });
  }

  return frames;
}

function buildDraftPanes() {
  const draftPanes = [];

  for (let index = 0; index < draftState.paneCount; index += 1) {
    const existingPane = draftState.panes[index];
    if (existingPane) {
      draftPanes.push(existingPane);
      continue;
    }

    draftPanes.push({
      id: `new-pane-${index + 1}`,
      providerName: index === 1 ? 'Gemini' : 'ChatGPT',
    });
  }

  return draftPanes;
}

function renderModeButtons() {
  modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.layoutMode === draftState.layoutMode);
  });
}

function renderSummary() {
  paneCountValue.textContent = String(draftState.paneCount);
  summaryPaneCount.textContent = String(draftState.paneCount);
  summaryLayoutMode.textContent = normalizeLayoutLabel(draftState.layoutMode);
  previewCaption.textContent = `${normalizeLayoutLabel(draftState.layoutMode)} preview`;
}

function renderPreview() {
  layoutPreview.innerHTML = '';

  const previewWidth = Math.max(layoutPreview.clientWidth - 24, 0);
  const previewHeight = Math.max(layoutPreview.clientHeight - 24, 0);
  const frames = computePreviewFrames(
    draftState.paneCount,
    draftState.layoutMode,
    previewWidth,
    previewHeight
  );

  frames.forEach((frame, index) => {
    const paneNode = document.createElement('div');
    paneNode.className = 'preview-pane';
    paneNode.textContent = `Pane ${index + 1}`;
    paneNode.style.left = `${frame.left + 12}px`;
    paneNode.style.top = `${frame.top + 12}px`;
    paneNode.style.width = `${Math.max(frame.width, 0)}px`;
    paneNode.style.height = `${Math.max(frame.height, 0)}px`;
    layoutPreview.appendChild(paneNode);
  });
}

function renderPaneList() {
  paneList.innerHTML = '';

  buildDraftPanes().forEach((pane, index) => {
    const paneNode = document.createElement('div');
    paneNode.className = 'pane-item';
    paneNode.innerHTML = `
      <strong>Pane ${index + 1}</strong>
      <span>${pane.providerName || pane.providerKey || 'ChatGPT'}</span>
      <span>${pane.id}</span>
    `;
    paneList.appendChild(paneNode);
  });
}

function renderMcpSettings() {
  if (!mcpWriteToolsToggle || !mcpWriteToolsHint) {
    return;
  }

  mcpWriteToolsToggle.checked = Boolean(draftState.mcpWriteToolsEnabled);

  if (draftState.mcpWriteToolsForcedByEnv) {
    mcpWriteToolsHint.textContent = 'Effective mode: write enabled by environment override. Normal exe launches will use the saved toggle.';
    return;
  }

  mcpWriteToolsHint.textContent = draftState.mcpWriteToolsEffective
    ? 'Effective mode: read-write. This setting will persist for normal app launches.'
    : 'Effective mode: read-only. Enable this only if you trust connected MCP clients.';
}

function hasPendingChanges() {
  if (!appliedState) {
    return true;
  }

  return (
    draftState.paneCount !== appliedState.paneCount ||
    draftState.layoutMode !== appliedState.layoutMode ||
    draftState.mcpWriteToolsEnabled !== appliedState.mcpWriteToolsEnabled
  );
}

function renderApplyState() {
  applyBtn.disabled = false;
  if (hasPendingChanges()) {
    setStatus('Settings changes are ready to apply.');
  } else {
    setStatus('No pending settings changes.');
  }
}

function syncActiveTab() {
  const showScreen = activeTab === 'screen';
  screenTabBtn.classList.toggle('active', showScreen);
  screenTabPanel.classList.toggle('active', showScreen);
  mcpTabBtn.classList.toggle('active', !showScreen);
  mcpTabPanel.classList.toggle('active', !showScreen);
}

function renderSettings() {
  syncActiveTab();
  renderModeButtons();
  renderSummary();
  renderPaneList();
  renderMcpSettings();
  if (activeTab === 'screen') {
    renderPreview();
  }
  renderApplyState();
}

function setActiveTab(nextTab) {
  activeTab = nextTab === 'mcp' ? 'mcp' : 'screen';
  renderSettings();
}

function syncDraftState(nextState) {
  const integrationState = nextState?.integrations || {};
  appliedState = {
    ...nextState,
    mcpWriteToolsEnabled: Boolean(integrationState.mcpWriteToolsEnabled),
    mcpWriteToolsEffective: Boolean(integrationState.mcpWriteToolsEffective),
    mcpWriteToolsForcedByEnv: Boolean(integrationState.mcpWriteToolsForcedByEnv),
  };
  draftState = {
    paneCount: nextState?.paneCount || 2,
    layoutMode: nextState?.layoutMode || 'grid',
    panes: nextState?.panes || [],
    mcpWriteToolsEnabled: appliedState.mcpWriteToolsEnabled,
    mcpWriteToolsEffective: appliedState.mcpWriteToolsEffective,
    mcpWriteToolsForcedByEnv: appliedState.mcpWriteToolsForcedByEnv,
  };
}

async function loadSettingsState() {
  try {
    const nextState = await ipcRenderer.invoke('get-settings-state');
    syncDraftState(nextState);
    setStatus('Ready');
    renderSettings();
  } catch (error) {
    console.error('Failed to load settings state:', error);
    setStatus('Failed to load settings.', true);
  }
}

async function applySettings() {
  applyBtn.disabled = true;
  setStatus('Applying settings...');

  try {
    const nextState = await ipcRenderer.invoke('apply-settings-layout', {
      paneCount: draftState.paneCount,
      layoutMode: draftState.layoutMode,
      mcpWriteToolsEnabled: draftState.mcpWriteToolsEnabled,
    });

    if (!nextState) {
      setStatus('Failed to apply settings.', true);
      return;
    }

    syncDraftState(nextState);
    setStatus('Settings applied.');
    renderSettings();
  } catch (error) {
    console.error('Failed to apply settings:', error);
    setStatus('Failed to apply settings.', true);
  } finally {
    applyBtn.disabled = false;
  }
}

function adjustPaneCount(delta) {
  draftState.paneCount = Math.max(1, draftState.paneCount + delta);
  renderSettings();
}

function setLayoutMode(layoutMode) {
  draftState.layoutMode = layoutMode;
  renderSettings();
}

function setMcpWriteToolsEnabled(nextEnabled) {
  draftState.mcpWriteToolsEnabled = Boolean(nextEnabled);
  draftState.mcpWriteToolsEffective = draftState.mcpWriteToolsForcedByEnv
    ? appliedState?.mcpWriteToolsEffective === true
    : draftState.mcpWriteToolsEnabled;
  renderSettings();
}

closeBtn.addEventListener('click', closeSettingsModal);
screenTabBtn.addEventListener('click', () => setActiveTab('screen'));
mcpTabBtn.addEventListener('click', () => setActiveTab('mcp'));
decreaseCountBtn.addEventListener('click', () => adjustPaneCount(-1));
increaseCountBtn.addEventListener('click', () => adjustPaneCount(1));
applyBtn.addEventListener('click', applySettings);
mcpWriteToolsToggle.addEventListener('change', (event) => {
  setMcpWriteToolsEnabled(event.target.checked);
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setLayoutMode(button.dataset.layoutMode);
  });
});

window.addEventListener('resize', () => {
  if (activeTab === 'screen') {
    renderPreview();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettingsModal();
  }
});

loadSettingsState();
