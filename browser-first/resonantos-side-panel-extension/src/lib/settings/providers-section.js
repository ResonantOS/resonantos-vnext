import { metricCard, noteCard, safeErrorMessage, setStatus, settingsHeader } from "./settings-common.js";

const knownProviderOrder = ["shared-minimax", "shared-openai"];

function providerSort(left, right) {
  const leftIndex = knownProviderOrder.indexOf(left.id);
  const rightIndex = knownProviderOrder.indexOf(right.id);
  return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
}

function formatLabel(value) {
  return String(value ?? "unknown").replace(/[-_]/g, " ");
}

function modelValue(model) {
  return typeof model === "string" ? model : model.model;
}

function modelLabel(model) {
  return typeof model === "string" ? model : (model.label ?? model.model);
}

function modelBadges(provider) {
  const chain = document.createElement("div");
  chain.className = "settings-route-chain";
  const models = provider.models ?? [];
  if (!models.length) {
    const empty = document.createElement("span");
    empty.className = "settings-route-badge";
    empty.dataset.state = "unavailable";
    empty.textContent = "No models declared";
    chain.append(empty);
    return chain;
  }
  for (const model of models) {
    const badge = document.createElement("span");
    badge.className = "settings-route-badge";
    badge.dataset.state = model.allowed === false ? "disabled" : provider.configured ? "available" : "unavailable";
    badge.textContent = `${modelLabel(model)} · ${formatLabel(model.costTier)} · ${formatLabel(model.qualityTier)}${model.allowed === false ? " · disabled" : ""}`;
    chain.append(badge);
  }
  return chain;
}

function routeConsumerList(provider) {
  const list = document.createElement("ul");
  list.className = "settings-provider-consumers";
  const consumers = provider.routeConsumers ?? [];
  if (!consumers.length) {
    const item = document.createElement("li");
    item.textContent = "No routing strategies currently depend on this provider.";
    list.append(item);
    return list;
  }
  for (const consumer of consumers) {
    const item = document.createElement("li");
    const labelNode = document.createElement("strong");
    labelNode.textContent = consumer.label;
    const detail = document.createElement("span");
    detail.textContent = `${formatLabel(consumer.workload)} · ${consumer.hardStop ? "hard-stop" : "fallback allowed"} · ${consumer.routeState}`;
    item.append(labelNode, detail);
    list.append(item);
  }
  return list;
}

export function diagnosticRecoverySuggestions(entries = []) {
  const byProvider = new Map();
  for (const entry of entries.slice(0, 12)) {
    const key = entry.providerId || entry.label || "unknown";
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key).push(entry);
  }
  const suggestions = [];
  for (const providerEntries of byProvider.values()) {
    const latest = providerEntries[0] ?? {};
    const label = latest.label || latest.providerId || "Provider";
    const authFailures = providerEntries.filter((entry) => entry.state === "auth-failed").length;
    const networkFailures = providerEntries.filter((entry) => ["network-failed", "unreachable"].includes(entry.state)).length;
    if (latest.state === "missing-credential") {
      suggestions.push({
        providerId: latest.providerId,
        state: "missing-credential",
        title: `${label}: save a credential`,
        body: "Add or restore the provider credential in the local vault, then run Test connection again."
      });
      continue;
    }
    if (authFailures >= 2) {
      suggestions.push({
        providerId: latest.providerId,
        state: "auth-failed",
        title: `${label}: credential recovery needed`,
        body: "Update or replace the stored credential, confirm the account/subscription is active, then run Test connection again."
      });
      continue;
    }
    if (networkFailures >= 2) {
      suggestions.push({
        providerId: latest.providerId,
        state: "network-failed",
        title: `${label}: network route unstable`,
        body: "Check internet, VPN, firewall, provider status, or local runtime availability. If this is urgent, switch Routing to an available fallback."
      });
      continue;
    }
    if (latest.state === "reachable") {
      suggestions.push({
        providerId: latest.providerId,
        state: "reachable",
        title: `${label}: no recovery action needed`,
        body: "The provider endpoint was reachable during the latest bounded connectivity test."
      });
    }
  }
  return suggestions;
}

