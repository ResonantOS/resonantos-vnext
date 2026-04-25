# ADR-005: Provider Fabric & Routing

Status: Accepted  
Date: 2026-04-23

## Decision

ResonantOS owns provider and runtime routing through a system policy engine. Add-ons, agents, and archive services may declare requirements and preferences, but they do not choose the final provider, runtime node, or model directly.

The provider fabric includes:

- cloud API providers
- subscription-capable providers
- local runtime nodes
- user-owned remote runtime nodes such as GX10

Remote user-owned machines are modeled as **provider runtime nodes**, not as add-ons.

## Why

- The product goal is sovereignty over all user-available intelligence and compute, not attachment to one vendor or one auth path.
- Central routing lets the system coordinate cost, latency, trust, fallback, and availability consistently across Strategist, Setup, Living Archive, and add-ons.
- User-owned local and remote runtimes must be first-class citizens, not second-class exceptions.

## Rules

- Routing authority belongs to ResonantOS policy, not to add-ons.
- Add-ons declare:
  - provider capabilities needed
  - model or quality preferences
  - latency or locality preferences
  - fallback tolerance
- The policy engine resolves:
  - provider profile
  - runtime node
  - model
  - auth mode
  - fallback route
- Provider/auth/runtime states must be explicit:
  - `supported`
  - `experimental`
  - `unavailable`
- Reverse-engineered or undocumented auth paths may exist only in the `experimental` tier.
- Experimental paths must be:
  - visible in product state
  - isolated from supported flows
  - degradable without breaking the core shell
- Per-agent fallback policies are allowed, but the final routing decision still belongs to the central policy engine.

## Fallback and Recovery

- ResonantOS must support a **resurrect / panic fallback path**.
- A local model does not need to stay resident in memory at all times.
- The system must be able to:
  - detect that normal routes are unavailable
  - deploy a prepared local fallback runtime on demand
  - wire that runtime to Strategist and Setup
- The global baseline is:
  - at least one deployable local fallback route exists
  - agents may also define narrower fallback preferences

## Interfaces Constrained By This ADR

### Provider Profile

Represents the provider-facing identity and policy surface.

Must include:

- `id`
- `provider_type`
- `auth_source`
- `auth_tier`
- `consumer_scopes`
- `allowed_models`
- `primary_model`
- optional `fallback_model`
- status / availability state

### Runtime Node

Represents where inference actually executes.

Must include:

- `id`
- `kind`: `cloud`, `local`, `remote-user-owned`
- `provider_profile_id`
- `endpoint`
- `locality`
- `health_state`
- `supported_models`
- `experimental`
- `deployable_on_demand`

### Routing Policy Input

A caller may declare:

- required capabilities
- preferred models
- acceptable auth tiers
- preferred runtime locality
- latency/cost sensitivity
- fallback tolerance

### Routing Decision Output

The policy engine returns:

- chosen provider profile
- chosen runtime node
- chosen model
- chosen auth tier
- fallback route
- routing reason / policy note

### Fallback Policy

Must express:

- preferred fallback order
- whether experimental routes are permitted
- whether resurrection is allowed
- whether the route is hard-stop or degrade-on-failure

## Consequences

- Provider configuration becomes a core operating-system concern, not an add-on concern.
- Future provider UI, runtime health, and recovery UX must surface supported vs experimental distinctions clearly.
- Contracts in `src/core/` should evolve toward `provider profile + runtime node + routing decision` instead of a single flattened provider concept.
