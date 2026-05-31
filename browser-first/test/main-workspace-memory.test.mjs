import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { renderLivingArchiveWorkspace } from "../resonantos-side-panel-extension/src/lib/main-workspace-memory.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><main id=\"root\"></main>", { url: "https://resonantos.local/" });
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return {
    container: dom.window.document.querySelector("#root"),
    cleanup: () => {
      delete globalThis.document;
      delete globalThis.HTMLElement;
      delete globalThis.Event;
    }
  };
}

test("living archive workspace renders status, search, and intake through bridge routes", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  let reviewStatus = "pending";
  let draftArtifactPath = "";
  let verified = false;
  let promoted = false;
  let restored = false;
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/memory/status") {
      return {
        exists: true,
        wiki: { pages: 12, index: { exists: true } },
        intake: { artifacts: 4 },
        review: { requests: 2, artifacts: 3 }
      };
    }
    if (route === "/memory/search") {
      return {
        matches: [{ title: "ResonantOS", path: "AI_MEMORY/wiki/resonantos.md", excerpt: "ResonantOS memory result" }]
      };
    }
    if (route === "/memory/wiki/health") {
      return {
        exists: true,
        score: 80,
        pages: 12,
        issues: [{ severity: "warning", type: "missing-index-entries", message: "2 page(s) are missing from index.md." }],
        brokenLinks: [],
        orphanPages: ["orphan.md"],
        missingIndexEntries: ["orphan.md", "research.md"],
        duplicateTitles: [],
        index: { exists: true, entries: 10 },
        log: { exists: true, modifiedAt: "2026-05-29T08:00:00.000Z" }
      };
    }
    if (route === "/memory/wiki/lint") {
      return {
        ok: true,
        relativeArtifactPath: "REVIEW/lint/wiki-lint-test.md",
        health: { exists: true, score: 80, pages: 12, issues: [] }
      };
    }
    if (route === "/memory/settings") {
      return {
        settings: {
          sources: [{
            id: "source-test-vault",
            path: "/Users/test/KnowledgeVault",
            kind: "obsidian-vault",
            ownership: "human-knowledge",
            importMode: "copy-on-import",
            exists: true
          }, {
            id: "source-disabled",
            path: "/Users/test/DisabledVault",
            kind: "folder",
            ownership: "mixed-library",
            importMode: "linked-readonly",
            exists: true,
            disabledAt: "2026-05-29T10:00:00.000Z"
          }, {
            id: "source-missing",
            path: "/Users/test/MissingVault",
            kind: "folder",
            ownership: "external-knowledge",
            importMode: "copy-on-import",
            exists: false
          }]
        }
      };
    }
    if (route === "/memory/source/review") {
      return {
        source: {
          id: options.body.sourceId,
          path: "/Users/test/KnowledgeVault",
          kind: "obsidian-vault",
          ownership: "human-knowledge",
          importMode: "copy-on-import"
        },
        scan: {
          totalScanned: 7,
          limitReached: false,
          categories: { compatible: 3, processed: 1, "raw-audio": 1, unsupported: 2 },
          recommendation: "This source has compatible knowledge files and can be registered for governed intake."
        },
        candidates: [
          { path: "index.md", category: "compatible", versionStatus: "unchanged", sourceVersion: 2, previousSourceContentHash: "aaaa", bytes: 1200, modifiedAt: "2026-05-29T10:00:00.000Z" },
          { path: "notes/research.txt", category: "compatible", versionStatus: "changed", sourceVersion: 1, previousSourceContentHash: "abcdef", bytes: 1800, modifiedAt: "2026-05-29T10:00:30.000Z" },
          { path: "raw/tol.mp3", category: "raw-audio", bytes: 2400, modifiedAt: "2026-05-29T10:01:00.000Z" }
        ],
        boundary: "Source review is read-only."
      };
    }
    if (route === "/memory/source/versions") {
      return {
        manifestVersion: 1,
        updatedAt: "2026-05-29T10:30:00.000Z",
        entries: [{
          sourceId: options.body.sourceId,
          sourceFile: "index.md",
          latestHash: "0123456789abcdef",
          latestVersion: 2,
          latestModifiedAt: "2026-05-29T10:25:00.000Z",
          updatedAt: "2026-05-29T10:30:00.000Z",
          history: []
        }]
      };
    }
    if (route === "/memory/source/diff") {
      return {
        sourceId: options.body.sourceId,
        sourceFile: options.body.file,
        status: "changed",
        latestVersion: 1,
        latestIntakePath: "INTAKE/sources/selected-2.md",
        previousHash: "abcdef",
        currentHash: "0123456789abcdef",
        changed: true,
        previousLines: 2,
        currentLines: 2,
        truncated: false,
        changes: [
          { type: "removed", line: 2, text: "Old research note" },
          { type: "added", line: 2, text: "Updated research note" }
        ]
      };
    }
    if (route === "/memory/source/file-intake") {
      return {
        sourceId: options.body.sourceId,
        created: options.body.files.map((file, index) => ({
          path: `INTAKE/sources/selected-${index + 1}.md`,
          sourceFile: file,
          bytes: 600 + index,
          title: file
        })),
        rejected: []
      };
    }
    if (route === "/archive/review/request" && /^INTAKE\/sources\/selected-\d+\.md$/.test(options.body.path)) {
      return {
        path: `REVIEW/requests/${options.body.path.split("/").pop()}`,
        sourceArtifactPath: options.body.path,
        status: "pending"
      };
    }
    if (route === "/memory/source/intake") {
      return {
        path: "INTAKE/sources/source-review.md",
        bytes: 512,
        sourceId: options.body.sourceId,
        candidates: 2,
        recommendation: "This source has compatible knowledge files and can be registered for governed intake."
      };
    }
    if (route === "/archive/review/request" && options.body.path === "INTAKE/sources/source-review.md") {
      return {
        path: "REVIEW/requests/source-review.md",
        sourceArtifactPath: options.body.path,
        status: "pending"
      };
    }
    if (route === "/archive/review/list") {
      return {
        root: "Memory/REVIEW/requests",
        requests: [{
          title: "Browser job completed: compare a product",
          status: reviewStatus,
          path: "REVIEW/requests/browser-job-completed.md",
          artifactPath: "INTAKE/browser/job-report.md",
          draftArtifactPath,
          draftVerificationStatus: verified ? "verified" : "",
          promotionStatus: promoted ? "promoted" : "",
          promotedPage: promoted ? "AI_MEMORY/wiki/browser-job-completed.md" : "",
          backupPath: promoted ? "AI_MEMORY/backups/promotions/2026-05-28/browser-job-completed.md" : "",
          rollbackStatus: restored ? "restored" : "",
          reason: "Evaluate browser artifact for durable wiki updates."
        }]
      };
    }
    if (route === "/archive/review/transition") {
      reviewStatus = options.body.status;
      return {
        path: options.body.path,
        previousStatus: "pending",
        status: reviewStatus,
        updatedAt: "2026-05-28T10:00:00.000Z"
      };
    }
    if (route === "/archive/review/draft") {
      draftArtifactPath = "REVIEW/artifacts/browser/browser-job-completed-draft.md";
      return {
        path: draftArtifactPath,
        requestPath: options.body.path,
        proposedPage: "AI_MEMORY/wiki/browser-job-completed.md",
        status: "draft-created"
      };
    }
    if (route === "/archive/review/artifact/read") {
      return {
        path: options.body.path,
        title: "Draft Wiki Update: Browser job completed",
        type: "archive-draft-wiki-update",
        status: "draft",
        verificationStatus: verified ? "verified" : "",
        verifierArtifactPath: verified ? "REVIEW/verifications/browser/browser-job-completed-verification.md" : "",
        semanticVerifierStatus: verified ? "unavailable" : "",
        semanticVerifierProvider: "",
        semanticVerifierModel: "",
        writerStatus: "deterministic-fallback",
        writerProvider: "",
        writerModel: "",
        proposedPage: "AI_MEMORY/wiki/browser-job-completed.md",
        content: "# Draft Wiki Update: Browser job completed\n\n## Proposed Content\nBrowser job summary with enough deterministic source detail for verifier acceptance.",
        truncated: false
      };
    }
    if (route === "/archive/review/artifact/verify") {
      verified = true;
      return {
        path: options.body.path,
        status: "verified",
        verifierArtifactPath: "REVIEW/verifications/browser/browser-job-completed-verification.md",
        semanticVerifierStatus: "unavailable",
        semanticVerifierProvider: "",
        semanticVerifierModel: "",
        semanticVerifierSummary: "No configured provider was available for semantic archive verification.",
        findings: []
      };
    }
    if (route === "/archive/review/verification/read") {
      return {
        path: options.body.path,
        title: "Archive Verification: Browser job completed",
        status: "verified",
        semanticVerifierStatus: "unavailable",
        semanticVerifierProvider: "",
        semanticVerifierModel: "",
        content: "# Archive Verification: Browser job completed\n\n## Semantic Verifier\n- status: unavailable\n- summary: No configured provider was available.",
        truncated: false
      };
    }
    if (route === "/archive/review/artifact/promote") {
      assert.equal(verified, true);
      promoted = true;
      return {
        path: options.body.path,
        status: "promoted",
        promotedPage: "AI_MEMORY/wiki/browser-job-completed.md",
        promotedAt: "2026-05-28T11:00:00.000Z",
        backupPath: ""
      };
    }
    if (route === "/archive/review/promotions/list") {
      return {
        root: "Memory/REVIEW/artifacts",
        promotions: promoted ? [{
          title: "Browser job completed",
          status: "promoted",
          path: "REVIEW/artifacts/browser/browser-job-completed-draft.md",
          promotedPage: "AI_MEMORY/wiki/browser-job-completed.md",
          promotedAt: "2026-05-28T11:00:00.000Z",
          backupPath: "AI_MEMORY/backups/promotions/2026-05-28/browser-job-completed.md",
          rollbackStatus: restored ? "restored" : "",
          restoredAt: restored ? "2026-05-28T11:30:00.000Z" : ""
        }] : []
      };
    }
    if (route === "/archive/review/promotions/restore") {
      restored = true;
      return {
        path: options.body.path,
        status: "restored",
        promotedPage: "AI_MEMORY/wiki/browser-job-completed.md",
        backupPath: "AI_MEMORY/backups/promotions/2026-05-28/browser-job-completed.md",
        restoredAt: "2026-05-28T11:30:00.000Z",
        restoreBackupPath: "AI_MEMORY/backups/restores/2026-05-28/browser-job-completed.md"
      };
    }
    if (route === "/archive/intake") {
      return { path: "INTAKE/browser/note.md", bytes: 42 };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderLivingArchiveWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(container.textContent, /AI-curated memory/);
    assert.match(container.textContent, /12/);
    assert.match(container.textContent, /4/);
    assert.match(container.textContent, /5/);
    assert.match(container.textContent, /Connected Source Review/);
    assert.match(container.textContent, /Wiki Health/);
    assert.match(container.textContent, /Health 80\/100/);
    assert.match(container.textContent, /missing-index-entries/);
    Array.from(container.querySelectorAll(".memory-wiki-health button"))
      .find((button) => button.textContent === "Run Lint")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/wiki/lint" &&
      options.capability === "memory-source-review" &&
      options.body.reason === "Manual Living Archive workspace lint"
    ));
    assert.match(container.textContent, /\/Users\/test\/KnowledgeVault/);
    assert.match(container.textContent, /\/Users\/test\/DisabledVault/);
    assert.match(container.textContent, /\/Users\/test\/MissingVault/);
    assert.match(container.textContent, /3\/3 source\(s\) visible/);
    Array.from(container.querySelectorAll(".memory-source-card button"))
      .find((button) => button.textContent === "Versions")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/source/versions" &&
      options.body.sourceId === "source-test-vault"
    ));
    assert.match(container.textContent, /Source versions/);
    assert.match(container.textContent, /v2 · index\.md/);
    const sourceStateFilter = container.querySelector(".memory-source-list-filterbar select");
    sourceStateFilter.value = "active";
    sourceStateFilter.dispatchEvent(new Event("change", { bubbles: true }));
    assert.match(container.textContent, /1\/3 source\(s\) visible/);
    assert.doesNotMatch(container.querySelector(".memory-source-list").textContent, /DisabledVault|MissingVault/);
    sourceStateFilter.value = "disabled";
    sourceStateFilter.dispatchEvent(new Event("change", { bubbles: true }));
    assert.match(container.querySelector(".memory-source-list").textContent, /DisabledVault/);
    assert.doesNotMatch(container.querySelector(".memory-source-list").textContent, /KnowledgeVault|MissingVault/);
    sourceStateFilter.value = "all";
    sourceStateFilter.dispatchEvent(new Event("change", { bubbles: true }));
    const sourceTextFilter = container.querySelector(".memory-source-list-filterbar input");
    sourceTextFilter.value = "missing";
    sourceTextFilter.dispatchEvent(new Event("input", { bubbles: true }));
    assert.match(container.textContent, /1\/3 source\(s\) visible/);
    assert.match(container.querySelector(".memory-source-list").textContent, /MissingVault/);
    sourceTextFilter.value = "";
    sourceTextFilter.dispatchEvent(new Event("input", { bubbles: true }));
    assert.ok(calls.some(([route]) => route === "/archive/review/list"));
    assert.ok(calls.some(([route]) => route === "/archive/review/promotions/list"));
    Array.from(container.querySelectorAll(".memory-source-card button"))
      .find((button) => button.textContent === "Review Source")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/source/review" &&
      options.capability === "memory-source-review" &&
      options.body.sourceId === "source-test-vault"
    ));
    assert.match(container.textContent, /7 scanned/);
    assert.match(container.textContent, /index\.md/);
    assert.match(container.textContent, /unchanged v2/);
    assert.match(container.textContent, /notes\/research\.txt/);
    assert.match(container.textContent, /changed v1/);
    assert.match(container.textContent, /raw\/tol\.mp3/);
    assert.match(container.textContent, /root · 1/);
    assert.match(container.textContent, /notes · 1/);
    assert.match(container.textContent, /raw · 1/);
    assert.match(container.textContent, /3\/3 candidate\(s\) visible/);
    Array.from(container.querySelectorAll(".memory-review-preview button"))
      .find((button) => button.textContent === "Create Intake From New/Changed Files")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/source/file-intake" &&
      options.body.files.join(",") === "notes/research.txt"
    ));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/request" &&
      options.body.path === "INTAKE/sources/selected-1.md" &&
      /selected source file notes\/research\.txt/.test(options.body.reason)
    ));
    assert.match(container.textContent, /Created 1 selected file intake artifact\(s\); 0 rejected/);
    const categoryFilter = container.querySelector(".memory-review-preview .memory-source-filterbar select");
    categoryFilter.value = "compatible";
    categoryFilter.dispatchEvent(new Event("change", { bubbles: true }));
    assert.match(container.textContent, /2\/3 candidate\(s\) visible/);
    assert.doesNotMatch(container.querySelector(".memory-source-candidates").textContent, /raw\/tol\.mp3/);
    const textFilter = container.querySelector(".memory-review-preview .memory-source-filterbar input");
    textFilter.value = "research";
    textFilter.dispatchEvent(new Event("input", { bubbles: true }));
    assert.match(container.textContent, /1\/3 candidate\(s\) visible/);
    assert.doesNotMatch(container.querySelector(".memory-source-candidates").textContent, /index\.md/);
    Array.from(container.querySelectorAll(".memory-source-candidates button"))
      .find((button) => button.textContent === "Diff")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/source/diff" &&
      options.capability === "memory-source-review" &&
      options.body.sourceId === "source-test-vault" &&
      options.body.file === "notes/research.txt"
    ));
    assert.match(container.textContent, /Source diff: notes\/research\.txt/);
    assert.match(container.textContent, /Updated research note/);
    textFilter.value = "";
    textFilter.dispatchEvent(new Event("input", { bubbles: true }));
    const candidateChecks = Array.from(container.querySelectorAll(".memory-source-candidates input"));
    assert.equal(candidateChecks.length, 2);
    candidateChecks.find((input) => input.value === "index.md").checked = true;
    candidateChecks.find((input) => input.value === "index.md").dispatchEvent(new Event("change", { bubbles: true }));
    candidateChecks.find((input) => input.value === "notes/research.txt").checked = true;
    candidateChecks.find((input) => input.value === "notes/research.txt").dispatchEvent(new Event("change", { bubbles: true }));
    Array.from(container.querySelectorAll(".memory-review-preview button"))
      .find((button) => button.textContent === "Create Intake From Selected Files")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/source/file-intake" &&
      options.capability === "memory-source-file-intake" &&
      options.body.sourceId === "source-test-vault" &&
      options.body.files.join(",") === "index.md,notes/research.txt"
    ));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/request" &&
      options.body.path === "INTAKE/sources/selected-1.md" &&
      /selected source file index\.md/.test(options.body.reason)
    ));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/request" &&
      options.body.path === "INTAKE/sources/selected-2.md" &&
      /selected source file notes\/research\.txt/.test(options.body.reason)
    ));
    assert.match(container.textContent, /Created 2 selected file intake artifact\(s\); 0 rejected/);
    Array.from(container.querySelectorAll(".memory-source-card button"))
      .find((button) => button.textContent === "Create Intake Summary")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/memory/source/intake" &&
      options.capability === "memory-source-intake" &&
      options.body.sourceId === "source-test-vault"
    ));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/request" &&
      options.body.path === "INTAKE/sources/source-review.md" &&
      /connected source intake summary/.test(options.body.reason)
    ));
    assert.match(container.textContent, /Source intake created: INTAKE\/sources\/source-review\.md/);
    assert.match(container.textContent, /Review request: REVIEW\/requests\/source-review\.md/);
    assert.match(container.textContent, /Browser job completed: compare a product/);
    assert.match(container.textContent, /INTAKE\/browser\/job-report\.md/);
    assert.match(container.textContent, /Intake/);
    assert.match(container.textContent, /Review/);
    assert.match(container.textContent, /Draft/);
    assert.match(container.textContent, /Verify/);
    assert.match(container.textContent, /Revise/);
    assert.match(container.textContent, /Promote/);
    assert.match(container.textContent, /Restore/);
    assert.equal(container.querySelectorAll(".memory-pipeline-step").length, 7);
    container.querySelector("[data-review-status='approved']").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/transition" &&
      options.body.path === "REVIEW/requests/browser-job-completed.md" &&
      options.body.status === "approved"
    ));
    assert.match(container.textContent, /approved/i);
    Array.from(container.querySelectorAll(".memory-review-actions button"))
      .find((button) => button.textContent === "Draft")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/draft" &&
      options.body.path === "REVIEW/requests/browser-job-completed.md"
    ));
    assert.match(container.textContent, /REVIEW\/artifacts\/browser\/browser-job-completed-draft\.md/);
    Array.from(container.querySelectorAll(".memory-review-actions button"))
      .find((button) => button.textContent === "Preview")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/artifact/read" &&
      options.body.path === "REVIEW/artifacts/browser/browser-job-completed-draft.md"
    ));
    assert.match(container.textContent, /Proposed page: AI_MEMORY\/wiki\/browser-job-completed\.md/);
    assert.match(container.textContent, /Browser job summary/);
    assert.match(container.textContent, /Writer: deterministic-fallback/);
    assert.match(container.textContent, /Verification: not verified/);
    assert.match(container.textContent, /Semantic: not run/);
    assert.equal(
      Array.from(container.querySelectorAll(".memory-review-preview button"))
        .find((button) => button.textContent === "Promote")
        .disabled,
      true
    );
    Array.from(container.querySelectorAll(".memory-review-preview button"))
      .find((button) => button.textContent === "Verify")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/artifact/verify" &&
      options.body.path === "REVIEW/artifacts/browser/browser-job-completed-draft.md"
    ));
    assert.match(container.textContent, /Verified draft: REVIEW\/verifications\/browser\/browser-job-completed-verification\.md \(unavailable\)/);
    assert.ok(Array.from(container.querySelectorAll(".memory-pipeline-step"))
      .some((step) => step.textContent.includes("Verify") && step.dataset.state === "complete"));
    Array.from(container.querySelectorAll(".memory-review-actions button"))
      .find((button) => button.textContent === "Preview")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(container.textContent, /Verification: verified/);
    assert.match(container.textContent, /Semantic: unavailable/);
    Array.from(container.querySelectorAll(".memory-review-preview button"))
      .find((button) => button.textContent === "Preview Verification")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/verification/read" &&
      options.body.path === "REVIEW/verifications/browser/browser-job-completed-verification.md"
    ));
    assert.match(container.textContent, /Archive Verification: Browser job completed/);
    assert.match(container.textContent, /No configured provider was available/);
    Array.from(container.querySelectorAll(".memory-review-actions button"))
      .find((button) => button.textContent === "Preview")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    Array.from(container.querySelectorAll(".memory-review-preview button"))
      .find((button) => button.textContent === "Promote")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/artifact/promote" &&
      options.body.path === "REVIEW/artifacts/browser/browser-job-completed-draft.md"
    ));
    assert.match(container.textContent, /Promoted AI_MEMORY\/wiki\/browser-job-completed\.md/);
    assert.ok(Array.from(container.querySelectorAll(".memory-pipeline-step"))
      .some((step) => step.textContent.includes("Promote") && step.dataset.state === "complete"));
    assert.match(container.textContent, /Promotion History/);
    assert.match(container.textContent, /AI_MEMORY\/backups\/promotions\/2026-05-28\/browser-job-completed\.md/);
    Array.from(container.querySelectorAll(".memory-promotion-card button"))
      .find((button) => button.textContent === "Restore Backup")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/promotions/restore" &&
      options.body.path === "REVIEW/artifacts/browser/browser-job-completed-draft.md"
    ));
    assert.match(container.textContent, /Restored AI_MEMORY\/wiki\/browser-job-completed\.md from AI_MEMORY\/backups\/promotions\/2026-05-28\/browser-job-completed\.md/);

    const searchInput = container.querySelector(".memory-search input[type='search']");
    searchInput.value = "resonant";
    container.querySelector(".memory-search").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) => route === "/memory/search" && options.body.query === "resonant"));
    assert.match(container.textContent, /ResonantOS memory result/);

    const [titleInput, noteInput] = container.querySelectorAll(".memory-intake input, .memory-intake textarea");
    titleInput.value = "Browser note";
    noteInput.value = "Save this note to intake.";
    container.querySelector(".memory-intake").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) => route === "/archive/intake" && options.body.title === "Browser note"));
    assert.match(container.textContent, /INTAKE\/browser\/note\.md/);
  } finally {
    cleanup();
  }
});

