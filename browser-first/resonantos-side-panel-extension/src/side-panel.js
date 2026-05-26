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
import {
  normalizeBrowserUrl,
  normalizeSearchQuery,
  parseAutonomousBrowserActionIntent,
  parseClickIntent,
  parseControlIntent,
  parseFormsIntent,
  parseNaturalBrowserIntent,
  parseNaturalSearchIntent,
  parseQuotedText,
  parseReadPageIntent,
  parseScrollIntent,
  parseStructuredPageEditIntent,
  parseTypeIntent
} from "./lib/browser-command-parser.js";
import { createBrowserPageActions } from "./lib/browser-page-actions.js";
import { createBridgeClient } from "./lib/bridge-client.js";
import { createChatSessionStore } from "./lib/chat-session-store.js";
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
const MAX_BROWSER_JOBS = 40;

let lastSnapshot = null;
let statusLabel = "Ready";
let turnBusy = false;
let activityTimer = null;
let currentControlRun = null;
let pendingApproval = null;
let controlledTabId = null;
let browserJobs = [];
let activeJobId = null;
let jobMonitorCollapsed = true;
let contextDockExpanded = false;
let composerUndoStack = [""];
let composerUndoApplying = false;

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
    item.textContent = `${index + 1}. ${controlStepLabel(step)}${step.note ? ` — ${step.note}` : ""}`;
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
};

