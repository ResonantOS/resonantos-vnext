import assert from "node:assert/strict";
import test from "node:test";

import { mergePromotedMarkdownBody } from "../host/archive-merge.mjs";

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
