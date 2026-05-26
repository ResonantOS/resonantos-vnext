// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-013-living-archive-memory-domains.md

import { useState } from "react";
import type {
  ArchiveAiMemoryBuildResult,
  ArchiveImportedLibrarySummary,
  ArchiveRuntimeStatus,
  ArchiveSourceFolderScanResult,
} from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveSourceRegistryProps = {
  archiveStatus: ArchiveRuntimeStatus | null;
  archiveSourceScanBusy: boolean;
  archiveSourceScanResult: ArchiveSourceFolderScanResult | null;
  archiveImportedLibraries: ArchiveImportedLibrarySummary[];
  archiveAiMemoryBuildResult: ArchiveAiMemoryBuildResult | null;
  onRefreshArchiveSourceRegistry: () => void;
  onScanSourceFolders: (rootPath?: string) => void;
  onOpenClassificationReview: (classificationManifestPath: string) => void;
  onQueueImportedLibraryForIngest: (manifestPath: string) => void;
};

const domainLabel = (domain: string): string => {
  switch (domain) {
    case "human-knowledge":
      return "Human Knowledge";
    case "external-knowledge":
      return "External Knowledge";
    case "ai-memory":
      return "AI Memory";
    case "mixed-library":
      return "Mixed Library";
    default:
      return domain;
  }
};

