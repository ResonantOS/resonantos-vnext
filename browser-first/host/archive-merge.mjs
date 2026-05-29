// Intent citation: docs/architecture/ADR-027-living-archive-llm-wiki-compliance.md

function safeFileSlug(value) {
  return String(value ?? "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function splitMarkdownH2Sections(body) {
  const preamble = [];
  const sections = [];
  let currentHeading = "";
  let currentBody = [];
  for (const line of String(body ?? "").split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
        currentBody = [];
      }
      currentHeading = line.replace(/^##\s+/, "").trim();
    } else if (currentHeading) {
      currentBody.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (currentHeading) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
  }
  return { preamble: preamble.join("\n").trim(), sections };
}

function renderMarkdownSection(section) {
  const body = String(section.body ?? "").trim();
  return body ? `## ${section.heading}\n\n${body}` : `## ${section.heading}`;
}

function stripMarkdownFrontmatter(content) {
  return String(content ?? "").replace(/^---[\s\S]*?---\s*/m, "").trim();
}

export function mergePromotedMarkdownBody({ existingContent, promotedBody, sourcePath, artifactPath, promotedAt }) {
  const marker = `<!-- resonantos-browser-first-promote:${safeFileSlug(artifactPath)} -->`;
  const existingBody = stripMarkdownFrontmatter(existingContent);
  if (!existingBody) {
    return `${String(promotedBody ?? "").trim()}\n\n${marker}\nPromoted at: ${promotedAt} from ${artifactPath}`;
  }
  if (existingBody.includes(marker)) {
    return existingBody;
  }
  const existing = splitMarkdownH2Sections(existingBody);
  const promoted = splitMarkdownH2Sections(promotedBody);
  if (!existing.sections.length || !promoted.sections.length) {
    return [
      existingBody,
      "",
      "---",
      "",
      marker,
      `## Promoted Update (${promotedAt})`,
      "",
      `**Source:** \`${sourcePath}\`  `,
      `**Review Artifact:** \`${artifactPath}\``,
      "",
      String(promotedBody ?? "").trim(),
    ].join("\n");
  }
  const output = [];
  if (existing.preamble) output.push(existing.preamble);
  output.push(`${marker}\n> Last structured merge: \`${promotedAt}\` from \`${sourcePath}\` via \`${artifactPath}\`.`);
  const used = new Set();
  const superseded = [];
  for (const section of existing.sections) {
    const index = promoted.sections.findIndex((candidate) => safeFileSlug(candidate.heading) === safeFileSlug(section.heading));
    if (index >= 0) {
      used.add(index);
      superseded.push(section);
      output.push(renderMarkdownSection(promoted.sections[index]));
    } else {
      output.push(renderMarkdownSection(section));
    }
  }
  promoted.sections.forEach((section, index) => {
    if (!used.has(index)) output.push(renderMarkdownSection(section));
  });
  if (promoted.preamble) {
    output.push(`## Promoted Context (${promotedAt})\n\n${promoted.preamble}`);
  }
  if (superseded.length) {
    output.push(`## Superseded Sections (${promotedAt})\n\n${superseded.map((section) => `### Previous ${section.heading}\n\n${section.body.trim()}`).join("\n\n")}`);
  }
  return output.join("\n\n").trim();
}

function markdownLinkAliases(pagePath) {
  const normalized = String(pagePath ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
  const basename = normalized.split("/").pop()?.replace(/\.(md|markdown)$/i, "") ?? "";
  const withoutExtension = normalized.replace(/\.(md|markdown)$/i, "");
  return new Set([
    basename,
    withoutExtension,
    normalized,
  ].filter(Boolean));
}

function catalogLineTargetsPage(line, pagePath) {
  const aliases = markdownLinkAliases(pagePath);
  for (const match of String(line ?? "").matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)) {
    const target = match[1].trim().replace(/^\.\//, "").replace(/\.(md|markdown)$/i, "");
    if (aliases.has(target) || aliases.has(`${target}.md`)) return true;
  }
  for (const match of String(line ?? "").matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const target = match[1].trim().replace(/^\.\//, "");
    if (aliases.has(target) || aliases.has(target.replace(/\.(md|markdown)$/i, ""))) return true;
  }
  return false;
}

export function summarizePromotedPageForIndex(content, limit = 180) {
  const text = stripMarkdownFrontmatter(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !line.startsWith("#") &&
      !line.startsWith(">") &&
      !/^[-*]\s+/.test(line) &&
      !/^Promoted at:/i.test(line) &&
      !/^<!--/.test(line)
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

export function upsertWikiIndexCatalogEntry({
  existingIndex,
  pagePath,
  title,
  summary,
  sourceArtifact,
  promotedAt,
}) {
  const safeTitle = String(title ?? "").trim() || String(pagePath ?? "Untitled page").split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "Untitled page";
  const aliases = markdownLinkAliases(pagePath);
  const primaryAlias = [...aliases][0] || safeFileSlug(safeTitle);
  const safeSummary = String(summary ?? "").replace(/\s+/g, " ").trim() || "AI-curated memory page.";
  const metadata = [
    promotedAt ? `updated ${promotedAt}` : "",
    sourceArtifact ? `source ${sourceArtifact}` : "",
  ].filter(Boolean).join("; ");
  const entry = `- [[${primaryAlias}|${safeTitle}]] — ${safeSummary}${metadata ? ` (${metadata})` : ""}`;
  const original = String(existingIndex ?? "").trim();
  if (!original) {
    return ["# Wiki Index", "", "## Pages", "", entry, ""].join("\n");
  }

  const lines = original.split(/\r?\n/);
  const deduped = lines.filter((line) => !catalogLineTargetsPage(line, pagePath));
  const pagesHeadingIndex = deduped.findIndex((line) => /^##\s+Pages\s*$/i.test(line.trim()));
  if (pagesHeadingIndex >= 0) {
    const insertAt = pagesHeadingIndex + 1;
    const next = [...deduped];
    while (next[insertAt] === "") {
      next.splice(insertAt, 1);
    }
    next.splice(insertAt, 0, "", entry);
    return `${next.join("\n").replace(/\s+$/g, "")}\n`;
  }

  return `${deduped.join("\n").replace(/\s+$/g, "")}\n\n## Pages\n\n${entry}\n`;
}
