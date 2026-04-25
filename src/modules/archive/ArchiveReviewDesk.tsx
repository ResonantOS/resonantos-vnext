// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type {
  ArchivePromoteReviewArtifactResult,
  ArchiveProcessIngestResult,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ArchiveReviewDecisionResult,
} from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveReviewDeskProps = {
  archiveQueueBusy: boolean;
  archiveQueue: ArchiveQueuedIngestRequest[];
  archiveReviewArtifacts: ArchiveReviewArtifact[];
  archiveProcessResult: ArchiveProcessIngestResult | null;
  archiveReviewDecisionResult: ArchiveReviewDecisionResult | null;
  archivePromotionResult: ArchivePromoteReviewArtifactResult | null;
  onRefreshArchiveQueue: () => void;
  onProcessArchiveRequest: (requestFile: string) => void;
  onApproveReviewArtifact: (artifactFile: string) => void;
  onEscalateReviewArtifact: (artifactFile: string) => void;
  onRejectReviewArtifact: (artifactFile: string) => void;
  onPromoteReviewArtifact: (artifactFile: string) => void;
};

type ProposedPagePreview = {
  type: string;
  title: string;
  content: string;
};

const textOf = (value: unknown, fallback = "Unknown"): string => (typeof value === "string" && value.trim() ? value : fallback);

const proposedPageOf = (page: Record<string, unknown>, index: number): ProposedPagePreview => ({
  type: textOf(page.type ?? page.pageType, "page"),
  title: textOf(page.title ?? page.pageId, `Proposed page ${index + 1}`),
  content: textOf(page.content ?? page.body ?? page.summary, "No proposed page body was provided."),
});

const statusToneClass = (status: ArchiveReviewArtifact["decision"]["status"]): string => {
  if (status === "approved") {
    return "tone tone-active";
  }
  if (status === "pending" || status === "escalated") {
    return "tone tone-warning";
  }
  return "tone";
};

