// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import type { ReactNode } from "react";

export function Panel(props: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${props.className ?? ""}`.trim()}>
      {(props.title || props.actions) && (
        <header className="panel-header">
          <div>
            {props.title && <h3>{props.title}</h3>}
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          {props.actions}
        </header>
      )}
      {props.children}
    </section>
  );
}
