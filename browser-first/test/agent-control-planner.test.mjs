import assert from "node:assert/strict";
import test from "node:test";

import {
  controlStepLabel,
  dedupeControlSteps,
  deterministicNextAction,
  planControlSteps
} from "../resonantos-side-panel-extension/src/lib/agent-control-planner.js";

test("agent control planner builds deterministic browser plans from user goals", () => {
  assert.deepEqual(planControlSteps("go to resonantos.com"), [
    { type: "inspect" },
    { type: "open", target: "resonantos.com" },
    { type: "read" }
  ]);

  assert.deepEqual(planControlSteps("find latest AI news on the internet"), [
    { type: "inspect" },
    { type: "search", action: "news", query: "latest AI news" },
    { type: "read" }
  ]);

  assert.deepEqual(planControlSteps("click \"Pricing\" then type \"hello\""), [
    { type: "inspect" },
    { type: "click", text: "Pricing" },
    { type: "type", text: "hello", submit: false }
  ]);
});

test("agent control planner deduplicates repeated steps and labels actions", () => {
  assert.deepEqual(dedupeControlSteps([
    { type: "read" },
    { type: "read" },
    { type: "scroll", direction: "down" }
  ]), [
    { type: "read" },
    { type: "scroll", direction: "down" }
  ]);

  assert.equal(controlStepLabel({ type: "open", target: "https://example.com/" }), "Open https://example.com/");
  assert.equal(controlStepLabel({ type: "click", text: "Add to cart" }), 'Click "Add to cart"');
  assert.equal(controlStepLabel({ type: "type", text: "hello", field: "search" }), 'Type "hello" into search');
});

test("agent control planner provides safe next-action fallback decisions", () => {
  const first = deterministicNextAction("go to resonantos.com", { title: "Home" }, []);
  assert.equal(first.status, "continue");
  assert.deepEqual(first.action, { type: "open", target: "resonantos.com" });
  assert.equal(first.snapshotTitle, "Home");

  const second = deterministicNextAction("go to resonantos.com", { title: "Home" }, [{ action: first.action }]);
  assert.equal(second.status, "continue");
  assert.deepEqual(second.action, { type: "read" });

  const done = deterministicNextAction("go to resonantos.com", { title: "Home" }, [{ action: first.action }, { action: second.action }]);
  assert.equal(done.status, "done");
  assert.match(done.doneSummary, /Completed the safe deterministic browser steps/);

  const readFallback = deterministicNextAction("do something vague", null, []);
  assert.equal(readFallback.status, "continue");
  assert.deepEqual(readFallback.action, { type: "read" });
});
