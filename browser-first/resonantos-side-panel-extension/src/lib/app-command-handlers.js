import { isTerminalBrowserJobStatus } from "./browser-job-store.js";

export const parseCommandSections = (body) => String(body ?? "").split("|").map((part) => part.trim()).filter(Boolean);

export function parseHistorySearchCommand(body) {
  const sections = parseCommandSections(body);
  const first = sections[0] ?? "";
  const options = {
    days: 90,
    includeTabs: /\b(tabs?|recent tabs?|open tabs?)\b/i.test(first),
    saveToIntake: /\b(save|intake|archive|export)\b/i.test(first),
    maxResults: 8,
    query: first.replace(/\b(recent tabs?|open tabs?|tabs?|save|intake|archive|export)\b/gi, "").trim(),
    site: ""
  };
  sections.slice(1).forEach((section) => {
    const [rawKey, ...rest] = section.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "site" || key === "host") {
      options.site = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
      return;
    }
    if (key === "days" || key === "since") {
      const days = Number.parseInt(value, 10);
      if (Number.isFinite(days) && days > 0 && days <= 3650) options.days = days;
      return;
    }
    if (key === "limit" || key === "max") {
      const maxResults = Number.parseInt(value, 10);
      if (Number.isFinite(maxResults) && maxResults > 0 && maxResults <= 25) options.maxResults = maxResults;
      return;
    }
    if (key === "tabs" || key === "recent-tabs") {
      options.includeTabs = !/^false|no|0$/i.test(value);
      return;
    }
    if (["save", "intake", "archive", "export"].includes(key)) {
      options.saveToIntake = !/^false|no|0$/i.test(value);
    }
  });
  return options;
}

const historyResultLine = (item) => `- ${item.title || item.url}\n  ${item.url}`;