export function ArchiveReviewDesk({
  archiveQueueBusy,
  archiveQueue,
  archiveReviewArtifacts,
  archiveProcessResult,
  archiveReviewDecisionResult,
  archivePromotionResult,
  onRefreshArchiveQueue,
  onProcessArchiveRequest,
  onApproveReviewArtifact,
  onEscalateReviewArtifact,
  onRejectReviewArtifact,
  onPromoteReviewArtifact,
}: ArchiveReviewDeskProps) {
  const pendingArtifacts = archiveReviewArtifacts.filter((artifact) => artifact.decision.status === "pending").length;
  const approvedArtifacts = archiveReviewArtifacts.filter((artifact) => artifact.decision.status === "approved").length;

  return (
    <section className="archive-review-desk" aria-label="Living Archive review desk">
      <Panel
        className="archive-review-hero"
        title="Ingest Review Desk"
        subtitle="Turn raw intake into trusted wiki knowledge through the Strategist-owned review path."
        actions={
          <button type="button" className="button-secondary touch-action" onClick={onRefreshArchiveQueue} disabled={archiveQueueBusy}>
            {archiveQueueBusy ? "Refreshing..." : "Refresh Queue"}
          </button>
        }
      >
        <div className="archive-review-stats" aria-label="Archive review status">
          <ReviewStat label="Queued" value={archiveQueue.length} />
          <ReviewStat label="Pending Review" value={pendingArtifacts} />
          <ReviewStat label="Approved" value={approvedArtifacts} />
        </div>
        <ol className="archive-review-steps">
          <li>Queue source</li>
          <li>Process into review artifact</li>
          <li>Approve, reject, or escalate</li>
          <li>Promote approved pages to the trusted wiki</li>
        </ol>
      </Panel>

      <Panel title="Queue" subtitle="Sources wait here before the ingest model turns them into reviewable knowledge proposals.">
        {archiveQueue.length ? (
          <div className="archive-touch-list">
            {archiveQueue.map((item) => (
              <article key={item.requestFile} className="archive-review-card">
                <div className="provider-head">
                  <div>
                    <span className="eyebrow">Queued source</span>
                    <strong>{item.sourcePath}</strong>
                    <p>
                      {item.sourceType} · {item.intent} · queued by {item.actorId}
                    </p>
                  </div>
                  <span className={`tone ${item.sourceExists ? "tone-active" : "tone-warning"}`}>
                    {item.sourceExists ? "source ready" : "source missing"}
                  </span>
                </div>
                <div className="archive-review-actions">
                  <button
                    type="button"
                    className="button-secondary touch-action"
                    onClick={() => onProcessArchiveRequest(item.requestFile)}
                    disabled={archiveQueueBusy || !item.sourceExists}
                  >
                    Process Request
                  </button>
                  <span className="provider-scope">{item.queuedAt}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="inline-notice">No pending ingest requests in the review queue.</div>
        )}

        {archiveProcessResult ? (
          <article className="archive-review-card archive-review-result">
            <div className="provider-head">
              <div>
                <span className="eyebrow">Latest artifact</span>
                <strong>Review artifact created</strong>
                <p>{archiveProcessResult.reviewArtifactFile}</p>
              </div>
              <span className="tone tone-active">{archiveProcessResult.checkedAt}</span>
            </div>
            <p>{archiveProcessResult.summary}</p>
          </article>
        ) : null}
      </Panel>

      <Panel title="Review Artifacts" subtitle="Inspect proposed pages before any trusted wiki write is allowed.">
        {archiveReviewArtifacts.length ? (
          <div className="archive-touch-list">
            {archiveReviewArtifacts.map((artifact) => (
              <ArchiveReviewArtifactCard
                key={artifact.artifactFile}
                artifact={artifact}
                archiveQueueBusy={archiveQueueBusy}
                onApproveReviewArtifact={onApproveReviewArtifact}
                onEscalateReviewArtifact={onEscalateReviewArtifact}
                onRejectReviewArtifact={onRejectReviewArtifact}
                onPromoteReviewArtifact={onPromoteReviewArtifact}
              />
            ))}
          </div>
        ) : (
          <div className="inline-notice">No review artifacts have been generated yet.</div>
        )}

        {archiveReviewDecisionResult ? (
          <article className="archive-review-card archive-review-result">
            <div className="provider-head">
              <div>
                <span className="eyebrow">Latest decision</span>
                <strong>{archiveReviewDecisionResult.artifactFile}</strong>
              </div>
              <span className="tone tone-active">{archiveReviewDecisionResult.decidedAt}</span>
            </div>
            <p>
              {archiveReviewDecisionResult.action} · {archiveReviewDecisionResult.status} ·{" "}
              {archiveReviewDecisionResult.tierApplied}
            </p>
          </article>
        ) : null}

        {archivePromotionResult ? (
          <article className="archive-review-card archive-review-result">
            <div className="provider-head">
              <div>
                <span className="eyebrow">Latest trusted wiki promotion</span>
                <strong>{archivePromotionResult.artifactFile}</strong>
              </div>
              <span className="tone tone-active">{archivePromotionResult.promotedAt}</span>
            </div>
            <p>
              {archivePromotionResult.pagesWritten.length} written · {archivePromotionResult.skippedPages.length} skipped
            </p>
            {archivePromotionResult.pagesWritten.length ? (
              <ul className="mono-list">
                {archivePromotionResult.pagesWritten.map((page) => (
                  <li key={`${page.pageType}:${page.pageId}`}>
                    {page.action} · {page.pageType} · {page.mergeMode} · {page.filePath} ·{" "}
                    {page.indexed ? "indexed" : "file-only"}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}
      </Panel>
    </section>
  );
}

function ReviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="archive-review-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ArchiveReviewArtifactCard({
  artifact,
  archiveQueueBusy,
  onApproveReviewArtifact,
  onEscalateReviewArtifact,
  onRejectReviewArtifact,
  onPromoteReviewArtifact,
}: {
  artifact: ArchiveReviewArtifact;
  archiveQueueBusy: boolean;
  onApproveReviewArtifact: (artifactFile: string) => void;
  onEscalateReviewArtifact: (artifactFile: string) => void;
  onRejectReviewArtifact: (artifactFile: string) => void;
  onPromoteReviewArtifact: (artifactFile: string) => void;
}) {
  const strategistCanApprove = artifact.recommendedTier !== "human-review";
  const isPending = artifact.decision.status === "pending";
  const isApproved = artifact.decision.status === "approved";
  const proposedPages = artifact.proposedPages.map(proposedPageOf);

  return (
    <article className="archive-review-card">
      <div className="provider-head">
        <div>
          <span className="eyebrow">Review artifact</span>
          <strong>{artifact.sourcePath}</strong>
          <p>
            {artifact.sourceType} · {artifact.intent} · {artifact.model} via {artifact.providerId}
          </p>
        </div>
        <span className={statusToneClass(artifact.decision.status)}>{artifact.decision.status}</span>
      </div>

      <p>{artifact.summary}</p>

      <div className="archive-review-signal-grid">
        <SignalBlock label="Recommended tier" value={artifact.recommendedTier} detail={artifact.recommendationReason} />
        <SignalBlock label="Confidence" value={artifact.confidence} detail={`Doctrine sensitivity: ${artifact.doctrineSensitivity}`} />
        <SignalBlock label="Proposed pages" value={String(proposedPages.length)} detail={artifact.artifactFile} />
      </div>

      <div className="archive-proposed-pages" aria-label="Proposed knowledge pages">
        <div className="archive-proposed-pages-head">
          <span className="eyebrow">Proposed knowledge pages</span>
          <strong>{proposedPages.length ? `${proposedPages.length} ready for review` : "No proposed pages"}</strong>
        </div>
        {proposedPages.length ? (
          <div className="archive-proposed-page-grid">
            {proposedPages.map((page, index) => (
              <article key={`${page.type}:${page.title}:${index}`} className="archive-proposed-page-card">
                <div className="provider-head">
                  <div>
                    <strong>{page.title}</strong>
                    <p>{page.type}</p>
                  </div>
                </div>
                <p>{page.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="inline-notice">This artifact has no proposed trusted wiki pages.</div>
        )}
      </div>

      {isPending ? (
        <div className="archive-review-actions">
          {strategistCanApprove ? (
            <button
              type="button"
              className="button-secondary touch-action"
              onClick={() => onApproveReviewArtifact(artifact.artifactFile)}
              disabled={archiveQueueBusy}
            >
              Approve as Strategist
            </button>
          ) : null}
          <button
            type="button"
            className="button-secondary touch-action"
            onClick={() => onEscalateReviewArtifact(artifact.artifactFile)}
            disabled={archiveQueueBusy}
          >
            Escalate to Human
          </button>
          <button
            type="button"
            className="button-secondary touch-action"
            onClick={() => onRejectReviewArtifact(artifact.artifactFile)}
            disabled={archiveQueueBusy}
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="archive-review-actions">
          <div className="inline-notice">
            {artifact.decision.actorId ?? "policy"} · {artifact.decision.tierApplied ?? artifact.recommendedTier} ·{" "}
            {artifact.decision.decidedAt ?? artifact.checkedAt}
          </div>
          {isApproved ? (
            <button
              type="button"
              className="button-secondary touch-action"
              onClick={() => onPromoteReviewArtifact(artifact.artifactFile)}
              disabled={archiveQueueBusy || proposedPages.length === 0}
            >
              Promote to Wiki
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

function SignalBlock({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="archive-review-signal">
      <span className="eyebrow">{label}</span>
      <strong className="mono-inline">{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
