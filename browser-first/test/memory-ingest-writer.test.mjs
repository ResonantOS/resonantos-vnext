import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchiveIngestWriterMessages,
  runArchiveIngestWriterWithRoute,
  validateWikiDraftContent,
} from "../host/memory-ingest-writer.mjs";

const validProviderDraft = [
  "# ResonantOS Delegation",
  "",
  "## Summary",
  "Augmentor coordinates specialist agents while preserving the Living Archive trust boundary.",
  "",
  "## Source Provenance",
  "- source artifact: `INTAKE/browser/delegation.md`",
  "- review request: `REVIEW/requests/delegation.md`",
  "",
  "## Key Claims",
  "- [[Augmentor]] coordinates [[Hermes]] and [[OpenCode]] for delegated work. [source: INTAKE/browser/delegation.md]",
  "- Add-on agents should not write trusted AI Memory pages directly. [source: INTAKE/browser/delegation.md]",
  "",
  "## Entities And Concepts",
  "- [[Augmentor]] — trusted Strategist interface.",
  "- [[Hermes]] — delegated long-running agent.",
  "- [[OpenCode]] — delegated coding agent.",
  "",
  "## Existing Or Suggested Links",
  "- [[Living Archive]]",
  "- [[Agent Control]]",
  "",
  "## Contradictions And Open Questions",
  "- No deterministic contradiction markers were detected; verifier should compare against existing pages.",
  "",
  "## Maintenance Notes",
  "- Update `index.md` once promoted.",
  "- Append promotion to `log.md`.",
].join("\n");

test("archive ingest writer prompt encodes LLM Wiki maintainer rules", () => {
  const messages = buildArchiveIngestWriterMessages({
    sourceContent: "# Source\nAugmentor coordinates Hermes.",
    sourcePath: "INTAKE/browser/source.md",
    sourceTitle: "Source",
    proposedPage: "AI_MEMORY/wiki/source.md",
    requestPath: "REVIEW/requests/source.md",
    existingIndex: "# Wiki Index",
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /persistent, interlinked markdown memory/);
  assert.match(messages[0].content, /Required sections/);
  assert.match(messages[1].content, /Proposed wiki page: AI_MEMORY\/wiki\/source\.md/);
  assert.match(messages[1].content, /Current wiki index excerpt/);
});

test("archive ingest writer accepts structurally complete provider wiki drafts", async () => {
  const result = await runArchiveIngestWriterWithRoute({
    sourceContent: "# ResonantOS Delegation\nAugmentor coordinates Hermes and OpenCode.",
    sourcePath: "INTAKE/browser/delegation.md",
    sourceTitle: "ResonantOS Delegation",
    proposedPage: "AI_MEMORY/wiki/resonantos-delegation.md",
    requestPath: "REVIEW/requests/delegation.md",
    existingIndex: "# Wiki Index",
    route: {
      apiBaseUrl: "https://provider.test/v1",
      providerId: "shared-minimax",
      providerType: "minimax",
      wireModel: "MiniMax-M2.7",
    },
    credential: "test-token",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: validProviderDraft } }],
        usage: { total_tokens: 123 },
      }),
    }),
  });

  assert.equal(result.writerStatus, "provider-written");
  assert.equal(result.providerId, "shared-minimax");
  assert.match(result.content, /## Key Claims/);
  assert.equal(validateWikiDraftContent(result.content).valid, true);
});

test("archive ingest writer falls back when provider draft is malformed", async () => {
  const result = await runArchiveIngestWriterWithRoute({
    sourceContent: "# ResonantOS Delegation\nAugmentor coordinates Hermes and OpenCode.",
    sourcePath: "INTAKE/browser/delegation.md",
    sourceTitle: "ResonantOS Delegation",
    proposedPage: "AI_MEMORY/wiki/resonantos-delegation.md",
    requestPath: "REVIEW/requests/delegation.md",
    route: {
      apiBaseUrl: "https://provider.test/v1",
      providerId: "shared-minimax",
      providerType: "minimax",
      wireModel: "MiniMax-M2.7",
    },
    credential: "test-token",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Too short." } }],
      }),
    }),
  });

  assert.equal(result.writerStatus, "deterministic-fallback");
  assert.match(result.fallbackReason, /structure validation/);
  assert.match(result.content, /## Source Provenance/);
});
