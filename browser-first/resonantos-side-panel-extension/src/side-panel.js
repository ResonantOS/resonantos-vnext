import {
  approvalBoundaryForStep,
  sanitizeNextActionDecision,
  sanitizePlannerPlan,
} from "./lib/approval-policy.js";
import {
  controlStepLabel,
  dedupeControlSteps,
  deterministicNextAction,
  planControlSteps
} from "./lib/agent-control-planner.js";
import { createAgentControlRunner } from "./lib/agent-control-runner.js";
import { createAppCommandHandlers } from "./lib/app-command-handlers.js";
import { normalizeBrowserUrl, normalizeSearchQuery, parseQuotedText } from "./lib/browser-command-parser.js";
import { createBrowserJobStore } from "./lib/browser-job-store.js";
import { createBrowserPageActions } from "./lib/browser-page-actions.js";
import { createBridgeClient } from "./lib/bridge-client.js";
import { createChatSessionStore } from "./lib/chat-session-store.js";
import { createMonitorRenderers } from "./lib/monitor-renderers.js";
import { createSidePanelCommandRouter } from "./lib/side-panel-command-router.js";
import { createSidePanelRenderers } from "./lib/side-panel-renderers.js";

const readButton = document.querySelector("#read-page");
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

const bridgeRequest = createBridgeClient();
const STORAGE_KEYS = {
  messages: "augmentorBrowserMessages",
  forks: "augmentorBrowserForks",
  model: "augmentorModel",
  thinkingDepth: "augmentorThinkingDepth",
  attachments: "augmentorBrowserAttachments",
  sitePermissions: "augmentorSitePermissions",
  browserJobs: "augmentorBrowserJobs",
  jobMonitorCollapsed: "augmentorJobMonitorCollapsed"
};
const MAX_HISTORY_MESSAGES = 16;

let lastSnapshot = null;
let statusLabel = "Ready";
let turnBusy = false;
let activityTimer = null;
let currentControlRun = null;
let pendingApproval = null;
let controlledTabId = null;
let contextDockExpanded = false;
let composerUndoStack = [""];
let composerUndoApplying = false;
let monitorRenderers = null;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const resetComposerUndoStack = (value = commandInput.value) => {
  composerUndoStack = [String(value ?? "")];
};

const pushComposerUndoSnapshot = (value = commandInput.value) => {
  if (composerUndoApplying) return;
  const snapshot = String(value ?? "");
  if (composerUndoStack.at(-1) === snapshot) return;
  composerUndoStack = [...composerUndoStack, snapshot].slice(-80);
};

const undoComposerInput = () => {
  const current = commandInput.value;
  if (composerUndoStack.at(-1) !== current) {
    pushComposerUndoSnapshot(current);
  }
  if (composerUndoStack.length <= 1) return;
  composerUndoStack = composerUndoStack.slice(0, -1);
  const previous = composerUndoStack.at(-1) ?? "";
  composerUndoApplying = true;
  commandInput.value = previous;
  commandInput.setSelectionRange(previous.length, previous.length);
  commandInput.dispatchEvent(new Event("input", { bubbles: true }));
  composerUndoApplying = false;
};

const composerSelection = () => ({
  start: commandInput.selectionStart ?? commandInput.value.length,
  end: commandInput.selectionEnd ?? commandInput.value.length
});

const replaceComposerSelection = (text) => {
  pushComposerUndoSnapshot();
  const { start, end } = composerSelection();
  commandInput.setRangeText(String(text ?? ""), start, end, "end");
  commandInput.dispatchEvent(new Event("input", { bubbles: true }));
};

const writeClipboardText = async (text) => {
  const value = String(text ?? "");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return false;
};

const readClipboardText = async () => {
  if (!navigator.clipboard?.readText) return "";
  return navigator.clipboard.readText();
};

