import { describe, expect, it } from "vitest";
import type { ContextMemoryState, ConversationMessage } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { buildProviderChatRouteRequest } from "./chat-route-request";

const message = (
  id: string,
  role: ConversationMessage["role"],
  content: string,
  status?: ConversationMessage["status"],
): ConversationMessage => ({
  id,
  threadId: "thread-main-desktop",
  channelId: "desktop-main",
  role,
  author: role === "user" ? "You" : "Augmentor",
  createdAt: "2026-05-06T12:00:00.000Z",
  content,
  status,
});

describe("buildProviderChatRouteRequest", () => {
  it("resolves the selected model, prompt messages, and context budget together", () => {
    const state = buildDefaultState([]);
    state.uiPreferences.activeChatThreadId = "thread-main-desktop";
    state.conversationThreads = state.conversationThreads.map((thread) =>
      thread.id === "thread-main-desktop"
        ? {
            ...thread,
            messages: [
              message("thread-main-desktop:seed-1", "assistant", "Ready."),
              message("thread-main-desktop:m1", "user", "Use the faster MiniMax route."),
            ],
          }
        : thread,
    );

    const request = buildProviderChatRouteRequest({
      state,
      threadId: "thread-main-desktop",
      agentId: "strategist.core",
      selectedModel: "MiniMax-M2.7-highspeed",
    });

    expect(request.provider.id).toBe("shared-minimax");
    expect(request.runtimeNode.id).toBe("node-minimax-cloud");
    expect(request.routedModel).toBe("MiniMax-M2.7-highspeed");
    expect(request.providerMessages.map((item) => item.id)).toEqual(["thread-main-desktop:m1"]);
    expect(request.contextBudget.modelId).toBe("MiniMax-M2.7-highspeed");
  });

  it("ignores stale compact memory instead of building an empty provider request", () => {
    const state = buildDefaultState([]);
    const staleCompactState: ContextMemoryState = {
      threadId: "thread-main-desktop",
      compactedAt: "2026-05-06T12:00:00.000Z",
      sourceRange: {
        fromMessageId: "thread-main-desktop:seed-1",
        toMessageId: "thread-main-desktop:m42",
      },
      preservedRecentMessageIds: ["thread-main-desktop:m40"],
      userIntent: { goal: "", why: "", successCriteria: [], prioritySignals: [], sourceMessageIds: [] },
      workingSummary: "Stale compact state.",
      decisions: [],
      facts: [],
      preferences: [],
      openTasks: [],
      artifacts: [],
      risks: [],
      unresolvedQuestions: [],
      checksum: "stale",
    };
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    state.contextMemoryStates = [staleCompactState];
    state.conversationThreads = [
      {
        ...thread,
        messages: [
          message("thread-main-desktop:seed-1", "assistant", "Ready."),
          message("thread-main-desktop:m2", "user", "This live message must be sent."),
        ],
      },
      ...state.conversationThreads.filter((item) => item.id !== thread.id),
    ];

    const request = buildProviderChatRouteRequest({
      state,
      threadId: "thread-main-desktop",
      agentId: "strategist.core",
      selectedModel: "MiniMax-M2.7",
    });

    expect(request.providerMessages.map((item) => item.id)).toEqual(["thread-main-desktop:m2"]);
  });

  it("fails before provider transport when no usable user turn exists", () => {
    const state = buildDefaultState([]);
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    state.conversationThreads = [
      {
        ...thread,
        messages: [
          message("thread-main-desktop:m1", "assistant", "invalid params, chat content is empty (2013)", "failed"),
        ],
      },
      ...state.conversationThreads.filter((item) => item.id !== thread.id),
    ];

    expect(() =>
      buildProviderChatRouteRequest({
        state,
        threadId: "thread-main-desktop",
        agentId: "strategist.core",
        selectedModel: "MiniMax-M2.7",
      }),
    ).toThrow(/no non-empty provider prompt messages/i);
  });
});