export function ArchiveSourceRegistry({
  archiveStatus,
  archiveSourceScanBusy,
  archiveSourceScanResult,
  archiveImportedLibraries,
  archiveAiMemoryBuildResult,
  onRefreshArchiveSourceRegistry,
  onScanSourceFolders,
  onOpenClassificationReview,
  onQueueImportedLibraryForIngest,
}: ArchiveSourceRegistryProps) {
  const [selectedSourceRoot, setSelectedSourceRoot] = useState("");
  const sourceRoots = archiveStatus?.sourceRoots ?? [];
  const selectableMappings = archiveStatus?.mappings.filter((mapping) => mapping.exists) ?? [];
  const displayedSourceRoots =
    sourceRoots.length > 0
      ? sourceRoots
      : selectableMappings.map((mapping) => ({
          role: mapping.role,
          subtype: mapping.subtype,
          path: mapping.path,
          exists: mapping.exists,
        }));
  const lastScanChanged = archiveSourceScanResult
    ? archiveSourceScanResult.newFiles + archiveSourceScanResult.changedFiles
    : 0;
  const resolveScanPath = (rootPath: string): string =>
    selectableMappings.find((mapping) => mapping.absolutePath === rootPath || mapping.path === rootPath)?.path ?? rootPath;

  return (
    <Panel
      className="archive-source-registry-panel"
      title="Source Registry"
      subtitle="Connected folders and vaults that feed the Living Archive."
    >
      <div className="source-registry-hero">
        <div>
          <span className="eyebrow">Connected memory sources</span>
          <h3>Choose what enters memory, then let the archive track changes.</h3>
          <p>
            The registry separates mapped folders from imported libraries. Scans detect new or changed files; imports create a
            managed canonical copy inside ResonantOS memory.
          </p>
        </div>
        <div className="source-registry-actions">
          <button
            type="button"
            className="button-secondary touch-action"
            onClick={onRefreshArchiveSourceRegistry}
            disabled={archiveSourceScanBusy}
          >
            {archiveSourceScanBusy ? "Refreshing..." : "Refresh Registry"}
          </button>
          <button
            type="button"
            className="button-secondary touch-action"
            onClick={() => onScanSourceFolders()}
            disabled={archiveSourceScanBusy || !selectableMappings.length}
          >
            {archiveSourceScanBusy ? "Scanning..." : "Scan All Sources"}
          </button>
        </div>
      </div>

      <div className="source-registry-scanbar">
        <label>
          <span>Select source folder</span>
          <select
            value={selectedSourceRoot}
            onChange={(event) => setSelectedSourceRoot(event.target.value)}
            aria-label="Select source folder"
          >
            <option value="">All raw and derived source folders</option>
            {selectableMappings.map((mapping) => (
              <option key={`${mapping.role}:${mapping.subtype ?? "none"}:${mapping.path}`} value={mapping.path}>
                {mapping.subtype ? `${mapping.subtype} · ` : ""}
                {mapping.path}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => onScanSourceFolders(selectedSourceRoot || undefined)}
          disabled={archiveSourceScanBusy || !selectableMappings.length}
        >
          {archiveSourceScanBusy ? "Scanning..." : "Scan Source Folder"}
        </button>
      </div>

      <div className="source-registry-summary" aria-label="Source registry summary">
        <RegistryMetric label="Mapped Roots" value={String(displayedSourceRoots.length)} meta="configured source folders" />
        <RegistryMetric label="Imported Libraries" value={String(archiveImportedLibraries.length)} meta="managed memory copies" />
        <RegistryMetric
          label="Last Scan"
          value={archiveSourceScanResult ? `${lastScanChanged} changed` : "Not run"}
          meta={archiveSourceScanResult ? `${archiveSourceScanResult.filesSeen} files seen` : "scan to detect intake"}
          tone={lastScanChanged ? "warning" : undefined}
        />
      </div>

      <div className="source-registry-grid">
        <section className="source-registry-section">
          <div className="source-registry-section-head">
            <div>
              <span className="eyebrow">Mapped folders</span>
              <strong>Folders ResonantOS can scan for intake.</strong>
            </div>
          </div>
          {displayedSourceRoots.length ? (
            <div className="source-root-list">
              {displayedSourceRoots.map((root) => (
                <article className="source-root-card" key={`${root.role}:${root.subtype ?? "none"}:${root.path}`}>
                  <div>
                    <strong>{root.subtype ?? root.role}</strong>
                    <p>{root.path}</p>
                  </div>
                  <div className="source-root-actions">
                    <span className={`tone ${root.exists ? "tone-active" : "tone-warning"}`}>
                      {root.exists ? "available" : "missing"}
                    </span>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => onScanSourceFolders(resolveScanPath(root.path))}
                      disabled={archiveSourceScanBusy || !root.exists}
                    >
                      Scan
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="archive-empty-state">
              <strong>No mapped source folders.</strong>
              <p>Check the archive runtime or import a folder to create managed memory sources.</p>
            </div>
          )}
        </section>

        <section className="source-registry-section">
          <div className="source-registry-section-head">
            <div>
              <span className="eyebrow">Imported libraries</span>
              <strong>Canonical copies managed by ResonantOS.</strong>
            </div>
          </div>
          {archiveImportedLibraries.length ? (
            <div className="imported-library-list">
              {archiveImportedLibraries.map((library) => (
                <article className="imported-library-card" key={`${library.domain}:${library.libraryId}`}>
                  <div className="imported-library-head">
                    <div>
                      <strong>{library.libraryName}</strong>
                      <p>{library.canonicalRoot}</p>
                    </div>
                    <span className="tone tone-active">{domainLabel(library.domain)}</span>
                  </div>
                  <div className="archive-result-metrics">
                    <span>{library.filesImported} imported</span>
                    <span>{library.recordsCount} records</span>
                    <span>{library.importMode} mode</span>
                    <span>{library.classificationStatus}</span>
                    {library.obsidianVaultDetected ? <span>Obsidian vault</span> : <span>Obsidian-compatible</span>}
                  </div>
                  {archiveAiMemoryBuildResult?.manifestPath === library.manifestPath ? (
                    <div className="archive-maintenance-summary" role="status">
                      <strong>AI Memory build: {archiveAiMemoryBuildResult.status}</strong>
                      <p>
                        {archiveAiMemoryBuildResult.queuedThisRun} queued · {archiveAiMemoryBuildResult.processedThisRun} processed ·{" "}
                        {archiveAiMemoryBuildResult.promotedThisRun} promoted · {archiveAiMemoryBuildResult.queueRemaining} remaining
                      </p>
                      <p>
                        {archiveAiMemoryBuildResult.recordsSeen} seen · {archiveAiMemoryBuildResult.skippedProcessed} already processed ·{" "}
                        {archiveAiMemoryBuildResult.skippedUnsupported} unsupported · {archiveAiMemoryBuildResult.skippedMissing} missing
                      </p>
                      <p>{archiveAiMemoryBuildResult.nextAction}</p>
                    </div>
                  ) : null}
                  {library.classificationManifestPath ? (
                    <div className="toolbar">
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => onQueueImportedLibraryForIngest(library.manifestPath)}
                        disabled={archiveSourceScanBusy}
                      >
                        Build AI Memory
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => onOpenClassificationReview(library.classificationManifestPath!)}
                      >
                        Review Classification
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="archive-empty-state">
              <strong>No imported libraries yet.</strong>
              <p>Use the Library Importer below to connect a folder or Obsidian vault.</p>
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}

function RegistryMetric({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "warning";
}) {
  return (
    <article className={`registry-metric ${tone === "warning" ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{meta}</p>
    </article>
  );
}
