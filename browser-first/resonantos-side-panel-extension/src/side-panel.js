import { approvalBoundaryForStep } from "./lib/approval-policy.js";
import { controlStepLabel } from "./lib/agent-control-planner.js";
import { createAgentControlRunner } from "./lib/agent-control-runner.js";
import { createAppCommandHandlers } from "./lib/app-command-handlers.js";
import { normalizeBrowserUrl, normalizeSearchQuery, parseQuotedText } from "./lib/browser-command-parser.js";
import { createBrowserJobStore } from "./lib/browser-job-store.js";
import { createBrowserPageActions } from "./lib/browser-page-actions.js";
import { createBridgeClient } from "./lib/bridge-client.js";
import { createChatSessionStore } from "./lib/chat-session-store.js";
import { createChatTurnController } from "./lib/chat-turn-controller.js";
import {
  contextUsageSnapshot,
  createDictationController,
  hydrateProviderModelOptions,
  modelLabel,
  supportsThinkingDepth,
  updateContextMeterElement
} from "./lib/composer-runtime.js";
import { createComposerController } from "./lib/composer-controller.js";
import {
  createControlPreflight,
  formatControlPreflightMessage,
  normalizeControlPreflight,
  shouldRequireControlPreflight
} from "./lib/control-preflight.js";
import { createControlPageObserver } from "./lib/control-page-observer.js";
import { createControlPlanningService } from "./lib/control-planning-service.js";
import { createControlReportingService } from "./lib/control-reporting-service.js";
import { createControlRunState } from "./lib/control-run-state.js";
import { createControlStepExecutor } from "./lib/control-step-executor.js";
import { createMessageActionController } from "./lib/message-action-controller.js";
import { createMonitorRenderers } from "./lib/monitor-renderers.js";
import { createSidePanelCommandRouter } from "./lib/side-panel-command-router.js";
import { createSidePanelRenderers } from "./lib/side-panel-renderers.js";
import { createSitePermissionStore } from "./lib/site-permission-store.js";
import { createTabContextController } from "./lib/tab-context-controller.js";
import { createTaskConsentStore } from "./lib/task-consent-store.js";

const readButton = document.querySelector("#read-page");
const attachFileButton = document.querySelector("#attach-file");
const fileInput = document.querySelector("#file-input");
const attachmentStrip = document.querySelector("#attachment-strip");
const saveIntakeButton = document.querySelector("#save-intake");
const saveSelectionButton = document.querySelector("#save-selection");
const contextToggleButton = document.querySelector("#context-toggle");
const transcript = document.querySelector("#transcript");
const contextDock = document.querySelector("#context-dock");
const activityPanel = document.querySelector("#activity-panel");
const activityLabel = document.querySelector("#activity-label");
const activityDetail = document.querySelector("#activity-detail");
const commandForm = document.querySelector("#command-form");
const commandInput = document.querySelector("#command-input");
const contextMeter = document.querySelector("#context-meter");
const modelSelect = document.querySelector("#model-select");
const thinkingDepthSelect = document.querySelector("#thinking-depth");
const dictateButton = document.querySelector("#dictate-button");
const connectionLine = document.querySelector("#connection-line");
const sitePermissionPanel = document.querySelector("#site-permission-panel");
const sitePermissionHost = document.querySelector("#site-permission-host");
const sitePermissionNote = document.querySelector("#site-permission-note");
const sitePermissionMode = document.querySelector("#site-permission-mode");
const taskConsentPanel = document.querySelector("#task-consent-panel");
const taskConsentTitle = document.querySelector("#task-consent-title");
const taskConsentList = document.querySelector("#task-consent-list");
const permissionManagerPanel = document.querySelector("#permission-manager-panel");
const permissionManagerTitle = document.querySelector("#permission-manager-title");
const permissionManagerList = document.querySelector("#permission-manager-list");
const controlPreflightCard = document.querySelector("#control-preflight-card");
const controlPreflightTitle = document.querySelector("#control-preflight-title");
const controlPreflightBody = document.querySelector("#control-preflight-body");
const controlPreflightApproveButton = document.querySelector("#control-preflight-approve");
const controlPreflightTrustButton = document.querySelector("#control-preflight-trust");
const controlPreflightDenyButton = document.querySelector("#control-preflight-deny");
const jobMonitor = document.querySelector("#job-monitor");
const jobMonitorTitle = document.querySelector("#job-monitor-title");
const jobMonitorToggle = document.querySelector("#job-monitor-toggle");
const jobList = document.querySelector("#job-list");
const controlMonitor = document.querySelector("#control-monitor");
const controlCurrentAction = document.querySelector("#control-current-action");
const controlSummaryCard = document.querySelector("#control-summary-card");
const controlMonitorTitle = document.querySelector("#control-monitor-title");
const controlMonitorStatus = document.querySelector("#control-monitor-status");
const controlStopButton = document.querySelector("#control-stop");
const controlStepList = document.querySelector("#control-step-list");
const controlArtifacts = document.querySelector("#control-artifacts");
const approvalCard = document.querySelector("#approval-card");
const approvalTitle = document.querySelector("#approval-title");
const approvalReason = document.querySelector("#approval-reason");
const approvalApproveButton = document.querySelector("#approval-approve");
const approvalTrustSiteButton = document.querySelector("#approval-trust-site");
const approvalDenyButton = document.querySelector("#approval-deny");
const approvalDelegateButton = document.querySelector("#approval-delegate");

