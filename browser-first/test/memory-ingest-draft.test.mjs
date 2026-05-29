import assert from "node:assert/strict";
import test from "node:test";

import { buildDeterministicWikiDraft } from "../host/memory-ingest-draft.mjs";

test("deterministic wiki draft extracts LLM Wiki maintenance structure from source", () => {
  const draft = buildDeterministicWikiDraft({
    sourceTitle: "ResonantOS Delegation",
    sourcePath: "INTAKE/browser/delegation.md",
    proposedPage: "AI_MEMORY/wiki/resonantos-delegation.md",
    requestPath: "REVIEW/requests/delegation.md",
    sourceContent: [
      "# ResonantOS Delegation",
      "",
      "## Strategy",
      "Augmentor coordinates Hermes and OpenCode when work requires multiple specialist agents.",
      "However, Hermes must not write trusted AI Memory pages directly because add-on agents are not the Strategist.",
      "",
      "## Browser Work",
      "OpenCode can implement deterministic browser fixtures while Hermes can maintain longer research loops.",
      "",
      "See [[Living Archive]] and [[Agent Control]].",
    ].join("\n"),
  });

  assert.match(draft, /^# ResonantOS Delegation/m);
  assert.match(draft, /## Key Claims/);
  assert.match(draft, /Augmentor coordinates Hermes and OpenCode/);
  assert.match(draft, /## Entities And Concepts/);
  assert.match(draft, /\[\[Augmentor\]\]/);
  assert.match(draft, /\[\[Hermes\]\]/);
  assert.match(draft, /## Source Structure/);
  assert.match(draft, /\[\[Strategy\]\]/);
  assert.match(draft, /## Existing Or Suggested Links/);
  assert.match(draft, /\[\[Living Archive\]\]/);
  assert.match(draft, /## Contradictions And Open Questions/);
  assert.match(draft, /However, Hermes must not write trusted AI Memory pages directly/);
  assert.match(draft, /source artifact: `INTAKE\/browser\/delegation\.md`/);
});
