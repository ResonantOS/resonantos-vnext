// Intent citation: docs/architecture/ADR-016-context-memory-compaction.md

import { useEffect, useState } from "react";
import type { ContextBudget, ContextMemoryState } from "../../core/contracts";
import { formatTokenCount, usableContextTokens } from "../../core/context-memory";
import type { CompactMemoryPatch } from "./thread-controller";

type ContextMemoryPanelProps = {
  budget: ContextBudget;
  compactState: ContextMemoryState | null;
  usageLabel: string;
  usageRatio: number;
  usageTitle: string;
  onCompactThread: () => void;
  onUpdateCompactMemory: (patch: CompactMemoryPatch) => void;
};

const percentOfUsable = (value: number, usable: number): string => `${Math.min(100, Math.round((value / usable) * 100))}%`;

const linesOf = (values: string[]): string => values.join("\n");

const splitLines = (value: string): string[] =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

export function ContextMemoryPanel({
  budget,
  compactState,
  usageLabel,
  usageRatio,
  usageTitle,
  onCompactThread,
  onUpdateCompactMemory,
}: ContextMemoryPanelProps) {
  const [editing, setEditing] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [whyDraft, setWhyDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [criteriaDraft, setCriteriaDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState("");
  const [factsDraft, setFactsDraft] = useState("");
  const [decisionsDraft, setDecisionsDraft] = useState("");
  const [preferencesDraft, setPreferencesDraft] = useState("");
  const [tasksDraft, setTasksDraft] = useState("");
  const usable = usableContextTokens(budget);
  const usedWidth = percentOfUsable(budget.usedInputTokens, usable);
  const compactWidth = percentOfUsable(budget.compactionThreshold, usable);
  const hardStopWidth = percentOfUsable(budget.hardStopThreshold, usable);
  const compactedAt = compactState ? new Date(compactState.compactedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const preservedCount = compactState?.preservedRecentMessageIds.length ?? 0;

  useEffect(() => {
    setGoalDraft(compactState?.userIntent.goal ?? "");
    setWhyDraft(compactState?.userIntent.why ?? "");
    setSummaryDraft(compactState?.workingSummary ?? "");
    setCriteriaDraft(linesOf(compactState?.userIntent.successCriteria ?? []));
    setPriorityDraft(linesOf(compactState?.userIntent.prioritySignals ?? []));
    setFactsDraft(linesOf(compactState?.facts.map((fact) => fact.statement) ?? []));
    setDecisionsDraft(linesOf(compactState?.decisions.map((decision) => decision.decision) ?? []));
    setPreferencesDraft(linesOf(compactState?.preferences.map((preference) => preference.statement) ?? []));
    setTasksDraft(linesOf(compactState?.openTasks.map((task) => task.description) ?? []));
    setEditing(false);
  }, [compactState?.compactedAt]);

  const memoryItems = [
    { label: "Intent", value: compactState?.userIntent.goal ?? "No compact state yet.", tone: "primary" },
    { label: "Why", value: compactState?.userIntent.why ?? "The user's rationale will appear here after compaction.", tone: "primary" },
    { label: "Facts", value: `${compactState?.facts.length ?? 0} preserved`, tone: "neutral" },
    { label: "Decisions", value: `${compactState?.decisions.length ?? 0} preserved`, tone: "neutral" },
    { label: "Tasks", value: `${compactState?.openTasks.length ?? 0} tracked`, tone: "neutral" },
    { label: "Artifacts", value: `${compactState?.artifacts.length ?? 0} linked`, tone: "neutral" },
  ];

  const saveEdits = () => {
    if (!compactState) {
      return;
    }
    onUpdateCompactMemory({
      compactedAt: compactState.compactedAt,
      userIntent: {
        goal: goalDraft,
        why: whyDraft,
        successCriteria: splitLines(criteriaDraft),
        prioritySignals: splitLines(priorityDraft),
      },
      workingSummary: summaryDraft,
      facts: splitLines(factsDraft),
      decisions: splitLines(decisionsDraft),
      preferences: splitLines(preferencesDraft),
      openTasks: splitLines(tasksDraft),
    });
    setEditing(false);
    setLocalNotice("Compact memory corrected. Future replies will use this edited continuity state.");
  };

  return (
    <section className="context-memory-panel" aria-label="Context memory map">
      <div className="context-memory-head">
        <div>
          <span>Context map</span>
          <strong>{usageLabel}</strong>
        </div>
        <div className="context-memory-actions">
          <button
            type="button"
            onClick={() => {
              onCompactThread();
              setLocalNotice("Compact memory updated locally; continuity details are now refreshed.");
            }}
          >
            Compact now
          </button>
          <button type="button" onClick={() => setEditing((current) => !current)} disabled={!compactState}>
            {editing ? "Close edit" : "Edit memory"}
          </button>
        </div>
      </div>

      <p className="context-memory-location">
        Edits change compact memory only; raw chat transcript stays intact.
      </p>

      {localNotice ? <div className="inline-notice warning">{localNotice}</div> : null}

      <div className="context-memory-meter" title={usageTitle}>
        <div className="context-memory-meter-track">
          <span className="context-memory-meter-used" style={{ width: usedWidth }} />
          <span className="context-memory-meter-threshold compact" style={{ left: compactWidth }} />
          <span className="context-memory-meter-threshold hard" style={{ left: hardStopWidth }} />
        </div>
        <div className="context-memory-meter-labels">
          <span>{formatTokenCount(budget.usedInputTokens)} used</span>
          <span>{formatTokenCount(usable)} usable</span>
        </div>
      </div>

      <div className="context-memory-flow" aria-label="Prompt memory layers">
        <span className="active">Raw transcript</span>
        <span className={compactState ? "active" : ""}>Compact memory</span>
        <span className="active">Recent turns</span>
        <span>Archive retrieval</span>
        <span>Response reserve</span>
      </div>

      <div className="context-memory-grid">
        {memoryItems.map((item) => (
          <article key={item.label} className={`context-memory-card ${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      {editing && compactState && (
        <form
          className="context-memory-editor"
          aria-label="Edit compact memory"
          onSubmit={(event) => {
            event.preventDefault();
            saveEdits();
          }}
        >
          <label>
            <span>User goal</span>
            <textarea value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} rows={2} />
          </label>
          <label>
            <span>User why</span>
            <textarea value={whyDraft} onChange={(event) => setWhyDraft(event.target.value)} rows={2} />
          </label>
          <label>
            <span>Working summary</span>
            <textarea value={summaryDraft} onChange={(event) => setSummaryDraft(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Success criteria, one per line</span>
            <textarea value={criteriaDraft} onChange={(event) => setCriteriaDraft(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Priority signals, one per line</span>
            <textarea value={priorityDraft} onChange={(event) => setPriorityDraft(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Facts, one per line</span>
            <textarea value={factsDraft} onChange={(event) => setFactsDraft(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Decisions, one per line</span>
            <textarea value={decisionsDraft} onChange={(event) => setDecisionsDraft(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Preferences, one per line</span>
            <textarea value={preferencesDraft} onChange={(event) => setPreferencesDraft(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Tasks, one per line</span>
            <textarea value={tasksDraft} onChange={(event) => setTasksDraft(event.target.value)} rows={3} />
          </label>
          <div className="context-memory-editor-actions">
            <button type="submit">Save memory</button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="context-memory-foot">
        {compactState ? (
          <>
            <span>Last compacted {compactedAt}</span>
            <span>{preservedCount} recent turns preserved</span>
          </>
        ) : (
          <>
            <span>No compact state yet.</span>
            <span>Compaction preserves intent, why, decisions, facts, tasks, and source ids before old turns leave the prompt.</span>
          </>
        )}
        {usageRatio >= 0.8 ? <strong>Compaction threshold reached.</strong> : null}
      </div>
    </section>
  );
}
