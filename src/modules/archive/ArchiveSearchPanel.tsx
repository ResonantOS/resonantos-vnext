// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import { useState } from "react";
import type { ArchiveSearchPageHit, ArchiveSearchResult, ArchiveSearchSourceHit } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveSearchPanelProps = {
  archiveSearchBusy: boolean;
  archiveSearchResult: ArchiveSearchResult | null;
  onRunArchiveSearch: (query: string) => void;
  onOpenArchiveDocument: (path: string) => void;
  onQueueArchiveSource: (source: ArchiveSearchSourceHit) => void;
};

export function ArchiveSearchPanel({
  archiveSearchBusy,
  archiveSearchResult,
  onRunArchiveSearch,
  onOpenArchiveDocument,
  onQueueArchiveSource,
}: ArchiveSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Panel title="Search Knowledge" subtitle="Search trusted pages and tracked sources.">
      <form
        className="archive-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          onRunArchiveSearch(searchQuery);
        }}
      >
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search the Living Archive"
        />
        <button type="submit" className="button-secondary touch-action" disabled={archiveSearchBusy}>
          {archiveSearchBusy ? "Searching..." : "Search"}
        </button>
      </form>
      {archiveSearchResult ? (
        <div className="archive-search-grid">
          <div className="archive-search-column">
            <span className="eyebrow">Wiki pages</span>
            {archiveSearchResult.pages.length ? (
              archiveSearchResult.pages.map((page) => (
                <ArchivePageCard key={page.filePath} page={page} onOpen={onOpenArchiveDocument} />
              ))
            ) : (
              <div className="inline-notice">No wiki pages matched this query.</div>
            )}
          </div>
          <div className="archive-search-column">
            <span className="eyebrow">Tracked sources</span>
            {archiveSearchResult.sources.length ? (
              archiveSearchResult.sources.map((source) => (
                <ArchiveSourceCard
                  key={source.sourceId}
                  source={source}
                  onOpen={onOpenArchiveDocument}
                  onQueue={onQueueArchiveSource}
                />
              ))
            ) : (
              <div className="inline-notice">No tracked sources matched this query.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="archive-empty-state">
          <strong>No search running.</strong>
          <p>Search when you need to inspect existing memory or queue a tracked source.</p>
        </div>
      )}
    </Panel>
  );
}

function ArchivePageCard({ page, onOpen }: { page: ArchiveSearchPageHit; onOpen: (path: string) => void }) {
  return (
    <article className="provider-card archive-search-card">
      <div className="provider-head">
        <div>
          <strong>{page.title}</strong>
          <p>{page.filePath}</p>
        </div>
        <span className="tone tone-active">{page.pageType}</span>
      </div>
      <p>{page.snippet || "No snippet available."}</p>
      <button type="button" className="button-secondary" onClick={() => onOpen(page.filePath)}>
        Open page
      </button>
    </article>
  );
}

function ArchiveSourceCard({
  source,
  onOpen,
  onQueue,
}: {
  source: ArchiveSearchSourceHit;
  onOpen: (path: string) => void;
  onQueue: (source: ArchiveSearchSourceHit) => void;
}) {
  return (
    <article className="provider-card archive-search-card">
      <div className="provider-head">
        <div>
          <strong>{source.title}</strong>
          <p>{source.rawPath}</p>
        </div>
        <span className={`tone ${source.processed ? "tone-active" : "tone-warning"}`}>{source.sourceType}</span>
      </div>
      <p>{source.processed ? "Already tracked and processed in the archive." : "Tracked source is still pending ingest."}</p>
      <div className="toolbar">
        <button type="button" className="button-secondary" onClick={() => onOpen(source.rawPath)}>
          Open source
        </button>
        <button type="button" className="button-secondary" onClick={() => onQueue(source)}>
          Queue ingest
        </button>
      </div>
    </article>
  );
}
