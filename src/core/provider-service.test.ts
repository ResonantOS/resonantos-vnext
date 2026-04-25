import { describe, expect, it } from "vitest";
import { buildDefaultState } from "./defaults";
import { resolveArchiveIngestRoute, resolveRoutineRoute, resolveStrategistChatRoute } from "./provider-service";

describe("strategist provider service routing", () => {
  it("prefers the cloud route while it is healthy", () => {
    const state = buildDefaultState([]);
    const resolved = resolveStrategistChatRoute(state);

    expect(resolved.provider?.id).toBe("shared-minimax");
    expect(resolved.runtimeNode?.id).toBe("node-minimax-cloud");
    expect(resolved.decision.executionAdapterId).toBe("cloud-minimax-compatible");
    expect(resolved.decision.resolutionReason).toBe("primary-healthy");
  });

  it("falls back to the local resurrect runtime when cloud routes are unavailable", () => {
    const state = buildDefaultState([]);
    const degradedState = {
      ...state,
      providers: state.providers.map((provider) =>
        provider.providerType === "local" ? provider : { ...provider, status: "missing" as const },
      ),
      runtimeNodes: state.runtimeNodes.map((node) =>
        node.kind === "cloud" ? { ...node, healthState: "unavailable" as const } : node,
      ),
    };

    const resolved = resolveStrategistChatRoute(degradedState);

    expect(resolved.provider?.id).toBe("shared-local");
    expect(resolved.runtimeNode?.id).toBe("node-local-resurrect");
    expect(resolved.decision.executionAdapterId).toBe("local-ollama");
    expect(resolved.model).toBe("batiai/gemma4-e2b:q4");
    expect(resolved.decision.resolutionReason).toBe("fallback-in-policy");
  });

  it("stays pinned to the local resurrect runtime when recovery mode is enabled", () => {
    const state = buildDefaultState([]);
    const pinnedState = {
      ...state,
      agents: state.agents.map((agent) =>
        agent.id === "strategist.core"
          ? { ...agent, providerProfileId: "shared-local", fallbackProviderProfileId: undefined }
          : agent,
      ),
    };

    const resolved = resolveStrategistChatRoute(pinnedState);

    expect(resolved.provider?.id).toBe("shared-local");
    expect(resolved.runtimeNode?.id).toBe("node-local-resurrect");
    expect(resolved.decision.executionAdapterId).toBe("local-ollama");
    expect(resolved.decision.fallbackPolicyId).toBe("strict-supported-only");
  });
});

describe("workload strategy routing", () => {
  it("routes archive ingest through the premium cloud strategy first", () => {
    const state = buildDefaultState([]);
    const resolved = resolveArchiveIngestRoute(state);

    expect(resolved.provider?.id).toBe("shared-openai");
    expect(resolved.runtimeNode?.id).toBe("node-openai-cloud");
    expect(resolved.decision.executionAdapterId).toBe("cloud-openai-compatible");
    expect(resolved.model).toBe("gpt-5.4");
  });

  it("hard-stops archive ingest when strategy-approved cloud routes are unavailable", () => {
    const state = buildDefaultState([]);
    const unavailableState = {
      ...state,
      providers: state.providers.map((provider) =>
        provider.providerType === "local" ? provider : { ...provider, status: "missing" as const },
      ),
      runtimeNodes: state.runtimeNodes.map((node) =>
        node.kind === "cloud" ? { ...node, healthState: "unavailable" as const } : node,
      ),
    };

    const resolved = resolveArchiveIngestRoute(unavailableState);

    expect(resolved.provider).toBeUndefined();
    expect(resolved.runtimeNode).toBeUndefined();
    expect(resolved.decision.resolutionReason).toBe("no-viable-route");
  });

  it("routes routine work through the economical strategy chain", () => {
    const state = buildDefaultState([]);
    const resolved = resolveRoutineRoute(state);

    expect(resolved.provider?.id).toBe("shared-minimax");
    expect(resolved.runtimeNode?.id).toBe("node-minimax-cloud");
    expect(resolved.decision.executionAdapterId).toBe("cloud-minimax-compatible");
    expect(resolved.model).toBe("MiniMax-M2.7-highspeed");
  });
});
