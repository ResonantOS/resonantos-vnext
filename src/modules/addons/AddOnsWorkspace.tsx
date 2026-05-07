// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import { useEffect, useState } from "react";
import type {
  AddOnInstallation,
  AddOnManifest,
  AddOnRegistryEntry,
  BrowserEngineStatus,
  CapabilityGrant,
} from "../../core/contracts";
import { Panel } from "../../components/Panel";
import { requestBrowserEngineStatus, requestBrowserInstallEngine } from "../../core/runtime";
import { createAddOnRegistryEntry } from "../../sdk/addons";
import { HermesAddonPanel } from "./HermesAddonPanel";
import { ObsidianAddonPanel } from "./ObsidianAddonPanel";

type AddOnsWorkspaceProps = {
  search: string;
  sideloadPath: string;
  filteredManifests: AddOnManifest[];
  installations: Record<string, AddOnInstallation>;
  selectedManifest: AddOnManifest | null;
  selectedInstallation: AddOnInstallation | null;
  onSearchChange: (value: string) => void;
  onSideloadPathChange: (value: string) => void;
  onSideload: () => void;
  onSelectManifest: (manifestId: string) => void;
  onToggleAddonInstall: (manifest: AddOnManifest) => void;
  onToggleGrant: (manifestId: string, capability: CapabilityGrant["capability"]) => void;
  onGrantCapabilities: (
    manifestId: string,
    capabilities: CapabilityGrant["capability"][],
    requestedCapabilities: CapabilityGrant[],
  ) => void;
  onGrantTerminalWorkspaceAccess: (manifest: AddOnManifest) => void;
  onUpdateAddonConfig: (manifestId: string, config: Record<string, unknown>) => void;
  onAskAugmentor: (message: string) => Promise<void>;
  onOpenArchiveReview: () => void;
};

const prettyCapability = (grant: CapabilityGrant): string => grant.capability.replaceAll("-", " ");
const registrySourceForInstallation = (installation: AddOnInstallation | null): AddOnRegistryEntry["registrySource"] =>
  installation?.source === "sideload" ? "sideloaded-local" : "bundled-catalog";
const registryEntryFor = (
  manifest: AddOnManifest,
  installation: AddOnInstallation | null,
): AddOnRegistryEntry =>
  createAddOnRegistryEntry(manifest, {
    registrySource: registrySourceForInstallation(installation),
    installation: installation ?? undefined,
  });
const hasGrant = (installation: AddOnInstallation | null, capability: CapabilityGrant["capability"]): boolean =>
  Boolean(installation?.grantedCapabilities.some((grant) => grant.capability === capability && grant.granted));
const isBrowserVisibleReady = (installation: AddOnInstallation | null): boolean =>
  Boolean(
    installation?.enabled &&
      hasGrant(installation, "network") &&
      hasGrant(installation, "ui-embedding") &&
      hasGrant(installation, "browser-control") &&
      hasGrant(installation, "filesystem"),
  );
const isTerminalVisibleReady = (installation: AddOnInstallation | null): boolean =>
  Boolean(installation?.enabled && hasGrant(installation, "shell") && hasGrant(installation, "ui-embedding"));
const isHermesBridgeReady = (installation: AddOnInstallation | null): boolean =>
  Boolean(installation?.enabled && hasGrant(installation, "shell") && hasGrant(installation, "ui-embedding"));

const addonPrimaryActionLabel = (manifest: AddOnManifest, installation: AddOnInstallation | null): string => {
  if (manifest.id === "addon.browser" && !isBrowserVisibleReady(installation)) {
    return "Install and grant browser access";
  }
  if (manifest.id === "addon.terminal" && !isTerminalVisibleReady(installation)) {
    return "Install and grant terminal access";
  }
  if (manifest.id === "addon.hermes" && !isHermesBridgeReady(installation)) {
    return "Install and grant Hermes access";
  }
  if (!installation?.installed) {
    return "Install";
  }
  return installation.enabled ? "Disable" : "Enable";
};

