function stripFrontmatter(content) {
  return String(content ?? "").replace(/^---[\s\S]*?---\s*/m, "").trim();
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function markdownTitle(content, fallback = "Untitled source") {
  return /^#\s+(.+)$/m.exec(stripFrontmatter(content))?.[1]?.trim() || fallback;
}

function markdownHeadings(content) {
  return [...stripFrontmatter(content).matchAll(/^#{2,4}\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 12);
}

function wikilinks(content) {
  const links = new Set();
  for (const match of String(content ?? "").matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)) {
    const value = match[1].trim();
    if (value) links.add(value);
  }
  return [...links].slice(0, 16);
}

function sourceSentences(content, limit = 8) {
  return stripFrontmatter(content)
    .replace(/^#+\s+.+$/gm, "")
    .split(/(?<=[.!?])\s+|\n+-\s+/)
    .map(normalizeWhitespace)
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 420)
    .slice(0, limit);
}

function candidateTerms(content, limit = 14) {
  const counts = new Map();
  const body = stripFrontmatter(content);
  const ignored = /^(The|This|That|When|Where|What|Why|How|And|But|For|With|From|Into|However|See|Strategy)$/i;
  const addTerm = (rawTerm) => {
    const term = normalizeWhitespace(rawTerm);
    if (!term || ignored.test(term)) return;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  };
  for (const match of body.matchAll(/\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,4})\b/g)) {
    const term = normalizeWhitespace(match[1]);
    addTerm(term);
    for (const part of term.split(/\s+/)) {
      if (part.length >= 4) addTerm(part);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term, count]) => ({ term, count }))
    .slice(0, limit);
}

function contradictionMarkers(content) {
  const markers = [];
  for (const sentence of sourceSentences(content, 20)) {
    if (/\b(however|but|although|contradict|conflict|tension|risk|uncertain|unknown|disagree|challenge|against)\b/i.test(sentence)) {
      markers.push(sentence);
    }
    if (markers.length >= 6) break;
  }
  return markers;
}

function bulletList(items, fallback) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

export function buildDeterministicWikiDraft({
  sourceContent,
  sourcePath,
  sourceTitle,
  proposedPage,
  requestPath,
  revised = false,
} = {}) {
  const title = sourceTitle || markdownTitle(sourceContent, "Untitled source");
  const headings = markdownHeadings(sourceContent);
  const claims = sourceSentences(sourceContent, 8);
  const links = wikilinks(sourceContent);
  const terms = candidateTerms(sourceContent, 14);
  const contradictions = contradictionMarkers(sourceContent);
  const summary = claims[0] || normalizeWhitespace(stripFrontmatter(sourceContent)).slice(0, 520) || "No readable source text was available.";
  const pageType = headings.length >= 3 ? "source-summary" : "note-summary";

  const relatedPages = [
    ...links.map((link) => `[[${link}]]`),
    ...terms.slice(0, 8).map(({ term }) => `[[${term}]]`),
  ];

  return [
    `# ${title}`,
    "",
    `> ${revised ? "Revised" : "Draft"} wiki update generated from governed intake. This page is trusted only after verification and host-mediated promotion.`,
    "",
    "## Summary",
    summary,
    "",
    "## Source Provenance",
    `- source artifact: \`${sourcePath || "unknown"}\``,
    `- review request: \`${requestPath || "unknown"}\``,
    `- proposed page: \`${proposedPage || "AI_MEMORY/wiki/unknown.md"}\``,
    `- page type: ${pageType}`,
    "",
    "## Key Claims",
    bulletList(claims.map((claim) => `${claim} [source: ${sourcePath || "intake"}]`), "No claim-length source sentences were available; keep this page in review until a stronger ingest model can inspect the source."),
    "",
    "## Entities And Concepts",
    bulletList(terms.map(({ term, count }) => `[[${term}]] — candidate concept/entity from source (${count} mention${count === 1 ? "" : "s"}).`), "No deterministic entity/concept candidates were extracted."),
    "",
    "## Source Structure",
    bulletList(headings.map((heading) => `[[${heading}]] — source heading to consider for a concept, section, or claim page.`), "No source headings were detected."),
    "",
    "## Existing Or Suggested Links",
    bulletList(relatedPages, "No wikilinks or deterministic related-page candidates were detected."),
    "",
    "## Contradictions And Open Questions",
    bulletList(contradictions.map((marker) => `${marker} [needs verification]`), "No deterministic contradiction markers were detected. Semantic lint should still check this against existing wiki pages."),
    "",
    "## Maintenance Notes",
    "- Update `index.md` with a single deduplicated catalog entry for this page during promotion.",
    "- Append ingest/promotion events to `log.md`; do not use the log as the content catalog.",
    "- If any candidate entity duplicates an existing page, merge or cross-link rather than creating a silent duplicate concept.",
    "",
  ].join("\n");
}
