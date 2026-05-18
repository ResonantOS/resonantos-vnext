/// CamoFox Integration Bridge — Phase 3
///
/// Bridges the existing `BrowserNativeWebview*` request/result types to the
/// CamoFox backend (camofox_service + camofox_overlay_macos).  Called from
/// the Tauri command handlers in lib.rs as the "try CamoFox first" path.

use crate::browser_service::{
    BrowserNativeWebviewBoundsRequest, BrowserNativeWebviewRequest, BrowserNativeWebviewResult,
};
use crate::camofox_service;
use tracing::{debug, info};

/// Show the browser at the requested URL and position.
///
/// 1. If CamoFox is not healthy, start it.
/// 2. Navigate to the requested URL.
/// 3. On macOS, reposition the overlay window to match the viewport bounds.
pub fn camofox_browser_show(
    request: &BrowserNativeWebviewRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    // C5 fix: use ensure_running() instead of separate health_check + start
    // to eliminate the TOCTOU race condition.
    info!(url = %request.url, "CamoFox browser show requested");
    camofox_service::ensure_running(None)?;

    // Navigate to the requested URL.
    camofox_service::navigate(&request.url)?;

    // Reposition the overlay window to the viewport bounds.
    #[cfg(target_os = "macos")]
    {
        crate::camofox_overlay_macos::camofox_overlay::reposition(
            request.x as i32,
            request.y as i32,
            request.width as i32,
            request.height as i32,
        )?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Overlay not implemented outside macOS; bounds are noted but unused.
        let _ = (&request.x, &request.y, &request.width, &request.height);
    }

    Ok(BrowserNativeWebviewResult {
        label: "camofox".to_string(),
        url: Some(request.url.clone()),
        visible: true,
        status: "shown".to_string(),
    })
}

/// Resize the browser overlay to match updated viewport bounds.
pub fn camofox_browser_resize(
    request: &BrowserNativeWebviewBoundsRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    #[cfg(target_os = "macos")]
    {
        crate::camofox_overlay_macos::camofox_overlay::reposition(
            request.x as i32,
            request.y as i32,
            request.width as i32,
            request.height as i32,
        )?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&request.x, &request.y, &request.width, &request.height);
    }

    Ok(BrowserNativeWebviewResult {
        label: "camofox".to_string(),
        url: None,
        visible: true,
        status: "resized".to_string(),
    })
}

/// Hide the browser overlay by sending CamoFox offscreen.
///
/// The CamoFox process and Marionette session remain alive; only the window
/// is moved out of view, preserving browser state for a fast re-show.
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
