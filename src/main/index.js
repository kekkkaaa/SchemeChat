const { app, ipcMain, session, Menu, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  buildRoundPromptFromDraft,
  buildRoundPromptScaffold,
  buildRoundPrompt,
  buildDiscussionPrompt,
  captureStableLatestReply,
  inspectProviderView,
  syncPaneEntries,
} = require('./sync');
const windowManager = require('./window-manager');
const { getProviderCompatibility } = require('./provider-compatibility');
const { createSchemeChatMcpServer } = require('./codex-mcp-server');

let mainWindow;
let currentZoomFactor = 1.0;
let codexBridge;
const pendingPrivateNewChatRequests = new Map();
const SHARED_PARTITION = 'persist:shared';
const CHATGPT_PARTITION = getProviderCompatibility('chatgpt').partition;
const CHATGPT_SESSION_MAINTENANCE_VERSION = 3;
const CHATGPT_COOKIE_DOMAINS = ['chatgpt.com', 'chat.openai.com'];
const CHATGPT_SESSION_ORIGINS = ['https://chatgpt.com', 'https://chat.openai.com'];
const CHATGPT_SESSION_STORAGES = [
  'localstorage',
  'indexdb',
  'serviceworkers',
  'cachestorage',
  'filesystem',
  'websql',
];

[process.stdout, process.stderr].forEach((stream) => {
  if (!stream) {
    return;
  }

  stream.on('error', (error) => {
    if (error && error.code === 'EPIPE') {
      return;
    }
    throw error;
  });
});

function getChatGptSessionMarkerPath() {
  return path.join(app.getPath('userData'), 'chatgpt-session-reset.json');
}

function readChatGptSessionMarker() {
  const markerPath = getChatGptSessionMarkerPath();
  if (!fs.existsSync(markerPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (error) {
    console.error('Failed to read ChatGPT session marker:', error);
    return null;
  }
}

function writeChatGptSessionMarker(payload) {
  const markerPath = getChatGptSessionMarkerPath();
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Failed to write ChatGPT session marker:', error);
  }
}

function createCookieUrl(cookie) {
  const domain = String(cookie?.domain || '').replace(/^\./, '');
  const scheme = cookie?.secure ? 'https' : 'http';
  return `${scheme}://${domain}${cookie?.path || '/'}`;
}

async function getChatGptCookies(targetSession) {
  const cookies = await targetSession.cookies.get({});
  return cookies.filter((cookie) => {
    const domain = String(cookie?.domain || '').replace(/^\./, '');
    return CHATGPT_COOKIE_DOMAINS.includes(domain);
  });
}

async function copyChatGptCookies(sourceSession, targetSession) {
  const sourceCookies = await getChatGptCookies(sourceSession);
  await Promise.all(
    sourceCookies.map((cookie) => {
      const payload = {
        url: createCookieUrl(cookie),
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
      };

      if (typeof cookie.expirationDate === 'number') {
        payload.expirationDate = cookie.expirationDate;
      }
      if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
        payload.sameSite = cookie.sameSite;
      }

      return targetSession.cookies.set(payload).catch(() => null);
    })
  );
}

async function clearChatGptSessionData(targetSession, storages = CHATGPT_SESSION_STORAGES) {
  for (const origin of CHATGPT_SESSION_ORIGINS) {
    await targetSession.clearStorageData({
      origin,
      storages,
    });
  }
}

async function performChatGptSoftMaintenance(targetSession, options = {}) {
  const storages = Array.isArray(options.storages) && options.storages.length > 0
    ? [...new Set(options.storages.filter(Boolean))]
    : CHATGPT_SESSION_STORAGES;

  await clearChatGptSessionData(targetSession, storages);

  if (options.clearCache !== false && typeof targetSession.clearCache === 'function') {
    await targetSession.clearCache();
  }
}

