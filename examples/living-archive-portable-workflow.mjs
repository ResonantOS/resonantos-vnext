// Intent citation: docs/architecture/ADR-029-living-archive-mcp-bridge.md

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  mergePromotedMarkdownBody,
  summarizePromotedPageForIndex,
  upsertWikiIndexCatalogEntry,
} from "../browser-first/host/archive-merge.mjs";
import { buildDeterministicWikiDraft } from "../browser-first/host/memory-ingest-draft.mjs";
import { ensureLivingArchiveSchema } from "../browser-first/host/memory-schema.mjs";
import { computeWikiHealth } from "../browser-first/host/memory-wiki-health.mjs";

const nowIso = () => new Date().toISOString();

const readTextExtensions = new Set([".md", ".markdown", ".txt"]);

const pathInside = (root, candidate) => {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const toPortablePath = (value) => String(value ?? "").split(sep).join("/");

const safeFileSlug = (value) =>
  String(value ?? "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";

const markdownTitle = (content, fallback = "Untitled source") =>
  /^#\s+(.+)$/m.exec(String(content ?? "").replace(/^---[\s\S]*?---\s*/m, ""))?.[1]?.trim() || fallback;

const compactExcerpt = (content, limit = 320) => {
  const text = String(content ?? "")
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#+\s+.+$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
};

function resolveMemoryPath(memoryRoot, requestedPath = "", requiredPrefix = "") {
  const root = resolve(memoryRoot);
  const absolute = resolve(root, requestedPath);
  if (!pathInside(root, absolute)) {
    throw new Error("Path escapes the configured Living Archive memory root.");
  }
  if (requiredPrefix) {
    const prefix = resolve(root, requiredPrefix);
    if (!pathInside(prefix, absolute)) {
      throw new Error(`Path must stay under ${requiredPrefix}.`);
    }
  }
  return absolute;
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function reviewArtifactId(request) {
  return createHash("sha1")
    .update(`${request.requestFile}:${request.sourcePath}:${request.intent}`)
    .digest("hex")
    .slice(0, 12);
}

function normalizedArtifactPath(memoryRoot, artifactFile) {
  const absolute = resolveMemoryPath(memoryRoot, artifactFile, join("AI_MEMORY", "provenance", "review-artifacts"));
  if (extname(absolute).toLowerCase() !== ".json") {
    throw new Error("Review artifact must be a JSON artifact under AI_MEMORY/provenance/review-artifacts.");
  }
  return absolute;
}

async function loadReviewArtifact(memoryRoot, artifactFile) {
  const artifactPath = normalizedArtifactPath(memoryRoot, artifactFile);
  return {
    artifactPath,
    artifact: await readJsonFile(artifactPath),
  };
}

export async function processPortableIngestRequest({ memoryRoot, requestFile }) {
  await ensureLivingArchiveSchema({ memoryRoot });
  const requestPath = resolveMemoryPath(memoryRoot, requestFile, join("INTAKE", "review-queue"));
  if (extname(requestPath).toLowerCase() !== ".json") {
    throw new Error("Ingest request must be a JSON file under INTAKE/review-queue.");
  }
  const request = await readJsonFile(requestPath);
  const sourcePath = resolveMemoryPath(memoryRoot, request.sourcePath);
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error("Ingest request source file is missing.");
  }
  if (!readTextExtensions.has(extname(sourcePath).toLowerCase())) {
    throw new Error("Portable ingest currently supports markdown and text source artifacts.");
  }
  const sourceContent = await fs.readFile(sourcePath, "utf8");
  const sourceTitle = markdownTitle(sourceContent, basename(sourcePath, extname(sourcePath)));
  const proposedPage = `AI_MEMORY/wiki/${safeFileSlug(sourceTitle)}.md`;
  const requestRelative = toPortablePath(relative(resolve(memoryRoot), requestPath));
  const sourceRelative = toPortablePath(relative(resolve(memoryRoot), sourcePath));
  const artifactRelative = `AI_MEMORY/provenance/review-artifacts/${reviewArtifactId({ ...request, requestFile: requestRelative })}-${safeFileSlug(sourceTitle)}.json`;
  const artifactPath = resolveMemoryPath(memoryRoot, artifactRelative, join("AI_MEMORY", "provenance", "review-artifacts"));
  if (existsSync(artifactPath)) {
    return {
      requestFile: requestRelative,
      reviewArtifactFile: artifactRelative,
      status: "artifact-existing",
    };
  }

  const createdAt = nowIso();
  const proposedContent = buildDeterministicWikiDraft({
    sourceContent,
    sourcePath: sourceRelative,
    sourceTitle,
    proposedPage,
    requestPath: requestRelative,
  });
  const artifact = {
    type: "living-archive-review-artifact",
    status: "pending",
    createdAt,
    requestFile: requestRelative,
    actorId: request.actorId ?? "unknown",
    sourcePath: sourceRelative,
    sourceType: request.sourceType ?? "",
    sourceRole: request.sourceRole ?? null,
    intent: request.intent ?? "",
    provenance: request.provenance ?? {},
    proposedPage,
    title: sourceTitle,
    summary: compactExcerpt(sourceContent),
    proposedContent,
    verification: {
      status: "deterministic-ready",
      checks: [
        "source file exists under memory root",
        "source file is immutable input",
        "proposed page is scoped to AI_MEMORY/wiki",
        "draft records visible source provenance",
      ],
      findings: [],
    },
    decision: {
      status: "pending",
      actorId: "",
      decidedAt: "",
      notes: "",
    },
    promotion: {
      status: "not-promoted",
      promotedAt: "",
      promotedPage: "",
      backupPath: "",
    },
    boundary: {
      rawSourceMutated: false,
      trustedKnowledgeWrite: false,
      promotionRequiresApproval: true,
    },
  };
  await writeJsonFile(artifactPath, artifact);
  return {
    requestFile: requestRelative,
    reviewArtifactFile: artifactRelative,
    status: "artifact-created",
  };
}

export async function decidePortableReview({ memoryRoot, artifactFile, actorId, action, notes = "" }) {
  const allowed = new Set(["approve", "reject", "escalate"]);
  if (!allowed.has(action)) {
    throw new Error("Review action must be approve, reject, or escalate.");
  }
  const { artifactPath, artifact } = await loadReviewArtifact(memoryRoot, artifactFile);
  if (artifact.promotion?.status === "promoted") {
    throw new Error("Promoted review artifacts cannot be re-decided.");
  }
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "escalated";
  artifact.status = status;
  artifact.decision = {
    status,
    actorId: String(actorId || "strategist.core"),
    decidedAt: nowIso(),
    notes: String(notes ?? "").slice(0, 2000),
  };
  await writeJsonFile(artifactPath, artifact);
  return {
    artifactFile: toPortablePath(relative(resolve(memoryRoot), artifactPath)),
    status,
    actorId: artifact.decision.actorId,
    decidedAt: artifact.decision.decidedAt,
  };
}

export async function promotePortableReviewArtifact({ memoryRoot, artifactFile, actorId }) {
  await ensureLivingArchiveSchema({ memoryRoot });
  const { artifactPath, artifact } = await loadReviewArtifact(memoryRoot, artifactFile);
  if (artifact.promotion?.status === "promoted") {
    return {
      artifactFile: toPortablePath(relative(resolve(memoryRoot), artifactPath)),
      status: "already-promoted",
      promotedPage: artifact.promotion.promotedPage,
      promotedAt: artifact.promotion.promotedAt,
      backupPath: artifact.promotion.backupPath,
    };
  }
  if (artifact.decision?.status !== "approved") {
    throw new Error("Review artifact must be approved before trusted wiki promotion.");
  }
  const proposedPage = String(artifact.proposedPage ?? "");
  const pagePath = resolveMemoryPath(memoryRoot, proposedPage, join("AI_MEMORY", "wiki"));
  if (!readTextExtensions.has(extname(pagePath).toLowerCase())) {
    throw new Error("Promoted wiki page must be markdown under AI_MEMORY/wiki.");
  }
  const proposedContent = String(artifact.proposedContent ?? "").trim();
  if (proposedContent.length < 80) {
    throw new Error("Review artifact proposed content is too short to promote safely.");
  }

  const promotedAt = nowIso();
  await fs.mkdir(dirname(pagePath), { recursive: true });
  let backupPath = "";
  let existingContent = "";
  if (existsSync(pagePath)) {
    existingContent = await fs.readFile(pagePath, "utf8");
    const backupRelative = `AI_MEMORY/backups/promotions/${promotedAt.replace(/[:.]/g, "-")}/${basename(pagePath)}`;
    const backupAbsolute = resolveMemoryPath(memoryRoot, backupRelative, join("AI_MEMORY", "backups", "promotions"));
    await fs.mkdir(dirname(backupAbsolute), { recursive: true });
    await fs.copyFile(pagePath, backupAbsolute);
    backupPath = backupRelative;
  }

  const mergedContent = mergePromotedMarkdownBody({
    existingContent,
    promotedBody: proposedContent,
    sourcePath: artifact.sourcePath,
    artifactPath: toPortablePath(relative(resolve(memoryRoot), artifactPath)),
    promotedAt,
  });
  const pageTitle = artifact.title || markdownTitle(proposedContent, basename(pagePath, extname(pagePath)));
  const pageBody = [
    "---",
    "source: \"living-archive-mcp\"",
    "type: \"ai-memory-page\"",
    `title: ${JSON.stringify(pageTitle)}`,
    `updatedAt: ${JSON.stringify(promotedAt)}`,
    `reviewArtifact: ${JSON.stringify(toPortablePath(relative(resolve(memoryRoot), artifactPath)))}`,
    `sourceArtifact: ${JSON.stringify(artifact.sourcePath || "")}`,
    "---",
    "",
    mergedContent,
    "",
  ].join("\n");
  await fs.writeFile(pagePath, pageBody, "utf8");

  const indexPath = resolveMemoryPath(memoryRoot, join("AI_MEMORY", "wiki", "index.md"), join("AI_MEMORY", "wiki"));
  const logPath = resolveMemoryPath(memoryRoot, join("AI_MEMORY", "wiki", "log.md"), join("AI_MEMORY", "wiki"));
  const existingIndex = existsSync(indexPath) ? await fs.readFile(indexPath, "utf8").catch(() => "") : "";
  await fs.writeFile(indexPath, upsertWikiIndexCatalogEntry({
    existingIndex,
    pagePath: proposedPage,
    title: pageTitle,
    summary: summarizePromotedPageForIndex(proposedContent),
    sourceArtifact: artifact.sourcePath,
    promotedAt,
  }), "utf8");
  await fs.appendFile(
    logPath,
    `## [${promotedAt}] trusted_wiki_promote | ${pageTitle}\n- page: ${proposedPage}\n- review artifact: ${toPortablePath(relative(resolve(memoryRoot), artifactPath))}\n${backupPath ? `- backup: ${backupPath}\n` : ""}`,
    "utf8",
  );

  artifact.status = "promoted";
  artifact.promotion = {
    status: "promoted",
    actorId: String(actorId || "strategist.core"),
    promotedAt,
    promotedPage: proposedPage,
    backupPath,
  };
  artifact.boundary = {
    ...(artifact.boundary ?? {}),
    trustedKnowledgeWrite: true,
    rawSourceMutated: false,
  };
  await writeJsonFile(artifactPath, artifact);
  return {
    artifactFile: toPortablePath(relative(resolve(memoryRoot), artifactPath)),
    status: "promoted",
    promotedPage: proposedPage,
    promotedAt,
    backupPath,
  };
}

async function listQueueFiles(memoryRoot) {
  const queueRoot = resolveMemoryPath(memoryRoot, join("INTAKE", "review-queue"));
  const entries = await fs.readdir(queueRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => toPortablePath(join("INTAKE", "review-queue", entry.name)))
    .sort();
}

export async function runPortableMaintenanceCycle({ memoryRoot, maxRequests = 20, autoApprove = false, actorId = "strategist.core" } = {}) {
  await ensureLivingArchiveSchema({ memoryRoot });
  const processed = [];
  const promoted = [];
  const errors = [];
  for (const requestFile of (await listQueueFiles(memoryRoot)).slice(0, Math.max(1, Math.min(100, Number(maxRequests) || 20)))) {
    try {
      const result = await processPortableIngestRequest({ memoryRoot, requestFile });
      processed.push(result);
      if (autoApprove) {
        await decidePortableReview({
          memoryRoot,
          artifactFile: result.reviewArtifactFile,
          actorId,
          action: "approve",
          notes: "Auto-approved by portable maintenance cycle.",
        });
        promoted.push(await promotePortableReviewArtifact({
          memoryRoot,
          artifactFile: result.reviewArtifactFile,
          actorId,
        }));
      }
    } catch (error) {
      errors.push({
        requestFile,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    ranAt: nowIso(),
    processed,
    promoted,
    errors,
  };
}

export async function runPortableSemanticLint({ memoryRoot }) {
  const wikiHealth = await computeWikiHealth({ wikiRoot: join(resolve(memoryRoot), "AI_MEMORY", "wiki") });
  return {
    checkedAt: nowIso(),
    findings: (wikiHealth.issues ?? []).map((issue) => ({
      severity: issue.severity,
      category: issue.type,
      target: "AI_MEMORY/wiki",
      detail: issue.message,
    })),
    repairRequestFiles: [],
    wikiHealth,
  };
}
