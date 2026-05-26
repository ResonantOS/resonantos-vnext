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

const BRIDGE_URL = "http://127.0.0.1:47773";
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
let messages = [];
let forks = [];
let attachments = [];
let turnBusy = false;
let activityTimer = null;
let currentControlRun = null;
let pendingApproval = null;
let controlledTabId = null;
let browserJobs = [];
let activeJobId = null;
let jobMonitorCollapsed = true;
let contextDockExpanded = false;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const composerSelection = () => ({
  start: commandInput.selectionStart ?? commandInput.value.length,
  end: commandInput.selectionEnd ?? commandInput.value.length
});

const replaceComposerSelection = (text) => {
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
      commandInput.value = "";
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

const isReadableBrowserTab = (tab) => typeof tab?.url === "string" && /^https?:\/\//i.test(tab.url);
const browserIntentVerbs = /\b(open|go\s+to|go\s+on|navi\w*(?:\s+to)?|visit|load|browse(?:\s+to)?|take\s+me\s+to|show\s+me|bring\s+up|pull\s+up)\b/i;
const browserTargetPattern = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>)]*)?)/i;
const searchIntentVerbs = /\b(search|find|look\s+up|research|news|latest|internet|web)\b/i;

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

const renderAttachments = () => {
  attachmentStrip.replaceChildren();
  attachmentStrip.hidden = attachments.length === 0;
  attachments.forEach((attachment) => {
    const chip = document.createElement("span");
    chip.className = "attachment-chip";
    const label = document.createElement("strong");
    label.textContent = attachment.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = `Remove ${attachment.name}`;
    remove.addEventListener("click", () => {
      attachments = attachments.filter((item) => item.id !== attachment.id);
      renderAttachments();
      void persistChatState();
    });
    chip.append(label, remove);
    attachmentStrip.append(chip);
  });
};

const clearAttachments = async () => {
  attachments = [];
  renderAttachments();
  await persistChatState();
};

const persistChatState = async () => {
  await chrome.storage?.local?.set?.({
    [STORAGE_KEYS.messages]: messages,
    [STORAGE_KEYS.forks]: forks,
    [STORAGE_KEYS.model]: modelSelect.value,
    [STORAGE_KEYS.thinkingDepth]: thinkingDepthSelect.value,
    [STORAGE_KEYS.attachments]: attachments
  }).catch(() => undefined);
};

