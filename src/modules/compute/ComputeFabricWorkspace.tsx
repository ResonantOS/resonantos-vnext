// Intent citation: docs/architecture/ADR-032-resonantos-compute-fabric.md

import { useState } from "react";
import type { ComputeJob, ComputeNode, ResonantShellState } from "../../core/contracts";
import { validateComputeNode } from "../../core/compute-fabric";
import "./compute-fabric.css";

type ComputeFabricWorkspaceProps = {
  state: ResonantShellState;
  onRefreshLocalDiagnostics: () => Promise<void>;
  onRunLocalCommandProbe: () => Promise<void>;
  onQuarantineNode: (nodeId: string) => void;
  onRevokeNode: (nodeId: string) => void;
};

const nodeStatusLabel = (node: ComputeNode): string =>
  node.enrollmentState === "quarantined"
    ? "Quarantined"
    : node.enrollmentState === "revoked"
      ? "Revoked"
      : node.enrollmentState === "pending"
        ? "Pending"
        : node.healthState === "ready"
          ? "Ready"
          : node.healthState === "degraded"
            ? "Degraded"
            : "Unknown";

const executableJobs = (jobs: ComputeJob[]): ComputeJob[] =>
  jobs.filter((job) => job.jobType !== "passive-probe");

export function ComputeFabricWorkspace({
  state,
  onRefreshLocalDiagnostics,
  onRunLocalCommandProbe,
  onQuarantineNode,
  onRevokeNode,
}: ComputeFabricWorkspaceProps) {
  const [busy, setBusy] = useState(false);
  const [commandBusy, setCommandBusy] = useState(false);
  const [error, setError] = useState("");
  const { nodes, jobs, artifacts, audit } = state.computeFabric;
  const enrolledNodes = nodes.filter((node) => node.enrollmentState === "enrolled");
  const pendingNodes = nodes.filter((node) => node.enrollmentState === "pending");
  const blockedNodes = nodes.filter((node) => ["quarantined", "revoked"].includes(node.enrollmentState));
  const activeJobs = jobs.filter((job) => ["queued", "approved", "running"].includes(job.status));
  const executableJobCount = executableJobs(jobs).length;

  return (
    <section className="compute-workspace" data-testid="compute-fabric-workspace">
      <header className="compute-hero">
        <div>
          <p className="eyebrow">Core Compute Fabric</p>
          <h1>Runner registry and policy surface</h1>
          <p>
            ResonantOS owns node trust, job policy, artifacts, secrets boundaries, and audit before add-ons can use
            local or remote execution.
          </p>
          <div className="compute-hero-actions">
            <button
              type="button"
              className="button-primary touch-action"
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onRefreshLocalDiagnostics();
                } catch (refreshError) {
                  setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh local diagnostics.");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? "Refreshing" : "Refresh Local Facts"}
            </button>
            <button
              type="button"
              className="button-secondary touch-action"
              onClick={async () => {
                setCommandBusy(true);
                setError("");
                try {
                  await onRunLocalCommandProbe();
                } catch (commandError) {
                  setError(commandError instanceof Error ? commandError.message : "Failed to run local command probe.");
                } finally {
                  setCommandBusy(false);
                }
              }}
              disabled={commandBusy}
            >
              {commandBusy ? "Running Probe" : "Run Local Command Probe"}
            </button>
            {error ? <span className="compute-error">{error}</span> : null}
          </div>
        </div>
        <div className="compute-summary-grid" aria-label="Compute fabric summary">
          <SummaryTile label="Nodes" value={String(nodes.length)} detail={`${enrolledNodes.length} enrolled`} />
          <SummaryTile label="Pending" value={String(pendingNodes.length)} detail={`${blockedNodes.length} blocked`} />
          <SummaryTile label="Jobs" value={String(jobs.length)} detail={`${activeJobs.length} active`} />
          <SummaryTile label="Artifacts" value={String(artifacts.length)} detail={`${audit.length} audit events`} />
        </div>
      </header>

      <section className="compute-section">
        <div className="compute-section-heading">
          <div>
            <h2>Compute Nodes</h2>
            <p>Nodes are passive records until enrollment and executable probes prove their roles.</p>
          </div>
        </div>
        <div className="compute-node-list">
          {nodes.map((node) => {
            const validation = validateComputeNode(node);
            return (
              <article key={node.id} className="compute-node-card">
                <div className="compute-node-main">
                  <span className={`compute-status-pill ${node.enrollmentState} ${node.healthState}`}>
                    {nodeStatusLabel(node)}
                  </span>
                  <h3>{node.label}</h3>
                  <p>{node.endpoint ?? "No endpoint configured"}</p>
                </div>
                <dl className="compute-node-meta">
                  <div>
                    <dt>Kind</dt>
                    <dd>{node.kind}</dd>
                  </div>
                  <div>
                    <dt>Trust</dt>
                    <dd>{node.trustTier}</dd>
                  </div>
                  <div>
                    <dt>Transport</dt>
                    <dd>{node.supportedTransports.join(", ") || "none"}</dd>
                  </div>
                  <div>
                    <dt>Probe</dt>
                    <dd>
                      {[node.probe?.os, node.probe?.arch, node.probe?.containerPlatforms?.join("/")].filter(Boolean).join(" · ") ||
                        "not probed"}
                    </dd>
                  </div>
                </dl>
                <div className="compute-role-list" aria-label={`${node.label} roles`}>
                  {node.roles.map((role) => (
                    <span key={role}>{role}</span>
                  ))}
                </div>
                <div className="compute-node-actions" aria-label={`${node.label} lifecycle actions`}>
                  {node.enrollmentState === "enrolled" ? (
                    <button type="button" className="button-secondary touch-action" onClick={() => onQuarantineNode(node.id)}>
                      Quarantine
                    </button>
                  ) : null}
                  {node.enrollmentState !== "revoked" ? (
                    <button type="button" className="button-secondary touch-action" onClick={() => onRevokeNode(node.id)}>
                      Revoke Trust
                    </button>
                  ) : null}
                  {node.enrollmentState === "pending" ? <span>Enrollment requires fingerprint and transport evidence.</span> : null}
                </div>
                {!validation.valid ? (
                  <ul className="compute-warning-list">
                    {validation.issues.map((issue) => (
                      <li key={`${node.id}-${issue.code}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="compute-section compute-policy-grid">
        <PolicyPanel
          title="Execution Boundary"
          items={[
            "Add-ons request jobs; ResonantOS selects nodes.",
            "Passive probes cannot execute commands or use network.",
            "Executable jobs require enrolled nodes and audit records.",
          ]}
        />
        <PolicyPanel
          title="Secrets Boundary"
          items={[
            "Raw provider credentials stay in the vault by default.",
            "Jobs receive scoped tokens or provider route references.",
            "Logs and artifacts are treated as untrusted output.",
          ]}
        />
        <PolicyPanel
          title="Cleanroom Boundary"
          items={[
            "Cleanroom jobs use no network or explicit allowlists.",
            "Setup downloads are separate from execution jobs.",
            "Artifact paths must stay inside host-owned roots.",
          ]}
        />
      </section>

      <section className="compute-section">
        <div className="compute-section-heading">
          <div>
            <h2>Job Ledger</h2>
            <p>Execution is not enabled yet. The ledger is ready for typed, audited jobs.</p>
          </div>
          <span className="compute-status-pill pending">{executableJobCount} executable jobs recorded</span>
        </div>
        {jobs.length ? (
          <div className="compute-job-list">
            {jobs.map((job) => (
              <article key={job.id} className="compute-job-row">
                <strong>{job.purpose}</strong>
                <span>{job.jobType}</span>
                <span>{job.status}</span>
                <span>{job.networkPolicy.mode}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="compute-empty-state">
            <strong>No compute jobs yet.</strong>
            <p>The next implementation phase can add passive local diagnostics before any SSH, Docker, or remote execution path.</p>
          </div>
        )}
      </section>

      <section className="compute-section">
        <div className="compute-section-heading">
          <div>
            <h2>Artifact Ledger</h2>
            <p>Command output is recorded as bounded artifacts before any archive intake.</p>
          </div>
          <span className="compute-status-pill pending">{artifacts.length} artifacts recorded</span>
        </div>
        {artifacts.length ? (
          <div className="compute-artifact-list">
            {artifacts.map((artifact) => (
              <article key={artifact.id} className="compute-artifact-row">
                <strong>{artifact.path}</strong>
                <span>{artifact.type}</span>
                <span>{artifact.sizeBytes} bytes</span>
                <code>{artifact.sha256.slice(0, 12)}</code>
              </article>
            ))}
          </div>
        ) : (
          <div className="compute-empty-state">
            <strong>No artifacts recorded yet.</strong>
            <p>Local command probes record stdout and stderr as review-retained artifacts.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function SummaryTile(props: { label: string; value: string; detail: string }) {
  return (
    <div className="compute-summary-tile">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </div>
  );
}

function PolicyPanel(props: { title: string; items: string[] }) {
  return (
    <article className="compute-policy-panel">
      <h3>{props.title}</h3>
      <ul>
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
