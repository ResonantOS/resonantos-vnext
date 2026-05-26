import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationThread, ResonantShellState } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { executeChatTurn } from "./controller";

const requestHermesChatCompletionMock = vi.fn();
const buildArchiveContextBundleMock = vi.fn();
const requestCreateTaskWorkspaceMock = vi.fn();
const requestBrowserHostCommandMock = vi.fn();
const requestBrowserVisibleHostCommandMock = vi.fn();

vi.mock("../../core/runtime", () => ({
  requestBrowserHostCommand: (...args: unknown[]) => requestBrowserHostCommandMock(...args),
  requestBrowserVisibleHostCommand: (...args: unknown[]) => requestBrowserVisibleHostCommandMock(...args),
  requestCreateTaskWorkspace: (...args: unknown[]) => requestCreateTaskWorkspaceMock(...args),
  requestEngineerRecoveryTurn: vi.fn(),
  requestFinishTaskWorkspace: vi.fn(),
  requestHermesChatCompletion: (...args: unknown[]) => requestHermesChatCompletionMock(...args),
  requestLocalRuntimeStatus: vi.fn(),
  requestProviderDiagnostics: vi.fn().mockResolvedValue([]),
  requestProviderServiceChatCompletion: vi.fn(),
  requestProviderServiceChatCompletionStream: vi.fn(),
  requestReadTaskWorkspace: vi.fn(),
}));

vi.mock("../../core/memory-provider", () => ({
  resolveMemoryProviderBroker: vi.fn(() => undefined),
}));

vi.mock("./archive-context", () => ({
  buildArchiveContextBundle: (...args: unknown[]) => buildArchiveContextBundleMock(...args),
  buildSystemMemoryContextBundle: vi.fn().mockResolvedValue(null),
  formatArchiveContextForPrompt: (bundle: { pages?: Array<{ title: string; path: string }> } | null) =>
    bundle?.pages?.length ? `Living Archive context retrieved for this turn.\n${bundle.pages[0].title}` : "No Living Archive context.",
  formatSystemMemoryForPrompt: vi.fn(() => ""),
  archiveCitationsFromBundle: (bundle: { pages?: Array<{ title: string; path: string; pageType?: string; snippet?: string }> } | null) =>
    bundle?.pages?.map((page) => ({
      title: page.title,
      path: page.path,
      pageType: page.pageType ?? "summary",
      snippet: page.snippet,
    })) ?? [],
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
};

const noopStateSetter = vi.fn();

const waitForCondition = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

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
    grantedCapabilities: [
      ...(state.installations["addon.hermes"]?.grantedCapabilities ?? []),
      {
        capability: "archive-read",
        granted: true,
        scope: "shared",
        revocationBehavior: "degrade",
      },
    ],
  };
  return { state, thread };
};

