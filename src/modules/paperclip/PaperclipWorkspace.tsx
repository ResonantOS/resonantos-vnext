// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-028-paperclip-addon-organizational-runtime.md

import { useEffect, useState } from "react";
import type {
  AddOnInstallation,
  AddOnManifest,
  CapabilityGrant,
  PaperclipDashboardSnapshot,
  PaperclipServiceResult,
  PaperclipStatus,
} from "../../core/contracts";
import {
  requestPaperclipCreateIssueFromDelegation,
  requestPaperclipDashboardSnapshot,
  requestPaperclipStartService,
  requestPaperclipStatus,
  requestPaperclipStopService,
} from "../../core/runtime";
import "./paperclip-workspace.css";

type PaperclipWorkspaceProps = {
  active: boolean;
  manifest?: AddOnManifest;
  installation?: AddOnInstallation;
  onConfigureAddon: () => void;
  onGrantWorkspaceAccess: () => void;
  onEndpointChange: (endpoint: string) => void;
};

const DEFAULT_ENDPOINT = "http://127.0.0.1:3100";

const hasGrant = (installation: AddOnInstallation | undefined, capability: CapabilityGrant["capability"]): boolean =>
  Boolean(installation?.enabled && installation.grantedCapabilities.some((grant) => grant.capability === capability && grant.granted));

const configuredEndpoint = (installation: AddOnInstallation | undefined): string =>
  typeof installation?.config?.endpoint === "string" && installation.config.endpoint.trim()
    ? installation.config.endpoint.trim()
    : DEFAULT_ENDPOINT;

