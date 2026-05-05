import { describe, expect, it } from "vitest";
import { buildDefaultState } from "./defaults";
import {
  buildStrategyRouteOptions,
  costPostureLabel,
  routeFromOptionKey,
  routeOptionKey,
  updateWorkloadStrategy,
} from "./model-strategy";
import { resolveRoutineRoute } from "./provider-service";

describe("model strategy planner", () => {
  it("builds editable route options with cost posture metadata", () => {
    const state = buildDefaultState([]);
    const options = buildStrategyRouteOptions(state);

    expect(options.some((option) => option.key === "shared-minimax::node-minimax-cloud::MiniMax-M2.7")).toBe(true);
    expect(options.find((option) => option.runtimeNodeId === "node-local-resurrect")?.costPosture).toBe("emergency-only");
    expect(options.find((option) => option.runtimeNodeId === "node-gx10-qwen")?.costPosture).toBe("free-local");
    expect(costPostureLabel("subscription")).toBe("Subscription");
  });

  it("updates a workload primary route and changes routing deterministically", () => {
    const state = {
      ...buildDefaultState([]),
      runtimeNodes: buildDefaultState([]).runtimeNodes.map((node) =>
        node.id === "node-gx10-qwen" ? { ...node, healthState: "ready" as const } : node,
      ),
    };
    const route = routeFromOptionKey(state, "shared-local::node-gx10-qwen::qwen-3.5");

    expect(route).toBeDefined();
    const updated = updateWorkloadStrategy(state, "strategy-routine-background", {
      primaryRoute: route,
      fallbackChainId: "chain-routine-economical",
    });

    const resolved = resolveRoutineRoute(updated);

    expect(routeOptionKey(updated.modelStrategy.workloadStrategies.find((strategy) => strategy.id === "strategy-routine-background")!.primaryRoute)).toBe(
      "shared-local::node-gx10-qwen::qwen-3.5",
    );
    expect(resolved.provider?.id).toBe("shared-local");
    expect(resolved.runtimeNode?.id).toBe("node-gx10-qwen");
    expect(resolved.model).toBe("qwen-3.5");
  });

  it("ignores unknown route option keys rather than corrupting a strategy", () => {
    const state = buildDefaultState([]);
    expect(routeFromOptionKey(state, "missing")).toBeUndefined();
  });
});
