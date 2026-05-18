# Memory-Provider SDK

> **Intent citations:** ADR-026 (Minimal Kernel and Replaceable Default Add-ons), ADR-011 (Living Archive Host Service)

This document is the complete reference for building a third-party **memory-system provider** for ResonantOS vNext. After reading this, you will be able to build, register, serve, and test a custom memory provider without looking at any internal ResonantOS source code.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Broker Type Reference](#3-broker-type-reference)
4. [Contract Operations](#4-contract-operations)
5. [Manifest Requirements](#5-manifest-requirements)
6. [HTTP-JSON Sideload Protocol](#6-http-json-sideload-protocol)
7. [Reference Implementation Walkthrough](#7-reference-implementation-walkthrough)
8. [MCP Bridge](#8-mcp-bridge)
9. [Trust Boundary Rules](#9-trust-boundary-rules)
10. [Testing Guide](#10-testing-guide)

---

## 1. Overview

ResonantOS ships with **Living Archive** as the default memory system. Living Archive is a bundled add-on, not a mandatory kernel service. Any add-on that declares the right manifest fields and exposes the HTTP-JSON contract can replace it.

The **memory-provider broker** (`src/core/memory-provider.ts`) is the neutral routing layer that sits between product surfaces (chat, search UI, Strategist Agent) and whichever memory system is currently active. Product code calls the broker — it never calls Living Archive directly. This means your provider gets every call that Living Archive would have received.

**Why this exists (ADR-026):** ResonantOS's product philosophy rejects lock-in. If the system claims to be a sovereignty-first operating layer, the user must be able to replace the primary memory system with a community-built or self-hosted alternative.

### What the broker guarantees

- Memory-facing UI and agent flows always go through the broker.
- If no compatible provider is active, operations throw a clear error rather than silently falling back to Living Archive.
- V1 supports one adapter protocol: **`http-json`** — a sideloaded HTTP service you run alongside the shell.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Product Surfaces                                       │
│  (Chat, Search UI, Strategist Agent, MCP Bridge, …)    │
└────────────────────────┬────────────────────────────────┘
                         │  broker calls
                         ▼
┌─────────────────────────────────────────────────────────┐
│  MemoryProviderBroker  (src/core/memory-provider.ts)   │
│                                                         │
│  resolveMemoryProviderBroker(state, manifests)          │
│  → reads shell state and installed manifests            │
│  → returns one of three broker kinds:                   │
│                                                         │
│    "living-archive"  → direct host IPC                  │
│    "http-json"       → POST /memory/{op} over HTTP      │
│    "unsupported"     → throws on every call             │
└────┬───────────────────┬────────────────────────────────┘
     │                   │
     ▼                   ▼
Living Archive     Your HTTP-JSON Service
(addon.living-     (any language, any port,
 archive, default)  declared in add-on manifest)
```

### Resolution order

`resolveMemoryProviderBroker` evaluates in this order:

1. **No memory-slot manifests present** → returns the `living-archive` broker (legacy/test compatibility only).
2. **Memory-slot manifests present, none active** → returns the `unsupported` broker (all calls throw).
3. **`addon.living-archive` is the active provider** → returns the `living-archive` broker (direct IPC).
4. **Active provider declares `service.protocol: "http-json"`** → returns the `http-json` broker pointed at the configured endpoint.
5. **Active provider uses any other protocol** → returns the `unsupported` broker.

---

## 3. Broker Type Reference

```typescript
export type MemoryProviderKind = "living-archive" | "http-json" | "unsupported";

export type MemoryProviderBroker = {
  providerId: string;          // e.g. "addon.reference-memory"
  label: string;               // human-readable name
  kind: MemoryProviderKind;
  supports: {
    status: boolean;
    search: boolean;
    read: boolean;
    intakeWrite: boolean;
    ingestRequest: boolean;
    review: boolean;
  };
  // --- required operations ---
  status(): Promise<ArchiveRuntimeStatus>;
  search(query: string, limit?: number): Promise<ArchiveSearchResult>;
  read(path: string): Promise<ArchiveDocumentPayload>;
  intakeWrite(input: IntakeWriteInput): Promise<ArchiveIntakeWriteResult>;
  ingestRequest(input: IngestRequestInput): Promise<ArchiveIngestRequestResult>;
  reviewQueue(): Promise<ArchiveQueuedIngestRequest[]>;
  reviewArtifacts(): Promise<ArchiveReviewArtifact[]>;
  processIngestRequest(input: ProcessIngestInput): Promise<ArchiveProcessIngestResult>;
  decideReview(input: DecideReviewInput): Promise<ArchiveReviewDecisionResult>;
  promoteReviewArtifact(input: PromoteInput): Promise<ArchivePromoteReviewArtifactResult>;
  // --- optional operations (omit = no-op / throw) ---
  maintenanceCycle?(input: MaintenanceCycleInput): Promise<ArchiveMaintenanceCycleResult>;
  backgroundCycle?(input: BackgroundCycleInput): Promise<ArchiveBackgroundCycleResult>;
  lint?(): Promise<ArchiveLintResult>;
  semanticLint?(input: SemanticLintInput): Promise<ArchiveSemanticLintResult>;
};
```

All types are exported from `src/core/contracts.ts`. The sections below document each operation's exact input/output shapes.

---

## 4. Contract Operations

### 4.1 `status() → ArchiveRuntimeStatus`

Returns a snapshot of your provider's runtime health. Called by the health check, the shell dashboard, and any surface that needs to confirm the memory system is available before making further calls.

**HTTP endpoint:** `POST /memory/status` — body: `{}` (empty object)

**Response type:**

```typescript
interface ArchiveRuntimeStatus {
  status: "ready" | "attention" | "missing";
  mode: string;                         // provider-defined mode label, e.g. "reference"
  portableUserState: {
    rootPath: string;
    manifestPath: string;
    memoryRoot: string;
    configRoot: string;
    secretsRoot: string;
    walletsRoot: string;
    logsRoot: string;
    backupsRoot: string;
    source: string;
    initialized: boolean;
  };
  configPath: string;
  vaultRoot: string;
  managedRoot: string;
  wikiRoot: string;
  dataRoot: string;
  logsRoot: string;
  configRoot: string;
  mappingFile: string;
  intakeRoot: string;
  reviewQueueRoot: string;
  mappings: ArchivePathMapping[];
  sourceRoots: ArchiveSourceRoot[];
  ingestAgent: ArchiveIngestAgentStatus;
  stats?: ArchiveStats;
  recentActivity: ArchiveActivityEntry[];
}
```

**Minimal reference response:**

```json
{
  "status": "ready",
  "mode": "reference",
  "portableUserState": {
    "rootPath": "reference://root",
    "manifestPath": "reference://root/manifest.json",
    "memoryRoot": "reference://memory",
    "configRoot": "reference://config",
    "secretsRoot": "reference://secrets",
    "walletsRoot": "reference://wallets",
    "logsRoot": "reference://logs",
    "backupsRoot": "reference://backups",
    "source": "reference",
    "initialized": true
  },
  "configPath": "reference://config/archive.json",
  "vaultRoot": "reference://vault",
  "managedRoot": "reference://managed",
  "wikiRoot": "reference://wiki",
  "dataRoot": "reference://data",
  "logsRoot": "reference://logs",
  "configRoot": "reference://config",
  "mappingFile": "reference://vault-map.json",
  "intakeRoot": "reference://intake",
  "reviewQueueRoot": "reference://review/requests",
  "mappings": [],
  "sourceRoots": [],
  "ingestAgent": { "configured": false },
  "stats": {
    "pagesTotal": 1,
    "pagesByType": { "summary": 1 },
    "linksTotal": 0,
    "sourcesTotal": 0,
    "sourcesUnprocessed": 0,
    "activity7d": 0
  },
  "recentActivity": []
}
```

---

### 4.2 `search(query, limit?) → ArchiveSearchResult`

Full-text or semantic search over your provider's knowledge pages and raw source records.

**HTTP endpoint:** `POST /memory/search`

**Request body:**

```json
{ "query": "string", "limit": 12 }
```

`limit` defaults to `12` when omitted by the broker.

**Response type:**

```typescript
interface ArchiveSearchResult {
  query: string;
  pages: ArchiveSearchPageHit[];
  sources: ArchiveSearchSourceHit[];
}

interface ArchiveSearchPageHit {
  pageId: string;
  title: string;
  pageType: string;
  filePath: string;
  stage?: string;
  updated?: string;
  score: number;       // relevance score, higher = more relevant
  snippet: string;     // short excerpt for display
}

interface ArchiveSearchSourceHit {
  sourceId: string;
  title: string;
  sourceType: string;
  rawPath: string;
  processed: boolean;
}
```

Return `pages: []` and `sources: []` when nothing matches — never return an error for an empty result set.

---

### 4.3 `read(path) → ArchiveDocumentPayload`

Fetches a single document by path. The path is opaque to the broker — it is whatever your provider returned in a prior `search` or `reviewArtifacts` call.

**HTTP endpoint:** `POST /memory/read`

**Request body:**

```json
{ "path": "reference://memory/wiki/my-page.md" }
```

**Response type:**

```typescript
interface ArchiveDocumentPayload {
  path: string;
  title: string;
  docType: string;
  frontmatter: Record<string, unknown>;
  content: string;
}
```

Throw (HTTP 500 with `{ "error": "..." }`) if the path does not exist. Do not return a success response with empty content.

---

### 4.4 `intakeWrite(input) → ArchiveIntakeWriteResult`

Writes a raw artifact into your provider's intake staging area. Intake files are **not** trusted knowledge yet — they must go through the ingest → review → promote pipeline before appearing in search results.

**HTTP endpoint:** `POST /memory/intake-write`

**Request body:**

```typescript
{
  actorId: string;          // who is writing (e.g. "agent.strategist")
  bucket: string;           // logical sub-folder within intake
  fileName: string;         // filename for the artifact
  content: string;          // raw content to write
  metadata?: Record<string, unknown>;  // optional provider-defined metadata
}
```

**Response type:**

```typescript
interface ArchiveIntakeWriteResult {
  actorId: string;
  bucket: string;
  artifactPath: string;     // canonical path where the artifact was stored
  metadataPath: string | null;
}
```

---

### 4.5 `ingestRequest(input) → ArchiveIngestRequestResult`

Queues a source file for ingest review. This does **not** process or promote the source — it creates a reviewable request that the Strategist Agent will later pick up via `processIngestRequest`.

**HTTP endpoint:** `POST /memory/ingest-request`

**Request body:**

```typescript
{
  actorId: string;
  sourcePath: string;       // path of the source to ingest
  sourceType: string;       // e.g. "markdown", "pdf", "audio"
  sourceRole?: string;      // optional semantic role hint
  intent: string;           // why this should be ingested
  provenance?: Record<string, unknown>;
}
```

**Response type:**

```typescript
interface ArchiveIngestRequestResult {
  requestFile: string;      // path to the queued request artifact
  queuedAt: string;         // ISO 8601 timestamp
}
```

---

### 4.6 `reviewQueue() → ArchiveQueuedIngestRequest[]`

Returns all pending ingest requests waiting for Strategist processing.

**HTTP endpoint:** `POST /memory/review-queue` — body: `{}`

**Response:** Array of `ArchiveQueuedIngestRequest`. Return `[]` when the queue is empty.

---

### 4.7 `reviewArtifacts() → ArchiveReviewArtifact[]`

Returns all review artifacts (processed ingest requests awaiting promotion decision).

**HTTP endpoint:** `POST /memory/review-artifacts` — body: `{}`

**Response:** Array of `ArchiveReviewArtifact`. Return `[]` when none exist.

---

### 4.8 `processIngestRequest(input) → ArchiveProcessIngestResult`

Processes a queued ingest request using an LLM provider. Produces a review artifact with the Strategist's analysis, proposed wiki pages, and a recommended tier decision. Does **not** promote anything — that is a separate call.

**HTTP endpoint:** `POST /memory/process-ingest-request`

**Request body (key fields):**

```typescript
{
  requestFile: string;          // path from ingestRequest response
  providerId: string;           // LLM provider id
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  model: string;                // e.g. "claude-3-5-haiku-20241022"
  // optional verifier LLM fields (same shape, prefixed "verifier")
  verifierProviderId?: string;
  verifierModel?: string;
  // ... (see MemoryProviderBroker type for all fields)
}
```

**Response type:**

```typescript
interface ArchiveProcessIngestResult {
  requestFile: string;
  archivedRequestFile: string;
  reviewArtifactFile: string;
  summary: string;
  checkedAt: string;
  reviewArtifact: ArchiveReviewArtifact;
}
```

If your provider does not run LLM processing (reference providers may skip this), return a minimal no-op artifact with `decision.status: "pending"`.

---

### 4.9 `maintenanceCycle?(input) → ArchiveMaintenanceCycleResult` *(optional)*

Runs a full maintenance pass: process pending ingest requests, promote auto-approved artifacts, refresh navigation indices, run lint.

**HTTP endpoint:** `POST /memory/maintenance-cycle`

**Request body:** Same LLM configuration fields as `processIngestRequest`, plus:

```typescript
{
  maxRequests?: number;         // cap on requests to process in one cycle
  autoPromote?: boolean;        // whether to promote auto-approved artifacts
  actorId?: string;
}
```

**Response type:**

```typescript
interface ArchiveMaintenanceCycleResult {
  startedAt: string;
  finishedAt: string;
  processed: ArchiveProcessIngestResult[];
  promoted: ArchivePromoteReviewArtifactResult[];
  navigation: ArchiveNavigationRefreshResult;
  lint: ArchiveLintResult;
  skipped: string[];
  errors: string[];
}
```

---

### 4.10 `backgroundCycle?(input) → ArchiveBackgroundCycleResult` *(optional)*

Scans watched source folders for new/changed files, queues new ingest requests, then runs a maintenance cycle.

**HTTP endpoint:** `POST /memory/background-cycle`

**Request body:** Same as `maintenanceCycle`, plus:

```typescript
{
  rootPath?: string;    // optional override for source scan root
}
```

**Response type:**

```typescript
interface ArchiveBackgroundCycleResult {
  startedAt: string;
  finishedAt: string;
  scan: ArchiveSourceFolderScanResult;
  queuedRequestFiles: string[];
  skippedQueueSources: string[];
  maintenance: ArchiveMaintenanceCycleResult;
}
```

---

### 4.11 `lint?() → ArchiveLintResult` *(optional)*

Structural lint of your provider's knowledge pages. Checks for broken links, missing frontmatter, orphaned files, etc.

**HTTP endpoint:** `POST /memory/lint` — body: `{}`

**Response type:**

```typescript
interface ArchiveLintResult {
  checkedAt: string;
  reportPath: string;
  pagesChecked: number;
  sourcesChecked: number;
  findings: ArchiveLintFinding[];
}
```

---

### 4.12 `semanticLint?(input) → ArchiveSemanticLintResult` *(optional)*

LLM-assisted semantic quality review of knowledge pages: checks for redundancy, drift from source, low-confidence pages.

**HTTP endpoint:** `POST /memory/semantic-lint`

**Request body:**

```typescript
{
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  model: string;
  maxCandidates?: number;
}
```

**Response type:**

```typescript
interface ArchiveSemanticLintResult {
  checkedAt: string;
  reportPath: string;
  providerId: string;
  model: string;
  sourceLintReportPath: string;
  candidatesReviewed: number;
  findings: ArchiveSemanticLintFinding[];
  summary: string;
  repairRequestFiles: string[];
}
```

---

### 4.13 `promoteReviewArtifact(input) → ArchivePromoteReviewArtifactResult`

Promotes an approved review artifact into trusted knowledge pages. The broker calls this after a `decideReview` call returns `action: "approve"`.

**HTTP endpoint:** `POST /memory/promote-review-artifact`

**Request body:**

```typescript
{
  artifactFile: string;   // path from reviewArtifacts or processIngestRequest
  actorId: string;
}
```

**Response type:**

```typescript
interface ArchivePromoteReviewArtifactResult {
  artifactFile: string;
  promotedAt: string;
  actorId: string;
  pagesWritten: string[];
  skippedPages: string[];
}
```

**Refuse promotion** if the artifact's `decision.status` is anything other than `"approved"`. Return a clear error (HTTP 500 with `{ "error": "..." }`).

---

### 4.14 `decideReview(input) → ArchiveReviewDecisionResult`

Records a human or automated approval/rejection decision on a review artifact.

**HTTP endpoint:** `POST /memory/decide-review`

**Request body:**

```typescript
{
  artifactFile: string;
  actorId: string;
  action: "approve" | "reject" | "escalate";
  notes?: string;
}
```

**Response type:**

```typescript
interface ArchiveReviewDecisionResult {
  artifactFile: string;
  status: string;         // reflects the action taken
  action: string;
  actorId: string;
  decidedAt: string;
  tierApplied: string;
  summary: string;
}
```

---

## 5. Manifest Requirements

Your add-on manifest (`addon.json` or `package.json#resonantos`) must declare:

```json
{
  "id": "addon.your-memory-provider",
  "name": "Your Memory Provider",
  "version": "1.0.0",
  "author": "Your Name",
  "category": "memory",
  "sdkVersion": "0.1.0",
  "description": "A custom memory provider for ResonantOS.",
  "runtimeType": "local-service",
  "surfaces": [],

  "systemSlots": [
    {
      "id": "memory-system",
      "role": "alternative-provider",
      "replaceable": true,
      "recommended": false
    }
  ],

  "requestedCapabilities": [
    {
      "capability": "memory-provider",
      "scope": "system",
      "revocationBehavior": "hard-stop"
    },
    {
      "capability": "network",
      "scope": "self",
      "revocationBehavior": "hard-stop"
    }
  ],

  "service": {
    "protocol": "http-json",
    "entrypoint": "http://127.0.0.1:4888",
    "healthCommand": "memory.status"
  },

  "archiveIntegration": {
    "readScopes": [],
    "intakeWriteScopes": [],
    "canRequestIngest": true,
    "canWriteKnowledgePages": false
  },

  "health": {
    "strategy": "http-json-memory-status"
  },

  "providerRequirements": {
    "sharedProfiles": [],
    "supportsPrivateCredentials": false
  },

  "installHooks": {},

  "compatibility": {
    "shellVersion": "^0.1.0",
    "platforms": ["macOS", "linux", "windows"]
  }
}
```

### Required fields

| Field | Required value | Notes |
|-------|---------------|-------|
| `category` | `"memory"` | Tells the registry this is a memory add-on |
| `systemSlots[].id` | `"memory-system"` | Registers for the replaceable memory slot |
| `requestedCapabilities[].capability` | `"memory-provider"` | Must be granted by the user before the broker routes to you |
| `service.protocol` | `"http-json"` | The only supported V1 adapter protocol |
| `service.entrypoint` | `"http://…"` | Your service URL; trailing slashes are stripped |

### Endpoint override at install time

The user (or installer) can override your default `service.entrypoint` by setting `memoryServiceUrl` or `serviceUrl` in the installation config. The broker checks these in order:

1. `installation.config.memoryServiceUrl`
2. `installation.config.serviceUrl`
3. `manifest.service.entrypoint`

This lets you ship a default port in the manifest and let users customize it without editing your manifest.

---

## 6. HTTP-JSON Sideload Protocol

### Transport

- All calls use **`POST`** with `Content-Type: application/json` and `Accept: application/json`.
- The URL pattern is `{endpoint}/memory/{operation}`.
- The request body is always a JSON object (never `null` or an array).
- Empty-body operations (e.g. `status`, `lint`) receive `{}`.
- The response must be a JSON object with HTTP status `200`.
- Errors must return HTTP `4xx`/`5xx` with body `{ "error": "description" }`.

### Operation name mapping

| Broker method | HTTP operation path |
|--------------|---------------------|
| `status` | `status` |
| `search` | `search` |
| `read` | `read` |
| `intakeWrite` | `intake-write` |
| `ingestRequest` | `ingest-request` |
| `reviewQueue` | `review-queue` |
| `reviewArtifacts` | `review-artifacts` |
| `processIngestRequest` | `process-ingest-request` |
| `maintenanceCycle` | `maintenance-cycle` |
| `backgroundCycle` | `background-cycle` |
| `lint` | `lint` |
| `semanticLint` | `semantic-lint` |
| `decideReview` | `decide-review` |
| `promoteReviewArtifact` | `promote-review-artifact` |

### CORS (for local dev UIs)

If your service will be called from a browser-based shell UI, include these response headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: content-type, accept
```

Respond to `OPTIONS` preflight requests with HTTP `204` and an empty body.

### Error handling

```json
{ "error": "Human-readable description of what went wrong." }
```

The broker throws a JavaScript `Error` with the message `Memory provider {operation} failed with HTTP {status}.` — your `error` field is surfaced in logs but not directly to the user.

---

## 7. Reference Implementation Walkthrough

The file **`examples/reference-memory-service.mjs`** is a complete, working memory provider you can run immediately. It proves the broker can route to a non-Living Archive provider.

### Running it

```bash
# Default port 4888
node examples/reference-memory-service.mjs

# Custom port
REFERENCE_MEMORY_PORT=4999 node examples/reference-memory-service.mjs
```

Output: `Reference Memory service listening on http://127.0.0.1:4888`

### What it implements

| Operation | Behavior |
|-----------|---------|
| `status` | Returns `{ status: "ready" }` with reference paths |
| `search` | In-memory case-insensitive filter over a hardcoded page list |
| `read` | Returns the matching page by `filePath`, throws 500 if not found |
| `intake-write` | Returns a synthetic path; writes nothing to disk |
| `ingest-request` | Returns a timestamp-based synthetic request path |
| `review-queue` | Always returns `[]` |
| `review-artifacts` | Always returns `[]` |
| `process-ingest-request` | Returns a no-op review artifact with `decision.status: "pending"` |
| `maintenance-cycle` | Returns an empty-pass result |
| `background-cycle` | Delegates to `maintenance-cycle` result |
| `lint` | Returns `findings: []` |
| `semantic-lint` | Returns `findings: []`, `candidatesReviewed: 0` |
| `decide-review` | Records the decision and returns it |
| `promote-review-artifact` | Returns `pagesWritten: []` |

### Architecture pattern

```javascript
// 1. Parse request body
const body = await readBody(request);

// 2. Look up handler by operation
const operation = request.url.slice("/memory/".length); // e.g. "search"
const handler = handlers[operation];
if (!handler) {
  json(response, 404, { error: `Unknown memory operation: ${operation}` });
  return;
}

// 3. Call handler and return JSON
json(response, 200, handler(body));
```

This pattern is the minimum needed to satisfy the broker. Build your real provider on top of it by replacing each handler with actual storage/retrieval logic.

### Sideloadable manifest

A companion manifest for the reference provider lives at **`examples/addons/reference-memory.json`**. Install it to test broker routing end-to-end without Living Archive.

---

## 8. MCP Bridge

The file **`examples/living-archive-mcp.mjs`** is a **Model Context Protocol bridge** that exposes Living Archive (or any http-json memory provider) as an MCP server. This lets external MCP clients (Claude Desktop, Cursor, etc.) call your memory provider through the standardized MCP tool interface.

### When to use it

- You want Claude Desktop or another MCP-compatible client to search and write to your memory provider.
- You are building a memory provider and want to give external AI agents a read/write channel into it.

### Running it

```bash
# Point at a memory root directory (direct filesystem mode)
node examples/living-archive-mcp.mjs \
  --memory-root /path/to/ResonantOS_User/Memory

# Point at an http-json memory service
node examples/living-archive-mcp.mjs \
  --memory-service-url http://127.0.0.1:4888

# Read-only mode (disable all writes)
node examples/living-archive-mcp.mjs \
  --memory-root /path/to/Memory \
  --readonly
```

**Environment variables (alternative to flags):**

| Variable | Equivalent flag |
|----------|----------------|
| `RESONANTOS_MEMORY_ROOT` | `--memory-root` |
| `RESONANTOS_MEMORY_SERVICE_URL` | `--memory-service-url` |
| `RESONANTOS_MCP_MAX_SEARCH_BYTES` | `--max-search-bytes` (default: 1 MB) |
| `RESONANTOS_MCP_READONLY` | `--readonly` (set to `"1"` to enable) |

### Modes

**Filesystem mode** (`--memory-root`): The bridge reads and writes directly to a Living Archive memory root on disk. It walks the directory tree, parses frontmatter, and serves files over MCP tools. All reads are path-sandboxed inside the memory root.

**Service mode** (`--memory-service-url`): The bridge forwards MCP tool calls to your http-json provider using the same `POST /memory/{operation}` protocol. This lets you expose any compliant provider through MCP.

### MCP tools exposed

The bridge registers MCP tools that map to the broker contract operations. External clients see tools like `memory_search`, `memory_read`, `memory_intake_write`, etc. — wrapping the same contract you implement.

---

## 9. Trust Boundary Rules

These rules come directly from ADR-011 and must be honoured by every memory provider. Violating them breaks the archive trust model.

### MUST NOT

- **Write directly to trusted wiki pages.** Trusted page creation and updates are reserved for the Strategist-owned ingest path after ADR-012 approval. Your provider must queue ingest requests and wait for review.
- **Bypass the review pipeline.** `intakeWrite` stores artifacts in the intake area only. `ingestRequest` queues requests for Strategist processing. `processIngestRequest` creates review artifacts. `promoteReviewArtifact` writes to trusted storage. Skip no step.
- **Promote an artifact whose `decision.status` is not `"approved"`.** Refuse promotion for pending, rejected, escalated, or otherwise unapproved artifacts and return an error.
- **Allow path traversal.** `read` calls must stay inside your provider's declared roots. Reject any path that resolves outside those roots.
- **Grant direct filesystem access to add-ons.** Your provider mediates all filesystem access. Add-ons call your broker methods — they never get a raw directory handle.

### MUST

- **Queue writes, never execute them immediately as trusted knowledge.** Intake writes land in a staging area. Only promotion (after a positive review decision) creates trusted pages.
- **Back up existing trusted pages before replacement.** If your provider supports page updates, keep the previous version.
- **Label raw-source search hits clearly.** `search` may return hits from intake or unprocessed source material, but those hits must be distinguishable from promoted wiki pages (use `stage` field, different `pageType`, or separate `sources` array).
- **Return a clear error when an operation is not supported.** Never silently no-op or fall back to a different data store. If your provider cannot satisfy an operation, throw with a human-readable message.
- **Degrade clearly when not yet active.** If the broker resolves you to `kind: "unsupported"` (missing grant, wrong protocol), every method throws `"${label} does not expose the ${operation} memory-provider operation yet."` The broker handles this automatically — you do not need to implement it.

---

## 10. Testing Guide

### Unit test: broker resolution

Use `resolveMemoryProviderBroker` from `src/core/memory-provider.ts` together with `buildDefaultState` from `src/core/defaults.ts`. The pattern from `src/core/memory-provider.test.ts`:

```typescript
import { resolveMemoryProviderBroker } from "./memory-provider";
import { buildDefaultState } from "./defaults";
import type { AddOnManifest, ResonantShellState } from "./contracts";

const yourManifest: AddOnManifest = {
  id: "addon.your-memory-provider",
  name: "Your Memory Provider",
  category: "memory",
  // ... full manifest fields
  service: {
    protocol: "http-json",
    entrypoint: "http://127.0.0.1:4888",
    healthCommand: "memory.status",
  },
  systemSlots: [{ id: "memory-system", role: "alternative-provider", replaceable: true }],
  requestedCapabilities: [
    { capability: "memory-provider", scope: "system", revocationBehavior: "hard-stop" },
  ],
};

const enableProvider = (state: ResonantShellState, manifest: AddOnManifest): ResonantShellState => ({
  ...state,
  installations: {
    ...state.installations,
    [manifest.id]: {
      ...state.installations[manifest.id],
      installed: true,
      enabled: true,
      status: "enabled",
      grantedCapabilities: state.installations[manifest.id].grantedCapabilities.map(
        (grant) => grant.capability === "memory-provider" ? { ...grant, granted: true } : grant,
      ),
    },
  },
});

it("resolves as http-json broker", () => {
  const state = enableProvider(buildDefaultState([yourManifest]), yourManifest);
  const broker = resolveMemoryProviderBroker(state, [yourManifest]);
  expect(broker.kind).toBe("http-json");
});
```

### Unit test: HTTP calls (mocked fetch)

```typescript
it("calls POST /memory/search with correct body", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ query: "test", pages: [], sources: [] }),
  } as Response);

  const broker = resolveMemoryProviderBroker(/* enabled state */, [yourManifest]);
  await broker.search("test", 5);

  expect(fetchMock).toHaveBeenCalledWith(
    "http://127.0.0.1:4888/memory/search",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ query: "test", limit: 5 }),
    }),
  );
});
```

### Integration test: live reference service

Spawn the reference service in-process, wait for the ready log line, then call the broker against it. See `src/core/memory-provider.reference.test.ts` for the complete pattern:

```typescript
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const port = 4899;

// In beforeEach or inside the test:
const service = spawn(process.execPath, [
  resolve(process.cwd(), "examples", "reference-memory-service.mjs"),
], {
  env: { ...process.env, REFERENCE_MEMORY_PORT: String(port) },
});

// Wait for startup log:
await new Promise((done) => {
  service.stdout.on("data", (chunk) => {
    if (String(chunk).includes("Reference Memory service listening")) done(undefined);
  });
});

// Then run your broker calls against it.
// Kill the service in afterEach.
```

### Integration test: your real service

Replace the reference service spawn with your own service startup command. The broker and contract shapes are identical — only the spawn target changes.

### Checklist: does my provider satisfy the contract?

```
[ ] POST /memory/status returns { "status": "ready" | "attention" | "missing", ... }
[ ] POST /memory/search returns { "query", "pages": [...], "sources": [...] }
[ ] POST /memory/read returns { "path", "title", "docType", "frontmatter", "content" }
[ ] POST /memory/intake-write returns { "actorId", "bucket", "artifactPath", "metadataPath" }
[ ] POST /memory/ingest-request returns { "requestFile", "queuedAt" }
[ ] POST /memory/review-queue returns an array (empty ok)
[ ] POST /memory/review-artifacts returns an array (empty ok)
[ ] POST /memory/process-ingest-request returns a review artifact with decision.status: "pending"
[ ] POST /memory/decide-review records the decision and returns it
[ ] POST /memory/promote-review-artifact refuses non-approved artifacts with an error
[ ] POST /memory/lint returns { "checkedAt", "reportPath", "pagesChecked", "findings": [...] }
[ ] Unknown operations return HTTP 404 with { "error": "..." }
[ ] HTTP errors return a body with { "error": "..." }
[ ] Manifest declares category: "memory", systemSlots[].id: "memory-system",
    requestedCapabilities[].capability: "memory-provider",
    service.protocol: "http-json"
```

---

## Appendix: Type Quick Reference

```typescript
// From src/core/memory-provider.ts
type MemoryProviderKind = "living-archive" | "http-json" | "unsupported";

// Key contracts from src/core/contracts.ts
interface ArchiveRuntimeStatus { status: "ready" | "attention" | "missing"; ... }
interface ArchiveSearchResult { query: string; pages: ArchiveSearchPageHit[]; sources: ArchiveSearchSourceHit[]; }
interface ArchiveSearchPageHit { pageId: string; title: string; pageType: string; filePath: string; score: number; snippet: string; ... }
interface ArchiveDocumentPayload { path: string; title: string; docType: string; frontmatter: Record<string, unknown>; content: string; }
interface ArchiveIntakeWriteResult { actorId: string; bucket: string; artifactPath: string; metadataPath: string | null; }
interface ArchiveIngestRequestResult { requestFile: string; queuedAt: string; }
interface ArchiveProcessIngestResult { requestFile: string; reviewArtifactFile: string; summary: string; checkedAt: string; reviewArtifact: ArchiveReviewArtifact; }
interface ArchiveMaintenanceCycleResult { startedAt: string; finishedAt: string; processed: ...[]; promoted: ...[]; navigation: ...; lint: ArchiveLintResult; skipped: string[]; errors: string[]; }
interface ArchiveBackgroundCycleResult { startedAt: string; finishedAt: string; scan: ArchiveSourceFolderScanResult; queuedRequestFiles: string[]; maintenance: ArchiveMaintenanceCycleResult; }
interface ArchiveLintResult { checkedAt: string; reportPath: string; pagesChecked: number; sourcesChecked: number; findings: ArchiveLintFinding[]; }
interface ArchiveSemanticLintResult { checkedAt: string; candidatesReviewed: number; findings: ...[]; summary: string; repairRequestFiles: string[]; }
interface ArchivePromoteReviewArtifactResult { artifactFile: string; promotedAt: string; actorId: string; pagesWritten: string[]; skippedPages: string[]; }
interface ArchiveReviewDecisionResult { artifactFile: string; status: string; action: string; actorId: string; decidedAt: string; }
```

All full type definitions are canonical in **`src/core/contracts.ts`**.

---

*Generated by Linus (Technical Writer) · TASK-P5 · ResonantOS vNext*
