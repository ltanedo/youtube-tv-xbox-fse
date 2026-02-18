const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Store gamepad state to detect button presses (prevent multiple triggers)
const gamepadState = {};
const buttonLastPressed = {}; // Track last press time for cooldown
const dpadRepeatState = {}; // Track D-pad repeat timing
let mainWindow = null;
let xinputPolling = null;

// Threshold for analog sticks (reduced for better responsiveness)
const AXIS_THRESHOLD = 0.3;

// Cooldown time in ms to prevent double inputs
const BUTTON_COOLDOWN = 100;

// D-pad repeat settings (for continuous scrolling)
const DPAD_REPEAT_DELAY = 300; // Initial delay before repeat starts (ms)
const DPAD_REPEAT_RATE = 100;   // Repeat rate while held (ms)

// Windows XInput state structure constants
const XINPUT_GAMEPAD_DPAD_UP = 0x0001;
const XINPUT_GAMEPAD_DPAD_DOWN = 0x0002;
const XINPUT_GAMEPAD_DPAD_LEFT = 0x0004;
const XINPUT_GAMEPAD_DPAD_RIGHT = 0x0008;
const XINPUT_GAMEPAD_START = 0x0010;
const XINPUT_GAMEPAD_BACK = 0x0020;
const XINPUT_GAMEPAD_LEFT_THUMB = 0x0040;
const XINPUT_GAMEPAD_RIGHT_THUMB = 0x0080;
const XINPUT_GAMEPAD_LEFT_SHOULDER = 0x0100;
const XINPUT_GAMEPAD_RIGHT_SHOULDER = 0x0200;
const XINPUT_GAMEPAD_A = 0x1000;
const XINPUT_GAMEPAD_B = 0x2000;
const XINPUT_GAMEPAD_X = 0x4000;
const XINPUT_GAMEPAD_Y = 0x8000;

// Create PowerShell script for XInput polling
function createXInputScript() {
    // Use temp directory for the script since app.asar is read-only when packaged
    const tmpDir = app.getPath('temp');
    const scriptPath = path.join(tmpDir, 'youtube-tv-xinput-poller.ps1');
    
    const psScript = `
# PowerShell XInput Poller
try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class XInput {
    [DllImport("xinput1_4.dll", SetLastError = true)]
    public static extern uint XInputGetState(uint dwUserIndex, out XINPUT_STATE pState);

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_GAMEPAD {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_STATE {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }
}
"@
} catch {
    Write-Host "ERROR: Failed to load XInput: $_"
}

function Get-GamepadState {
    # Initialize combined state (no controllers connected yet)
    $anyConnected = $false
    $combinedButtons = 0
    $combinedLeftX = 0.0
    $combinedLeftY = 0.0
    $combinedRightX = 0.0
    $combinedRightY = 0.0
    $combinedLeftTrigger = 0.0
    $combinedRightTrigger = 0.0
    $controllerCount = 0

    # Poll all 4 controller slots (0-3)
    for ($i = 0; $i -lt 4; $i++) {
        $state = New-Object XInput+XINPUT_STATE
        $result = [XInput]::XInputGetState($i, [ref]$state)

        if ($result -eq 0) {
            # Controller is connected
            $anyConnected = $true
            $controllerCount++

            # Combine button states (OR operation)
            $combinedButtons = $combinedButtons -bor $state.Gamepad.wButtons

            # Combine stick values (sum them, we'll average later)
            $combinedLeftX += $state.Gamepad.sThumbLX / 32768.0
            $combinedLeftY += $state.Gamepad.sThumbLY / 32768.0
            $combinedRightX += $state.Gamepad.sThumbRX / 32768.0
            $combinedRightY += $state.Gamepad.sThumbRY / 32768.0

            # Combine triggers (use max value)
            $thisLeftTrigger = $state.Gamepad.bLeftTrigger / 255.0
            $thisRightTrigger = $state.Gamepad.bRightTrigger / 255.0
            if ($thisLeftTrigger -gt $combinedLeftTrigger) { $combinedLeftTrigger = $thisLeftTrigger }
            if ($thisRightTrigger -gt $combinedRightTrigger) { $combinedRightTrigger = $thisRightTrigger }
        }
    }

    if ($anyConnected) {
        # Average the stick values across controllers
        if ($controllerCount -gt 1) {
            $combinedLeftX = $combinedLeftX / $controllerCount
            $combinedLeftY = $combinedLeftY / $controllerCount
            $combinedRightX = $combinedRightX / $controllerCount
            $combinedRightY = $combinedRightY / $controllerCount
        }

        $buttons = $combinedButtons

        $output = @{
            Connected = $true
            ControllerCount = $controllerCount
            Buttons = @{
                A = [bool]($buttons -band 0x1000)
                B = [bool]($buttons -band 0x2000)
                X = [bool]($buttons -band 0x4000)
                Y = [bool]($buttons -band 0x8000)
                Start = [bool]($buttons -band 0x0010)
                Back = [bool]($buttons -band 0x0020)
                LeftShoulder = [bool]($buttons -band 0x0100)
                RightShoulder = [bool]($buttons -band 0x0200)
                LeftThumb = [bool]($buttons -band 0x0040)
                RightThumb = [bool]($buttons -band 0x0080)
                DPadUp = [bool]($buttons -band 0x0001)
                DPadDown = [bool]($buttons -band 0x0002)
                DPadLeft = [bool]($buttons -band 0x0004)
                DPadRight = [bool]($buttons -band 0x0008)
            }
            Axes = @{
                LeftX = [math]::Round($combinedLeftX, 4)
                LeftY = [math]::Round($combinedLeftY, 4)
                RightX = [math]::Round($combinedRightX, 4)
                RightY = [math]::Round($combinedRightY, 4)
            }
            Triggers = @{
                Left = [math]::Round($combinedLeftTrigger, 4)
                Right = [math]::Round($combinedRightTrigger, 4)
            }
        }
        $output | ConvertTo-Json -Compress
    } else {
        @{ Connected = $false; ErrorCode = 1167 } | ConvertTo-Json -Compress
    }
}

# Poll gamepad state
while ($true) {
    Get-GamepadState
    Start-Sleep -Milliseconds 50
}
`;
    
    fs.writeFileSync(scriptPath, psScript);
    return scriptPath;
}