export function AddOnsWorkspace(props: AddOnsWorkspaceProps) {
  return (
    <>
      <Panel
        title="Add-on Workspace"
        subtitle="Curated manifests plus local sideloading, with capability grants instead of blanket trust."
        actions={
          <div className="toolbar">
            <input
              className="search-input"
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder="Search add-ons"
            />
          </div>
        }
      >
        <div className="sideload-strip">
          <input
            value={props.sideloadPath}
            onChange={(event) => props.onSideloadPathChange(event.target.value)}
            placeholder="/absolute/path/to/addon-manifest.json"
          />
          <button type="button" className="button-primary" onClick={props.onSideload}>
            Sideload manifest
          </button>
        </div>

        <div className="addon-grid">
          {props.filteredManifests.map((manifest) => {
            const effectiveInstallation = props.installations[manifest.id] ?? null;
            const registryEntry = registryEntryFor(manifest, effectiveInstallation);
            return (
              <article
                key={manifest.id}
                className={`addon-card ${props.selectedManifest?.id === manifest.id ? "selected" : ""}`}
                onClick={() => props.onSelectManifest(manifest.id)}
              >
                <div className="addon-headline">
                  <div>
                    <strong>{manifest.name}</strong>
                    <p>
                      {manifest.category} · {manifest.runtimeType}
                    </p>
                  </div>
                  <span className={`tone tone-${effectiveInstallation?.enabled ? "active" : "neutral"}`}>
                    {registryEntry.installState}
                  </span>
                </div>
                <p>{manifest.description}</p>
                <div className="addon-registry-strip" aria-label={`${manifest.name} registry status`}>
                  <span>{registryEntry.registrySource.replaceAll("-", " ")}</span>
                  <span>{registryEntry.reviewState}</span>
                  <span>{registryEntry.verificationState}</span>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (manifest.id === "addon.browser" && !isBrowserVisibleReady(effectiveInstallation)) {
                      props.onSelectManifest(manifest.id);
                      props.onGrantCapabilities(
                        manifest.id,
                        ["network", "ui-embedding", "browser-control", "filesystem"],
                        manifest.requestedCapabilities,
                      );
                      return;
                    }
                    if (manifest.id === "addon.terminal" && !isTerminalVisibleReady(effectiveInstallation)) {
                      props.onSelectManifest(manifest.id);
                      props.onGrantTerminalWorkspaceAccess(manifest);
                      return;
                    }
                    if (manifest.id === "addon.hermes" && !isHermesBridgeReady(effectiveInstallation)) {
                      props.onSelectManifest(manifest.id);
                      props.onGrantCapabilities(
                        manifest.id,
                        ["network", "shell", "ui-embedding", "providers", "archive-read", "archive-intake-write"],
                        manifest.requestedCapabilities,
                      );
                      return;
                    }
                    props.onToggleAddonInstall(manifest);
                  }}
                >
                  {addonPrimaryActionLabel(manifest, effectiveInstallation)}
                </button>
              </article>
            );
          })}
        </div>
      </Panel>

      {props.selectedManifest && props.selectedInstallation && (
        <AddOnDetailPanel
          selectedManifest={props.selectedManifest}
          selectedInstallation={props.selectedInstallation}
          registryEntry={registryEntryFor(props.selectedManifest, props.selectedInstallation)}
          onToggleGrant={props.onToggleGrant}
          onGrantCapabilities={props.onGrantCapabilities}
          onUpdateAddonConfig={props.onUpdateAddonConfig}
          onAskAugmentor={props.onAskAugmentor}
          onOpenArchiveReview={props.onOpenArchiveReview}
        />
      )}
    </>
  );
}

type AddOnDetailPanelProps = Pick<
  AddOnsWorkspaceProps,
  "onAskAugmentor" | "onGrantCapabilities" | "onOpenArchiveReview" | "onToggleGrant" | "onUpdateAddonConfig"
> & {
  selectedManifest: AddOnManifest;
  selectedInstallation: AddOnInstallation;
  registryEntry: AddOnRegistryEntry;
};

