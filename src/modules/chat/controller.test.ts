import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationThread, ResonantShellState } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { executeChatTurn } from "./controller";

const requestHermesChatCompletionMock = vi.fn();

vi.mock("../../core/runtime", () => ({
  requestCreateTaskWorkspace: vi.fn(),
  requestEngineerRecoveryTurn: vi.fn(),
  requestFinishTaskWorkspace: vi.fn(),
  requestHermesChatCompletion: (...args: unknown[]) => requestHermesChatCompletionMock(...args),
  requestLocalRuntimeStatus: vi.fn(),
  requestProviderDiagnostics: vi.fn().mockResolvedValue([]),
  requestProviderServiceChatCompletion: vi.fn(),
  requestProviderServiceChatCompletionStream: vi.fn(),
  requestReadTaskWorkspace: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
};

const noopStateSetter = vi.fn();

const hermesState = (): { state: ResonantShellState; thread: ConversationThread } => {
  const state = buildDefaultState([]);
  const channel = state.channels.find((item) => item.id === "desktop-hermes");
  if (channel) {
    channel.enabled = true;
  }
  const thread: ConversationThread = {
    id: "thread-hermes-test",
    title: "Hermes test",
    owningAgentId: "hermes.agent",
    workspaceId: "workspace-hermes",
    channelId: "desktop-hermes",
    summary: "Hermes UI feedback test.",
    messages: [],
  };
  state.conversationThreads = [thread, ...state.conversationThreads];
  state.uiPreferences.activeChatThreadId = thread.id;
  state.installations["addon.hermes"] = {
    ...state.installations["addon.hermes"],
    installed: true,
    enabled: true,
    status: "enabled",
  };
  return { state, thread };
};

describe("executeChatTurn Hermes feedback", () => {
  beforeEach(() => {
    requestHermesChatCompletionMock.mockReset();
  });

  it("commits the user message and Hermes placeholder before the Hermes bridge resolves", async () => {
    const { state, thread } = hermesState();
    const bridge = deferred<{ reply: string; command: string; profileHome: string }>();
    requestHermesChatCompletionMock.mockReturnValueOnce(bridge.promise);
    const commits: ResonantShellState[] = [];

    const turn = executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "are you there?",
      attachments: [],
      activeChatModel: "",
      thinkingDepth: "minimal",
      commitReadyState: (nextState) => commits.push(nextState),
      setComposer: noopStateSetter,
      setAttachments: noopStateSetter,
      setChatNotice: noopStateSetter,
      setChatBusy: noopStateSetter,
      setChatRunPhase: noopStateSetter,
      setChatRunEvents: noopStateSetter,
      setAgentActivityLabel: noopStateSetter,
      setProviderDiagnostics: noopStateSetter,
      setRecoveryRuntimeStatus: noopStateSetter,
      runToken: "run-hermes",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(commits.length).toBeGreaterThanOrEqual(2);
    expect(commits[0].conversationThreads[0].messages.at(-1)).toMatchObject({
      role: "user",
      content: "are you there?",
    });
    expect(commits[1].conversationThreads[0].messages.at(-1)).toMatchObject({
      role: "assistant",
      author: "Hermes",
      content: "Hermes is thinking...",
    });

    bridge.resolve({
      reply: "I am here.",
      command: "/Users/augmentor/.hermes/hermes-agent/venv/bin/hermes",
      profileHome: "/Users/augmentor/.hermes",
    });
    await turn;

    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)).toMatchObject({
      role: "assistant",
      author: "Hermes",
      content: "I am here.",
    });
  });

  it("waits for the visible Hermes placeholder before invoking the bridge", async () => {
    const originalWindow = globalThis.window;
    const animationCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        animationCallbacks.push(callback);
        return animationCallbacks.length;
      },
    });
    const { state, thread } = hermesState();
    const bridge = deferred<{ reply: string; command: string; profileHome: string }>();
    requestHermesChatCompletionMock.mockReturnValueOnce(bridge.promise);
    const commits: ResonantShellState[] = [];

    const turn = executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "hello",
      attachments: [],
      activeChatModel: "",
      thinkingDepth: "minimal",
      commitReadyState: (nextState) => commits.push(nextState),
      setComposer: noopStateSetter,
      setAttachments: noopStateSetter,
      setChatNotice: noopStateSetter,
      setChatBusy: noopStateSetter,
      setChatRunPhase: noopStateSetter,
      setChatRunEvents: noopStateSetter,
      setAgentActivityLabel: noopStateSetter,
      setProviderDiagnostics: noopStateSetter,
      setRecoveryRuntimeStatus: noopStateSetter,
      runToken: "run-hermes",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    await Promise.resolve();
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toBe("Hermes is thinking...");
    expect(requestHermesChatCompletionMock).not.toHaveBeenCalled();

    animationCallbacks.shift()?.(0);
    await Promise.resolve();
    expect(requestHermesChatCompletionMock).not.toHaveBeenCalled();

    animationCallbacks.shift()?.(16);
    await Promise.resolve();
    expect(requestHermesChatCompletionMock).toHaveBeenCalledTimes(1);

    bridge.resolve({
      reply: "Hello.",
      command: "/Users/augmentor/.hermes/hermes-agent/venv/bin/hermes",
      profileHome: "/Users/augmentor/.hermes",
    });
    await turn;
    vi.stubGlobal("window", originalWindow);
  });
});
