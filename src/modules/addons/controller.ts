// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md

import type { Dispatch, SetStateAction } from "react";
import type { AddOnInstallation, AddOnManifest, CapabilityGrant, ResonantShellState } from "../../core/contracts";
import { applyProviderCredentialStatuses, hydrateState, loadProviderCredentialStatuses, sideloadManifest } from "../../core/runtime";

type SideloadControllerInput = {
  sideloadPath: string;
  bundled: AddOnManifest[];
  sideloaded: AddOnManifest[];
  setReadyState: (state: ResonantShellState, nextSideloaded: AddOnManifest[]) => void;
  setSelectedAddonId: Dispatch<SetStateAction<string>>;
  setSideloadPath: Dispatch<SetStateAction<string>>;
  setErrorState: (message: string) => void;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

export const executeSideloadManifest = async ({
  sideloadPath,
  bundled,
  sideloaded,
  setReadyState,
  setSelectedAddonId,
  setSideloadPath,
  setErrorState,
  errorMessageOf,
}: SideloadControllerInput): Promise<void> => {
  if (!sideloadPath.trim()) {
    return;
  }

  try {
    const manifest = await sideloadManifest(sideloadPath.trim());
    const nextSideloaded = [...sideloaded, manifest].filter(
      (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index,
    );
    const state = await hydrateState(bundled, nextSideloaded);
    const credentialStatuses = await loadProviderCredentialStatuses();
    const nextState = applyProviderCredentialStatuses(state, credentialStatuses);
    setReadyState(nextState, nextSideloaded);
    setSelectedAddonId(manifest.id);
    setSideloadPath("");
  } catch (error) {
    setErrorState(errorMessageOf(error, "Failed to sideload manifest."));
  }
};

export const toggleAddonInstallation = (
  manifest: AddOnManifest,
  updateRuntimeState: (updater: (current: ResonantShellState) => ResonantShellState) => void,
): void => {
  updateRuntimeState((draft) => {
    const installation = draft.installations[manifest.id];
    if (!installation) {
      return draft;
    }
    if (!installation.installed) {
      installation.installed = true;
      installation.enabled = true;
      installation.status = "enabled";
      installation.notes = [`Installed from the ${installation.source} catalog.`];
    } else if (installation.enabled) {
      installation.enabled = false;
      installation.status = "disabled";
      installation.notes = ["Disabled without uninstalling the add-on."];
    } else {
      installation.enabled = true;
      installation.status = "enabled";
      installation.notes = ["Re-enabled after prior disable."];
    }
    return draft;
  });
};

export const toggleAddonCapabilityGrant = (
  manifestId: string,
  capability: CapabilityGrant["capability"],
  updateRuntimeState: (updater: (current: ResonantShellState) => ResonantShellState) => void,
): void => {
  updateRuntimeState((draft) => {
    const installation = draft.installations[manifestId] as AddOnInstallation | undefined;
    if (!installation) {
      return draft;
    }
    const target = installation?.grantedCapabilities.find((grant) => grant.capability === capability);
    if (target) {
      target.granted = !target.granted;
      installation.status = installation.enabled ? "enabled" : installation.installed ? "installed" : "available";
    }
    return draft;
  });
};
