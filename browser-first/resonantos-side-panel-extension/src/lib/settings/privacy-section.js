import { noteCard, settingsHeader } from "./settings-common.js";

function permissionRow({ title, boundary, status }) {
  const row = document.createElement("article");
  row.className = "settings-control-row";
  const copy = document.createElement("span");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = boundary;
  copy.append(heading, detail);
  const badge = document.createElement("button");
  badge.type = "button";
  badge.disabled = true;
  badge.textContent = status;
  row.append(copy, badge);
  return row;
}

export function renderPrivacySection(container) {
  const list = document.createElement("div");
  list.className = "settings-control-list";
  list.append(
    permissionRow({
      title: "Provider credentials",
      boundary: "Stored and used through host-mediated provider routes. Raw credentials should never render in the workspace.",
      status: "Vault mediated"
    }),
    permissionRow({
      title: "Living Archive writes",
      boundary: "Source intake, review, draft, verify, and promote remain separate. Add-ons cannot write trusted wiki pages directly.",
      status: "Two-tier writes"
    }),
    permissionRow({
      title: "Browser control",
      boundary: "Augmentor can act on pages only through typed actions, visible status, and approval gates for risky steps.",
      status: "Approval gated"
    }),
    permissionRow({
      title: "Wallet and payments",
      boundary: "Transaction signing, checkout, credential entry, and irreversible public actions are blocked or require explicit human approval.",
      status: "Human approval"
    }),
    permissionRow({
      title: "Diagnostics",
      boundary: "Support reports must redact bridge tokens, provider credentials, wallet material, and private path details.",
      status: "Redacted"
    })
  );

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Privacy and permissions",
      title: "Trust Boundaries",
      body: "Review the core safety boundaries that apply before add-ons, browser actions, providers, memory, or future wallet capabilities can operate."
    }),
    list,
    noteCard({
      title: "Default posture",
      body: "ResonantOS should expose capability, status, and audit trails to the human while keeping privileged operations behind explicit host boundaries.",
      tone: "warning"
    })
  );
}
