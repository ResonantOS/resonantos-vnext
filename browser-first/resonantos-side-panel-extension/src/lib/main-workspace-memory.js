// Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
// Intent citation: docs/architecture/ADR-027-living-archive-llm-wiki-compliance.md

const formatCount = (value) => Number(value ?? 0).toLocaleString();

function metric(label, value, meta = "") {
  const node = document.createElement("div");
  node.className = "memory-metric";
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  const metaNode = document.createElement("small");
  metaNode.textContent = meta;
  node.append(labelNode, valueNode, metaNode);
  return node;
}

function resultCard(match) {
  const card = document.createElement("article");
  card.className = "memory-result";
  const title = document.createElement("strong");
  title.textContent = match.title || "Untitled memory page";
  const path = document.createElement("code");
  path.textContent = match.path || "AI_MEMORY";
  const excerpt = document.createElement("p");
  excerpt.textContent = match.excerpt || "No excerpt returned.";
  card.append(title, path, excerpt);
  return card;
}

function wikiHealthCard(health, onRefresh, onRunLint) {
  const card = document.createElement("section");
  card.className = "memory-card memory-wiki-health";
  const top = document.createElement("div");
  top.className = "memory-review-top";
  const label = document.createElement("label");
  label.textContent = "Wiki Health";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  refresh.addEventListener("click", onRefresh);
  const lint = document.createElement("button");
  lint.type = "button";
  lint.textContent = "Run Lint";
  lint.addEventListener("click", onRunLint);
  top.append(label, refresh, lint);

  const score = document.createElement("p");
  score.className = "memory-status";
  const issueCount = Array.isArray(health?.issues) ? health.issues.length : 0;
  score.dataset.tone = !health?.exists ? "error" : issueCount ? "warning" : "success";
  score.textContent = health?.exists
    ? `Health ${health.score ?? 0}/100 · ${formatCount(health.pages)} page(s) · ${issueCount} issue(s).`
    : "AI_MEMORY/wiki is missing.";

  const summary = document.createElement("div");
  summary.className = "memory-health-summary";
  summary.append(
    metric("Index", health?.index?.exists ? "Present" : "Missing", `${formatCount(health?.index?.entries)} linked entries`),
    metric("Log", health?.log?.exists ? "Present" : "Missing", health?.log?.modifiedAt || "no timestamp"),
    metric("Broken links", formatCount(health?.brokenLinks?.length), "sampled"),
    metric("Orphans", formatCount(health?.orphanPages?.length), "sampled")
  );

  const list = document.createElement("ol");
  list.className = "memory-health-issues";
  const issues = Array.isArray(health?.issues) ? health.issues : [];
  if (!issues.length && health?.exists) {
    const item = document.createElement("li");
    item.textContent = "No wiki structure issues found in this scan.";
    list.append(item);
  } else {
    for (const issue of issues.slice(0, 8)) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = issue.type || issue.severity || "issue";
      const body = document.createElement("span");
      body.textContent = issue.message || "Review this wiki health issue.";
      item.append(title, body);
      list.append(item);
    }
  }

  card.append(top, score, summary, list);
  return card;
}

function pipelineStep(label, state, detail = "") {
  const node = document.createElement("li");
  node.className = "memory-pipeline-step";
  node.dataset.state = state;
  const marker = document.createElement("span");
  marker.className = "memory-pipeline-marker";
  marker.setAttribute("aria-hidden", "true");
  const labelNode = document.createElement("strong");
  labelNode.textContent = label;
  const detailNode = document.createElement("small");
  detailNode.textContent = detail;
  node.append(marker, labelNode, detailNode);
  return node;
}

function reviewPipeline(request) {
  const node = document.createElement("ol");
  node.className = "memory-pipeline";
  node.setAttribute("aria-label", "Archive pipeline timeline");
  const reviewStatus = request.status || "pending";
  const verificationStatus = request.draftVerificationStatus || "";
  const promotionStatus = request.promotionStatus || "";
  const rollbackStatus = request.rollbackStatus || "";
  const revisionStatus = request.draftRevisionStatus || "";
  const hasDraft = Boolean(request.draftArtifactPath);

  const reviewState = reviewStatus === "approved"
    ? "complete"
    : reviewStatus === "rejected"
      ? "blocked"
      : reviewStatus === "in-progress"
        ? "active"
        : "waiting";
  const draftState = hasDraft ? "complete" : reviewStatus === "approved" ? "active" : "waiting";
  const verifyState = verificationStatus === "verified"
    ? "complete"
    : verificationStatus === "needs-revision"
      ? "blocked"
      : hasDraft
        ? "active"
        : "waiting";
  const reviseState = revisionStatus === "revised" || request.supersedesDraftPath
    ? "complete"
    : verificationStatus === "needs-revision"
      ? "active"
      : "waiting";
  const promoteState = promotionStatus === "promoted"
    ? "complete"
    : verificationStatus === "verified"
      ? "active"
      : "waiting";
  const restoreState = rollbackStatus === "restored" ? "complete" : request.backupPath ? "available" : "waiting";

  node.append(
    pipelineStep("Intake", request.artifactPath ? "complete" : "blocked", request.artifactPath ? "source captured" : "missing source"),
    pipelineStep("Review", reviewState, reviewStatus),
    pipelineStep("Draft", draftState, hasDraft ? "artifact ready" : "not generated"),
    pipelineStep("Verify", verifyState, verificationStatus || "not run"),
    pipelineStep("Revise", reviseState, revisionStatus || (verificationStatus === "needs-revision" ? "needed" : "optional")),
    pipelineStep("Promote", promoteState, promotionStatus || "blocked until verified"),
    pipelineStep("Restore", restoreState, rollbackStatus || (request.backupPath ? "backup available" : "no backup"))
  );
  return node;
}

