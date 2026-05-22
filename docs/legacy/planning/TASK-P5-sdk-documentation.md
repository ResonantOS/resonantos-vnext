# Task P5: Memory-Provider SDK Documentation

## Context
The memory-provider broker (`src/core/memory-provider.ts`) allows third-party add-ons to replace Living Archive as the memory system. The contract exists but has NO documentation for external developers. A reference implementation exists at `examples/reference-memory-service.mjs` and an MCP bridge at `examples/living-archive-mcp.mjs`.

## Specification

### Create `docs/sdk/MEMORY-PROVIDER-SDK.md`

Document the complete memory-provider broker contract:

1. **Overview** — What the memory-provider broker does, why it exists (ADR-026 no-lock-in)
2. **Architecture** — Diagram of broker → provider routing, Living Archive as default, http-json sideload
3. **Contract Operations** — Full API reference for each operation:
   - `status()` → `ArchiveRuntimeStatus`
   - `search(query, limit?)` → `ArchiveSearchResult`
   - `read(path)` → `ArchiveDocumentPayload`
   - `intakeWrite(input)` → `ArchiveIntakeWriteResult`
   - `ingestRequest(input)` → `ArchiveIngestRequestResult`
   - `reviewQueue()` → `ArchiveQueuedIngestRequest[]`
   - `reviewArtifacts()` → `ArchiveReviewArtifact[]`
   - `processIngestRequest(input)` → `ArchiveProcessIngestResult`
   - `maintenanceCycle(input)` → `ArchiveMaintenanceCycleResult`
   - `backgroundCycle(input)` → `ArchiveBackgroundCycleResult`
   - `lint()` → `ArchiveLintResult`
   - `semanticLint(input)` → `ArchiveSemanticLintResult`
   - `promoteReviewArtifact(input)` → `ArchivePromoteReviewArtifactResult`
   - `reviewDecision(input)` → `ArchiveReviewDecisionResult`
4. **Manifest Requirements** — What an add-on manifest needs to register as a memory-system provider:
   - `category: "memory"`
   - `systemSlots: [{ id: "memory-system", role: "default-provider", replaceable: true }]`
   - `requestedCapabilities: [{ capability: "memory-provider", scope: "system" }]`
5. **HTTP-JSON Sideload Protocol** — How `POST /memory/{operation}` endpoints work
6. **Reference Implementation** — Point to `examples/reference-memory-service.mjs` with walkthrough
7. **MCP Bridge** — Point to `examples/living-archive-mcp.mjs` with usage instructions
8. **Trust Boundary Rules** — What providers MUST NOT do (write trusted wiki pages directly, bypass review)
9. **Testing Guide** — How to test a custom memory provider against the broker

### Source Files to Reference
- `src/core/memory-provider.ts` (356 lines) — broker implementation
- `src/core/contracts.ts` — all type definitions (lines 815-870 for Archive types)
- `src/core/memory-provider.test.ts` — existing test patterns
- `src/core/memory-provider.reference.test.ts` — reference provider tests
- `examples/reference-memory-service.mjs` — working reference provider
- `examples/living-archive-mcp.mjs` — MCP bridge
- `docs/architecture/ADR-026-minimal-kernel-replaceable-default-addons.md`
- `docs/architecture/ADR-011-living-archive-host-service.md`

## Test Command
Verify the doc is well-formed markdown:
```bash
cat ~/resonantos-vnext/docs/sdk/MEMORY-PROVIDER-SDK.md | head -5
# Should start with a proper heading
```

## Scope
- 1 new file: `docs/sdk/MEMORY-PROVIDER-SDK.md` (~300-500 lines)