const bridgeRequest = createBridgeClient();
const STORAGE_KEYS = {
  messages: "augmentorBrowserMessages",
  forks: "augmentorBrowserForks",
  sessions: "augmentorBrowserSessions",
  activeSessionId: "augmentorActiveBrowserSessionId",
  projects: "augmentorBrowserProjects",
  pendingSidebarPrompt: "augmentorPendingSidebarPrompt",
  model: "augmentorModel",
  thinkingDepth: "augmentorThinkingDepth",
  attachments: "augmentorBrowserAttachments",
  sitePermissions: "augmentorSitePermissions",
  sitePermissionAudit: "augmentorSitePermissionAudit",
  taskConsents: "augmentorTaskConsents",
  taskConsentAudit: "augmentorTaskConsentAudit",
  browserJobs: "augmentorBrowserJobs",
  activeBrowserJob: "augmentorActiveBrowserJob",
  controlPreflight: "augmentorControlPreflight",
  jobMonitorCollapsed: "augmentorJobMonitorCollapsed",
  contextDockExpanded: "augmentorContextDockExpanded"
};
let lastSnapshot = null;
let statusLabel = "Ready";
let turnBusy = false;
let activityTimer = null;
let currentControlRun = null;
let pendingApproval = null;
let pendingControlPreflight = null;
let controlledTabId = null;
let contextDockExpanded = false;
let messageActions = null;
let monitorRenderers = null;
let nextControlPreflightDecision = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const composerController = createComposerController({
  commandForm,
  commandInput,
  forceClipboardFallback: true,
  navigator
});

const chatSessionStore = createChatSessionStore({
  storage: chrome.storage?.local,
  storageKeys: STORAGE_KEYS,
  getModel: () => modelSelect.value,
  getThinkingDepth: () => thinkingDepthSelect.value,
  setModel: (model) => {
    modelSelect.value = model;
  },
  setThinkingDepth: (depth) => {
    thinkingDepthSelect.value = depth;
  },
  isAllowedModel: (model) => [...modelSelect.options].some((option) => option.value === model),
  isAllowedThinkingDepth: (depth) => [...thinkingDepthSelect.options].some((option) => option.value === depth)
});
const browserJobStore = createBrowserJobStore({
  storage: chrome.storage?.local,
  storageKeys: STORAGE_KEYS
});

const isReadableBrowserTab = (tab) => typeof tab?.url === "string" && /^https?:\/\//i.test(tab.url);
const setStatus = (label) => {
  statusLabel = label;
  updateConnectionLine();
};

const scrollTranscriptToBottom = () => {
  window.requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
};

const updateContextDockVisibility = () => {
  const hasVisiblePanel = [activityPanel, sitePermissionPanel, taskConsentPanel, permissionManagerPanel, controlPreflightCard, jobMonitor, controlMonitor]
    .some((panel) => !panel.hidden);
  contextDock.hidden = !hasVisiblePanel;
  contextToggleButton.title = contextDockExpanded ? "Hide context usage and browser status" : "Show context usage and browser status";
  contextToggleButton.setAttribute("aria-label", contextToggleButton.title);
  contextToggleButton.setAttribute("aria-expanded", contextDockExpanded ? "true" : "false");
  scrollTranscriptToBottom();
};

const persistContextDockExpanded = async () => {
  await chrome.storage?.local?.set?.({
    [STORAGE_KEYS.contextDockExpanded]: contextDockExpanded
  }).catch(() => undefined);
};

const setActivity = (phase, label, detail = "") => {
  if (activityTimer) {
    window.clearTimeout(activityTimer);
    activityTimer = null;
  }
  activityPanel.hidden = false;
  activityPanel.dataset.phase = phase;
  activityLabel.textContent = label;
  activityDetail.textContent = detail;
  updateContextDockVisibility();
};

const clearActivity = () => {
  activityPanel.hidden = true;
  activityPanel.dataset.phase = "idle";
  activityLabel.textContent = "Ready";
  activityDetail.textContent = "";
  updateContextDockVisibility();
};

const clearActivitySoon = (delay = 2200) => {
  if (activityTimer) {
    window.clearTimeout(activityTimer);
  }
  activityTimer = window.setTimeout(clearActivity, delay);
};

const renderControlPreflightCard = () => {
  if (!pendingControlPreflight) {
    controlPreflightCard.hidden = true;
    updateContextDockVisibility();
    return;
  }
  controlPreflightCard.hidden = false;
  controlPreflightTitle.textContent = `${pendingControlPreflight.taskClass} control on ${pendingControlPreflight.siteKey}`;
  controlPreflightBody.textContent = `${pendingControlPreflight.goal} · ${pendingControlPreflight.mode}. Augmentor may read, scroll, click safe controls, and type into editable fields. Wallet, login, credential, payment, signing, transfer, destructive, and public-submit boundaries remain human-gated.`;
  updateContextDockVisibility();
};

const setTurnBusy = (busy) => {
  turnBusy = busy;
  commandInput.disabled = busy;
  const sendButton = commandForm.querySelector(".send-button");
  sendButton.disabled = false;
  sendButton.classList.toggle("is-stop", busy);
  sendButton.setAttribute("aria-label", busy ? "Stop response" : "Send message");
  sendButton.title = busy ? "Stop response" : "Send message";
  sendButton.innerHTML = busy
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="1.8"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
};

const runBusyUiAction = async (action) => {
  if (turnBusy) return;
  setTurnBusy(true);
  try {
    await action();
  } finally {
    setTurnBusy(false);
    if (statusLabel === "Ready") {
      clearActivitySoon();
    }
  }
};

const renderControlMonitor = () => {
  monitorRenderers.renderControlMonitor();
};

