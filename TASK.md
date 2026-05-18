# Task: ROS vNext Browser — Resonator Toggle + Resonant Context Integration

## Context
ResonantOS vNext Tauri app. Two features to add to the browser workspace.

### Feature 1: Resonator On/Off Toggle Button
The Resonator crate (`crates/resonator-control/`) is already built and tested (16/16 tests pass). It provides screen capture, click/type forwarding, key combos, and accessibility probes. The Tauri service (`src-tauri/src/resonator_service.rs`, 207 lines) already exposes IPC commands.

**What needs to happen:**
- Add a toggle button (⚡ icon or similar) to the browser toolbar/bookmarks bar in `src/modules/browser/BrowserWorkspace.tsx`
- When Resonator is ON: enable click-forwarding through the CamoFox screenshot viewport (capture click coordinates on the `<img>` tag, translate to screen coordinates, forward via `invoke('resonator_click')`)
- When Resonator is ON: forward keyboard events via `invoke('resonator_type')` or `invoke('resonator_key_combo')`
- When Resonator is ON: enable scroll forwarding (translate mousewheel events to CamoFox page scroll via Marionette)
- When Resonator is OFF: normal browsing (no forwarding)
- Visual indicator: green dot when ON, grey when OFF
- The toggle state persists in React component state (no need for persistence across sessions yet)

**Files to modify:**
- `src/modules/browser/BrowserWorkspace.tsx` — Add toggle UI + forwarding logic
- Potentially add `resonator_scroll` Tauri command to `src-tauri/src/resonator_service.rs` if it doesn't exist

**Available Tauri commands (already registered):**
- `resonator_screen_capture` → `ScreenCaptureResult { png_base64, width, height }`
- `resonator_click` → takes `ClickRequest { x, y, button? }`
- `resonator_type` → takes `TypeRequest { text }`
- `resonator_key_combo` → takes `KeyComboRequest { keys: Vec<String> }`
- `resonator_capability_manifest` → probes system capabilities

### Feature 2: Resonant Context SDK Integration
The Resonant Context SDK (`~/.openclaw/workspace/matchsire-patches/resonant-context-sdk/`, 831 lines JS) is already built and deployed on matchsire.com. It provides:
- **ViewportObserver** — tracks visible sections, dwell time, active overlays
- **FormObserver** — captures form field state and changes
- **NavigationTracker** — logs page navigations with timestamps
- **InteractionTracker** — records clicks, scrolls, keyboard events
- **ContextBridge** — aggregates all signals into a structured context snapshot

**What needs to happen:**
- Copy `resonant-context-sdk/dist/resonant-context.js` into the vNext project (e.g. `public/resonant-context.js` or `src/sdk/resonant-context/`)
- When CamoFox is the active browser backend AND Resonator is ON, inject the SDK into the CamoFox page via Marionette's `WebDriver:ExecuteScript`
- Create a React hook or component (`useResonantContext`) that periodically polls the context snapshot from CamoFox via Marionette
- Display a small context indicator in the browser toolbar showing what the SDK is tracking (e.g. "📍 Viewing: Swap Form | Dwell: 12s")
- Make the context data available via a new Tauri command `browser_get_context` that returns the latest snapshot
- The context pipeline: SDK in CamoFox page → Marionette reads snapshot → Tauri IPC → React UI → AI prompt injection (future)

**Files to create/modify:**
- `src/modules/browser/BrowserWorkspace.tsx` — Add context indicator + polling
- `src/sdk/resonant-context/` — Copy SDK files here
- `src-tauri/src/browser_service.rs` or new file — Add `browser_get_context` command
- `src-tauri/src/camofox_service.rs` — Add method to inject SDK script and read context via Marionette

## Specification

### Resonator Toggle
1. In `BrowserWorkspace.tsx`, add a button next to the CamoFox/Chromium toggle:
   ```tsx
   <button onClick={toggleResonator} title={resonatorOn ? "Resonator ON" : "Resonator OFF"}>
     {resonatorOn ? "⚡" : "⚡"} {/* green vs grey styling */}
   </button>
   ```
2. Add event handlers on the screenshot `<img>` element:
   - `onClick` → translate to Marionette click coordinates
   - `onKeyDown` → forward keystrokes
   - `onWheel` → forward scroll
3. Coordinate translation: `img` display dimensions vs actual CamoFox viewport dimensions

### Resonant Context
1. Inject SDK into CamoFox page after navigation:
   ```rust
   // In camofox_service.rs
   pub fn inject_resonant_context(script: &str) -> Result<(), String> {
       // Execute script via Marionette
   }
   ```
2. Read context snapshot:
   ```rust
   pub fn read_context_snapshot() -> Result<serde_json::Value, String> {
       // Execute: return window.__resonantContext?.snapshot()
   }
   ```
3. React polling hook every 2 seconds when Resonator is ON

## Test Command
```bash
cd ~/resonantos-vnext
npm run build  # Must compile clean
npm test        # Must not regress (194+ tests passing)
```

## Scope
- 3-4 files modified
- ~200-300 lines of new code
- No breaking changes to existing functionality
