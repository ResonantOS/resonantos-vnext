# ADR-036 — Wallet-Capable Browser Host

**Status:** Superseded by ADR-037  
**Date:** 2026-04-15  
**Superseded By:** ADR-037-browser-first-chromium-resonantos.md

---

## Context

This ADR explored shipping a custom Chromium fork or heavily patched browser build that would have native wallet support baked in at the browser level, removing the need for a wallet extension.

## Decision (Superseded)

A custom browser build would integrate Phantom-compatible wallet signing directly into the browser chrome, exposing a unified `window.resonantWallet` API.

## Supersession Note

This approach was superseded by ADR-037. Maintaining a custom browser fork requires continuous rebasing against Chromium security patches, creates a substantial engineering burden, and diverges from the Phantom Wallet extension model that users already trust.

**See ADR-037 for the accepted architecture.**
