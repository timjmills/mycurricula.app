// icons.tsx — minimal inline-SVG icon set scoped to the Teach board widgets +
// shell chrome (Agent C). The repo has no general icon primitive, so these are
// local, dependency-free, and styled via `currentColor`. Stroke-based to match
// the prototype's line-icon language (teach524.jsx `Icon`).

import type { ReactNode } from "react";

export type TeachIconName =
  | "target"
  | "pause"
  | "rotate"
  | "users"
  | "check"
  | "plus"
  | "play"
  | "poll"
  | "expand"
  | "shrink"
  | "more"
  | "pin"
  | "pinned"
  | "cog"
  | "x"
  | "search"
  | "slides"
  | "youtube"
  | "embed"
  | "timer"
  | "notes"
  | "model"
  | "star"
  | "image"
  | "grid";

const PATHS: Record<TeachIconName, ReactNode> = {
  target: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </g>
  ),
  pause: (
    <g>
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </g>
  ),
  rotate: (
    <g>
      <path d="M3 12a9 9 0 0 1 15-6.7l3 2.7M21 4v6h-6" />
    </g>
  ),
  users: (
    <g>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8" />
    </g>
  ),
  check: <path d="M5 12l4 4 10-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M8 5v14l11-7z" />,
  poll: <path d="M5 18V8M11 18V4M17 18v-6" />,
  expand: (
    <g>
      <path d="M15 3h6v6M3 21l7-7M9 21H3v-6M21 3l-7 7" />
    </g>
  ),
  shrink: (
    <g>
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
    </g>
  ),
  more: (
    <g>
      <circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </g>
  ),
  pin: (
    <g>
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" />
    </g>
  ),
  pinned: (
    <g>
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" fill="currentColor" stroke="none" />
      <path d="M12 13v7" />
    </g>
  ),
  cog: (
    <g>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </g>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <g>
      <circle cx="11" cy="11" r="6" />
      <path d="M21 21l-4.3-4.3" />
    </g>
  ),
  slides: (
    <g>
      <rect x="3" y="4" width="18" height="13" rx="1" />
      <path d="M12 17v3M9 20h6" />
    </g>
  ),
  youtube: (
    <g>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
    </g>
  ),
  embed: (
    <g>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </g>
  ),
  timer: (
    <g>
      <circle cx="12" cy="13" r="8" />
      <path d="M9 1h6M12 5v8l3 2" />
    </g>
  ),
  notes: (
    <g>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M9 8h8M9 12h8M9 16h5" />
    </g>
  ),
  model: (
    <g>
      <rect x="3" y="9" width="18" height="6" rx="1" />
      <path d="M9 9v6M15 9v6" />
    </g>
  ),
  star: (
    <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" />
  ),
  image: (
    <g>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M21 17l-5-5-10 9" />
    </g>
  ),
  grid: (
    <g>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </g>
  ),
};

export interface TeachIconProps {
  name: TeachIconName;
  /** Pixel size (square). Default 16. */
  size?: number;
  /** Optional title for assistive tech (decorative by default). */
  title?: string;
}

/** A single stroke-based icon. Inherits colour via `currentColor`. */
export function TeachIcon({
  name,
  size = 16,
  title,
}: TeachIconProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
