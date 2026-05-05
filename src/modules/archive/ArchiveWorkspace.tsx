// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md

import { useEffect, useRef, useState } from "react";
import type {
  ArchiveDocumentPayload,
  ArchiveImportedLibrarySummary,
  ArchiveLibraryClassificationReview,
  ArchiveLibraryReorganisationPlan,
  ArchivePromoteReviewArtifactResult,
  ArchiveProcessIngestResult,
  ArchiveIngestProbeResult,
  ArchiveLibraryImportMode,
  ArchiveLibraryImportResult,
  ArchiveLibraryPreflightResult,
  ArchiveLintResult,
  ArchiveMaintenanceCycleResult,
  ArchiveMemoryDomain,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ArchiveReviewDecisionResult,
  ArchiveRuntimeStatus,
  ArchiveSearchResult,
  ArchiveSearchSourceHit,
  ArchiveSemanticLintResult,
  ArchiveSourceFolderScanResult,
  ArchiveSourceWatchRecord,
  ArchiveTolBundleBuildResult,
  ArchiveTolBundleCandidate,
  ResonantShellState,
} from "../../core/contracts";
import { Panel } from "../../components/Panel";
import { ArchiveAudio2TolIntake } from "./ArchiveAudio2TolIntake";
import { ArchiveClassificationReviewPanel } from "./ArchiveClassificationReviewPanel";
import { ArchiveDiagnostics } from "./ArchiveDiagnostics";
import { ArchiveDocumentReader } from "./ArchiveDocumentReader";
import { ArchiveLibraryImporter } from "./ArchiveLibraryImporter";
import { ArchiveMemoryOverview } from "./ArchiveMemoryOverview";
import { ArchiveRecentActivity } from "./ArchiveRecentActivity";
import { ArchiveReviewDesk } from "./ArchiveReviewDesk";
import { ArchiveSearchPanel } from "./ArchiveSearchPanel";
import { ArchiveSourceScanResults } from "./ArchiveSourceScanResults";
import { ArchiveSourceRegistry } from "./ArchiveSourceRegistry";

type ArchiveWorkspaceTab = "start" | "review" | "sources" | "search" | "help" | "advanced";

type ArchiveWorkspaceProps = {
  state: ResonantShellState;
  focusTarget?: "review" | null;
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
  archiveMaintenanceResult: ArchiveMaintenanceCycleResult | null;
  archiveLintResult: ArchiveLintResult | null;
  archiveSemanticLintResult: ArchiveSemanticLintResult | null;
  archiveTolBundles: ArchiveTolBundleCandidate[];
  archiveTolBundleResult: ArchiveTolBundleBuildResult | null;
  archiveSourceScanBusy: boolean;
  archiveSourceScanResult: ArchiveSourceFolderScanResult | null;
  archiveImportedLibraries: ArchiveImportedLibrarySummary[];
  archiveClassificationReview: ArchiveLibraryClassificationReview | null;
  archiveReorganisationPlan: ArchiveLibraryReorganisationPlan | null;
  archiveLibraryImportResult: ArchiveLibraryImportResult | null;
  archiveLibraryPreflightResult: ArchiveLibraryPreflightResult | null;
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
  onPreflightLibrary: (sourcePath: string) => void;
  onAskAugmentorAboutPreflight: (report: ArchiveLibraryPreflightResult) => void;
  onOpenClassificationReview: (classificationManifestPath: string) => void;
  onGenerateReorganisationPlan: (classificationManifestPath: string) => void;
  onImportLibrary: (input: {
    sourcePath: string;
    domain: ArchiveMemoryDomain;
    importMode: ArchiveLibraryImportMode;
    libraryName?: string;
    excludedTopFolders?: string[];
  }) => void;
  onQueueWatchedSource: (source: ArchiveSourceWatchRecord) => void;
  onProcessArchiveRequest: (requestFile: string) => void;
  onApproveReviewArtifact: (artifactFile: string) => void;
  onEscalateReviewArtifact: (artifactFile: string) => void;
  onRejectReviewArtifact: (artifactFile: string) => void;
  onPromoteReviewArtifact: (artifactFile: string) => void;
  onRunArchiveMaintenance: () => void;
  onRunArchiveLint: () => void;
  onRunArchiveSemanticLint: () => void;
  onRefreshTolBundles: () => void;
  onBuildTolBundle: (sessionId: string) => void;
  onRunIngestProbe: () => void;
};