function AddOnDetailPanel(props: AddOnDetailPanelProps) {
  return (
    <Panel
      title={props.selectedManifest.name}
      subtitle="Catalog provenance, install state, capability grants, and shell integration."
      actions={
        <span className={`tone tone-${props.registryEntry.enabled ? "active" : "neutral"}`}>
          {props.registryEntry.registrySource} · {props.registryEntry.provenanceTier}
        </span>
      }
    >
      <div className="addon-registry-summary">
        <div>
          <span className="eyebrow">Registry state</span>
          <strong>{props.registryEntry.reviewState}</strong>
          <p>
            This is a discovery record. Installation, enablement, and grants are controlled separately by
            ResonantOS.
          </p>
        </div>
        <div className="addon-registry-strip">
          <span>{props.registryEntry.installState}</span>
          <span>{props.registryEntry.verificationState}</span>
          <span>{props.registryEntry.manifestRef.label}</span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <span className="eyebrow">Provenance</span>
          <ul>
            <li>Tier: {props.registryEntry.provenanceTier}</li>
            <li>Source: {props.registryEntry.registrySource}</li>
            <li>Review: {props.registryEntry.reviewState}</li>
            <li>Verification: {props.registryEntry.verificationState}</li>
            <li>
              Recommended grants:{" "}
              {props.registryEntry.recommendedGrantPresetIds.length
                ? props.registryEntry.recommendedGrantPresetIds.join(", ")
                : "none"}
            </li>
          </ul>
        </div>
        <div className="detail-card">
          <span className="eyebrow">Surfaces</span>
          <ul>
            {props.selectedManifest.surfaces.map((surface) => (
              <li key={surface.id}>
                <strong>{surface.label}</strong> · {surface.type}
              </li>
            ))}
          </ul>
        </div>
        <div className="detail-card">
          <span className="eyebrow">Capabilities</span>
          <div className="grant-list">
            {props.selectedInstallation.grantedCapabilities.map((grant) => (
              <button
                key={grant.capability}
                type="button"
                className={`grant-chip ${grant.granted ? "granted" : ""}`}
                onClick={() => props.onToggleGrant(props.selectedManifest.id, grant.capability)}
              >
                {prettyCapability(grant)} · {grant.scope}
              </button>
            ))}
          </div>
        </div>
        <div className="detail-card">
          <span className="eyebrow">Archive contract</span>
          <ul>
            <li>Read scopes: {props.selectedManifest.archiveIntegration.readScopes.join(", ") || "none"}</li>
            <li>Intake writes: {props.selectedManifest.archiveIntegration.intakeWriteScopes.join(", ") || "none"}</li>
            <li>Request ingest: {props.selectedManifest.archiveIntegration.canRequestIngest ? "yes" : "no"}</li>
            <li>Knowledge writes: {props.selectedManifest.archiveIntegration.canWriteKnowledgePages ? "yes" : "no"}</li>
          </ul>
        </div>
      </div>

      {props.selectedManifest.id === "addon.obsidian" && (
        <ObsidianAddonPanel
          installation={props.selectedInstallation}
          onConfigChange={(config) => props.onUpdateAddonConfig(props.selectedManifest.id, config)}
          onAskAugmentor={props.onAskAugmentor}
          onGrantArchiveIntake={() =>
            props.onGrantCapabilities(
              props.selectedManifest.id,
              ["archive-intake-write"],
              props.selectedManifest.requestedCapabilities,
            )
          }
          onOpenArchiveReview={props.onOpenArchiveReview}
        />
      )}

      {props.selectedManifest.id === "addon.browser" && (
        <BrowserAddonSetupPanel
          installation={props.selectedInstallation}
          onGrantVisibleAccess={() =>
            props.onGrantCapabilities(
              props.selectedManifest.id,
              ["network", "ui-embedding", "browser-control", "filesystem"],
              props.selectedManifest.requestedCapabilities,
            )
          }
        />
      )}

      {props.selectedManifest.id === "addon.hermes" && (
        <HermesAddonPanel
          installation={props.selectedInstallation}
          requestedCapabilities={props.selectedManifest.requestedCapabilities}
          onGrantCapabilities={(capabilities, requestedCapabilities) =>
            props.onGrantCapabilities(props.selectedManifest.id, capabilities, requestedCapabilities)
          }
          onConfigChange={(config) => props.onUpdateAddonConfig(props.selectedManifest.id, config)}
        />
      )}

      {props.selectedManifest.id === "addon.audio2tol" && (
        <div className="bundle-card">
          <span className="eyebrow">Audio2TOL bundle contract</span>
          <ul>
            <li>raw audio</li>
            <li>transcript</li>
            <li>protocol analysis artifact</li>
            <li>rendered note</li>
            <li>processing metadata</li>
          </ul>
        </div>
      )}
    </Panel>
  );
}

