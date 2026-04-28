# Session Context: 2026-04-25

## Purpose

This file is a reloadable working-memory note for future ResonantOS development sessions. It preserves visible project state, active decisions, and known gaps so context compaction or a new AI session does not cause amnesia.

This is not a dump of hidden model context. It is the explicit working state that should survive compaction.

## Repository State

- Working directory: local `resonantos-vnext` checkout
- Git repo: standalone nested repository, not a continuation of the older ResonantOS Alpha codebase
- Remote: private ResonantOS vNext repository
- Current branch: `main`
- Latest known commits:
  - `44d73ca Initial ResonantOS vNext desktop app`
  - `c8d072b Refine chat agent switching`
  - `5be085d Separate engineer chat from recovery mode`

## Product Direction

ResonantOS vNext is a desktop-first modular operating system for human-AI collaboration.

User intent behind this version:

- Build a sovereign control layer where the human has one trusted AI front door instead of many disconnected tools.
- Preserve the user's knowledge, identity, and philosophy without letting lower-trust agents rewrite trusted memory.
- Make AI work feel like an operating system workspace, not a pile of settings pages or separate apps.
- Prioritize long-term quality, portability, security, and modularity over short-term speed.
- Keep the system adaptable as AI providers, local models, subscriptions, and add-ons change.

Core parts:

- ResonantOS shell
- Strategist agent, default name `Augmentor`
- Resonant Engineer Agent
- Living Archive

Everything else is an add-on or runtime:

- OpenClaw
- Hermes
- Codex
- Claude Code
- OpenCode
- Obsidian
- Browser
- Audio2TOL
- Shield
- Logician
- R-Awareness / SSoT systems

The shell should feel like an operating system, not a settings website.

## Current UI Direction

The app uses a three-area layout:

- thin left app launcher rail
- central app/workspace area
- persistent right AI chat rail

The right chat rail supports:

- Augmentor and Resonant Engineer agent selection
- chat history side strip
- pinned/history sections
- per-thread three-dot menu with Pin, Branch, Delete
- message actions for copy, edit, branch, regenerate, delete, and save-to-archive
- model selector in the composer
- context indicator as a small percentage pill

Important behavior:

- Switching to the Resonant Engineer chat must not activate Emergency Recovery Mode.
- Emergency Recovery Mode uses the Engineer, but the Engineer can be used outside recovery.
- Hermes should not appear as a chat agent until installed or enabled.

## Current Architecture Docs

Read these first:

- `docs/README.md`
- `docs/architecture/MODULE_MAP.md`
- `docs/architecture/ADR-001-platform-stack.md`
- `docs/architecture/ADR-002-modular-codebase.md`
- `docs/architecture/ADR-003-engineering-standards.md`
- `docs/architecture/ADR-004-chat-rail.md`
- `docs/architecture/ADR-005-provider-fabric-routing.md`
- `docs/architecture/ADR-006-addon-runtime-sdk.md`
- `docs/architecture/ADR-007-living-archive-boundaries.md`
- `docs/architecture/ADR-008-wallet-web3-security.md`
- `docs/architecture/ADR-009-rust-service-ipc-boundary.md`
- `docs/architecture/ADR-010-recovery-ladder.md`
- `docs/architecture/ADR-011-living-archive-host-service.md`
- `docs/architecture/ADR-012-living-archive-approval-policy.md`
- `docs/architecture/ADR-013-living-archive-memory-domains.md`
- `docs/architecture/ADR-014-system-architecture-memory.md`
- `docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md`
- `docs/architecture/ADR-016-context-memory-compaction.md`
- `docs/product/UX-001-resonantos-app-shell.md`

## Living Archive State

Living Archive is core, not an add-on.

Memory domains:

- `Human Knowledge`
- `External Knowledge`
- `AI Memory`
- `Mixed Library` staging

Key rule:

- Human source knowledge must be preserved separately from AI-curated memory.
- AI Memory can improve and reorganize over time, but original human material must remain recoverable and reprocessable by future models.

System Architecture Memory exists under `Memory/AI_MEMORY/system` and is generated from docs/code contracts. It is loaded into Augmentor and Engineer prompts before normal user archive context.

## Context Compaction Gap

Current state:

- The chat rail has a context percentage indicator.
- That indicator is only a UI estimate, not a real compaction system.
- There is no implemented structured compaction pipeline yet.

New binding design:

- `ADR-016` defines Context Memory Compaction.
- The implementation must preserve user intent, the why behind requests, raw transcript, compact state, decision ledger, facts/preferences, open tasks, artifact pointers, and recent turns.
- Compaction must be source-linked, auditable, and provider-independent.

## Provider Strategy

The user cares about cost and availability, not only maximum model quality.

Known personal strategy example:

- GPT-5.4 / Codex for demanding coding and archive intake
- MiniMax fast account for Augmentor, Engineer, and main OpenClaw agent
- MiniMax slower account for subagents, cron, heartbeat, and routine work
- local GX10 models for local agents and fallback
- local Gemma 4 E2B as last-resort Emergency Recovery model

Routing must remain centralized in ResonantOS Provider Fabric.

## Engineering Standards

- Run deterministic checks before saying work is done.
- For code changes, prefer:
  - `npm test`
  - `npm run build`
  - Rust tests / formatting when Rust changed
  - `npm run tauri:build` for packaged app changes
- For UI changes, test the actual packaged Tauri macOS app, not only the web app.
- Use screenshots and visual inspection for UI work.
- Keep `App.tsx` as shell composition, not feature logic.
- Prefer module-specific controllers, selectors, and components.
- Use `apply_patch` for edits.
- Do not overwrite unrelated uncommitted work.

## Current Known Risks

- Context compaction is not implemented yet.
- Some UI surfaces still feel like settings pages rather than OS app workspaces.
- Add-on launcher and embedded app runtime are still early.
- Living Archive import UX needs further simplification and clear benefit explanation.
- Provider token accounting must become model-aware, not character-only.
- Chat branching must preserve compact state once compaction exists.

## Suggested Next Step

Implement the first slice of context memory infrastructure:

1. add chat transcript persistence contract
2. add provider-aware context budget estimator
3. replace the visual-only context pill with real budget state
4. add a `Compact now` command that generates structured compact state from existing messages
5. persist compact state separately from raw transcript

Do not start with provider-native compaction. Build the host-owned structured memory first, then optionally add provider-native optimizations.