export function PaperclipWorkspace({
  active,
  manifest,
  installation,
  onConfigureAddon,
  onGrantWorkspaceAccess,
  onEndpointChange,
}: PaperclipWorkspaceProps) {
  const [status, setStatus] = useState<PaperclipStatus | null>(null);
  const [service, setService] = useState<PaperclipServiceResult | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState(configuredEndpoint(installation));
  const [apiToken, setApiToken] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [snapshot, setSnapshot] = useState<PaperclipDashboardSnapshot | null>(null);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [operationNotice, setOperationNotice] = useState("");
  const endpoint = configuredEndpoint(installation);
  const networkGranted = hasGrant(installation, "network");
  const embeddingGranted = hasGrant(installation, "ui-embedding");
  const grantsReady = Boolean(installation?.enabled && networkGranted && embeddingGranted);
  const ready = Boolean(grantsReady && status?.endpointReachable);

  useEffect(() => {
    setEndpointDraft(endpoint);
  }, [endpoint]);

  useEffect(() => {
    if (!active || status) {
      return undefined;
    }
    let cancelled = false;
    setBusyLabel("Checking Paperclip");
    requestPaperclipStatus(endpoint)
      .then((nextStatus) => {
        if (!cancelled) {
          setStatus(nextStatus);
        }
      })
      .catch((statusError) => {
        if (!cancelled) {
          setError(statusError instanceof Error ? statusError.message : "Failed to check Paperclip runtime.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusyLabel("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, endpoint, status]);

  const refreshStatus = async (targetEndpoint = endpoint) => {
    setError("");
    setBusyLabel("Checking Paperclip");
    try {
      setStatus(await requestPaperclipStatus(targetEndpoint));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to check Paperclip runtime.");
    } finally {
      setBusyLabel("");
    }
  };

  const saveEndpoint = () => {
    const nextEndpoint = endpointDraft.trim() || DEFAULT_ENDPOINT;
    onEndpointChange(nextEndpoint);
    setStatus(null);
    setService(null);
  };

  const connectService = async () => {
    if (!grantsReady) {
      onGrantWorkspaceAccess();
    }
    const targetEndpoint = endpointDraft.trim() || endpoint || DEFAULT_ENDPOINT;
    if (targetEndpoint !== endpoint) {
      onEndpointChange(targetEndpoint);
    }
    setError("");
    setBusyLabel("Connecting Paperclip");
    try {
      const nextStatus = await requestPaperclipStatus(targetEndpoint);
      setStatus(nextStatus);
      if (!nextStatus.endpointReachable) {
        setError(`Paperclip is not reachable at ${nextStatus.endpoint}. Start Paperclip, then connect again.`);
        return;
      }
      setService(
        await requestPaperclipStartService({
          endpoint: nextStatus.endpoint,
          sessionId: "paperclip-main",
        }),
      );
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to connect Paperclip.");
    } finally {
      setBusyLabel("");
    }
  };

  const disconnectService = async () => {
    setError("");
    setBusyLabel("Disconnecting Paperclip");
    try {
      await requestPaperclipStopService(service?.sessionId ?? "paperclip-main");
      setService(null);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Failed to disconnect Paperclip.");
    } finally {
      setBusyLabel("");
    }
  };

  const refreshSnapshot = async () => {
    if (!apiToken.trim()) {
      setError("Enter a Paperclip API key before refreshing the organization snapshot.");
      return;
    }
    setError("");
    setBusyLabel("Reading Paperclip API");
    try {
      const nextSnapshot = await requestPaperclipDashboardSnapshot({
        endpoint: service?.endpoint ?? endpoint,
        apiToken,
        companyId: selectedCompanyId || undefined,
      });
      setSnapshot(nextSnapshot);
      if (nextSnapshot.companyId) {
        setSelectedCompanyId(nextSnapshot.companyId);
      }
      setOperationNotice(`Snapshot refreshed from ${nextSnapshot.companies.length} visible compan${nextSnapshot.companies.length === 1 ? "y" : "ies"}.`);
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : "Failed to read Paperclip organization snapshot.");
    } finally {
      setBusyLabel("");
    }
  };

  const createIssueFromDelegation = async () => {
    if (!apiToken.trim()) {
      setError("Enter a Paperclip API key before creating a delegation issue.");
      return;
    }
    const companyId = selectedCompanyId || snapshot?.companyId || snapshot?.companies[0]?.id || "";
    if (!companyId) {
      setError("Load a Paperclip organization snapshot and select a company before creating an issue.");
      return;
    }
    setError("");
    setOperationNotice("");
    setBusyLabel("Creating Paperclip issue");
    try {
      const result = await requestPaperclipCreateIssueFromDelegation({
        endpoint: service?.endpoint ?? endpoint,
        apiToken,
        companyId,
        title: issueTitle,
        description: issueDescription,
        priority: "medium",
      });
      setIssueTitle("");
      setIssueDescription("");
      await refreshSnapshot();
      setOperationNotice(result.auditSummary);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Failed to create Paperclip delegation issue.");
    } finally {
      setBusyLabel("");
    }
  };

  const missingRequirements = [
    !installation?.enabled ? "enable the add-on" : "",
    !networkGranted ? "grant local network access" : "",
    !embeddingGranted ? "grant UI embedding" : "",
    status && !status.endpointReachable ? "start Paperclip at the configured endpoint" : "",
  ].filter(Boolean);

  return (
    <section className={`paperclip-workspace ${active ? "" : "is-hidden"}`} data-testid="paperclip-workspace" aria-hidden={!active}>
      <header className="paperclip-toolbar">
        <div className="paperclip-toolbar-main">
          <strong>{manifest?.name ?? "Paperclip"}</strong>
          <span className={`paperclip-runtime-pill ${service ? "ready" : ready ? "ready" : "attention"}`}>
            {service ? "Connected" : ready ? "Ready" : "Setup needed"}
          </span>
          <span className="paperclip-endpoint">{service?.endpoint ?? endpoint}</span>
          {busyLabel ? <span className="paperclip-busy">{busyLabel}...</span> : null}
        </div>
        <div className="paperclip-toolbar-actions">
          <button type="button" className="button-primary touch-action" onClick={() => void connectService()} disabled={Boolean(busyLabel)}>
            {service ? "Reconnect" : "Connect"}
          </button>
          <button type="button" className="button-secondary touch-action" onClick={() => void disconnectService()} disabled={!service || Boolean(busyLabel)}>
            Disconnect
          </button>
          <button
            type="button"
            className="paperclip-icon-button"
            aria-label="Paperclip workspace settings"
            title="Paperclip workspace settings"
            onClick={() => setSettingsOpen((current) => !current)}
          >
            ⚙
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <div className="paperclip-settings-drawer">
          <section className="paperclip-setup-card">
            <span className="eyebrow">Runtime</span>
            <strong>{status?.endpointReachable ? "Paperclip endpoint reachable" : "Paperclip endpoint not reachable"}</strong>
            <p>{status?.installHint ?? "Run the official Paperclip quickstart, then connect the local endpoint."}</p>
            <button type="button" className="button-secondary touch-action" onClick={() => void refreshStatus()} disabled={Boolean(busyLabel)}>
              Check Paperclip
            </button>
          </section>

          <section className="paperclip-setup-card">
            <span className="eyebrow">Local endpoint</span>
            <label className="paperclip-field">
              <span>Paperclip URL</span>
              <input
                value={endpointDraft}
                onChange={(event) => setEndpointDraft(event.currentTarget.value)}
                placeholder={DEFAULT_ENDPOINT}
              />
            </label>
            <button type="button" className="button-secondary touch-action" onClick={saveEndpoint}>
              Save Endpoint
            </button>
          </section>

          <section className="paperclip-setup-card">
            <span className="eyebrow">Capability gate</span>
            <strong>{grantsReady ? "Required grants active" : "Required grants missing"}</strong>
            <p>V0 requires local network and UI embedding. Provider secrets stay mediated by ResonantOS, not copied into Paperclip.</p>
            <button type="button" className="button-secondary touch-action" onClick={onGrantWorkspaceAccess}>
              Grant Paperclip Access
            </button>
            <button type="button" className="button-secondary touch-action" onClick={onConfigureAddon}>
              Open Add-on Settings
            </button>
          </section>

          <section className="paperclip-setup-card paperclip-setup-card-wide">
            <span className="eyebrow">API bridge</span>
            <strong>{snapshot ? `${snapshot.companies.length} companies visible` : "No API snapshot loaded"}</strong>
            <p>
              Paste a Paperclip API key for this session only. V0 does not persist it in ResonantOS config.
            </p>
            <label className="paperclip-field">
              <span>Paperclip API key</span>
              <input
                value={apiToken}
                onChange={(event) => setApiToken(event.currentTarget.value)}
                placeholder="pcp_... or agent token"
                type="password"
                autoComplete="off"
              />
            </label>
            <button type="button" className="button-secondary touch-action" onClick={() => void refreshSnapshot()} disabled={Boolean(busyLabel)}>
              Refresh Organization Snapshot
            </button>
          </section>

          <section className="paperclip-setup-card paperclip-setup-card-wide">
            <span className="eyebrow">Delegation issue</span>
            <strong>Create an approved Paperclip task</strong>
            <p>
              This is the first Augmentor handoff path: a ResonantOS-approved plan becomes a Paperclip issue, while
              Paperclip execution stays inside Paperclip.
            </p>
            <div className="paperclip-issue-form">
              <label className="paperclip-field">
                <span>Issue title</span>
                <input
                  value={issueTitle}
                  onChange={(event) => setIssueTitle(event.currentTarget.value)}
                  placeholder="Implement approved operating plan"
                />
              </label>
              <label className="paperclip-field">
                <span>Issue brief</span>
                <textarea
                  value={issueDescription}
                  onChange={(event) => setIssueDescription(event.currentTarget.value)}
                  placeholder="Paste the approved delegation brief from Augmentor."
                />
              </label>
            </div>
            <button
              type="button"
              className="button-secondary touch-action"
              onClick={() => void createIssueFromDelegation()}
              disabled={Boolean(busyLabel) || !issueTitle.trim() || !issueDescription.trim()}
            >
              Create Delegation Issue
            </button>
          </section>
        </div>
      ) : null}

      {missingRequirements.length ? (
        <div className="paperclip-warning">
          <strong>Before connect:</strong> {missingRequirements.join(", ")}.
        </div>
      ) : null}
      {error ? <div className="paperclip-error">{error}</div> : null}
      {operationNotice ? <div className="paperclip-success">{operationNotice}</div> : null}

      {snapshot ? (
        <section className="paperclip-api-summary" aria-label="Paperclip organization snapshot">
          <div className="paperclip-summary-card">
            <span className="eyebrow">Companies</span>
            <strong>{snapshot.companies.length}</strong>
            <select
              value={selectedCompanyId || snapshot.companyId || ""}
              onChange={(event) => setSelectedCompanyId(event.currentTarget.value)}
              aria-label="Paperclip company"
            >
              {snapshot.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="paperclip-summary-card">
            <span className="eyebrow">Agents</span>
            <strong>{snapshot.agents.length}</strong>
            <p>{snapshot.agents.slice(0, 3).map((agent) => agent.title || agent.name).join(" · ") || "No agents returned."}</p>
          </div>
          <div className="paperclip-summary-card">
            <span className="eyebrow">Issues</span>
            <strong>{snapshot.issues.length}</strong>
            <p>{snapshot.issues.slice(0, 2).map((issue) => issue.title).join(" · ") || "No issues returned."}</p>
          </div>
        </section>
      ) : null}

      <section className="paperclip-embed-shell" aria-label="Paperclip embedded workspace">
        {service ? (
          <iframe
            title="Paperclip workspace"
            src={service.webUrl}
            className="paperclip-embed-frame"
            sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          />
        ) : (
          <div className="paperclip-embed-placeholder">
            <strong>Paperclip UI will appear here after connection.</strong>
            <p>
              Paperclip remains a replaceable add-on. Augmentor can plan company structures, but Paperclip owns the org
              chart, tasks, budgets, and execution history inside its own control plane.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
