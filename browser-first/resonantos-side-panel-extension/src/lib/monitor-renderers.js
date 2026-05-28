export function sitePermissionDescription(mode) {
  if (mode === "blocked") return "Augmentor cannot read or operate this site.";
  if (mode === "read-only") return "Augmentor can read context but cannot click, type, or scroll.";
  if (mode === "trusted-for-safe-actions") return "Safe actions can run; wallet, login, payment, and public submit still require approval.";
  return "Augmentor asks before risky actions and blocks sensitive actions by default.";
}

export function controlRunProgress(run) {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const total = steps.length;
  const completed = steps.filter((step) => step.state === "completed").length;
  const active = steps.findIndex((step) => step.state === "active");
  const blocked = steps.findIndex((step) => ["blocked", "failed"].includes(step.state));
  const status = run?.status ?? "idle";
  const activeLabel = active >= 0 ? `step ${active + 1}/${total || 1}` : blocked >= 0 ? `blocked at ${blocked + 1}/${total || 1}` : `${completed}/${total || 0}`;
  const currentStep = active >= 0
    ? steps[active]
    : blocked >= 0
      ? steps[blocked]
      : steps.find((step) => step.state === "pending") ?? steps.at(-1) ?? null;
  return {
    active,
    activeLabel,
    blocked,
    completed,
    currentStep,
    label: `${status} · ${activeLabel}`,
    total
  };
}

export function controlActionStateLabel(state = "pending") {
  if (state === "active") return "working";
  if (state === "completed") return "done";
  if (state === "blocked") return "needs review";
  if (state === "failed") return "failed";
  if (state === "pending") return "queued";
  return String(state || "queued");
}

export function createMonitorRenderers({
  activeTab,
  approvalBoundaryForStep,
  controlStepLabel,
  elements,
  getBrowserJobs,
  getContextDockExpanded,
  getCurrentControlRun,
  getJobMonitorCollapsed,
  getPendingApproval,
  getTaskConsents,
  isReadableBrowserTab,
  onContinueBrowserJob,
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
    controlMonitorStatus,
    controlMonitorTitle,
    controlStopButton,
    controlStepList,
    jobList,
    jobMonitor,
    jobMonitorTitle,
    jobMonitorToggle,
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
      meta.textContent = `${consent.mode} · expires ${new Date(consent.expiresAt).toLocaleDateString()}`;
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

  function renderJobMonitor() {
    const browserJobs = getBrowserJobs();
    const jobMonitorCollapsed = getJobMonitorCollapsed();
    jobMonitor.hidden = !getContextDockExpanded() || browserJobs.length === 0;
    if (jobMonitor.hidden) {
      updateContextDockVisibility();
      return;
    }
    const activeCount = browserJobs.filter((job) => ["queued", "running", "paused", "approval"].includes(job.status)).length;
    jobMonitorTitle.textContent = `${activeCount} active · ${browserJobs.length} total`;
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
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = job.goal;
      const meta = document.createElement("small");
      meta.textContent = `${job.updatedAt.replace("T", " ").slice(0, 16)} · ${job.planner}`;
      const id = document.createElement("code");
      id.textContent = job.id;
      details.append(title, meta, id);
      const state = document.createElement("span");
      state.className = "job-state";
      state.textContent = job.status;
      const actions = document.createElement("div");
      actions.className = "job-actions";
      const canContinue = ["queued", "paused", "completed", "blocked", "failed", "cancelled", "denied"].includes(job.status);
      if (canContinue && typeof onContinueBrowserJob === "function") {
        const continueButton = document.createElement("button");
        continueButton.type = "button";
        continueButton.textContent = "Continue";
        continueButton.title = `Continue ${job.goal}`;
        continueButton.addEventListener("click", () => onContinueBrowserJob(job));
        actions.append(continueButton);
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
    renderSitePermissionPanel,
    renderTaskConsentPanel
  };
}
