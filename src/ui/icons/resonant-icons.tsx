// Intent citation: docs/product/ICON-001-resonantos-svg-system.md

import type { SVGProps } from "react";

export type ResonantIconName =
  | "home"
  | "archive"
  | "living-archive"
  | "agent"
  | "augmentor"
  | "engineer"
  | "addons"
  | "terminal"
  | "browser"
  | "obsidian"
  | "audio"
  | "settings"
  | "help"
  | "resurrect"
  | "health"
  | "notification"
  | "plus"
  | "search"
  | "project"
  | "pin"
  | "more"
  | "copy"
  | "edit"
  | "delete"
  | "branch"
  | "regenerate"
  | "save-archive"
  | "send"
  | "stop"
  | "mic"
  | "context"
  | "model"
  | "telemetry"
  | "chevron-down";

type ResonantIconProps = SVGProps<SVGSVGElement> & {
  name: ResonantIconName;
  title?: string;
};

export function ResonantIcon({ name, title, ...props }: ResonantIconProps) {
  const titleId = title ? `resonant-icon-${name}-${title.replace(/\W+/g, "-").toLowerCase()}` : undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={titleId}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <use href={`/icons/resonant.svg#ros-${name}`} />
    </svg>
  );
}

