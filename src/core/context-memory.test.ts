import { describe, expect, it } from "vitest";
import { buildDefaultState } from "./defaults";
import {
  buildDeterministicCompactState,
  buildContextBudget,
  compactThreadContext,
  copyCompactStatesForFork,
  contextBudgetTitle,
  contextUsageRatio,
  estimateTextTokens,
  formatCompactStateForPrompt,
  latestCompactStateForThread,
  promptMessagesForThread,
  shouldAutoCompactContext,
  shouldHardStopContext,
  usableContextTokens,
} from "./context-memory";

describe("context memory budget estimation", () => {
  it("estimates text tokens deterministically without claiming tokenizer accuracy", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("abcd")).toBe(1);
    expect(estimateTextTokens("abcde")).toBe(2);
  });

  it("builds a provider-aware budget from configured model context metadata", () => {
    const state = buildDefaultState([]);
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    const provider = state.providers.find((item) => item.id === "shared-minimax")!;
    const runtimeNode = state.runtimeNodes.find((item) => item.id === "node-minimax-cloud")!;

    const budget = buildContextBudget({
      thread,
      composer: "Continue the implementation plan.",
      attachments: [],
      provider,
      runtimeNode,
      modelId: "MiniMax-M2.7",
    });

    expect(budget.providerId).toBe("shared-minimax");
    expect(budget.modelId).toBe("MiniMax-M2.7");
    expect(budget.maxContextTokens).toBe(64_000);
    expect(budget.estimateQuality).toBe("provider");
    expect(budget.usedInputTokens).toBeGreaterThan(0);
    expect(usableContextTokens(budget)).toBeLessThan(budget.maxContextTokens);
    expect(contextUsageRatio(budget)).toBeGreaterThan(0);
    expect(contextBudgetTitle(budget)).toContain("provider/model metadata");
  });

  it("falls back to heuristic context metadata for unknown cloud models", () => {
    const state = buildDefaultState([]);
    const provider = state.providers.find((item) => item.id === "shared-minimax")!;
    const runtimeNode = state.runtimeNodes.find((item) => item.id === "node-minimax-cloud")!;

    const budget = buildContextBudget({
      thread: null,
      composer: "unknown model budget",
      attachments: [],
      provider,
      runtimeNode,
      modelId: "unknown-cloud-model",
    });

    expect(budget.maxContextTokens).toBe(64_000);
    expect(budget.estimateQuality).toBe("heuristic");
    expect(contextBudgetTitle(budget)).toContain("not provider-tokenizer exact yet");
  });

  it("uses the local model budget for the desktop recovery floor", () => {
    const state = buildDefaultState([]);
    const provider = state.providers.find((item) => item.id === "shared-local")!;
    const runtimeNode = state.runtimeNodes.find((item) => item.id === "node-local-resurrect")!;

    const budget = buildContextBudget({
      thread: null,
      composer: "diagnose provider route",
      attachments: [],
      provider,
      runtimeNode,
      modelId: "batiai/gemma4-e2b:q4",
    });

    expect(budget.maxContextTokens).toBe(8_192);
    expect(budget.providerId).toBe("shared-local");
    expect(budget.estimateQuality).toBe("provider");
  });

  it("triggers automatic compaction at the configured threshold", () => {
    const state = buildDefaultState([]);
    const provider = state.providers.find((item) => item.id === "shared-local")!;
    const runtimeNode = state.runtimeNodes.find((item) => item.id === "node-local-resurrect")!;

    const budget = buildContextBudget({
      thread: null,
      composer: "x".repeat(27_000),
      attachments: [],
      provider,
      runtimeNode,
      modelId: "batiai/gemma4-e2b:q4",
    });

    expect(budget.compactionThreshold).toBe(Math.round(usableContextTokens(budget) * 0.8));
    expect(shouldAutoCompactContext(budget)).toBe(true);
  });

  it("flags hard-stop when estimated usage crosses the hard threshold", () => {
    const state = buildDefaultState([]);
    const budget = buildContextBudget({
      thread: {
        ...state.conversationThreads[0],
        messages: [
          {
            id: "thread-main-desktop:m1",
            threadId: "thread-main-desktop",
            channelId: "desktop-main",
            role: "user",
            author: "You",
            createdAt: "2026-04-25T10:00:00.000Z",
            content: "x".repeat(21_000),
          },
        ],
      },
      composer: "x".repeat(1_000),
      attachments: [],
      provider: state.providers.find((profile) => profile.id === "shared-local"),
      runtimeNode: state.runtimeNodes.find((node) => node.id === "local-mac-mini"),
      modelId: "batiai/gemma4-e2b:q4",
    });

    expect(shouldAutoCompactContext(budget)).toBe(true);
    expect(shouldHardStopContext(budget)).toBe(true);
  });

  it("persists compact state separately and records a compaction transcript event", () => {
    const state = buildDefaultState([]);
    const compacted = compactThreadContext(state, "thread-main-desktop", 1);

    expect(compacted.contextMemoryStates).toHaveLength(1);
    expect(compacted.contextMemoryStates[0]?.threadId).toBe("thread-main-desktop");
    expect(compacted.transcriptLedger).toHaveLength(1);
    expect(compacted.transcriptLedger[0]).toMatchObject({
      action: "context-compacted",
      threadId: "thread-main-desktop",
      payload: expect.objectContaining({
        checksum: compacted.contextMemoryStates[0]?.checksum,
      }),
    });
  });

  it("uses compact state to keep only preserved recent messages for provider prompts", () => {
    const state = buildDefaultState([]);
    const thread = {
      ...state.conversationThreads[0],
      messages: [
        {
          id: "thread-main-desktop:m1",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:00:00.000Z",
          content: "Initial rationale that should move into compact memory.",
        },
        {
          id: "thread-main-desktop:m2",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "assistant" as const,
          author: "Augmentor",
          createdAt: "2026-04-25T10:01:00.000Z",
          content: "Older implementation detail.",
        },
        {
          id: "thread-main-desktop:m3",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:02:00.000Z",
          content: "Recent instruction.",
        },
      ],
    };
    const compactState = buildDeterministicCompactState(thread, 1);
    const threadAfterCompaction = {
      ...thread,
      messages: [
        ...thread.messages,
        {
          id: "thread-main-desktop:m4",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:03:00.000Z",
          content: "New message after compaction must still be sent.",
        },
      ],
    };

    expect(promptMessagesForThread(threadAfterCompaction, compactState).map((message) => message.id)).toEqual([
      "thread-main-desktop:m3",
      "thread-main-desktop:m4",
    ]);
    expect(formatCompactStateForPrompt(compactState)).toContain("User why:");
    expect(latestCompactStateForThread({ contextMemoryStates: [compactState] }, thread.id)?.checksum).toBe(compactState.checksum);
  });

  it("falls back to the visible transcript when compact memory points at stale message ids", () => {
    const state = buildDefaultState([]);
    const thread = {
      ...state.conversationThreads.find((item) => item.id === "thread-main-desktop")!,
      messages: [
        {
          id: "thread-main-desktop:seed-1",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "assistant" as const,
          author: "Augmentor",
          createdAt: "2026-04-25T10:00:00.000Z",
          content: "Ready.",
        },
        {
          id: "thread-main-desktop:m2",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:01:00.000Z",
          content: "This latest user message must reach the provider.",
        },
      ],
    };
    const staleCompactState = {
      ...buildDeterministicCompactState(thread, 1),
      sourceRange: {
        fromMessageId: "thread-main-desktop:seed-1",
        toMessageId: "thread-main-desktop:m42",
      },
      preservedRecentMessageIds: ["thread-main-desktop:m35", "thread-main-desktop:m36"],
    };

    expect(promptMessagesForThread(thread, staleCompactState).map((message) => message.id)).toEqual(["thread-main-desktop:m2"]);
  });

  it("keeps failed assistant errors visible but out of provider prompt history", () => {
    const state = buildDefaultState([]);
    const thread = {
      ...state.conversationThreads.find((item) => item.id === "thread-main-desktop")!,
      messages: [
        {
          id: "thread-main-desktop:m1",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:00:00.000Z",
          content: "First attempt.",
        },
        {
          id: "thread-main-desktop:m2",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "assistant" as const,
          author: "Augmentor",
          createdAt: "2026-04-25T10:01:00.000Z",
          content: "invalid params, chat content is empty (2013)",
          status: "failed" as const,
        },
        {
          id: "thread-main-desktop:m3",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:02:00.000Z",
          content: "Retry with real content.",
        },
      ],
    };

    expect(promptMessagesForThread(thread, null).map((message) => message.id)).toEqual([
      "thread-main-desktop:m1",
      "thread-main-desktop:m3",
    ]);
  });

  it("copies compact states when a compacted thread is forked", () => {
    const state = buildDefaultState([]);
    const compacted = compactThreadContext(state, "thread-main-desktop", 1);
    const sourceThread = compacted.conversationThreads.find((thread) => thread.id === "thread-main-desktop")!;
    const forkThread = {
      ...sourceThread,
      id: "thread-fork-test",
      messages: sourceThread.messages.map((message) => ({
        ...message,
        id: message.id.replace("thread-main-desktop:", "thread-fork-test:"),
        threadId: "thread-fork-test",
      })),
    };

    const copiedStates = copyCompactStatesForFork(
      compacted.contextMemoryStates,
      sourceThread.id,
      forkThread,
    );
    const forkCompactState = latestCompactStateForThread({ contextMemoryStates: copiedStates }, forkThread.id);

    expect(forkCompactState).toBeTruthy();
    expect(forkCompactState?.threadId).toBe("thread-fork-test");
    expect(forkCompactState?.preservedRecentMessageIds.every((messageId) => messageId.startsWith("thread-fork-test:"))).toBe(true);
    expect(forkCompactState?.checksum).toContain(":fork:thread-fork-test");
  });
});

