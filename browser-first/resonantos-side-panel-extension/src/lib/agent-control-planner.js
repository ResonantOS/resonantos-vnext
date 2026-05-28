import {
  parseAmazonShoppingTask,
  parseClickIntent,
  parseFormsIntent,
  parseNaturalBrowserIntent,
  parseNaturalSearchIntent,
  parseReadPageIntent,
  parseScrollIntent,
  parseTypeIntent
} from "./browser-command-parser.js";

export function controlStepLabel(step) {
  if (step.type === "inspect") return "Inspect active page";
  if (step.type === "open") return `Open ${step.target}`;
  if (step.type === "search") return `${step.action === "news" ? "Search news" : "Search web"}: ${step.query}`;
  if (step.type === "read") return "Read active page";
  if (step.type === "forms") return "Inspect page forms";
  if (step.type === "tabs") return "List open tabs";
  if (step.type === "switch_tab") return `Switch to tab ${step.tabId}`;
  if (step.type === "click") return `Click ${step.ref ? `#${step.ref}` : `"${step.text}"`}`;
  if (step.type === "type") return `Type "${step.text}"${step.ref ? ` into #${step.ref}` : step.field ? ` into ${step.field}` : ""}`;
  if (step.type === "scroll") return `Scroll ${step.direction}`;
  if (step.type === "wait") return `Wait ${step.ms ?? 1000}ms`;
  return step.type;
}

export function dedupeControlSteps(steps) {
  const seen = new Set();
  return steps.filter((step) => {
    const key = JSON.stringify(step);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function planControlSteps(goal) {
  const normalized = String(goal ?? "").trim();
  const steps = [{ type: "inspect" }];
  const amazonTask = parseAmazonShoppingTask(normalized);
  const browserIntent = parseNaturalBrowserIntent(normalized);
  const searchIntent = parseNaturalSearchIntent(normalized);
  const typeIntent = parseTypeIntent(normalized);
  const clickIntent = parseClickIntent(normalized);
  const scrollIntent = parseScrollIntent(normalized);
  const formsIntent = parseFormsIntent(normalized);
  const readIntent = parseReadPageIntent(normalized);
  const hasDirectPageActions = Boolean(typeIntent || clickIntent || scrollIntent || formsIntent || readIntent);

  if (amazonTask) {
    steps.push({ type: "open", target: amazonTask.url }, { type: "read" });
  } else if (browserIntent) {
    steps.push({ type: "open", target: browserIntent.target }, { type: "read" });
  }
  if (searchIntent && !hasDirectPageActions) {
    steps.push({ type: "search", action: searchIntent.action, query: searchIntent.query }, { type: "read" });
  }
  if (formsIntent || /\b(form|field|input)\b/i.test(normalized)) {
    steps.push({ type: "forms" });
  }
  if (clickIntent) {
    steps.push({ type: "click", text: clickIntent.text });
  }
  if (typeIntent) {
    steps.push({ type: "type", text: typeIntent.text, submit: typeIntent.submit });
  }
  if (scrollIntent) {
    steps.push({ type: "scroll", direction: scrollIntent.direction });
  }
  if (readIntent || steps.length === 1) {
    steps.push({ type: "read" });
  }

  return dedupeControlSteps(steps).slice(0, 8);
}

export function deterministicNextAction(goal, snapshot, history) {
  const planned = planControlSteps(goal).filter((step) => step.type !== "inspect");
  const executedCount = history.filter((item) => item.action?.type !== "read" || planned.some((step) => step.type === "read")).length;
  const next = planned[executedCount] ?? null;
  if (!next) {
    return {
      source: "deterministic-fallback",
      status: history.length ? "done" : "blocked",
      thought: history.length ? "The deterministic browser parser has no further safe steps." : "No safe deterministic browser action matched this request.",
      action: null,
      approvalReason: history.length ? null : "Try phrasing this as a visible page action or use /control with a concrete goal.",
      doneSummary: history.length ? "Completed the safe deterministic browser steps available for this goal." : null
    };
  }
  return {
    source: "deterministic-fallback",
    status: "continue",
    thought: `Next safe fallback action: ${controlStepLabel(next)}.`,
    action: next,
    approvalReason: null,
    doneSummary: null,
    snapshotTitle: snapshot?.title ?? null
  };
}
