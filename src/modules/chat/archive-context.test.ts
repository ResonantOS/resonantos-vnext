import { describe, expect, it } from "vitest";

import { archiveCitationsFromBundle, formatArchiveContextForPrompt, type ArchiveContextBundle } from "./archive-context";

describe("archive chat context", () => {
  it("passes raw imported source excerpts to the Strategist without treating them as promoted pages", () => {
    const bundle: ArchiveContextBundle = {
      query: "do you know what's the mixtape protocol?",
      pages: [],
      sources: [
        {
          title: "Play_047_The_Mixtape_Constraint",
          sourceType: "md",
          rawPath: "/Memory/INTAKE/imports/mixed/sources/base/02_PROTOCOL_LIBRARY/Play_047_The_Mixtape_Constraint.md",
          processed: false,
          snippet: "The Protocol of Mixtape forbids average answers by adding deliberate curation and friction.",
        },
      ],
      failures: [],
    };

    const prompt = formatArchiveContextForPrompt(bundle);
    const citations = archiveCitationsFromBundle(bundle);

    expect(prompt).toContain("raw/imported source evidence, not yet a trusted promoted wiki page");
    expect(prompt).toContain("answer directly while naming the boundary");
    expect(prompt).toContain("Protocol of Mixtape");
    expect(citations).toEqual([
      expect.objectContaining({
        title: "Play_047_The_Mixtape_Constraint",
        pageType: "raw-imported-source",
      }),
    ]);
  });
});
