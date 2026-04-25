// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md

import type { Dispatch, SetStateAction } from "react";
import type {
  AddOnManifest,
  ArchiveDocumentPayload,
  ArchivePromoteReviewArtifactResult,
  ArchiveProcessIngestResult,
  ArchiveIngestProbeResult,
  ArchiveLibraryImportMode,
  ArchiveLibraryImportResult,
  ArchiveMemoryDomain,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ArchiveReviewDecisionResult,
  ArchiveSourceFolderScanResult,
  ArchiveSourceWatchRecord,
  ArchiveTolBundleBuildResult,
  ArchiveTolBundleCandidate,
  ArchiveSearchSourceHit,
  ArchiveRuntimeStatus,
  ArchiveSearchResult,
  ProviderDiagnosticReport,
  ResonantShellState,
} from "../../core/contracts";
import { applyProviderDiagnostics } from "../../core/policies";
import { resolveArchiveIngestRoute, routedProviderLabel } from "../../core/provider-service";
import {
  requestArchiveDocument,
  requestArchiveBuildTolBundle,
  requestArchiveIngestRequest,
  requestArchiveIngestProbe,
  requestArchiveLibraryFolderSelection,
  requestArchiveLibraryImport,
  requestArchiveProcessIngestRequest,
  requestArchivePromoteReviewArtifact,
  requestArchiveReviewArtifacts,
  requestArchiveReviewDecision,
  requestArchiveReviewQueue,
  requestArchiveRuntimeStatus,
  requestArchiveSearch,
  requestArchiveSourceFolderScan,
  requestArchiveTolBundleCandidates,
  requestProviderDiagnostics,
} from "../../core/runtime";

type ReadyShellSnapshot = {
  state: ResonantShellState;
  bundled: AddOnManifest[];
  sideloaded: AddOnManifest[];
};

