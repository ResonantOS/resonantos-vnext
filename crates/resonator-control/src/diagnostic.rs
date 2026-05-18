//! Boot-time capability manifest for the resonator-control crate.
//!
//! Call [`capability_manifest`] once at startup to verify which features are
//! available on the current machine.  The result is a JSON object that can be
//! logged, sent to the orchestrator, or stored in SSoT.

use serde_json::{json, Value};
use std::process::Command;

/// Run a quick smoke-test for each capability and return a JSON manifest.
///
/// ```json
/// {
///   "os": "macos",
///   "arch": "aarch64",
///   "screen_capture": true,
///   "accessibility": true,
///   "clipboard": true,
///   "app_control": true,
///   "overlay_ready": false
/// }
/// ```
pub fn capability_manifest() -> Value {
    json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "screen_capture": check_screen_capture(),
        "accessibility": check_accessibility(),
        "clipboard": check_clipboard(),
        "app_control": true,        // open -a is always available
        "overlay_ready": check_overlay_ready(),
    })
}

// ---------------------------------------------------------------------------
// Individual capability probes
// ---------------------------------------------------------------------------

/// Attempt a real screenshot into a temp file and verify it produces PNG bytes.
fn check_screen_capture() -> bool {
    let path = "/tmp/resonator_diag_cap.png";
    let ok = Command::new("screencapture")
        .args(["-x", "-t", "png", path])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        return false;
    }
    // Verify PNG magic
    std::fs::read(path)
        .ok()
        .filter(|b| b.len() > 4 && &b[..4] == &[0x89, 0x50, 0x4E, 0x47])
        .is_some()
}

/// Ask System Events whether it can list processes.
/// If this fails the user has not granted Accessibility permission in TCC.
fn check_accessibility() -> bool {
    let script = r#"tell application "System Events" to return name of first process whose background only is false"#;
    Command::new("osascript")
        .args(["-e", script])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Round-trip a value through pbcopy/pbpaste.
fn check_clipboard() -> bool {
    use std::io::Write;
    use std::process::Stdio;

    let sentinel = "__resonator_diag__";
    let mut child = match Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(sentinel.as_bytes());
    }
    let _ = child.wait();

    Command::new("pbpaste")
        .output()
        .ok()
        .filter(|o| {
            let s = String::from_utf8_lossy(&o.stdout);
            s.trim() == sentinel
        })
        .is_some()
}

/// Check whether a transparent overlay window can be rendered.
///
/// For now this simply checks that the Swift/AppKit toolchain is available,
/// since the overlay HUD (Layer 5) hasn't been built yet.
fn check_overlay_ready() -> bool {
    // Check for swiftc — required for the future Tauri overlay HUD.
    Command::new("which")
        .arg("swiftc")
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn manifest_has_required_keys() {
        let manifest = capability_manifest();
        for key in &["os", "arch", "screen_capture", "accessibility", "clipboard", "app_control", "overlay_ready"] {
            assert!(manifest.get(key).is_some(), "manifest missing key: {key}");
        }
    }

    #[test]
    fn manifest_os_is_macos() {
        let manifest = capability_manifest();
        assert_eq!(manifest["os"], "macos");
    }

    #[test]
    #[serial]
    fn screen_capture_probe_passes() {
        assert!(check_screen_capture(), "screencapture probe failed — is TCC Screen Recording granted?");
    }

    #[test]
    fn accessibility_probe_passes() {
        assert!(check_accessibility(), "accessibility probe failed — is TCC Accessibility granted?");
    }

    #[test]
    #[serial]
    fn clipboard_probe_passes() {
        assert!(check_clipboard(), "clipboard probe failed — pbcopy/pbpaste unavailable?");
    }
}
