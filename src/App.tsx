// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-003-engineering-standards.md

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  AddOnManifest,
  ArchiveDocumentPayload,
  ArchivePromoteReviewArtifactResult,
  ArchiveProcessIngestResult,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ArchiveReviewDecisionResult,
  ArchiveLibraryImportResult,
  ArchiveLibraryImportMode,
  ArchiveMemoryDomain,
  ArchiveSourceFolderScanResult,
  ArchiveSourceWatchRecord,
  ArchiveTolBundleBuildResult,
  ArchiveTolBundleCandidate,
  ArchiveIngestProbeResult,
  ArchiveRuntimeStatus,
  ArchiveSearchResult,
  ConversationMessage,
  ChatRunPhase,
  LocalRuntimeStatus,
  ProviderDiagnosticReport,
  RecoveryRouteCandidate,
  ResonantShellState,
} from "./core/contracts";
import {
  appendTranscriptEvent,
  branchTranscriptPayload,
  compactThreadContext,
  copyCompactStatesForFork,
  messageTranscriptPayload,
} from "./core/context-memory";
import { routedProviderLabel } from "./core/provider-service";
import { abortProviderServiceChatCompletion, persistState } from "./core/runtime";
import {
  executeSideloadManifest,
  toggleAddonCapabilityGrant,
  toggleAddonInstallation,
} from "./modules/addons/controller";
import {
  executeArchiveIngestProbe,
  executeArchiveSearch,
  buildArchiveTolBundle,
  decideArchiveReviewArtifact,
  importArchiveLibrary,
  loadArchiveTolBundles,
  loadArchiveDocument,
  loadArchiveReviewQueue,
  loadArchiveRuntimeStatus,
  pickArchiveLibraryFolder,
  processArchiveQueuedRequest,
  promoteArchiveReviewArtifact,
  queueArchiveSourceForIngest,
  queueWatchedArchiveSourceForIngest,
  scanArchiveSourceFolders,
} from "./modules/archive/controller";
import {
  attachComposerFiles,
  BrowserSpeechRecognition,
  removeComposerAttachment,
  toggleComposerDictation,
} from "./modules/chat/composer-controller";
import { saveChatMessageToArchiveIntake } from "./modules/chat/archive-intake-controller";
import { executeChatTurn } from "./modules/chat/controller";
import { StrategistChatRail } from "./modules/chat/StrategistChatRail";
import type { ComposerAttachment, ThinkingDepth } from "./modules/chat/types";
import { Panel } from "./components/Panel";
import { ArchiveWorkspace } from "./modules/archive/ArchiveWorkspace";
import { AddOnsWorkspace } from "./modules/addons/AddOnsWorkspace";
import { OverviewWorkspace } from "./modules/overview/OverviewWorkspace";
import { promoteRecoveryRoute, RECOVERY_RUNBOOK_PROMPT, setRecoveryMode } from "./modules/recovery/controller";
import { RecoveryWorkspace } from "./modules/recovery/RecoveryWorkspace";
import { loadInitialShellState, loadRecoveryRuntimeSnapshot } from "./modules/shell/controller";
import { buildShellViewModel, resolveActiveProviderForSelection } from "./modules/shell/selectors";
import {
  executeRefreshProviderDiagnostics,
  executeSaveProviderSecret,
  updateProviderProfile,
} from "./modules/settings/controller";
import { SettingsWorkspace, type SettingsSection } from "./modules/settings/SettingsWorkspace";
import {
  activateChatThread,
  createNewStrategistChat,
  renameStrategistIdentity,
  toggleStrategistChannel,
} from "./modules/strategist/controller";
import { StrategistWorkspace } from "./modules/strategist/StrategistWorkspace";

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; state: ResonantShellState; bundled: AddOnManifest[]; sideloaded: AddOnManifest[] }
  | { phase: "error"; message: string };

type Section = ResonantShellState["uiPreferences"]["activeSection"];
type DockIconId = "home" | "archive" | "addons" | "agent" | "settings";

const navItems: Array<{ id: Section; label: string; eyebrow: string; icon: DockIconId; pinned?: boolean }> = [
  { id: "overview", label: "Home", eyebrow: "apps", icon: "home", pinned: true },
  { id: "archive", label: "Living Archive", eyebrow: "memory", icon: "archive", pinned: true },
  { id: "addons", label: "Add-ons", eyebrow: "catalog", icon: "addons", pinned: true },
  { id: "strategist", label: "Agent Identity", eyebrow: "identity", icon: "agent" },
  { id: "settings", label: "Settings", eyebrow: "system", icon: "settings", pinned: true },
];

const clampChatWidth = (width: number): number => Math.min(720, Math.max(560, Math.round(width)));

const errorMessageOf = (error: unknown, fallback: string): string =>
  typeof error === "string" ? error : error instanceof Error ? error.message : fallback;