const bridgeRequest = async (route, options = {}) => {
  const response = await fetch(`${BRIDGE_URL}${route}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error ?? `Bridge request failed with HTTP ${response.status}.`);
  }
  return payload;
};

const messageLabel = (role) => {
  if (role === "user") return "You";
  if (role === "system") return "System";
  return "Augmentor";
};

const ACTION_ICONS = {
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M6 7v13h12V7"/><path d="M9 11h6"/><path d="M9 15h6"/><path d="M8 4h8l2 3H6l2-3Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8.5A2.5 2.5 0 0 1 10.5 6h7A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 15.5v-7Z"/><path d="M5.5 14A2.5 2.5 0 0 1 3 11.5v-7A2.5 2.5 0 0 1 5.5 2h7A2.5 2.5 0 0 1 15 4.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  fork: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v5a4 4 0 0 0 4 4h4"/><path d="M18 4v16"/><path d="m14 9 4 4-4 4"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="18" cy="20" r="2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-4"/></svg>',
  delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>'
};

const actionButton = (action, label, title, onClick) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.title = title;
  button.innerHTML = ACTION_ICONS[action];
  button.addEventListener("click", onClick);
  return button;
};

const renderMessages = () => {
  transcript.replaceChildren();
  messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;
    article.dataset.messageId = message.id;

    const header = document.createElement("div");
    header.className = "message-header";
    const strong = document.createElement("strong");
    strong.textContent = messageLabel(message.role);
    const time = document.createElement("time");
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    header.append(strong, time);

    const paragraph = document.createElement("p");
    paragraph.textContent = message.content;

    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.append(actionButton("copy", "Copy", "Copy this message", () => void copyMessage(message.id)));
    actions.append(actionButton("fork", "Fork", "Fork the conversation up to this message", () => void forkFromMessage(message.id)));
    if (message.role === "user") {
      actions.append(actionButton("edit", "Edit", "Edit this message in the composer", () => editMessage(message.id)));
    }
    if (message.role === "assistant") {
      actions.append(actionButton("archive", "Save to Living Archive", "Save this message to Living Archive intake", () => void saveMessageToArchive(message.id)));
      actions.append(actionButton("refresh", "Regenerate", "Regenerate from the previous user message", () => void regenerateFromMessage(message.id)));
      if (message.usage) {
        actions.append(actionButton("stats", "Stats", "Show generation stats", () => void showMessageStats(message.id)));
      }
    }
    actions.append(actionButton("delete", "Delete", "Delete this message", () => void deleteMessage(message.id)));

    article.append(header, paragraph, actions);
    transcript.append(article);
  });
  scrollTranscriptToBottom();
};

const addMessage = async (role, content, { persist = true, usage = null } = {}) => {
  const text = String(content ?? "").trim();
  if (!text) return null;
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: text,
    usage,
    createdAt: new Date().toISOString()
  };
  messages = [...messages, message];
  renderMessages();
  if (persist) {
    await persistChatState();
  }
  return message;
};

const copyMessage = async (id) => {
  const message = messages.find((item) => item.id === id);
  if (!message) return;
  await navigator.clipboard?.writeText?.(message.content).catch(() => undefined);
  const button = transcript.querySelector(`[data-message-id="${CSS.escape(id)}"] .message-action[data-action="copy"]`);
  if (button) {
    button.innerHTML = ACTION_ICONS.check;
    window.setTimeout(() => {
      button.innerHTML = ACTION_ICONS.copy;
    }, 1400);
  }
  setStatus("Copied");
};

const forkFromMessage = async (id) => {
  const index = messages.findIndex((item) => item.id === id);
  if (index < 0) return;
  const fork = {
    id: `fork-${Date.now()}`,
    sourceMessageId: id,
    createdAt: new Date().toISOString(),
    messages: messages.slice(0, index + 1)
  };
  forks = [...forks, fork];
  messages = fork.messages.map((message) => ({ ...message }));
  renderMessages();
  await persistChatState();
  setStatus("Forked");
};

const deleteMessage = async (id) => {
  messages = messages.filter((message) => message.id !== id);
  renderMessages();
  await persistChatState();
  setStatus("Deleted");
};

const editMessage = (id) => {
  const message = messages.find((item) => item.id === id);
  if (!message || message.role !== "user") return;
  commandInput.value = message.content;
  commandInput.focus();
  setStatus("Editing");
};

const saveMessageToArchive = async (id) => {
  const message = messages.find((item) => item.id === id);
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
  const message = messages.find((item) => item.id === id);
  if (!message?.usage) {
    await addMessage("system", "No generation telemetry is available for this message.");
    return;
  }
  await addMessage("system", `Generation stats:\n${JSON.stringify(message.usage, null, 2)}`);
};

const regenerateFromMessage = async (id) => {
  const index = messages.findIndex((item) => item.id === id);
  if (index < 0) return;
  const userIndex = messages.slice(0, index).findLastIndex((message) => message.role === "user");
  if (userIndex < 0) {
    await addMessage("system", "No previous user message is available for regeneration.");
    return;
  }
  messages = messages.slice(0, userIndex + 1);
  renderMessages();
  await persistChatState();
  await respondToCommand(messages[userIndex].content);
};

const activeTab = async () => {
  if (controlledTabId) {
    const controlled = await chrome.tabs.get(controlledTabId).catch(() => null);
    if (isReadableBrowserTab(controlled)) {
      return controlled;
    }
    controlledTabId = null;
  }
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const activeReadable = tabs.find((tab) => tab.active && isReadableBrowserTab(tab));
  if (activeReadable) {
    controlledTabId = activeReadable.id;
    return activeReadable;
  }
  const readableTabs = tabs.filter(isReadableBrowserTab);
  if (readableTabs.length) {
    const tab = readableTabs.at(-1);
    controlledTabId = tab.id;
    return tab;
  }
  const allTabs = await chrome.tabs.query({});
  const fallback = allTabs.find((tab) => tab.active && isReadableBrowserTab(tab)) ??
    allTabs.filter(isReadableBrowserTab).at(-1) ??
    tabs.find((tab) => tab.active);
  if (isReadableBrowserTab(fallback)) {
    controlledTabId = fallback.id;
  }
  return fallback;
};

const normalizeBrowserUrl = (target) => {
  const trimmed = String(target ?? "").trim().replace(/[.,;:!?]+$/, "");
  if (!trimmed) {
    throw new Error("Browser navigation requires a URL or domain.");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https browser navigation is supported.");
  }
  return url.toString();
};

const parseNaturalBrowserIntent = (message) => {
  const normalized = message.trim();
  if (/^\//.test(normalized) || !browserIntentVerbs.test(normalized)) {
    return null;
  }
  const target = browserTargetPattern.exec(normalized)?.[1];
  if (!target) {
    return null;
  }
  return { action: "open", target };
};

const quotedTextPattern = /["“”'‘’]([^"“”'‘’]{1,280})["“”'‘’]/;

const parseQuotedText = (message) => quotedTextPattern.exec(String(message ?? ""))?.[1]?.trim() ?? "";

const parseQuotedTexts = (message) =>
  Array.from(String(message ?? "").matchAll(/["“”'‘’]([^"“”'‘’]{1,280})["“”'‘’]/g))
    .map((match) => match[1]?.trim())
    .filter(Boolean);

const parseTypeIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(type|write|enter|put|insert)\b/i.test(normalized)) {
    return null;
  }
  const quotedTexts = parseQuotedTexts(normalized);
  const text = quotedTexts.at(-1) ?? "";
  if (!text) {
    return null;
  }
  const submit = /\b(search bar|google|search field|address bar|submit|press enter|hit enter)\b/i.test(normalized);
  return { text, submit };
};

const parseClickIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(click|press|tap|select|open)\b/i.test(normalized)) {
    return null;
  }
  const quotedTexts = parseQuotedTexts(normalized);
  const text = quotedTexts[0] ?? "";
  if (!text) {
    return null;
  }
  return { text };
};

const parseReadPageIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  return (
    /\b(read|scan|summari[sz]e|inspect|look at|understand|see|view|access)\b/i.test(normalized) ||
    /\b(can you|do you)\s+(see|view|access)\b/i.test(normalized)
  ) &&
    /\b(this|current|active|the|open)\s+(page|website|webpage|site|tab|browser|window)\b/i.test(normalized)
    ? { action: "read_page" }
    : null;
};

const parseStructuredPageEditIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(add|edit|update|write|insert|change|replace)\b/i.test(normalized)) {
    return null;
  }
  if (!/\b(doc|document|sheet|spreadsheet|page|row|line|cell|google\s+(sheet|doc|docs|sheets))\b/i.test(normalized)) {
    return null;
  }
  return { action: "structured_page_edit", instruction: normalized };
};

const parseScrollIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(scroll|move)\b/i.test(normalized)) {
    return null;
  }
  const direction = /\b(up|top)\b/i.test(normalized)
    ? /\btop\b/i.test(normalized) ? "top" : "up"
    : /\b(bottom|end)\b/i.test(normalized) ? "bottom" : "down";
  return { direction };
};

const parseFormsIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  return /\b(form|forms|field|fields|input|inputs)\b/i.test(normalized) &&
    /\b(detect|inspect|find|show|list|what)\b/i.test(normalized)
    ? { action: "detect_forms" }
    : null;
};

const parseControlIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  const match = /\b(take control|control the browser|use the browser|operate the browser|do this in the browser)\b[:\s-]*([\s\S]*)/i.exec(normalized);
  if (!match) {
    return null;
  }
  return { goal: (match[2] || normalized).trim() };
};

const parseAutonomousBrowserActionIntent = (message) => {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  const shoppingIntent = /\b(amazon|amazon\.it|cart|chart|basket|carrello|buy|shop|shopping|product|pringles|nvidia|rtx|5090)\b/i.test(normalized) &&
    /\b(go\s+to|open|find|search|look\s+for|add|put|select|choose|click)\b/i.test(normalized);
  const browserTaskVerbs = /\b(book|schedule|arrange|reserve|fill|complete|submit|click|press|tap|select|choose|pick|open|find|search|scroll|read|inspect|look at|navigate|go to|visit|add|put)\b/i;
  const browserObjectHints = /\b(call|meeting|appointment|booking|calendar|form|page|site|website|tab|browser|button|field|slot|time|date|news|internet|web|amazon|shop|shopping|product|cart|chart|basket|carrello)\b/i;
  if (shoppingIntent) {
    return { goal: normalized };
  }
  if (!browserTaskVerbs.test(normalized) || !browserObjectHints.test(normalized)) {
    return null;
  }
  return { goal: normalized };
};

const normalizeSearchQuery = (message) => {
  const cleaned = String(message ?? "")
    .replace(/\b(can you|please|could you|would you)\b/gi, " ")
    .replace(/\b(search|find|look\s+up|research|on the internet|on internet|online|web|the web|some)\b/gi, " ")
    .replace(/[?.!]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^news$/i.test(cleaned) || /^latest news$/i.test(cleaned)) {
    return "top stories";
  }
  return cleaned;
};

const parseNaturalSearchIntent = (message) => {
  const normalized = message.trim();
  if (/^\//.test(normalized) || !searchIntentVerbs.test(normalized)) {
    return null;
  }
  if (/\b(amazon|cart|chart|basket|carrello|shop|shopping|product)\b/i.test(normalized)) {
    return null;
  }
  if (browserTargetPattern.test(normalized) && browserIntentVerbs.test(normalized)) {
    return null;
  }
  const wantsNews = /\b(news|latest)\b/i.test(normalized);
  return {
    action: wantsNews ? "news" : "search",
    query: normalizeSearchQuery(normalized)
  };
};

const parseAmazonShoppingTask = (message) => {
  const normalized = String(message ?? "").trim();
  if (!/\b(amazon|amazon\.it|cart|chart|basket|carrello)\b/i.test(normalized)) {
    return null;
  }
  let query = normalized
    .replace(/\b(can you|please|could you|would you|ok now|now)\b/gi, " ")
    .replace(/\b(go\s+to|open|visit|navigate\s+to|find|search|look\s+for|me|on|in|amazon(?:\.it)?|some|then|and|add|put|it|them|to|the|cart|chart|basket|carrello)\b/gi, " ")
    .replace(/[?.!]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query && /\b(nvidia|5090|rtx)\b/i.test(normalized)) {
    query = "nvidia 5090";
  }
  if (!query && /\bpringles\b/i.test(normalized)) {
    query = "pringles";
  }
  const base = "https://www.amazon.it";
  return {
    query,
    wantsCart: /\b(add|put).{0,30}\b(cart|chart|basket|carrello)\b/i.test(normalized),
    url: query ? `${base}/s?k=${encodeURIComponent(query)}` : base
  };
};

const openBrowserUrl = async (target) => {
  const url = normalizeBrowserUrl(target);
  const targetTab = await activeTab();
  setActivity("tool-running", "Navigating browser", url);
  setStatus("Navigating");
  if (targetTab?.id && isReadableBrowserTab(targetTab)) {
    await chrome.tabs.update(targetTab.id, { url, active: true });
    controlledTabId = targetTab.id;
  } else {
    const tab = await chrome.tabs.create({ url, active: true });
    controlledTabId = tab.id;
  }
  lastSnapshot = null;
  setContextMeter(null);
  await addMessage("system", `Opened ${url}`);
  setStatus("Ready");
  return { ok: true, action: "open", url };
};

const searchBrowser = async ({ query, action }) => {
  const url = action === "news"
    ? `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&setlang=en-US`
    : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  setActivity("tool-running", action === "news" ? "Searching news" : "Searching web", query);
  setStatus(action === "news" ? "Searching news" : "Searching web");
  const targetTab = await activeTab();
  if (targetTab?.id && isReadableBrowserTab(targetTab)) {
    await chrome.tabs.update(targetTab.id, { url, active: true });
    controlledTabId = targetTab.id;
  } else {
    const tab = await chrome.tabs.create({ url, active: true });
    controlledTabId = tab.id;
  }
  lastSnapshot = null;
  setContextMeter(null);
  if (action === "news") {
    const news = await bridgeRequest("/web/news", {
      method: "POST",
      body: { query, limit: 5 }
    }).catch((error) => ({ error: error instanceof Error ? error.message : String(error), items: [] }));
    const headlines = news.items?.length
      ? `\n\nTop headlines:\n${news.items.map((item, index) => `${index + 1}. ${item.title}${item.source ? ` — ${item.source}` : ""}`).join("\n")}`
      : `\n\nI opened the news search, but headline extraction failed${news.error ? `: ${news.error}` : "."}`;
    await addMessage("system", `Opened news search for "${query}".${headlines}`);
  } else {
    await addMessage("system", `Opened web search for "${query}".`);
  }
  setActivity("completed", action === "news" ? "News search opened" : "Web search opened", query);
  setStatus("Ready");
  return { ok: true, action, query, url };
};

const mergeFrameSnapshots = (responses) => {
  const snapshots = responses
    .filter((response) => response?.ok && response.snapshot)
    .map((response) => response.snapshot);
  if (!snapshots.length) {
    return null;
  }
  const topSnapshot = snapshots.find((snapshot) => snapshot.frame?.isTop) ?? snapshots[0];
  return {
    ...topSnapshot,
    text: snapshots.map((snapshot) => snapshot.text).filter(Boolean).join("\n\n--- frame ---\n\n").slice(0, 24000),
    links: snapshots.flatMap((snapshot) => snapshot.links ?? []).slice(0, 140),
    controls: snapshots.flatMap((snapshot) => snapshot.controls ?? []).slice(0, 140),
    fields: snapshots.flatMap((snapshot) => snapshot.fields ?? []).slice(0, 140),
    frames: snapshots.map((snapshot) => ({
      title: snapshot.title,
      url: snapshot.url,
      isTop: Boolean(snapshot.frame?.isTop),
      words: String(snapshot.text ?? "").split(/\s+/).filter(Boolean).length,
      controls: snapshot.controls?.length ?? 0,
      fields: snapshot.fields?.length ?? 0
    }))
  };
};

const sendContentActionToFrames = async (tabId, message) => {
  const frames = await chrome.webNavigation?.getAllFrames?.({ tabId }).catch(() => null);
  const frameIds = Array.isArray(frames) && frames.length ? frames.map((frame) => frame.frameId) : [0];
  const responses = [];
  for (const frameId of frameIds) {
    const response = await chrome.tabs.sendMessage(tabId, message, { frameId }).catch((error) => ({
      ok: false,
      frameId,
      error: String(error)
    }));
    responses.push({ ...response, frameId });
  }
  if (message.type === "read_page") {
    const snapshot = mergeFrameSnapshots(responses);
    return snapshot ? { ok: true, snapshot, frameResponses: responses.length } : { ok: false, error: "No readable frame returned page context." };
  }
  const success = responses.find((response) => response?.ok);
  if (success) return success;
  const approval = responses.find((response) => response?.approvalRequired);
  if (approval) return approval;
  return responses.find((response) => response?.error) ?? { ok: false, error: "No frame handled this browser action." };
};

const sendContentAction = async (payload) => {
  const tab = await activeTab();
  if (!tab?.id || !isReadableBrowserTab(tab)) {
    return { ok: false, error: "No normal web page is active for this browser action." };
  }
  const siteMode = await permissionForUrl(tab.url);
  if (siteMode === "blocked") {
    return { ok: false, error: `Assistant is blocked on ${siteKeyForUrl(tab.url)}.` };
  }
  if (siteMode === "read-only" && payload.type !== "read_page" && payload.type !== "detect_forms" && payload.type !== "control_overlay") {
    return { ok: false, error: `Assistant actions are read-only on ${siteKeyForUrl(tab.url)}.` };
  }
  const message = {
    channel: "resonantos.browser_first.content",
    ...payload
  };
  const firstAttempt = await sendContentActionToFrames(tab.id, message);
  if (firstAttempt?.ok || !/receiving end|connection/i.test(firstAttempt?.error ?? "")) {
    return firstAttempt;
  }
  if (chrome.scripting?.executeScript) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content.js"]
    }).catch(() => undefined);
  } else {
    await chrome.tabs.reload(tab.id);
    await sleep(1200);
  }
  return sendContentActionToFrames(tab.id, message);
};

const setPageControlOverlay = async (active, label = "") => sendContentAction({
  type: "control_overlay",
  active,
  label: label || (active ? "Augmentor is operating this page" : "")
});

const typeIntoActivePage = async ({ text, field = "", ref = "", submit, userApproved = false }) => {
  setActivity("tool-running", "Typing into page", text);
  setStatus("Typing");
  const response = await sendContentAction({ type: "type_text", text, field, ref, submit, userApproved });
  if (response?.ok) {
    await addMessage(
      "system",
      `Typed into the active page${response.submitted ? " and submitted it" : ""}: "${response.typedText}"`
    );
    setStatus("Ready");
    setActivity("completed", "Typed into page", response.fieldName || response.tagName || "active field");
    return response;
  }
  await addMessage("system", `I could not type into the page: ${response?.error ?? "unknown error"}`);
  setStatus("Page action failed");
  setActivity("failed", "Typing failed", response?.error ?? "unknown error");
  return response;
};

const clickActivePageText = async ({ text, ref = "", userApproved = false }) => {
  setActivity("tool-running", "Clicking page element", text || ref);
  setStatus("Clicking");
  const response = await sendContentAction({ type: "click_text", text, ref, userApproved });
  if (response?.ok) {
    await addMessage("system", `Clicked "${response.clickedText || text || ref}" on the active page.`);
    setStatus("Ready");
    setActivity("completed", "Clicked page element", response.clickedText || text || ref);
    return response;
  }
  await addMessage("system", `I could not click "${text || ref}": ${response?.error ?? "unknown error"}`);
  setStatus("Page action failed");
  setActivity("failed", "Click failed", response?.error ?? "unknown error");
  return response;
};

const scrollActivePage = async ({ direction = "down", amount = 720 } = {}) => {
  setActivity("tool-running", "Scrolling page", direction);
  setStatus("Scrolling");
  const response = await sendContentAction({ type: "scroll_page", direction, amount });
  if (response?.ok) {
    await addMessage("system", `Scrolled ${response.direction}. Position: ${response.scrollY}/${response.maxScrollY}.`);
    setStatus("Ready");
    setActivity("completed", "Scrolled page", response.direction);
    return response;
  }
  await addMessage("system", `I could not scroll the page: ${response?.error ?? "unknown error"}`);
  setStatus("Page action failed");
  setActivity("failed", "Scroll failed", response?.error ?? "unknown error");
  return response;
};

const detectActivePageForms = async () => {
  setActivity("retrieving", "Inspecting page forms", "Looking for editable fields and forms");
  setStatus("Inspecting forms");
  const response = await sendContentAction({ type: "detect_forms" });
  if (!response?.ok) {
    await addMessage("system", `I could not inspect forms: ${response?.error ?? "unknown error"}`);
    setStatus("Page action failed");
    setActivity("failed", "Form inspection failed", response?.error ?? "unknown error");
    return response;
  }
  const formLines = (response.forms ?? []).map((form) => {
    const fields = (form.fields ?? []).map((field) => field.label || field.name || field.id || field.type || field.tagName).filter(Boolean).join(", ");
    return `- form ${form.index}${form.id ? ` #${form.id}` : ""}: ${fields || "no labelled fields"}`;
  });
  const looseLines = (response.looseFields ?? []).map((field) => `- ${field.label || field.name || field.id || field.type || field.tagName}`);
  await addMessage(
    "system",
    [
      `Detected ${(response.forms ?? []).length} form(s) and ${(response.looseFields ?? []).length} loose editable field(s).`,
      formLines.length ? "\nForms:\n" + formLines.join("\n") : "",
      looseLines.length ? "\nLoose fields:\n" + looseLines.slice(0, 12).join("\n") : "",
      "\nPublic submit, wallet, payment, login, and credential actions remain human-approval gated."
    ].filter(Boolean).join("\n")
  );
  setStatus("Ready");
  setActivity("completed", "Inspected page forms", `${(response.forms ?? []).length} forms`);
  return response;
};

const refreshTabContext = async () => {
  setStatus("Reading");
  const tab = await activeTab();
  const label = tab?.title || tab?.url || "No page context";
  readButton.title = `Attach/read current page: ${label}`;
  await renderSitePermissionPanel(tab);
  setStatus("Ready");
  return tab;
};

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

const readActivePage = async ({ announce = true } = {}) => {
  const tab = await refreshTabContext();
  if (!tab?.id || !isReadableBrowserTab(tab)) {
    if (announce) {
      await addMessage("system", "I cannot read this tab yet. Open a normal web page and try again.");
    }
    return null;
  }

  setActivity("reading", "Reading browser page", tab.title || tab.url);
  setStatus("Reading page");
  const response = await sendContentAction({
    channel: "resonantos.browser_first.content",
    type: "read_page"
  });

  lastSnapshot = response?.snapshot ?? null;
  setContextMeter(lastSnapshot);
  setStatus(response?.ok ? "Ready" : "Read failed");
  if (announce) {
    await addMessage(
      "system",
      response?.ok
        ? `Page context attached: ${response.snapshot.title || "Untitled"}\n${response.snapshot.url}`
        : `I could not read the page: ${response?.error ?? "unknown error"}`
    );
  }
  return response;
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
  attachments = [...attachments, ...nextAttachments];
  fileInput.value = "";
  renderAttachments();
  await persistChatState();
  setStatus("Attached");
};

const summarizeSnapshot = async () => {
  const response = lastSnapshot ? { ok: true, snapshot: lastSnapshot } : await readActivePage({ announce: false });
  const snapshot = response?.snapshot;
  if (!snapshot) {
    await addMessage("system", "No page context is attached yet. Use the plus button first.");
    return;
  }

  const text = snapshot.text || "";
  setActivity("reading", "Summarising page context", snapshot.title || snapshot.url);
  const words = text.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 46).join(" ");
  await addMessage(
    "system",
    `Page context captured.\n\nTitle: ${snapshot.title || "Untitled"}\nURL: ${snapshot.url}\nVisible text: about ${words.length} words.\nLinks found: ${snapshot.links?.length ?? 0}.\n\nOpening signal: ${excerpt}${words.length > 46 ? "..." : ""}`
  );
  return { ok: true, snapshot };
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
  return bridgeRequest("/augmentor/chat", {
    method: "POST",
    body: {
      model: modelSelect.value,
      thinkingDepth: thinkingDepthSelect.value,
      pageContext: pageContextForBridge(),
      runtimeContext: attachments.length ? `Composer attachments:\n${attachments.map((item) => `- ${item.name}: ${item.content ?? item.summary}`).join("\n")}` : null,
      messages: messages
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

const controlStepLabel = (step) => {
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
};

const dedupeControlSteps = (steps) => {
  const seen = new Set();
  return steps.filter((step) => {
    const key = JSON.stringify(step);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const planControlSteps = (goal) => {
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
};

const restrictedPlannerText = /\b(seed|private key|password|passphrase|wallet|phantom|sign|signature|approve|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|delete|remove|destroy|credential|2fa|otp|transfer)\b/i;
const hardApprovalBoundaryText = /\b(seed|private key|password|passphrase|wallet|phantom|sign|signature|approve|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|delete|remove|destroy|credential|2fa|otp|transfer)\b/i;
const publicSubmitBoundaryText = /\b(submit|publish|post|share|send|save|confirm)\b/i;

const approvalBoundaryForStep = (step, reason = "") => {
  const haystack = [
    step?.type,
    step?.text,
    step?.field,
    step?.target,
    step?.query,
    reason
  ].filter(Boolean).join(" ").toLowerCase();
  if (hardApprovalBoundaryText.test(haystack)) return "hard";
  if (publicSubmitBoundaryText.test(haystack)) return "public-submit";
  return "safe";
};

const sanitizePlannerUrl = (target) => {
  const trimmed = String(target ?? "").trim().replace(/[.,;:!?]+$/, "");
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Planner can only open http and https pages.");
  }
  return url.toString();
};

const sanitizedPlannerText = (value, label, max = 280) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Planner step is missing ${label}.`);
  return text.slice(0, max);
};