async function ensureDedicatedChatGptSessionState() {
  const marker = readChatGptSessionMarker() || {};

  const sharedSession = session.fromPartition(SHARED_PARTITION);
  const chatGptSession = session.fromPartition(CHATGPT_PARTITION);
  const targetCookies = await getChatGptCookies(chatGptSession);

  if ((marker?.version || 0) < CHATGPT_SESSION_MAINTENANCE_VERSION && targetCookies.length === 0) {
    await copyChatGptCookies(sharedSession, chatGptSession);
  }

  await performChatGptSoftMaintenance(chatGptSession, {
    storages: CHATGPT_SESSION_STORAGES,
    clearCache: true,
  });

  writeChatGptSessionMarker({
    ...marker,
    version: CHATGPT_SESSION_MAINTENANCE_VERSION,
    maintainedAt: new Date().toISOString(),
    partition: CHATGPT_PARTITION,
    preservedCookies: true,
  });

  return true;
}

async function reloadPaneEntries(paneEntries) {
  const targets = Array.isArray(paneEntries) ? paneEntries.filter(Boolean) : [];

  await Promise.all(
    targets.map((paneEntry) => {
      return new Promise((resolve) => {
        const view = paneEntry?.view;
        if (!view?.webContents) {
          resolve();
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          view.webContents.removeListener('did-finish-load', onLoad);
          resolve();
        };

        const onLoad = () => {
          view.webContents.setZoomFactor(currentZoomFactor);
          finish();
        };

        const timeoutId = setTimeout(() => {
          finish();
        }, 10000);

        view.webContents.on('did-finish-load', onLoad);
        view.webContents.reload();
      });
    })
  );
}

function hideNativeAppMenu(targetWindow) {
  Menu.setApplicationMenu(null);

  if (!targetWindow) {
    return;
  }

  if (typeof targetWindow.setAutoHideMenuBar === 'function') {
    targetWindow.setAutoHideMenuBar(true);
  }

  if (typeof targetWindow.setMenuBarVisibility === 'function') {
    targetWindow.setMenuBarVisibility(false);
  }

  if (typeof targetWindow.removeMenu === 'function') {
    targetWindow.removeMenu();
  }
}

function configureTrustedPartition(partitionName) {
  const targetSession = session.fromPartition(partitionName);
  targetSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'clipboard-read' || permission === 'clipboard-write' || permission === 'clipboard-sanitized-write') {
      callback(true);
    } else {
      callback(false);
    }
  });

  targetSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'clipboard-read' || permission === 'clipboard-write' || permission === 'clipboard-sanitized-write') {
      return true;
    }
    return false;
  });
}

function getViewProviderDisplayName(view) {
  return windowManager.PROVIDERS[view?.providerKey]?.name || view?.providerKey || 'Unknown Provider';
}

function getPaneEntries() {
  return mainWindow?.getPaneEntries ? mainWindow.getPaneEntries() : [];
}

function getProviderDisplayName(providerKey) {
  return windowManager.PROVIDERS[providerKey]?.name || providerKey || 'Unknown Provider';
}

function getPaneLabel(paneEntry) {
  return `${getProviderDisplayName(paneEntry?.view?.providerKey)} (${paneEntry?.id || 'pane'})`;
}

function getTargetPaneEntries(paneIds) {
  const paneEntries = getPaneEntries();
  if (!Array.isArray(paneIds) || paneIds.length === 0) {
    return paneEntries;
  }

  const paneIdSet = new Set(
    paneIds
      .map((paneId) => String(paneId || '').trim())
      .filter(Boolean)
  );

  return paneEntries.filter((paneEntry) => paneIdSet.has(paneEntry.id));
}

function serializePaneEntry(paneEntry) {
  return {
    paneId: paneEntry?.id || '',
    providerKey: paneEntry?.view?.providerKey || '',
    providerName: getPaneLabel(paneEntry),
    url: paneEntry?.view?.webContents?.getURL?.() || '',
    title: paneEntry?.view?.webContents?.getTitle?.() || '',
    isLoading: Boolean(paneEntry?.view?.webContents?.isLoading?.()),
  };
}

function getWorkspaceSnapshot(paneIds) {
  const paneEntries = getTargetPaneEntries(paneIds);
  const layoutState = mainWindow && typeof mainWindow.getLayoutSettingsState === 'function'
    ? mainWindow.getLayoutSettingsState()
    : null;

  return {
    ok: true,
    discussionConsoleExpanded: mainWindow && typeof mainWindow.getDiscussionConsoleExpanded === 'function'
      ? mainWindow.getDiscussionConsoleExpanded()
      : false,
    layout: layoutState
      ? {
        paneCount: layoutState.paneCount,
        layoutMode: layoutState.layoutMode,
      }
      : null,
    panes: paneEntries.map((paneEntry) => serializePaneEntry(paneEntry)),
  };
}

