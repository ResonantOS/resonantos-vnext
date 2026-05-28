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
    if (route === "/archive/review/list") {
      return {
        root: "Memory/REVIEW/requests",
        requests: [{
          title: "Browser job completed: compare a product",
          status: reviewStatus,
          path: "REVIEW/requests/browser-job-completed.md",
          artifactPath: "INTAKE/browser/job-report.md",
          draftArtifactPath,
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
        findings: []
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
    assert.ok(calls.some(([route]) => route === "/archive/review/list"));
    assert.ok(calls.some(([route]) => route === "/archive/review/promotions/list"));
    assert.match(container.textContent, /Browser job completed: compare a product/);
    assert.match(container.textContent, /INTAKE\/browser\/job-report\.md/);
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
    assert.match(container.textContent, /Verification: not verified/);
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
    assert.match(container.textContent, /Verified draft: REVIEW\/verifications\/browser\/browser-job-completed-verification\.md/);
    Array.from(container.querySelectorAll(".memory-review-actions button"))
      .find((button) => button.textContent === "Preview")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(container.textContent, /Verification: verified/);
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

    const searchInput = container.querySelector("input[type='search']");
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
    if (route === "/archive/review/list") {
      return { root: "Memory/REVIEW/requests", requests: [] };
    }
    if (route === "/archive/review/promotions/list") {
      return { root: "Memory/REVIEW/artifacts", promotions: [] };
    }
    if (route === "/archive/review/artifact/verify") {
      return { status: "verified", verifierArtifactPath: "REVIEW/verifications/browser/test.md", findings: [] };
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
