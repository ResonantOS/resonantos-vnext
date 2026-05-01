# ADR-018: Add-on SDK V0

Status: Accepted  
Date: 2026-04-27

## Decision

ResonantOS will maintain a first-party **Add-on SDK V0** before adding heavyweight add-ons such as the Chromium Browser engine.

The SDK is not a public marketplace SDK yet. It is the binding internal standard that all bundled, curated, and sideloaded add-ons must follow.

The SDK lives under `src/sdk/addons` and defines:

- manifest validation
- stable capability names
- runtime and service categories
- UI surface contracts
- host-mediated tool contracts
- safety rules that prevent add-ons from bypassing core authority

## Why

The Browser, Obsidian, OpenClaw, Hermes, Audio2TOL, and future community add-ons must not become one-off integrations.

Without an SDK, every add-on would invent its own install shape, permission shape, tool shape, and service boundary. That would make ResonantOS harder to secure, harder to test, and harder to extend.

The Browser add-on especially requires a real SDK boundary because AI-controlled Chromium introduces network access, UI embedding, browser automation, screenshots, downloads, and future authenticated web sessions.

## Rules

- Every add-on must have a manifest.
- Manifest loading must pass through SDK validation before the add-on is trusted by the shell.
- Add-ons request capabilities explicitly.
- Preset grant bundles may only grant capabilities already requested by the manifest.
- Add-on tools may only require capabilities already requested by the manifest.
- Add-ons may write only to permitted intake boundaries, never directly to trusted Living Archive knowledge pages.
- Archive read scopes require the `archive-read` capability.
- Archive intake write scopes require the `archive-intake-write` capability.
- Shared provider profiles require the `providers` capability.
- Embedded add-ons and `embedded-pane` surfaces require the `ui-embedding` capability.
- Shell `ui-module` panel add-ons should not request `ui-embedding` unless they expose an embedded pane.
- Local-service add-ons should declare a service entrypoint before host execution.
- Sideloaded add-ons are treated as unverified unless host verification explicitly proves otherwise.
- Runtime-specific implementation must sit behind host-mediated service or UI contracts, not direct privileged access.

## SDK V0 Contracts

### Manifest

Required fields:

- `id`
- `name`
- `version`
- `author`
- `category`
- `description`
- `runtimeType`
- `surfaces`
- `requestedCapabilities`
- `providerRequirements`
- `archiveIntegration`
- `health`
- `installHooks`
- `compatibility`

Optional V0 fields:

- `sdkVersion`
- `provenance`
- `runtimeIsolation`
- `grantPresets`
- `service`
- `tools`
- `delegation`
- `agents`
- `engineerSetup`

### Runtime Types

Supported runtime categories:

- `ui-module`
- `embedded-module`
- `local-service`
- `agent-addon`
- `channel-addon`

### Categories

Supported V0 categories:

- `agent`
- `channel`
- `memory`
- `security`
- `knowledge`
- `tool`
- `integration`
- `orchestration`

### Capabilities

Supported V0 capabilities:

- `filesystem`
- `archive-read`
- `archive-intake-write`
- `providers`
- `shell`
- `network`
- `ui-embedding`
- `browser-control`
- `agent-delegation`
- `notifications`
- `device-integration`

### Engineer Setup Runbook Contract

Add-ons that need installation, local service wiring, external account setup, provider/profile wiring, or repair should declare an `engineerSetup` contract in the manifest.

The setup runbook is an instruction file for the Resonant Engineer Agent. It lets the Engineer set up the add-on for the human through ResonantOS-mediated commands, while keeping authorization inside the manifest, capability grants, and host policy.

The manifest field must declare:

- `documentPath`
- `objective`
- `requiredCapabilities`
- `allowedHostCommands`
- `expectedInputs`
- `expectedOutputs`
- `requiresHumanApprovalBeforeExecution`
- `auditLogRequired`

Rules:

- `requiredCapabilities` may only reference capabilities already requested by the manifest.
- `allowedHostCommands` must list reviewed host commands, not arbitrary shell commands.
- Raw provider credentials must stay inside the ResonantOS provider vault.
- The Engineer may use provider profile references and mediated provider routes, not unmanaged secrets by default.
- The runbook is not an authorization grant; it is constrained by the same capability system as the add-on.
- Privileged setup actions require audit logging.
- Human approval is required before install, filesystem mutation, service launch, provider/profile wiring, or external account mutation unless a future signed enterprise policy explicitly grants otherwise.

Template: `docs/architecture/ADDON_ENGINEER_SETUP_RUNBOOK_TEMPLATE.md`

### Service Contract

Local service add-ons may declare:

- `protocol`
- `entrypoint`
- `healthCommand`
- `shutdownCommand`

Supported V0 protocols:

- `stdio-json-rpc`
- `http-json`
- `websocket-json`
- `host-command`

### Tool Contract

Add-on tools expose host-mediated actions to Augmentor, Engineer, or delegated agents.

Each tool must declare:

- `name`
- `description`
- `requiredCapabilities`
- `inputSchema`
- `outputSchema`
- `audit`
- optional `requiresHumanApproval`

The host must verify capability grants before executing any tool.

## Consequences

- Browser development should proceed against the SDK, not as a bespoke component.
- The Browser add-on can move from embedded iframe prototype to Chromium engine without changing the shell-level add-on contract.
- Existing manifests can continue to load, but SDK validation will prevent unsafe patterns from becoming executable.
- The SDK creates a stable target for future public documentation and third-party add-on creation.
- Add-on setup becomes an Engineer-assisted flow instead of a human-only manual checklist, without giving add-ons direct privileged access.

## Experimental Tier

SDK V0 permits experimental service implementations, but the manifest contract is not experimental.

Experimental add-ons must still:

- validate successfully
- request capabilities explicitly
- run behind host mediation
- preserve auditability
- respect Living Archive write boundaries

## Implementation References

- SDK entrypoint: `src/sdk/addons/index.ts`
- Manifest validation: `src/sdk/addons/validation.ts`
- Shared core types: `src/core/contracts.ts`
- Runtime manifest loading: `src/core/runtime.ts`
