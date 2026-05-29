import assert from "node:assert/strict";
import test from "node:test";

import {
  mergePromotedMarkdownBody,
  summarizePromotedPageForIndex,
  upsertWikiIndexCatalogEntry,
} from "../host/archive-merge.mjs";

test("archive merge replaces matching sections while preserving unmatched existing sections", () => {
  const merged = mergePromotedMarkdownBody({
    existingContent: [
      "---",
      "title: \"Existing\"",
      "---",
      "",
      "# Existing",
      "",
      "Human context remains.",
      "",
      "## Summary",
      "",
      "Old summary.",
      "",
      "## Stable Notes",
      "",
      "Keep this.",
    ].join("\n"),
    promotedBody: [
      "# Existing",
      "",
      "## Summary",
      "",
      "New grounded summary.",
      "",
      "## New Claim",
      "",
      "A new sourced claim.",
    ].join("\n"),
    sourcePath: "INTAKE/browser/source.md",
    artifactPath: "REVIEW/artifacts/browser/draft.md",
    promotedAt: "2026-05-28T12:00:00.000Z",
  });

  assert.match(merged, /Last structured merge/);
  assert.match(merged, /Human context remains/);
  assert.match(merged, /## Summary\n\nNew grounded summary/);
  assert.match(merged, /## Stable Notes\n\nKeep this/);
  assert.match(merged, /## New Claim\n\nA new sourced claim/);
  assert.match(merged, /## Superseded Sections/);
  assert.match(merged, /### Previous Summary\n\nOld summary/);
});

test("archive merge is idempotent for the same artifact marker", () => {
  const first = mergePromotedMarkdownBody({
    existingContent: "# Existing\n\n## Summary\n\nOld.",
    promotedBody: "## Summary\n\nNew.",
    sourcePath: "INTAKE/browser/source.md",
    artifactPath: "REVIEW/artifacts/browser/draft.md",
    promotedAt: "2026-05-28T12:00:00.000Z",
  });
  const second = mergePromotedMarkdownBody({
    existingContent: first,
    promotedBody: "## Summary\n\nNewer should not duplicate.",
    sourcePath: "INTAKE/browser/source.md",
    artifactPath: "REVIEW/artifacts/browser/draft.md",
    promotedAt: "2026-05-28T13:00:00.000Z",
  });

  assert.equal(second, first);
});

test("wiki index catalog upsert replaces stale entries instead of appending duplicates", () => {
  const updated = upsertWikiIndexCatalogEntry({
    existingIndex: [
      "# Wiki Index",
      "",
      "## Pages",
      "",
      "- [[browser-job-completed|Old title]] — stale summary (updated yesterday)",
      "- [[other-page]] — keep this page",
      "",
      "## Research",
      "",
      "- [[research-note]] — keep this section",
    ].join("\n"),
    pagePath: "AI_MEMORY/wiki/browser-job-completed.md",
    title: "Browser job completed",
    summary: "Updated source-grounded summary.",
    sourceArtifact: "INTAKE/browser/job-report.md",
    promotedAt: "2026-05-29T10:00:00.000Z",
  });

  assert.match(updated, /## Pages\n\n- \[\[browser-job-completed\|Browser job completed\]\] — Updated source-grounded summary/);
  assert.match(updated, /\[\[other-page\]\] — keep this page/);
  assert.match(updated, /## Research/);
  assert.match(updated, /\[\[research-note\]\] — keep this section/);
  assert.equal((updated.match(/browser-job-completed/g) ?? []).length, 1);
});

test("wiki index catalog upsert creates a Pages section when missing", () => {
  const updated = upsertWikiIndexCatalogEntry({
    existingIndex: "# Wiki Index\n\nIntro remains.",
    pagePath: "AI_MEMORY/wiki/new-page.md",
    title: "New Page",
    summary: "A new catalog entry.",
    sourceArtifact: "INTAKE/source.md",
    promotedAt: "2026-05-29T10:30:00.000Z",
  });

  assert.match(updated, /Intro remains/);
  assert.match(updated, /## Pages\n\n- \[\[new-page\|New Page\]\] — A new catalog entry/);
});

test("wiki index summary uses page body text instead of headings and merge markers", () => {
  const summary = summarizePromotedPageForIndex([
    "---",
    "type: \"ai-memory-page\"",
    "---",
    "# Page",
    "",
    "> Draft boundary.",
    "",
    "## Summary",
    "",
    "This is the useful body summary.",
    "",
    "<!-- resonantos-browser-first-promote:draft -->",
    "Promoted at: yesterday",
  ].join("\n"));

  assert.equal(summary, "This is the useful body summary.");
});
