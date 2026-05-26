// Intent citation: docs/architecture/ADR-019-obsidian-addon-embedded-workspace.md

import type { AddOnInstallation, CapabilityGrant, ObsidianNotePayload } from "../../core/contracts";

export type ObsidianMetadata = {
  frontmatter: Array<{ key: string; value: string }>;
  tags: string[];
  wikilinks: string[];
};

export const configuredObsidianVaultPath = (installation: AddOnInstallation | undefined): string =>
  typeof installation?.config?.vaultPath === "string" ? installation.config.vaultPath : "";

export const hasObsidianGrant = (
  installation: AddOnInstallation | undefined,
  capability: CapabilityGrant["capability"],
): boolean => Boolean(installation?.enabled && installation.grantedCapabilities.some((grant) => grant.capability === capability && grant.granted));

export const noteIsDirty = (note: ObsidianNotePayload | null, draftContent: string): boolean =>
  Boolean(note && note.content !== draftContent);

export const renderMarkdownPreview = (content: string): string => {
  const escaped = escapeHtml(content);
  return escaped
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="obsidian-wikilink">$1</span>')
    .replace(/(^|\s)#([A-Za-z0-9_/-]+)/g, '$1<span class="obsidian-tag">#$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
};

export const parseObsidianMetadata = (content: string): ObsidianMetadata => ({
  frontmatter: parseFrontmatter(content),
  tags: uniqueMatches(content, /(^|\s)#([A-Za-z0-9_/-]+)/g, 2).map((tag) => `#${tag}`),
  wikilinks: uniqueMatches(content, /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, 1),
});

const parseFrontmatter = (content: string): ObsidianMetadata["frontmatter"] => {
  if (!content.startsWith("---\n")) {
    return [];
  }
  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) {
    return [];
  }
  return content
    .slice(4, endIndex)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return { key: line, value: "" };
      }
      return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((item) => item.key);
};

const uniqueMatches = (content: string, pattern: RegExp, groupIndex: number): string[] => {
  const values = new Set<string>();
  for (const match of content.matchAll(pattern)) {
    const value = match[groupIndex]?.trim();
    if (value) {
      values.add(value);
    }
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right));
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
