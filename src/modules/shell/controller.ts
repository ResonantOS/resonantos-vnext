// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md

import type {
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
  requestLocalRuntimeStatus,
  requestRecoveryRouteCandidates,
} from "../../core/runtime";

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
