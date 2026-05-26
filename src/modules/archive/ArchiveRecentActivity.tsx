// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type { ArchiveRuntimeStatus } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveRecentActivityProps = {
  archiveStatus: ArchiveRuntimeStatus | null;
};

export function ArchiveRecentActivity({ archiveStatus }: ArchiveRecentActivityProps) {
  return (
    <Panel title="Recent Activity" subtitle="Latest archive operations.">
      {archiveStatus?.recentActivity.length ? (
        <div className="archive-activity-list">
          {archiveStatus.recentActivity.slice(0, 5).map((entry) => (
            <article key={`${entry.ts}:${entry.action}:${entry.pageId ?? entry.sourceId ?? "none"}`} className="provider-card">
              <div className="provider-head">
                <div>
                  <strong>{entry.action}</strong>
                  <p>{entry.ts}</p>
                </div>
                <span className={`tone ${entry.errors ? "tone-warning" : "tone-active"}`}>{entry.agentId ?? "system"}</span>
              </div>
              <p>{entry.pageId ?? entry.sourceId ?? "Archive-level operation"}</p>
              {entry.errors ? <p>{entry.errors}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="archive-empty-state">
          <strong>No activity loaded.</strong>
          <p>Check the archive runtime to load recent operations.</p>
        </div>
      )}
    </Panel>
  );
}