export function App() {
  const [loadState, setLoadState] = useState<LoadState>({ phase: "loading" });
  const [search, setSearch] = useState("");
  const [sideloadPath, setSideloadPath] = useState("");
  const [selectedAddonId, setSelectedAddonId] = useState<string>("");
  const [composer, setComposer] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatRunPhase, setChatRunPhase] = useState<ChatRunPhase>("idle");
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, string>>({});
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("providers");
  const [providerDiagnostics, setProviderDiagnostics] = useState<ProviderDiagnosticReport[]>([]);
  const [providerDiagnosticsBusy, setProviderDiagnosticsBusy] = useState(false);
  const [activeProviderProbeId, setActiveProviderProbeId] = useState<string | null>(null);
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>("high");
  const [selectedChatModel, setSelectedChatModel] = useState<string>("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [dictating, setDictating] = useState(false);
  const [agentActivityLabel, setAgentActivityLabel] = useState("Standing by.");
  const [systemClockLabel, setSystemClockLabel] = useState(() =>
    new Date().toLocaleString([], {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }),
  );
  const [recoveryRuntimeStatus, setRecoveryRuntimeStatus] = useState<LocalRuntimeStatus | null>(null);
  const [recoveryCandidates, setRecoveryCandidates] = useState<RecoveryRouteCandidate[]>([]);
  const [archiveStatusBusy, setArchiveStatusBusy] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveRuntimeStatus | null>(null);
  const [archiveSearchBusy, setArchiveSearchBusy] = useState(false);
  const [archiveSearchResult, setArchiveSearchResult] = useState<ArchiveSearchResult | null>(null);
  const [archiveDocumentBusy, setArchiveDocumentBusy] = useState(false);
  const [archiveDocument, setArchiveDocument] = useState<ArchiveDocumentPayload | null>(null);
  const [archiveQueueBusy, setArchiveQueueBusy] = useState(false);
  const [archiveQueue, setArchiveQueue] = useState<ArchiveQueuedIngestRequest[]>([]);
  const [archiveReviewArtifacts, setArchiveReviewArtifacts] = useState<ArchiveReviewArtifact[]>([]);
  const [archiveProcessResult, setArchiveProcessResult] = useState<ArchiveProcessIngestResult | null>(null);
  const [archiveReviewDecisionResult, setArchiveReviewDecisionResult] = useState<ArchiveReviewDecisionResult | null>(null);
  const [archivePromotionResult, setArchivePromotionResult] = useState<ArchivePromoteReviewArtifactResult | null>(null);
  const [archiveTolBundles, setArchiveTolBundles] = useState<ArchiveTolBundleCandidate[]>([]);
  const [archiveTolBundleResult, setArchiveTolBundleResult] = useState<ArchiveTolBundleBuildResult | null>(null);
  const [archiveSourceScanBusy, setArchiveSourceScanBusy] = useState(false);
  const [archiveSourceScanResult, setArchiveSourceScanResult] = useState<ArchiveSourceFolderScanResult | null>(null);
  const [archiveLibraryImportResult, setArchiveLibraryImportResult] = useState<ArchiveLibraryImportResult | null>(null);
  const [archiveProbeBusy, setArchiveProbeBusy] = useState(false);
  const [archiveProbeResult, setArchiveProbeResult] = useState<{
    probe: ArchiveIngestProbeResult;
    routeLabel: string;
    model: string;
    resolutionReason: string;
  } | null>(null);
  const chatScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const activeChatRunTokenRef = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const activeProviderForSelection = resolveActiveProviderForSelection(
    loadState.phase === "ready" ? loadState.state : null,
    selectedChatModel,
    loadState.phase === "ready" ? loadState.state.uiPreferences.activeChatThreadId : undefined,
  );

  useEffect(() => {
    void (async () => {
      try {
        const booted = await loadInitialShellState();
        setLoadState({
          phase: "ready",
          state: booted.state,
          bundled: booted.bundled,
          sideloaded: booted.sideloaded,
        });
        setSelectedAddonId(booted.selectedAddonId);
      } catch (error) {
        setLoadState({
          phase: "error",
          message: errorMessageOf(error, "Failed to boot ResonantOS vNext."),
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (loadState.phase !== "ready" || !loadState.state.uiPreferences.chatSidebarOpen) {
      return;
    }
    const activeAgentId = loadState.state.recoverySession.active ? loadState.state.recoverySession.engineerAgentId : "strategist.core";
    const visibleThreads = loadState.state.conversationThreads.filter((thread) => thread.owningAgentId === activeAgentId);
    const activeThread =
      visibleThreads.find((thread) => thread.id === loadState.state.uiPreferences.activeChatThreadId) ?? visibleThreads[0] ?? null;
    if (!activeThread) {
      return;
    }
    chatScrollAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [loadState]);

  useEffect(() => {
    if (!activeProviderForSelection) {
      return;
    }
    if (!selectedChatModel || !activeProviderForSelection.allowedModels.includes(selectedChatModel)) {
      setSelectedChatModel(activeProviderForSelection.primaryModel);
    }
  }, [activeProviderForSelection, selectedChatModel]);

  useEffect(() => {
    if (loadState.phase !== "ready" || !loadState.state.recoverySession.active) {
      setRecoveryRuntimeStatus(null);
      setRecoveryCandidates([]);
      return;
    }

    void (async () => {
      try {
        const snapshot = await loadRecoveryRuntimeSnapshot(loadState.state);
        setRecoveryRuntimeStatus(snapshot.status);
        setRecoveryCandidates(snapshot.candidates);
      } catch {
        setRecoveryRuntimeStatus(null);
        setRecoveryCandidates([]);
      }
    })();
  }, [loadState]);

  useEffect(() => {
    if (loadState.phase !== "ready" || settingsSection !== "providers" || providerDiagnostics.length) {
      return;
    }
    void refreshProviderDiagnostics();
  }, [loadState, settingsSection, providerDiagnostics.length]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSystemClockLabel(
        new Date().toLocaleString([], {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "short",
        }),
      );
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (loadState.phase !== "ready") {
      return;
    }
    if (loadState.state.uiPreferences.activeSection !== "archive" || loadState.state.recoverySession.active) {
      return;
    }
    if (archiveStatusBusy || archiveStatus) {
      return;
    }
    void refreshArchiveRuntime();
  }, [loadState, archiveStatusBusy, archiveStatus]);

  useEffect(() => {
    if (loadState.phase !== "ready") {
      return;
    }
    if (loadState.state.uiPreferences.activeSection !== "archive" || loadState.state.recoverySession.active) {
      return;
    }
    if (archiveQueueBusy || archiveQueue.length) {
      return;
    }
    void refreshArchiveQueue();
  }, [loadState, archiveQueueBusy, archiveQueue.length]);

  if (loadState.phase === "loading") {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <p className="eyebrow">ResonantOS vNext</p>
          <h1>Booting the new shell.</h1>
          <p>
            Loading the core runtime, Living Archive policy, provider vault, and bundled add-on manifests.
          </p>
        </div>
      </div>
    );
  }

  if (loadState.phase === "error") {
    return (
      <div className="boot-screen">
        <div className="boot-card error">
          <p className="eyebrow">Boot failed</p>
          <h1>ResonantOS did not initialize.</h1>
          <p>{loadState.message}</p>
        </div>
      </div>
    );
  }

  const { state, bundled, sideloaded } = loadState;
  const cloneState = (current: ResonantShellState): ResonantShellState =>
    JSON.parse(JSON.stringify(current)) as ResonantShellState;
  const commitReadyState = (nextState: ResonantShellState, nextSideloaded = sideloaded) => {
    setLoadState({ phase: "ready", state: nextState, bundled, sideloaded: nextSideloaded });
    void persistState(nextState);
  };
  const updateRuntimeState = (updater: (current: ResonantShellState) => ResonantShellState) => {
    const nextState = updater(cloneState(state));
    commitReadyState(nextState);
  };
  const {
    allManifests,
    filteredManifests,
    currentSection,
    displayedStrategistName,
    selectedManifest,
    selectedInstallation,
    recoveryModeActive,
    visibleThreads,
    activeThread,
    activeThreadChannel,
    strategist,
    engineerAgent,
    strategistRoute,
    activeRoute,
    activeProvider,
    activeRuntimeNode,
    activeChatModel,
    strategistRecoveryActive,
    contextUsageRatio,
    contextUsageLabel,
    contextUsageTitle,
    dictationAvailable,
  } = buildShellViewModel({
    state,
    bundled,
    sideloaded,
    deferredSearch,
    selectedAddonId,
    composer,
    attachments,
    selectedChatModel,
  });

  const setSection = (section: Section) => {
    startTransition(() => {
      updateRuntimeState((draft) => {
        draft.uiPreferences.activeSection = section;
        return draft;
      });
    });
  };

  const toggleChatSidebar = () => {
    updateRuntimeState((draft) => {
      draft.uiPreferences.chatSidebarOpen = !draft.uiPreferences.chatSidebarOpen;
      return draft;
    });
  };

  const branchChatFromMessage = (message: ConversationMessage) => {
    if (!activeThread || message.threadId !== activeThread.id) {
      return;
    }

    updateRuntimeState((draft) => {
      const sourceThread = draft.conversationThreads.find((thread) => thread.id === activeThread.id);
      if (!sourceThread) {
        return draft;
      }

      const messageIndex = sourceThread.messages.findIndex((item) => item.id === message.id);
      if (messageIndex < 0) {
        return draft;
      }

      const forkId = `thread-fork-${Date.now()}`;
      const forkedMessages = sourceThread.messages.slice(0, messageIndex + 1).map((item) => ({
        ...item,
        threadId: forkId,
      }));
      const forkThread = {
        ...sourceThread,
        id: forkId,
        title: `${sourceThread.title} fork`,
        summary: `Forked after ${message.author}'s message.`,
        messages: forkedMessages,
      };
      draft.conversationThreads.push(forkThread);
      draft.contextMemoryStates = copyCompactStatesForFork(
        draft.contextMemoryStates ?? [],
        sourceThread.id,
        forkThread,
        message.id,
      );
      draft.uiPreferences.activeChatThreadId = forkId;
      return appendTranscriptEvent(draft, {
        action: "thread-branched",
        threadId: forkId,
        channelId: forkThread.channelId,
        agentId: forkThread.owningAgentId,
        sourceThreadId: sourceThread.id,
        sourceMessageId: message.id,
        payload: branchTranscriptPayload(sourceThread, forkThread, message.id),
      });
    });
    setComposer("");
    setAttachments([]);
    setChatNotice("Branched this conversation into a new chat.");
  };

  const editUserMessage = (message: ConversationMessage) => {
    if (message.role !== "user") {
      return;
    }

    setComposer(message.content);
    updateRuntimeState((draft) =>
      appendTranscriptEvent(draft, {
        action: "message-edit-requested",
        threadId: message.threadId,
        channelId: message.channelId,
        messageId: message.id,
        role: message.role,
        agentId: activeThread?.owningAgentId,
        payload: messageTranscriptPayload(message),
      }),
    );
    setChatNotice("Message loaded into the composer. Edit and send when ready.");
  };

  const deleteChatMessage = (message: ConversationMessage) => {
    updateRuntimeState((draft) => {
      const targetThread = draft.conversationThreads.find((thread) => thread.id === message.threadId);
      if (!targetThread) {
        return draft;
      }

      targetThread.messages = targetThread.messages.filter((item) => item.id !== message.id);
      return appendTranscriptEvent(draft, {
        action: "message-deleted",
        threadId: message.threadId,
        channelId: message.channelId,
        messageId: message.id,
        role: message.role,
        agentId: targetThread.owningAgentId,
        payload: messageTranscriptPayload(message),
      });
    });
    setChatNotice("Message deleted from this chat.");
  };

  const togglePinnedChatThread = (threadId: string) => {
    updateRuntimeState((draft) => {
      const pinned = new Set(draft.uiPreferences.pinnedChatThreadIds ?? []);
      if (pinned.has(threadId)) {
        pinned.delete(threadId);
      } else {
        pinned.add(threadId);
      }
      draft.uiPreferences.pinnedChatThreadIds = Array.from(pinned);
      return draft;
    });
  };

  const branchChatThread = (threadId: string) => {
    updateRuntimeState((draft) => {
      const sourceThread = draft.conversationThreads.find((thread) => thread.id === threadId);
      if (!sourceThread) {
        return draft;
      }

      const forkId = `thread-fork-${Date.now()}`;
      const forkThread = {
        ...sourceThread,
        id: forkId,
        title: `${sourceThread.title} fork`,
        summary: `Forked from ${sourceThread.title}.`,
        messages: sourceThread.messages.map((message) => ({
          ...message,
          id: `${forkId}:${message.id.split(":").at(-1) ?? "m"}`,
          threadId: forkId,
        })),
      };
      draft.conversationThreads.unshift(forkThread);
      draft.contextMemoryStates = copyCompactStatesForFork(
        draft.contextMemoryStates ?? [],
        sourceThread.id,
        forkThread,
      );
      draft.uiPreferences.activeChatThreadId = forkId;
      draft.uiPreferences.pinnedChatThreadIds = (draft.uiPreferences.pinnedChatThreadIds ?? []).filter((id) => id !== forkId);
      return appendTranscriptEvent(draft, {
        action: "thread-branched",
        threadId: forkId,
        channelId: forkThread.channelId,
        agentId: forkThread.owningAgentId,
        sourceThreadId: sourceThread.id,
        payload: branchTranscriptPayload(sourceThread, forkThread),
      });
    });
    setComposer("");
    setAttachments([]);
    setChatNotice("Chat branched into a new thread.");
  };

  const deleteChatThread = (threadId: string) => {
    updateRuntimeState((draft) => {
      if (draft.conversationThreads.length <= 1) {
        return draft;
      }

      const remainingThreads = draft.conversationThreads.filter((thread) => thread.id !== threadId);
      if (remainingThreads.length === draft.conversationThreads.length) {
        return draft;
      }

      draft.conversationThreads = remainingThreads;
      draft.uiPreferences.pinnedChatThreadIds = (draft.uiPreferences.pinnedChatThreadIds ?? []).filter((id) => id !== threadId);
      if (draft.uiPreferences.activeChatThreadId === threadId) {
        const sameAgentThread = remainingThreads.find((thread) => thread.owningAgentId === activeThread?.owningAgentId);
        draft.uiPreferences.activeChatThreadId = sameAgentThread?.id ?? remainingThreads[0]?.id ?? "";
      }
      return draft;
    });
    setComposer("");
    setAttachments([]);
    setChatNotice("Chat deleted.");
  };

  const compactActiveChatContext = () => {
    if (!activeThread) {
      setChatNotice("No active chat is available to compact.");
      return;
    }

    let preservedSummary = "";
    updateRuntimeState((draft) => {
      const nextState = compactThreadContext(draft, activeThread.id);
      const compactState = nextState.contextMemoryStates.at(-1);
      if (compactState?.threadId === activeThread.id) {
        preservedSummary = [
          `${compactState.preservedRecentMessageIds.length} recent message${compactState.preservedRecentMessageIds.length === 1 ? "" : "s"}`,
          `${compactState.decisions.length} decision${compactState.decisions.length === 1 ? "" : "s"}`,
          `${compactState.openTasks.length} task${compactState.openTasks.length === 1 ? "" : "s"}`,
          `${compactState.preferences.length} preference${compactState.preferences.length === 1 ? "" : "s"}`,
          `${compactState.artifacts.length} artifact${compactState.artifacts.length === 1 ? "" : "s"}`,
        ].join(", ");
      }
      return nextState;
    });
    setChatNotice(
      preservedSummary
        ? `Context compacted. Preserved ${preservedSummary}, plus user intent and rationale.`
        : "Context compaction did not run because this thread was not found.",
    );
  };

  const selectChatAgent = (agentId: string) => {
    const nextThread = state.conversationThreads.find((thread) => thread.owningAgentId === agentId);
    if (!nextThread) {
      setChatNotice("No chat thread exists for that agent yet.");
      return;
    }

    activateChatThread(nextThread.id, updateRuntimeState, setComposer, setChatNotice, setAttachments);
  };

  const startChatRailResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (loadState.phase !== "ready") {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = loadState.state.uiPreferences.chatSidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampChatWidth(startWidth + startX - moveEvent.clientX);
      setLoadState((current) => {
        if (current.phase !== "ready") {
          return current;
        }

        return {
          ...current,
          state: {
            ...current.state,
            uiPreferences: {
              ...current.state.uiPreferences,
              chatSidebarWidth: nextWidth,
            },
          },
        };
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      setLoadState((current) => {
        if (current.phase !== "ready") {
          return current;
        }

        void persistState(current.state);
        return current;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleSaveProviderSecret = async (profileId: string) => {
    await executeSaveProviderSecret({
      snapshot: { state, bundled, sideloaded },
      profileId,
      secret: providerDrafts[profileId] ?? "",
      commitReadyState,
      updateRuntimeState,
      setProviderDrafts,
      setSettingsNotice,
      setProviderDiagnosticsBusy,
      setActiveProviderProbeId,
      setProviderDiagnostics,
      errorMessageOf,
    });
  };

  const refreshProviderDiagnostics = async (providerId?: string) => {
    await executeRefreshProviderDiagnostics({
      snapshot: { state, bundled, sideloaded },
      providerId,
      commitReadyState,
      updateRuntimeState,
      setProviderDiagnosticsBusy,
      setActiveProviderProbeId,
      setProviderDiagnostics,
      setSettingsNotice,
      errorMessageOf,
    });
  };

  const refreshArchiveRuntime = async () => {
    await loadArchiveRuntimeStatus({
      setChatNotice,
      setArchiveStatusBusy,
      setArchiveStatus,
      errorMessageOf,
    });
  };

  const refreshArchiveQueue = async () => {
    await loadArchiveReviewQueue({
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveQueue,
      setArchiveReviewArtifacts,
      errorMessageOf,
    });
  };

  const runArchiveSearch = async (query: string) => {
    await executeArchiveSearch({
      query,
      setChatNotice,
      setArchiveSearchBusy,
      setArchiveSearchResult,
      errorMessageOf,
    });
  };

  const queueArchiveSource = async (source: ArchiveSearchResult["sources"][number]) => {
    await queueArchiveSourceForIngest({
      source,
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveQueue,
      setArchiveReviewArtifacts,
      errorMessageOf,
    });
  };

  const queueWatchedArchiveSource = async (source: ArchiveSourceWatchRecord) => {
    await queueWatchedArchiveSourceForIngest({
      source,
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveQueue,
      setArchiveReviewArtifacts,
      errorMessageOf,
    });
  };

  const runArchiveSourceFolderScan = async (rootPath?: string) => {
    await scanArchiveSourceFolders({
      rootPath,
      setChatNotice,
      setArchiveSourceScanBusy,
      setArchiveSourceScanResult,
      errorMessageOf,
    });
  };

  const runArchiveLibraryImport = async (input: {
    sourcePath: string;
    domain: ArchiveMemoryDomain;
    importMode: ArchiveLibraryImportMode;
    libraryName?: string;
  }) => {
    await importArchiveLibrary({
      ...input,
      setChatNotice,
      setArchiveSourceScanBusy,
      setArchiveLibraryImportResult,
      errorMessageOf,
    });
  };

  const runPickArchiveLibraryFolder = async (): Promise<string | null> =>
    pickArchiveLibraryFolder({
      setChatNotice,
      errorMessageOf,
    });

  const runArchiveQueuedRequest = async (requestFile: string) => {
    await processArchiveQueuedRequest({
      snapshot: { state, bundled, sideloaded },
      requestFile,
      commitReadyState,
      setProviderDiagnostics,
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveQueue,
      setArchiveProcessResult,
      setArchiveReviewArtifacts,
      errorMessageOf,
    });
  };

  const runArchiveReviewDecision = async (
    artifactFile: string,
    action: "approve" | "reject" | "escalate",
    actorId: string,
  ) => {
    await decideArchiveReviewArtifact({
      artifactFile,
      action,
      actorId,
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveReviewArtifacts,
      setArchiveReviewDecisionResult,
      errorMessageOf,
    });
  };

  const runArchivePromotion = async (artifactFile: string) => {
    await promoteArchiveReviewArtifact({
      artifactFile,
      actorId: "archive-ingest.core",
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveReviewArtifacts,
      setArchivePromotionResult,
      errorMessageOf,
    });
  };

  const refreshArchiveTolBundles = async () => {
    await loadArchiveTolBundles({
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveTolBundles,
      errorMessageOf,
    });
  };

  const runArchiveTolBundleBuild = async (sessionId: string) => {
    await buildArchiveTolBundle({
      sessionId,
      setChatNotice,
      setArchiveQueueBusy,
      setArchiveTolBundles,
      setArchiveQueue,
      setArchiveReviewArtifacts,
      setArchiveTolBundleResult,
      errorMessageOf,
    });
  };

  const openArchiveDocument = async (path: string) => {
    await loadArchiveDocument({
      path,
      setChatNotice,
      setArchiveDocumentBusy,
      setArchiveDocument,
      errorMessageOf,
    });
  };

  const handleSideload = async () => {
    await executeSideloadManifest({
      sideloadPath,
      bundled,
      sideloaded,
      setReadyState: (nextState, nextSideloaded) => commitReadyState(nextState, nextSideloaded),
      setSelectedAddonId,
      setSideloadPath,
      setErrorState: (message) => setLoadState({ phase: "error", message }),
      errorMessageOf,
    });
  };

  const sendStrategistMessage = async (overrideMessage?: string) => {
    if (!activeThread || !(overrideMessage ?? composer).trim()) {
      return;
    }
    if (chatBusy) {
      setChatNotice("Stop the current response before sending a follow-up correction.");
      return;
    }
    const runToken = `chat-run-${activeThread.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}`;
    activeChatRunTokenRef.current = runToken;
    await executeChatTurn({
      snapshot: { state, bundled, sideloaded },
      activeThread,
      composer,
      attachments,
      activeChatModel,
      thinkingDepth,
      overrideMessage,
      commitReadyState,
      setComposer,
      setAttachments,
      setChatNotice,
      setChatBusy,
      setChatRunPhase,
      setAgentActivityLabel,
      setProviderDiagnostics,
      setRecoveryRuntimeStatus,
      runToken,
      isRunCurrent: (token) => activeChatRunTokenRef.current === token,
      errorMessageOf,
    });
    if (activeChatRunTokenRef.current === runToken) {
      activeChatRunTokenRef.current = null;
      setChatRunPhase("idle");
    }
  };

  const stopChatGeneration = () => {
    if (!chatBusy || !activeThread) {
      return;
    }
    const stoppedRunToken = activeChatRunTokenRef.current;
    activeChatRunTokenRef.current = null;
    if (stoppedRunToken) {
      void abortProviderServiceChatCompletion(stoppedRunToken);
    }
    updateRuntimeState((draft) => {
      const targetThread = draft.conversationThreads.find((thread) => thread.id === activeThread.id);
      if (!targetThread) {
        return draft;
      }
      const interruptedMessage: ConversationMessage = {
        id: `${targetThread.id}:m${targetThread.messages.length + 1}`,
        threadId: targetThread.id,
        channelId: targetThread.channelId,
        role: "assistant",
        author:
          targetThread.owningAgentId === draft.recoverySession.engineerAgentId
            ? draft.agents.find((agent) => agent.id === draft.recoverySession.engineerAgentId)?.displayName ?? "Resonant Engineer Agent"
            : draft.strategistIdentity.customName ?? draft.strategistIdentity.defaultName,
        content: "Response stopped by the user before a complete reply was returned.",
        createdAt: new Date().toISOString(),
        status: "interrupted",
      };
      targetThread.messages = [...targetThread.messages, interruptedMessage];
      return appendTranscriptEvent(draft, {
        action: "generation-interrupted",
        threadId: interruptedMessage.threadId,
        channelId: interruptedMessage.channelId,
        messageId: interruptedMessage.id,
        role: interruptedMessage.role,
        agentId: targetThread.owningAgentId,
        payload: messageTranscriptPayload(interruptedMessage),
      });
    });
    setChatBusy(false);
    setChatRunPhase("interrupted");
    setAgentActivityLabel("Response interrupted. You can send the correction now.");
    setChatNotice("Response interrupted. Partial assistant message kept in the chat.");
  };

  const startRecoveryRunbook = () => {
    if (!recoveryModeActive || chatBusy) {
      return;
    }
    void sendStrategistMessage(RECOVERY_RUNBOOK_PROMPT);
  };

  const runArchiveIngestProbe = async () => {
    if (archiveProbeBusy || recoveryModeActive) {
      return;
    }

    await executeArchiveIngestProbe({
      snapshot: { state, bundled, sideloaded },
      commitReadyState,
      setProviderDiagnostics,
      setChatNotice,
      setArchiveProbeBusy,
      setArchiveProbeResult,
      errorMessageOf,
    });
  };

  const shellStyle = {
    "--chat-rail-width": `${clampChatWidth(state.uiPreferences.chatSidebarWidth)}px`,
  } as CSSProperties;
  const activeChatAgent = activeThread ? state.agents.find((agent) => agent.id === activeThread.owningAgentId) : null;
  const activeChatAgentName =
    activeChatAgent?.id === "strategist.core" ? displayedStrategistName : activeChatAgent?.displayName ?? displayedStrategistName;

  return (
    <div className={`shell ${state.uiPreferences.chatSidebarOpen ? "chat-open" : "chat-closed"}`} style={shellStyle}>
      <header className="system-topbar" aria-label="ResonantOS system bar">
        <div className="system-menu">
          <button type="button" className="system-logo-button" title="ResonantOS Home" onClick={() => setSection("overview")}>
            Resonant<span>OS</span>
          </button>
          <span className="system-active-app">{recoveryModeActive ? "Emergency Recovery" : navItems.find((item) => item.id === currentSection)?.label}</span>
        </div>
        <div className="system-status-strip">
          <span
            className={`system-health ${strategistRecoveryActive ? "warning" : "ready"}`}
            title={`${recoveryModeActive ? "Recovery Active" : strategistRecoveryActive ? "Local runtime active" : "System Ready"} · ${activeRuntimeNode?.label ?? "No runtime"}`}
            aria-label={`${recoveryModeActive ? "Recovery Active" : strategistRecoveryActive ? "Local runtime active" : "System Ready"} · ${activeRuntimeNode?.label ?? "No runtime"}`}
          />
          <button type="button" className="system-icon-button" title="Help and documentation" aria-label="Help and documentation" onClick={() => setSection("settings")}>
            <SystemTopIcon icon="help" />
          </button>
          <button
            type="button"
            className={`system-icon-button system-emergency-button ${recoveryModeActive ? "active" : ""}`}
            onClick={() =>
              setRecoveryMode(
                !recoveryModeActive,
                updateRuntimeState,
                setChatNotice,
                setAgentActivityLabel,
                setSelectedChatModel,
              )
            }
            disabled={chatBusy}
            title={recoveryModeActive ? "Exit Emergency Recovery mode" : "Open Emergency Resurrection mode"}
            aria-label={recoveryModeActive ? "Exit Recovery" : "Resurrect Local"}
          >
            <SystemTopIcon icon="resurrect" />
          </button>
          <span>{systemClockLabel}</span>
        </div>
      </header>

      <aside className="sidebar app-dock" aria-label="ResonantOS app launcher">
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${currentSection === item.id ? "active" : ""} ${item.pinned ? "pinned" : ""}`}
              onClick={() => setSection(item.id)}
              aria-label={item.label}
              title={`${item.label} · ${item.eyebrow}`}
            >
              <span className="nav-icon" aria-hidden="true">
                <DockIcon icon={item.icon} />
              </span>
              <span className="nav-label">{item.label}</span>
              <small>{item.eyebrow}</small>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-shell">

        {recoveryModeActive && (
          <div className="inline-notice warning recovery-notice">
            Recovery mode is active. Augmentor and archive ingest are offline while the Resonant Engineer Agent handles diagnosis and repair.
          </div>
        )}

        <section className={`content-grid ${recoveryModeActive ? "recovery-active" : ""}`}>
          {recoveryModeActive ? (
            <RecoveryWorkspace
              state={state}
              activeRouteLabel={activeRuntimeNode?.label ?? "No live node"}
              activeModel={activeChatModel || "Missing"}
              recoveryRuntimeStatus={recoveryRuntimeStatus}
              recoveryCandidates={recoveryCandidates}
              recoveryBusy={chatBusy}
              recoveryActivityLabel={agentActivityLabel}
              onStartRecovery={startRecoveryRunbook}
              onPromoteCandidate={(candidate) =>
                promoteRecoveryRoute(
                  candidate,
                  updateRuntimeState,
                  setSelectedChatModel,
                  setChatNotice,
                  setAgentActivityLabel,
                )
              }
            />
          ) : currentSection === "overview" ? (
            <OverviewWorkspace
              state={state}
              manifests={allManifests}
              displayedStrategistName={displayedStrategistName}
              providerLabel={routedProviderLabel(strategistRoute)}
              onOpenArchive={() => setSection("archive")}
              onOpenAddons={() => setSection("addons")}
              onOpenSettings={() => setSection("settings")}
            />
          ) : null}

          {!recoveryModeActive && currentSection === "strategist" && (
            <StrategistWorkspace
              state={state}
              displayedStrategistName={displayedStrategistName}
              onStrategistRename={(value) => renameStrategistIdentity(value, updateRuntimeState)}
              onToggleChannel={(channelId) => toggleStrategistChannel(channelId, updateRuntimeState)}
            />
          )}

          {!recoveryModeActive && currentSection === "archive" && (
            <ArchiveWorkspace
              state={state}
              archiveStatusBusy={archiveStatusBusy}
              archiveStatus={archiveStatus}
              archiveSearchBusy={archiveSearchBusy}
              archiveSearchResult={archiveSearchResult}
              archiveDocumentBusy={archiveDocumentBusy}
              archiveDocument={archiveDocument}
              archiveQueueBusy={archiveQueueBusy}
              archiveQueue={archiveQueue}
              archiveReviewArtifacts={archiveReviewArtifacts}
              archiveProcessResult={archiveProcessResult}
              archiveReviewDecisionResult={archiveReviewDecisionResult}
              archivePromotionResult={archivePromotionResult}
              archiveTolBundles={archiveTolBundles}
              archiveTolBundleResult={archiveTolBundleResult}
              archiveSourceScanBusy={archiveSourceScanBusy}
              archiveSourceScanResult={archiveSourceScanResult}
              archiveLibraryImportResult={archiveLibraryImportResult}
              ingestProbeBusy={archiveProbeBusy}
              ingestProbeResult={archiveProbeResult}
              onRefreshArchiveStatus={() => void refreshArchiveRuntime()}
              onRefreshArchiveQueue={() => void refreshArchiveQueue()}
              onRunArchiveSearch={(query) => void runArchiveSearch(query)}
              onOpenArchiveDocument={(path) => void openArchiveDocument(path)}
              onQueueArchiveSource={(source) => void queueArchiveSource(source)}
              onScanSourceFolders={(rootPath) => void runArchiveSourceFolderScan(rootPath)}
              onPickLibraryFolder={runPickArchiveLibraryFolder}
              onImportLibrary={(input) => void runArchiveLibraryImport(input)}
              onQueueWatchedSource={(source) => void queueWatchedArchiveSource(source)}
              onProcessArchiveRequest={(requestFile) => void runArchiveQueuedRequest(requestFile)}
              onApproveReviewArtifact={(artifactFile) => void runArchiveReviewDecision(artifactFile, "approve", "strategist.core")}
              onEscalateReviewArtifact={(artifactFile) => void runArchiveReviewDecision(artifactFile, "escalate", "strategist.core")}
              onRejectReviewArtifact={(artifactFile) => void runArchiveReviewDecision(artifactFile, "reject", "strategist.core")}
              onPromoteReviewArtifact={(artifactFile) => void runArchivePromotion(artifactFile)}
              onRefreshTolBundles={() => void refreshArchiveTolBundles()}
              onBuildTolBundle={(sessionId) => void runArchiveTolBundleBuild(sessionId)}
              onRunIngestProbe={() => void runArchiveIngestProbe()}
            />
          )}

          {!recoveryModeActive && currentSection === "addons" && (
            <AddOnsWorkspace
              search={search}
              sideloadPath={sideloadPath}
              filteredManifests={filteredManifests}
              installations={state.installations}
              selectedManifest={selectedManifest}
              selectedInstallation={selectedInstallation}
              onSearchChange={(value) => {
                startTransition(() => setSearch(value));
              }}
              onSideloadPathChange={setSideloadPath}
              onSideload={() => void handleSideload()}
              onSelectManifest={setSelectedAddonId}
              onToggleAddonInstall={(manifest) => toggleAddonInstallation(manifest, updateRuntimeState)}
              onToggleGrant={(manifestId, capability) =>
                toggleAddonCapabilityGrant(manifestId, capability, updateRuntimeState)
              }
            />
          )}

          {!recoveryModeActive && currentSection === "settings" && (
            <SettingsWorkspace
              state={state}
              settingsSection={settingsSection}
              settingsNotice={settingsNotice}
              providerDiagnostics={providerDiagnostics}
              providerDiagnosticsBusy={providerDiagnosticsBusy}
              activeProviderProbeId={activeProviderProbeId}
              providerDrafts={providerDrafts}
              onSettingsSectionChange={setSettingsSection}
              onUpdateProvider={(profileId, field, value) =>
                updateProviderProfile(profileId, field, value, updateRuntimeState)
              }
              onProviderDraftChange={(profileId, value) =>
                setProviderDrafts((current) => ({ ...current, [profileId]: value }))
              }
              onSaveProviderSecret={(profileId) => void handleSaveProviderSecret(profileId)}
              onProbeProvider={(profileId) => void refreshProviderDiagnostics(profileId)}
              onProbeAllProviders={() => void refreshProviderDiagnostics()}
            />
          )}
        </section>
      </main>

      <StrategistChatRail
        isOpen={state.uiPreferences.chatSidebarOpen}
        mode={recoveryModeActive ? "emergency" : "strategist"}
        title={activeChatAgentName}
        eyebrow={recoveryModeActive ? "Emergency recovery console" : "Persistent Strategist Chat"}
        description={
          recoveryModeActive
            ? "The Resonant Engineer Agent handles diagnosis, recovery logging, documentation checks, and the final repair report."
            : "Primary trusted conversation channel."
        }
        activeThread={activeThread}
        strategistThreads={visibleThreads}
        pinnedThreadIds={state.uiPreferences.pinnedChatThreadIds}
        availableAgents={state.agents
          .filter((agent) => agent.id === "strategist.core" || agent.id === state.recoverySession.engineerAgentId)
          .filter((agent) => state.channels.some((channel) => channel.owningAgentId === agent.id && channel.enabled))
          .map((agent) => ({
            id: agent.id,
            displayName: agent.id === "strategist.core" ? displayedStrategistName : agent.displayName,
            shortLabel: agent.id === "strategist.core" ? "A" : "E",
          }))}
        activeAgentId={activeThread?.owningAgentId ?? (recoveryModeActive ? state.recoverySession.engineerAgentId : "strategist.core")}
        channels={state.channels}
        chatBusy={chatBusy}
        chatCanStop={chatRunPhase !== "idle"}
        chatSupportsAbort={activeRoute.executionAdapter?.supportsAbort === true}
        chatNotice={chatNotice}
        composer={composer}
        attachments={attachments}
        dictating={dictating}
        dictationAvailable={dictationAvailable}
        activeChatModel={activeChatModel}
        availableModels={activeProvider?.allowedModels ?? []}
        thinkingDepth={thinkingDepth}
        contextUsageLabel={contextUsageLabel}
        contextUsageRatio={contextUsageRatio}
        contextUsageTitle={contextUsageTitle}
        activityLabel={agentActivityLabel}
        recoveryRuntimeStatus={
          recoveryModeActive
            ? {
                activeRouteLabel: activeRuntimeNode?.label ?? "No live node",
                activeModel: activeChatModel || "Missing",
                targetModel: recoveryRuntimeStatus?.targetModel ?? "batiai/gemma4-e2b:q4",
                available: recoveryRuntimeStatus?.available ?? false,
                installed: recoveryRuntimeStatus?.recoveryModelInstalled ?? false,
                running: recoveryRuntimeStatus?.recoveryModelRunning ?? false,
                runningModels: recoveryRuntimeStatus?.runningModels ?? [],
              }
            : null
        }
        chatScrollAnchorRef={chatScrollAnchorRef}
        fileInputRef={fileInputRef}
        onCreateNewChat={() =>
          createNewStrategistChat({
            state,
            activeChannel: activeThreadChannel,
            updateRuntimeState,
            setComposer,
            setAttachments,
            setChatNotice,
          })
        }
        onToggleSidebar={toggleChatSidebar}
        onSetActiveThread={(threadId) =>
          activateChatThread(threadId, updateRuntimeState, setComposer, setChatNotice, setAttachments)
        }
        onTogglePinnedThread={togglePinnedChatThread}
        onDeleteThread={deleteChatThread}
        onBranchThread={branchChatThread}
        onSelectAgent={selectChatAgent}
        onComposerChange={setComposer}
        onSend={() => void sendStrategistMessage()}
        onStopGeneration={stopChatGeneration}
        onCompactThread={compactActiveChatContext}
        onSaveMessageToArchive={(message) => {
          if (!activeThread) {
            return;
          }
          void saveChatMessageToArchiveIntake({
            thread: activeThread,
            message,
            setChatNotice,
            setArchiveQueueBusy,
            setArchiveQueue,
            setArchiveReviewArtifacts,
            errorMessageOf,
          });
        }}
        onBranchFromMessage={branchChatFromMessage}
        onEditUserMessage={editUserMessage}
        onDeleteMessage={deleteChatMessage}
        onToggleDictation={() =>
          toggleComposerDictation({
            dictating,
            speechRecognitionRef,
            setDictating,
            setComposer,
            setChatNotice,
            errorMessageOf,
          })
        }
        onModelChange={setSelectedChatModel}
        onThinkingDepthChange={setThinkingDepth}
        onFileAttach={(files) => void attachComposerFiles(files, setAttachments, fileInputRef)}
        onRemoveAttachment={(attachmentId) => removeComposerAttachment(attachmentId, setAttachments)}
        onStartResize={startChatRailResize}
      />
    </div>
  );
}

function DockIcon(props: { icon: DockIconId }) {
  switch (props.icon) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11.5 12 5l8 6.5V20H6v-7h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "archive":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5h14v14H5zM8 9h8M8 13h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "addons":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5h6v4h4v6h-4v4H9v-4H5V9h4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "agent":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4 12h2M18 12h2M12 4v2M12 18v2M6.6 6.6 8 8M16 16l1.4 1.4M17.4 6.6 16 8M8 16l-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function SystemTopIcon(props: { icon: "help" | "resurrect" }) {
  if (props.icon === "help") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9.5 9a2.7 2.7 0 0 1 5.1 1.3c0 2.2-2.8 2.3-2.8 4M12 18h.01M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v4M12 17v4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M3 12h4M17 12h4M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8M9.2 12a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
