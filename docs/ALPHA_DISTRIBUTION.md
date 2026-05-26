# Alpha Distribution

Status: Internal technical preview  
Date: 2026-04-28

## Purpose

This document explains how to build and share the current ResonantOS vNext alpha with the tech team.

The goal is to let reviewers install the core shell, inspect the architecture, configure their own providers, and test the Living Archive flow without receiving any founder personal data or trusted add-ons.

## Supported Alpha Targets

The repository now includes a manual GitHub Actions workflow:

```text
.github/workflows/alpha-build.yml
```

It builds native artifacts on:

- macOS
- Windows
- Ubuntu Linux

This follows the Tauri distribution model where each platform is built on its native runner. The workflow uses the official Tauri GitHub build guidance and installs the Linux WebKitGTK dependencies required by Tauri.

Reference:

- Tauri GitHub pipeline docs: `https://v2.tauri.app/distribute/pipelines/github/`
- Tauri prerequisites: `https://v2.tauri.app/start/prerequisites/`

## How To Build Locally

Use the repository Rust toolchain pin before native builds:

```bash
rustup toolchain install 1.94.1
rustup override set 1.94.1
```

The repo also includes `rust-toolchain.toml`, so rustup-aware shells should select `1.94.1` automatically.

macOS local build:

```bash
npm ci
npm test -- --run
cd src-tauri && cargo fmt --check && cargo test && cd ..
npm run build
npm run tauri:build
```

Current macOS artifacts are generated under:

```text
src-tauri/target/release/bundle/macos/
src-tauri/target/release/bundle/dmg/
```

## How To Build In GitHub

1. Open the private GitHub repository.
2. Go to `Actions`.
3. Select `alpha-build`.
4. Run workflow manually with `workflow_dispatch`.
5. Download the platform artifact for each reviewer.

Expected artifacts:

- `resonantos-alpha-macos`
- `resonantos-alpha-windows`
- `resonantos-alpha-linux`

Artifacts are retained for 14 days.

## Linux Toolchain Note

Linux native Tauri builds compile GTK/WebKitGTK Rust bindings through the Tauri dependency graph.

Known alpha blocker:

- Linux x86_64 on an Intel Haswell GT70 test machine passed Vitest, Vite production build, and Rust unit tests.
- Native Tauri packaging was blocked by a rustc internal compiler error / SIGSEGV while compiling the `gtk` crate.
- The reported failing environment used Rust 1.95 with LLVM 20 on Haswell-class hardware.
- Repeated local build-flag workarounds did not resolve it, which points to an upstream compiler/toolchain issue rather than a ResonantOS source error.

Current alpha policy:

- Use Rust `1.94.1` for reproducible alpha packaging.
- GitHub `alpha-build` is pinned to Rust `1.94.1`.
- If Linux native packaging fails with Rust `1.95+`, first retest with rustup-managed `1.94.1` before debugging ResonantOS code.
- If `1.94.1` still fails on that hardware, treat Haswell Linux native packaging as blocked and use GitHub-hosted Linux artifacts until the upstream compiler path is fixed.

## Current Signing Status

The internal alpha is unsigned.

Expected reviewer friction:

- macOS may show Gatekeeper warnings.
- Windows may show SmartScreen warnings.
- Linux may require executable permission or package-manager confirmation depending on artifact type.

Do not treat this as production distribution.

Production distribution requires:

- macOS Developer ID signing and notarization
- Windows code signing certificate
- Linux package signing/repository decision
- updater signing policy

## Alpha Privacy Boundary

The alpha should not include founder personal data.

Current privacy rules:

- user data belongs under `ResonantOS_User/`
- managed memory belongs under `ResonantOS_User/Memory`
- provider secrets belong under `ResonantOS_User/Secrets`
- wallet state belongs under `ResonantOS_User/Wallets`
- logs belong under `ResonantOS_User/Logs`
- backups belong under `ResonantOS_User/Backups`

Ignored local folders must not be shared as source:

- `dist/`
- `node_modules/`
- `src-tauri/target/`
- `Memory/`
- `Living_Archive/`
- `.resonantos/`
- `.env`
- `tmp/`

## Add-on Policy For Alpha

The alpha is a core ResonantOS preview.

Add-ons are not part of the guaranteed install experience.

Rules:

- no add-on should be installed or trusted by default
- add-on catalog entries may exist for developer inspection
- Obsidian, Browser, Terminal, OpenCode, OpenClaw, Hermes, and Audio2TOL are experimental or external
- reviewers should configure providers and memory using their own data
- founder-specific add-ons should move toward separate repositories as defined in `ADR-023`

## Reviewer Instructions

Ask reviewers to focus on:

- whether the core app launches on their OS
- whether the shell layout makes sense
- whether provider configuration is understandable
- whether the Living Archive start flow is understandable
- whether no personal founder data appears
- whether add-ons appear clearly unavailable/not trusted until installed

Ask reviewers not to evaluate as production-ready:

- wallet security
- encrypted vault storage
- signed add-on marketplace
- final browser automation
- final Obsidian compatibility
- final Windows/Linux installer polish

## Release Gate Before Sharing

Before sending a build:

- run `npm test -- --run`
- run `cargo fmt --check && cargo test` in `src-tauri`
- run `npm run build`
- run `npm run tauri:build` or the GitHub `alpha-build` workflow
- scan generated resources for founder paths and provider-key strings
- confirm add-ons are not installed or enabled by default
