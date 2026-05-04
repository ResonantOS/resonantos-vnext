// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md
// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AddOnManifest,
  ArchiveBackgroundCycleResult,
  ArchiveDocumentPayload,
  ArchivePromoteReviewArtifactResult,
  ArchiveProcessIngestResult,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ArchiveReviewDecisionResult,
  ArchiveTolBundleBuildResult,
  ArchiveTolBundleCandidate,
  ArchiveIngestRequestResult,
  ArchiveIngestProbeResult,
  ArchiveIntakeWriteResult,
  ArchiveImportedLibrarySummary,
  ArchiveLibraryClassificationReview,
  ArchiveLibraryReorganisationPlan,
  ArchiveLibraryImportMode,
  ArchiveLibraryImportResult,
  ArchiveLintResult,
  ArchiveLibraryPreflightResult,
  ArchiveMaintenanceCycleResult,
  ArchiveMemoryDomain,
  ArchiveRuntimeStatus,
  ArchiveSearchResult,
  ArchiveSemanticLintResult,
  ArchiveSourceFolderScanResult,
  ArchiveSystemMemoryRefreshResult,
  ArchiveSystemMemoryStatus,
  ArchiveWikiNavigationRefreshResult,
  BrowserEngineInstallResult,
  BrowserEngineStatus,
  BrowserNativeWebviewBounds,
  BrowserNativeWebviewResult,
  NativeBrowserAttachSmokeResult,
  NativeBrowserBridgeProbeResult,
  NativeBrowserProbeResult,
  BrowserCloseSessionResult,
  BrowserExtensionListResult,
  BrowserExtensionLoadResult,
  BrowserInteractionResult,
  BrowserOpenUrlResult,
  BrowserReadPageResult,
  BrowserToolCommand,
  BrowserViewportInput,
  ConversationMessage,
  DelegationPacket,
  EngineerRecoveryTurnResult,
  FinishTaskWorkspaceResult,
  HermesChatResult,
  HermesInstallStatus,
  LocalRuntimeStatus,
  LivingArchiveMemoryServiceResult,
  LivingArchiveMemoryServiceStatus,
  ObsidianNoteOperationResult,
  ObsidianNotePayload,
  ObsidianNoteSummary,
  ObsidianOpenNoteResult,
  ObsidianVaultIndex,
  ObsidianWriteNoteResult,
  ObsidianVaultStatus,
  OpenCodeLaunchMode,
  OpenCodeServiceResult,
  OpenCodeStatus,
  PaperclipServiceResult,
  PaperclipStatus,
  PaperclipDashboardSnapshot,
  PaperclipCreateIssueResult,
  ProviderDiagnosticReport,
  ProviderProfile,
  ProviderSmokeTestResult,
  RecoveryRouteCandidate,
  ResonantShellState,
  TaskWorkspace,
  TaskWorkspacePayload,
  TerminalPtySessionResult,
  TerminalRunCommandResult,
} from "./contracts";
import type { BrowserToolResult } from "./browser-tools";
import { buildDefaultState } from "./defaults";
import { renderDelegationTaskMarkdown, validateDelegationPacket } from "./delegation";
import { createInstallationSnapshot } from "./policies";
import { assertValidAddOnManifest } from "../sdk/addons";
import { createBrowserToolRunner } from "./browser-tools";

const STORAGE_KEY = "resonantos-vnext.runtime-state";

const hasTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const bundledManifestIndex = "/addons/index.json";

