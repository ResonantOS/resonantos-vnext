# ResonantOS vNext Docs

This folder is the documentation entrypoint for the current codebase.

## Navigation

- [REPO_INDEX.md](./REPO_INDEX.md)
  - map of the visible repo structure for contributors and agents
- [ARCHITECTURE.md](./ARCHITECTURE.md)
  - first-pass architecture overview based on the current codebase

## Read First

- [PROJECT_STATUS.md](./PROJECT_STATUS.md)
  - current implementation checkpoint, known gaps, guardrails, and recommended next work
- [architecture/MODULE_MAP.md](./architecture/MODULE_MAP.md)
  - current ownership map for modules and shell composition
- [architecture/VNEXT_SYSTEM_DIAGRAM.md](./architecture/VNEXT_SYSTEM_DIAGRAM.md)
  - current system diagrams, implemented capability map, under-construction areas, and next engineering sequence
- [architecture/ARCHITECTURE_AUDIT_2026-04-26.md](./architecture/ARCHITECTURE_AUDIT_2026-04-26.md)
  - current modularity checkpoint, validation snapshot, and next refactor risks
- [architecture/ADR-001-platform-stack.md](./architecture/ADR-001-platform-stack.md)
  - platform and language choices
- [architecture/ADR-002-modular-codebase.md](./architecture/ADR-002-modular-codebase.md)
  - module structure and anti-monolith rules
- [architecture/ADR-003-engineering-standards.md](./architecture/ADR-003-engineering-standards.md)
  - standards for code citations, testing, security, and cross-platform behavior
- [architecture/ADR-004-chat-rail.md](./architecture/ADR-004-chat-rail.md)
  - UX and product rules for the Strategist chat rail
- [architecture/ADR-005-provider-fabric-routing.md](./architecture/ADR-005-provider-fabric-routing.md)
  - provider fabric, runtime nodes, centralized routing, and fallback/recovery
- [architecture/ADR-006-addon-runtime-sdk.md](./architecture/ADR-006-addon-runtime-sdk.md)
  - add-on provenance, signing, capability grants, and runtime isolation
- [architecture/ADR-007-living-archive-boundaries.md](./architecture/ADR-007-living-archive-boundaries.md)
  - archive read/write/ingest boundaries and Strategist-owned knowledge writes
- [architecture/ADR-008-wallet-web3-security.md](./architecture/ADR-008-wallet-web3-security.md)
  - wallet custody tiers, signing rules, and add-on restrictions
- [architecture/ADR-009-rust-service-ipc-boundary.md](./architecture/ADR-009-rust-service-ipc-boundary.md)
  - privileged service ownership and host/UI boundary rules
- [architecture/ADR-010-recovery-ladder.md](./architecture/ADR-010-recovery-ladder.md)
  - staged recovery flow, better-brain restoration, and Engineer promotion policy
- [architecture/ADR-011-living-archive-host-service.md](./architecture/ADR-011-living-archive-host-service.md)
  - real Living Archive host boundary over config, wiki pages, SQLite stats, intake, review queue, and ingest-review processing
- [architecture/ADR-012-living-archive-approval-policy.md](./architecture/ADR-012-living-archive-approval-policy.md)
  - tiered approval policy so trusted archive promotion defaults to Strategist review, not blanket human review
- [architecture/ADR-013-living-archive-memory-domains.md](./architecture/ADR-013-living-archive-memory-domains.md)
  - Human Knowledge, External Knowledge, AI Memory, Mixed Library staging, and canonical import rules
- [architecture/ADR-014-system-architecture-memory.md](./architecture/ADR-014-system-architecture-memory.md)
  - host-owned ResonantOS architecture memory available before user knowledge intake
- [architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md](./architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md)
  - Delegation Packets, native tool fabric, initial add-on catalog, and LangGraph/Mangle policy split
- [architecture/ADR-016-context-memory-compaction.md](./architecture/ADR-016-context-memory-compaction.md)
  - host-owned context compaction, raw transcript preservation, structured compact state, and provider-aware context budgets
- [architecture/ADR-023-addon-repository-registry-model.md](./architecture/ADR-023-addon-repository-registry-model.md)
  - add-on repository ownership, registry promotion, curation, sideloading, and alpha add-on policy