const handleComposerClipboardShortcut = async (event) => {
  const shortcutKey = event.key.toLowerCase();
  if (!(event.metaKey || event.ctrlKey) || event.altKey || !["x", "c", "v"].includes(shortcutKey)) {
    return false;
  }
  event.preventDefault();
  const { start, end } = composerSelection();
  const selectedText = commandInput.value.slice(start, end);
  if (shortcutKey === "c") {
    await writeClipboardText(selectedText || commandInput.value).catch(() => undefined);
    return true;
  }
  if (shortcutKey === "x") {
    await writeClipboardText(selectedText || commandInput.value).catch(() => undefined);
    if (selectedText) {
      replaceComposerSelection("");
    } else {
      pushComposerUndoSnapshot();
      commandInput.value = "";
      commandInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
  }
  const pastedText = await readClipboardText().catch(() => "");
  if (pastedText) {
    replaceComposerSelection(pastedText);
  }
  return true;
};

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

const startControlRun = ({ goal, plan }) => {
  currentControlRun = {
    id: browserJobStore.getActiveJobId() ?? `control-${Date.now()}`,
    goal,
    planner: plan.source,
    summary: plan.summary,
    status: "running",
    steps: plan.steps.map((step) => ({ ...step, state: "pending" })),
    artifacts: [],
    startedAt: new Date().toISOString(),
    completedAt: null
  };
  pendingApproval = null;
  renderControlMonitor();
  void setPageControlOverlay(true, `Augmentor operating: ${goal}`);
};

const updateControlStep = (index, state, note = "") => {
  if (!currentControlRun?.steps[index]) return;
  currentControlRun.steps[index] = { ...currentControlRun.steps[index], state, note };
  renderControlMonitor();
};

const appendControlStep = (step) => {
  if (!currentControlRun) return -1;
  const index = currentControlRun.steps.length;
  currentControlRun.steps = [...currentControlRun.steps, { ...step, state: "pending" }];
  renderControlMonitor();
  return index;
};

const finishControlRun = (status, artifact = null) => {
  if (!currentControlRun) return;
  currentControlRun = {
    ...currentControlRun,
    status,
    completedAt: new Date().toISOString(),
    artifacts: artifact ? [...currentControlRun.artifacts, artifact] : currentControlRun.artifacts
  };
  renderControlMonitor();
  void setPageControlOverlay(false, "");
  void updateBrowserJob(currentControlRun.id, {
    status,
    artifacts: currentControlRun.artifacts,
    summary: currentControlRun.summary,
    planner: currentControlRun.planner
  });
};

const updateConnectionLine = () => {
  const model = MODEL_LABELS[modelSelect.value] ?? modelSelect.value;
  thinkingDepthSelect.hidden = !supportsThinkingDepth(modelSelect.value);
  connectionLine.textContent = `Connected to ${model} · ${statusLabel}`;
};

const setContextMeter = (snapshot) => {
  const textLength = snapshot?.text?.length ?? 0;
  const roughPercent = Math.min(99, Math.max(0, Math.round(textLength / 900)));
  contextMeter.textContent = `${roughPercent}%`;
};

const siteKeyForUrl = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const sitePermissions = async () => {
  const result = await chrome.storage?.local?.get?.(STORAGE_KEYS.sitePermissions).catch(() => ({}));
  return result?.[STORAGE_KEYS.sitePermissions] ?? {};
};

const permissionForUrl = async (url) => {
  const key = siteKeyForUrl(url);
  if (!key) return "ask-before-action";
  return (await sitePermissions())[key] ?? "ask-before-action";
};

const setSitePermission = async (url, mode) => {
  const key = siteKeyForUrl(url);
  if (!key) throw new Error("No site is active.");
  const permissions = await sitePermissions();
  permissions[key] = mode;
  await chrome.storage?.local?.set?.({ [STORAGE_KEYS.sitePermissions]: permissions });
  return { key, mode };
};

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

const clearAttachments = async () => {
  await chatSessionStore.clearAttachments();
  renderAttachments();
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
  onCopyMessage: (id) => copyMessage(id),
  onDeleteMessage: (id) => deleteMessage(id),
  onEditMessage: (id) => editMessage(id),
  onForkMessage: (id) => forkFromMessage(id),
  onRegenerateMessage: (id) => regenerateFromMessage(id),
  onSaveMessageToArchive: (id) => saveMessageToArchive(id),
  onShowMessageStats: (id) => showMessageStats(id),
  scrollTranscriptToBottom,
  window
});

