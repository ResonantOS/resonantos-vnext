// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AddOnManifest, CapabilityGrant, LogicianExecutionArtifact } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { AddOnsWorkspace } from "./AddOnsWorkspace";

vi.mock("../../core/runtime", () => ({
  requestBrowserEngineStatus: vi.fn(async () => ({
    installed: false,
    version: null,
    executablePath: null,
    profileDir: null,
    sessionsDir: null,
    activeSessions: [],
    findings: [],
  })),
  requestBrowserInstallEngine: vi.fn(),
}));

const capability = (name: CapabilityGrant["capability"]): CapabilityGrant => ({
  capability: name,
  granted: false,
  scope: name === "archive-intake-write" ? "intake-only" : "shared",
  revocationBehavior: "hard-stop",
});

const createHermesManifest = (): AddOnManifest => ({
  id: "addon.hermes",
  name: "Hermes",
  version: "0.1.0",
  author: "test",
  category: "agent",
  description: "Hermes manifest",
  runtimeType: "local-service",
  surfaces: [],
  requestedCapabilities: [
    capability("network"),
    capability("shell"),
    capability("ui-embedding"),
    capability("providers"),
    capability("archive-read"),
    capability("archive-intake-write"),
  ],
  providerRequirements: {
    sharedProfiles: [],
    supportsPrivateCredentials: false,
  },
  archiveIntegration: {
    readScopes: [],
    intakeWriteScopes: [],
    canRequestIngest: false,
    canWriteKnowledgePages: false,
  },
  health: {
    strategy: "none",
  },
  installHooks: {},
  compatibility: {
    shellVersion: "^0.1.0",
    platforms: ["macOS"],
  },
});

describe("AddOnsWorkspace Hermes grants", () => {
  it("keeps the Hermes quick action scoped to workspace launch capabilities", () => {
    const hermesManifest = createHermesManifest();
    const state = buildDefaultState([hermesManifest]);
    const onGrantCapabilities = vi.fn();

    render(
      <AddOnsWorkspace
        search=""
        sideloadPath=""
        filteredManifests={[hermesManifest]}
        installations={state.installations}
        selectedManifest={null}
        selectedInstallation={null}
        onSearchChange={vi.fn()}
        onSideloadPathChange={vi.fn()}
        onSideload={vi.fn()}
        onSelectManifest={vi.fn()}
        onToggleAddonInstall={vi.fn()}
        onToggleGrant={vi.fn()}
        onGrantCapabilities={onGrantCapabilities}
        onGrantTerminalWorkspaceAccess={vi.fn()}
        onUpdateAddonConfig={vi.fn()}
        onRunLogicianScript={vi.fn()}
        onRunLogicianHook={vi.fn()}
        onAskAugmentor={vi.fn(async () => undefined)}
        onOpenArchiveReview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Install and grant Hermes workspace access" }));

    expect(onGrantCapabilities).toHaveBeenCalledWith(
      "addon.hermes",
      ["shell", "ui-embedding"],
      hermesManifest.requestedCapabilities,
    );
  });

  it("shows scaffold metadata for packaged workflow add-ons", () => {
    const hermesManifest: AddOnManifest = {
      ...createHermesManifest(),
      workflowBoundaries: [
        {
          id: "delegated-communication",
          label: "Delegated communication",
          jobToBeDone: "Route communication work to Hermes.",
          userValue: "The human can delegate routine messaging safely.",
          repeatability: "workflow-package",
          owner: "addon-agent",
          nonGoals: ["Do not send externally without approval."],
        },
      ],
      skills: [
        {
          id: "communication-skill",
          name: "Communication skill",
          description: "Prepare reviewable communication drafts.",
          documentPath: "docs/skills/hermes.md",
          invocation: "agent-suggested",
          requiredCapabilities: ["shell"],
          requiredTools: [],
        },
      ],
      connectors: [
        {
          id: "hermes-profile",
          name: "Hermes profile",
          type: "local-runtime",
          description: "Connects to local Hermes.",
          requiredCapabilities: ["shell"],
          configScope: "user-config",
        },
      ],
      scripts: [
        {
          id: "hermes-preflight",
          name: "Hermes preflight",
          description: "Checks Hermes before use.",
          commandRef: "hermes.audit",
          runPolicy: "preflight",
          deterministic: true,
          requiredCapabilities: ["shell"],
          producesArtifacts: ["diagnostic-report"],
          requiresHumanApproval: false,
        },
      ],
      hooks: [
        {
          id: "hermes-health",
          event: "health-check",
          handlerRef: "hermes-preflight",
          requiredCapabilities: ["shell"],
          failurePolicy: "degrade",
        },
      ],
    };
    const state = buildDefaultState([hermesManifest]);

    render(
      <AddOnsWorkspace
        search=""
        sideloadPath=""
        filteredManifests={[hermesManifest]}
        installations={state.installations}
        selectedManifest={hermesManifest}
        selectedInstallation={state.installations[hermesManifest.id]}
        onSearchChange={vi.fn()}
        onSideloadPathChange={vi.fn()}
        onSideload={vi.fn()}
        onSelectManifest={vi.fn()}
        onToggleAddonInstall={vi.fn()}
        onToggleGrant={vi.fn()}
        onGrantCapabilities={vi.fn()}
        onGrantTerminalWorkspaceAccess={vi.fn()}
        onUpdateAddonConfig={vi.fn()}
        onRunLogicianScript={vi.fn(async (): Promise<LogicianExecutionArtifact> => ({
          id: "test-artifact",
          addonId: hermesManifest.id,
          kind: "script" as const,
          targetId: "hermes-preflight",
          label: "Hermes preflight",
          commandRef: "hermes.audit",
          status: "passed" as const,
          summary: "ok",
          detail: "ok",
          requiredCapabilities: [],
          missingCapabilities: [],
          producedArtifacts: [],
          startedAt: new Date(0).toISOString(),
          completedAt: new Date(0).toISOString(),
          durationMs: 0,
          evidence: {},
        }))}
        onRunLogicianHook={vi.fn()}
        onAskAugmentor={vi.fn(async () => undefined)}
        onOpenArchiveReview={vi.fn()}
      />,
    );

    expect(screen.getByText("Packaged workflow")).toBeTruthy();
    expect(screen.getByText("Delegated communication")).toBeTruthy();
    expect(screen.getByText("Communication skill")).toBeTruthy();
    expect(screen.getByText("Hermes profile")).toBeTruthy();
    expect(screen.getByText("Hermes preflight")).toBeTruthy();
  });
});
