// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md

import { useEffect, useState } from "react";
import type { ResonantShellState, TaskWorkspace, TaskWorkspacePayload } from "../../core/contracts";
import {
  requestExecuteOpenCodeTask,
  requestFinishTaskWorkspace,
  requestHermesChatCompletion,
  requestListTaskWorkspaces,
  requestReadTaskWorkspace,
} from "../../core/runtime";
import {
  hermesTaskAuditEvent,
  hermesTaskPromptFromWorkspace,
  hermesTaskVerificationPayload,
  renderHermesTaskResultMarkdown,
} from "../../core/delegation";
import { buildGoalWorkspaceStatus, type GoalWorkspaceStatusItem } from "../../core/goal-workspace";
import { MessageContent } from "../chat/MessageContent";

type DelegationWorkspaceProps = {
  state: ResonantShellState;
  chatBusy: boolean;
  hermesProfileHome?: string;
  hermesModel?: string;
  onStartWorkspace: (workspaceId: string) => Promise<void>;
  onAskAugmentor: (message: string) => Promise<void>;
};

const errorMessageOf = (error: unknown): string =>
  typeof error === "string" ? error : error instanceof Error ? error.message : "Unable to load delegation workspaces.";

export function DelegationWorkspace({ state, chatBusy, hermesProfileHome, hermesModel, onStartWorkspace, onAskAugmentor }: DelegationWorkspaceProps) {
  const [workspaces, setWorkspaces] = useState<TaskWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedPayload, setSelectedPayload] = useState<TaskWorkspacePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [payloadBusy, setPayloadBusy] = useState(false);
  const [startingWorkspaceId, setStartingWorkspaceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null;
  const goalStatus = buildGoalWorkspaceStatus(state);
  const activeGoalCards = [...goalStatus.needsAttention, ...goalStatus.active, ...goalStatus.delegated, ...goalStatus.waiting].slice(0, 6);

  const refresh = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const loaded = await requestListTaskWorkspaces();
      setWorkspaces(loaded);
      setSelectedWorkspaceId((current) =>
        current && loaded.some((workspace) => workspace.id === current) ? current : (loaded[0]?.id ?? null),
      );
    } catch (error) {
      setNotice(errorMessageOf(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedWorkspace) {
      setSelectedPayload(null);
      return;
    }
    let cancelled = false;
    setPayloadBusy(true);
    void requestReadTaskWorkspace(selectedWorkspace.id)
      .then((payload) => {
        if (!cancelled) {
          setSelectedPayload(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSelectedPayload(null);
          setNotice(errorMessageOf(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPayloadBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspace?.id]);

  const startWorkspace = async (workspaceId: string) => {
    try {
      setStartingWorkspaceId(workspaceId);
      const payload = await requestReadTaskWorkspace(workspaceId);
      if (payload.packet.targetAgentId === "hermes.agent") {
        setNotice("Starting the Hermes task through the local Hermes profile.");
        const result = await requestHermesChatCompletion({
          prompt: hermesTaskPromptFromWorkspace(payload),
          profileHome: hermesProfileHome,
          model: hermesModel,
        });
        await requestFinishTaskWorkspace({
          workspaceId: payload.workspace.id,
          resultMarkdown: renderHermesTaskResultMarkdown({
            workspace: payload.workspace,
            reply: result.reply,
            profileHome: result.profileHome,
          }),
          verification: hermesTaskVerificationPayload({
            packetId: payload.workspace.packetId,
            profileHome: result.profileHome,
          }),
          auditEvent: hermesTaskAuditEvent({
            packetId: payload.workspace.packetId,
            workspaceId: payload.workspace.id,
            profileHome: result.profileHome,
          }),
        });
        setNotice("Hermes task finished. Review the result before approving any outbound action.");
      } else if (payload.packet.targetAgentId === "opencode.runtime") {
        setNotice("Executing the OpenCode task through the bounded host bridge.");
        const result = await requestExecuteOpenCodeTask(payload.workspace.id);
        setNotice(
          result.verified
            ? `OpenCode task finished and verified: ${result.targetPath} (${result.createdByThisRun ? "created by this run" : "already existed"})`
            : `OpenCode task finished but verification failed: ${result.targetPath}`,
        );
      } else {
        setNotice("Starting the Engineer task through Augmentor.");
        await onStartWorkspace(workspaceId);
      }
      await refresh();
      setSelectedPayload(await requestReadTaskWorkspace(workspaceId));
    } catch (error) {
      setNotice(errorMessageOf(error));
    } finally {
      setStartingWorkspaceId(null);
    }
  };

  return (
    <div className="delegation-workspace">
      <section className="delegation-hero-panel">
        <div>
          <span className="eyebrow">Task Monitor</span>
          <h2>Track goals, delegated work, blockers, and returned artifacts.</h2>
          <p>
            Augmentor remains the orchestrator. This page turns chat commands into visible work state so the human can
            supervise long-running AI work without hunting through chat history.
          </p>
        </div>
        <button type="button" className="button-secondary touch-action" onClick={() => void refresh()} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <section className="task-monitor-strip" aria-label="Goal workspace summary">
        <TaskMetric label="Active goals" value={goalStatus.active.length + goalStatus.delegated.length + goalStatus.waiting.length} />
        <TaskMetric label="Needs attention" value={goalStatus.needsAttention.length} tone={goalStatus.needsAttention.length ? "warning" : "ok"} />
        <TaskMetric label="Delegated refs" value={activeGoalCards.reduce((total, goal) => total + goal.delegations, 0)} />
        <TaskMetric label="Artifacts" value={activeGoalCards.reduce((total, goal) => total + goal.artifacts, 0)} />
      </section>

      <section className="goal-monitor-panel" aria-label="Active goals">
        <div className="workspace-section-head">
          <div>
            <span className="eyebrow">Goal workspaces</span>
            <h3>{goalStatus.total ? `${goalStatus.total} durable goal${goalStatus.total === 1 ? "" : "s"}` : "No durable goals yet"}</h3>
          </div>
        </div>
        {activeGoalCards.length ? (
          <div className="goal-monitor-grid">
            {activeGoalCards.map((goal) => (
              <GoalMonitorCard key={goal.id} goal={goal} />
            ))}
          </div>
        ) : (
          <div className="delegation-empty-state">
            <strong>No active goal state yet.</strong>
            <p>
              Use <code>/goal &lt;mission&gt;</code> in Augmentor Chat to create a durable objective that can collect
              steps, blockers, delegations, and artifacts.
            </p>
          </div>
        )}
      </section>

      {notice ? <div className="inline-notice delegation-notice">{notice}</div> : null}

      <section className="delegation-grid">
        <div className="delegation-list-panel" aria-label="Delegation task workspaces">
          <div className="workspace-section-head">
            <div>
              <span className="eyebrow">Task workspaces</span>
              <h3>{workspaces.length ? `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}` : "No tasks yet"}</h3>
            </div>
          </div>

          <div className="delegation-task-list">
            {workspaces.length ? (
              workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={`delegation-task-card ${selectedWorkspace?.id === workspace.id ? "active" : ""}`}
                  onClick={() => setSelectedWorkspaceId(workspace.id)}
                >
                  <span className="delegation-task-orb" aria-hidden="true">
                    {workspaceTargetLabel(workspace)}
                  </span>
                  <span>
                    <strong>{workspaceTitle(workspace)}</strong>
                    <small>{workspace.packetId}</small>
                    <em>{workspace.id}</em>
                  </span>
                </button>
              ))
            ) : (
              <div className="delegation-empty-state">
                <strong>No delegated task workspaces found.</strong>
                <p>Ask Augmentor to delegate a diagnostic or repair task to the Engineer. It will appear here before execution.</p>
              </div>
            )}
          </div>
        </div>

        <section className="delegation-detail-panel" aria-label="Selected delegation workspace">
          {selectedWorkspace ? (
            <DelegationWorkspaceDetail
              workspace={selectedWorkspace}
              payload={selectedPayload}
              payloadBusy={payloadBusy}
              agentBusy={chatBusy || startingWorkspaceId === selectedWorkspace.id}
              onStartWorkspace={startWorkspace}
              onAskAugmentor={onAskAugmentor}
            />
          ) : (
            <div className="delegation-empty-state large">
              <span className="eyebrow">Waiting for work</span>
              <h3>Delegation starts from Augmentor.</h3>
              <p>
                The monitor does not invent tasks. It supervises task workspaces created by Augmentor from an explicit
                user request.
              </p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function TaskMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "ok" | "warning" }) {
  return (
    <div className={`task-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GoalMonitorCard({ goal }: { goal: GoalWorkspaceStatusItem }) {
  return (
    <article className={`goal-monitor-card phase-${goal.phase}`}>
      <div>
        <span className="eyebrow">{goal.phase}</span>
        <h4>{goal.title}</h4>
        <p>{goal.mission}</p>
      </div>
      <div className="goal-monitor-meta">
        <span>{goal.completedSteps}/{goal.totalSteps} steps</span>
        <span>{goal.delegations} delegation{goal.delegations === 1 ? "" : "s"}</span>
        <span>{goal.artifacts} artifact{goal.artifacts === 1 ? "" : "s"}</span>
      </div>
      {goal.blockerLabels.length ? (
        <div className="goal-monitor-blockers">
          {goal.blockerLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function DelegationWorkspaceDetail({
  workspace,
  payload,
  payloadBusy,
  agentBusy,
  onStartWorkspace,
  onAskAugmentor,
}: {
  workspace: TaskWorkspace;
  payload: TaskWorkspacePayload | null;
  payloadBusy: boolean;
  agentBusy: boolean;
  onStartWorkspace: (workspaceId: string) => Promise<void>;
  onAskAugmentor: (message: string) => Promise<void>;
}) {
  const verificationStatus = verificationStatusOf(payload);
  const resultReady = Boolean(payload?.resultMarkdown && !payload.resultMarkdown.includes("No result has been returned yet."));

  return (
    <>
      <div className="delegation-detail-head">
        <div>
          <span className="eyebrow">Selected workspace</span>
          <h3>{workspaceTitle(workspace)}</h3>
          <p>{workspace.id}</p>
        </div>
        <span className={`app-status app-status-${verificationTone(verificationStatus)}`}>{verificationStatus}</span>
      </div>

      <div className="delegation-action-row">
        <button
          type="button"
          className="button-primary touch-action"
          onClick={() => void onStartWorkspace(workspace.id)}
          disabled={agentBusy}
        >
          {agentBusy ? "Agent Busy" : `Start ${workspaceTargetName(workspace)} Task`}
        </button>
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => void onAskAugmentor(`Review the delegation result for ${workspace.id} and tell me whether it should be promoted, followed up, or archived.`)}
          disabled={agentBusy || !resultReady}
        >
          Ask Augmentor to Review
        </button>
        <button
          type="button"
          className="button-secondary touch-action"
          onClick={() => void onAskAugmentor(`Create a follow-up task from the result of ${workspace.id}. Preserve the same target agent, scope, verification, and audit requirements.`)}
          disabled={agentBusy || !resultReady}
        >
          Create Follow-up Task
        </button>
      </div>

      <section className="delegation-review-panel" aria-label="Delegation result review">
        <div className="workspace-section-head">
          <div>
            <span className="eyebrow">Review</span>
            <h3>{payloadBusy ? "Loading result..." : resultReady ? `${workspaceTargetName(workspace)} result returned` : "Result pending"}</h3>
          </div>
          <span className={`app-status app-status-${verificationTone(verificationStatus)}`}>{verificationStatus}</span>
        </div>
        <div className="delegation-review-grid">
          <article className="delegation-review-card result">
            <span className="eyebrow">result.md</span>
            {payload?.resultMarkdown ? (
              <MessageContent content={payload.resultMarkdown} />
            ) : (
              <p>No result has been loaded for this workspace yet.</p>
            )}
          </article>
          <article className="delegation-review-card">
            <span className="eyebrow">verification.json</span>
            <pre>{payload ? JSON.stringify(payload.verification, null, 2) : "Not loaded."}</pre>
          </article>
        </div>
      </section>

      <div className="delegation-path-grid">
        <PathCard label="TASK.md" path={workspace.taskMarkdownPath} />
        <PathCard label="Packet" path={workspace.packetPath} />
        <PathCard label="Result" path={workspace.resultPath} />
        <PathCard label="Verification" path={workspace.verificationPath} />
        <PathCard label="Audit folder" path={workspace.logsPath} />
        <PathCard label="Artifacts" path={workspace.artifactsPath} />
      </div>
    </>
  );
}

function verificationStatusOf(payload: TaskWorkspacePayload | null): string {
  const status = payload?.verification?.status;
  return typeof status === "string" && status.trim() ? status : "pending";
}

function verificationTone(status: string): "active" | "warning" | "idle" {
  if (status === "completed" || status === "passed") {
    return "active";
  }
  if (status === "needs-review" || status === "failed" || status === "pending") {
    return "warning";
  }
  return "idle";
}

function PathCard({ label, path }: { label: string; path: string }) {
  return (
    <div className="delegation-path-card">
      <span>{label}</span>
      <code>{path}</code>
    </div>
  );
}

function workspaceTargetLabel(workspace: TaskWorkspace): string {
  if (workspace.id.includes("hermes")) {
    return "HER";
  }
  if (workspace.id.includes("opencode")) {
    return "OC";
  }
  return "R-EG";
}

function workspaceTargetName(workspace: TaskWorkspace): string {
  if (workspace.id.includes("hermes")) {
    return "Hermes";
  }
  if (workspace.id.includes("opencode")) {
    return "OpenCode";
  }
  return "Engineer";
}

function workspaceTitle(workspace: TaskWorkspace): string {
  return workspace.id
    .replace(/^workspace-/, "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
