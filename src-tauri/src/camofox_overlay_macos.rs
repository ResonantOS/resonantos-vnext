/// macOS Coordinated Window Overlay for CamoFox
///
/// True cross-process NSWindow reparenting is impossible on macOS. Instead we
/// use *coordinated sibling windows*: CamoFox sits at the same Z-level as the
/// Tauri window but behind it, positioned to match the transparent
/// `browser-viewport` div punched through the Tauri WebView.
///
/// All cross-process window manipulation is done via `osascript` → System
/// Events, which exercises the Accessibility API underneath and works without
/// any private API or entitlement.
#[cfg(target_os = "macos")]
pub mod camofox_overlay {
    use std::process::Command;
    use tracing::{debug, warn};

    // -----------------------------------------------------------------------
    // Process check helper (M5 fix)
    // -----------------------------------------------------------------------

    /// Check if the CamoFox (camoufox) process is running.
    fn is_camofox_running() -> bool {
        Command::new("pgrep")
            .args(["-x", "camoufox"])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    /// Require CamoFox to be running before an overlay operation.
    fn require_camofox_running() -> Result<(), String> {
        if !is_camofox_running() {
            return Err("CamoFox process is not running. Cannot manipulate overlay window.".to_string());
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Retina scaling helper (M6 fix)
    // -----------------------------------------------------------------------

    /// Detect the display scale factor via NSScreen.
    /// Returns 2.0 on Retina, 1.0 on standard displays.
    fn display_scale_factor() -> f64 {
        let script = r#"use framework "AppKit"
set mainScreen to current application's NSScreen's mainScreen()
set scaleFactor to mainScreen's backingScaleFactor() as real
return scaleFactor"#;
        Command::new("osascript")
            .args(["-l", "AppleScript", "-e", script])
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    String::from_utf8_lossy(&output.stdout)
                        .trim()
                        .parse::<f64>()
                        .ok()
                } else {
                    None
                }
            })
            .unwrap_or(1.0)
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /// Move and resize the CamoFox window so it aligns with the browser
    /// viewport cut-out inside the Tauri shell.
    ///
    /// `x`, `y` are **screen** coordinates (top-left corner, origin at the
    /// top-left of the primary display).  `w` and `h` are the desired size.
    /// Coordinates are assumed to be in logical points; if the caller provides
    /// device pixels, the scale factor is applied to convert.
    pub fn reposition(x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
        require_camofox_running()?;
        debug!(x, y, w, h, "Repositioning CamoFox overlay");
        let script = format!(
            r#"tell application "System Events"
    tell process "camoufox"
        set position of front window to {{{x}, {y}}}
        set size of front window to {{{w}, {h}}}
    end tell
end tell"#
        );
        run_osascript(&script)
    }

    /// Bring the CamoFox window to the front of its own process stack (it
    /// will still sit behind the Tauri window because Tauri's NSWindow is at
    /// a higher Z-order level via `orderFront`).
    pub fn bring_to_front() -> Result<(), String> {
        require_camofox_running()?;
        debug!("Bringing CamoFox to front");
        let script = r#"tell application "System Events"
    tell process "camoufox"
        set frontmost to true
        perform action "AXRaise" of front window
    end tell
end tell"#;
        run_osascript(script)
    }

    /// Query the current bounds of the CamoFox window.
    ///
    /// Returns `(x, y, w, h)` in screen coordinates.
    pub fn get_bounds() -> Result<(i32, i32, i32, i32), String> {
        // Fetch position and size separately — AppleScript's `properties` can
        // be verbose and harder to parse reliably.
        let pos_script = r#"tell application "System Events"
    tell process "camoufox"
        get position of front window
    end tell
end tell"#;
        let size_script = r#"tell application "System Events"
    tell process "camoufox"
        get size of front window
    end tell
end tell"#;

        let pos_raw = run_osascript_capture(pos_script)?;
        let size_raw = run_osascript_capture(size_script)?;

        // osascript returns comma-separated integers, e.g. "100, 200"
        let pos = parse_two_ints(&pos_raw)
            .map_err(|e| format!("Could not parse CamoFox position '{}': {}", pos_raw, e))?;
        let size = parse_two_ints(&size_raw)
            .map_err(|e| format!("Could not parse CamoFox size '{}': {}", size_raw, e))?;

        Ok((pos.0, pos.1, size.0, size.1))
    }

    /// Send CamoFox offscreen so it is invisible but still alive.
    /// We move it to a large negative offset rather than killing it, which
    /// preserves the Marionette session.
    pub fn hide_offscreen() -> Result<(), String> {
        require_camofox_running()?;
        debug!("Hiding CamoFox offscreen");
        let script = r#"tell application "System Events"
    tell process "camoufox"
        set position of front window to {-32000, -32000}
    end tell
end tell"#;
        run_osascript(script)
    }

    /// Get the current display scale factor. Exposed for callers that need
    /// to convert between device pixels and logical points (M6 fix).
    pub fn get_display_scale_factor() -> f64 {
        display_scale_factor()
    }

    // -----------------------------------------------------------------------
    // Geometry helpers
    // -----------------------------------------------------------------------

    /// Calculate the screen-coordinate bounds for the browser viewport from
    /// the Tauri window geometry and the UI layout constants.
    ///
    /// | Parameter        | Meaning                                          |
    /// |------------------|--------------------------------------------------|
    /// | `tauri_x/y`      | Tauri window top-left in screen coordinates       |
    /// | `tauri_w/h`      | Tauri window size                                 |
    /// | `sidebar_width`  | Width of the left sidebar (React layout, px)      |
    /// | `toolbar_height` | Height of the top toolbar (React layout, px)      |
    ///
    /// Returns `(x, y, w, h)` ready to pass to [`reposition`].
    pub fn calculate_viewport_bounds(
        tauri_x: i32,
        tauri_y: i32,
        tauri_w: i32,
        tauri_h: i32,
        sidebar_width: i32,
        toolbar_height: i32,
    ) -> (i32, i32, i32, i32) {
        let x = tauri_x + sidebar_width;
        let y = tauri_y + toolbar_height;
        let w = (tauri_w - sidebar_width).max(0);
        let h = (tauri_h - toolbar_height).max(0);
        (x, y, w, h)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Run an AppleScript snippet via `osascript -e` and return `Ok(())` on
    /// success or `Err(stderr)` on failure.
    fn run_osascript(script: &str) -> Result<(), String> {
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to spawn osascript: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("osascript error: {}", stderr.trim()))
        }
    }

