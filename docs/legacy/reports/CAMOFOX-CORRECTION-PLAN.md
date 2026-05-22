# CamoFox Correction Plan — Fixing the Two Critical Problems

**Author:** Linus (Analog 6 subagent)  
**Date:** 2026-05-12  
**Status:** Ready for implementation  
**Priority:** CRITICAL — Tom is blocked

---

## Problem Summary

Two bugs are breaking CamoFox:

1. **CamoFox opens as a separate OS-level window** instead of rendering inside the ResonantOS Tauri shell browser panel.
2. **The popout CamoFox window doesn't navigate** — shows a blank new tab.

---

## Root Cause Analysis

### Problem 1: CamoFox Opens as a Visible Desktop Window

**Root cause file:** `src-tauri/src/camofox_service.rs`, lines 108–118 (`start_internal`)

```rust
let mut child = Command::new(&binary)
    .arg("-profile")
    .arg(&profile_path)
    .arg("-marionette")
    .arg(format!("--marionette-port={marionette_port}"))
    .arg("-no-remote")
    .arg("--kiosk")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
```

**The problem:** CamoFox is launched with `--kiosk` but **NOT** in headless mode. The `--kiosk` flag makes a visible fullscreen window. There is NO `-headless` argument passed. The Camoufox binary (Firefox fork) defaults to showing a GUI window when no headless flag is provided.

**Additionally:** The frontend at `src/modules/browser/BrowserWorkspace.tsx` (lines 102–109) has the correct *intent* — it calls `invoke("camofox_start")` then takes screenshots via `invoke("camofox_screenshot")` every 800ms and renders them as an `<img>` tag. This screenshot-streaming approach is correct for embedding. But because the Rust side launches a **visible** window, the user sees both:
- The real CamoFox desktop window (visible, on top)
- The screenshot image in the Tauri panel (delayed, non-interactive)

**There's also a third path in play:** `src-tauri/src/camofox_integration.rs` has `camofox_browser_show()` which calls `camofox_overlay_macos::camofox_overlay::reposition()`. This overlay approach tries to use `osascript` to move the visible CamoFox window to align with the Tauri viewport. This is the "coordinated sibling window" approach documented in `camofox_overlay_macos.rs`. But this creates a SEPARATE window that floats over the Tauri shell — it's not actually embedded.

**Summary:** Three competing rendering strategies exist simultaneously:
1. Screenshot streaming via `<img>` tag (React frontend, lines 138–148 in BrowserWorkspace.tsx)
2. Coordinated overlay window via osascript (camofox_overlay_macos.rs)  
3. Raw visible window from non-headless launch (camofox_service.rs)

Only strategy #1 (headless + screenshot) can work for true embedding. Strategies #2 and #3 create visible OS windows.

### Problem 2: The Popout CamoFox Window Doesn't Navigate

**Root cause:** There's a disconnect between the URL bar submission and the Marionette navigation command.

**In `BrowserWorkspace.tsx`, lines 200–210 (`submitNavigation`):**
```tsx
const submitNavigation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (browserBackend === "camofox" && camofoxRunning) {
      const nextUrl = normalizeBrowserUrl(draftUrl);
      void navigateCamofox(nextUrl);
      // Also update tab state for consistency
      navigateTo(draftUrl, "push");
    } else {
      navigateTo(draftUrl, "push");
    }
};
```

This code DOES call `navigateCamofox(nextUrl)` which invokes `camofox_navigate`. **However**, it also calls `navigateTo(draftUrl, "push")` which triggers `navigateNativeWebview()` — this tries to show the **Chromium** native webview at the same URL. This creates a race condition where:

1. CamoFox Marionette gets a navigate command
2. The Chromium native webview also tries to load
3. The native webview show/resize effect potentially covers or conflicts

**But the deeper issue is timing:** When CamoFox first starts (via `ensure_running()` in the `camofox_start` command), the Marionette session is established, but the browser may still be on `about:blank`. The auto-start effect at line 127:

```tsx
useEffect(() => {
    if (browserBackend === "camofox" && browserReady && !camofoxRunning) {
      void startCamofox();
    }
}, [browserBackend, browserReady, camofoxRunning, startCamofox]);
```

