// Intent citation: docs/architecture/ADR-026-minimal-kernel-replaceable-default-addons.md

import type {
  AddOnInstallation,
  AddOnManifest,
  CapabilityGrant,
  ResonantShellState,
  SystemSlotId,
} from "../../core/contracts";

export type SystemSlotProvider = {
  manifest: AddOnManifest;
  installation: AddOnInstallation;
};

export const manifestsForSystemSlot = (manifests: AddOnManifest[], slotId: SystemSlotId): AddOnManifest[] =>
  manifests.filter((manifest) => manifest.systemSlots?.some((slot) => slot.id === slotId));

export const hasSystemSlotManifest = (manifests: AddOnManifest[], slotId: SystemSlotId): boolean =>
  manifestsForSystemSlot(manifests, slotId).length > 0;

export const recommendedSystemSlotManifests = (manifests: AddOnManifest[]): AddOnManifest[] =>
  manifests.filter((manifest) => manifest.systemSlots?.some((slot) => slot.recommended));

const capabilityForSlot = (slotId: SystemSlotId): CapabilityGrant["capability"] | null => {
  if (slotId === "chat-interface") {
    return "chat-interface";
  }
  if (slotId === "memory-system") {
    return "memory-provider";
  }
  return null;
};

export const activeSystemSlotProvider = (
  state: ResonantShellState,
  manifests: AddOnManifest[],
  slotId: SystemSlotId,
): SystemSlotProvider | null => {
  for (const manifest of manifestsForSystemSlot(manifests, slotId)) {
    const installation = state.installations[manifest.id];
    if (!installation?.enabled) {
      continue;
    }
    const requiredCapability = capabilityForSlot(slotId);
    if (requiredCapability && !installation.grantedCapabilities.some((grant) => grant.capability === requiredCapability && grant.granted)) {
      continue;
    }
    return { manifest, installation };
  }

  return null;
};

export const systemSlotAvailable = (
  state: ResonantShellState,
  manifests: AddOnManifest[],
  slotId: SystemSlotId,
): boolean => {
  // Legacy/test manifest sets predate ADR-026 and do not declare replacement slots.
  // In that case the old built-in surfaces remain available until migrated.
  if (!hasSystemSlotManifest(manifests, slotId)) {
    return true;
  }
  return Boolean(activeSystemSlotProvider(state, manifests, slotId));
};

export const recommendedGrantCapabilities = (manifest: AddOnManifest): CapabilityGrant["capability"][] => {
  const presetGrants = manifest.grantPresets?.flatMap((preset) => preset.grants.map((grant) => grant.capability)) ?? [];
  return Array.from(new Set(presetGrants.length ? presetGrants : manifest.requestedCapabilities.map((grant) => grant.capability)));
};
