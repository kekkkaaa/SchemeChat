const { BaseWindow, WebContentsView, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const util = require('util');

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

// Provider metadata
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

// Position keys
const POSITIONS = ['left', 'right'];

// Config file path
const CONFIG_PATH = path.join(__dirname, '../../config/window-providers.json');

function normalizeProviderKey(providerKey, fallback) {
  return PROVIDERS[providerKey] ? providerKey : fallback;
}

// Load provider configuration
function loadProviderConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(data);
      return {
        left: normalizeProviderKey(parsed.left || parsed.bottomLeft, 'chatgpt'),
        right: normalizeProviderKey(parsed.right || parsed.bottomRight, 'gemini'),
      };
    }
  } catch (error) {
    safeError('Failed to load provider config:', error);
  }
  // Return default configuration
  return {
    left: 'chatgpt',
    right: 'gemini',
  };
}

// Save provider configuration
function saveProviderConfig(config) {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    safeError('Failed to save provider config:', error);
  }
}

function createProviderView(providerKey, position) {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  safeLog(`[WindowManager] Creating view for ${providerKey} at ${position}. Preload: ${provider.preload}`);

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

  const view = new WebContentsView({
    webPreferences,
  });

  // Set user agent if specified
  if (provider.userAgent) {
    view.webContents.setUserAgent(provider.userAgent);
  }

  // Track provider and position
  view.providerKey = providerKey;
  view.position = position;

  // Enable context menu for copy/paste
  view.webContents.on('context-menu', (event, params) => {
    const template = [];

    // Add copy option if text is selected
    if (params.selectionText) {
      template.push({
        label: 'Copy',
        click: () => {
          clipboard.writeText(params.selectionText);
        },
      });
    }

    // Add paste option for input fields
    if (params.isEditable) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({
        label: 'Paste',
        role: 'paste',
      });
    }

    // Show menu if we have items
    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup();
    }
  });

  // Load URL
  view.webContents.loadURL(provider.url);

  return view;
}