const updateConnectionLine = () => {
  const model = modelLabel(modelSelect.value);
  thinkingDepthSelect.hidden = !supportsThinkingDepth(modelSelect.value);
  connectionLine.title = `Connected to ${model} · ${statusLabel}`;
  connectionLine.setAttribute("aria-label", connectionLine.title);
  connectionLine.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>
  `;
};

const setContextMeter = (snapshot) => {
  updateContextMeterElement(contextMeter, contextUsageSnapshot({
    attachments: chatSessionStore.getAttachments(),
    messages: chatSessionStore.getMessages(),
    model: modelSelect.value,
    pageSnapshot: snapshot ?? lastSnapshot
  }));
};

const sitePermissionStore = createSitePermissionStore({
  storage: chrome.storage?.local,
  sitePermissionAuditStorageKey: STORAGE_KEYS.sitePermissionAudit,
  sitePermissionStorageKey: STORAGE_KEYS.sitePermissions
});
const permissionForUrl = sitePermissionStore.permissionForUrl;
const resetSitePermission = sitePermissionStore.resetSitePermission;
const setSitePermission = sitePermissionStore.setSitePermission;
const siteKeyForUrl = sitePermissionStore.siteKeyForUrl;
const sitePermissions = sitePermissionStore.sitePermissions;
const taskConsentStore = createTaskConsentStore({
  storage: chrome.storage?.local,
  taskConsentAuditStorageKey: STORAGE_KEYS.taskConsentAudit,
  taskConsentStorageKey: STORAGE_KEYS.taskConsents
});

const renderSitePermissionPanel = async (tab = null) => {
  await monitorRenderers.renderSitePermissionPanel(tab);
  await renderTaskConsentPanel(tab);
  await renderPermissionManager();
};

const renderTaskConsentPanel = async (tab = null) => {
  await monitorRenderers.renderTaskConsentPanel(tab);
};

const renderPermissionManager = () => monitorRenderers.renderPermissionManager();

const renderJobMonitor = () => {
  monitorRenderers.renderJobMonitor();
};

const loadBrowserJobs = async () => {
  await browserJobStore.hydrate();
  const recovered = await browserJobStore.recoverInterruptedJobs({
    from: ["running", "approval"],
    to: "paused",
    reason: "Recovered after browser host reload. Use /resume <job> to continue from persisted step history."
  });
  renderJobMonitor();
  if (recovered.length) {
    await addMessage(
      "system",
      `Recovered ${recovered.length} interrupted browser job${recovered.length === 1 ? "" : "s"} after reload. Use /resume <job> to continue from persisted step history.`
    );
  }
};

const createBrowserJob = async ({ existingJob = null, goal, planner = "observe-act-verify-loop", summary = "" }) => {
  const pageLock = await prepareBrowserJobPageLock({ goal, existingJob });
  if (existingJob?.id) {
    await browserJobStore.activateJob(existingJob.id);
    const updated = await browserJobStore.updateJob(existingJob.id, {
      status: "running",
      planner,
      summary,
      pageLock,
      preflightDecision: consumeNextControlPreflightDecision() ?? existingJob.preflightDecision ?? null
    });
    renderJobMonitor();
    return updated ?? existingJob;
  }
  const job = await browserJobStore.createJob({
    goal,
    planner,
    summary,
    pageLock,
    preflightDecision: consumeNextControlPreflightDecision()
  });
  renderJobMonitor();
  return job;
};

const updateBrowserJob = async (jobId, patch) => {
  const updated = await browserJobStore.updateJob(jobId, patch);
  renderJobMonitor();
  return updated;
};

const persistChatState = () => chatSessionStore.persist();

const {
  flashCopied,
  renderAttachments,
  renderMessages
} = createSidePanelRenderers({
  attachmentStrip,
  transcript,
  getAttachments: () => chatSessionStore.getAttachments(),
  getMessages: () => chatSessionStore.getMessages(),
  onRemoveAttachment: async (id) => {
    await chatSessionStore.removeAttachment(id);
    renderAttachments();
  },
  onCopyMessage: (id) => messageActions.copyMessage(id),
  onDeleteMessage: async (id) => {
    await messageActions.deleteMessage(id);
  },
  onEditMessage: (id) => messageActions.editMessage(id),
  onForkMessage: async (id) => {
    await messageActions.forkFromMessage(id);
  },
  onRegenerateMessage: async (id) => {
    await messageActions.regenerateFromMessage(id);
  },
  onSaveMessageToArchive: (id) => messageActions.saveMessageToArchive(id),
  onShowMessageStats: (id) => messageActions.showMessageStats(id),
  scrollTranscriptToBottom,
  window
});

const addMessage = async (role, content, { persist = true, usage = null } = {}) => {
  const message = await chatSessionStore.addMessage(role, content, { persist, usage });
  if (!message) return null;
  renderMessages();
  setContextMeter(lastSnapshot);
  return message;
};

const dictationController = createDictationController({
  addMessage,
  button: dictateButton,
  commandInput,
  navigatorRef: navigator,
  onTranscript: () => composerController.pushUndoSnapshot(),
  setStatus,
  windowRef: window
});

messageActions = createMessageActionController({
  addMessage,
  bridgeRequest,
  chatSessionStore,
  commandInput,
  composerController,
  fileInput,
  flashCopied,
  getLastSnapshot: () => lastSnapshot,
  getRespondToCommand: () => respondToCommand,
  navigator,
  renderAttachments,
  renderMessages,
  setStatus
});

const browserPageActions = createBrowserPageActions({
  addMessage,
  bridgeRequest,
  chrome,
  getControlledTabId: () => controlledTabId,
  getModel: () => modelSelect.value,
  getThinkingDepth: () => thinkingDepthSelect.value,
  getLastSnapshot: () => lastSnapshot,
  isReadableBrowserTab,
  normalizeBrowserUrl,
  permissionForUrl,
  renderSitePermissionPanel,
  setActivity,
  setContextMeter,
  setControlledTabId: (tabId) => {
    controlledTabId = tabId;
  },
  setLastSnapshot: (snapshot) => {
    lastSnapshot = snapshot;
  },
  setReadButtonTitle: (title) => {
    readButton.title = title;
  },
  setStatus,
  siteKeyForUrl,
  sleep
});

const {
  activeTab,
  clickActivePageText,
  detectActivePageForms,
  detectWalletState,
  openBrowserUrl,
  readActivePage,
  prepareDaoWorkflowGuidance,
  refreshTabContext,
  scrollActivePage,
  saveCurrentPageToArchive,
  saveResearchTrailToArchive,
  saveSelectionToArchive,
  saveWalletDaoAuditToArchive,
  searchBrowser,
  sendContentAction,
  setPageControlOverlay,
  summarizeCurrentPageToArchive,
  summarizeSnapshot,
  typeIntoActivePage
} = browserPageActions;

monitorRenderers = createMonitorRenderers({
  activeTab,
  approvalBoundaryForStep,
  controlStepLabel,
  elements: {
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
  },
  getActiveBrowserJobId: () => browserJobStore.getActiveJobId(),
  getBrowserJobSchedulerState: () => browserJobStore.getSchedulerState({ maxConcurrent: 2 }),
  getBrowserJobs: () => browserJobStore.getJobs(),
  getContextDockExpanded: () => contextDockExpanded,
  getCurrentControlRun: () => currentControlRun,
  getJobMonitorCollapsed: () => browserJobStore.getMonitorCollapsed(),
  getPendingApproval: () => pendingApproval,
  getSitePermissionAudit: () => sitePermissionStore.sitePermissionAudit(),
  getSitePermissions: () => sitePermissions(),
  getTaskConsentAudit: () => taskConsentStore.taskConsentAudit(),
  getTaskConsents: () => taskConsentStore.taskConsents(),
  isReadableBrowserTab,
  onContinueBrowserJob: (job) => {
    void continueBrowserJob(job.id);
  },
  onActivateBrowserJob: async (job) => {
    await browserJobStore.activateJob(job.id);
    renderJobMonitor();
    await addMessage("system", `Focused browser job ${job.id}: ${job.goal}`);
  },
  onSaveBrowserJobReport: async (job) => {
    const result = await saveBrowserJobReportToArchive(job);
    if (result?.error) {
      await addMessage("system", `Browser job report failed: ${result.error}`);
      return;
    }
    const artifacts = [...(job.artifacts ?? []), { type: "archive-intake", path: result.path }];
    await updateBrowserJob(job.id, { artifacts });
    await addMessage("system", `Saved browser job report to Living Archive intake: ${result.path}`);
  },
  onRevokeTaskConsent: async (consent) => {
    await taskConsentStore.revokeTaskConsent({
      siteKey: consent.siteKey,
      taskClass: consent.taskClass,
      reason: "Revoked from permission manager",
      source: "permission-manager"
    });
    await addMessage("system", `Revoked safe-action consent for ${consent.siteKey} · ${consent.taskClass}.`);
    await renderTaskConsentPanel();
    await renderPermissionManager();
  },
  onResetSitePermission: async (siteKey) => {
    await resetSitePermission(siteKey, {
      reason: "Reset from permission manager",
      source: "permission-manager"
    });
    await addMessage("system", `Reset site permission for ${siteKey} to ask-before-action.`);
    await renderSitePermissionPanel();
    await renderPermissionManager();
  },
  permissionForUrl,
  siteKeyForUrl,
  updateContextDockVisibility
});

const tabContextController = createTabContextController({
  addMessage,
  chrome,
  getControlledTabId: () => controlledTabId,
  isReadableBrowserTab,
  refreshTabContext,
  renderSitePermissionPanel,
  setContextMeter,
  setControlledTabId: (tabId) => {
    controlledTabId = tabId;
  },
  setLastSnapshot: (snapshot) => {
    lastSnapshot = snapshot;
  },
  sitePermissionStorageKey: STORAGE_KEYS.sitePermissions
});
const bindMentionedTab = tabContextController.bindMentionedTab;

const saveIntake = async (target = "page") => {
  if (/trail|research/i.test(String(target))) {
    return saveResearchTrailToArchive(target);
  }
  if (/summary|summari[sz]e|synthesis/i.test(String(target))) {
    return summarizeCurrentPageToArchive();
  }
  if (/selection|selected/i.test(String(target))) {
    return saveSelectionToArchive();
  }
  return saveCurrentPageToArchive();
};

const explainStructuredPageEditBoundary = async (instruction) => {
  const response = lastSnapshot ? { ok: true, snapshot: lastSnapshot } : await readActivePage({ announce: false });
  const snapshot = response?.snapshot;
  const title = snapshot?.title || "the active page";
  const url = snapshot?.url || "unknown URL";
  setActivity("completed", "Checked active page", title);
  setStatus("Needs precise edit target");
  await addMessage(
    "system",
    [
      `I can see the active page: ${title}`,
      url,
      "",
      "I can read the page, click visible page controls, and type into focused or normal editable fields from the side-panel host.",
      "This request is a structured document edit, so I need a precise editable target before I act. For Google Sheets/Docs, line/row edits are canvas/app-level interactions and should not be guessed from visible text.",
      "",
      `Requested change: ${instruction}`,
      "",
      "Give me a specific target such as a cell address, visible button/text to click, or ask me to type quoted text into the currently focused field. Example: click cell A17, then ask: type \"we need to add model selection and providers to ResonantOS browser\"."
    ].join("\n")
  );
};

const controlPlanningService = createControlPlanningService({
  bridgeRequest,
  getLastSnapshot: () => lastSnapshot,
  getModel: () => modelSelect.value,
  getThinkingDepth: () => thinkingDepthSelect.value,
  readActivePage
});
const requestNextControlAction = controlPlanningService.requestNextControlAction;

const controlStepExecutor = createControlStepExecutor({
  addMessage,
  chrome,
  clickActivePageText,
  detectActivePageForms,
  getControlledTabId: () => controlledTabId,
  isReadableBrowserTab,
  openBrowserUrl,
  scrollActivePage,
  searchBrowser,
  setActivity,
  setContextMeter,
  setControlledTabId: (tabId) => {
    controlledTabId = tabId;
  },
  setLastSnapshot: (snapshot) => {
    lastSnapshot = snapshot;
  },
  sleep,
  summarizeSnapshot,
  typeIntoActivePage
});
const executeControlStep = controlStepExecutor.executeControlStep;

const controlReportingService = createControlReportingService({
  addMessage,
  bridgeRequest,
  controlStepLabel,
  getCurrentControlRun: () => currentControlRun,
  getLastSnapshot: () => lastSnapshot,
  getPendingApproval: () => pendingApproval
});
const delegateControlIssue = controlReportingService.delegateControlIssue;
const saveBrowserJobReportToArchive = controlReportingService.saveBrowserJobReportToArchive;
const saveControlReportToArchive = controlReportingService.saveControlReportToArchive;

const controlRunState = createControlRunState({
  browserJobStore,
  getCurrentControlRun: () => currentControlRun,
  renderControlMonitor,
  setCurrentControlRun: (run) => {
    currentControlRun = run;
  },
  setPageControlOverlay,
  setPendingApproval: (approval) => {
    pendingApproval = approval;
  },
  updateBrowserJob
});
const appendControlStep = controlRunState.appendControlStep;
const finishControlRun = controlRunState.finishControlRun;
const startControlRun = controlRunState.startControlRun;
const updateControlRunArtifacts = controlRunState.updateControlRunArtifacts;
const updateControlStep = controlRunState.updateControlStep;

const controlPageObserver = createControlPageObserver({
  browserJobStore,
  chrome,
  getControlledTabId: () => controlledTabId,
  getCurrentControlRun: () => currentControlRun,
  getLastSnapshot: () => lastSnapshot,
  isReadableBrowserTab,
  readActivePage,
  setActivity
});
const observeControlPage = controlPageObserver.observeControlPage;

const agentControlRunner = createAgentControlRunner({
  addMessage,
  appendControlStep,
  approvalBoundaryForStep,
  controlStepLabel,
  createBrowserJob,
  executeControlStep,
  finishControlRun,
  getActiveJobId: () => browserJobStore.getActiveJobId(),
  getCurrentControlRun: () => currentControlRun,
  getLastSnapshot: () => lastSnapshot,
  observeControlPage,
  renderControlMonitor,
  requestNextControlAction,
  saveControlReportToArchive,
  setActivity,
  setPageControlOverlay,
  setPendingApproval: (approval) => {
    pendingApproval = approval;
  },
  setStatus,
  sleep,
  startControlRun,
  taskConsentForStep: async ({ goal }) => {
    const tab = await activeTab();
    return taskConsentStore.consentFor({
      siteKey: siteKeyForUrl(tab?.url),
      goal
    });
  },
  updateBrowserJob,
  updateControlRunArtifacts,
  updateControlStep
});

const continueControlLoop = agentControlRunner.continueControlLoop;
const startControlCommand = agentControlRunner.runControlCommand;

const persistControlPreflight = async () => {
  await chrome.storage?.local?.set?.({
    [STORAGE_KEYS.controlPreflight]: pendingControlPreflight
  }).catch(() => undefined);
  renderControlPreflightCard();
};

const clearControlPreflight = async () => {
  pendingControlPreflight = null;
  await chrome.storage?.local?.remove?.(STORAGE_KEYS.controlPreflight).catch(() => undefined);
  renderControlPreflightCard();
};

const hydrateControlPreflight = async () => {
  const settings = await chrome.storage?.local?.get?.(STORAGE_KEYS.controlPreflight).catch(() => ({}));
  pendingControlPreflight = normalizeControlPreflight(settings?.[STORAGE_KEYS.controlPreflight]);
  renderControlPreflightCard();
};

const setNextControlPreflightDecision = (decision) => {
  nextControlPreflightDecision = decision ? {
    id: decision.id ?? "",
    goal: decision.goal ?? "",
    siteKey: decision.siteKey ?? "unknown-site",
    taskClass: decision.taskClass ?? "general",
    mode: decision.mode ?? "not-required",
    permissionMode: decision.permissionMode ?? "",
    decidedAt: decision.decidedAt ?? new Date().toISOString(),
    source: decision.source ?? "control-preflight",
    reason: decision.reason ?? ""
  } : null;
};

const consumeNextControlPreflightDecision = () => {
  const decision = nextControlPreflightDecision;
  nextControlPreflightDecision = null;
  return decision;
};

const preflightDecisionFromPreflight = (preflight, { mode, reason }) => ({
  id: preflight.id,
  goal: preflight.goal,
  siteKey: preflight.siteKey,
  taskClass: preflight.taskClass,
  mode,
  permissionMode: preflight.mode,
  decidedAt: new Date().toISOString(),
  source: "control-preflight",
  reason
});

const pageLockForTab = (tab, reason = "Agent Control run") => ({
  type: "tab",
  tabId: tab?.id ?? null,
  url: tab?.url ?? "",
  siteKey: siteKeyForUrl(tab?.url),
  acquiredAt: new Date().toISOString(),
  reason
});

const TERMINAL_CONTROL_RUN_STATUSES = new Set(["completed", "blocked", "denied", "cancelled", "failed"]);

const prepareBrowserJobPageLock = async ({ goal, existingJob = null } = {}) => {
  const tab = await activeTab();
  const pageLock = pageLockForTab(tab, existingJob?.id
    ? `Resumed Agent Control job ${existingJob.id}`
    : `Agent Control goal: ${String(goal ?? "").slice(0, 120)}`);
  let conflict = browserJobStore.conflictingActiveJobForLock(pageLock, {
    excludingJobId: existingJob?.id ?? ""
  });
  if (conflict && currentControlRun && conflict.id === currentControlRun.id && TERMINAL_CONTROL_RUN_STATUSES.has(currentControlRun.status)) {
    await updateBrowserJob(conflict.id, {
      status: currentControlRun.status,
      pageLock: null,
      artifacts: currentControlRun.artifacts,
      summary: currentControlRun.summary,
      planner: currentControlRun.planner,
      steps: currentControlRun.steps
    });
    conflict = browserJobStore.conflictingActiveJobForLock(pageLock, {
      excludingJobId: existingJob?.id ?? ""
    });
  }
  if (conflict?.status === "approval") {
    if (currentControlRun?.id === conflict.id) {
      pendingApproval = null;
      currentControlRun = {
        ...currentControlRun,
        status: "cancelled",
        completedAt: new Date().toISOString()
      };
      renderControlMonitor();
    }
    await updateBrowserJob(conflict.id, {
      status: "cancelled",
      pageLock: null,
      artifacts: currentControlRun?.id === conflict.id ? currentControlRun.artifacts : conflict.artifacts,
      summary: currentControlRun?.id === conflict.id ? currentControlRun.summary : conflict.summary,
      planner: currentControlRun?.id === conflict.id ? currentControlRun.planner : conflict.planner,
      steps: currentControlRun?.id === conflict.id ? currentControlRun.steps : conflict.steps
    });
    conflict = browserJobStore.conflictingActiveJobForLock(pageLock, {
      excludingJobId: existingJob?.id ?? ""
    });
  }
  if (conflict) {
    throw new Error(`Cannot start Agent Control on ${pageLock.siteKey}: ${conflict.id} is already ${conflict.status} on this browser target. Focus, pause, cancel, or finish that job first.`);
  }
  return pageLock;
};

const runControlCommand = async (goal, options = {}) => {
  const tab = await activeTab();
  const mode = tab?.url ? await permissionForUrl(tab.url) : "ask-before-action";
  if (mode === "blocked") {
    await addMessage("system", `Agent Control is blocked on ${siteKeyForUrl(tab?.url)}. Change the current-site permission before asking Augmentor to operate this page.`);
    setStatus("Control blocked");
    return null;
  }
  const existingConsent = await taskConsentStore.consentFor({
    siteKey: siteKeyForUrl(tab?.url),
    goal
  });
  if (options.resumedFromJob) {
    setNextControlPreflightDecision({
      ...(options.resumedFromJob.preflightDecision ?? {}),
      id: options.resumedFromJob.preflightDecision?.id ?? options.resumedFromJob.id,
      goal,
      siteKey: options.resumedFromJob.preflightDecision?.siteKey ?? siteKeyForUrl(tab?.url),
      taskClass: options.resumedFromJob.preflightDecision?.taskClass ?? existingConsent?.taskClass ?? "general",
      mode: "resumed",
      permissionMode: mode,
      source: "browser-job-store",
      reason: `Resumed from browser job ${options.resumedFromJob.id}.`
    });
  }
  if (shouldRequireControlPreflight({
    goal,
    mode,
    existingConsent,
    alreadyApproved: Boolean(options.preflightApproved),
    resumedFromJob: Boolean(options.resumedFromJob)
  })) {
    pendingControlPreflight = createControlPreflight({
      goal,
      mode,
      siteKey: siteKeyForUrl(tab?.url)
    });
    await persistControlPreflight();
    contextDockExpanded = true;
    await persistContextDockExpanded();
    await renderSitePermissionPanel(tab);
    await addMessage("system", formatControlPreflightMessage(pendingControlPreflight));
    setStatus("Preflight required");
    setActivity("approval", "Agent Control preflight required", pendingControlPreflight.taskClass);
    return null;
  }
  if (!options.resumedFromJob && existingConsent?.mode === "allow-safe" && !options.preflightApproved) {
    setNextControlPreflightDecision({
      id: existingConsent.id ?? `${existingConsent.siteKey}::${existingConsent.taskClass}`,
      goal,
      siteKey: existingConsent.siteKey,
      taskClass: existingConsent.taskClass,
      mode: "skipped-by-consent",
      permissionMode: mode,
      decidedAt: new Date().toISOString(),
      source: existingConsent.source || "task-consent-store",
      reason: existingConsent.reason || "Stored safe task-class consent allowed preflight skip."
    });
  }
  await clearControlPreflight();
  try {
    return await startControlCommand(goal, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Agent Control could not start.", error);
    await addMessage("system", `Agent Control could not start.\n${message}`);
    setStatus("Control blocked");
    setActivity("failed", "Control could not start", message);
    return null;
  }
};

const resolvePreflightFromCommand = (body) => {
  const requested = String(body ?? "").trim();
  if (!pendingControlPreflight) return null;
  if (!requested || requested === pendingControlPreflight.id) return pendingControlPreflight;
  return null;
};

const approveControlPreflight = async (body) => {
  const preflight = resolvePreflightFromCommand(body);
  if (!preflight) {
    await addMessage("system", "No matching Agent Control preflight is waiting. Start a browser-control task first, or use the exact preflight id.");
    return;
  }
  setNextControlPreflightDecision(preflightDecisionFromPreflight(preflight, {
    mode: "approved-once",
    reason: "Human approved Agent Control preflight once."
  }));
  await clearControlPreflight();
  await addMessage("system", `Approved Agent Control preflight for ${preflight.taskClass} on ${preflight.siteKey}. Starting governed browser control now.`);
  setStatus("Taking control");
  await runControlCommand(preflight.goal, { preflightApproved: true });
};

const denyControlPreflight = async (body) => {
  const preflight = resolvePreflightFromCommand(body);
  if (!preflight) {
    await addMessage("system", "No matching Agent Control preflight is waiting.");
    return;
  }
  await clearControlPreflight();
  setStatus("Denied");
  await addMessage("system", `Denied Agent Control preflight for ${preflight.taskClass} on ${preflight.siteKey}. No browser actions were taken.`);
};

const trustControlPreflightForSafeActions = async (body) => {
  const preflight = resolvePreflightFromCommand(body);
  if (!preflight) {
    await addMessage("system", "No matching Agent Control preflight is waiting.");
    return;
  }
  const consent = await taskConsentStore.setTaskConsent({
    siteKey: preflight.siteKey,
    taskClass: preflight.taskClass,
    mode: "allow-safe",
    reason: `Trusted from Agent Control preflight: ${preflight.goal}`,
    source: "control-preflight"
  });
  setNextControlPreflightDecision(preflightDecisionFromPreflight(preflight, {
    mode: "trusted-safe-actions",
    reason: `Human trusted safe ${preflight.taskClass} actions for ${preflight.siteKey}.`
  }));
  await clearControlPreflight();
  await renderTaskConsentPanel();
  await renderPermissionManager();
  await addMessage("system", `Trusted safe ${consent.taskClass} actions on ${consent.siteKey} and starting governed browser control now. Hard wallet, login, payment, credential, signing, transfer, destructive, and public-submit boundaries remain human-gated.`);
  setStatus("Taking control");
  await runControlCommand(preflight.goal, { preflightApproved: true });
};

const approvePendingControlStep = async () => {
  if (!pendingApproval || !currentControlRun) return;
  const approval = pendingApproval;
  const boundary = approvalBoundaryForStep(approval.step, approval.reason);
  if (boundary === "hard") {
    await addMessage("system", `Cannot automate this action: ${controlStepLabel(approval.step)}.\nWallet, payment, login, credential, signing, and transfer actions are human-only.`);
    return;
  }
  await agentControlRunner.approvePendingControlStep(approval);
};

const trustCurrentTaskForSafeActions = async () => {
  if (!pendingApproval || !currentControlRun) return;
  const approval = pendingApproval;
  const boundary = approvalBoundaryForStep(approval.step, approval.reason);
  const tab = await activeTab();
  if (boundary !== "safe") {
    await addMessage(
      "system",
      `Cannot trust this task class for ${boundary} actions. Wallet, payment, login, credential, signing, public-submit, and transfer boundaries stay once-only human review.`
    );
    renderControlMonitor();
    return;
  }
  const consent = await taskConsentStore.setTaskConsent({
    siteKey: siteKeyForUrl(tab?.url),
    goal: currentControlRun.goal,
    mode: "allow-safe",
    reason: `Trusted after approval for: ${controlStepLabel(approval.step)}`,
    source: "approval-card"
  });
  await addMessage("system", `Trusted safe ${consent.taskClass} actions on ${consent.siteKey} for this task class and approved this safe step once: ${controlStepLabel(approval.step)}`);
  await approvePendingControlStep();
  await renderTaskConsentPanel(tab);
};

const denyPendingControlStep = async () => {
  if (!pendingApproval || !currentControlRun) return;
  await agentControlRunner.denyPendingControlStep(pendingApproval);
};

const runBrowserCommand = async (body) => {
  const match = /^(open|navigate|visit|go|search|find|news|research|read|context|click|type|write|scroll|forms|fields)\b\s*([\s\S]*)$/i.exec(body.trim());
  const target = (match?.[2] ?? body).trim();
  if (!target) {
    const action = match?.[1]?.toLowerCase();
    if (action === "read" || action === "context") {
      await summarizeSnapshot();
      return;
    }
    if (action === "scroll") {
      await scrollActivePage({ direction: "down" });
      return;
    }
    if (action === "forms" || action === "fields") {
      await detectActivePageForms();
      return;
    }
    await addMessage("system", "Use `/browser open <url>`, `/browser search <query>`, `/browser read`, `/browser click \"text\"`, `/browser type \"text\"`, `/browser scroll down`, or `/browser forms`.");
    return;
  }
  const action = match?.[1]?.toLowerCase();
  if (["search", "find", "news", "research"].includes(action)) {
    await searchBrowser({ query: normalizeSearchQuery(target), action: action === "news" ? "news" : "search" });
    return;
  }
  if (action === "read" || action === "context") {
    await summarizeSnapshot();
    return;
  }
  if (action === "click") {
    const text = parseQuotedText(target) || target;
    await clickActivePageText({ text });
    return;
  }
  if (action === "type" || action === "write") {
    const text = parseQuotedText(target) || target;
    await typeIntoActivePage({ text, submit: /\b(submit|press enter|hit enter|search)\b/i.test(target) });
    return;
  }
  if (action === "scroll") {
    await scrollActivePage({ direction: /\b(up|top)\b/i.test(target) ? /\btop\b/i.test(target) ? "top" : "up" : /\b(bottom|end)\b/i.test(target) ? "bottom" : "down" });
    return;
  }
  if (action === "forms" || action === "fields") {
    await detectActivePageForms();
    return;
  }
  await openBrowserUrl(target);
};

