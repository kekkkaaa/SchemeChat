const { BaseWindow, BrowserWindow, WebContentsView, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const util = require('util');

const TOP_BAR_HEIGHT = 40;
const CONTROL_SURFACE_MARGIN = 20;
const CONTROL_LAUNCHER_WIDTH = 620;
const CONTROL_LAUNCHER_HEIGHT = 188;
const CONTROL_PANEL_DEFAULT_WIDTH = 1220;
const CONTROL_PANEL_DEFAULT_HEIGHT = 760;
const CONTROL_PANEL_MIN_WIDTH = 920;
const CONTROL_PANEL_MIN_HEIGHT = 620;
const PANE_GAP = 1;
const DEFAULT_LAYOUT_MODE = 'grid';
const LAYOUT_MODES = ['grid', 'columns', 'rows'];
const DEFAULT_SETTINGS_WINDOW_WIDTH = 900;
const DEFAULT_SETTINGS_WINDOW_HEIGHT = 620;
const SETTINGS_WINDOW_MIN_WIDTH = 760;
const SETTINGS_WINDOW_MIN_HEIGHT = 520;
const LAYOUT_CONFIG_PATH = path.join(__dirname, '../../config/window-layout.json');
const LEGACY_PROVIDER_CONFIG_PATH = path.join(__dirname, '../../config/window-providers.json');
const SETTINGS_WINDOW_CONFIG_PATH = path.join(__dirname, '../../config/settings-window.json');

function safeConsoleWrite(method, ...args) {
  const stream = method === 'error' ? process.stderr : process.stdout;
  if (!stream || stream.destroyed || stream.writable === false) {
    return;
  }

  try {
    stream.write(`${util.format(...args)}\n`);
  } catch (error) {
    if (error && error.code === 'EPIPE') {
      return;
    }
    throw error;
  }
}

function safeLog(...args) {
  safeConsoleWrite('log', ...args);
}

function safeError(...args) {
  safeConsoleWrite('error', ...args);
}

const PROVIDERS = {
  chatgpt: {
    url: 'https://chat.openai.com',
    preload: 'chatgpt-preload.js',
    name: 'ChatGPT',
    userAgent: null,
  },
  gemini: {
    url: 'https://gemini.google.com',
    preload: 'gemini-preload.js',
    name: 'Gemini',
    userAgent: null,
  },
  perplexity: {
    url: 'https://www.perplexity.ai',
    preload: 'perplexity-preload.js',
    name: 'Perplexity',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  claude: {
    url: 'https://claude.ai',
    preload: 'claude-preload.js',
    name: 'Claude',
    userAgent: null,
  },
  grok: {
    url: 'https://x.com/i/grok',
    preload: 'grok-preload.js',
    name: 'Grok',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  },
};

function normalizeProviderKey(providerKey, fallback) {
  return PROVIDERS[providerKey] ? providerKey : fallback;
}

function normalizeLayoutMode(layoutMode) {
  return LAYOUT_MODES.includes(layoutMode) ? layoutMode : DEFAULT_LAYOUT_MODE;
}

function getDefaultProviderForPane(index) {
  if (index === 0) {
    return 'chatgpt';
  }

  if (index === 1) {
    return 'gemini';
  }

  return 'chatgpt';
}

function ensureDirectory(filePath) {
  const configDir = path.dirname(filePath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    safeError(`Failed to parse JSON file: ${filePath}`, error);
    return null;
  }
}

function normalizePaneConfigs(rawPanes) {
  const normalized = [];
  const usedIds = new Set();

  const sourcePanes = Array.isArray(rawPanes) ? rawPanes : [];
  sourcePanes.forEach((rawPane, index) => {
    let id = typeof rawPane?.id === 'string' && rawPane.id.trim()
      ? rawPane.id.trim()
      : `pane-${index + 1}`;

    if (usedIds.has(id)) {
      id = `pane-${normalized.length + 1}`;
    }

    const providerKey = normalizeProviderKey(rawPane?.providerKey, getDefaultProviderForPane(index));
    usedIds.add(id);
    normalized.push({ id, providerKey });
  });

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    { id: 'pane-1', providerKey: 'chatgpt' },
    { id: 'pane-2', providerKey: 'gemini' },
  ];
}

function loadLegacyPaneConfigs() {
  const parsed = loadJsonFile(LEGACY_PROVIDER_CONFIG_PATH);
  if (!parsed) {
    return null;
  }

  const leftProvider = normalizeProviderKey(parsed.left || parsed.bottomLeft, 'chatgpt');
  const rightProvider = normalizeProviderKey(parsed.right || parsed.bottomRight, 'gemini');

  return [
    { id: 'pane-1', providerKey: leftProvider },
    { id: 'pane-2', providerKey: rightProvider },
  ];
}

function loadLayoutConfig() {
  const parsed = loadJsonFile(LAYOUT_CONFIG_PATH);
  if (parsed) {
    return {
      layoutMode: normalizeLayoutMode(parsed.layoutMode),
      panes: normalizePaneConfigs(parsed.panes),
    };
  }

  const legacyPanes = loadLegacyPaneConfigs();
  if (legacyPanes) {
    return {
      layoutMode: DEFAULT_LAYOUT_MODE,
      panes: normalizePaneConfigs(legacyPanes),
    };
  }

  return {
    layoutMode: DEFAULT_LAYOUT_MODE,
    panes: normalizePaneConfigs(null),
  };
}

function saveLayoutConfig(layoutState) {
  try {
    ensureDirectory(LAYOUT_CONFIG_PATH);
    fs.writeFileSync(
      LAYOUT_CONFIG_PATH,
      JSON.stringify(
        {
          paneCount: layoutState.panes.length,
          layoutMode: layoutState.layoutMode,
          panes: layoutState.panes,
        },
        null,
        2
      )
    );
  } catch (error) {
    safeError('Failed to save layout config:', error);
  }
}

function loadSettingsWindowConfig() {
  const parsed = loadJsonFile(SETTINGS_WINDOW_CONFIG_PATH);
  if (!parsed) {
    return {
      width: DEFAULT_SETTINGS_WINDOW_WIDTH,
      height: DEFAULT_SETTINGS_WINDOW_HEIGHT,
    };
  }

  const width = Number.parseInt(parsed.width, 10);
  const height = Number.parseInt(parsed.height, 10);

  return {
    width: Number.isFinite(width) ? Math.max(width, SETTINGS_WINDOW_MIN_WIDTH) : DEFAULT_SETTINGS_WINDOW_WIDTH,
    height: Number.isFinite(height) ? Math.max(height, SETTINGS_WINDOW_MIN_HEIGHT) : DEFAULT_SETTINGS_WINDOW_HEIGHT,
  };
}

function saveSettingsWindowConfig(bounds) {
  try {
    ensureDirectory(SETTINGS_WINDOW_CONFIG_PATH);
    fs.writeFileSync(
      SETTINGS_WINDOW_CONFIG_PATH,
      JSON.stringify(
        {
          width: Math.max(Math.floor(bounds.width), SETTINGS_WINDOW_MIN_WIDTH),
          height: Math.max(Math.floor(bounds.height), SETTINGS_WINDOW_MIN_HEIGHT),
        },
        null,
        2
      )
    );
  } catch (error) {
    safeError('Failed to save settings window config:', error);
  }
}

function createNextPaneId(panes) {
  let maxIndex = 0;

  panes.forEach((pane) => {
    const match = /^pane-(\d+)$/.exec(pane.id);
    if (match) {
      maxIndex = Math.max(maxIndex, Number.parseInt(match[1], 10) || 0);
    }
  });

  return `pane-${maxIndex + 1}`;
}

function createSegments(totalLength, count, gap) {
  if (count <= 0) {
    return [];
  }

  const totalGap = gap * Math.max(count - 1, 0);
  const usableLength = Math.max(totalLength - totalGap, 0);
  const baseLength = Math.floor(usableLength / count);
  let remainder = usableLength - baseLength * count;
  let cursor = 0;

  return Array.from({ length: count }, () => {
    const size = baseLength + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }

    const segment = {
      start: cursor,
      size,
    };

    cursor += size + gap;
    return segment;
  });
}

