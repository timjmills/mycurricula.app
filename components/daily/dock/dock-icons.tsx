// dock-icons.tsx — inline stroke SVGs for the dock panel system. Matches
// the app's icon idiom (Lucide-style, stroke-width 2, round caps/joins,
// aria-hidden). Sizes are set by the consuming CSS, not the SVG.

import type { ReactNode } from "react";

interface IconProps {
  /** Optional override; most callers size via CSS on the parent. */
  size?: number;
}

function strokeProps(size?: number) {
  return {
    width: size ?? "1em",
    height: size ?? "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    focusable: false as const,
  };
}

/** Six-dot drag grip (two columns of three). */
export function DockGripIcon({ size }: IconProps): ReactNode {
  return (
    <svg
      width={size ?? "1em"}
      height={size ?? "1em"}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

/** Day panel — calendar. */
export function DockDayIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

/** Lesson panel — open book. */
export function DockLessonIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <path d="M12 5.5C10 3.9 7.2 3.5 4 3.8v14.5c3.2-.3 6 .1 8 1.7 2-1.6 4.8-2 8-1.7V3.8c-3.2-.3-6 .1-8 1.7z" />
      <path d="M12 5.5V20" />
    </svg>
  );
}

/** Side panel — split rectangle. */
export function DockSideIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );
}

/** Resources inner tab — folder. */
export function DockResourcesIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** To-do inner tab — checklist. */
export function DockTodosIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <path d="M3.5 6.5l1.7 1.7L8.5 4.9" />
      <line x1="12" y1="6.8" x2="20.5" y2="6.8" />
      <path d="M3.5 14.3l1.7 1.7 3.3-3.3" />
      <line x1="12" y1="14.6" x2="20.5" y2="14.6" />
    </svg>
  );
}

/** Chat inner tab — speech bubble. */
export function DockChatIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" />
    </svg>
  );
}

/** Tabs slot-mode glyph. */
export function DockTabsModeIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  );
}

/** Stack slot-mode glyph. */
export function DockStackModeIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="5" rx="1" />
    </svg>
  );
}

/** Pin glyph (slot controls + rail). */
export function DockPinIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <path d="M12 17v5" />
      <path d="M9 10.6V4h6v6.6l2 2.4v2H7v-2z" />
    </svg>
  );
}

export function DockChevronLeftIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)} strokeWidth={2.2}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function DockChevronRightIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)} strokeWidth={2.2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/** Dock-zone hint glyph — panel with a plus. */
export function DockZoneIcon({ size }: IconProps): ReactNode {
  return (
    <svg {...strokeProps(size)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

/** Icon for a panel id (slot tabs, rail, dock ghost). */
export function dockPanelIcon(id: string, size?: number): ReactNode {
  switch (id) {
    case "day":
      return <DockDayIcon size={size} />;
    case "lesson":
      return <DockLessonIcon size={size} />;
    case "resources":
      return <DockResourcesIcon size={size} />;
    case "todos":
      return <DockTodosIcon size={size} />;
    case "chat":
      return <DockChatIcon size={size} />;
    default:
      return <DockSideIcon size={size} />;
  }
}