function reviewRequestCard(request, onTransition, onDraft, onPreviewDraft) {
  const card = document.createElement("article");
  card.className = "memory-review-request";
  const heading = document.createElement("div");
  heading.className = "memory-review-heading";
  const title = document.createElement("strong");
  title.textContent = request.title || "Untitled review request";
  const status = document.createElement("span");
  status.textContent = request.status || "pending";
  heading.append(title, status);
  const artifact = document.createElement("code");
  artifact.textContent = request.artifactPath || request.path || "REVIEW/requests";
  const draft = document.createElement("code");
  draft.className = "memory-review-draft";
  draft.textContent = request.draftArtifactPath ? `draft: ${request.draftArtifactPath}` : "draft: not generated";
  const reason = document.createElement("p");
  reason.textContent = request.reason || "No review reason recorded.";
  const pipeline = reviewPipeline(request);
  const actions = document.createElement("div");
  actions.className = "memory-review-actions";
  const makeAction = (label, nextStatus) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.reviewStatus = nextStatus;
    button.disabled = request.status === nextStatus;
    button.addEventListener("click", () => onTransition(request, nextStatus));
    return button;
  };
  actions.append(
    makeAction("Start", "in-progress"),
    makeAction("Approve", "approved"),
    makeAction("Reject", "rejected")
  );
  const draftButton = document.createElement("button");
  draftButton.type = "button";
  draftButton.textContent = request.draftArtifactPath ? "Drafted" : "Draft";
  draftButton.disabled = request.status !== "approved" || Boolean(request.draftArtifactPath);
  draftButton.addEventListener("click", () => onDraft(request));
  actions.append(draftButton);
  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.textContent = "Preview";
  previewButton.disabled = !request.draftArtifactPath;
  previewButton.addEventListener("click", () => onPreviewDraft(request));
  actions.append(previewButton);
  card.append(heading, artifact, draft, reason, pipeline, actions);
  return card;
}

function promotionCard(entry, onRestore) {
  const card = document.createElement("article");
  card.className = "memory-promotion-card";
  const heading = document.createElement("div");
  heading.className = "memory-promotion-heading";
  const title = document.createElement("strong");
  title.textContent = entry.title || "Promoted wiki update";
  const status = document.createElement("span");
  status.textContent = entry.status || "promoted";
  heading.append(title, status);
  const page = document.createElement("code");
  page.textContent = entry.promotedPage || "AI_MEMORY/wiki";
  const meta = document.createElement("p");
  meta.textContent = entry.promotedAt
    ? `Promoted ${entry.promotedAt}`
    : "Promotion time not recorded.";
  card.append(heading, page, meta);
  if (entry.backupPath) {
    const backup = document.createElement("code");
    backup.textContent = `backup: ${entry.backupPath}`;
    card.append(backup);
  }
  if (entry.rollbackStatus === "restored") {
    const restored = document.createElement("p");
    restored.textContent = entry.restoredAt
      ? `Restored from backup ${entry.restoredAt}.`
      : "Restored from backup.";
    card.append(restored);
  }
  const actions = document.createElement("div");
  actions.className = "memory-review-actions";
  const restoreButton = document.createElement("button");
  restoreButton.type = "button";
  restoreButton.textContent = entry.rollbackStatus === "restored" ? "Restored" : "Restore Backup";
  restoreButton.disabled = !entry.backupPath || entry.rollbackStatus === "restored";
  restoreButton.addEventListener("click", () => onRestore(entry));
  actions.append(restoreButton);
  card.append(actions);
  return card;
}

function sourceCard(source, onReview, onCreateIntake, onVersions) {
  const card = document.createElement("article");
  card.className = "memory-source-card";
  if (source.disabledAt) {
    card.dataset.disabled = "true";
  }
  const heading = document.createElement("div");
  heading.className = "memory-promotion-heading";
  const title = document.createElement("strong");
  title.textContent = source.path || "Unnamed source";
  const status = document.createElement("span");
  status.textContent = source.disabledAt ? "disabled" : source.exists ? "connected" : "missing";
  heading.append(title, status);
  const meta = document.createElement("p");
  meta.textContent = `${source.kind || "folder"} · ${source.ownership || "mixed-library"} · ${source.importMode || "copy-on-import"}`;
  const actions = document.createElement("div");
  actions.className = "memory-review-actions";
  const reviewButton = document.createElement("button");
  reviewButton.type = "button";
  reviewButton.textContent = "Review Source";
  reviewButton.disabled = Boolean(source.disabledAt) || !source.exists;
  reviewButton.addEventListener("click", () => onReview(source));
  const intakeButton = document.createElement("button");
  intakeButton.type = "button";
  intakeButton.textContent = "Create Intake Summary";
  intakeButton.disabled = Boolean(source.disabledAt) || !source.exists;
  intakeButton.addEventListener("click", () => onCreateIntake(source));
  const versionsButton = document.createElement("button");
  versionsButton.type = "button";
  versionsButton.textContent = "Versions";
  versionsButton.addEventListener("click", () => onVersions(source));
  actions.append(reviewButton, intakeButton, versionsButton);
  card.append(heading, meta, actions);
  return card;
}

