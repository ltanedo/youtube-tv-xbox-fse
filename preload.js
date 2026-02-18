
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    sendGamepadInput: (data) => {
        ipcRenderer.send('gamepad-input', data);
    },
    log: (message) => {
        ipcRenderer.send('log', message);
        updateDebugOverlay(message);
    }
});

// Create debug overlay
let debugOverlay = null;
function createDebugOverlay() {
    if (debugOverlay) return;
    
    debugOverlay = document.createElement('div');
    debugOverlay.id = 'gamepad-debug';
    debugOverlay.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: #0f0;
        padding: 15px;
        font-family: monospace;
        font-size: 14px;
        z-index: 999999;
        border-radius: 8px;
        border: 2px solid #0f0;
        max-width: 400px;
        line-height: 1.5;
        pointer-events: none;
    `;
    debugOverlay.innerHTML = 'Gamepad Debug:<br>Initializing...';
    document.body.appendChild(debugOverlay);
}

function updateDebugOverlay(message) {
    if (!debugOverlay) {
        createDebugOverlay();
    }
    const timestamp = new Date().toLocaleTimeString();
    debugOverlay.innerHTML += `<br>[${timestamp}] ${message}`;
    // Keep only last 20 lines
    const lines = debugOverlay.innerHTML.split('<br>');
    if (lines.length > 21) {
        debugOverlay.innerHTML = lines.slice(lines.length - 20).join('<br>');
    }
    debugOverlay.scrollTop = debugOverlay.scrollHeight;
}

// Gamepad polling logic
let pollingInterval = null;
let lastButtonStates = {};

function pollGamepad() {
    const gamepads = navigator.getGamepads();
    
    for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp && gp.connected) {
            const buttons = [];
            for (let j = 0; j < gp.buttons.length; j++) {
                buttons.push({
                    pressed: gp.buttons[j].pressed,
                    value: gp.buttons[j].value
                });
                
                // Track button presses for debug
                if (gp.buttons[j].pressed && !lastButtonStates[j]) {
                    updateDebugOverlay(`Button ${j} PRESSED`);
                }
                lastButtonStates[j] = gp.buttons[j].pressed;
            }
            
            const axes = [...gp.axes];
            
            window.electronAPI.sendGamepadInput({
                connected: true,
                index: i,
                id: gp.id,
                buttons: buttons,
                axes: axes,
                timestamp: gp.timestamp
            });
            break;
        }
    }
}

// Listen for gamepad connection events
window.addEventListener('gamepadconnected', (e) => {
    console.log('Gamepad connected:', e.gamepad.id);
    window.electronAPI.log('✓ Gamepad CONNECTED: ' + e.gamepad.id);
    if (!pollingInterval) {
        pollingInterval = setInterval(pollGamepad, 50);
    }
});

window.addEventListener('gamepaddisconnected', (e) => {
    console.log('Gamepad disconnected:', e.gamepad.id);
    window.electronAPI.log('✗ Gamepad DISCONNECTED');
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
});

// Check for already connected gamepad after page loads
window.addEventListener('load', () => {
    setTimeout(() => {
        createDebugOverlay();
        updateDebugOverlay('Checking for gamepads...');
        
        const gamepads = navigator.getGamepads();
        let found = false;
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] && gamepads[i].connected) {
                updateDebugOverlay('✓ Gamepad FOUND: ' + gamepads[i].id);
                found = true;
                pollingInterval = setInterval(pollGamepad, 50);
                break;
            }
        }
        if (!found) {
            updateDebugOverlay('✗ No gamepad detected');
            updateDebugOverlay('→ Click page & press button');
        }
    }, 2000);
});

// Add a click handler to activate gamepad
document.addEventListener('click', () => {
    updateDebugOverlay('Page clicked - rechecking...');
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
            if (!pollingInterval) {
                updateDebugOverlay('Starting polling after click');
                pollingInterval = setInterval(pollGamepad, 50);
            }
            break;
        }
    }
}, true);
