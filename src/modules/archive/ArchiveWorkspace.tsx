// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md

import { useState } from "react";
import type {
  ArchiveActorPolicy,
  ArchiveClassificationProposal,
  ArchiveDocumentPayload,
  ArchiveImportedLibrarySummary,
  ArchiveLibraryClassificationReview,
  ArchiveLibraryReorganisationPlan,
  ArchivePromoteReviewArtifactResult,
  ArchiveProcessIngestResult,
  ArchiveIngestProbeResult,
  ArchiveLibraryImportMode,
  ArchiveLibraryImportResult,
  ArchiveMemoryDomain,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ArchiveReviewDecisionResult,
  ArchiveRuntimeStatus,
  ArchiveSearchPageHit,
  ArchiveSearchResult,
  ArchiveSearchSourceHit,
  ArchiveSourceFolderScanResult,
  ArchiveSourceWatchRecord,
  ArchiveTolBundleBuildResult,
  ArchiveTolBundleCandidate,
  ResonantShellState,
} from "../../core/contracts";
import { canPerformArchiveAction } from "../../core/policies";
import { resolveArchiveIngestRoute, routedProviderLabel } from "../../core/provider-service";
import { Panel } from "../../components/Panel";
import { ArchiveClassificationReviewPanel } from "./ArchiveClassificationReviewPanel";
import { ArchiveReviewDesk } from "./ArchiveReviewDesk";
import { ArchiveSourceRegistry } from "./ArchiveSourceRegistry";

type ArchiveWorkspaceProps = {
  state: ResonantShellState;
  archiveStatusBusy: boolean;
  archiveStatus: ArchiveRuntimeStatus | null;
  archiveSearchBusy: boolean;
  archiveSearchResult: ArchiveSearchResult | null;
  archiveDocumentBusy: boolean;
  archiveDocument: ArchiveDocumentPayload | null;
  archiveQueueBusy: boolean;
  archiveQueue: ArchiveQueuedIngestRequest[];
  archiveReviewArtifacts: ArchiveReviewArtifact[];
  archiveProcessResult: ArchiveProcessIngestResult | null;
  archiveReviewDecisionResult: ArchiveReviewDecisionResult | null;
  archivePromotionResult: ArchivePromoteReviewArtifactResult | null;
  archiveTolBundles: ArchiveTolBundleCandidate[];
  archiveTolBundleResult: ArchiveTolBundleBuildResult | null;
  archiveSourceScanBusy: boolean;
  archiveSourceScanResult: ArchiveSourceFolderScanResult | null;
  archiveImportedLibraries: ArchiveImportedLibrarySummary[];
  archiveClassificationReview: ArchiveLibraryClassificationReview | null;
  archiveReorganisationPlan: ArchiveLibraryReorganisationPlan | null;
  archiveLibraryImportResult: ArchiveLibraryImportResult | null;
  ingestProbeBusy: boolean;
  ingestProbeResult: {
    probe: ArchiveIngestProbeResult;
    routeLabel: string;
    model: string;
    resolutionReason: string;
  } | null;
  onRefreshArchiveStatus: () => void;
  onRefreshArchiveSourceRegistry: () => void;
  onRefreshArchiveQueue: () => void;
  onRunArchiveSearch: (query: string) => void;
  onOpenArchiveDocument: (path: string) => void;
  onQueueArchiveSource: (source: ArchiveSearchSourceHit) => void;
  onScanSourceFolders: (rootPath?: string) => void;
  onPickLibraryFolder: () => Promise<string | null>;
  onOpenClassificationReview: (classificationManifestPath: string) => void;
  onGenerateReorganisationPlan: (classificationManifestPath: string) => void;
  onImportLibrary: (input: {
    sourcePath: string;
    domain: ArchiveMemoryDomain;
    importMode: ArchiveLibraryImportMode;
    libraryName?: string;
  }) => void;
  onQueueWatchedSource: (source: ArchiveSourceWatchRecord) => void;
  onProcessArchiveRequest: (requestFile: string) => void;
  onApproveReviewArtifact: (artifactFile: string) => void;
  onEscalateReviewArtifact: (artifactFile: string) => void;
  onRejectReviewArtifact: (artifactFile: string) => void;
  onPromoteReviewArtifact: (artifactFile: string) => void;
  onRefreshTolBundles: () => void;
  onBuildTolBundle: (sessionId: string) => void;
  onRunIngestProbe: () => void;
};

