// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddOnCategory,
  AddOnManifest,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ConversationMessage,
  ProviderProfile,
  ResonantShellState,
} from "./core/contracts";
import { buildDefaultState } from "./core/defaults";

const manifests: AddOnManifest[] = [
  createManifest("addon.telegram-channel", "Telegram Channel", "channel"),
  createManifest("addon.obsidian", "Obsidian", "knowledge"),
  createManifest("addon.audio2tol", "Audio2TOL", "tool"),
  createManifest("addon.openclaw", "OpenClaw", "agent"),
];

const {
  hydrateStateMock,
  requestProviderServiceChatCompletionMock,
  requestProviderServiceChatCompletionStreamMock,
  abortProviderServiceChatCompletionMock,
  requestCreateTaskWorkspaceMock,
  requestReadTaskWorkspaceMock,
  requestFinishTaskWorkspaceMock,
  requestArchiveIngestProbeMock,
  requestArchiveRuntimeStatusMock,
  requestArchiveSystemMemoryMock,
  requestArchiveSystemMemoryRefreshMock,
  requestArchiveSearchMock,
  requestArchiveDocumentMock,
  requestArchiveIntakeWriteMock,
  requestArchiveIngestRequestMock,
  requestArchiveReviewQueueMock,
  requestArchiveReviewArtifactsMock,
  requestArchiveReviewDecisionMock,
  requestArchivePromoteReviewArtifactMock,
  requestArchiveProcessIngestRequestMock,
  requestArchiveTolBundleCandidatesMock,
  requestArchiveBuildTolBundleMock,
  requestArchiveSourceFolderScanMock,
  requestArchiveLibraryImportMock,
  requestArchiveLibraryFolderSelectionMock,
  requestLocalRuntimeStatusMock,
  requestEngineerRecoveryTurnMock,
  requestRecoveryRouteCandidatesMock,
  requestProviderDiagnosticsMock,
} = vi.hoisted(() => ({
  hydrateStateMock: vi.fn(),
  requestProviderServiceChatCompletionMock: vi.fn(async (_input?: unknown) => "This is a live Strategist test reply from MiniMax-M2.7."),
  requestProviderServiceChatCompletionStreamMock: vi.fn(async (_input, onEvent) => {
    const reply = await requestProviderServiceChatCompletionMock(_input);
    onEvent({ runId: _input.runId, type: "chunk", content: reply });
    onEvent({ runId: _input.runId, type: "completed", content: "" });
    return reply;
  }),
  abortProviderServiceChatCompletionMock: vi.fn(async () => undefined),
  requestCreateTaskWorkspaceMock: vi.fn(async () => ({
    id: "workspace-engineer-provider-diagnostic",
    packetId: "delegation-workspace-engineer-provider-diagnostic",
    rootPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic",
    packetPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/delegation.packet.json",
    taskMarkdownPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/TASK.md",
    artifactsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/artifacts",
    logsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs",
    resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
    verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
  })),
  requestReadTaskWorkspaceMock: vi.fn(async () => ({
    workspace: {
      id: "workspace-engineer-provider-diagnostic",
      packetId: "delegation-workspace-engineer-provider-diagnostic",
      rootPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic",
      packetPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/delegation.packet.json",
      taskMarkdownPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/TASK.md",
      artifactsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/artifacts",
      logsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs",
      resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
      verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
    },
    packet: {
      id: "delegation-workspace-engineer-provider-diagnostic",
      createdAt: "2026-04-25T12:00:00.000Z",
      createdByAgentId: "strategist.core",
      workspaceId: "workspace-engineer-provider-diagnostic",
      targetAgentId: "setup.core",
      targetRuntime: "native-agent",
      taskType: "system-diagnosis",
      mission: "Run provider diagnostics and report the safest next step.",
      context: "Started from an Augmentor delegation workspace.",
      sourceMemoryRefs: [],
      systemMemoryRefs: ["system://resonantos-architecture-contract"],
      filesInScope: [],
      allowedTools: ["provider.probe", "filesystem.read"],
      forbiddenActions: ["Do not modify files."],
      capabilityGrants: [
        {
          capability: "providers",
          granted: true,
          scope: "shared",
          revocationBehavior: "degrade",
        },
      ],
      providerPolicy: {
        preferredProviderProfileIds: ["shared-local", "shared-minimax"],
        preferredRuntimeNodeIds: ["node-local-resurrect", "node-minimax-cloud"],
        preferredModels: ["batiai/gemma4-e2b:q4", "MiniMax-M2.7"],
        allowedRuntimeKinds: ["local", "cloud"],
        fallbackPolicyId: "recovery-default",
      },
      costPolicy: {
        sensitivity: "high",
        preferredCostTier: "free-local",
        allowPaidEscalation: true,
        rationale: "Prefer local diagnostics before paid escalation.",
      },
      humanApprovalRequired: false,
      approvalReasons: [],
      verificationRequirements: [
        {
          id: "diagnostic-report",
          label: "Return diagnostic report.",
          method: "manual-review",
          required: true,
        },
      ],
      expectedArtifacts: ["summary", "diagnostic-report", "verification-report"],
      returnProtocol: {
        summaryRequired: true,
        artifactTypes: ["summary", "diagnostic-report", "verification-report"],
        mustReportFilesChanged: true,
        mustReportCommandsRun: true,
        mustReportResidualRisks: true,
        mustReportVerification: true,
      },
      auditLogPath: "workspace-engineer-provider-diagnostic/logs/audit.jsonl",
    },
    taskMarkdown: "# TASK.md\n\nRun provider diagnostics.",
    resultMarkdown: "# Delegation Result\n\nNo result has been returned yet.",
    verification: { status: "pending" },
  })),
  requestFinishTaskWorkspaceMock: vi.fn(async () => ({
    workspace: {
      id: "workspace-engineer-provider-diagnostic",
      packetId: "delegation-workspace-engineer-provider-diagnostic",
      rootPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic",
      packetPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/delegation.packet.json",
      taskMarkdownPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/TASK.md",
      artifactsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/artifacts",
      logsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs",
      resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
      verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
    },
    resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
    verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
    auditPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs/audit.jsonl",
  })),
  requestArchiveIngestProbeMock: vi.fn(async () => ({
    sourceLabel: "Synthetic Living Archive Intake Probe",
    summary: "Summary: Probe route healthy. Candidate concepts: modular routing, trusted ingest. Quality note: premium cloud path active.",
    checkedAt: "unix:2",
  })),
  requestArchiveRuntimeStatusMock: vi.fn(async () => ({
    status: "ready",
    mode: "adopt",
    configPath: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/CONFIG/ARCHIVE_CONFIG.json",
    vaultRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE",
    managedRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive",
    wikiRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/WIKI",
    dataRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/DATA",
    logsRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/logs",
    configRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/CONFIG",
    mappingFile: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/CONFIG/VAULT_MAP.json",
    intakeRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/INTAKE",
    reviewQueueRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/REVIEW",
    mappings: [
      {
        path: "03_TOL/TOL Analysis",
        role: "wiki_pages",
        subtype: "analysis",
        absolutePath: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Analysis",
        exists: true,
        managedByAi: true,
        immutable: false,
        renameAllowed: false,
        moveAllowed: false,
      },
    ],
    sourceRoots: [],
    ingestAgent: {
      enabled: true,
      provider: "openai",
      model: "gpt-5.4",
      reasoningEffort: "xhigh",
      configFile: "/tmp/INGEST_AGENT_CONFIG.json",
      promptFile: "/tmp/INGEST_AGENT_SYSTEM_PROMPT.md",
      configExists: true,
      promptExists: true,
    },
    stats: {
      pagesTotal: 15,
      pagesByType: { summary: 2, entity: 5, concept: 6, synthesis: 2 },
      linksTotal: 12,
      sourcesTotal: 4,
      sourcesUnprocessed: 1,
      activity7d: 7,
    },
    recentActivity: [],
  })),
  requestArchiveSystemMemoryMock: vi.fn(async () => ({
    status: "ready",
    generatedAt: "unix:11",
    manifestPath: "/tmp/Memory/AI_MEMORY/provenance/system-memory-manifest.json",
    pagesRoot: "/tmp/Memory/AI_MEMORY/system",
    sources: [],
    pages: [
      {
        pageId: "resonantos-system-index",
        title: "ResonantOS System Memory Index",
        filePath: "/tmp/Memory/AI_MEMORY/system/resonantos-system-index.md",
        sourceCount: 1,
        hash: "fnv64:system",
      },
    ],
    staleSources: [],
    missingSources: [],
  })),
  requestArchiveSystemMemoryRefreshMock: vi.fn(async () => ({
    refreshedAt: "unix:11",
    manifestPath: "/tmp/Memory/AI_MEMORY/provenance/system-memory-manifest.json",
    pagesRoot: "/tmp/Memory/AI_MEMORY/system",
    pagesWritten: [],
    sourcesIndexed: 1,
    missingSources: [],
  })),
  requestArchiveSearchMock: vi.fn(async () => ({
    query: "resonance",
    pages: [] as Array<Record<string, unknown>>,
    sources: [] as Array<Record<string, unknown>>,
  })),
  requestArchiveDocumentMock: vi.fn(async () => ({
    path: "WIKI/concepts/resonance.md",
    title: "Resonance",
    docType: "concept",
    frontmatter: {},
    content: "## Definition\nResonance is a core concept.",
  })),
  requestArchiveIntakeWriteMock: vi.fn(async () => ({
    actorId: "strategist.core",
    bucket: "chat-insights",
    artifactPath: "/tmp/chat-insights/chat-insight.md",
    metadataPath: "/tmp/chat-insights/chat-insight.md.json",
  })),
  requestArchiveIngestRequestMock: vi.fn(async () => ({
    requestFile: "/tmp/review-request.json",
    queuedAt: "unix:3",
  })),
  requestArchiveReviewQueueMock: vi.fn<() => Promise<ArchiveQueuedIngestRequest[]>>(async () => []),
  requestArchiveReviewArtifactsMock: vi.fn<() => Promise<ArchiveReviewArtifact[]>>(async () => []),
  requestArchiveReviewDecisionMock: vi.fn(async () => ({
    artifactFile: "/tmp/artifacts/review-output.json",
    status: "approved",
    action: "approve",
    actorId: "strategist.core",
    decidedAt: "unix:5",
    tierApplied: "strategist-review",
    summary: "Review artifact created for the queued source.",
  })),
  requestArchivePromoteReviewArtifactMock: vi.fn(async () => ({
    artifactFile: "/tmp/artifacts/review-output.json",
    promotedAt: "unix:6",
    actorId: "archive-ingest.core",
    pagesWritten: [
      {
        pageType: "concept",
        pageId: "provider-fabric",
        title: "Provider Fabric",
        filePath: "WIKI/concepts/provider-fabric.md",
        action: "created",
        sourceId: "session-1",
        indexed: true,
        mergeMode: "create-page",
      },
    ],
    skippedPages: [],
  })),
  requestArchiveProcessIngestRequestMock: vi.fn(async () => ({
    requestFile: "/tmp/review-request.json",
    archivedRequestFile: "/tmp/processed/review-request.json",
    reviewArtifactFile: "/tmp/artifacts/review-output.json",
    summary: "Review artifact created for the queued source.",
    checkedAt: "unix:4",
    reviewArtifact: {
      artifactFile: "/tmp/artifacts/review-output.json",
      checkedAt: "unix:4",
      requestFile: "/tmp/review-request.json",
      sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Transcripts/session-1.md",
      sourceType: "transcript",
      sourceRole: undefined,
      intent: "review-and-ingest",
      providerId: "shared-openai",
      model: "gpt-5.4",
      summary: "Review artifact created for the queued source.",
      confidence: "high",
      doctrineSensitivity: "low",
      recommendedTier: "strategist-review",
      recommendationReason: "Strategist review is the default approval tier for trusted archive promotion.",
      proposedPages: [],
      decision: { status: "pending" },
    },
  })),
  requestArchiveTolBundleCandidatesMock: vi.fn(async () => [] as Array<Record<string, unknown>>),
  requestArchiveBuildTolBundleMock: vi.fn(async () => ({
    sessionId: "2026-04-21-1003",
    intakeArtifactPath: "/tmp/tol-bundles/2026-04-21-1003-tol-bundle.json",
    requestFile: "/tmp/review-request.json",
    queuedAt: "unix:8",
    rawAudioPath: "03_TOL/RAW Audio/260421_1003.mp3",
    transcriptPath: "03_TOL/TOL Transcripts/2026-04-21-1003_TOL_Transcript.md",
    analysisPath: "03_TOL/TOL Analysis/2026-04-21-1003_TOL_Analysis.md",
  })),
  requestArchiveSourceFolderScanMock: vi.fn(async () => ({
    scannedAt: "unix:9",
    rootsScanned: 1,
    filesSeen: 0,
    newFiles: 0,
    changedFiles: 0,
    unchangedFiles: 0,
    skippedFiles: 0,
    records: [] as Array<Record<string, unknown>>,
    indexPath: "/tmp/source-watch-index.json",
  })),
  requestArchiveLibraryImportMock: vi.fn(async () => ({
    importedAt: "unix:10",
    domain: "mixed-library",
    importMode: "copy",
    libraryId: "resonant-os-base",
    libraryName: "RESONANT_OS_BASE",
    originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
    canonicalRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
    filesSeen: 2,
    filesImported: 2,
    skippedFiles: 0,
    manifestPath: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
    versionLedgerPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-version-ledger.jsonl",
    classificationManifestPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
    classificationStatus: "needs-ai-assisted-classification",
    metadataStandard: "obsidian-frontmatter-wikilinks",
    obsidianVaultDetected: false,
    recommendedAddon: "addon.obsidian",
    records: [
      {
        sourceId: "resonant-os-base-notes-identity",
        versionId: "v1",
        originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE/notes/identity.md",
        canonicalPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base/notes/identity.md",
        sourceType: "md",
        title: "identity",
        hash: "fnv64:identity",
        sizeBytes: 1024,
      },
    ] as Array<Record<string, unknown>>,
    classificationProposals: [
      {
        sourceId: "resonant-os-base-notes-identity",
        title: "identity",
        canonicalPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base/notes/identity.md",
        proposedTarget: "human-knowledge",
        confidence: "medium",
        reason: "Matched human-authored path or title signals.",
        tags: ["ownership/human", "source-type/md", "review/unapproved"],
        wikilinks: ["[[identity]]"],
      },
    ] as Array<Record<string, unknown>>,
  })),
  requestArchiveLibraryFolderSelectionMock: vi.fn(async () => "/Users/augmentor/Documents/RESONANT_OS_BASE"),
  requestLocalRuntimeStatusMock: vi.fn(async () => ({
    available: true,
    targetModel: "batiai/gemma4-e2b:q4",
    recoveryModelInstalled: true,
    recoveryModelRunning: true,
    installedModels: ["batiai/gemma4-e2b:q4"],
    runningModels: ["batiai/gemma4-e2b:q4"],
    ollamaListRaw: "NAME ID SIZE MODIFIED\nbatiai/gemma4-e2b:q4 abc 5 GB now",
    ollamaPsRaw: "NAME ID SIZE PROCESSOR UNTIL\nbatiai/gemma4-e2b:q4 abc 5 GB 100% GPU 4 minutes from now",
  })),
  requestEngineerRecoveryTurnMock: vi.fn(async () => ({
    reply: "Engineer recovery handled this turn through the local tool loop.",
    toolEvents: [
      {
        tool: "local_runtime_status",
        summary: "Ollama available=true, targetInstalled=true, targetRunning=true",
        status: "completed",
      },
    ],
  })),
  requestRecoveryRouteCandidatesMock: vi.fn(async () => [
    {
      id: "shared-minimax::node-minimax-cloud",
      providerId: "shared-minimax",
      providerLabel: "Shared MiniMax",
      runtimeNodeId: "node-minimax-cloud",
      runtimeNodeLabel: "MiniMax Cloud Runtime",
      runtimeKind: "cloud",
      model: "MiniMax-M2.7",
      credentialConfigured: true,
      reachable: true,
      promotable: true,
      recommended: true,
      reason: "Route is reachable and stronger than the local recovery floor via MiniMax Cloud Runtime.",
    },
  ]),
  requestProviderDiagnosticsMock: vi.fn(async () => [
    {
      providerId: "shared-minimax",
      providerLabel: "Shared MiniMax",
      providerType: "minimax",
      authMethod: "subscription",
      authTier: "experimental",
      executionAdapter: "cloud-minimax-compatible",
      credentialConfigured: true,
      status: "healthy",
      summary: "Provider credentials are configured and at least one runtime route is reachable.",
      checkedAt: "unix:1",
      primaryModel: "MiniMax-M2.7",
      fallbackModel: "MiniMax-M2.7-highspeed",
      runtimeDiagnostics: [
        {
          runtimeNodeId: "node-minimax-cloud",
          runtimeNodeLabel: "MiniMax Cloud Runtime",
          runtimeKind: "cloud",
          locality: "cloud",
          probeState: "healthy",
          detail: "reachable with HTTP 200",
        },
      ],
    },
    {
      providerId: "shared-openai",
      providerLabel: "Shared OpenAI",
      providerType: "openai",
      authMethod: "subscription",
      authTier: "experimental",
      executionAdapter: "cloud-openai-compatible",
      credentialConfigured: true,
      status: "healthy",
      summary: "Provider credentials are configured and the archive route is reachable.",
      checkedAt: "unix:1",
      primaryModel: "gpt-5.4",
      fallbackModel: "gpt-5.4-mini",
      runtimeDiagnostics: [
        {
          runtimeNodeId: "node-openai-cloud",
          runtimeNodeLabel: "OpenAI Cloud Runtime",
          runtimeKind: "cloud",
          locality: "cloud",
          probeState: "healthy",
          detail: "reachable with HTTP 200",
        },
      ],
    },
  ]),
}));

