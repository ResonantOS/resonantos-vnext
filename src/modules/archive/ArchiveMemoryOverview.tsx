// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-022-portable-user-state-secure-vault.md

import type { ArchiveImportedLibrarySummary, ArchiveRuntimeStatus } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveMemoryOverviewProps = {
  archiveStatus: ArchiveRuntimeStatus | null;
  archiveImportedLibraries: ArchiveImportedLibrarySummary[];
  needsWork: number;
  onOpenSources: () => void;
  onOpenReview: () => void;
  onImportAnother: () => void;
};

const domainLabel = (domain: string): string => {
  switch (domain) {
    case "human-knowledge":
      return "Human";
    case "external-knowledge":
      return "External";
    case "ai-memory":
      return "AI Memory";
    case "mixed-library":
      return "Mixed";
    default:
      return domain;
  }
};

const formatCount = (count: number, label: string): string => `${count.toLocaleString()} ${label}`;

export function ArchiveMemoryOverview({
  archiveStatus,
  archiveImportedLibraries,
  needsWork,
  onOpenSources,
  onOpenReview,
  onImportAnother,
}: ArchiveMemoryOverviewProps) {
  const latestLibrary = archiveImportedLibraries[0];
  const filesImported = archiveImportedLibraries.reduce((total, library) => total + library.filesImported, 0);
  const skippedFiles = archiveImportedLibraries.reduce((total, library) => total + library.skippedFiles, 0);
  const memoryRoot = archiveStatus?.portableUserState.memoryRoot ?? latestLibrary?.canonicalRoot ?? "Memory root not loaded";
  const domainCounts = archiveImportedLibraries.reduce<Record<string, number>>((counts, library) => {
    counts[library.domain] = (counts[library.domain] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <Panel className="archive-memory-overview-panel">
      <div className="archive-memory-hero">
        <div>
          <span className="eyebrow">Current memory</span>
          <h3>{archiveImportedLibraries.length ? "Your archive is already connected." : "No imported library yet."}</h3>
          <p className="archive-memory-path">{memoryRoot}</p>
        </div>
        <div className="archive-memory-actions">
          <button type="button" className="button-primary touch-action" onClick={onImportAnother}>
            {archiveImportedLibraries.length ? "Import Another Folder" : "Start Memory Import"}
          </button>
          <button type="button" className="button-secondary touch-action" onClick={onOpenSources}>
            View Structure
          </button>
          <button type="button" className="button-secondary touch-action" onClick={onOpenReview}>
            Review Queue
          </button>
        </div>
      </div>

      <div className="archive-memory-map" aria-label="Living Archive structure">
        <article className="archive-memory-node human">
          <span>Human Knowledge</span>
          <strong>{domainCounts["human-knowledge"] ?? 0}</strong>
        </article>
        <article className="archive-memory-node external">
          <span>External Knowledge</span>
          <strong>{domainCounts["external-knowledge"] ?? 0}</strong>
        </article>
        <article className="archive-memory-node mixed">
          <span>Mixed Library</span>
          <strong>{domainCounts["mixed-library"] ?? 0}</strong>
        </article>
        <article className="archive-memory-node ai">
          <span>AI Memory</span>
          <strong>{domainCounts["ai-memory"] ?? 0}</strong>
        </article>
      </div>

      <div className="archive-memory-stats" aria-label="Imported memory summary">
        <ArchiveMemoryStat label="Libraries" value={formatCount(archiveImportedLibraries.length, "imported")} />
        <ArchiveMemoryStat label="Files" value={formatCount(filesImported, "managed")} />
        <ArchiveMemoryStat label="Skipped" value={formatCount(skippedFiles, "left out")} />
        <ArchiveMemoryStat label="Needs Review" value={formatCount(needsWork, "item(s)")} warning={needsWork > 0} />
      </div>

      {latestLibrary ? (
        <article className="archive-memory-latest">
          <div>
            <span className="eyebrow">Latest import</span>
            <strong>{latestLibrary.libraryName}</strong>
            <p>{latestLibrary.canonicalRoot}</p>
          </div>
          <div className="archive-memory-latest-tags">
            <span>{domainLabel(latestLibrary.domain)}</span>
            <span>{latestLibrary.importMode}</span>
            <span>{latestLibrary.classificationStatus}</span>
          </div>
        </article>
      ) : null}
    </Panel>
  );
}

function ArchiveMemoryStat({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <article className={`archive-memory-stat ${warning ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
