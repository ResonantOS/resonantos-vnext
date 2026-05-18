//! macOS backend for [`DesktopControl`].
//!
//! All automation goes through standard macOS CLI tools:
//! * `screencapture`   — screenshot (no special entitlements needed with TCC grant)
//! * `osascript`       — mouse, keyboard, window, app control via AppleScript
//! * `pbcopy`/`pbpaste`— clipboard
//! * `open -a`         — launch applications
//!
//! No Swift/ObjC compilation required.  This is the proven path from May 7th testing.

use std::io::Write;
use std::process::{Command, Stdio};

use crate::{AppInfo, ControlError, DesktopControl, MouseButton, WindowInfo};

/// macOS implementation of [`DesktopControl`].
pub struct MacOSControl;

impl MacOSControl {
    pub fn new() -> Self {
        Self
    }

    // ------------------------------------------------------------------ helpers

    /// Run a command, collect stdout.  Returns `ControlError::CommandFailed` on
    /// non-zero exit or if stderr contains "not authorized".
    fn run(program: &str, args: &[&str]) -> Result<String, ControlError> {
        let output = Command::new(program)
            .args(args)
            .output()
            .map_err(|e| ControlError::CommandFailed(format!("spawn {program}: {e}")))?;

        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.to_lowercase().contains("not authorized") {
            return Err(ControlError::PermissionDenied(stderr.to_string()));
        }

        if !output.status.success() {
            return Err(ControlError::CommandFailed(format!(
                "{program} exited {:?}: {stderr}",
                output.status.code()
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Run an AppleScript string, return stdout.
    fn osascript(script: &str) -> Result<String, ControlError> {
        Self::run("osascript", &["-e", script])
    }

    /// Convert a logical button to the AppleScript button number.
    fn button_num(button: MouseButton) -> i32 {
        match button {
            MouseButton::Left => 1,
            MouseButton::Right => 2,
            MouseButton::Middle => 3,
        }
    }

    /// Escape a string for safe embedding inside an AppleScript double-quoted
    /// string.  Only backslash and double-quote need escaping in AppleScript
    /// string literals.
    fn osa_escape(s: &str) -> String {
        s.replace('\\', "\\\\").replace('"', "\\\"")
    }

    /// Map a human-readable key name to the AppleScript `key code` integer.
    /// Falls back to `keystroke` for printable keys.
    fn key_name_to_code(key: &str) -> Option<u32> {
        // Common key codes on US ANSI keyboards.
        match key.to_lowercase().as_str() {
            "return" | "enter" => Some(36),
            "tab" => Some(48),
            "space" => Some(49),
            "delete" | "backspace" => Some(51),
            "escape" | "esc" => Some(53),
            "left" => Some(123),
            "right" => Some(124),
            "down" => Some(125),
            "up" => Some(126),
            "f1" => Some(122),
            "f2" => Some(120),
            "f3" => Some(99),
            "f4" => Some(118),
            "f5" => Some(96),
            "f6" => Some(97),
            "f7" => Some(98),
            "f8" => Some(100),
            "f9" => Some(101),
            "f10" => Some(109),
            "f11" => Some(103),
            "f12" => Some(111),
            "home" => Some(115),
            "end" => Some(119),
            "pageup" => Some(116),
            "pagedown" => Some(121),
            _ => None,
        }
    }

}

impl Default for MacOSControl {
    fn default() -> Self {
        Self::new()
    }
}

impl DesktopControl for MacOSControl {
    // ------------------------------------------------------------------
    // Screen capture
    // ------------------------------------------------------------------

    fn screen_capture(&self) -> Result<Vec<u8>, ControlError> {
        let path = "/tmp/resonator_capture.png";
        // -x = no sound, -t png = PNG format
        Self::run("screencapture", &["-x", "-t", "png", path])?;
        std::fs::read(path).map_err(|e| ControlError::CommandFailed(format!("read screenshot: {e}")))
    }

    // ------------------------------------------------------------------
    // Mouse
    // ------------------------------------------------------------------

    fn mouse_move(&self, x: i32, y: i32) -> Result<(), ControlError> {
        let script = format!(
            r#"tell application "System Events" to set the position of the mouse cursor to {{{x}, {y}}}"#
        );
        Self::osascript(&script).map(|_| ())
    }

    fn mouse_click(&self, x: i32, y: i32, button: MouseButton) -> Result<(), ControlError> {
        let btn = Self::button_num(button);
        let script = format!(
            r#"tell application "System Events"
    set the position of the mouse cursor to {{{x}, {y}}}
    click at {{{x}, {y}}} using button {btn}
end tell"#
        );
        // `click at` with button isn't universally supported on all macOS versions;
        // fall back to the simpler `click at` (left-click only) if it fails.
        match Self::osascript(&script) {
            Ok(_) => Ok(()),
            Err(_) if btn == 1 => {
                let fallback = format!(
                    r#"tell application "System Events" to click at {{{x}, {y}}}"#
                );
                Self::osascript(&fallback).map(|_| ())
            }
            Err(e) => Err(e),
        }
    }

    fn mouse_drag(&self, from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<(), ControlError> {
        let script = format!(
            r#"tell application "System Events"
    set the position of the mouse cursor to {{{from_x}, {from_y}}}
    drag the mouse from {{{from_x}, {from_y}}} to {{{to_x}, {to_y}}}
end tell"#
        );
        Self::osascript(&script).map(|_| ())
    }

    // ------------------------------------------------------------------
    // Keyboard
    // ------------------------------------------------------------------

    fn key_type(&self, text: &str) -> Result<(), ControlError> {
        let escaped = Self::osa_escape(text);
        let script = format!(
            r#"tell application "System Events" to keystroke "{escaped}""#
        );
        Self::osascript(&script).map(|_| ())
    }

    fn key_press(&self, key: &str) -> Result<(), ControlError> {
        if let Some(code) = Self::key_name_to_code(key) {
            let script = format!(
                r#"tell application "System Events" to key code {code}"#
            );
            Self::osascript(&script).map(|_| ())
        } else {
            // Fall back to keystroke for printable keys.
            let escaped = Self::osa_escape(key);
            let script = format!(
                r#"tell application "System Events" to keystroke "{escaped}""#
            );
            Self::osascript(&script).map(|_| ())
        }
    }

    fn key_combo(&self, keys: &[&str]) -> Result<(), ControlError> {
        // Separate the "character" key from modifiers.
        let modifier_names = ["command", "cmd", "control", "ctrl", "option", "alt", "shift"];
        let mut mods: Vec<String> = Vec::new();
        let mut chars: Vec<&str> = Vec::new();

        for &k in keys {
            if modifier_names.contains(&k.to_lowercase().as_str()) {
                // Map to AppleScript modifier names.
                let osa_mod = match k.to_lowercase().as_str() {
                    "command" | "cmd" => "command down",
                    "control" | "ctrl" => "control down",
                    "option" | "alt" => "option down",
                    "shift" => "shift down",
                    _ => continue,
                };
                mods.push(osa_mod.to_string());
            } else {
                chars.push(k);
            }
        }

        if chars.is_empty() {
            return Err(ControlError::CommandFailed(
                "key_combo: no non-modifier key supplied".to_string(),
            ));
        }

        let char_key = chars[0];
        let using_clause = if mods.is_empty() {
            String::new()
        } else {
            format!(" using {{{}}}", mods.join(", "))
        };

        // Try key code first for special keys, otherwise keystroke.
        let script = if let Some(code) = Self::key_name_to_code(char_key) {
            format!(
                r#"tell application "System Events" to key code {code}{using_clause}"#
            )
        } else {
            let escaped = Self::osa_escape(char_key);
            format!(
                r#"tell application "System Events" to keystroke "{escaped}"{using_clause}"#
            )
        };

        Self::osascript(&script).map(|_| ())
    }

    // ------------------------------------------------------------------
    // Windows
    // ------------------------------------------------------------------

    fn window_list(&self) -> Result<Vec<WindowInfo>, ControlError> {
        // AppleScript: iterate all processes with UI elements, collect windows.
        let script = r#"
set output to ""
tell application "System Events"
    set allProcs to every process whose background only is false
    repeat with proc in allProcs
        set procName to name of proc
        set procPID to unix id of proc
        try
            set wins to every window of proc
            repeat with w in wins
                set wTitle to ""
                try
                    set wTitle to name of w
                end try
                set wPos to {0, 0}
                set wSize to {0, 0}
                try
                    set wPos to position of w
                    set wSize to size of w
                end try
                set output to output & procPID & "|" & procName & "|" & wTitle & "|" & (item 1 of wPos) & "," & (item 2 of wPos) & "," & (item 1 of wSize) & "," & (item 2 of wSize) & linefeed
            end repeat
        end try
    end repeat
end tell
return output
"#;
        let raw = Self::osascript(script)?;
        let mut windows: Vec<WindowInfo> = Vec::new();
        for (idx, line) in raw.lines().enumerate() {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() < 4 {
                continue;
            }
            let pid: u32 = parts[0].trim().parse().unwrap_or(0);
            let app_name = parts[1].trim().to_string();
            let title = parts[2].trim().to_string();
            let bounds_str = parts[3].trim();
            let coords: Vec<i32> = bounds_str
                .split(',')
                .filter_map(|s| s.trim().parse().ok())
                .collect();
            let bounds = if coords.len() == 4 {
                (coords[0], coords[1], coords[2], coords[3])
            } else {
                (0, 0, 0, 0)
            };
            windows.push(WindowInfo {
                id: (pid as u64) * 1000 + idx as u64,
                title,
                app_name,
                bounds,
                is_visible: true,
            });
        }
        Ok(windows)
    }

    fn window_focus(&self, window_id: u64) -> Result<(), ControlError> {
        // We encode: id = pid * 1000 + index.  Extract pid.
        let pid = window_id / 1000;
        let script = format!(
            r#"tell application "System Events"
    set targetProc to first process whose unix id is {pid}
    set frontmost of targetProc to true
end tell"#
        );
        Self::osascript(&script).map(|_| ())
    }

    // ------------------------------------------------------------------
    // Clipboard
    // ------------------------------------------------------------------

    fn clipboard_get(&self) -> Result<String, ControlError> {
        Self::run("pbpaste", &[])
    }

    fn clipboard_set(&self, text: &str) -> Result<(), ControlError> {
        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| ControlError::CommandFailed(format!("spawn pbcopy: {e}")))?;

        if let Some(stdin) = child.stdin.take() {
            let mut stdin = stdin;
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| ControlError::CommandFailed(format!("write to pbcopy: {e}")))?;
        }

        let status = child
            .wait()
            .map_err(|e| ControlError::CommandFailed(format!("wait pbcopy: {e}")))?;

        if status.success() {
            Ok(())
        } else {
            Err(ControlError::CommandFailed(format!(
                "pbcopy exited {:?}",
                status.code()
            )))
        }
    }

    // ------------------------------------------------------------------
    // Applications
    // ------------------------------------------------------------------

    fn app_launch(&self, name: &str) -> Result<(), ControlError> {
        Self::run("open", &["-a", name]).map(|_| ())
    }

    fn app_list(&self) -> Result<Vec<AppInfo>, ControlError> {
        let script = r#"
set output to ""
tell application "System Events"
    set allProcs to every process whose background only is false
    repeat with proc in allProcs
        set procName to name of proc
        set procPID to unix id of proc
        set procFront to frontmost of proc
        set output to output & procName & "|" & procPID & "|" & procFront & linefeed
    end repeat
end tell
return output
"#;
        let raw = Self::osascript(script)?;
        let mut apps: Vec<AppInfo> = Vec::new();
        for line in raw.lines() {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() < 3 {
                continue;
            }
            let name = parts[0].trim().to_string();
            let pid: u32 = parts[1].trim().parse().unwrap_or(0);
            let is_active = parts[2].trim() == "true";
            apps.push(AppInfo { name, pid, is_active });
        }
        Ok(apps)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn screen_capture_returns_png_bytes() {
        let ctl = MacOSControl::new();
        let bytes = ctl.screen_capture().unwrap();
        assert!(bytes.len() > 100, "Screenshot should be non-trivial size");
        // PNG magic bytes: 0x89 P N G
        assert_eq!(
            &bytes[..4],
            &[0x89, 0x50, 0x4E, 0x47],
            "Should start with PNG magic bytes"
        );
    }

    #[test]
    #[serial]
    fn clipboard_round_trip() {
        let ctl = MacOSControl::new();
        let test_str = "resonator_test_12345";
        ctl.clipboard_set(test_str).unwrap();
        let result = ctl.clipboard_get().unwrap();
        assert_eq!(result.trim(), test_str);
    }

    #[test]
    fn app_list_returns_entries() {
        let ctl = MacOSControl::new();
        let apps = ctl.app_list().unwrap();
        assert!(!apps.is_empty(), "Should have at least one running app");
        // Sanity: every entry should have a non-empty name and non-zero pid.
        for app in &apps {
            assert!(!app.name.is_empty(), "App name should not be empty");
            assert!(app.pid > 0, "PID should be positive");
        }
    }

    #[test]
    fn window_list_returns_entries() {
        let ctl = MacOSControl::new();
        let windows = ctl.window_list().unwrap();
        assert!(!windows.is_empty(), "Should have at least one window");
    }

    #[test]
    #[serial]
    fn clipboard_set_and_get_unicode() {
        let ctl = MacOSControl::new();
        let test_str = "こんにちは — resonator 🔊";
        ctl.clipboard_set(test_str).unwrap();
        let result = ctl.clipboard_get().unwrap();
        assert_eq!(result.trim(), test_str);
    }

    #[test]
    fn app_list_contains_finder_or_dock() {
        let ctl = MacOSControl::new();
        let apps = ctl.app_list().unwrap();
        let names: Vec<&str> = apps.iter().map(|a| a.name.as_str()).collect();
        // At least one of these should always be running on macOS.
        let known = ["Finder", "Dock", "SystemUIServer", "Terminal", "iTerm2"];
        let found = known.iter().any(|k| names.contains(k));
        assert!(found, "Expected at least one known macOS process; got: {names:?}");
    }
}