type ArchiveProbeControllerInput = {
  snapshot: ReadyShellSnapshot;
  commitReadyState: (state: ResonantShellState) => void;
  setProviderDiagnostics: Dispatch<SetStateAction<ProviderDiagnosticReport[]>>;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveProbeBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveProbeResult: Dispatch<
    SetStateAction<{
      probe: ArchiveIngestProbeResult;
      routeLabel: string;
      model: string;
      resolutionReason: string;
    } | null>
  >;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveRuntimeStatusControllerInput = {
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveStatusBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveStatus: Dispatch<SetStateAction<ArchiveRuntimeStatus | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveSearchControllerInput = {
  query: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveSearchBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveSearchResult: Dispatch<SetStateAction<ArchiveSearchResult | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveDocumentControllerInput = {
  path: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveDocumentBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveDocument: Dispatch<SetStateAction<ArchiveDocumentPayload | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveReviewQueueControllerInput = {
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveReviewArtifacts?: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveQueueRequestControllerInput = {
  source: ArchiveSearchSourceHit;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveReviewArtifacts?: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveQueueWatchedSourceControllerInput = {
  source: ArchiveSourceWatchRecord;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveReviewArtifacts?: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveSourceFolderScanControllerInput = {
  rootPath?: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveSourceScanBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveSourceScanResult: Dispatch<SetStateAction<ArchiveSourceFolderScanResult | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveLibraryImportControllerInput = {
  sourcePath: string;
  domain: ArchiveMemoryDomain;
  importMode: ArchiveLibraryImportMode;
  libraryName?: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveSourceScanBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveLibraryImportResult: Dispatch<SetStateAction<ArchiveLibraryImportResult | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveProcessRequestControllerInput = {
  snapshot: ReadyShellSnapshot;
  requestFile: string;
  commitReadyState: (state: ResonantShellState) => void;
  setProviderDiagnostics: Dispatch<SetStateAction<ProviderDiagnosticReport[]>>;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveProcessResult: Dispatch<SetStateAction<ArchiveProcessIngestResult | null>>;
  setArchiveReviewArtifacts: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveReviewDecisionControllerInput = {
  artifactFile: string;
  action: "approve" | "reject" | "escalate";
  actorId: string;
  notes?: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveReviewArtifacts: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  setArchiveReviewDecisionResult: Dispatch<SetStateAction<ArchiveReviewDecisionResult | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchivePromoteReviewArtifactControllerInput = {
  artifactFile: string;
  actorId: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveReviewArtifacts: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  setArchivePromotionResult: Dispatch<SetStateAction<ArchivePromoteReviewArtifactResult | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveTolBundlesControllerInput = {
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveTolBundles: Dispatch<SetStateAction<ArchiveTolBundleCandidate[]>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

type ArchiveBuildTolBundleControllerInput = {
  sessionId: string;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveTolBundles: Dispatch<SetStateAction<ArchiveTolBundleCandidate[]>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveReviewArtifacts: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  setArchiveTolBundleResult: Dispatch<SetStateAction<ArchiveTolBundleBuildResult | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

const ARCHIVE_PROBE_SOURCE = {
  label: "Synthetic Living Archive Intake Probe",
  excerpt:
    "Transcript excerpt: ResonantOS should remain modular, strategy-driven, and sovereignty-first. The Living Archive must preserve trusted knowledge writes for the Strategist-owned ingest path while allowing add-ons to deposit raw intake artifacts for later interpretation.",
};

export const loadArchiveRuntimeStatus = async ({
  setChatNotice,
  setArchiveStatusBusy,
  setArchiveStatus,
  errorMessageOf,
}: ArchiveRuntimeStatusControllerInput): Promise<void> => {
  setArchiveStatusBusy(true);
  setChatNotice(null);
  try {
    const status = await requestArchiveRuntimeStatus();
    setArchiveStatus(status);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to load Living Archive runtime status."));
  } finally {
    setArchiveStatusBusy(false);
  }
};

export const executeArchiveSearch = async ({
  query,
  setChatNotice,
  setArchiveSearchBusy,
  setArchiveSearchResult,
  errorMessageOf,
}: ArchiveSearchControllerInput): Promise<void> => {
  setArchiveSearchBusy(true);
  setChatNotice(null);
  try {
    const result = await requestArchiveSearch(query);
    setArchiveSearchResult(result);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Living Archive search failed."));
  } finally {
    setArchiveSearchBusy(false);
  }
};

export const loadArchiveDocument = async ({
  path,
  setChatNotice,
  setArchiveDocumentBusy,
  setArchiveDocument,
  errorMessageOf,
}: ArchiveDocumentControllerInput): Promise<void> => {
  setArchiveDocumentBusy(true);
  setChatNotice(null);
  try {
    const document = await requestArchiveDocument(path);
    setArchiveDocument(document);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to read archive document."));
  } finally {
    setArchiveDocumentBusy(false);
  }
};

export const loadArchiveReviewQueue = async ({
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveQueue,
  setArchiveReviewArtifacts,
  errorMessageOf,
}: ArchiveReviewQueueControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    const [queue, artifacts] = await Promise.all([requestArchiveReviewQueue(), requestArchiveReviewArtifacts()]);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts?.(artifacts);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to load archive review queue."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const queueArchiveSourceForIngest = async ({
  source,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveQueue,
  setArchiveReviewArtifacts,
  errorMessageOf,
}: ArchiveQueueRequestControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    await requestArchiveIngestRequest({
      actorId: "strategist.core",
      sourcePath: source.rawPath,
      sourceType: source.sourceType,
      intent: "review-and-ingest",
      provenance: {
        origin: "archive-search",
        processed: source.processed,
      },
    });
    const [queue, artifacts] = await Promise.all([requestArchiveReviewQueue(), requestArchiveReviewArtifacts()]);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts?.(artifacts);
    setChatNotice(`Queued ${source.title} for Living Archive ingest review.`);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to queue archive ingest request."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const queueWatchedArchiveSourceForIngest = async ({
  source,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveQueue,
  setArchiveReviewArtifacts,
  errorMessageOf,
}: ArchiveQueueWatchedSourceControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    await requestArchiveIngestRequest({
      actorId: "strategist.core",
      sourcePath: source.path,
      sourceType: source.sourceType,
      sourceRole: source.rootSubtype ?? source.rootRole,
      intent: source.status === "changed" ? "review-and-reingest" : "review-and-ingest",
      provenance: {
        origin: "source-folder-scan",
        status: source.status,
        hash: source.hash,
        previousHash: source.previousHash,
        modifiedAt: source.modifiedAt,
      },
    });
    const [queue, artifacts] = await Promise.all([requestArchiveReviewQueue(), requestArchiveReviewArtifacts()]);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts?.(artifacts);
    setChatNotice(`Queued ${source.title} for Living Archive ingest review.`);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to queue scanned source for archive review."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const scanArchiveSourceFolders = async ({
  rootPath,
  setChatNotice,
  setArchiveSourceScanBusy,
  setArchiveSourceScanResult,
  errorMessageOf,
}: ArchiveSourceFolderScanControllerInput): Promise<void> => {
  setArchiveSourceScanBusy(true);
  setChatNotice(null);
  try {
    const result = await requestArchiveSourceFolderScan(rootPath);
    setArchiveSourceScanResult(result);
    setChatNotice(
      `Scanned ${result.filesSeen} source file(s): ${result.newFiles} new, ${result.changedFiles} changed.`,
    );
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to scan Living Archive source folders."));
  } finally {
    setArchiveSourceScanBusy(false);
  }
};

export const importArchiveLibrary = async ({
  sourcePath,
  domain,
  importMode,
  libraryName,
  setChatNotice,
  setArchiveSourceScanBusy,
  setArchiveLibraryImportResult,
  errorMessageOf,
}: ArchiveLibraryImportControllerInput): Promise<void> => {
  setArchiveSourceScanBusy(true);
  setChatNotice(null);
  try {
    const result = await requestArchiveLibraryImport({
      sourcePath,
      domain,
      importMode,
      libraryName,
      actorId: "strategist.core",
    });
    setArchiveLibraryImportResult(result);
    setChatNotice(
      `Imported ${result.filesImported} file(s) into ${result.libraryName}. Managed location is now canonical.`,
    );
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to import library into Living Archive."));
  } finally {
    setArchiveSourceScanBusy(false);
  }
};

export const pickArchiveLibraryFolder = async ({
  setChatNotice,
  errorMessageOf,
}: {
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
}): Promise<string | null> => {
  setChatNotice(null);
  try {
    return await requestArchiveLibraryFolderSelection();
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to open folder picker."));
    return null;
  }
};

export const processArchiveQueuedRequest = async ({
  snapshot,
  requestFile,
  commitReadyState,
  setProviderDiagnostics,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveQueue,
  setArchiveProcessResult,
  setArchiveReviewArtifacts,
  errorMessageOf,
}: ArchiveProcessRequestControllerInput): Promise<void> => {
  const { state } = snapshot;

  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    let routedState = state;
    try {
      const reports = await requestProviderDiagnostics();
      setProviderDiagnostics(reports);
      routedState = applyProviderDiagnostics(state, reports);
      commitReadyState(routedState);
    } catch {
      routedState = state;
    }

    const route = resolveArchiveIngestRoute(routedState);
    const provider = route.provider;
    const runtimeNode = route.runtimeNode;
    if (!provider || !runtimeNode || !route.model) {
      throw new Error(
        route.decision.resolutionReason === "no-viable-route"
          ? "No live archive ingest route is currently available under the agreed strategy."
          : "Archive ingest route is missing provider or runtime details.",
      );
    }
    if (provider.providerType !== "local" && provider.credentialStatus !== "configured") {
      throw new Error(`${provider.label} credential missing. Add it in Settings > Provider Profiles.`);
    }

    const result = await requestArchiveProcessIngestRequest({
      requestFile,
      providerId: provider.id,
      providerType: provider.providerType,
      apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
      runtimeNodeId: runtimeNode.id,
      runtimeNodeKind: runtimeNode.kind,
      runtimeNodeEndpoint: runtimeNode.endpoint,
      authTier: route.decision.authTier,
      model: route.model,
    });

    const [queue, artifacts] = await Promise.all([requestArchiveReviewQueue(), requestArchiveReviewArtifacts()]);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts(artifacts);
    setArchiveProcessResult(result);
    setChatNotice("Archive ingest review artifact created.");
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to process archive ingest request."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const decideArchiveReviewArtifact = async ({
  artifactFile,
  action,
  actorId,
  notes,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveReviewArtifacts,
  setArchiveReviewDecisionResult,
  errorMessageOf,
}: ArchiveReviewDecisionControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    const result = await requestArchiveReviewDecision({ artifactFile, actorId, action, notes });
    const artifacts = await requestArchiveReviewArtifacts();
    setArchiveReviewArtifacts(artifacts);
    setArchiveReviewDecisionResult(result);
    setChatNotice("Archive review decision recorded.");
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to record archive review decision."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const promoteArchiveReviewArtifact = async ({
  artifactFile,
  actorId,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveReviewArtifacts,
  setArchivePromotionResult,
  errorMessageOf,
}: ArchivePromoteReviewArtifactControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    const result = await requestArchivePromoteReviewArtifact({ artifactFile, actorId });
    const artifacts = await requestArchiveReviewArtifacts();
    setArchiveReviewArtifacts(artifacts);
    setArchivePromotionResult(result);
    setChatNotice(
      result.pagesWritten.length
        ? `Promoted ${result.pagesWritten.length} approved page(s) to the trusted wiki.`
        : "Approved artifact had no promotable trusted wiki pages.",
    );
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to promote archive review artifact."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const loadArchiveTolBundles = async ({
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveTolBundles,
  errorMessageOf,
}: ArchiveTolBundlesControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    const bundles = await requestArchiveTolBundleCandidates();
    setArchiveTolBundles(bundles);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to detect Audio2TOL bundles."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const buildArchiveTolBundle = async ({
  sessionId,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveTolBundles,
  setArchiveQueue,
  setArchiveReviewArtifacts,
  setArchiveTolBundleResult,
  errorMessageOf,
}: ArchiveBuildTolBundleControllerInput): Promise<void> => {
  setArchiveQueueBusy(true);
  setChatNotice(null);
  try {
    const result = await requestArchiveBuildTolBundle({ sessionId, actorId: "strategist.core" });
    const [bundles, queue, artifacts] = await Promise.all([
      requestArchiveTolBundleCandidates(),
      requestArchiveReviewQueue(),
      requestArchiveReviewArtifacts(),
    ]);
    setArchiveTolBundles(bundles);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts(artifacts);
    setArchiveTolBundleResult(result);
    setChatNotice(`Queued TOL bundle ${result.sessionId} for Living Archive ingest review.`);
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to build Audio2TOL intake bundle."));
  } finally {
    setArchiveQueueBusy(false);
  }
};

export const executeArchiveIngestProbe = async ({
  snapshot,
  commitReadyState,
  setProviderDiagnostics,
  setChatNotice,
  setArchiveProbeBusy,
  setArchiveProbeResult,
  errorMessageOf,
}: ArchiveProbeControllerInput): Promise<void> => {
  const { state } = snapshot;

  setArchiveProbeBusy(true);
  setChatNotice(null);
  try {
    let routedState = state;
    try {
      const reports = await requestProviderDiagnostics();
      setProviderDiagnostics(reports);
      routedState = applyProviderDiagnostics(state, reports);
      commitReadyState(routedState);
    } catch {
      routedState = state;
    }

    const route = resolveArchiveIngestRoute(routedState);
    const provider = route.provider;
    const runtimeNode = route.runtimeNode;
    if (!provider || !runtimeNode || !route.model) {
      throw new Error(
        route.decision.resolutionReason === "no-viable-route"
          ? "No live archive ingest route is currently available under the agreed strategy."
          : "Archive ingest route is missing provider or runtime details.",
      );
    }
    if (provider.providerType !== "local" && provider.credentialStatus !== "configured") {
      throw new Error(`${provider.label} credential missing. Add it in Settings > Provider Profiles.`);
    }

    const probe = await requestArchiveIngestProbe({
      providerId: provider.id,
      providerType: provider.providerType,
      apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
      runtimeNodeId: runtimeNode.id,
      runtimeNodeKind: runtimeNode.kind,
      runtimeNodeEndpoint: runtimeNode.endpoint,
      authTier: route.decision.authTier,
      model: route.model,
      sourceLabel: ARCHIVE_PROBE_SOURCE.label,
      sourceExcerpt: ARCHIVE_PROBE_SOURCE.excerpt,
    });

    setArchiveProbeResult({
      probe,
      routeLabel: routedProviderLabel(route),
      model: route.model,
      resolutionReason: route.decision.resolutionReason,
    });
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Archive ingest probe failed."));
  } finally {
    setArchiveProbeBusy(false);
  }
};
