const { app, ipcMain, session, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const { buildDiscussionPrompt, captureStableLatestReply } = require('./provider-sync');
const windowManager = require('./window-manager');

let mainWindow;
let currentZoomFactor = 1.0;
const pendingPrivateNewChatRequests = new Map();

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
  // Handle permissions for media (microphone)
  session.fromPartition('persist:shared').setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'clipboard-read' || permission === 'clipboard-write' || permission === 'clipboard-sanitized-write') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.fromPartition('persist:shared').setPermissionCheckHandler((webContents, permission, origin) => {
    if (permission === 'media' || permission === 'clipboard-read' || permission === 'clipboard-write' || permission === 'clipboard-sanitized-write') {
      return true;
    }
    return false;
  });

  hideNativeAppMenu();

  mainWindow = await windowManager.createWindow();
  hideNativeAppMenu(mainWindow);

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();

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

  ipcMain.handle('selector-error', async (event, source, error) => {
    if (mainWindow.mainView && mainWindow.mainView.webContents) {
      mainWindow.mainView.webContents.send('selector-error', { source, error });
    }
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

  ipcMain.handle('refresh-pages', async (event) => {
    const reloadPromises = getPaneEntries().map((paneEntry) => {
      return new Promise((resolve) => {
        const view = paneEntry.view;
        if (view && view.webContents) {
          const onLoad = () => {
            view.webContents.setZoomFactor(currentZoomFactor);
            view.webContents.removeListener('did-finish-load', onLoad);
            resolve();
          };
          view.webContents.on('did-finish-load', onLoad);
          view.webContents.reload();
        } else {
          resolve();
        }
      });
    });
    await Promise.all(reloadPromises);
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

app.on('activate', async () => {
  if (mainWindow === null) {
    mainWindow = await windowManager.createWindow();
    hideNativeAppMenu(mainWindow);
  }
});
