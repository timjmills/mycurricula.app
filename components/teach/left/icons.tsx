// icons.tsx — minimal inline-SVG glyph set for the Teach left zone
// (Lucide-style strokes, currentColor, no external dep — CLAUDE.md "no new
// dependencies"). One glyph per left-rail module plus a few control glyphs.

import type { ReactNode } from "react";

interface IconProps {
  /** Pixel size (width == height). Default 17. */
  size?: number;
}

function svg(size: number, children: ReactNode): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function LessonsIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>,
  );
}

export function LessonIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>,
  );
}

export function BoardsIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <rect x="3" y="4" width="8" height="8" rx="1" />
      <rect x="13" y="4" width="8" height="8" rx="1" />
      <rect x="3" y="14" width="8" height="6" rx="1" />
      <rect x="13" y="14" width="8" height="6" rx="1" />
    </>,
  );
}

export function NotesIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>,
  );
}

export function GroupsIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 6a3 3 0 0 1 0 6" />
      <path d="M18 20a6 6 0 0 0-3-5.2" />
    </>,
  );
}

export function ClassIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4Z" />
      <path d="M7 9v5c0 1.5 2.2 3 5 3s5-1.5 5-3V9" />
      <path d="M21 7v5" />
    </>,
  );
}

export function ToolsIcon({ size = 17 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-5 5a2 2 0 1 0 2.8 2.8l5-5a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.3-2.3 2.5-2.5Z" />
    </>,
  );
}

export function PlusIcon({ size = 13 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M12 5v14M5 12h14" />
    </>,
  );
}

export function ExternalLinkIcon({ size = 12 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </>,
  );
}

export function ShareIcon({ size = 13 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
    </>,
  );
}

export function PinIcon({ size = 13 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3H7l3-3-1-6Z" />
    </>,
  );
}

export function TrashIcon({ size = 13 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </>,
  );
}

export function CloseIcon({ size = 12 }: IconProps): ReactNode {
  return svg(
    size,
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>,
  );
}

/** Map a module id to its rail glyph. */
export function moduleIcon(moduleId: string, size = 17): ReactNode {
  switch (moduleId) {
    case "lessons":
      return <LessonsIcon size={size} />;
    case "lesson":
      return <LessonIcon size={size} />;
    case "boards":
      return <BoardsIcon size={size} />;
    case "notes":
      return <NotesIcon size={size} />;
    case "groups":
      return <GroupsIcon size={size} />;
    case "class":
      return <ClassIcon size={size} />;
    case "tools":
      return <ToolsIcon size={size} />;
    default:
      return <LessonIcon size={size} />;
  }
}
