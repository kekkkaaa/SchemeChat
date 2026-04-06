const { app, ipcMain, session, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const windowManager = require('./window-manager');

let mainWindow;
let currentZoomFactor = 1.0;

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

  // Create standard application menu for macOS compatibility (Copy/Paste shortcuts)
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow = await windowManager.createWindow();

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();

  // IPC handler for text updates from renderer
  ipcMain.handle('send-text-update', async (event, text) => {
    const supersizedPosition = mainWindow.getSupersizedPosition ? mainWindow.getSupersizedPosition() : null;

    // If supersized, only send to that position
    if (supersizedPosition) {
      const view = mainWindow.viewPositions[supersizedPosition];
      if (view && view.webContents) {
        view.webContents.send('text-update', text);
      }
    } else {
      // Send text to all positions
      windowManager.POSITIONS.forEach(pos => {
        const view = mainWindow.viewPositions[pos];
        if (view && view.webContents) {
          view.webContents.send('text-update', text);
        }
      });
    }
  });

  ipcMain.handle('selector-error', async (event, source, error) => {
    if (mainWindow.mainView && mainWindow.mainView.webContents) {
      mainWindow.mainView.webContents.send('selector-error', { source, error });
    }
  });

  ipcMain.handle('rescan-selectors', async (event) => {
    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.reload();
      }
    });
    return true;
  });

  ipcMain.handle('refresh-pages', async (event) => {
    const reloadPromises = windowManager.POSITIONS.map(pos => {
      return new Promise((resolve) => {
        const view = mainWindow.viewPositions[pos];
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

    // If supersized, only submit to that position
    if (supersizedPosition) {
      const view = mainWindow.viewPositions[supersizedPosition];
      if (view && view.webContents) {
        view.webContents.send('submit-message');
      }
    } else {
      // Submit to all positions
      windowManager.POSITIONS.forEach(pos => {
        const view = mainWindow.viewPositions[pos];
        if (view && view.webContents) {
          view.webContents.send('submit-message');
        }
      });
    }
    return true;
  });

  // Handle new chat request
  ipcMain.handle('new-chat', async (event) => {
    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.send('new-chat');
      }
    });
    return true;
  });

  // Handle zoom in request
  ipcMain.handle('zoom-in', async (event) => {
    const newZoom = Math.min(currentZoomFactor + 0.1, 2.0); // Max 200%
    currentZoomFactor = newZoom;

    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.setZoomFactor(newZoom);
      }
    });

    return newZoom;
  });

  // Handle zoom out request
  ipcMain.handle('zoom-out', async (event) => {
    const newZoom = Math.max(currentZoomFactor - 0.1, 0.5); // Min 50%
    currentZoomFactor = newZoom;

    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.setZoomFactor(newZoom);
      }
    });

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
      return mainWindow.changeProvider(position, newProvider, currentZoomFactor);
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
  }
});
