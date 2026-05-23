# ADR-037: Campaign Runner Pi Provider Broker

## Status

**Proposed.** This ADR records the decision to designate Pi as the preferred lightweight provider-broker adapter for Campaign Runner, without making it mandatory.

## Context

Campaign Runner currently supports two provider backends via direct CLI invocation: codex and claude. The execution smoke test (campaign-runner-execution-smoke-test) demonstrated real-world provider issues:

- **codex:** Binary found on PATH but vendored binary missing (`ENOENT`). ~500MB Node.js runtime + vendor binary dependency.
- **claude:** Binary functional but produced schema-invalid output. ~300MB Node.js runtime dependency.

Both CLI adapters share common drawbacks:

1. **Heavy runtime footprint.** Each CLI adapter requires a Node.js runtime (200-500MB RAM) plus provider-specific binaries.
2. **Startup latency.** 1-3 seconds for Node.js + binary load per invocation.
3. **Provider lock-in per invocation.** Running codex AND claude requires both binaries installed.
4. **Fragile binary dependencies.** The codex ENOENT failure shows how npm global installs can break silently.
5. **Platform-specific binaries.** Each provider distributes platform-specific executables.

Pi offers an alternative: a lightweight local broker that can route to multiple providers through a single, already-running process.

## Decision

**Pi is the preferred provider-broker adapter for Campaign Runner when available. The existing codex and claude CLI adapters remain supported as alternatives. No adapter is mandatory.**

### What Pi Provides as an Adapter

1. **Single process, many providers.** Pi can route to Anthropic, OpenAI, local models, and other backends through a single adapter interface.
2. **Minimal RAM footprint.** Pi runs as the existing agent harness — no additional Node.js runtime or vendor binary needed.
3. **Near-zero startup latency.** Already running when Campaign Runner invokes it.
4. **Provider transparency.** Pi returns a backend receipt specifying which provider actually executed the request.
5. **Route resolution.** Pi's internal route table can select providers based on task requirements, availability, and cost policy.
6. **Schema enforcement.** Pi can validate provider output against Campaign Runner's JSON schemas before returning to the core.

### Pi is Preferred, Not Mandatory

| Scenario | Adapter |
|----------|---------|
| Pi is running (normal agent session) | Pi adapter (preferred) |
| Pi is not available (standalone CLI use) | codex or claude CLI adapter |
| Operator has specific provider preference | Direct CLI adapter for that provider |
| Operator wants maximum provider flexibility | Pi adapter |
| Air-gap / offline environment | Pi adapter with local model route, or local-llm adapter |

### Relationship to Existing Adapters

Pi does NOT replace codex or claude adapters. They remain supported for:
- Standalone Campaign Runner usage (no agent harness running).
- Operators who prefer direct provider control.
- Environments where Pi is not installed.

### Distinction from OpenRouter

| Aspect | Pi | OpenRouter |
|--------|----|-----------|
| **Deployment** | Local agent harness | Hosted API gateway |
| **Network dependency** | Can route to local models offline | Requires internet |
| **Credential model** | Reads from local env/config | Single API key for all providers |
| **Latency** | Local (0ms overhead for local models) | Network round-trip to OpenRouter + provider |
| **Provider transparency** | `resolved_provider` + `resolved_model` in receipt | Provider visible via API response headers |
| **Cost** | Free (local compute) | Pay-per-token via OpenRouter |

Pi is not an OpenRouter client (though it could route TO OpenRouter as one of its providers). Pi is a local broker, not a hosted service.

## Consequences

### Positive

- **Reduced RAM footprint.** Campaign Runner tasks execute through the already-running Pi process instead of spawning a new Node.js runtime per invocation.
- **Provider plurality.** A single adapter gives access to multiple backends without installing multiple CLI binaries.
- **Resilience.** Pi can fall back to alternative providers if the primary is unavailable, without Campaign Runner core needing fallback logic.
- **Transparency.** Backend receipts make provider routing visible and auditable.
- **Offline capability.** Pi can route to local models (Ollama, llama.cpp) when cloud providers are unavailable.
- **Contributor accessibility.** Contributors don't need to install codex or claude CLIs to use Campaign Runner — Pi can proxy to whatever provider the contributor already has access to.

### Negative

- **Pi dependency for preferred path.** If Pi is unavailable, the operator must fall back to CLI adapters.
- **Provider routing complexity moves to Pi.** Pi's internal route table must be configured and maintained.
- **Abstraction overhead.** One more layer between Campaign Runner and the inference provider.
- **Pi internals are opaque to Campaign Runner.** The core sees `backend_provider: "pi"` but not Pi's internal routing decisions (by design — the backend receipt provides transparency).

## Evidence

- [x] Pi exists as a local coding agent harness (running this session).
- [x] Pi adapter contract documented: `docs/specs/campaign-runner/PI_ADAPTER_CONTRACT.md`.
- [x] Provider adapter contract documented: `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md`.
- [x] Campaign Runner execution smoke test demonstrated CLI adapter fragility (codex ENOENT, claude schema-invalid).
- [ ] Pi adapter implemented and tested with Campaign Runner (not yet — this ADR is the decision to proceed).
- [ ] Pi route table configured for Campaign Runner tasks (not yet).
- [ ] Backend receipt generation tested end-to-end (not yet).

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Make Pi the ONLY adapter. Remove codex/claude support. | Violates provider-agnostic principle. Operators should have choice. |
| Use OpenRouter as the preferred adapter instead of Pi. | OpenRouter is a hosted service (network dependency, cost). Pi is local and free. Pi can route TO OpenRouter if desired. |
| Keep only CLI adapters. No broker layer. | The execution smoke test demonstrated CLI fragility. A broker provides resilience, fallback, and lower footprint. |
| Build provider routing into Campaign Runner core. | Violates ADR-036 (core stays provider-agnostic). Routing belongs in adapters. |

## Drift Watch

What future change would make this ADR stale?

- If Pi adds a native Campaign Runner adapter mode, the integration may become even lighter-weight.
- If the ResonantOS provider fabric adds a Campaign Runner integration, Pi and the fabric may need to coexist or integrate.
- If a new broker emerges that is significantly better than Pi, this ADR can be superseded (Pi is preferred, not mandatory).
- If Campaign Runner core is rewritten in a different language, Pi adapter may need porting.

## Docs to Update If Accepted

- [x] `docs/specs/campaign-runner/PI_ADAPTER_CONTRACT.md` — Pi adapter contract.
- [x] `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md` — Generic adapter contract.
- [x] `docs/adr/ADR-036-campaign-runner-provider-adapter-contract.md` — Adapter contract ADR.
- [ ] `docs/specs/campaign-runner/README.md` — Reference new adapter contracts.
- [ ] `docs/agent-workflows/CAMPAIGN_RUNNER_USAGE.md` — Add Pi adapter usage notes.