export function ArchiveWorkspace({
  state,
  archiveStatusBusy,
  archiveStatus,
  archiveSearchBusy,
  archiveSearchResult,
  archiveDocumentBusy,
  archiveDocument,
  archiveQueueBusy,
  archiveQueue,
  archiveReviewArtifacts,
  archiveProcessResult,
  archiveReviewDecisionResult,
  archivePromotionResult,
  archiveTolBundles,
  archiveTolBundleResult,
  archiveSourceScanBusy,
  archiveSourceScanResult,
  archiveImportedLibraries,
  archiveClassificationReview,
  archiveReorganisationPlan,
  archiveLibraryImportResult,
  ingestProbeBusy,
  ingestProbeResult,
  onRefreshArchiveStatus,
  onRefreshArchiveSourceRegistry,
  onRefreshArchiveQueue,
  onRunArchiveSearch,
  onOpenArchiveDocument,
  onQueueArchiveSource,
  onScanSourceFolders,
  onPickLibraryFolder,
  onOpenClassificationReview,
  onGenerateReorganisationPlan,
  onImportLibrary,
  onQueueWatchedSource,
  onProcessArchiveRequest,
  onApproveReviewArtifact,
  onEscalateReviewArtifact,
  onRejectReviewArtifact,
  onPromoteReviewArtifact,
  onRefreshTolBundles,
  onBuildTolBundle,
  onRunIngestProbe,
}: ArchiveWorkspaceProps) {
  const ingestRoute = resolveArchiveIngestRoute(state);
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryName, setLibraryName] = useState("");
  const [libraryDomain, setLibraryDomain] = useState<ArchiveMemoryDomain>("mixed-library");
  const [libraryImportMode, setLibraryImportMode] = useState<ArchiveLibraryImportMode>("copy");
  const [classificationPlanApproved, setClassificationPlanApproved] = useState(false);
  const archiveReady = archiveStatus?.status === "ready";
  const archiveModeLabel = archiveStatus ? `${archiveStatus.mode} mode` : "not loaded";
  const pagesTotal = archiveStatus?.stats?.pagesTotal ?? 0;
  const unprocessedSources = archiveStatus?.stats?.sourcesUnprocessed ?? 0;
  const pendingArtifacts = archiveReviewArtifacts.filter((artifact) => artifact.decision.status === "pending").length;
  const audio2TolInstallation = state.installations["addon.audio2tol"];
  const audio2TolEnabled = Boolean(audio2TolInstallation?.installed && audio2TolInstallation.enabled);
  const actionableWatchedSources =
    archiveSourceScanResult?.records.filter((record) => record.status === "new" || record.status === "changed") ?? [];
  const classificationProposals = archiveLibraryImportResult
    ? (archiveLibraryImportResult.classificationProposals ?? [])
    : [];
  const hiddenClassificationProposalCount = archiveLibraryImportResult
    ? Math.max(0, archiveLibraryImportResult.records.length - classificationProposals.length)
    : 0;
  const chooseLibraryFolder = async () => {
    const selected = await onPickLibraryFolder();
    if (selected) {
      setLibraryPath(selected);
    }
  };

  return (
    <>
      <Panel className="archive-command-panel">
        <div className="archive-command-layout">
          <div className="archive-command-copy">
            <span className={`archive-status-dot ${archiveReady ? "ready" : "warning"}`} />
            <span className="eyebrow">Living Archive</span>
            <h2>{archiveReady ? "Archive is ready for intake and review." : "Start by loading the archive runtime."}</h2>
            <p>
              This page has three jobs: search trusted memory, collect new intake, and review proposed knowledge before it enters
              the wiki.
            </p>
          </div>
          <div className="archive-command-actions">
            <button type="button" className="button-secondary touch-action" onClick={onRefreshArchiveStatus} disabled={archiveStatusBusy}>
              {archiveStatusBusy ? "Checking..." : "Check Archive"}
            </button>
            {audio2TolEnabled ? (
              <button type="button" className="button-secondary touch-action" onClick={onRefreshTolBundles} disabled={archiveQueueBusy}>
                {archiveQueueBusy ? "Detecting..." : "Detect TOL Bundles"}
              </button>
            ) : null}
            <button type="button" className="button-secondary touch-action" onClick={onRefreshArchiveQueue} disabled={archiveQueueBusy}>
              {archiveQueueBusy ? "Refreshing..." : "Refresh Review"}
            </button>
          </div>
        </div>
        <div className="archive-help-card" aria-label="Living Archive help">
          <div>
            <span className="eyebrow">Why it matters</span>
            <p>
              The Living Archive is an AI-managed wiki for long-term memory. It turns reviewed material into organised knowledge
              so Augmentor can answer with better context without re-reading every raw file each time.
            </p>
          </div>
          <div className="archive-help-points">
            <ul>
              <li>Faster answers because useful knowledge is pre-organised before the AI needs it.</li>
              <li>Better continuity because concepts, entities, summaries, and syntheses can improve over time.</li>
              <li>Safer memory because raw intake is reviewed before it becomes trusted wiki knowledge.</li>
            </ul>
            <details className="archive-help-more">
              <summary>Read more</summary>
              <div className="archive-help-more-body">
                <p>
                  Raw notes, transcripts, documents, and add-on outputs enter the archive as intake. The ingest service interprets
                  that material and proposes structured wiki updates. Those proposals can then be approved, rejected, or escalated.
                </p>
                <p>
                  This means the archive is not just file storage. It is a maintained knowledge layer that helps the Strategist
                  retrieve the right memory quickly while keeping trusted knowledge separate from unreviewed data.
                </p>
                <ul>
                  <li>Use search to inspect what ResonantOS already knows.</li>
                  <li>Use intake when new material should become part of memory.</li>
                  <li>Use review to decide what is safe to promote into trusted knowledge.</li>
                </ul>
              </div>
            </details>
          </div>
        </div>
        <div className="archive-command-metrics" aria-label="Archive status summary">
          <ArchiveMetric label="Status" value={archiveReady ? "Archive online" : "Archive needs check"} meta={archiveModeLabel} tone={archiveReady ? "ready" : "warning"} />
          <ArchiveMetric label="Wiki Pages" value={String(pagesTotal)} meta={archiveStatus?.wikiRoot ?? "runtime not loaded"} />
          <ArchiveMetric label="Needs Work" value={String(archiveQueue.length + pendingArtifacts + unprocessedSources)} meta={`${archiveQueue.length} queued · ${pendingArtifacts} review · ${unprocessedSources} sources`} />
        </div>
      </Panel>

      <section className={`archive-primary-grid ${audio2TolEnabled ? "" : "single"}`.trim()}>
        {audio2TolEnabled ? (
          <Panel title="Audio2TOL Intake" subtitle="Add-on surface for finished TOL sessions.">
            <div className="archive-guidance-card">
              <strong>Audio2TOL add-on enabled</strong>
              <p>
                Detect TOL bundles, then queue the session you want the Living Archive to review. Nothing is written to trusted
                knowledge until it passes review.
              </p>
            </div>
            {archiveTolBundles.length ? (
              <div className="archive-touch-list compact">
                {archiveTolBundles.map((bundle) => (
                  <TolBundleCard
                    key={bundle.sessionId}
                    bundle={bundle}
                    archiveQueueBusy={archiveQueueBusy}
                    onBuildTolBundle={onBuildTolBundle}
                    onOpenArchiveDocument={onOpenArchiveDocument}
                  />
                ))}
              </div>
            ) : (
              <div className="archive-empty-state">
                <strong>No TOL bundles detected yet.</strong>
                <p>Use “Detect TOL Bundles” above to scan the mapped Audio2TOL folders.</p>
              </div>
            )}
            {archiveTolBundleResult ? (
              <article className="archive-review-card archive-review-result">
                <div className="provider-head">
                  <div>
                    <span className="eyebrow">Latest queued TOL bundle</span>
                    <strong>{archiveTolBundleResult.sessionId}</strong>
                    <p>{archiveTolBundleResult.intakeArtifactPath}</p>
                  </div>
                  <span className="tone tone-active">{archiveTolBundleResult.queuedAt}</span>
                </div>
                <p>Review request: {archiveTolBundleResult.requestFile}</p>
              </article>
            ) : null}
          </Panel>
        ) : null}

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
      </section>

      <ArchiveSourceRegistry
        archiveStatus={archiveStatus}
        archiveSourceScanBusy={archiveSourceScanBusy}
        archiveSourceScanResult={archiveSourceScanResult}
        archiveImportedLibraries={archiveImportedLibraries}
        onRefreshArchiveSourceRegistry={onRefreshArchiveSourceRegistry}
        onScanSourceFolders={onScanSourceFolders}
        onOpenClassificationReview={onOpenClassificationReview}
      />
      {archiveClassificationReview ? (
        <ArchiveClassificationReviewPanel
          review={archiveClassificationReview}
          plan={archiveReorganisationPlan}
          busy={archiveSourceScanBusy}
          onGenerateReorganisationPlan={onGenerateReorganisationPlan}
        />
      ) : null}

      <Panel
        className="library-importer-panel"
        title="Library Importer"
        subtitle="Bring a folder or Obsidian vault into the managed ResonantOS memory system."
      >
        <div className="library-importer-intro">
          <div>
            <span className="eyebrow">Why this matters</span>
            <h3>Keep the human voice separate from outside knowledge.</h3>
            <p>
              Import mixed folders safely first. ResonantOS copies the structure, then helps classify personal knowledge,
              external material, tags, and wikilinks before anything becomes trusted AI memory.
            </p>
          </div>
          <ol className="library-importer-steps" aria-label="Library import workflow">
            <li>Choose the folder</li>
            <li>Select how to store it</li>
            <li>Review classification</li>
          </ol>
        </div>
        <form
          className="library-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            setClassificationPlanApproved(false);
            onImportLibrary({
              sourcePath: libraryPath,
              domain: libraryDomain,
              importMode: libraryImportMode,
              libraryName,
            });
          }}
        >
          <section className="library-step-card">
            <div className="library-step-head">
              <span>1</span>
              <div>
                <strong>Choose source folder</strong>
                <p>Select a normal folder or an Obsidian vault. Long paths are contained here and will not affect the rest of the page.</p>
              </div>
            </div>
            <button
              type="button"
              className={`library-folder-button ${libraryPath ? "selected" : ""}`}
              aria-label="Choose folder or vault path"
              onClick={() => void chooseLibraryFolder()}
            >
              <span>{libraryPath || "Click to choose a folder or Obsidian vault"}</span>
              <strong>Browse...</strong>
            </button>
            <details className="library-manual-path">
              <summary>Advanced: type path manually</summary>
              <input
                aria-label="Manual folder or vault path"
                value={libraryPath}
                onChange={(event) => setLibraryPath(event.target.value)}
                placeholder="/Users/you/Documents/My Knowledge Folder"
              />
            </details>
          </section>

          <section className="library-step-card">
            <div className="library-step-head">
              <span>2</span>
              <div>
                <strong>Choose memory handling</strong>
                <p>Use Mixed Library when the folder contains both personal and external material.</p>
              </div>
            </div>
            <div className="library-field-grid">
              <label>
                <span>Library name</span>
                <input
                  value={libraryName}
                  onChange={(event) => setLibraryName(event.target.value)}
                  placeholder="Optional, inferred from folder"
                />
              </label>
              <label>
                <span>Memory domain</span>
                <select value={libraryDomain} onChange={(event) => setLibraryDomain(event.target.value as ArchiveMemoryDomain)}>
                  <option value="mixed-library">Mixed Library - classify with AI help</option>
                  <option value="human-knowledge">Human Knowledge</option>
                  <option value="external-knowledge">External Knowledge</option>
                </select>
              </label>
              <label>
                <span>Import mode</span>
                <select value={libraryImportMode} onChange={(event) => setLibraryImportMode(event.target.value as ArchiveLibraryImportMode)}>
                  <option value="copy">Copy into Living Archive (recommended)</option>
                  <option value="move">Move into Living Archive</option>
                  <option value="reference">Reference in place (advanced)</option>
                </select>
              </label>
            </div>
            <div className={`inline-notice ${libraryImportMode === "move" ? "warning" : ""}`}>
              {libraryImportMode === "copy"
                ? "Copy mode preserves the original and makes the managed ResonantOS copy the active knowledge base."
                : libraryImportMode === "move"
                  ? "Move mode removes files from the original location. This will require a stronger confirmation flow before production use."
                  : "Reference mode leaves files where they are. Use only when you cannot copy the source yet."}
            </div>
          </section>

          <section className="library-step-card library-import-action-card">
            <div className="library-step-head">
              <span>3</span>
              <div>
                <strong>Import and review</strong>
                <p>Non-Obsidian folders use Obsidian-compatible frontmatter, tags, and wikilinks by default.</p>
              </div>
            </div>
            <button type="submit" className="button-secondary touch-action" disabled={archiveSourceScanBusy || !libraryPath.trim()}>
              {archiveSourceScanBusy ? "Importing..." : "Import Library"}
            </button>
          </section>
        </form>
        {archiveLibraryImportResult ? (
          <article className="archive-import-result">
            <div className="archive-import-result-head">
              <div>
                <span className="eyebrow">Latest imported library</span>
                <strong>{archiveLibraryImportResult.libraryName}</strong>
                <p className="path-chip">{archiveLibraryImportResult.canonicalRoot}</p>
              </div>
              <span className="tone tone-active">{archiveLibraryImportResult.domain}</span>
            </div>
            <div className="archive-result-metrics">
              <span>{archiveLibraryImportResult.filesImported} imported</span>
              <span>{archiveLibraryImportResult.skippedFiles} skipped</span>
              <span>{archiveLibraryImportResult.importMode} mode</span>
              <span>{archiveLibraryImportResult.classificationStatus}</span>
              <span>{archiveLibraryImportResult.metadataStandard}</span>
              {archiveLibraryImportResult.recommendedAddon ? <span>Obsidian add-on recommended</span> : null}
            </div>
          </article>
        ) : null}
        {archiveLibraryImportResult?.domain === "mixed-library" ? (
          <section className="classification-review-surface" aria-label="Mixed library classification review">
            <div className="classification-review-head">
              <div>
                <span className="eyebrow">Classification review</span>
                <strong>Approve the plan before ResonantOS reorganises anything.</strong>
                <p>
                  This is a preview of the first-pass ownership plan. Paths and technical details stay collapsed so the review
                  remains readable.
                </p>
              </div>
              <button
                type="button"
                className="button-secondary touch-action"
                onClick={() => setClassificationPlanApproved(true)}
              >
                Approve Classification Plan
              </button>
            </div>
            <div className="classification-summary-strip" aria-label="Classification summary">
              <span>{archiveLibraryImportResult.filesImported} files imported</span>
              <span>{classificationProposals.length} previewed</span>
              <span>{hiddenClassificationProposalCount} waiting for full review</span>
              <span>{archiveLibraryImportResult.metadataStandard}</span>
            </div>
            <div className="classification-review-grid">
              {classificationProposals.map((proposal) => (
                <ClassificationProposalCard key={proposal.sourceId} proposal={proposal} />
              ))}
            </div>
            {hiddenClassificationProposalCount ? (
              <div className="inline-notice">
                Showing the first {classificationProposals.length} proposals only. The full review workspace will handle bulk approval,
                filtering, and reclassification without rendering every imported file in this page.
              </div>
            ) : null}
            <div className={`inline-notice ${classificationPlanApproved ? "" : "warning"}`}>
              {classificationPlanApproved
                ? "Classification plan approved. Next implementation step is a host-mediated reorganisation command with audit log and rollback plan."
                : "No files will be moved by this screen. Approval records the user's intent before any future reorganisation command can run."}
            </div>
          </section>
        ) : null}
        {archiveSourceScanResult ? (
          <>
            <div className="archive-command-metrics compact" aria-label="Source folder scan summary">
              <ArchiveMetric label="Seen" value={String(archiveSourceScanResult.filesSeen)} meta={`${archiveSourceScanResult.rootsScanned} root(s)`} />
              <ArchiveMetric label="New" value={String(archiveSourceScanResult.newFiles)} meta="not previously indexed" tone={archiveSourceScanResult.newFiles ? "warning" : undefined} />
              <ArchiveMetric label="Changed" value={String(archiveSourceScanResult.changedFiles)} meta="hash changed since last scan" tone={archiveSourceScanResult.changedFiles ? "warning" : undefined} />
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

      <ArchiveReviewDesk
        archiveQueueBusy={archiveQueueBusy}
        archiveQueue={archiveQueue}
        archiveReviewArtifacts={archiveReviewArtifacts}
        archiveProcessResult={archiveProcessResult}
        archiveReviewDecisionResult={archiveReviewDecisionResult}
        archivePromotionResult={archivePromotionResult}
        onRefreshArchiveQueue={onRefreshArchiveQueue}
        onProcessArchiveRequest={onProcessArchiveRequest}
        onApproveReviewArtifact={onApproveReviewArtifact}
        onEscalateReviewArtifact={onEscalateReviewArtifact}
        onRejectReviewArtifact={onRejectReviewArtifact}
        onPromoteReviewArtifact={onPromoteReviewArtifact}
      />

      <section className="archive-secondary-grid">
        <Panel title="Document Reader" subtitle="Opens selected pages or sources without granting direct filesystem access.">
          {archiveDocument ? (
            <article className="archive-document-card">
              <div className="provider-head">
                <div>
                  <strong>{archiveDocument.title ?? archiveDocument.path}</strong>
                  <p>{archiveDocument.path}</p>
                </div>
                <span className="tone tone-active">{archiveDocument.docType ?? "document"}</span>
              </div>
              <pre className="archive-document-body">{archiveDocument.content}</pre>
            </article>
          ) : (
            <div className="archive-empty-state">
              <strong>{archiveDocumentBusy ? "Loading document..." : "Nothing open."}</strong>
              <p>Select a wiki page, source, or TOL analysis to read it here.</p>
            </div>
          )}
        </Panel>

        <Panel title="Recent Activity" subtitle="Latest archive operations.">
          {archiveStatus?.recentActivity.length ? (
            <div className="archive-activity-list">
              {archiveStatus.recentActivity.slice(0, 5).map((entry) => (
                <article key={`${entry.ts}:${entry.action}:${entry.pageId ?? entry.sourceId ?? "none"}`} className="provider-card">
                  <div className="provider-head">
                    <div>
                      <strong>{entry.action}</strong>
                      <p>{entry.ts}</p>
                    </div>
                    <span className={`tone ${entry.errors ? "tone-warning" : "tone-active"}`}>
                      {entry.agentId ?? "system"}
                    </span>
                  </div>
                  <p>{entry.pageId ?? entry.sourceId ?? "Archive-level operation"}</p>
                  {entry.errors ? <p>{entry.errors}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="archive-empty-state">
              <strong>No activity loaded.</strong>
              <p>Check the archive runtime to load recent operations.</p>
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Diagnostics" subtitle="Technical archive details, routes, and permission boundaries.">
        <div className="archive-diagnostics-stack">
          <details className="archive-details">
            <summary>Runtime and storage paths</summary>
            {archiveStatus ? (
              <div className="policy-columns">
                <div className="policy-block">
                  <span className="eyebrow">Managed root</span>
                  <strong className="mono-inline">{archiveStatus.managedRoot}</strong>
                  <p>Config: {archiveStatus.configPath}</p>
                </div>
                <div className="policy-block">
                  <span className="eyebrow">Mapped source roots</span>
                  <ul className="mono-list">
                    {archiveStatus.sourceRoots.map((root) => (
                      <li key={`${root.role}:${root.path}`}>
                        {root.role}
                        {root.subtype ? `/${root.subtype}` : ""} · {root.path}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="policy-block">
                  <span className="eyebrow">Ingest agent</span>
                  <strong className="mono-inline">{archiveStatus.ingestAgent.model ?? "Not configured"}</strong>
                  <p>
                    {archiveStatus.ingestAgent.provider ?? "provider missing"} ·{" "}
                    {archiveStatus.ingestAgent.reasoningEffort ?? "reasoning unset"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="inline-notice">No Living Archive runtime loaded yet.</div>
            )}
          </details>

          <details className="archive-details">
            <summary>Trust boundaries and permission matrix</summary>
            <div className="policy-columns">
              <div className="policy-block">
                <span className="eyebrow">Intake roots</span>
                <ul className="mono-list">
                  {state.archivePolicy.intakeRoots.map((root) => (
                    <li key={root}>{root}</li>
                  ))}
                </ul>
              </div>
              <div className="policy-block">
                <span className="eyebrow">Knowledge roots</span>
                <ul className="mono-list">
                  {state.archivePolicy.knowledgeRoots.map((root) => (
                    <li key={root}>{root}</li>
                  ))}
                </ul>
              </div>
              <div className="policy-block">
                <span className="eyebrow">Live ingest route</span>
                <strong className="mono-inline">{ingestRoute.model ?? "Missing"}</strong>
                <p>{routedProviderLabel(ingestRoute)}</p>
                <p>{ingestRoute.decision.resolutionReason}</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="policy-table">
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Read</th>
                    <th>Intake</th>
                    <th>Knowledge</th>
                    <th>Ingest request</th>
                  </tr>
                </thead>
                <tbody>
                  {state.archivePolicy.actorPolicies.map((policy) => (
                    <ActorPolicyRow key={policy.actorId} policy={policy} state={state} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="archive-details">
            <summary>Ingest route probe</summary>
            <div className="provider-toolbar">
              <div className="provider-toolbar-copy">
                <strong>Controlled workload execution</strong>
                <p>Validates the current archive route without writing trusted knowledge pages.</p>
              </div>
              <button type="button" className="button-secondary touch-action" onClick={onRunIngestProbe} disabled={ingestProbeBusy}>
                {ingestProbeBusy ? "Running probe..." : "Run Ingest Probe"}
              </button>
            </div>
            {ingestProbeResult ? (
              <article className="provider-card">
                <div className="provider-head">
                  <div>
                    <strong>{ingestProbeResult.probe.sourceLabel}</strong>
                    <p>
                      {ingestProbeResult.model} · {ingestProbeResult.routeLabel}
                    </p>
                  </div>
                  <span className="tone tone-active">{ingestProbeResult.resolutionReason}</span>
                </div>
                <p>{ingestProbeResult.probe.summary}</p>
                <p className="provider-scope">Checked at: {ingestProbeResult.probe.checkedAt}</p>
              </article>
            ) : (
              <div className="inline-notice">No ingest probe has run yet.</div>
            )}
          </details>
        </div>
      </Panel>
    </>
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

function TolBundleCard({
  bundle,
  archiveQueueBusy,
  onBuildTolBundle,
  onOpenArchiveDocument,
}: {
  bundle: ArchiveTolBundleCandidate;
  archiveQueueBusy: boolean;
  onBuildTolBundle: (sessionId: string) => void;
  onOpenArchiveDocument: (path: string) => void;
}) {
  const ready = bundle.status === "bundle-ready";

  return (
    <article className="archive-review-card tol-bundle-card">
      <div className="provider-head">
        <div>
          <span className="eyebrow">TOL session</span>
          <strong>{bundle.sessionId}</strong>
          <p>{bundle.summary ?? "No analysis summary found."}</p>
        </div>
        <span className={`tone ${ready ? "tone-active" : "tone-warning"}`}>{ready ? "ready" : "missing files"}</span>
      </div>
      <div className="tol-bundle-signals">
        <span>{bundle.rawAudioPath ? "Audio linked" : "Audio missing"}</span>
        <span>{bundle.transcriptPath ? "Transcript ready" : "Transcript missing"}</span>
        <span>
          {bundle.explicitDirectivesCount} human directive(s) · {bundle.strategicActionsCount} AI-proposed strategic action(s).
        </span>
      </div>
      <details className="archive-mini-details">
        <summary>Technical files</summary>
        <ul className="mono-list">
          <li>Raw: {bundle.rawAudioPath ?? "missing"}</li>
          <li>Transcript: {bundle.transcriptPath ?? "missing"}</li>
          <li>Analysis: {bundle.analysisPath ?? "missing"}</li>
        </ul>
      </details>
      <div className="archive-review-actions">
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => onBuildTolBundle(bundle.sessionId)}
          disabled={archiveQueueBusy || !ready}
        >
          Queue TOL Bundle
        </button>
        {bundle.analysisPath ? (
          <button type="button" className="button-secondary touch-action" onClick={() => onOpenArchiveDocument(bundle.analysisPath!)}>
            Open Analysis
          </button>
        ) : null}
      </div>
    </article>
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

function ClassificationProposalCard({ proposal }: { proposal: ArchiveClassificationProposal }) {
  return (
    <article className="classification-proposal-card">
      <div className="classification-proposal-main">
        <div>
          <strong>{proposal.title}</strong>
          <p>{proposal.reason}</p>
        </div>
        <span className={`tone ${proposal.proposedTarget === "unclear" ? "tone-warning" : "tone-active"}`}>
          {proposal.proposedTarget}
        </span>
      </div>
      <div className="classification-chip-row" aria-label="Classification signals">
        <span>confidence/{proposal.confidence}</span>
        {proposal.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {proposal.wikilinks.map((link) => (
          <span key={link}>{link}</span>
        ))}
      </div>
      <details className="archive-mini-details classification-path-details">
        <summary>Source path</summary>
        <p className="path-chip">{proposal.canonicalPath}</p>
      </details>
    </article>
  );
}

function ActorPolicyRow({ policy, state }: { policy: ArchiveActorPolicy; state: ResonantShellState }) {
  return (
    <tr>
      <td>
        <strong>{policy.actorId}</strong>
        <p>{policy.actorType}</p>
      </td>
      <td>{canPerformArchiveAction(state, policy.actorId, "archive-read") ? policy.readScopes.join(", ") : "blocked"}</td>
      <td>
        {canPerformArchiveAction(state, policy.actorId, "archive-intake-write")
          ? policy.intakeWriteScopes.join(", ")
          : "blocked"}
      </td>
      <td>{canPerformArchiveAction(state, policy.actorId, "archive-knowledge-write") ? "allowed" : "blocked"}</td>
      <td>{canPerformArchiveAction(state, policy.actorId, "archive-ingest-request") ? "allowed" : "blocked"}</td>
    </tr>
  );
}