function startXInputPolling() {
    const scriptPath = createXInputScript();
    const powershell = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath
    ]);

    let buffer = '';
    let lineCount = 0;
    
    powershell.stdout.on('data', (data) => {
        const output = data.toString();
        buffer += output;
        
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line
        
        lines.forEach(line => {
            line = line.trim();
            if (line) {
                lineCount++;
                if (lineCount <= 5) {
                    console.log('[XInput Raw]:', line);
                }
                
                try {
                    const state = JSON.parse(line);
                    if (state.Connected && mainWindow) {
                        handleXInputState(state);
                    } else if (!state.Connected) {
                        console.log('[XInput]: Controller not connected or detected');
                    }
                } catch (e) {
                    console.log('[XInput Parse Error]:', e.message, 'Line:', line);
                }
            }
        });
    });

    powershell.stderr.on('data', (data) => {
        console.error('XInput error:', data.toString());
    });

    powershell.on('close', (code) => {
        console.log(`XInput polling stopped with code ${code}`);
    });

    xinputPolling = powershell;
    console.log('XInput polling started');
    console.log('Waiting for controller input...');
}

function handleXInputState(state) {
    // Check if window still exists
    if (!mainWindow || mainWindow.isDestroyed()) {
        return;
    }

    const btn = state.Buttons;
    const axes = state.Axes;

    // Log controller count on first connection or when it changes
    if (state.ControllerCount !== undefined) {
        if (!handleXInputState.lastControllerCount || handleXInputState.lastControllerCount !== state.ControllerCount) {
            console.log(`[Controllers] ${state.ControllerCount} controller(s) connected`);
            handleXInputState.lastControllerCount = state.ControllerCount;
        }
    }

    // Log all button states for debugging
    const pressedButtons = Object.entries(btn).filter(([key, value]) => value === true);
    if (pressedButtons.length > 0) {
        console.log('[Debug] Pressed buttons:', pressedButtons.map(([k]) => k).join(', '));
    }
    
    // Log axis values when they move
    if (Math.abs(axes.LeftX) > 0.1 || Math.abs(axes.LeftY) > 0.1) {
        console.log(`[Debug] Left Stick - X: ${axes.LeftX.toFixed(3)}, Y: ${axes.LeftY.toFixed(3)}`);
    }
    if (Math.abs(axes.RightX) > 0.1 || Math.abs(axes.RightY) > 0.1) {
        console.log(`[Debug] Right Stick - X: ${axes.RightX.toFixed(3)}, Y: ${axes.RightY.toFixed(3)}`);
    }
    
    // Helper function to handle button press with debouncing
    const handleButton = (pressed, keyName, buttonId = null, allowRepeat = false) => {
        const now = Date.now();
        const stateKey = buttonId || keyName;

        if (pressed) {
            // First time pressing this button
            if (!gamepadState[stateKey]) {
                // Check cooldown
                const lastPressed = buttonLastPressed[stateKey] || 0;
                if (now - lastPressed < BUTTON_COOLDOWN) {
                    return; // Still in cooldown, skip
                }

                console.log(`Button pressed -> ${keyName}`);
                try {
                    sendKeyboardEvent(mainWindow, keyName);
                } catch (e) {
                    console.log('Error sending keyboard event:', e.message);
                }
                gamepadState[stateKey] = true;
                buttonLastPressed[stateKey] = now;

                // For repeatable buttons (D-pad), initialize repeat state
                if (allowRepeat) {
                    dpadRepeatState[stateKey] = {
                        firstPressTime: now,
                        lastRepeatTime: now
                    };
                }
            } else if (allowRepeat && dpadRepeatState[stateKey]) {
                // Button is held down - check if we should repeat
                const repeatState = dpadRepeatState[stateKey];
                const timeSinceFirstPress = now - repeatState.firstPressTime;
                const timeSinceLastRepeat = now - repeatState.lastRepeatTime;

                // Initial delay before repeat starts, then repeat at the repeat rate
                if (timeSinceFirstPress >= DPAD_REPEAT_DELAY && timeSinceLastRepeat >= DPAD_REPEAT_RATE) {
                    console.log(`Button repeat -> ${keyName}`);
                    try {
                        sendKeyboardEvent(mainWindow, keyName);
                    } catch (e) {
                        console.log('Error sending keyboard event:', e.message);
                    }
                    repeatState.lastRepeatTime = now;
                }
            }
        } else if (!pressed) {
            // Button released
            gamepadState[stateKey] = false;
            if (allowRepeat) {
                delete dpadRepeatState[stateKey];
            }
        }
    };

    // Helper function to handle analog stick with debouncing
    const handleAxis = (value, keyNamePos, keyNameNeg) => {
        if (value > AXIS_THRESHOLD && !gamepadState[keyNamePos]) {
            console.log(`Axis ${keyNamePos} (${value.toFixed(2)})`);
            try {
                sendKeyboardEvent(mainWindow, keyNamePos);
            } catch (e) {
                console.log('Error sending keyboard event:', e.message);
            }
            gamepadState[keyNamePos] = true;
        } else if (value < -AXIS_THRESHOLD && !gamepadState[keyNameNeg]) {
            console.log(`Axis ${keyNameNeg} (${value.toFixed(2)})`);
            try {
                sendKeyboardEvent(mainWindow, keyNameNeg);
            } catch (e) {
                console.log('Error sending keyboard event:', e.message);
            }
            gamepadState[keyNameNeg] = true;
        } else if (value > -AXIS_THRESHOLD && value < AXIS_THRESHOLD) {
            gamepadState[keyNamePos] = false;
            gamepadState[keyNameNeg] = false;
        }
    };

    // D-Pad (with repeat for continuous scrolling)
    handleButton(btn.DPadUp, 'ArrowUp', 'DPadUp', true);
    handleButton(btn.DPadDown, 'ArrowDown', 'DPadDown', true);
    handleButton(btn.DPadLeft, 'ArrowLeft', 'DPadLeft', true);
    handleButton(btn.DPadRight, 'ArrowRight', 'DPadRight', true);

    // Face buttons
    handleButton(btn.A, 'Enter', 'A');
    handleButton(btn.B, 'Escape', 'B');
    handleButton(btn.X, 'Space', 'X');
    handleButton(btn.Y, '/', 'Y');

    // Center buttons
    handleButton(btn.Start, 'Enter', 'Start');
    handleButton(btn.Back, 'Escape', 'Back');

    // Bumpers
    handleButton(btn.LeftShoulder, 'PageUp', 'LeftShoulder');
    handleButton(btn.RightShoulder, 'PageDown', 'RightShoulder');

    // Stick clicks
    handleButton(btn.LeftThumb, 'Enter', 'LeftThumb');
    handleButton(btn.RightThumb, 'Escape', 'RightThumb');

    // Left stick
    handleAxis(axes.LeftX, 'ArrowRight', 'ArrowLeft');
    handleAxis(axes.LeftY, 'ArrowDown', 'ArrowUp');
}