const handleWalletBoundary = async () => {
  await addMessage("system", "Wallet actions are human-approval gated. I can discuss Phantom and browser context, but wallet connect, signing, seed phrases, private keys, and credential actions stay human-only.");
  setStatus("Approval gated");
};

const chatTurnController = createChatTurnController({
  addMessage,
  bridgeRequest,
  chatSessionStore,
  clearActivitySoon,
  clearAttachments: () => messageActions.clearAttachments(),
  getLastSnapshot: () => lastSnapshot,
  getModel: () => modelSelect.value,
  getThinkingDepth: () => thinkingDepthSelect.value,
  setActivity,
  setStatus,
  setTurnBusy
});

const runChatTurn = chatTurnController.runChatTurn;
const stopChatTurn = chatTurnController.stopChatTurn;

const {
  cancelBrowserJob,
  continueBrowserJob,
  pauseBrowserJob,
  resumeBrowserJob,
  runCapabilitiesCommand,
  runDelegateCommand,
  runGoalCommand,
  runHistorySearchCommand,
  runJobsCommand,
  runMemorySearchCommand,
  reportBrowserJob,
  runSitePermissionCommand,
  runStatusCommand,
  runWalletStatusCommand
} = createAppCommandHandlers({
  activeTab,
  addMessage,
  bridgeRequest,
  browserJobStore,
  chrome,
  detectWalletState,
  finishControlRun,
  getCurrentControlRun: () => currentControlRun,
  permissionForUrl,
  renderJobMonitor,
  renderSitePermissionPanel,
  restartBrowserJob: (job) => runControlCommand(job.goal, { resumedFromJob: job }),
  saveBrowserJobReportToArchive,
  setActivity,
  setSitePermission,
  setStatus,
  siteKeyForUrl,
  updateBrowserJob
});

