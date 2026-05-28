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
import { createComposerController } from "./lib/composer-controller.js";
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

const readButton = document.querySelector("#read-page");
const newChatButton = document.querySelector("#new-chat");
const chatHistory = document.querySelector("#chat-history");
const attachFileButton = document.querySelector("#attach-file");
const fileInput = document.querySelector("#file-input");
const attachmentStrip = document.querySelector("#attachment-strip");
const saveIntakeButton = document.querySelector("#save-intake");
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
const jobMonitor = document.querySelector("#job-monitor");
const jobMonitorTitle = document.querySelector("#job-monitor-title");
const jobMonitorToggle = document.querySelector("#job-monitor-toggle");
const jobList = document.querySelector("#job-list");
const controlMonitor = document.querySelector("#control-monitor");
const controlMonitorTitle = document.querySelector("#control-monitor-title");
const controlMonitorStatus = document.querySelector("#control-monitor-status");
const controlStepList = document.querySelector("#control-step-list");
const controlArtifacts = document.querySelector("#control-artifacts");
const approvalCard = document.querySelector("#approval-card");
const approvalTitle = document.querySelector("#approval-title");
const approvalReason = document.querySelector("#approval-reason");
const approvalApproveButton = document.querySelector("#approval-approve");
const approvalTrustSiteButton = document.querySelector("#approval-trust-site");
const approvalDenyButton = document.querySelector("#approval-deny");
const approvalDelegateButton = document.querySelector("#approval-delegate");

// === Tom/Analog6 product features ===
const bridgeBanner = document.getElementById("bridge-banner");
const themeToggle = document.getElementById("theme-toggle");
const settingsToggleBtn = document.getElementById("settings-toggle");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose = document.getElementById("settings-close");
const settingsSave = document.getElementById("settings-save");
const settingsStatus = document.getElementById("settings-status");
const themeToggleSettings = document.getElementById("theme-toggle-settings");
const copyMobileUrl = document.getElementById("copy-mobile-url");
const openStoreBtn = document.getElementById("open-store-tab");
const openShieldBtn = document.getElementById("open-shield-tab");
const openArchiveBtn = document.getElementById("open-archive-tab");
const openAwarenessBtn = document.getElementById("open-awareness-tab");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

const bridgeRequest = createBridgeClient();
const STORAGE_KEYS = {
  messages: "augmentorBrowserMessages",
  forks: "augmentorBrowserForks",
  sessions: "augmentorBrowserSessions",
  activeSessionId: "augmentorActiveBrowserSessionId",
  pendingSidebarPrompt: "augmentorPendingSidebarPrompt",
  model: "augmentorModel",
  thinkingDepth: "augmentorThinkingDepth",
  attachments: "augmentorBrowserAttachments",
  sitePermissions: "augmentorSitePermissions",
  browserJobs: "augmentorBrowserJobs",
  jobMonitorCollapsed: "augmentorJobMonitorCollapsed"
};
let lastSnapshot = null;
let statusLabel = "Ready";
let turnBusy = false;
let activityTimer = null;
let currentControlRun = null;
let pendingApproval = null;
let controlledTabId = null;
let contextDockExpanded = false;
let messageActions = null;
let monitorRenderers = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const composerController = createComposerController({ commandForm, commandInput, navigator });

const MODEL_LABELS = {
  "MiniMax-M2.7": "MiniMax 2.7",
  "MiniMax-M2.7-highspeed": "MiniMax 2.7 High Speed",
  "gpt-5.5": "GPT 5.5",
  "gpt-5.4-mini": "GPT 5.4 Mini",
  "batiai/gemma4-e2b:q4": "Gemma 4 2B"
};

const supportsThinkingDepth = (model) => model.startsWith("gpt-5.");
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
  const hasVisiblePanel = [activityPanel, sitePermissionPanel, jobMonitor, controlMonitor]
    .some((panel) => !panel.hidden);
  contextDock.hidden = !hasVisiblePanel;
  contextToggleButton.textContent = contextDockExpanded ? "Hide Status" : "Status";
  contextToggleButton.setAttribute("aria-expanded", contextDockExpanded ? "true" : "false");
  scrollTranscriptToBottom();
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

const setTurnBusy = (busy) => {
  turnBusy = busy;
  commandInput.disabled = busy;
  commandForm.querySelector(".send-button").disabled = busy;
};