This starts CamoFox but does NOT navigate to any URL. The user sees `about:blank` (or the Firefox new tab page). Then when they type a URL, the `camofox_navigate` IPC call happens, but if the visible window opened before the Marionette session was fully ready, the navigate command may fail silently (the `navigateCamofox` function catches errors and sets them in state, but the user is looking at the popout window, not the React error state).

**The `--kiosk` flag compounds this:** Kiosk mode in Firefox can interfere with normal navigation behavior, URL bar display, and may show a blank chrome UI.

---

## The Fix: Path A — Headless + Interactive Screenshot Streaming

This is the only pragmatic path. CamoFox (Firefox/Camoufox) cannot be NSView-embedded into Tauri on macOS. Headless mode + screenshot streaming is the correct approach — it's already partially implemented, just broken by the non-headless launch.

### Fix 1: Launch CamoFox in Headless Mode

**File:** `src-tauri/src/camofox_service.rs`  
**Lines:** 108–118

**Current code:**
```rust
let mut child = Command::new(&binary)
    .arg("-profile")
    .arg(&profile_path)
    .arg("-marionette")
    .arg(format!("--marionette-port={marionette_port}"))
    .arg("-no-remote")
    .arg("--kiosk")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
```

**Change to:**
```rust
let mut child = Command::new(&binary)
    .arg("-profile")
    .arg(&profile_path)
    .arg("-marionette")
    .arg(format!("--marionette-port={marionette_port}"))
    .arg("-no-remote")
    .arg("-headless")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
```

**Changes:**
- Remove `--kiosk` — not needed in headless mode, and it causes UI problems
- Add `-headless` — this tells Camoufox/Firefox to run without any GUI window

**Estimated time:** 2 minutes

**Verification:**
1. Build and run `cargo build`
2. Switch to CamoFox engine in the browser panel
3. Confirm NO separate OS window appears
4. Confirm the Marionette session establishes (check "CamoFox started (PID X)" status)

### Fix 2: Navigate to Default URL on Start

**File:** `src-tauri/src/camofox_service.rs`  
**After the Marionette session is established (after line 145), add:**

```rust
// Navigate to a default page so the browser isn't stuck on about:blank
if let Err(e) = marionette.navigate("https://resonantos.com") {
    warn!("Initial navigation failed: {e}");
}
```

**OR better — do it from the frontend side.**

**File:** `src/modules/browser/BrowserWorkspace.tsx`  
**Lines 127–131 (the auto-start useEffect):**

**Current:**
```tsx
useEffect(() => {
    if (browserBackend === "camofox" && browserReady && !camofoxRunning) {
      void startCamofox();
    }
}, [browserBackend, browserReady, camofoxRunning, startCamofox]);
```

**Change to:**
```tsx
useEffect(() => {
    if (browserBackend === "camofox" && browserReady && !camofoxRunning) {
      void startCamofox().then(() => {
        // Navigate to the active tab's URL after startup
        const url = activeTab?.url ?? DEFAULT_BROWSER_URL;
        void navigateCamofox(url);
      });
    }
}, [browserBackend, browserReady, camofoxRunning, startCamofox]);
```

**Estimated time:** 5 minutes

**Verification:**
1. Switch to CamoFox engine
2. CamoFox should start AND navigate to the default URL
3. Screenshot should show the page content, not blank/about:blank

### Fix 3: Remove Chromium Native Webview Interference in CamoFox Mode

**File:** `src/modules/browser/BrowserWorkspace.tsx`

**Problem:** When `browserBackend === "camofox"`, the component still runs the `useEffect` at lines 153–186 that calls `onShowNativeWebview`. This tries to show the Chromium native webview behind/over the CamoFox viewport.

**Lines 153–155, add a guard:**

**Current:**
```tsx
useEffect(() => {
    if (!browserReady || !activeTab || !onShowNativeWebview) {
      return;
    }
```

**Change to:**
```tsx
useEffect(() => {
    if (!browserReady || !activeTab || !onShowNativeWebview || browserBackend === "camofox") {
      return;
    }
```

**Also in `submitNavigation` (lines 200–210), remove the `navigateTo` call when in CamoFox mode that triggers native webview navigation:**

**Current:**
```tsx
if (browserBackend === "camofox" && camofoxRunning) {
      const nextUrl = normalizeBrowserUrl(draftUrl);
      void navigateCamofox(nextUrl);
      // Also update tab state for consistency
      navigateTo(draftUrl, "push");
}
```

