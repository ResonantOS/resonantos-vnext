// Intent citation: docs/architecture/ADR-010-recovery-ladder.md
// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import type { LocalRuntimeStatus, RecoveryRouteCandidate, ResonantShellState } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type RecoveryWorkspaceProps = {
  state: ResonantShellState;
  activeRouteLabel: string;
  activeModel: string;
  recoveryRuntimeStatus: LocalRuntimeStatus | null;
  recoveryCandidates: RecoveryRouteCandidate[];
  recoveryBusy: boolean;
  recoveryActivityLabel: string;
  onStartRecovery: () => void;
  onPromoteCandidate: (candidate: RecoveryRouteCandidate) => void;
};

export function RecoveryWorkspace(props: RecoveryWorkspaceProps) {
  const currentPhase = resolveCurrentPhase(props.state.recoverySession.checklist);
  const routeTier = props.activeRouteLabel.toLowerCase().includes("local") ? "floor" : "recovery";
  const hasRecoveryTrail = props.state.recoverySession.changeLog.length > 1;

  return (
    <>
      <Panel className="recovery-hero-panel recovery-hero-primary">
        <div className="hero-copy recovery-hero-copy">
          <p className="eyebrow">Emergency Recovery Dashboard</p>
          <h2>Emergency Recovery Mode is active.</h2>
          <p>
            The Resonant Engineer Agent is now in control. It will regain access to a stronger model first, then move
            into deeper diagnosis, repair, and reporting.
          </p>
          <ol className="recovery-runbook-list">
            <li>Check the local recovery floor and confirm the engineer console is alive.</li>
            <li>Probe internet, provider routes, and local or remote runtime nodes.</li>
            <li>Restore a better brain and promote onto the best validated route.</li>
            <li>Run deeper diagnosis, apply fixes, and track every system change.</li>
            <li>Write the recovery report for Augmentor to review afterward.</li>
          </ol>
          <div className="recovery-hero-actions">
            <button
              type="button"
              className="button-primary recovery-start-button"
              onClick={props.onStartRecovery}
              disabled={props.recoveryBusy}
            >
              {hasRecoveryTrail ? "Run Next Recovery Phase" : "Start Recovery"}
            </button>
            <div className="recovery-activity-card">
              <span>Live status</span>
              <strong>{props.recoveryActivityLabel}</strong>
              <p>{props.recoveryBusy ? "The engineer agent is actively working." : "Waiting for the next recovery action."}</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Recovery State" subtitle="Operational status for the current recovery run.">
        <div className="recovery-status-layout">
          <div className="workspace-strip">
            <WorkspaceSnapshot label="Phase" value={currentPhase} meta="Current ladder step" />
            <WorkspaceSnapshot label="Route tier" value={routeTier} meta="Floor or promoted recovery route" />
            <WorkspaceSnapshot label="Active model" value={props.activeModel || "Missing"} meta={props.activeRouteLabel} />
          </div>
          <div className="recovery-status-stack">
            <StatusTile
              label="Recovery floor"
              value={props.recoveryRuntimeStatus?.targetModel ?? "batiai/gemma4-e2b:q4"}
              meta={
                props.recoveryRuntimeStatus
                  ? `${props.recoveryRuntimeStatus.recoveryModelInstalled ? "installed" : "missing"} · ${
                      props.recoveryRuntimeStatus.recoveryModelRunning ? "already loaded" : "loaded on demand"
                    }`
                  : "awaiting local runtime status"
              }
            />
            <StatusTile label="Current route" value={props.activeRouteLabel} meta={props.activeModel || "Missing model"} />
          </div>
        </div>
      </Panel>

      <Panel
        title="Better Brain Candidates"
        subtitle="The Engineer Agent should promote onto a stronger validated route before attempting deeper repair."
      >
        <div className="recovery-dashboard-grid">
          {props.recoveryCandidates.length ? (
            props.recoveryCandidates.map((candidate) => (
              <article key={candidate.id} className={`recovery-dashboard-card ${candidate.recommended ? "recommended" : ""}`}>
                <div className="recovery-dashboard-card-head">
                  <div>
                    <strong>{candidate.providerLabel}</strong>
                    <p>
                      {candidate.model} via {candidate.runtimeNodeLabel}
                    </p>
                  </div>
                  <span className={`tone ${candidate.promotable ? "tone-active" : "tone-warning"}`}>
                    {candidate.promotable ? "promotable" : "blocked"}
                  </span>
                </div>
                <ul>
                  <li>{candidate.reason}</li>
                  <li>{candidate.credentialConfigured ? "Credentials are configured." : "Credentials are missing."}</li>
                  <li>{candidate.reachable ? "Endpoint probe passed." : "Endpoint probe failed."}</li>
                </ul>
                <div className="recovery-dashboard-actions">
                  {candidate.recommended && <span className="kind kind-main">recommended</span>}
                  <button
                    type="button"
                    className="button-secondary recovery-promote-button"
                    onClick={() => props.onPromoteCandidate(candidate)}
                    disabled={!candidate.promotable}
                  >
                    Promote
                  </button>
                </div>
              </article>
            ))
          ) : (
            <article className="recovery-dashboard-card empty">
              <strong>No stronger candidate is available yet.</strong>
              <p>
                The Engineer Agent remains on the local recovery floor until a cloud or remote runtime route validates.
              </p>
            </article>
          )}
        </div>
      </Panel>

      <div className="recovery-columns">
        <Panel title="Recovery Checklist" subtitle="Structured ladder state, not chat-derived text.">
          <div className="recovery-checklist-grid">
            {props.state.recoverySession.checklist.map((step) => (
              <article key={step.id} className={`recovery-checklist-step ${step.status}`}>
                <div className="recovery-dashboard-card-head">
                  <strong>{step.label}</strong>
                  <span className={`tone tone-${toneForStatus(step.status)}`}>{step.status}</span>
                </div>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Change Log" subtitle="Auditable recovery trail.">
          <div className="recovery-log-list">
            {props.state.recoverySession.changeLog.length ? (
              props.state.recoverySession.changeLog
                .slice()
                .reverse()
                .map((entry) => (
                  <article key={entry} className="recovery-log-entry">
                    {entry}
                  </article>
                ))
            ) : (
              <article className="recovery-log-entry empty">No recovery changes recorded yet.</article>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function resolveCurrentPhase(checklist: ResonantShellState["recoverySession"]["checklist"]): string {
  return checklist.find((step) => step.status === "active")?.label ?? checklist.find((step) => step.status === "pending")?.label ?? "Recovery complete";
}

function toneForStatus(status: ResonantShellState["recoverySession"]["checklist"][number]["status"]) {
  if (status === "complete") {
    return "active";
  }
  if (status === "active") {
    return "warning";
  }
  return "neutral";
}

function WorkspaceSnapshot(props: { label: string; value: string; meta: string }) {
  return (
    <div className="workspace-snapshot">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.meta}</p>
    </div>
  );
}

function StatusTile(props: { label: string; value: string; meta: string }) {
  return (
    <article className="service-card">
      <div className="service-head">
        <strong>{props.label}</strong>
      </div>
      <p>{props.value}</p>
      <small>{props.meta}</small>
    </article>
  );
}