function sourceVersionsCard(source, result) {
  const card = document.createElement("article");
  card.className = "memory-review-preview";
  const heading = document.createElement("div");
  heading.className = "memory-preview-heading";
  const title = document.createElement("strong");
  title.textContent = `Source versions: ${source.path || source.id}`;
  const meta = document.createElement("code");
  meta.textContent = result.updatedAt ? `manifest updated ${result.updatedAt}` : "no source version manifest yet";
  heading.append(title, meta);
  const list = document.createElement("ol");
  list.className = "memory-source-candidates";
  const entries = Array.isArray(result.entries) ? result.entries : [];
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.textContent = "No imported source-file versions recorded for this source yet.";
    list.append(empty);
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = [
      `v${entry.latestVersion ?? 0}`,
      entry.sourceFile || "unknown file",
      entry.latestModifiedAt || "unknown source modified time",
      `${String(entry.latestHash ?? "").slice(0, 12)}…`
    ].join(" · ");
    list.append(item);
  }
  card.append(heading, list);
  return card;
}

function sourceReviewCard(review, onImportFiles, onPreviewDiff) {
  const card = document.createElement("article");
  card.className = "memory-review-preview";
  const heading = document.createElement("div");
  heading.className = "memory-preview-heading";
  const title = document.createElement("strong");
  title.textContent = review.source?.path || "Source review";
  const sourceId = document.createElement("code");
  sourceId.textContent = review.source?.id || "source";
  heading.append(title, sourceId);
  const categories = review.scan?.categories ?? {};
  const summary = document.createElement("p");
  summary.textContent = [
    `${review.scan?.totalScanned ?? 0} scanned`,
    `${categories.compatible ?? 0} compatible`,
    `${categories.processed ?? 0} processed`,
    `${categories["raw-audio"] ?? 0} raw audio`,
    `${categories.unsupported ?? 0} unsupported`
  ].join(" · ");
  const boundary = document.createElement("p");
  boundary.textContent = review.boundary || "Source review is read-only.";
  const recommendation = document.createElement("p");
  recommendation.textContent = review.scan?.recommendation || "Review before intake.";

  const filterBar = document.createElement("div");
  filterBar.className = "memory-source-filterbar";
  const categoryFilter = document.createElement("select");
  categoryFilter.setAttribute("aria-label", "Filter source candidates by category");
  categoryFilter.append(
    optionNode("all", "All candidates"),
    optionNode("compatible", "Compatible"),
    optionNode("processed", "Processed"),
    optionNode("raw-audio", "Raw audio"),
    optionNode("unsupported", "Unsupported")
  );
  const textFilter = document.createElement("input");
  textFilter.type = "search";
  textFilter.placeholder = "Filter by filename or folder";
  textFilter.setAttribute("aria-label", "Filter source candidates by text");
  const count = document.createElement("small");
  filterBar.append(categoryFilter, textFilter, count);

  const list = document.createElement("ol");
  list.className = "memory-source-candidates";
  const selected = new Set();
  const candidates = review.candidates ?? [];

  const renderCandidates = () => {
    list.replaceChildren();
    const category = categoryFilter.value;
    const query = textFilter.value.trim().toLowerCase();
    const visible = candidates.filter((candidate) =>
      (category === "all" || candidate.category === category) &&
      (!query || String(candidate.path ?? "").toLowerCase().includes(query))
    );
    const groups = new Map();
    for (const candidate of visible) {
      const folder = String(candidate.path ?? "").includes("/")
        ? String(candidate.path).split("/").slice(0, -1).join("/")
        : "root";
      const entries = groups.get(folder) ?? [];
      entries.push(candidate);
      groups.set(folder, entries);
    }
    for (const [folder, entries] of groups) {
      const group = document.createElement("li");
      group.className = "memory-source-candidate-group";
      const groupTitle = document.createElement("strong");
      groupTitle.textContent = `${folder} · ${entries.length}`;
      const nested = document.createElement("ol");
      for (const candidate of entries) {
        nested.append(sourceCandidateItem(candidate, selected, onPreviewDiff));
      }
      group.append(groupTitle, nested);
      list.append(group);
    }
    if (!visible.length) {
      const item = document.createElement("li");
      item.textContent = candidates.length
        ? "No source candidates match the current filters."
        : "No directly compatible candidate files found in the review sample.";
      list.append(item);
    }
    count.textContent = `${visible.length}/${candidates.length} candidate(s) visible`;
  };
  categoryFilter.addEventListener("change", renderCandidates);
  textFilter.addEventListener("input", renderCandidates);
  renderCandidates();

  const actions = document.createElement("div");
  actions.className = "memory-review-actions";
  const importChangedButton = document.createElement("button");
  importChangedButton.type = "button";
  importChangedButton.textContent = "Create Intake From New/Changed Files";
  const changedFiles = candidates
    .filter((candidate) =>
      candidate.category === "compatible" &&
      candidate.versionStatus !== "unchanged"
    )
    .map((candidate) => candidate.path);
  importChangedButton.disabled = changedFiles.length === 0;
  importChangedButton.addEventListener("click", () => onImportFiles(review, changedFiles));
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "Create Intake From Selected Files";
  importButton.addEventListener("click", () => onImportFiles(review, [...selected]));
  actions.append(importChangedButton, importButton);
  card.append(heading, summary, boundary, recommendation, filterBar, list, actions);
  return card;
}

function optionNode(value, text) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = text;
  return node;
}

function sourceCandidateItem(candidate, selected, onPreviewDiff) {
  const item = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = candidate.path;
    input.disabled = candidate.category !== "compatible";
    input.checked = selected.has(candidate.path);
    input.addEventListener("change", () => {
      if (input.checked) selected.add(candidate.path);
      else selected.delete(candidate.path);
    });
    const text = document.createElement("span");
    const versionLabel = candidate.versionStatus
      ? ` · ${candidate.versionStatus}${candidate.sourceVersion ? ` v${candidate.sourceVersion}` : ""}`
      : "";
    text.textContent = `${candidate.category}${versionLabel} · ${candidate.path} · ${formatCount(candidate.bytes)} bytes`;
    label.append(input, text);
    item.append(label);
    if (candidate.category === "compatible" && candidate.previousSourceContentHash) {
      const diffButton = document.createElement("button");
      diffButton.type = "button";
      diffButton.textContent = "Diff";
      diffButton.addEventListener("click", () => onPreviewDiff(candidate));
      item.append(diffButton);
    }
  return item;
}

