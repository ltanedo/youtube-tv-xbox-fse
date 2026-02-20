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

    // Toggle fullscreen with 'G' key (only when window focused)
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key.toLowerCase() === 'g') {
            event.preventDefault();
            win.setFullScreen(!win.isFullScreen());
        }
    });

    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(0.5);

        // Toggle PiP function
        win.webContents.executeJavaScript(`
            window.togglePiP = function() {
                const pipVideo = document.pictureInPictureElement || document.querySelector('video');
                if (pipVideo) {
                    if (document.pictureInPictureElement) {
                        document.exitPictureInPicture();
                    } else {
                        pipVideo.requestPictureInPicture().catch(e => console.error('PiP error:', e));
                    }
                }
            };

            // H key listener for PiP
            document.addEventListener('keydown', function(e) {
                if (e.key.toLowerCase() === 'h') {
                    e.stopPropagation();
                    e.preventDefault();
                    window.togglePiP();
                }
            }, true);
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