const showBrowserJobsCommand = async (body) => {
  contextDockExpanded = true;
  await persistContextDockExpanded();
  await browserJobStore.setMonitorCollapsed(false);
  renderJobMonitor();
  return runJobsCommand(body);
};

controlStopButton.addEventListener("click", () => {
  void cancelBrowserJob(currentControlRun?.id ?? browserJobStore.getActiveJobId() ?? "");
});

const commandRouter = createSidePanelCommandRouter({
  bindMentionedTab,
  clickActivePageText,
  detectActivePageForms,
  explainStructuredPageEditBoundary,
  handleWalletBoundary,
  openBrowserUrl,
  pauseBrowserJob,
  prepareDaoWorkflowGuidance,
  resumeBrowserJob,
  cancelBrowserJob,
  approveControlPreflight,
  continueBrowserJob,
  denyControlPreflight,
  runBrowserCommand,
  runCapabilitiesCommand,
  runChatTurn,
  runControlCommand,
  runDelegateCommand,
  runGoalCommand,
  runHistorySearchCommand,
  runJobsCommand: showBrowserJobsCommand,
  runMemorySearchCommand,
  reportBrowserJob,
  runSitePermissionCommand,
  runStatusCommand,
  runWalletStatusCommand,
  saveWalletDaoAuditToArchive,
  saveIntake,
  scrollActivePage,
  searchBrowser,
  summarizeSnapshot,
  typeIntoActivePage
});

