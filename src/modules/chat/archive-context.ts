// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md
// Intent citation: docs/architecture/ADR-014-system-architecture-memory.md

import type { ArchiveDocumentPayload, ArchiveSearchPageHit, ArchiveSystemMemoryStatus } from "../../core/contracts";
import type { MemoryProviderBroker } from "../../core/memory-provider";
import {
  requestArchiveDocument,
  requestArchiveSearch,
  requestArchiveSystemMemory,
  requestArchiveSystemMemoryRefresh,
} from "../../core/runtime";

export type ArchiveContextBundle = {
  query: string;
  pages: Array<{
    title: string;
    path: string;
    pageType: string;
    snippet: string;
    content: string;
  }>;
  sources: Array<{
    title: string;
    sourceType: string;
    rawPath: string;
    processed: boolean;
    snippet?: string;
  }>;
  failures: string[];
};

export type SystemMemoryContextBundle = {
  status: ArchiveSystemMemoryStatus["status"];
  generatedAt?: string;
  pages: Array<{
    title: string;
    path: string;
    content: string;
  }>;
  staleSources: string[];
  missingSources: string[];
  failures: string[];
};

const MAX_CONTEXT_PAGES = 2;
const MAX_CONTENT_CHARS = 2_400;
const MAX_SYSTEM_MEMORY_PAGES = 3;
const MAX_SYSTEM_MEMORY_CHARS = 1_900;
const MAX_QUERY_CHARS = 180;

const compactQuery = (message: string): string => {
  const normalized = message
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, MAX_QUERY_CHARS);
};

const trimContent = (content: string): string =>
  content.length > MAX_CONTENT_CHARS ? `${content.slice(0, MAX_CONTENT_CHARS)}\n[Context truncated]` : content;

const trimSystemMemoryContent = (content: string): string =>
  content.length > MAX_SYSTEM_MEMORY_CHARS
    ? `${content.slice(0, MAX_SYSTEM_MEMORY_CHARS)}\n[System memory page truncated]`
    : content;

const pageRank = (page: ArchiveSearchPageHit): number => {
  if (page.pageType === "synthesis") return 4;
  if (page.pageType === "summary") return 3;
  if (page.pageType === "concept") return 2;
  if (page.pageType === "entity") return 1;
  return 0;
};

const systemMemoryPageRank = (pageId: string): number => {
  if (pageId === "resonantos-system-index") return 4;
  if (pageId === "resonantos-architecture-contract") return 3;
  if (pageId === "resonantos-archive-recovery-contract") return 2;
  if (pageId === "resonantos-code-contract-inventory") return 1;
  return 0;
};

export const buildSystemMemoryContextBundle = async (
  memoryProvider?: MemoryProviderBroker,
): Promise<SystemMemoryContextBundle | null> => {
  if (memoryProvider && !memoryProvider.supports.read) {
    return null;
  }
  const failures: string[] = [];
  let status = await requestArchiveSystemMemory();
  if (status.status === "missing" || status.status === "stale") {
    try {
      await requestArchiveSystemMemoryRefresh();
      status = await requestArchiveSystemMemory();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "System Architecture Memory refresh failed.");
    }
  }

  const selectedPages = [...status.pages]
    .sort((left, right) => systemMemoryPageRank(right.pageId) - systemMemoryPageRank(left.pageId))
    .slice(0, MAX_SYSTEM_MEMORY_PAGES);
  const documents = await Promise.all(
    selectedPages.map(async (page) => {
      try {
        return memoryProvider ? await memoryProvider.read(page.filePath) : await requestArchiveDocument(page.filePath);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `Failed to read system memory page ${page.filePath}`);
        return null;
      }
    }),
  );

  return {
    status: status.status,
    generatedAt: status.generatedAt,
    pages: selectedPages.map((page, index) => ({
      title: page.title,
      path: page.filePath,
      content: trimSystemMemoryContent(documents[index]?.content ?? ""),
    })),
    staleSources: status.staleSources,
    missingSources: status.missingSources,
    failures,
  };
};

