# ResonantOS vNext

New desktop-first ResonantOS foundation built as a Tauri + React shell.

This app is intentionally separate from the legacy Flask dashboard. It implements the first executable layer of the vNext architecture:

- core shell
- Strategist identity
- Setup agent
- Living Archive policy model
- add-on SDK manifest format
- explicit capability grants
- shared/private provider model
- channel and workspace model
- bundled add-on manifest examples; add-ons are available in the catalog but not installed or trusted by default

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

## Current Scope

This is a working foundation, not the full product. The current implementation provides:

- typed public contracts for vNext architecture
- a persisted local shell state
- add-on manifest sideloading
- policy enforcement helpers for archive trust and provider fallback
- a branded shell UI showing the target operating model

## Structure

- `src/core/contracts.ts`: public interfaces and types
- `src/core/defaults.ts`: core services, providers, archive policy, and default state
- `src/core/policies.ts`: archive write guards and provider selection logic
- `public/addons/*.json`: bundled add-on SDK manifest examples
- `src-tauri/src/lib.rs`: desktop persistence and sideload commands
