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
