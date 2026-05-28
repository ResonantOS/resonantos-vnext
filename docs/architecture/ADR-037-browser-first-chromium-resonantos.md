# ADR-037 — Browser-First Chromium as ResonantOS Product Direction

**Status:** Accepted  
**Date:** 2026-05-28  
**Supersedes:** ADR-035, ADR-036

---

## Context

Prior ADRs explored an Electron host (ADR-035) and a wallet-capable browser host (ADR-036) as potential architectures for delivering the ResonantOS user experience. Both were evaluated and found to introduce unnecessary complexity, maintenance burden, and wallet-integration friction.

The core insight is that ResonantOS is best delivered as a **browser-first application** embedded in a Chromium-family browser that the user already runs. Rather than shipping a custom shell, we ship a side-panel extension that rides inside a real Chromium-family browser.

---

## Decision

**ResonantOS is a browser-first application delivered as a Chromium extension with a side-panel UI.**

This architecture is not a ResonantOS dashboard that opens or controls another browser — it IS the browser experience, integrated at the extension layer. The product ships as a Chromium-family browser profile pre-loaded with the ResonantOS side-panel extension and a native messaging host.

Key constraints enforced by this ADR:

1. **Phantom Wallet must run in the same browser profile** as the ResonantOS extension. No cross-process wallet bridging, no iframe injection tricks. Same profile = same extension sandbox = direct API access.

2. **Do not present external Chrome/Brave CDP control as the product Browser.** CDP-based remote control of a separately launched browser is a development/debug tool only — it is not the product architecture.

3. The native messaging host bridges the extension to the local ResonantOS backend (provider fabric, living archive, Rust core). All AI calls flow through this bridge, never directly from the extension to cloud providers.

---

## Rationale

| Option | Verdict | Reason |
|--------|---------|--------|
| Electron host (ADR-035) | ❌ Superseded | Heavy, duplicate browser engine, wallet injection complexity |
| Wallet-capable custom browser (ADR-036) | ❌ Superseded | Maintenance burden, diverges from Phantom's extension model |
| Chromium-family browser + extension | ✅ Accepted | Ships on every OS, wallet works natively, side-panel UX is standard |

---

## Consequences

- The ResonantOS Browser app is a wrapper that launches a Chromium-family browser profile with the extension pre-installed and pinned.
- Install script (`scripts/install-browser-first-app.mjs`) builds and registers the `ResonantOS Browser.app` wrapper.
- Development uses `browser-first:dev` npm script to launch the pre-configured profile.
- The native messaging host (`resonant_browser_native_host`) handles all backend IPC.

---

## References

- ADR-035: Electron Host + Rust Core Runtime (Superseded by ADR-037)
- ADR-036: Wallet-Capable Browser Host (Superseded by ADR-037)
- ADR-017: Resonant Browser Addon
- ADR-008: Wallet / Web3 Security
