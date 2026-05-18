// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddOnInstallation, CapabilityGrant } from "../../core/contracts";
import { HermesAddonPanel } from "./HermesAddonPanel";

const requestHermesStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../../core/runtime", () => ({
  requestHermesStatus: requestHermesStatusMock,
  requestHermesInstall: vi.fn(),
}));

const capability = (name: CapabilityGrant["capability"], granted = false): CapabilityGrant => ({
  capability: name,
  granted,
  scope: name === "archive-intake-write" ? "intake-only" : "shared",
  revocationBehavior: "hard-stop",
});

const installation = (shellGranted = false): AddOnInstallation => ({
  addonId: "addon.hermes",
  installed: true,
  enabled: true,
  source: "bundled",
  provenanceTier: "bundled-core",
  verificationState: "verified",
  status: "enabled",
  grantedCapabilities: [
    capability("network"),
    capability("shell", shellGranted),
    capability("ui-embedding"),
    capability("providers"),
    capability("archive-read"),
    capability("archive-intake-write"),
  ],
  recommendedGrantPresetIds: [],
  privateProviderProfileIds: [],
  config: { profileHome: "/tmp/untrusted-hermes-profile" },
  notes: [],
});

describe("HermesAddonPanel", () => {
  beforeEach(() => {
    requestHermesStatusMock.mockReset();
  });

  it("does not audit a profile before shell access is granted", () => {
    render(
      <HermesAddonPanel
        installation={installation(false)}
        requestedCapabilities={installation(false).grantedCapabilities}
        onGrantCapabilities={vi.fn()}
        onConfigChange={vi.fn()}
      />,
    );

    const auditButton = screen.getByRole("button", { name: "Grant shell to audit" });
    expect(auditButton).toHaveProperty("disabled", true);
    fireEvent.click(auditButton);

    expect(requestHermesStatusMock).not.toHaveBeenCalled();
  });

  it("requests an executable audit only after shell access is granted", async () => {
    requestHermesStatusMock.mockResolvedValueOnce({
      detected: true,
      home: "/tmp/untrusted-hermes-profile",
      command: "/tmp/untrusted-hermes-profile/hermes-agent/venv/bin/hermes",
      version: "Hermes Agent test",
      agentGitDirty: false,
      gateway: {
        present: false,
        running: false,
        channels: [],
        detail: "No Hermes gateway state file was found.",
      },
      inventory: {
        skillsCount: 0,
        memoriesCount: 0,
        sessionsCount: 0,
        kbPresent: false,
        kbIndexPresent: false,
        stateDbPresent: false,
        stateDbOk: false,
        identityPresent: true,
        envPresent: false,
        configPresent: true,
        channelDirectoryPresent: false,
      },
      findings: [],
      compatibility: "ready",
      availableModels: [],
      checkedAt: "unix:1",
    });

    render(
      <HermesAddonPanel
        installation={installation(true)}
        requestedCapabilities={installation(true).grantedCapabilities}
        onGrantCapabilities={vi.fn()}
        onConfigChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(requestHermesStatusMock).toHaveBeenCalledWith({
        profileHome: "/tmp/untrusted-hermes-profile",
        executable: true,
      });
    });
  });
});
