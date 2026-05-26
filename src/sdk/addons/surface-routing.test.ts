// Intent citation: docs/architecture/ADR-018-addon-sdk-v0.md

import { describe, expect, it } from "vitest";
import type { AddOnInstallation, AddOnManifest, CapabilityGrant } from "../../core/contracts";
import { createDefaultInstallation } from "../../core/defaults";
import { createAddOnSurfaceDockRoutes } from "./surface-routing";

const grant = (capability: CapabilityGrant["capability"], granted = false): CapabilityGrant => ({
  capability,
  granted,
  scope: "shared",
  revocationBehavior: "hard-stop",
});

const manifest = (): AddOnManifest => ({
  id: "addon.audio2tol",
  name: "Audio2TOL",
  version: "0.1.0",
  author: "test",
  category: "tool",
  description: "test add-on",
  runtimeType: "local-service",
  surfaces: [
    {
      id: "audio2tol-page",
      type: "page",
      label: "Audio2TOL",
      description: "TOL intake workspace.",
      shellNavigation: {
        sectionId: "audio2tol",
        dockIcon: "audio2tol",
        eyebrow: "TOL",
        order: 70,
        requiredCapabilities: ["filesystem", "archive-read"],
      },
    },
  ],
  requestedCapabilities: [grant("filesystem"), grant("archive-read")],
  providerRequirements: { sharedProfiles: [], supportsPrivateCredentials: false },
  archiveIntegration: { readScopes: [], intakeWriteScopes: [], canRequestIngest: false, canWriteKnowledgePages: false },
  health: { strategy: "none" },
  installHooks: {},
  compatibility: { shellVersion: "^0.1.0", platforms: ["macOS"] },
});

const installed = (addon: AddOnManifest, grants: CapabilityGrant[]): AddOnInstallation => ({
  ...createDefaultInstallation(addon, "bundled"),
  installed: true,
  enabled: true,
  status: "enabled",
  grantedCapabilities: grants,
});

describe("add-on surface dock routing", () => {
  it("creates a dock route from an enabled manifest-declared shell surface", () => {
    const addon = manifest();

    const routes = createAddOnSurfaceDockRoutes([addon], {
      [addon.id]: installed(addon, [grant("filesystem", true), grant("archive-read", true)]),
    });

    expect(routes).toEqual([
      {
        addonId: "addon.audio2tol",
        surfaceId: "audio2tol-page",
        sectionId: "audio2tol",
        label: "Audio2TOL",
        eyebrow: "TOL",
        dockIcon: "audio2tol",
        order: 70,
      },
    ]);
  });

  it("hides manifest-declared dock routes until required grants are present", () => {
    const addon = manifest();

    const routes = createAddOnSurfaceDockRoutes([addon], {
      [addon.id]: installed(addon, [grant("filesystem", true), grant("archive-read", false)]),
    });

    expect(routes).toEqual([]);
  });
});
