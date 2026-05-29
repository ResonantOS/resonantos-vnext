import { staleBrowserJobEvidence } from "./browser-job-store.js";

export function sitePermissionDescription(mode) {
  if (mode === "blocked") return "Can see/do now: nothing on this site. Reading, clicking, typing, scrolling, wallet, login, payment, credential, and public-submit actions are blocked.";
  if (mode === "read-only") return "Can see/do now: page text, controls, fields, frames, and metadata. Cannot click, type, scroll, submit, use wallet, login, payment, or credentials.";
  if (mode === "trusted-for-safe-actions") return "Can see/do now: page context plus safe clicks, non-sensitive typing, scrolling, and search-like submits. Wallet, login, payment, credentials, personal autofill, and public-submit stay gated.";
  return "Can see/do now: page context. Augmentor asks before risky clicks, non-sensitive typing, scrolling, or submits, and blocks wallet, login, payment, credential, and personal autofill actions by default.";
}

export function controlRunProgress(run) {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const total = steps.length;
  const completed = steps.filter((step) => step.state === "completed").length;
  const terminal = steps.filter((step) => ["completed", "blocked", "failed", "cancelled"].includes(step.state)).length;
  const pending = steps.filter((step) => step.state === "pending").length;
  const blockedCount = steps.filter((step) => step.state === "blocked").length;
  const failed = steps.filter((step) => step.state === "failed").length;
  const active = steps.findIndex((step) => step.state === "active");
  const blocked = steps.findIndex((step) => ["blocked", "failed"].includes(step.state));
  const status = run?.status ?? "idle";
  const activeLabel = active >= 0 ? `step ${active + 1}/${total || 1}` : blocked >= 0 ? `blocked at ${blocked + 1}/${total || 1}` : `${completed}/${total || 0}`;
  const currentStep = active >= 0
    ? steps[active]
    : blocked >= 0
      ? steps[blocked]
      : steps.find((step) => step.state === "pending") ?? steps.at(-1) ?? null;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const phase = controlRunPhase({ status, currentStep });
  return {
    active,
    activeLabel,
    blocked,
    blockedCount,
    completed,
    currentStep,
    failed,
    label: `${status} · ${activeLabel}`,
    pending,
    percent,
    phase,
    terminal,
    total
  };
}

export function controlRunPhase({ status, currentStep } = {}) {
  if (status === "approval") return "approval";
  if (status === "cancelled") return "cancelled";
  if (["blocked", "failed", "denied"].includes(status)) return "blocked";
  if (status === "paused") return "waiting";
  if (status === "completed") return "completed";
  const type = currentStep?.type;
  if (["inspect", "read", "forms", "tabs"].includes(type)) return "reading";
  if (["open", "search", "switch_tab"].includes(type)) return "navigating";
  if (["click", "type", "scroll"].includes(type)) return "acting";
  if (type === "wait") return "waiting";
  if (status === "running") return "deciding";
  return "waiting";
}

export function controlRunPhaseLabel(phase = "waiting") {
  const labels = {
    acting: "Acting",
    approval: "Awaiting approval",
    blocked: "Blocked",
    cancelled: "Stopped",
    completed: "Completed",
    deciding: "Deciding",
    navigating: "Navigating",
    reading: "Reading page",
    waiting: "Waiting"
  };
  return labels[phase] ?? "Working";
}

export function controlRunProgressSummary(run) {
  const progress = controlRunProgress(run);
  return [
    controlRunPhaseLabel(progress.phase),
    `${progress.completed}/${progress.total || 0} complete`,
    progress.terminal !== progress.completed ? `${progress.terminal}/${progress.total || 0} resolved` : "",
    progress.pending ? `${progress.pending} queued` : "",
    progress.blockedCount ? `${progress.blockedCount} blocked` : "",
    progress.failed ? `${progress.failed} failed` : "",
    `${progress.percent}%`
  ].filter(Boolean).join(" · ");
}