test("living archive workspace can run an initial routed search", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/memory/status") {
      return { exists: true, wiki: { pages: 1, index: { exists: true } }, intake: { artifacts: 0 }, review: { requests: 0, artifacts: 0 } };
    }
    if (route === "/memory/search") {
      return { matches: [{ title: "Augmentor", path: "AI_MEMORY/wiki/augmentor.md", excerpt: "Augmentor search result" }] };
    }
    if (route === "/memory/wiki/health") {
      return { exists: true, score: 100, pages: 1, issues: [], brokenLinks: [], orphanPages: [], missingIndexEntries: [], duplicateTitles: [], index: { exists: true, entries: 1 }, log: { exists: true } };
    }
    if (route === "/memory/settings") {
      return { settings: { sources: [] } };
    }
    if (route === "/archive/review/list") {
      return { root: "Memory/REVIEW/requests", requests: [] };
    }
    if (route === "/archive/review/promotions/list") {
      return { root: "Memory/REVIEW/artifacts", promotions: [] };
    }
    if (route === "/archive/review/artifact/verify") {
      return {
        status: "verified",
        verifierArtifactPath: "REVIEW/verifications/browser/test.md",
        semanticVerifierStatus: "unavailable",
        findings: []
      };
    }
    if (route === "/archive/review/verification/read") {
      return { status: "verified", semanticVerifierStatus: "unavailable", content: "verification" };
    }
    if (route === "/archive/review/promotions/restore") {
      return { status: "restored" };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderLivingArchiveWorkspace({ container, bridgeRequest, initialQuery: "augmentor" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(calls.some(([route, options]) => route === "/memory/search" && options.body.query === "augmentor"));
    assert.match(container.textContent, /Augmentor search result/);
  } finally {
    cleanup();
  }
});