const renderControlMonitor = () => {
  monitorRenderers.renderControlMonitor();
};

const updateConnectionLine = () => {
  const model = MODEL_LABELS[modelSelect.value] ?? modelSelect.value;
  thinkingDepthSelect.hidden = !supportsThinkingDepth(modelSelect.value);
  connectionLine.textContent = `Connected to ${model} · ${statusLabel}`;
};

const renderChatHistory = () => {
  chatHistory.replaceChildren();
  chatSessionStore.getSessions().forEach((session) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = session.title || "New chat";
    button.title = session.title || "New chat";
    button.dataset.sessionId = session.id;
    if (session.id === chatSessionStore.getActiveSessionId()) {
      button.setAttribute("aria-current", "true");
    }
    button.addEventListener("click", async () => {
      if (session.id === chatSessionStore.getActiveSessionId()) return;
      await chatSessionStore.switchSession(session.id);
      lastSnapshot = null;
      currentControlRun = null;
      pendingApproval = null;
      renderMessages();
      renderAttachments();
      renderChatHistory();
      renderControlMonitor();
      setStatus("Ready");
    });
    item.append(button);
    chatHistory.append(item);
  });
};

const setContextMeter = (snapshot) => {
  const textLength = snapshot?.text?.length ?? 0;
  const roughPercent = Math.min(99, Math.max(0, Math.round(textLength / 900)));
  contextMeter.textContent = `${roughPercent}%`;
};

const sitePermissionStore = createSitePermissionStore({
  storage: chrome.storage?.local,
  sitePermissionStorageKey: STORAGE_KEYS.sitePermissions
});
const permissionForUrl = sitePermissionStore.permissionForUrl;
const setSitePermission = sitePermissionStore.setSitePermission;
const siteKeyForUrl = sitePermissionStore.siteKeyForUrl;

const renderSitePermissionPanel = async (tab = null) => {
  await monitorRenderers.renderSitePermissionPanel(tab);
};

const renderJobMonitor = () => {
  monitorRenderers.renderJobMonitor();
};

const loadBrowserJobs = async () => {
  await browserJobStore.hydrate();
  renderJobMonitor();
};

const createBrowserJob = async ({ goal, planner = "observe-act-verify-loop", summary = "" }) => {
  const job = await browserJobStore.createJob({
    goal,
    planner,
    summary
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
    renderChatHistory();
  },
  onEditMessage: (id) => messageActions.editMessage(id),
  onForkMessage: async (id) => {
    await messageActions.forkFromMessage(id);
    renderChatHistory();
  },
  onRegenerateMessage: async (id) => {
    await messageActions.regenerateFromMessage(id);
    renderChatHistory();
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
  renderChatHistory();
  return message;
};

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
  openBrowserUrl,
  readActivePage,
  refreshTabContext,
  scrollActivePage,
  searchBrowser,
  sendContentAction,
  setPageControlOverlay,
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
  },
  getBrowserJobs: () => browserJobStore.getJobs(),
  getContextDockExpanded: () => contextDockExpanded,
  getCurrentControlRun: () => currentControlRun,
  getJobMonitorCollapsed: () => browserJobStore.getMonitorCollapsed(),
  getPendingApproval: () => pendingApproval,
  isReadableBrowserTab,
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

const saveIntake = async () => {
  const response = lastSnapshot ? { ok: true, snapshot: lastSnapshot } : await readActivePage({ announce: false });
  if (!response?.snapshot) {
    await addMessage("system", "There is no browser context to prepare for intake yet.");
    return;
  }
  setActivity("tool-running", "Preparing archive intake", response.snapshot.title || response.snapshot.url);
  await addMessage(
    "system",
    "Prepared this page as a Living Archive intake artifact. It remains raw/intake data only; trusted memory promotion must happen through the governed archive ingest path."
  );
  setStatus("Intake ready");
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
  updateBrowserJob,
  updateControlRunArtifacts,
  updateControlStep
});

const continueControlLoop = agentControlRunner.continueControlLoop;
const runControlCommand = agentControlRunner.runControlCommand;

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