function sourceDiffCard(result) {
  const card = document.createElement("article");
  card.className = "memory-review-preview";
  const heading = document.createElement("div");
  heading.className = "memory-preview-heading";
  const title = document.createElement("strong");
  title.textContent = `Source diff: ${result.sourceFile || "source file"}`;
  const meta = document.createElement("code");
  meta.textContent = result.status === "unavailable"
    ? result.reason || "diff unavailable"
    : `v${result.latestVersion ?? 0} · ${result.status} · ${String(result.currentHash ?? "").slice(0, 12)}…`;
  heading.append(title, meta);
  const list = document.createElement("ol");
  list.className = "memory-source-diff";
  const changes = Array.isArray(result.changes) ? result.changes : [];
  if (!changes.length) {
    const empty = document.createElement("li");
    empty.textContent = result.status === "unavailable"
      ? result.reason || "No previous governed intake artifact is recorded."
      : "No line-level changes found.";
    list.append(empty);
  }
  for (const change of changes) {
    const item = document.createElement("li");
    item.dataset.type = change.type;
    const marker = document.createElement("strong");
    marker.textContent = change.type === "added" ? "+" : "-";
    const text = document.createElement("span");
    text.textContent = `L${change.line}: ${change.text}`;
    item.append(marker, text);
    list.append(item);
  }
  if (result.truncated) {
    const truncated = document.createElement("p");
    truncated.className = "memory-status";
    truncated.dataset.tone = "warning";
    truncated.textContent = "Diff preview truncated. Use smaller files or inspect the source directly for full context.";
    card.append(heading, list, truncated);
    return card;
  }
  card.append(heading, list);
  return card;
}

function setStatus(node, text, tone = "neutral") {
  node.textContent = text;
  node.dataset.tone = tone;
}

