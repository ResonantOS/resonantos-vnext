// Intent citation: docs/architecture/ADR-018-addon-sdk-v0.md

import { describe, expect, it } from "vitest";
import type { AddOnManifest } from "../../core/contracts";
import { validateAddOnManifest } from "./validation";

const validManifest = (overrides: Partial<AddOnManifest> = {}): AddOnManifest => ({
  id: "addon.browser",
  name: "Resonant Browser",
  version: "0.1.0",
  author: "Resonant Alpha",
  category: "tool",
  description: "Controlled browser add-on.",
  runtimeType: "local-service",
  surfaces: [
    {
      id: "browser-workspace",
      type: "embedded-pane",
      label: "Browser",
      description: "User-visible controlled Chromium workspace.",
    },
  ],
  requestedCapabilities: [
    { capability: "network", granted: false, scope: "shared", revocationBehavior: "hard-stop" },
    { capability: "ui-embedding", granted: false, scope: "system", revocationBehavior: "hide-surface" },
    { capability: "browser-control", granted: false, scope: "system", revocationBehavior: "hard-stop" },
    { capability: "archive-intake-write", granted: false, scope: "intake-only", revocationBehavior: "degrade" },
  ],
  provenance: {
    tier: "curated-signed",
    verificationState: "verified",
    signed: true,
    signer: "ResonantOS test catalog",
  },
  runtimeIsolation: {
    boundary: "host-mediated-service",
    supportsDegradedMode: true,
    requiresReviewedGrant: true,
  },
  grantPresets: [
    {
      id: "browser-control-visible",
      label: "Visible browser control",
      description: "Allow controlled browsing with audit logs.",
      grants: [
        { capability: "network", granted: true, scope: "shared", revocationBehavior: "hard-stop" },
        { capability: "ui-embedding", granted: true, scope: "system", revocationBehavior: "hide-surface" },
        { capability: "browser-control", granted: true, scope: "system", revocationBehavior: "hard-stop" },
      ],
    },
  ],
  providerRequirements: {
    sharedProfiles: [],
    supportsPrivateCredentials: false,
  },
  archiveIntegration: {
    readScopes: [],
    intakeWriteScopes: ["LivingArchive/INTAKE/browser"],
    canRequestIngest: true,
    canWriteKnowledgePages: false,
  },
  health: {
    strategy: "browser-engine-ready",
  },
  service: {
    protocol: "stdio-json-rpc",
    entrypoint: "browser-engine",
    healthCommand: "health",
    shutdownCommand: "shutdown",
  },
  tools: [
    {
      name: "browser.open_url",
      description: "Open a URL in a controlled visible browser session.",
      requiredCapabilities: ["network", "browser-control"],
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      audit: {
        logRequest: true,
        logResult: true,
        artifactTypes: ["log", "citation-bundle"],
      },
    },
  ],
  installHooks: {
    onInstall: "install-browser-engine",
  },
  compatibility: {
    shellVersion: "^0.1.0",
    platforms: ["macOS", "windows", "linux"],
  },
  ...overrides,
});