function computeGridDimensions(count) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));

  return { rows, columns };
}

function computeStandardPaneBounds(paneCount, layoutMode, contentBounds) {
  if (paneCount <= 0) {
    return [];
  }

  let rows = 1;
  let columns = 1;

  if (layoutMode === 'columns') {
    columns = paneCount;
  } else if (layoutMode === 'rows') {
    rows = paneCount;
  } else {
    const dimensions = computeGridDimensions(paneCount);
    rows = dimensions.rows;
    columns = dimensions.columns;
  }

  const columnSegments = createSegments(contentBounds.width, columns, PANE_GAP);
  const rowSegments = createSegments(contentBounds.height, rows, PANE_GAP);
  const bounds = [];

  for (let index = 0; index < paneCount; index += 1) {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;
    const column = columnSegments[columnIndex];
    const row = rowSegments[rowIndex];

    if (!column || !row) {
      bounds.push({
        x: contentBounds.x,
        y: contentBounds.y,
        width: 0,
        height: 0,
      });
      continue;
    }

    bounds.push({
      x: contentBounds.x + column.start,
      y: contentBounds.y + row.start,
      width: column.size,
      height: row.size,
    });
  }

  return bounds;
}

function computeSupersizedPaneBounds(paneStates, supersizedPaneId, contentBounds) {
  if (paneStates.length === 0) {
    return [];
  }

  if (paneStates.length === 1) {
    return [
      {
        x: contentBounds.x,
        y: contentBounds.y,
        width: contentBounds.width,
        height: contentBounds.height,
      },
    ];
  }

  const supersizedIndex = paneStates.findIndex((pane) => pane.id === supersizedPaneId);
  if (supersizedIndex === -1) {
    return computeStandardPaneBounds(paneStates.length, DEFAULT_LAYOUT_MODE, contentBounds);
  }

  const mainWidth = Math.max(Math.floor(contentBounds.width * 0.8), 0);
  const sideWidth = Math.max(contentBounds.width - mainWidth - PANE_GAP, 0);
  const sidePaneCount = paneStates.length - 1;
  const sideSegments = createSegments(contentBounds.height, sidePaneCount, PANE_GAP);
  const bounds = [];
  let sideIndex = 0;

  paneStates.forEach((pane) => {
    if (pane.id === supersizedPaneId) {
      bounds.push({
        x: contentBounds.x,
        y: contentBounds.y,
        width: mainWidth,
        height: contentBounds.height,
      });
      return;
    }

    const sideSegment = sideSegments[sideIndex] || { start: 0, size: 0 };
    sideIndex += 1;
    bounds.push({
      x: contentBounds.x + mainWidth + PANE_GAP,
      y: contentBounds.y + sideSegment.start,
      width: sideWidth,
      height: sideSegment.size,
    });
  });

  return bounds;
}

