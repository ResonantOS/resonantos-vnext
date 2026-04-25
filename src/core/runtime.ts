// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md
// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AddOnManifest,
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
  ArchiveLibraryImportMode,
  ArchiveLibraryImportResult,
  ArchiveMemoryDomain,
  ArchiveRuntimeStatus,
  ArchiveSearchResult,
  ArchiveSourceFolderScanResult,
  ArchiveSystemMemoryRefreshResult,
  ArchiveSystemMemoryStatus,
  ConversationMessage,
  DelegationPacket,
  EngineerRecoveryTurnResult,
  FinishTaskWorkspaceResult,
  LocalRuntimeStatus,
  ProviderDiagnosticReport,
  ProviderProfile,
  RecoveryRouteCandidate,
  ResonantShellState,
  TaskWorkspace,
  TaskWorkspacePayload,
} from "./contracts";
import { buildDefaultState } from "./defaults";
import { renderDelegationTaskMarkdown, validateDelegationPacket } from "./delegation";
import { createInstallationSnapshot } from "./policies";

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
      return (await manifestResponse.json()) as AddOnManifest;
    }),
  );
  return manifests;
};

export const loadSideloadedManifests = async (): Promise<AddOnManifest[]> => {
  if (hasTauri()) {
    return (await invoke("list_sideloaded_addons")) as AddOnManifest[];
  }
  return [];
};

export const sideloadManifest = async (manifestPath: string): Promise<AddOnManifest> => {
  if (hasTauri()) {
    return (await invoke("sideload_addon_manifest", { manifestPath })) as AddOnManifest;
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
}): Promise<ArchiveLibraryImportResult> => {
  if (hasTauri()) {
    return (await invoke("archive_import_library", { request: input })) as ArchiveLibraryImportResult;
  }
  throw new Error("Living Archive library import is available only in the desktop shell.");
};

export const requestArchiveImportedLibraries = async (): Promise<ArchiveImportedLibrarySummary[]> => {
  if (hasTauri()) {
    return (await invoke("archive_imported_libraries")) as ArchiveImportedLibrarySummary[];
  }
  throw new Error("Living Archive imported library registry is available only in the desktop shell.");
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
}): Promise<ArchiveProcessIngestResult> => {
  if (hasTauri()) {
    return (await invoke("archive_process_ingest_request", { request: input })) as ArchiveProcessIngestResult;
  }
  throw new Error("Living Archive ingest processing is available only in the desktop shell.");
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
  persisted: ResonantShellState["channels"] | undefined,
  defaults: ResonantShellState["channels"],
): ResonantShellState["channels"] =>
  defaults.map((channel) => {
    const current = persisted?.find((item) => item.id === channel.id);
    return {
      ...channel,
      ...(current ?? {}),
      owningAgentId: channel.owningAgentId,
      workspaceId: channel.workspaceId,
      label: channel.label,
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

export const normalizeState = (state: ResonantShellState, base: ResonantShellState): ResonantShellState =>
  ({
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
      leftSidebarOpen: state.uiPreferences?.leftSidebarOpen ?? base.uiPreferences.leftSidebarOpen,
      chatSidebarOpen: state.uiPreferences?.chatSidebarOpen ?? base.uiPreferences.chatSidebarOpen,
      chatSidebarWidth: state.uiPreferences?.chatSidebarWidth ?? base.uiPreferences.chatSidebarWidth,
    },
    coreServices: mergeById(state.coreServices, base.coreServices),
    providers: normalizeProviders(state.providers, base.providers),
    runtimeNodes: normalizeRuntimeNodes(state.runtimeNodes, base.runtimeNodes),
    providerRouting: normalizeProviderRouting(state.providerRouting, base.providerRouting),
    modelStrategy: normalizeModelStrategy(state.modelStrategy, base.modelStrategy),
    agents: normalizeAgents(state.agents, base.agents),
    channels: normalizeChannels(state.channels, base.channels),
    workspaces: normalizeWorkspaces(state.workspaces, base.workspaces),
    archivePolicy: normalizeArchivePolicy(state.archivePolicy, base.archivePolicy),
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
    installations: mergeInstallations(state.installations, base.installations),
  });
