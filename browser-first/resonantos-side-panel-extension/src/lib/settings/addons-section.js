import { noteCard, safeErrorMessage, setStatus, settingsHeader } from "./settings-common.js";

function addonTone(addon) {
  if (addon.available || addon.enabled) return "success";
  return "warning";
}

function addonBoundary(addon) {
  if (addon.boundary) return addon.boundary;
  if (/draft-only/i.test(addon.mode ?? "")) {
    return "Draft-only add-ons can prepare packets, but sending and scheduling stay human-approval gated.";
  }
  if (addon.mode === "memory-system") {
    return "Memory add-ons use scoped archive APIs. Direct trusted wiki writes remain blocked.";
  }
  if (/coding/i.test(addon.mode ?? "")) {
    return "Coding add-ons receive bounded delegation packets and return artifacts through ResonantOS.";
  }
  return "Add-ons are replaceable capabilities. They are not trusted core agents unless explicitly granted scoped authority.";
}

function capabilityList(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function uniqueCapabilities(values) {
  return [...new Set(values)];
}

export function capabilityReviewState(addon) {
  const granted = uniqueCapabilities(capabilityList(addon.grantedCapabilities ?? addon.grants));
  const denied = uniqueCapabilities(capabilityList(addon.deniedCapabilities ?? addon.denials));
  const requested = uniqueCapabilities(capabilityList(addon.requestedCapabilities ?? addon.capabilities));
  const pending = uniqueCapabilities([
    ...capabilityList(addon.pendingCapabilities),
    ...requested.filter((capability) => !granted.includes(capability) && !denied.includes(capability))
  ]);
  return { denied, granted, pending, requested };
}

function capabilityGroup(label, state, capabilities) {
  const group = document.createElement("div");
  group.className = "settings-addon-capability-group";
  group.dataset.state = state;
  const title = document.createElement("small");
  title.textContent = label;
  group.append(title);
  for (const capability of capabilities) {
    const chip = document.createElement("span");
    chip.textContent = capability;
    group.append(chip);
  }
  return group;
}

function capabilityReview(addon) {
  const state = capabilityReviewState(addon);
  const wrapper = document.createElement("div");
  wrapper.className = "settings-addon-capabilities";
  const groups = [
    ["Granted", "granted", state.granted],
    ["Needs review", "pending", state.pending],
    ["Denied", "denied", state.denied]
  ].filter(([, , capabilities]) => capabilities.length);
  if (!groups.length) {
    wrapper.append(capabilityGroup("Capability state", "empty", ["explicit grants required"]));
    return wrapper;
  }
  for (const [label, status, capabilities] of groups) {
    wrapper.append(capabilityGroup(label, status, capabilities));
  }
  return wrapper;
}

function addonCard(addon) {
  const card = document.createElement("article");
  card.className = "settings-addon-card";
  card.dataset.tone = addonTone(addon);

  const header = document.createElement("div");
  header.className = "settings-provider-heading";
  const title = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = addon.name || addon.id || "Unnamed add-on";
  const role = document.createElement("p");
  role.textContent = `${addon.mode || "unknown mode"} · ${addon.trust || addon.provenance || "explicit grants required"}`;
  title.append(label, role);
  const badge = document.createElement("span");
  badge.textContent = addon.available || addon.enabled ? "Available" : "Missing";
  header.append(title, badge);

  const boundary = document.createElement("p");
  boundary.textContent = addonBoundary(addon);

  card.append(header, boundary, capabilityReview(addon));
  return card;
}

export function renderAddonsSection(container, { bridgeRequest }) {
  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Loading add-on registry...";
  const grid = document.createElement("div");
  grid.className = "settings-addon-grid";

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Add-ons and permissions",
      title: "Add-on Control",
      body: "Inspect installed add-ons, availability, trust posture, and capability grants. Core Settings shows boundaries; add-on-specific internals stay inside each add-on workspace."
    }),
    statusNode,
    grid,
    noteCard({
      title: "Permission rule",
      body: "Add-ons declare requirements. ResonantOS mediates provider, memory, browser, filesystem, and future wallet access through scoped capability grants."
    })
  );

  const load = async () => {
    const result = await bridgeRequest("/addons/status", { method: "GET" });
    const addons = Array.isArray(result.addons) ? result.addons : [];
    grid.replaceChildren(...addons.map(addonCard));
    setStatus(statusNode, addons.length
      ? `${addons.filter((addon) => addon.available || addon.enabled).length}/${addons.length} add-ons available. Missing add-ons stay disabled until installed or configured.`
      : "No add-ons are visible to this browser-first host yet.",
      addons.some((addon) => addon.available || addon.enabled) ? "success" : "warning"
    );
  };

  void load().catch((error) => {
    setStatus(statusNode, `Add-on registry unavailable: ${safeErrorMessage(error)}`, "error");
  });
}
