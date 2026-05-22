# Document Authority Model — ResonantOS vNext

Last updated: 2026-05-22

This document defines which documents in this repository serve as the authoritative source of truth for different concerns. When documents disagree, the authority lane resolves the conflict.

---

## Authority Lanes

### README.md — Onboarding Truth
**Authority over:** Project identity, scope, how to run and build.  
**Audience:** First-time visitors, new contributors, external evaluators.  
**Rule:** README must always reflect current runnable state. If a feature is not demoable, it must not be advertised in README.

### CODEMAP.md — Repo Topology Truth
**Authority over:** Directory classification, subsystem responsibilities, runtime relationships, high-risk zones, extension points.  
**Audience:** Contributors, AI agents, architecture maintainers.  
**Location:** `docs/architecture/CODEMAP.md`

### ARCHITECTURE.md — Current System Behavior Truth
**Authority over:** How the system is built and behaves right now — not how it should be, not how it will be, but how it is.  
**Audience:** Contributors, reviewers, architecture maintainers.  
**Location:** `docs/ARCHITECTURE.md`

### ADR/* — Decision History Truth
**Authority over:** Why structural decisions were made, what alternatives were considered, what consequences were accepted.  
**Audience:** Contributors, reviewers, future maintainers.  
**Location:** `docs/adr/ADR-NNN-*.md`  
**Rule:** ADRs are not status reports. They record decisions at the moment they were made. They may be superseded but never silently edited.

### SPECS/* — Implementation Contract Truth
**Authority over:** Formal specifications for features, APIs, and contracts.  
**Audience:** Implementers, reviewers, SDK consumers.  
**Location:** `docs/specs/`  
**Status:** Currently a README stub. No formal specs exist yet.

### AUDITS/* — Observed Risk Truth
**Authority over:** Point-in-time assessments of codebase health, security posture, documentation drift, and architecture compliance.  
**Audience:** Security reviewers, release managers, architecture maintainers.  
**Location:** `docs/audits/`

### FEATURE_BACKLOG.md — Future Intent Truth
**Authority over:** What feature work is planned, what is in progress, what is deferred.  
**Audience:** Contributors, project managers, AI agents.  
**Location:** `docs/FEATURE_BACKLOG.md`

### PROJECT_STATUS.md — Execution State Truth
**Authority over:** Current implementation checkpoint, known gaps, validation snapshot, recommended next work.  
**Audience:** Contributors, AI agents returning to the project, release managers.  
**Location:** `docs/PROJECT_STATUS.md`

### SYSTEM_BOUNDARIES.md — Architecture Seams Truth
**Authority over:** IPC boundaries, trust surfaces, addon isolation, provider boundaries, persistence boundaries.  
**Audience:** Security reviewers, architecture maintainers, SDK developers.  
**Location:** `docs/architecture/SYSTEM_BOUNDARIES.md`

### RUNTIME_SURFACES.md — Implementation Surface Catalog
**Authority over:** What code actually executes, stability classifications, implemented vs stubbed surfaces.  
**Audience:** Contributors, AI agents, reviewers.  
**Location:** `docs/architecture/RUNTIME_SURFACES.md`

### MODULE_MAP.md — Ownership Map
**Authority over:** Which module owns which feature, composition rules, anti-monolith guardrails.  
**Audience:** Contributors, reviewers.  
**Location:** `docs/architecture/MODULE_MAP.md`

### VNEXT_SYSTEM_DIAGRAM.md — System Diagram
**Authority over:** Visual system topology, implemented vs under-construction vs planned capabilities.  
**Audience:** Contributors, reviewers, new team members.  
**Location:** `docs/architecture/VNEXT_SYSTEM_DIAGRAM.md`

---

## Document Classifications

### Authoritative Documents
Documents that serve as the current source of truth for their lane. When these conflict with non-authoritative documents, authoritative documents win.
- `README.md`, `CODEMAP.md`, `ARCHITECTURE.md`, ADRs, `PROJECT_STATUS.md`, `FEATURE_BACKLOG.md`, `SYSTEM_BOUNDARIES.md`, `RUNTIME_SURFACES.md`, `MODULE_MAP.md`.

### Overlapping Documents
Documents that cover similar ground to authoritative documents. These are not wrong — they are candidates for future consolidation.
- `docs/architecture/VNEXT_SYSTEM_DIAGRAM.md` overlaps with `ARCHITECTURE.md` and `CODEMAP.md` on system topology.
- `docs/REPO_INDEX.md` overlaps with `CODEMAP.md` on directory classification.
- `docs/architecture/OPERATOR_KNOWLEDGE_BASE.md` overlaps with `PROJECT_STATUS.md` and ADRs on operational guidance.
- `docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md` overlaps with ADR-013 on memory domain analysis.

### Draft Documents
Documents that are in progress and not yet authoritative.
- `docs/specs/` — currently a README stub.
- `docs/architecture/OPERATOR_KNOWLEDGE_BASE.md` — needs verification of completeness.

### Legacy Documents
Documents preserved for historical context. Not authoritative for current state.
- `docs/legacy/reports/` — historical reports.
- `docs/legacy/qa/` — historical QA reports.
- `docs/legacy/planning/` — historical planning and task docs.
- `docs/legacy/experiments/` — experimental and speculative docs.

### Generated Documents
Documents that are produced by automation, not hand-authored.
- None currently confirmed. May apply to future API docs, type documentation, or build reports.

---

## Conflict Resolution

When two documents disagree:

1. **ADR trumps architecture overview.** ADRs record decisions; architecture docs describe patterns.
2. **PROJECT_STATUS trumps FEATURE_BACKLOG.** Status describes what IS; backlog describes what WILL BE.
3. **Code trumps all docs.** If docs and code disagree, code wins and docs need updating.
4. **Audit findings trump architecture claims.** Audits observe reality; architecture describes intent.
5. **Newer authoritative doc trumps older.** If two authoritative docs conflict, the newer one reflects more recent decisions.

---

## Maintenance Rules

- When a new structural decision is made, add or update an ADR.
- When a refactor changes ownership, update `MODULE_MAP.md`.
- When a feature lands or is removed, update `PROJECT_STATUS.md` and `FEATURE_BACKLOG.md`.
- When the repo topology changes, update `CODEMAP.md` and `REPO_INDEX.md`.
- When an audit is performed, add it to `docs/audits/`.
- When a document is superseded, move it to `docs/legacy/` or mark it as deprecated in-place.