vi.mock("./core/runtime", () => ({
  loadBundledManifests: vi.fn(async () => manifests),
  loadSideloadedManifests: vi.fn(async () => []),
  hydrateState: hydrateStateMock,
  loadProviderCredentialStatuses: vi.fn(async () => ({ "shared-minimax": true, "shared-openai": true })),
  applyProviderCredentialStatuses: vi.fn((state: ResonantShellState) => ({
    ...state,
    providers: state.providers.map((profile: ProviderProfile) =>
      profile.id === "shared-minimax" || profile.id === "shared-openai"
        ? { ...profile, credentialStatus: "configured" }
        : profile,
    ),
  })),
  persistState: vi.fn(async () => undefined),
  requestEngineerRecoveryTurn: requestEngineerRecoveryTurnMock,
  requestCreateTaskWorkspace: requestCreateTaskWorkspaceMock,
  requestReadTaskWorkspace: requestReadTaskWorkspaceMock,
  requestFinishTaskWorkspace: requestFinishTaskWorkspaceMock,
  requestArchiveIngestProbe: requestArchiveIngestProbeMock,
  requestLocalRuntimeStatus: requestLocalRuntimeStatusMock,
  requestProviderDiagnostics: requestProviderDiagnosticsMock,
  requestArchiveRuntimeStatus: requestArchiveRuntimeStatusMock,
  requestArchiveSystemMemory: requestArchiveSystemMemoryMock,
  requestArchiveSystemMemoryRefresh: requestArchiveSystemMemoryRefreshMock,
  requestArchiveSearch: requestArchiveSearchMock,
  requestArchiveDocument: requestArchiveDocumentMock,
  requestArchiveIntakeWrite: requestArchiveIntakeWriteMock,
  requestArchiveIngestRequest: requestArchiveIngestRequestMock,
  requestArchiveReviewQueue: requestArchiveReviewQueueMock,
  requestArchiveReviewArtifacts: requestArchiveReviewArtifactsMock,
  requestArchiveReviewDecision: requestArchiveReviewDecisionMock,
  requestArchivePromoteReviewArtifact: requestArchivePromoteReviewArtifactMock,
  requestArchiveProcessIngestRequest: requestArchiveProcessIngestRequestMock,
  requestArchiveTolBundleCandidates: requestArchiveTolBundleCandidatesMock,
  requestArchiveBuildTolBundle: requestArchiveBuildTolBundleMock,
  requestArchiveSourceFolderScan: requestArchiveSourceFolderScanMock,
  requestArchiveLibraryImport: requestArchiveLibraryImportMock,
  requestArchiveLibraryFolderSelection: requestArchiveLibraryFolderSelectionMock,
  requestRecoveryRouteCandidates: requestRecoveryRouteCandidatesMock,
  requestProviderServiceChatCompletion: requestProviderServiceChatCompletionMock,
  requestProviderServiceChatCompletionStream: requestProviderServiceChatCompletionStreamMock,
  abortProviderServiceChatCompletion: abortProviderServiceChatCompletionMock,
  requestStrategistReply: requestProviderServiceChatCompletionMock,
  saveProviderSecret: vi.fn(async () => undefined),
  sideloadManifest: vi.fn(),
}));