async function createWindow() {
  // Create main window
  const mainWindow = new BaseWindow({
    width: 1600,
    height: 900,
    show: false,
    backgroundColor: '#e0e0e0', // Light gray for separators
    icon: path.join(__dirname, '../../assets/icons/icon.icns'),
  });

  // Maximize the window
  mainWindow.maximize();

  // Track which position is supersized (null = normal grid)
  let supersizedPosition = null;

  // Load provider configuration
  const providerConfig = loadProviderConfig();

  // Create main renderer content view (control bar)
  const mainView = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Enable context menu for copy/paste in control bar
  mainView.webContents.on('context-menu', (event, params) => {
    const template = [];

    // Add copy option if text is selected
    if (params.selectionText) {
      template.push({
        label: 'Copy',
        click: () => {
          clipboard.writeText(params.selectionText);
        },
      });
    }

    // Add paste option for input fields
    if (params.isEditable) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({
        label: 'Paste',
        role: 'paste',
      });
    }

    // Show menu if we have items
    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup();
    }
  });

  // Create views based on configuration
  const viewPositions = {
    left: createProviderView(providerConfig.left, 'left'),
    right: createProviderView(providerConfig.right, 'right'),
  };

  // Add views to window
  mainWindow.contentView.addChildView(viewPositions.left);
  mainWindow.contentView.addChildView(viewPositions.right);
  mainWindow.contentView.addChildView(mainView);

  // Set bounds for views (updated on resize)
  function updateBounds() {
    const bounds = mainWindow.getContentBounds();
    const width = bounds.width;
    const height = bounds.height;
    const controlBarHeight = 100; // Height reserved for control bar
    const chatAreaHeight = height - controlBarHeight;

    if (supersizedPosition === null) {
      // Normal 2-column mode
      const halfWidth = Math.floor(width / 2);
      const gap = 1; // 1px gap for separators

      viewPositions.left.setBounds({
        x: 0,
        y: 0,
        width: halfWidth - Math.floor(gap / 2),
        height: chatAreaHeight,
      });

      viewPositions.right.setBounds({
        x: halfWidth + Math.ceil(gap / 2),
        y: 0,
        width: width - halfWidth - Math.ceil(gap / 2),
        height: chatAreaHeight,
      });
    } else {
      // Supersized mode: one view takes 80%, the other stays as a side preview
      const mainWidth = Math.floor(width * 0.8);
      const thumbnailWidth = width - mainWidth - 2; // 2px gap

      // Position supersized view
      const supersized = viewPositions[supersizedPosition];
      supersized.setBounds({
        x: 0,
        y: 0,
        width: mainWidth,
        height: chatAreaHeight,
      });

      const sidePosition = POSITIONS.find(pos => pos !== supersizedPosition);
      if (sidePosition) {
        viewPositions[sidePosition].setBounds({
          x: mainWidth + 2,
          y: 0,
          width: thumbnailWidth,
          height: chatAreaHeight,
        });
      }
    }

    // Bottom control bar - full width
    mainView.setBounds({
      x: 0,
      y: chatAreaHeight,
      width: width,
      height: controlBarHeight,
    });
  }

  // Toggle supersize for a position
  function toggleSupersize(position) {
    if (supersizedPosition === position) {
      supersizedPosition = null;
    } else {
      supersizedPosition = position;
    }
    updateBounds();

    // Notify all service views of state change
    POSITIONS.forEach(pos => {
      viewPositions[pos].webContents.send('supersize-state-changed', supersizedPosition);
    });

    return supersizedPosition;
  }

  // Change provider for a position
  function changeProvider(position, newProviderKey, zoomFactor = 1.0) {
    if (!PROVIDERS[newProviderKey]) {
      return false;
    }

    // Get old view
    const oldView = viewPositions[position];

    // Remove from window
    mainWindow.contentView.removeChildView(oldView);

    // Close old view
    oldView.webContents.close();

    // Create new view
    const newView = createProviderView(newProviderKey, position);

    // Add to window
    mainWindow.contentView.addChildView(newView);

    // Update reference
    viewPositions[position] = newView;

    // Setup console forwarding for new view
    newView.webContents.on('console-message', (event, level, message, line, sourceId) => {
      safeLog(`[${PROVIDERS[newProviderKey].name}@${position}] ${message}`);
    });

    // Send view info to new view after it loads
    newView.webContents.on('did-finish-load', () => {
      // Set zoom factor for new view
      newView.webContents.setZoomFactor(zoomFactor);

      // Send view info
      newView.webContents.send('view-info', {
        position,
        provider: newProviderKey,
        availableProviders: Object.keys(PROVIDERS).map(key => ({
          key,
          name: PROVIDERS[key].name,
        })),
      });
    });

    // Update bounds
    updateBounds();

    // Update config
    providerConfig[position] = newProviderKey;
    saveProviderConfig(providerConfig);

    // Notify all views of supersize state
    POSITIONS.forEach(pos => {
      viewPositions[pos].webContents.send('supersize-state-changed', supersizedPosition);
    });

    return true;
  }

  // Update bounds on window resize
  mainWindow.on('resized', updateBounds);

  // Load content
  mainView.webContents.loadFile(path.join(__dirname, '../renderer/index.html'));
  // URLs are already loaded in createProviderView()

  // Forward console messages from all views to terminal
  POSITIONS.forEach(pos => {
    viewPositions[pos].webContents.on('console-message', (event, level, message, line, sourceId) => {
      safeLog(`[${PROVIDERS[viewPositions[pos].providerKey].name}@${pos}] ${message}`);
    });

    // Send position and provider info to each view after it loads
    viewPositions[pos].webContents.on('did-finish-load', () => {
      viewPositions[pos].webContents.send('view-info', {
        position: pos,
        provider: viewPositions[pos].providerKey,
        availableProviders: Object.keys(PROVIDERS).map(key => ({
          key,
          name: PROVIDERS[key].name,
        })),
      });
    });
  });

  mainView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    safeLog(`[ControlBar] ${message}`);
  });

  // Open dev tools in development
  if (process.argv.includes('--dev')) {
    POSITIONS.forEach(pos => {
      viewPositions[pos].webContents.openDevTools({ mode: 'detach' });
    });
    mainView.webContents.openDevTools({ mode: 'detach' });
  }

  // Initial bounds calculation
  setTimeout(updateBounds, 100);

  mainWindow.show();

  // Store references for access in main process
  mainWindow.mainView = mainView;
  mainWindow.viewPositions = viewPositions;
  mainWindow.toggleSupersize = toggleSupersize;
  mainWindow.changeProvider = changeProvider;
  mainWindow.getSupersizedPosition = () => supersizedPosition;

  return mainWindow;
}

module.exports = { createWindow, PROVIDERS, POSITIONS };
