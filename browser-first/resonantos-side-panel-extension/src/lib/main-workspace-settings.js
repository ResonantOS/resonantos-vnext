const knownProviderOrder = ["shared-minimax", "shared-openai"];

function providerSort(left, right) {
  const leftIndex = knownProviderOrder.indexOf(left.id);
  const rightIndex = knownProviderOrder.indexOf(right.id);
  return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
}

function setStatus(node, message, tone = "") {
  node.textContent = message;
  node.dataset.tone = tone;
}

function providerCard({ provider, bridgeRequest, statusNode, reload }) {
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

  const models = document.createElement("p");
  models.className = "settings-model-list";
  models.textContent = `Models: ${(provider.models ?? []).join(", ") || "not declared"}`;

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
        body: { providerId: provider.id, credential }
      });
      input.value = "";
      setStatus(statusNode, `${provider.label} credential saved in the local provider vault.`, "success");
      await reload();
    } catch (error) {
      setStatus(statusNode, `Save failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      save.disabled = false;
    }
  });

  card.append(heading, models, form);
  return card;
}

export function renderSettingsWorkspace({ container, bridgeRequest }) {
  const section = document.createElement("section");
  section.className = "settings-workspace";
  section.innerHTML = `
    <header class="settings-hero">
      <span class="module-eyebrow">System settings</span>
      <h1>Provider Profiles</h1>
      <p>Configure shared model credentials for Augmentor, Agent Control, and approved add-ons. ResonantOS stores credentials in the local host vault and only exposes health state to the browser extension.</p>
    </header>
  `;

  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Loading provider profiles...";
  const grid = document.createElement("div");
  grid.className = "settings-provider-grid";
  const note = document.createElement("section");
  note.className = "settings-note";
  note.innerHTML = `
    <strong>Security boundary</strong>
    <p>Add-ons can request model access, but they do not receive raw provider credentials. The host resolves approved requests through scoped provider grants.</p>
  `;
  section.append(statusNode, grid, note);
  container.replaceChildren(section);

  const load = async () => {
    const result = await bridgeRequest("/providers/status", { method: "GET" });
    const providers = [...(result.providers ?? [])].sort(providerSort);
    grid.replaceChildren(...providers.map((provider) => providerCard({
      provider,
      bridgeRequest,
      statusNode,
      reload: load
    })));
    setStatus(statusNode, providers.length
      ? `${providers.filter((provider) => provider.configured).length}/${providers.length} provider profiles configured.`
      : "No provider profiles are registered.",
      providers.every((provider) => provider.configured) ? "success" : "warning"
    );
  };

  void load().catch((error) => {
    setStatus(statusNode, `Provider status unavailable: ${error instanceof Error ? error.message : String(error)}`, "error");
  });
}