export const loadBundledManifests = async (): Promise<AddOnManifest[]> => {
  const response = await fetch(bundledManifestIndex);
  if (!response.ok) {
    throw new Error(`Failed to load add-on index: ${response.status}`);
  }
  const files = (await response.json()) as string[];
  const manifests = await Promise.all(
    files.map(async (file) => {
      const manifestResponse = await fetch(`/addons/${file}`);
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load add-on manifest ${file}`);
      }
      return assertValidAddOnManifest(await manifestResponse.json(), { source: "bundled", label: file });
    }),
  );
  return manifests;
};

export const loadSideloadedManifests = async (): Promise<AddOnManifest[]> => {
  if (hasTauri()) {
    const manifests = (await invoke("list_sideloaded_addons")) as unknown[];
    return manifests.map((manifest, index) =>
      assertValidAddOnManifest(manifest, { source: "sideload", label: `sideloaded add-on ${index + 1}` }),
    );
  }
  return [];
};

export const sideloadManifest = async (manifestPath: string): Promise<AddOnManifest> => {
  if (hasTauri()) {
    return assertValidAddOnManifest(await invoke("sideload_addon_manifest", { manifestPath }), {
      source: "sideload",
      label: manifestPath,
    });
  }
  throw new Error("Sideloading add-ons is available only in the desktop shell.");
};

export const loadProviderCredentialStatuses = async (): Promise<Record<string, boolean>> => {
  if (hasTauri()) {
    return (await invoke("load_provider_secret_statuses")) as Record<string, boolean>;
  }
  return {};
};

export const saveProviderSecret = async (providerId: string, apiKey: string): Promise<void> => {
  if (hasTauri()) {
    await invoke("save_provider_secret", { providerId, apiKey });
    return;
  }
  window.localStorage.setItem(`${STORAGE_KEY}.secret.${providerId}`, apiKey);
};

export const requestProviderServiceChatCompletion = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
  reasoningEffort: "minimal" | "medium" | "high";
  systemPrompt: string;
  messages: ConversationMessage[];
}): Promise<string> => {
  if (hasTauri()) {
    return (await invoke("provider_service_chat_completion", input)) as string;
  }
  throw new Error("Real Strategist chat is available only in the desktop shell.");
};

export const requestStrategistReply = requestProviderServiceChatCompletion;

export type ProviderChatStreamEvent = {
  runId: string;
  type: "chunk" | "completed" | "interrupted" | "error" | "usage";
  content: string;
};

export const requestProviderServiceChatCompletionStream = async (
  input: {
    runId: string;
    providerId: string;
    providerType: ProviderProfile["providerType"];
    apiBaseUrl?: string;
    runtimeNodeId?: string;
    runtimeNodeKind?: string;
    runtimeNodeEndpoint?: string;
    authTier?: string;
    model: string;
    reasoningEffort: "minimal" | "medium" | "high";
    systemPrompt: string;
    messages: ConversationMessage[];
  },
  onEvent: (event: ProviderChatStreamEvent) => void,
): Promise<string> => {
  if (!hasTauri()) {
    throw new Error("Streaming Strategist chat is available only in the desktop shell.");
  }

  const unlisten = await listen<ProviderChatStreamEvent>(`provider-chat-stream-${input.runId}`, (event) => {
    onEvent(event.payload);
  });
  try {
    return (await invoke("provider_service_chat_completion_stream", input)) as string;
  } finally {
    unlisten();
  }
};

export const abortProviderServiceChatCompletion = async (runId: string): Promise<void> => {
  if (hasTauri()) {
    await invoke("provider_service_abort_chat_completion", { runId });
  }
};

export const requestLocalRuntimeStatus = async (targetModel?: string): Promise<LocalRuntimeStatus> => {
  if (hasTauri()) {
    return (await invoke("local_runtime_status", { targetModel })) as LocalRuntimeStatus;
  }
  throw new Error("Local runtime diagnostics are available only in the desktop shell.");
};

export const requestEngineerRecoveryTurn = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  model: string;
  systemPrompt: string;
  messages: ConversationMessage[];
  runtimeNodeEndpoint?: string;
  authTier?: string;
}): Promise<EngineerRecoveryTurnResult> => {
  if (hasTauri()) {
    return (await invoke("engineer_recovery_turn", input)) as EngineerRecoveryTurnResult;
  }
  throw new Error("Engineer recovery tooling is available only in the desktop shell.");
};

export const requestRecoveryRouteCandidates = async (): Promise<RecoveryRouteCandidate[]> => {
  if (hasTauri()) {
    return (await invoke("recovery_route_candidates")) as RecoveryRouteCandidate[];
  }
  throw new Error("Recovery route probing is available only in the desktop shell.");
};

export const requestHermesStatus = async (profileHome?: string): Promise<HermesInstallStatus> => {
  if (hasTauri()) {
    return (await invoke("hermes_status", { profileHome })) as HermesInstallStatus;
  }
  throw new Error("Hermes compatibility audit is available only in the desktop shell.");
};

export const requestHermesChatCompletion = async (input: {
  prompt: string;
  profileHome?: string;
}): Promise<HermesChatResult> => {
  if (hasTauri()) {
    return (await invoke("hermes_chat", {
      request: {
        prompt: input.prompt,
        profileHome: input.profileHome,
      },
    })) as HermesChatResult;
  }
  throw new Error("Hermes chat bridge is available only in the desktop shell.");
};

export const requestArchiveIngestProbe = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
  sourceLabel: string;
  sourceExcerpt: string;
}): Promise<ArchiveIngestProbeResult> => {
  if (hasTauri()) {
    return (await invoke("archive_ingest_probe", input)) as ArchiveIngestProbeResult;
  }
  throw new Error("Archive ingest probing is available only in the desktop shell.");
};

export const requestArchiveRuntimeStatus = async (): Promise<ArchiveRuntimeStatus> => {
  if (hasTauri()) {
    return (await invoke("archive_runtime_status")) as ArchiveRuntimeStatus;
  }
  throw new Error("Living Archive runtime status is available only in the desktop shell.");
};

export const requestLivingArchiveMemoryServiceStatus = async (input: {
  port?: number;
  sessionId?: string;
} = {}): Promise<LivingArchiveMemoryServiceStatus> => {
  if (hasTauri()) {
    return (await invoke("living_archive_memory_service_status", { request: input })) as LivingArchiveMemoryServiceStatus;
  }
  return {
    available: false,
    running: false,
    endpoint: `http://127.0.0.1:${input.port ?? 4888}`,
    memoryRoot: "",
    sessionId: input.sessionId ?? "living-archive-memory-service",
    readonly: false,
    pid: null,
    command: "node examples/living-archive-memory-service.mjs",
    statusDetail: "Living Archive memory service controls are available only in the desktop shell.",
  };
};

export const requestLivingArchiveMemoryServiceStart = async (input: {
  port?: number;
  sessionId?: string;
  readonly?: boolean;
} = {}): Promise<LivingArchiveMemoryServiceResult> => {
  if (hasTauri()) {
    return (await invoke("living_archive_memory_service_start", { request: input })) as LivingArchiveMemoryServiceResult;
  }
  throw new Error("Living Archive memory service launch is available only in the desktop shell.");
};

export const requestLivingArchiveMemoryServiceStop = async (
  sessionId?: string,
): Promise<LivingArchiveMemoryServiceResult> => {
  if (hasTauri()) {
    return (await invoke("living_archive_memory_service_stop", { request: { sessionId } })) as LivingArchiveMemoryServiceResult;
  }
  throw new Error("Living Archive memory service shutdown is available only in the desktop shell.");
};

export const requestArchiveSourceFolderScan = async (rootPath?: string): Promise<ArchiveSourceFolderScanResult> => {
  if (hasTauri()) {
    return (await invoke("archive_scan_source_folders", { request: { rootPath } })) as ArchiveSourceFolderScanResult;
  }
  throw new Error("Living Archive source folder scanning is available only in the desktop shell.");
};

export const requestArchiveLibraryImport = async (input: {
  sourcePath: string;
  domain: ArchiveMemoryDomain;
  importMode: ArchiveLibraryImportMode;
  libraryName?: string;
  actorId: string;
  excludedTopFolders?: string[];
}): Promise<ArchiveLibraryImportResult> => {
  if (hasTauri()) {
    return (await invoke("archive_import_library", { request: input })) as ArchiveLibraryImportResult;
  }
  throw new Error("Living Archive library import is available only in the desktop shell.");
};

export const requestArchiveLibraryPreflight = async (sourcePath: string): Promise<ArchiveLibraryPreflightResult> => {
  if (hasTauri()) {
    return (await invoke("archive_preflight_library_import", { request: { sourcePath } })) as ArchiveLibraryPreflightResult;
  }
  throw new Error("Living Archive library preflight is available only in the desktop shell.");
};

export const requestArchiveImportedLibraries = async (): Promise<ArchiveImportedLibrarySummary[]> => {
  if (hasTauri()) {
    return (await invoke("archive_imported_libraries")) as ArchiveImportedLibrarySummary[];
  }
  throw new Error("Living Archive imported library registry is available only in the desktop shell.");
};

export const requestArchiveLibraryClassificationReview = async (
  classificationManifestPath: string,
): Promise<ArchiveLibraryClassificationReview> => {
  if (hasTauri()) {
    return (await invoke("archive_library_classification_review", {
      request: { classificationManifestPath },
    })) as ArchiveLibraryClassificationReview;
  }
  throw new Error("Living Archive classification review is available only in the desktop shell.");
};

export const requestArchiveLibraryReorganisationPlan = async (
  classificationManifestPath: string,
  actorId: string,
): Promise<ArchiveLibraryReorganisationPlan> => {
  if (hasTauri()) {
    return (await invoke("archive_library_reorganisation_plan", {
      request: { classificationManifestPath, actorId },
    })) as ArchiveLibraryReorganisationPlan;
  }
  throw new Error("Living Archive reorganisation planning is available only in the desktop shell.");
};

export const requestArchiveSystemMemory = async (): Promise<ArchiveSystemMemoryStatus> => {
  if (hasTauri()) {
    return (await invoke("archive_system_memory")) as ArchiveSystemMemoryStatus;
  }
  throw new Error("ResonantOS system memory status is available only in the desktop shell.");
};

export const requestArchiveSystemMemoryRefresh = async (): Promise<ArchiveSystemMemoryRefreshResult> => {
  if (hasTauri()) {
    return (await invoke("archive_refresh_system_memory")) as ArchiveSystemMemoryRefreshResult;
  }
  throw new Error("ResonantOS system memory refresh is available only in the desktop shell.");
};

export const requestArchiveLibraryFolderSelection = async (): Promise<string | null> => {
  if (hasTauri()) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose a folder or Obsidian vault for Living Archive import",
    });
    return typeof selected === "string" ? selected : null;
  }
  throw new Error("Native folder selection is available only in the desktop shell.");
};

export const requestObsidianVaultFolderSelection = async (): Promise<string | null> => {
  if (hasTauri()) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose an Obsidian vault or markdown folder",
    });
    return typeof selected === "string" ? selected : null;
  }
  throw new Error("Native vault selection is available only in the desktop shell.");
};

export const requestObsidianVaultStatus = async (vaultPath: string): Promise<ObsidianVaultStatus> => {
  if (hasTauri()) {
    return (await invoke("obsidian_vault_status", { request: { vaultPath } })) as ObsidianVaultStatus;
  }
  throw new Error("Obsidian vault status is available only in the desktop shell.");
};

