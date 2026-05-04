// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-004-chat-rail.md

import type { Dispatch, SetStateAction } from "react";
import type {
  AddOnManifest,
  ChatRunPhase,
  ConversationThread,
  LocalRuntimeStatus,
  ProviderDiagnosticReport,
  ProviderUsageTelemetry,
  ResonantShellState,
} from "../../core/contracts";
import {
  appendAssistantMessage,
  appendUserMessage,
  engineerSystemPrompt,
  strategistSystemPrompt,
  threadById,
  updateConversationMessage,
} from "../../core/chat";
import { applyProviderDiagnostics } from "../../core/policies";
import { resolveMemoryProviderBroker } from "../../core/memory-provider";
import { resolveAgentChatRoute } from "../../core/provider-service";
import {
  requestCreateTaskWorkspace,
  requestEngineerRecoveryTurn,
  requestFinishTaskWorkspace,
  requestHermesChatCompletion,
  requestLocalRuntimeStatus,
  requestProviderDiagnostics,
  requestProviderServiceChatCompletion,
  requestProviderServiceChatCompletionStream,
  requestReadTaskWorkspace,
} from "../../core/runtime";
import {
  createEngineerDelegationPacket,
  createHermesDelegationPacket,
  engineerTaskAuditEvent,
  engineerTaskMessagesFromWorkspace,
  engineerTaskVerificationPayload,
  formatHermesTaskWorkspaceCreatedReply,
  formatEngineerTaskFinishedReply,
  formatTaskWorkspaceCreatedReply,
  parseStartEngineerTaskWorkspaceId,
  renderEngineerTaskResultMarkdown,
  shouldDelegateToEngineer,
  shouldDelegateToHermes,
} from "../../core/delegation";
import {
  buildContextBudget,
  compactThreadContext,
  formatCompactStateForPrompt,
  latestCompactStateForThread,
  promptMessagesForThread,
  shouldAutoCompactContext,
  shouldHardStopContext,
} from "../../core/context-memory";
import {
  archiveCitationsFromBundle,
  buildArchiveContextBundle,
  buildSystemMemoryContextBundle,
  formatArchiveContextForPrompt,
  formatSystemMemoryForPrompt,
} from "./archive-context";
import type { ComposerAttachment, ThinkingDepth } from "./types";
import { attachmentPromptBlock } from "./utils";

type ReadyShellSnapshot = {
  state: ResonantShellState;
  bundled: AddOnManifest[];
  sideloaded: AddOnManifest[];
};

type ChatTurnControllerInput = {
  snapshot: ReadyShellSnapshot;
  activeThread: ConversationThread;
  composer: string;
  attachments: ComposerAttachment[];
  activeChatModel: string;
  thinkingDepth: ThinkingDepth;
  overrideMessage?: string;
  commitReadyState: (state: ResonantShellState) => void;
  setComposer: Dispatch<SetStateAction<string>>;
  setAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setChatBusy: Dispatch<SetStateAction<boolean>>;
  setChatRunPhase: Dispatch<SetStateAction<ChatRunPhase>>;
  setAgentActivityLabel: Dispatch<SetStateAction<string>>;
  setProviderDiagnostics: Dispatch<SetStateAction<ProviderDiagnosticReport[]>>;
  setRecoveryRuntimeStatus: Dispatch<SetStateAction<LocalRuntimeStatus | null>>;
  runToken: string;
  isRunCurrent: (runToken: string) => boolean;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

const cloneState = (state: ResonantShellState): ResonantShellState =>
  JSON.parse(JSON.stringify(state)) as ResonantShellState;

const yieldForPaint = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
      return;
    }
    setTimeout(resolve, 0);
  });

const hermesPromptFromThread = (thread: ConversationThread): string =>
  [
    "ResonantOS is handing this conversation to the user's existing local Hermes profile.",
    "Stay within Hermes' own identity, skills, and memory boundaries.",
    "Do not claim to write to the Living Archive directly. Ask for approval before public or external sends.",
    "",
    `User: ${[...thread.messages].reverse().find((message) => message.role === "user")?.content.trim() ?? ""}`,
  ].join("\n");