**Change to:**
```tsx
if (browserBackend === "camofox" && camofoxRunning) {
      const nextUrl = normalizeBrowserUrl(draftUrl);
      void navigateCamofox(nextUrl);
      // Update tab state without triggering native webview navigation
      commitBrowserState(
        tabs.map((tab) => {
          if (tab.id !== activeTabId) return tab;
          const nextHistory = [...tab.history.slice(0, tab.historyIndex + 1), nextUrl];
          return {
            ...tab,
            label: labelFromUrl(nextUrl),
            url: nextUrl,
            history: nextHistory,
            historyIndex: nextHistory.length - 1,
          };
        }),
      );
}
```

**Estimated time:** 10 minutes

**Verification:**
1. Switch to CamoFox mode
2. Type a URL and press Enter
3. No Chromium webview should appear
4. Screenshot should update to show the navigated page

### Fix 4: Add Interactive Event Forwarding (Click, Scroll, Type)

Currently the screenshot is a static `<img>` tag. Users can see the page but can't interact with it. This requires forwarding mouse/keyboard events from the React `<img>` to CamoFox via Marionette.

#### 4a. Click Forwarding

**File:** `src/modules/browser/BrowserWorkspace.tsx`  
**In the CamoFox viewport section (around line 290), change the `<img>` to handle clicks:**

```tsx
{camofoxScreenshot ? (
  <img
    src={`data:image/png;base64,${camofoxScreenshot}`}
    alt="CamoFox browser screenshot"
    style={{ width: "100%", borderRadius: "6px", border: "1px solid var(--border, #333)", cursor: "pointer" }}
    onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = e.currentTarget.naturalWidth / rect.width;
      const scaleY = e.currentTarget.naturalHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      void invoke("camofox_click", { x: Math.round(x), y: Math.round(y) });
    }}
  />
```

**File:** `src-tauri/src/camofox_service.rs`  
**Add a new public function:**

```rust
/// Click at the given coordinates in the page.
pub fn click(x: i32, y: i32) -> Result<(), String> {
    with_marionette(|m| {
        m.execute_script(&format!(
            "document.elementFromPoint({x}, {y})?.click();"
        ))
        .map(|_| ())
    })
}
```

**File:** `src-tauri/src/lib.rs`  
**Add command:**

```rust
#[tauri::command]
fn camofox_click(x: i32, y: i32) -> Result<(), String> {
    camofox_service::click(x, y)
}
```

And register it in the `generate_handler!` macro.

#### 4b. Scroll Forwarding

```rust
// In camofox_service.rs
pub fn scroll(delta_x: i32, delta_y: i32) -> Result<(), String> {
    with_marionette(|m| {
        m.execute_script(&format!(
            "window.scrollBy({delta_x}, {delta_y});"
        ))
        .map(|_| ())
    })
}
```

**Frontend:** Add `onWheel` handler to the `<img>` tag:

```tsx
onWheel={(e) => {
  e.preventDefault();
  void invoke("camofox_scroll", { deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
}}
```

#### 4c. Keyboard Input Forwarding

**Add a hidden `<input>` or `<textarea>` overlay that captures keystrokes:**

```tsx
// After the <img> tag, add:
<input
  type="text"
  style={{ position: "absolute", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
  onKeyDown={(e) => {
    e.preventDefault();
    void invoke("camofox_key", { key: e.key, code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey });
  }}
  ref={(el) => { /* focus on click */ }}
/>
```

```rust
// In camofox_service.rs
pub fn send_key(key: &str) -> Result<(), String> {
    with_marionette(|m| {
        m.execute_script(&format!(
            r#"
            const activeEl = document.activeElement || document.body;
            activeEl.dispatchEvent(new KeyboardEvent('keydown', {{ key: '{}', bubbles: true }}));
            activeEl.dispatchEvent(new KeyboardEvent('keyup', {{ key: '{}', bubbles: true }}));
            "#,
            key, key
        ))
        .map(|_| ())
    })
}
```

**Note:** For proper keyboard input, the better approach is to use Marionette's `WebDriver:ElementSendKeys` command on the active element. The `execute_script` approach above is a quick MVP; a proper implementation would use:

