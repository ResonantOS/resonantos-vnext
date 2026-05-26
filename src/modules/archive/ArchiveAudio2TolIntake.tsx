// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Add-on boundary citation: docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md

import type { ArchiveTolBundleBuildResult, ArchiveTolBundleCandidate } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveAudio2TolIntakeProps = {
  archiveQueueBusy: boolean;
  archiveTolBundles: ArchiveTolBundleCandidate[];
  archiveTolBundleResult: ArchiveTolBundleBuildResult | null;
  onRefreshTolBundles: () => void;
  onBuildTolBundle: (sessionId: string) => void;
  onOpenArchiveDocument: (path: string) => void;
};

export function ArchiveAudio2TolIntake({
  archiveQueueBusy,
  archiveTolBundles,
  archiveTolBundleResult,
  onRefreshTolBundles,
  onBuildTolBundle,
  onOpenArchiveDocument,
}: ArchiveAudio2TolIntakeProps) {
  return (
    <Panel title="Audio2TOL Intake" subtitle="Add-on surface for finished TOL sessions.">
      <div className="archive-guidance-card">
        <strong>Audio2TOL add-on enabled</strong>
        <p>
          This surface is not part of the base Living Archive. It appears only when the Audio2TOL add-on is installed and enabled,
          then queues TOL bundles as archive intake for review.
        </p>
        <div className="archive-review-actions">
          <button type="button" className="button-secondary touch-action" onClick={onRefreshTolBundles} disabled={archiveQueueBusy}>
            {archiveQueueBusy ? "Detecting..." : "Detect TOL Bundles"}
          </button>
        </div>
      </div>
      {archiveTolBundles.length ? (
        <div className="archive-touch-list compact">
          {archiveTolBundles.map((bundle) => (
            <TolBundleCard
              key={bundle.sessionId}
              bundle={bundle}
              archiveQueueBusy={archiveQueueBusy}
              onBuildTolBundle={onBuildTolBundle}
              onOpenArchiveDocument={onOpenArchiveDocument}
            />
          ))}
        </div>
      ) : (
        <div className="archive-empty-state">
          <strong>No TOL bundles detected yet.</strong>
          <p>Use “Detect TOL Bundles” above to scan the mapped Audio2TOL folders.</p>
        </div>
      )}
      {archiveTolBundleResult ? (
        <article className="archive-review-card archive-review-result">
          <div className="provider-head">
            <div>
              <span className="eyebrow">Latest queued TOL bundle</span>
              <strong>{archiveTolBundleResult.sessionId}</strong>
              <p>{archiveTolBundleResult.intakeArtifactPath}</p>
            </div>
            <span className="tone tone-active">{archiveTolBundleResult.queuedAt}</span>
          </div>
          <p>Review request: {archiveTolBundleResult.requestFile}</p>
        </article>
      ) : null}
    </Panel>
  );
}

function TolBundleCard({
  bundle,
  archiveQueueBusy,
  onBuildTolBundle,
  onOpenArchiveDocument,
}: {
  bundle: ArchiveTolBundleCandidate;
  archiveQueueBusy: boolean;
  onBuildTolBundle: (sessionId: string) => void;
  onOpenArchiveDocument: (path: string) => void;
}) {
  const ready = bundle.status === "bundle-ready";

  return (
    <article className="archive-review-card tol-bundle-card">
      <div className="provider-head">
        <div>
          <span className="eyebrow">TOL session</span>
          <strong>{bundle.sessionId}</strong>
          <p>{bundle.summary ?? "No analysis summary found."}</p>
        </div>
        <span className={`tone ${ready ? "tone-active" : "tone-warning"}`}>{ready ? "ready" : "missing files"}</span>
      </div>
      <div className="tol-bundle-signals">
        <span>{bundle.rawAudioPath ? "Audio linked" : "Audio missing"}</span>
        <span>{bundle.transcriptPath ? "Transcript ready" : "Transcript missing"}</span>
        <span>
          {bundle.explicitDirectivesCount} human directive(s) · {bundle.strategicActionsCount} AI-proposed strategic action(s).
        </span>
      </div>
      <details className="archive-mini-details">
        <summary>Technical files</summary>
        <ul className="mono-list">
          <li>Raw: {bundle.rawAudioPath ?? "missing"}</li>
          <li>Transcript: {bundle.transcriptPath ?? "missing"}</li>
          <li>Analysis: {bundle.analysisPath ?? "missing"}</li>
        </ul>
      </details>
      <div className="archive-review-actions">
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => onBuildTolBundle(bundle.sessionId)}
          disabled={archiveQueueBusy || !ready}
        >
          Queue TOL Bundle
        </button>
        {bundle.analysisPath ? (
          <button type="button" className="button-secondary touch-action" onClick={() => onOpenArchiveDocument(bundle.analysisPath!)}>
            Open Analysis
          </button>
        ) : null}
      </div>
    </article>
  );
}
