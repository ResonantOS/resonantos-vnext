// Intent citation: docs/architecture/ADR-026-minimal-kernel-replaceable-default-addons.md

import { describe, expect, it } from "vitest";
import type { AddOnManifest, CapabilityGrant, SystemSlotId } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { applyFirstRunRecommendedAddOns } from "./controller";
import { activeSystemSlotProvider, systemSlotAvailable } from "./system-slots";

const grant = (capability: CapabilityGrant["capability"]): CapabilityGrant => ({
  capability,
  granted: false,
  scope: "system",
  revocationBehavior: "hard-stop",
});

const manifestForSlot = (
  id: string,
  slotId: SystemSlotId,
  capability: CapabilityGrant["capability"],
): AddOnManifest => ({
  id,
  name: id === "addon.augmentor-chat" ? "Augmentor Chat" : "Living Archive",
  version: "0.1.0",
  author: "Resonant Alpha",
  category: slotId === "memory-system" ? "memory" : "agent",
  description: "Recommended replaceable default.",
  runtimeType: slotId === "memory-system" ? "local-service" : "ui-module",
  surfaces: [],
  requestedCapabilities: [grant(capability)],
  grantPresets: [
    {
      id: `${slotId}-recommended`,
      label: "Recommended",
      description: "Recommended first-run grants.",
      grants: [{ ...grant(capability), granted: true }],
    },
  ],
  providerRequirements: { sharedProfiles: [], supportsPrivateCredentials: false },
  systemSlots: [{ id: slotId, role: "default-provider", replaceable: true, recommended: true }],
  archiveIntegration: { readScopes: [], intakeWriteScopes: [], canRequestIngest: false, canWriteKnowledgePages: false },
  health: { strategy: "none" },
  installHooks: {},
  compatibility: { shellVersion: "^0.1.0", platforms: ["macOS", "linux", "windows"] },
});

describe("system slot replacement runtime", () => {
  it("keeps legacy no-slot fixtures available until they migrate to ADR-026 manifests", () => {
    const state = buildDefaultState([]);

    expect(systemSlotAvailable(state, [], "chat-interface")).toBe(true);
    expect(systemSlotAvailable(state, [], "memory-system")).toBe(true);
  });

  it("requires an enabled add-on and granted slot capability when a replacement slot exists", () => {
    const chatManifest = manifestForSlot("addon.augmentor-chat", "chat-interface", "chat-interface");
    const state = buildDefaultState([chatManifest]);

    expect(systemSlotAvailable(state, [chatManifest], "chat-interface")).toBe(false);

    const enabled = applyFirstRunRecommendedAddOns(state, [chatManifest], [chatManifest.id]);

    expect(systemSlotAvailable(enabled, [chatManifest], "chat-interface")).toBe(true);
    expect(activeSystemSlotProvider(enabled, [chatManifest], "chat-interface")?.manifest.id).toBe(chatManifest.id);
  });

  it("can enable recommended chat and memory defaults independently during first-run setup", () => {
    const chatManifest = manifestForSlot("addon.augmentor-chat", "chat-interface", "chat-interface");
    const memoryManifest = manifestForSlot("addon.living-archive", "memory-system", "memory-provider");
    const state = buildDefaultState([chatManifest, memoryManifest]);

    const next = applyFirstRunRecommendedAddOns(state, [chatManifest, memoryManifest], [memoryManifest.id]);

    expect(next.uiPreferences.recommendedAddOnsReviewed).toBe(true);
    expect(systemSlotAvailable(next, [chatManifest, memoryManifest], "chat-interface")).toBe(false);
    expect(systemSlotAvailable(next, [chatManifest, memoryManifest], "memory-system")).toBe(true);
  });
});
