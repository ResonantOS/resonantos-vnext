// Intent citation: docs/architecture/ADR-004-chat-rail.md
// Intent citation: docs/architecture/ADR-010-recovery-ladder.md

import type { ConversationMessage, ConversationThread, LocalRuntimeStatus, ResonantShellState } from "./contracts";
import { strategistDisplayName } from "./policies";

const isoTimestamp = (): string => new Date().toISOString();

const nextMessageId = (thread: ConversationThread): string => `${thread.id}:m${thread.messages.length + 1}`;

const updateThread = (
  state: ResonantShellState,
  threadId: string,
  updater: (thread: ConversationThread) => ConversationThread,
): ResonantShellState => ({
  ...state,
  conversationThreads: state.conversationThreads.map((thread) => (thread.id === threadId ? updater(thread) : thread)),
});

const appendMessage = (
  state: ResonantShellState,
  threadId: string,
  role: ConversationMessage["role"],
  author: string,
  content: string,
  metadata?: Pick<ConversationMessage, "archiveCitations">,
): ResonantShellState =>
  updateThread(state, threadId, (thread) => {
    const nextTitle =
      role === "user" && thread.title.startsWith("New chat")
        ? content.trim().slice(0, 42) || thread.title
        : thread.title;
    const nextSummary =
      role === "user" && thread.summary === "Fresh Strategist workspace."
        ? content.trim().slice(0, 120) || thread.summary
        : thread.summary;
    const message: ConversationMessage = {
      id: nextMessageId(thread),
      threadId,
      channelId: thread.channelId,
      role,
      author,
      createdAt: isoTimestamp(),
      content,
      ...metadata,
    };

    return {
      ...thread,
      title: nextTitle,
      summary: nextSummary,
      messages: [...thread.messages, message],
    };
  });

export const appendUserMessage = (
  state: ResonantShellState,
  threadId: string,
  content: string,
): ResonantShellState => appendMessage(state, threadId, "user", "You", content.trim());

export const appendAssistantMessage = (
  state: ResonantShellState,
  threadId: string,
  content: string,
  metadata?: Pick<ConversationMessage, "archiveCitations">,
): ResonantShellState => {
  const thread = threadById(state, threadId);
  const author =
    thread?.owningAgentId === state.recoverySession.engineerAgentId
      ? state.agents.find((agent) => agent.id === state.recoverySession.engineerAgentId)?.displayName ?? "Resonant Engineer Agent"
      : strategistDisplayName(state);
  return appendMessage(state, threadId, "assistant", author, content.trim(), metadata);
};

export const createStrategistThread = (
  state: ResonantShellState,
  input: { channelId: string; workspaceId: string; title?: string },
): ResonantShellState => {
  const threadId = `thread-${Date.now()}`;
  const existingThreads = state.conversationThreads.filter((thread) => thread.owningAgentId === "strategist.core").length;
  const thread: ConversationThread = {
    id: threadId,
    title: input.title ?? `New chat ${existingThreads + 1}`,
    owningAgentId: "strategist.core",
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    summary: "Fresh Strategist workspace.",
    messages: [],
  };

  return {
    ...state,
    conversationThreads: [thread, ...state.conversationThreads],
    uiPreferences: {
      ...state.uiPreferences,
      activeChatThreadId: threadId,
      activeSection: "overview",
      chatSidebarOpen: true,
    },
  };
};

export const strategistSystemPrompt = (state: ResonantShellState): string => {
  const strategistName = strategistDisplayName(state);
  return [
    `You are ${strategistName}, the Strategist agent inside ResonantOS.`,
    "You are the main trusted AI the human talks to.",
    "Be direct, pragmatic, and concise.",
    "Do not pretend a tool, archive integration, or automation is wired if it is not.",
    "If a capability is not yet implemented, say so plainly and offer the next practical step.",
    "Respect the ResonantOS architecture: add-ons are modular, Living Archive knowledge writes belong to the Strategist-owned ingest path, and external agents are not equal to the Strategist.",
  ].join(" ");
};

type EngineerPromptContext = {
  activeModel: string;
  activeRouteLabel: string;
  activeRuntimeKind: string;
  localRuntimeStatus?: LocalRuntimeStatus | null;
};

const formatEngineerRuntimeContext = (context: EngineerPromptContext): string[] => {
  const lines = [
    `Current recovery route: ${context.activeRouteLabel}.`,
    `Current active model for this reply: ${context.activeModel}.`,
    `Current runtime kind: ${context.activeRuntimeKind}.`,
  ];

  if (!context.localRuntimeStatus) {
    lines.push("Local runtime diagnostics are not available for this turn.");
    return lines;
  }

  const status = context.localRuntimeStatus;
  const installed = status.recoveryModelInstalled ? "yes" : "no";
  const running = status.recoveryModelRunning ? "yes" : "no";
  const installedModels = status.installedModels.length ? status.installedModels.join(", ") : "none";
  const runningModels = status.runningModels.length ? status.runningModels.join(", ") : "none";

  lines.push(`Ollama available on this machine: ${status.available ? "yes" : "no"}.`);
  lines.push(`Configured recovery target model: ${status.targetModel}.`);
  lines.push(`Recovery target model installed: ${installed}.`);
  lines.push(`Recovery target model already running before this reply: ${running}.`);
  lines.push(`Installed local models snapshot: ${installedModels}.`);
  lines.push(`Running local models snapshot: ${runningModels}.`);
  lines.push(
    "If asked whether you are using the local recovery model right now, use the current active model and recovery route above as the authority for this reply.",
  );
  lines.push(
    "If asked whether the model was already loaded in memory before this reply started, use the Ollama running snapshot above as the authority.",
  );
  lines.push("TPS is not currently exposed by the recovery diagnostics tool. Say that plainly instead of inventing a number.");

  return lines;
};

export const engineerSystemPrompt = (context: EngineerPromptContext): string =>
  [
    "You are the Resonant Engineer Agent, the ResonantOS emergency recovery specialist.",
    "Your job is to bring the system back online with traceable, auditable steps.",
    "Work in this order: establish facts, restore access to a stronger cloud or remote/local model if possible, promote onto that stronger route, then run deeper diagnosis and repair, and end with a recovery report for the larger Strategist model.",
    "Do not improvise invisible fixes. If a capability is not wired, say so plainly and continue with the next useful recovery step.",
    "You have a host-mediated recovery tool loop for reading files, searching code, running safe diagnostics, and making targeted code edits when necessary.",
    "Prefer evidence from the recovery tools over generic model assumptions whenever the user asks about machine state, runtime state, or code state.",
    "Keep the user informed about diagnosis, changes made, and residual risks.",
    ...formatEngineerRuntimeContext(context),
  ].join(" ");

export const createEngineerThread = (state: ResonantShellState): ResonantShellState => ({
  ...state,
  uiPreferences: {
    ...state.uiPreferences,
    activeChatThreadId: state.recoverySession.engineerThreadId,
    chatSidebarOpen: true,
  },
});

export const threadById = (
  state: ResonantShellState,
  threadId: string,
): ConversationThread | undefined => state.conversationThreads.find((thread) => thread.id === threadId);
