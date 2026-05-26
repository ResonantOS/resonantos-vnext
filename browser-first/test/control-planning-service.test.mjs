import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlanningService } from "../resonantos-side-panel-extension/src/lib/control-planning-service.js";

function createHarness(overrides = {}) {
  const calls = [];
  const bridgeRequest = async (path, request) => {
    calls.push(["bridge", path, request.body]);
    if (overrides.bridgeError) throw new Error(overrides.bridgeError);
    if (path === "/augmentor/control-plan") {
      return overrides.planResponse ?? {
        plan: {
          summary: "Open and read",
          steps: [{ type: "open", target: "https://example.com/" }, { type: "read" }]
        }
      };
    }
    if (path === "/augmentor/next-action") {
      return overrides.decisionResponse ?? {
        decision: {
          status: "continue",
          thought: "Open the requested site",
          action: { type: "open", target: "https://example.com/" }
        }
      };
    }
    throw new Error(`Unexpected path ${path}`);
  };
  const service = createControlPlanningService({
    bridgeRequest,
    getLastSnapshot: () => overrides.lastSnapshot ?? { title: "Last", url: "https://last.example/" },
    getModel: () => "MiniMax-M2.7",
    getThinkingDepth: () => "high",
    globalScope: overrides.globalScope ?? {},
    readActivePage: async () => {
      calls.push(["read"]);
      if (overrides.readError) throw new Error(overrides.readError);
      return overrides.snapshotResponse ?? { snapshot: { title: "Active", url: "https://active.example/" } };
    }
  });
  return { calls, service };
}

test("control planning service requests and sanitizes full plans through the bridge", async () => {
  const harness = createHarness({
    planResponse: {
      plan: {
        source: "remote",
        summary: "duplicated plan",
        steps: [
          { type: "open", target: "https://example.com/" },
          { type: "open", target: "https://example.com/" }
        ]
      }
    }
  });

  const plan = await harness.service.requestControlPlan("open example", { title: "Page" });

  assert.equal(plan.source, "remote");
  assert.equal(plan.steps.length, 1);
  assert.deepEqual(harness.calls[0], [
    "bridge",
    "/augmentor/control-plan",
    {
      goal: "open example",
      model: "MiniMax-M2.7",
      thinkingDepth: "high",
      pageSnapshot: { title: "Page" }
    }
  ]);
});

test("control planning service supports test planner overrides behind sanitizer", async () => {
  const harness = createHarness({
    globalScope: {
      __resonantosControlPlannerOverride: async () => ({
        summary: "override",
        steps: [{ type: "open", target: "https://override.example/" }]
      })
    }
  });

  const plan = await harness.service.requestControlPlan("use override", null);

  assert.equal(plan.summary, "override");
  assert.equal(plan.steps[0].target, "https://override.example/");
  assert.equal(harness.calls.length, 0);
});

test("control planning service requests next actions and falls back deterministically on provider failure", async () => {
  const planned = createHarness();
  const decision = await planned.service.requestNextControlAction({
    goal: "open example.com",
    snapshot: { title: "Start" },
    history: []
  });
  assert.equal(decision.status, "continue");
  assert.equal(decision.action.type, "open");
  assert.equal(planned.calls[0][1], "/augmentor/next-action");

  const fallback = createHarness({ bridgeError: "provider down" });
  const fallbackDecision = await fallback.service.requestNextControlAction({
    goal: "open example.com",
    snapshot: { title: "Start" },
    history: []
  });
  assert.equal(fallbackDecision.source, "deterministic-fallback");
  assert.equal(fallbackDecision.status, "continue");
  assert.equal(fallbackDecision.action.type, "open");
});

test("control planning service converts unsafe next-action override failures into blocked decisions", async () => {
  const harness = createHarness({
    globalScope: {
      __resonantosNextActionOverride: async () => {
        throw new Error("restricted action");
      }
    }
  });

  const decision = await harness.service.requestNextControlAction({
    goal: "sign wallet",
    snapshot: null,
    history: []
  });

  assert.equal(decision.status, "blocked");
  assert.match(decision.approvalReason, /restricted action/);
  assert.equal(harness.calls.length, 0);
});

test("control planning service creates deterministic plan fallback when planning fails", async () => {
  const harness = createHarness({ bridgeError: "planner offline", readError: "page unavailable" });

  const plan = await harness.service.planAgentControlSteps("search for AI news");

  assert.equal(plan.source, "deterministic-fallback");
  assert.match(plan.summary, /planner offline/);
  assert.ok(plan.steps.some((step) => step.type === "search"));
  assert.ok(harness.calls.some((call) => call[0] === "read"));
});