const addMessage = async (role, content, { persist = true, usage = null } = {}) => {
  const message = await chatSessionStore.addMessage(role, content, { persist, usage });
  if (!message) return null;
  renderMessages();
  return message;
};

const copyMessage = async (id) => {
  const message = chatSessionStore.findMessage(id);
  if (!message) return;
  await navigator.clipboard?.writeText?.(message.content).catch(() => undefined);
  flashCopied(id);
  setStatus("Copied");
};

const forkFromMessage = async (id) => {
  const fork = await chatSessionStore.forkFromMessage(id);
  if (!fork) return;
  renderMessages();
  setStatus("Forked");
};

const deleteMessage = async (id) => {
  await chatSessionStore.deleteMessage(id);
  renderMessages();
  setStatus("Deleted");
};

const editMessage = (id) => {
  const message = chatSessionStore.findMessage(id);
  if (!message || message.role !== "user") return;
  commandInput.value = message.content;
  resetComposerUndoStack(message.content);
  commandInput.focus();
  setStatus("Editing");
};

const saveMessageToArchive = async (id) => {
  const message = chatSessionStore.findMessage(id);
  if (!message) return;
  setStatus("Saving");
  try {
    const result = await bridgeRequest("/archive/intake", {
      method: "POST",
      body: {
        title: `Augmentor message ${new Date(message.createdAt).toLocaleString()}`,
        content: message.content,
        sourceMessageId: message.id,
        url: lastSnapshot?.url ?? null
      }
    });
    await addMessage("system", `Saved to Living Archive intake: ${result.path}`);
    setStatus("Ready");
  } catch (error) {
    setStatus("Archive failed");
    await addMessage("system", error instanceof Error ? error.message : String(error));
  }
};

const showMessageStats = async (id) => {
  const message = chatSessionStore.findMessage(id);
  if (!message?.usage) {
    await addMessage("system", "No generation telemetry is available for this message.");
    return;
  }
  await addMessage("system", `Generation stats:\n${JSON.stringify(message.usage, null, 2)}`);
};

const regenerateFromMessage = async (id) => {
  const userMessage = await chatSessionStore.trimToPreviousUserMessage(id);
  if (!userMessage) {
    await addMessage("system", "No previous user message is available for regeneration.");
    return;
  }
  renderMessages();
  await respondToCommand(userMessage.content);
};

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

const resolveTabMention = async (message) => {
  const match = /@([a-z0-9][a-z0-9 .:_-]{0,80})/i.exec(String(message ?? ""));
  if (!match) return null;
  const raw = match[1].trim().replace(/[.,;!?]+$/g, "");
  const tabs = (await chrome.tabs.query({}).catch(() => [])).filter(isReadableBrowserTab);
  if (/^tab\s+\d+$/i.test(raw)) {
    const index = Number(/\d+/.exec(raw)?.[0] ?? "0") - 1;
    return tabs[index] ?? null;
  }
  const needle = raw.toLowerCase();
  return tabs.find((tab) =>
    String(tab.title ?? "").toLowerCase().includes(needle) ||
    String(tab.url ?? "").toLowerCase().includes(needle)
  ) ?? null;
};

const bindMentionedTab = async (message) => {
  const tab = await resolveTabMention(message);
  if (!tab?.id) return null;
  controlledTabId = tab.id;
  await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined);
  lastSnapshot = null;
  setContextMeter(null);
  await renderSitePermissionPanel(tab);
  await addMessage("system", `Using @tab context: ${tab.title || tab.url}`);
  return tab;
};