```rust
pub fn type_text(text: &str) -> Result<(), String> {
    with_marionette(|m| {
        // Find the active/focused element
        let active = m.execute_script("return document.activeElement")?;
        // Use Marionette's native key input
        m.send_command("WebDriver:ElementSendKeys", json!({
            "id": active_element_id,
            "text": text
        }))
        .map(|_| ())
    })
}
```

**Estimated time:** 2–3 hours for all three (click, scroll, keyboard)

### Fix 5: Increase Screenshot Refresh Rate

**File:** `src/modules/browser/BrowserWorkspace.tsx`  
**Line 135:**

**Current:**
```tsx
screenshotTimerRef.current = setInterval(() => void screenshotCamofox(), 800);
```

**Change to:**
```tsx
screenshotTimerRef.current = setInterval(() => void screenshotCamofox(), 250);
```

This gives ~4 FPS instead of ~1.25 FPS. Not buttery smooth but much more responsive. If performance is an issue (base64 PNG encoding is CPU-intensive), we can:
- Use JPEG instead of PNG (smaller, faster encoding) — requires changing the Marionette screenshot format
- Use delta/dirty-region detection (only update changed areas)
- Use WebSocket streaming instead of polling

**Estimated time:** 1 minute

### Fix 6: Remove Chromium Browser as Default, Make CamoFox Primary

**File:** `src/modules/browser/BrowserWorkspace.tsx`  
**Line 87:**

**Current:**
```tsx
const [browserBackend, setBrowserBackend] = useState<BrowserBackend>("chromium");
```

**Change to:**
```tsx
const [browserBackend, setBrowserBackend] = useState<BrowserBackend>("camofox");
```

This makes CamoFox the default engine. The Chromium option remains available via the engine switcher in the bookmarks bar.

