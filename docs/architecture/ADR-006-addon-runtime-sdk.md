# ADR-006: Add-on Runtime & SDK

Status: Accepted  
Date: 2026-04-23

## Decision

ResonantOS uses a signed, capability-gated add-on system with provenance tiers and explicit runtime categories.

Curated add-ons are signed and distributed through a curated registry. They are semi-trusted: they may ship with recommended capability bundles, but the user can inspect and revoke those grants.

Sideloaded add-ons are never implicitly trusted.

## Why

- ResonantOS must be modular and extensible, but trust cannot be inferred from install success alone.
- The add-on system needs to support first-party, curated community, and local/sideloaded growth without collapsing the security model.
- Provenance and runtime permissions are separate concerns and both must be visible.

## Rules

- Every add-on must have a manifest.
- Every add-on declares:
  - runtime type
  - surfaces
  - requested capabilities
  - provider requirements
  - archive integration requirements
  - health strategy
  - compatibility constraints
- Add-ons are separated into runtime categories:
  - `ui-module`
  - `embedded-module`
  - `local-service`
  - `agent-addon`
  - `channel-addon`
- Add-ons do not get provider, archive, filesystem, device, or wallet access without an explicit capability grant.
- Curated add-ons may ship with preset recommended grants.
- Recommended grants are defaults, not permanent entitlements.
- Sideloaded add-ons start from minimal trust and must not inherit curated defaults.

## Provenance Tiers

The runtime must distinguish at least:

- `bundled-core`
- `curated-signed`
- `sideloaded-unverified`
- optional future `enterprise-signed`

Provenance affects:

- default grant recommendations
- installation warnings
- upgrade trust
- support posture

Provenance does not override the capability system.

## Capability Grant Lifecycle

Capability grants must support:

- request
- approve
- revoke
- degrade
- re-request after update

Each grant must carry:

- capability
- scope
- revocation behavior
- source of grant recommendation

## Runtime Isolation

- UI add-ons run in shell-owned UI surfaces with no privileged access by default.
- Local service and agent add-ons run behind explicit host mediation.
- Channel add-ons must not redefine core agent identity or memory authority.
- Provider access, archive access, device integration, and wallet actions all flow through host-controlled gates.

## Installation States

Add-ons must have explicit lifecycle states:

- `available`
- `installed`
- `enabled`
- `disabled`
- `degraded`
- `update-available`
- `incompatible`

## Interfaces Constrained By This ADR

### Signed Manifest Model

Must represent:

- add-on metadata
- provenance tier
- signature or verification state
- runtime category
- capability requests
- provider/archive requirements
- compatibility rules

### Preset Grant Bundle

Curated add-ons may ship a preset bundle that lists:

- recommended grants
- intended scopes
- rationale

### Runtime Isolation Contract

Must define:

- what host APIs the add-on may call
- what IPC surface is exposed
- what happens on grant revocation
- what degraded mode looks like

## Consequences

- The SDK must document both manifest shape and grant semantics.
- A signing and registry model becomes part of the product, not just build tooling.
- Contracts in `src/core/` should evolve to express provenance tier and verification state directly.
