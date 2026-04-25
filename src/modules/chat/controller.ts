// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-004-chat-rail.md

import type { Dispatch, SetStateAction } from "react";
import type {
  AddOnManifest,
  ConversationThread,
  LocalRuntimeStatus,
  ProviderDiagnosticReport,
  ResonantShellState,
} from "../../core/contracts";
import {
  appendAssistantMessage,
  appendUserMessage,
  engineerSystemPrompt,
  strategistSystemPrompt,
  threadById,
} from "../../core/chat";
import { applyProviderDiagnostics } from "../../core/policies";
import { resolveAgentChatRoute } from "../../core/provider-service";
import {
  requestEngineerRecoveryTurn,
  requestLocalRuntimeStatus,
  requestProviderDiagnostics,
  requestProviderServiceChatCompletion,
} from "../../core/runtime";
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
  setAgentActivityLabel: Dispatch<SetStateAction<string>>;
  setProviderDiagnostics: Dispatch<SetStateAction<ProviderDiagnosticReport[]>>;
  setRecoveryRuntimeStatus: Dispatch<SetStateAction<LocalRuntimeStatus | null>>;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

const cloneState = (state: ResonantShellState): ResonantShellState =>
  JSON.parse(JSON.stringify(state)) as ResonantShellState;

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
  setAgentActivityLabel,
  setProviderDiagnostics,
  setRecoveryRuntimeStatus,
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
  setAgentActivityLabel(
    activeThread.owningAgentId === state.recoverySession.engineerAgentId
      ? "Establishing facts and checking the recovery floor."
      : "Thinking on the active Strategist route.",
  );
  commitReadyState(nextState);

  try {
    let routedState = nextState;
    try {
      const reports = await requestProviderDiagnostics();
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

    const thread = threadById(routedState, activeThread.id);
    if (!thread) {
      throw new Error("Active Strategist thread was not found.");
    }

    const engineerTargetModel =
      routedState.providers.find((profile) => profile.id === "shared-local")?.primaryModel ?? "batiai/gemma4-e2b:q4";
    const runtimeStatusForPrompt =
      activeThread.owningAgentId === routedState.recoverySession.engineerAgentId
        ? await requestLocalRuntimeStatus(engineerTargetModel)
        : null;

    if (runtimeStatusForPrompt) {
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
        : strategistSystemPrompt(routedState);

    const recoveryAgentActive = activeThread.owningAgentId === routedState.recoverySession.engineerAgentId;
    if (recoveryAgentActive) {
      setAgentActivityLabel("Probing stronger routes, reading state, and preparing the next recovery step.");
    }
    const systemMemoryContext = await buildSystemMemoryContextBundle().catch(() => null);
    if (systemMemoryContext?.status === "ready") {
      setAgentActivityLabel(
        recoveryAgentActive
          ? "Loaded ResonantOS system memory for recovery context."
          : "Loaded ResonantOS system memory before archive context.",
      );
    }
    let archiveContext =
      !recoveryAgentActive && activeThread.owningAgentId === "strategist.core"
        ? await buildArchiveContextBundle(trimmed).catch(() => null)
        : null;
    if (archiveContext) {
      setAgentActivityLabel(
        archiveContext.pages.length
          ? `Retrieved ${archiveContext.pages.length} Living Archive page${archiveContext.pages.length === 1 ? "" : "s"} for context.`
          : "Checked the Living Archive; no directly relevant page was found.",
      );
    }
    const effectiveSystemPrompt = recoveryAgentActive
      ? [systemPrompt, formatSystemMemoryForPrompt(systemMemoryContext)].join("\n\n")
      : [
          systemPrompt,
          formatSystemMemoryForPrompt(systemMemoryContext),
          "Living Archive access is host-mediated and read-only for this chat turn. Treat retrieved pages as contextual memory, not as permission to mutate the archive.",
          formatArchiveContextForPrompt(archiveContext),
        ].join("\n\n");

    const recoveryTurn = recoveryAgentActive
      ? await requestEngineerRecoveryTurn({
          providerId: provider.id,
          providerType: provider.providerType,
          apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
          runtimeNodeId: runtimeNode.id,
          runtimeNodeKind: runtimeNode.kind,
          model: route.model,
          systemPrompt: effectiveSystemPrompt,
          messages: thread.messages,
          runtimeNodeEndpoint: runtimeNode.endpoint,
          authTier: route.decision.authTier,
        })
      : null;

    const reply =
      recoveryTurn?.reply ??
      (await requestProviderServiceChatCompletion({
        providerId: provider.id,
        providerType: provider.providerType,
        apiBaseUrl: runtimeNode.endpoint ?? provider.apiBaseUrl,
        runtimeNodeId: runtimeNode.id,
        runtimeNodeKind: runtimeNode.kind,
        runtimeNodeEndpoint: runtimeNode.endpoint,
        authTier: route.decision.authTier,
        model: route.model,
        reasoningEffort: thinkingDepth,
        systemPrompt: effectiveSystemPrompt,
        messages: thread.messages,
      }));

    const withAssistant = appendAssistantMessage(cloneState(routedState), activeThread.id, reply, {
      archiveCitations: archiveCitationsFromBundle(archiveContext),
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
  } catch (error) {
    const failure = errorMessageOf(error, "Strategist request failed before a reply was returned.");
    const withFailure = appendAssistantMessage(cloneState(nextState), activeThread.id, failure);
    commitReadyState(withFailure);
    setChatNotice(failure);
    setAgentActivityLabel(
      state.recoverySession.active ? "Recovery action failed. Review the latest error in chat." : "Reply failed. Review the latest error.",
    );
  } finally {
    setChatBusy(false);
  }
};
