// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md

import type { Dispatch, SetStateAction } from "react";
import type { AddOnManifest, ProviderDiagnosticReport, ResonantShellState } from "../../core/contracts";
import { applyProviderDiagnostics } from "../../core/policies";
import { requestProviderDiagnostics, saveProviderSecret } from "../../core/runtime";

type ReadyShellSnapshot = {
  state: ResonantShellState;
  bundled: AddOnManifest[];
  sideloaded: AddOnManifest[];
};

type RefreshProviderDiagnosticsInput = {
  snapshot: ReadyShellSnapshot;
  providerId?: string;
  commitReadyState: (state: ResonantShellState) => void;
  updateRuntimeState: (updater: (current: ResonantShellState) => ResonantShellState) => void;
  setProviderDiagnosticsBusy: Dispatch<SetStateAction<boolean>>;
  setActiveProviderProbeId: Dispatch<SetStateAction<string | null>>;
  setProviderDiagnostics: Dispatch<SetStateAction<ProviderDiagnosticReport[]>>;
  setSettingsNotice: Dispatch<SetStateAction<string | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type SaveProviderSecretInput = {
  snapshot: ReadyShellSnapshot;
  profileId: string;
  secret: string;
  commitReadyState: (state: ResonantShellState) => void;
  updateRuntimeState: (updater: (current: ResonantShellState) => ResonantShellState) => void;
  setProviderDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setSettingsNotice: Dispatch<SetStateAction<string | null>>;
  setProviderDiagnosticsBusy: Dispatch<SetStateAction<boolean>>;
  setActiveProviderProbeId: Dispatch<SetStateAction<string | null>>;
  setProviderDiagnostics: Dispatch<SetStateAction<ProviderDiagnosticReport[]>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

export const executeRefreshProviderDiagnostics = async ({
  snapshot,
  providerId,
  commitReadyState,
  updateRuntimeState,
  setProviderDiagnosticsBusy,
  setActiveProviderProbeId,
  setProviderDiagnostics,
  setSettingsNotice,
  errorMessageOf,
}: RefreshProviderDiagnosticsInput): Promise<void> => {
  try {
    setProviderDiagnosticsBusy(true);
    setActiveProviderProbeId(providerId ?? null);
    const reports = await requestProviderDiagnostics(providerId);
    updateRuntimeState((draft) => applyProviderDiagnostics(draft, reports));
    setProviderDiagnostics((current) => {
      if (!providerId) {
        return reports;
      }
      const byId = new Map(current.map((report) => [report.providerId, report]));
      for (const report of reports) {
        byId.set(report.providerId, report);
      }
      return Array.from(byId.values());
    });
    const nextState = applyProviderDiagnostics(snapshot.state, reports);
    commitReadyState(nextState);
    setSettingsNotice(
      providerId ? `Diagnostics refreshed for ${reports[0]?.providerLabel ?? providerId}.` : "Provider diagnostics refreshed.",
    );
  } catch (error) {
    setSettingsNotice(errorMessageOf(error, "Failed to probe provider diagnostics."));
  } finally {
    setProviderDiagnosticsBusy(false);
    setActiveProviderProbeId(null);
  }
};

export const executeSaveProviderSecret = async ({
  snapshot,
  profileId,
  secret,
  commitReadyState,
  updateRuntimeState,
  setProviderDrafts,
  setSettingsNotice,
  setProviderDiagnosticsBusy,
  setActiveProviderProbeId,
  setProviderDiagnostics,
  errorMessageOf,
}: SaveProviderSecretInput): Promise<void> => {
  try {
    await saveProviderSecret(profileId, secret);
    const credentialStatus: ResonantShellState["providers"][number]["credentialStatus"] = secret.trim()
      ? "configured"
      : "missing";
    updateRuntimeState((draft) => {
      const profile = draft.providers.find((item) => item.id === profileId);
      if (profile) {
        profile.credentialStatus = credentialStatus;
      }
      return draft;
    });
    const nextState = {
      ...snapshot.state,
      providers: snapshot.state.providers.map((profile) =>
        profile.id === profileId
          ? { ...profile, credentialStatus }
          : profile,
      ),
    };
    commitReadyState(nextState);
    setProviderDrafts((current) => ({ ...current, [profileId]: "" }));
    setSettingsNotice(secret.trim() ? "Provider secret saved." : "Provider secret cleared.");
    await executeRefreshProviderDiagnostics({
      snapshot: { ...snapshot, state: nextState },
      providerId: profileId,
      commitReadyState,
      updateRuntimeState,
      setProviderDiagnosticsBusy,
      setActiveProviderProbeId,
      setProviderDiagnostics,
      setSettingsNotice,
      errorMessageOf,
    });
  } catch (error) {
    setSettingsNotice(errorMessageOf(error, "Failed to save provider secret."));
  }
};

export const updateProviderProfile = (
  profileId: string,
  field: "primaryModel" | "fallbackModel" | "status",
  value: string,
  updateRuntimeState: (updater: (current: ResonantShellState) => ResonantShellState) => void,
): void => {
  updateRuntimeState((draft) => {
    const profile = draft.providers.find((item) => item.id === profileId);
    if (!profile) {
      return draft;
    }
    if (field === "status") {
      profile.status = value as ResonantShellState["providers"][number]["status"];
    } else if (field === "fallbackModel") {
      profile.fallbackModel = value || undefined;
    } else {
      profile.primaryModel = value;
    }
    return draft;
  });
};