const attachFiles = async (fileList) => {
  const files = Array.from(fileList ?? []);
  if (!files.length) return;
  const nextAttachments = [];
  for (const [index, file] of files.entries()) {
    const textLike = /^(text\/|application\/(json|xml|javascript|typescript))/i.test(file.type) || /\.(md|txt|json|csv|ts|tsx|js|jsx|css|html|xml|yaml|yml)$/i.test(file.name);
    let content = "";
    if (textLike && file.size <= 64 * 1024) {
      content = (await file.text()).slice(0, 12000);
    }
    nextAttachments.push({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      type: file.type,
      summary: `${Math.round(file.size / 1024)} KB${content ? " · embedded text" : " · metadata only"}`,
      content
    });
  }
  await chatSessionStore.addAttachments(nextAttachments);
  fileInput.value = "";
  renderAttachments();
  setStatus("Attached");
};

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

const pageContextForBridge = () => {
  if (!lastSnapshot) return null;
  const text = String(lastSnapshot.text ?? "").slice(0, 7000);
  return [
    `Title: ${lastSnapshot.title || "Untitled"}`,
    `URL: ${lastSnapshot.url || "unknown"}`,
    text ? `Visible text:\n${text}` : ""
  ].filter(Boolean).join("\n\n");
};

const bridgeChat = async () => {
  const attachments = chatSessionStore.getAttachments();
  return bridgeRequest("/augmentor/chat", {
    method: "POST",
    body: {
      model: modelSelect.value,
      thinkingDepth: thinkingDepthSelect.value,
      pageContext: pageContextForBridge(),
      runtimeContext: attachments.length ? `Composer attachments:\n${attachments.map((item) => `- ${item.name}: ${item.content ?? item.summary}`).join("\n")}` : null,
      messages: chatSessionStore.getMessages()
        .filter((message) => ["user", "assistant"].includes(message.role))
        .slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({ role: message.role, content: message.content }))
    }
  });
};

const requestControlPlan = async (goal, snapshot) => {
  if (typeof globalThis.__resonantosControlPlannerOverride === "function") {
    return sanitizePlannerPlan(await globalThis.__resonantosControlPlannerOverride({ goal, snapshot }), { dedupeControlSteps });
  }
  const result = await bridgeRequest("/augmentor/control-plan", {
    method: "POST",
    body: {
      goal,
      model: modelSelect.value,
      thinkingDepth: thinkingDepthSelect.value,
      pageSnapshot: snapshot ?? null
    }
  });
  return sanitizePlannerPlan({
    source: "llm",
    ...result.plan
  }, { dedupeControlSteps });
};

