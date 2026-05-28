const restrictedPlannerText = /\b(seed|private key|password|passphrase|wallet|phantom|sign|signature|approve|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|delete|remove|destroy|credential|2fa|otp|transfer)\b/i;
const hardApprovalBoundaryText = /\b(seed|private key|password|passphrase|wallet|phantom|sign|signature|approve|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|delete|remove|destroy|credential|2fa|otp|transfer)\b/i;
const publicSubmitBoundaryText = /\b(submit|publish|post|share|send|save|confirm)\b/i;

export function approvalBoundaryForStep(step, reason = "") {
  const stepHaystack = [
    step?.type,
    step?.text,
    step?.field,
    step?.target,
    step?.query
  ].filter(Boolean).join(" ").toLowerCase();
  const reasonHaystack = String(reason ?? "").toLowerCase();
  if (hardApprovalBoundaryText.test(stepHaystack) || /\b(seed|private key|password|passphrase|wallet|phantom|sign|signature|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|delete|remove|destroy|credential|2fa|otp|transfer)\b/i.test(reasonHaystack)) {
    return "hard";
  }
  const haystack = [stepHaystack, reasonHaystack].filter(Boolean).join(" ");
  if (publicSubmitBoundaryText.test(haystack)) return "public-submit";
  return "safe";
}

export function sanitizePlannerUrl(target) {
  const trimmed = String(target ?? "").trim().replace(/[.,;:!?]+$/, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("Planner can only open http and https pages.");
  }
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Planner can only open http and https pages.");
  }
  return url.toString();
}

export function sanitizedPlannerText(value, label, max = 280) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Planner step is missing ${label}.`);
  return text.slice(0, max);
}

export function sanitizePlannerStep(step) {
  const type = String(step?.type ?? "").trim().toLowerCase();
  if (type === "inspect" || type === "read") return { type: "read" };
  if (type === "forms") return { type: "forms" };
  if (type === "tabs") return { type: "tabs" };
  if (type === "switch_tab") {
    const tabId = Number(step.tabId ?? step.id);
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Switch-tab step requires a numeric tabId.");
    return { type: "switch_tab", tabId };
  }
  if (type === "open") {
    const sanitized = { type: "open", target: sanitizePlannerUrl(step.target ?? step.url) };
    if (restrictedPlannerText.test(sanitized.target)) throw new Error("Planner requested a restricted target.");
    return sanitized;
  }
  if (type === "search") {
    return {
      type: "search",
      action: step.action === "news" ? "news" : "search",
      query: sanitizedPlannerText(step.query, "query", 220)
    };
  }
  if (type === "click") {
    const sanitized = {
      type: "click",
      text: step.text ? sanitizedPlannerText(step.text, "text") : "",
      ref: step.ref ? sanitizedPlannerText(step.ref, "ref", 80) : ""
    };
    if (!sanitized.text && !sanitized.ref) throw new Error("Planner click step requires text or ref.");
    if (restrictedPlannerText.test(sanitized.text)) throw new Error("Planner requested a restricted click.");
    return sanitized;
  }
  if (type === "type") {
    const sanitized = {
      type: "type",
      text: sanitizedPlannerText(step.text, "text", 600),
      field: step.field ? sanitizedPlannerText(step.field, "field", 160) : "",
      ref: step.ref ? sanitizedPlannerText(step.ref, "ref", 80) : "",
      submit: Boolean(step.submit)
    };
    if (restrictedPlannerText.test(sanitized.text)) {
      throw new Error("Planner requested restricted typing.");
    }
    return sanitized;
  }
  if (type === "scroll") {
    return { type: "scroll", direction: ["up", "down", "top", "bottom"].includes(step.direction) ? step.direction : "down" };
  }
  if (type === "wait") {
    return { type: "wait", ms: Math.min(5000, Math.max(250, Number(step.ms ?? 1000) || 1000)) };
  }
  throw new Error(`Unsupported planner step type: ${type || "missing"}.`);
}

export function sanitizePlannerPlan(plan, { dedupeControlSteps = (steps) => steps } = {}) {
  if (!plan || typeof plan !== "object") {
    throw new Error("Planner response must be an object.");
  }
  const needsApproval = Boolean(plan.needsApproval);
  const approvalReason = plan.approvalReason ? String(plan.approvalReason).slice(0, 500) : null;
  if (needsApproval) {
    return {
      source: plan.source ?? "llm",
      summary: String(plan.summary ?? "Planner stopped before a restricted action.").slice(0, 500),
      steps: [],
      needsApproval,
      approvalReason: approvalReason ?? "Planner requested human approval."
    };
  }
  const steps = (Array.isArray(plan.steps) ? plan.steps : [])
    .slice(0, 8)
    .map(sanitizePlannerStep);
  if (!steps.length) {
    throw new Error("Planner returned no executable steps.");
  }
  return {
    source: plan.source ?? "llm",
    summary: String(plan.summary ?? "Browser control plan").slice(0, 500),
    steps: dedupeControlSteps(steps),
    needsApproval: false,
    approvalReason: null
  };
}

export function sanitizeNextActionDecision(decision) {
  if (!decision || typeof decision !== "object") {
    throw new Error("Next-action response must be an object.");
  }
  const status = String(decision.status ?? "continue").trim().toLowerCase();
  if (!["continue", "done", "needs_approval", "blocked"].includes(status)) {
    throw new Error(`Unsupported next-action status: ${status || "missing"}.`);
  }
  const base = {
    source: String(decision.source ?? "llm").slice(0, 80),
    thought: String(decision.thought ?? "").trim().slice(0, 500),
    status,
    action: null,
    approvalReason: decision.approvalReason ? String(decision.approvalReason).trim().slice(0, 700) : null,
    doneSummary: decision.doneSummary ? String(decision.doneSummary).trim().slice(0, 700) : null
  };
  if (status === "done") {
    return { ...base, doneSummary: base.doneSummary || base.thought || "The browser task is complete." };
  }
  if (status === "needs_approval" || status === "blocked") {
    return { ...base, approvalReason: base.approvalReason || base.thought || "The browser task cannot continue safely." };
  }
  return {
    ...base,
    action: sanitizePlannerStep(decision.action)
  };
}