function sendKeyboardEvent(win, keyName, modifiers = []) {
    // Map key names to Electron sendInputEvent format (string keyCode for Electron 31+)
    const keyMap = {
        'ArrowUp': { keyCode: 'Up', code: 'ArrowUp' },
        'ArrowDown': { keyCode: 'Down', code: 'ArrowDown' },
        'ArrowLeft': { keyCode: 'Left', code: 'ArrowLeft' },
        'ArrowRight': { keyCode: 'Right', code: 'ArrowRight' },
        'Enter': { keyCode: 'Enter', code: 'Enter' },
        'Escape': { keyCode: 'Esc', code: 'Escape' },
        'Space': { keyCode: 'Space', code: 'Space' },
        '/': { keyCode: '/', code: 'Slash' },
        'PageUp': { keyCode: 'Prior', code: 'PageUp' },
        'PageDown': { keyCode: 'Next', code: 'PageDown' }
    };

    const keyInfo = keyMap[keyName];
    if (!keyInfo) {
        console.log(`[Keyboard] Unknown key: ${keyName}`);
        return;
    }

    console.log(`[Keyboard] Dispatching: ${keyName} (keyCode: "${keyInfo.keyCode}", code: "${keyInfo.code}")`);

    // Ensure window is focused
    if (win.isMinimized()) {
        win.restore();
    }
    win.focus();

    // Send keydown event
    try {
        win.webContents.sendInputEvent({
            type: 'keyDown',
            keyCode: keyInfo.keyCode
        });

        // For printable characters, also send a char event
        if (keyName === 'Space' || keyName === '/') {
            win.webContents.sendInputEvent({
                type: 'char',
                keyCode: keyName === 'Space' ? ' ' : '/'
            });
        }

        console.log(`[Keyboard] keyDown sent for ${keyName}`);
    } catch (e) {
        console.log(`[Keyboard] Error sending keyDown: ${e.message}`);
    }

    // Send keyup event after a short delay
    setTimeout(() => {
        try {
            win.webContents.sendInputEvent({
                type: 'keyUp',
                keyCode: keyInfo.keyCode
            });
            console.log(`[Keyboard] keyUp sent for ${keyName}`);
        } catch (e) {
            console.log(`[Keyboard] Error sending keyUp: ${e.message}`);
        }
    }, 10);
}

function createWindow() {
    const win = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    mainWindow = win;
    win.setMenu(null);

    // Stop polling when window is closed
    win.on('closed', () => {
        console.log('Window closed, stopping XInput polling...');
        if (xinputPolling) {
            xinputPolling.kill();
            xinputPolling = null;
        }
    });

    win.loadURL('https://youtube.com/tv', {
        userAgent: 'Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)'
    });

    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(0.5);
        console.log('YouTube TV Client: Controller support enabled');
        console.log('Starting XInput polling for Xbox controller detection...');
        
        // Focus the window and click to ensure YouTube TV can receive keyboard events
        setTimeout(() => {
            win.focus();
            win.webContents.sendInputEvent({ type: 'mouseDown', x: 0, y: 0, button: 'left', clickCount: 1 });
            win.webContents.sendInputEvent({ type: 'mouseUp', x: 0, y: 0, button: 'left', clickCount: 1 });
            console.log('Window focused for controller input');
        }, 1000);
        
        // Start XInput polling after page load
        startXInputPolling();
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

app.on('will-quit', () => {
    if (xinputPolling) {
        xinputPolling.kill();
    }
});

process.on('SIGINT', () => {
    if (xinputPolling) {
        xinputPolling.kill();
    }
    process.exit();
});