**To fully remove Chromium (per Tom's directive):**
- Remove the engine switcher buttons (lines 250–270 in the bookmarks bar)
- Remove all `browserBackend === "chromium"` conditional rendering
- Remove the Chromium probe/smoke test sections
- Remove the native webview show/resize/hide effects
- Keep the Chromium browser service code in Rust for potential future use, but don't expose it in UI

**Estimated time:** 30 minutes for default change, 2 hours for full Chromium removal

---

## Implementation Priority

### TONIGHT (Critical — fixes the two reported bugs):

| # | Fix | File(s) | Time | Impact |
|---|-----|---------|------|--------|
| 1 | **Headless launch** | `camofox_service.rs` | 2 min | Eliminates visible OS window |
| 2 | **Navigate on start** | `BrowserWorkspace.tsx` | 5 min | Fixes blank page on launch |
| 3 | **Block Chromium interference** | `BrowserWorkspace.tsx` | 10 min | Prevents dual-engine conflict |
| 5 | **Faster screenshots** | `BrowserWorkspace.tsx` | 1 min | Smoother visual feedback |
| 6 | **CamoFox as default** | `BrowserWorkspace.tsx` | 1 min | UX — no manual engine switch |

**Total tonight: ~20 minutes of code changes + build + test**

### NEXT SESSION (Important — makes it usable):

| # | Fix | Time | Impact |
|---|-----|------|--------|
| 4a | Click forwarding | 45 min | Users can click links/buttons |
| 4b | Scroll forwarding | 30 min | Users can scroll pages |
| 4c | Keyboard input | 1.5 hr | Users can type in forms |

### LATER (Polish):

| Fix | Time | Impact |
|-----|------|--------|
| Full Chromium removal from UI | 2 hr | Cleaner UI, single engine |
| JPEG screenshots for performance | 30 min | Faster refresh, less CPU |
| Proper Marionette key input | 1 hr | Better keyboard handling |
| Cursor shape feedback | 2 hr | Show pointer/text cursor on hover |
| Loading indicators | 30 min | Show when page is loading |

---

## Exact Code Changes Summary

### File: `src-tauri/src/camofox_service.rs`

**Change 1 — Headless launch (line ~112):**
```diff
-    .arg("--kiosk")
+    .arg("-headless")
```

### File: `src/modules/browser/BrowserWorkspace.tsx`

**Change 2 — Navigate after start (line ~127):**
```diff
 useEffect(() => {
     if (browserBackend === "camofox" && browserReady && !camofoxRunning) {
-      void startCamofox();
+      void startCamofox().then(() => {
+        const url = activeTab?.url ?? DEFAULT_BROWSER_URL;
+        void navigateCamofox(url);
+      });
     }
 }, [browserBackend, browserReady, camofoxRunning, startCamofox]);
```

**Change 3 — Block native webview in CamoFox mode (line ~153):**
```diff
 useEffect(() => {
-    if (!browserReady || !activeTab || !onShowNativeWebview) {
+    if (!browserReady || !activeTab || !onShowNativeWebview || browserBackend === "camofox") {
       return;
     }
```

**Change 4 — Fix submitNavigation to not trigger native webview (line ~203):**
```diff
 if (browserBackend === "camofox" && camofoxRunning) {
       const nextUrl = normalizeBrowserUrl(draftUrl);
       void navigateCamofox(nextUrl);
-      // Also update tab state for consistency
-      navigateTo(draftUrl, "push");
+      // Update tab state without triggering native webview
+      commitBrowserState(
+        tabs.map((tab) => {
+          if (tab.id !== activeTabId) return tab;
+          const nextHistory = [...tab.history.slice(0, tab.historyIndex + 1), nextUrl];
+          return {
+            ...tab,
+            label: labelFromUrl(nextUrl),
+            url: nextUrl,
+            history: nextHistory,
+            historyIndex: nextHistory.length - 1,
+          };
+        }),
+      );
 }
```

**Change 5 — Faster screenshot refresh (line ~135):**
```diff
-      screenshotTimerRef.current = setInterval(() => void screenshotCamofox(), 800);
+      screenshotTimerRef.current = setInterval(() => void screenshotCamofox(), 250);
```

**Change 6 — Default to CamoFox (line ~87):**
```diff
-  const [browserBackend, setBrowserBackend] = useState<BrowserBackend>("chromium");
+  const [browserBackend, setBrowserBackend] = useState<BrowserBackend>("camofox");
```

---

## Verification Steps

After applying tonight's fixes:

1. **Build:** `cd ~/resonantos-vnext && cargo build` (Rust changes) + `npm run dev` or `cargo tauri dev` (full stack)
2. **Open ResonantOS** — navigate to the Browser panel
3. **Verify no OS window:** No separate CamoFox/Firefox window should appear. Check with `pgrep camoufox` — process should be running but headless.
4. **Verify screenshot renders:** The browser panel should show a screenshot of the page, updating every 250ms.
5. **Verify navigation:** Type a URL (e.g., `google.com`) in the address bar and press Enter. The screenshot should update to show Google.
6. **Verify no Chromium interference:** No Chromium webview should appear. The viewport should only show the CamoFox screenshot.
7. **Status bar:** Should show "CamoFox started (PID X)" with green "● Running" indicator.

---

## Architecture Note: Why Not NSView Embedding?

For the record, here's why the other paths were rejected:

- **Path B (Tauri webview proxy):** Tauri uses WebKit on macOS. CamoFox's anti-detection value comes from its deep Firefox fingerprint manipulation. Routing through WebKit defeats the purpose.
- **Path C (NSView reparenting):** macOS does not allow cross-process NSView reparenting. The overlay approach (`camofox_overlay_macos.rs`) tried to simulate this with `osascript` positioning, but it creates a separate window that doesn't integrate with Tauri's window management (z-order, resizing, minimizing, spaces). It also requires Accessibility permissions.
- **Path D (Tauri webview + anti-detection headers):** Chrome/WebKit user-agent spoofing is easily detected. CamoFox's value is deep canvas/WebGL/font fingerprint manipulation that's impossible to replicate in a different engine.

**Path A (headless + screenshot streaming) is the correct solution.** It's how VNC, noVNC, and remote desktop protocols work. The UX won't be native-browser-smooth, but at 4 FPS with click/scroll/type forwarding, it's functional for the primary use cases (DEX trading, wallet connections, anti-detection browsing).

---

## Is `camofox_navigate` Actually Being Called?

**Yes.** In `BrowserWorkspace.tsx` line 200–210, the `submitNavigation` handler checks `browserBackend === "camofox" && camofoxRunning` and calls `navigateCamofox(nextUrl)`, which invokes the `camofox_navigate` Tauri command.

**The issue is not that it's not called — it's that:**
1. The visible (non-headless) window shows its own UI that competes with Marionette navigation
2. `navigateTo()` is also called, triggering Chromium native webview operations that conflict
3. `--kiosk` mode may intercept or suppress normal navigation behavior

All three issues are resolved by fixes 1, 3, and 4 above.
