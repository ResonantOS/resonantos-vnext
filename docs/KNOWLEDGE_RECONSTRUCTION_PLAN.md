# Knowledge Reconstruction Plan — ResonantOS vNext

Last updated: 2026-05-22

This document identifies gaps, overlaps, and future consolidation candidates in the documentation surface. It is a preparation document — it does not prescribe execution but maps the territory for future documentation work.

---

## Identified Documentation Drift Zones

### 1. Architecture Overview Overlap
**Documents involved:** `docs/ARCHITECTURE.md`, `docs/architecture/VNEXT_SYSTEM_DIAGRAM.md`, `docs/architecture/CODEMAP.md`, `docs/REPO_INDEX.md`

**Overlap description:** All four documents describe the system topology from slightly different angles. ARCHITECTURE.md is prose-oriented system behavior; VNEXT_SYSTEM_DIAGRAM.md is diagram-oriented with capability status; CODEMAP.md is classification-oriented with risk analysis; REPO_INDEX.md is directory-oriented with brief descriptions.

**Consolidation candidate:** Consider merging CODEMAP and REPO_INDEX into a single topology document. ARCHITECTURE.md and VNEXT_SYSTEM_DIAGRAM.md could cross-reference rather than duplicate.

### 2. Project Status vs Feature Backlog
**Documents involved:** `docs/PROJECT_STATUS.md`, `docs/FEATURE_BACKLOG.md`

**Overlap description:** Both describe future work. PROJECT_STATUS.md includes "Current Product Direction" and known gaps. FEATURE_BACKLOG.md lists specific feature work. The line between "status" and "backlog" blurs in the "Current Product Direction" section.

**Consolidation candidate:** Keep separate but clarify the boundary: STATUS = what exists now + known gaps; BACKLOG = prioritized future work.

### 3. ADR Density
**Documents:** 32 ADRs in `docs/adr/` covering everything from platform stack to specific addon integrations.

**Observation:** ADRs are comprehensive and well-structured individually, but navigating 32 of them requires external aids (the ADR index in `docs/README.md`). No ADR-to-ADR cross-reference index exists.

**Recommendation:** Add an ADR index document (`docs/adr/INDEX.md`) that maps ADRs by topic area (Platform, Addons, Archive, Providers, Security, UX).

### 4. Templates Scattered
**Pre-normalization state:** Templates were scattered across `docs/architecture/` (ADDON_*_TEMPLATE.md, addon-runbooks/, addon-skills/, engineer-skills/).

**Post-normalization state:** Templates are now consolidated in `docs/templates/` with subdirectories for addons, agents, runbooks, and audits.

**Remaining concern:** Verify that all template references in ADRs and other docs point to the new locations.

---

## Missing Documentation

### Missing Specs
The `docs/specs/` directory exists but contains only a README stub. No formal implementation specifications exist yet. Areas that would benefit from specs:

| Spec Area | Priority | Rationale |
|-----------|----------|-----------|
| Addon manifest schema | HIGH | Addon developers need a spec to target. Currently inferred from ADRs + code. |
| Capability grant model | HIGH | Security-critical. Currently described in ADRs but not as a formal spec. |
| Provider routing contract | HIGH | Multiple provider types need clear contract documentation. |
| Living Archive memory domain schema | MEDIUM | Memory domain structure is in ADR-013 but not as a formal data model spec. |
| IPC command contract | MEDIUM | 85 Tauri commands would benefit from a catalog spec. |
| Chat rail UX spec | LOW | ADR-004 exists but product UX is separately in `docs/product/`. |
| Delegation packet schema | MEDIUM | Task workspace format needs documentation for external tooling. |

### Missing Runtime Diagrams
Current diagrams exist in `VNEXT_SYSTEM_DIAGRAM.md` (Mermaid). Missing diagram types:

| Diagram | Value |
|---------|-------|
| IPC flow diagram (command → enforce → execute → response) | Security audit, contributor onboarding. |
| Provider routing sequence diagram | Understanding fallback and recovery paths. |
| Addon lifecycle state machine | SDK developer documentation. |
| Archive ingest pipeline flow | Understanding review/promotion/approval workflow. |
| Delegation packet lifecycle | Understanding task workspace creation through completion. |

### Missing Addon Lifecycle Docs
No single document describes the full addon lifecycle: manifest → validation → grant → sideload → activate → runtime → deactivate → uninstall. Information is distributed across ADR-006, ADR-018, ADR-026, and source code.

### Missing Provider Routing Docs
Provider routing is implemented in `src/core/provider-service.ts` and `src-tauri/src/provider_service.rs` but no standalone document explains the routing algorithm, fallback policy, or how to add a new provider type. Information is distributed across ADR-005, `defaults.ts`, and source code.

---

## Unresolved Architectural Ambiguities

From `SYSTEM_BOUNDARIES.md` and `CODEMAP.md` "Needs verification" sections:

| Ambiguity | Impact |
|-----------|--------|
| `server/` ↔ desktop app connection | Is there a companion service model? |
| Camofox ↔ Chromium browser path consolidation | Three browser integration paths — which are active? |
| Addon process isolation | Are `local-service` addons actually isolated? |
| Provider execution adapter completeness | Do all provider types have complete execution adapters? |
| `marionette_bridge.rs` purpose | Undocumented Rust module. |
| `resonator_service.rs` purpose | Undocumented Rust module. |
| Insight Engine addon status | Manifest exists, code exists, but is it maintained? |
| OpenClaw addon status | Legacy Alpha product — is it still an active addon? |
| Compute Fabric scope (ADR-032) | ADR exists but implementation is limited to diagnostics/GX10/NAS. |

---

## Future Consolidation Candidates

| Consolidation | Benefit |
|---------------|---------|
| CODEMAP.md + REPO_INDEX.md → unified topology doc | Single source of repo navigation truth. |
| ARCHITECTURE.md + VNEXT_SYSTEM_DIAGRAM.md → unified architecture doc | Reduce overlap; diagrams alongside prose. |
| Addon lifecycle docs (ADR-006, ADR-018, ADR-026) → single addon developer guide | Easier onboarding for addon developers. |
| Provider routing docs (ADR-005 + source) → provider developer guide | Clear path for adding new providers. |
| Archive docs (ADR-007, ADR-011, ADR-012, ADR-013, ADR-014, ADR-027) → Living Archive operations guide | Consolidated understanding of the archive system. |
| Multiple root-level legacy files → already moved to `docs/legacy/` | Completed by this normalization pass. |

---

## Future Indexing / RAG Opportunities

The documentation surface is now structured enough for semantic indexing:

- **ADRs** (`docs/adr/`) — 32 decision records, ideal for "why was this decision made" queries.
- **Architecture** (`docs/architecture/`) — system topology, boundaries, module map.
- **Templates** (`docs/templates/`) — reusable patterns for addon/agent/runbook creation.
- **Legacy** (`docs/legacy/`) — historical context, not for active retrieval.

**Recommended indexing order:**
1. ADRs — highest signal for decision archaeology.
2. Architecture docs — highest signal for system understanding.
3. Project status and backlog — highest signal for "what should I work on".
4. Templates — reference patterns.

---

## Next Steps

This document is preparation only. Future work should:

1. Resolve the architectural ambiguities in the "Needs verification" list.
2. Create the missing specs (addon manifest schema first).
3. Create the missing runtime diagrams (IPC flow diagram first).
4. Build the ADR index document.
5. Decide on consolidation candidates before starting any merge work.
6. Keep this plan updated as documentation gaps are filled.
