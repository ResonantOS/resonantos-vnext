import { describe, expect, it } from "vitest";
import { buildDefaultState } from "../../core/defaults";
import {
  applyBrowserCommandResult,
  applyBrowserCommand,
  attachDelegationToActiveGoal,
  buildBrowserCommandExecutionPlan,
  createGoalWorkspace,
  formatStatusReply,
  packetForDelegateCommand,
  parseAugmentorCommand,
  parseNaturalBrowserIntent,
} from "./augmentor-commands";

describe("Augmentor command parser", () => {
  it("parses /goal with structured sections", () => {
    const parsed = parseAugmentorCommand(
      "/goal Build the command layer | success: parser works, controller works | constraints: no App.tsx monolith | budget: subscription",
    );

    expect(parsed).toMatchObject({
      ok: true,
      command: {
        kind: "goal",
        mission: "Build the command layer",
        successCriteria: ["parser works", "controller works"],
        constraints: ["no App.tsx monolith"],
        preferredCostTier: "subscription",
      },
    });
  });

  it("parses /delegate targets explicitly", () => {
    expect(parseAugmentorCommand("/delegate opencode Implement the browser bridge")).toMatchObject({
      ok: true,
      command: {
        kind: "delegate",
        target: "opencode",
        mission: "Implement the browser bridge",
      },
    });
  });

  it("parses /browser into a supervised browser task", () => {
    expect(parseAugmentorCommand("/browser inspect https://example.com")).toMatchObject({
      ok: true,
      command: {
        kind: "browser",
        action: "inspect",
        target: "https://example.com",
      },
    });
  });

  it("parses natural browser navigation before the LLM can hallucinate tool use", () => {
    expect(parseNaturalBrowserIntent("Please navigate to resonantdao.com and show me the page")).toEqual({
      kind: "browser",
      action: "open",
      target: "resonantdao.com",
    });
    expect(parseNaturalBrowserIntent("Can you inspect https://resonantdao.com/about?")).toEqual({
      kind: "browser",
      action: "inspect",
      target: "https://resonantdao.com/about",
    });
    expect(parseNaturalBrowserIntent("Use the browser to go on resonantdao.com")).toEqual({
      kind: "browser",
      action: "open",
      target: "resonantdao.com",
    });
    expect(parseNaturalBrowserIntent("Can you browse to resonantdao.com?")).toEqual({
      kind: "browser",
      action: "open",
      target: "resonantdao.com",
    });
    expect(parseNaturalBrowserIntent("Take me to resonantdao.com")).toEqual({
      kind: "browser",
      action: "open",
      target: "resonantdao.com",
    });
    expect(parseNaturalBrowserIntent("What do you think about resonantdao.com?")).toBeNull();
    expect(parseNaturalBrowserIntent("Open Architecture Note.md and create a Living Archive intake plan")).toBeNull();
  });

  it("formats status from goal workspace state", () => {
    const state = buildDefaultState([]);
    const parsed = parseAugmentorCommand("/goal Build status reporting");
    if (!parsed?.ok || parsed.command.kind !== "goal") {
      throw new Error("expected parsed goal");
    }
    const goal = createGoalWorkspace(state, "thread-main-desktop", parsed.command, "2026-05-24T10:00:00.000Z");
    const reply = formatStatusReply({ ...state, goalWorkspaces: [goal] });

    expect(goal.steps?.[0]).toMatchObject({ label: "Clarify success criteria and execution boundaries." });
    expect(goal.memoryRefs[0]).toMatchObject({
      ref: "system://resonantos-super-ai-app-plan",
      kind: "system-memory",
    });
    expect(reply).toContain("Goal workspace status");
    expect(reply).toContain("Build status reporting");
  });

  it("moves the shell to Browser for /browser commands", () => {
    const state = buildDefaultState([]);
    const next = applyBrowserCommand(state, { kind: "browser", action: "open", target: "example.com" });

    expect(next.uiPreferences.activeSection).toBe("browser");
    expect(next.uiPreferences.browserWorkspace.tabs[0]).toMatchObject({
      url: "https://example.com",
      label: "example.com",
    });
  });

  it("builds a typed Browser execution plan for inspect commands", () => {
    const state = buildDefaultState([]);
    const plan = buildBrowserCommandExecutionPlan(state, { kind: "browser", action: "inspect", target: "example.com" });

    expect(plan.nextState.uiPreferences.activeSection).toBe("browser");
    expect(plan.commands).toEqual([
      { type: "start", params: { defaultUrl: "https://example.com" } },
      { type: "open_url", params: { url: "https://example.com" } },
      { type: "read_page" },
    ]);
  });

  it("updates controlled Browser session from host command results", () => {
    const state = buildDefaultState([]);
    const next = applyBrowserCommandResult(
      state,
      {
        sessionId: "browser-1",
        finalUrl: "https://example.com/",
        title: "Example Domain",
        text: "Example page.",
        links: [],
        audit: [],
      },
      "2026-05-24T12:00:00.000Z",
    );

    expect(next.uiPreferences.browserWorkspace.controlledSession).toMatchObject({
      sessionId: "browser-1",
      status: "ready",
      url: "https://example.com/",
      title: "Example Domain",
      lastSyncedAt: "2026-05-24T12:00:00.000Z",
    });
  });

  it("rejects non-url Browser open tasks in v1", () => {
    const state = buildDefaultState([]);

    expect(() => buildBrowserCommandExecutionPlan(state, { kind: "browser", action: "open", target: "search for invoices" })).toThrow(
      "requires an http(s) URL or domain name",
    );
  });

  it("blocks add-on delegation until the target is enabled", () => {
    const state = buildDefaultState([]);
    const parsed = parseAugmentorCommand("/delegate opencode Implement a focused browser bridge test");
    if (!parsed?.ok || parsed.command.kind !== "delegate") {
      throw new Error("expected parsed delegation");
    }
    const command = parsed.command;

    expect(() => packetForDelegateCommand(state, command)).toThrow("addon.opencode is installed, enabled");
  });

  it("attaches successful delegation refs to the active goal for the same thread", () => {
    const state = buildDefaultState([]);
    const parsed = parseAugmentorCommand("/goal Build browser bridge");
    if (!parsed?.ok || parsed.command.kind !== "goal") {
      throw new Error("expected parsed goal");
    }
    const goal = createGoalWorkspace(state, "thread-main-desktop", parsed.command, "2026-05-24T10:00:00.000Z");
    const withGoal = { ...state, goalWorkspaces: [goal] };
    const withDelegation = attachDelegationToActiveGoal(
      withGoal,
      "thread-main-desktop",
      {
        id: "workspace-opencode-test",
        packetId: "delegation-opencode-test",
        rootPath: "/tmp/workspace-opencode-test",
        packetPath: "/tmp/workspace-opencode-test/delegation.packet.json",
        taskMarkdownPath: "/tmp/workspace-opencode-test/TASK.md",
        artifactsPath: "/tmp/workspace-opencode-test/artifacts",
        logsPath: "/tmp/workspace-opencode-test/logs",
        resultPath: "/tmp/workspace-opencode-test/result.md",
        verificationPath: "/tmp/workspace-opencode-test/verification.json",
      },
      {
        id: "delegation-opencode-test",
        targetAgentId: "opencode.runtime",
        mission: "Implement a focused browser bridge test",
      } as never,
      "2026-05-24T10:30:00.000Z",
    );

    expect(withDelegation.goalWorkspaces[0]).toMatchObject({
      phase: "delegated",
      delegationRefs: [
        {
          workspaceId: "workspace-opencode-test",
          packetId: "delegation-opencode-test",
          targetAgentId: "opencode.runtime",
          status: "dispatched",
        },
      ],
    });
  });
});