test("living archive workspace can revise a draft after verifier findings", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  let draftArtifactPath = "REVIEW/artifacts/browser/needs-revision-draft.md";
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/memory/status") {
      return { exists: true, wiki: { pages: 2, index: { exists: true } }, intake: { artifacts: 1 }, review: { requests: 1, artifacts: 1 } };
    }
    if (route === "/memory/wiki/health") {
      return { exists: true, score: 100, pages: 2, issues: [], brokenLinks: [], orphanPages: [], missingIndexEntries: [], duplicateTitles: [], index: { exists: true, entries: 2 }, log: { exists: true } };
    }
    if (route === "/archive/review/list") {
      return {
        root: "Memory/REVIEW/requests",
        requests: [{
          title: "Needs revision source",
          status: "approved",
          path: "REVIEW/requests/needs-revision.md",
          artifactPath: "INTAKE/browser/needs-revision.md",
          draftArtifactPath,
          draftVerificationStatus: draftArtifactPath.endsWith("needs-revision-revision.md") ? "" : "needs-revision",
          draftRevisionStatus: "",
          revisedDraftPath: "",
          reason: "Verifier requested a stronger draft."
        }]
      };
    }
    if (route === "/memory/settings") {
      return { settings: { sources: [] } };
    }
    if (route === "/archive/review/promotions/list") {
      return { root: "Memory/REVIEW/artifacts", promotions: [] };
    }
    if (route === "/archive/review/artifact/read") {
      return {
        path: options.body.path,
        title: "Draft Wiki Update: Needs revision source",
        type: "archive-draft-wiki-update",
        status: "draft",
        verificationStatus: "needs-revision",
        verifierArtifactPath: "REVIEW/verifications/browser/needs-revision-verification.md",
        semanticVerifierStatus: "needs-revision",
        semanticVerifierProvider: "openai",
        semanticVerifierModel: "gpt-5.5",
        writerStatus: "provider-written",
        writerProvider: "openai",
        writerModel: "gpt-5.5",
        proposedPage: "AI_MEMORY/wiki/needs-revision-source.md",
        content: "# Draft Wiki Update: Needs revision source\n\n## Proposed Content\nToo little provenance.",
        truncated: false
      };
    }
    if (route === "/archive/review/artifact/revise") {
      assert.equal(options.body.path, "REVIEW/artifacts/browser/needs-revision-draft.md");
      draftArtifactPath = "REVIEW/artifacts/browser/needs-revision-revision.md";
      return {
        path: draftArtifactPath,
        previousDraftPath: options.body.path,
        requestPath: "REVIEW/requests/needs-revision.md",
        proposedPage: "AI_MEMORY/wiki/needs-revision-source.md",
        status: "draft-revised"
      };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderLivingArchiveWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    Array.from(container.querySelectorAll(".memory-review-actions button"))
      .find((button) => button.textContent === "Preview")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(container.textContent, /Verification: needs-revision/);
    assert.match(container.textContent, /Semantic: needs-revision/);
    assert.ok(Array.from(container.querySelectorAll(".memory-pipeline-step"))
      .some((step) => step.textContent.includes("Verify") && step.dataset.state === "blocked"));
    assert.ok(Array.from(container.querySelectorAll(".memory-pipeline-step"))
      .some((step) => step.textContent.includes("Revise") && step.dataset.state === "active"));
    const reviseButton = Array.from(container.querySelectorAll(".memory-review-preview button"))
      .find((button) => button.textContent === "Revise Draft");
    assert.equal(reviseButton.disabled, false);
    reviseButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(calls.some(([route, options]) =>
      route === "/archive/review/artifact/revise" &&
      options.body.path === "REVIEW/artifacts/browser/needs-revision-draft.md"
    ));
    assert.match(container.textContent, /Revised draft ready: REVIEW\/artifacts\/browser\/needs-revision-revision\.md/);
    assert.match(container.textContent, /REVIEW\/artifacts\/browser\/needs-revision-revision\.md/);
  } finally {
    cleanup();
  }
});
