// Intent citation: docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md
// Intent citation: docs/FEATURE_INVENTORY_2026-05-26.md

function addonTone(addon) {
  if (addon.available) return "success";
  return "warning";
}

function addonBoundary(addon) {
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

  section.append(header, status, grid);
  container.replaceChildren(section);

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

  return section;
}