describe("executeChatTurn Hermes feedback", () => {
  beforeEach(() => {
    requestCreateTaskWorkspaceMock.mockReset();
    requestBrowserHostCommandMock.mockReset();
    requestBrowserVisibleHostCommandMock.mockReset();
    requestBrowserVisibleHostCommandMock.mockImplementation(
      async (command: { type: string; params?: { url?: string } }) => {
        if (command.type === "wallet_host_open_url") {
          const url = command.params?.url ?? "https://example.com";
          return {
            sessionId: "wallet-browser-main",
            requestedUrl: url,
            finalUrl: url.endsWith("/") ? url : `${url}/`,
            title: url.includes("resonantdao") ? "ResonantDAO" : "Example Domain",
            status: "session-active",
            engine: "external-chrome-cdp",
            audit: [],
          };
        }
        if (command.type === "wallet_host_read_page") {
          return {
            sessionId: "wallet-browser-main",
            finalUrl: "https://example.com/",
            title: "Example Domain",
            text: "Example Domain content.",
            links: [],
            audit: [],
          };
        }
        return {
          sessionId: "wallet-browser-main",
          status: "ok",
          audit: [],
        };
      },
    );
    requestCreateTaskWorkspaceMock.mockResolvedValue({
      id: "workspace-command-test",
      packetId: "packet-command-test",
      rootPath: "/tmp/workspace-command-test",
      packetPath: "/tmp/workspace-command-test/delegation.packet.json",
      taskMarkdownPath: "/tmp/workspace-command-test/TASK.md",
      artifactsPath: "/tmp/workspace-command-test/artifacts",
      logsPath: "/tmp/workspace-command-test/logs",
      resultPath: "/tmp/workspace-command-test/result.md",
      verificationPath: "/tmp/workspace-command-test/verification.json",
    });
    requestHermesChatCompletionMock.mockReset();
    buildArchiveContextBundleMock.mockReset();
    buildArchiveContextBundleMock.mockResolvedValue({
      query: "Hermes test",
      pages: [
        {
          title: "Hermes Operating Boundary",
          path: "LivingArchive/System/Hermes.md",
          pageType: "summary",
          snippet: "Hermes reads archive context through ResonantOS.",
          content: "Hermes reads archive context through ResonantOS.",
        },
      ],
      sources: [],
      failures: [],
    });
  });

  it("handles /goal without calling the provider route", async () => {
    const state = buildDefaultState([]);
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    const commits: ResonantShellState[] = [];

    await executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "/goal Build Augmentor command layer | success: parser, controller | budget: subscription",
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
      runToken: "run-goal",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    expect(requestHermesChatCompletionMock).not.toHaveBeenCalled();
    expect(requestCreateTaskWorkspaceMock).not.toHaveBeenCalled();
    expect(commits.at(-1)?.goalWorkspaces[0]).toMatchObject({
      mission: "Build Augmentor command layer",
      phase: "active",
      successCriteria: ["parser", "controller"],
    });
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain("Goal created:");
  });

  it("handles /delegate by creating a task workspace", async () => {
    const state = buildDefaultState([]);
    state.installations["addon.opencode"] = {
      addonId: "addon.opencode",
      provenanceTier: "curated-signed",
      verificationState: "verified",
      installed: true,
      enabled: true,
      status: "enabled",
      source: "bundled",
      grantedCapabilities: [],
      recommendedGrantPresetIds: [],
      privateProviderProfileIds: [],
      notes: [],
    };
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    const commits: ResonantShellState[] = [];

    await executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "/delegate opencode Implement a deterministic browser bridge",
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
      runToken: "run-delegate",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    expect(requestCreateTaskWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetAgentId: "opencode.runtime",
        mission: "Implement a deterministic browser bridge",
      }),
    );
    expect(commits.at(-1)?.uiPreferences.activeSection).toBe("opencode");
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain("OpenCode delegation workspace");
  });

  it("handles /browser by executing typed Browser bridge commands", async () => {
    const state = buildDefaultState([]);
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    const commits: ResonantShellState[] = [];

    await executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "/browser inspect example.com",
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
      runToken: "run-browser",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    expect(requestBrowserHostCommandMock).not.toHaveBeenCalled();
    expect(requestBrowserVisibleHostCommandMock).toHaveBeenCalledWith({
      type: "wallet_host_open_url",
      params: { url: "https://example.com" },
      humanApproved: true,
    });
    expect(requestBrowserVisibleHostCommandMock).toHaveBeenCalledWith({
      type: "wallet_host_read_page",
      humanApproved: true,
    });
    expect(commits.at(-1)?.uiPreferences.activeSection).toBe("browser");
    expect(commits.at(-1)?.uiPreferences.browserWorkspace.tabs[0].url).toBe("https://example.com");
    expect(commits.at(-1)?.uiPreferences.browserWorkspace.controlledSession).toMatchObject({
      sessionId: "wallet-browser-main",
      status: "ready",
      url: "https://example.com/",
      title: "Example Domain",
      error: null,
    });
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain("Browser task completed");
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain("Example Domain");
  });

  it("intercepts natural browser navigation before calling the LLM provider", async () => {
    const state = buildDefaultState([]);
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    const commits: ResonantShellState[] = [];

    await executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "Please navigate to resonantdao.com",
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
      runToken: "run-browser-natural",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    expect(requestBrowserHostCommandMock).not.toHaveBeenCalled();
    expect(requestBrowserVisibleHostCommandMock).toHaveBeenCalledWith({
      type: "wallet_host_open_url",
      params: { url: "https://resonantdao.com" },
      humanApproved: true,
    });
    expect(requestHermesChatCompletionMock).not.toHaveBeenCalled();
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain("Browser task completed");
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain(
      "Wallet Browser host",
    );
  });

  it("handles /status without provider execution", async () => {
    const state = buildDefaultState([]);
    const thread = state.conversationThreads.find((item) => item.id === "thread-main-desktop")!;
    const commits: ResonantShellState[] = [];

    await executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "/status",
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
      runToken: "run-status",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    expect(requestCreateTaskWorkspaceMock).not.toHaveBeenCalled();
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.content).toContain("ResonantOS status");
  });

  it("commits the user message and Hermes placeholder before the Hermes bridge resolves", async () => {
    const { state, thread } = hermesState();
    const bridge = deferred<{ reply: string; command: string; profileHome: string; model?: string }>();
    requestHermesChatCompletionMock.mockReturnValueOnce(bridge.promise);
    const commits: ResonantShellState[] = [];

    const turn = executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "are you there?",
      attachments: [],
      activeChatModel: "gemma-4-26b-a4b-q4_k_m.gguf",
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
    await waitForCondition(() => requestHermesChatCompletionMock.mock.calls.length > 0);
    expect(requestHermesChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemma-4-26b-a4b-q4_k_m.gguf",
        prompt: expect.stringContaining("Hermes Operating Boundary"),
      }),
    );

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
      archiveCitations: [
        expect.objectContaining({
          title: "Hermes Operating Boundary",
          path: "LivingArchive/System/Hermes.md",
        }),
      ],
      providerUsage: expect.objectContaining({
        providerId: "addon.hermes",
        model: "gemma-4-26b-a4b-q4_k_m.gguf",
      }),
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
    const bridge = deferred<{ reply: string; command: string; profileHome: string; model?: string }>();
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
    await waitForCondition(() => requestHermesChatCompletionMock.mock.calls.length > 0);
    expect(requestHermesChatCompletionMock).toHaveBeenCalledTimes(1);

    bridge.resolve({
      reply: "Hello.",
      command: "/Users/augmentor/.hermes/hermes-agent/venv/bin/hermes",
      profileHome: "/Users/augmentor/.hermes",
    });
    await turn;
    vi.stubGlobal("window", originalWindow);
  });

  it("does not retrieve Living Archive context for Hermes when archive-read is not granted", async () => {
    const { state, thread } = hermesState();
    state.installations["addon.hermes"].grantedCapabilities = state.installations["addon.hermes"].grantedCapabilities.map((grant) =>
      grant.capability === "archive-read" ? { ...grant, granted: false } : grant,
    );
    requestHermesChatCompletionMock.mockResolvedValueOnce({
      reply: "No archive context used.",
      command: "/Users/augmentor/.hermes/hermes-agent/venv/bin/hermes",
      profileHome: "/Users/augmentor/.hermes",
      model: "gemma-4-26b-a4b-q4_k_m.gguf",
    });
    const commits: ResonantShellState[] = [];

    await executeChatTurn({
      snapshot: { state, bundled: [], sideloaded: [] },
      activeThread: thread,
      composer: "hello without archive",
      attachments: [],
      activeChatModel: "gemma-4-26b-a4b-q4_k_m.gguf",
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
      runToken: "run-hermes-no-archive",
      isRunCurrent: () => true,
      errorMessageOf: (error) => (error instanceof Error ? error.message : String(error)),
    });

    expect(buildArchiveContextBundleMock).not.toHaveBeenCalled();
    expect(requestHermesChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining("Hermes Operating Boundary"),
      }),
    );
    expect(commits.at(-1)?.conversationThreads[0].messages.at(-1)?.archiveCitations).toEqual([]);
  });
});
