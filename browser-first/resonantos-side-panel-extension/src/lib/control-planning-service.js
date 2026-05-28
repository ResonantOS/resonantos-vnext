import {
  sanitizeNextActionDecision,
  sanitizePlannerPlan
} from "./approval-policy.js";
import {
  dedupeControlSteps,
  deterministicNextAction,
  planControlSteps
} from "./agent-control-planner.js";

export function createControlPlanningService({
  bridgeRequest,
  getLastSnapshot,
  getModel,
  getThinkingDepth,
  globalScope = globalThis,
  readActivePage
}) {
  const requestControlPlan = async (goal, snapshot) => {
    if (typeof globalScope.__resonantosControlPlannerOverride === "function") {
      return sanitizePlannerPlan(
        await globalScope.__resonantosControlPlannerOverride({ goal, snapshot }),
        { dedupeControlSteps }
      );
    }
    const result = await bridgeRequest("/augmentor/control-plan", {
      method: "POST",
      body: {
        goal,
        model: getModel(),
        thinkingDepth: getThinkingDepth(),
        pageSnapshot: snapshot ?? null
      }
    });
    return sanitizePlannerPlan({
      source: "llm",
      ...result.plan
    }, { dedupeControlSteps });
  };

  const requestNextControlAction = async ({ goal, snapshot, history }) => {
    if (typeof globalScope.__resonantosNextActionOverride === "function") {
      try {
        return sanitizeNextActionDecision(
          await globalScope.__resonantosNextActionOverride({ goal, snapshot, history })
        );
      } catch (error) {
        return {
          source: "test-override",
          status: "blocked",
          thought: "The proposed browser action crossed a safety boundary.",
          action: null,
          approvalReason: error instanceof Error ? error.message : String(error),
          doneSummary: null
        };
      }
    }
    try {
      const result = await bridgeRequest("/augmentor/next-action", {
        method: "POST",
        body: {
          goal,
          model: getModel(),
          thinkingDepth: getThinkingDepth(),
          pageSnapshot: snapshot ?? null,
          history
        }
      });
      return sanitizeNextActionDecision({
        source: "llm",
        ...result.decision
      });
    } catch (error) {
      const fallback = deterministicNextAction(goal, snapshot, history);
      return fallback.status === "blocked" && !history.length
        ? {
            ...fallback,
            approvalReason: `${fallback.approvalReason ?? "No safe fallback is available."} Planner error: ${error instanceof Error ? error.message : String(error)}`
          }
        : fallback;
    }
  };

  const planAgentControlSteps = async (goal) => {
    const snapshotResponse = await readActivePage({ announce: false }).catch(() => null);
    const snapshot = snapshotResponse?.snapshot ?? getLastSnapshot();
    try {
      return await requestControlPlan(goal, snapshot);
    } catch (error) {
      const fallbackSteps = planControlSteps(goal);
      return {
        source: "deterministic-fallback",
        summary: `Planner unavailable; using deterministic control parser. ${error instanceof Error ? error.message : String(error)}`,
        steps: fallbackSteps,
        needsApproval: false,
        approvalReason: null
      };
    }
  };

  return {
    planAgentControlSteps,
    requestControlPlan,
    requestNextControlAction
  };
}