export const executeChatTurn = async ({
  snapshot,
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
  isRunCurrent,
  errorMessageOf,
}: ChatTurnControllerInput): Promise<void> => {
  const outgoing = (overrideMessage ?? composer).trim();
  if (!outgoing) {
    return;
  }

  const { state } = snapshot;
  const trimmed = outgoing;
  const outgoingAttachments = overrideMessage ? [] : attachments;
  const attachmentBlock = outgoingAttachments.length ? `\n\n${attachmentPromptBlock(outgoingAttachments)}` : "";
  const withUserMessage = appendUserMessage(cloneState(state), activeThread.id, trimmed);
  const withAttachments = attachmentBlock
    ? appendUserMessage(cloneState(state), activeThread.id, `${trimmed}${attachmentBlock}`)
    : withUserMessage;
  const nextState = attachmentBlock ? withAttachments : withUserMessage;

  setComposer("");
  setAttachments([]);
  setChatNotice(null);
  setChatBusy(true);
  setChatRunPhase("thinking");
  setAgentActivityLabel(
    activeThread.owningAgentId === state.recoverySession.engineerAgentId
      ? "Establishing facts and checking the recovery floor."
      : "Thinking on the active Strategist route.",
  );
  commitReadyState(nextState);

  try {
    const engineerWorkspaceId = activeThread.owningAgentId === "strategist.core" ? parseStartEngineerTaskWorkspaceId(trimmed) : null;
    if (engineerWorkspaceId) {
      setChatRunPhase("tool-running");
      setAgentActivityLabel("Starting the delegated Engineer task workspace.");
      const payload = await requestReadTaskWorkspace(engineerWorkspaceId);
      if (!isRunCurrent(runToken)) {
        return;
      }
      const engineerRoute = resolveAgentChatRoute(nextState, nextState.recoverySession.engineerAgentId, activeChatModel);
      const engineerProvider = engineerRoute.provider;
      const engineerRuntimeNode = engineerRoute.runtimeNode;
      if (!engineerProvider || !engineerRuntimeNode || !engineerRoute.model) {
        throw new Error("No routed provider node is currently available for the delegated Engineer task.");
      }
      if (engineerProvider.credentialStatus !== "configured") {
        throw new Error(`${engineerProvider.label} credential missing. Add it in Settings > Provider Profiles.`);
      }
      const engineerTargetModel =
        nextState.providers.find((profile) => profile.id === "shared-local")?.primaryModel ?? "batiai/gemma4-e2b:q4";
      const runtimeStatusForPrompt = await requestLocalRuntimeStatus(engineerTargetModel);
      if (!isRunCurrent(runToken)) {
        return;
      }
      setRecoveryRuntimeStatus(runtimeStatusForPrompt);
      const recoveryTurn = await requestEngineerRecoveryTurn({
        providerId: engineerProvider.id,
        providerType: engineerProvider.providerType,
        apiBaseUrl: engineerRuntimeNode.endpoint ?? engineerProvider.apiBaseUrl,
        runtimeNodeId: engineerRuntimeNode.id,
        runtimeNodeKind: engineerRuntimeNode.kind,
        model: engineerRoute.model,
        systemPrompt: engineerSystemPrompt({
          activeModel: engineerRoute.model,
          activeRouteLabel: engineerRuntimeNode.label,
          activeRuntimeKind: engineerRuntimeNode.kind,
          localRuntimeStatus: runtimeStatusForPrompt,
        }),
        messages: engineerTaskMessagesFromWorkspace(payload),
        runtimeNodeEndpoint: engineerRuntimeNode.endpoint,
        authTier: engineerRoute.decision.authTier,
      });
      if (!isRunCurrent(runToken)) {
        return;
      }
      const finished = await requestFinishTaskWorkspace({
        workspaceId: payload.workspace.id,
        resultMarkdown: renderEngineerTaskResultMarkdown({
          workspace: payload.workspace,
          reply: recoveryTurn.reply,
          toolEvents: recoveryTurn.toolEvents,
        }),
        verification: engineerTaskVerificationPayload({
          packetId: payload.workspace.packetId,
          toolEvents: recoveryTurn.toolEvents,
        }),
        auditEvent: engineerTaskAuditEvent({
          packetId: payload.workspace.packetId,
          workspaceId: payload.workspace.id,
          toolEvents: recoveryTurn.toolEvents,
        }),
      });
      if (!isRunCurrent(runToken)) {
        return;
      }
      const reply = formatEngineerTaskFinishedReply({
        workspace: finished.workspace,
        resultPath: finished.resultPath,
        verificationPath: finished.verificationPath,
        auditPath: finished.auditPath,
      });
      const withAssistant = appendAssistantMessage(cloneState(nextState), activeThread.id, reply);
      withAssistant.recoverySession.changeLog = [
        ...withAssistant.recoverySession.changeLog,
        ...recoveryTurn.toolEvents.map(
          (event) => `${new Date().toISOString()}: [${event.status}] delegated_engineer_task:${event.tool} — ${event.summary}`,
        ),
      ];
      commitReadyState(withAssistant);
      setChatNotice("Delegated Engineer task finished. Review the result before promoting changes.");
      setAgentActivityLabel("Delegated Engineer task finished.");
      setChatRunPhase("completed");
      return;
    }

    if (activeThread.owningAgentId === "strategist.core" && shouldDelegateToEngineer(trimmed)) {
      setChatRunPhase("tool-running");
      setAgentActivityLabel("Creating an Engineer delegation workspace.");
      const packet = createEngineerDelegationPacket(nextState, {
        mission: trimmed,
        context:
          "The human asked Augmentor to delegate this system-level task to the Resonant Engineer Agent. Create the workspace only; do not start execution yet.",
      });
      const workspace = await requestCreateTaskWorkspace(packet);
      if (!isRunCurrent(runToken)) {
        return;
      }
      const reply = formatTaskWorkspaceCreatedReply(workspace);
      const withAssistant = appendAssistantMessage(cloneState(nextState), activeThread.id, reply);
      commitReadyState(withAssistant);
      setChatNotice("Engineer delegation workspace created. Execution has not started.");
      setAgentActivityLabel("Engineer delegation workspace ready.");
      setChatRunPhase("completed");
      return;
    }

    if (activeThread.owningAgentId === "strategist.core" && shouldDelegateToHermes(trimmed)) {
      setChatRunPhase("tool-running");
      setAgentActivityLabel("Creating a Hermes delegation workspace.");
      const packet = createHermesDelegationPacket(nextState, {
        mission: trimmed,
        context:
          "The human asked Augmentor to delegate this communication or coordination task to Hermes. Create the workspace only; do not start execution yet.",
      });
      const workspace = await requestCreateTaskWorkspace(packet);
      if (!isRunCurrent(runToken)) {
        return;
      }
      const reply = formatHermesTaskWorkspaceCreatedReply(workspace);
      const withAssistant = appendAssistantMessage(cloneState(nextState), activeThread.id, reply);
      commitReadyState(withAssistant);
      setChatNotice("Hermes delegation workspace created. Execution has not started.");
      setAgentActivityLabel("Hermes delegation workspace ready.");
      setChatRunPhase("completed");
      return;
    }

    if (activeThread.owningAgentId === "hermes.agent") {
      setChatRunPhase("tool-running");
      setAgentActivityLabel("Hermes is reading your message in the local profile.");
      const thread = threadById(nextState, activeThread.id);
      if (!thread) {
        throw new Error("Active Hermes thread was not found.");
      }
      const withHermesPlaceholder = appendAssistantMessage(
        cloneState(nextState),
        activeThread.id,
        "Hermes is thinking...",
      );
      const placeholderMessageId = threadById(withHermesPlaceholder, activeThread.id)?.messages.at(-1)?.id ?? null;
      commitReadyState(withHermesPlaceholder);
      await yieldForPaint();
      setAgentActivityLabel("Hermes is working through your prompt. This can take a moment for local profile startup.");
      const profileHome =
        typeof nextState.installations["addon.hermes"]?.config?.profileHome === "string"
          ? nextState.installations["addon.hermes"]?.config?.profileHome
          : undefined;
      const result = await requestHermesChatCompletion({
        prompt: hermesPromptFromThread(thread),
        profileHome,
      });
      if (!isRunCurrent(runToken)) {
        return;
      }
      const withAssistant = placeholderMessageId
        ? updateConversationMessage(cloneState(withHermesPlaceholder), activeThread.id, placeholderMessageId, (message) => ({
            ...message,
            content: result.reply,
          }))
        : appendAssistantMessage(cloneState(nextState), activeThread.id, result.reply);
      commitReadyState(withAssistant);
      setAgentActivityLabel("Hermes reply ready from the local profile.");
      setChatRunPhase("completed");
      return;
    }

    let routedState = nextState;
    try {
      setChatRunPhase("tool-running");
      const reports = await requestProviderDiagnostics();
      if (!isRunCurrent(runToken)) {
        return;
      }
      setProviderDiagnostics(reports);
      routedState = applyProviderDiagnostics(nextState, reports);
      commitReadyState(routedState);
    } catch {
      routedState = nextState;
    }

    const route = resolveAgentChatRoute(routedState, activeThread.owningAgentId, activeChatModel);
    const provider = route.provider;
    const runtimeNode = route.runtimeNode;
    if (!provider || !runtimeNode || !route.model) {
      throw new Error(
        route.decision.resolutionReason === "no-viable-route"
          ? "No live provider route is currently available for Strategist chat. A recovery route may exist in the provider fabric, but it is not currently executable."
          : "No routed provider node is currently available for Strategist chat.",
      );
    }
    if (provider.credentialStatus !== "configured") {
      throw new Error(`${provider.label} credential missing. Add it in Settings > Provider Profiles.`);
    }
    const routedModel = route.model;

    let thread = threadById(routedState, activeThread.id);
    if (!thread) {
      throw new Error("Active Strategist thread was not found.");
    }
    let compactState = latestCompactStateForThread(routedState, thread.id);
    let providerMessages = promptMessagesForThread(thread, compactState);
    const contextBudget = buildContextBudget({
      thread: { ...thread, messages: providerMessages },
      composer: "",
      attachments: [],
      provider,
      runtimeNode,
      modelId: route.model,
    });
    if (shouldAutoCompactContext(contextBudget)) {
      setChatRunPhase("tool-running");
      setAgentActivityLabel("Auto-compacting conversation memory before the next provider call.");
      routedState = compactThreadContext(routedState, activeThread.id);
      commitReadyState(routedState);
      setChatNotice("Context reached the automatic compaction threshold. Conversation memory was compacted before sending.");
      thread = threadById(routedState, activeThread.id);
      if (!thread) {
        throw new Error("Active Strategist thread was not found after compaction.");
      }
      compactState = latestCompactStateForThread(routedState, thread.id);
      providerMessages = promptMessagesForThread(thread, compactState);
      const compactedBudget = buildContextBudget({
        thread: { ...thread, messages: providerMessages },
        composer: "",
        attachments: [],
        provider,
        runtimeNode,
        modelId: route.model,
      });
      if (shouldHardStopContext(compactedBudget)) {
        throw new Error(
          "Context remains above the hard-stop threshold after compaction. Start a branched chat or switch to a model with a larger context window before continuing.",
        );
      }
    }

    const engineerTargetModel =
      routedState.providers.find((profile) => profile.id === "shared-local")?.primaryModel ?? "batiai/gemma4-e2b:q4";
    const runtimeStatusForPrompt =
      activeThread.owningAgentId === routedState.recoverySession.engineerAgentId
        ? await requestLocalRuntimeStatus(engineerTargetModel)
        : null;

    if (runtimeStatusForPrompt) {
      if (!isRunCurrent(runToken)) {
        return;
      }
      setRecoveryRuntimeStatus(runtimeStatusForPrompt);
      setAgentActivityLabel("Inspecting the local recovery floor and validating runtime health.");
    }

    const systemPrompt =
      activeThread.owningAgentId === routedState.recoverySession.engineerAgentId
        ? engineerSystemPrompt({
            activeModel: route.model,
            activeRouteLabel: runtimeNode.label,
            activeRuntimeKind: runtimeNode.kind,
            localRuntimeStatus: runtimeStatusForPrompt,
          })
        : strategistSystemPrompt(routedState, [...snapshot.bundled, ...snapshot.sideloaded]);

    const recoveryAgentActive = activeThread.owningAgentId === routedState.recoverySession.engineerAgentId;
    const memoryProvider = resolveMemoryProviderBroker(routedState, [...snapshot.bundled, ...snapshot.sideloaded]);
    if (recoveryAgentActive) {
      setChatRunPhase("tool-running");
      setAgentActivityLabel("Probing stronger routes, reading state, and preparing the next recovery step.");
    }
    setChatRunPhase("retrieving");
    const systemMemoryContext = await buildSystemMemoryContextBundle(memoryProvider).catch(() => null);
    if (!isRunCurrent(runToken)) {
      return;
    }
    if (systemMemoryContext?.status === "ready") {
      setAgentActivityLabel(
        recoveryAgentActive
          ? "Loaded ResonantOS system memory for recovery context."
          : "Loaded ResonantOS system memory before archive context.",
      );
    }
    let archiveContext =
      !recoveryAgentActive && activeThread.owningAgentId === "strategist.core"
        ? await buildArchiveContextBundle(trimmed, memoryProvider).catch(() => null)
        : null;
    if (!isRunCurrent(runToken)) {
      return;
    }
    if (archiveContext) {
      setAgentActivityLabel(
        archiveContext.pages.length
          ? `Retrieved ${archiveContext.pages.length} Living Archive page${archiveContext.pages.length === 1 ? "" : "s"} for context.`
          : "Checked the Living Archive; no directly relevant page was found.",
      );
    }
    const effectiveSystemPrompt = recoveryAgentActive
      ? [systemPrompt, formatSystemMemoryForPrompt(systemMemoryContext), formatCompactStateForPrompt(compactState)].join("\n\n")
      : [
          systemPrompt,
          formatSystemMemoryForPrompt(systemMemoryContext),
          formatCompactStateForPrompt(compactState),
          "Living Archive access is host-mediated and read-only for this chat turn. Treat retrieved pages as contextual memory, not as permission to mutate the archive.",
          formatArchiveContextForPrompt(archiveContext),
        ].join("\n\n");

    setChatRunPhase(recoveryAgentActive ? "tool-running" : "thinking");
    const recoveryTurn = recoveryAgentActive
      ? await requestEngineerRecoveryTurn({
          providerId: provider.id,
          providerType: provider.providerType,
          apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
          runtimeNodeId: runtimeNode.id,
          runtimeNodeKind: runtimeNode.kind,
          model: route.model,
          systemPrompt: effectiveSystemPrompt,
          messages: providerMessages,
          runtimeNodeEndpoint: runtimeNode.endpoint,
          authTier: route.decision.authTier,
        })
      : null;
    if (!isRunCurrent(runToken)) {
      return;
    }

    let streamedAssistantMessageId: string | null = null;
    let streamedReply = "";
    let streamedState = routedState;
    let providerUsage: ProviderUsageTelemetry | undefined;
    const supportsStreaming = !recoveryAgentActive && route.executionAdapter?.supportsStreaming === true;
    const streamAssistantChunk = (chunk: string) => {
      if (!chunk || !isRunCurrent(runToken)) {
        return;
      }
      setChatRunPhase("streaming");
      setAgentActivityLabel("Streaming the reply from the active provider route.");
      streamedReply += chunk;
      if (!streamedAssistantMessageId) {
        streamedState = appendAssistantMessage(cloneState(streamedState), activeThread.id, streamedReply, {
          archiveCitations: archiveCitationsFromBundle(archiveContext),
        });
        streamedAssistantMessageId = threadById(streamedState, activeThread.id)?.messages.at(-1)?.id ?? null;
      } else {
        streamedState = updateConversationMessage(cloneState(streamedState), activeThread.id, streamedAssistantMessageId, (message) => ({
          ...message,
          content: streamedReply,
          status: undefined,
        }));
      }
      commitReadyState(streamedState);
    };
    const nonStreamingRequest = () =>
      requestProviderServiceChatCompletion({
        providerId: provider.id,
        providerType: provider.providerType,
        apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
        runtimeNodeId: runtimeNode.id,
        runtimeNodeKind: runtimeNode.kind,
        runtimeNodeEndpoint: runtimeNode.endpoint,
        authTier: route.decision.authTier,
        model: routedModel,
        reasoningEffort: thinkingDepth,
        systemPrompt: effectiveSystemPrompt,
        messages: providerMessages,
      });
    const reply =
      recoveryTurn?.reply ??
      (supportsStreaming
        ? await requestProviderServiceChatCompletionStream(
            {
              runId: runToken,
              providerId: provider.id,
              providerType: provider.providerType,
              apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
              runtimeNodeId: runtimeNode.id,
              runtimeNodeKind: runtimeNode.kind,
              runtimeNodeEndpoint: runtimeNode.endpoint,
              authTier: route.decision.authTier,
              model: routedModel,
              reasoningEffort: thinkingDepth,
              systemPrompt: effectiveSystemPrompt,
              messages: providerMessages,
            },
            (event) => {
              if (event.type === "chunk") {
                streamAssistantChunk(event.content);
              } else if (event.type === "usage") {
                try {
                  providerUsage = JSON.parse(event.content) as ProviderUsageTelemetry;
                } catch {
                  providerUsage = undefined;
                }
              }
            },
          ).catch((streamError) => {
            if (streamedReply || !isRunCurrent(runToken)) {
              throw streamError;
            }
            setAgentActivityLabel("Streaming is unavailable on this route; using the non-streaming fallback.");
            return nonStreamingRequest();
          })
        : await nonStreamingRequest());
    if (!isRunCurrent(runToken)) {
      return;
    }

    const withAssistant = streamedAssistantMessageId
      ? updateConversationMessage(cloneState(streamedState), activeThread.id, streamedAssistantMessageId, (message) => ({
          ...message,
          content: reply,
          status: undefined,
          archiveCitations: archiveCitationsFromBundle(archiveContext),
          providerUsage,
        }))
      : appendAssistantMessage(cloneState(routedState), activeThread.id, reply, {
          archiveCitations: archiveCitationsFromBundle(archiveContext),
          providerUsage,
        });
    if (recoveryTurn?.toolEvents.length) {
      withAssistant.recoverySession.changeLog = [
        ...withAssistant.recoverySession.changeLog,
        ...recoveryTurn.toolEvents.map(
          (event) => `${new Date().toISOString()}: [${event.status}] ${event.tool} — ${event.summary}`,
        ),
      ];
      setChatNotice(`Engineer tools used: ${recoveryTurn.toolEvents.map((event) => event.tool).join(", ")}`);
      setAgentActivityLabel(
        recoveryTurn.toolEvents.some((event) => event.tool === "provider_probe")
          ? "Checked provider routes and updated the recovery trail."
          : `Completed ${recoveryTurn.toolEvents.length} recovery action${recoveryTurn.toolEvents.length === 1 ? "" : "s"}.`,
      );
    } else {
      setAgentActivityLabel(
        recoveryAgentActive
          ? "Recovery turn completed. Waiting for the next action."
          : archiveContext?.pages.length
            ? "Reply ready with Living Archive context."
            : "Reply ready.",
      );
    }
    commitReadyState(withAssistant);
    setChatRunPhase("completed");
  } catch (error) {
    if (!isRunCurrent(runToken)) {
      return;
    }
    const failure = errorMessageOf(error, "Strategist request failed before a reply was returned.");
    const withFailure = appendAssistantMessage(cloneState(nextState), activeThread.id, failure, { status: "failed" });
    commitReadyState(withFailure);
    setChatNotice(failure);
    setChatRunPhase("failed");
    setAgentActivityLabel(
      state.recoverySession.active ? "Recovery action failed. Review the latest error in chat." : "Reply failed. Review the latest error.",
    );
  } finally {
    if (isRunCurrent(runToken)) {
      setChatBusy(false);
    }
  }
};