function computePaneBounds(paneStates, layoutMode, contentBounds, supersizedPaneId) {
  if (supersizedPaneId) {
    return computeSupersizedPaneBounds(paneStates, supersizedPaneId, contentBounds);
  }

  return computeStandardPaneBounds(paneStates.length, layoutMode, contentBounds);
}

function getLayoutModeLabel(layoutMode) {
  if (layoutMode === 'columns') {
    return 'Columns';
  }

  if (layoutMode === 'rows') {
    return 'Rows';
  }

  return 'Grid';
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getLauncherBounds(windowBounds) {
  const availableWidth = Math.max(windowBounds.width - CONTROL_SURFACE_MARGIN * 2, 0);
  const width = Math.max(
    Math.min(CONTROL_LAUNCHER_WIDTH, availableWidth),
    Math.min(420, availableWidth)
  );

  return {
    x: Math.max(CONTROL_SURFACE_MARGIN, windowBounds.width - width - CONTROL_SURFACE_MARGIN),
    y: Math.max(
      TOP_BAR_HEIGHT + 12,
      windowBounds.height - CONTROL_LAUNCHER_HEIGHT - CONTROL_SURFACE_MARGIN
    ),
    width,
    height: CONTROL_LAUNCHER_HEIGHT,
  };
}

function getPanelSize(windowBounds) {
  const availableWidth = Math.max(windowBounds.width - CONTROL_SURFACE_MARGIN * 2, 0);
  const availableHeight = Math.max(
    windowBounds.height - TOP_BAR_HEIGHT - CONTROL_SURFACE_MARGIN * 2,
    0
  );

  return {
    width: Math.max(
      Math.min(CONTROL_PANEL_DEFAULT_WIDTH, availableWidth),
      Math.min(CONTROL_PANEL_MIN_WIDTH, availableWidth)
    ),
    height: Math.max(
      Math.min(CONTROL_PANEL_DEFAULT_HEIGHT, availableHeight),
      Math.min(CONTROL_PANEL_MIN_HEIGHT, availableHeight)
    ),
  };
}

function clampPanelBounds(windowBounds, panelBounds) {
  const availableWidth = Math.max(windowBounds.width - CONTROL_SURFACE_MARGIN * 2, 0);
  const availableHeight = Math.max(
    windowBounds.height - TOP_BAR_HEIGHT - CONTROL_SURFACE_MARGIN * 2,
    0
  );
  const minWidth = Math.min(CONTROL_PANEL_MIN_WIDTH, availableWidth);
  const minHeight = Math.min(CONTROL_PANEL_MIN_HEIGHT, availableHeight);
  const width = clampNumber(
    Math.round(Number(panelBounds.width) || 0),
    minWidth,
    availableWidth
  );
  const height = clampNumber(
    Math.round(Number(panelBounds.height) || 0),
    minHeight,
    availableHeight
  );
  const minX = CONTROL_SURFACE_MARGIN;
  const minY = TOP_BAR_HEIGHT + CONTROL_SURFACE_MARGIN;
  const maxX = Math.max(minX, windowBounds.width - width - CONTROL_SURFACE_MARGIN);
  const maxY = Math.max(minY, windowBounds.height - height - CONTROL_SURFACE_MARGIN);

  return {
    x: clampNumber(panelBounds.x, minX, maxX),
    y: clampNumber(panelBounds.y, minY, maxY),
    width,
    height,
  };
}

function getDefaultPanelBounds(windowBounds) {
  const panelSize = getPanelSize(windowBounds);

  return clampPanelBounds(windowBounds, {
    x: Math.round((windowBounds.width - panelSize.width) / 2),
    y: Math.round(TOP_BAR_HEIGHT + Math.max(18, (windowBounds.height - TOP_BAR_HEIGHT - panelSize.height) / 2)),
    width: panelSize.width,
    height: panelSize.height,
  });
}

function attachEditableContextMenu(webContents) {
  webContents.on('context-menu', (event, params) => {
    const template = [];

    if (params.selectionText) {
      template.push({
        label: 'Copy',
        click: () => {
          clipboard.writeText(params.selectionText);
        },
      });
    }

    if (params.isEditable) {
      if (template.length > 0) {
        template.push({ type: 'separator' });
      }

      template.push({
        label: 'Paste',
        role: 'paste',
      });
    }

    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup();
    }
  });
}