const respondToCommand = commandRouter.respondToCommand;

chrome.runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
  if (!message || message.channel !== "resonantos.browser_first.side_panel") {
    return false;
  }
  if (message.type === "cancel_control_run") {
    void cancelBrowserJob(currentControlRun?.id ?? browserJobStore.getActiveJobId() ?? "").then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  }
  return false;
});

const hydrateChatSettings = async () => {
  await hydrateProviderModelOptions({
    bridgeRequest,
    getPreferredModel: () => modelSelect.value,
    modelSelect,
    setStatus
  });
  await chatSessionStore.hydrate();
  const settings = await chrome.storage?.local?.get?.([STORAGE_KEYS.contextDockExpanded]).catch(() => ({}));
  contextDockExpanded = Boolean(settings?.[STORAGE_KEYS.contextDockExpanded]);
  await hydrateControlPreflight();
  await chatSessionStore.ensureFreshSession();
  renderMessages();
  renderAttachments();
  updateConnectionLine();
  setContextMeter(lastSnapshot);
};

const consumePendingSidebarPrompt = async () => {
  const payload = await chrome.storage?.local?.get?.(STORAGE_KEYS.pendingSidebarPrompt).catch(() => ({}));
  const pending = payload?.[STORAGE_KEYS.pendingSidebarPrompt];
  const prompt = String(pending?.prompt ?? "").trim();
  if (!prompt) return;
  if (turnBusy) return;
  await chrome.storage.local.remove(STORAGE_KEYS.pendingSidebarPrompt).catch(() => undefined);
  setTurnBusy(true);
  try {
    await addMessage("user", prompt);
    await respondToCommand(prompt);
  } finally {
    setTurnBusy(false);
  }
};