export function ArchiveWorkspace({
  state,
  focusTarget,
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
  archiveMaintenanceResult,
  archiveLintResult,
  archiveSemanticLintResult,
  archiveTolBundles,
  archiveTolBundleResult,
  archiveSourceScanBusy,
  archiveSourceScanResult,
  archiveImportedLibraries,
  archiveClassificationReview,
  archiveReorganisationPlan,
  archiveLibraryImportResult,
  archiveLibraryPreflightResult,
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
  onPreflightLibrary,
  onAskAugmentorAboutPreflight,
  onOpenClassificationReview,
  onGenerateReorganisationPlan,
  onImportLibrary,
  onQueueWatchedSource,
  onProcessArchiveRequest,
  onApproveReviewArtifact,
  onEscalateReviewArtifact,
  onRejectReviewArtifact,
  onPromoteReviewArtifact,
  onRunArchiveMaintenance,
  onRunArchiveLint,
  onRunArchiveSemanticLint,
  onRefreshTolBundles,
  onBuildTolBundle,
  onRunIngestProbe,
}: ArchiveWorkspaceProps) {
  const archiveReady = archiveStatus?.status === "ready";
  const reviewDeskRef = useRef<HTMLDivElement | null>(null);
  const importerRef = useRef<HTMLDivElement | null>(null);
  const runMaintenanceRef = useRef(onRunArchiveMaintenance);
  const [activeTab, setActiveTab] = useState<ArchiveWorkspaceTab>("start");
  const [autoMaintenanceEnabled, setAutoMaintenanceEnabled] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);

  useEffect(() => {
    if (focusTarget !== "review") {
      return;
    }

    setActiveTab("review");
    reviewDeskRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusTarget]);
  const archiveModeLabel = archiveStatus ? `${archiveStatus.mode} mode` : "not loaded";
  const pagesTotal = archiveStatus?.stats?.pagesTotal ?? 0;
  const unprocessedSources = archiveStatus?.stats?.sourcesUnprocessed ?? 0;
  const pendingArtifacts = archiveReviewArtifacts.filter((artifact) => artifact.decision.status === "pending").length;
  const audio2TolInstallation = state.installations["addon.audio2tol"];
  const audio2TolEnabled = Boolean(audio2TolInstallation?.installed && audio2TolInstallation.enabled);
  const needsWork = archiveQueue.length + pendingArtifacts + unprocessedSources;
  const hasImportedLibraries = archiveImportedLibraries.length > 0;
  const importerVisible =
    importerOpen || !hasImportedLibraries || Boolean(archiveLibraryPreflightResult) || Boolean(archiveLibraryImportResult);

  useEffect(() => {
    runMaintenanceRef.current = onRunArchiveMaintenance;
  }, [onRunArchiveMaintenance]);

  useEffect(() => {
    if (!autoMaintenanceEnabled) {
      return;
    }

    const runIfWorkExists = () => {
      if (archiveQueueBusy) {
        return;
      }
      runMaintenanceRef.current();
    };

    const intervalId = window.setInterval(runIfWorkExists, 120_000);
    return () => window.clearInterval(intervalId);
  }, [archiveQueueBusy, autoMaintenanceEnabled]);

  const scrollToImporter = () => {
    setActiveTab("start");
    setImporterOpen(true);
    window.requestAnimationFrame(() => {
      importerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <Panel className="archive-start-panel">
        <div className="archive-start-hero">
          <div className="archive-start-copy">
            <span className={`archive-status-dot ${archiveReady ? "ready" : "warning"}`} />
            <span className="eyebrow">Living Archive</span>
            <h2>{hasImportedLibraries ? "Your memory is persistent." : "Turn folders into AI-readable memory."}</h2>
            <p>
              {hasImportedLibraries
                ? "Imported libraries stay in ResonantOS memory. Open the structure, review queue, or add another source."
                : "Choose a folder once. ResonantOS keeps the managed copy and shows where memory is stored."}
            </p>
          </div>
          <div className="archive-start-actions">
            <button type="button" className="button-primary touch-action" onClick={scrollToImporter}>
              {hasImportedLibraries ? "Import Another Folder" : "Start Memory Import"}
            </button>
            <button type="button" className="button-secondary touch-action" onClick={onRefreshArchiveStatus} disabled={archiveStatusBusy}>
              {archiveStatusBusy ? "Checking..." : archiveReady ? "Archive Online" : "Check Archive"}
            </button>
          </div>
        </div>

        <div className="archive-start-summary" aria-label="Archive status summary">
          <span className={archiveReady ? "ready" : "warning"}>{archiveReady ? "Archive online" : "Archive needs check"}</span>
          <span>{archiveImportedLibraries.length} imported librar{archiveImportedLibraries.length === 1 ? "y" : "ies"}</span>
          <span>{needsWork} item(s) need attention</span>
          <span>{pagesTotal} wiki page(s)</span>
        </div>
      </Panel>

      <nav className="archive-tabs" aria-label="Living Archive sections">
        {[
          ["start", "Start"],
          ["review", `Review${needsWork ? ` (${needsWork})` : ""}`],
          ["sources", "Sources"],
          ["search", "Search"],
          ["help", "Help"],
          ["advanced", "Advanced"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            aria-label={`Open ${label} section`}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab as ArchiveWorkspaceTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "start" ? (
        <>
          <ArchiveMemoryOverview
            archiveStatus={archiveStatus}
            archiveImportedLibraries={archiveImportedLibraries}
            needsWork={needsWork}
            onOpenSources={() => setActiveTab("sources")}
            onOpenReview={() => setActiveTab("review")}
            onImportAnother={scrollToImporter}
          />
          {importerVisible ? (
            <div ref={importerRef}>
              <ArchiveLibraryImporter
                archiveSourceScanBusy={archiveSourceScanBusy}
                archiveLibraryImportResult={archiveLibraryImportResult}
                archiveLibraryPreflightResult={archiveLibraryPreflightResult}
                onPickLibraryFolder={onPickLibraryFolder}
                onPreflightLibrary={onPreflightLibrary}
                onAskAugmentorAboutPreflight={onAskAugmentorAboutPreflight}
                onImportLibrary={onImportLibrary}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "review" ? (
        <div
          ref={reviewDeskRef}
          className={`archive-focus-target ${focusTarget === "review" ? "active" : ""}`}
          aria-label="Focused archive review area"
        >
          {focusTarget === "review" ? (
            <div className="archive-focus-cue" role="status">
              Opened from Obsidian intake history. Review queued notes here before any trusted memory write.
            </div>
          ) : null}
          <ArchiveReviewDesk
            archiveQueueBusy={archiveQueueBusy}
            archiveQueue={archiveQueue}
            archiveReviewArtifacts={archiveReviewArtifacts}
            archiveProcessResult={archiveProcessResult}
            archiveReviewDecisionResult={archiveReviewDecisionResult}
            archivePromotionResult={archivePromotionResult}
            archiveMaintenanceResult={archiveMaintenanceResult}
            autoMaintenanceEnabled={autoMaintenanceEnabled}
            onRefreshArchiveQueue={onRefreshArchiveQueue}
            onProcessArchiveRequest={onProcessArchiveRequest}
            onApproveReviewArtifact={onApproveReviewArtifact}
            onEscalateReviewArtifact={onEscalateReviewArtifact}
            onRejectReviewArtifact={onRejectReviewArtifact}
            onPromoteReviewArtifact={onPromoteReviewArtifact}
            onToggleAutoMaintenance={() => setAutoMaintenanceEnabled((current) => !current)}
            onRunArchiveMaintenance={onRunArchiveMaintenance}
          />
          {archiveClassificationReview ? (
            <ArchiveClassificationReviewPanel
              review={archiveClassificationReview}
              plan={archiveReorganisationPlan}
              busy={archiveSourceScanBusy}
              onGenerateReorganisationPlan={onGenerateReorganisationPlan}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "sources" ? (
        <>
          {audio2TolEnabled ? (
            <ArchiveAudio2TolIntake
              archiveQueueBusy={archiveQueueBusy}
              archiveTolBundles={archiveTolBundles}
              archiveTolBundleResult={archiveTolBundleResult}
              onRefreshTolBundles={onRefreshTolBundles}
              onBuildTolBundle={onBuildTolBundle}
              onOpenArchiveDocument={onOpenArchiveDocument}
            />
          ) : null}
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
          <ArchiveSourceScanResults
            archiveSourceScanResult={archiveSourceScanResult}
            archiveQueueBusy={archiveQueueBusy}
            onOpenArchiveDocument={onOpenArchiveDocument}
            onQueueWatchedSource={onQueueWatchedSource}
          />
        </>
      ) : null}

      {activeTab === "search" ? (
        <>
          <ArchiveSearchPanel
            archiveSearchBusy={archiveSearchBusy}
            archiveSearchResult={archiveSearchResult}
            onRunArchiveSearch={onRunArchiveSearch}
            onOpenArchiveDocument={onOpenArchiveDocument}
            onQueueArchiveSource={onQueueArchiveSource}
          />
          <section className="archive-secondary-grid">
            <ArchiveDocumentReader archiveDocumentBusy={archiveDocumentBusy} archiveDocument={archiveDocument} />
            <ArchiveRecentActivity archiveStatus={archiveStatus} />
          </section>
        </>
      ) : null}

      {activeTab === "help" ? <ArchiveHelpPanel /> : null}

      {activeTab === "advanced" ? (
        <>
          <div className="archive-command-metrics compact" aria-label="Advanced archive status summary">
            <ArchiveMetric label="Status" value={archiveReady ? "Archive online" : "Archive needs check"} meta={archiveModeLabel} tone={archiveReady ? "ready" : "warning"} />
            <ArchiveMetric label="Wiki Pages" value={String(pagesTotal)} meta={archiveStatus?.wikiRoot ?? "runtime not loaded"} />
            <ArchiveMetric label="Needs Work" value={String(needsWork)} meta={`${archiveQueue.length} queued · ${pendingArtifacts} review · ${unprocessedSources} sources`} />
          </div>
          <ArchiveDiagnostics
            state={state}
            archiveStatus={archiveStatus}
            archiveQueueBusy={archiveQueueBusy}
            archiveLintResult={archiveLintResult}
            archiveSemanticLintResult={archiveSemanticLintResult}
            ingestProbeBusy={ingestProbeBusy}
            ingestProbeResult={ingestProbeResult}
            onRunArchiveLint={onRunArchiveLint}
            onRunArchiveSemanticLint={onRunArchiveSemanticLint}
            onRunIngestProbe={onRunIngestProbe}
          />
        </>
      ) : null}
    </>
  );
}

function ArchiveHelpPanel() {
  return (
    <Panel className="archive-help-panel" title="How The Living Archive Works" subtitle="The short version, without diagnostics.">
      <div className="archive-help-sections">
        <section>
          <h3>What it is</h3>
          <p>
            The Living Archive is ResonantOS memory. It keeps your original material safe, then helps Augmentor turn reviewed
            material into organised AI-readable knowledge.
          </p>
        </section>
        <section>
          <h3>How to use it</h3>
          <ol>
            <li>Start with a folder or Obsidian vault.</li>
            <li>Let ResonantOS analyse what can be imported and what should stay out.</li>
            <li>Ask Augmentor to review the plan if anything is unclear.</li>
            <li>Import the recommended plan, then review proposed knowledge before it becomes trusted memory.</li>
          </ol>
        </section>
        <section>
          <h3>Why the separation matters</h3>
          <p>
            Human Knowledge, External Knowledge, and AI Memory stay separate so ResonantOS does not confuse your own identity and
            thinking with research, meeting material, project files, or AI-generated synthesis.
          </p>
        </section>
        <section>
          <h3>Add-ons</h3>
          <p>
            Obsidian can manage markdown/vault workflows when the Obsidian add-on is installed. Audio2TOL and TOL-specific
            processing are add-on capabilities, not required base Living Archive behavior.
          </p>
        </section>
      </div>
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