function createProviderView(providerKey, paneId) {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  safeLog(`[WindowManager] Creating view for ${providerKey} at ${paneId}. Preload: ${provider.preload}`);

  const webPreferences = {
    partition: providerKey === 'grok' ? 'persist:grok' : 'persist:shared',
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,
  };

  if (provider.preload) {
    webPreferences.preload = path.join(__dirname, `../preload/${provider.preload}`);
    safeLog(`[WindowManager] Set preload path: ${webPreferences.preload}`);
  }

  const view = new WebContentsView({ webPreferences });
  if (provider.userAgent) {
    view.webContents.setUserAgent(provider.userAgent);
  }

  view.providerKey = providerKey;
  view.position = paneId;
  view.paneId = paneId;

  attachEditableContextMenu(view.webContents);
  view.webContents.loadURL(provider.url);

  return view;
}

function createPaneState(paneConfig) {
  return {
    id: paneConfig.id,
    providerKey: paneConfig.providerKey,
    view: createProviderView(paneConfig.providerKey, paneConfig.id),
  };
}

async function createWindow() {
  const mainWindow = new BaseWindow({
    width: 1600,
    height: 900,
    show: false,
    backgroundColor: '#e0e0e0',
    icon: path.join(__dirname, '../../assets/icons/icon.icns'),
  });

  mainWindow.maximize();

  let settingsWindow = null;
  let supersizedPaneId = null;
  let currentZoomFactor = 1.0;
  let layoutMode = DEFAULT_LAYOUT_MODE;
  let paneStates = [];
  let discussionConsoleExpanded = false;
  let discussionConsolePosition = null;
  let discussionConsoleSize = null;
  const topBarView = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const mainView = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  attachEditableContextMenu(topBarView.webContents);
  attachEditableContextMenu(mainView.webContents);

  function getAvailableProviders() {
    return Object.keys(PROVIDERS).map((key) => ({
      key,
      name: PROVIDERS[key].name,
    }));
  }

  function buildViewInfo(paneState) {
    return {
      position: paneState.id,
      provider: paneState.providerKey,
      availableProviders: getAvailableProviders(),
    };
  }

  function attachPaneState(paneState) {
    mainWindow.contentView.addChildView(paneState.view);

    paneState.view.webContents.on('console-message', (event, level, message) => {
      safeLog(`[${PROVIDERS[paneState.providerKey].name}@${paneState.id}] ${message}`);
    });

    paneState.view.webContents.on('did-finish-load', () => {
      paneState.view.webContents.setZoomFactor(currentZoomFactor);
      paneState.view.webContents.send('view-info', buildViewInfo(paneState));
      paneState.view.webContents.send('supersize-state-changed', supersizedPaneId);
    });
  }

  function detachPaneState(paneState) {
    if (!paneState) {
      return;
    }

    try {
      mainWindow.contentView.removeChildView(paneState.view);
    } catch (error) {
      // Ignore when the child view was already removed.
    }

    try {
      paneState.view.webContents.close();
    } catch (error) {
      // Ignore close errors during teardown.
    }
  }

  function getSerializableLayoutState() {
    return {
      layoutMode,
      panes: paneStates.map((paneState) => ({
        id: paneState.id,
        providerKey: paneState.providerKey,
      })),
    };
  }

  function persistLayoutState() {
    saveLayoutConfig(getSerializableLayoutState());
  }

  function getPaneEntries() {
    return paneStates.slice();
  }

  function getLayoutSettingsState() {
    return {
      paneCount: paneStates.length,
      layoutMode,
      layoutModes: LAYOUT_MODES.map((mode) => ({
        key: mode,
        label: getLayoutModeLabel(mode),
      })),
      panes: paneStates.map((paneState, index) => ({
        id: paneState.id,
        index,
        providerKey: paneState.providerKey,
        providerName: PROVIDERS[paneState.providerKey]?.name || paneState.providerKey,
      })),
    };
  }

  function getDiscussionPanelBounds(windowBounds) {
    const defaultBounds = getDefaultPanelBounds(windowBounds);
    const candidateBounds = {
      x: typeof discussionConsolePosition?.x === 'number' ? discussionConsolePosition.x : defaultBounds.x,
      y: typeof discussionConsolePosition?.y === 'number' ? discussionConsolePosition.y : defaultBounds.y,
      width: typeof discussionConsoleSize?.width === 'number' ? discussionConsoleSize.width : defaultBounds.width,
      height: typeof discussionConsoleSize?.height === 'number' ? discussionConsoleSize.height : defaultBounds.height,
    };
    const nextBounds = clampPanelBounds(windowBounds, candidateBounds);
    discussionConsolePosition = {
      x: nextBounds.x,
      y: nextBounds.y,
    };
    discussionConsoleSize = {
      width: nextBounds.width,
      height: nextBounds.height,
    };
    return nextBounds;
  }

  function notifyDiscussionConsoleExpandedChanged() {
    if (mainView?.webContents) {
      mainView.webContents.send('discussion-console-expanded-changed', discussionConsoleExpanded);
    }

    if (topBarView?.webContents) {
      topBarView.webContents.send('discussion-console-expanded-changed', discussionConsoleExpanded);
    }
  }

  function updateBounds() {
    const bounds = mainWindow.getContentBounds();
    const width = bounds.width;
    const height = bounds.height;
    const chatAreaHeight = Math.max(height - TOP_BAR_HEIGHT, 0);
    const contentBounds = {
      x: 0,
      y: TOP_BAR_HEIGHT,
      width,
      height: chatAreaHeight,
    };

    topBarView.setBounds({
      x: 0,
      y: 0,
      width,
      height: TOP_BAR_HEIGHT,
    });

    const paneBounds = computePaneBounds(paneStates, layoutMode, contentBounds, supersizedPaneId);
    paneStates.forEach((paneState, index) => {
      paneState.view.setBounds(
        paneBounds[index] || {
          x: contentBounds.x,
          y: contentBounds.y,
          width: 0,
          height: 0,
        }
      );
    });

    const controlBounds = discussionConsoleExpanded
      ? getDiscussionPanelBounds(bounds)
      : getLauncherBounds(bounds);

    mainView.setBounds(controlBounds);
  }

  function notifySupersizeState() {
    paneStates.forEach((paneState) => {
      paneState.view.webContents.send('supersize-state-changed', supersizedPaneId);
    });
  }

  function ensurePaneCount(targetCount) {
    while (paneStates.length < targetCount) {
      const newPane = createPaneState({
        id: createNextPaneId(paneStates),
        providerKey: getDefaultProviderForPane(paneStates.length),
      });

      paneStates.push(newPane);
      attachPaneState(newPane);
    }

    while (paneStates.length > targetCount) {
      const removedPane = paneStates.pop();
      if (removedPane && removedPane.id === supersizedPaneId) {
        supersizedPaneId = null;
      }
      detachPaneState(removedPane);
    }
  }

  function setPaneZoomFactor(zoomFactor) {
    currentZoomFactor = zoomFactor;
    paneStates.forEach((paneState) => {
      paneState.view.webContents.setZoomFactor(currentZoomFactor);
    });
  }

  function setDiscussionConsoleExpanded(nextExpanded) {
    discussionConsoleExpanded = Boolean(nextExpanded);
    if (discussionConsoleExpanded && !discussionConsolePosition) {
      const defaultBounds = getDefaultPanelBounds(mainWindow.getContentBounds());
      discussionConsolePosition = {
        x: defaultBounds.x,
        y: defaultBounds.y,
      };
      discussionConsoleSize = {
        width: defaultBounds.width,
        height: defaultBounds.height,
      };
    }
    updateBounds();
    notifyDiscussionConsoleExpandedChanged();
    return discussionConsoleExpanded;
  }

  function getDiscussionConsoleExpanded() {
    return discussionConsoleExpanded;
  }

  function moveDiscussionConsoleBy(deltaX, deltaY) {
    if (!discussionConsoleExpanded) {
      return false;
    }

    const bounds = mainWindow.getContentBounds();
    const currentBounds = getDiscussionPanelBounds(bounds);
    const nextBounds = clampPanelBounds(bounds, {
      ...currentBounds,
      x: currentBounds.x + Math.round(Number(deltaX) || 0),
      y: currentBounds.y + Math.round(Number(deltaY) || 0),
    });

    discussionConsolePosition = {
      x: nextBounds.x,
      y: nextBounds.y,
    };

    mainView.setBounds(nextBounds);
    return true;
  }

  function resizeDiscussionConsoleBy(deltaX, deltaY) {
    if (!discussionConsoleExpanded) {
      return false;
    }

    const bounds = mainWindow.getContentBounds();
    const currentBounds = getDiscussionPanelBounds(bounds);
    const nextBounds = clampPanelBounds(bounds, {
      ...currentBounds,
      width: currentBounds.width + Math.round(Number(deltaX) || 0),
      height: currentBounds.height + Math.round(Number(deltaY) || 0),
    });

    discussionConsolePosition = {
      x: nextBounds.x,
      y: nextBounds.y,
    };
    discussionConsoleSize = {
      width: nextBounds.width,
      height: nextBounds.height,
    };

    mainView.setBounds(nextBounds);
    return true;
  }

  function applyLayoutSettings(nextSettings = {}) {
    const parsedPaneCount = Number.parseInt(nextSettings.paneCount, 10);
    const targetPaneCount = Number.isFinite(parsedPaneCount)
      ? Math.max(1, parsedPaneCount)
      : paneStates.length;

    layoutMode = normalizeLayoutMode(nextSettings.layoutMode || layoutMode);
    ensurePaneCount(targetPaneCount);
    persistLayoutState();
    updateBounds();
    notifySupersizeState();

    return getLayoutSettingsState();
  }

  function toggleSupersize(paneId) {
    const paneExists = paneStates.some((paneState) => paneState.id === paneId);
    if (!paneExists) {
      return supersizedPaneId;
    }

    supersizedPaneId = supersizedPaneId === paneId ? null : paneId;
    updateBounds();
    notifySupersizeState();

    return supersizedPaneId;
  }

  function changeProvider(paneId, newProviderKey) {
    if (!PROVIDERS[newProviderKey]) {
      return false;
    }

    const paneIndex = paneStates.findIndex((paneState) => paneState.id === paneId);
    if (paneIndex === -1) {
      return false;
    }

    const oldPaneState = paneStates[paneIndex];
    const newPaneState = createPaneState({
      id: oldPaneState.id,
      providerKey: newProviderKey,
    });

    paneStates[paneIndex] = newPaneState;
    detachPaneState(oldPaneState);
    attachPaneState(newPaneState);
    persistLayoutState();
    updateBounds();
    notifySupersizeState();

    return true;
  }

  function openSettingsModal() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
      return settingsWindow;
    }

    const settingsWindowConfig = loadSettingsWindowConfig();

    settingsWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      show: false,
      width: settingsWindowConfig.width,
      height: settingsWindowConfig.height,
      minWidth: SETTINGS_WINDOW_MIN_WIDTH,
      minHeight: SETTINGS_WINDOW_MIN_HEIGHT,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      backgroundColor: '#ffffff',
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    settingsWindow.removeMenu();
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings-modal.html'));
    settingsWindow.once('ready-to-show', () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) {
        return;
      }

      settingsWindow.center();
      settingsWindow.show();
      settingsWindow.focus();
    });

    settingsWindow.on('resize', () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) {
        return;
      }

      const [width, height] = settingsWindow.getSize();
      saveSettingsWindowConfig({ width, height });
    });

    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });

    return settingsWindow;
  }

  function closeSettingsModal() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  }

  const initialLayout = loadLayoutConfig();
  layoutMode = initialLayout.layoutMode;
  paneStates = initialLayout.panes.map((paneConfig) => createPaneState(paneConfig));

  paneStates.forEach((paneState) => {
    attachPaneState(paneState);
  });

  mainWindow.contentView.addChildView(topBarView);
  mainWindow.contentView.addChildView(mainView);

  mainWindow.on('resize', updateBounds);
  mainWindow.on('resized', updateBounds);

  topBarView.webContents.on('console-message', (event, level, message) => {
    safeLog(`[TopBar] ${message}`);
  });

  topBarView.webContents.on('did-finish-load', () => {
    topBarView.webContents.send('discussion-console-expanded-changed', discussionConsoleExpanded);
  });

  mainView.webContents.on('console-message', (event, level, message) => {
    safeLog(`[DiscussionConsole] ${message}`);
  });

  mainView.webContents.on('did-finish-load', () => {
    mainView.webContents.send('discussion-console-expanded-changed', discussionConsoleExpanded);
  });

  topBarView.webContents.loadFile(path.join(__dirname, '../renderer/topbar.html'));
  mainView.webContents.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    paneStates.forEach((paneState) => {
      paneState.view.webContents.openDevTools({ mode: 'detach' });
    });
    topBarView.webContents.openDevTools({ mode: 'detach' });
    mainView.webContents.openDevTools({ mode: 'detach' });
  }

  setTimeout(updateBounds, 100);
  mainWindow.show();

  mainWindow.topBarView = topBarView;
  mainWindow.mainView = mainView;
  mainWindow.getPaneEntries = getPaneEntries;
  mainWindow.getLayoutSettingsState = getLayoutSettingsState;
  mainWindow.applyLayoutSettings = applyLayoutSettings;
  mainWindow.toggleSupersize = toggleSupersize;
  mainWindow.changeProvider = changeProvider;
  mainWindow.getSupersizedPosition = () => supersizedPaneId;
  mainWindow.setPaneZoomFactor = setPaneZoomFactor;
  mainWindow.getPaneZoomFactor = () => currentZoomFactor;
  mainWindow.setDiscussionConsoleExpanded = setDiscussionConsoleExpanded;
  mainWindow.getDiscussionConsoleExpanded = getDiscussionConsoleExpanded;
  mainWindow.moveDiscussionConsoleBy = moveDiscussionConsoleBy;
  mainWindow.resizeDiscussionConsoleBy = resizeDiscussionConsoleBy;
  mainWindow.openSettingsModal = openSettingsModal;
  mainWindow.closeSettingsModal = closeSettingsModal;

  return mainWindow;
}

module.exports = {
  createWindow,
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODES,
  PROVIDERS,
};
