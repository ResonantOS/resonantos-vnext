# Audio2TOL Add-on SDK Review

Status: Working review
Date: 2026-05-17

## App Shape Observed

Audio2TOL is currently a standalone Tauri app with a guided local pipeline:

1. Scan a recorder/source folder for supported audio files.
2. Copy raw audio into a selected destination, with optional backups.
3. Transcribe imported audio through local `whisper.cpp`.
4. Analyze transcripts through Ollama, LM Studio, MiniMax, OpenAI, or another OpenAI-compatible endpoint.
5. Render TOL markdown analysis notes from the selected protocol and template.
6. Emit live pipeline progress to the Tauri UI.

The output model maps cleanly to a Living Archive intake bundle, but the executable pipeline is not yet host-mediated by ResonantOS vNext. The safest alpha boundary is therefore:

- Audio2TOL continues to produce raw audio, transcript, and analysis artifacts.
- ResonantOS detects completed sessions through archive mappings.
- The add-on queues reviewable intake bundles instead of writing trusted knowledge pages directly.

## SDK Fit

SDK V0 handled these parts well:

- Explicit capabilities for filesystem, archive read, archive intake write, providers, and device integration.
- Manifest-declared shell navigation through `surface.shellNavigation`, once added, lets enabled add-ons expose a dock route without hardcoding installation checks in `App.tsx`.
- Workflow boundaries and non-goals for preventing raw TOL processing from expanding into broad memory mutation.
- Skill and Augmentor skill declarations for preserving the raw audio, transcript, analysis, and human-directive distinction.
- Hook and script contracts for a pre-ingest preflight.
- Memory access contract that blocks direct knowledge-page writes.

## SDK Gaps Found

- `host-command` tools are declared in manifests, but there is no generic host command dispatcher yet. Audio2TOL still needs command-specific wiring in `core/logician.ts` and archive runtime functions.
- Tool input/output schemas are accepted as opaque objects. The SDK does not yet validate JSON Schema shape deeply enough to catch malformed schemas.
- The SDK can declare `install`, `audit`, and `smokeTests`, but V0 does not execute those contracts generically across add-ons.
- Local-service `host-command` add-ons have no first-class config schema for mapped folders, provider policy, or output roots.
- The standalone Tauri pipeline cannot be imported directly into vNext without separating Audio2TOL's Rust core from its app shell.
- `surface.shellNavigation.sectionId` still targets host-owned routes. The SDK prevents missing dock entries, but it does not yet dynamically load arbitrary add-on UI bundles.

## Current Conversion Decision

Audio2TOL is modeled as a host-mediated local-service add-on whose first executable surface is Living Archive intake:

- `audio2tol.detect_bundles`
- `audio2tol.build_bundle`
- `audio2tol.bundle_preflight`
- `audio2tol.audit`

The immediate implementation upgrades `audio2tol.bundle_preflight` from a manifest-only Logician check to actual TOL candidate discovery. This tests the SDK boundary without prematurely porting the whole transcription and analysis pipeline.

## Next SDK Improvements

1. Add a generic host-command dispatcher that resolves manifest tool names to reviewed runtime handlers.
2. Add config schema support for local-service add-ons.
3. Add generic smoke-test execution for `smokeTests`.
4. Add deep JSON Schema validation for tool input/output schemas.
5. Move from host-owned `sectionId` routing to signed/lazy UI bundle loading when third-party UI add-ons are ready.
6. Split Audio2TOL's Rust pipeline into a reusable service crate before embedding full processing inside vNext.