export const requestObsidianNoteList = async (vaultPath: string, limit = 200): Promise<ObsidianNoteSummary[]> => {
  if (hasTauri()) {
    return (await invoke("obsidian_list_notes", { request: { vaultPath, limit } })) as ObsidianNoteSummary[];
  }
  throw new Error("Obsidian note listing is available only in the desktop shell.");
};

export const requestObsidianNote = async (vaultPath: string, notePath: string): Promise<ObsidianNotePayload> => {
  if (hasTauri()) {
    return (await invoke("obsidian_read_note", { request: { vaultPath, notePath } })) as ObsidianNotePayload;
  }
  throw new Error("Obsidian note reads are available only in the desktop shell.");
};

export const requestObsidianOpenNote = async (vaultPath: string, notePath: string): Promise<ObsidianOpenNoteResult> => {
  if (hasTauri()) {
    return (await invoke("obsidian_open_note", { request: { vaultPath, notePath } })) as ObsidianOpenNoteResult;
  }
  throw new Error("Opening Obsidian notes is available only in the desktop shell.");
};

export const requestObsidianWriteNote = async (input: {
  vaultPath: string;
  notePath: string;
  content: string;
  expectedModifiedAt?: string;
  actorId?: string;
}): Promise<ObsidianWriteNoteResult> => {
  if (hasTauri()) {
    return (await invoke("obsidian_write_note", { request: input })) as ObsidianWriteNoteResult;
  }
  throw new Error("Obsidian note writes are available only in the desktop shell.");
};

export const requestObsidianCreateNote = async (input: {
  vaultPath: string;
  notePath: string;
  content?: string;
  actorId?: string;
}): Promise<ObsidianNoteOperationResult> => {
  if (hasTauri()) {
    return (await invoke("obsidian_create_note", { request: input })) as ObsidianNoteOperationResult;
  }
  throw new Error("Obsidian note creation is available only in the desktop shell.");
};

export const requestObsidianCreateFolder = async (input: {
  vaultPath: string;
  folderPath: string;
  actorId?: string;
}): Promise<ObsidianNoteOperationResult> => {
  if (hasTauri()) {
    return (await invoke("obsidian_create_folder", { request: input })) as ObsidianNoteOperationResult;
  }
  throw new Error("Obsidian folder creation is available only in the desktop shell.");
};

export const requestObsidianMoveNote = async (input: {
  vaultPath: string;
  fromNotePath: string;
  toNotePath: string;
  expectedModifiedAt?: string;
  actorId?: string;
}): Promise<ObsidianNoteOperationResult> => {
  if (hasTauri()) {
    return (await invoke("obsidian_move_note", { request: input })) as ObsidianNoteOperationResult;
  }
  throw new Error("Obsidian note moves are available only in the desktop shell.");
};

export const requestObsidianArchiveNote = async (input: {
  vaultPath: string;
  notePath: string;
  expectedModifiedAt?: string;
  actorId?: string;
}): Promise<ObsidianNoteOperationResult> => {
  if (hasTauri()) {
    return (await invoke("obsidian_archive_note", { request: input })) as ObsidianNoteOperationResult;
  }
  throw new Error("Obsidian note archiving is available only in the desktop shell.");
};

export const requestObsidianVaultIndex = async (vaultPath: string, query = "", limit = 200): Promise<ObsidianVaultIndex> => {
  if (hasTauri()) {
    return (await invoke("obsidian_vault_index", { request: { vaultPath, query, limit } })) as ObsidianVaultIndex;
  }
  throw new Error("Obsidian vault indexing is available only in the desktop shell.");
};

export const requestOpenCodeWorkspaceFolderSelection = async (): Promise<string | null> => {
  if (hasTauri()) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose a scoped OpenCode workspace folder",
    });
    return typeof selected === "string" ? selected : null;
  }
  throw new Error("Native OpenCode workspace selection is available only in the desktop shell.");
};

export const requestOpenCodeStatus = async (): Promise<OpenCodeStatus> => {
  if (hasTauri()) {
    return (await invoke("opencode_status")) as OpenCodeStatus;
  }
  return {
    installed: false,
    installHint: "OpenCode status is available only in the desktop shell.",
    supportsWebUi: true,
    supportsServerApi: true,
  };
};

export const requestOpenCodeStartService = async (input: {
  workspacePath: string;
  port?: number;
  mode?: OpenCodeLaunchMode;
  sessionId?: string;
}): Promise<OpenCodeServiceResult> => {
  if (hasTauri()) {
    return (await invoke("opencode_start_service", { request: input })) as OpenCodeServiceResult;
  }
  throw new Error("OpenCode service launch is available only in the desktop shell.");
};

export const requestOpenCodeStopService = async (sessionId?: string): Promise<OpenCodeServiceResult> => {
  if (hasTauri()) {
    return (await invoke("opencode_stop_service", { request: { sessionId } })) as OpenCodeServiceResult;
  }
  throw new Error("OpenCode service shutdown is available only in the desktop shell.");
};

export const requestPaperclipStatus = async (endpoint?: string): Promise<PaperclipStatus> => {
  const normalizedEndpoint = endpoint?.trim() || "http://127.0.0.1:3100";
  if (hasTauri()) {
    return (await invoke("paperclip_status", { request: { endpoint: normalizedEndpoint } })) as PaperclipStatus;
  }
  return {
    installed: false,
    version: null,
    binaryPath: null,
    endpoint: normalizedEndpoint,
    endpointReachable: false,
    installHint: "Paperclip status is available only in the desktop shell.",
    supportsWebUi: true,
    supportsServerApi: true,
    managedLaunchAvailable: false,
  };
};

export const requestPaperclipStartService = async (input: {
  endpoint?: string;
  sessionId?: string;
}): Promise<PaperclipServiceResult> => {
  if (hasTauri()) {
    return (await invoke("paperclip_start_service", { request: input })) as PaperclipServiceResult;
  }
  throw new Error("Paperclip connection is available only in the desktop shell.");
};

export const requestPaperclipStopService = async (sessionId?: string): Promise<PaperclipServiceResult> => {
  if (hasTauri()) {
    return (await invoke("paperclip_stop_service", { request: { sessionId } })) as PaperclipServiceResult;
  }
  throw new Error("Paperclip disconnect is available only in the desktop shell.");
};

export const requestPaperclipDashboardSnapshot = async (input: {
  endpoint?: string;
  apiToken: string;
  companyId?: string;
}): Promise<PaperclipDashboardSnapshot> => {
  if (hasTauri()) {
    return (await invoke("paperclip_dashboard_snapshot", { request: input })) as PaperclipDashboardSnapshot;
  }
  throw new Error("Paperclip API snapshots are available only in the desktop shell.");
};

export const requestPaperclipCreateIssueFromDelegation = async (input: {
  endpoint?: string;
  apiToken: string;
  companyId: string;
  title: string;
  description: string;
  priority?: "low" | "medium" | "high" | "urgent";
  assigneeAgentId?: string;
  projectId?: string;
  goalId?: string;
  parentId?: string;
}): Promise<PaperclipCreateIssueResult> => {
  if (hasTauri()) {
    return (await invoke("paperclip_create_issue_from_delegation", { request: input })) as PaperclipCreateIssueResult;
  }
  throw new Error("Paperclip issue creation is available only in the desktop shell.");
};

export const requestBrowserOpenUrl = async (url: string, viewport?: BrowserViewportInput): Promise<BrowserOpenUrlResult> => {
  if (hasTauri()) {
    return (await invoke("browser_open_url", { request: { url, ...viewport } })) as BrowserOpenUrlResult;
  }
  throw new Error("Chromium Browser engine is available only in the desktop shell.");
};