export function renderLivingArchiveWorkspace({ container, bridgeRequest, initialQuery = "" }) {
  const section = document.createElement("section");
  section.className = "memory-workspace";
  section.setAttribute("aria-label", "Living Archive workspace");

  const header = document.createElement("header");
  header.className = "memory-hero";
  const eyebrow = document.createElement("span");
  eyebrow.className = "module-eyebrow";
  eyebrow.textContent = "Living Archive";
  const title = document.createElement("h1");
  title.textContent = "AI-curated memory, backed by preserved human sources.";
  const body = document.createElement("p");
  body.textContent = "Search the current AI Memory, inspect archive health, and send browser notes into governed intake. Trusted wiki promotion remains host-mediated.";
  header.append(eyebrow, title, body);

  const metrics = document.createElement("div");
  metrics.className = "memory-metrics";
  metrics.append(
    metric("Wiki pages", "…", "AI_MEMORY/wiki"),
    metric("Intake artifacts", "…", "raw browser/source drops"),
    metric("Review queue", "…", "requests + artifacts")
  );

  const wikiHealthPanel = document.createElement("section");
  wikiHealthPanel.className = "memory-card memory-wiki-health";
  wikiHealthPanel.textContent = "Loading wiki health…";

  const searchForm = document.createElement("form");
  searchForm.className = "memory-card memory-search";
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "Search AI Memory";
  const searchRow = document.createElement("div");
  searchRow.className = "memory-row";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Search concepts, people, projects, claims…";
  searchInput.minLength = 2;
  const searchButton = document.createElement("button");
  searchButton.type = "submit";
  searchButton.textContent = "Search";
  searchRow.append(searchInput, searchButton);
  const searchStatus = document.createElement("p");
  searchStatus.className = "memory-status";
  const searchResults = document.createElement("div");
  searchResults.className = "memory-results";
  searchForm.append(searchLabel, searchRow, searchStatus, searchResults);

  const intakeForm = document.createElement("form");
  intakeForm.className = "memory-card memory-intake";
  const intakeLabel = document.createElement("label");
  intakeLabel.textContent = "Save Browser Note To Intake";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Note title";
  const contentInput = document.createElement("textarea");
  contentInput.rows = 5;
  contentInput.placeholder = "Paste or write a note. It will be saved as intake, not directly promoted into trusted AI Memory.";
  const intakeButton = document.createElement("button");
  intakeButton.type = "submit";
  intakeButton.textContent = "Save Intake";
  const intakeStatus = document.createElement("p");
  intakeStatus.className = "memory-status";
  intakeForm.append(intakeLabel, titleInput, contentInput, intakeButton, intakeStatus);

  const reviewPanel = document.createElement("section");
  reviewPanel.className = "memory-card memory-review-queue";
  const reviewHeader = document.createElement("div");
  reviewHeader.className = "memory-review-top";
  const reviewLabel = document.createElement("label");
  reviewLabel.textContent = "Review Queue";
  const refreshReview = document.createElement("button");
  refreshReview.type = "button";
  refreshReview.textContent = "Refresh";
  reviewHeader.append(reviewLabel, refreshReview);
  const reviewStatus = document.createElement("p");
  reviewStatus.className = "memory-status";
  const reviewList = document.createElement("div");
  reviewList.className = "memory-review-list";
  const draftPreview = document.createElement("article");
  draftPreview.className = "memory-review-preview";
  draftPreview.hidden = true;
  reviewPanel.append(reviewHeader, reviewStatus, reviewList, draftPreview);

  const promotionPanel = document.createElement("section");
  promotionPanel.className = "memory-card memory-promotion-history";
  const promotionHeader = document.createElement("div");
  promotionHeader.className = "memory-review-top";
  const promotionLabel = document.createElement("label");
  promotionLabel.textContent = "Promotion History";
  const refreshPromotions = document.createElement("button");
  refreshPromotions.type = "button";
  refreshPromotions.textContent = "Refresh";
  promotionHeader.append(promotionLabel, refreshPromotions);
  const promotionStatus = document.createElement("p");
  promotionStatus.className = "memory-status";
  const promotionList = document.createElement("div");
  promotionList.className = "memory-promotion-list";
  promotionPanel.append(promotionHeader, promotionStatus, promotionList);

  const sourcePanel = document.createElement("section");
  sourcePanel.className = "memory-card memory-source-review";
  const sourceHeader = document.createElement("div");
  sourceHeader.className = "memory-review-top";
  const sourceLabel = document.createElement("label");
  sourceLabel.textContent = "Connected Source Review";
  const refreshSources = document.createElement("button");
  refreshSources.type = "button";
  refreshSources.textContent = "Refresh";
  sourceHeader.append(sourceLabel, refreshSources);
  const sourceFilterBar = document.createElement("div");
  sourceFilterBar.className = "memory-source-filterbar memory-source-list-filterbar";
  const sourceStateFilter = document.createElement("select");
  sourceStateFilter.setAttribute("aria-label", "Filter connected sources by state");
  sourceStateFilter.append(
    optionNode("all", "All sources"),
    optionNode("active", "Active"),
    optionNode("disabled", "Disabled"),
    optionNode("missing", "Missing")
  );
  const sourceTextFilter = document.createElement("input");
  sourceTextFilter.type = "search";
  sourceTextFilter.placeholder = "Filter connected sources";
  sourceTextFilter.setAttribute("aria-label", "Filter connected sources by text");
  const sourceFilterCount = document.createElement("small");
  sourceFilterBar.append(sourceStateFilter, sourceTextFilter, sourceFilterCount);
  const sourceStatus = document.createElement("p");
  sourceStatus.className = "memory-status";
  const sourceList = document.createElement("div");
  sourceList.className = "memory-source-list";
  const sourcePreview = document.createElement("div");
  sourcePreview.className = "memory-source-preview";
  sourcePanel.append(sourceHeader, sourceFilterBar, sourceStatus, sourceList, sourcePreview);

  section.append(header, metrics, wikiHealthPanel, sourcePanel, reviewPanel, promotionPanel, searchForm, intakeForm);
  container.append(section);

  const loadStatus = async () => {
    try {
      const status = await bridgeRequest("/memory/status", { method: "GET" });
      const [wikiPages, intakeArtifacts, reviewWork] = metrics.querySelectorAll(".memory-metric strong");
      const [wikiMeta, intakeMeta, reviewMeta] = metrics.querySelectorAll(".memory-metric small");
      wikiPages.textContent = formatCount(status.wiki?.pages);
      intakeArtifacts.textContent = formatCount(status.intake?.artifacts);
      reviewWork.textContent = formatCount(Number(status.review?.requests ?? 0) + Number(status.review?.artifacts ?? 0));
      wikiMeta.textContent = status.wiki?.index?.exists ? "index.md present" : "index.md missing";
      intakeMeta.textContent = status.exists ? "host memory root active" : "memory root missing";
      reviewMeta.textContent = `${formatCount(status.review?.requests)} requests · ${formatCount(status.review?.artifacts)} artifacts`;
    } catch (error) {
      metrics.append(metric("Status", "Unavailable", error instanceof Error ? error.message : String(error)));
    }
  };

  const loadWikiHealth = async () => {
    try {
      const health = await bridgeRequest("/memory/wiki/health", { method: "GET" });
      const card = wikiHealthCard(health, () => {
        wikiHealthPanel.replaceChildren();
        wikiHealthPanel.textContent = "Refreshing wiki health…";
        void loadWikiHealth();
      }, async () => {
        wikiHealthPanel.replaceChildren();
        wikiHealthPanel.textContent = "Running wiki lint and writing review artifact…";
        try {
          const result = await bridgeRequest("/memory/wiki/lint", {
            method: "POST",
            capability: "memory-source-review",
            body: { reason: "Manual Living Archive workspace lint" }
          });
          wikiHealthPanel.textContent = `Wiki lint saved: ${result.relativeArtifactPath || result.artifactPath || "review artifact"}`;
          await loadWikiHealth();
        } catch (error) {
          wikiHealthPanel.textContent = `Wiki lint failed: ${error instanceof Error ? error.message : String(error)}`;
          wikiHealthPanel.dataset.tone = "error";
        }
      });
      wikiHealthPanel.dataset.tone = card.querySelector(".memory-status")?.dataset.tone ?? "neutral";
      wikiHealthPanel.replaceChildren(...card.childNodes);
    } catch (error) {
      wikiHealthPanel.textContent = `Wiki health unavailable: ${error instanceof Error ? error.message : String(error)}`;
      wikiHealthPanel.dataset.tone = "error";
    }
  };

  const loadReviewQueue = async () => {
    refreshReview.disabled = true;
    reviewList.replaceChildren();
    setStatus(reviewStatus, "Loading review queue…");
    try {
      const result = await bridgeRequest("/archive/review/list", {
        method: "POST",
        body: { limit: 12 }
      });
      const requests = Array.isArray(result.requests) ? result.requests : [];
      if (!requests.length) {
        setStatus(reviewStatus, "No pending review requests. Browser artifacts can request review from the Artifacts workspace.", "warning");
        return;
      }
      reviewList.append(...requests.map((request) => reviewRequestCard(request, transitionReviewRequest, draftReviewRequest, previewDraftArtifact)));
      setStatus(reviewStatus, `${requests.length} review request(s) waiting in ${result.root}.`, "success");
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      refreshReview.disabled = false;
    }
  };

  const loadPromotionHistory = async () => {
    refreshPromotions.disabled = true;
    promotionList.replaceChildren();
    setStatus(promotionStatus, "Loading promotion history…");
    try {
      const result = await bridgeRequest("/archive/review/promotions/list", {
        method: "POST",
        body: { limit: 10 }
      });
      const promotions = Array.isArray(result.promotions) ? result.promotions : [];
      if (!promotions.length) {
        setStatus(promotionStatus, "No promoted wiki updates yet.", "warning");
        return;
      }
      promotionList.append(...promotions.map((entry) => promotionCard(entry, restorePromotionBackup)));
      setStatus(promotionStatus, `${promotions.length} promoted wiki update(s) in ${result.root}.`, "success");
    } catch (error) {
      setStatus(promotionStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      refreshPromotions.disabled = false;
    }
  };

  let connectedSources = [];

  const renderSourceList = () => {
    sourceList.replaceChildren();
    const state = sourceStateFilter.value;
    const query = sourceTextFilter.value.trim().toLowerCase();
    const visible = connectedSources.filter((source) => {
      const sourceState = source.disabledAt ? "disabled" : source.exists ? "active" : "missing";
      const text = `${source.path ?? ""} ${source.kind ?? ""} ${source.ownership ?? ""} ${source.importMode ?? ""}`.toLowerCase();
      return (state === "all" || sourceState === state) && (!query || text.includes(query));
    });
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "memory-status";
      empty.dataset.tone = connectedSources.length ? "warning" : "neutral";
      empty.textContent = connectedSources.length
        ? "No connected sources match the current filters."
        : "No connected sources. Add folders or Obsidian vaults in Settings > Memory.";
      sourceList.append(empty);
    } else {
      sourceList.append(...visible.map((source) => sourceCard(source, reviewSource, createSourceIntake, showSourceVersions)));
    }
    sourceFilterCount.textContent = `${visible.length}/${connectedSources.length} source(s) visible`;
    setStatus(
      sourceStatus,
      connectedSources.length
        ? `${visible.length}/${connectedSources.length} connected source(s) visible. Review before creating governed intake.`
        : "No connected sources. Add folders or Obsidian vaults in Settings > Memory.",
      connectedSources.length ? "success" : "warning"
    );
  };

  const loadSources = async () => {
    refreshSources.disabled = true;
    sourceList.replaceChildren();
    sourcePreview.replaceChildren();
    setStatus(sourceStatus, "Loading connected sources…");
    try {
      const result = await bridgeRequest("/memory/settings", { method: "GET" });
      connectedSources = result.settings?.sources ?? [];
      renderSourceList();
    } catch (error) {
      setStatus(sourceStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      refreshSources.disabled = false;
    }
  };

  sourceStateFilter.addEventListener("change", renderSourceList);
  sourceTextFilter.addEventListener("input", renderSourceList);

  const reviewSource = async (source) => {
    sourcePreview.replaceChildren();
    setStatus(sourceStatus, `Reviewing ${source.path || source.id}…`);
    try {
      const result = await bridgeRequest("/memory/source/review", {
        method: "POST",
        capability: "memory-source-review",
        body: { sourceId: source.id, limit: 2_000 }
      });
      sourcePreview.replaceChildren(sourceReviewCard(result, createSelectedFileIntake, (candidate) => {
        void previewSourceDiff(result.source, candidate);
      }));
      setStatus(sourceStatus, `Source review ready: ${result.candidates?.length ?? 0} candidate file(s).`, "success");
    } catch (error) {
      setStatus(sourceStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const previewSourceDiff = async (source, candidate) => {
    if (!source?.id || !candidate?.path) {
      setStatus(sourceStatus, "Source diff requires a source and candidate file.", "error");
      return;
    }
    setStatus(sourceStatus, `Loading diff for ${candidate.path}…`);
    try {
      const result = await bridgeRequest("/memory/source/diff", {
        method: "POST",
        capability: "memory-source-review",
        body: {
          sourceId: source.id,
          file: candidate.path,
          limit: 80
        }
      });
      sourcePreview.append(sourceDiffCard(result));
      setStatus(sourceStatus, `Diff ready for ${candidate.path}: ${result.status}.`, "success");
    } catch (error) {
      setStatus(sourceStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const showSourceVersions = async (source) => {
    sourcePreview.replaceChildren();
    setStatus(sourceStatus, `Loading source versions for ${source.path || source.id}…`);
    try {
      const result = await bridgeRequest("/memory/source/versions", {
        method: "POST",
        body: { sourceId: source.id, limit: 100 }
      });
      sourcePreview.replaceChildren(sourceVersionsCard(source, result));
      setStatus(sourceStatus, `${result.entries?.length ?? 0} imported source-file version record(s).`, "success");
    } catch (error) {
      setStatus(sourceStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const createSelectedFileIntake = async (review, files) => {
    if (!files.length) {
      setStatus(sourceStatus, "Select one or more compatible source files first.", "warning");
      return;
    }
    setStatus(sourceStatus, `Creating governed intake from ${files.length} selected file(s)…`);
    try {
      const result = await bridgeRequest("/memory/source/file-intake", {
        method: "POST",
        capability: "memory-source-file-intake",
        body: {
          sourceId: review.source?.id,
          files
        }
      });
      for (const created of result.created ?? []) {
        await bridgeRequest("/archive/review/request", {
          method: "POST",
          body: {
            path: created.path,
            reason: `Review selected source file ${created.sourceFile} for possible Living Archive promotion.`
          }
        });
      }
      setStatus(
        sourceStatus,
        `Created ${result.created?.length ?? 0} selected file intake artifact(s); ${result.rejected?.length ?? 0} rejected.`,
        "success"
      );
      await loadStatus();
      await loadReviewQueue();
    } catch (error) {
      setStatus(sourceStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const createSourceIntake = async (source) => {
    setStatus(sourceStatus, `Creating governed intake summary for ${source.path || source.id}…`);
    try {
      const result = await bridgeRequest("/memory/source/intake", {
        method: "POST",
        capability: "memory-source-intake",
        body: { sourceId: source.id }
      });
      const reviewRequest = await bridgeRequest("/archive/review/request", {
        method: "POST",
        body: {
          path: result.path,
          reason: "Review this connected source intake summary for possible Living Archive promotion."
        }
      });
      setStatus(
        sourceStatus,
        `Source intake created: ${result.path} (${result.candidates} candidate files). Review request: ${reviewRequest.path}.`,
        "success"
      );
      await loadStatus();
      await loadReviewQueue();
    } catch (error) {
      setStatus(sourceStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const restorePromotionBackup = async (entry) => {
    if (!entry.path) {
      setStatus(promotionStatus, "Promotion entry is missing its review artifact path.", "error");
      return;
    }
    if (!entry.backupPath) {
      setStatus(promotionStatus, "This promotion has no backup to restore.", "warning");
      return;
    }
    setStatus(promotionStatus, `Restoring ${entry.promotedPage || "wiki page"} from backup…`);
    try {
      const result = await bridgeRequest("/archive/review/promotions/restore", {
        method: "POST",
        body: { path: entry.path }
      });
      await loadStatus();
      await loadPromotionHistory();
      setStatus(promotionStatus, `Restored ${result.promotedPage} from ${result.backupPath}.`, "success");
    } catch (error) {
      setStatus(promotionStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const transitionReviewRequest = async (request, status) => {
    if (!request.path) {
      setStatus(reviewStatus, "Review request is missing its path.", "error");
      return;
    }
    setStatus(reviewStatus, `Updating review request to ${status}…`);
    try {
      const result = await bridgeRequest("/archive/review/transition", {
        method: "POST",
        body: {
          path: request.path,
          status,
          note: `Set from Living Archive workspace UI.`
        }
      });
      setStatus(reviewStatus, `Updated ${result.path} to ${result.status}.`, "success");
      await loadStatus();
      await loadReviewQueue();
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const draftReviewRequest = async (request) => {
    if (!request.path) {
      setStatus(reviewStatus, "Review request is missing its path.", "error");
      return;
    }
    setStatus(reviewStatus, "Generating draft wiki update artifact…");
    try {
      const result = await bridgeRequest("/archive/review/draft", {
        method: "POST",
        body: { path: request.path }
      });
      setStatus(reviewStatus, `Draft artifact ready: ${result.path}.`, "success");
      await loadStatus();
      await loadReviewQueue();
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const previewDraftArtifact = async (request) => {
    if (!request.draftArtifactPath) {
      setStatus(reviewStatus, "Review request has no draft artifact yet.", "warning");
      return;
    }
    setStatus(reviewStatus, "Loading draft artifact preview…");
    draftPreview.hidden = true;
    draftPreview.replaceChildren();
    try {
      const result = await bridgeRequest("/archive/review/artifact/read", {
        method: "POST",
        body: { path: request.draftArtifactPath }
      });
      const heading = document.createElement("div");
      heading.className = "memory-preview-heading";
      const title = document.createElement("strong");
      title.textContent = result.title || "Draft artifact";
      const pathNode = document.createElement("code");
      pathNode.textContent = result.path || request.draftArtifactPath;
      heading.append(title, pathNode);
      const meta = document.createElement("p");
      const verificationStatus = result.verificationStatus || "not verified";
      const semanticStatus = result.semanticVerifierStatus || "not run";
      const writerStatus = result.writerStatus || "unknown writer";
      meta.textContent = result.proposedPage
        ? `Proposed page: ${result.proposedPage}`
        : `Type: ${result.type || "archive artifact"}`;
      meta.textContent = `${meta.textContent} · Writer: ${writerStatus} · Verification: ${verificationStatus} · Semantic: ${semanticStatus}`;
      const content = document.createElement("pre");
      content.textContent = result.content || "";
      const actions = document.createElement("div");
      actions.className = "memory-review-actions";
      const verifyButton = document.createElement("button");
      verifyButton.type = "button";
      verifyButton.textContent = result.verificationStatus === "verified" ? "Verified" : "Verify";
      verifyButton.disabled = result.status === "promoted" || result.verificationStatus === "verified";
      verifyButton.addEventListener("click", () => {
        void verifyDraftArtifact(result.path);
      });
      const verifierPreviewButton = document.createElement("button");
      verifierPreviewButton.type = "button";
      verifierPreviewButton.textContent = "Preview Verification";
      verifierPreviewButton.disabled = !result.verifierArtifactPath;
      verifierPreviewButton.addEventListener("click", () => {
        void previewVerificationArtifact(result.verifierArtifactPath);
      });
      const reviseButton = document.createElement("button");
      reviseButton.type = "button";
      reviseButton.textContent = "Revise Draft";
      reviseButton.disabled = result.status === "promoted" || result.verificationStatus !== "needs-revision";
      reviseButton.addEventListener("click", () => {
        void reviseDraftArtifact(result.path);
      });
      const promoteButton = document.createElement("button");
      promoteButton.type = "button";
      promoteButton.textContent = result.status === "promoted" ? "Promoted" : "Promote";
      promoteButton.disabled = result.status === "promoted" || result.verificationStatus !== "verified";
      promoteButton.addEventListener("click", () => {
        void promoteDraftArtifact(result.path);
      });
      actions.append(verifyButton, verifierPreviewButton, reviseButton, promoteButton);
      draftPreview.append(heading, meta, content, actions);
      draftPreview.hidden = false;
      setStatus(reviewStatus, result.truncated ? "Draft preview loaded and truncated for safety." : "Draft preview loaded.", "success");
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const previewVerificationArtifact = async (path) => {
    if (!path) {
      setStatus(reviewStatus, "Draft artifact has no verifier artifact yet.", "warning");
      return;
    }
    setStatus(reviewStatus, "Loading verifier artifact preview…");
    try {
      const result = await bridgeRequest("/archive/review/verification/read", {
        method: "POST",
        body: { path }
      });
      const heading = document.createElement("div");
      heading.className = "memory-preview-heading";
      const title = document.createElement("strong");
      title.textContent = result.title || "Archive verification";
      const pathNode = document.createElement("code");
      pathNode.textContent = result.path || path;
      heading.append(title, pathNode);
      const meta = document.createElement("p");
      meta.textContent = `Status: ${result.status || "unknown"} · Semantic: ${result.semanticVerifierStatus || "unknown"} · Provider: ${result.semanticVerifierProvider || "none"}`;
      const content = document.createElement("pre");
      content.textContent = result.content || "";
      draftPreview.replaceChildren(heading, meta, content);
      draftPreview.hidden = false;
      setStatus(reviewStatus, result.truncated ? "Verifier preview loaded and truncated for safety." : "Verifier preview loaded.", "success");
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const verifyDraftArtifact = async (path) => {
    if (!path) {
      setStatus(reviewStatus, "Draft artifact is missing its path.", "error");
      return;
    }
    setStatus(reviewStatus, "Verifying draft wiki update…");
    try {
      const result = await bridgeRequest("/archive/review/artifact/verify", {
        method: "POST",
        body: { path }
      });
      await loadStatus();
      await loadReviewQueue();
      setStatus(
        reviewStatus,
        result.status === "verified"
          ? `Verified draft: ${result.verifierArtifactPath} (${result.semanticVerifierStatus || "semantic unavailable"}).`
          : `Draft needs revision: ${(result.findings || []).join("; ")}`,
        result.status === "verified" ? "success" : "warning"
      );
      draftPreview.hidden = true;
      draftPreview.replaceChildren();
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const reviseDraftArtifact = async (path) => {
    if (!path) {
      setStatus(reviewStatus, "Draft artifact is missing its path.", "error");
      return;
    }
    setStatus(reviewStatus, "Revising draft from verifier findings…");
    try {
      const result = await bridgeRequest("/archive/review/artifact/revise", {
        method: "POST",
        body: { path }
      });
      await loadStatus();
      await loadReviewQueue();
      setStatus(reviewStatus, `Revised draft ready: ${result.path}.`, "success");
      draftPreview.hidden = true;
      draftPreview.replaceChildren();
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  const promoteDraftArtifact = async (path) => {
    if (!path) {
      setStatus(reviewStatus, "Draft artifact is missing its path.", "error");
      return;
    }
    setStatus(reviewStatus, "Promoting draft into trusted AI Memory…");
    try {
      const result = await bridgeRequest("/archive/review/artifact/promote", {
        method: "POST",
        body: { path }
      });
      await loadStatus();
      await loadReviewQueue();
      await loadPromotionHistory();
      setStatus(reviewStatus, `Promoted ${result.promotedPage}.`, "success");
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  refreshReview.addEventListener("click", () => {
    void loadReviewQueue();
  });
  refreshPromotions.addEventListener("click", () => {
    void loadPromotionHistory();
  });
  refreshSources.addEventListener("click", () => {
    void loadSources();
  });

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (query.length < 2) {
      setStatus(searchStatus, "Search requires at least two characters.", "warning");
      return;
    }
    searchButton.disabled = true;
    setStatus(searchStatus, "Searching AI Memory…");
    searchResults.replaceChildren();
    try {
      const result = await bridgeRequest("/memory/search", {
        method: "POST",
        body: { query, limit: 8 }
      });
      if (!result.matches?.length) {
        setStatus(searchStatus, "No matches found in AI Memory.", "warning");
        return;
      }
      setStatus(searchStatus, `${result.matches.length} match(es) found.`, "success");
      searchResults.append(...result.matches.map(resultCard));
    } catch (error) {
      setStatus(searchStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      searchButton.disabled = false;
    }
  });

  intakeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim() || "Browser workspace note";
    const content = contentInput.value.trim();
    if (!content) {
      setStatus(intakeStatus, "Write content before saving intake.", "warning");
      return;
    }
    intakeButton.disabled = true;
    setStatus(intakeStatus, "Saving governed intake…");
    try {
      const result = await bridgeRequest("/archive/intake", {
        method: "POST",
        body: { title, content, origin: "main-workspace" }
      });
      setStatus(intakeStatus, `Saved to ${result.path} (${formatCount(result.bytes)} bytes).`, "success");
      contentInput.value = "";
      await loadStatus();
      await loadReviewQueue();
    } catch (error) {
      setStatus(intakeStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      intakeButton.disabled = false;
    }
  });

  void loadStatus();
  void loadWikiHealth();
  void loadSources();
  void loadReviewQueue();
  void loadPromotionHistory();
  if (initialQuery.trim()) {
    searchInput.value = initialQuery.trim();
    queueMicrotask(() => {
      searchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }
}
