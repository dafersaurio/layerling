const { app, BrowserWindow, Menu, shell, dialog, session } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const mime = require('mime-types');

// Base directory for static files
const WEB_DIR = path.join(__dirname, 'web');
const PREFERRED_PORT = 39281;

let mainWindow = null;
let server = null;
let serverPort = PREFERRED_PORT;

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

function startLocalServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
        let decodedPath = decodeURIComponent(parsedUrl.pathname);

        // Security check: prevent directory traversal
        let filePath = path.normalize(path.join(WEB_DIR, decodedPath));
        const rel = path.relative(WEB_DIR, filePath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          res.writeHead(403);
          res.end('Access Denied');
          return;
        }

        // Check if path is a directory or lacks extension
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            const indexHtml = path.join(filePath, 'index.html');
            if (fs.existsSync(indexHtml)) {
              filePath = indexHtml;
            }
          }
        } else {
          // If file doesn't exist, try adding .html or /index.html (Next.js trailing slash routing)
          if (fs.existsSync(`${filePath}.html`)) {
            filePath = `${filePath}.html`;
          } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
            filePath = path.join(filePath, 'index.html');
          } else if (!path.extname(decodedPath)) {
            // Only fallback to index.html for extension-less client routes (SPA)
            filePath = path.join(WEB_DIR, 'index.html');
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
        }

        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        const stat = fs.statSync(filePath);
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';

        const headers = {
          'Content-Type': mimeType,
          'Content-Length': stat.size,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        };

        res.writeHead(200, headers);
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (err) {
        console.error('Server error:', err);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    const tryListen = (port, retriesLeft = 10) => {
      const onError = (err) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
          console.warn(`Layerling port ${port} busy, trying port ${port + 1}...`);
          tryListen(port + 1, retriesLeft - 1);
        } else {
          reject(err);
        }
      };

      const onListening = () => {
        server.removeListener('error', onError);
        serverPort = server.address().port;
        console.log(`Layerling local server running at http://127.0.0.1:${serverPort}`);
        resolve(serverPort);
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };

    tryListen(PREFERRED_PORT);
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

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false, // Prevents showing until initial paint is complete (no white/black flash or unstyled blur)
    title: 'Layerling - 3D CAD',
    icon: path.join(__dirname, 'build', 'icon.icns'),
    backgroundColor: '#fafaf9',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  // Only show window when renderer has painted the first frame cleanly
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!url.startsWith(`http://127.0.0.1:${port}`)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  // Handle downloads with native macOS save sheet (e.g. Export STL, STEP, OBJ, 3MF)
  session.defaultSession.on('will-download', (event, item, webContents) => {
    item.setSaveDialogOptions({
      defaultPath: item.getFilename(),
    });
    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        console.log('Download interrupted');
      }
    });
    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log('Download completed:', item.getSavePath());
      }
    });
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createMenu();
  try {
    const port = await startLocalServer();
    await createWindow(port);

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow(port);
      }
    });
  } catch (err) {
    console.error('Failed to initialize app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (server) server.close();
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});