function formatHistorySearchMarkdown({ options, results, readableTabs }) {
  const title = [
    "# Browser Activity Search",
    "",
    `Query: ${options.query || "(none)"}`,
    `Site filter: ${options.site || "(none)"}`,
    `Window: ${options.days} day(s)`,
    "Incognito activity: excluded",
    `Captured at: ${new Date().toISOString()}`,
    ""
  ];
  const sections = [...title];
  if (readableTabs.length) {
    sections.push("## Recent Readable Tabs", "", ...readableTabs.map(historyResultLine), "");
  }
  if (results.length) {
    sections.push("## Browser History Matches", "", ...results.map(historyResultLine), "");
  }
  if (!readableTabs.length && !results.length) {
    sections.push("No browser history or readable-tab matches were found.", "");
  }
  sections.push(
    "## Boundary",
    "",
    "This artifact contains browser activity metadata only. It is raw intake evidence, not trusted AI Memory, until reviewed and promoted through the Living Archive workflow.",
    ""
  );
  return sections.join("\n");
}

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
  restartBrowserJob,
  saveBrowserJobReportToArchive,
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
    const result = await setSitePermission(tab?.url, sitePermissionModeFromText(normalized), {
      reason: `Slash command: /site ${normalized}`,
      source: "slash-command"
    });
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
    const options = parseHistorySearchCommand(body);
    if (!options.query && !options.includeTabs) {
      await addMessage("system", "Use `/history <query> | site:example.com | days:7 | tabs | intake` to search local browser history metadata, recent readable tabs, and optionally save the result to Living Archive intake.");
      return;
    }
    if (!chrome.history?.search) {
      await addMessage("system", "Browser history search is not available in this runtime.");
      return;
    }
    setActivity("retrieving", "Searching browser history", options.query || options.site || "recent tabs");
    const siteMatches = (url) => {
      if (!options.site) return true;
      try {
        return new URL(url).hostname.replace(/^www\./, "") === options.site;
      } catch {
        return false;
      }
    };
    const historyResults = options.query ? await chrome.history.search({
      text: options.query,
      maxResults: Math.min(options.maxResults * 3, 75),
      startTime: Date.now() - 1000 * 60 * 60 * 24 * options.days
    }).catch(() => []) : [];
    const results = historyResults.filter((item) => siteMatches(item.url)).slice(0, options.maxResults);
    const readableTabs = options.includeTabs && chrome.tabs?.query
      ? (await chrome.tabs.query({ currentWindow: true }).catch(() => []))
        .filter((tab) => !tab.incognito && /^https?:\/\//i.test(tab.url ?? "") && siteMatches(tab.url))
        .slice(0, options.maxResults)
      : [];
    const lines = [];
    if (readableTabs.length) {
      lines.push("Recent readable tabs:");
      lines.push(...readableTabs.map((tab) => `- ${tab.title || tab.url}\n  ${tab.url}`));
    }
    if (results.length) {
      lines.push(`Browser history matches${options.query ? ` for "${options.query}"` : ""}:`);
      lines.push(...results.map((item) => `- ${item.title || item.url}\n  ${item.url}`));
    }
    if (options.site) {
      lines.push(`Filter: site ${options.site}`);
    }
    lines.push(`Window: ${options.days} day(s). Incognito activity is excluded.`);
    await addMessage(
      "system",
      lines.length > 1
        ? lines.join("\n")
        : `No browser history or readable tab match found for "${options.query || options.site}".\nWindow: ${options.days} day(s). Incognito activity is excluded.`
    );
    if (options.saveToIntake) {
      const content = formatHistorySearchMarkdown({ options, results, readableTabs });
      const intake = await bridgeRequest("/archive/intake", {
        method: "POST",
        body: {
          title: `Browser activity search: ${options.query || options.site || "recent tabs"}`,
          content,
          origin: "browser-history-search",
          url: null,
          metadata: {
            query: options.query,
            site: options.site,
            days: options.days,
            historyMatches: results.length,
            readableTabs: readableTabs.length,
            incognitoExcluded: true
          }
        }
      });
      const review = await bridgeRequest("/archive/review/request", {
        method: "POST",
        body: {
          path: intake.path,
          reason: "Evaluate browser activity metadata for durable research context, source provenance, and possible wiki updates."
        }
      });
      await addMessage("system", `Saved browser activity search to Living Archive intake: ${intake.path}\nReview request created: ${review.path}`);
    }
    setStatus("Ready");
    setActivity(
      "completed",
      options.saveToIntake ? "History search saved to intake" : "History search complete",
      `${results.length} history · ${readableTabs.length} tabs`
    );
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
        "- Search local browser history metadata and readable open tabs with `/history <query> | site:example.com | days:7 | tabs`.",
        "- Save selected browser activity metadata to raw Living Archive intake with `/history <query> | intake`.",
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
    if (!["paused", "queued", "failed"].includes(job.status)) {
      await addMessage("system", `Browser job ${job.id} is ${job.status}; only paused, queued, or failed jobs can resume.`);
      return;
    }
    await browserJobStore.activateJob?.(job.id);
    await updateBrowserJob(job.id, { status: "queued" });
    await addMessage(
      "system",
      [
        `Queued browser job ${job.id} for exact resume: ${job.goal}`,
        `Persisted steps loaded: ${Array.isArray(job.steps) ? job.steps.length : 0}`,
        "Resuming now from the current page state while preserving the previous step history."
      ].join("\n")
    );
    if (typeof restartBrowserJob === "function") {
      await restartBrowserJob(job);
    }
  }

  async function continueBrowserJob(body = "") {
    const job = browserJobStore.findJob(body);
    if (!job) {
      await addMessage("system", "No browser job is available to continue.");
      return;
    }
    if (job.status === "running") {
      await addMessage("system", `Browser job ${job.id} is already running: ${job.goal}`);
      return;
    }
    if (typeof restartBrowserJob !== "function") {
      await addMessage("system", `Browser job ${job.id} can be continued manually with /control ${job.goal}`);
      return;
    }
    await addMessage(
      "system",
      [
        `Continuing browser job ${job.id}: ${job.goal}`,
        "Previous steps remain in the job monitor. The new run starts from the current page state and keeps the same approval boundaries."
      ].join("\n")
    );
    await restartBrowserJob(job);
  }

  async function reportBrowserJob(body = "") {
    const job = browserJobStore.findJob(body);
    if (!job) {
      await addMessage("system", "No browser job is available to report.");
      return;
    }
    if (typeof saveBrowserJobReportToArchive !== "function") {
      await addMessage("system", `Browser job ${job.id} report is unavailable in this runtime.`);
      return;
    }
    const result = await saveBrowserJobReportToArchive(job);
    if (result?.error) {
      await addMessage("system", `Browser job report failed: ${result.error}`);
      return;
    }
    const artifact = { type: "archive-intake", path: result.path };
    await updateBrowserJob(job.id, {
      artifacts: [...(job.artifacts ?? []), artifact]
    });
    await addMessage("system", `Saved browser job report to Living Archive intake: ${result.path}`);
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
    continueBrowserJob,
    pauseBrowserJob,
    resumeBrowserJob,
    reportBrowserJob,
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