function diagnosticsHistoryPanel() {
  const section = document.createElement("section");
  section.className = "settings-note settings-provider-diagnostics";
  const heading = document.createElement("strong");
  heading.textContent = "Recent provider diagnostics";
  const body = document.createElement("p");
  body.textContent = "Recent connection checks are saved locally with redacted details so repeated failures can be compared without rerunning diagnostics.";
  const recovery = document.createElement("div");
  recovery.className = "settings-provider-recovery";
  const recoveryTitle = document.createElement("small");
  recoveryTitle.textContent = "Suggested recovery";
  const recoveryList = document.createElement("ul");
  recoveryList.className = "settings-provider-recovery-list";
  recovery.append(recoveryTitle, recoveryList);
  const list = document.createElement("ol");
  list.className = "settings-provider-history-list";
  section.append(heading, body, recovery, list);
  return {
    section,
    render(entries = []) {
      recoveryList.replaceChildren();
      for (const suggestion of diagnosticRecoverySuggestions(entries)) {
        const item = document.createElement("li");
        item.className = "settings-provider-recovery-row";
        item.dataset.state = suggestion.state;
        const title = document.createElement("strong");
        title.textContent = suggestion.title;
        const detail = document.createElement("span");
        detail.textContent = suggestion.body;
        item.append(title, detail);
        recoveryList.append(item);
      }
      recovery.hidden = recoveryList.children.length === 0;
      list.replaceChildren();
      const visible = entries.slice(0, 6);
      if (!visible.length) {
        const empty = document.createElement("li");
        empty.className = "settings-work-empty";
        empty.textContent = "No provider diagnostics have been recorded yet.";
        list.append(empty);
        return;
      }
      for (const entry of visible) {
        const item = document.createElement("li");
        item.className = "settings-provider-history-row";
        item.dataset.state = entry.state ?? "unknown";
        const title = document.createElement("strong");
        title.textContent = `${entry.label || entry.providerId || "Provider"} · ${formatLabel(entry.state)}`;
        const meta = document.createElement("small");
        const latency = typeof entry.latencyMs === "number" ? ` · ${entry.latencyMs}ms` : "";
        const status = typeof entry.status === "number" ? ` · HTTP ${entry.status}` : "";
        meta.textContent = `${entry.testedAt || "recently"}${status}${latency}`;
        const detail = document.createElement("span");
        detail.textContent = entry.detail || "No detail recorded.";
        item.append(title, meta, detail);
        list.append(item);
      }
    }
  };
}

function providerCard({ provider, bridgeRequest, statusNode, reload, onSelectSection }) {
  const card = document.createElement("article");
  card.className = "settings-provider-card";
  card.dataset.configured = String(Boolean(provider.configured));

  const heading = document.createElement("div");
  heading.className = "settings-provider-heading";
  const title = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = provider.label;
  const role = document.createElement("p");
  role.textContent = provider.role;
  title.append(label, role);
  const badge = document.createElement("span");
  badge.textContent = provider.configured ? "Ready" : "Missing";
  heading.append(title, badge);

  const auth = document.createElement("p");
  auth.className = "settings-model-list";
  auth.textContent = `Auth: ${formatLabel(provider.authType)} · Credential: ${provider.credentialPreview === "stored" ? "stored in host vault" : "missing"}`;

  const form = document.createElement("form");
  form.className = "settings-provider-form";
  const input = document.createElement("input");
  input.type = "password";
  input.name = "credential";
  input.autocomplete = "off";
  input.placeholder = provider.configured ? "Replace key" : "Paste key";
  input.setAttribute("aria-label", `${provider.label} credential`);
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = provider.configured ? "Update" : "Save";
  form.append(input, save);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credential = input.value.trim();
    if (!credential) {
      setStatus(statusNode, `Add a ${provider.label} credential before saving.`, "warning");
      return;
    }
    save.disabled = true;
    setStatus(statusNode, `Saving ${provider.label} credential...`);
    try {
      await bridgeRequest("/providers/credentials", {
        method: "POST",
        capability: "provider-credential-write",
        body: { providerId: provider.id, credential }
      });
      input.value = "";
      setStatus(statusNode, `${provider.label} credential saved in the local provider vault.`, "success");
      await reload();
    } catch (error) {
      setStatus(statusNode, `Save failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      save.disabled = false;
    }
  });

  const consumersTitle = document.createElement("small");
  consumersTitle.className = "settings-provider-subtitle";
  consumersTitle.textContent = "Used by routing strategies";

  const modelPolicy = document.createElement("form");
  modelPolicy.className = "settings-provider-model-policy";
  const policyTitle = document.createElement("small");
  policyTitle.className = "settings-provider-subtitle";
  policyTitle.textContent = "Allowed models";
  const modelOptions = document.createElement("div");
  modelOptions.className = "settings-provider-model-options";
  for (const model of provider.models ?? []) {
    const labelNode = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "allowedModel";
    checkbox.value = modelValue(model);
    checkbox.checked = model.allowed !== false;
    const text = document.createElement("span");
    text.textContent = modelLabel(model);
    labelNode.append(checkbox, text);
    modelOptions.append(labelNode);
  }
  const savePolicy = document.createElement("button");
  savePolicy.type = "submit";
  savePolicy.textContent = "Save allowed models";
  modelPolicy.append(policyTitle, modelOptions, savePolicy);
  modelPolicy.addEventListener("submit", async (event) => {
    event.preventDefault();
    const allowedModels = [...modelPolicy.querySelectorAll("input[name='allowedModel']:checked")]
      .map((input) => input.value);
    if (!allowedModels.length) {
      setStatus(statusNode, "At least one model must remain allowed for a provider.", "warning");
      return;
    }
    savePolicy.disabled = true;
    setStatus(statusNode, `Saving ${provider.label} allowed-model policy...`);
    try {
      await bridgeRequest("/providers/model-preferences", {
        method: "POST",
        capability: "provider-routing-write",
        body: { providerId: provider.id, allowedModels }
      });
      setStatus(statusNode, `${provider.label} allowed-model policy saved.`, "success");
      await reload();
    } catch (error) {
      setStatus(statusNode, `Allowed-model save failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      savePolicy.disabled = false;
    }
  });

  const actions = document.createElement("div");
  actions.className = "settings-provider-actions";
  const health = document.createElement("button");
  health.type = "button";
  health.textContent = "Check readiness";
  health.addEventListener("click", async () => {
    health.disabled = true;
    setStatus(statusNode, `Checking ${provider.label} readiness...`);
    try {
      const result = await bridgeRequest("/providers/health", {
        method: "POST",
        body: { providerId: provider.id }
      });
      const tone = result.state === "ready" ? "success" : result.state === "degraded" ? "warning" : "error";
      setStatus(statusNode, `${result.label}: ${result.detail}`, tone);
    } catch (error) {
      setStatus(statusNode, `Health check failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      health.disabled = false;
    }
  });
  actions.append(health);
  const connectivity = document.createElement("button");
  connectivity.type = "button";
  connectivity.textContent = "Test connection";
  connectivity.addEventListener("click", async () => {
    connectivity.disabled = true;
    setStatus(statusNode, `Testing ${provider.label} endpoint reachability...`);
    try {
      const result = await bridgeRequest("/providers/connectivity-test", {
        method: "POST",
        body: { providerId: provider.id }
      });
      const tone = result.state === "reachable" ? "success" : result.state === "missing-credential" ? "warning" : "error";
      const latency = typeof result.latencyMs === "number" ? ` · ${result.latencyMs}ms` : "";
      await reload();
      setStatus(statusNode, `${result.label}: ${result.detail}${latency}`, tone);
    } catch (error) {
      setStatus(statusNode, `Connection test failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      connectivity.disabled = false;
    }
  });
  actions.append(connectivity);
  const routing = document.createElement("button");
  routing.type = "button";
  routing.textContent = "Open routing";
  routing.addEventListener("click", () => {
    if (typeof onSelectSection === "function") {
      onSelectSection("routing");
    }
  });
  actions.append(routing);

  card.append(heading, auth, modelBadges(provider), consumersTitle, routeConsumerList(provider), modelPolicy, actions, form);
  return card;
}