const trustCurrentSiteForSafeActions = async () => {
  if (!pendingApproval || !currentControlRun) return;
  const approval = pendingApproval;
  const boundary = approvalBoundaryForStep(approval.step, approval.reason);
  const tab = await activeTab();
  const result = await setSitePermission(tab?.url, "trusted-for-safe-actions");
  await renderSitePermissionPanel(tab);
  if (boundary !== "safe") {
    await addMessage(
      "system",
      `Set ${result.key} to trusted safe actions. The current blocked step still needs explicit once-only review because it is ${boundary}.`
    );
    renderControlMonitor();
    return;
  }
  await addMessage("system", `Set ${result.key} to trusted safe actions and approved this safe step once: ${controlStepLabel(approval.step)}`);
  await approvePendingControlStep();
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
  setStatus
});

const runChatTurn = chatTurnController.runChatTurn;

const {
  cancelBrowserJob,
  pauseBrowserJob,
  resumeBrowserJob,
  runCapabilitiesCommand,
  runDelegateCommand,
  runGoalCommand,
  runHistorySearchCommand,
  runJobsCommand,
  runMemorySearchCommand,
  runSitePermissionCommand,
  runStatusCommand
} = createAppCommandHandlers({
  activeTab,
  addMessage,
  bridgeRequest,
  browserJobStore,
  chrome,
  finishControlRun,
  getCurrentControlRun: () => currentControlRun,
  permissionForUrl,
  renderJobMonitor,
  renderSitePermissionPanel,
  setActivity,
  setSitePermission,
  setStatus,
  siteKeyForUrl,
  updateBrowserJob
});

