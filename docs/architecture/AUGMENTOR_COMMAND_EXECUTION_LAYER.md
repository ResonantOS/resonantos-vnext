# Augmentor Command Execution Layer

Intent citation: `SUPER_AI_APP_IMPLEMENTATION_PLAN.md`, `ADR-005-provider-fabric-routing.md`, `ADR-015-delegation-fabric-addon-catalog-native-tools.md`, `ADR-017-resonant-browser-addon.md`.

## Purpose

Augmentor Chat supports a small command layer for turning conversation into durable, inspectable work. Commands are not a bypass around ResonantOS policy. They are parsed by the chat module, routed through typed contracts, and executed only through the relevant host-mediated boundary.

## Supported Commands

### `/goal`

Creates a durable Goal Workspace.

Example:

```text
/goal Build browser bridge | success: typed commands, host boundary, tests | constraints: no Camofox default | budget: subscription
```

Effects:

- Adds a `GoalWorkspace` to shell state.
- Creates normalized success criteria, constraints, memory references, cost policy, and a first planned step.
- Does not call an LLM provider.

### `/delegate`

Creates a task workspace for an approved target.

Example:

```text
/delegate opencode Implement the browser bridge tests
```

Supported targets:

- `engineer`: core Resonant Engineer Agent.
- `hermes`: `addon.hermes`, only when installed and enabled.
- `opencode`: `addon.opencode`, only when installed and enabled.

Effects:

- Creates a `DelegationPacket`.
- Calls the host task-workspace creation boundary.
- Attaches a dispatched delegation reference to the latest active goal in the same thread when one exists.
- Does not make add-on agents trusted core agents.

### `/browser`

Runs governed Browser Tool Bridge actions.

Examples:

```text
/browser open example.com
/browser inspect https://example.com
/browser research https://example.com
/browser capture https://example.com
```

V1 behavior:

- `open`: runs `browser.open_url`.
- `inspect`: runs `browser.open_url`, then `browser.read_page`.
- `research`: runs `browser.open_url`, then `browser.read_page`.
- `capture`: optionally opens a URL, then runs `browser.capture_evidence`.

Rules:

- `open`, `inspect`, and `research` require an HTTP(S) URL or domain name.
- Browser execution uses the governed `browser_host_command` path.
- Sensitive typing, extension loading, wallet actions, public submissions, and arbitrary shell/browser control remain blocked unless a future explicit approval flow is implemented.
- Camofox/stealth browser work is not the default Browser Tool Bridge.

### `/status`

Reports current shell work state.

Includes:

- Goal workspace status.
- Pending delegated workspace state.
- Controlled browser session state.

## Execution Boundaries

- Commands are available only for the Strategist/Augmentor thread.
- Provider execution still resolves through Provider Fabric and must have an approved execution adapter.
- Add-on delegation requires the target add-on to be installed and enabled.
- Browser control requires the Browser add-on grants enforced at the Tauri/Rust host command boundary.
- Command parsing does not expose arbitrary shell, filesystem, provider-secret, wallet, or archive write capabilities.

## UI Surface

The Delegation workspace now acts as the Task Monitor surface. It shows:

- active durable goals
- needs-attention count
- delegated references
- artifacts
- task workspaces
- selected task details and execution controls

The monitor is deliberately separate from chat history so long-running work remains visible and reviewable.

## Verification

Important deterministic checks:

```bash
npm test -- --run src/modules/chat/augmentor-commands.test.ts src/modules/chat/controller.test.ts src/core/provider-service.test.ts src/modules/delegation/DelegationWorkspace.test.tsx
npm test -- --run
npm run build
```

If Rust host-command behavior changes, also run:

```bash
cargo fmt --check
cargo test
```
