// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md
// Intent citation: docs/architecture/ADR-013-living-archive-memory-domains.md

import { useState } from "react";
import type {
  ArchiveClassificationProposal,
  ArchiveLibraryClassificationReview,
  ArchiveLibraryReorganisationPlan,
} from "../../core/contracts";

type ArchiveClassificationReviewPanelProps = {
  review: ArchiveLibraryClassificationReview;
  plan: ArchiveLibraryReorganisationPlan | null;
  busy: boolean;
  onGenerateReorganisationPlan: (classificationManifestPath: string) => void;
};

export function ArchiveClassificationReviewPanel({
  review,
  plan,
  busy,
  onGenerateReorganisationPlan,
}: ArchiveClassificationReviewPanelProps) {
  const [intentApproved, setIntentApproved] = useState(false);
  const targetCounts = review.proposals.reduce<Record<string, number>>((counts, proposal) => {
    counts[proposal.proposedTarget] = (counts[proposal.proposedTarget] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <section className="classification-review-surface" aria-label="Mixed library classification review">
      <div className="classification-review-head">
        <div>
          <span className="eyebrow">Classification review</span>
          <strong>{review.libraryName}</strong>
          <p>
            Review the first-pass ownership plan before any future reorganisation command can move files between memory domains.
          </p>
        </div>
        <button type="button" className="button-secondary touch-action" onClick={() => setIntentApproved(true)}>
          Approve Classification Intent
        </button>
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => onGenerateReorganisationPlan(review.manifestPath)}
          disabled={!intentApproved || busy}
          title={intentApproved ? "Generate a plan without moving files." : "Approve classification intent before planning moves."}
        >
          {busy ? "Planning..." : "Generate Reorganisation Plan"}
        </button>
      </div>
      <div className="classification-summary-strip" aria-label="Classification summary">
        <span>{review.recordsTotal} files in library</span>
        <span>{review.proposalsPreviewed} previewed</span>
        <span>{review.remainingForFullReview} waiting for full review</span>
        <span>{review.metadataStandard}</span>
        <span>{review.requiresHumanApprovalBeforeMove ? "human approval required" : "approval policy missing"}</span>
      </div>
      <div className="classification-summary-strip" aria-label="Classification target counts">
        <span>{targetCounts["human-knowledge"] ?? 0} Human Knowledge</span>
        <span>{targetCounts["external-knowledge"] ?? 0} External Knowledge</span>
        <span>{targetCounts.unclear ?? 0} unclear</span>
      </div>
      <div className="classification-review-grid">
        {review.proposals.map((proposal) => (
          <ClassificationProposalCard key={proposal.sourceId} proposal={proposal} />
        ))}
      </div>
      {review.remainingForFullReview ? (
        <div className="inline-notice">
          Showing the preview proposals from the host artifact. Bulk filtering and reclassification will stay host-mediated so the UI
          does not become the authority for memory ownership.
        </div>
      ) : null}
      <div className={`inline-notice ${intentApproved ? "" : "warning"}`}>
        {intentApproved
          ? "Classification intent approved. The next step is a separate host-mediated reorganisation plan with audit log and rollback."
          : "No files are moved by this screen. This approval records intent only; structural changes remain blocked here."}
      </div>
      {plan ? (
        <article className="classification-plan-card" aria-label="Generated reorganisation plan">
          <div className="classification-proposal-main">
            <div>
              <span className="eyebrow">Generated plan</span>
              <strong>{plan.libraryName}</strong>
              <p>
                {plan.movesPlanned} move(s) planned, {plan.tagOnlyCount} tag-only item(s), {plan.blockedCount} blocked or waiting.
                Files moved by this command: 0.
              </p>
            </div>
            <span className={`tone ${plan.requiresApproval ? "tone-warning" : "tone-active"}`}>
              {plan.requiresApproval ? "approval required" : "ready"}
            </span>
          </div>
          <div className="classification-summary-strip" aria-label="Reorganisation plan artifacts">
            <span>plan artifact</span>
            <span>rollback plan</span>
            <span>audit log</span>
            <span>{plan.structuralChangesAllowed ? "structural changes allowed" : "structural changes blocked"}</span>
          </div>
          <details className="archive-mini-details classification-path-details">
            <summary>Plan paths</summary>
            <p className="path-chip">{plan.planPath}</p>
            <p className="path-chip">{plan.rollbackPlanPath}</p>
            <p className="path-chip">{plan.auditLogPath}</p>
          </details>
        </article>
      ) : null}
      <details className="archive-mini-details classification-path-details">
        <summary>Review artifact</summary>
        <p className="path-chip">{review.manifestPath}</p>
      </details>
    </section>
  );
}

function ClassificationProposalCard({ proposal }: { proposal: ArchiveClassificationProposal }) {
  return (
    <article className="classification-proposal-card">
      <div className="classification-proposal-main">
        <div>
          <strong>{proposal.title}</strong>
          <p>{proposal.reason}</p>
        </div>
        <span className={`tone ${proposal.proposedTarget === "unclear" ? "tone-warning" : "tone-active"}`}>
          {proposal.proposedTarget}
        </span>
      </div>
      <div className="classification-chip-row" aria-label="Classification signals">
        <span>confidence/{proposal.confidence}</span>
        {proposal.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {proposal.wikilinks.map((link) => (
          <span key={link}>{link}</span>
        ))}
      </div>
      <details className="archive-mini-details classification-path-details">
        <summary>Source path</summary>
        <p className="path-chip">{proposal.canonicalPath}</p>
      </details>
    </article>
  );
}
