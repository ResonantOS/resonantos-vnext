# Audits

## Purpose

Audits are structured reviews of the codebase that produce findings, risk assessments, and recommended actions. Unlike ADRs (which record decisions) or specs (which define contracts), audits answer the question: *"Does the system match what we think it is?"*

Audits produce snapshots — a point-in-time assessment that may go stale as the codebase evolves. Each audit should declare its freshness and the commit hash it was performed against.

## When to Run an Audit

Run an audit when:

- A significant refactor or feature lands and you need to check for regressions or boundary violations.
- A security-sensitive change touches capability enforcement, provider routing, or IPC.
- Documentation claims need verification against the actual code.
- A release is approaching and you need a structured confidence check.
- A drift review reveals stale docs and the gap is large enough to warrant a full audit pass.

## Proposed Audit Lanes

### Architecture Audit

**Question:** Does the code match the documented architecture?

**Scope:** Module ownership, service boundaries, IPC contracts, dependency direction. Compare `docs/architecture/MODULE_MAP.md` and `docs/ARCHITECTURE.md` against actual imports and invocation paths.

### SDK Surface Audit

**Question:** Is the add-on SDK surface stable, documented, and enforced?

**Scope:** `src/sdk/` exports, capability declarations in `public/addons/`, runtime policy enforcement in `src/core/policies.ts`. Check for undocumented surface, missing capability checks, or SDK leak paths.

### Capability / Security Audit

**Question:** Are capability grants correctly enforced at every boundary?

**Scope:** Manifest declarations, Tauri capability files, runtime policy checks, IPC command authorization. Check for privilege escalation paths, missing checks, or overly broad grants.

### Distribution Audit

**Question:** Can the app be built, signed, and distributed cleanly?

**Scope:** Build pipeline (`npm run tauri:build`), platform artifacts, code signing, binary sizes, dependency licensing. Check for missing build steps, unsigned binaries, or license conflicts.

### Documentation Drift Audit

**Question:** Do the docs reflect the actual code?

**Scope:** All current-state docs (`docs/PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, ADRs, module map, system diagram). Compare documented claims against observable code behavior. Flag stale claims.

## Audit Template

```markdown
# Audit: [Title]

## Metadata

- **Date:** [YYYY-MM-DD]
- **Commit:** [git hash]
- **Auditor:** [name or role]
- **Lane:** [Architecture / SDK Surface / Capability-Security / Distribution / Documentation Drift]
- **Status:** [In Progress / Complete / Stale]

## Scope

[What was examined and what was explicitly excluded.]

## Methodology

[How the audit was performed — manual review, automated tooling, grep patterns, test runs.]

## Findings

| ID | Severity | Area | Description | Recommendation |
|----|----------|------|-------------|----------------|
| F-01 | Critical / High / Medium / Low | [area] | [finding] | [recommended action] |

## Evidence

- [Link to relevant code, test output, or screenshots.]

## Limits

- [What this audit did NOT cover.]
- [Known blind spots.]

## Freshness

- **Status:** Live / Stale / Superseded
- **Supersedes:** [link to prior audit, if any]
- **Superseded by:** [link to newer audit, if any]
```

---

*Existing audit snapshots can be found in `docs/architecture/` (e.g., `ARCHITECTURE_AUDIT_2026-04-26.md`, `ALPHA_PREVIEW_AUDIT_2026-04-28.md`). New audits should live in this directory (`docs/audits/`).*