function BrowserAddonSetupPanel({
  installation,
  onGrantVisibleAccess,
}: {
  installation: AddOnInstallation;
  onGrantVisibleAccess: () => void;
}) {
  const [engineStatus, setEngineStatus] = useState<BrowserEngineStatus | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [engineLog, setEngineLog] = useState("");
  const networkGranted = installation.grantedCapabilities.some((grant) => grant.capability === "network" && grant.granted);
  const embeddingGranted = installation.grantedCapabilities.some((grant) => grant.capability === "ui-embedding" && grant.granted);
  const browserControlGranted = installation.grantedCapabilities.some((grant) => grant.capability === "browser-control" && grant.granted);
  const filesystemGranted = installation.grantedCapabilities.some((grant) => grant.capability === "filesystem" && grant.granted);
  const ready = installation.enabled && networkGranted && embeddingGranted && browserControlGranted && filesystemGranted;
  const installerReady = installation.enabled && networkGranted && browserControlGranted;

  useEffect(() => {
    let cancelled = false;
    requestBrowserEngineStatus()
      .then((status) => {
        if (!cancelled) {
          setEngineStatus(status);
          setEngineError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setEngineError(error instanceof Error ? error.message : "Could not inspect Chromium engine.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const installEngine = async () => {
    setEngineBusy(true);
    setEngineError("");
    setEngineLog("");
    try {
      const result = await requestBrowserInstallEngine();
      setEngineLog(result.log);
      setEngineStatus({
        installed: result.installed,
        enginePath: result.enginePath,
        installHint: result.installed ? "Chromium engine is installed." : "Chromium engine installation did not complete.",
      });
      if (!result.installed) {
        setEngineError("Chromium engine installation did not complete.");
      }
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : "Chromium engine install failed.");
    } finally {
      setEngineBusy(false);
    }
  };

  return (
    <div className="browser-addon-panel">
      <div>
        <span className="eyebrow">Browser setup</span>
        <h3>Controlled Chromium access</h3>
        <p>
          Install Browser and grant network, UI embedding, browser control, and reviewed filesystem access to launch
          the native embedded Chromium host with trusted extension flows for Phantom and Bitwarden.
        </p>
      </div>
      <div className="browser-addon-grant-box">
        <span className={`tone tone-${networkGranted ? "active" : "neutral"}`}>network {networkGranted ? "granted" : "needed"}</span>
        <span className={`tone tone-${embeddingGranted ? "active" : "neutral"}`}>
          ui embedding {embeddingGranted ? "granted" : "needed"}
        </span>
        <span className={`tone tone-${browserControlGranted ? "active" : "neutral"}`}>
          browser control {browserControlGranted ? "granted" : "needed"}
        </span>
        <span className={`tone tone-${filesystemGranted ? "active" : "neutral"}`}>
          filesystem {filesystemGranted ? "granted" : "needed"}
        </span>
        <span className={`tone tone-${engineStatus?.installed ? "active" : "neutral"}`}>
          chromium {engineStatus?.installed ? "installed" : "needed"}
        </span>
        <button type="button" className="button-primary touch-action" onClick={onGrantVisibleAccess} disabled={ready}>
          {ready ? "Browser access granted" : "Install and grant controlled browser access"}
        </button>
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={installEngine}
          disabled={engineBusy || Boolean(engineStatus?.installed) || !installerReady}
        >
          {engineBusy
            ? "Installing Chromium..."
            : engineStatus?.installed
              ? "Chromium installed"
              : installerReady
                ? "Install Chromium Engine"
                : "Grant Browser access first"}
        </button>
      </div>
      {engineStatus?.enginePath ? <p className="muted-copy">Engine path: {engineStatus.enginePath}</p> : null}
      {engineError ? (
        <p className="form-error" role="alert">
          {engineError}
        </p>
      ) : null}
      {engineLog ? <pre className="browser-addon-install-log">{engineLog.slice(-1600)}</pre> : null}
    </div>
  );
}
