# Task: Phase 2 — macOS Coordinated Window Overlay

## Context
Phase 1 is complete: `marionette_bridge.rs` and `camofox_service.rs` compile and pass integration tests. CamoFox launches, Marionette connects, navigation works.

Now we need to make the CamoFox window appear embedded inside the Tauri shell. Per the Linus Panel review, true cross-process NSWindow reparenting is IMPOSSIBLE on macOS. Instead, we use **coordinated sibling windows**: CamoFox window sits behind a transparent region in the Tauri window.

## Architecture

```
Tauri Window (NSWindowLevel normal, frontmost)
├── WebView (React UI — sidebar, URL bar, tabs)
│   └── Transparent div "browser-viewport" (pointer-events: none)
│
CamoFox Window (positioned behind transparent region)
├── Launched with --kiosk (borderless, no browser chrome)
├── Position/size synced to match the transparent region
```

## File to Create

### `src-tauri/src/camofox_overlay_macos.rs` (~200 lines)

macOS-only module (`#[cfg(target_os = "macos")]`) for window positioning.

**Requirements:**

1. **Find CamoFox window by PID** — Use `CGWindowListCopyWindowInfo` to find the CGWindowID for the CamoFox process. This gives us the window's current bounds but NOT an NSWindow handle.

2. **Position CamoFox window** — Since we can't manipulate the foreign NSWindow directly, we have TWO options:
   
   **Option A (preferred): AppleScript/osascript** — Use `NSAppleScript` or `Command::new("osascript")` to tell System Events to move/resize the window:
   ```applescript
   tell application "System Events"
       tell process "camoufox"
           set position of front window to {x, y}
           set size of front window to {w, h}
       end tell
   end tell
   ```
   This works cross-process because System Events uses Accessibility API underneath.

   **Option B: Accessibility API directly** — Use `AXUIElement` from the ApplicationServices framework via `core-foundation` + `objc` crates. More complex but avoids spawning osascript.

   **For v1, use Option A (osascript).** It's simpler and proven — we already used it successfully today.

3. **Sync position on Tauri window move/resize** — Register a Tauri window event listener. When the Tauri window moves or resizes, recalculate the browser viewport position and reposition CamoFox.

4. **Show/hide** — Show = launch CamoFox + position. Hide = kill or move offscreen.

5. **Input routing** — When user clicks in the browser viewport area:
   - The transparent div has `pointer-events: none`, so clicks fall through to macOS
   - macOS routes the click to CamoFox (it's the next window in the Z-order at that position)
   - CamoFox gains focus naturally
   - When user clicks OUTSIDE the browser viewport (on Tauri UI), Tauri regains focus
   
   This should "just work" with the transparent punch-through — no explicit focus management needed for v1.

## Implementation

```rust
#[cfg(target_os = "macos")]
pub mod camofox_overlay {
    use std::process::Command;
    
    /// Reposition CamoFox window to match the browser viewport in the Tauri shell.
    /// x, y are screen coordinates (top-left of where CamoFox should render).
    /// w, h are the desired size.
    pub fn reposition(x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
        let script = format!(
            r#"tell application "System Events"
                tell process "camoufox"
                    set position of front window to {{{}, {}}}
                    set size of front window to {{{}, {}}}
                end tell
            end tell"#,
            x, y, w, h
        );
        
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("osascript failed: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript error: {}", stderr));
        }
        Ok(())
    }
    
    /// Bring CamoFox window to front (but behind Tauri)
    pub fn bring_to_front() -> Result<(), String> {
        // ... similar osascript
    }
    
    /// Get current CamoFox window bounds
    pub fn get_bounds() -> Result<(i32, i32, i32, i32), String> {
        // ... osascript to query position and size
    }
    
    /// Calculate the browser viewport's screen coordinates from Tauri window position
    /// tauri_x, tauri_y: Tauri window position (screen coords)
    /// tauri_w, tauri_h: Tauri window size
    /// sidebar_width: width of the left sidebar in pixels
    /// toolbar_height: height of the top toolbar in pixels
    pub fn calculate_viewport_bounds(
        tauri_x: i32, tauri_y: i32,
        tauri_w: i32, tauri_h: i32,
        sidebar_width: i32,
        toolbar_height: i32,
    ) -> (i32, i32, i32, i32) {
        let x = tauri_x + sidebar_width;
        let y = tauri_y + toolbar_height;
        let w = tauri_w - sidebar_width;
        let h = tauri_h - toolbar_height;
        (x, y, w, h)
    }
}
```

## Tauri Commands (add to lib.rs)

```rust
#[tauri::command]
fn camofox_reposition(x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { camofox_overlay_macos::camofox_overlay::reposition(x, y, w, h) }
    #[cfg(not(target_os = "macos"))]
    { Err("Window overlay not implemented for this platform".into()) }
}
```

## Frontend Integration (minimal — just enough to test)

The existing `BrowserWorkspace.tsx` has `onShowNativeWebview` and `onResizeNativeWebview` callbacks. For testing, we need to:

1. When user clicks "Open Browser" → invoke `camofox_start` + `camofox_navigate`
2. Calculate the viewport bounds based on the browser panel's position in the React layout
3. Call `camofox_reposition` with the calculated screen coordinates
4. Use a `ResizeObserver` to track size changes and re-invoke `camofox_reposition`

## Test Plan
1. `cargo check` passes
2. Launch the Tauri app (`npm run tauri dev`)
3. Trigger CamoFox start via the browser panel
4. CamoFox window appears positioned behind the transparent viewport
5. Clicking in the viewport area interacts with CamoFox
6. Resizing the Tauri window repositions CamoFox

## Scope
- 1 new file: `camofox_overlay_macos.rs` (~200 lines)
- 1 modified file: `lib.rs` (add module + command)
- ~220 lines total
