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
    win.setMenu(null);

    win.loadURL('https://youtube.com/tv', {
        userAgent: 'Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)'
    });

    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(0.5);

        // Create floating PiP button in top right
        win.webContents.executeJavaScript(`
            const btn = document.createElement('button');
            btn.id = 'pip-btn';
            btn.textContent = 'BG PLAY';
            btn.style.cssText = 'position:fixed; top:10px; right:10px; z-index:999999; background:rgba(255,0,0,0.8); color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:14px; font-weight:bold;';
            btn.onclick = function() {
                const video = document.querySelector('video');
                if (video && document.pictureInPictureElement === video) {
                    document.exitPictureInPicture();
                    btn.textContent = 'BG PLAY';
                } else if (video) {
                    video.requestPictureInPicture().catch(e => console.error('PiP error:', e));
                    btn.textContent = 'EXIT PiP';
                }
            };
            document.body.appendChild(btn);
        `).catch(() => {});
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