export const buildArchiveContextBundle = async (
  message: string,
  memoryProvider?: MemoryProviderBroker,
): Promise<ArchiveContextBundle | null> => {
  if (memoryProvider && (!memoryProvider.supports.search || !memoryProvider.supports.read)) {
    return null;
  }
  const query = compactQuery(message);
  if (!query) {
    return null;
  }

  const search = memoryProvider ? await memoryProvider.search(query, 6) : await requestArchiveSearch(query, 6);
  const selectedPages = [...search.pages]
    .sort((left, right) => right.score - left.score || pageRank(right) - pageRank(left))
    .slice(0, MAX_CONTEXT_PAGES);

  const failures: string[] = [];
  const documents: Array<ArchiveDocumentPayload | null> = await Promise.all(
    selectedPages.map(async (page) => {
      try {
        return memoryProvider ? await memoryProvider.read(page.filePath) : await requestArchiveDocument(page.filePath);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `Failed to read ${page.filePath}`);
        return null;
      }
    }),
  );

  const pages = selectedPages.map((page, index) => {
    const document = documents[index];
    return {
      title: page.title,
      path: page.filePath,
      pageType: page.pageType,
      snippet: page.snippet,
      content: trimContent(document?.content ?? page.snippet),
    };
  });

  return {
    query,
    pages,
    sources: search.sources.slice(0, 3).map((source) => {
      const sourceWithSnippet = source as typeof source & { snippet?: string };
      return {
        title: source.title,
        sourceType: source.sourceType,
        rawPath: source.rawPath,
        processed: source.processed,
        snippet: sourceWithSnippet.snippet,
      };
    }),
    failures,
  };
};

export const formatArchiveContextForPrompt = (bundle: ArchiveContextBundle | null): string => {
  if (!bundle || (!bundle.pages.length && !bundle.sources.length)) {
    return [
      "Living Archive context retrieval ran for this turn but returned no directly relevant pages.",
      "Do not claim the archive contains an answer unless the retrieved context supports it.",
    ].join("\n");
  }

  const pageBlocks = bundle.pages.map((page, index) =>
    [
      `Page ${index + 1}: ${page.title}`,
      `Type: ${page.pageType}`,
      `Path: ${page.path}`,
      "Content:",
      page.content,
    ].join("\n"),
  );
  const sourceBlocks = bundle.sources.map((source, index) =>
    [
      `Source ${index + 1}: ${source.title} (${source.sourceType}, processed=${source.processed})`,
      `Path: ${source.rawPath}`,
      "Boundary: raw/imported source evidence, not yet a trusted promoted wiki page.",
      source.snippet ? `Excerpt: ${source.snippet}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const failureBlock = bundle.failures.length ? [`Read failures:`, ...bundle.failures].join("\n") : "";

  return [
    "Living Archive context retrieved for this turn.",
    `Search query: ${bundle.query}`,
    "Use this context as memory evidence. Clearly distinguish promoted wiki pages from raw/imported source evidence. If raw source evidence contains enough information to answer, answer directly while naming the boundary; do not refuse solely because it is not yet promoted.",
    ...pageBlocks,
    sourceBlocks.length ? ["Tracked source hits:", ...sourceBlocks].join("\n") : "",
    failureBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const formatSystemMemoryForPrompt = (bundle: SystemMemoryContextBundle | null): string => {
  if (!bundle) {
    return [
      "ResonantOS System Architecture Memory was not available for this turn.",
      "Do not guess current system architecture. If the user asks how ResonantOS works, say the system memory status could not be loaded.",
    ].join("\n");
  }

  const pageBlocks = bundle.pages.map((page, index) =>
    [`System Memory Page ${index + 1}: ${page.title}`, `Path: ${page.path}`, "Content:", page.content].join("\n"),
  );
  const staleBlock = bundle.staleSources.length ? `Stale system sources: ${bundle.staleSources.join(", ")}` : "";
  const missingBlock = bundle.missingSources.length ? `Missing required system sources: ${bundle.missingSources.join(", ")}` : "";
  const failureBlock = bundle.failures.length ? `System memory failures: ${bundle.failures.join(" | ")}` : "";

  return [
    "ResonantOS System Architecture Memory is host-owned AI Memory and has priority over user imports for questions about how ResonantOS works.",
    `System memory status: ${bundle.status}.`,
    bundle.generatedAt ? `Generated at: ${bundle.generatedAt}.` : "",
    staleBlock,
    missingBlock,
    failureBlock,
    ...pageBlocks,
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const archiveCitationsFromBundle = (bundle: ArchiveContextBundle | null) =>
  bundle
    ? [
        ...bundle.pages.map((page) => ({
          title: page.title,
          path: page.path,
          pageType: page.pageType,
          snippet: page.snippet,
        })),
        ...bundle.sources.map((source) => ({
          title: source.title,
          path: source.rawPath,
          pageType: "raw-imported-source",
          snippet: source.snippet,
        })),
      ]
    : [];
