// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md

import type {
  CapabilityGrant,
  AddOnManifest,
  LocalRuntimeStatus,
  RecoveryRouteCandidate,
  ResonantShellState,
} from "../../core/contracts";
import {
  applyProviderCredentialStatuses,
  hydrateState,
  loadBundledManifests,
  loadProviderCredentialStatuses,
  loadSideloadedManifests,
  persistState,
  requestLocalRuntimeStatus,
  requestRecoveryRouteCandidates,
} from "../../core/runtime";
import { recommendedGrantCapabilities, recommendedSystemSlotManifests } from "./system-slots";

export type BootedShellState = {
  bundled: AddOnManifest[];
  sideloaded: AddOnManifest[];
  state: ResonantShellState;
  selectedAddonId: string;
};

export const loadInitialShellState = async (): Promise<BootedShellState> => {
  const bundled = await loadBundledManifests();
  const sideloaded = await loadSideloadedManifests();
  const state = await hydrateState(bundled, sideloaded);
  const credentialStatuses = await loadProviderCredentialStatuses();
  const nextState = applyProviderCredentialStatuses(state, credentialStatuses);
  await persistState(nextState);
  if (!nextState.recoverySession.active) {
    nextState.uiPreferences.activeSection = "overview";
  }

  return {
    bundled,
    sideloaded,
    state: nextState,
    selectedAddonId: bundled[0]?.id ?? "",
  };
};

export const loadRecoveryRuntimeSnapshot = async (
  state: ResonantShellState,
): Promise<{
  status: LocalRuntimeStatus;
  candidates: RecoveryRouteCandidate[];
}> => {
  const localTargetModel =
    state.providers.find((profile) => profile.id === "shared-local")?.primaryModel ?? "batiai/gemma4-e2b:q4";

  const [status, candidates] = await Promise.all([
    requestLocalRuntimeStatus(localTargetModel),
    requestRecoveryRouteCandidates(),
  ]);

  return { status, candidates };
};

export const applyFirstRunRecommendedAddOns = (
  state: ResonantShellState,
  manifests: AddOnManifest[],
  selectedAddonIds: string[],
): ResonantShellState => {
  const selected = new Set(selectedAddonIds);
  const recommendedIds = new Set(recommendedSystemSlotManifests(manifests).map((manifest) => manifest.id));
  const nextState = structuredClone(state) as ResonantShellState;

  for (const manifest of manifests) {
    if (!recommendedIds.has(manifest.id) || !selected.has(manifest.id)) {
      continue;
    }
    const installation = nextState.installations[manifest.id];
    if (!installation) {
      continue;
    }
    const recommendedCapabilities = recommendedGrantCapabilities(manifest);
    installation.installed = true;
    installation.enabled = true;
    installation.status = "enabled";
    installation.grantedCapabilities = installation.grantedCapabilities.map((grant) =>
      recommendedCapabilities.includes(grant.capability as CapabilityGrant["capability"]) ? { ...grant, granted: true } : grant,
    );
    installation.notes = ["Enabled during first-run setup as a recommended replaceable default."];
  }

  nextState.uiPreferences.recommendedAddOnsReviewed = true;
  nextState.uiPreferences.chatSidebarOpen =
    selected.has("addon.augmentor-chat") || !recommendedIds.has("addon.augmentor-chat")
      ? nextState.uiPreferences.chatSidebarOpen
      : false;

  return nextState;
};

export const markFirstRunRecommendedAddOnsReviewed = (state: ResonantShellState): ResonantShellState => ({
  ...state,
  uiPreferences: {
    ...state.uiPreferences,
    recommendedAddOnsReviewed: true,
  },
});