const startControlRun = ({ goal, plan }) => {
  currentControlRun = {
    id: activeJobId ?? `control-${Date.now()}`,
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

const sitePermissionDescription = (mode) => {
  if (mode === "blocked") return "Augmentor cannot read or operate this site.";
  if (mode === "read-only") return "Augmentor can read context but cannot click, type, or scroll.";
  if (mode === "trusted-for-safe-actions") return "Safe actions can run; wallet, login, payment, and public submit still require approval.";
  return "Augmentor asks before risky actions and blocks sensitive actions by default.";
};

const renderSitePermissionPanel = async (tab = null) => {
  const current = tab ?? await activeTab();
  if (!contextDockExpanded || !isReadableBrowserTab(current)) {
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
};

const normalizeJob = (job) => ({
  id: String(job?.id ?? `job-${Date.now()}`),
  goal: String(job?.goal ?? "Browser job").slice(0, 300),
  status: ["queued", "running", "paused", "completed", "blocked", "approval", "denied", "cancelled", "failed"].includes(job?.status)
    ? job.status
    : "queued",
  createdAt: job?.createdAt ?? new Date().toISOString(),
  updatedAt: job?.updatedAt ?? new Date().toISOString(),
  completedAt: job?.completedAt ?? null,
  planner: String(job?.planner ?? "observe-act-verify-loop").slice(0, 120),
  summary: String(job?.summary ?? "").slice(0, 700),
  artifacts: Array.isArray(job?.artifacts) ? job.artifacts.slice(0, 20) : [],
  lastError: job?.lastError ? String(job.lastError).slice(0, 700) : null
});

const persistBrowserJobs = async () => {
  const compact = browserJobs
    .map(normalizeJob)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_BROWSER_JOBS);
  browserJobs = compact;
  await chrome.storage?.local?.set?.({ [STORAGE_KEYS.browserJobs]: compact });
};

const renderJobMonitor = () => {
  jobMonitor.hidden = !contextDockExpanded || browserJobs.length === 0;
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
};

const loadBrowserJobs = async () => {
  const stored = await chrome.storage?.local?.get?.([
    STORAGE_KEYS.browserJobs,
    STORAGE_KEYS.jobMonitorCollapsed
  ]).catch(() => ({}));
  browserJobs = Array.isArray(stored?.[STORAGE_KEYS.browserJobs])
    ? stored[STORAGE_KEYS.browserJobs].map(normalizeJob)
    : [];
  jobMonitorCollapsed = true;
  renderJobMonitor();
};

const createBrowserJob = async ({ goal, planner = "observe-act-verify-loop", summary = "" }) => {
  const job = normalizeJob({
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    goal,
    planner,
    summary,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  browserJobs = [job, ...browserJobs.filter((item) => item.id !== job.id)];
  activeJobId = job.id;
  await persistBrowserJobs();
  renderJobMonitor();
  return job;
};

const updateBrowserJob = async (jobId, patch) => {
  if (!jobId) return null;
  let updated = null;
  browserJobs = browserJobs.map((job) => {
    if (job.id !== jobId) return job;
    updated = normalizeJob({
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
      completedAt: patch.completedAt ?? (["completed", "blocked", "denied", "cancelled", "failed"].includes(patch.status) ? new Date().toISOString() : job.completedAt)
    });
    return updated;
  });
  await persistBrowserJobs();
  renderJobMonitor();
  return updated;
};

const currentJob = () => browserJobs.find((job) => job.id === activeJobId) ?? null;

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

const parseSections = (body) => body.split("|").map((part) => part.trim()).filter(Boolean);

const runGoalCommand = async (body) => {
  const sections = parseSections(body);
  const mission = sections[0] ?? "";
  setActivity("tool-running", "Creating goal workspace", mission);
  const result = await bridgeRequest("/goals", {
    method: "POST",
    body: {
      mission,
      success: sections.filter((section) => /^success\s*:/i.test(section)).flatMap((section) => section.replace(/^success\s*:/i, "").split(/[,;]/).map((item) => item.trim()).filter(Boolean)),
      constraints: sections.filter((section) => /^constraints?\s*:/i.test(section)).flatMap((section) => section.replace(/^constraints?\s*:/i, "").split(/[,;]/).map((item) => item.trim()).filter(Boolean))
    }
  });
  await addMessage("system", `Goal workspace recorded: ${result.id}\n${result.mission}`);
};

const runDelegateCommand = async (body) => {
  const match = /^(engineer|hermes|opencode|open code)\b\s*([\s\S]*)$/i.exec(body.trim());
  if (!match) {
    await addMessage("system", "Use `/delegate <engineer|hermes|opencode> <mission>`.");
    return;
  }
  const target = match[1].toLowerCase().replace(/\s+/g, "");
  const mission = match[2].trim();
  setActivity("tool-running", `Creating ${target} delegation`, mission);
  const result = await bridgeRequest("/addons/delegate", {
    method: "POST",
    body: { target, mission }
  });
  await addMessage("system", `Delegation queued for ${result.target}: ${result.id}\n${result.path}`);
};

const runStatusCommand = async () => {
  setActivity("retrieving", "Checking ResonantOS status", "Providers, Living Archive, add-ons, goals");
  const result = await bridgeRequest("/status");
  const addonLines = result.addons.map((addon) => `- ${addon.name}: ${addon.available ? "available" : "missing"} · ${addon.mode}`).join("\n");
  await addMessage(
    "system",
    [
      "ResonantOS Browser status",
      `MiniMax credential: ${result.providers["shared-minimax"] ? "ready" : "missing"}`,
      `OpenAI credential: ${result.providers["shared-openai"] ? "ready" : "missing"}`,
      `Living Archive wiki pages: ${result.memory.wiki.pages}`,
      `Intake artifacts: ${result.memory.intake.artifacts}`,
      `Review requests/artifacts: ${result.memory.review.requests}/${result.memory.review.artifacts}`,
      "Add-ons:",
      addonLines,
      `Recorded goals/delegations: ${result.records.goals}/${result.records.delegations}`
    ].join("\n")
  );
};

const runSitePermissionCommand = async (body) => {
  const normalized = String(body ?? "").trim();
  const tab = await activeTab();
  if (!normalized || /^status$/i.test(normalized)) {
    const mode = tab?.url ? await permissionForUrl(tab.url) : "unknown";
    await addMessage("system", `Current site permission: ${tab?.url ? siteKeyForUrl(tab.url) : "no site"} · ${mode}`);
    return;
  }
  const mode = /\b(blocked|block)\b/i.test(normalized)
    ? "blocked"
    : /\b(read-only|readonly|read only)\b/i.test(normalized)
      ? "read-only"
      : /\b(trusted)\b/i.test(normalized)
        ? "trusted-for-safe-actions"
        : "ask-before-action";
  const result = await setSitePermission(tab?.url, mode);
  await renderSitePermissionPanel(tab);
  await addMessage("system", `Set ${result.key} Assistant permission to ${result.mode}.`);
};

const runMemorySearchCommand = async (body) => {
  const query = body.trim();
  setActivity("retrieving", "Searching Living Archive", query);
  const result = await bridgeRequest("/memory/search", {
    method: "POST",
    body: { query, limit: 5 }
  });
  await addMessage(
    "system",
    result.matches.length
      ? `Living Archive matches for "${result.query}":\n${result.matches.map((match) => `- ${match.title} (${match.path})\n  ${match.excerpt}`).join("\n")}`
      : `No Living Archive wiki match found for "${result.query}".`
  );
};

const runHistorySearchCommand = async (body) => {
  const query = String(body ?? "").trim();
  if (!query) {
    await addMessage("system", "Use `/history <query>` to search local browser history metadata.");
    return;
  }
  if (!chrome.history?.search) {
    await addMessage("system", "Browser history search is not available in this runtime.");
    return;
  }
  setActivity("retrieving", "Searching browser history", query);
  const results = await chrome.history.search({
    text: query,
    maxResults: 8,
    startTime: Date.now() - 1000 * 60 * 60 * 24 * 90
  }).catch(() => []);
  await addMessage(
    "system",
    results.length
      ? `Browser history matches for "${query}":\n${results.map((item) => `- ${item.title || item.url}\n  ${item.url}`).join("\n")}`
      : `No browser history match found for "${query}".`
  );
  setStatus("Ready");
  setActivity("completed", "History search complete", `${results.length} matches`);
};

const runCapabilitiesCommand = async () => {
  const tab = await activeTab();
  const mode = tab?.url ? await permissionForUrl(tab.url) : "unknown";
  const host = tab?.url ? siteKeyForUrl(tab.url) : "no readable page";
  await addMessage(
    "system",
    [
      "What Augmentor can do now:",
      `- Current site: ${host} · ${mode}`,
      "- Read visible page text, controls, fields, frames, and page metadata.",
      "- Open/search pages, switch tabs, click visible safe controls, type into editable fields, and scroll.",
      "- Use Inline Assistant on selected text and send selected context into chat.",
      "- Search local browser history metadata with `/history <query>`.",
      "- Save page/context artifacts into ResonantOS intake.",
      "",
      "Hard boundaries:",
      "- Wallet signing, payment, login, credential autofill, and public submission require human approval.",
      "- Blocked sites disable reading and page actions. Read-only sites disable actions but still allow context reading."
    ].join("\n")
  );
};

const findJob = (idOrGoal = "") => {
  const needle = String(idOrGoal ?? "").trim().toLowerCase();
  if (!needle) return currentJob() ?? browserJobs[0] ?? null;
  return browserJobs.find((job) =>
    job.id.toLowerCase() === needle ||
    job.id.toLowerCase().includes(needle) ||
    job.goal.toLowerCase().includes(needle)
  ) ?? null;
};

const runJobsCommand = async (body = "") => {
  const filter = String(body ?? "").trim().toLowerCase();
  const visible = browserJobs
    .filter((job) => !filter || job.status === filter || job.goal.toLowerCase().includes(filter) || job.id.toLowerCase().includes(filter))
    .slice(0, 12);
  renderJobMonitor();
  await addMessage(
    "system",
    visible.length
      ? `Browser jobs:\n${visible.map((job) => `- ${job.id} · ${job.status} · ${job.goal}`).join("\n")}`
      : "No browser jobs match that filter."
  );
};

const pauseBrowserJob = async (body = "") => {
  const job = findJob(body);
  if (!job) {
    await addMessage("system", "No browser job is available to pause.");
    return;
  }
  if (job.id === activeJobId && currentControlRun && job.status === "running") {
    finishControlRun("paused");
  }
  await updateBrowserJob(job.id, { status: "paused" });
  await addMessage("system", `Paused browser job ${job.id}: ${job.goal}`);
};

const resumeBrowserJob = async (body = "") => {
  const job = findJob(body);
  if (!job) {
    await addMessage("system", "No browser job is available to resume.");
    return;
  }
  if (job.status !== "paused") {
    await addMessage("system", `Browser job ${job.id} is ${job.status}; only paused jobs can resume in v1.`);
    return;
  }
  await updateBrowserJob(job.id, { status: "queued" });
  await addMessage("system", `Queued browser job ${job.id} for manual resume: ${job.goal}\nRun /control ${job.goal} to restart it from the current page state.`);
};

const cancelBrowserJob = async (body = "") => {
  const job = findJob(body);
  if (!job) {
    await addMessage("system", "No browser job is available to cancel.");
    return;
  }
  if (job.id === activeJobId && currentControlRun && !["completed", "blocked", "denied", "cancelled"].includes(currentControlRun.status)) {
    finishControlRun("cancelled");
  }
  await updateBrowserJob(job.id, { status: "cancelled" });
  await addMessage("system", `Cancelled browser job ${job.id}: ${job.goal}`);
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
  const job = currentJob();
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
  getActiveJobId: () => activeJobId,
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

const respondToCommand = async (value) => {
  await bindMentionedTab(value);
  const slash = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(value.trim());
  if (slash) {
    const name = slash[1].toLowerCase();
    const body = (slash[2] ?? "").trim();
    if (name === "goal") {
      await runGoalCommand(body);
      return;
    }
    if (name === "delegate") {
      await runDelegateCommand(body);
      return;
    }
    if (name === "status") {
      await runStatusCommand();
      return;
    }
    if (name === "site") {
      await runSitePermissionCommand(body);
      return;
    }
    if (name === "memory") {
      await runMemorySearchCommand(body);
      return;
    }
    if (name === "history") {
      await runHistorySearchCommand(body);
      return;
    }
    if (name === "capabilities" || name === "permissions") {
      await runCapabilitiesCommand();
      return;
    }
    if (name === "jobs") {
      await runJobsCommand(body);
      return;
    }
    if (name === "pause") {
      await pauseBrowserJob(body);
      return;
    }
    if (name === "resume") {
      await resumeBrowserJob(body);
      return;
    }
    if (name === "cancel") {
      await cancelBrowserJob(body);
      return;
    }
    if (name === "browser") {
      await runBrowserCommand(body);
      return;
    }
    if (name === "control") {
      await runControlCommand(body);
      return;
    }
  }
  const controlIntent = parseControlIntent(value);
  if (controlIntent) {
    await runControlCommand(controlIntent.goal);
    return;
  }
  const autonomousBrowserActionIntent = parseAutonomousBrowserActionIntent(value);
  if (autonomousBrowserActionIntent) {
    await runControlCommand(autonomousBrowserActionIntent.goal);
    return;
  }
  const typeIntent = parseTypeIntent(value);
  if (typeIntent) {
    await typeIntoActivePage(typeIntent);
    return;
  }
  const clickIntent = parseClickIntent(value);
  if (clickIntent) {
    await clickActivePageText(clickIntent);
    return;
  }
  const readPageIntent = parseReadPageIntent(value);
  if (readPageIntent) {
    await summarizeSnapshot();
    return;
  }
  const scrollIntent = parseScrollIntent(value);
  if (scrollIntent) {
    await scrollActivePage(scrollIntent);
    return;
  }
  const formsIntent = parseFormsIntent(value);
  if (formsIntent) {
    await detectActivePageForms();
    return;
  }
  const structuredEditIntent = parseStructuredPageEditIntent(value);
  if (structuredEditIntent) {
    await explainStructuredPageEditBoundary(structuredEditIntent.instruction);
    return;
  }
  const browserIntent = parseNaturalBrowserIntent(value);
  if (browserIntent) {
    await openBrowserUrl(browserIntent.target);
    return;
  }
  const searchIntent = parseNaturalSearchIntent(value);
  if (searchIntent) {
    await searchBrowser(searchIntent);
    return;
  }
  if (/^\/(read|context)\b/i.test(value) || /^\/(summari[sz]e)\b/i.test(value)) {
    await summarizeSnapshot();
    return;
  }
  if (/^\/(save|archive|intake)\b/i.test(value)) {
    await saveIntake();
    return;
  }
  if (/wallet|phantom|seed phrase|private key/i.test(value)) {
    await addMessage("system", "Wallet actions are human-approval gated. I can discuss Phantom and browser context, but wallet connect, signing, seed phrases, private keys, and credential actions stay human-only.");
    setStatus("Approval gated");
    return;
  }

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
  jobMonitorCollapsed = !jobMonitorCollapsed;
  await chrome.storage?.local?.set?.({ [STORAGE_KEYS.jobMonitorCollapsed]: jobMonitorCollapsed });
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
