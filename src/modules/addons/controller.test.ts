import { describe, expect, it } from "vitest";
import type { AddOnManifest, CapabilityGrant } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { grantAddonCapabilities } from "./controller";

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

describe("grantAddonCapabilities", () => {
  it("only grants the requested Hermes workspace capabilities", () => {
    const hermesManifest = createHermesManifest();
    let state = buildDefaultState([hermesManifest]);

    grantAddonCapabilities("addon.hermes", ["shell", "ui-embedding"], hermesManifest.requestedCapabilities, (updater) => {
      state = updater(state);
    });

    const granted = new Set(
      state.installations["addon.hermes"].grantedCapabilities
        .filter((grant) => grant.granted)
        .map((grant) => grant.capability),
    );

    expect(granted).toEqual(new Set(["shell", "ui-embedding"]));
    expect(state.channels.find((channel) => channel.id === "desktop-hermes")?.enabled).toBe(true);
  });
});