- [architecture/ADR-026-minimal-kernel-replaceable-default-addons.md](./architecture/ADR-026-minimal-kernel-replaceable-default-addons.md)
  - minimal kernel, replaceable Augmentor Chat, replaceable Living Archive, and no-lock-in default add-on rules
- [architecture/ADR-027-living-archive-llm-wiki-compliance.md](./architecture/ADR-027-living-archive-llm-wiki-compliance.md)
  - Living Archive / LLM Wiki compliance, background sync, verifier approval, semantic lint, repair queueing, and V1 completion baseline
- [architecture/ADR-029-living-archive-mcp-bridge.md](./architecture/ADR-029-living-archive-mcp-bridge.md)
  - scoped Living Archive MCP bridge, local memory service, portable fallback, and external-client memory boundaries
- [ALPHA_DISTRIBUTION.md](./ALPHA_DISTRIBUTION.md)
  - internal alpha build workflow, platform artifacts, signing status, privacy boundary, and reviewer instructions
- [working/SESSION_CONTEXT_2026-04-25.md](./working/SESSION_CONTEXT_2026-04-25.md)
  - reloadable working-memory note for future sessions and compaction recovery
- [FEATURE_BACKLOG.md](./FEATURE_BACKLOG.md)
  - active feature backlog and recent extraction progress
- [product/UX-001-resonantos-app-shell.md](./product/UX-001-resonantos-app-shell.md)
  - UI/UX source of truth for the app-shell, launcher, collapsible rails, embedded add-on workspace, and full-screen mode
- [specs/README.md](./specs/README.md)
  - proposed future specs for add-on manifests, capability grants, provider model, and more
- [adr/README.md](./adr/README.md)
  - ADR template, lifecycle, and guidance on when to write one
- [audits/README.md](./audits/README.md)
  - audit lanes, template, and guidance on structured codebase review
- [agent-workflows/README.md](./agent-workflows/README.md)
  - repo-local conventions for AI-assisted development

## What These Documents Answer

- `How is the system built?`
  - `ADR-001`
- `How should code be organized?`
  - `ADR-002`
- `What standards are we following?`
  - `ADR-003`
- `Which module owns what?`
  - `MODULE_MAP`
- `How does ResonantOS vNext work end to end, and what is working vs under construction?`
  - `VNEXT_SYSTEM_DIAGRAM`
- `How do providers, add-ons, archive, wallets, and IPC work?`
  - `ADR-005` through `ADR-009`
- `How does recovery mode work?`
  - `ADR-010`
- `How does the Living Archive host service work?`
  - `ADR-011`
- `How does archive approval avoid becoming human bottleneck work?`
  - `ADR-012`
- `How are Human Knowledge, External Knowledge, and AI Memory separated?`
  - `ADR-013`
- `How do Augmentor and the Engineer know current ResonantOS architecture before user intake?`
  - `ADR-014`
- `How does Augmentor delegate work while staying available to the human?`
  - `ADR-015`
- `How do long chats avoid amnesia when the context window fills?`
  - `ADR-016`
- `Where should add-ons live, and how do community add-ons become curated?`
  - `ADR-023`
- `What remains non-replaceable, and which defaults must be replaceable add-ons?`
  - `ADR-026`
- `Does the Living Archive still match the original LLM Wiki pattern?`
  - `ADR-027`
- `How can external AI clients access scoped Living Archive memory?`
  - `ADR-029`
- `How do we build and share the internal alpha on macOS, Windows, and Linux?`
  - `ALPHA_DISTRIBUTION`
- `What should a future compacted/new session reload first?`
  - `working/SESSION_CONTEXT_2026-04-25.md`
- `What exists now, what is missing, and what should we do next?`
  - `PROJECT_STATUS`
- `What is still planned?`
  - `FEATURE_BACKLOG`
- `What UI/UX experience are we building?`
  - `product/UX-001-resonantos-app-shell.md`

## Disclaimer

These documents describe the current understanding of the codebase. They must not overstate release readiness. Claims about what the system *does* require evidence (test output, runtime proof, or an audit snapshot). Claims about what the system *will do* are plans, not guarantees.

## Usage Rule

When a new structural decision is made, add or update an ADR before the codebase drifts.

When a refactor changes ownership or service boundaries, update these in the same change:

- `architecture/MODULE_MAP.md`
- `ARCHITECTURE.md`
- `FEATURE_BACKLOG.md`
- the relevant ADR if the rule itself changed