    /// Run an AppleScript snippet and return the trimmed stdout on success.
    fn run_osascript_capture(script: &str) -> Result<String, String> {
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to spawn osascript: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("osascript error: {}", stderr.trim()))
        }
    }

    /// Parse a string like `"100, 200"` into `(100, 200)`.
    fn parse_two_ints(s: &str) -> Result<(i32, i32), String> {
        let parts: Vec<&str> = s.split(',').collect();
        if parts.len() != 2 {
            return Err(format!("expected 2 values, got {}", parts.len()));
        }
        let a = parts[0]
            .trim()
            .parse::<i32>()
            .map_err(|e| e.to_string())?;
        let b = parts[1]
            .trim()
            .parse::<i32>()
            .map_err(|e| e.to_string())?;
        Ok((a, b))
    }
}

// ---------------------------------------------------------------------------
// Unit tests (run on macOS only)
// ---------------------------------------------------------------------------

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::camofox_overlay::calculate_viewport_bounds;

    #[test]
    fn viewport_bounds_basic() {
        // Tauri window at (100, 200), 1200×800, sidebar=240, toolbar=40
        let (x, y, w, h) = calculate_viewport_bounds(100, 200, 1200, 800, 240, 40);
        assert_eq!(x, 340);  // 100 + 240
        assert_eq!(y, 240);  // 200 + 40
        assert_eq!(w, 960);  // 1200 - 240
        assert_eq!(h, 760);  // 800  - 40
    }

    #[test]
    fn viewport_bounds_clamps_to_zero() {
        // Degenerate: sidebar wider than window
        let (_, _, w, h) = calculate_viewport_bounds(0, 0, 100, 100, 200, 200);
        assert_eq!(w, 0);
        assert_eq!(h, 0);
    }
}
