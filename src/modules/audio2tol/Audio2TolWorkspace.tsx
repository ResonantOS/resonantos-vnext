// Intent citation: docs/architecture/AUDIO2TOL_ADDON_SDK_REVIEW.md
// Add-on boundary citation: docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md

import type {
  AddOnInstallation,
  AddOnManifest,
  ArchiveTolBundleBuildResult,
  ArchiveTolBundleCandidate,
  ProviderProfile,
  ProviderRuntimeNode,
} from "../../core/contracts";
import { Panel } from "../../components/Panel";
import { Audio2TolPipelineWorkspace } from "./Audio2TolPipelineWorkspace";
import type { Settings as Audio2TolSettings } from "./Audio2TolPipelineWorkspace";

type Audio2TolWorkspaceProps = {
  manifest?: AddOnManifest;
  installation?: AddOnInstallation;
  archiveQueueBusy: boolean;
  archiveTolBundles: ArchiveTolBundleCandidate[];
  archiveTolBundleResult: ArchiveTolBundleBuildResult | null;
  onConfigureAddon: () => void;
  onRefreshTolBundles: () => void;
  onBuildTolBundle: (sessionId: string) => void;
  onOpenArchiveDocument: (path: string) => void;
  onUpdateAddonConfig: (config: Record<string, unknown>) => void;
  providerProfiles: ProviderProfile[];
  runtimeNodes: ProviderRuntimeNode[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const audio2TolSettingsFromConfig = (config: Record<string, unknown> | undefined): Partial<Audio2TolSettings> | undefined => {
  const settings = config?.settings;
  return isRecord(settings) ? (settings as Partial<Audio2TolSettings>) : undefined;
};

export function Audio2TolWorkspace({
  manifest,
  installation,
  providerProfiles,
  runtimeNodes,
  onConfigureAddon,
  onUpdateAddonConfig,
}: Audio2TolWorkspaceProps) {
  const installed = Boolean(installation?.installed);
  const enabled = Boolean(installation?.enabled);
  const ready = installed && enabled;

  if (!manifest || !ready) {
    return (
      <Panel title="Audio2TOL" subtitle="TOL audio intake add-on">
        <div className="archive-guidance-card">
          <strong>{manifest ? "Audio2TOL needs access" : "Audio2TOL manifest is unavailable"}</strong>
          <p>
            Install and enable the add-on before opening the embedded Audio2TOL workspace.
          </p>
          <div className="archive-review-actions">
            <button type="button" className="button-secondary touch-action" onClick={onConfigureAddon}>
              Configure add-on
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="audio2tol-workspace">
      <Audio2TolPipelineWorkspace
        persistedSettings={audio2TolSettingsFromConfig(installation?.config)}
        providerProfiles={providerProfiles}
        runtimeNodes={runtimeNodes}
        onSettingsChange={(settings) =>
          onUpdateAddonConfig({
            ...(installation?.config ?? {}),
            settings,
          })
        }
      />
    </div>
  );
}
