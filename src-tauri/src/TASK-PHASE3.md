# Task: Phase 3 — Wire Existing Browser Commands to CamoFox Backend

## Context
The frontend already has a working `BrowserWorkspace.tsx` (946 lines) with URL bar, tabs, navigation, extension management, and a viewport div for the native browser. The callback chain is:

```
BrowserWorkspace → onShowNativeWebview → showNativeBrowserWebview (App.tsx)
  → requestBrowserNativeWebviewShow (runtime.ts)
    → invoke("browser_native_webview_show", {...}) (Tauri)
      → browser_native_webview_show (lib.rs) 
        → execute_native_browser_embedded_show (browser_native_service.rs) ← OLD
```

We need to rewire `browser_native_webview_show/resize/hide` to use CamoFox instead of the old CEF/native approach. This is the MINIMAL change to get the existing frontend working with CamoFox.

## Strategy
Modify the existing Tauri command handlers in lib.rs to use our new CamoFox modules when the old native service isn't available. The frontend code stays UNCHANGED.

## File to Modify: `src-tauri/src/lib.rs`

Replace the `browser_native_webview_show` command implementation:

```rust
#[tauri::command]
fn browser_native_webview_show(
    app: AppHandle,
    window: Window,
    request: BrowserNativeWebviewRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["network", "ui-embedding", "browser-control"])?;
    
    // Try CamoFox first (new path)
    let camofox_result = camofox_browser_show(&request);
    if camofox_result.is_ok() {
        return camofox_result;
    }
    
    // Fall back to old native path
    #[cfg(target_os = "macos")]
    {
        let parent = window.ns_view()
            .map_err(|error| format!("Native Browser parent NSView unavailable: {error}"))?;
        execute_native_browser_embedded_show(parent.cast(), request)
    }
    #[cfg(not(target_os = "macos"))]
    {
        execute_browser_native_webview_show(&app, request)
    }
}
```

Where `camofox_browser_show` does:
1. If CamoFox not running → `camofox_service::start()`
2. Navigate to the requested URL → `camofox_service::navigate(url)`
3. Position the CamoFox window → `camofox_overlay_macos::reposition(bounds)`
4. Return success result

Similarly for resize and hide.

## New Helper Function: `src-tauri/src/camofox_integration.rs` (~100 lines)

This bridges the existing BrowserNativeWebviewRequest/Result types to our CamoFox modules:

```rust
use crate::browser_service::{BrowserNativeWebviewRequest, BrowserNativeWebviewResult, BrowserNativeWebviewBoundsRequest};
use crate::camofox_service;

pub fn camofox_browser_show(request: &BrowserNativeWebviewRequest) -> Result<BrowserNativeWebviewResult, String> {
    // Ensure CamoFox is running
    if camofox_service::health_check().unwrap_or(false) == false {
        camofox_service::start(None)?;
    }
    
    // Navigate
    camofox_service::navigate(&request.url)?;
    
    // Position the window
    #[cfg(target_os = "macos")]
    {
        crate::camofox_overlay_macos::camofox_overlay::reposition(
            request.bounds.x as i32,
            request.bounds.y as i32,
            request.bounds.width as i32,
            request.bounds.height as i32,
        )?;
    }
    
    Ok(BrowserNativeWebviewResult {
        label: "camofox".to_string(),
        url: Some(request.url.clone()),
        visible: true,
        status: "shown".to_string(),
    })
}

pub fn camofox_browser_resize(request: &BrowserNativeWebviewBoundsRequest) -> Result<BrowserNativeWebviewResult, String> {
    #[cfg(target_os = "macos")]
    {
        crate::camofox_overlay_macos::camofox_overlay::reposition(
            request.x as i32,
            request.y as i32,
            request.width as i32,
            request.height as i32,
        )?;
    }
    
    Ok(BrowserNativeWebviewResult {
        label: "camofox".to_string(),
        url: None,
        visible: true,
        status: "resized".to_string(),
    })
}

pub fn camofox_browser_hide() -> Result<BrowserNativeWebviewResult, String> {
    #[cfg(target_os = "macos")]
    {
        crate::camofox_overlay_macos::camofox_overlay::hide_offscreen()?;
    }
    
    Ok(BrowserNativeWebviewResult {
        label: "camofox".to_string(),
        url: None,
        visible: false,
        status: "hidden".to_string(),
    })
}
```

## Modifications to lib.rs

1. Add `mod camofox_integration;`
2. Modify `browser_native_webview_show` to try CamoFox first, fall back to old path
3. Modify `browser_native_webview_resize` similarly
4. Modify `browser_native_webview_hide` similarly

## Critical: Check the existing types

Read these from browser_service.rs to match the field types exactly:
- `BrowserNativeWebviewRequest` — has `url: String`, `bounds: BrowserNativeWebviewBounds { x, y, width, height }`, `navigate: bool`
- `BrowserNativeWebviewResult` — has `label: String`, `url: Option<String>`, `visible: bool`, `status: String`
- `BrowserNativeWebviewBoundsRequest` — has `x, y, width, height` fields

## Test
```bash
cargo check
```

## Scope
- 1 new file: camofox_integration.rs (~100 lines)
- 1 modified file: lib.rs (~20 lines changed)