export function controlActionStateLabel(state = "pending") {
  if (state === "active") return "working";
  if (state === "completed") return "done";
  if (state === "blocked") return "needs review";
  if (state === "failed") return "failed";
  if (state === "cancelled") return "stopped";
  if (state === "pending") return "queued";
  return String(state || "queued");
}

export function formatDurationMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} sec`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} sec`;
}

function latestAudit(audit, key) {
  const entries = audit?.[key] ?? [];
  return entries[0] ?? null;
}

function auditLabel(entry) {
  if (!entry) return "";
  const date = Number.isFinite(Number(entry.at)) ? new Date(Number(entry.at)).toLocaleString() : "unknown time";
  return `${entry.action} · ${date} · ${entry.source || "unknown"} · ${entry.reason || "no reason recorded"}`;
}

function preflightDecisionLabel(decision) {
  if (!decision) return "";
  const modeLabels = {
    "approved-once": "approved once",
    "trusted-safe-actions": "trusted safe actions",
    "skipped-by-consent": "used stored consent",
    resumed: "resumed previous job",
    "not-required": "not required"
  };
  return [
    `Preflight: ${modeLabels[decision.mode] ?? decision.mode}`,
    decision.taskClass,
    decision.siteKey,
    decision.reason
  ].filter(Boolean).join(" · ");
}

function jobNextHumanAction(job) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  const step = [...steps].reverse()
    .find((candidate) => candidate?.details?.nextHumanAction);
  return step?.details?.nextHumanAction ?? "";
}

function pageLockLabel(pageLock) {
  if (!pageLock) return "";
  return [
    `Target: ${pageLock.siteKey || "unknown-site"}`,
    pageLock.tabId !== null && pageLock.tabId !== undefined ? `tab ${pageLock.tabId}` : "",
    pageLock.reason || ""
  ].filter(Boolean).join(" · ");
}

export function controlRunSummary(run) {
  const progress = controlRunProgress(run);
  const terminal = ["completed", "blocked", "failed", "denied", "cancelled"].includes(run?.status);
  const nextHumanAction = (Array.isArray(run?.steps) ? run.steps : [])
    .find((step) => step?.details?.nextHumanAction)?.details?.nextHumanAction ?? "";
  if (!terminal && run?.status !== "approval") return null;
  if (run?.status === "completed") {
    return {
      state: "completed",
      title: "Task completed",
      body: `${progress.completed}/${progress.total || progress.completed} actions completed. Review the trace below or save the report to Living Archive intake.`
    };
  }
  if (run?.status === "approval") {
    return {
      state: "approval",
      title: "Human approval needed",
      body: "Augmentor stopped at a gated action. Review the page, then approve once, trust safe actions for this task class, deny, or delegate the issue."
    };
  }
  if (run?.status === "denied") {
    return {
      state: "blocked",
      title: "Action denied",
      body: "The task stayed stopped because the human denied the proposed browser action."
    };
  }
  return {
    state: "blocked",
    title: "Task stopped",
    body: [
      "Augmentor could not safely continue. The trace below shows the blocker and the recommended next human action.",
      nextHumanAction
    ].filter(Boolean).join(" ")
  };
}

function stepDetailRows(step) {
  const details = step?.details ?? {};
  return [
    ["Timing", formatDurationMs(step?.timing?.durationMs)],
    ["Observation", details.observation?.title || details.observation?.url || ""],
    ["Decision", details.decision || ""],
    ["Action", details.action || ""],
    ["Result", details.result || step?.note || ""],
    ["Safety", details.safetyClass || ""],
    ["Confidence", details.confidence || ""],
    ["Uncertainty", details.uncertainty || ""],
    ["Next human action", details.nextHumanAction || ""]
  ].filter(([, value]) => Boolean(value));
}

