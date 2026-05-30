// glyphs.tsx — local inline-SVG glyphs for the Board Fullscreen chrome +
// markup panel. The shared `TeachIcon` set (../../widgets/icons) covers most
// widget/library glyphs; this file adds ONLY the present-mode chrome glyphs it
// lacks (home, chevrons, side-flip arrows, undo/redo, pen/highlighter/eraser/
// cursor/sticky/hourglass/clock/user/more/close). All stroke-based via
// `currentColor` to match the line-icon language; sizes are passed in px by the
// caller (icon geometry, not CSS font-size). No colours — `currentColor` only.

import type { ReactNode } from "react";

export type GlyphName =
  | "home"
  | "expand"
  | "moreV"
  | "close"
  | "chevL"
  | "chevR"
  | "arrowL"
  | "arrowR"
  | "cursor"
  | "pen"
  | "highlighter"
  | "eraser"
  | "textAa"
  | "sticky"
  | "undo"
  | "redo"
  | "trash"
  | "hourglass"
  | "clock"
  | "user"
  | "image"
  | "grid"
  | "star"
  | "search";

interface GlyphProps {
  name: GlyphName;
  /** Square px size (SVG geometry — not a CSS font-size token). */
  size?: number;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Glyph({ name, size = 20 }: GlyphProps): ReactNode {
  const common = { width: size, height: size, viewBox: "0 0 24 24" };

  switch (name) {
    case "home":
      return (
        <svg {...common} {...STROKE}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9h5v-6h4v6h5v-9" />
        </svg>
      );
    case "expand":
      return (
        <svg {...common} {...STROKE}>
          <path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5" />
        </svg>
      );
    case "moreV":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      );
    case "close":
      return (
        <svg {...common} {...STROKE}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "chevL":
      return (
        <svg {...common} {...STROKE}>
          <path d="M15 6 9 12l6 6" />
        </svg>
      );
    case "chevR":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "arrowL":
      return (
        <svg {...common} {...STROKE}>
          <path d="M19 12H5M11 6 5 12l6 6" />
        </svg>
      );
    case "arrowR":
      return (
        <svg {...common} {...STROKE}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "cursor":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 3l15 9-6.5 1.5L10 20 5 3z" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common} {...STROKE}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "highlighter":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9 14l-1 4-4 1 1-4 9-9 3 3z" />
          <path d="M14 6l4 4" />
          <line x1="3" y1="22" x2="21" y2="22" />
        </svg>
      );
    case "eraser":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 14 14 4l6 6-7 7H8z" />
          <path d="M8 17 5 14" />
          <line x1="3" y1="21" x2="21" y2="21" />
        </svg>
      );
    case "textAa":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 18 8 6l4 12M5 14h6" />
          <path d="M14 18l3-8 3 8M15 15.5h4" />
        </svg>
      );
    case "sticky":
      return (
        <svg {...common} {...STROKE}>
          <path d="M5 4h14v10l-5 5H5z" />
          <path d="M14 19v-5h5" />
        </svg>
      );
    case "undo":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9 7 4 12l5 5" />
          <path d="M4 12h11a5 5 0 0 1 0 10h-3" />
        </svg>
      );
    case "redo":
      return (
        <svg {...common} {...STROKE}>
          <path d="M15 7l5 5-5 5" />
          <path d="M20 12H9a5 5 0 0 0 0 10h3" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      );
    case "hourglass":
      return (
        <svg {...common} {...STROKE}>
          <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 0M7 21c0-5 10-5 10 0" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "user":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "image":
      return (
        <svg {...common} {...STROKE}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="m21 17-5-5L5 21" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common} {...STROKE}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "star":
      return (
        <svg {...common} viewBox="0 0 24 24" {...STROKE}>
          <path d="M12 2.5l2.9 6.06 6.6.92-4.8 4.62 1.16 6.55L12 18.1 6.14 20.65 7.3 14.1 2.5 9.48l6.6-.92Z" />
        </svg>
      );
  }
}
