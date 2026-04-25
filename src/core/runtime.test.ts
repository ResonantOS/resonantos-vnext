import { describe, expect, it } from "vitest";
import type { ResonantShellState } from "./contracts";
import { buildDefaultState } from "./defaults";
import { normalizeState } from "./runtime";

describe("runtime state migration", () => {
  it("migrates legacy recovery state onto the Resonant Engineer Agent and Gemma local runtime", () => {
    const base = buildDefaultState([]);
    const legacy = {
      ...base,
      agents: [
        {
          ...base.agents.find((agent) => agent.id === "strategist.core")!,
          providerProfileId: "shared-minimax",
          fallbackProviderProfileId: "shared-openai",
        },
        {
          ...base.agents.find((agent) => agent.id === "setup.core")!,
          displayName: "Setup",
          providerProfileId: "shared-minimax",
          fallbackProviderProfileId: "shared-openai",
          archiveReadScopes: ["configuration"],
          channelIds: ["desktop-setup"],
        },
        {
          id: "engineer.core",
          displayName: "Engineer Agent",
          trustTier: "core",
          workspaceBehavior: "delegated",
          providerProfileId: "shared-local",
          archiveReadScopes: ["configuration", "constitution"],
          archiveIntakeWriteScopes: ["LivingArchive/REVIEW"],
          canWriteKnowledgePages: false,
          channelIds: ["desktop-engineer"],
        },
        base.agents.find((agent) => agent.id === "archive-ingest.core")!,
      ],
      providers: base.providers.map((provider) =>
        provider.id === "shared-local"
          ? {
              ...provider,
              allowedModels: ["local/creative", "local/transcribe"],
              primaryModel: "local/creative",
            }
          : provider,
      ),
      runtimeNodes: base.runtimeNodes.map((node) =>
        node.id === "node-local-resurrect"
          ? {
              ...node,
              supportedModels: ["local/creative", "local/transcribe"],
            }
          : node,
      ),
      recoverySession: {
        ...base.recoverySession,
        engineerAgentId: "engineer.core",
        active: true,
      },
      conversationThreads: base.conversationThreads.filter((thread) => thread.id !== "thread-recovery-engineer"),
    } satisfies ResonantShellState;

    const normalized = normalizeState(legacy, base);

    const setupAgent = normalized.agents.find((agent) => agent.id === "setup.core");
    expect(setupAgent?.displayName).toBe("Resonant Engineer Agent");
    expect(setupAgent?.providerProfileId).toBe("shared-local");
    expect(normalized.recoverySession.engineerAgentId).toBe("setup.core");
    expect(normalized.providers.find((provider) => provider.id === "shared-local")?.primaryModel).toBe("batiai/gemma4-e2b:q4");
    expect(normalized.runtimeNodes.find((node) => node.id === "node-local-resurrect")?.supportedModels).toContain("batiai/gemma4-e2b:q4");
    expect(normalized.conversationThreads.find((thread) => thread.id === "thread-recovery-engineer")).toBeDefined();
    expect(normalized.modelStrategy.profileId).toBe("personal-studio-default");
    expect(normalized.modelStrategy.workloadStrategies.length).toBeGreaterThan(0);
  });
});
