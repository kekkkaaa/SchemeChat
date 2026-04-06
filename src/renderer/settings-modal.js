const { ipcRenderer } = require('electron');

const closeBtn = document.getElementById('closeBtn');
const screenTabBtn = document.getElementById('screenTabBtn');
const screenTabPanel = document.getElementById('screenTabPanel');
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
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));

const PREVIEW_GAP = 8;

let appliedState = null;
let draftState = {
  paneCount: 2,
  layoutMode: 'grid',
  panes: [],
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

function hasPendingChanges() {
  if (!appliedState) {
    return true;
  }

  return (
    draftState.paneCount !== appliedState.paneCount ||
    draftState.layoutMode !== appliedState.layoutMode
  );
}

function renderApplyState() {
  applyBtn.disabled = false;
  if (hasPendingChanges()) {
    setStatus('Layout changes are ready to apply.');
  } else {
    setStatus('No pending layout changes.');
  }
}

function renderScreenPanel() {
  screenTabBtn.classList.add('active');
  screenTabPanel.classList.add('active');
  renderModeButtons();
  renderSummary();
  renderPreview();
  renderPaneList();
  renderApplyState();
}

function syncDraftState(nextState) {
  appliedState = nextState;
  draftState = {
    paneCount: nextState?.paneCount || 2,
    layoutMode: nextState?.layoutMode || 'grid',
    panes: nextState?.panes || [],
  };
}

async function loadSettingsState() {
  try {
    const nextState = await ipcRenderer.invoke('get-settings-state');
    syncDraftState(nextState);
    setStatus('Ready');
    renderScreenPanel();
  } catch (error) {
    console.error('Failed to load settings state:', error);
    setStatus('Failed to load settings.', true);
  }
}

async function applySettings() {
  applyBtn.disabled = true;
  setStatus('Applying layout...');

  try {
    const nextState = await ipcRenderer.invoke('apply-settings-layout', {
      paneCount: draftState.paneCount,
      layoutMode: draftState.layoutMode,
    });

    if (!nextState) {
      setStatus('Failed to apply layout.', true);
      return;
    }

    syncDraftState(nextState);
    setStatus('Layout applied.');
    renderScreenPanel();
  } catch (error) {
    console.error('Failed to apply layout:', error);
    setStatus('Failed to apply layout.', true);
  } finally {
    applyBtn.disabled = false;
  }
}

function adjustPaneCount(delta) {
  draftState.paneCount = Math.max(1, draftState.paneCount + delta);
  renderScreenPanel();
}

function setLayoutMode(layoutMode) {
  draftState.layoutMode = layoutMode;
  renderScreenPanel();
}

closeBtn.addEventListener('click', closeSettingsModal);
screenTabBtn.addEventListener('click', renderScreenPanel);
decreaseCountBtn.addEventListener('click', () => adjustPaneCount(-1));
increaseCountBtn.addEventListener('click', () => adjustPaneCount(1));
applyBtn.addEventListener('click', applySettings);

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setLayoutMode(button.dataset.layoutMode);
  });
});

window.addEventListener('resize', () => {
  renderPreview();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettingsModal();
  }
});

loadSettingsState();
