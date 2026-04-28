# Alpha Preview Audit: 2026-04-28

Status: Internal tech-team preview candidate

## Intent

This alpha is meant to show the new ResonantOS vNext direction, not a production release.

The preview should let the tech team inspect:

- the desktop-first ResonantOS shell
- the persistent Augmentor / Resonant Engineer chat rail
- the Living Archive first-run/import direction
- the provider fabric and model routing foundation
- the add-on catalog and SDK boundary
- the portable user-state folder model

It must not ship with the founder's personal archive, provider keys, vault paths, wallet state, or installed add-ons.

## Current Product Structure

Core parts present in this build:

- ResonantOS shell
- Augmentor, the Strategist agent
- Resonant Engineer Agent
- Living Archive host service

Everything else is represented as an add-on or future add-on:

- Obsidian
- Browser
- Terminal
- OpenCode
- OpenClaw
- Hermes
- Audio2TOL
- Telegram Channel
- Shield
- Logician
- R-Awareness

The add-on manifests are included as catalog entries so reviewers can inspect direction and capability requests. They are not installed or trusted by default.

## Portable User-State Boundary

The intended private-data boundary is the Portable User State Root from `docs/architecture/ADR-022-portable-user-state-secure-vault.md`.

Default shape:

```text
ResonantOS_User/
  Memory/
  Config/
  Secrets/
  Wallets/
  Logs/
  Backups/
```

Current implementation status:

- Fresh installs create the `ResonantOS_User` root under the user's Documents folder unless overridden.
- `RESONANTOS_USER_STATE_ROOT` or `RESONANT_USER_STATE_ROOT` can override the location.
- Living Archive managed memory resolves through `ResonantOS_User/Memory`.
- Provider secrets now resolve under `ResonantOS_User/Secrets/provider-secrets.json`.
- Wallet storage is architectural only; no wallet vault implementation is shipped.
- Secret encryption is not production-ready yet. The file location is corrected for portability, but encrypted vault hardening remains a required security milestone.

## Privacy Audit

Tracked product/runtime files were scanned for:

- raw API keys and token-like values
- private key material
- founder-specific runtime paths
- source-vault default paths
- installed add-on defaults

Current result:

- No raw API keys or private keys were found in tracked files.
- Product/runtime files no longer default to the founder's archive path.
- Obsidian, Browser, Terminal, OpenCode, OpenClaw, Hermes, and Audio2TOL are not installed by default.
- Local generated folders such as `dist/`, `node_modules/`, `src-tauri/target/`, `Memory/`, `Living_Archive/`, `.resonantos/`, `.env`, and `tmp/` are ignored and should not be shared as source.

Known caveat:

- Some tests still use synthetic absolute fixture paths. They are not runtime defaults and do not contain personal source content or secrets.

## Living Archive State

What works:

- archive runtime status
- portable user-state folder initialization
- guided import start page
- folder/vault preflight
- copy-oriented managed import
- recommended import plan with noisy technical folder exclusion
- review queue and trusted promotion boundaries
- system architecture memory generation

What is intentionally blocked:

- move-on-import
- structural reorganisation execution
- trusted knowledge writes from add-ons
- Audio2TOL/TOL workflow unless the Audio2TOL add-on is installed and enabled

## Add-on State

Catalog entries are available for review, but add-ons require explicit installation and grants.

Important preview behavior:

- Obsidian can be installed from the catalog and connected to a selected vault/folder.
- Browser, Terminal, and OpenCode are early foundations and should be treated as experimental.
- OpenClaw, Hermes, Audio2TOL, Shield, Logician, and R-Awareness are not present as working bundled systems.
- Add-on capability grants remain explicit; no add-on receives unrestricted archive/provider/filesystem access by default.

## Validation

Latest validation for this audit:

- `npm test -- --run`: 110 passed
- `cargo fmt --check && cargo test`: 53 passed, 2 ignored browser-engine execution tests
- `npm run build`
- `npm run tauri:build`
- generated bundle resource scan found no founder-specific paths or provider-key strings

## Preview Recommendation

This build is suitable for internal technical preview after a fresh app bundle is generated from the current clean source.

It is not suitable for public alpha because:

- secure encrypted vault storage is not implemented
- add-on signing/marketplace hardening is not complete
- browser/terminal/opencode surfaces are early
- cross-platform packaging has not been validated on Windows and Linux
- UI and onboarding still need simplification
