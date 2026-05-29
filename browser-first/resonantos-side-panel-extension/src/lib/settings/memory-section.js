import { metricCard, noteCard, safeErrorMessage, setStatus, settingsHeader } from "./settings-common.js";

function sourceLabel(source) {
  const kind = source.kind === "obsidian-vault" ? "Obsidian vault" : "Folder";
  const ownership = String(source.ownership ?? "mixed-library").replace(/-/g, " ");
  const mode = String(source.importMode ?? "copy-on-import").replace(/-/g, " ");
  const state = source.disabledAt ? "disabled" : (source.exists ? "found" : "missing");
  return `${kind} · ${ownership} · ${mode} · ${state}`;
}

function sourceRow(source, actions = {}) {
  const row = document.createElement("li");
  row.className = "settings-control-row";
  if (source.disabledAt) {
    row.dataset.disabled = "true";
  }
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = source.path || "Unnamed source";
  const meta = document.createElement("small");
  meta.textContent = sourceLabel(source);
  copy.append(title, meta);
  if (source.id && !source.placeholder) {
    const controls = document.createElement("span");
    controls.className = "settings-inline-actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = source.disabledAt ? "Enable" : "Disable";
    toggle.setAttribute("aria-label", `${source.disabledAt ? "Enable" : "Disable"} memory source ${source.path}`);
    toggle.addEventListener("click", () => source.disabledAt ? actions.onEnable?.(source) : actions.onDisable?.(source));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove memory source ${source.path}`);
    remove.addEventListener("click", () => actions.onRemove?.(source));
    controls.append(toggle, remove);
    row.append(copy, controls);
    return row;
  }
  row.append(copy);
  return row;
}

function scanSummaryCard(summary) {
  const card = document.createElement("section");
  card.className = "settings-note settings-source-scan";
  const title = document.createElement("strong");
  title.textContent = summary.path || "Source scan";
  const categories = summary.categories ?? {};
  const body = document.createElement("p");
  body.textContent = [
    `${summary.totalScanned ?? 0} file(s) scanned${summary.limitReached ? " · limit reached" : ""}`,
    `${categories.compatible ?? 0} compatible`,
    `${categories.processed ?? 0} processed`,
    `${categories["raw-audio"] ?? 0} raw audio`,
    `${categories.media ?? 0} media`,
    `${categories.unsupported ?? 0} unsupported`,
    `${categories.hidden ?? 0} hidden`
  ].join(" · ");
  const recommendation = document.createElement("p");
  recommendation.textContent = summary.recommendation ?? "Review this source before registering it.";
  card.append(title, body, recommendation);
  return card;
}

function option(value, text, selected) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = text;
  node.selected = selected;
  return node;
}

export function renderMemorySection(container, { bridgeRequest }) {
  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Loading memory settings...";
  const metrics = document.createElement("div");
  metrics.className = "settings-health-grid";
  const sourceList = document.createElement("ol");
  sourceList.className = "settings-control-list";
  const scanPanel = document.createElement("div");
  scanPanel.className = "settings-source-scan-panel";
  const form = document.createElement("form");
  form.className = "settings-routing-form";
  const pathGroup = document.createElement("div");
  pathGroup.className = "settings-path-picker";

  const pathInput = document.createElement("input");
  pathInput.name = "path";
  pathInput.placeholder = "Folder or Obsidian vault path";
  pathInput.setAttribute("aria-label", "Memory source path");
  const browse = document.createElement("button");
  browse.type = "button";
  browse.textContent = "Browse";
  browse.setAttribute("aria-label", "Browse for memory source folder");
  const scan = document.createElement("button");
  scan.type = "button";
  scan.textContent = "Scan";
  scan.setAttribute("aria-label", "Scan selected memory source folder");
  pathGroup.append(pathInput, browse, scan);
  const kind = document.createElement("select");
  kind.name = "kind";
  kind.setAttribute("aria-label", "Memory source kind");
  kind.append(option("folder", "Folder", true), option("obsidian-vault", "Obsidian vault", false));
  const ownership = document.createElement("select");
  ownership.name = "ownership";
  ownership.setAttribute("aria-label", "Memory source ownership");
  ownership.append(
    option("mixed-library", "Mixed library", true),
    option("human-knowledge", "Human knowledge", false),
    option("external-knowledge", "External knowledge", false)
  );
  const importMode = document.createElement("select");
  importMode.name = "importMode";
  importMode.setAttribute("aria-label", "Memory source import mode");
  importMode.append(
    option("copy-on-import", "Copy on import", true),
    option("move-on-import", "Move on import", false),
    option("linked-readonly", "Linked read-only", false)
  );
  const syncMode = document.createElement("select");
  syncMode.name = "syncMode";
  syncMode.setAttribute("aria-label", "Memory sync mode");
  syncMode.append(
    option("manual-review", "Manual review", true),
    option("auto-intake-review", "Auto intake + review", false),
    option("paused", "Paused", false)
  );
  const autoSync = document.createElement("label");
  autoSync.className = "settings-routing-check";
  const autoSyncInput = document.createElement("input");
  autoSyncInput.type = "checkbox";
  autoSyncInput.name = "autoSync";
  autoSync.append(autoSyncInput, document.createTextNode(" Auto-sync"));
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save Memory Settings";
  form.append(pathGroup, kind, ownership, importMode, syncMode, autoSync, save);

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Memory system",
      title: "Living Archive Settings",
      body: "Configure the active memory-system add-on and source locations. Source folders remain human or external knowledge; AI Memory remains the curated wiki generated through the governed archive pipeline."
    }),
    statusNode,
    metrics,
    noteCard({
      title: "Source boundary",
      body: "Copy-on-import makes the ResonantOS memory copy the active knowledge base. Linked sources stay read-only. Move-on-import should be used carefully because the original location stops being the canonical source."
    }),
    sourceList,
    noteCard({
      title: "Add source or update sync policy",
      body: "Connect folders or Obsidian vaults here. Deep review, promotion, and rollback remain in the Living Archive workspace."
    }),
    scanPanel,
    form
  );

  const load = async () => {
    const result = await bridgeRequest("/memory/settings", { method: "GET" });
    const settings = result.settings ?? {};
    const memoryStatus = result.status ?? {};
    const addons = result.memoryAddons ?? [];
    autoSyncInput.checked = Boolean(settings.autoSync);
    syncMode.value = settings.syncMode ?? "manual-review";
    metrics.replaceChildren(
      metricCard({ label: "Active add-on", value: settings.activeMemoryAddon ?? "living-archive", detail: `${addons.length} memory add-on${addons.length === 1 ? "" : "s"} registered` }),
      metricCard({ label: "Wiki pages", value: String(memoryStatus.wiki?.pages ?? 0), detail: "AI_MEMORY/wiki" }),
      metricCard({ label: "Intake", value: String(memoryStatus.intake?.artifacts ?? 0), detail: "raw/source artifacts" }),
      metricCard({ label: "Sources", value: String(settings.sources?.length ?? 0), detail: settings.autoSync ? "auto-sync enabled" : "manual sync" })
    );
    sourceList.replaceChildren();
    for (const source of settings.sources ?? []) {
      sourceList.append(sourceRow(source, {
        onDisable: (entry) => manageSource(entry, "disable"),
        onEnable: (entry) => manageSource(entry, "enable"),
        onRemove: (entry) => manageSource(entry, "remove")
      }));
    }
    if (!settings.sources?.length) {
      sourceList.append(sourceRow({
        path: "No connected sources yet",
        kind: "folder",
        ownership: "mixed-library",
        importMode: "copy-on-import",
        exists: false,
        placeholder: true
      }));
    }
    setStatus(statusNode, `${settings.sources?.length ?? 0} source${settings.sources?.length === 1 ? "" : "s"} connected · ${settings.syncMode ?? "manual-review"}.`, "success");
  };

  const manageSource = async (source, action) => {
    const label = action === "remove" ? "remove" : "disable";
    if (action === "remove" && typeof window !== "undefined" && typeof window.confirm === "function") {
      const confirmed = window.confirm(`Remove this source from Living Archive settings?\n\n${source.path}`);
      if (!confirmed) {
        setStatus(statusNode, "Source removal cancelled.", "warning");
        return;
      }
    }
    setStatus(statusNode, `${action === "remove" ? "Removing" : action === "enable" ? "Enabling" : "Disabling"} memory source...`);
    try {
      await bridgeRequest("/memory/source/action", {
        method: "POST",
        capability: "memory-source-manage",
        body: {
          action,
          sourceId: source.id,
          reason: `User requested ${label} from Memory Settings`
        }
      });
      await load();
      setStatus(statusNode, `Memory source ${action === "enable" ? "enabled" : `${label}d`}.`, "success");
    } catch (error) {
      setStatus(statusNode, `Source ${label} failed: ${safeErrorMessage(error)}`, "error");
    }
  };

  browse.addEventListener("click", async () => {
    browse.disabled = true;
    setStatus(statusNode, "Opening folder picker...");
    try {
      const result = await bridgeRequest("/memory/source/browse", {
        method: "POST",
        capability: "memory-source-browse",
        body: {
          kind: kind.value,
          prompt: "Select a folder or Obsidian vault for Living Archive"
        }
      });
      if (result.cancelled) {
        setStatus(statusNode, "Folder selection cancelled.", "warning");
        return;
      }
      pathInput.value = result.path ?? "";
      if (result.kind === "obsidian-vault") {
        kind.value = "obsidian-vault";
      }
      setStatus(statusNode, "Folder selected. Review ownership/import mode, then save.", "success");
    } catch (error) {
      setStatus(statusNode, `Browse failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      browse.disabled = false;
    }
  });

  scan.addEventListener("click", async () => {
    const selectedPath = pathInput.value.trim();
    if (!selectedPath) {
      setStatus(statusNode, "Select or paste a folder path before scanning.", "warning");
      return;
    }
    scan.disabled = true;
    scanPanel.replaceChildren();
    setStatus(statusNode, "Scanning source folder...");
    try {
      const result = await bridgeRequest("/memory/source/scan", {
        method: "POST",
        capability: "memory-source-scan",
        body: {
          path: selectedPath,
          limit: 2_000
        }
      });
      if (result.kind === "obsidian-vault") {
        kind.value = "obsidian-vault";
      }
      scanPanel.replaceChildren(scanSummaryCard(result));
      setStatus(statusNode, "Source scan complete. Review summary before saving.", "success");
    } catch (error) {
      setStatus(statusNode, `Scan failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      scan.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    setStatus(statusNode, "Saving memory settings...");
    try {
      await bridgeRequest("/memory/settings", {
        method: "POST",
        capability: "memory-settings-write",
        body: {
          autoSync: autoSyncInput.checked,
          syncMode: syncMode.value,
          source: pathInput.value.trim()
            ? {
                path: pathInput.value.trim(),
                kind: kind.value,
                ownership: ownership.value,
                importMode: importMode.value
              }
            : null
        }
      });
      pathInput.value = "";
      await load();
      setStatus(statusNode, "Memory settings saved.", "success");
    } catch (error) {
      setStatus(statusNode, `Save failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      save.disabled = false;
    }
  });

  void load().catch((error) => {
    setStatus(statusNode, `Memory settings unavailable: ${safeErrorMessage(error)}`, "error");
  });
}