const commandRouter = createSidePanelCommandRouter({
  bindMentionedTab,
  clickActivePageText,
  detectActivePageForms,
  explainStructuredPageEditBoundary,
  handleWalletBoundary,
  openBrowserUrl,
  pauseBrowserJob,
  resumeBrowserJob,
  cancelBrowserJob,
  runBrowserCommand,
  runCapabilitiesCommand,
  runChatTurn,
  runControlCommand,
  runDelegateCommand,
  runGoalCommand,
  runHistorySearchCommand,
  runJobsCommand,
  runMemorySearchCommand,
  runSitePermissionCommand,
  runStatusCommand,
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
  await chatSessionStore.hydrate();
  renderMessages();
  renderAttachments();
  renderChatHistory();
  updateConnectionLine();
};

const consumePendingSidebarPrompt = async () => {
  const payload = await chrome.storage?.local?.get?.(STORAGE_KEYS.pendingSidebarPrompt).catch(() => ({}));
  const pending = payload?.[STORAGE_KEYS.pendingSidebarPrompt];
  const rawPrompt = String(pending?.prompt ?? "").trim();
  // Strip control characters and Unicode tricks before submission
  const prompt = rawPrompt.normalize("NFKC").replace(/[\x00-\x1f\x7f\u200B-\u200F\u2028-\u202F\uFEFF]/g, "").trim();
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

newChatButton.addEventListener("click", async () => {
  await chatSessionStore.createSession();
  lastSnapshot = null;
  currentControlRun = null;
  pendingApproval = null;
  contextDockExpanded = false;
  commandInput.value = "";
  composerController.resetUndoStack("");
  renderMessages();
  renderAttachments();
  renderChatHistory();
  renderControlMonitor();
  clearActivity();
  setStatus("Ready");
  commandInput.focus();
});
transcript.addEventListener("resonantos:use-prompt", (event) => {
  commandInput.value = event.detail?.prompt ?? "";
  commandInput.dispatchEvent(new Event("input", { bubbles: true }));
  commandInput.focus();
});
attachFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => void messageActions.attachFiles(fileInput.files));
readButton.addEventListener("click", () => void readActivePage());
saveIntakeButton.addEventListener("click", () => void saveIntake());
contextToggleButton.addEventListener("click", () => {
  contextDockExpanded = !contextDockExpanded;
  void renderSitePermissionPanel();
  renderJobMonitor();
});
approvalApproveButton.addEventListener("click", () => void approvePendingControlStep());
approvalTrustSiteButton.addEventListener("click", () => void trustCurrentSiteForSafeActions());
approvalDenyButton.addEventListener("click", () => void denyPendingControlStep());
approvalDelegateButton.addEventListener("click", () => void delegateControlIssue());
jobMonitorToggle.addEventListener("click", async () => {
  await browserJobStore.toggleMonitorCollapsed();
  renderJobMonitor();
});
sitePermissionMode.addEventListener("change", async () => {
  const tab = await activeTab();
  const result = await setSitePermission(tab?.url, sitePermissionMode.value);
  await renderSitePermissionPanel(tab);
  setStatus(`Site permission: ${result.mode}`);
  setActivity("completed", "Site permission updated", `${result.key} · ${result.mode}`);
  clearActivitySoon(1600);
});
tabContextController.bindBrowserListeners();
modelSelect.addEventListener("change", () => void persistChatState().then(updateConnectionLine));
thinkingDepthSelect.addEventListener("change", () => void persistChatState());
dictateButton.addEventListener("click", () => {
  void addMessage("system", "Audio dictate is not available in this browser runtime yet.");
});

composerController.bind();

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

// === Welcome card (first-run onboarding) ===
const welcomeCard = document.createElement("div");
welcomeCard.className = "welcome-card";
welcomeCard.innerHTML = `
  <div class="welcome-icon">◈</div>
  <h2 class="welcome-title">Welcome to ResonantOS</h2>
  <p class="welcome-text">Augmentor is your AI copilot. It can read pages, control your browser, and answer questions about anything you're looking at.</p>
  <p class="welcome-text">You're connected to ResonantOS Alpha. Just type a message below to start.</p>
  <p class="welcome-hint">Try: "What can you do?" or visit any webpage and ask about it.</p>
`;

hydrateChatSettings().then(async () => {
  await loadBrowserJobs();
  await tabContextController.hydrateInitialContext();
  await consumePendingSidebarPrompt();
  // Show welcome card if no existing messages
  if (chatSessionStore.getMessages().length === 0 && transcript) {
    transcript.prepend(welcomeCard);
    const welcomeBtn = document.getElementById("welcome-open-settings");
    if (welcomeBtn && settingsToggleBtn) {
      welcomeBtn.addEventListener("click", () => settingsToggleBtn.click());
    }
    commandForm.addEventListener("submit", () => { welcomeCard.remove(); }, { once: true });

    // First-run: open Blackboard with a smiley face welcome
    const bbUrl = chrome.runtime.getURL("src/blackboard.html");
    const bbTab = await chrome.tabs.create({ url: bbUrl, active: false });
    // Give blackboard a moment to load, then send the smiley
    setTimeout(() => {
      chrome.runtime.sendMessage({
        channel: "resonantos.blackboard.relay",
        payload: {
          channel: "resonantos.blackboard",
          command: "draw",
          payload: {
            shapes: [
              // Face (big circle)
              { type: "circle", x: 400, y: 250, w: 280, h: 280, color: "#14F195", width: 4 },
              // Left eye
              { type: "circle", x: 355, y: 215, w: 36, h: 36, color: "#14F195", fill: true },
              // Right eye
              { type: "circle", x: 445, y: 215, w: 36, h: 36, color: "#14F195", fill: true },
              // Smile (arc approximated with a wide ellipse bottom half)
              { type: "circle", x: 400, y: 265, w: 140, h: 80, color: "#14F195", width: 3 },
              // Welcome text label
              { type: "rect", x: 260, y: 420, w: 280, h: 0, color: "#14F195", label: "😀 Welcome to ResonantOS!" },
            ]
          }
        }
      });
    }, 1500);
  }
}).catch((error) => {
  setStatus("Context failed");
  void addMessage("system", `I could not read the active tab context: ${String(error)}`);
});

// === Settings overlay ===
if (settingsToggleBtn && settingsOverlay) {
  settingsToggleBtn.addEventListener("click", () => { settingsOverlay.hidden = false; });
}
if (settingsClose && settingsOverlay) {
  settingsClose.addEventListener("click", () => { settingsOverlay.hidden = true; });
}
if (settingsSave) {
  settingsSave.addEventListener("click", async () => {
    const openaiKey = document.getElementById("key-openai")?.value?.trim() ?? "";
    const anthropicKey = document.getElementById("key-anthropic")?.value?.trim() ?? "";
    const groqKey = document.getElementById("key-groq")?.value?.trim() ?? "";
    const deepseekKey = document.getElementById("key-deepseek")?.value?.trim() ?? "";
    const xaiKey = document.getElementById("key-xai")?.value?.trim() ?? "";
    const minimaxKey = document.getElementById("key-minimax")?.value?.trim() ?? "";
    const runpodKey = document.getElementById("key-runpod")?.value?.trim() ?? "";
    const providers = {};
    if (openaiKey) providers["shared-openai"] = openaiKey;
    if (anthropicKey) providers["shared-anthropic"] = anthropicKey;
    if (groqKey) providers["shared-groq"] = groqKey;
    if (deepseekKey) providers["shared-deepseek"] = deepseekKey;
    if (xaiKey) providers["shared-xai"] = xaiKey;
    if (minimaxKey) providers["shared-minimax"] = minimaxKey;
    if (runpodKey) providers["shared-runpod"] = runpodKey;
    try {
      await bridgeRequest("/providers/save", { method: "POST", body: { providers } });
      if (settingsStatus) { settingsStatus.textContent = "Saved ✓"; setTimeout(() => { settingsStatus.textContent = ""; }, 2000); }
    } catch (err) {
      if (settingsStatus) settingsStatus.textContent = "Error: " + (err.message || err);
    }
  });
}

// === Theme toggle ===
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggle) themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
  if (themeToggleSettings) themeToggleSettings.textContent = theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
}
const savedTheme = localStorage.getItem("resonantos-theme") || "dark";
applyTheme(savedTheme);
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("resonantos-theme", next);
    applyTheme(next);
  });
}
if (themeToggleSettings) {
  themeToggleSettings.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("resonantos-theme", next);
    applyTheme(next);
  });
}