describe("deterministic compact state generation", () => {
  it("preserves user intent, why, facts, priorities, tasks, and artifact refs", () => {
    const state = buildDefaultState([]);
    const thread = {
      ...state.conversationThreads[0],
      messages: [
        {
          id: "thread-main-desktop:m1",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:00:00.000Z",
          content:
            "For me quality is more important than speed because ResonantOS needs to last. In my case MiniMax is configured for Augmentor.",
        },
        {
          id: "thread-main-desktop:m2",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "assistant" as const,
          author: "Augmentor",
          createdAt: "2026-04-25T10:01:00.000Z",
          content:
            "Decision: implement context compaction as host-owned structured memory. Reference https://example.com/context and commit abc1234.",
        },
        {
          id: "thread-main-desktop:m3",
          threadId: "thread-main-desktop",
          channelId: "desktop-main",
          role: "user" as const,
          author: "You",
          createdAt: "2026-04-25T10:02:00.000Z",
          content:
            "Go ahead and implement the compact state in src/core/context-memory.ts and test it deterministically. The previous implementation was completed and passed.",
        },
      ],
    };

    const compactState = buildDeterministicCompactState(thread, 2);

    expect(compactState.threadId).toBe("thread-main-desktop");
    expect(compactState.userIntent.goal).toContain("Go ahead");
    expect(compactState.userIntent.why).toContain("quality is more important than speed");
    expect(compactState.userIntent.prioritySignals.join(" ")).toContain("quality");
    expect(compactState.facts.map((fact) => fact.statement).join(" ")).toContain("MiniMax is configured");
    expect(compactState.facts.find((fact) => fact.statement.includes("MiniMax"))?.scope).toBe("user");
    expect(compactState.decisions[0]?.decision).toContain("host-owned structured memory");
    expect(compactState.openTasks.some((task) => task.status === "done")).toBe(true);
    expect(compactState.openTasks.some((task) => task.verificationRequired.includes("deterministic checks before completion"))).toBe(
      true,
    );
    expect(compactState.artifacts.map((artifact) => artifact.ref)).toContain("src/core/context-memory.ts");
    expect(compactState.artifacts.map((artifact) => artifact.ref)).toContain("https://example.com/context");
    expect(compactState.artifacts.map((artifact) => artifact.ref)).toContain("abc1234");
    expect(compactState.preservedRecentMessageIds).toEqual(["thread-main-desktop:m2", "thread-main-desktop:m3"]);
    expect(compactState.checksum).toMatch(/^fnv32:/);
    expect(formatCompactStateForPrompt(compactState)).toContain("Facts:");
  });
});