export const requestBrowserEngineStatus = async (): Promise<BrowserEngineStatus> => {
  if (hasTauri()) {
    return (await invoke("browser_engine_status")) as BrowserEngineStatus;
  }
  throw new Error("Chromium Browser engine status is available only in the desktop shell.");
};

export const requestBrowserInstallEngine = async (): Promise<BrowserEngineInstallResult> => {
  if (hasTauri()) {
    return (await invoke("browser_install_engine")) as BrowserEngineInstallResult;
  }
  throw new Error("Chromium Browser engine install is available only in the desktop shell.");
};

export const requestBrowserNativeWebviewShow = async (input: {
  url: string;
  bounds: BrowserNativeWebviewBounds;
  navigate: boolean;
}): Promise<BrowserNativeWebviewResult> => {
  if (hasTauri()) {
    return (await invoke("browser_native_webview_show", {
      request: { url: input.url, ...input.bounds, navigate: input.navigate },
    })) as BrowserNativeWebviewResult;
  }
  throw new Error("Native Browser webview is available only in the desktop shell.");
};

export const requestBrowserNativeWebviewResize = async (bounds: BrowserNativeWebviewBounds): Promise<BrowserNativeWebviewResult> => {
  if (hasTauri()) {
    return (await invoke("browser_native_webview_resize", { request: bounds })) as BrowserNativeWebviewResult;
  }
  throw new Error("Native Browser webview resize is available only in the desktop shell.");
};

export const requestBrowserNativeWebviewHide = async (): Promise<BrowserNativeWebviewResult> => {
  if (hasTauri()) {
    return (await invoke("browser_native_webview_hide")) as BrowserNativeWebviewResult;
  }
  throw new Error("Native Browser webview hide is available only in the desktop shell.");
};

export const requestNativeBrowserProbe = async (engineCandidate = "cef-chrome-runtime"): Promise<NativeBrowserProbeResult> => {
  if (hasTauri()) {
    return (await invoke("browser_native_probe", {
      request: { engineCandidate },
    })) as NativeBrowserProbeResult;
  }
  return {
    status: "blocked",
    engineCandidate,
    hostBinaryStatus: "missing",
    sourceScaffoldStatus: "missing",
    embeddedViewStatus: "blocked",
    extensionCompatibilityStatus: "blocked",
    phantomStatus: "blocked",
    bitwardenStatus: "blocked",
    blockers: [
      "Native Browser probing is available only in the desktop shell.",
      "Phantom Wallet and Bitwarden compatibility must be proven in the native host before Browser is ready.",
    ],
    nextActions: [
      "Run this probe from the Tauri desktop shell.",
      "Build the native embedded Browser host behind the ADR-025 contract.",
    ],
    checkedAt: "browser-probe:web-preview",
  };
};

export const requestNativeBrowserAttachSmoke = async (
  hostIntegrationMode = "external-process",
): Promise<NativeBrowserAttachSmokeResult> => {
  if (hasTauri()) {
    return (await invoke("browser_native_attach_smoke", {
      request: { hostIntegrationMode },
    })) as NativeBrowserAttachSmokeResult;
  }
  return {
    status: "blocked",
    platform: "web-preview",
    parentHandleKind: "none",
    parentHandlePresent: false,
    hostIntegrationMode,
    blocker: "Native Browser attachment can only be smoke-tested inside the Tauri desktop shell.",
    nextActions: ["Run the attach smoke test from the ResonantOS desktop shell."],
    checkedAt: "browser-attach-smoke:web-preview",
  };
};

export const requestNativeBrowserBridgeProbe = async (
  integrationMode = "in-process-native-library",
): Promise<NativeBrowserBridgeProbeResult> => {
  if (hasTauri()) {
    return (await invoke("browser_native_bridge_probe", {
      request: { integrationMode },
    })) as NativeBrowserBridgeProbeResult;
  }
  return {
    status: "missing",
    integrationMode,
    bridgeLibraryStatus: "missing",
    cAbiStatus: "blocked",
    bridgeLibraryPath: null,
    exportedSymbols: [],
    blockers: ["Native Browser bridge probing is available only in the Tauri desktop shell."],
    nextActions: ["Run the bridge probe from the ResonantOS desktop shell."],
    checkedAt: "browser-bridge-probe:web-preview",
  };
};

export const requestBrowserStartSession = async (url: string, viewport?: BrowserViewportInput): Promise<BrowserOpenUrlResult> => {
  if (hasTauri()) {
    return (await invoke("browser_start_session", { request: { url, ...viewport } })) as BrowserOpenUrlResult;
  }
  throw new Error("Chromium Browser engine is available only in the desktop shell.");
};

export const requestBrowserSessionOpenUrl = async (sessionId: string, url: string, viewport?: BrowserViewportInput): Promise<BrowserOpenUrlResult> => {
  if (hasTauri()) {
    return (await invoke("browser_session_open_url", { request: { sessionId, url, ...viewport } })) as BrowserOpenUrlResult;
  }
  throw new Error("Chromium Browser engine is available only in the desktop shell.");
};

export const requestBrowserSessionScreenshot = async (sessionId: string, viewport?: BrowserViewportInput): Promise<BrowserOpenUrlResult> => {
  if (hasTauri()) {
    return (await invoke("browser_session_screenshot", { request: { sessionId, ...viewport } })) as BrowserOpenUrlResult;
  }
  throw new Error("Chromium Browser engine is available only in the desktop shell.");
};

export const requestBrowserSessionReadPage = async (sessionId: string): Promise<BrowserReadPageResult> => {
  if (hasTauri()) {
    return (await invoke("browser_session_read_page", { request: { sessionId } })) as BrowserReadPageResult;
  }
  throw new Error("Chromium Browser engine is available only in the desktop shell.");
};

export const requestBrowserSessionClick = async (
  sessionId: string,
  x: number,
  y: number,
  viewport?: BrowserViewportInput,
): Promise<BrowserInteractionResult> => {
  if (hasTauri()) {
    return (await invoke("browser_session_click", { request: { sessionId, x, y, ...viewport } })) as BrowserInteractionResult;
  }
  throw new Error("Chromium Browser click control is available only in the desktop shell.");
};

export const requestBrowserSessionScroll = async (
  sessionId: string,
  deltaX: number,
  deltaY: number,
  viewport?: BrowserViewportInput,
): Promise<BrowserInteractionResult> => {
  if (hasTauri()) {
    return (await invoke("browser_session_scroll", { request: { sessionId, deltaX, deltaY, ...viewport } })) as BrowserInteractionResult;
  }
  throw new Error("Chromium Browser scroll control is available only in the desktop shell.");
};

export const requestBrowserCloseSession = async (sessionId: string): Promise<BrowserCloseSessionResult> => {
  if (hasTauri()) {
    return (await invoke("browser_close_session", { request: { sessionId } })) as BrowserCloseSessionResult;
  }
  throw new Error("Chromium Browser engine is available only in the desktop shell.");
};

export const requestBrowserHostCommand = async (command: BrowserToolCommand): Promise<BrowserToolResult> => {
  if (hasTauri()) {
    const { type, params, humanApproved } = command;
    const method =
      type === "start"
        ? "browser.start"
        : type === "open_url"
          ? "browser.open_url"
          : type === "read_page"
            ? "browser.read_page"
            : type === "click"
              ? "browser.click"
              : type === "type"
                ? "browser.type"
                : type === "capture_evidence"
                  ? "browser.capture_evidence"
                  : type === "close"
                    ? "browser.close_session"
                    : type === "extensions_list"
                      ? "browser.extensions.list"
                      : type === "extensions_load_unpacked"
                        ? "browser.extensions.load_unpacked"
                        : type === "extensions_set_pinned"
                          ? "browser.extensions.set_pinned"
                          : type === "extensions_disable"
                            ? "browser.extensions.disable"
                          : "browser.health";
    return (await invoke("browser_host_command", {
      request: { method, params: params ?? {}, humanApproved: Boolean(humanApproved) },
    })) as BrowserToolResult;
  }
  throw new Error("Governed Browser host commands are available only in the desktop shell.");
};

