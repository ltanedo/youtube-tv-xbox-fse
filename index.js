const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    // pressing alt can bring up the menu bar even when its hidden. This accounts for that and disables it entirely
    win.setMenu(null);

    win.loadURL('https://youtube.com/tv', {
        userAgent: 'Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)'
    });

    // setting zoom 50% to enable higher resolutions. has no effect on the applications UI.
    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(0.5);

        // Override Page Visibility API to prevent YouTube auto-pause on background
        win.webContents.executeJavaScript(`
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            console.log('Background play: Visibility API overridden');
        `);
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});