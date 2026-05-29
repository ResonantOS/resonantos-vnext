// Intent citation: docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md
// Intent citation: docs/FEATURE_INVENTORY_2026-05-26.md

function addonTone(addon) {
  if (addon.available) return "success";
  return "warning";
}

function addonBoundary(addon) {
  if (addon.boundary) return addon.boundary;
  if (/draft-only/i.test(addon.mode ?? "")) {
    return "Draft-only add-ons can prepare communication or scheduling packets. Sending and scheduling remain human-approval gated.";
  }
  if (addon.mode === "memory-system") {
    return "Memory add-ons are accessed through scoped host APIs. Direct trusted wiki writes remain blocked.";
  }
  if (/coding/i.test(addon.mode ?? "")) {
    return "Coding add-ons receive bounded delegation packets and must return artifacts through ResonantOS.";
  }
  return "Agent add-ons are not trusted core agents. Augmentor mediates delegation and artifact return.";
}

function workspaceForAddon(addon) {
  if (addon.id === "addon.hermes") return "hermes";
  if (addon.id === "addon.opencode") return "opencode";
  if (addon.id === "addon.living-archive") return "memory";
  return "";
}

function createAddonCard(addon, onOpenWorkspace) {
  const card = document.createElement("article");
  card.className = "addon-card";
  card.dataset.tone = addonTone(addon);

  const header = document.createElement("div");
  header.className = "addon-card-header";
  const title = document.createElement("strong");
  title.textContent = addon.name || addon.id || "Unnamed add-on";
  const status = document.createElement("span");
  status.textContent = addon.available ? "Available" : "Missing";
  status.dataset.tone = addonTone(addon);
  header.append(title, status);

  const meta = document.createElement("p");
  meta.textContent = `${addon.mode || "unknown mode"} · ${addon.trust || "explicit grants required"}`;

  const boundary = document.createElement("small");
  boundary.textContent = addonBoundary(addon);

  const actions = document.createElement("div");
  actions.className = "addon-card-actions";
  const workspace = workspaceForAddon(addon);
  if (workspace) {
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = `Open ${addon.name}`;
    open.disabled = !addon.available;
    open.addEventListener("click", () => onOpenWorkspace?.(workspace, addon));
    actions.append(open);
  }

  card.append(header, meta, boundary, actions);
  return card;
}

function createDraftReviewCard(draft, onTransition) {
  const card = document.createElement("article");
  card.className = "addon-draft-card";
  card.dataset.status = draft.status || "draft-only";

  const header = document.createElement("div");
  header.className = "addon-card-header";
  const title = document.createElement("strong");
  title.textContent = draft.intent || draft.id || "Untitled draft";
  const status = document.createElement("span");
  status.textContent = draft.status || "draft-only";
  header.append(title, status);

  const meta = document.createElement("p");
  meta.textContent = `${draft.target || "draft"} · ${draft.path || "no path"}`;

  const boundary = document.createElement("small");
  boundary.textContent = "Review only. Approving marks this draft ready for manual send/schedule; ResonantOS does not execute the external action here.";

  const actions = document.createElement("div");
  actions.className = "addon-card-actions";
  const approve = document.createElement("button");
  approve.type = "button";
  approve.textContent = "Approve for Manual Action";
  approve.disabled = draft.status === "approved-for-manual-send";
  approve.addEventListener("click", () => onTransition?.(draft, "approved-for-manual-send"));
  const reject = document.createElement("button");
  reject.type = "button";
  reject.textContent = "Reject";
  reject.disabled = draft.status === "rejected";
  reject.addEventListener("click", () => onTransition?.(draft, "rejected"));
  actions.append(approve, reject);

  card.append(header, meta, boundary, actions);
  return card;
}

export function renderAddOnsWorkspace({ container, bridgeRequest, onOpenWorkspace }) {
  const section = document.createElement("section");
  section.className = "addons-workspace";
  section.setAttribute("aria-label", "Add-ons workspace");

  const header = document.createElement("header");
  header.className = "addons-hero";
  header.innerHTML = `
    <span class="hero-kicker">Add-on registry</span>
    <h1>Replaceable capabilities, explicit trust.</h1>
    <p>Review the add-ons currently visible to the browser-first host. Add-ons are useful tools, not trusted core agents, and every privileged operation stays mediated by ResonantOS.</p>
  `;

  const status = document.createElement("p");
  status.className = "addons-status";
  status.textContent = "Loading add-on registry...";

  const grid = document.createElement("div");
  grid.className = "addons-grid";

  const draftReview = document.createElement("section");
  draftReview.className = "addon-draft-review";
  const draftHeader = document.createElement("div");
  draftHeader.className = "addon-draft-review-header";
  draftHeader.innerHTML = `
    <div>
      <span class="hero-kicker">Draft approval</span>
      <h2>Email and calendar packets</h2>
      <p>Draft-only add-ons can prepare communication or scheduling packets. Human review can approve them for manual action, but provider sending/scheduling is still not automated here.</p>
    </div>
  `;
  const draftStatus = document.createElement("p");
  draftStatus.className = "addons-status";
  draftStatus.textContent = "Loading draft packets...";
  const draftList = document.createElement("div");
  draftList.className = "addon-draft-list";
  draftReview.append(draftHeader, draftStatus, draftList);

  section.append(header, status, grid, draftReview);
  container.replaceChildren(section);

  const loadDrafts = async () => {
    try {
      const result = await bridgeRequest("/addons/draft/list", { method: "POST", body: { limit: 8 } });
      const drafts = Array.isArray(result.drafts) ? result.drafts : [];
      draftList.replaceChildren();
      drafts.forEach((draft) => draftList.append(createDraftReviewCard(draft, async (selected, nextStatus) => {
        draftStatus.textContent = `Updating ${selected.id}...`;
        draftStatus.dataset.tone = "";
        await bridgeRequest("/addons/draft/transition", {
          method: "POST",
          body: {
            path: selected.path,
            status: nextStatus,
            reason: `Human reviewed ${selected.target} draft from Add-ons workspace.`
          }
        });
        await loadDrafts();
      })));
      draftStatus.textContent = drafts.length
        ? `${drafts.length} draft packet${drafts.length === 1 ? "" : "s"} waiting or reviewed. External send/schedule remains blocked here.`
        : "No email or calendar draft packets yet. Use /email or /calendar from chat to create one.";
      draftStatus.dataset.tone = drafts.length ? "success" : "warning";
    } catch (error) {
      draftStatus.textContent = `Draft review unavailable: ${error instanceof Error ? error.message : String(error)}`;
      draftStatus.dataset.tone = "error";
    }
  };

  void (async () => {
    try {
      const result = await bridgeRequest("/addons/status", { method: "GET" });
      const addons = Array.isArray(result.addons) ? result.addons : [];
      grid.replaceChildren();
      addons.forEach((addon) => grid.append(createAddonCard(addon, onOpenWorkspace)));
      status.textContent = addons.length
        ? `${addons.length} add-ons visible. Missing add-ons stay disabled until installed or configured.`
        : "No add-ons are visible to this browser-first host yet.";
      status.dataset.tone = addons.some((addon) => addon.available) ? "success" : "warning";
    } catch (error) {
      status.textContent = `Add-on registry unavailable: ${error instanceof Error ? error.message : String(error)}`;
      status.dataset.tone = "error";
    }
  })();
  void loadDrafts();

  return section;
}
