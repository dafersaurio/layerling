const { app, BrowserWindow, Menu, shell, session, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Base directory for static files
const WEB_DIR = path.join(__dirname, 'web');

// Register custom 'app' scheme as standard and secure BEFORE app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

// Enforce single instance so multiple launches focus the existing app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function setupProtocol() {
  protocol.handle('app', (request) => {
    const parsedUrl = new URL(request.url);
    let decodedPath = decodeURIComponent(parsedUrl.pathname);

    // Security check: prevent directory traversal
    let filePath = path.normalize(path.join(WEB_DIR, decodedPath));
    const rel = path.relative(WEB_DIR, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return new Response('Access Denied', { status: 403 });
    }

    // Check if path is a directory or lacks extension (Next.js trailing slash routing)
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const indexHtml = path.join(filePath, 'index.html');
        if (fs.existsSync(indexHtml)) {
          filePath = indexHtml;
        }
      }
    } else {
      // If file doesn't exist, try adding .html or /index.html (Next.js SPA routing)
      if (fs.existsSync(`${filePath}.html`)) {
        filePath = `${filePath}.html`;
      } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
        filePath = path.join(filePath, 'index.html');
      } else if (!path.extname(decodedPath)) {
        filePath = path.join(WEB_DIR, 'index.html');
      } else {
        return new Response('Not Found', { status: 404 });
      }
    }

    if (!fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 });
    }

    // Natively stream the requested file using Electron's high-performance net.fetch
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'About Layerling' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide', label: 'Hide Layerling' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit', label: 'Quit Layerling' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
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
        { role: 'selectAll' },
      ],
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
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Layerling Website',
          click: async () => {
            await shell.openExternal('https://layerling.com');
          },
        },
        {
          label: 'GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/henmedia/layerling');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false, // Prevents showing until initial paint is complete
    title: 'Layerling - 3D CAD',
    icon: path.join(__dirname, 'build', 'icon.icns'),
    backgroundColor: '#fafaf9',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      scrollBounce: false, // Prevents macOS trackpad rubber-band bounce
    },
  });

  // Lock Chromium visual page zoom so Mac trackpad pinch-to-zoom exclusively controls the 3D CAD canvas
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  });

  // Only show window when renderer has painted the first frame cleanly
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Load purely from internal native app:// protocol (NO localhost, NO TCP ports)
  await mainWindow.loadURL('app://layerling/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupDownloads() {
  // Handle downloads with native macOS save sheet (e.g. Export STL, STEP, OBJ, 3MF)
  session.defaultSession.on('will-download', (event, item) => {
    const filename = item.getFilename();
    const defaultPath = path.join(app.getPath('downloads'), filename);
    item.setSaveDialogOptions({ defaultPath });
    item.on('updated', (_event, state) => {
      if (state === 'interrupted') {
        console.log('Download interrupted');
      }
    });
    item.once('done', (_event, state) => {
      if (state === 'completed') {
        console.log('Download completed:', item.getSavePath());
      }
    });
  });
}

app.whenReady().then(async () => {
  setupProtocol();
  createMenu();
  setupDownloads();
  try {
    await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  } catch (err) {
    console.error('Failed to initialize app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