export const requestBrowserVisibleHostCommand = async (command: BrowserToolCommand): Promise<BrowserToolResult> => {
  if (hasTauri()) {
    const { type, params, humanApproved } = command;
    const method =
      type === "start"
        ? "browser.start"
        : type === "open_url"
          ? "browser.open_url"
          : type === "read_page"
            ? "browser.read_page"
            : type === "click"
              ? "browser.click"
              : type === "type"
                ? "browser.type"
                : type === "close"
                  ? "browser.close_session"
                  : type === "extensions_list"
                    ? "browser.extensions.list"
                    : type === "extensions_load_unpacked"
                      ? "browser.extensions.load_unpacked"
                      : type === "extensions_set_pinned"
                        ? "browser.extensions.set_pinned"
                        : type === "extensions_disable"
                          ? "browser.extensions.disable"
                          : "browser.health";
    return (await invoke("browser_visible_host_command", {
      request: { method, params: params ?? {}, humanApproved: Boolean(humanApproved) },
    })) as BrowserToolResult;
  }
  throw new Error("Visible Browser v2 host commands are available only in the desktop shell.");
};

export const requestBrowserExtensionFolderSelection = async (): Promise<string | null> => {
  if (hasTauri()) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose an unpacked Chrome extension folder",
    });
    return typeof selected === "string" ? selected : null;
  }
  throw new Error("Native extension folder selection is available only in the desktop shell.");
};

export const createDesktopBrowserToolRunner = (input: {
  manifest: AddOnManifest | undefined;
  installation: ResonantShellState["installations"][string] | undefined;
}) =>
  createBrowserToolRunner({
    manifest: input.manifest,
    installation: input.installation,
    transport: {
      call: async (method, params, options) =>
        (await invoke("browser_host_command", {
          request: { method, params, humanApproved: Boolean(options?.humanApproved) },
        })) as BrowserToolResult,
    },
  });

export const requestTerminalStatus = async (): Promise<string> => {
  if (hasTauri()) {
    return (await invoke("terminal_status")) as string;
  }
  throw new Error("Terminal is available only in the desktop shell.");
};

export const requestTerminalRunCommand = async (input: {
  command: string;
  cwd?: string;
}): Promise<TerminalRunCommandResult> => {
  if (hasTauri()) {
    return (await invoke("terminal_run_command", { request: input })) as TerminalRunCommandResult;
  }
  throw new Error("Terminal is available only in the desktop shell.");
};

export const requestTerminalStartPty = async (input: {
  sessionId: string;
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}): Promise<TerminalPtySessionResult> => {
  if (hasTauri()) {
    return (await invoke("terminal_start_pty", { request: input })) as TerminalPtySessionResult;
  }
  throw new Error("Interactive Terminal is available only in the desktop shell.");
};

export const requestTerminalWritePty = async (input: { sessionId: string; data: string }): Promise<void> => {
  if (hasTauri()) {
    await invoke("terminal_write_pty", { request: input });
    return;
  }
  throw new Error("Interactive Terminal is available only in the desktop shell.");
};

export const requestTerminalResizePty = async (input: { sessionId: string; cols: number; rows: number }): Promise<void> => {
  if (hasTauri()) {
    await invoke("terminal_resize_pty", { request: input });
    return;
  }
  throw new Error("Interactive Terminal is available only in the desktop shell.");
};

export const requestTerminalStopPty = async (sessionId: string): Promise<void> => {
  if (hasTauri()) {
    await invoke("terminal_stop_pty", { sessionId });
  }
};

export const requestArchiveSearch = async (query: string, limit = 12): Promise<ArchiveSearchResult> => {
  if (hasTauri()) {
    return (await invoke("archive_search", { request: { query, limit } })) as ArchiveSearchResult;
  }
  throw new Error("Living Archive search is available only in the desktop shell.");
};

export const requestArchiveDocument = async (path: string): Promise<ArchiveDocumentPayload> => {
  if (hasTauri()) {
    return (await invoke("archive_read_document", { request: { path } })) as ArchiveDocumentPayload;
  }
  throw new Error("Living Archive document reads are available only in the desktop shell.");
};

export const requestArchiveIntakeWrite = async (input: {
  actorId: string;
  bucket: string;
  fileName: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<ArchiveIntakeWriteResult> => {
  if (hasTauri()) {
    return (await invoke("archive_write_intake_artifact", { request: input })) as ArchiveIntakeWriteResult;
  }
  throw new Error("Living Archive intake writes are available only in the desktop shell.");
};

export const requestArchiveIngestRequest = async (input: {
  actorId: string;
  sourcePath: string;
  sourceType: string;
  sourceRole?: string;
  intent: string;
  provenance?: Record<string, unknown>;
}): Promise<ArchiveIngestRequestResult> => {
  if (hasTauri()) {
    return (await invoke("archive_request_ingest", { request: input })) as ArchiveIngestRequestResult;
  }
  throw new Error("Living Archive ingest requests are available only in the desktop shell.");
};

export const requestArchiveReviewQueue = async (): Promise<ArchiveQueuedIngestRequest[]> => {
  if (hasTauri()) {
    return (await invoke("archive_review_queue")) as ArchiveQueuedIngestRequest[];
  }
  throw new Error("Living Archive review queue is available only in the desktop shell.");
};

export const requestArchiveReviewArtifacts = async (): Promise<ArchiveReviewArtifact[]> => {
  if (hasTauri()) {
    return (await invoke("archive_review_artifacts")) as ArchiveReviewArtifact[];
  }
  throw new Error("Living Archive review artifacts are available only in the desktop shell.");
};

export const requestArchiveTolBundleCandidates = async (): Promise<ArchiveTolBundleCandidate[]> => {
  if (hasTauri()) {
    return (await invoke("archive_tol_bundle_candidates")) as ArchiveTolBundleCandidate[];
  }
  throw new Error("Audio2TOL bundle detection is available only in the desktop shell.");
};

export const requestArchiveBuildTolBundle = async (input: {
  sessionId: string;
  actorId: string;
}): Promise<ArchiveTolBundleBuildResult> => {
  if (hasTauri()) {
    return (await invoke("archive_build_tol_bundle", { request: input })) as ArchiveTolBundleBuildResult;
  }
  throw new Error("Audio2TOL bundle intake is available only in the desktop shell.");
};

export const requestArchiveProcessIngestRequest = async (input: {
  requestFile: string;
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
  verifierProviderId?: string;
  verifierProviderType?: ProviderProfile["providerType"];
  verifierApiBaseUrl?: string;
  verifierRuntimeNodeId?: string;
  verifierRuntimeNodeKind?: string;
  verifierRuntimeNodeEndpoint?: string;
  verifierAuthTier?: string;
  verifierModel?: string;
}): Promise<ArchiveProcessIngestResult> => {
  if (hasTauri()) {
    return (await invoke("archive_process_ingest_request", { request: input })) as ArchiveProcessIngestResult;
  }
  throw new Error("Living Archive ingest processing is available only in the desktop shell.");
};

export const requestArchiveMaintenanceCycle = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
  verifierProviderId?: string;
  verifierProviderType?: ProviderProfile["providerType"];
  verifierApiBaseUrl?: string;
  verifierRuntimeNodeId?: string;
  verifierRuntimeNodeKind?: string;
  verifierRuntimeNodeEndpoint?: string;
  verifierAuthTier?: string;
  verifierModel?: string;
  maxRequests?: number;
  autoPromote?: boolean;
  actorId?: string;
}): Promise<ArchiveMaintenanceCycleResult> => {
  if (hasTauri()) {
    return (await invoke("archive_maintenance_cycle", { request: input })) as ArchiveMaintenanceCycleResult;
  }
  throw new Error("Living Archive maintenance cycles are available only in the desktop shell.");
};