export function renderProvidersSection(container, { bridgeRequest, onSelectSection }) {
  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Loading provider profiles...";

  const grid = document.createElement("div");
  grid.className = "settings-provider-grid";
  const vaultGrid = document.createElement("div");
  vaultGrid.className = "settings-health-grid";
  const history = diagnosticsHistoryPanel();

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Providers and models",
      title: "Provider Profiles",
      body: "Configure shared model credentials for Augmentor, Agent Control, and approved add-ons. ResonantOS stores credentials in the local host vault and exposes only health state to the browser extension."
    }),
    statusNode,
    vaultGrid,
    grid,
    history.section,
    noteCard({
      title: "Security boundary",
      body: "Add-ons can request model access, but they do not receive raw provider credentials. The host resolves approved requests through scoped provider grants."
    })
  );

  const load = async () => {
    const [result, historyResult] = await Promise.all([
      bridgeRequest("/providers/status", { method: "GET" }),
      bridgeRequest("/providers/diagnostics-history", { method: "GET" }).catch(() => ({ entries: [] }))
    ]);
    const providers = [...(result.providers ?? [])].sort(providerSort);
    const configuredCount = providers.filter((provider) => provider.configured).length;
    const consumerCount = providers.reduce((total, provider) => total + (provider.routeConsumers?.length ?? 0), 0);
    vaultGrid.replaceChildren(
      metricCard({
        label: "Vault",
        value: result.vault?.configured ? "Created" : "Missing",
        detail: result.vault?.location ?? "host-managed provider vault",
        tone: result.vault?.configured ? "success" : "warning"
      }),
      metricCard({
        label: "Configured",
        value: `${configuredCount}/${providers.length}`,
        detail: "provider profiles with stored credentials",
        tone: configuredCount ? "success" : "warning"
      }),
      metricCard({
        label: "Model routes",
        value: String(consumerCount),
        detail: "routing strategy dependencies shown below"
      })
    );
    grid.replaceChildren(...providers.map((provider) => providerCard({
      provider,
      bridgeRequest,
      statusNode,
      reload: load,
      onSelectSection
    })));
    history.render(historyResult.entries ?? []);
    setStatus(statusNode, providers.length
      ? `${configuredCount}/${providers.length} provider profiles configured.`
      : "No provider profiles are registered.",
      providers.length && providers.every((provider) => provider.configured) ? "success" : "warning"
    );
  };

  void load().catch((error) => {
    setStatus(statusNode, `Provider status unavailable: ${safeErrorMessage(error)}`, "error");
  });
}
