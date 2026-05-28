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
  card.append(heading, artifact, draft, reason, actions);
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

  section.append(header, metrics, reviewPanel, searchForm, intakeForm);
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
      meta.textContent = result.proposedPage
        ? `Proposed page: ${result.proposedPage}`
        : `Type: ${result.type || "archive artifact"}`;
      const content = document.createElement("pre");
      content.textContent = result.content || "";
      draftPreview.append(heading, meta, content);
      draftPreview.hidden = false;
      setStatus(reviewStatus, result.truncated ? "Draft preview loaded and truncated for safety." : "Draft preview loaded.", "success");
    } catch (error) {
      setStatus(reviewStatus, error instanceof Error ? error.message : String(error), "error");
    }
  };

  refreshReview.addEventListener("click", () => {
    void loadReviewQueue();
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
  void loadReviewQueue();
  if (initialQuery.trim()) {
    searchInput.value = initialQuery.trim();
    queueMicrotask(() => {
      searchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }
}
