# resonator-control

**Phase 1 — Desktop Control Foundation (macOS)**

Standalone Rust library crate that implements the `DesktopControl` trait for macOS.
This is the eyes-and-hands layer for the Computer Resonator Module (Layer 2 of the
full architecture described in `COMPUTER-RESONATOR-MODULE.md`).

## What it provides

| Module | Purpose |
|--------|---------|
| `lib.rs` | `DesktopControl` trait + `MouseButton`, `WindowInfo`, `AppInfo` types |
| `macos.rs` | macOS backend — `screencapture`, `osascript`, `pbcopy/pbpaste`, `open -a` |
| `error.rs` | `ControlError` enum |
| `diagnostic.rs` | Boot-time capability manifest (JSON) |

## Capability manifest

```rust
use resonator_control::diagnostic::capability_manifest;
let manifest = capability_manifest();
// {"os":"macos","arch":"aarch64","screen_capture":true,"accessibility":true,...}
```

## Prerequisites (TCC grants — already active on Tom's M4 Mac Mini)

- **Screen Recording** — required for `screencapture`
- **Accessibility** — required for `osascript` → System Events

## Running tests

```bash
cargo test          # serial_test crate handles clipboard/screencapture serialization
cargo build
```

All 11 tests pass on macOS (aarch64, M4 Mac Mini).

## Not yet wired into the Tauri app

This is a standalone library crate. Integration with `resonantos-vnext` (Tauri)
comes in Phase 2.

## Status

✅ Phase 1 MVP — all tests passing  
⏳ Phase 2 — wire into Tauri backend as a command handler  
⏳ Phase 3 — add vision feedback loop (screenshot → LLM → next action)
