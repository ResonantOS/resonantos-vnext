import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AddOnManifest } from "./contracts";
import {
  appendAssistantMessage,
  appendUserMessage,
  createStrategistThread,
  engineerSystemPrompt,
  strategistSystemPrompt,
} from "./chat";
import { buildDefaultState } from "./defaults";

describe("chat transcript ledger", () => {
  it("records appended visible messages in an append-only transcript ledger", () => {
    const base = buildDefaultState([]);
    const withUser = appendUserMessage(base, "thread-main-desktop", "Preserve the why behind the work.");
    const withAssistant = appendAssistantMessage(withUser, "thread-main-desktop", "I will preserve user intent.");

    expect(withAssistant.transcriptLedger).toHaveLength(2);
    expect(withAssistant.transcriptLedger[0]).toMatchObject({
      action: "message-appended",
      threadId: "thread-main-desktop",
      role: "user",
      payload: expect.objectContaining({
        content: "Preserve the why behind the work.",
      }),
    });
    expect(withAssistant.transcriptLedger[1]).toMatchObject({
      action: "message-appended",
      role: "assistant",
      payload: expect.objectContaining({
        content: "I will preserve user intent.",
      }),
    });
  });

  it("records created chat threads without depending on visible thread history", () => {
    const base = buildDefaultState([]);
    const next = createStrategistThread(base, {
      channelId: "desktop-main",
      workspaceId: "workspace-main",
      title: "Compaction test",
    });

    expect(next.transcriptLedger).toHaveLength(1);
    expect(next.transcriptLedger[0]).toMatchObject({
      action: "thread-created",
      agentId: "strategist.core",
      payload: expect.objectContaining({
        title: "Compaction test",
      }),
    });
  });

  it("keeps provider usage telemetry on assistant messages and transcript events", () => {
    const base = buildDefaultState([]);
    const next = appendAssistantMessage(base, "thread-main-desktop", "Usage measured.", {
      providerUsage: {
        providerId: "shared-minimax",
        model: "MiniMax-M2.7",
        source: "provider",
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        durationMs: 2200,
        tokensPerSecond: 13.6,
      },
    });

    const message = next.conversationThreads
      .find((thread) => thread.id === "thread-main-desktop")
      ?.messages.at(-1);
    expect(message?.providerUsage).toMatchObject({
      providerId: "shared-minimax",
      promptTokens: 120,
      totalTokens: 150,
    });
    expect(next.transcriptLedger.at(-1)?.payload).toMatchObject({
      providerUsage: expect.objectContaining({
        model: "MiniMax-M2.7",
        completionTokens: 30,
        tokensPerSecond: 13.6,
      }),
    });
  });

  it("uses the owning add-on agent display name for add-on assistant messages", () => {
    const base = buildDefaultState([
      {
        id: "addon.hermes",
        name: "Hermes",
        version: "0.1.0",
        author: "test",
        category: "agent",
        description: "test",
        runtimeType: "agent-addon",
        surfaces: [],
        requestedCapabilities: [],
        providerRequirements: { sharedProfiles: [], supportsPrivateCredentials: false },
        archiveIntegration: {
          readScopes: [],
          intakeWriteScopes: [],
          canRequestIngest: false,
          canWriteKnowledgePages: false,
        },
        health: { strategy: "test" },
        installHooks: {},
        compatibility: { shellVersion: "^0.1.0", platforms: ["macOS"] },
      },
    ]);
    const state = {
      ...base,
      conversationThreads: [
        {
          id: "thread-hermes-test",
          title: "Hermes",
          owningAgentId: "hermes.agent",
          workspaceId: "workspace-hermes",
          channelId: "desktop-hermes",
          summary: "Hermes add-on test.",
          messages: [],
        },
        ...base.conversationThreads,
      ],
    };
    const next = appendAssistantMessage(state, "thread-hermes-test", "I am here.");

    const message = next.conversationThreads.find((thread) => thread.id === "thread-hermes-test")?.messages.at(-1);
    expect(message?.author).toBe("Hermes");
  });

  it("adds enabled add-on Augmentor skills to the Strategist system prompt", () => {
    const paperclipManifest: AddOnManifest = {
      id: "addon.paperclip",
      name: "Paperclip",
      version: "0.1.0",
      author: "test",
      category: "orchestration",
      description: "test",
      runtimeType: "embedded-module",
      surfaces: [],
      requestedCapabilities: [],
      providerRequirements: { sharedProfiles: [], supportsPrivateCredentials: false },
      archiveIntegration: {
        readScopes: [],
        intakeWriteScopes: [],
        canRequestIngest: false,
        canWriteKnowledgePages: false,
      },
      health: { strategy: "test" },
      installHooks: {},
      compatibility: { shellVersion: "^0.1.0", platforms: ["macOS"] },
      augmentorSkills: [
        {
          documentPath: "docs/architecture/addon-skills/paperclip/AUGMENTOR_SKILL.md",
          objective: "Design and create an approved Paperclip organizational structure.",
          requiredCapabilities: ["network", "providers", "agent-delegation"],
          requiredTools: ["paperclip.status", "paperclip.create_delegation_packet"],
          workflowPhases: ["intent capture", "proposal", "human approval", "delegation packet creation"],
          approvalGates: ["Approve company mission before creating Paperclip structures."],
          expectedInputs: ["human intent"],
          expectedOutputs: ["business architecture proposal", "Paperclip delegation packet"],
          producesDelegationPackets: true,
          auditLogRequired: true,
        },
      ],
    };
    const state = buildDefaultState([paperclipManifest]);
    state.installations["addon.paperclip"].installed = true;
    state.installations["addon.paperclip"].enabled = true;
    state.installations["addon.paperclip"].status = "enabled";

    const prompt = strategistSystemPrompt(state, [paperclipManifest]);

    expect(prompt).toContain("Enabled add-on operating skills");
    expect(prompt).toContain("Paperclip");
    expect(prompt).toContain("Design and create an approved Paperclip organizational structure.");
    expect(prompt).toContain("paperclip.create_delegation_packet");
    expect(prompt).toContain("Approve company mission before creating Paperclip structures.");
  });

  it("does not add Augmentor skills for disabled add-ons", () => {
    const paperclipManifest: AddOnManifest = {
      id: "addon.paperclip",
      name: "Paperclip",
      version: "0.1.0",
      author: "test",
      category: "orchestration",
      description: "test",
      runtimeType: "embedded-module",
      surfaces: [],
      requestedCapabilities: [],
      providerRequirements: { sharedProfiles: [], supportsPrivateCredentials: false },
      archiveIntegration: {
        readScopes: [],
        intakeWriteScopes: [],
        canRequestIngest: false,
        canWriteKnowledgePages: false,
      },
      health: { strategy: "test" },
      installHooks: {},
      compatibility: { shellVersion: "^0.1.0", platforms: ["macOS"] },
      augmentorSkills: [
        {
          documentPath: "docs/architecture/addon-skills/paperclip/AUGMENTOR_SKILL.md",
          objective: "Design and create an approved Paperclip organizational structure.",
          requiredCapabilities: ["network"],
          requiredTools: ["paperclip.status"],
          workflowPhases: ["intent capture"],
          approvalGates: ["Approve first."],
          expectedInputs: ["human intent"],
          expectedOutputs: ["proposal"],
          producesDelegationPackets: true,
          auditLogRequired: true,
        },
      ],
    };
    const state = buildDefaultState([paperclipManifest]);

    const prompt = strategistSystemPrompt(state, [paperclipManifest]);

    expect(prompt).not.toContain("Enabled add-on operating skills");
    expect(prompt).not.toContain("Design and create an approved Paperclip organizational structure.");
  });

  it("teaches Augmentor how to use the enabled Hermes add-on", () => {
    const hermesManifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "public", "addons", "hermes.json"), "utf8"),
    ) as AddOnManifest;
    const state = buildDefaultState([hermesManifest]);
    state.installations["addon.hermes"].installed = true;
    state.installations["addon.hermes"].enabled = true;
    state.installations["addon.hermes"].status = "enabled";

    const prompt = strategistSystemPrompt(state, [hermesManifest]);

    expect(prompt).toContain("Use Hermes as a delegated communication");
    expect(prompt).toContain("hermes.create_delegation_workspace");
    expect(prompt).toContain("human approval before outbound send");
    expect(prompt).toContain("Living Archive boundaries");
  });

  it("teaches Augmentor how to delegate to enabled OpenCode", () => {
    const openCodeManifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "public", "addons", "opencode.json"), "utf8"),
    ) as AddOnManifest;
    const state = buildDefaultState([openCodeManifest]);
    state.installations["addon.opencode"].installed = true;
    state.installations["addon.opencode"].enabled = true;
    state.installations["addon.opencode"].status = "enabled";

    const prompt = strategistSystemPrompt(state, [openCodeManifest]);

    expect(prompt).toContain("Delegate bounded coding, debugging, refactor");
    expect(prompt).toContain("Installed and enabled add-ons visible to this Strategist turn: OpenCode (addon.opencode).");
    expect(prompt).toContain("opencode.launch_workspace");
    expect(prompt).toContain("Human approval is required before OpenCode executes shell commands");
    expect(prompt).toContain("Do not claim you executed one unless the ResonantOS host returns a concrete result");
    expect(prompt).toContain("changed files, commands run, verification evidence, and residual risks");
  });

  it("adds authoritative route and model context to the Strategist prompt", () => {
    const state = buildDefaultState([]);

    const prompt = strategistSystemPrompt(state, [], {
      activeModel: "gemma-4-26b-a4b-q4_k_m.gguf",
      activeProviderLabel: "ASUS GX10",
      activeRouteLabel: "ASUS GX10 Runtime",
      activeRuntimeKind: "remote-user-owned",
    });

    expect(prompt).toContain("Current active model for this reply: gemma-4-26b-a4b-q4_k_m.gguf.");
    expect(prompt).toContain("If the user asks which AI model you are running on");
  });

  it("teaches the Resonant Engineer Agent the Senior AI Developer command aliases", () => {
    const prompt = engineerSystemPrompt({
      activeModel: "gpt-5.4",
      activeRouteLabel: "Core Fast Chain",
      activeRuntimeKind: "cloud",
      localRuntimeStatus: null,
    });

    expect(prompt).toContain("Core Engineer skill: Senior AI Developer");
    expect(prompt).toContain("$senior-ai-developer");
    expect(prompt).toContain("$senior-ai-develope");
    expect(prompt).toContain("what code means to humans with what it actually permits");
    expect(prompt).toContain("Human authorship is not a security claim");
    expect(prompt).toContain("Critical, High, Medium, Low");
    expect(prompt).toContain("Findings, Evidence, Exploitability, Impact, Fix, Verification, Tests Run, and Residual Risk");
    expect(prompt).toContain("Provider Vault secrets");
    expect(prompt).toContain("manifest capabilities, UI grant presets");
    expect(prompt).toContain("UI grants must never be the only boundary");
    expect(prompt).toContain("passive inspection cannot launch subprocesses");
    expect(prompt).toContain("manifest/backend capability drift");
    expect(prompt).toContain("Stop and ask before destructive filesystem changes");
    expect(prompt).toContain("prompt or tool injection");
  });
});