describe("add-on SDK manifest validation", () => {
  it("accepts a Browser-style local-service manifest with audited tools", () => {
    const result = validateAddOnManifest(validManifest());

    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("rejects add-ons that claim Living Archive knowledge-page write authority", () => {
    const result = validateAddOnManifest(
      validManifest({
        archiveIntegration: {
          readScopes: [],
          intakeWriteScopes: [],
          canRequestIngest: true,
          canWriteKnowledgePages: true,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "addon-knowledge-write-forbidden")).toBe(true);
  });

  it("rejects archive scopes that are not backed by requested capabilities", () => {
    const result = validateAddOnManifest(
      validManifest({
        requestedCapabilities: [
          { capability: "network", granted: false, scope: "shared", revocationBehavior: "hard-stop" },
          { capability: "ui-embedding", granted: false, scope: "system", revocationBehavior: "hide-surface" },
          { capability: "browser-control", granted: false, scope: "system", revocationBehavior: "hard-stop" },
        ],
        archiveIntegration: {
          readScopes: ["living-archive/context"],
          intakeWriteScopes: ["LivingArchive/INTAKE/browser"],
          canRequestIngest: true,
          canWriteKnowledgePages: false,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "archive-read-scope-requires-capability")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "archive-intake-scope-requires-capability")).toBe(true);
  });

  it("rejects shared provider profiles that are not backed by the providers capability", () => {
    const result = validateAddOnManifest(
      validManifest({
        requestedCapabilities: [
          { capability: "network", granted: false, scope: "shared", revocationBehavior: "hard-stop" },
          { capability: "ui-embedding", granted: false, scope: "system", revocationBehavior: "hide-surface" },
          { capability: "browser-control", granted: false, scope: "system", revocationBehavior: "hard-stop" },
          { capability: "archive-intake-write", granted: false, scope: "intake-only", revocationBehavior: "degrade" },
        ],
        providerRequirements: {
          sharedProfiles: ["shared-openai"],
          supportsPrivateCredentials: false,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "provider-profile-requires-capability")).toBe(true);
  });

  it("rejects embedded surfaces that do not request UI embedding", () => {
    const result = validateAddOnManifest(
      validManifest({
        requestedCapabilities: [
          { capability: "network", granted: false, scope: "shared", revocationBehavior: "hard-stop" },
          { capability: "browser-control", granted: false, scope: "system", revocationBehavior: "hard-stop" },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "embedded-surface-requires-ui-embedding")).toBe(true);
  });

  it("warns when a shell UI module asks for embedding without exposing an embedded surface", () => {
    const result = validateAddOnManifest(
      validManifest({
        runtimeType: "ui-module",
        surfaces: [
          {
            id: "settings-panel",
            type: "panel",
            label: "Settings",
            description: "Shell-owned settings panel.",
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.code === "ui-module-ui-embedding-unnecessary")).toBe(true);
  });

  it("rejects preset grants and tool requirements that were not requested by the manifest", () => {
    const result = validateAddOnManifest(
      validManifest({
        grantPresets: [
          {
            id: "bad-preset",
            label: "Bad preset",
            description: "Tries to grant shell without request.",
            grants: [{ capability: "shell", granted: true, scope: "system", revocationBehavior: "hard-stop" }],
          },
        ],
        tools: [
          {
            name: "browser.shell_escape",
            description: "Invalid tool.",
            requiredCapabilities: ["shell"],
            inputSchema: {},
            outputSchema: {},
            audit: { logRequest: true, logResult: true, artifactTypes: ["log"] },
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "preset-grants-unrequested-capability")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "tool-uses-unrequested-capability")).toBe(true);
  });

  it("accepts Engineer setup runbooks only when they stay inside requested capabilities", () => {
    const baseManifest = validManifest();
    const valid = validateAddOnManifest(
      validManifest({
        requestedCapabilities: [
          ...baseManifest.requestedCapabilities,
          { capability: "shell", granted: false, scope: "system", revocationBehavior: "hard-stop" },
        ],
        engineerSetup: {
          documentPath: "addons/browser/ENGINEER_SETUP.md",
          objective: "Install and verify the Browser engine through host-reviewed commands.",
          requiredCapabilities: ["shell", "network"],
          allowedHostCommands: ["browser_engine_status", "browser_engine_install"],
          expectedInputs: ["target platform", "approved install root"],
          expectedOutputs: ["install log", "engine status"],
          requiresHumanApprovalBeforeExecution: true,
          auditLogRequired: true,
        },
      }),
    );

    expect(valid.valid).toBe(true);
    expect(valid.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);

    const invalid = validateAddOnManifest(
      validManifest({
        engineerSetup: {
          documentPath: "addons/browser/ENGINEER_SETUP.md",
          objective: "Invalid setup request.",
          requiredCapabilities: ["shell"],
          allowedHostCommands: ["arbitrary_shell"],
          expectedInputs: ["anything"],
          expectedOutputs: ["anything"],
          requiresHumanApprovalBeforeExecution: true,
          auditLogRequired: true,
        },
      }),
    );

    expect(invalid.valid).toBe(false);
    expect(invalid.issues.some((issue) => issue.code === "engineer-setup-unrequested-capability")).toBe(true);
  });

  it("accepts orchestration as a first-class add-on category", () => {
    const result = validateAddOnManifest(
      validManifest({
        id: "addon.paperclip",
        name: "Paperclip",
        category: "orchestration",
        description: "Organizational runtime add-on.",
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("warns but does not fail older local-service manifests that have not declared an executable service yet", () => {
    const { service: _service, ...manifest } = validManifest();
    const result = validateAddOnManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.code === "local-service-entrypoint-missing")).toBe(true);
  });
});