export const requestArchiveBackgroundCycle = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
  verifierProviderId?: string;
  verifierProviderType?: ProviderProfile["providerType"];
  verifierApiBaseUrl?: string;
  verifierRuntimeNodeId?: string;
  verifierRuntimeNodeKind?: string;
  verifierRuntimeNodeEndpoint?: string;
  verifierAuthTier?: string;
  verifierModel?: string;
  maxRequests?: number;
  autoPromote?: boolean;
  actorId?: string;
  rootPath?: string;
}): Promise<ArchiveBackgroundCycleResult> => {
  if (hasTauri()) {
    return (await invoke("archive_background_cycle", { request: input })) as ArchiveBackgroundCycleResult;
  }
  throw new Error("Living Archive background cycles are available only in the desktop shell.");
};

export const requestArchiveWikiNavigationRefresh = async (): Promise<ArchiveWikiNavigationRefreshResult> => {
  if (hasTauri()) {
    return (await invoke("archive_refresh_wiki_navigation")) as ArchiveWikiNavigationRefreshResult;
  }
  throw new Error("Living Archive wiki navigation refresh is available only in the desktop shell.");
};

export const requestArchiveLint = async (): Promise<ArchiveLintResult> => {
  if (hasTauri()) {
    return (await invoke("archive_lint")) as ArchiveLintResult;
  }
  throw new Error("Living Archive lint is available only in the desktop shell.");
};

export const requestArchiveSemanticLint = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
  maxCandidates?: number;
}): Promise<ArchiveSemanticLintResult> => {
  if (hasTauri()) {
    return (await invoke("archive_semantic_lint", { request: input })) as ArchiveSemanticLintResult;
  }
  throw new Error("Living Archive semantic lint is available only in the desktop shell.");
};

export const requestArchiveReviewDecision = async (input: {
  artifactFile: string;
  actorId: string;
  action: "approve" | "reject" | "escalate";
  notes?: string;
}): Promise<ArchiveReviewDecisionResult> => {
  if (hasTauri()) {
    return (await invoke("archive_review_decision", { request: input })) as ArchiveReviewDecisionResult;
  }
  throw new Error("Living Archive review decisions are available only in the desktop shell.");
};

export const requestArchivePromoteReviewArtifact = async (input: {
  artifactFile: string;
  actorId: string;
}): Promise<ArchivePromoteReviewArtifactResult> => {
  if (hasTauri()) {
    return (await invoke("archive_promote_review_artifact", { request: input })) as ArchivePromoteReviewArtifactResult;
  }
  throw new Error("Trusted Living Archive promotion is available only in the desktop shell.");
};

export const requestProviderDiagnostics = async (providerId?: string): Promise<ProviderDiagnosticReport[]> => {
  if (hasTauri()) {
    return (await invoke("provider_diagnostics", { providerId })) as ProviderDiagnosticReport[];
  }
  throw new Error("Provider diagnostics are available only in the desktop shell.");
};

export const requestProviderSmokeTest = async (input: {
  providerId: string;
  providerType: ProviderProfile["providerType"];
  apiBaseUrl?: string;
  runtimeNodeId?: string;
  runtimeNodeKind?: string;
  runtimeNodeEndpoint?: string;
  authTier?: string;
  model: string;
}): Promise<ProviderSmokeTestResult> => {
  if (hasTauri()) {
    return (await invoke("provider_smoke_test", input)) as ProviderSmokeTestResult;
  }
  throw new Error("Provider smoke tests are available only in the desktop shell.");
};

