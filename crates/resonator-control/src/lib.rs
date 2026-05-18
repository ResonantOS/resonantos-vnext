pub mod diagnostic;
pub mod error;
#[cfg(target_os = "macos")]
pub mod macos;

pub use error::ControlError;

/// Mouse button selector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

/// Metadata for a single open window.
#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub id: u64,
    pub title: String,
    pub app_name: String,
    /// (x, y, width, height) in screen pixels.
    pub bounds: (i32, i32, i32, i32),
    pub is_visible: bool,
}

/// Metadata for a running application.
#[derive(Debug, Clone)]
pub struct AppInfo {
    pub name: String,
    pub pid: u32,
    pub is_active: bool,
}

/// Unified desktop-control interface.
///
/// Each platform provides a concrete implementor.  The macOS backend lives in
/// [`macos::MacOSControl`] and calls `screencapture`, `osascript`, `pbcopy`,
/// `pbpaste`, and `open`.
pub trait DesktopControl {
    /// Capture a screenshot of the primary display.
    /// Returns raw PNG bytes.
    fn screen_capture(&self) -> Result<Vec<u8>, ControlError>;

    /// Move the cursor to the given screen coordinates.
    fn mouse_move(&self, x: i32, y: i32) -> Result<(), ControlError>;

    /// Click at the given screen coordinates.
    fn mouse_click(&self, x: i32, y: i32, button: MouseButton) -> Result<(), ControlError>;

    /// Click-and-drag from one point to another.
    fn mouse_drag(&self, from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<(), ControlError>;

    /// Type a plain-text string as keystrokes.
    fn key_type(&self, text: &str) -> Result<(), ControlError>;

    /// Press a named key (`Return`, `Tab`, `Escape`, `F1`, …).
    fn key_press(&self, key: &str) -> Result<(), ControlError>;

    /// Press a key combination (e.g. `&["command", "c"]`).
    fn key_combo(&self, keys: &[&str]) -> Result<(), ControlError>;

    /// Return metadata for every visible window.
    fn window_list(&self) -> Result<Vec<WindowInfo>, ControlError>;

    /// Bring a window to the foreground by its numeric ID.
    fn window_focus(&self, window_id: u64) -> Result<(), ControlError>;

    /// Read the current clipboard text.
    fn clipboard_get(&self) -> Result<String, ControlError>;

    /// Write text to the clipboard.
    fn clipboard_set(&self, text: &str) -> Result<(), ControlError>;

    /// Launch an application by name (e.g. `"Safari"`, `"Terminal"`).
    fn app_launch(&self, name: &str) -> Result<(), ControlError>;

    /// Return metadata for all foreground (UI) applications.
    fn app_list(&self) -> Result<Vec<AppInfo>, ControlError>;
}
