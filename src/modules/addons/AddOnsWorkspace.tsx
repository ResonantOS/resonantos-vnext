// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import type { AddOnInstallation, AddOnManifest, CapabilityGrant } from "../../core/contracts";
import { Panel } from "../../components/Panel";

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
};

const prettyCapability = (grant: CapabilityGrant): string => grant.capability.replaceAll("-", " ");
const installationLabel = (installation: AddOnInstallation): string =>
  installation.enabled ? "enabled" : installation.installed ? "installed" : "available";

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
                    {effectiveInstallation ? installationLabel(effectiveInstallation) : "available"}
                  </span>
                </div>
                <p>{manifest.description}</p>
                <button type="button" className="button-secondary" onClick={() => props.onToggleAddonInstall(manifest)}>
                  {!effectiveInstallation?.installed ? "Install" : effectiveInstallation.enabled ? "Disable" : "Enable"}
                </button>
              </article>
            );
          })}
        </div>
      </Panel>

      {props.selectedManifest && props.selectedInstallation && (
        <Panel
          title={props.selectedManifest.name}
          subtitle="Manifest contract, capability grants, and shell integration."
          actions={
            <span className={`tone tone-${props.selectedInstallation.enabled ? "active" : "neutral"}`}>
              {props.selectedInstallation.source} · {props.selectedInstallation.provenanceTier}
            </span>
          }
        >
          <div className="detail-grid">
            <div className="detail-card">
              <span className="eyebrow">Provenance</span>
              <ul>
                <li>Tier: {props.selectedInstallation.provenanceTier}</li>
                <li>Verification: {props.selectedInstallation.verificationState}</li>
                <li>
                  Recommended grants:{" "}
                  {props.selectedInstallation.recommendedGrantPresetIds.length
                    ? props.selectedInstallation.recommendedGrantPresetIds.join(", ")
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
                    onClick={() => props.onToggleGrant(props.selectedManifest!.id, grant.capability)}
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
                <li>
                  Knowledge writes: {props.selectedManifest.archiveIntegration.canWriteKnowledgePages ? "yes" : "no"}
                </li>
              </ul>
            </div>
          </div>

          {props.selectedManifest.id === "addon.obsidian" && (
            <div className="embedded-pane-mock">
              <div className="pane-header">
                <strong>Obsidian Embedded Pane</strong>
                <span>Vault surface inside ResonantOS</span>
              </div>
              <div className="pane-body">
                <aside>
                  <span className="eyebrow">Vault</span>
                  <ul>
                    <li>00_THE_CONSTITUTION</li>
                    <li>02_PROTOCOL_LIBRARY</li>
                    <li>03_TOL</li>
                    <li>_LivingArchive</li>
                  </ul>
                </aside>
                <article>
                  <span className="eyebrow">Linked note</span>
                  <h3>ResonantOS Architecture</h3>
                  <p>
                    Embedded pane target for v1. Living Archive remains core; Obsidian is the user-facing vault add-on
                    surface.
                  </p>
                </article>
              </div>
            </div>
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
      )}
    </>
  );
}