chrome.storage?.onChanged?.addListener?.((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEYS.pendingSidebarPrompt]?.newValue) {
    return;
  }
  void consumePendingSidebarPrompt();
});

transcript.addEventListener("resonantos:use-prompt", (event) => {
  commandInput.value = event.detail?.prompt ?? "";
  commandInput.dispatchEvent(new Event("input", { bubbles: true }));
  commandInput.focus();
});
attachFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => void messageActions.attachFiles(fileInput.files));
readButton.addEventListener("click", () => void readActivePage());
saveIntakeButton.addEventListener("click", () => void saveIntake("page"));
saveSelectionButton.addEventListener("click", () => void saveIntake("selection"));
const toggleContextDock = () => {
  contextDockExpanded = !contextDockExpanded;
  void persistContextDockExpanded();
  void renderSitePermissionPanel();
  renderJobMonitor();
};
contextToggleButton.addEventListener("click", toggleContextDock);
contextMeter.addEventListener("click", async () => {
  const snapshot = contextUsageSnapshot({
    attachments: chatSessionStore.getAttachments(),
    messages: chatSessionStore.getMessages(),
    model: modelSelect.value,
    pageSnapshot: lastSnapshot
  });
  await addMessage(
    "system",
    [
      "Context usage",
      `- estimated: ${snapshot.percent}%`,
      `- tokens: ${snapshot.usedTokens.toLocaleString()} / ${snapshot.contextWindow.toLocaleString()}`,
      `- messages: ${snapshot.messageTokens.toLocaleString()} tokens`,
      `- attachments: ${snapshot.attachmentTokens.toLocaleString()} tokens`,
      `- page context: ${snapshot.pageTokens.toLocaleString()} tokens`,
      "",
      snapshot.percent >= 72
        ? "Recommendation: compact or fork soon, or switch to a larger-context model."
        : "Context is within the safe operating range."
    ].join("\n")
  );
});
approvalApproveButton.addEventListener("click", () => void runBusyUiAction(approvePendingControlStep));
approvalTrustSiteButton.addEventListener("click", () => void runBusyUiAction(trustCurrentTaskForSafeActions));
approvalDenyButton.addEventListener("click", () => void denyPendingControlStep());
approvalDelegateButton.addEventListener("click", () => void runBusyUiAction(delegateControlIssue));
controlPreflightApproveButton.addEventListener("click", () => void runBusyUiAction(() => approveControlPreflight(pendingControlPreflight?.id ?? "")));
controlPreflightTrustButton.addEventListener("click", () => void runBusyUiAction(() => trustControlPreflightForSafeActions(pendingControlPreflight?.id ?? "")));
controlPreflightDenyButton.addEventListener("click", () => void runBusyUiAction(() => denyControlPreflight(pendingControlPreflight?.id ?? "")));
jobMonitorToggle.addEventListener("click", async () => {
  await browserJobStore.toggleMonitorCollapsed();
  renderJobMonitor();
});
sitePermissionMode.addEventListener("change", async () => {
  const tab = await activeTab();
  const result = await setSitePermission(tab?.url, sitePermissionMode.value, {
    reason: "Changed from current-site permission selector",
    source: "site-permission-panel"
  });
  await renderSitePermissionPanel(tab);
  setStatus(`Site permission: ${result.mode}`);
  setActivity("completed", "Site permission updated", `${result.key} · ${result.mode}`);
  clearActivitySoon(1600);
});
tabContextController.bindBrowserListeners();
modelSelect.addEventListener("change", () => void persistChatState().then(() => {
  updateConnectionLine();
  setContextMeter(lastSnapshot);
}));
thinkingDepthSelect.addEventListener("change", () => void persistChatState());
dictateButton.addEventListener("click", () => dictationController.toggle());

composerController.bind();

commandForm.querySelector(".send-button").addEventListener("click", (event) => {
  if (!turnBusy) return;
  event.preventDefault();
  stopChatTurn();
});

commandForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (turnBusy) {
    return;
  }
  const value = commandInput.value.trim();
  if (!value) {
    return;
  }
  setTurnBusy(true);
  try {
    await addMessage("user", value);
    commandInput.value = "";
    composerController.resetUndoStack("");
    await respondToCommand(value);
  } finally {
    setTurnBusy(false);
    if (statusLabel === "Ready") {
      clearActivitySoon();
    }
  }
});

hydrateChatSettings().then(async () => {
  await loadBrowserJobs();
  await tabContextController.hydrateInitialContext();
  await consumePendingSidebarPrompt();
}).catch((error) => {
  setStatus("Context failed");
  void addMessage("system", `I could not read the active tab context: ${String(error)}`);
});
