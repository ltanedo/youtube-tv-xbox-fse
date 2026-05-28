#[cfg(target_os = "windows")]
use std::thread;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};

use tauri::Manager;
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_DOWN, VK_ESCAPE,
    VK_LEFT, VK_NEXT, VK_OEM_2, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SPACE, VK_UP,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::XboxController::{XInputGetState, XINPUT_STATE};

const YOUTUBE_TV_URL: &str = "https://www.youtube.com/tv#/";
const CONSOLE_USER_AGENT: &str = "Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)";
const WEBVIEW2_BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,UserAgentClientHint";
const NAVIGATOR_SPOOF_SCRIPT: &str = r#"
(() => {
  const userAgent = "Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)";
  const platform = "PlayStation 4";
  const vendor = "Sony Computer Entertainment Inc.";

  const define = (target, property, value) => {
    try {
      Object.defineProperty(target, property, {
        get: () => value,
        configurable: true
      });
    } catch (_) {}
  };

  define(Navigator.prototype, "userAgent", userAgent);
  define(navigator, "userAgent", userAgent);
  define(Navigator.prototype, "appVersion", userAgent);
  define(navigator, "appVersion", userAgent);
  define(Navigator.prototype, "platform", platform);
  define(navigator, "platform", platform);
  define(Navigator.prototype, "vendor", vendor);
  define(navigator, "vendor", vendor);
  define(Navigator.prototype, "userAgentData", undefined);
  define(navigator, "userAgentData", undefined);
})();
"#;

// Numeric values of XInput buttons
#[cfg(target_os = "windows")]
const D_UP: u16 = 0x0001;
#[cfg(target_os = "windows")]
const D_DOWN: u16 = 0x0002;
#[cfg(target_os = "windows")]
const D_LEFT: u16 = 0x0004;
#[cfg(target_os = "windows")]
const D_RIGHT: u16 = 0x0008;
#[cfg(target_os = "windows")]
const START: u16 = 0x0010;
#[cfg(target_os = "windows")]
const BACK: u16 = 0x0020;
#[cfg(target_os = "windows")]
const L_THUMB: u16 = 0x0040;
#[cfg(target_os = "windows")]
const R_THUMB: u16 = 0x0080;
#[cfg(target_os = "windows")]
const L_SHOULDER: u16 = 0x0100;
#[cfg(target_os = "windows")]
const R_SHOULDER: u16 = 0x0200;
#[cfg(target_os = "windows")]
const BTN_A: u16 = 0x1000;
#[cfg(target_os = "windows")]
const BTN_B: u16 = 0x2000;
#[cfg(target_os = "windows")]
const BTN_X: u16 = 0x4000;
#[cfg(target_os = "windows")]
const BTN_Y: u16 = 0x8000;

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct KeyMapping {
    flag: u16,
    vk: VIRTUAL_KEY,
    allow_repeat: bool,
}

#[cfg(target_os = "windows")]
fn trigger_key_press(vk: VIRTUAL_KEY) {
    let inputs = [
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
    ];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(target_os = "windows")]
