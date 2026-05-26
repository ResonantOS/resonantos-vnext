// Intent citation: docs/architecture/ADR-019-obsidian-addon-embedded-workspace.md

import type { ObsidianMetadata } from "./obsidian-workspace-model";

type ObsidianMetadataPanelProps = {
  metadata: ObsidianMetadata;
};

export function ObsidianMetadataPanel({ metadata }: ObsidianMetadataPanelProps) {
  return (
    <aside className="obsidian-metadata-panel" aria-label="Obsidian note metadata">
      <section>
        <span className="eyebrow">Metadata</span>
        {metadata.frontmatter.length ? (
          <dl>
            {metadata.frontmatter.map((item) => (
              <div key={`${item.key}:${item.value}`}>
                <dt>{item.key}</dt>
                <dd>{item.value || "empty"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>No frontmatter detected.</p>
        )}
      </section>

      <section>
        <span className="eyebrow">Tags</span>
        {metadata.tags.length ? (
          <div className="obsidian-metadata-chips">
            {metadata.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : (
          <p>No tags detected.</p>
        )}
      </section>

      <section>
        <span className="eyebrow">Wikilinks</span>
        {metadata.wikilinks.length ? (
          <div className="obsidian-metadata-list">
            {metadata.wikilinks.map((link) => (
              <span key={link}>[[{link}]]</span>
            ))}
          </div>
        ) : (
          <p>No wikilinks detected.</p>
        )}
      </section>
    </aside>
  );
}
