# ADR-035 — Electron Host + Rust Core Runtime

**Status:** Superseded by ADR-037  
**Date:** 2026-04-01  
**Superseded By:** ADR-037-browser-first-chromium-resonantos.md

---

## Context

This ADR explored using Electron as the primary desktop host for ResonantOS, with a Rust core runtime handling performance-critical operations via IPC.

## Decision (Superseded)

An Electron application would host the ResonantOS UI and spawn a Rust sidecar for audio processing, memory operations, and provider fabric routing.

## Supersession Note

This approach was superseded by ADR-037. The Electron host adds a second Chromium engine on top of whatever browser the user already runs, doubles the footprint, and complicates Phantom Wallet integration (which requires running inside an existing browser's extension sandbox).

**See ADR-037 for the accepted architecture.**
