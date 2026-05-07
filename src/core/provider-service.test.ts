import { describe, expect, it } from "vitest";
import { buildDefaultState } from "./defaults";
import {
  resolveArchiveIngestRoute,
  resolveRoutineRoute,
  resolveStrategistChatRoute,
  selectableAgentChatModels,
} from "./provider-service";

describe("strategist provider service routing", () => {
  it("prefers the cloud route while it is healthy", () => {
    const base = buildDefaultState([]);
    const state = {
      ...base,
      providers: base.providers.map((p) =>
        p.providerType !== "local" ? { ...p, credentialStatus: "configured" as const } : p,
      ),
    };
    const resolved = resolveStrategistChatRoute(state);

    expect(resolved.provider?.id).toBe("shared-minimax");
    expect(resolved.runtimeNode?.id).toBe("node-minimax-cloud");
    expect(resolved.decision.executionAdapterId).toBe("cloud-minimax-compatible");
    expect(resolved.executionAdapter?.supportsStreaming).toBe(true);
    expect(resolved.executionAdapter?.supportsAbort).toBe(true);
    expect(resolved.decision.resolutionReason).toBe("primary-healthy");
  });

  it("does not use the built-in GX10 placeholder as a fallback route", () => {
    const state = buildDefaultState([]);
    const degradedState = {
      ...state,
      providers: state.providers.map((provider) =>
        provider.providerType === "local" ? provider : { ...provider, status: "missing" as const },
      ),
      runtimeNodes: state.runtimeNodes.map((node) =>
        node.kind === "cloud"
          ? { ...node, healthState: "unavailable" as const }
          : node,
      ),
    };

    const resolved = resolveStrategistChatRoute(degradedState);

    expect(resolved.provider?.id).toBe("shared-local");
    expect(resolved.runtimeNode?.id).toBe("node-local-resurrect");
    expect(resolved.decision.executionAdapterId).toBe("local-ollama");
    expect(resolved.model).toBe("batiai/gemma4-e2b:q4");
    expect(resolved.decision.resolutionReason).toBe("fallback-in-policy");
  });

  it("uses the desktop resurrect floor when cloud and remote user-owned routes are unavailable", () => {
    const state = buildDefaultState([]);
    const unavailableState = {
      ...state,
      providers: state.providers.map((provider) =>
        provider.providerType === "local" ? provider : { ...provider, status: "missing" as const },
      ),
      runtimeNodes: state.runtimeNodes.map((node) =>
        node.kind === "cloud" || node.kind === "remote-user-owned" ? { ...node, healthState: "unavailable" as const } : node,
      ),
    };

    const resolved = resolveStrategistChatRoute(unavailableState);

    expect(resolved.provider?.id).toBe("shared-local");
    expect(resolved.runtimeNode?.id).toBe("node-local-resurrect");
    expect(resolved.decision.executionAdapterId).toBe("local-ollama");
    expect(resolved.model).toBe("batiai/gemma4-e2b:q4");
    expect(resolved.decision.resolutionReason).toBe("fallback-in-policy");
  });

  it("does not expose placeholder GX10 models before a real HTTP runtime is discovered", () => {
    const state = {
      ...buildDefaultState([]),
      providers: buildDefaultState([]).providers.map((provider) =>
        provider.providerType === "local" ? provider : { ...provider, status: "missing" as const },
      ),
      runtimeNodes: buildDefaultState([]).runtimeNodes.map((node) =>
        node.kind === "cloud" ? { ...node, healthState: "unavailable" as const } : node,
      ),
    };

    const selectable = selectableAgentChatModels(state, "strategist.core");
    const resolved = resolveStrategistChatRoute(state, "qwen-3.5");

    expect(selectable).not.toContain("qwen-3.5");
    expect(selectable).not.toContain("gemma-4");
    expect(resolved.runtimeNode?.id).toBe("node-local-resurrect");
    expect(resolved.model).toBe("batiai/gemma4-e2b:q4");
  });

  it("allows an explicitly selected verified LAN model to route from Augmentor chat", () => {
    const state = buildDefaultState([]);
    const gx10Provider = {
      ...state.providers.find((provider) => provider.id === "shared-local")!,
      id: "provider-asus-gx10-test",
      label: "ASUS GX10",
      providerType: "openai-compatible" as const,
      apiBaseUrl: "http://192.168.1.42:30000/v1",
      allowedModels: ["gemma-4-26b-a4b-q4_k_m.gguf"],
      primaryModel: "gemma-4-26b-a4b-q4_k_m.gguf",
      fallbackModel: undefined,
      status: "ready" as const,
      credentialStatus: "configured" as const,
    };
    const gx10Node = {
      ...state.runtimeNodes.find((node) => node.id === "node-gx10-qwen")!,
      id: "node-provider-asus-gx10-test",
      label: "ASUS GX10 Runtime",
      providerProfileId: gx10Provider.id,
      endpoint: "http://192.168.1.42:30000/v1",
      supportedModels: ["gemma-4-26b-a4b-q4_k_m.gguf"],
      healthState: "ready" as const,
    };
    const updatedState = {
      ...state,
      providers: [...state.providers, gx10Provider],
      runtimeNodes: [...state.runtimeNodes, gx10Node],
    };

    expect(selectableAgentChatModels(updatedState, "strategist.core")).toContain("gemma-4-26b-a4b-q4_k_m.gguf");

    const resolved = resolveStrategistChatRoute(updatedState, "gemma-4-26b-a4b-q4_k_m.gguf");

    expect(resolved.provider?.id).toBe("provider-asus-gx10-test");
    expect(resolved.runtimeNode?.id).toBe("node-provider-asus-gx10-test");
    expect(resolved.model).toBe("gemma-4-26b-a4b-q4_k_m.gguf");
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
    const base = buildDefaultState([]);
    const state = {
      ...base,
      providers: base.providers.map((p) =>
        p.providerType !== "local" ? { ...p, credentialStatus: "configured" as const } : p,
      ),
    };
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
    const base = buildDefaultState([]);
    const state = {
      ...base,
      providers: base.providers.map((p) =>
        p.providerType !== "local" ? { ...p, credentialStatus: "configured" as const } : p,
      ),
    };
    const resolved = resolveRoutineRoute(state);

    expect(resolved.provider?.id).toBe("shared-minimax");
    expect(resolved.runtimeNode?.id).toBe("node-minimax-cloud");
    expect(resolved.decision.executionAdapterId).toBe("cloud-minimax-compatible");
    expect(resolved.model).toBe("MiniMax-M2.7-highspeed");
  });
});