const sanitizePlannerStep = (step) => {
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
};

const sanitizePlannerPlan = (plan) => {
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
};

const requestControlPlan = async (goal, snapshot) => {
  if (typeof globalThis.__resonantosControlPlannerOverride === "function") {
    return sanitizePlannerPlan(await globalThis.__resonantosControlPlannerOverride({ goal, snapshot }));
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
  });
};

const sanitizeNextActionDecision = (decision) => {
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
};

const deterministicNextAction = (goal, snapshot, history) => {
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

const continueControlLoop = async ({ goal, history = [], results = [], startIndex = 0, maxSteps = 12 } = {}) => {
  try {
    for (let loopIndex = startIndex; loopIndex < maxSteps; loopIndex += 1) {
      await updateBrowserJob(activeJobId, { status: "running" });
      const snapshot = await observeControlPage();
      setActivity("thinking", "Deciding next browser action", `Loop ${loopIndex + 1}/${maxSteps}`);
      setStatus("Deciding");
      const decision = await requestNextControlAction({ goal, snapshot, history });
      if (decision.thought) {
        setActivity("thinking", decision.thought, decision.action ? controlStepLabel(decision.action) : decision.status);
      }
      if (decision.status === "done") {
        const archiveResult = await saveControlReportToArchive(results, "completed");
        const artifact = archiveResult?.path ? { type: "archive-intake", path: archiveResult.path } : null;
        finishControlRun("completed", artifact);
        await addMessage(
          "system",
          [
            "Agent Control Mode completed.",
            `Goal: ${goal}`,
            "",
            decision.doneSummary ?? "The observed page state satisfies the goal.",
            "",
            "Completed actions:",
            ...(results.length ? results.map(({ step }, index) => `${index + 1}. ${controlStepLabel(step)}`) : ["- No browser mutation was needed."])
          ].join("\n")
        );
        setStatus("Ready");
        setActivity("completed", "Control mode completed", goal);
        return { ok: true, results };
      }
      if (decision.status === "needs_approval" || decision.status === "blocked" || !decision.action) {
        const isApproval = decision.status === "needs_approval" && Boolean(decision.action);
        finishControlRun(isApproval ? "approval" : "blocked");
        setStatus(isApproval ? "Needs approval" : "Control blocked");
        setActivity("failed", isApproval ? "Control mode needs approval" : "Control mode blocked", decision.approvalReason);
        await addMessage(
          "system",
          [
            `Agent Control Mode ${isApproval ? "needs approval" : "blocked"}.`,
            `Goal: ${goal}`,
            `Reason: ${decision.approvalReason ?? decision.thought ?? "No safe next action is available."}`
          ].join("\n")
        );
        await saveControlReportToArchive(results, isApproval ? "approval-required" : "blocked");
        return { ok: false, results, approvalRequired: isApproval };
      }

      const step = decision.action;
      const stepIndex = appendControlStep(step);
      updateControlStep(stepIndex, "active", decision.thought);
      setActivity("tool-running", `Executing browser action ${stepIndex + 1}`, controlStepLabel(step));
      const result = await executeControlStep(step);
      results.push({ step, result });
      history.push({
        action: step,
        result: {
          ok: Boolean(result?.ok),
          approvalRequired: Boolean(result?.approvalRequired),
          error: result?.error ?? null,
          clickedText: result?.clickedText ?? null,
          typedText: result?.typedText ?? null,
          url: result?.url ?? null,
          query: result?.query ?? null
        },
        observation: {
          title: lastSnapshot?.title ?? snapshot?.title ?? null,
          url: lastSnapshot?.url ?? snapshot?.url ?? null
        }
      });
      if (!result?.ok) {
        const status = result?.approvalRequired ? "approval" : "blocked";
        const reason = result?.approvalRequired
          ? "Stopped because this step requires human approval."
          : `Stopped because this step failed: ${result?.error ?? "unknown error"}`;
        updateControlStep(stepIndex, result?.approvalRequired ? "blocked" : "failed", result?.error ?? "unknown error");
        finishControlRun(status);
        setStatus(result?.approvalRequired ? "Needs approval" : "Control blocked");
        setActivity("failed", "Control mode blocked", controlStepLabel(step));
        await addMessage("system", `Agent Control Mode blocked at action ${stepIndex + 1}: ${controlStepLabel(step)}\n${reason}`);
        if (result?.approvalRequired) {
          pendingApproval = {
            step: { ...step },
            stepIndex,
            reason: result?.error ?? "This browser action requires human approval.",
            results,
            history
          };
          renderControlMonitor();
        }
        const archiveResult = await saveControlReportToArchive(results, result?.approvalRequired ? "approval-required" : "blocked");
        if (archiveResult?.path) {
          currentControlRun.artifacts = [...(currentControlRun.artifacts ?? []), { type: "archive-intake", path: archiveResult.path }];
          renderControlMonitor();
          await updateBrowserJob(currentControlRun.id, { artifacts: currentControlRun.artifacts });
        }
        return { ok: false, results, approvalRequired: Boolean(result?.approvalRequired) };
      }
      updateControlStep(stepIndex, "completed");
      await sleep(350);
    }

    finishControlRun("blocked");
    setStatus("Control blocked");
    setActivity("failed", "Control loop reached safety limit", `${maxSteps} actions`);
    await addMessage("system", `Agent Control Mode stopped after ${maxSteps} actions. The task did not reach a verified completion state.`);
    await saveControlReportToArchive(results, "blocked-step-limit");
    return { ok: false, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /cancelled/i.test(message) ? "cancelled" : /paused/i.test(message) ? "paused" : "failed";
    finishControlRun(status);
    await updateBrowserJob(activeJobId, { status, lastError: message });
    setStatus(status === "paused" ? "Paused" : status === "cancelled" ? "Cancelled" : "Control failed");
    setActivity(status === "paused" ? "paused" : "failed", `Control mode ${status}`, message);
    await addMessage("system", `Agent Control Mode ${status}.\nGoal: ${goal}\nReason: ${message}`);
    return { ok: false, results, error: message };
  }
};

const runControlCommand = async (body) => {
  const goal = String(body ?? "").trim();
  if (!goal) {
    await addMessage("system", "Use `/control <browser goal>` or ask Augmentor to operate the current page.");
    return;
  }
  setStatus("Taking control");
  setActivity("tool-running", "Agent Control Mode", goal);
  const job = await createBrowserJob({
    goal,
    planner: "observe-act-verify-loop",
    summary: "Adaptive browser-agent loop. The host observes the page, asks for one safe next action, executes it, then verifies before continuing."
  });
  startControlRun({
    goal,
    plan: {
      source: "observe-act-verify-loop",
      summary: "Adaptive browser-agent loop. The host observes the page, asks for one safe next action, executes it, then verifies before continuing.",
      steps: []
    }
  });
  await addMessage(
    "system",
    [
      "Agent Control Mode started.",
      `Job: ${job.id}`,
      `Goal: ${goal}`,
      "Mode: observe → decide → act → verify.",
      "",
      "Approval boundary: wallet, login, payment, credential, public submit, and destructive actions remain blocked unless a human approval flow authorizes them."
    ].join("\n")
  );
  return continueControlLoop({ goal, history: [], results: [] });
};

const approvePendingControlStep = async () => {
  if (!pendingApproval || !currentControlRun) return;
  const approval = pendingApproval;
  const boundary = approvalBoundaryForStep(approval.step, approval.reason);
  if (boundary === "hard") {
    await addMessage("system", `Cannot automate this action: ${controlStepLabel(approval.step)}.\nWallet, payment, login, credential, signing, and transfer actions are human-only.`);
    return;
  }
  pendingApproval = null;
  renderControlMonitor();
  setStatus("Approved once");
  setActivity("tool-running", "Executing approved browser step", controlStepLabel(approval.step));
  await addMessage("system", `Human approved this browser action once: ${controlStepLabel(approval.step)}`);

  const step = { ...approval.step, userApproved: true };
  const results = approval.results.slice(0, approval.results.length - 1);
  updateControlStep(approval.stepIndex, "active", "approved once");
  const result = await executeControlStep(step);
  results.push({ step, result });
  if (!result?.ok) {
    updateControlStep(approval.stepIndex, result?.approvalRequired ? "blocked" : "failed", result?.error ?? "unknown error");
    finishControlRun(result?.approvalRequired ? "approval" : "blocked");
    setStatus(result?.approvalRequired ? "Needs approval" : "Control blocked");
    setActivity("failed", "Control mode blocked", controlStepLabel(step));
    await addMessage("system", `Agent Control Mode blocked after approval: ${controlStepLabel(step)}\n${result?.error ?? "unknown error"}`);
    await saveControlReportToArchive(results, result?.approvalRequired ? "approval-required" : "blocked");
    return;
  }
  updateControlStep(approval.stepIndex, "completed", "approved once");
  const history = [
    ...(approval.history ?? []),
    {
      action: step,
      result: {
        ok: true,
        approvalRequired: false,
        clickedText: result?.clickedText ?? null,
        typedText: result?.typedText ?? null
      },
      observation: {
        title: lastSnapshot?.title ?? null,
        url: lastSnapshot?.url ?? null
      }
    }
  ];
  await continueControlLoop({
    goal: currentControlRun.goal,
    history,
    results,
    startIndex: history.length,
    maxSteps: 12
  });
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
  const denied = pendingApproval;
  pendingApproval = null;
  updateControlStep(denied.stepIndex, "blocked", "denied by human");
  finishControlRun("denied");
  renderControlMonitor();
  setStatus("Denied");
  setActivity("failed", "Approval denied", controlStepLabel(denied.step));
  await addMessage("system", `Denied browser action: ${controlStepLabel(denied.step)}. The task remains stopped.`);
  await saveControlReportToArchive(denied.results, "denied");
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
  const settings = await chrome.storage?.local?.get?.([
    STORAGE_KEYS.messages,
    STORAGE_KEYS.forks,
    STORAGE_KEYS.model,
    STORAGE_KEYS.thinkingDepth,
    STORAGE_KEYS.attachments
  ]).catch(() => ({}));
  if (settings?.[STORAGE_KEYS.model] && [...modelSelect.options].some((option) => option.value === settings[STORAGE_KEYS.model])) {
    modelSelect.value = settings[STORAGE_KEYS.model];
  }
  if (settings?.[STORAGE_KEYS.thinkingDepth] && [...thinkingDepthSelect.options].some((option) => option.value === settings[STORAGE_KEYS.thinkingDepth])) {
    thinkingDepthSelect.value = settings[STORAGE_KEYS.thinkingDepth];
  }
  messages = Array.isArray(settings?.[STORAGE_KEYS.messages]) ? settings[STORAGE_KEYS.messages].filter((message) => ["user", "assistant", "system"].includes(message?.role)) : [];
  forks = Array.isArray(settings?.[STORAGE_KEYS.forks]) ? settings[STORAGE_KEYS.forks] : [];
  attachments = Array.isArray(settings?.[STORAGE_KEYS.attachments]) ? settings[STORAGE_KEYS.attachments] : [];
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
