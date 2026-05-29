import { noteCard, safeErrorMessage, setStatus, settingsHeader } from "./settings-common.js";

const terminalJobStatuses = new Set(["completed", "blocked", "denied", "cancelled", "failed"]);

function permissionLabel(mode) {
  if (mode === "blocked") return "Blocked";
  if (mode === "read-only") return "Read only";
  if (mode === "trusted-for-safe-actions") return "Trusted safe actions";
  return "Ask before action";
}

function readableTab(tab) {
  return typeof tab?.url === "string" && /^https?:\/\//i.test(tab.url);
}

function row({ title, meta, actionLabel = "", onAction = null }) {
  const item = document.createElement("li");
  item.className = "settings-control-row";
  const copy = document.createElement("span");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = meta;
  copy.append(heading, detail);
  item.append(copy);
  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = actionLabel;
    action.addEventListener("click", () => void onAction());
    item.append(action);
  }
  return item;
}

async function activeTab(chromeApi) {
  const tabs = await chromeApi?.tabs?.query?.({ active: true, currentWindow: true }).catch(() => []);
  return tabs?.[0] ?? null;
}

async function readStored(storage, key, fallback) {
  if (!storage || !key) return fallback;
  const result = await storage?.get?.(key).catch(() => ({}));
  return result?.[key] ?? fallback;
}

export function renderBrowserControlSection(container, {
  chromeApi,
  sitePermissionStore,
  taskConsentStore,
  storage,
  storageKeys = {}
}) {
  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Loading browser control settings...";
  const currentCard = noteCard({
    title: "Current site",
    body: "Checking the active browser tab and permission mode."
  });
  const permissionsList = document.createElement("ol");
  permissionsList.className = "settings-control-list";
  const jobsList = document.createElement("ol");
  jobsList.className = "settings-control-list";
  const clearJobs = document.createElement("button");
  clearJobs.type = "button";
  clearJobs.className = "settings-primary-action";
  clearJobs.textContent = "Clear Completed Browser Jobs";

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Browser and Agent Control",
      title: "Agent Control Permissions",
      body: "Manage how Augmentor may read, click, type, and run browser jobs. Wallet, login, payment, credential, signing, and public-submit boundaries remain approval-gated."
    }),
    statusNode,
    currentCard,
    noteCard({
      title: "Stored grants",
      body: "Site permissions and trusted task-class consents are scoped. Reset or revoke them when a site or task should return to ask-before-action."
    }),
    permissionsList,
    noteCard({
      title: "Browser jobs",
      body: "Review recent browser-control jobs. Clearing terminal jobs removes completed/blocked/cancelled history from the local monitor only."
    }),
    jobsList,
    clearJobs
  );

  const load = async () => {
    const tab = await activeTab(chromeApi);
    const siteKey = readableTab(tab) && sitePermissionStore
      ? sitePermissionStore.siteKeyForUrl(tab.url)
      : "";
    const mode = readableTab(tab) && sitePermissionStore
      ? await sitePermissionStore.permissionForUrl(tab.url)
      : "unavailable";
    currentCard.querySelector("p").textContent = readableTab(tab)
      ? `${siteKey} · ${permissionLabel(mode)}`
      : "No readable http/https tab is currently active.";

    const [sitePermissions, taskConsents, jobs, activeJobId] = await Promise.all([
      sitePermissionStore?.sitePermissions?.().catch(() => ({})) ?? {},
      taskConsentStore?.taskConsents?.().catch(() => ({})) ?? {},
      readStored(storage, storageKeys.browserJobs, []),
      readStored(storage, storageKeys.activeBrowserJob, "")
    ]);
    const permissionEntries = Object.entries(sitePermissions)
      .filter(([key, value]) => key && value && value !== "ask-before-action")
      .sort(([left], [right]) => left.localeCompare(right));
    const consentEntries = Object.values(taskConsents)
      .filter((consent) => consent?.siteKey && consent?.taskClass)
      .sort((left, right) => `${left.siteKey}::${left.taskClass}`.localeCompare(`${right.siteKey}::${right.taskClass}`));

    permissionsList.replaceChildren();
    for (const [key, value] of permissionEntries) {
      permissionsList.append(row({
        title: key,
        meta: `site permission · ${permissionLabel(value)}`,
        actionLabel: "Reset",
        onAction: async () => {
          await sitePermissionStore?.resetSitePermission?.(key, { reason: "Reset from Settings Browser Control", source: "settings" });
          await load();
        }
      }));
    }
    for (const consent of consentEntries) {
      permissionsList.append(row({
        title: `${consent.siteKey} · ${consent.taskClass}`,
        meta: `task consent · ${consent.mode} · expires ${new Date(consent.expiresAt).toLocaleDateString()}`,
        actionLabel: "Revoke",
        onAction: async () => {
          await taskConsentStore?.revokeTaskConsent?.({
            siteKey: consent.siteKey,
            taskClass: consent.taskClass,
            reason: "Revoked from Settings Browser Control",
            source: "settings"
          });
          await load();
        }
      }));
    }
    if (!permissionEntries.length && !consentEntries.length) {
      permissionsList.append(row({ title: "No stored grants", meta: "Agent Control is using ask-before-action defaults." }));
    }

    const normalizedJobs = Array.isArray(jobs) ? jobs : [];
    jobsList.replaceChildren();
    normalizedJobs.slice(0, 8).forEach((job) => {
      jobsList.append(row({
        title: job.goal || job.id || "Browser job",
        meta: `${job.status || "unknown"}${job.id === activeJobId ? " · focused" : ""} · ${job.updatedAt || job.createdAt || "no timestamp"}`
      }));
    });
    if (!normalizedJobs.length) {
      jobsList.append(row({ title: "No browser jobs", meta: "Agent Control has no persisted job history yet." }));
    }
    setStatus(statusNode, `${permissionEntries.length + consentEntries.length} stored grant${permissionEntries.length + consentEntries.length === 1 ? "" : "s"} · ${normalizedJobs.length} browser job${normalizedJobs.length === 1 ? "" : "s"}.`, "success");
  };

  clearJobs.addEventListener("click", async () => {
    clearJobs.disabled = true;
    try {
      const jobs = await readStored(storage, storageKeys.browserJobs, []);
      const kept = Array.isArray(jobs) ? jobs.filter((job) => !terminalJobStatuses.has(job?.status)) : [];
      if (storageKeys.browserJobs) {
        await storage?.set?.({ [storageKeys.browserJobs]: kept });
      }
      await load();
    } catch (error) {
      setStatus(statusNode, `Clear failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      clearJobs.disabled = false;
    }
  });

  void load().catch((error) => {
    setStatus(statusNode, `Browser control settings unavailable: ${safeErrorMessage(error)}`, "error");
  });
}
