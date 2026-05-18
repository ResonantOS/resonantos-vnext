#[cfg(target_os = "macos")]
use resonator_control::macos::MacOSControl;
use resonator_control::diagnostic::capability_manifest;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickRequest {
    pub x: i32,
    pub y: i32,
    pub button: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeRequest {
    pub text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyComboRequest {
    pub keys: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCaptureResult {
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
}

/// Parse width and height from a PNG IHDR chunk.
/// PNG layout: 8-byte signature, then IHDR chunk with width (4 bytes BE) at
/// offset 16 and height (4 bytes BE) at offset 20.
fn parse_png_dimensions(data: &[u8]) -> (u32, u32) {
    if data.len() < 24 {
        return (0, 0);
    }
    // Verify PNG signature
    if &data[..8] != &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return (0, 0);
    }
    let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
    let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
    (width, height)
}

#[tauri::command]
pub fn resonator_capability_manifest() -> Result<serde_json::Value, String> {
    Ok(capability_manifest())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn resonator_screen_capture() -> Result<ScreenCaptureResult, String> {
    use resonator_control::DesktopControl;
    let ctl = MacOSControl::new();
    let bytes = ctl.screen_capture().map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let (width, height) = parse_png_dimensions(&bytes);
    Ok(ScreenCaptureResult {
        png_base64: b64,
        width,
        height,
    })
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resonator_screen_capture() -> Result<ScreenCaptureResult, String> {
    Err("Screen capture is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn resonator_mouse_click(request: ClickRequest) -> Result<(), String> {
    use resonator_control::{DesktopControl, MouseButton};
    let ctl = MacOSControl::new();
    let button = match request.button.as_deref() {
        Some("right") => MouseButton::Right,
        Some("middle") => MouseButton::Middle,
        _ => MouseButton::Left,
    };
    ctl.mouse_click(request.x, request.y, button).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resonator_mouse_click(request: ClickRequest) -> Result<(), String> {
    Err("Mouse click is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn resonator_key_type(request: TypeRequest) -> Result<(), String> {
    use resonator_control::DesktopControl;
    let ctl = MacOSControl::new();
    ctl.key_type(&request.text).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resonator_key_type(request: TypeRequest) -> Result<(), String> {
    Err("Key type is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn resonator_key_combo(request: KeyComboRequest) -> Result<(), String> {
    use resonator_control::DesktopControl;
    let ctl = MacOSControl::new();
    let key_refs: Vec<&str> = request.keys.iter().map(|s| s.as_str()).collect();
    ctl.key_combo(&key_refs).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resonator_key_combo(request: KeyComboRequest) -> Result<(), String> {
    Err("Key combo is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn resonator_clipboard_get() -> Result<String, String> {
    use resonator_control::DesktopControl;
    let ctl = MacOSControl::new();
    ctl.clipboard_get().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resonator_clipboard_get() -> Result<String, String> {
    Err("Clipboard access is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn resonator_app_launch(name: String) -> Result<(), String> {
    use resonator_control::DesktopControl;
    let ctl = MacOSControl::new();
    ctl.app_launch(&name).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resonator_app_launch(name: String) -> Result<(), String> {
    Err("App launch is not supported on this platform".to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_png_dimensions_valid() {
        // Minimal valid PNG IHDR: signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4)
        let data = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, // IHDR chunk length (13)
            0x49, 0x48, 0x44, 0x52, // "IHDR"
            0x00, 0x00, 0x07, 0x80, // width = 1920
            0x00, 0x00, 0x04, 0x38, // height = 1080
        ];
        // Pad to at least 24 bytes (already exactly 24)
        let (w, h) = parse_png_dimensions(&data);
        assert_eq!(w, 1920);
        assert_eq!(h, 1080);
    }

    #[test]
    fn parse_png_dimensions_too_short() {
        let data = vec![0x89, 0x50, 0x4E, 0x47];
        let (w, h) = parse_png_dimensions(&data);
        assert_eq!(w, 0);
        assert_eq!(h, 0);
    }

    #[test]
    fn parse_png_dimensions_bad_signature() {
        let data = vec![0x00; 24];
        let (w, h) = parse_png_dimensions(&data);
        assert_eq!(w, 0);
        assert_eq!(h, 0);
    }

    #[test]
    fn capability_manifest_returns_os() {
        let m = resonator_capability_manifest().unwrap();
        assert!(m.get("os").is_some());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn screen_capture_has_real_dimensions() {
        let result = resonator_screen_capture().unwrap();
        assert!(result.width > 0, "width should be > 0, got {}", result.width);
        assert!(result.height > 0, "height should be > 0, got {}", result.height);
        assert!(!result.png_base64.is_empty());
    }
}