async function inspectProviderRoundStatusesForPaneIds(paneIds) {
  const paneEntries = getTargetPaneEntries(paneIds);
  if (paneEntries.length === 0) {
    return {
      ok: false,
      message: 'No target panes were found.',
      results: [],
    };
  }

  const results = await Promise.all(
    paneEntries.map(async (paneEntry) => {
      const inspectionResult = await inspectProviderView(paneEntry.view);
      return buildInspectionPayload(paneEntry, inspectionResult);
    })
  );

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

async function captureProviderRoundResultsForPaneIds(paneIds) {
  const paneEntries = getTargetPaneEntries(paneIds);
  if (paneEntries.length === 0) {
    return {
      ok: false,
      message: 'No target panes were found.',
      results: [],
    };
  }

  const results = await Promise.all(
    paneEntries.map(async (paneEntry) => {
      const captureResult = await captureStableLatestReply(paneEntry.view);
      return buildInspectionPayload(paneEntry, captureResult);
    })
  );

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

async function sendTextUpdateToPaneIds(paneIds, text) {
  const paneEntries = getTargetPaneEntries(paneIds);
  if (paneEntries.length === 0) {
    return {
      ok: false,
      message: 'No target panes were found.',
    };
  }

  sendChannelToPaneEntries(paneEntries, 'text-update', text || '');
  return {
    ok: true,
    message: `Mirrored text to ${paneEntries.length} pane${paneEntries.length > 1 ? 's' : ''}.`,
  };
}

async function submitMessageToPaneIds(paneIds) {
  const paneEntries = getTargetPaneEntries(paneIds);
  if (paneEntries.length === 0) {
    return {
      ok: false,
      message: 'No target panes were found.',
    };
  }

  sendChannelToPaneEntries(paneEntries, 'submit-message');
  return {
    ok: true,
    message: `Submitted messages to ${paneEntries.length} pane${paneEntries.length > 1 ? 's' : ''}.`,
  };
}

function sendChannelToPaneEntries(paneEntries, channel, payload) {
  paneEntries.forEach((paneEntry) => {
    if (!paneEntry?.view?.webContents) {
      return;
    }

    paneEntry.view.webContents.send(channel, payload);
  });
}

function buildInspectionPayload(paneEntry, inspectionResult) {
  const latestReplyText = inspectionResult?.latestReplyText || inspectionResult?.text || '';
  return {
    paneId: paneEntry.id,
    providerKey: paneEntry?.view?.providerKey || paneEntry?.providerKey || '',
    providerName: getPaneLabel(paneEntry),
    ok: Boolean(inspectionResult?.ok),
    busy: Boolean(inspectionResult?.busy),
    latestReplyText,
    hasReply: Boolean(latestReplyText),
    error: inspectionResult?.error || null,
    status: !inspectionResult?.ok
      ? 'failed'
      : inspectionResult?.busy
        ? 'waiting'
        : latestReplyText
          ? 'completed'
          : 'idle',
  };
}

function buildPrivateNewChatResponse(paneEntries, receivedResults) {
  const expectedResults = paneEntries.map((paneEntry) => {
    const result = receivedResults.find((entry) => entry.paneId === paneEntry.id);
    if (result) {
      return result;
    }

    return {
      paneId: paneEntry.id,
      provider: paneEntry?.view?.providerKey,
      ok: false,
      error: 'Timed out while waiting for the page flow to complete.',
    };
  });

  const successes = expectedResults.filter((result) => result.ok);
  const failures = expectedResults.filter((result) => !result.ok);
  const successLabels = successes.map((result) => {
    const paneEntry = paneEntries.find((entry) => entry.id === result.paneId);
    return getPaneLabel(paneEntry);
  });
  const failureMessages = failures.map((result) => {
    const paneEntry = paneEntries.find((entry) => entry.id === result.paneId);
    return `${getPaneLabel(paneEntry)}: ${result.error || 'Private/temporary chat flow failed.'}`;
  });

  if (failures.length === 0) {
    return {
      ok: true,
      message: `Opened private/temporary chats for ${successLabels.join(', ')}.`,
      results: expectedResults,
    };
  }

  return {
    ok: false,
    message: [
      successLabels.length > 0 ? `Opened for ${successLabels.join(', ')}.` : 'No pane switched successfully.',
      `Failed: ${failureMessages.join('; ')}`,
    ].join(' '),
    results: expectedResults,
  };
}

app.on('ready', async () => {
  configureTrustedPartition(SHARED_PARTITION);
  configureTrustedPartition(CHATGPT_PARTITION);

  try {
    await ensureDedicatedChatGptSessionState();
  } catch (error) {
    console.error('Failed to prepare dedicated ChatGPT session:', error);
  }

  hideNativeAppMenu();

  mainWindow = await windowManager.createWindow();
  hideNativeAppMenu(mainWindow);

  codexBridge = createSchemeChatMcpServer({
    version: app.getVersion(),
    getWorkspaceSnapshot,
    inspectRoundStatus: inspectProviderRoundStatusesForPaneIds,
    captureLatestReplies: captureProviderRoundResultsForPaneIds,
    injectTextToPanes: sendTextUpdateToPaneIds,
    submitMessageToPanes: submitMessageToPaneIds,
  });

  try {
    const status = await codexBridge.start();
    console.log(`SchemeChat Codex MCP server listening on ${status.url}`);
  } catch (error) {
    console.error('Failed to start SchemeChat Codex MCP server:', error);
    codexBridge = null;
  }

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (typeof mainWindow.focus === 'function') {
      mainWindow.focus();
    }

    if (typeof mainWindow.setDiscussionConsoleExpanded === 'function') {
      mainWindow.setDiscussionConsoleExpanded(true);
    }
  });

  // IPC handler for text updates from renderer
  ipcMain.handle('send-text-update', async (event, text) => {
    const supersizedPosition = mainWindow.getSupersizedPosition ? mainWindow.getSupersizedPosition() : null;
    const paneEntries = getPaneEntries();

    // If supersized, only send to that position
    if (supersizedPosition) {
      const supersizedPane = paneEntries.find((paneEntry) => paneEntry.id === supersizedPosition);
      if (supersizedPane?.view?.webContents) {
        supersizedPane.view.webContents.send('text-update', text);
      }
    } else {
      // Send text to all positions
      paneEntries.forEach((paneEntry) => {
        if (paneEntry.view && paneEntry.view.webContents) {
          paneEntry.view.webContents.send('text-update', text);
        }
      });
    }
  });

  ipcMain.handle('send-text-update-to-panes', async (event, payload = {}) => {
    return sendTextUpdateToPaneIds(payload?.paneIds, payload?.text || '');
  });

  ipcMain.handle('selector-error', async (event, source, error) => {
    if (mainWindow.mainView && mainWindow.mainView.webContents) {
      mainWindow.mainView.webContents.send('selector-error', { source, error });
    }
  });

  ipcMain.handle('provider-warning', async (event, source, code) => {
    if (mainWindow.mainView && mainWindow.mainView.webContents) {
      mainWindow.mainView.webContents.send('provider-warning', { source, code });
    }
    return true;
  });

  ipcMain.handle('open-settings-modal', async () => {
    if (mainWindow && typeof mainWindow.openSettingsModal === 'function') {
      mainWindow.openSettingsModal();
      return true;
    }
    return false;
  });

  ipcMain.handle('close-settings-modal', async () => {
    if (mainWindow && typeof mainWindow.closeSettingsModal === 'function') {
      mainWindow.closeSettingsModal();
      return true;
    }
    return false;
  });

  ipcMain.handle('open-help-modal', async () => {
    if (mainWindow && typeof mainWindow.openHelpModal === 'function') {
      mainWindow.openHelpModal();
      return true;
    }
    return false;
  });

  ipcMain.handle('close-help-modal', async () => {
    if (mainWindow && typeof mainWindow.closeHelpModal === 'function') {
      mainWindow.closeHelpModal();
      return true;
    }
    return false;
  });

  ipcMain.handle('get-settings-state', async () => {
    if (mainWindow && typeof mainWindow.getLayoutSettingsState === 'function') {
      return mainWindow.getLayoutSettingsState();
    }

    return {
      paneCount: 2,
      layoutMode: windowManager.DEFAULT_LAYOUT_MODE,
      layoutModes: windowManager.LAYOUT_MODES.map((mode) => ({
        key: mode,
        label: mode,
      })),
      panes: [],
    };
  });

  ipcMain.handle('apply-settings-layout', async (event, nextSettings) => {
    if (mainWindow && typeof mainWindow.applyLayoutSettings === 'function') {
      return mainWindow.applyLayoutSettings(nextSettings);
    }

    return null;
  });

  ipcMain.handle('get-discussion-console-expanded', async () => {
    if (mainWindow && typeof mainWindow.getDiscussionConsoleExpanded === 'function') {
      return mainWindow.getDiscussionConsoleExpanded();
    }

    return false;
  });

  ipcMain.handle('set-discussion-console-expanded', async (event, nextExpanded) => {
    if (mainWindow && typeof mainWindow.setDiscussionConsoleExpanded === 'function') {
      return mainWindow.setDiscussionConsoleExpanded(nextExpanded);
    }

    return false;
  });

  ipcMain.on('move-discussion-console-by', (event, deltaX, deltaY) => {
    if (mainWindow && typeof mainWindow.moveDiscussionConsoleBy === 'function') {
      mainWindow.moveDiscussionConsoleBy(deltaX, deltaY);
    }
  });

  ipcMain.on('resize-discussion-console-by', (event, deltaX, deltaY) => {
    if (mainWindow && typeof mainWindow.resizeDiscussionConsoleBy === 'function') {
      mainWindow.resizeDiscussionConsoleBy(deltaX, deltaY);
    }
  });

  ipcMain.handle('sync-latest-round', async () => {
    const paneEntries = getPaneEntries();
    if (paneEntries.length !== 2) {
      return {
        ok: false,
        message: 'Sync currently supports exactly 2 panes.',
      };
    }

    const [leftPane, rightPane] = paneEntries;
    const leftView = leftPane.view;
    const rightView = rightPane.view;

    const [leftResult, rightResult] = await Promise.all([
      captureStableLatestReply(leftView),
      captureStableLatestReply(rightView),
    ]);

    if (!leftResult.ok) {
      return {
        ok: false,
        message: `${getViewProviderDisplayName(leftView)} sync failed: ${leftResult.error || 'Unable to inspect the latest reply.'}`,
      };
    }

    if (!rightResult.ok) {
      return {
        ok: false,
        message: `${getViewProviderDisplayName(rightView)} sync failed: ${rightResult.error || 'Unable to inspect the latest reply.'}`,
      };
    }

    if (leftResult.busy || rightResult.busy) {
      const busyProviders = [];
      if (leftResult.busy) {
        busyProviders.push(getViewProviderDisplayName(leftView));
      }
      if (rightResult.busy) {
        busyProviders.push(getViewProviderDisplayName(rightView));
      }

      return {
        ok: false,
        message: `${busyProviders.join(' and ')} ${busyProviders.length > 1 ? 'are' : 'is'} still replying. Wait for both sides to finish, then sync again.`,
      };
    }

    if (!leftResult.latestReplyText || !rightResult.latestReplyText) {
      return {
        ok: false,
        message: 'Sync needs both sides to have a latest reply before it can continue.',
      };
    }

    const leftProviderName = getViewProviderDisplayName(leftView);
    const rightProviderName = getViewProviderDisplayName(rightView);

    leftView.webContents.send(
      'inject-sync-text',
      buildDiscussionPrompt(rightProviderName, rightResult.latestReplyText)
    );
    rightView.webContents.send(
      'inject-sync-text',
      buildDiscussionPrompt(leftProviderName, leftResult.latestReplyText)
    );

    return {
      ok: true,
      message: `Synced the latest ${leftProviderName} and ${rightProviderName} replies into the opposite input boxes.`,
    };
  });

  ipcMain.handle('sync-all-latest-rounds', async () => {
    return syncPaneEntries(getPaneEntries());
  });

  ipcMain.handle('inspect-provider-round-statuses', async (event, payload = {}) => {
    return inspectProviderRoundStatusesForPaneIds(payload?.paneIds);
  });

  ipcMain.handle('capture-provider-round-results', async (event, payload = {}) => {
    return captureProviderRoundResultsForPaneIds(payload?.paneIds);
  });

  ipcMain.handle('prepare-generated-round', async (event, payload = {}) => {
    const paneEntries = getTargetPaneEntries(payload?.paneIds);
    if (paneEntries.length === 0) {
      return {
        ok: false,
        message: 'No target panes were found.',
        prompts: [],
      };
    }

    const promptType = String(payload?.promptType || '').trim();
    if (!promptType) {
      return {
        ok: false,
        message: 'Prompt type is required.',
        prompts: [],
      };
    }

    const sourceEntries = Array.isArray(payload?.sources)
      ? payload.sources
      : [];

    const prompts = paneEntries.map((paneEntry) => {
      const scopedSources = sourceEntries.filter((source) => {
        return Boolean(source?.paneId) && source.paneId !== paneEntry.id;
      });

      const promptOptions = {
        topic: payload?.topic || '',
        summarizerName: payload?.summarizerName || getPaneLabel(paneEntry),
        maxLengthPerSource: payload?.maxLengthPerSource,
      };
      const prompt = String(payload?.baseDraft || '').trim()
        ? buildRoundPromptFromDraft(promptType, payload.baseDraft, scopedSources, promptOptions)
        : buildRoundPrompt(promptType, scopedSources, promptOptions);

      return {
        paneEntry,
        paneId: paneEntry.id,
        providerName: getPaneLabel(paneEntry),
        prompt,
      };
    });

    const invalidPrompt = prompts.find((entry) => !entry.prompt);
    if (invalidPrompt) {
      return {
        ok: false,
        message: `${invalidPrompt.providerName} has no prompt to inject for ${promptType}.`,
        prompts: [],
      };
    }

    prompts.forEach((entry) => {
      entry.paneEntry.view.webContents.send('inject-sync-text', entry.prompt);
    });

    return {
      ok: true,
      message: `Prepared ${promptType} for ${prompts.length} pane${prompts.length > 1 ? 's' : ''}.`,
      prompts: prompts.map((entry) => ({
        paneId: entry.paneId,
        providerName: entry.providerName,
        prompt: entry.prompt,
      })),
      previewPrompt: prompts[0]?.prompt || '',
    };
  });

  ipcMain.handle('build-generated-round-draft', async (event, payload = {}) => {
    const promptType = String(payload?.promptType || '').trim();
    if (!promptType) {
      return {
        ok: false,
        message: 'Prompt type is required.',
        prompt: '',
      };
    }

    const sourceEntries = Array.isArray(payload?.sources)
      ? payload.sources
      : [];

    const promptOptions = {
      topic: payload?.topic || '',
      summarizerName: payload?.summarizerName || '',
      sourceCount: Number.isFinite(payload?.sourceCount) ? payload.sourceCount : sourceEntries.length,
      maxLengthPerSource: payload?.maxLengthPerSource,
    };
    const prompt = payload?.scaffoldOnly
      ? buildRoundPromptScaffold(promptType, promptOptions)
      : buildRoundPrompt(promptType, sourceEntries, promptOptions);

    if (!prompt) {
      return {
        ok: false,
        message: `No prompt could be generated for ${promptType}.`,
        prompt: '',
      };
    }

    return {
      ok: true,
      message: payload?.scaffoldOnly
        ? `Built draft scaffold for ${promptType}.`
        : `Built shared draft for ${promptType}.`,
      prompt,
    };
  });

  ipcMain.handle('refresh-pages', async (event) => {
    await reloadPaneEntries(getPaneEntries());
    return true;
  });

  // Handle submit message request
  ipcMain.handle('submit-message', async (event) => {
    const supersizedPosition = mainWindow.getSupersizedPosition ? mainWindow.getSupersizedPosition() : null;
    const paneEntries = getPaneEntries();

    // If supersized, only submit to that position
    if (supersizedPosition) {
      const supersizedPane = paneEntries.find((paneEntry) => paneEntry.id === supersizedPosition);
      if (supersizedPane?.view?.webContents) {
        supersizedPane.view.webContents.send('submit-message');
      }
    } else {
      // Submit to all positions
      paneEntries.forEach((paneEntry) => {
        if (paneEntry.view && paneEntry.view.webContents) {
          paneEntry.view.webContents.send('submit-message');
        }
      });
    }
    return true;
  });

  ipcMain.handle('submit-message-to-panes', async (event, payload = {}) => {
    return submitMessageToPaneIds(payload?.paneIds);
  });

  // Handle new chat request
  ipcMain.handle('new-chat', async (event) => {
    getPaneEntries().forEach((paneEntry) => {
      if (paneEntry.view && paneEntry.view.webContents) {
        paneEntry.view.webContents.send('new-chat');
      }
    });
    return true;
  });

  ipcMain.handle('private-new-chat', async () => {
    const supportedProviders = new Set(['grok', 'gemini', 'chatgpt']);
    const paneEntries = getPaneEntries().filter((paneEntry) => {
      return supportedProviders.has(paneEntry?.view?.providerKey) && paneEntry?.view?.webContents;
    });

    if (paneEntries.length === 0) {
      return {
        ok: false,
        message: 'Private New Chat needs at least one Grok, Gemini, or ChatGPT pane.',
        results: [],
      };
    }

    const requestId = `private-new-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const responsePromise = new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        const pending = pendingPrivateNewChatRequests.get(requestId);
        if (!pending) {
          return;
        }

        pendingPrivateNewChatRequests.delete(requestId);
        resolve(buildPrivateNewChatResponse(pending.paneEntries, pending.results));
      }, 12000);

      pendingPrivateNewChatRequests.set(requestId, {
        paneEntries,
        results: [],
        resolve,
        timeoutHandle,
      });
    });

    paneEntries.forEach((paneEntry) => {
      paneEntry.view.webContents.send('private-new-chat', {
        requestId,
        paneId: paneEntry.id,
      });
    });

    return responsePromise;
  });

  ipcMain.handle('private-new-chat-result', async (event, payload) => {
    const requestId = payload?.requestId;
    if (!requestId) {
      return false;
    }

    const pending = pendingPrivateNewChatRequests.get(requestId);
    if (!pending) {
      return false;
    }

    const normalizedPayload = {
      paneId: payload?.paneId || null,
      provider: payload?.provider || null,
      ok: Boolean(payload?.ok),
      error: payload?.error || null,
    };

    const existingIndex = pending.results.findIndex((entry) => entry.paneId === normalizedPayload.paneId);
    if (existingIndex >= 0) {
      pending.results[existingIndex] = normalizedPayload;
    } else {
      pending.results.push(normalizedPayload);
    }

    if (pending.results.length >= pending.paneEntries.length) {
      clearTimeout(pending.timeoutHandle);
      pendingPrivateNewChatRequests.delete(requestId);
      pending.resolve(buildPrivateNewChatResponse(pending.paneEntries, pending.results));
    }

    return true;
  });
  // Handle zoom in request
  ipcMain.handle('zoom-in', async (event) => {
    const newZoom = Math.min(currentZoomFactor + 0.1, 2.0); // Max 200%
    currentZoomFactor = newZoom;

    if (mainWindow.setPaneZoomFactor) {
      mainWindow.setPaneZoomFactor(newZoom);
    }

    return newZoom;
  });

  // Handle zoom out request
  ipcMain.handle('zoom-out', async (event) => {
    const newZoom = Math.max(currentZoomFactor - 0.1, 0.5); // Min 50%
    currentZoomFactor = newZoom;

    if (mainWindow.setPaneZoomFactor) {
      mainWindow.setPaneZoomFactor(newZoom);
    }

    return newZoom;
  });

  // Handle toggle supersize request
  ipcMain.handle('toggle-supersize', async (event, position) => {
    if (mainWindow.toggleSupersize) {
      const supersizedPosition = mainWindow.toggleSupersize(position);
      return supersizedPosition;
    }
    return null;
  });

  // Handle change provider request
  ipcMain.handle('change-provider', async (event, position, newProvider) => {
    if (mainWindow.changeProvider) {
      return mainWindow.changeProvider(position, newProvider);
    }
    return false;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (codexBridge) {
    codexBridge.stop().catch((error) => {
      console.error('Failed to stop SchemeChat Codex MCP server:', error);
    });
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    mainWindow = await windowManager.createWindow();
    hideNativeAppMenu(mainWindow);
  }
});