export function createMonitorRenderers({
  activeTab,
  approvalBoundaryForStep,
  controlStepLabel,
  elements,
  getBrowserJobs,
  getActiveBrowserJobId = () => null,
  getBrowserJobSchedulerState = () => null,
  getContextDockExpanded,
  getCurrentControlRun,
  getJobMonitorCollapsed,
  getPendingApproval,
  getSitePermissionAudit = async () => ({}),
  getSitePermissions = async () => ({}),
  getTaskConsentAudit = async () => ({}),
  getTaskConsents,
  isReadableBrowserTab,
  onContinueBrowserJob,
  onActivateBrowserJob,
  onResetSitePermission,
  onSaveBrowserJobReport,
  onRevokeTaskConsent,
  permissionForUrl,
  siteKeyForUrl,
  updateContextDockVisibility
}) {
  const {
    approvalApproveButton,
    approvalCard,
    approvalReason,
    approvalTitle,
    approvalTrustSiteButton,
    controlArtifacts,
    controlCurrentAction,
    controlMonitor,
    controlSummaryCard,
    controlMonitorStatus,
    controlMonitorTitle,
    controlStopButton,
    controlStepList,
    jobList,
    jobMonitor,
    jobMonitorTitle,
    jobMonitorToggle,
    permissionManagerList,
    permissionManagerPanel,
    permissionManagerTitle,
    sitePermissionHost,
    sitePermissionMode,
    sitePermissionNote,
    sitePermissionPanel,
    taskConsentList,
    taskConsentPanel,
    taskConsentTitle
  } = elements;

  function renderControlMonitor() {
    const currentControlRun = getCurrentControlRun();
    const pendingApproval = getPendingApproval();
    if (!currentControlRun) {
      controlMonitor.hidden = true;
      approvalCard.hidden = true;
      if (controlSummaryCard) {
        controlSummaryCard.hidden = true;
        controlSummaryCard.replaceChildren();
      }
      updateContextDockVisibility();
      return;
    }
    controlMonitor.hidden = false;
    const progress = controlRunProgress(currentControlRun);
    controlMonitor.dataset.status = currentControlRun.status;
    controlMonitor.dataset.activeStep = progress.active >= 0 ? String(progress.active + 1) : "";
    controlMonitorTitle.textContent = currentControlRun.goal;
    controlMonitorStatus.textContent = progress.label;
    controlMonitorStatus.dataset.status = currentControlRun.status;
    controlStopButton.hidden = !["running", "approval", "paused"].includes(currentControlRun.status);
    if (controlSummaryCard) {
      const summary = controlRunSummary(currentControlRun);
      controlSummaryCard.hidden = !summary;
      controlSummaryCard.replaceChildren();
      if (summary) {
        controlSummaryCard.dataset.state = summary.state;
        const title = document.createElement("strong");
        title.textContent = summary.title;
        const body = document.createElement("p");
        body.textContent = summary.body;
        controlSummaryCard.append(title, body);
      }
    }
    controlCurrentAction.dataset.state = progress.currentStep?.state ?? currentControlRun.status;
    const actionKicker = controlCurrentAction.querySelector("small");
    const actionLabel = controlCurrentAction.querySelector("strong");
    if (actionKicker) {
      actionKicker.textContent = currentControlRun.status === "running"
        ? "Now"
        : currentControlRun.status === "approval"
          ? "Needs approval"
          : "State";
    }
    if (actionLabel) {
      actionLabel.textContent = progress.currentStep
        ? controlStepLabel(progress.currentStep)
        : currentControlRun.status === "running"
          ? "Observing the active page..."
          : currentControlRun.status;
    }
    const actionCopy = controlCurrentAction.querySelector("div");
    let targetMeta = controlCurrentAction.querySelector(".control-target-meta");
    if (!targetMeta && actionCopy) {
      targetMeta = document.createElement("small");
      targetMeta.className = "control-target-meta";
      actionCopy.append(targetMeta);
    }
    if (targetMeta) {
      const target = pageLockLabel(currentControlRun.pageLock);
      targetMeta.hidden = !target;
      targetMeta.textContent = target;
    }
    let phaseMeta = controlCurrentAction.querySelector(".control-phase-meta");
    if (!phaseMeta && actionCopy) {
      phaseMeta = document.createElement("small");
      phaseMeta.className = "control-phase-meta";
      actionCopy.append(phaseMeta);
    }
    if (phaseMeta) {
      phaseMeta.hidden = false;
      phaseMeta.textContent = controlRunProgressSummary(currentControlRun);
    }
    let progressTrack = controlCurrentAction.querySelector(".control-progress-track");
    if (!progressTrack && actionCopy) {
      progressTrack = document.createElement("span");
      progressTrack.className = "control-progress-track";
      progressTrack.append(document.createElement("i"));
      actionCopy.append(progressTrack);
    }
    if (progressTrack) {
      progressTrack.querySelector("i").style.width = `${progress.percent}%`;
      progressTrack.setAttribute("aria-label", `Agent Control progress ${progress.percent} percent`);
    }
    controlStepList.replaceChildren();
    currentControlRun.steps.forEach((step, index) => {
      const item = document.createElement("li");
      item.dataset.state = step.state ?? "pending";
      item.dataset.index = String(index + 1);
      const main = document.createElement("span");
      main.className = "control-step-main";
      main.textContent = controlStepLabel(step);
      item.append(main);
      if (step.note) {
        const note = document.createElement("small");
        note.className = "control-step-note";
        note.textContent = step.note;
        item.append(note);
      }
      const state = document.createElement("em");
      state.className = "control-step-state";
      state.textContent = controlActionStateLabel(step.state);
      item.append(state);
      const rows = stepDetailRows(step);
      if (rows.length) {
        const detail = document.createElement("details");
        detail.className = "control-step-detail";
        const summary = document.createElement("summary");
        summary.textContent = "Details";
        detail.append(summary);
        rows.forEach(([label, value]) => {
          const row = document.createElement("p");
          const key = document.createElement("span");
          key.textContent = label;
          const text = document.createElement("b");
          text.textContent = value;
          row.append(key, text);
          detail.append(row);
        });
        item.append(detail);
      }
      controlStepList.append(item);
    });
    if (currentControlRun.artifacts?.length) {
      controlArtifacts.hidden = false;
      controlArtifacts.replaceChildren();
      const label = document.createElement("strong");
      label.textContent = "Artifacts";
      controlArtifacts.append(label);
      currentControlRun.artifacts.forEach((artifact) => {
        controlArtifacts.append(document.createElement("br"));
        const line = document.createElement("span");
        line.textContent = `${artifact.type}: ${artifact.path}`;
        controlArtifacts.append(line);
      });
    } else {
      controlArtifacts.hidden = true;
      controlArtifacts.replaceChildren();
    }
    if (pendingApproval) {
      approvalCard.hidden = false;
      const boundary = approvalBoundaryForStep(pendingApproval.step, pendingApproval.reason);
      approvalTitle.textContent = `Approval required: ${controlStepLabel(pendingApproval.step)}`;
      approvalReason.textContent = [
        pendingApproval.reason,
        boundary === "hard"
          ? "Hard boundary: wallet, payment, login, credential, signing, or irreversible value actions cannot be trusted by site."
          : boundary === "public-submit"
            ? "Public-submit boundary: use approve once only when you have reviewed the page state."
            : "Safe-action boundary: you may approve once or trust this task class for this site."
      ].filter(Boolean).join("\n");
      approvalApproveButton.disabled = boundary === "hard";
      approvalTrustSiteButton.disabled = boundary !== "safe";
      approvalTrustSiteButton.title = boundary === "safe"
        ? "Trust safe non-sensitive actions for this task class on this site."
        : "Task trust never bypasses wallet, payment, login, credential, or public-submit boundaries.";
    } else {
      approvalCard.hidden = true;
      approvalApproveButton.disabled = false;
      approvalTrustSiteButton.disabled = false;
    }
    updateContextDockVisibility();
  }

  async function renderSitePermissionPanel(tab = null) {
    const current = tab ?? await activeTab();
    if (!getContextDockExpanded() || !isReadableBrowserTab(current)) {
      sitePermissionPanel.hidden = true;
      updateContextDockVisibility();
      return;
    }
    const mode = await permissionForUrl(current.url);
    sitePermissionPanel.hidden = false;
    sitePermissionHost.textContent = siteKeyForUrl(current.url);
    sitePermissionMode.value = mode;
    sitePermissionNote.textContent = sitePermissionDescription(mode);
    updateContextDockVisibility();
  }

  async function renderTaskConsentPanel(tab = null) {
    const current = tab ?? await activeTab();
    if (!getContextDockExpanded() || !isReadableBrowserTab(current)) {
      taskConsentPanel.hidden = true;
      updateContextDockVisibility();
      return;
    }
    const siteKey = siteKeyForUrl(current.url);
    const consents = Object.values(await getTaskConsents())
      .filter((consent) => consent.siteKey === siteKey)
      .sort((a, b) => b.grantedAt - a.grantedAt)
      .slice(0, 8);
    taskConsentPanel.hidden = consents.length === 0;
    taskConsentList.replaceChildren();
    if (!consents.length) {
      updateContextDockVisibility();
      return;
    }
    taskConsentTitle.textContent = `${consents.length} trusted task ${consents.length === 1 ? "class" : "classes"} for ${siteKey}`;
    consents.forEach((consent) => {
      const item = document.createElement("li");
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = consent.taskClass;
      const meta = document.createElement("small");
      meta.textContent = [
        `${consent.mode} · expires ${new Date(consent.expiresAt).toLocaleDateString()}`,
        consent.reason ? `${consent.source || "human"} · ${consent.reason}` : ""
      ].filter(Boolean).join(" · ");
      details.append(title, meta);
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.textContent = "Revoke";
      revoke.title = `Revoke ${consent.taskClass} consent for ${siteKey}`;
      revoke.addEventListener("click", () => onRevokeTaskConsent?.(consent));
      item.append(details, revoke);
      taskConsentList.append(item);
    });
    updateContextDockVisibility();
  }

  async function renderPermissionManager() {
    if (!permissionManagerPanel || !permissionManagerList || !permissionManagerTitle) return;
    if (!getContextDockExpanded()) {
      permissionManagerPanel.hidden = true;
      updateContextDockVisibility();
      return;
    }
    const [sitePermissions, taskConsents, siteAudit, taskAudit] = await Promise.all([
      getSitePermissions().catch(() => ({})),
      getTaskConsents().catch(() => ({})),
      getSitePermissionAudit().catch(() => ({})),
      getTaskConsentAudit().catch(() => ({}))
    ]);
    const permissionEntries = Object.entries(sitePermissions)
      .filter(([siteKey, mode]) => siteKey && mode && mode !== "ask-before-action")
      .sort(([a], [b]) => a.localeCompare(b));
    const consentEntries = Object.values(taskConsents)
      .filter((consent) => consent.siteKey && consent.taskClass)
      .sort((a, b) => `${a.siteKey}::${a.taskClass}`.localeCompare(`${b.siteKey}::${b.taskClass}`));
    permissionManagerPanel.hidden = permissionEntries.length === 0 && consentEntries.length === 0;
    permissionManagerList.replaceChildren();
    if (permissionManagerPanel.hidden) {
      updateContextDockVisibility();
      return;
    }
    permissionManagerTitle.textContent = `${permissionEntries.length + consentEntries.length} stored browser ${permissionEntries.length + consentEntries.length === 1 ? "grant" : "grants"}`;
    permissionEntries.forEach(([siteKey, mode]) => {
      const item = document.createElement("li");
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = siteKey;
      const meta = document.createElement("small");
      meta.textContent = [`site permission · ${mode}`, auditLabel(latestAudit(siteAudit, siteKey))].filter(Boolean).join(" · ");
      details.append(title, meta);
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Reset";
      reset.title = `Reset site permission for ${siteKey}`;
      reset.addEventListener("click", () => onResetSitePermission?.(siteKey));
      item.append(details, reset);
      permissionManagerList.append(item);
    });
    consentEntries.forEach((consent) => {
      const item = document.createElement("li");
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${consent.siteKey} · ${consent.taskClass}`;
      const meta = document.createElement("small");
      const auditKey = `${consent.siteKey}::${consent.taskClass}`;
      meta.textContent = [
        `task-class consent · ${consent.mode} · expires ${new Date(consent.expiresAt).toLocaleDateString()}`,
        auditLabel(latestAudit(taskAudit, auditKey) ?? { action: "set", at: consent.grantedAt, source: consent.source, reason: consent.reason })
      ].filter(Boolean).join(" · ");
      details.append(title, meta);
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.textContent = "Revoke";
      revoke.title = `Revoke ${consent.taskClass} consent for ${consent.siteKey}`;
      revoke.addEventListener("click", () => onRevokeTaskConsent?.(consent));
      item.append(details, revoke);
      permissionManagerList.append(item);
    });
    updateContextDockVisibility();
  }

  function renderJobMonitor() {
    const browserJobs = getBrowserJobs();
    const activeJobId = getActiveBrowserJobId();
    const jobMonitorCollapsed = getJobMonitorCollapsed();
    jobMonitor.hidden = !getContextDockExpanded() || browserJobs.length === 0;
    if (jobMonitor.hidden) {
      updateContextDockVisibility();
      return;
    }
    const activeCount = browserJobs.filter((job) => ["queued", "running", "paused", "approval"].includes(job.status)).length;
    const focusedJob = activeJobId ? browserJobs.find((job) => job.id === activeJobId) : null;
    const scheduler = getBrowserJobSchedulerState?.() ?? null;
    const schedulerText = scheduler
      ? ` · ${scheduler.runnableQueued.length} runnable · ${scheduler.lockBlockedQueued.length} locked`
      : "";
    jobMonitorTitle.textContent = `${activeCount} active · ${browserJobs.length} total${schedulerText}${focusedJob ? ` · focused ${focusedJob.id}` : ""}`;
    jobMonitorToggle.textContent = jobMonitorCollapsed ? "Show" : "Hide";
    jobList.hidden = jobMonitorCollapsed;
    jobList.replaceChildren();
    if (jobMonitorCollapsed) {
      updateContextDockVisibility();
      return;
    }
    browserJobs.slice(0, 8).forEach((job) => {
      const item = document.createElement("li");
      item.dataset.status = job.status;
      item.dataset.active = job.id === activeJobId ? "true" : "false";
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = job.goal;
      const meta = document.createElement("small");
      meta.textContent = `${job.updatedAt.replace("T", " ").slice(0, 16)} · ${job.planner}`;
      const id = document.createElement("code");
      id.textContent = job.id;
      details.append(title, meta);
      if (job.id === activeJobId) {
        const focused = document.createElement("small");
        focused.className = "job-focused";
        focused.textContent = "Focused browser job";
        details.append(focused);
      }
      if (job.preflightDecision) {
        const preflight = document.createElement("small");
        preflight.className = "job-preflight";
        preflight.textContent = preflightDecisionLabel(job.preflightDecision);
        details.append(preflight);
      }
      if (job.pageLock) {
        const lock = document.createElement("small");
        lock.className = "job-page-lock";
        lock.textContent = `Lock: ${job.pageLock.siteKey}${job.pageLock.tabId !== null ? ` · tab ${job.pageLock.tabId}` : ""}`;
        details.append(lock);
      }
      if (job.steps?.length) {
        const progress = document.createElement("small");
        progress.className = "job-progress";
        progress.textContent = `Progress: ${controlRunProgressSummary(job)}`;
        details.append(progress);
      }
      const staleEvidence = staleBrowserJobEvidence(job);
      if (staleEvidence) {
        item.dataset.attention = "stale";
        const stale = document.createElement("small");
        stale.className = "job-stale-guidance";
        stale.textContent = `Attention: ${staleEvidence.reason} Last activity ${formatDurationMs(staleEvidence.ageMs)} ago. ${staleEvidence.nextHumanAction}`;
        details.append(stale);
      }
      if (scheduler?.runnableQueued?.some((candidate) => candidate.id === job.id)) {
        const runnable = document.createElement("small");
        runnable.className = "job-scheduler-state";
        runnable.textContent = `Scheduler: runnable when the runner is available (${scheduler.activeSlots}/${scheduler.maxConcurrent} active).`;
        details.append(runnable);
      }
      const locked = scheduler?.lockBlockedQueued?.find((candidate) => candidate.id === job.id);
      if (locked) {
        const blocked = document.createElement("small");
        blocked.className = "job-scheduler-state";
        blocked.textContent = `Scheduler: locked by ${locked.blockerId}${locked.blockerGoal ? ` · ${locked.blockerGoal}` : ""}.`;
        details.append(blocked);
      }
      if (scheduler?.capacityBlockedQueued?.some((candidate) => candidate.id === job.id)) {
        const waiting = document.createElement("small");
        waiting.className = "job-scheduler-state";
        waiting.textContent = `Scheduler: waiting for capacity (${scheduler.activeSlots}/${scheduler.maxConcurrent} active).`;
        details.append(waiting);
      }
      const nextHumanAction = jobNextHumanAction(job);
      if (nextHumanAction) {
        const blocker = document.createElement("small");
        blocker.className = "job-blocker-guidance";
        blocker.textContent = `Next human action: ${nextHumanAction}`;
        details.append(blocker);
      }
      details.append(id);
      const state = document.createElement("span");
      state.className = "job-state";
      state.textContent = job.status;
      const actions = document.createElement("div");
      actions.className = "job-actions";
      if (job.id !== activeJobId && typeof onActivateBrowserJob === "function") {
        const focusButton = document.createElement("button");
        focusButton.type = "button";
        focusButton.textContent = "Focus";
        focusButton.title = `Focus ${job.goal}`;
        focusButton.addEventListener("click", () => onActivateBrowserJob(job));
        actions.append(focusButton);
      }
      const canContinue = ["queued", "paused", "completed", "blocked", "failed", "cancelled", "denied"].includes(job.status);
      if (canContinue && typeof onContinueBrowserJob === "function") {
        const continueButton = document.createElement("button");
        continueButton.type = "button";
        continueButton.textContent = "Continue";
        continueButton.title = `Continue ${job.goal}`;
        continueButton.addEventListener("click", () => onContinueBrowserJob(job));
        actions.append(continueButton);
      }
      if (typeof onSaveBrowserJobReport === "function") {
        const reportButton = document.createElement("button");
        reportButton.type = "button";
        reportButton.textContent = "Report";
        reportButton.title = `Save report for ${job.goal}`;
        reportButton.addEventListener("click", () => onSaveBrowserJobReport(job));
        actions.append(reportButton);
      }
      actions.append(state);
      item.append(details, actions);
      if (job.steps?.length) {
        const steps = document.createElement("ol");
        steps.className = "job-step-replay";
        job.steps.slice(0, 5).forEach((step) => {
          const stepItem = document.createElement("li");
          stepItem.dataset.state = step.state;
          stepItem.textContent = `${controlActionStateLabel(step.state)} · ${step.label}`;
          steps.append(stepItem);
        });
        item.append(steps);
      }
      jobList.append(item);
    });
    updateContextDockVisibility();
  }

  return {
    renderControlMonitor,
    renderJobMonitor,
    renderPermissionManager,
    renderSitePermissionPanel,
    renderTaskConsentPanel
  };
}