const requestNextControlAction = async ({ goal, snapshot, history }) => {
  if (typeof globalThis.__resonantosNextActionOverride === "function") {
    try {
      return sanitizeNextActionDecision(await globalThis.__resonantosNextActionOverride({ goal, snapshot, history }));
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
        model: modelSelect.value,
        thinkingDepth: thinkingDepthSelect.value,
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
  const snapshot = snapshotResponse?.snapshot ?? lastSnapshot;
  try {
    const plan = await requestControlPlan(goal, snapshot);
    return plan;
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

const executeControlStep = async (step) => {
  if (step.type === "inspect" || step.type === "read") {
    return summarizeSnapshot();
  }
  if (step.type === "tabs") {
    const tabs = await chrome.tabs.query({}).catch(() => []);
    const readableTabs = tabs.filter(isReadableBrowserTab).map((tab) => ({
      id: tab.id,
      title: tab.title || "",
      url: tab.url || "",
      active: Boolean(tab.active),
      controlled: tab.id === controlledTabId
    }));
    await addMessage(
      "system",
      readableTabs.length
        ? `Open browser tabs:\n${readableTabs.map((tab) => `- ${tab.id}${tab.controlled ? " [controlled]" : tab.active ? " [active]" : ""}: ${tab.title || tab.url}`).join("\n")}`
        : "No readable browser tabs are open."
    );
    return { ok: true, tabs: readableTabs };
  }
  if (step.type === "switch_tab") {
    const tab = await chrome.tabs.get(step.tabId).catch(() => null);
    if (!isReadableBrowserTab(tab)) {
      return { ok: false, error: `Tab ${step.tabId} is not a readable web page.` };
    }
    controlledTabId = tab.id;
    await chrome.tabs.update(tab.id, { active: true });
    lastSnapshot = null;
    setContextMeter(null);
    await addMessage("system", `Switched controlled tab to ${tab.title || tab.url}.`);
    return { ok: true, tabId: tab.id, title: tab.title || "", url: tab.url || "" };
  }
  if (step.type === "open") {
    const result = await openBrowserUrl(step.target);
    await sleep(1200);
    return result;
  }
  if (step.type === "search") {
    const result = await searchBrowser({ query: step.query, action: step.action });
    await sleep(1200);
    return result;
  }
  if (step.type === "forms") {
    return detectActivePageForms();
  }
  if (step.type === "click") {
    const result = await clickActivePageText({ text: step.text, ref: step.ref, userApproved: step.userApproved });
    await sleep(500);
    return result;
  }
  if (step.type === "type") {
    const result = await typeIntoActivePage({ text: step.text, field: step.field, ref: step.ref, submit: step.submit, userApproved: step.userApproved });
    await sleep(500);
    return result;
  }
  if (step.type === "scroll") {
    return scrollActivePage({ direction: step.direction });
  }
  if (step.type === "wait") {
    setActivity("tool-running", "Waiting for page state", `${step.ms ?? 1000}ms`);
    await sleep(step.ms ?? 1000);
    return { ok: true, waitedMs: step.ms ?? 1000 };
  }
  return { ok: false, error: `Unknown control step: ${step.type}` };
};

const buildControlReport = (results, status) => {
  if (!currentControlRun) return "";
  return [
    `# Browser Agent Control Report`,
    "",
    `- id: ${currentControlRun.id}`,
    `- status: ${status}`,
    `- planner: ${currentControlRun.planner}`,
    `- startedAt: ${currentControlRun.startedAt}`,
    `- completedAt: ${new Date().toISOString()}`,
    `- page: ${lastSnapshot?.title ?? "unknown"} (${lastSnapshot?.url ?? "unknown"})`,
    "",
    "## Goal",
    currentControlRun.goal,
    "",
    "## Plan",
    currentControlRun.summary,
    "",
    "## Steps",
    ...results.map(({ step, result }, index) => `${index + 1}. ${controlStepLabel(step)} — ${result?.ok ? "ok" : result?.approvalRequired ? "approval-required" : "failed"}${result?.error ? ` — ${result.error}` : ""}`),
    "",
    "## Boundary",
    "This is an intake artifact only. Wallet, credential, public-submit, payment, and destructive actions require explicit human approval.",
    ""
  ].join("\n");
};

const saveControlReportToArchive = async (results, status) => {
  const content = buildControlReport(results, status);
  if (!content) return null;
  return bridgeRequest("/archive/intake", {
    method: "POST",
    body: {
      title: `Browser control ${status}: ${currentControlRun?.goal ?? "task"}`.slice(0, 160),
      content,
      url: lastSnapshot?.url ?? null,
      sourceMessageId: currentControlRun?.id ?? null
    }
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
};

const delegateControlIssue = async () => {
  if (!pendingApproval && !currentControlRun) return;
  const step = pendingApproval?.step;
  const result = await bridgeRequest("/addons/delegate", {
    method: "POST",
    body: {
      target: "engineer",
      mission: [
        "Investigate blocked browser-control task.",
        `Goal: ${currentControlRun?.goal ?? "unknown"}`,
        step ? `Blocked step: ${controlStepLabel(step)}` : "",
        pendingApproval?.reason ? `Reason: ${pendingApproval.reason}` : ""
      ].filter(Boolean).join("\n")
    }
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  await addMessage(
    "system",
    result.error ? `Delegation failed: ${result.error}` : `Delegated blocked control task to ${result.target}: ${result.id}`
  );
};

const observeControlPage = async () => {
  const job = browserJobStore.currentJob();
  if (job?.status === "cancelled") {
    throw new Error("Browser job was cancelled.");
  }
  if (job?.status === "paused") {
    throw new Error("Browser job is paused.");
  }
  setActivity("reading", "Observing active page", currentControlRun?.goal ?? "browser task");
  const snapshotResponse = await readActivePage({ announce: false }).catch(() => null);
  const snapshot = snapshotResponse?.snapshot ?? lastSnapshot;
  if (!snapshot) return null;
  const tabs = await chrome.tabs.query({}).catch(() => []);
  return {
    ...snapshot,
    tabs: tabs
      .filter(isReadableBrowserTab)
      .slice(0, 30)
      .map((tab) => ({
        id: tab.id,
        title: tab.title || "",
        url: tab.url || "",
        active: Boolean(tab.active),
        controlled: tab.id === controlledTabId
      }))
  };
};

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
  setPendingApproval: (approval) => {
    pendingApproval = approval;
  },
  setStatus,
  sleep,
  startControlRun,
  updateBrowserJob,
  updateControlRunArtifacts: (artifacts) => {
    if (currentControlRun) {
      currentControlRun = { ...currentControlRun, artifacts };
    }
  },
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

const runChatTurn = async () => {
  setStatus("Thinking");
  setActivity("thinking", "Thinking", "Calling the selected model route");
  try {
    const result = await bridgeChat();
    setStatus("Writing");
    setActivity("writing", "Writing response", result.model || modelSelect.value);
    await addMessage("assistant", result.reply, { usage: result.usage ?? { providerId: result.providerId, model: result.model } });
    await clearAttachments();
    setStatus("Ready");
  } catch (error) {
    setStatus("Provider failed");
    await addMessage("system", error instanceof Error ? error.message : String(error));
  } finally {
    clearActivitySoon();
  }
};

const handleWalletBoundary = async () => {
  await addMessage("system", "Wallet actions are human-approval gated. I can discuss Phantom and browser context, but wallet connect, signing, seed phrases, private keys, and credential actions stay human-only.");
  setStatus("Approval gated");
};

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

const hydrateChatSettings = async () => {
  await chatSessionStore.hydrate();
  renderMessages();
  renderAttachments();
  updateConnectionLine();
};

const consumeInlineDraft = async (draft) => {
  if (!draft?.selection) return;
  await addMessage(
    "system",
    [
      "Inline Assistant context received.",
      draft.title ? `Page: ${draft.title}` : "",
      draft.url ? `URL: ${draft.url}` : "",
      "",
      String(draft.selection).slice(0, 4000)
    ].filter(Boolean).join("\n")
  );
  await chrome.storage?.local?.remove?.("augmentorInlineDraft").catch(() => undefined);
};

attachFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => void attachFiles(fileInput.files));
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
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.augmentorInlineDraft?.newValue) {
    void consumeInlineDraft(changes.augmentorInlineDraft.newValue);
  }
  if (area === "local" && changes[STORAGE_KEYS.sitePermissions]) {
    void renderSitePermissionPanel();
  }
});
chrome.tabs?.onActivated?.addListener(() => void refreshTabContext());
chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && (!controlledTabId || controlledTabId === tabId)) {
    void refreshTabContext();
  }
});
modelSelect.addEventListener("change", () => void persistChatState().then(updateConnectionLine));
thinkingDepthSelect.addEventListener("change", () => void persistChatState());
dictateButton.addEventListener("click", () => {
  void addMessage("system", "Audio dictate is not available in this browser runtime yet.");
});

commandInput.addEventListener("keydown", (event) => {
  if (event.isComposing) {
    return;
  }
  const shortcutKey = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && !event.altKey && shortcutKey === "z") {
    event.preventDefault();
    undoComposerInput();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && !event.altKey && ["x", "c", "v"].includes(shortcutKey)) {
    void handleComposerClipboardShortcut(event);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && !event.altKey && shortcutKey === "a") {
    event.preventDefault();
    commandInput.select();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    commandForm.requestSubmit();
  }
});

commandInput.addEventListener("input", () => {
  pushComposerUndoSnapshot();
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
    resetComposerUndoStack("");
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
  await refreshTabContext();
  const draft = await chrome.storage?.local?.get?.("augmentorInlineDraft").catch(() => ({}));
  await consumeInlineDraft(draft?.augmentorInlineDraft);
}).catch((error) => {
  setStatus("Context failed");
  void addMessage("system", `I could not read the active tab context: ${String(error)}`);
});