import { App } from "./App";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const providerStreamInputs = (): Array<{ systemPrompt: string; messages: ConversationMessage[] }> =>
  requestProviderServiceChatCompletionStreamMock.mock.calls.map((call) => call[0]) as Array<{
    systemPrompt: string;
    messages: ConversationMessage[];
  }>;

describe("App boot flow", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hydrateStateMock.mockReset();
    hydrateStateMock.mockResolvedValue(buildDefaultState(manifests));
    requestProviderServiceChatCompletionMock.mockReset();
    requestProviderServiceChatCompletionMock.mockResolvedValue("This is a live Strategist test reply from MiniMax-M2.7.");
    requestProviderServiceChatCompletionStreamMock.mockReset();
    requestProviderServiceChatCompletionStreamMock.mockImplementation(async (input, onEvent) => {
      const reply = await requestProviderServiceChatCompletionMock(input);
      onEvent({ runId: input.runId, type: "chunk", content: reply });
      onEvent({ runId: input.runId, type: "completed", content: "" });
      return reply;
    });
    abortProviderServiceChatCompletionMock.mockReset();
    abortProviderServiceChatCompletionMock.mockResolvedValue(undefined);
    requestCreateTaskWorkspaceMock.mockReset();
    requestCreateTaskWorkspaceMock.mockResolvedValue({
      id: "workspace-engineer-provider-diagnostic",
      packetId: "delegation-workspace-engineer-provider-diagnostic",
      rootPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic",
      packetPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/delegation.packet.json",
      taskMarkdownPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/TASK.md",
      artifactsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/artifacts",
      logsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs",
      resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
      verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
    });
    requestReadTaskWorkspaceMock.mockReset();
    requestReadTaskWorkspaceMock.mockResolvedValue({
      workspace: {
        id: "workspace-engineer-provider-diagnostic",
        packetId: "delegation-workspace-engineer-provider-diagnostic",
        rootPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic",
        packetPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/delegation.packet.json",
        taskMarkdownPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/TASK.md",
        artifactsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/artifacts",
        logsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs",
        resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
        verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
      },
      packet: {
        id: "delegation-workspace-engineer-provider-diagnostic",
        createdAt: "2026-04-25T12:00:00.000Z",
        createdByAgentId: "strategist.core",
        targetAgentId: "setup.core",
        targetRuntime: "native-agent",
        taskType: "system-diagnosis",
        mission: "Run provider diagnostics and report the safest next step.",
        context: "Started from an Augmentor delegation workspace.",
        sourceMemoryRefs: [],
        systemMemoryRefs: ["system://resonantos-architecture-contract"],
        workspaceId: "workspace-engineer-provider-diagnostic",
        filesInScope: [],
        allowedTools: ["provider.probe", "filesystem.read"],
        forbiddenActions: ["Do not modify files."],
        capabilityGrants: [
          {
            capability: "providers",
            granted: true,
            scope: "shared",
            revocationBehavior: "degrade",
          },
        ],
        providerPolicy: {
          preferredProviderProfileIds: ["shared-local", "shared-minimax"],
          preferredRuntimeNodeIds: ["node-local-resurrect", "node-minimax-cloud"],
          preferredModels: ["batiai/gemma4-e2b:q4", "MiniMax-M2.7"],
          allowedRuntimeKinds: ["local", "cloud"],
          fallbackPolicyId: "recovery-default",
        },
        costPolicy: {
          sensitivity: "high",
          preferredCostTier: "free-local",
          allowPaidEscalation: true,
          rationale: "Prefer local diagnostics before paid escalation.",
        },
        humanApprovalRequired: false,
        approvalReasons: [],
        verificationRequirements: [
          {
            id: "diagnostic-report",
            label: "Return diagnostic report.",
            method: "manual-review",
            required: true,
          },
        ],
        expectedArtifacts: ["summary", "diagnostic-report", "verification-report"],
        returnProtocol: {
          summaryRequired: true,
          artifactTypes: ["summary", "diagnostic-report", "verification-report"],
          mustReportFilesChanged: true,
          mustReportCommandsRun: true,
          mustReportResidualRisks: true,
          mustReportVerification: true,
        },
        auditLogPath: "workspace-engineer-provider-diagnostic/logs/audit.jsonl",
      },
      taskMarkdown: "# TASK.md\n\nRun provider diagnostics.",
      resultMarkdown: "# Delegation Result\n\nNo result has been returned yet.",
      verification: { status: "pending" },
    } as never);
    requestFinishTaskWorkspaceMock.mockReset();
    requestFinishTaskWorkspaceMock.mockResolvedValue({
      workspace: {
        id: "workspace-engineer-provider-diagnostic",
        packetId: "delegation-workspace-engineer-provider-diagnostic",
        rootPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic",
        packetPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/delegation.packet.json",
        taskMarkdownPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/TASK.md",
        artifactsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/artifacts",
        logsPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs",
        resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
        verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
      },
      resultPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/result.md",
      verificationPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/verification.json",
      auditPath: "/tmp/task-workspaces/workspace-engineer-provider-diagnostic/logs/audit.jsonl",
    });
    requestArchiveIngestProbeMock.mockReset();
    requestArchiveIngestProbeMock.mockResolvedValue({
      sourceLabel: "Synthetic Living Archive Intake Probe",
      summary: "Summary: Probe route healthy. Candidate concepts: modular routing, trusted ingest. Quality note: premium cloud path active.",
      checkedAt: "unix:2",
    });
    requestArchiveRuntimeStatusMock.mockReset();
    requestArchiveRuntimeStatusMock.mockResolvedValue({
      status: "ready",
      mode: "adopt",
      configPath: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/CONFIG/ARCHIVE_CONFIG.json",
      vaultRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE",
      managedRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive",
      wikiRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/WIKI",
      dataRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/DATA",
      logsRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/logs",
      configRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/CONFIG",
      mappingFile: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/CONFIG/VAULT_MAP.json",
      intakeRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/INTAKE",
      reviewQueueRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/REVIEW",
      mappings: [
        {
          path: "03_TOL/TOL Analysis",
          role: "wiki_pages",
          subtype: "analysis",
          absolutePath: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Analysis",
          exists: true,
          managedByAi: true,
          immutable: false,
          renameAllowed: false,
          moveAllowed: false,
        },
      ],
      sourceRoots: [],
      ingestAgent: {
        enabled: true,
        provider: "openai",
        model: "gpt-5.4",
        reasoningEffort: "xhigh",
        configFile: "/tmp/INGEST_AGENT_CONFIG.json",
        promptFile: "/tmp/INGEST_AGENT_SYSTEM_PROMPT.md",
        configExists: true,
        promptExists: true,
      },
      stats: {
        pagesTotal: 15,
        pagesByType: { summary: 2, entity: 5, concept: 6, synthesis: 2 },
        linksTotal: 12,
        sourcesTotal: 4,
        sourcesUnprocessed: 1,
        activity7d: 7,
      },
      recentActivity: [],
    });
    requestArchiveSystemMemoryMock.mockReset();
    requestArchiveSystemMemoryMock.mockResolvedValue({
      status: "ready",
      generatedAt: "unix:11",
      manifestPath: "/tmp/Memory/AI_MEMORY/provenance/system-memory-manifest.json",
      pagesRoot: "/tmp/Memory/AI_MEMORY/system",
      sources: [],
      pages: [
        {
          pageId: "resonantos-system-index",
          title: "ResonantOS System Memory Index",
          filePath: "/tmp/Memory/AI_MEMORY/system/resonantos-system-index.md",
          sourceCount: 1,
          hash: "fnv64:system",
        },
      ],
      staleSources: [],
      missingSources: [],
    });
    requestArchiveSystemMemoryRefreshMock.mockReset();
    requestArchiveSystemMemoryRefreshMock.mockResolvedValue({
      refreshedAt: "unix:11",
      manifestPath: "/tmp/Memory/AI_MEMORY/provenance/system-memory-manifest.json",
      pagesRoot: "/tmp/Memory/AI_MEMORY/system",
      pagesWritten: [],
      sourcesIndexed: 1,
      missingSources: [],
    });
    requestArchiveSearchMock.mockReset();
    requestArchiveSearchMock.mockResolvedValue({
      query: "resonance",
      pages: [] as Array<Record<string, unknown>>,
      sources: [] as Array<Record<string, unknown>>,
    });
    requestArchiveDocumentMock.mockReset();
    requestArchiveDocumentMock.mockResolvedValue({
      path: "WIKI/concepts/resonance.md",
      title: "Resonance",
      docType: "concept",
      frontmatter: {},
      content: "## Definition\nResonance is a core concept.",
    });
    requestArchiveIntakeWriteMock.mockReset();
    requestArchiveIntakeWriteMock.mockResolvedValue({
      actorId: "strategist.core",
      bucket: "chat-insights",
      artifactPath: "/tmp/chat-insights/chat-insight.md",
      metadataPath: "/tmp/chat-insights/chat-insight.md.json",
    });
    requestArchiveIngestRequestMock.mockReset();
    requestArchiveIngestRequestMock.mockResolvedValue({
      requestFile: "/tmp/review-request.json",
      queuedAt: "unix:3",
    });
    requestArchiveReviewQueueMock.mockReset();
    requestArchiveReviewQueueMock.mockResolvedValue([]);
    requestArchiveReviewArtifactsMock.mockReset();
    requestArchiveReviewArtifactsMock.mockResolvedValue([]);
    requestArchiveReviewDecisionMock.mockReset();
    requestArchiveReviewDecisionMock.mockResolvedValue({
      artifactFile: "/tmp/artifacts/review-output.json",
      status: "approved",
      action: "approve",
      actorId: "strategist.core",
      decidedAt: "unix:5",
      tierApplied: "strategist-review",
      summary: "Review artifact created for the queued source.",
    });
    requestArchivePromoteReviewArtifactMock.mockReset();
    requestArchivePromoteReviewArtifactMock.mockResolvedValue({
      artifactFile: "/tmp/artifacts/review-output.json",
      promotedAt: "unix:6",
      actorId: "archive-ingest.core",
      pagesWritten: [
        {
          pageType: "concept",
          pageId: "provider-fabric",
          title: "Provider Fabric",
          filePath: "WIKI/concepts/provider-fabric.md",
          action: "created",
          sourceId: "session-1",
          indexed: true,
          mergeMode: "create-page",
        },
      ],
      skippedPages: [],
    });
    requestArchiveProcessIngestRequestMock.mockReset();
    requestArchiveProcessIngestRequestMock.mockResolvedValue({
      requestFile: "/tmp/review-request.json",
      archivedRequestFile: "/tmp/processed/review-request.json",
      reviewArtifactFile: "/tmp/artifacts/review-output.json",
      summary: "Review artifact created for the queued source.",
      checkedAt: "unix:4",
      reviewArtifact: {
        artifactFile: "/tmp/artifacts/review-output.json",
        checkedAt: "unix:4",
        requestFile: "/tmp/review-request.json",
        sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Transcripts/session-1.md",
        sourceType: "transcript",
        sourceRole: undefined,
        intent: "review-and-ingest",
        providerId: "shared-openai",
        model: "gpt-5.4",
        summary: "Review artifact created for the queued source.",
        confidence: "high",
        doctrineSensitivity: "low",
        recommendedTier: "strategist-review",
        recommendationReason: "Strategist review is the default approval tier for trusted archive promotion.",
        proposedPages: [],
        decision: { status: "pending" },
      },
    });
    requestArchiveTolBundleCandidatesMock.mockReset();
    requestArchiveTolBundleCandidatesMock.mockResolvedValue([]);
    requestArchiveBuildTolBundleMock.mockReset();
    requestArchiveBuildTolBundleMock.mockResolvedValue({
      sessionId: "2026-04-21-1003",
      intakeArtifactPath: "/tmp/tol-bundles/2026-04-21-1003-tol-bundle.json",
      requestFile: "/tmp/review-request.json",
      queuedAt: "unix:8",
      rawAudioPath: "03_TOL/RAW Audio/260421_1003.mp3",
      transcriptPath: "03_TOL/TOL Transcripts/2026-04-21-1003_TOL_Transcript.md",
      analysisPath: "03_TOL/TOL Analysis/2026-04-21-1003_TOL_Analysis.md",
    });
    requestArchiveSourceFolderScanMock.mockReset();
    requestArchiveSourceFolderScanMock.mockResolvedValue({
      scannedAt: "unix:9",
      rootsScanned: 1,
      filesSeen: 0,
      newFiles: 0,
      changedFiles: 0,
      unchangedFiles: 0,
      skippedFiles: 0,
      records: [] as Array<Record<string, unknown>>,
      indexPath: "/tmp/source-watch-index.json",
    });
    requestArchiveLibraryImportMock.mockReset();
    requestArchiveLibraryImportMock.mockResolvedValue({
      importedAt: "unix:10",
      domain: "mixed-library",
      importMode: "copy",
      libraryId: "resonant-os-base",
      libraryName: "RESONANT_OS_BASE",
      originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
      canonicalRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
      filesSeen: 2,
      filesImported: 2,
      skippedFiles: 0,
      manifestPath: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
      versionLedgerPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-version-ledger.jsonl",
      classificationManifestPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
      classificationStatus: "needs-ai-assisted-classification",
      metadataStandard: "obsidian-frontmatter-wikilinks",
      obsidianVaultDetected: false,
      recommendedAddon: "addon.obsidian",
      records: [
        {
          sourceId: "resonant-os-base-notes-identity",
          versionId: "v1",
          originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE/notes/identity.md",
          canonicalPath:
            "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base/notes/identity.md",
          sourceType: "md",
          title: "identity",
          hash: "fnv64:identity",
          sizeBytes: 1024,
        },
      ] as Array<Record<string, unknown>>,
      classificationProposals: [
        {
          sourceId: "resonant-os-base-notes-identity",
          title: "identity",
          canonicalPath:
            "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base/notes/identity.md",
          proposedTarget: "human-knowledge",
          confidence: "medium",
          reason: "Matched human-authored path or title signals.",
          tags: ["ownership/human", "source-type/md", "review/unapproved"],
          wikilinks: ["[[identity]]"],
        },
      ] as Array<Record<string, unknown>>,
    });
    requestArchiveLibraryFolderSelectionMock.mockReset();
    requestArchiveLibraryFolderSelectionMock.mockResolvedValue("/Users/augmentor/Documents/RESONANT_OS_BASE");
    requestLocalRuntimeStatusMock.mockReset();
    requestLocalRuntimeStatusMock.mockResolvedValue({
      available: true,
      targetModel: "batiai/gemma4-e2b:q4",
      recoveryModelInstalled: true,
      recoveryModelRunning: true,
      installedModels: ["batiai/gemma4-e2b:q4"],
      runningModels: ["batiai/gemma4-e2b:q4"],
      ollamaListRaw: "NAME ID SIZE MODIFIED\nbatiai/gemma4-e2b:q4 abc 5 GB now",
      ollamaPsRaw: "NAME ID SIZE PROCESSOR UNTIL\nbatiai/gemma4-e2b:q4 abc 5 GB 100% GPU 4 minutes from now",
    });
    requestEngineerRecoveryTurnMock.mockReset();
    requestEngineerRecoveryTurnMock.mockResolvedValue({
      reply: "Engineer recovery handled this turn through the local tool loop.",
      toolEvents: [
        {
          tool: "local_runtime_status",
          summary: "Ollama available=true, targetInstalled=true, targetRunning=true",
          status: "completed",
        },
      ],
    });
    requestRecoveryRouteCandidatesMock.mockReset();
    requestRecoveryRouteCandidatesMock.mockResolvedValue([
      {
        id: "shared-minimax::node-minimax-cloud",
        providerId: "shared-minimax",
        providerLabel: "Shared MiniMax",
        runtimeNodeId: "node-minimax-cloud",
        runtimeNodeLabel: "MiniMax Cloud Runtime",
        runtimeKind: "cloud",
        model: "MiniMax-M2.7",
        credentialConfigured: true,
        reachable: true,
        promotable: true,
        recommended: true,
        reason: "Route is reachable and stronger than the local recovery floor via MiniMax Cloud Runtime.",
      },
    ]);
    requestProviderDiagnosticsMock.mockReset();
    requestProviderDiagnosticsMock.mockResolvedValue([
      {
        providerId: "shared-minimax",
        providerLabel: "Shared MiniMax",
        providerType: "minimax",
        authMethod: "subscription",
        authTier: "experimental",
        executionAdapter: "cloud-minimax-compatible",
        credentialConfigured: true,
        status: "healthy",
        summary: "Provider credentials are configured and at least one runtime route is reachable.",
        checkedAt: "unix:1",
        primaryModel: "MiniMax-M2.7",
        fallbackModel: "MiniMax-M2.7-highspeed",
        runtimeDiagnostics: [
          {
            runtimeNodeId: "node-minimax-cloud",
            runtimeNodeLabel: "MiniMax Cloud Runtime",
            runtimeKind: "cloud",
            locality: "cloud",
            probeState: "healthy",
            detail: "reachable with HTTP 200",
          },
        ],
      },
      {
        providerId: "shared-openai",
        providerLabel: "Shared OpenAI",
        providerType: "openai",
        authMethod: "subscription",
        authTier: "experimental",
        executionAdapter: "cloud-openai-compatible",
        credentialConfigured: true,
        status: "healthy",
        summary: "Provider credentials are configured and the archive route is reachable.",
        checkedAt: "unix:1",
        primaryModel: "gpt-5.4",
        fallbackModel: "gpt-5.4-mini",
        runtimeDiagnostics: [
          {
            runtimeNodeId: "node-openai-cloud",
            runtimeNodeLabel: "OpenAI Cloud Runtime",
            runtimeKind: "cloud",
            locality: "cloud",
            probeState: "healthy",
            detail: "reachable with HTTP 200",
          },
        ],
      },
    ]);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders the overview with a persistent chat sidebar and accepts a message", async () => {
    render(<App />);

    expect(screen.getByText("Booting the new shell.")).toBeTruthy();
    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText("Message Augmentor").length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "What model are you using?" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(screen.getByText("What model are you using?")).toBeTruthy();
    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
  });

  it("creates an Engineer delegation workspace from explicit Augmentor delegation", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Delegate this provider diagnostic to the Engineer" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText(/I created an Engineer delegation workspace/i)).toBeTruthy();
    expect(await screen.findByText(/TASK.md:/i)).toBeTruthy();
    expect(requestCreateTaskWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(requestProviderServiceChatCompletionMock).not.toHaveBeenCalled();
  });

  it("starts an existing Engineer delegation workspace and writes return artifacts", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "start engineer task workspace-engineer-provider-diagnostic" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText(/The Engineer task ran and the workspace was updated/i)).toBeTruthy();
    expect(await screen.findByText(/Review the result before promoting any changes/i)).toBeTruthy();
    expect(requestReadTaskWorkspaceMock).toHaveBeenCalledWith("workspace-engineer-provider-diagnostic");
    expect(requestEngineerRecoveryTurnMock).toHaveBeenCalledTimes(1);
    expect(requestFinishTaskWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(requestFinishTaskWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-engineer-provider-diagnostic",
        resultMarkdown: expect.stringContaining("Engineer recovery handled this turn"),
        verification: expect.objectContaining({ status: "completed" }),
        auditEvent: expect.objectContaining({ event: "engineer-task-finished" }),
      }),
    );
    expect(requestProviderServiceChatCompletionMock).not.toHaveBeenCalled();
  });

  it("stops an active chat run, keeps an interrupted message, and ignores the late reply", async () => {
    const pendingReply = deferred<string>();
    requestProviderServiceChatCompletionMock.mockReset();
    requestProviderServiceChatCompletionMock
      .mockImplementationOnce(() => pendingReply.promise)
      .mockResolvedValueOnce("Corrected reply after interruption.");

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Start a long reply" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    await waitFor(() => expect(requestProviderServiceChatCompletionMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    expect(await screen.findByText("Response stopped by the user before a complete reply was returned.")).toBeTruthy();
    expect((await screen.findAllByText(/Interrupted/i)).length).toBeGreaterThan(0);

    pendingReply.resolve("Late reply that should not be appended.");
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.queryByText("Late reply that should not be appended.")).toBeNull();

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Correction after stop" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("Corrected reply after interruption.")).toBeTruthy();
  });

  it("renders streaming chat chunks before the final response completes", async () => {
    const continueStream = deferred<void>();
    requestProviderServiceChatCompletionMock.mockReset();
    requestProviderServiceChatCompletionStreamMock.mockImplementationOnce(async (input, onEvent) => {
      onEvent({ runId: input.runId, type: "chunk", content: "Partial " });
      await continueStream.promise;
      onEvent({ runId: input.runId, type: "chunk", content: "streamed reply." });
      onEvent({ runId: input.runId, type: "completed", content: "" });
      return "Partial streamed reply.";
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Stream this reply" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("Partial")).toBeTruthy();
    expect(requestProviderServiceChatCompletionMock).not.toHaveBeenCalled();

    continueStream.resolve();

    expect(await screen.findByText("Partial streamed reply.")).toBeTruthy();
  });

  it("uses non-streaming chat when the selected adapter does not support streaming", async () => {
    const noStreamingState = buildDefaultState(manifests);
    hydrateStateMock.mockResolvedValue({
      ...noStreamingState,
      providerRouting: {
        ...noStreamingState.providerRouting,
        executionAdapters: noStreamingState.providerRouting.executionAdapters.map((adapter) =>
          adapter.id === "cloud-minimax-compatible" ? { ...adapter, supportsStreaming: false, supportsAbort: false } : adapter,
        ),
      },
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Use the non-streaming route" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    expect(requestProviderServiceChatCompletionStreamMock).not.toHaveBeenCalled();
    expect(requestProviderServiceChatCompletionMock).toHaveBeenCalledTimes(1);
  });

  it("shows string backend errors instead of collapsing them into a generic message", async () => {
    requestProviderServiceChatCompletionMock.mockRejectedValue("You exceeded your current quota.");

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect((await screen.findAllByText("You exceeded your current quota.")).length).toBeGreaterThan(0);
  });

  it("injects Living Archive context into Strategist chat turns", async () => {
    requestArchiveSearchMock.mockResolvedValue({
      query: "provider fabric",
      pages: [
        {
          pageId: "provider-fabric",
          title: "Provider Fabric",
          pageType: "concept",
          filePath: "WIKI/concepts/provider-fabric.md",
          stage: "developing",
          updated: "unix:6",
          score: 1,
          snippet: "Provider routing belongs to ResonantOS.",
        },
      ] as Array<Record<string, unknown>>,
      sources: [] as Array<Record<string, unknown>>,
    });
    requestArchiveDocumentMock.mockResolvedValue({
      path: "WIKI/concepts/provider-fabric.md",
      title: "Provider Fabric",
      docType: "concept",
      frontmatter: {},
      content: "Provider routing belongs to ResonantOS and is mediated by the provider fabric.",
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "What does the archive say about provider fabric?" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    expect(requestArchiveSearchMock).toHaveBeenCalledWith("What does the archive say about provider fabric", 6);
    expect(requestArchiveDocumentMock).toHaveBeenCalledWith("WIKI/concepts/provider-fabric.md");
    expect(requestProviderServiceChatCompletionStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Living Archive context retrieved for this turn."),
      }),
      expect.any(Function),
    );
    expect(requestProviderServiceChatCompletionStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Provider routing belongs to ResonantOS"),
      }),
      expect.any(Function),
    );
    expect(await screen.findByText("Archive memory")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Provider Fabric/i })).toBeTruthy();
  });

  it("saves assistant messages to Living Archive intake and queues them for review", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Capture this insight" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    const saveButtons = await screen.findAllByRole("button", { name: "Save message to Living Archive" });
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    expect(await screen.findByText("Saved chat insight to Living Archive intake and queued it for review.")).toBeTruthy();
    expect(requestArchiveIntakeWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "strategist.core",
        bucket: "chat-insights",
        content: expect.stringContaining("This is a live Strategist test reply from MiniMax-M2.7."),
      }),
    );
    expect(requestArchiveIntakeWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Capture this insight"),
      }),
    );
    expect(requestArchiveIngestRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "strategist.core",
        sourcePath: "/tmp/chat-insights/chat-insight.md",
        sourceType: "chat_insight",
        sourceRole: "strategist-chat",
      }),
    );
  });

  it("scrolls the chat rail to the newest message after sending", async () => {
    const scrollIntoViewMock = vi.spyOn(Element.prototype, "scrollIntoView");

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Scroll test" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    expect(scrollIntoViewMock).toHaveBeenCalled();

    scrollIntoViewMock.mockRestore();
  });

  it("renders assistant markdown formatting in chat messages", async () => {
    requestProviderServiceChatCompletionMock.mockResolvedValue(
      "I'm **Augmentor** — the Strategist agent inside ResonantOS.",
    );

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Who are you?" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect((await screen.findAllByText("Augmentor", { selector: "strong" })).length).toBeGreaterThan(0);
  });

  it("shows the chat toolbar controls for files, model, context, and dictation", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    expect(screen.getAllByRole("button", { name: "Attach file" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Start dictation" }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Context usage/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/Heuristic context estimate/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Send message" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "New chat" }).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("MiniMax-M2.7").length).toBeGreaterThan(0);
  });

  it("compacts the active chat context from the context usage control", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Context usage/i })[0]);

    expect(await screen.findByText(/Context compacted\. Preserved/i)).toBeTruthy();
    expect(await screen.findByText(/user intent and rationale/i)).toBeTruthy();
  });

  it("uses compact memory and trimmed recent turns for the next provider request after compaction", async () => {
    const state = buildDefaultState(manifests);
    const longThread = {
      ...state.conversationThreads[0],
      messages: Array.from({ length: 12 }, (_, index) => ({
        id: `thread-main-desktop:m${index + 1}`,
        threadId: "thread-main-desktop",
        channelId: "desktop-main",
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        author: index % 2 === 0 ? "You" : "Augmentor",
        createdAt: `2026-04-25T10:${String(index).padStart(2, "0")}:00.000Z`,
        content:
          index === 0
            ? "For me the why is avoiding AI amnesia during long ResonantOS work."
            : `Historical chat turn ${index + 1}.`,
      })),
    };
    hydrateStateMock.mockResolvedValue({
      ...state,
      conversationThreads: [longThread, ...state.conversationThreads.slice(1)],
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Context usage/i })[0]);
    expect(await screen.findByText(/Context compacted\. Preserved/i)).toBeTruthy();

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Continue after compacting the chat." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    const providerCall = providerStreamInputs().at(-1);
    expect(providerCall?.systemPrompt).toContain("ResonantOS compacted conversation memory:");
    expect(providerCall?.systemPrompt).toContain("avoiding AI amnesia");
    expect(providerCall?.messages.map((message) => message.id)).not.toContain("thread-main-desktop:m1");
    expect(providerCall?.messages.map((message) => message.id)).toContain("thread-main-desktop:m12");
    expect(providerCall?.messages.at(-1)?.content).toBe("Continue after compacting the chat.");
  });

  it("automatically compacts before the provider request when context crosses the threshold", async () => {
    const state = buildDefaultState(manifests);
    hydrateStateMock.mockResolvedValue({
      ...state,
      agents: state.agents.map((agent) =>
        agent.id === "strategist.core"
          ? { ...agent, providerProfileId: "shared-local", fallbackProviderProfileId: undefined }
          : agent,
      ),
      conversationThreads: [
        {
          ...state.conversationThreads[0],
          messages: Array.from({ length: 12 }, (_, index) => ({
            id: `thread-main-desktop:m${index + 1}`,
            threadId: "thread-main-desktop",
            channelId: "desktop-main",
            role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
            author: index % 2 === 0 ? "You" : "Augmentor",
            createdAt: `2026-04-25T12:${String(index).padStart(2, "0")}:00.000Z`,
            content:
              index === 0
                ? `The why is to prove automatic compaction protects long chat continuity. ${"x".repeat(27_000)}`
                : `Auto compaction historical turn ${index + 1}.`,
          })),
        },
        ...state.conversationThreads.slice(1),
      ],
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Send after auto compaction threshold." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText(/automatic compaction threshold/i)).toBeTruthy();
    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    const providerCall = providerStreamInputs().at(-1);
    expect(providerCall?.systemPrompt).toContain("ResonantOS compacted conversation memory:");
    expect(providerCall?.systemPrompt).toContain("automatic compaction protects long chat continuity");
    expect(providerCall?.messages.map((message) => message.id)).not.toContain("thread-main-desktop:m1");
    expect(providerCall?.messages.at(-1)?.content).toBe("Send after auto compaction threshold.");
  });

  it("carries compact memory into a branched chat before the next provider request", async () => {
    const state = buildDefaultState(manifests);
    const compactedThread = {
      ...state.conversationThreads[0],
      messages: Array.from({ length: 10 }, (_, index) => ({
        id: `thread-main-desktop:m${index + 1}`,
        threadId: "thread-main-desktop",
        channelId: "desktop-main",
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        author: index % 2 === 0 ? "You" : "Augmentor",
        createdAt: `2026-04-25T11:${String(index).padStart(2, "0")}:00.000Z`,
        content:
          index === 0
            ? "The branch must keep the why: avoid amnesia when exploring alternatives."
            : `Branchable historical turn ${index + 1}.`,
      })),
    };
    hydrateStateMock.mockResolvedValue({
      ...state,
      conversationThreads: [compactedThread, ...state.conversationThreads.slice(1)],
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Context usage/i })[0]);
    expect(await screen.findByText(/Context compacted\. Preserved/i)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Chat options" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Branch/i }));
    expect(await screen.findByText("Desktop Main Thread fork")).toBeTruthy();

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Continue from this branched compacted thread." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    const providerCall = providerStreamInputs().at(-1);
    expect(providerCall?.systemPrompt).toContain("ResonantOS compacted conversation memory:");
    expect(providerCall?.systemPrompt).toContain("avoid amnesia when exploring alternatives");
    expect(providerCall?.messages.at(-1)?.threadId).toMatch(/^thread-fork-/);
    expect(providerCall?.messages.at(-1)?.content).toBe("Continue from this branched compacted thread.");
  });

  it("creates a new Strategist chat instance from the sidebar", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "New chat" })[0]);

    expect(screen.getByText("New chat 3")).toBeTruthy();
  });

  it("opens chat history actions for pinning, branching, and deleting chats", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Chat options" })[0]);
    expect(screen.getByRole("menuitem", { name: /Unpin/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Branch/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Delete/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: /Branch/i }));
    expect(screen.getByText("Desktop Main Thread fork")).toBeTruthy();
  });

  it("switches the chat rail between available core agents", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Talk with Resonant Engineer Agent" }));

    expect(screen.getByPlaceholderText("Message Resonant Engineer Agent")).toBeTruthy();
    expect(screen.getByText("Emergency Recovery")).toBeTruthy();
    expect(screen.queryByText(/Recovery mode is active/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Resurrect Local" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Talk with Hermes/i })).toBeNull();
  });

  it("shows provider diagnostics in settings", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Settings/i })[0]);

    expect(await screen.findByText("Provider diagnostics")).toBeTruthy();
    expect((await screen.findAllByText("MiniMax Cloud Runtime")).length).toBeGreaterThan(0);
    expect(requestProviderDiagnosticsMock).toHaveBeenCalled();
  });

  it("runs the archive ingest probe through the archive workload route", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Run Ingest Probe" }));

    expect(await screen.findByText(/Probe route healthy/i)).toBeTruthy();
    expect(requestArchiveIngestProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "shared-openai",
        runtimeNodeId: "node-openai-cloud",
        model: "gpt-5.4",
        sourceLabel: "Synthetic Living Archive Intake Probe",
      }),
    );
  });

  it("loads the real archive runtime surface and can search it", async () => {
    requestArchiveSearchMock.mockResolvedValue({
      query: "resonance",
      pages: [
        {
          pageId: "resonance",
          title: "Resonance",
          pageType: "concept",
          filePath: "WIKI/concepts/resonance.md",
          stage: "developing",
          updated: "2026-04-23T09:00:00Z",
          score: 1,
          snippet: "Resonance is a core concept in the archive.",
        },
      ] as Array<Record<string, unknown>>,
      sources: [] as Array<Record<string, unknown>>,
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);

    expect(await screen.findByText("Archive online")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search the Living Archive"), {
      target: { value: "resonance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Resonance")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open page" }));
    expect(await screen.findByText(/Resonance is a core concept/i)).toBeTruthy();
    expect(requestArchiveSearchMock).toHaveBeenCalledWith("resonance");
    expect(requestArchiveDocumentMock).toHaveBeenCalledWith("WIKI/concepts/resonance.md");
  });

  it("imports a user folder into the managed Living Archive memory domains", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Choose folder or vault path" }));
    expect(await screen.findByText("/Users/augmentor/Documents/RESONANT_OS_BASE")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Library name"), {
      target: { value: "RESONANT_OS_BASE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Library" }));

    expect(await screen.findByText("Imported 2 file(s) into RESONANT_OS_BASE. Managed location is now canonical.")).toBeTruthy();
    expect(await screen.findByText("Latest imported library")).toBeTruthy();
    expect(await screen.findByText("Classification review")).toBeTruthy();
    expect(await screen.findByText("human-knowledge")).toBeTruthy();
    expect(await screen.findByText("ownership/human")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve Classification Plan" }));
    expect(await screen.findByText(/Classification plan approved/i)).toBeTruthy();
    expect(requestArchiveLibraryImportMock).toHaveBeenCalledWith({
      sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
      domain: "mixed-library",
      importMode: "copy",
      libraryName: "RESONANT_OS_BASE",
      actorId: "strategist.core",
    });
  });

  it("uses the native folder picker to fill the library import path", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Choose folder or vault path" }));

    expect(await screen.findByText("/Users/augmentor/Documents/RESONANT_OS_BASE")).toBeTruthy();
    expect(requestArchiveLibraryFolderSelectionMock).toHaveBeenCalled();
  });

  it("queues and processes a review request from a tracked archive source", async () => {
    const pendingArtifact = {
      artifactFile: "/tmp/artifacts/review-output.json",
      checkedAt: "unix:4",
      requestFile: "/tmp/review-request.json",
      sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Transcripts/session-1.md",
      sourceType: "transcript",
      sourceRole: undefined,
      intent: "review-and-ingest",
      providerId: "shared-openai",
      model: "gpt-5.4",
      summary: "Review artifact created for the queued source.",
      confidence: "high",
      doctrineSensitivity: "low",
      recommendedTier: "strategist-review",
      recommendationReason: "Strategist review is the default approval tier for trusted archive promotion.",
      proposedPages: [],
      decision: { status: "pending" },
    };
    requestArchiveSearchMock.mockResolvedValue({
      query: "transcript",
      pages: [] as Array<Record<string, unknown>>,
      sources: [
        {
          sourceId: "tol-source-1",
          title: "TOL Transcript 1",
          sourceType: "transcript",
          rawPath: "03_TOL/TOL Transcripts/session-1.md",
          processed: false,
        },
      ] as Array<Record<string, unknown>>,
    });
    requestArchiveReviewQueueMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          requestFile: "/tmp/review-request.json",
          queuedAt: "unix:3",
          actorId: "strategist.core",
          sourcePath: "03_TOL/TOL Transcripts/session-1.md",
          sourceType: "transcript",
          sourceRole: undefined,
          intent: "review-and-ingest",
          sourceExists: true,
        },
      ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.change(screen.getByPlaceholderText("Search the Living Archive"), {
      target: { value: "transcript" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("TOL Transcript 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Queue ingest" }));

    expect(await screen.findByText("Queued TOL Transcript 1 for Living Archive ingest review.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Process Request" })).toBeTruthy();
    expect(requestArchiveIngestRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "strategist.core",
        sourcePath: "03_TOL/TOL Transcripts/session-1.md",
        sourceType: "transcript",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Process Request" }));
    expect(await screen.findByText("Review artifact created for the queued source.")).toBeTruthy();
    expect(requestArchiveProcessIngestRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestFile: "/tmp/review-request.json",
        providerId: "shared-openai",
        runtimeNodeId: "node-openai-cloud",
        model: "gpt-5.4",
      }),
    );
  });

  it("scans source folders and queues a changed watched source for review", async () => {
    requestArchiveSourceFolderScanMock.mockResolvedValue({
      scannedAt: "unix:9",
      rootsScanned: 1,
      filesSeen: 2,
      newFiles: 1,
      changedFiles: 1,
      unchangedFiles: 0,
      skippedFiles: 0,
      indexPath: "/tmp/source-watch-index.json",
      records: [
        {
          path: "RAW/Sources/Articles/new-note.md",
          absolutePath: "/vault/RAW/Sources/Articles/new-note.md",
          rootRole: "raw_sources",
          rootSubtype: "article",
          sourceType: "article",
          title: "new-note",
          hash: "fnv64:new",
          sizeBytes: 2048,
          modifiedAt: "unix:9",
          status: "new",
          indexedInDb: true,
        },
        {
          path: "RAW/Sources/Articles/changed-note.md",
          absolutePath: "/vault/RAW/Sources/Articles/changed-note.md",
          rootRole: "raw_sources",
          rootSubtype: "article",
          sourceType: "article",
          title: "changed-note",
          hash: "fnv64:changed",
          previousHash: "fnv64:old",
          sizeBytes: 1024,
          modifiedAt: "unix:9",
          status: "changed",
          indexedInDb: true,
        },
      ] as Array<Record<string, unknown>>,
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.change(await screen.findByLabelText("Select source folder"), {
      target: { value: "03_TOL/TOL Analysis" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Scan Source Folder" }));

    expect(await screen.findByText("new-note")).toBeTruthy();
    expect(await screen.findByText("changed-note")).toBeTruthy();
    expect(requestArchiveSourceFolderScanMock).toHaveBeenCalledWith("03_TOL/TOL Analysis");

    fireEvent.click(screen.getAllByRole("button", { name: "Queue For Review" })[0]);

    expect(await screen.findByText("Queued new-note for Living Archive ingest review.")).toBeTruthy();
    expect(requestArchiveIngestRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "strategist.core",
        sourcePath: "RAW/Sources/Articles/new-note.md",
        sourceType: "article",
        sourceRole: "article",
        intent: "review-and-ingest",
      }),
    );
  });

  it("detects Audio2TOL bundles and queues a structured TOL bundle for review", async () => {
    const state = buildDefaultState(manifests);
    state.installations["addon.audio2tol"] = {
      ...state.installations["addon.audio2tol"],
      installed: true,
      enabled: true,
      status: "enabled",
    };
    hydrateStateMock.mockResolvedValueOnce(state);
    requestArchiveTolBundleCandidatesMock.mockResolvedValue([
      {
        sessionId: "2026-04-21-1003",
        rawAudioPath: "03_TOL/RAW Audio/260421_1003.mp3",
        transcriptPath: "03_TOL/TOL Transcripts/2026-04-21-1003_TOL_Transcript.md",
        analysisPath: "03_TOL/TOL Analysis/2026-04-21-1003_TOL_Analysis.md",
        date: "2026-04-21",
        time: "1003",
        summary: "Taste is navigation through resonance.",
        status: "bundle-ready",
        strategicActionsCount: 3,
        explicitDirectivesCount: 4,
      },
    ] as Array<Record<string, unknown>>);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Detect TOL Bundles" }));

    expect(await screen.findByText("2026-04-21-1003")).toBeTruthy();
    expect(await screen.findByText("Taste is navigation through resonance.")).toBeTruthy();
    expect(await screen.findByText("4 human directive(s) · 3 AI-proposed strategic action(s).")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Queue TOL Bundle" }));

    expect(await screen.findByText("Queued TOL bundle 2026-04-21-1003 for Living Archive ingest review.")).toBeTruthy();
    expect(requestArchiveBuildTolBundleMock).toHaveBeenCalledWith({
      sessionId: "2026-04-21-1003",
      actorId: "strategist.core",
    });
  });

  it("promotes only approved archive review artifacts into the trusted wiki path", async () => {
    requestArchiveReviewArtifactsMock.mockResolvedValue([
      {
        artifactFile: "/tmp/artifacts/review-output.json",
        checkedAt: "unix:4",
        requestFile: "/tmp/review-request.json",
        sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Transcripts/session-1.md",
        sourceType: "transcript",
        sourceRole: undefined,
        intent: "review-and-ingest",
        providerId: "shared-openai",
        model: "gpt-5.4",
        summary: "Approved concept promotion ready.",
        confidence: "high",
        doctrineSensitivity: "low",
        recommendedTier: "strategist-review",
        recommendationReason: "Strategist review is the default approval tier for trusted archive promotion.",
        proposedPages: [
          {
            type: "concept",
            title: "Provider Fabric",
            content: "Routing belongs to ResonantOS.",
          },
        ],
        decision: {
          status: "approved",
          action: "approve",
          actorId: "strategist.core",
          decidedAt: "unix:5",
          tierApplied: "strategist-review",
        },
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh Queue" }));
    expect(await screen.findByText("Approved concept promotion ready.")).toBeTruthy();
    expect(await screen.findByText("Proposed knowledge pages")).toBeTruthy();
    expect(await screen.findByText("Routing belongs to ResonantOS.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Promote to Wiki" }));

    expect(await screen.findByText("Promoted 1 approved page(s) to the trusted wiki.")).toBeTruthy();
    expect(await screen.findByText("Latest trusted wiki promotion")).toBeTruthy();
    expect(await screen.findByText("created · concept · create-page · WIKI/concepts/provider-fabric.md · indexed")).toBeTruthy();
    expect(requestArchivePromoteReviewArtifactMock).toHaveBeenCalledWith({
      artifactFile: "/tmp/artifacts/review-output.json",
      actorId: "archive-ingest.core",
    });
  });

  it("pins Strategist to the local resurrect runtime when recovery mode is enabled", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Resurrect Local" })[0]);
    expect(screen.getAllByText(/Recovery mode is active/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Resonant Engineer Agent").length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByPlaceholderText("Message Resonant Engineer Agent")[0], {
      target: { value: "Use the local route" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("Engineer recovery handled this turn through the local tool loop.")).toBeTruthy();
    expect(requestEngineerRecoveryTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "shared-local",
        runtimeNodeKind: "local",
        model: "batiai/gemma4-e2b:q4",
        systemPrompt: expect.stringContaining("Current active model for this reply: batiai/gemma4-e2b:q4."),
      }),
    );
    expect(requestProviderServiceChatCompletionMock).not.toHaveBeenCalled();
    expect(requestLocalRuntimeStatusMock).toHaveBeenCalledWith("batiai/gemma4-e2b:q4");
    expect(requestRecoveryRouteCandidatesMock).toHaveBeenCalled();
    expect(screen.getByText("Recovery floor")).toBeTruthy();
    expect(screen.getByText("Better Brain Candidates")).toBeTruthy();
    expect(screen.getAllByText("Shared MiniMax").length).toBeGreaterThan(0);
    expect(screen.getByText(/installed .* already loaded/i)).toBeTruthy();
    expect(screen.getAllByText("batiai/gemma4-e2b:q4").length).toBeGreaterThan(0);
    expect(screen.getByText(/Engineer tools used:/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    expect(screen.getByText("Promoted recovery to Shared MiniMax on MiniMax-M2.7.")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByDisplayValue("MiniMax-M2.7").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getAllByPlaceholderText("Message Resonant Engineer Agent")[0], {
      target: { value: "Run the next phase on the stronger route" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    await waitFor(() => {
      expect(requestEngineerRecoveryTurnMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          providerId: "shared-minimax",
          runtimeNodeKind: "cloud",
          model: "MiniMax-M2.7",
        }),
      );
    });
  });
});

function createManifest(id: string, name: string, category: AddOnCategory): AddOnManifest {
  return {
    id,
    name,
    version: "0.1.0",
    author: "test",
    category,
    description: `${name} manifest`,
    runtimeType: "local-service",
    surfaces: [],
    requestedCapabilities: [],
    providerRequirements: {
      sharedProfiles: [],
      supportsPrivateCredentials: false,
    },
    archiveIntegration: {
      readScopes: [],
      intakeWriteScopes: [],
      canRequestIngest: false,
      canWriteKnowledgePages: false,
    },
    health: {
      strategy: "none",
    },
    installHooks: {},
    compatibility: {
      shellVersion: "^0.1.0",
      platforms: ["macOS"],
    },
  };
}
