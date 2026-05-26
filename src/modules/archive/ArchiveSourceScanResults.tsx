// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type { ArchiveSourceFolderScanResult, ArchiveSourceWatchRecord } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveSourceScanResultsProps = {
  archiveSourceScanResult: ArchiveSourceFolderScanResult | null;
  archiveQueueBusy: boolean;
  onOpenArchiveDocument: (path: string) => void;
  onQueueWatchedSource: (source: ArchiveSourceWatchRecord) => void;
};

export function ArchiveSourceScanResults({
  archiveSourceScanResult,
  archiveQueueBusy,
  onOpenArchiveDocument,
  onQueueWatchedSource,
}: ArchiveSourceScanResultsProps) {
  const actionableWatchedSources =
    archiveSourceScanResult?.records.filter((record) => record.status === "new" || record.status === "changed") ?? [];

  return (
    <Panel title="Source Scan Results" subtitle="Changed mapped sources that can be queued for archive review.">
      {archiveSourceScanResult ? (
        <>
          <div className="archive-command-metrics compact" aria-label="Source folder scan summary">
            <ArchiveMetric label="Seen" value={String(archiveSourceScanResult.filesSeen)} meta={`${archiveSourceScanResult.rootsScanned} root(s)`} />
            <ArchiveMetric
              label="New"
              value={String(archiveSourceScanResult.newFiles)}
              meta="not previously indexed"
              tone={archiveSourceScanResult.newFiles ? "warning" : undefined}
            />
            <ArchiveMetric
              label="Changed"
              value={String(archiveSourceScanResult.changedFiles)}
              meta="hash changed since last scan"
              tone={archiveSourceScanResult.changedFiles ? "warning" : undefined}
            />
          </div>
          {actionableWatchedSources.length ? (
            <div className="archive-touch-list compact">
              {actionableWatchedSources.map((source) => (
                <WatchedSourceCard
                  key={`${source.status}:${source.path}:${source.hash}`}
                  source={source}
                  archiveQueueBusy={archiveQueueBusy}
                  onOpenArchiveDocument={onOpenArchiveDocument}
                  onQueueWatchedSource={onQueueWatchedSource}
                />
              ))}
            </div>
          ) : (
            <div className="archive-empty-state">
              <strong>No new or changed files.</strong>
              <p>The scan found {archiveSourceScanResult.unchangedFiles} unchanged file(s). Nothing needs review right now.</p>
            </div>
          )}
        </>
      ) : (
        <div className="archive-empty-state">
          <strong>No folder scan has run yet.</strong>
          <p>Run a scan to detect source files from configured raw and derived source folders.</p>
        </div>
      )}
    </Panel>
  );
}

function ArchiveMetric({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "ready" | "warning";
}) {
  return (
    <div className={`archive-command-metric ${tone ?? ""}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{meta}</p>
    </div>
  );
}

function WatchedSourceCard({
  source,
  archiveQueueBusy,
  onOpenArchiveDocument,
  onQueueWatchedSource,
}: {
  source: ArchiveSourceWatchRecord;
  archiveQueueBusy: boolean;
  onOpenArchiveDocument: (path: string) => void;
  onQueueWatchedSource: (source: ArchiveSourceWatchRecord) => void;
}) {
  return (
    <article className="archive-review-card watched-source-card">
      <div className="provider-head">
        <div>
          <span className="eyebrow">Watched source</span>
          <strong>{source.title}</strong>
          <p>{source.path}</p>
        </div>
        <span className={`tone ${source.status === "changed" ? "tone-warning" : "tone-active"}`}>{source.status}</span>
      </div>
      <div className="tol-bundle-signals">
        <span>{source.sourceType}</span>
        <span>{source.rootSubtype ?? source.rootRole}</span>
        <span>{Math.max(1, Math.round(source.sizeBytes / 1024))} KB</span>
        <span>{source.indexedInDb ? "indexed" : "file index only"}</span>
      </div>
      <details className="archive-mini-details">
        <summary>Version details</summary>
        <ul className="mono-list">
          <li>Hash: {source.hash}</li>
          <li>Previous: {source.previousHash ?? "none"}</li>
          <li>Modified: {source.modifiedAt}</li>
          <li>Absolute path: {source.absolutePath}</li>
        </ul>
      </details>
      <div className="archive-review-actions">
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => onQueueWatchedSource(source)}
          disabled={archiveQueueBusy}
        >
          Queue For Review
        </button>
        <button type="button" className="button-secondary touch-action" onClick={() => onOpenArchiveDocument(source.path)}>
          Open Source
        </button>
      </div>
    </article>
  );
}