const readPersistedState = async (): Promise<ResonantShellState | null> => {
  if (hasTauri()) {
    return ((await invoke("load_runtime_state")) as ResonantShellState | null) ?? null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as ResonantShellState;
};

export const persistState = async (state: ResonantShellState): Promise<void> => {
  if (hasTauri()) {
    await invoke("save_runtime_state", { state });
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const openFloatingChatWindow = async (): Promise<void> => {
  if (!hasTauri()) {
    throw new Error("Floating chat windows are available only in the desktop shell.");
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = "floating-chat";
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("surface", "floating-chat");

  const floatingWindow = new WebviewWindow(label, {
    url: `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    title: "Augmentor Chat",
    width: 620,
    height: 860,
    minWidth: 420,
    minHeight: 620,
    resizable: true,
    decorations: true,
  });

  await new Promise<void>((resolve, reject) => {
    const unlistenCreated = floatingWindow.once("tauri://created", () => {
      void unlistenCreated.then((unlisten) => unlisten());
      void unlistenError.then((unlisten) => unlisten());
      resolve();
    });
    const unlistenError = floatingWindow.once<string>("tauri://error", (event) => {
      void unlistenCreated.then((unlisten) => unlisten());
      void unlistenError.then((unlisten) => unlisten());
      reject(new Error(event.payload || "Failed to open floating chat window."));
    });
  });
};

export const subscribeRuntimeStateUpdates = async (
  onState: (state: ResonantShellState) => void,
): Promise<() => void> => {
  if (!hasTauri()) {
    return () => undefined;
  }
  return listen<ResonantShellState>("runtime-state-updated", (event) => onState(event.payload));
};

export const requestCreateTaskWorkspace = async (packet: DelegationPacket): Promise<TaskWorkspace> => {
  const validation = validateDelegationPacket(packet);
  if (!validation.valid) {
    const errors = validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join("; ");
    throw new Error(`Delegation packet is invalid: ${errors}`);
  }
  const taskMarkdown = renderDelegationTaskMarkdown(packet);
  if (hasTauri()) {
    return (await invoke("delegation_create_task_workspace", {
      request: {
        packet,
        taskMarkdown,
      },
    })) as TaskWorkspace;
  }
  throw new Error("Task workspace creation is available only in the desktop shell.");
};

export const requestListTaskWorkspaces = async (): Promise<TaskWorkspace[]> => {
  if (hasTauri()) {
    return (await invoke("delegation_list_task_workspaces")) as TaskWorkspace[];
  }
  throw new Error("Task workspace listing is available only in the desktop shell.");
};

export const requestReadTaskWorkspace = async (workspaceId: string): Promise<TaskWorkspacePayload> => {
  if (hasTauri()) {
    return (await invoke("delegation_read_task_workspace", {
      request: {
        workspaceId,
      },
    })) as TaskWorkspacePayload;
  }
  throw new Error("Task workspace reads are available only in the desktop shell.");
};

export const requestFinishTaskWorkspace = async (input: {
  workspaceId: string;
  resultMarkdown: string;
  verification: Record<string, unknown>;
  auditEvent: Record<string, unknown>;
}): Promise<FinishTaskWorkspaceResult> => {
  if (hasTauri()) {
    return (await invoke("delegation_finish_task_workspace", { request: input })) as FinishTaskWorkspaceResult;
  }
  throw new Error("Task workspace finalization is available only in the desktop shell.");
};

export const hydrateState = async (bundled: AddOnManifest[], sideloaded: AddOnManifest[]): Promise<ResonantShellState> => {
  const manifests = [...bundled, ...sideloaded];
  const base = buildDefaultState(bundled);
  const persisted = await readPersistedState();

  if (!persisted) {
    const next = rebaseStateOnManifests(base, manifests, sideloaded.map((manifest) => manifest.id));
    await persistState(next);
    return next;
  }

  const next = rebaseStateOnManifests(normalizeState(persisted, base), manifests, sideloaded.map((manifest) => manifest.id));
  await persistState(next);
  return next;
};

export const rebaseStateOnManifests = (
  state: ResonantShellState,
  manifests: AddOnManifest[],
  sideloadedIds: string[],
): ResonantShellState => {
  const installations = { ...state.installations };
  for (const manifest of manifests) {
    installations[manifest.id] = createInstallationSnapshot(
      manifest,
      installations[manifest.id],
      sideloadedIds.includes(manifest.id) ? "sideload" : "bundled",
    );
  }

  for (const installation of Object.values(installations)) {
    if (sideloadedIds.includes(installation.addonId)) {
      installation.source = "sideload";
    }
  }

  return { ...state, installations };
};

export const applyProviderCredentialStatuses = (
  state: ResonantShellState,
  credentialStatuses: Record<string, boolean>,
): ResonantShellState => ({
  ...state,
  providers: state.providers.map((profile) => ({
    ...profile,
    credentialStatus: credentialStatuses[profile.id] ? "configured" : profile.providerType === "local" ? "configured" : "missing",
  })),
});

const mergeById = <T extends { id: string }>(persisted: T[] | undefined, defaults: T[]): T[] => {
  const persistedById = new Map((persisted ?? []).map((item) => [item.id, item]));
  return defaults.map((item) => ({ ...item, ...persistedById.get(item.id) }));
};

const mergeConversationThreads = (
  persisted: ResonantShellState["conversationThreads"] | undefined,
  defaults: ResonantShellState["conversationThreads"],
): ResonantShellState["conversationThreads"] => {
  const persistedById = new Map((persisted ?? []).map((thread) => [thread.id, thread]));
  const defaultThreads = defaults.map((thread) => ({ ...thread, ...(persistedById.get(thread.id) ?? {}) }));
  const defaultIds = new Set(defaults.map((thread) => thread.id));
  const extraPersistedThreads = (persisted ?? []).filter((thread) => !defaultIds.has(thread.id));
  return [...defaultThreads, ...extraPersistedThreads];
};

const normalizeProviders = (
  persisted: ResonantShellState["providers"] | undefined,
  defaults: ResonantShellState["providers"],
): ResonantShellState["providers"] =>
  defaults.map((profile) => {
    const current = persisted?.find((item) => item.id === profile.id);
    if (!current) {
      return profile;
    }
    const primaryModel = profile.allowedModels.includes(current.primaryModel) ? current.primaryModel : profile.primaryModel;
    const fallbackModel =
      current.fallbackModel && profile.allowedModels.includes(current.fallbackModel)
        ? current.fallbackModel
        : profile.fallbackModel;
    return {
      ...profile,
      ...current,
      allowedModels: profile.allowedModels,
      modelContext: profile.modelContext,
      consumerScopes: profile.consumerScopes,
      authMethod: profile.authMethod,
      authTier: profile.authTier,
      providerType: profile.providerType,
      primaryModel,
      fallbackModel,
    };
  });

const normalizeRuntimeNodes = (
  persisted: ResonantShellState["runtimeNodes"] | undefined,
  defaults: ResonantShellState["runtimeNodes"],
): ResonantShellState["runtimeNodes"] =>
  defaults.map((node) => {
    const current = persisted?.find((item) => item.id === node.id);
    if (!current) {
      return node;
    }
    return {
      ...node,
      ...current,
      kind: node.kind,
      locality: node.locality,
      supportedModels: node.supportedModels,
      authTier: node.authTier,
      deployableOnDemand: node.deployableOnDemand,
      notes: node.notes,
    };
  });

const normalizeAgents = (
  persisted: ResonantShellState["agents"] | undefined,
  defaults: ResonantShellState["agents"],
): ResonantShellState["agents"] => {
  const byId = new Map((persisted ?? []).map((agent) => [agent.id, agent]));
  const legacyEngineer = byId.get("engineer.core");
  return defaults.map((agent) => {
    const current = byId.get(agent.id);
    if (agent.id === "setup.core") {
      const providerProfileId =
        current?.providerProfileId === "shared-minimax" && legacyEngineer?.providerProfileId
          ? legacyEngineer.providerProfileId
          : current?.providerProfileId ?? legacyEngineer?.providerProfileId ?? agent.providerProfileId;
      const fallbackProviderProfileId =
        current?.providerProfileId === "shared-minimax" && legacyEngineer?.fallbackProviderProfileId
          ? legacyEngineer.fallbackProviderProfileId
          : current?.fallbackProviderProfileId ?? legacyEngineer?.fallbackProviderProfileId ?? agent.fallbackProviderProfileId;
      return {
        ...agent,
        ...(legacyEngineer ?? current ?? {}),
        id: "setup.core",
        displayName: agent.displayName,
        providerProfileId,
        fallbackProviderProfileId,
        archiveReadScopes: agent.archiveReadScopes,
        archiveIntakeWriteScopes: agent.archiveIntakeWriteScopes,
        channelIds: agent.channelIds,
      };
    }
    return {
      ...agent,
      ...(current ?? {}),
      id: agent.id,
      channelIds: agent.channelIds,
      archiveReadScopes: agent.archiveReadScopes,
      archiveIntakeWriteScopes: agent.archiveIntakeWriteScopes,
    };
  });
};

const normalizeChannels = (
  installations: ResonantShellState["installations"],
  persisted: ResonantShellState["channels"] | undefined,
  defaults: ResonantShellState["channels"],
): ResonantShellState["channels"] =>
  defaults.map((channel) => {
    const current = persisted?.find((item) => item.id === channel.id);
    const addonId = channel.metadata.addonId ?? current?.metadata?.addonId;
    const addonEnabled = addonId ? installations[addonId]?.enabled === true : true;
    return {
      ...channel,
      ...(current ?? {}),
      owningAgentId: channel.owningAgentId,
      workspaceId: channel.workspaceId,
      label: channel.label,
      enabled: addonId ? Boolean((current ?? channel).enabled && addonEnabled) : (current?.enabled ?? channel.enabled),
      metadata: { ...channel.metadata, ...(current?.metadata ?? {}) },
    };
  });

const normalizeWorkspaces = (
  persisted: ResonantShellState["workspaces"] | undefined,
  defaults: ResonantShellState["workspaces"],
): ResonantShellState["workspaces"] =>
  defaults.map((workspace) => {
    const current = persisted?.find((item) => item.id === workspace.id);
    return {
      ...workspace,
      ...(current ?? {}),
      owningEntityId: workspace.owningEntityId,
      channelIds: workspace.channelIds,
      surfaces: workspace.surfaces,
      title: workspace.title,
    };
  });

const mergeInstallations = (
  persisted: ResonantShellState["installations"] | undefined,
  defaults: ResonantShellState["installations"],
): ResonantShellState["installations"] =>
  Object.fromEntries(
    Object.entries(defaults).map(([addonId, installation]) => [
      addonId,
      {
        ...installation,
        ...(persisted?.[addonId] ?? {}),
      },
    ]),
  );

const normalizeProviderRouting = (
  persisted: ResonantShellState["providerRouting"] | undefined,
  defaults: ResonantShellState["providerRouting"],
): ResonantShellState["providerRouting"] => ({
  ...defaults,
  ...(persisted ?? {}),
  executionAdapters: defaults.executionAdapters.map((defaultAdapter) => ({
    ...defaultAdapter,
    ...(persisted?.executionAdapters ?? []).find((adapter) => adapter.id === defaultAdapter.id),
    supportsStreaming:
      (persisted?.executionAdapters ?? []).find((adapter) => adapter.id === defaultAdapter.id)?.supportsStreaming ??
      defaultAdapter.supportsStreaming,
    supportsAbort:
      (persisted?.executionAdapters ?? []).find((adapter) => adapter.id === defaultAdapter.id)?.supportsAbort ??
      defaultAdapter.supportsAbort,
  })),
  fallbackPolicies: persisted?.fallbackPolicies?.length ? persisted.fallbackPolicies : defaults.fallbackPolicies,
  recoveryActions: persisted?.recoveryActions?.length ? persisted.recoveryActions : defaults.recoveryActions,
  experimentalPolicy: {
    ...defaults.experimentalPolicy,
    ...(persisted?.experimentalPolicy ?? {}),
  },
});

const normalizeModelStrategy = (
  persisted: ResonantShellState["modelStrategy"] | undefined,
  defaults: ResonantShellState["modelStrategy"],
): ResonantShellState["modelStrategy"] => ({
  ...defaults,
  ...(persisted ?? {}),
  fallbackChains: persisted?.fallbackChains?.length ? persisted.fallbackChains : defaults.fallbackChains,
  workloadStrategies: persisted?.workloadStrategies?.length ? persisted.workloadStrategies : defaults.workloadStrategies,
  emergencyPolicy: {
    ...defaults.emergencyPolicy,
    ...(persisted?.emergencyPolicy ?? {}),
    orderedPromotionTargets:
      persisted?.emergencyPolicy?.orderedPromotionTargets?.length
        ? persisted.emergencyPolicy.orderedPromotionTargets
        : defaults.emergencyPolicy.orderedPromotionTargets,
    hardFloorRoute: persisted?.emergencyPolicy?.hardFloorRoute ?? defaults.emergencyPolicy.hardFloorRoute,
  },
});

const normalizeArchivePolicy = (
  persisted: ResonantShellState["archivePolicy"] | undefined,
  defaults: ResonantShellState["archivePolicy"],
): ResonantShellState["archivePolicy"] => ({
  ...defaults,
  ...(persisted ?? {}),
  approvalPolicy: {
    ...defaults.approvalPolicy,
    ...(persisted?.approvalPolicy ?? {}),
    autoApproveIntents:
      persisted?.approvalPolicy?.autoApproveIntents?.length
        ? persisted.approvalPolicy.autoApproveIntents
        : defaults.approvalPolicy.autoApproveIntents,
    humanReviewSourceTypes:
      persisted?.approvalPolicy?.humanReviewSourceTypes?.length
        ? persisted.approvalPolicy.humanReviewSourceTypes
        : defaults.approvalPolicy.humanReviewSourceTypes,
    humanReviewPageTypes:
      persisted?.approvalPolicy?.humanReviewPageTypes?.length
        ? persisted.approvalPolicy.humanReviewPageTypes
        : defaults.approvalPolicy.humanReviewPageTypes,
    notes: persisted?.approvalPolicy?.notes?.length ? persisted.approvalPolicy.notes : defaults.approvalPolicy.notes,
  },
  actorPolicies: persisted?.actorPolicies?.length ? persisted.actorPolicies : defaults.actorPolicies,
  notes: persisted?.notes?.length ? persisted.notes : defaults.notes,
});

export const normalizeState = (state: ResonantShellState, base: ResonantShellState): ResonantShellState => {
  const installations = mergeInstallations(state.installations, base.installations);
  return {
    ...base,
    ...state,
    strategistIdentity: { ...base.strategistIdentity, ...state.strategistIdentity },
    uiPreferences: {
      ...base.uiPreferences,
      ...(state.uiPreferences ?? {}),
      activeSection:
        !state.uiPreferences?.activeChatThreadId && state.uiPreferences?.activeSection === "overview"
          ? "strategist"
          : (state.uiPreferences?.activeSection ?? base.uiPreferences.activeSection),
      activeChatThreadId: state.uiPreferences?.activeChatThreadId ?? base.uiPreferences.activeChatThreadId,
      pinnedChatThreadIds: state.uiPreferences?.pinnedChatThreadIds ?? base.uiPreferences.pinnedChatThreadIds,
      pinnedChatProjectIds: state.uiPreferences?.pinnedChatProjectIds ?? base.uiPreferences.pinnedChatProjectIds,
      leftSidebarOpen: state.uiPreferences?.leftSidebarOpen ?? base.uiPreferences.leftSidebarOpen,
      chatSidebarOpen: state.uiPreferences?.chatSidebarOpen ?? base.uiPreferences.chatSidebarOpen,
      workspaceLayout: state.uiPreferences?.workspaceLayout ?? base.uiPreferences.workspaceLayout,
      chatSidebarWidth: state.uiPreferences?.chatSidebarWidth ?? base.uiPreferences.chatSidebarWidth,
      chatHistoryOpen: state.uiPreferences?.chatHistoryOpen ?? base.uiPreferences.chatHistoryOpen,
      recommendedAddOnsReviewed:
        state.uiPreferences?.recommendedAddOnsReviewed ?? base.uiPreferences.recommendedAddOnsReviewed,
      windowZoom: state.uiPreferences?.windowZoom ?? base.uiPreferences.windowZoom,
      browserWorkspace: {
        ...base.uiPreferences.browserWorkspace,
        ...(state.uiPreferences?.browserWorkspace ?? {}),
        controlledSession: {
          ...base.uiPreferences.browserWorkspace.controlledSession,
          ...(state.uiPreferences?.browserWorkspace?.controlledSession ?? {}),
        },
      },
    },
    coreServices: mergeById(state.coreServices, base.coreServices),
    providers: normalizeProviders(state.providers, base.providers),
    runtimeNodes: normalizeRuntimeNodes(state.runtimeNodes, base.runtimeNodes),
    providerRouting: normalizeProviderRouting(state.providerRouting, base.providerRouting),
    modelStrategy: normalizeModelStrategy(state.modelStrategy, base.modelStrategy),
    agents: normalizeAgents(state.agents, base.agents),
    channels: normalizeChannels(installations, state.channels, base.channels),
    workspaces: normalizeWorkspaces(state.workspaces, base.workspaces),
    archivePolicy: normalizeArchivePolicy(state.archivePolicy, base.archivePolicy),
    chatProjects: state.chatProjects ?? base.chatProjects,
    conversationThreads: mergeConversationThreads(state.conversationThreads, base.conversationThreads),
    transcriptLedger: state.transcriptLedger ?? base.transcriptLedger,
    contextMemoryStates: state.contextMemoryStates ?? base.contextMemoryStates,
    recoverySession: {
      ...base.recoverySession,
      ...(state.recoverySession ?? {}),
      engineerAgentId: base.recoverySession.engineerAgentId,
      engineerThreadId: base.recoverySession.engineerThreadId,
      checklist: state.recoverySession?.checklist ?? base.recoverySession.checklist,
      changeLog: state.recoverySession?.changeLog ?? base.recoverySession.changeLog,
    },
    installations,
  };
};
