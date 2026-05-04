# ResonantOS vNext

New desktop-first ResonantOS foundation built as a Tauri + React shell.

This app is intentionally separate from the legacy OpenClaw-centered Alpha dashboard. It implements the first executable layer of the vNext architecture:

- modular desktop shell
- Resonant Engineer kernel assistant
- replaceable Augmentor Chat default add-on
- replaceable Living Archive default add-on
- add-on SDK manifest format
- explicit capability grants
- shared/private provider model
- channel and workspace model
- local memory/MCP bridge examples for external clients

## Run

```bash
cd resonantos-vnext
npm install
npm run tauri:dev
```

For a browser-only preview:

```bash
npm run dev
```

## Public Source Preview

This repository is a public source preview of the new ResonantOS direction plus the SDK foundation for creating add-ons.

It is not a finished consumer release and it is not the legacy Alpha dashboard. The current release scope is:

- ResonantOS vNext shell and runtime foundation
- Add-on manifest contracts, validation, registry helpers, and capability model
- Default recommended catalog containing only Augmentor Chat and Living Archive
- Example memory-provider and Living Archive MCP bridge services for SDK validation

No new optional add-on is released in this checkpoint. Files outside `public/addons/index.json` may exist as SDK references, historical contracts, or development-only work; they are not installed, enabled, trusted, or advertised by default.

Packaged installers are still alpha-grade and unsigned. See [docs/ALPHA_DISTRIBUTION.md](docs/ALPHA_DISTRIBUTION.md) for current artifact and platform notes.

## Current Scope

This is a working foundation, not the full product. The current implementation provides:

- typed public contracts for vNext architecture
- a persisted local shell state
- add-on manifest sideloading
- policy enforcement helpers for archive trust and provider fallback
- a branded shell UI showing the target operating model
- scoped Living Archive memory bridge examples for external tools

## Structure

- `src/core/contracts.ts`: public interfaces and types
- `src/core/defaults.ts`: core services, providers, archive policy, and default state
- `src/core/policies.ts`: archive write guards and provider selection logic
- `src/sdk/addons`: add-on SDK validation and registry helpers
- `public/addons/index.json`: default public add-on catalog
- `examples`: SDK/reference local services and MCP bridge examples
- `src-tauri/src/lib.rs`: desktop persistence, sideload commands, and IPC registration
