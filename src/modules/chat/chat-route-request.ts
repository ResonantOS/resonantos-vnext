// Intent citation: docs/architecture/ADR-004-chat-rail.md
// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md
// Intent citation: docs/architecture/ADR-016-context-memory-compaction.md

import type {
  ContextBudget,
  ContextMemoryState,
  ConversationMessage,
  ConversationThread,
  ProviderProfile,
  ProviderRuntimeNode,
  ResonantShellState,
} from "../../core/contracts";
import { threadById } from "../../core/chat";
import {
  buildContextBudget,
  latestCompactStateForThread,
  promptMessagesForThread,
} from "../../core/context-memory";
import { resolveAgentChatRoute, type ProviderRouteResolution } from "../../core/provider-service";

export type ProviderChatRouteRequest = {
  agentId: string;
  thread: ConversationThread;
  route: ProviderRouteResolution;
  provider: ProviderProfile;
  runtimeNode: ProviderRuntimeNode;
  routedModel: string;
  compactState: ContextMemoryState | null;
  providerMessages: ConversationMessage[];
  contextBudget: ContextBudget;
};

type BuildProviderChatRouteRequestInput = {
  state: ResonantShellState;
  threadId: string;
  agentId: string;
  selectedModel: string;
};

const routeMissingMessage = (route: ProviderRouteResolution): string =>
  route.decision.resolutionReason === "no-viable-route"
    ? "No live provider route is currently available for Strategist chat. A recovery route may exist in the provider fabric, but it is not currently executable."
    : "No routed provider node is currently available for Strategist chat.";

const validateProviderMessages = (messages: ConversationMessage[], threadId: string): void => {
  if (!messages.length) {
    throw new Error(
      `Chat thread ${threadId} has no non-empty provider prompt messages after context filtering. Compact memory may be stale; recompact or start a new chat.`,
    );
  }
  if (!messages.some((message) => message.role === "user")) {
    throw new Error(
      `Chat thread ${threadId} has no user message in provider prompt history. Start a new chat or send a fresh user message before calling a provider.`,
    );
  }
};

export const buildProviderChatRouteRequest = ({
  state,
  threadId,
  agentId,
  selectedModel,
}: BuildProviderChatRouteRequestInput): ProviderChatRouteRequest => {
  const route = resolveAgentChatRoute(state, agentId, selectedModel);
  const provider = route.provider;
  const runtimeNode = route.runtimeNode;
  const routedModel = route.model;
  if (!provider || !runtimeNode || !routedModel) {
    throw new Error(routeMissingMessage(route));
  }

  const thread = threadById(state, threadId);
  if (!thread) {
    throw new Error("Active Strategist thread was not found.");
  }

  const compactState = latestCompactStateForThread(state, thread.id);
  const providerMessages = promptMessagesForThread(thread, compactState);
  validateProviderMessages(providerMessages, thread.id);

  const contextBudget = buildContextBudget({
    thread: { ...thread, messages: providerMessages },
    composer: "",
    attachments: [],
    provider,
    runtimeNode,
    modelId: routedModel,
  });

  return {
    agentId,
    thread,
    route,
    provider,
    runtimeNode,
    routedModel,
    compactState,
    providerMessages,
    contextBudget,
  };
};
