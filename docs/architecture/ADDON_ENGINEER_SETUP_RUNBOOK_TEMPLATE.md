# Add-on Engineer Setup Runbook Template

Status: SDK template  
Owner: ResonantOS add-on platform

## Purpose

Each add-on that needs installation, local service wiring, provider configuration, external account setup, or repair should ship an Engineer setup runbook.

The runbook is written for the Resonant Engineer Agent, not for the human as a step-by-step manual. The human should approve sensitive actions and understand what is happening, but the Engineer should do the setup work through ResonantOS host-mediated commands.

## Manifest Link

The add-on manifest should include:

```json
{
  "engineerSetup": {
    "documentPath": "addons/<addon-id>/ENGINEER_SETUP.md",
    "objective": "Install, configure, verify, and repair this add-on through reviewed host commands.",
    "requiredCapabilities": ["shell", "network", "filesystem"],
    "allowedHostCommands": ["<addon>_status", "<addon>_install", "<addon>_configure", "<addon>_verify"],
    "expectedInputs": ["approved install root", "provider profile references", "service port"],
    "expectedOutputs": ["setup report", "health check result", "audit log"],
    "requiresHumanApprovalBeforeExecution": true,
    "auditLogRequired": true
  }
}
```

## Required Sections

### 1. Setup Objective

State the exact outcome the Engineer must reach.

Example: "Connect to an existing local service if available; otherwise install and launch the add-on inside its approved ResonantOS add-on root."

### 2. Human-Facing Summary

Explain what the add-on does, why setup is needed, and what the Engineer will ask permission to change.

### 3. Required Inputs

List only references the Engineer may use:

- provider profile ids, never raw secrets
- approved install/config/data roots
- selected runtime mode
- local service port or endpoint
- user-approved external account names

### 4. Capability Boundary

List every required capability and the reason it is needed.

The runbook must not instruct the Engineer to use a capability that the manifest did not request.

### 5. Allowed Host Commands

List exact reviewed host commands. Do not use arbitrary shell examples as the primary setup path.

Allowed:

- `<addon>_status`
- `<addon>_install`
- `<addon>_configure`
- `<addon>_start_service`
- `<addon>_stop_service`
- `<addon>_verify`
- `<addon>_collect_logs`

Not allowed:

- unrestricted `npm run`
- unrestricted `python`
- unrestricted `node`
- unrestricted `cargo run`
- free-form shell repair

### 6. Setup Procedure

Use this sequence:

1. Diagnose existing installation and environment.
2. Check provider/profile references through ResonantOS, not raw secret reads.
3. Present the planned changes to the human for approval when filesystem, shell, network, provider, or external account changes are required.
4. Execute only approved host commands.
5. Verify service health and add-on surface availability.
6. Write a setup report and audit log.

### 7. Repair Procedure

The Engineer should repair in this order:

1. Confirm the add-on is installed and enabled.
2. Check service health.
3. Check endpoint/port conflicts.
4. Check configuration drift.
5. Check provider/profile availability.
6. Check recent add-on logs.
7. Propose a minimal repair plan.
8. Execute only approved host commands.
9. Verify and report.

### 8. Expected Outputs

The setup must produce:

- human-readable setup report
- machine-readable health result
- audit log entry for every privileged action
- degraded-state reason if setup cannot complete

## Safety Rules

- The Engineer may automate setup, but it must not bypass ResonantOS capability grants.
- Raw provider credentials must stay inside the provider vault.
- Add-ons receive provider/profile references or mediated routes, not unmanaged secrets by default.
- The runbook is not an authorization grant. It is only an instruction file constrained by the manifest and host policy.
- Any action outside the allowed host command list must stop and request a new reviewed command or user decision.
