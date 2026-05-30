import { metricCard, noteCard, safeErrorMessage, setStatus, settingsHeader } from "./settings-common.js";

const knownProviderOrder = ["shared-minimax", "shared-openai"];

function providerSort(left, right) {
  const leftIndex = knownProviderOrder.indexOf(left.id);
  const rightIndex = knownProviderOrder.indexOf(right.id);
  const order = (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  return order || String(left.label ?? "").localeCompare(String(right.label ?? ""));
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

const providerTypePresets = {
  minimax: {
    label: "MiniMax",
    providerType: "minimax",
    category: "Direct providers",
    apiBaseUrl: "https://api.minimax.io/v1",
    models: ["MiniMax-M2.7-highspeed", "MiniMax-M2.7"],
  },
  openai: {
    label: "OpenAI",
    providerType: "openai",
    category: "Direct providers",
    apiBaseUrl: "https://api.openai.com/v1",
    models: ["gpt-5.5", "gpt-5.4-mini"],
  },
  anthropic: {
    label: "Anthropic",
    providerType: "anthropic",
    category: "Direct providers",
    apiBaseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4.5", "claude-haiku-4.5"],
  },
  gemini: {
    label: "Google Gemini",
    providerType: "google",
    category: "Direct providers",
    apiBaseUrl: "https://generativelanguage.googleapis.com",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemma"],
  },
  xai: {
    label: "xAI",
    providerType: "openai-compatible",
    category: "Direct providers",
    apiBaseUrl: "https://api.x.ai/v1",
    models: ["grok-4", "grok-3"],
  },
  deepseek: {
    label: "DeepSeek",
    providerType: "openai-compatible",
    category: "Direct providers",
    apiBaseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  mistral: {
    label: "Mistral AI",
    providerType: "openai-compatible",
    category: "Direct providers",
    apiBaseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-small-latest", "open-mixtral"],
  },
  qwen: {
    label: "Alibaba / Qwen",
    providerType: "openai-compatible",
    category: "Direct providers",
    apiBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
  },
  cohere: {
    label: "Cohere",
    providerType: "custom",
    category: "Direct providers",
    apiBaseUrl: "https://api.cohere.com",
    models: ["command-r-plus", "command-r"],
  },
  ai21: {
    label: "AI21 Labs",
    providerType: "custom",
    category: "Direct providers",
    apiBaseUrl: "https://api.ai21.com/studio/v1",
    models: ["jamba-large", "jamba-mini"],
  },
  "nvidia-nim": {
    label: "NVIDIA Nemotron / NIM",
    providerType: "openai-compatible",
    category: "Direct providers",
    apiBaseUrl: "https://integrate.api.nvidia.com/v1",
    models: ["nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/nemotron"],
  },
  "microsoft-azure": {
    label: "Microsoft Azure AI",
    providerType: "openai-compatible",
    category: "Direct providers",
    apiBaseUrl: "",
    models: ["azure-model-deployment"],
  },
  openrouter: {
    label: "OpenRouter",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-5.5", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-pro"],
  },
  together: {
    label: "Together AI",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "https://api.together.xyz/v1",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-R1"],
  },
  huggingface: {
    label: "Hugging Face",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "",
    models: ["hf-model-id"],
  },
  replicate: {
    label: "Replicate",
    providerType: "custom",
    category: "Aggregators and gateways",
    apiBaseUrl: "https://api.replicate.com",
    models: ["replicate-model-version"],
  },
  groq: {
    label: "Groq",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  },
  fireworks: {
    label: "Fireworks AI",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "https://api.fireworks.ai/inference/v1",
    models: ["accounts/fireworks/models/llama-v3p1-70b-instruct"],
  },
  hyperbolic: {
    label: "Hyperbolic",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "https://api.hyperbolic.xyz/v1",
    models: ["meta-llama/Meta-Llama-3.1-70B-Instruct"],
  },
  "cloudflare-ai-gateway": {
    label: "Cloudflare AI Gateway",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "",
    models: ["gateway-model-id"],
  },
  litellm: {
    label: "LiteLLM Gateway",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "http://127.0.0.1:4000/v1",
    models: ["configured-model-alias"],
  },
  bifrost: {
    label: "Bifrost by Maxim AI",
    providerType: "openai-compatible",
    category: "Aggregators and gateways",
    apiBaseUrl: "",
    models: ["bifrost-model-alias"],
  },
  ollama: {
    label: "Ollama",
    providerType: "local",
    category: "Local software",
    apiBaseUrl: "http://127.0.0.1:11434",
    models: ["batiai/gemma4-e2b:q4"],
  },
  "lm-studio": {
    label: "LM Studio",
    providerType: "local",
    category: "Local software",
    apiBaseUrl: "http://127.0.0.1:1234/v1",
    models: ["local-model"],
  },
  "localai": {
    label: "LocalAI",
    providerType: "openai-compatible",
    category: "Local software",
    apiBaseUrl: "http://127.0.0.1:8080/v1",
    models: ["local-model"],
  },
  "llama-cpp": {
    label: "llama.cpp server",
    providerType: "openai-compatible",
    category: "Local software",
    apiBaseUrl: "http://127.0.0.1:8080/v1",
    models: ["local-model"],
  },
  vllm: {
    label: "vLLM",
    providerType: "openai-compatible",
    category: "Local software",
    apiBaseUrl: "http://127.0.0.1:8000/v1",
    models: ["local-model"],
  },
  "text-generation-webui": {
    label: "Text Generation WebUI",
    providerType: "openai-compatible",
    category: "Local software",
    apiBaseUrl: "http://127.0.0.1:5000/v1",
    models: ["local-model"],
  },
  "dgx-spark": {
    label: "NVIDIA DGX Spark",
    providerType: "local",
    category: "User-owned machines",
    apiBaseUrl: "http://dgx-spark.local:11434",
    models: ["local-model"],
  },
  "asus-gx10": {
    label: "ASUS GX10",
    providerType: "openai-compatible",
    category: "User-owned machines",
    apiBaseUrl: "http://192.168.1.77:30004/v1",
    models: ["Qwen3.6-35B-A3B-Q4_K_M.gguf"],
  },
  "openai-compatible": {
    label: "OpenAI-Compatible API",
    providerType: "openai-compatible",
    category: "Custom",
    apiBaseUrl: "",
    models: ["model-id"],
  },
};

function providerTypeLabel(provider) {
  const type = provider.templateId ?? provider.providerType ?? provider.type ?? "minimax";
  return providerTypePresets[type]?.label ?? formatLabel(type);
}

function providerModelsText(provider) {
  return (provider.models ?? [])
    .map((model) => modelValue(model))
    .filter(Boolean)
    .join("\n");
}

function parseModelsText(value) {
  return [...new Set(String(value ?? "")
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean))]
    .slice(0, 12);
}

function labeledField({ label, input }) {
  const wrapper = document.createElement("label");
  wrapper.className = "settings-provider-field";
  const caption = document.createElement("span");
  caption.textContent = label;
  wrapper.append(caption, input);
  return wrapper;
}

function providerAccountPayload(form, provider = {}) {
  const FormDataCtor = form.ownerDocument?.defaultView?.FormData ?? FormData;
  const data = new FormDataCtor(form);
  const templateId = String(data.get("templateId") ?? provider.templateId ?? provider.providerType ?? "minimax").trim();
  const preset = providerTypePresets[templateId] ?? providerTypePresets.minimax;
  return {
    id: provider.id,
    mode: provider.id ? "update" : "create",
    templateId,
    label: String(data.get("label") ?? "").trim(),
    providerType: preset.providerType,
    authType: "api-key",
    apiBaseUrl: String(data.get("apiBaseUrl") ?? "").trim(),
    role: String(data.get("role") ?? "").trim(),
    models: parseModelsText(data.get("models")),
    credential: String(data.get("credential") ?? "").trim(),
  };
}

function providerAccountForm(provider = {}) {
  const form = document.createElement("form");
  form.className = "settings-provider-account-form";

  const name = document.createElement("input");
  name.name = "label";
  name.required = true;
  name.placeholder = "MiniMax fast account";
  name.value = provider.label ?? "";

  const template = document.createElement("select");
  template.name = "templateId";
  let currentCategory = "";
  for (const [value, preset] of Object.entries(providerTypePresets)) {
    if (preset.category !== currentCategory) {
      currentCategory = preset.category;
      const group = document.createElement("option");
      group.disabled = true;
      group.textContent = `-- ${currentCategory} --`;
      template.append(group);
    }
    const option = document.createElement("option");
    option.value = value;
    option.textContent = preset.label;
    template.append(option);
  }
  template.value = provider.templateId ?? provider.providerType ?? "minimax";

  const apiBaseUrl = document.createElement("input");
  apiBaseUrl.name = "apiBaseUrl";
  apiBaseUrl.placeholder = "https://api.provider.com/v1";
  apiBaseUrl.value = provider.apiBaseUrl ?? providerTypePresets[template.value]?.apiBaseUrl ?? "";

  const role = document.createElement("input");
  role.name = "role";
  role.placeholder = "Fast Augmentor account, routine account, archive account...";
  role.value = provider.role ?? "";

  const models = document.createElement("textarea");
  models.name = "models";
  models.rows = 4;
  models.placeholder = "One model per line";
  models.value = providerModelsText(provider) || providerTypePresets[template.value]?.models.join("\n") || "";

  const credential = document.createElement("input");
  credential.name = "credential";
  credential.type = "password";
  credential.autocomplete = "off";
  credential.placeholder = provider.id ? "Leave blank to keep current credential" : "Paste account API key";

  template.addEventListener("change", () => {
    const preset = providerTypePresets[template.value] ?? providerTypePresets.minimax;
    name.placeholder = `${preset.label} account`;
    apiBaseUrl.value = preset.apiBaseUrl;
    models.value = preset.models.join("\n");
  });

  const grid = document.createElement("div");
  grid.className = "settings-provider-account-grid";
  grid.append(
    labeledField({ label: "Account name", input: name }),
    labeledField({ label: "Provider template", input: template }),
    labeledField({ label: "API base URL", input: apiBaseUrl }),
    labeledField({ label: "Role / cost note", input: role }),
    labeledField({ label: "Models enabled for this account", input: models }),
    labeledField({ label: provider.id ? "Replace credential" : "Credential", input: credential }),
  );
  form.append(grid);
  return form;
}

function openProviderAccountModal({ bridgeRequest, statusNode, reload }) {
  const overlay = document.createElement("div");
  overlay.className = "settings-provider-modal";
  const panel = document.createElement("section");
  panel.className = "settings-provider-modal-panel";
  const heading = document.createElement("div");
  heading.className = "settings-provider-modal-heading";
  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = "Add provider account";
  const body = document.createElement("p");
  body.textContent = "Create a separate account block for every subscription, API key, or local runtime. Multiple accounts can share the same provider type.";
  title.append(strong, body);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  heading.append(title, close);
  const form = providerAccountForm();
  const actions = document.createElement("div");
  actions.className = "settings-provider-modal-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save account";
  actions.append(save);
  form.append(actions);
  panel.append(heading, form);
  overlay.append(panel);
  document.body.append(overlay);
  close.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    setStatus(statusNode, "Saving provider account...");
    try {
      await bridgeRequest("/providers/accounts", {
        method: "POST",
        capability: "provider-credential-write",
        body: providerAccountPayload(form),
      });
      overlay.remove();
      setStatus(statusNode, "Provider account saved.", "success");
      await reload();
    } catch (error) {
      setStatus(statusNode, `Provider account save failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      save.disabled = false;
    }
  });
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

  const summary = document.createElement("div");
  summary.className = "settings-provider-summary";
  const type = document.createElement("span");
  type.textContent = providerTypeLabel(provider);
  const modelsCount = document.createElement("span");
  modelsCount.textContent = `${(provider.models ?? []).length} model${(provider.models ?? []).length === 1 ? "" : "s"}`;
  const badge = document.createElement("span");
  badge.textContent = provider.configured ? "Ready" : "Missing";
  badge.dataset.state = provider.configured ? "ready" : "missing";
  summary.append(type, modelsCount, badge);
  heading.append(title, summary);

  const meta = document.createElement("p");
  meta.className = "settings-model-list";
  meta.textContent = `Provider type: ${providerTypeLabel(provider)} · Account ID: ${provider.id} · ${provider.source === "user" ? "user account" : "built-in account"}`;

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

  const detailsPanel = document.createElement("div");
  detailsPanel.className = "settings-provider-panel";
  detailsPanel.hidden = true;
  const consumersTitle = document.createElement("small");
  consumersTitle.className = "settings-provider-subtitle";
  consumersTitle.textContent = "Used by routing strategies";
  detailsPanel.append(meta, auth, modelBadges(provider), consumersTitle, routeConsumerList(provider));

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

  const editPanel = document.createElement("div");
  editPanel.className = "settings-provider-panel settings-provider-panel-edit";
  editPanel.hidden = true;
  const editForm = providerAccountForm(provider);
  const editActions = document.createElement("div");
  editActions.className = "settings-provider-actions";
  const editSave = document.createElement("button");
  editSave.type = "submit";
  editSave.textContent = "Save account settings";
  editActions.append(editSave);
  editForm.append(editActions);
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    editSave.disabled = true;
    setStatus(statusNode, `Saving ${provider.label} account settings...`);
    try {
      await bridgeRequest("/providers/accounts", {
        method: "POST",
        capability: "provider-credential-write",
        body: providerAccountPayload(editForm, provider)
      });
      setStatus(statusNode, `${provider.label} account settings saved.`, "success");
      await reload();
    } catch (error) {
      setStatus(statusNode, `Account settings save failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      editSave.disabled = false;
    }
  });
  editPanel.append(editForm, modelPolicy, form);

  const actions = document.createElement("div");
  actions.className = "settings-provider-actions settings-provider-row-actions";
  const show = document.createElement("button");
  show.type = "button";
  show.textContent = "Show";
  show.dataset.action = "show-provider";
  show.addEventListener("click", () => {
    detailsPanel.hidden = !detailsPanel.hidden;
    show.textContent = detailsPanel.hidden ? "Show" : "Hide";
  });
  actions.append(show);
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.dataset.action = "edit-provider";
  edit.addEventListener("click", () => {
    editPanel.hidden = !editPanel.hidden;
    edit.textContent = editPanel.hidden ? "Edit" : "Close edit";
  });
  actions.append(edit);
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

  card.append(heading, actions, detailsPanel, editPanel);
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
  const toolbar = document.createElement("div");
  toolbar.className = "settings-provider-toolbar";
  const addProvider = document.createElement("button");
  addProvider.type = "button";
  addProvider.className = "settings-primary-action";
  addProvider.textContent = "Add provider account";
  toolbar.append(addProvider);

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Providers and models",
      title: "Provider Profiles",
      body: "Configure model accounts for Augmentor, Agent Control, and approved add-ons. ResonantOS stores each account credential in the local host vault and exposes only health state to the browser extension."
    }),
    toolbar,
    statusNode,
    vaultGrid,
    grid,
    history.section,
    noteCard({
      title: "Security boundary",
      body: "Add-ons can request model access, but they do not receive raw provider credentials. The host resolves approved requests through scoped provider grants."
    })
  );

  addProvider.addEventListener("click", () => openProviderAccountModal({
    bridgeRequest,
    statusNode,
    reload: load,
  }));

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