// === Protocol Store full tab ===
let storeTabId = null;
const openProtocolStore = async () => {
  if (storeTabId) {
    const alive = await chrome.tabs.get(storeTabId).catch(() => null);
    if (alive) { await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined); return; }
    storeTabId = null;
  }
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url?.includes("protocol-store.html"));
  if (existing) { storeTabId = existing.id; await chrome.tabs.update(storeTabId, { active: true }).catch(() => undefined); return; }
  const storeUrl = chrome.runtime.getURL("src/protocol-store.html");
  const tab = await chrome.tabs.create({ url: storeUrl });
  storeTabId = tab.id ?? null;
};
if (openStoreBtn) openStoreBtn.addEventListener("click", () => void openProtocolStore());

// === Sidecar tab openers ===
const makeSidecarOpener = (filename) => {
  let tabId = null;
  return async () => {
    if (tabId) {
      const alive = await chrome.tabs.get(tabId).catch(() => null);
      if (alive) { await chrome.tabs.update(tabId, { active: true }).catch(() => undefined); return; }
      tabId = null;
    }
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(t => t.url?.includes(filename));
    if (existing) { tabId = existing.id; await chrome.tabs.update(tabId, { active: true }).catch(() => undefined); return; }
    const url = chrome.runtime.getURL(`src/${filename}`);
    const tab = await chrome.tabs.create({ url });
    tabId = tab.id ?? null;
  };
};

const openShieldTab = makeSidecarOpener("shield-tab.html");
const openArchiveTab = makeSidecarOpener("archive-tab.html");
const openAwarenessTab = makeSidecarOpener("awareness-tab.html");

if (openShieldBtn) openShieldBtn.addEventListener("click", () => void openShieldTab());
if (openArchiveBtn) openArchiveBtn.addEventListener("click", () => void openArchiveTab());
if (openAwarenessBtn) openAwarenessBtn.addEventListener("click", () => void openAwarenessTab());

// === Copy mobile URL ===
if (copyMobileUrl) {
  copyMobileUrl.addEventListener("click", () => {
    navigator.clipboard.writeText("https://resonantclaw.com").catch(() => {});
    copyMobileUrl.textContent = "Copied!";
    setTimeout(() => { copyMobileUrl.textContent = "Copy URL"; }, 1500);
  });
}

// === Pop Out — launch as desktop window or browser popup ===
const popoutBtn = document.getElementById("popout-btn");
if (popoutBtn) {
  popoutBtn.addEventListener("click", async () => {
    // If inside Electron, use IPC to open a new window
    if (window.resonantOS?.openPopout) {
      window.resonantOS.openPopout();
      return;
    }
    // Browser fallback: open main workspace as a popup window (PWA-style)
    const extUrl = chrome.runtime.getURL("src/main-workspace.html");
    window.open(extUrl, "ResonantOS", "width=1400,height=900,menubar=no,toolbar=no,location=no,status=no");
  });
}
