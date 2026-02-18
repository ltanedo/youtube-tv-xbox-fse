
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
    $state = New-Object XInput+XINPUT_STATE
    $result = [XInput]::XInputGetState(0, [ref]$state)
    
    if ($result -eq 0) {
        $buttons = $state.Gamepad.wButtons
        
        # Convert stick values (-32768 to 32767) to (-1.0 to 1.0)
        $thumbLX = $state.Gamepad.sThumbLX / 32768.0
        $thumbLY = $state.Gamepad.sThumbLY / 32768.0
        $thumbRX = $state.Gamepad.sThumbRX / 32768.0
        $thumbRY = $state.Gamepad.sThumbRY / 32768.0
        
        # Convert triggers (0-255) to (0.0-1.0)
        $leftTrigger = $state.Gamepad.bLeftTrigger / 255.0
        $rightTrigger = $state.Gamepad.bRightTrigger / 255.0
        
        $output = @{
            Connected = $true
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
                LeftX = [math]::Round($thumbLX, 4)
                LeftY = [math]::Round($thumbLY, 4)
                RightX = [math]::Round($thumbRX, 4)
                RightY = [math]::Round($thumbRY, 4)
            }
            Triggers = @{
                Left = [math]::Round($leftTrigger, 4)
                Right = [math]::Round($rightTrigger, 4)
            }
        }
        $output | ConvertTo-Json -Compress
    } else {
        @{ Connected = $false; ErrorCode = $result } | ConvertTo-Json -Compress
    }
}

# Poll gamepad state
while ($true) {
    Get-GamepadState
    Start-Sleep -Milliseconds 50
}
