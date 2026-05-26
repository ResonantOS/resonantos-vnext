// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type { ArchiveDocumentPayload } from "../../core/contracts";
import { Panel } from "../../components/Panel";

type ArchiveDocumentReaderProps = {
  archiveDocumentBusy: boolean;
  archiveDocument: ArchiveDocumentPayload | null;
};

export function ArchiveDocumentReader({ archiveDocumentBusy, archiveDocument }: ArchiveDocumentReaderProps) {
  return (
    <Panel title="Document Reader" subtitle="Opens selected pages or sources without granting direct filesystem access.">
      {archiveDocument ? (
        <article className="archive-document-card">
          <div className="provider-head">
            <div>
              <strong>{archiveDocument.title ?? archiveDocument.path}</strong>
              <p>{archiveDocument.path}</p>
            </div>
            <span className="tone tone-active">{archiveDocument.docType ?? "document"}</span>
          </div>
          <pre className="archive-document-body">{archiveDocument.content}</pre>
        </article>
      ) : (
        <div className="archive-empty-state">
          <strong>{archiveDocumentBusy ? "Loading document..." : "Nothing open."}</strong>
          <p>Select a wiki page or source to read it here. Add-on documents appear only when their add-on is enabled.</p>
        </div>
      )}
    </Panel>
  );
}