pub fn start_xinput_polling() {
    thread::spawn(move || {
        let mappings = [
            KeyMapping {
                flag: D_UP,
                vk: VK_UP,
                allow_repeat: true,
            },
            KeyMapping {
                flag: D_DOWN,
                vk: VK_DOWN,
                allow_repeat: true,
            },
            KeyMapping {
                flag: D_LEFT,
                vk: VK_LEFT,
                allow_repeat: true,
            },
            KeyMapping {
                flag: D_RIGHT,
                vk: VK_RIGHT,
                allow_repeat: true,
            },
            KeyMapping {
                flag: BTN_A,
                vk: VK_RETURN,
                allow_repeat: false,
            },
            KeyMapping {
                flag: BTN_B,
                vk: VK_ESCAPE,
                allow_repeat: false,
            },
            KeyMapping {
                flag: BTN_X,
                vk: VK_SPACE,
                allow_repeat: false,
            },
            KeyMapping {
                flag: BTN_Y,
                vk: VK_OEM_2,
                allow_repeat: false,
            }, // '/' key
            KeyMapping {
                flag: START,
                vk: VK_RETURN,
                allow_repeat: false,
            },
            KeyMapping {
                flag: BACK,
                vk: VK_ESCAPE,
                allow_repeat: false,
            },
            KeyMapping {
                flag: L_SHOULDER,
                vk: VK_PRIOR,
                allow_repeat: false,
            }, // PageUp
            KeyMapping {
                flag: R_SHOULDER,
                vk: VK_NEXT,
                allow_repeat: false,
            }, // PageDown
            KeyMapping {
                flag: L_THUMB,
                vk: VK_RETURN,
                allow_repeat: false,
            },
            KeyMapping {
                flag: R_THUMB,
                vk: VK_ESCAPE,
                allow_repeat: false,
            },
        ];

        // Track state for up to 4 controllers
        let mut button_held = [[false; 16]; 4];
        let mut button_last_pressed = [[Instant::now(); 16]; 4];
        let mut dpad_repeat_last_triggered = [[Instant::now(); 16]; 4];
        let mut axis_held_pos = [[false; 2]; 4]; // [LeftX_pos, LeftY_pos]
        let mut axis_held_neg = [[false; 2]; 4]; // [LeftX_neg, LeftY_neg]

        let axis_threshold = 0.3f32;
        let cooldown = Duration::from_millis(100);
        let repeat_delay = Duration::from_millis(300);
        let repeat_rate = Duration::from_millis(100);

        loop {
            for controller_idx in 0..4 {
                let mut state = XINPUT_STATE::default();
                let result = unsafe { XInputGetState(controller_idx, &mut state) };

                if result == 0 {
                    // Controller is connected
                    let buttons = state.Gamepad.wButtons.0; // Extract u16 from newtype

                    // Process mapped buttons
                    for (map_idx, map) in mappings.iter().enumerate() {
                        let is_pressed = (buttons & map.flag) != 0;
                        let held = button_held[controller_idx as usize][map_idx];
                        let now = Instant::now();

                        if is_pressed {
                            if !held {
                                // First press
                                if now.duration_since(
                                    button_last_pressed[controller_idx as usize][map_idx],
                                ) >= cooldown
                                {
                                    trigger_key_press(map.vk);
                                    button_held[controller_idx as usize][map_idx] = true;
                                    button_last_pressed[controller_idx as usize][map_idx] = now;
                                    dpad_repeat_last_triggered[controller_idx as usize][map_idx] =
                                        now;
                                }
                            } else if map.allow_repeat {
                                // Repeat logic for DPAD/navigation
                                let first_press_dur = now.duration_since(
                                    button_last_pressed[controller_idx as usize][map_idx],
                                );
                                let last_trigger_dur = now.duration_since(
                                    dpad_repeat_last_triggered[controller_idx as usize][map_idx],
                                );

                                if first_press_dur >= repeat_delay
                                    && last_trigger_dur >= repeat_rate
                                {
                                    trigger_key_press(map.vk);
                                    dpad_repeat_last_triggered[controller_idx as usize][map_idx] =
                                        now;
                                }
                            }
                        } else {
                            button_held[controller_idx as usize][map_idx] = false;
                        }
                    }

                    // Process Left Analog Stick axes
                    // Axis 0: LeftX
                    {
                        let val = state.Gamepad.sThumbLX as f32 / 32768.0;
                        let held_pos = axis_held_pos[controller_idx as usize][0]; // Right
                        let held_neg = axis_held_neg[controller_idx as usize][0]; // Left

                        if val > axis_threshold {
                            if !held_pos {
                                trigger_key_press(VK_RIGHT);
                                axis_held_pos[controller_idx as usize][0] = true;
                            }
                            axis_held_neg[controller_idx as usize][0] = false;
                        } else if val < -axis_threshold {
                            if !held_neg {
                                trigger_key_press(VK_LEFT);
                                axis_held_neg[controller_idx as usize][0] = true;
                            }
                            axis_held_pos[controller_idx as usize][0] = false;
                        } else {
                            axis_held_pos[controller_idx as usize][0] = false;
                            axis_held_neg[controller_idx as usize][0] = false;
                        }
                    }

                    // Axis 1: LeftY (positive is up, negative is down)
                    {
                        let val = state.Gamepad.sThumbLY as f32 / 32768.0;
                        let held_pos = axis_held_pos[controller_idx as usize][1]; // Up
                        let held_neg = axis_held_neg[controller_idx as usize][1]; // Down

                        if val > axis_threshold {
                            if !held_pos {
                                trigger_key_press(VK_UP);
                                axis_held_pos[controller_idx as usize][1] = true;
                            }
                            axis_held_neg[controller_idx as usize][1] = false;
                        } else if val < -axis_threshold {
                            if !held_neg {
                                trigger_key_press(VK_DOWN);
                                axis_held_neg[controller_idx as usize][1] = true;
                            }
                            axis_held_pos[controller_idx as usize][1] = false;
                        } else {
                            axis_held_pos[controller_idx as usize][1] = false;
                            axis_held_neg[controller_idx as usize][1] = false;
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(50));
        }
    });
}

#[cfg(target_os = "windows")]
fn force_webview2_user_agent(webview: tauri::webview::PlatformWebview) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings2;
    use windows_core::{Interface, HSTRING};

    unsafe {
        let core_webview = webview
            .controller()
            .CoreWebView2()
            .map_err(|error| error.to_string())?;
        let settings = core_webview.Settings().map_err(|error| error.to_string())?;
        let settings2 = settings
            .cast::<ICoreWebView2Settings2>()
            .map_err(|error| error.to_string())?;

        settings2
            .SetUserAgent(&HSTRING::from(CONSOLE_USER_AGENT))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn should_clear_webview_data() -> bool {
    matches!(
        std::env::var("YTTV_CLEAR_WEBVIEW_DATA").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE") | Ok("yes") | Ok("YES")
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let webview_data_dir = app.path().app_local_data_dir()?.join("webview-uach-off");

            // Create the window programmatically to set the User-Agent correctly.
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("YouTubeTV")
            .fullscreen(true)
            .user_agent(CONSOLE_USER_AGENT)
            .additional_browser_args(WEBVIEW2_BROWSER_ARGS)
            .data_directory(webview_data_dir)
            .initialization_script(NAVIGATOR_SPOOF_SCRIPT)
            .build()?;

            #[cfg(target_os = "windows")]
            window.with_webview(|webview| {
                if let Err(error) = force_webview2_user_agent(webview) {
                    log::warn!("failed to force WebView2 user agent: {error}");
                }
            })?;

            if should_clear_webview_data() {
                window.clear_all_browsing_data()?;
            }

            // Now navigate to YouTube TV using the correctly initialized User-Agent
            window.navigate(tauri::Url::parse(YOUTUBE_TV_URL).unwrap())?;

            // Start XInput polling thread on Windows
            #[cfg(target_os = "windows")]
            {
                start_xinput_polling();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
