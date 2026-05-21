# Specs

## Purpose

Specs define the formal contracts for subsystems, interfaces, and behaviors. A spec is a precise, implementable description that an engineer or agent can use to build against without ambiguity. Specs are not aspirational documents — they describe what must be true for a given interface or subsystem to be considered conformant.

Specs complement ADRs. An ADR explains *why* a decision was made; a spec defines *what* the resulting contract is.

## When to Write a Spec

Write a spec when:

- A subsystem has a public API or contract surface (SDK, IPC, manifest format, protocol).
- Multiple implementations must agree on behavior.
- A capability boundary needs precise documentation for security review.
- An add-on developer needs to know exactly what guarantees the shell provides.

Do not write a spec for internal-only implementation details that are not contractual.

## Proposed Future Specs

The following specs are proposed but not yet written. Each is listed with its intended scope.

### Add-on Manifest Spec

**Scope:** The JSON schema for add-on manifests in `public/addons/`. Defines required and optional fields, capability declaration format, versioning rules, entry point conventions, and icon/metadata requirements.

### Capability Grants Spec

**Scope:** The capability model — what capabilities exist, how they are declared, how they are granted, how they are enforced at runtime, and what happens when a grant is denied. Covers both the manifest declaration layer and the runtime policy enforcement layer.

### Provider Model Spec

**Scope:** The provider fabric contract — how providers are registered, how models are selected, how credentials are managed, how fallback routing works, and what the Rust host ↔ frontend division of responsibility is.

### Channel / Workspace Model Spec

**Scope:** How add-ons are embedded in the shell workspace — channel lifecycles, workspace activation/deactivation, resize and layout contracts, and the isolation guarantees between concurrent add-on workspaces.

### Living Archive Bridge Spec

**Scope:** The MCP bridge and local memory service contracts — how external clients connect, what scoping rules apply, what query capabilities exist, what write paths are available, and how memory domains are enforced at the bridge boundary.

---

*Specs are not yet written. This file serves as a registry of intended specs. When a spec is created, add it to this directory and update this index.*
