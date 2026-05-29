// Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
// Intent citation: docs/architecture/ADR-027-living-archive-llm-wiki-compliance.md

const formatBytes = (bytes) => {
  const value = Number(bytes ?? 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const kindLabel = (kind) => ({
  "browser-job-report": "Browser Job",
  "browser-control-report": "Agent Control",
  "browser-intake": "Browser Intake",
  intake: "Intake"
}[kind] ?? "Artifact");

export function artifactInsightsFromMarkdown(content) {
  const value = String(content ?? "");
  const lineValue = (label) => {
    const match = new RegExp(`^-\\s*${label}:\\s*(.+)$`, "mi").exec(value);
    return match?.[1]?.trim() ?? "";
  };
  const isWalletDaoAudit = /^#\s*Wallet \/ DAO Audit\b/im.test(value) || /origin:\s*browser-wallet-dao-audit/i.test(value);
  const walletSummary = [
    /Phantom Solana:\s*(.+)$/mi.exec(value)?.[1]?.trim(),
    /Phantom Ethereum:\s*(.+)$/mi.exec(value)?.[1]?.trim()
  ].filter(Boolean).join(" · ");
  const nextHumanAction = /^ {0,5}-\s*next human action:\s*(.+)$/gmi.exec(value)?.[1]?.trim() ?? "";
  const summary = lineValue("summary");
  const phase = lineValue("phase");
  const percentComplete = lineValue("percentComplete");
  const targetSite = lineValue("targetSite");
  const targetReason = lineValue("targetReason");
  const status = lineValue("status");
  return {
    evidenceType: isWalletDaoAudit ? "Wallet / DAO Audit" : "",
    nextHumanAction,
    pageUrl: lineValue("pageUrl"),
    percentComplete,
    phase,
    status,
    summary: summary || (isWalletDaoAudit ? "Read-only wallet/DAO evidence queued for review" : ""),
    targetReason,
    targetSite,
    walletSummary
  };
}

function normalizedArtifactInsights(artifact) {
  const fallback = artifactInsightsFromMarkdown(artifact?.content ?? artifact?.excerpt ?? "");
  return {
    ...fallback,
    ...(artifact?.insights && typeof artifact.insights === "object" ? artifact.insights : {})
  };
}

function setStatus(node, text, tone = "neutral") {
  node.textContent = text;
  node.dataset.tone = tone;
}

function artifactRow(artifact, onOpen) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "artifact-row";
  row.dataset.kind = artifact.kind ?? "intake";
  const title = document.createElement("strong");
  title.textContent = artifact.title || "Untitled artifact";
  const meta = document.createElement("span");
  meta.textContent = `${kindLabel(artifact.kind)} · ${formatBytes(artifact.bytes)} · ${artifact.path}`;
  const excerpt = document.createElement("small");
  excerpt.textContent = artifact.excerpt || "No preview available.";
  row.append(title, meta, excerpt);
  const insights = normalizedArtifactInsights(artifact);
  if (insights.summary || insights.nextHumanAction) {
    const insight = document.createElement("small");
    insight.className = insights.nextHumanAction ? "artifact-row-guidance" : "artifact-row-progress";
    insight.textContent = insights.nextHumanAction
      ? `Next: ${insights.nextHumanAction}`
      : `Progress: ${insights.summary}`;
    row.append(insight);
  }
  row.addEventListener("click", () => onOpen(artifact));
  return row;
}

function actionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function previewArticle(artifact, actions) {
  const article = document.createElement("article");
  article.className = "artifact-preview";
  const heading = document.createElement("div");
  heading.className = "artifact-preview-heading";
  const copy = document.createElement("div");
  const label = document.createElement("span");
  label.className = "module-eyebrow";
  label.textContent = kindLabel(artifact.kind);
  const title = document.createElement("h2");
  title.textContent = artifact.title || "Artifact preview";
  const path = document.createElement("code");
  path.textContent = artifact.path || "INTAKE";
  copy.append(label, title, path);
  const meta = document.createElement("small");
  meta.textContent = `${formatBytes(artifact.bytes)} · ${artifact.modifiedAt || "unknown time"}`;
  heading.append(copy, meta);
  const content = document.createElement("pre");
  content.textContent = artifact.content || "No artifact content returned.";
  const insights = normalizedArtifactInsights(artifact);
  const insightRows = [
    ["Status", insights.status],
    ["Evidence", insights.evidenceType],
    ["Wallet", insights.walletSummary],
    ["Progress", insights.summary],
    ["Phase", insights.phase],
    ["Complete", insights.percentComplete ? `${insights.percentComplete}%` : ""],
    ["Target", [insights.targetSite || insights.pageUrl, insights.targetReason].filter(Boolean).join(" · ")],
    ["Next human action", insights.nextHumanAction]
  ].filter(([, value]) => Boolean(value));
  const insightPanel = document.createElement("section");
  insightPanel.className = "artifact-insights";
  insightPanel.hidden = insightRows.length === 0;
  if (insightRows.length) {
    const insightTitle = document.createElement("strong");
    insightTitle.textContent = "Action Summary";
    insightPanel.append(insightTitle);
    insightRows.forEach(([labelText, value]) => {
      const row = document.createElement("p");
      const label = document.createElement("span");
      label.textContent = labelText;
      const copy = document.createElement("b");
      copy.textContent = value;
      row.append(label, copy);
      insightPanel.append(row);
    });
  }
  const actionRow = document.createElement("div");
  actionRow.className = "artifact-actions";
  actionRow.append(
    actionButton("Copy Path", () => void actions.copyPath(artifact)),
    actionButton("Request Review", () => void actions.requestReview(artifact)),
    actionButton("Continue", () => void actions.continueFrom(artifact))
  );
  article.append(heading, insightPanel, actionRow, content);
  if (artifact.truncated) {
    const truncated = document.createElement("p");
    truncated.className = "artifact-warning";
    truncated.textContent = "Preview truncated for safety. The full artifact remains in Living Archive intake.";
    article.append(truncated);
  }
  return article;
}

export function renderArtifactsWorkspace({ container, bridgeRequest, onContinueArtifact }) {
  const section = document.createElement("section");
  section.className = "artifacts-workspace";
  section.setAttribute("aria-label", "Artifacts workspace");

  const header = document.createElement("header");
  header.className = "artifacts-hero";
  const eyebrow = document.createElement("span");
  eyebrow.className = "module-eyebrow";
  eyebrow.textContent = "Artifacts";
  const title = document.createElement("h1");
  title.textContent = "Reports and intake created by browser work.";
  const body = document.createElement("p");
  body.textContent = "Review completed browser jobs, Agent Control reports, and saved intake without hunting through memory folders. These are evidence artifacts, not trusted wiki pages.";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  header.append(eyebrow, title, body, refresh);

  const layout = document.createElement("div");
  layout.className = "artifacts-layout";
  const list = document.createElement("ol");
  list.className = "artifact-list";
  const preview = document.createElement("div");
  preview.className = "artifact-preview-shell";
  const status = document.createElement("p");
  status.className = "artifact-status";
  layout.append(list, preview);
  section.append(header, status, layout);
  container.append(section);

  const openArtifact = async (artifact) => {
    preview.replaceChildren();
    setStatus(status, `Loading ${artifact.title || artifact.path}…`);
    try {
      const result = await bridgeRequest("/archive/intake/read", {
        method: "POST",
        body: { path: artifact.path }
      });
      preview.append(previewArticle(result, {
        copyPath: async (selected) => {
          try {
            await navigator.clipboard?.writeText?.(selected.path);
            setStatus(status, `Copied ${selected.path}.`, "success");
          } catch {
            setStatus(status, `Path: ${selected.path}`, "warning");
          }
        },
        requestReview: async (selected) => {
          setStatus(status, `Creating review request for ${selected.path}…`);
          try {
            const review = await bridgeRequest("/archive/review/request", {
              method: "POST",
              body: {
                path: selected.path,
                reason: "Evaluate this browser artifact for Living Archive ingestion, contradictions, entities, and durable wiki updates."
              }
            });
            setStatus(status, `Review request created: ${review.path}.`, "success");
          } catch (error) {
            setStatus(status, error instanceof Error ? error.message : String(error), "error");
          }
        },
        continueFrom: async (selected) => {
          if (typeof onContinueArtifact !== "function") {
            setStatus(status, "Continuation is not available in this workspace.", "warning");
            return;
          }
          await onContinueArtifact(selected);
          setStatus(status, `Sent ${selected.path} to Augmentor sidebar continuation.`, "success");
        }
      }));
      setStatus(status, `Previewing ${result.path}.`, "success");
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const loadArtifacts = async () => {
    refresh.disabled = true;
    list.replaceChildren();
    preview.replaceChildren();
    setStatus(status, "Loading intake artifacts…");
    try {
      const result = await bridgeRequest("/archive/intake/list", {
        method: "POST",
        body: { limit: 60 }
      });
      const entries = Array.isArray(result.entries) ? result.entries : [];
      if (!entries.length) {
        setStatus(status, "No browser reports or intake artifacts found yet.", "warning");
        return;
      }
      list.append(...entries.map((entry) => {
        const item = document.createElement("li");
        item.append(artifactRow(entry, openArtifact));
        return item;
      }));
      setStatus(status, `${entries.length} artifact(s) available from ${result.root}.`, "success");
      await openArtifact(entries[0]);
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : String(error), "error");
    } finally {
      refresh.disabled = false;
    }
  };

  refresh.addEventListener("click", () => void loadArtifacts());
  void loadArtifacts();
}
