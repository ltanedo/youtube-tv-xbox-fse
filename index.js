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

        // Enter Picture-in-Picture automatically when video starts to enable background play
        win.webContents.executeJavaScript(`
            const observer = new MutationObserver(() => {
                const video = document.querySelector('video');
                if (video && video.src && document.pictureInPictureElement !== video) {
                    try {
                        video.requestPictureInPicture().catch(() => {});
                        console.log('Entered PiP for background play');
                    } catch(e) {}
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
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