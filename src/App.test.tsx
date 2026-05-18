// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddOnCategory,
  AddOnManifest,
  ArchiveAiMemoryBuildJobSummary,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ConversationMessage,
  ProviderProfile,
  ResonantShellState,
} from "./core/contracts";
import { buildDefaultState } from "./core/defaults";

const manifests: AddOnManifest[] = [
  createManifest("addon.telegram-channel", "Telegram Channel", "channel"),
  createManifest("addon.obsidian", "Resonant Notes", "knowledge"),
  createBrowserManifest(),
  createOpenCodeManifest(),
  createPaperclipManifest(),
  createManifest("addon.audio2tol", "Audio2TOL", "tool"),
  createManifest("addon.openclaw", "OpenClaw", "agent"),
];

const {
  hydrateStateMock,
  requestProviderServiceChatCompletionMock,
  requestProviderServiceChatCompletionStreamMock,
  abortProviderServiceChatCompletionMock,
  requestCreateTaskWorkspaceMock,
  requestListTaskWorkspacesMock,
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
  requestArchiveMaintenanceCycleMock,
  requestArchiveLintMock,
  requestArchiveSemanticLintMock,
  requestArchiveBackgroundCycleMock,
  requestArchiveTolBundleCandidatesMock,
  requestArchiveBuildTolBundleMock,
  requestArchiveSourceFolderScanMock,
  requestArchiveLibraryImportMock,
  requestArchiveLibraryPreflightMock,
  requestArchiveImportedLibrariesMock,
  requestArchiveLibraryClassificationReviewMock,
  requestArchiveLibraryReorganisationPlanMock,
  requestArchiveQueueImportedLibraryIngestMock,
  requestArchiveAiMemoryBuildJobMock,
  requestArchiveAiMemoryBuildJobsMock,
  requestArchiveLibraryFolderSelectionMock,
  requestObsidianVaultFolderSelectionMock,
  requestObsidianVaultStatusMock,
  requestObsidianNoteListMock,
  requestObsidianNoteMock,
  requestObsidianOpenNoteMock,
  requestObsidianWriteNoteMock,
  requestObsidianCreateNoteMock,
  requestObsidianCreateFolderMock,
  requestObsidianMoveNoteMock,
  requestObsidianArchiveNoteMock,
  requestObsidianVaultIndexMock,
  requestOpenCodeWorkspaceFolderSelectionMock,
  requestOpenCodeStatusMock,
  requestOpenCodeStartServiceMock,
  requestOpenCodeStopServiceMock,
  requestPaperclipStatusMock,
  requestPaperclipStartServiceMock,
  requestPaperclipStopServiceMock,
  requestPaperclipDashboardSnapshotMock,
  requestPaperclipCreateIssueFromDelegationMock,
  requestBrowserEngineStatusMock,
  requestBrowserInstallEngineMock,
  requestBrowserOpenUrlMock,
  requestBrowserStartSessionMock,
  requestBrowserSessionOpenUrlMock,
  requestBrowserSessionScreenshotMock,
  requestBrowserSessionReadPageMock,
  requestBrowserSessionClickMock,
  requestBrowserSessionScrollMock,
  requestBrowserCloseSessionMock,
  requestBrowserNativeWebviewShowMock,
  requestBrowserNativeWebviewResizeMock,
  requestBrowserNativeWebviewHideMock,
  requestNativeBrowserProbeMock,
  requestNativeBrowserAttachSmokeMock,
  requestNativeBrowserBridgeProbeMock,
  requestBrowserVisibleHostCommandMock,
  requestBrowserExtensionFolderSelectionMock,
  createDesktopBrowserToolRunnerMock,
  browserToolRunMock,
  requestLocalRuntimeStatusMock,
  requestEngineerRecoveryTurnMock,
  requestRecoveryRouteCandidatesMock,
  requestProviderDiagnosticsMock,
  requestProviderSetupProbeMock,
  requestProviderSmokeTestMock,
  requestLivingArchiveMemoryServiceStatusMock,
  requestLivingArchiveMemoryServiceStartMock,
  requestLivingArchiveMemoryServiceStopMock,
  openFloatingChatWindowMock,
  persistStateMock,
} = vi.hoisted(() => {
  const browserToolRunMock = vi.fn();
  return {
  hydrateStateMock: vi.fn(),
  requestProviderServiceChatCompletionMock: vi.fn(async (_input?: unknown) => "This is a live Strategist test reply from MiniMax-M2.7."),
  requestProviderServiceChatCompletionStreamMock: vi.fn(async (_input, onEvent) => {
    const reply = await requestProviderServiceChatCompletionMock(_input);
    onEvent({ runId: _input.runId, type: "chunk", content: reply });
    onEvent({
      runId: _input.runId,
      type: "usage",
      content: JSON.stringify({
        providerId: _input.providerId,
        model: _input.model,
        source: "provider",
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        durationMs: 2200,
        tokensPerSecond: 13.6,
      }),
    });
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
  requestListTaskWorkspacesMock: vi.fn(async () => [
    {
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
  ]),
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
    resultMarkdown: "# Delegation Result\n\nEngineer recovery handled this turn through the local tool loop.",
    verification: { status: "completed", checks: [{ id: "engineer-task-run", status: "passed" }] },
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
    portableUserState: {
      rootPath: "/Users/augmentor/Documents/ResonantOS_User",
      manifestPath: "/Users/augmentor/Documents/ResonantOS_User/Config/portable-state-manifest.json",
      memoryRoot: "/Users/augmentor/Documents/ResonantOS_User/Memory",
      configRoot: "/Users/augmentor/Documents/ResonantOS_User/Config",
      secretsRoot: "/Users/augmentor/Documents/ResonantOS_User/Secrets",
      walletsRoot: "/Users/augmentor/Documents/ResonantOS_User/Wallets",
      logsRoot: "/Users/augmentor/Documents/ResonantOS_User/Logs",
      backupsRoot: "/Users/augmentor/Documents/ResonantOS_User/Backups",
      source: "documents-default",
      initialized: true,
    },
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
  requestArchiveMaintenanceCycleMock: vi.fn(async () => ({
    startedAt: "unix:11",
    finishedAt: "unix:12",
    processed: [],
    promoted: [],
    navigation: {
      refreshedAt: "unix:12",
      indexPath: "/tmp/wiki/index.md",
      logPath: "/tmp/wiki/log.md",
      pagesIndexed: 0,
      activityEntries: 0,
    },
    lint: {
      checkedAt: "unix:12",
      reportPath: "/tmp/review/lint/unix-12-lint-report.md",
      pagesChecked: 0,
      sourcesChecked: 0,
      findings: [],
    },
    skipped: [],
    errors: [],
  })),
  requestArchiveBackgroundCycleMock: vi.fn(async () => ({
    startedAt: "unix:11",
    finishedAt: "unix:12",
    scan: {
      scannedAt: "unix:9",
      rootsScanned: 1,
      filesSeen: 0,
      newFiles: 0,
      changedFiles: 0,
      unchangedFiles: 0,
      skippedFiles: 0,
      records: [] as Array<Record<string, unknown>>,
      indexPath: "/tmp/source-watch-index.json",
    },
    queuedRequestFiles: [],
    skippedQueueSources: [],
    maintenance: {
      startedAt: "unix:11",
      finishedAt: "unix:12",
      processed: [],
      promoted: [],
      navigation: {
        refreshedAt: "unix:12",
        indexPath: "/tmp/wiki/index.md",
        logPath: "/tmp/wiki/log.md",
        pagesIndexed: 0,
        activityEntries: 0,
      },
      lint: {
        checkedAt: "unix:12",
        reportPath: "/tmp/review/lint/unix-12-lint-report.md",
        pagesChecked: 0,
        sourcesChecked: 0,
        findings: [],
      },
      skipped: [],
      errors: [],
    },
  })),
  requestArchiveLintMock: vi.fn(async () => ({
    checkedAt: "unix:13",
    reportPath: "/tmp/review/lint/unix-13-lint-report.md",
    pagesChecked: 0,
    sourcesChecked: 0,
    findings: [],
  })),
  requestArchiveSemanticLintMock: vi.fn(async () => ({
    checkedAt: "unix:14",
    reportPath: "/tmp/review/lint/semantic/unix-14-semantic-lint-report.md",
    providerId: "shared-openai",
    model: "gpt-5.4",
    sourceLintReportPath: "/tmp/review/lint/unix-13-lint-report.md",
    candidatesReviewed: 0,
    findings: [],
    summary: "No contradiction candidates were identified.",
    repairRequestFiles: [],
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
  requestArchiveLibraryPreflightMock: vi.fn(async () => ({
    sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
    exists: true,
    isDirectory: true,
    obsidianVaultDetected: false,
    supportedFiles: 2,
    skippedFiles: 1,
    hiddenEntriesSkipped: 0,
    generatedArchiveEntriesSkipped: 0,
    estimatedImportBytes: 4096,
    estimatedManagedStorageBytes: 8192,
    supportedByExtension: [{ label: "md", count: 2, sizeBytes: 4096 }],
    skippedByExtension: [{ label: "png", count: 1, sizeBytes: 512 }],
    supportedByTopFolder: [{ label: "notes", count: 2, sizeBytes: 4096 }],
    skippedByTopFolder: [{ label: "Wordpress Post Backup", count: 1, sizeBytes: 512 }],
    warnings: [
      {
        severity: "warning",
        title: "Noisy technical folder: Wordpress Post Backup",
        detail: "1 skipped file(s) were found under this folder.",
      },
    ],
    samples: [{ path: "/Users/augmentor/Documents/RESONANT_OS_BASE/image.png", reason: "unsupported .png" }],
    recommendedPlan: {
      summary: "Import 2 supported file(s). 1 unsupported or generated file(s) will stay out of Living Archive memory.",
      recommendedAction: "import-recommended-plan",
      autoExcludedTopFolders: ["venv"],
      ambiguousTopFolders: ["Wordpress Post Backup"],
      includedTopFolders: ["notes"],
      approvalNote:
        "Augmentor can explain this plan. The user approves one recommended import action; technical exclusions are handled by ResonantOS.",
    },
  })),
  requestArchiveImportedLibrariesMock: vi.fn(async () => [] as Array<Record<string, unknown>>),
  requestArchiveQueueImportedLibraryIngestMock: vi.fn(async () => ({
    manifestPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
    libraryName: "RESONANT_OS_BASE",
    recordsSeen: 2,
    queued: 1,
    skippedExistingQueue: 0,
    skippedProcessed: 0,
    skippedUnsupported: 1,
    skippedMissing: 0,
    requestFiles: ["/tmp/review/request-identity.json"],
  })),
  requestArchiveAiMemoryBuildJobMock: vi.fn(async () => ({
    jobId: "resonant-os-base-unix-10",
    jobFile: "/tmp/review/jobs/resonant-os-base-unix-10.json",
    status: "running",
    libraryName: "RESONANT_OS_BASE",
    manifestPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
    recordsSeen: 2,
    queuedThisRun: 1,
    skippedExistingQueue: 0,
    skippedProcessed: 0,
    skippedUnsupported: 1,
    skippedMissing: 0,
    processedThisRun: 1,
    promotedThisRun: 1,
    queueRemaining: 1,
    reviewPending: 0,
    reviewApproved: 0,
    reviewEscalated: 0,
    reviewRejected: 0,
    errors: [],
    nextAction: "Continue the AI Memory build to process the remaining queued sources.",
    maintenance: {
      startedAt: "unix:11",
      finishedAt: "unix:12",
      processed: [],
      promoted: [],
      navigation: {
        refreshedAt: "unix:12",
        indexPath: "/tmp/wiki/index.md",
        logPath: "/tmp/wiki/log.md",
        pagesIndexed: 1,
        activityEntries: 1,
      },
      lint: {
        checkedAt: "unix:12",
        reportPath: "/tmp/review/lint/unix-12-lint-report.md",
        pagesChecked: 1,
        sourcesChecked: 1,
        findings: [],
      },
      skipped: [],
      errors: [],
    },
  })),
  requestArchiveAiMemoryBuildJobsMock: vi.fn<() => Promise<ArchiveAiMemoryBuildJobSummary[]>>(async () => []),
  requestArchiveLibraryClassificationReviewMock: vi.fn(async () => ({
    artifactType: "library-classification-review",
    createdAt: "unix:10",
    actorId: "strategist.core",
    libraryId: "resonant-os-base",
    libraryName: "RESONANT_OS_BASE",
    originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
    canonicalRoot: "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
    classificationStatus: "needs-ai-assisted-classification",
    metadataStandard: "obsidian-frontmatter-wikilinks",
    structuralChangesAllowed: false,
    requiresHumanApprovalBeforeMove: true,
    recordsTotal: 2,
    proposalsPreviewed: 1,
    remainingForFullReview: 1,
    manifestPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
    proposals: [
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
  requestArchiveLibraryReorganisationPlanMock: vi.fn(async () => ({
    plannedAt: "unix:11",
    actorId: "strategist.core",
    libraryId: "resonant-os-base",
    libraryName: "RESONANT_OS_BASE",
    planPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-reorganisation-plan.json",
    rollbackPlanPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-rollback-plan.json",
    auditLogPath:
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-reorganisation-audit.jsonl",
    requiresApproval: true,
    structuralChangesAllowed: false,
    movesPlanned: 1,
    tagOnlyCount: 0,
    blockedCount: 1,
    entries: [
      {
        sourceId: "resonant-os-base-notes-identity",
        title: "identity",
        proposedTarget: "human-knowledge",
        sourcePath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base/notes/identity.md",
        destinationPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/HUMAN_KNOWLEDGE/sources/resonant-os-base/notes/identity.md",
        action: "propose-move-after-approval",
        confidence: "medium",
        reason: "Matched human-authored path or title signals.",
      },
    ] as Array<Record<string, unknown>>,
  })),
  requestArchiveLibraryFolderSelectionMock: vi.fn(async () => "/Users/augmentor/Documents/RESONANT_OS_BASE"),
  requestObsidianVaultFolderSelectionMock: vi.fn(async () => "/Users/augmentor/Documents/ResonantVault"),
  requestObsidianVaultStatusMock: vi.fn(async () => ({
    vaultPath: "/Users/augmentor/Documents/ResonantVault",
    exists: true,
    isDirectory: true,
    obsidianConfigDetected: true,
    markdownFiles: 1,
    warnings: [] as string[],
  })),
  requestObsidianNoteListMock: vi.fn(async () => [
    {
      title: "Architecture Note",
      relativePath: "Architecture Note.md",
      sizeBytes: 42,
      modifiedAt: "unix:12",
    },
  ]),
  requestObsidianNoteMock: vi.fn(async () => ({
    title: "Architecture Note",
    relativePath: "Architecture Note.md",
    content: "# Architecture Note\nResonantOS note preview.",
    sizeBytes: 42,
    modifiedAt: "unix:12",
  })),
  requestObsidianOpenNoteMock: vi.fn(async (_vaultPath: string, notePath: string) => ({
    openedUrl: "obsidian://open?path=%2FUsers%2Faugmentor%2FDocuments%2FResonantVault%2FArchitecture%20Note.md",
    absolutePath: "/Users/augmentor/Documents/ResonantVault/Architecture Note.md",
    notePath,
  })),
  requestObsidianWriteNoteMock: vi.fn(async (input: { notePath: string; content: string; expectedModifiedAt?: string }) => ({
    notePath: input.notePath,
    title: "Architecture Note",
    sizeBytes: input.content.length,
    previousModifiedAt: input.expectedModifiedAt,
    modifiedAt: "unix:14",
    versionPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-versions/Architecture Note.1.md",
    auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/1-write-note.json",
  })),
  requestObsidianCreateNoteMock: vi.fn(async (input: { notePath: string; content?: string }) => ({
    operation: "create-note",
    notePath: input.notePath,
    title: input.notePath.replace(/\.md$/i, "").split("/").at(-1) ?? "Untitled",
    sizeBytes: input.content?.length ?? 0,
    modifiedAt: "unix:15",
    auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/2-create-note.json",
  })),
  requestObsidianCreateFolderMock: vi.fn(async (input: { folderPath: string }) => ({
    operation: "create-folder",
    folderPath: input.folderPath,
    auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/3-create-folder.json",
  })),
  requestObsidianMoveNoteMock: vi.fn(async (input: { fromNotePath: string; toNotePath: string }) => ({
    operation: "move-note",
    previousNotePath: input.fromNotePath,
    notePath: input.toNotePath,
    title: input.toNotePath.replace(/\.md$/i, "").split("/").at(-1) ?? "Untitled",
    sizeBytes: 42,
    modifiedAt: "unix:16",
    versionPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-versions/Architecture Note.2.md",
    auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/4-move-note.json",
  })),
  requestObsidianArchiveNoteMock: vi.fn(async (input: { notePath: string }) => ({
    operation: "archive-note",
    previousNotePath: input.notePath,
    archivedPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-trash/1/Architecture Note.md",
    auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/5-archive-note.json",
  })),
  requestObsidianVaultIndexMock: vi.fn(async (_vaultPath: string, query = "") => ({
    vaultPath: "/Users/augmentor/Documents/ResonantVault",
    noteCount: 2,
    query: query || undefined,
    notes: [
      {
        title: "Architecture Note",
        relativePath: "Architecture Note.md",
        sizeBytes: 42,
        modifiedAt: "unix:12",
        tags: ["#resonance/system"],
        wikilinks: ["Living Archive"],
        backlinks: [
          {
            sourcePath: "Research Note.md",
            sourceTitle: "Research Note",
          },
        ],
        excerpt: "Links to [[Living Archive]] #resonance/system",
      },
      {
        title: "Research Note",
        relativePath: "Research Note.md",
        sizeBytes: 88,
        modifiedAt: "unix:13",
        tags: ["#archive"],
        wikilinks: ["Architecture Note"],
        backlinks: [],
        excerpt: "Research links to [[Architecture Note]].",
      },
    ].filter((note) => !query || JSON.stringify(note).toLowerCase().includes(query.toLowerCase())),
  })),
  requestOpenCodeWorkspaceFolderSelectionMock: vi.fn(async () => "/Users/augmentor/Documents/ResonantVault"),
  requestOpenCodeStatusMock: vi.fn(async () => ({
    installed: false,
    version: null,
    binaryPath: null,
    installHint: "Install OpenCode with npm install -g opencode-ai.",
    supportsWebUi: true,
    supportsServerApi: true,
  })),
  requestOpenCodeStartServiceMock: vi.fn(async () => ({
    sessionId: "opencode-main",
    workspacePath: "/Users/augmentor/Documents/ResonantVault",
    mode: "web",
    apiBaseUrl: "http://127.0.0.1:4096",
    webUrl: "http://127.0.0.1:4096",
    command: "opencode web --hostname 127.0.0.1 --port 4096",
    pid: 42,
    alreadyRunning: false,
  })),
  requestOpenCodeStopServiceMock: vi.fn(async () => ({
    sessionId: "opencode-main",
    workspacePath: "/Users/augmentor/Documents/ResonantVault",
    mode: "web",
    apiBaseUrl: "http://127.0.0.1:4096",
    webUrl: "http://127.0.0.1:4096",
    command: "opencode web --hostname 127.0.0.1 --port 4096",
    pid: 42,
    alreadyRunning: false,
  })),
  requestPaperclipStatusMock: vi.fn(async () => ({
    installed: true,
    version: null,
    binaryPath: "/usr/local/bin/npx",
    endpoint: "http://127.0.0.1:3100",
    endpointReachable: false,
    installHint: "Start Paperclip with npx paperclipai onboard --yes.",
    supportsWebUi: true,
    supportsServerApi: true,
    managedLaunchAvailable: false,
  })),
  requestPaperclipStartServiceMock: vi.fn(async () => ({
    sessionId: "paperclip-main",
    endpoint: "http://127.0.0.1:3100",
    apiBaseUrl: "http://127.0.0.1:3100",
    webUrl: "http://127.0.0.1:3100",
    command: "connect to existing local Paperclip endpoint",
    pid: null as number | null,
    alreadyRunning: false,
  })),
  requestPaperclipStopServiceMock: vi.fn(async () => ({
    sessionId: "paperclip-main",
    endpoint: "http://127.0.0.1:3100",
    apiBaseUrl: "http://127.0.0.1:3100",
    webUrl: "http://127.0.0.1:3100",
    command: "connect to existing local Paperclip endpoint",
    pid: null as number | null,
    alreadyRunning: false,
  })),
  requestPaperclipDashboardSnapshotMock: vi.fn(async () => ({
    endpoint: "http://127.0.0.1:3100",
    companyId: "company-1",
    companies: [
      {
        id: "company-1",
        name: "Resonant Venture",
        description: "Test company",
        status: "active",
        budgetMonthlyCents: 100000,
      },
    ],
    agents: [
      {
        id: "agent-1",
        name: "CEO",
        role: "ceo",
        title: "Chief Executive Officer",
        status: "running",
      },
    ],
    issues: [
      {
        id: "issue-1",
        title: "Design business architecture",
        status: "todo",
        priority: "high",
        assigneeAgentId: "agent-1",
      },
    ],
    fetchedAt: "unix:1",
  })),
  requestPaperclipCreateIssueFromDelegationMock: vi.fn(async () => ({
    endpoint: "http://127.0.0.1:3100",
    companyId: "company-1",
    issue: {
      id: "issue-2",
      title: "Approved delegation",
      status: "todo",
      priority: "medium",
    },
    auditSummary: "Created Paperclip issue issue-2 in company company-1 from a ResonantOS delegation payload.",
  })),
  requestBrowserEngineStatusMock: vi.fn(async () => ({
    installed: true,
    enginePath: "/tmp/chromium",
    installHint: "Chromium Browser engine is installed.",
  })),
  requestBrowserInstallEngineMock: vi.fn(async () => ({
    installed: true,
    enginePath: "/tmp/chromium",
    log: "Chromium Browser engine installed.",
  })),
  requestBrowserOpenUrlMock: vi.fn(async (url: string) => ({
    sessionId: "browser-test-session",
    requestedUrl: url,
    finalUrl: url,
    title: "Example Domain",
    status: "captured",
    engine: "chromium-cdp",
    screenshotDataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    audit: [
      { action: "engine.launched", detail: "test", timestamp: "unix-ms:1" },
      { action: "page.loaded", detail: url, timestamp: "unix-ms:2" },
      { action: "evidence.screenshot", detail: "browser-test-session", timestamp: "unix-ms:3" },
    ],
  })),
  requestBrowserStartSessionMock: vi.fn(async (url: string) => ({
    sessionId: "browser-test-session",
    requestedUrl: url,
    finalUrl: url,
    title: "Example Domain",
    status: "session-active",
    engine: "chromium-cdp",
    screenshotDataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    audit: [
      { action: "engine.launched", detail: "test", timestamp: "unix-ms:1" },
      { action: "page.loaded", detail: url, timestamp: "unix-ms:2" },
      { action: "evidence.screenshot", detail: "browser-test-session", timestamp: "unix-ms:3" },
    ],
  })),
  requestBrowserSessionOpenUrlMock: vi.fn(async (_sessionId: string, url: string) => ({
    sessionId: "browser-test-session",
    requestedUrl: url,
    finalUrl: url,
    title: "Example Domain",
    status: "session-active",
    engine: "chromium-cdp",
    screenshotDataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    audit: [{ action: "page.loaded", detail: url, timestamp: "unix-ms:4" }],
  })),
  requestBrowserSessionScreenshotMock: vi.fn(async (sessionId: string) => ({
    sessionId,
    requestedUrl: "https://example.org",
    finalUrl: "https://example.org",
    title: "Example Domain",
    status: "session-active",
    engine: "chromium-cdp",
    screenshotDataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    audit: [{ action: "evidence.screenshot", detail: sessionId, timestamp: "unix-ms:5" }],
  })),
  requestBrowserSessionReadPageMock: vi.fn(async (sessionId: string) => ({
    sessionId,
    finalUrl: "https://example.org",
    title: "Example Domain",
    text: "Example Domain text extracted from Chromium.",
    links: [{ text: "More information", href: "https://iana.org/domains/example" }],
    audit: [{ action: "page.read", detail: "https://example.org", timestamp: "unix-ms:6" }],
  })),
  requestBrowserSessionClickMock: vi.fn(async (sessionId: string) => ({
    sessionId,
    finalUrl: "https://example.org/clicked",
    title: "Clicked Page",
    screenshotDataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    audit: [{ action: "input.click", detail: "10,10", timestamp: "unix-ms:8" }],
  })),
  requestBrowserSessionScrollMock: vi.fn(async (sessionId: string) => ({
    sessionId,
    finalUrl: "https://example.org",
    title: "Example Domain",
    screenshotDataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    audit: [{ action: "input.scroll", detail: "0,120", timestamp: "unix-ms:9" }],
  })),
  requestBrowserCloseSessionMock: vi.fn(async (sessionId: string) => ({
    sessionId,
    closed: true,
    audit: [{ action: "session.closed", detail: sessionId, timestamp: "unix-ms:7" }],
  })),
  requestBrowserNativeWebviewShowMock: vi.fn(async (input: { url: string }) => ({
    label: "resonant-browser-native",
    url: input.url,
    visible: true,
    status: "created",
  })),
  requestBrowserNativeWebviewResizeMock: vi.fn(async () => ({
    label: "resonant-browser-native",
    url: null,
    visible: true,
    status: "resized",
  })),
  requestBrowserNativeWebviewHideMock: vi.fn(async () => ({
    label: "resonant-browser-native",
    url: null,
    visible: false,
    status: "hidden",
  })),
  requestNativeBrowserProbeMock: vi.fn(async () => ({
    status: "blocked",
    engineCandidate: "cef-chrome-runtime",
    hostBinaryStatus: "missing",
    sourceScaffoldStatus: "ready",
    embeddedViewStatus: "blocked",
    extensionCompatibilityStatus: "blocked",
    phantomStatus: "blocked",
    bitwardenStatus: "blocked",
    blockers: [
      "No product native Browser host is registered with ResonantOS yet.",
      "Phantom Wallet and Bitwarden extension compatibility has not been proven in the embedded host.",
    ],
    nextActions: ["Build the native Browser host binary behind the ADR-025 IPC contract."],
    checkedAt: "unix-ms:1",
  })),
  requestNativeBrowserAttachSmokeMock: vi.fn(async () => ({
    status: "blocked",
    platform: "macos",
    parentHandleKind: "macos-ns-view",
    parentHandlePresent: true,
    hostIntegrationMode: "external-process",
    blocker:
      "External CEF executables cannot safely attach to a process-local macOS NSView. Product Browser embedding requires in-process CEF/native library integration owned by the Tauri process.",
    nextActions: ["Move the CEF host from an external executable into an in-process Rust-owned native integration."],
    checkedAt: "unix-ms:2",
  })),
  requestNativeBrowserBridgeProbeMock: vi.fn(async () => ({
    status: "ready",
    integrationMode: "in-process-native-library",
    bridgeLibraryStatus: "ready",
    cAbiStatus: "ready",
    bridgeLibraryPath: "addons/resonant-browser-native/build/libResonantBrowserNativeBridge.a",
    exportedSymbols: [
      "_resonant_browser_native_contract_json",
      "_resonant_browser_native_in_process_status_json",
    ],
    blockers: [],
    nextActions: ["Wire CEF lifecycle calls behind this ABI."],
    checkedAt: "unix-ms:3",
  })),
  requestBrowserVisibleHostCommandMock: vi.fn(async (command: { type: string }) =>
    command.type === "extensions_list"
      ? { sessionId: "electron-browser-test", extensions: [], audit: [] }
      : command.type === "extensions_load_unpacked"
        ? {
            sessionId: "electron-browser-test",
            extension: {
              extensionId: "priority-extension",
              name: "Priority Extension",
              version: "0.1.0",
              installed: true,
              pinned: true,
              enabled: true,
              source: "local-unpacked",
              requestedCapabilities: [],
            },
            audit: [],
          }
        : command.type === "close"
          ? { sessionId: "electron-browser-test", closed: true, audit: [] }
          : {
              ready: true,
              sessionId: "electron-browser-test",
              engine: "electron-chromium",
              url: "https://resonantos.com/",
              title: "ResonantOS",
              menuLabels: ["File", "Edit", "View", "History", "Bookmarks", "Profiles", "Tab", "Window", "Help"],
              extensionSupport: "local-unpacked",
              audit: [],
            },
  ),
  requestBrowserExtensionFolderSelectionMock: vi.fn(async () => "/Users/augmentor/Extensions/Phantom"),
  browserToolRunMock,
  createDesktopBrowserToolRunnerMock: vi.fn(() => ({ run: browserToolRunMock })),
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
  requestProviderSmokeTestMock: vi.fn(async () => ({
    providerId: "shared-minimax",
    model: "MiniMax-M2.7",
    ok: true,
    replyPreview: "provider smoke ok",
    usage: {
      providerId: "shared-minimax",
      model: "MiniMax-M2.7",
      source: "provider",
      promptTokens: 42,
      completionTokens: 8,
      totalTokens: 50,
    },
    checkedAt: "unix:2",
    summary: "Provider smoke test passed.",
  })),
  requestProviderSetupProbeMock: vi.fn(async (input) => ({
    providerId: input.providerId,
    ok: true,
    setupState: "routable-now",
    discoveredModels: ["batiai/gemma4-e2b:q4", "qwen3:4b"],
    recommendedPrimaryModel: "batiai/gemma4-e2b:q4",
    recommendedFallbackModel: "qwen3:4b",
    endpoint: input.runtimeNodeEndpoint ?? input.apiBaseUrl ?? "http://127.0.0.1:11434",
    checkedAt: "unix:3",
    summary: "Ollama runtime responded with installed models.",
    detail: "Discovered through Ollama /api/tags; no model names were guessed.",
    source: "ollama-tags",
  })),
  requestLivingArchiveMemoryServiceStatusMock: vi.fn(async () => ({
    available: true,
    running: false,
    endpoint: "http://127.0.0.1:4888",
    memoryRoot: "/Users/example/ResonantOS_User/Memory",
    sessionId: "living-archive-memory-service",
    readonly: false,
    pid: null as number | null,
    command: "node examples/living-archive-memory-service.mjs",
    statusDetail: "Living Archive memory service is available but not running.",
  })),
  requestLivingArchiveMemoryServiceStartMock: vi.fn(async () => ({
    sessionId: "living-archive-memory-service",
    endpoint: "http://127.0.0.1:4888",
    memoryRoot: "/Users/example/ResonantOS_User/Memory",
    readonly: false,
    command: "node examples/living-archive-memory-service.mjs",
    pid: 4242,
    alreadyRunning: false,
  })),
  requestLivingArchiveMemoryServiceStopMock: vi.fn(async () => ({
    sessionId: "living-archive-memory-service",
    endpoint: "http://127.0.0.1:4888",
    memoryRoot: "/Users/example/ResonantOS_User/Memory",
    readonly: false,
    command: "node examples/living-archive-memory-service.mjs",
    pid: 4242,
    alreadyRunning: false,
  })),
  openFloatingChatWindowMock: vi.fn(async () => undefined),
  persistStateMock: vi.fn(async () => undefined),
  };
});

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
  persistState: persistStateMock,
  openFloatingChatWindow: openFloatingChatWindowMock,
  subscribeRuntimeStateUpdates: vi.fn(async () => () => undefined),
  requestEngineerRecoveryTurn: requestEngineerRecoveryTurnMock,
  requestCreateTaskWorkspace: requestCreateTaskWorkspaceMock,
  requestListTaskWorkspaces: requestListTaskWorkspacesMock,
  requestReadTaskWorkspace: requestReadTaskWorkspaceMock,
  requestFinishTaskWorkspace: requestFinishTaskWorkspaceMock,
  requestArchiveIngestProbe: requestArchiveIngestProbeMock,
  requestLocalRuntimeStatus: requestLocalRuntimeStatusMock,
  requestProviderDiagnostics: requestProviderDiagnosticsMock,
  requestProviderSetupProbe: requestProviderSetupProbeMock,
  requestProviderSmokeTest: requestProviderSmokeTestMock,
  requestLivingArchiveMemoryServiceStatus: requestLivingArchiveMemoryServiceStatusMock,
  requestLivingArchiveMemoryServiceStart: requestLivingArchiveMemoryServiceStartMock,
  requestLivingArchiveMemoryServiceStop: requestLivingArchiveMemoryServiceStopMock,
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
  requestArchiveMaintenanceCycle: requestArchiveMaintenanceCycleMock,
  requestArchiveBackgroundCycle: requestArchiveBackgroundCycleMock,
  requestArchiveLint: requestArchiveLintMock,
  requestArchiveSemanticLint: requestArchiveSemanticLintMock,
  requestArchiveTolBundleCandidates: requestArchiveTolBundleCandidatesMock,
  requestArchiveBuildTolBundle: requestArchiveBuildTolBundleMock,
  requestArchiveSourceFolderScan: requestArchiveSourceFolderScanMock,
  requestArchiveLibraryImport: requestArchiveLibraryImportMock,
  requestArchiveLibraryPreflight: requestArchiveLibraryPreflightMock,
  requestArchiveImportedLibraries: requestArchiveImportedLibrariesMock,
  requestArchiveLibraryClassificationReview: requestArchiveLibraryClassificationReviewMock,
  requestArchiveLibraryReorganisationPlan: requestArchiveLibraryReorganisationPlanMock,
  requestArchiveQueueImportedLibraryIngest: requestArchiveQueueImportedLibraryIngestMock,
  requestArchiveAiMemoryBuildJob: requestArchiveAiMemoryBuildJobMock,
  requestArchiveAiMemoryBuildJobs: requestArchiveAiMemoryBuildJobsMock,
  requestArchiveLibraryFolderSelection: requestArchiveLibraryFolderSelectionMock,
  requestObsidianVaultFolderSelection: requestObsidianVaultFolderSelectionMock,
  requestObsidianVaultStatus: requestObsidianVaultStatusMock,
  requestObsidianNoteList: requestObsidianNoteListMock,
  requestObsidianNote: requestObsidianNoteMock,
  requestObsidianOpenNote: requestObsidianOpenNoteMock,
  requestObsidianWriteNote: requestObsidianWriteNoteMock,
  requestObsidianCreateNote: requestObsidianCreateNoteMock,
  requestObsidianCreateFolder: requestObsidianCreateFolderMock,
  requestObsidianMoveNote: requestObsidianMoveNoteMock,
  requestObsidianArchiveNote: requestObsidianArchiveNoteMock,
  requestObsidianVaultIndex: requestObsidianVaultIndexMock,
  requestOpenCodeWorkspaceFolderSelection: requestOpenCodeWorkspaceFolderSelectionMock,
  requestOpenCodeStatus: requestOpenCodeStatusMock,
  requestOpenCodeStartService: requestOpenCodeStartServiceMock,
  requestOpenCodeStopService: requestOpenCodeStopServiceMock,
  requestPaperclipStatus: requestPaperclipStatusMock,
  requestPaperclipStartService: requestPaperclipStartServiceMock,
  requestPaperclipStopService: requestPaperclipStopServiceMock,
  requestPaperclipDashboardSnapshot: requestPaperclipDashboardSnapshotMock,
  requestPaperclipCreateIssueFromDelegation: requestPaperclipCreateIssueFromDelegationMock,
  requestBrowserEngineStatus: requestBrowserEngineStatusMock,
  requestBrowserInstallEngine: requestBrowserInstallEngineMock,
  requestBrowserOpenUrl: requestBrowserOpenUrlMock,
  requestBrowserStartSession: requestBrowserStartSessionMock,
  requestBrowserSessionOpenUrl: requestBrowserSessionOpenUrlMock,
  requestBrowserSessionScreenshot: requestBrowserSessionScreenshotMock,
  requestBrowserSessionReadPage: requestBrowserSessionReadPageMock,
  requestBrowserSessionClick: requestBrowserSessionClickMock,
  requestBrowserSessionScroll: requestBrowserSessionScrollMock,
  requestBrowserCloseSession: requestBrowserCloseSessionMock,
  requestBrowserNativeWebviewShow: requestBrowserNativeWebviewShowMock,
  requestBrowserNativeWebviewResize: requestBrowserNativeWebviewResizeMock,
  requestBrowserNativeWebviewHide: requestBrowserNativeWebviewHideMock,
  requestNativeBrowserProbe: requestNativeBrowserProbeMock,
  requestNativeBrowserAttachSmoke: requestNativeBrowserAttachSmokeMock,
  requestNativeBrowserBridgeProbe: requestNativeBrowserBridgeProbeMock,
  requestBrowserVisibleHostCommand: requestBrowserVisibleHostCommandMock,
  requestBrowserExtensionFolderSelection: requestBrowserExtensionFolderSelectionMock,
  createDesktopBrowserToolRunner: createDesktopBrowserToolRunnerMock,
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

const openChatHistory = async () => {
  const toggle = screen.queryByRole("button", { name: "Show chat history" });
  if (toggle) {
    fireEvent.click(toggle);
  }
  await screen.findByLabelText("Chat history");
};

const providerStreamInputs = (): Array<{ systemPrompt: string; messages: ConversationMessage[] }> =>
  requestProviderServiceChatCompletionStreamMock.mock.calls.map((call) => call[0]) as Array<{
    systemPrompt: string;
    messages: ConversationMessage[];
  }>;

describe("App boot flow", () => {
  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    if (typeof window.localStorage?.clear === "function") {
      window.localStorage.clear();
    }
    if (typeof window.sessionStorage?.clear === "function") {
      window.sessionStorage.clear();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const localStorageEntries = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => localStorageEntries.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageEntries.set(key, String(value));
        }),
        removeItem: vi.fn((key: string) => {
          localStorageEntries.delete(key);
        }),
        clear: vi.fn(() => {
          localStorageEntries.clear();
        }),
      },
    });
    hydrateStateMock.mockReset();
    hydrateStateMock.mockResolvedValue(buildDefaultState(manifests));
    requestProviderServiceChatCompletionMock.mockReset();
    requestProviderServiceChatCompletionMock.mockResolvedValue("This is a live Strategist test reply from MiniMax-M2.7.");
    requestProviderServiceChatCompletionStreamMock.mockReset();
    requestProviderServiceChatCompletionStreamMock.mockImplementation(async (input, onEvent) => {
      const reply = await requestProviderServiceChatCompletionMock(input);
      onEvent({ runId: input.runId, type: "chunk", content: reply });
      onEvent({
        runId: input.runId,
        type: "usage",
        content: JSON.stringify({
          providerId: input.providerId,
          model: input.model,
          source: "provider",
          promptTokens: 120,
          completionTokens: 30,
          totalTokens: 150,
          durationMs: 2200,
          tokensPerSecond: 13.6,
        }),
      });
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
    requestListTaskWorkspacesMock.mockReset();
    requestListTaskWorkspacesMock.mockResolvedValue([
      {
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
    ]);
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
      resultMarkdown: "# Delegation Result\n\nEngineer recovery handled this turn through the local tool loop.",
      verification: { status: "completed", checks: [{ id: "engineer-task-run", status: "passed" }] },
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
      portableUserState: {
        rootPath: "/Users/augmentor/Documents/ResonantOS_User",
        manifestPath: "/Users/augmentor/Documents/ResonantOS_User/Config/portable-state-manifest.json",
        memoryRoot: "/Users/augmentor/Documents/ResonantOS_User/Memory",
        configRoot: "/Users/augmentor/Documents/ResonantOS_User/Config",
        secretsRoot: "/Users/augmentor/Documents/ResonantOS_User/Secrets",
        walletsRoot: "/Users/augmentor/Documents/ResonantOS_User/Wallets",
        logsRoot: "/Users/augmentor/Documents/ResonantOS_User/Logs",
        backupsRoot: "/Users/augmentor/Documents/ResonantOS_User/Backups",
        source: "documents-default",
        initialized: true,
      },
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
    requestArchiveMaintenanceCycleMock.mockReset();
    requestArchiveMaintenanceCycleMock.mockResolvedValue({
      startedAt: "unix:11",
      finishedAt: "unix:12",
      processed: [],
      promoted: [],
      navigation: {
        refreshedAt: "unix:12",
        indexPath: "/tmp/wiki/index.md",
        logPath: "/tmp/wiki/log.md",
        pagesIndexed: 0,
        activityEntries: 0,
      },
      lint: {
        checkedAt: "unix:12",
        reportPath: "/tmp/review/lint/unix-12-lint-report.md",
        pagesChecked: 0,
        sourcesChecked: 0,
        findings: [],
      },
      skipped: [],
      errors: [],
    });
    requestArchiveBackgroundCycleMock.mockReset();
    requestArchiveBackgroundCycleMock.mockResolvedValue({
      startedAt: "unix:11",
      finishedAt: "unix:12",
      scan: {
        scannedAt: "unix:9",
        rootsScanned: 1,
        filesSeen: 0,
        newFiles: 0,
        changedFiles: 0,
        unchangedFiles: 0,
        skippedFiles: 0,
        records: [] as Array<Record<string, unknown>>,
        indexPath: "/tmp/source-watch-index.json",
      },
      queuedRequestFiles: [],
      skippedQueueSources: [],
      maintenance: {
        startedAt: "unix:11",
        finishedAt: "unix:12",
        processed: [],
        promoted: [],
        navigation: {
          refreshedAt: "unix:12",
          indexPath: "/tmp/wiki/index.md",
          logPath: "/tmp/wiki/log.md",
          pagesIndexed: 0,
          activityEntries: 0,
        },
        lint: {
          checkedAt: "unix:12",
          reportPath: "/tmp/review/lint/unix-12-lint-report.md",
          pagesChecked: 0,
          sourcesChecked: 0,
          findings: [],
        },
        skipped: [],
        errors: [],
      },
    });
    requestArchiveLintMock.mockReset();
    requestArchiveLintMock.mockResolvedValue({
      checkedAt: "unix:13",
      reportPath: "/tmp/review/lint/unix-13-lint-report.md",
      pagesChecked: 0,
      sourcesChecked: 0,
      findings: [],
    });
    requestArchiveSemanticLintMock.mockReset();
    requestArchiveSemanticLintMock.mockResolvedValue({
      checkedAt: "unix:14",
      reportPath: "/tmp/review/lint/semantic/unix-14-semantic-lint-report.md",
      providerId: "shared-openai",
      model: "gpt-5.4",
      sourceLintReportPath: "/tmp/review/lint/unix-13-lint-report.md",
      candidatesReviewed: 0,
      findings: [],
      summary: "No contradiction candidates were identified.",
      repairRequestFiles: [],
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
    requestArchiveLibraryPreflightMock.mockReset();
    requestArchiveLibraryPreflightMock.mockResolvedValue({
      sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
      exists: true,
      isDirectory: true,
      obsidianVaultDetected: false,
      supportedFiles: 2,
      skippedFiles: 1,
      hiddenEntriesSkipped: 0,
      generatedArchiveEntriesSkipped: 0,
      estimatedImportBytes: 4096,
      estimatedManagedStorageBytes: 8192,
      supportedByExtension: [{ label: "md", count: 2, sizeBytes: 4096 }],
      skippedByExtension: [{ label: "png", count: 1, sizeBytes: 512 }],
      supportedByTopFolder: [{ label: "notes", count: 2, sizeBytes: 4096 }],
      skippedByTopFolder: [{ label: "Wordpress Post Backup", count: 1, sizeBytes: 512 }],
      warnings: [
        {
          severity: "warning",
          title: "Noisy technical folder: Wordpress Post Backup",
          detail: "1 skipped file(s) were found under this folder.",
        },
      ],
      samples: [{ path: "/Users/augmentor/Documents/RESONANT_OS_BASE/image.png", reason: "unsupported .png" }],
      recommendedPlan: {
        summary: "Import 2 supported file(s). 1 unsupported or generated file(s) will stay out of Living Archive memory.",
        recommendedAction: "import-recommended-plan",
        autoExcludedTopFolders: ["venv"],
        ambiguousTopFolders: ["Wordpress Post Backup"],
        includedTopFolders: ["notes"],
        approvalNote:
          "Augmentor can explain this plan. The user approves one recommended import action; technical exclusions are handled by ResonantOS.",
      },
    });
    requestArchiveImportedLibrariesMock.mockReset();
    requestArchiveImportedLibrariesMock.mockResolvedValue([]);
    requestArchiveQueueImportedLibraryIngestMock.mockReset();
    requestArchiveQueueImportedLibraryIngestMock.mockResolvedValue({
      manifestPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
      libraryName: "RESONANT_OS_BASE",
      recordsSeen: 2,
      queued: 1,
      skippedExistingQueue: 0,
      skippedProcessed: 0,
      skippedUnsupported: 1,
      skippedMissing: 0,
      requestFiles: ["/tmp/review/request-identity.json"],
    });
    requestArchiveAiMemoryBuildJobMock.mockReset();
    requestArchiveAiMemoryBuildJobMock.mockResolvedValue({
      jobId: "resonant-os-base-unix-10",
      jobFile: "/tmp/review/jobs/resonant-os-base-unix-10.json",
      status: "running",
      libraryName: "RESONANT_OS_BASE",
      manifestPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
      recordsSeen: 2,
      queuedThisRun: 1,
      skippedExistingQueue: 0,
      skippedProcessed: 0,
      skippedUnsupported: 1,
      skippedMissing: 0,
      processedThisRun: 1,
      promotedThisRun: 1,
      queueRemaining: 1,
      reviewPending: 0,
      reviewApproved: 0,
      reviewEscalated: 0,
      reviewRejected: 0,
      errors: [],
      nextAction: "Continue the AI Memory build to process the remaining queued sources.",
      maintenance: {
        startedAt: "unix:11",
        finishedAt: "unix:12",
        processed: [],
        promoted: [],
        navigation: {
          refreshedAt: "unix:12",
          indexPath: "/tmp/wiki/index.md",
          logPath: "/tmp/wiki/log.md",
          pagesIndexed: 1,
          activityEntries: 1,
        },
        lint: {
          checkedAt: "unix:12",
          reportPath: "/tmp/review/lint/unix-12-lint-report.md",
          pagesChecked: 1,
          sourcesChecked: 1,
          findings: [],
        },
        skipped: [],
        errors: [],
      },
    });
    requestArchiveAiMemoryBuildJobsMock.mockReset();
    requestArchiveAiMemoryBuildJobsMock.mockResolvedValue([]);
    requestArchiveLibraryClassificationReviewMock.mockReset();
    requestArchiveLibraryClassificationReviewMock.mockResolvedValue({
      artifactType: "library-classification-review",
      createdAt: "unix:10",
      actorId: "strategist.core",
      libraryId: "resonant-os-base",
      libraryName: "RESONANT_OS_BASE",
      originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
      canonicalRoot:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
      classificationStatus: "needs-ai-assisted-classification",
      metadataStandard: "obsidian-frontmatter-wikilinks",
      structuralChangesAllowed: false,
      requiresHumanApprovalBeforeMove: true,
      recordsTotal: 2,
      proposalsPreviewed: 1,
      remainingForFullReview: 1,
      manifestPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
      proposals: [
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
      ],
    });
    requestArchiveLibraryReorganisationPlanMock.mockReset();
    requestArchiveLibraryReorganisationPlanMock.mockResolvedValue({
      plannedAt: "unix:11",
      actorId: "strategist.core",
      libraryId: "resonant-os-base",
      libraryName: "RESONANT_OS_BASE",
      planPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-reorganisation-plan.json",
      rollbackPlanPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-rollback-plan.json",
      auditLogPath:
        "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-reorganisation-audit.jsonl",
      requiresApproval: true,
      structuralChangesAllowed: false,
      movesPlanned: 1,
      tagOnlyCount: 0,
      blockedCount: 1,
      entries: [
        {
          sourceId: "resonant-os-base-notes-identity",
          title: "identity",
          proposedTarget: "human-knowledge",
          sourcePath:
            "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base/notes/identity.md",
          destinationPath:
            "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/HUMAN_KNOWLEDGE/sources/resonant-os-base/notes/identity.md",
          action: "propose-move-after-approval",
          confidence: "medium",
          reason: "Matched human-authored path or title signals.",
        },
      ],
    });
    requestArchiveLibraryFolderSelectionMock.mockReset();
    requestArchiveLibraryFolderSelectionMock.mockResolvedValue("/Users/augmentor/Documents/RESONANT_OS_BASE");
    requestObsidianVaultFolderSelectionMock.mockReset();
    requestObsidianVaultFolderSelectionMock.mockResolvedValue("/Users/augmentor/Documents/ResonantVault");
    requestObsidianVaultStatusMock.mockReset();
    requestObsidianVaultStatusMock.mockResolvedValue({
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      exists: true,
      isDirectory: true,
      obsidianConfigDetected: true,
      markdownFiles: 1,
      warnings: [],
    });
    requestObsidianNoteListMock.mockReset();
    requestObsidianNoteListMock.mockResolvedValue([
      {
        title: "Architecture Note",
        relativePath: "Architecture Note.md",
        sizeBytes: 42,
        modifiedAt: "unix:12",
      },
    ]);
    requestObsidianNoteMock.mockReset();
    requestObsidianNoteMock.mockResolvedValue({
      title: "Architecture Note",
      relativePath: "Architecture Note.md",
      content: "# Architecture Note\nResonantOS note preview.",
      sizeBytes: 42,
      modifiedAt: "unix:12",
    });
    requestObsidianOpenNoteMock.mockReset();
    requestObsidianOpenNoteMock.mockResolvedValue({
      openedUrl: "obsidian://open?path=%2FUsers%2Faugmentor%2FDocuments%2FResonantVault%2FArchitecture%20Note.md",
      absolutePath: "/Users/augmentor/Documents/ResonantVault/Architecture Note.md",
      notePath: "Architecture Note.md",
    });
    requestObsidianWriteNoteMock.mockReset();
    requestObsidianWriteNoteMock.mockImplementation(async (input: { notePath: string; content: string; expectedModifiedAt?: string }) => ({
      notePath: input.notePath,
      title: "Architecture Note",
      sizeBytes: input.content.length,
      previousModifiedAt: input.expectedModifiedAt,
      modifiedAt: "unix:14",
      versionPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-versions/Architecture Note.1.md",
      auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/1-write-note.json",
    }));
    requestObsidianCreateNoteMock.mockReset();
    requestObsidianCreateNoteMock.mockImplementation(async (input: { notePath: string; content?: string }) => ({
      operation: "create-note",
      notePath: input.notePath,
      title: input.notePath.replace(/\.md$/i, "").split("/").at(-1) ?? "Untitled",
      sizeBytes: input.content?.length ?? 0,
      modifiedAt: "unix:15",
      auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/2-create-note.json",
    }));
    requestObsidianCreateFolderMock.mockReset();
    requestObsidianCreateFolderMock.mockImplementation(async (input: { folderPath: string }) => ({
      operation: "create-folder",
      folderPath: input.folderPath,
      auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/3-create-folder.json",
    }));
    requestObsidianMoveNoteMock.mockReset();
    requestObsidianMoveNoteMock.mockImplementation(async (input: { fromNotePath: string; toNotePath: string }) => ({
      operation: "move-note",
      previousNotePath: input.fromNotePath,
      notePath: input.toNotePath,
      title: input.toNotePath.replace(/\.md$/i, "").split("/").at(-1) ?? "Untitled",
      sizeBytes: 42,
      modifiedAt: "unix:16",
      versionPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-versions/Architecture Note.2.md",
      auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/4-move-note.json",
    }));
    requestObsidianArchiveNoteMock.mockReset();
    requestObsidianArchiveNoteMock.mockImplementation(async (input: { notePath: string }) => ({
      operation: "archive-note",
      previousNotePath: input.notePath,
      archivedPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-trash/1/Architecture Note.md",
      auditPath: "/Users/augmentor/Documents/ResonantVault/.resonantos/obsidian-note-audit/5-archive-note.json",
    }));
    requestObsidianVaultIndexMock.mockReset();
    requestObsidianVaultIndexMock.mockImplementation(async (_vaultPath: string, query = "") => ({
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      noteCount: 2,
      query: query || undefined,
      notes: [
        {
          title: "Architecture Note",
          relativePath: "Architecture Note.md",
          sizeBytes: 42,
          modifiedAt: "unix:12",
          tags: ["#resonance/system"],
          wikilinks: ["Living Archive"],
          backlinks: [
            {
              sourcePath: "Research Note.md",
              sourceTitle: "Research Note",
            },
          ],
          excerpt: "Links to [[Living Archive]] #resonance/system",
        },
        {
          title: "Research Note",
          relativePath: "Research Note.md",
          sizeBytes: 88,
          modifiedAt: "unix:13",
          tags: ["#archive"],
          wikilinks: ["Architecture Note"],
          backlinks: [],
          excerpt: "Research links to [[Architecture Note]].",
        },
      ].filter((note) => !query || JSON.stringify(note).toLowerCase().includes(query.toLowerCase())),
    }));
    requestOpenCodeWorkspaceFolderSelectionMock.mockReset();
    requestOpenCodeWorkspaceFolderSelectionMock.mockResolvedValue("/Users/augmentor/Documents/ResonantVault");
    requestOpenCodeStatusMock.mockReset();
    requestOpenCodeStatusMock.mockResolvedValue({
      installed: false,
      version: null,
      binaryPath: null,
      installHint: "Install OpenCode with npm install -g opencode-ai.",
      supportsWebUi: true,
      supportsServerApi: true,
    });
    requestOpenCodeStartServiceMock.mockReset();
    requestOpenCodeStartServiceMock.mockResolvedValue({
      sessionId: "opencode-main",
      workspacePath: "/Users/augmentor/Documents/ResonantVault",
      mode: "web",
      apiBaseUrl: "http://127.0.0.1:4096",
      webUrl: "http://127.0.0.1:4096",
      command: "opencode web --hostname 127.0.0.1 --port 4096",
      pid: 42,
      alreadyRunning: false,
    });
    requestOpenCodeStopServiceMock.mockReset();
    requestOpenCodeStopServiceMock.mockResolvedValue({
      sessionId: "opencode-main",
      workspacePath: "/Users/augmentor/Documents/ResonantVault",
      mode: "web",
      apiBaseUrl: "http://127.0.0.1:4096",
      webUrl: "http://127.0.0.1:4096",
      command: "opencode web --hostname 127.0.0.1 --port 4096",
      pid: 42,
      alreadyRunning: false,
    });
    requestPaperclipStatusMock.mockReset();
    requestPaperclipStatusMock.mockResolvedValue({
      installed: true,
      version: null,
      binaryPath: "/usr/local/bin/npx",
      endpoint: "http://127.0.0.1:3100",
      endpointReachable: false,
      installHint: "Start Paperclip with npx paperclipai onboard --yes.",
      supportsWebUi: true,
      supportsServerApi: true,
      managedLaunchAvailable: false,
    });
    requestPaperclipStartServiceMock.mockReset();
    requestPaperclipStartServiceMock.mockResolvedValue({
      sessionId: "paperclip-main",
      endpoint: "http://127.0.0.1:3100",
      apiBaseUrl: "http://127.0.0.1:3100",
      webUrl: "http://127.0.0.1:3100",
      command: "connect to existing local Paperclip endpoint",
      pid: null as number | null,
      alreadyRunning: false,
    });
    requestPaperclipStopServiceMock.mockReset();
    requestPaperclipStopServiceMock.mockResolvedValue({
      sessionId: "paperclip-main",
      endpoint: "http://127.0.0.1:3100",
      apiBaseUrl: "http://127.0.0.1:3100",
      webUrl: "http://127.0.0.1:3100",
      command: "connect to existing local Paperclip endpoint",
      pid: null as number | null,
      alreadyRunning: false,
    });
    requestPaperclipDashboardSnapshotMock.mockReset();
    requestPaperclipDashboardSnapshotMock.mockResolvedValue({
      endpoint: "http://127.0.0.1:3100",
      companyId: "company-1",
      companies: [
        {
          id: "company-1",
          name: "Resonant Venture",
          description: "Test company",
          status: "active",
          budgetMonthlyCents: 100000,
        },
      ],
      agents: [
        {
          id: "agent-1",
          name: "CEO",
          role: "ceo",
          title: "Chief Executive Officer",
          status: "running",
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Design business architecture",
          status: "todo",
          priority: "high",
          assigneeAgentId: "agent-1",
        },
      ],
      fetchedAt: "unix:1",
    });
    requestPaperclipCreateIssueFromDelegationMock.mockReset();
    requestPaperclipCreateIssueFromDelegationMock.mockResolvedValue({
      endpoint: "http://127.0.0.1:3100",
      companyId: "company-1",
      issue: {
        id: "issue-2",
        title: "Approved delegation",
        status: "todo",
        priority: "medium",
      },
      auditSummary: "Created Paperclip issue issue-2 in company company-1 from a ResonantOS delegation payload.",
    });
    requestBrowserEngineStatusMock.mockReset();
    requestBrowserEngineStatusMock.mockResolvedValue({
      installed: true,
      enginePath: "/tmp/chromium",
      installHint: "Chromium Browser engine is installed.",
    });
    requestBrowserInstallEngineMock.mockReset();
    requestBrowserInstallEngineMock.mockResolvedValue({
      installed: true,
      enginePath: "/tmp/chromium",
      log: "Chromium Browser engine installed.",
    });
    requestBrowserOpenUrlMock.mockReset();
    requestBrowserOpenUrlMock.mockImplementation(async (url: string) => ({
      sessionId: "browser-test-session",
      requestedUrl: url,
      finalUrl: url,
      title: "Example Domain",
      status: "captured",
      engine: "chromium-cdp",
      screenshotDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      audit: [
        { action: "engine.launched", detail: "test", timestamp: "unix-ms:1" },
        { action: "page.loaded", detail: url, timestamp: "unix-ms:2" },
        { action: "evidence.screenshot", detail: "browser-test-session", timestamp: "unix-ms:3" },
      ],
    }));
    requestBrowserStartSessionMock.mockReset();
    requestBrowserStartSessionMock.mockImplementation(async (url: string) => ({
      sessionId: "browser-test-session",
      requestedUrl: url,
      finalUrl: url,
      title: "Example Domain",
      status: "session-active",
      engine: "chromium-cdp",
      screenshotDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      audit: [
        { action: "engine.launched", detail: "test", timestamp: "unix-ms:1" },
        { action: "page.loaded", detail: url, timestamp: "unix-ms:2" },
        { action: "evidence.screenshot", detail: "browser-test-session", timestamp: "unix-ms:3" },
      ],
    }));
    requestBrowserSessionOpenUrlMock.mockReset();
    requestBrowserSessionOpenUrlMock.mockImplementation(async (_sessionId: string, url: string) => ({
      sessionId: "browser-test-session",
      requestedUrl: url,
      finalUrl: url,
      title: "Example Domain",
      status: "session-active",
      engine: "chromium-cdp",
      screenshotDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      audit: [{ action: "page.loaded", detail: url, timestamp: "unix-ms:4" }],
    }));
    requestBrowserSessionScreenshotMock.mockReset();
    requestBrowserSessionScreenshotMock.mockResolvedValue({
      sessionId: "browser-test-session",
      requestedUrl: "https://example.org",
      finalUrl: "https://example.org",
      title: "Example Domain",
      status: "session-active",
      engine: "chromium-cdp",
      screenshotDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      audit: [{ action: "evidence.screenshot", detail: "browser-test-session", timestamp: "unix-ms:5" }],
    });
    requestBrowserSessionReadPageMock.mockReset();
    requestBrowserSessionReadPageMock.mockResolvedValue({
      sessionId: "browser-test-session",
      finalUrl: "https://example.org",
      title: "Example Domain",
      text: "Example Domain text extracted from Chromium.",
      links: [{ text: "More information", href: "https://iana.org/domains/example" }],
      audit: [{ action: "page.read", detail: "https://example.org", timestamp: "unix-ms:6" }],
    });
    requestBrowserSessionClickMock.mockReset();
    requestBrowserSessionClickMock.mockResolvedValue({
      sessionId: "browser-test-session",
      finalUrl: "https://example.org/clicked",
      title: "Clicked Page",
      screenshotDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      audit: [{ action: "input.click", detail: "10,10", timestamp: "unix-ms:8" }],
    });
    requestBrowserSessionScrollMock.mockReset();
    requestBrowserSessionScrollMock.mockResolvedValue({
      sessionId: "browser-test-session",
      finalUrl: "https://example.org",
      title: "Example Domain",
      screenshotDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      audit: [{ action: "input.scroll", detail: "0,120", timestamp: "unix-ms:9" }],
    });
    requestBrowserCloseSessionMock.mockReset();
    requestBrowserCloseSessionMock.mockResolvedValue({
      sessionId: "browser-test-session",
      closed: true,
      audit: [{ action: "session.closed", detail: "browser-test-session", timestamp: "unix-ms:7" }],
    });
    requestBrowserNativeWebviewShowMock.mockReset();
    requestBrowserNativeWebviewShowMock.mockImplementation(async (input: { url: string }) => ({
      label: "resonant-browser-native",
      url: input.url,
      visible: true,
      status: "created",
    }));
    requestBrowserNativeWebviewResizeMock.mockReset();
    requestBrowserNativeWebviewResizeMock.mockResolvedValue({
      label: "resonant-browser-native",
      url: null,
      visible: true,
      status: "resized",
    });
    requestBrowserNativeWebviewHideMock.mockReset();
    requestBrowserNativeWebviewHideMock.mockResolvedValue({
      label: "resonant-browser-native",
      url: null,
      visible: false,
      status: "hidden",
    });
    requestNativeBrowserProbeMock.mockReset();
    requestNativeBrowserProbeMock.mockResolvedValue({
      status: "blocked",
      engineCandidate: "cef-chrome-runtime",
      hostBinaryStatus: "missing",
      sourceScaffoldStatus: "ready",
      embeddedViewStatus: "blocked",
      extensionCompatibilityStatus: "blocked",
      phantomStatus: "blocked",
      bitwardenStatus: "blocked",
      blockers: [
        "No product native Browser host is registered with ResonantOS yet.",
        "Phantom Wallet and Bitwarden extension compatibility has not been proven in the embedded host.",
      ],
      nextActions: ["Build the native Browser host binary behind the ADR-025 IPC contract."],
      checkedAt: "unix-ms:1",
    });
    requestNativeBrowserAttachSmokeMock.mockReset();
    requestNativeBrowserAttachSmokeMock.mockResolvedValue({
      status: "blocked",
      platform: "macos",
      parentHandleKind: "macos-ns-view",
      parentHandlePresent: true,
      hostIntegrationMode: "external-process",
      blocker:
        "External CEF executables cannot safely attach to a process-local macOS NSView. Product Browser embedding requires in-process CEF/native library integration owned by the Tauri process.",
      nextActions: ["Move the CEF host from an external executable into an in-process Rust-owned native integration."],
      checkedAt: "unix-ms:2",
    });
    requestNativeBrowserBridgeProbeMock.mockReset();
    requestNativeBrowserBridgeProbeMock.mockResolvedValue({
      status: "ready",
      integrationMode: "in-process-native-library",
      bridgeLibraryStatus: "ready",
      cAbiStatus: "ready",
      bridgeLibraryPath: "addons/resonant-browser-native/build/libResonantBrowserNativeBridge.a",
      exportedSymbols: [
        "_resonant_browser_native_contract_json",
        "_resonant_browser_native_in_process_status_json",
      ],
      blockers: [],
      nextActions: ["Wire CEF lifecycle calls behind this ABI."],
      checkedAt: "unix-ms:3",
    });
    requestBrowserVisibleHostCommandMock.mockReset();
    requestBrowserVisibleHostCommandMock.mockImplementation(async (command: { type: string }) =>
      command.type === "extensions_list"
        ? { sessionId: "electron-browser-test", extensions: [], audit: [] }
        : command.type === "extensions_load_unpacked"
          ? {
              sessionId: "electron-browser-test",
              extension: {
                extensionId: "priority-extension",
                name: "Priority Extension",
                version: "0.1.0",
                installed: true,
                pinned: true,
                enabled: true,
                source: "local-unpacked",
                requestedCapabilities: [],
              },
              audit: [],
            }
          : command.type === "close"
            ? { sessionId: "electron-browser-test", closed: true, audit: [] }
            : {
                ready: true,
                sessionId: "electron-browser-test",
                engine: "electron-chromium",
                url: "https://resonantos.com/",
                title: "ResonantOS",
                menuLabels: ["File", "Edit", "View", "History", "Bookmarks", "Profiles", "Tab", "Window", "Help"],
                extensionSupport: "local-unpacked",
                audit: [],
              },
    );
    requestBrowserExtensionFolderSelectionMock.mockReset();
    requestBrowserExtensionFolderSelectionMock.mockResolvedValue("/Users/augmentor/Extensions/Phantom");
    createDesktopBrowserToolRunnerMock.mockReset();
    browserToolRunMock.mockReset();
    browserToolRunMock.mockImplementation(async (command: { type: string; params?: Record<string, unknown> }) =>
      command.type === "read_page"
        ? {
            sessionId: "browser-host-session",
            finalUrl: "https://resonantos.com/",
            title: "ResonantOS",
            text: "ResonantOS controlled Browser host text.",
            links: [{ text: "Home", href: "https://resonantos.com/" }],
            audit: [],
          }
        : command.type === "open_url"
          ? {
              sessionId: "browser-host-session",
              finalUrl: String(command.params?.url ?? "https://resonantos.com/"),
              title: "Synced Browser Page",
              status: 200,
              audit: [],
            }
          : {
              ready: true,
              sessionId: "browser-host-session",
              engine: "chromium",
              headless: false,
              url: "https://resonantos.com/",
              audit: [],
            },
    );
    createDesktopBrowserToolRunnerMock.mockReturnValue({
      run: browserToolRunMock,
    });
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
    requestProviderSmokeTestMock.mockReset();
    requestProviderSmokeTestMock.mockResolvedValue({
      providerId: "shared-minimax",
      model: "MiniMax-M2.7",
      ok: true,
      replyPreview: "provider smoke ok",
      usage: {
        providerId: "shared-minimax",
        model: "MiniMax-M2.7",
        source: "provider",
        promptTokens: 42,
        completionTokens: 8,
        totalTokens: 50,
      },
      checkedAt: "unix:2",
      summary: "Provider smoke test passed.",
    });
    requestProviderSetupProbeMock.mockReset();
    requestProviderSetupProbeMock.mockImplementation(async (input) => ({
      providerId: input.providerId,
      ok: true,
      setupState: "routable-now",
      discoveredModels: ["batiai/gemma4-e2b:q4", "qwen3:4b"],
      recommendedPrimaryModel: "batiai/gemma4-e2b:q4",
      recommendedFallbackModel: "qwen3:4b",
      endpoint: input.runtimeNodeEndpoint ?? input.apiBaseUrl ?? "http://127.0.0.1:11434",
      checkedAt: "unix:3",
      summary: "Ollama runtime responded with installed models.",
      detail: "Discovered through Ollama /api/tags; no model names were guessed.",
      source: "ollama-tags",
    }));
    requestLivingArchiveMemoryServiceStatusMock.mockReset();
    requestLivingArchiveMemoryServiceStatusMock.mockResolvedValue({
      available: true,
      running: false,
      endpoint: "http://127.0.0.1:4888",
      memoryRoot: "/Users/example/ResonantOS_User/Memory",
      sessionId: "living-archive-memory-service",
      readonly: false,
      pid: null as number | null,
      command: "node examples/living-archive-memory-service.mjs",
      statusDetail: "Living Archive memory service is available but not running.",
    });
    requestLivingArchiveMemoryServiceStartMock.mockReset();
    requestLivingArchiveMemoryServiceStartMock.mockResolvedValue({
      sessionId: "living-archive-memory-service",
      endpoint: "http://127.0.0.1:4888",
      memoryRoot: "/Users/example/ResonantOS_User/Memory",
      readonly: false,
      command: "node examples/living-archive-memory-service.mjs",
      pid: 4242,
      alreadyRunning: false,
    });
    requestLivingArchiveMemoryServiceStopMock.mockReset();
    requestLivingArchiveMemoryServiceStopMock.mockResolvedValue({
      sessionId: "living-archive-memory-service",
      endpoint: "http://127.0.0.1:4888",
      memoryRoot: "/Users/example/ResonantOS_User/Memory",
      readonly: false,
      command: "node examples/living-archive-memory-service.mjs",
      pid: 4242,
      alreadyRunning: false,
    });
    openFloatingChatWindowMock.mockReset();
    openFloatingChatWindowMock.mockResolvedValue(undefined);
    persistStateMock.mockClear();
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

  it("swaps the main workspace and chat rail while keeping the app dock fixed", async () => {
    const { container } = render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    expect(container.querySelector(".shell.layout-main-chat")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move chat beside the launcher" }));

    expect(container.querySelector(".shell.layout-chat-main")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move chat back to the right" })).toBeTruthy();
  });

  it("detaches chat by opening the floating window and hiding the dashboard rail/history", async () => {
    const { container } = render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Show chat history" }));
    expect(await screen.findByLabelText("Chat history")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Detach chat window" }));

    await waitFor(() => expect(openFloatingChatWindowMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(persistStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          uiPreferences: expect.objectContaining({
            chatSidebarOpen: false,
            chatHistoryOpen: false,
          }),
        }),
      ),
    );
    expect(container.querySelector(".shell.chat-closed")).toBeTruthy();
    expect(screen.queryByLabelText("Chat history")).toBeNull();
  });

  it("keeps floating chat history local to the detached window", async () => {
    window.history.replaceState({}, "", "/?surface=floating-chat");
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    persistStateMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Show chat history" }));

    expect(await screen.findByLabelText("Chat history")).toBeTruthy();
    expect(persistStateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        uiPreferences: expect.objectContaining({
          chatHistoryOpen: true,
        }),
      }),
    );
  });

  it("opens the Resonant Browser workspace from Home with a live viewport contract", async () => {
    const rect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("browser-native-webview-mount")) {
        return rect(80, 90, 1080, 700);
      }
      if (this.classList.contains("browser-toolbar")) {
        return rect(80, 40, 1080, 130);
      }
      return rect(0, 0, 0, 0);
    });
    const state = buildDefaultState(manifests);
    const browserInstallation = state.installations["addon.browser"];
    browserInstallation.installed = true;
    browserInstallation.enabled = true;
    browserInstallation.status = "enabled";
    browserInstallation.grantedCapabilities = browserInstallation.grantedCapabilities.map((grant) =>
      grant.capability === "network" ||
      grant.capability === "ui-embedding" ||
      grant.capability === "browser-control" ||
      grant.capability === "filesystem"
        ? { ...grant, granted: true }
        : grant,
    );
    hydrateStateMock.mockResolvedValueOnce(state);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Resonant Browser" })).toBeTruthy();
    expect(document.querySelector('use[href="/icons/vendor-ui.svg#tabler-world"]')).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Resonant Browser.*Embedded app/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open Workspace" }));

    expect(await screen.findByTestId("browser-workspace")).toBeTruthy();
    expect(screen.getByRole("button", { name: "File menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "History menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read active page with Augmentor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Extensions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Browser apps" })).toBeTruthy();
    expect(await screen.findByLabelText("Browser URL")).toBeTruthy();
    expect(screen.getByLabelText("Native embedded Chromium target")).toBeTruthy();
    expect(screen.getByText("Native embedded Chromium, not an Electron sidecar")).toBeTruthy();
    expect(await screen.findByLabelText("Native Browser host probe")).toBeTruthy();
    expect(screen.getByText("Native embedded host blocked")).toBeTruthy();
    expect(screen.getByText("Phantom Wallet and Bitwarden extension compatibility has not been proven in the embedded host.")).toBeTruthy();
    expect(screen.getAllByText("Native host compatibility required")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Run Attach Smoke Test" }));
    expect(await screen.findByLabelText("Native Browser attach smoke test")).toBeTruthy();
    expect(screen.getByText("Native attach blocked")).toBeTruthy();
    expect(screen.getByText(/External CEF executables cannot safely attach/i)).toBeTruthy();
    expect(requestNativeBrowserAttachSmokeMock).toHaveBeenCalledWith("external-process");
    fireEvent.click(screen.getByRole("button", { name: "Run Bridge Probe" }));
    expect(await screen.findByLabelText("Native Browser in-process bridge probe")).toBeTruthy();
    expect(screen.getByText("In-process bridge ready")).toBeTruthy();
    expect(screen.getByText(/resonant_browser_native_contract_json/i)).toBeTruthy();
    expect(requestNativeBrowserBridgeProbeMock).toHaveBeenCalledWith("in-process-native-library");
    rectSpy.mockRestore();
    await waitFor(() => expect(requestBrowserNativeWebviewShowMock).toHaveBeenCalled());
    expect(requestBrowserNativeWebviewShowMock).toHaveBeenCalledWith({
      url: "https://resonantos.com",
      navigate: true,
      bounds: {
        x: 81,
        y: 90,
        width: 998,
        height: 609,
      },
    });
    expect(requestBrowserNativeWebviewHideMock).not.toHaveBeenCalled();
    expect(requestBrowserEngineStatusMock).not.toHaveBeenCalled();
    expect(requestBrowserStartSessionMock).not.toHaveBeenCalled();
    expect(requestNativeBrowserProbeMock).toHaveBeenCalledWith("cef-chrome-runtime");
  });

  it("preserves Browser tabs and active URL when switching workspaces", async () => {
    const state = buildDefaultState(manifests);
    const browserInstallation = state.installations["addon.browser"];
    browserInstallation.installed = true;
    browserInstallation.enabled = true;
    browserInstallation.status = "enabled";
    browserInstallation.grantedCapabilities = browserInstallation.grantedCapabilities.map((grant) =>
      grant.capability === "network" ||
      grant.capability === "ui-embedding" ||
      grant.capability === "browser-control" ||
      grant.capability === "filesystem"
        ? { ...grant, granted: true }
        : grant,
    );
    hydrateStateMock.mockResolvedValueOnce(state);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Resonant Browser.*Embedded app/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open Workspace" }));

    const urlInput = await screen.findByLabelText("Browser URL");
    fireEvent.change(urlInput, { target: { value: "example.com" } });
    fireEvent.submit(urlInput.closest("form")!);
    expect((screen.getByLabelText("Browser URL") as HTMLInputElement).value).toBe("https://example.com");
    await waitFor(() =>
      expect(browserToolRunMock).toHaveBeenCalledWith({ type: "open_url", params: { url: "https://example.com" } }),
    );
    expect(browserToolRunMock).toHaveBeenCalledWith({ type: "open_url", params: { url: "https://example.com" } });
    expect((await screen.findAllByText(/Browser v2 target/i)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    expect((screen.getByLabelText("Browser URL") as HTMLInputElement).value).toBe("https://resonantos.com");

    fireEvent.click(screen.getByRole("button", { name: "Living Archive" }));
    expect((await screen.findAllByText("Living Archive")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Resonant Browser" }));

    expect(((await screen.findByLabelText("Browser URL")) as HTMLInputElement).value).toBe("https://resonantos.com");
    fireEvent.click(screen.getByRole("button", { name: "Open tab example.com" }));
    expect((screen.getByLabelText("Browser URL") as HTMLInputElement).value).toBe("https://example.com");
  });

  it("runs a governed Browser host read from the visible Browser toolbar", async () => {
    const state = buildDefaultState(manifests);
    const browserInstallation = state.installations["addon.browser"];
    browserInstallation.installed = true;
    browserInstallation.enabled = true;
    browserInstallation.status = "enabled";
    browserInstallation.grantedCapabilities = browserInstallation.grantedCapabilities.map((grant) =>
      grant.capability === "network" ||
      grant.capability === "ui-embedding" ||
      grant.capability === "browser-control" ||
      grant.capability === "filesystem"
        ? { ...grant, granted: true }
        : grant,
    );
    hydrateStateMock.mockResolvedValueOnce(state);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Resonant Browser.*Embedded app/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open Workspace" }));
    fireEvent.click(await screen.findByRole("button", { name: "Read active page with Augmentor" }));

    expect((await screen.findAllByText(/Controlled read: ResonantOS/i)).length).toBeGreaterThan(0);
    expect(createDesktopBrowserToolRunnerMock).toHaveBeenCalledTimes(1);
    expect(browserToolRunMock).toHaveBeenCalledWith({ type: "health" });
    expect(browserToolRunMock).toHaveBeenCalledWith({ type: "read_page" });
  });

  it("does not launch the rejected Electron sidecar from the Browser workspace", async () => {
    const state = buildDefaultState(manifests);
    const browserInstallation = state.installations["addon.browser"];
    browserInstallation.installed = true;
    browserInstallation.enabled = true;
    browserInstallation.status = "enabled";
    browserInstallation.grantedCapabilities = browserInstallation.grantedCapabilities.map((grant) =>
      grant.capability === "network" ||
      grant.capability === "ui-embedding" ||
      grant.capability === "browser-control" ||
      grant.capability === "filesystem"
        ? { ...grant, granted: true }
        : grant,
    );
    hydrateStateMock.mockResolvedValueOnce(state);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Resonant Browser.*Embedded app/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open Workspace" }));
    expect(await screen.findByLabelText("Native embedded Chromium target")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Chromium Host" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Load Phantom unpacked extension" })).toBeNull();
    expect(requestBrowserVisibleHostCommandMock).not.toHaveBeenCalled();
    expect(requestBrowserExtensionFolderSelectionMock).not.toHaveBeenCalled();
    expect(requestNativeBrowserProbeMock).toHaveBeenCalledWith("cef-chrome-runtime");
  });

  it("grants the Browser controlled access preset from the Add-ons workspace", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);
    fireEvent.click(await screen.findByText("Resonant Browser"));

    expect(screen.getByRole("button", { name: "Install and grant controlled browser access" })).toBeTruthy();
    expect(await screen.findByText("chromium installed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install and grant controlled browser access" }));

    expect(await screen.findByRole("button", { name: "Browser access granted" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chromium installed" })).toBeTruthy();
    expect(screen.getByText("network granted")).toBeTruthy();
    expect(screen.getByText("ui embedding granted")).toBeTruthy();
    expect(screen.getByText("browser control granted")).toBeTruthy();
    expect(screen.getByText("filesystem granted")).toBeTruthy();
  });

  it("sets up Browser from the add-on card even when persisted grants are stale", async () => {
    const state = buildDefaultState(manifests);
    state.installations["addon.browser"] = {
      ...state.installations["addon.browser"],
      installed: true,
      enabled: true,
      status: "enabled",
      grantedCapabilities: [],
    };
    hydrateStateMock.mockResolvedValueOnce(state);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Install and grant browser access" }));

    expect(await screen.findByRole("button", { name: "Browser access granted" })).toBeTruthy();
    expect(screen.getByText("chromium installed")).toBeTruthy();
    expect(screen.getByText("network granted")).toBeTruthy();
    expect(screen.getByText("ui embedding granted")).toBeTruthy();
    expect(screen.getByText("browser control granted")).toBeTruthy();
    expect(screen.getByText("filesystem granted")).toBeTruthy();
  });

  it("sets up Browser directly from the gated Browser workspace", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Resonant Browser.*Embedded app/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Install and grant browser access" }));

    expect(await screen.findByLabelText("Browser URL")).toBeTruthy();
    expect(screen.getByLabelText("Native embedded Chromium target")).toBeTruthy();
  });

  it("shows Paperclip in the Add-ons catalog before installation", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);

    expect(await screen.findByPlaceholderText("Search add-ons")).toBeTruthy();
    expect((await screen.findAllByText("Paperclip")).length).toBeGreaterThan(0);
  });

  it("opens OpenCode as an optional add-on workspace with scoped launch gates", async () => {
    const state = buildDefaultState(manifests);
    const opencodeInstallation = state.installations["addon.opencode"];
    opencodeInstallation.installed = true;
    opencodeInstallation.enabled = true;
    opencodeInstallation.status = "enabled";
    hydrateStateMock.mockResolvedValueOnce(state);
    requestOpenCodeStatusMock.mockResolvedValueOnce({
      installed: false,
      version: null,
      binaryPath: null,
      installHint: "Install OpenCode with npm install -g opencode-ai.",
      supportsWebUi: true,
      supportsServerApi: true,
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "OpenCode" })[0]);

    expect(await screen.findByTestId("opencode-workspace")).toBeTruthy();
    expect(screen.getByText("OpenCode UI will appear here after launch.")).toBeTruthy();
    expect(screen.queryByText("OpenCode not detected")).toBeNull();
    expect(screen.queryByText("Capability gate")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "OpenCode workspace settings" }));
    expect(await screen.findByText("OpenCode not detected")).toBeTruthy();
    expect(screen.getByText(/Before launch:/i)).toBeTruthy();

    requestOpenCodeStatusMock.mockResolvedValueOnce({
      installed: true,
      version: "0.0.0-test",
      binaryPath: "/usr/local/bin/opencode",
      installHint: "OpenCode is installed.",
      supportsWebUi: true,
      supportsServerApi: true,
    } as unknown as Awaited<ReturnType<typeof requestOpenCodeStatusMock>>);
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));
    await waitFor(() => {
      expect(requestOpenCodeWorkspaceFolderSelectionMock).toHaveBeenCalled();
    });
    expect((await screen.findAllByText("/Users/augmentor/Documents/ResonantVault")).length).toBeGreaterThan(0);
    expect(await screen.findByText("OpenCode 0.0.0-test")).toBeTruthy();
    await waitFor(() => {
      expect(requestOpenCodeStartServiceMock).toHaveBeenCalledWith({
        workspacePath: "/Users/augmentor/Documents/ResonantVault",
        mode: "web",
        sessionId: "opencode-main",
      });
    });
    expect(await screen.findByLabelText("OpenCode embedded workspace")).toBeTruthy();
  });

  it("opens Paperclip as an optional embedded organizational runtime", async () => {
    const state = buildDefaultState(manifests);
    const paperclipInstallation = state.installations["addon.paperclip"];
    paperclipInstallation.installed = true;
    paperclipInstallation.enabled = true;
    paperclipInstallation.status = "enabled";
    hydrateStateMock.mockResolvedValueOnce(state);
    requestPaperclipStatusMock.mockResolvedValue({
      installed: true,
      version: null,
      binaryPath: "/usr/local/bin/npx",
      endpoint: "http://127.0.0.1:3100",
      endpointReachable: true,
      installHint: "Paperclip is reachable.",
      supportsWebUi: true,
      supportsServerApi: true,
      managedLaunchAvailable: false,
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Paperclip" })[0]);

    expect(await screen.findByTestId("paperclip-workspace")).toBeTruthy();
    expect(screen.getByText("Paperclip UI will appear here after connection.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => {
      expect(requestPaperclipStartServiceMock).toHaveBeenCalledWith({
        endpoint: "http://127.0.0.1:3100",
        sessionId: "paperclip-main",
      });
    });
    expect(await screen.findByLabelText("Paperclip embedded workspace")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Paperclip workspace settings" }));
    fireEvent.change(await screen.findByPlaceholderText("pcp_... or agent token"), {
      target: { value: "paperclip-test-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh Organization Snapshot" }));
    await waitFor(() => {
      expect(requestPaperclipDashboardSnapshotMock).toHaveBeenCalledWith({
        endpoint: "http://127.0.0.1:3100",
        apiToken: "paperclip-test-token",
        companyId: undefined,
      });
    });
    expect(await screen.findByText("Resonant Venture")).toBeTruthy();
    expect(await screen.findByText("Chief Executive Officer")).toBeTruthy();
    expect(await screen.findByText("Design business architecture")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Implement approved operating plan"), {
      target: { value: "Approved delegation" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste the approved delegation brief from Augmentor."), {
      target: { value: "Create the initial Paperclip company operating issue." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Delegation Issue" }));
    await waitFor(() => {
      expect(requestPaperclipCreateIssueFromDelegationMock).toHaveBeenCalledWith({
        endpoint: "http://127.0.0.1:3100",
        apiToken: "paperclip-test-token",
        companyId: "company-1",
        title: "Approved delegation",
        description: "Create the initial Paperclip company operating issue.",
        priority: "medium",
      });
    });
    expect(await screen.findByText(/Created Paperclip issue issue-2/i)).toBeTruthy();
  });

  it("auto-launches OpenCode when workspace access is already configured", async () => {
    const state = buildDefaultState(manifests);
    const opencodeInstallation = state.installations["addon.opencode"];
    opencodeInstallation.installed = true;
    opencodeInstallation.enabled = true;
    opencodeInstallation.status = "enabled";
    opencodeInstallation.config = {
      workspacePath: "/Users/augmentor/Documents/ResonantVault",
    };
    opencodeInstallation.grantedCapabilities = opencodeInstallation.grantedCapabilities.map((grant) =>
      grant.capability === "filesystem" || grant.capability === "shell" || grant.capability === "ui-embedding" ? { ...grant, granted: true } : grant,
    );
    hydrateStateMock.mockResolvedValueOnce(state);
    requestOpenCodeStatusMock.mockResolvedValue({
      installed: true,
      version: "0.0.0-test",
      binaryPath: "/usr/local/bin/opencode",
      installHint: "OpenCode is installed.",
      supportsWebUi: true,
      supportsServerApi: true,
    } as unknown as Awaited<ReturnType<typeof requestOpenCodeStatusMock>>);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "OpenCode" })[0]);

    expect(await screen.findByTestId("opencode-workspace")).toBeTruthy();
    await waitFor(() => {
      expect(requestOpenCodeStartServiceMock).toHaveBeenCalledWith({
        workspacePath: "/Users/augmentor/Documents/ResonantVault",
        mode: "web",
        sessionId: "opencode-main",
      });
    });
    expect(requestOpenCodeWorkspaceFolderSelectionMock).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("OpenCode embedded workspace")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Home" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "OpenCode" })[0]);
    expect(requestOpenCodeStartServiceMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("OpenCode embedded workspace")).toBeTruthy();
  });

  it("creates an Engineer delegation workspace from explicit Augmentor delegation", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    const composer = screen.getAllByPlaceholderText("Message Augmentor")[0] as HTMLTextAreaElement;
    const composerCard = composer.closest(".composer-card") as HTMLElement;
    fireEvent.change(composer, {
      target: { value: "Delegate this provider diagnostic to the Engineer" },
    });
    await waitFor(() => expect(composer.value).toBe("Delegate this provider diagnostic to the Engineer"));
    fireEvent.click(within(composerCard).getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(requestCreateTaskWorkspaceMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/I created an Engineer delegation workspace/i)).toBeTruthy();
    expect(await screen.findByText(/TASK.md:/i)).toBeTruthy();
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

  it("shows the Delegation Monitor and can start a task workspace from the UI", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Delegation" }));

    expect(await screen.findByText("Supervise work Augmentor delegates to agents and add-ons.")).toBeTruthy();
    expect((await screen.findAllByText(/Engineer Provider Diagnostic/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText("Engineer result returned")).toBeTruthy();
    expect(await screen.findByText(/Engineer recovery handled this turn through the local tool loop/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask Augmentor to Review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Follow-up Task" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start Engineer Task" }));

    expect(await screen.findByText(/The Engineer task ran and the workspace was updated/i)).toBeTruthy();
    expect(requestListTaskWorkspacesMock).toHaveBeenCalled();
    expect(requestReadTaskWorkspaceMock).toHaveBeenCalledWith("workspace-engineer-provider-diagnostic");
    expect(requestFinishTaskWorkspaceMock).toHaveBeenCalledTimes(1);
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
    expect(await screen.findByText(/Working for/i)).toBeTruthy();
    expect((await screen.findAllByText(/Streaming the reply from the active provider route/i)).length).toBeGreaterThan(0);
    expect(requestProviderServiceChatCompletionMock).not.toHaveBeenCalled();

    continueStream.resolve();

    expect(await screen.findByText("Partial streamed reply.")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText(/Working for/i)).toBeNull();
    });
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
    expect(screen.getAllByRole("button", { name: "Start dictation" })[0].hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByLabelText(/Context usage/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/Context ceiling comes from provider\/model metadata/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Send message" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "New chat" }).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("MiniMax-M2.7").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Context usage/i })[0]);
    const contextMap = await screen.findByRole("region", { name: "Context memory map" });
    const composer = screen.getAllByPlaceholderText("Message Augmentor")[0];
    expect(contextMap).toBeTruthy();
    expect(Boolean(contextMap.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getByText("Raw transcript")).toBeTruthy();
    expect(screen.getByText("Compact memory")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compact now" })).toBeTruthy();
  });

  it("surfaces provider usage in the context tooltip and local generation stats", async () => {
    const state = buildDefaultState(manifests);
    hydrateStateMock.mockResolvedValue({
      ...state,
      conversationThreads: state.conversationThreads.map((thread) =>
        thread.id === "thread-main-desktop"
          ? {
              ...thread,
              messages: [
                {
                  ...thread.messages[0],
                  providerUsage: {
                    providerId: "shared-local",
                    model: "batiai/gemma4-e2b:q4",
                    source: "local-runtime",
                    promptTokens: 42,
                    completionTokens: 11,
                    totalTokens: 53,
                    durationMs: 810,
                    tokensPerSecond: 13.6,
                  },
                },
              ],
            }
          : thread,
      ),
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/Last measured provider usage for batiai\/gemma4-e2b:q4/i).length).toBeGreaterThan(0);
    const statsTitle = screen.getByRole("button", { name: "Generation stats" }).getAttribute("title");
    expect(statsTitle).toContain("Completion TPS: 13.6");
    expect(statsTitle).toContain("Total tokens: 53");
  });

  it("compacts the active chat context from the context usage control", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Context usage/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Compact now" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Compact now" }));
    expect(await screen.findByText(/Context compacted\. Preserved/i)).toBeTruthy();
    expect(await screen.findByText(/Edits change compact memory only/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit memory" }));
    fireEvent.change(screen.getByLabelText("User why"), {
      target: { value: "Edited why: preserve the user's intent across compaction." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save memory" }));
    expect(await screen.findByText(/Context memory updated/i)).toBeTruthy();

    fireEvent.change(screen.getAllByPlaceholderText("Message Augmentor")[0], {
      target: { value: "Continue after compacting the chat." },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Send message" })[0]);

    expect(await screen.findByText("This is a live Strategist test reply from MiniMax-M2.7.")).toBeTruthy();
    const providerCall = providerStreamInputs().at(-1);
    expect(providerCall?.systemPrompt).toContain("ResonantOS compacted conversation memory:");
    expect(providerCall?.systemPrompt).toContain("Edited why: preserve the user's intent across compaction.");
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
    fireEvent.click(screen.getByRole("button", { name: "Compact now" }));
    expect(await screen.findByText(/Context compacted\. Preserved/i)).toBeTruthy();

    await openChatHistory();
    fireEvent.click(screen.getAllByRole("button", { name: "Chat options" })[0]);
    fireEvent.click(screen.getAllByRole("menuitem", { name: /Branch/i })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: /Augmentor/i }).at(-1)!);
    await openChatHistory();

    expect(screen.getByText(/New Augmentor chat/)).toBeTruthy();
  });

  it("opens chat history actions for pinning, branching, and deleting chats", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    await openChatHistory();
    fireEvent.click(screen.getAllByRole("button", { name: "Chat options" })[0]);
    expect(screen.getAllByRole("menuitem", { name: /Unpin/i })[0]).toBeTruthy();
    expect(screen.getAllByRole("menuitem", { name: /Branch/i })[0]).toBeTruthy();
    expect(screen.getAllByRole("menuitem", { name: /Delete/i })[0]).toBeTruthy();

    fireEvent.click(screen.getAllByRole("menuitem", { name: /Branch/i })[0]);
    expect(screen.getByText("Desktop Main Thread fork")).toBeTruthy();
  });

  it("switches the chat rail between available core agents", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Talk with Resonant Engineer Agent" }));

    expect(screen.getByPlaceholderText("Message Resonant Engineer Agent")).toBeTruthy();
    expect(screen.queryByText("Emergency Recovery")).toBeNull();
    expect(screen.queryByText(/Recovery mode is active/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Resurrect Local" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Talk with Hermes/i })).toBeNull();
  });

  it("shows provider diagnostics in settings", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Settings/i })[0]);

    expect(await screen.findByText("AI Providers")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add AI Provider/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Shared MiniMax/i }));
    expect(await screen.findByText("Diagnostics")).toBeTruthy();
    expect((await screen.findAllByText("MiniMax Cloud Runtime")).length).toBeGreaterThan(0);
    expect(requestProviderDiagnosticsMock).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);

    expect((await screen.findAllByText("Provider smoke test passed.")).length).toBeGreaterThan(0);
    expect(screen.getByText(/MiniMax-M2.7 · 50 tokens/i)).toBeTruthy();
    expect(screen.getByText("provider smoke ok")).toBeTruthy();
    expect(requestProviderSmokeTestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "shared-minimax",
        model: "MiniMax-M2.7",
      }),
    );
  });

  it("adds a provider profile through the compact settings modal", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Settings/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Add AI Provider/i }));
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "ollama" } });
    fireEvent.change(screen.getByLabelText("Name in ResonantOS"), { target: { value: "Studio Local Runtime" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Provider" }));

    expect(await screen.findByText("Studio Local Runtime")).toBeTruthy();
    expect(screen.getByText(/Studio Local Runtime was added.*Ollama runtime responded with installed models/i)).toBeTruthy();
    expect(requestProviderSetupProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: "local",
        runtimeNodeEndpoint: "http://127.0.0.1:11434",
      }),
    );
  });

  it("starts the Living Archive memory bridge from settings", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Settings/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Memory Bridge/i }));

    expect(await screen.findByText("Living Archive Memory Bridge")).toBeTruthy();
    expect(await screen.findByText("Bridge stopped")).toBeTruthy();
    expect(requestLivingArchiveMemoryServiceStatusMock).toHaveBeenCalled();

    requestLivingArchiveMemoryServiceStatusMock.mockResolvedValueOnce({
      available: true,
      running: true,
      endpoint: "http://127.0.0.1:4888",
      memoryRoot: "/Users/example/ResonantOS_User/Memory",
      sessionId: "living-archive-memory-service",
      readonly: false,
      pid: 4242,
      command: "node examples/living-archive-memory-service.mjs",
      statusDetail: "Managed Living Archive memory service is running.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Start Bridge" }));

    expect(await screen.findByText("Bridge running")).toBeTruthy();
    expect(screen.getByText(/pid 4242/i)).toBeTruthy();
    expect(requestLivingArchiveMemoryServiceStartMock).toHaveBeenCalled();
  });

  it("runs the archive ingest probe through the archive workload route", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open Advanced section" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Open Search section" }));

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
    expect(await screen.findByText("2 supported")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Library name"), {
      target: { value: "RESONANT_OS_BASE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Recommended Plan" }));

    expect(await screen.findByText("Imported 2 file(s) into RESONANT_OS_BASE. Managed location is now canonical.")).toBeTruthy();
    expect(await screen.findByText("Latest imported library")).toBeTruthy();
    expect(await screen.findByText(/Classification review artifact created/i)).toBeTruthy();
    expect(screen.getByRole("option", { name: /Move into Living Archive/i }).hasAttribute("disabled")).toBe(true);
    expect(requestArchiveLibraryPreflightMock).toHaveBeenCalledWith("/Users/augmentor/Documents/RESONANT_OS_BASE");
    expect(requestArchiveLibraryImportMock).toHaveBeenCalledWith({
      sourcePath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
      domain: "mixed-library",
      importMode: "copy",
      libraryName: "RESONANT_OS_BASE",
      actorId: "strategist.core",
      excludedTopFolders: ["venv"],
    });
  });

  it("opens a new Augmentor session for Living Archive preflight guidance", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Choose folder or vault path" }));
    expect(await screen.findByText("Import 2 supported file(s). 1 unsupported or generated file(s) will stay out of Living Archive memory.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask Augmentor about this plan" }));

    await waitFor(() => {
      expect(requestProviderServiceChatCompletionStreamMock).toHaveBeenCalled();
    });
    const request = requestProviderServiceChatCompletionStreamMock.mock.calls.at(-1)?.[0];
    expect(request?.messages.at(-1)?.content).toContain("Help me understand this Living Archive import preflight");
    expect(request?.messages.at(-1)?.content).toContain("Wordpress Post Backup");
    expect(request?.messages.at(-1)?.content).toContain("Audio2TOL add-on");
    fireEvent.click(screen.getByRole("button", { name: "Show chat history" }));
    expect(await screen.findByText("Living Archive import plan")).toBeTruthy();
  });

  it("connects Resonant Notes to a selected vault and previews a note", async () => {
    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll(".addon-card")).some((element) => element.textContent?.includes("Resonant Notes"))).toBe(true);
    });
    const obsidianCard = Array.from(document.querySelectorAll(".addon-card")).find((element) =>
      element.textContent?.includes("Resonant Notes"),
    )!;
    fireEvent.click(obsidianCard);
    fireEvent.click(within(obsidianCard as HTMLElement).getByRole("button", { name: "Install" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose vault" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Obsidian vault path")).toHaveProperty(
        "value",
        "/Users/augmentor/Documents/ResonantVault",
      );
    });
    expect(await screen.findByText(/1 markdown note/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button").find((element) => element.textContent?.includes("Architecture Note"))!);

    expect(await screen.findByText(/ResonantOS note preview/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open in Obsidian" }));
    expect(await screen.findByText(/Opened in Obsidian: Architecture Note.md/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Plan archive intake" }));

    await waitFor(() => {
      expect(requestProviderServiceChatCompletionStreamMock).toHaveBeenCalled();
    });
    expect(JSON.stringify(requestProviderServiceChatCompletionStreamMock.mock.calls.at(-1)?.[0])).toContain(
      "Obsidian note handoff from ResonantOS V1 vault bridge",
    );
    expect(JSON.stringify(requestProviderServiceChatCompletionStreamMock.mock.calls.at(-1)?.[0])).toContain(
      "Create a Living Archive intake plan",
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Grant intake access" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Queue for archive review" }));
    expect(await screen.findByText(/Queue this note for Living Archive review/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm queue" }));

    expect(await screen.findByText(/Queued for review/i)).toBeTruthy();
    expect(screen.getByText("Intake history")).toBeTruthy();
    expect(screen.getByText("Architecture Note.md")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Living Archive Review" }));
    expect(await screen.findByText("Archive online")).toBeTruthy();
    expect(await screen.findByText(/Opened from Obsidian intake history/i)).toBeTruthy();
    expect(screen.getByLabelText("Living Archive review desk")).toBeTruthy();
    expect(requestArchiveIntakeWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "addon.obsidian",
        bucket: "obsidian-vault-notes",
        fileName: expect.stringContaining("architecture-note.md"),
        content: expect.stringContaining("This is a raw Obsidian note intake artifact."),
        metadata: expect.objectContaining({
          origin: "obsidian-addon",
          notePath: "Architecture Note.md",
          trustBoundary: "raw-intake-only",
        }),
      }),
    );
    expect(requestArchiveIngestRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "addon.obsidian",
        sourceType: "obsidian_note",
        sourceRole: "vault-note",
        intent: "review-and-ingest",
      }),
    );
    expect(requestObsidianVaultFolderSelectionMock).toHaveBeenCalled();
    expect(requestObsidianVaultStatusMock).toHaveBeenCalledWith("/Users/augmentor/Documents/ResonantVault");
    expect(requestObsidianNoteListMock).toHaveBeenCalledWith("/Users/augmentor/Documents/ResonantVault", 200);
    expect(requestObsidianNoteMock).toHaveBeenCalledWith("/Users/augmentor/Documents/ResonantVault", "Architecture Note.md");
    expect(requestObsidianOpenNoteMock).toHaveBeenCalledWith("/Users/augmentor/Documents/ResonantVault", "Architecture Note.md");
  });

  it("queues scanned Obsidian notes as raw intake only after batch confirmation", async () => {
    requestObsidianVaultStatusMock.mockResolvedValueOnce({
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      exists: true,
      isDirectory: true,
      obsidianConfigDetected: true,
      markdownFiles: 2,
      warnings: [],
    });
    requestObsidianNoteListMock.mockResolvedValueOnce([
      {
        title: "Architecture Note",
        relativePath: "Architecture Note.md",
        sizeBytes: 42,
        modifiedAt: "unix:12",
      },
      {
        title: "Research Note",
        relativePath: "Research/Research Note.md",
        sizeBytes: 88,
        modifiedAt: "unix:13",
      },
    ]);
    requestObsidianNoteMock.mockImplementation(async (...args: unknown[]) => {
      const notePath = String(args[1] ?? "Architecture Note.md");
      const researchNote = notePath.includes("Research");
      return {
        title: researchNote ? "Research Note" : "Architecture Note",
        relativePath: notePath,
        content: researchNote ? "# Research Note\nExternal material." : "# Architecture Note\nHuman material.",
        sizeBytes: researchNote ? 88 : 42,
        modifiedAt: researchNote ? "unix:13" : "unix:12",
      };
    });

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll(".addon-card")).some((element) => element.textContent?.includes("Resonant Notes"))).toBe(true);
    });
    const obsidianCard = Array.from(document.querySelectorAll(".addon-card")).find((element) =>
      element.textContent?.includes("Resonant Notes"),
    )!;
    fireEvent.click(obsidianCard);
    fireEvent.click(within(obsidianCard as HTMLElement).getByRole("button", { name: "Install" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose vault" }));

    expect(await screen.findByText(/2 markdown note/i)).toBeTruthy();
    expect(screen.getByText("2 note(s) ready for review queue")).toBeTruthy();
    expect(screen.getByLabelText("2 new Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("0 changed Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("0 queued unchanged Obsidian note(s)")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Grant intake access" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Queue scanned notes" }));
    expect(await screen.findByText("Review notes before queueing")).toBeTruthy();
    expect(screen.getByLabelText("Obsidian changed note review list")).toBeTruthy();
    expect(screen.getByText("2 of 2 selected")).toBeTruthy();
    expect(screen.getByText("Architecture Note.md")).toBeTruthy();
    expect(screen.getByText("Research/Research Note.md")).toBeTruthy();
    expect(screen.getAllByText("not queued yet").length).toBe(2);
    fireEvent.click(screen.getByLabelText("Research Note"));
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Queue reviewed notes" }));

    expect(await screen.findByText(/Queued 1 Obsidian note/i)).toBeTruthy();
    expect(await screen.findByText("1 note(s) ready for review queue")).toBeTruthy();
    expect(screen.getByLabelText("1 new Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("0 changed Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("1 queued unchanged Obsidian note(s)")).toBeTruthy();
    expect(requestArchiveIntakeWriteMock).toHaveBeenCalledTimes(1);
    expect(requestArchiveIngestRequestMock).toHaveBeenCalledTimes(1);
    expect(requestArchiveIntakeWriteMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          notePath: "Research/Research Note.md",
        }),
      }),
    );
    expect(requestArchiveIntakeWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "addon.obsidian",
        bucket: "obsidian-vault-notes",
        content: expect.stringContaining("This is a raw Obsidian note intake artifact."),
        metadata: expect.objectContaining({
          origin: "obsidian-addon",
          trustBoundary: "raw-intake-only",
        }),
      }),
    );
  });

  it("uses the Obsidian sync index to mark changed and unchanged queued notes", async () => {
    const state = buildDefaultState(manifests);
    const obsidianInstallation = state.installations["addon.obsidian"];
    obsidianInstallation.installed = true;
    obsidianInstallation.enabled = true;
    obsidianInstallation.status = "enabled";
    obsidianInstallation.config = {
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      queuedIntakes: [],
      queuedNoteIndex: [
        {
          title: "Architecture Note",
          notePath: "Architecture Note.md",
          sourceModifiedAt: "unix:11",
          sourceSizeBytes: 42,
          artifactPath: "/tmp/old-architecture.md",
          requestFile: "/tmp/old-architecture.json",
          queuedAt: "unix:10",
        },
        {
          title: "Research Note",
          notePath: "Research/Research Note.md",
          sourceModifiedAt: "unix:13",
          sourceSizeBytes: 88,
          artifactPath: "/tmp/research.md",
          requestFile: "/tmp/research.json",
          queuedAt: "unix:10",
        },
      ],
    };
    hydrateStateMock.mockResolvedValueOnce(state);
    requestObsidianVaultStatusMock.mockResolvedValueOnce({
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      exists: true,
      isDirectory: true,
      obsidianConfigDetected: true,
      markdownFiles: 2,
      warnings: [],
    });
    requestObsidianNoteListMock.mockResolvedValueOnce([
      {
        title: "Architecture Note",
        relativePath: "Architecture Note.md",
        sizeBytes: 42,
        modifiedAt: "unix:12",
      },
      {
        title: "Research Note",
        relativePath: "Research/Research Note.md",
        sizeBytes: 88,
        modifiedAt: "unix:13",
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll(".addon-card")).some((element) => element.textContent?.includes("Resonant Notes"))).toBe(true);
    });
    fireEvent.click(Array.from(document.querySelectorAll(".addon-card")).find((element) => element.textContent?.includes("Resonant Notes"))!);
    fireEvent.click(await screen.findByRole("button", { name: "Scan" }));

    expect(await screen.findByText(/2 markdown note/i)).toBeTruthy();
    expect(screen.getByText("1 note(s) ready for review queue")).toBeTruthy();
    expect(screen.getByLabelText("0 new Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("1 changed Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("1 queued unchanged Obsidian note(s)")).toBeTruthy();
  });

  it("refreshes edited Obsidian notes without queueing them automatically", async () => {
    const state = buildDefaultState(manifests);
    const obsidianInstallation = state.installations["addon.obsidian"];
    obsidianInstallation.installed = true;
    obsidianInstallation.enabled = true;
    obsidianInstallation.status = "enabled";
    obsidianInstallation.config = {
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      queuedIntakes: [],
      queuedNoteIndex: [
        {
          title: "Architecture Note",
          notePath: "Architecture Note.md",
          sourceModifiedAt: "unix:12",
          sourceSizeBytes: 42,
          artifactPath: "/tmp/architecture.md",
          requestFile: "/tmp/architecture.json",
          queuedAt: "unix:10",
        },
      ],
    };
    hydrateStateMock.mockResolvedValueOnce(state);
    requestObsidianVaultStatusMock.mockResolvedValueOnce({
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      exists: true,
      isDirectory: true,
      obsidianConfigDetected: true,
      markdownFiles: 2,
      warnings: [],
    });
    requestObsidianNoteListMock.mockResolvedValueOnce([
      {
        title: "Architecture Note",
        relativePath: "Architecture Note.md",
        sizeBytes: 52,
        modifiedAt: "unix:14",
      },
      {
        title: "Fresh Note",
        relativePath: "Fresh Note.md",
        sizeBytes: 25,
        modifiedAt: "unix:14",
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Add-ons/i })[0]);
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll(".addon-card")).some((element) => element.textContent?.includes("Resonant Notes"))).toBe(true);
    });
    fireEvent.click(Array.from(document.querySelectorAll(".addon-card")).find((element) => element.textContent?.includes("Resonant Notes"))!);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh changed notes" }));

    expect(await screen.findByText("Refresh complete: 1 new note(s), 1 changed note(s).")).toBeTruthy();
    expect(screen.getByLabelText("1 new Obsidian note(s)")).toBeTruthy();
    expect(screen.getByLabelText("1 changed Obsidian note(s)")).toBeTruthy();
    expect(screen.getByText("2 note(s) ready for review queue")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Grant intake access" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Queue scanned notes" }));
    expect(await screen.findByText("Review notes before queueing")).toBeTruthy();
    expect(screen.getByText("Architecture Note.md")).toBeTruthy();
    expect(screen.getByText("Fresh Note.md")).toBeTruthy();
    expect(screen.getByText("modified time and size changed")).toBeTruthy();
    expect(screen.getByText("not queued yet")).toBeTruthy();
    expect(requestArchiveIntakeWriteMock).not.toHaveBeenCalled();
    expect(requestArchiveIngestRequestMock).not.toHaveBeenCalled();
  });

  it("opens the Resonant Notes workspace and saves a note through the audited host command", async () => {
    const state = buildDefaultState(manifests);
    const obsidianInstallation = state.installations["addon.obsidian"];
    obsidianInstallation.installed = true;
    obsidianInstallation.enabled = true;
    obsidianInstallation.status = "enabled";
    obsidianInstallation.config = {
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
    };
    obsidianInstallation.grantedCapabilities = obsidianInstallation.grantedCapabilities.map((grant) =>
      grant.capability === "filesystem" || grant.capability === "ui-embedding" ? { ...grant, granted: true } : grant,
    );
    hydrateStateMock.mockResolvedValueOnce(state);
    requestObsidianNoteListMock.mockResolvedValueOnce([
      {
        title: "Architecture Note",
        relativePath: "_MANOLO_NOTES/Architecture Note.md",
        sizeBytes: 116,
        modifiedAt: "unix:12",
      },
    ]);
    requestObsidianNoteMock.mockImplementation(async (...args: unknown[]) => {
      const notePath = String(args[1] ?? "_MANOLO_NOTES/Architecture Note.md");
      return {
        title: notePath.includes("Research") ? "Research Note" : "Architecture Note",
        relativePath: notePath,
        content: notePath.includes("Research")
        ? "# Research Note\nResearch links to [[Architecture Note]]."
        : "---\ntype: architecture\nstatus: draft\n---\n# Architecture Note\nLinks to [[Living Archive]] #resonance/system",
        sizeBytes: notePath.includes("Research") ? 88 : 116,
        modifiedAt: notePath.includes("Research") ? "unix:13" : "unix:12",
      };
    });
    requestObsidianVaultIndexMock.mockImplementation(async (_vaultPath: string, query = "") => ({
      vaultPath: "/Users/augmentor/Documents/ResonantVault",
      noteCount: 2,
      query: query || undefined,
      notes: [
        {
          title: "Architecture Note",
          relativePath: "_MANOLO_NOTES/Architecture Note.md",
          sizeBytes: 116,
          modifiedAt: "unix:12",
          tags: ["#resonance/system"],
          wikilinks: ["Living Archive"],
          backlinks: [
            {
              sourcePath: "_MANOLO_NOTES/Research Note.md",
              sourceTitle: "Research Note",
            },
          ],
          excerpt: "Links to [[Living Archive]] #resonance/system",
        },
        {
          title: "Research Note",
          relativePath: "_MANOLO_NOTES/Research Note.md",
          sizeBytes: 88,
          modifiedAt: "unix:13",
          tags: ["#archive"],
          wikilinks: ["Architecture Note"],
          backlinks: [],
          excerpt: "Research links to [[Architecture Note]].",
        },
      ].filter((note) => !query || JSON.stringify(note).toLowerCase().includes(query.toLowerCase())),
    }));
    const folderStateKey = "resonantos.obsidian.openFolders./Users/augmentor/Documents/ResonantVault";
    window.localStorage.setItem(folderStateKey, "[]");

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    expect(document.querySelector('use[href="/icons/resonant.svg#ros-resonant-notes"]')).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Resonant Notes" }));

    expect(await screen.findByTestId("obsidian-workspace")).toBeTruthy();
    expect(await screen.findByText("1 note(s)")).toBeTruthy();
    expect(await screen.findByText("_MANOLO_NOTES")).toBeTruthy();
    let fileExplorer = screen.getByLabelText("Resonant Notes file explorer");
    const folderDetails = document.querySelector(".obsidian-tree-folder") as HTMLDetailsElement;
    expect(folderDetails.hasAttribute("open")).toBe(false);
    folderDetails.open = true;
    fireEvent(folderDetails, new Event("toggle"));
    await waitFor(() => {
      expect(window.localStorage.getItem(folderStateKey)).toContain("_MANOLO_NOTES");
    });
    expect(folderDetails.hasAttribute("open")).toBe(true);
    fireEvent.contextMenu(screen.getByText("_MANOLO_NOTES"), { clientX: 42, clientY: 84 });
    let contextMenu = await screen.findByLabelText("Resonant Notes context menu");
    fireEvent.click(within(contextMenu).getByRole("menuitem", { name: "New folder" }));
    expect((screen.getByLabelText("New folder path") as HTMLInputElement).value).toBe("_MANOLO_NOTES/New Folder");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fileExplorer = screen.getByLabelText("Resonant Notes file explorer");
    const architectureNoteButton = within(fileExplorer).getByRole("button", { name: "Architecture Note" });
    fireEvent.contextMenu(architectureNoteButton, { clientX: 48, clientY: 96 });
    contextMenu = await screen.findByLabelText("Resonant Notes context menu");
    expect(within(contextMenu).getByRole("menuitem", { name: "Open" })).toBeTruthy();
    expect(within(contextMenu).getByRole("menuitem", { name: "Rename / move" })).toBeTruthy();
    expect(within(contextMenu).getByRole("menuitem", { name: "Archive" })).toBeTruthy();
    fireEvent.click(architectureNoteButton);
    await waitFor(() => {
      expect(window.localStorage.getItem("resonantos.obsidian.selectedNote./Users/augmentor/Documents/ResonantVault")).toBe(
        "_MANOLO_NOTES/Architecture Note.md",
      );
    });
    await waitFor(() => {
      expect(window.localStorage.getItem("resonantos.obsidian.openTabs./Users/augmentor/Documents/ResonantVault")).toContain(
        "_MANOLO_NOTES/Architecture Note.md",
      );
    });
    expect(screen.getByRole("button", { name: /Close Architecture Note/i })).toBeTruthy();

    let editor = await screen.findByLabelText("Resonant Notes note editor");
    const metadataPanel = screen.getByLabelText("Obsidian note metadata");
    expect(within(metadataPanel).getByText("type")).toBeTruthy();
    expect(within(metadataPanel).getByText("architecture")).toBeTruthy();
    expect(within(metadataPanel).getByText("#resonance/system")).toBeTruthy();
    expect(within(metadataPanel).getByText("[[Living Archive]]")).toBeTruthy();
    expect(screen.getByLabelText("Resonant Notes workspace status")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show backlinks" }));
    expect(await screen.findByLabelText("Resonant Notes vault index")).toBeTruthy();
    expect(screen.getAllByText("Research Note").length).toBeGreaterThan(0);
    let vaultIndexPanel = await screen.findByLabelText("Resonant Notes vault index");
    fireEvent.click(within(vaultIndexPanel).getAllByRole("button", { name: /Research Note/i }).at(-1)!);
    await waitFor(() => {
      expect(requestObsidianNoteMock).toHaveBeenLastCalledWith(
        "/Users/augmentor/Documents/ResonantVault",
        "_MANOLO_NOTES/Research Note.md",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Show search" }));
    expect(await screen.findByText("2 shown from 2 indexed note(s).")).toBeTruthy();
    vaultIndexPanel = await screen.findByLabelText("Resonant Notes vault index");
    fireEvent.click(within(vaultIndexPanel).getByRole("button", { name: /Architecture Note.md/i }));
    await waitFor(() => {
      expect(requestObsidianNoteMock).toHaveBeenLastCalledWith(
        "/Users/augmentor/Documents/ResonantVault",
        "_MANOLO_NOTES/Architecture Note.md",
      );
    });

    fireEvent.change(screen.getByLabelText("Search Obsidian-compatible vault"), {
      target: { value: "archive" },
    });
    await waitFor(() => {
      expect(requestObsidianVaultIndexMock).toHaveBeenLastCalledWith(
        "/Users/augmentor/Documents/ResonantVault",
        "archive",
        200,
      );
    });
    editor = await screen.findByLabelText("Resonant Notes note editor");

    const updatedNote =
      "---\ntype: architecture\nstatus: updated\n---\n# Architecture Note\nUpdated inside ResonantOS workspace with [[Augmentor]] #resonance/system.";
    const editorHost = document.querySelector(".obsidian-editor-host") as
      | (HTMLElement & { __resonantSetEditorValue?: (nextValue: string) => void })
      | null;
    act(() => {
      editorHost?.__resonantSetEditorValue?.(updatedNote);
    });
    await waitFor(() => {
      expect(within(metadataPanel).getByText("updated")).toBeTruthy();
    });
    expect(within(metadataPanel).getByText("[[Augmentor]]")).toBeTruthy();
    expect(screen.getByText("unsaved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(requestObsidianWriteNoteMock).toHaveBeenCalledWith({
        vaultPath: "/Users/augmentor/Documents/ResonantVault",
        notePath: "_MANOLO_NOTES/Architecture Note.md",
        content: updatedNote,
        expectedModifiedAt: "unix:12",
        actorId: "addon.obsidian",
      }),
    );
    expect(await screen.findByText(/Saved with audit/i)).toBeTruthy();
    expect(screen.getByText("synced")).toBeTruthy();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Show file explorer" }));
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    fireEvent.change(screen.getByLabelText("New note path"), {
      target: { value: "_MANOLO_NOTES/New Strategy.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(requestObsidianCreateNoteMock).toHaveBeenCalledWith({
        vaultPath: "/Users/augmentor/Documents/ResonantVault",
        notePath: "_MANOLO_NOTES/New Strategy.md",
        content: "# New Strategy\n",
        actorId: "addon.obsidian",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByLabelText("New folder path"), {
      target: { value: "_MANOLO_NOTES/Projects" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(requestObsidianCreateFolderMock).toHaveBeenCalledWith({
        vaultPath: "/Users/augmentor/Documents/ResonantVault",
        folderPath: "_MANOLO_NOTES/Projects",
        actorId: "addon.obsidian",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename note path"), {
      target: { value: "_MANOLO_NOTES/Renamed Architecture.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply rename" }));
    await waitFor(() => {
      expect(requestObsidianMoveNoteMock).toHaveBeenCalledWith({
        vaultPath: "/Users/augmentor/Documents/ResonantVault",
        fromNotePath: "_MANOLO_NOTES/Architecture Note.md",
        toNotePath: "_MANOLO_NOTES/Renamed Architecture.md",
        expectedModifiedAt: "unix:14",
        actorId: "addon.obsidian",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(requestObsidianArchiveNoteMock).toHaveBeenCalledWith({
        vaultPath: "/Users/augmentor/Documents/ResonantVault",
        notePath: "_MANOLO_NOTES/Architecture Note.md",
        expectedModifiedAt: "unix:14",
        actorId: "addon.obsidian",
      });
    });
    expect(confirmSpy).toHaveBeenCalled();
  }, 20_000);

  it("connects the Resonant Notes workspace from the gate before loading notes", async () => {
    const state = buildDefaultState(manifests);
    const obsidianInstallation = state.installations["addon.obsidian"];
    obsidianInstallation.installed = true;
    obsidianInstallation.enabled = true;
    obsidianInstallation.status = "enabled";
    obsidianInstallation.config = {};
    obsidianInstallation.grantedCapabilities = obsidianInstallation.grantedCapabilities.map((grant) => ({
      ...grant,
      granted: false,
    }));
    hydrateStateMock.mockResolvedValueOnce(state);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole("button", { name: "Resonant Notes" }));

    expect(await screen.findByText("Connect a vault before editing inside ResonantOS.")).toBeTruthy();
    expect(screen.getByText(/Next: grant filesystem access, grant workspace embedding, choose a markdown vault or folder/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect workspace" }));

    await waitFor(() => {
      expect(requestObsidianVaultFolderSelectionMock).toHaveBeenCalled();
    });
    expect(await screen.findByText("1 note(s)")).toBeTruthy();
    expect(requestObsidianVaultStatusMock).toHaveBeenCalledWith("/Users/augmentor/Documents/ResonantVault");
    expect(requestObsidianNoteListMock).toHaveBeenCalledWith("/Users/augmentor/Documents/ResonantVault", 500);
  });

  it("shows previously imported Living Archive libraries on the Start page after restart", async () => {
    requestArchiveImportedLibrariesMock.mockResolvedValue([
      {
        importedAt: "unix:10",
        domain: "mixed-library",
        importMode: "copy",
        libraryId: "resonant-os-base",
        libraryName: "RESONANT_OS_BASE",
        originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
        canonicalRoot:
          "/Users/augmentor/ResonantOS_User/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
        filesSeen: 1454,
        filesImported: 1454,
        skippedFiles: 17306,
        manifestPath:
          "/Users/augmentor/ResonantOS_User/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
        versionLedgerPath:
          "/Users/augmentor/ResonantOS_User/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-version-ledger.jsonl",
        classificationManifestPath:
          "/Users/augmentor/ResonantOS_User/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
        classificationStatus: "needs-ai-assisted-classification",
        metadataStandard: "obsidian-frontmatter-wikilinks",
        obsidianVaultDetected: false,
        recommendedAddon: "addon.obsidian",
        recordsCount: 1454,
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);

    expect(await screen.findByText("Your archive is already connected.")).toBeTruthy();
    expect(await screen.findByText("RESONANT_OS_BASE")).toBeTruthy();
    expect(await screen.findByText(new RegExp("ResonantOS_User/Memory/INTAKE/imports/mixed/sources/resonant-os-base"))).toBeTruthy();
    expect(screen.getByText("1 imported library")).toBeTruthy();
    expect(screen.queryByText("Library Importer")).toBeNull();
  });

  it("opens a host-owned mixed library classification review from the source registry", async () => {
    requestArchiveImportedLibrariesMock.mockResolvedValue([
      {
        importedAt: "unix:10",
        domain: "mixed-library",
        importMode: "copy",
        libraryId: "resonant-os-base",
        libraryName: "RESONANT_OS_BASE",
        originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
        canonicalRoot:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
        filesSeen: 2,
        filesImported: 2,
        skippedFiles: 0,
        manifestPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
        versionLedgerPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-version-ledger.jsonl",
        classificationManifestPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
        classificationStatus: "needs-ai-assisted-classification",
        metadataStandard: "obsidian-frontmatter-wikilinks",
        obsidianVaultDetected: false,
        recommendedAddon: "addon.obsidian",
        recordsCount: 2,
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open Sources section" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review Classification" }));

    expect(await screen.findByText("Approve Classification Intent")).toBeTruthy();
    expect(await screen.findByText("human approval required")).toBeTruthy();
    expect(await screen.findByText("1 waiting for full review")).toBeTruthy();
    expect(requestArchiveLibraryClassificationReviewMock).toHaveBeenCalledWith(
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve Classification Intent" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Reorganisation Plan" }));

    expect(await screen.findByText(/Generated reorganisation plan for RESONANT_OS_BASE/i)).toBeTruthy();
    expect(await screen.findByText(/Files moved by this command: 0/i)).toBeTruthy();
    expect(await screen.findByText("approval required")).toBeTruthy();
    expect(requestArchiveLibraryReorganisationPlanMock).toHaveBeenCalledWith(
      "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
      "strategist.core",
    );
  });

  it("queues an imported library for AI Memory review from the source registry", async () => {
    requestArchiveImportedLibrariesMock.mockResolvedValue([
      {
        importedAt: "unix:10",
        domain: "mixed-library",
        importMode: "copy",
        libraryId: "resonant-os-base",
        libraryName: "RESONANT_OS_BASE",
        originalPath: "/Users/augmentor/Documents/RESONANT_OS_BASE",
        canonicalRoot:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
        filesSeen: 2,
        filesImported: 2,
        skippedFiles: 0,
        manifestPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
        versionLedgerPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-version-ledger.jsonl",
        classificationManifestPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-classification-review.json",
        classificationStatus: "needs-ai-assisted-classification",
        metadataStandard: "obsidian-frontmatter-wikilinks",
        obsidianVaultDetected: false,
        recommendedAddon: "addon.obsidian",
        recordsCount: 2,
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Open Sources section" }));
    fireEvent.click(await screen.findByRole("button", { name: "Build AI Memory" }));

    await waitFor(() => {
      expect(requestArchiveAiMemoryBuildJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestPath:
            "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
          actorId: "strategist.core",
          maintenance: expect.objectContaining({
            providerId: "shared-openai",
            model: "gpt-4o",
            maxRequests: 6,
            autoPromote: true,
          }),
        }),
      );
    });
    expect(await screen.findByText(/AI Memory build: running/i)).toBeTruthy();
    expect(await screen.findByText(/1 queued · 1 processed · 1 promoted · 1 remaining/i)).toBeTruthy();
    expect(requestArchiveReviewQueueMock).toHaveBeenCalled();
    expect(requestArchiveReviewArtifactsMock).toHaveBeenCalled();
  });

  it("restores persisted AI Memory build jobs when the review desk opens", async () => {
    requestArchiveAiMemoryBuildJobsMock.mockResolvedValue([
      {
        jobId: "resonant-os-base-unix-10",
        jobFile: "/tmp/review/jobs/resonant-os-base-unix-10.json",
        status: "running",
        libraryName: "RESONANT_OS_BASE",
        manifestPath:
          "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
        startedAt: "unix:10",
        finishedAt: "unix:12",
        recordsSeen: 1454,
        queuedThisRun: 6,
        processedThisRun: 6,
        promotedThisRun: 4,
        queueRemaining: 1448,
        reviewPending: 0,
        reviewApproved: 0,
        reviewEscalated: 0,
        reviewRejected: 0,
        errors: [],
        nextAction: "Continue the AI Memory build to process the remaining queued sources.",
      },
    ]);

    render(<App />);

    expect((await screen.findAllByText("Launch your AI tools from one workbench.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Archive/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Open Review.*section/ }));

    expect(await screen.findByLabelText("AI Memory build history")).toBeTruthy();
    expect(await screen.findByText("RESONANT_OS_BASE")).toBeTruthy();
    expect(await screen.findByText(/6 queued · 6 processed · 4 promoted · 1448 remaining/i)).toBeTruthy();
    expect(requestArchiveAiMemoryBuildJobsMock).toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Continue Build" }));

    await waitFor(() => {
      expect(requestArchiveAiMemoryBuildJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestPath:
            "/Users/augmentor/Documents/RESONANT_OS_BASE/_LivingArchive/Memory/INTAKE/imports/mixed/metadata/resonant-os-base-manifest.json",
          actorId: "strategist.core",
          maintenance: expect.objectContaining({
            providerId: "shared-openai",
            model: "gpt-4o",
            maxRequests: 6,
            autoPromote: true,
          }),
        }),
      );
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
    fireEvent.click(screen.getByRole("button", { name: "Open Search section" }));
    fireEvent.change(screen.getByPlaceholderText("Search the Living Archive"), {
      target: { value: "transcript" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("TOL Transcript 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Queue ingest" }));

    expect(await screen.findByText("Queued TOL Transcript 1 for Living Archive ingest review.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Open Review/ }));
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
        model: "gpt-4o",
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
    fireEvent.click(screen.getByRole("button", { name: "Open Sources section" }));
    expect((await screen.findAllByText(/03_TOL\/TOL Analysis/)).length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole("button", { name: "Open Sources section" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Open Review section" }));
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
    expect(await screen.findByText("Recovery floor")).toBeTruthy();
    expect(await screen.findByText("Better Brain Candidates")).toBeTruthy();
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
  const requestedCapabilities =
    id === "addon.obsidian"
      ? [
          {
            capability: "filesystem" as const,
            granted: false,
            scope: "shared" as const,
            revocationBehavior: "hard-stop" as const,
          },
          {
            capability: "archive-intake-write" as const,
            granted: false,
            scope: "intake-only" as const,
            revocationBehavior: "hard-stop" as const,
          },
          {
            capability: "ui-embedding" as const,
            granted: false,
            scope: "system" as const,
            revocationBehavior: "hide-surface" as const,
          },
        ]
      : [];

  return {
    id,
    name,
    version: "0.1.0",
    author: "test",
    category,
    description: `${name} manifest`,
    runtimeType: "local-service",
    surfaces: [],
    requestedCapabilities,
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

function createBrowserManifest(): AddOnManifest {
  return {
    ...createManifest("addon.browser", "Resonant Browser", "tool"),
    sdkVersion: "0.1.0",
    description: "Controlled Chromium browser engine for visual research and future AI-controlled sessions.",
    runtimeType: "local-service",
    surfaces: [
      {
        id: "browser-pane",
        type: "embedded-pane",
        label: "Browser",
        description: "Open controlled browser sessions inside the ResonantOS workspace.",
      },
    ],
    requestedCapabilities: [
      {
        capability: "network",
        granted: false,
        scope: "shared",
        revocationBehavior: "hard-stop",
      },
      {
        capability: "ui-embedding",
        granted: false,
        scope: "system",
        revocationBehavior: "hide-surface",
      },
      {
        capability: "browser-control",
        granted: false,
        scope: "system",
        revocationBehavior: "hard-stop",
      },
      {
        capability: "filesystem",
        granted: false,
        scope: "shared",
        revocationBehavior: "hard-stop",
      },
      {
        capability: "archive-intake-write",
        granted: false,
        scope: "intake-only",
        revocationBehavior: "degrade",
      },
    ],
    delegation: {
      acceptsTasks: true,
      taskTypes: ["research", "browser-inspection"],
      artifactReturnTypes: ["summary", "markdown", "log", "citation-bundle", "diagnostic-report"],
      defaultTargetRuntime: "local-service",
      requiresHumanApprovalBeforeExecution: false,
    },
    service: {
      protocol: "host-command",
      entrypoint: "browser_start_session",
      healthCommand: "browser_engine_status",
    },
    tools: [
      {
        name: "browser.open_url",
        description: "Open a URL in Chromium and return evidence.",
        requiredCapabilities: ["network", "browser-control"],
        inputSchema: {},
        outputSchema: {},
        audit: { logRequest: true, logResult: true, artifactTypes: ["log", "citation-bundle"] },
      },
    ],
  };
}

function createOpenCodeManifest(): AddOnManifest {
  return {
    ...createManifest("addon.opencode", "OpenCode", "tool"),
    sdkVersion: "0.1.0",
    description: "Open-source coding workspace add-on hosted as a scoped optional local service.",
    runtimeType: "embedded-module",
    surfaces: [
      {
        id: "opencode-workspace",
        type: "embedded-pane",
        label: "OpenCode Workspace",
        description: "Open OpenCode's own web UI inside the ResonantOS workspace.",
      },
    ],
    requestedCapabilities: [
      {
        capability: "filesystem",
        granted: false,
        scope: "workspace",
        revocationBehavior: "hard-stop",
      },
      {
        capability: "shell",
        granted: false,
        scope: "workspace",
        revocationBehavior: "degrade",
      },
      {
        capability: "ui-embedding",
        granted: false,
        scope: "system",
        revocationBehavior: "hide-surface",
      },
    ],
    service: {
      protocol: "host-command",
      entrypoint: "opencode_start_service",
      healthCommand: "opencode_status",
      shutdownCommand: "opencode_stop_service",
    },
  };
}

function createPaperclipManifest(): AddOnManifest {
  return {
    ...createManifest("addon.paperclip", "Paperclip", "orchestration"),
    sdkVersion: "0.1.0",
    description: "Paperclip organizational runtime add-on hosted through a local loopback endpoint.",
    runtimeType: "embedded-module",
    surfaces: [
      {
        id: "paperclip-workspace",
        type: "embedded-pane",
        label: "Paperclip Workspace",
        description: "Open Paperclip's local control-plane UI inside ResonantOS.",
      },
    ],
    requestedCapabilities: [
      {
        capability: "network",
        granted: false,
        scope: "self",
        revocationBehavior: "hard-stop",
      },
      {
        capability: "ui-embedding",
        granted: false,
        scope: "system",
        revocationBehavior: "hide-surface",
      },
      {
        capability: "providers",
        granted: false,
        scope: "shared",
        revocationBehavior: "degrade",
      },
      {
        capability: "agent-delegation",
        granted: false,
        scope: "shared",
        revocationBehavior: "degrade",
      },
    ],
    providerRequirements: {
      sharedProfiles: ["shared-local"],
      supportsPrivateCredentials: false,
    },
    service: {
      protocol: "host-command",
      entrypoint: "paperclip_start_service",
      healthCommand: "paperclip_status",
      shutdownCommand: "paperclip_stop_service",
    },
  };
}
