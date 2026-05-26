export function sitePermissionDescription(mode) {
  if (mode === "blocked") return "Augmentor cannot read or operate this site.";
  if (mode === "read-only") return "Augmentor can read context but cannot click, type, or scroll.";
  if (mode === "trusted-for-safe-actions") return "Safe actions can run; wallet, login, payment, and public submit still require approval.";
  return "Augmentor asks before risky actions and blocks sensitive actions by default.";
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
  isReadableBrowserTab,
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
    controlMonitor,
    controlMonitorStatus,
    controlMonitorTitle,
    controlStepList,
    jobList,
    jobMonitor,
    jobMonitorTitle,
    jobMonitorToggle,
    sitePermissionHost,
    sitePermissionMode,
    sitePermissionNote,
    sitePermissionPanel
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
    controlMonitorTitle.textContent = currentControlRun.goal;
    controlMonitorStatus.textContent = currentControlRun.status;
    controlMonitorStatus.dataset.status = currentControlRun.status;
    controlStepList.replaceChildren();
    currentControlRun.steps.forEach((step, index) => {
      const item = document.createElement("li");
      item.dataset.state = step.state ?? "pending";
      item.textContent = `${index + 1}. ${controlStepLabel(step)}${step.note ? ` - ${step.note}` : ""}`;
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
            : "Safe-action boundary: you may approve once or trust safe actions for this site."
      ].filter(Boolean).join("\n");
      approvalApproveButton.disabled = boundary === "hard";
      approvalTrustSiteButton.disabled = boundary !== "safe";
      approvalTrustSiteButton.title = boundary === "safe"
        ? "Trust safe non-sensitive actions on this site."
        : "Site trust never bypasses wallet, payment, login, credential, or public-submit boundaries.";
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
      item.append(details, state);
      jobList.append(item);
    });
    updateContextDockVisibility();
  }

  return {
    renderControlMonitor,
    renderJobMonitor,
    renderSitePermissionPanel
  };
}
