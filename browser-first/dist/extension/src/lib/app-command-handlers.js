import { isTerminalBrowserJobStatus } from "./browser-job-store.js";

export const parseCommandSections = (body) => String(body ?? "").split("|").map((part) => part.trim()).filter(Boolean);

export function sitePermissionModeFromText(body) {
  const normalized = String(body ?? "").trim();
  if (/\b(blocked|block)\b/i.test(normalized)) return "blocked";
  if (/\b(read-only|readonly|read only)\b/i.test(normalized)) return "read-only";
  if (/\b(trusted)\b/i.test(normalized)) return "trusted-for-safe-actions";
  return "ask-before-action";
}

export function createAppCommandHandlers({
  activeTab,
  addMessage,
  bridgeRequest,
  browserJobStore,
  chrome,
  finishControlRun,
  getCurrentControlRun,
  permissionForUrl,
  renderJobMonitor,
  renderSitePermissionPanel,
  setActivity,
  setSitePermission,
  setStatus,
  siteKeyForUrl,
  updateBrowserJob
}) {
  async function runGoalCommand(body) {
    const sections = parseCommandSections(body);
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
  }

  async function runDelegateCommand(body) {
    const match = /^(engineer|hermes|opencode|open code)\b\s*([\s\S]*)$/i.exec(String(body ?? "").trim());
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
  }

  async function runStatusCommand() {
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
  }

  async function runSitePermissionCommand(body) {
    const normalized = String(body ?? "").trim();
    const tab = await activeTab();
    if (!normalized || /^status$/i.test(normalized)) {
      const mode = tab?.url ? await permissionForUrl(tab.url) : "unknown";
      await addMessage("system", `Current site permission: ${tab?.url ? siteKeyForUrl(tab.url) : "no site"} · ${mode}`);
      return;
    }
    const result = await setSitePermission(tab?.url, sitePermissionModeFromText(normalized));
    await renderSitePermissionPanel(tab);
    await addMessage("system", `Set ${result.key} Assistant permission to ${result.mode}.`);
  }

  async function runMemorySearchCommand(body) {
    const query = String(body ?? "").trim();
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
  }

  async function runHistorySearchCommand(body) {
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
  }

  async function runCapabilitiesCommand() {
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
  }

  async function runJobsCommand(body = "") {
    const filter = String(body ?? "").trim().toLowerCase();
    const visible = browserJobStore.getJobs()
      .filter((job) => !filter || job.status === filter || job.goal.toLowerCase().includes(filter) || job.id.toLowerCase().includes(filter))
      .slice(0, 12);
    renderJobMonitor();
    await addMessage(
      "system",
      visible.length
        ? `Browser jobs:\n${visible.map((job) => `- ${job.id} · ${job.status} · ${job.goal}`).join("\n")}`
        : "No browser jobs match that filter."
    );
  }

  async function pauseBrowserJob(body = "") {
    const job = browserJobStore.findJob(body);
    if (!job) {
      await addMessage("system", "No browser job is available to pause.");
      return;
    }
    if (job.id === browserJobStore.getActiveJobId() && getCurrentControlRun() && job.status === "running") {
      finishControlRun("paused");
    }
    await updateBrowserJob(job.id, { status: "paused" });
    await addMessage("system", `Paused browser job ${job.id}: ${job.goal}`);
  }

  async function resumeBrowserJob(body = "") {
    const job = browserJobStore.findJob(body);
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
  }

  async function cancelBrowserJob(body = "") {
    const job = browserJobStore.findJob(body);
    const currentControlRun = getCurrentControlRun();
    if (!job) {
      await addMessage("system", "No browser job is available to cancel.");
      return;
    }
    if (job.id === browserJobStore.getActiveJobId() && currentControlRun && !isTerminalBrowserJobStatus(currentControlRun.status)) {
      finishControlRun("cancelled");
    }
    await updateBrowserJob(job.id, { status: "cancelled" });
    await addMessage("system", `Cancelled browser job ${job.id}: ${job.goal}`);
  }

  return {
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
  };
}
