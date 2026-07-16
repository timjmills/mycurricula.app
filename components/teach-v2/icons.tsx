// components/teach-v2/icons.tsx — the small stroke-glyph set for the v2 Teach
// shell's chrome (pin / minimize / fullscreen / timer transport / etc.).
//
// All icons draw with `stroke="currentColor"` / `fill="currentColor"`, so colour
// comes from the consuming element's `color` token — never a hard-coded hex
// (CLAUDE.md §4). Purely decorative: every glyph is `aria-hidden`; the control
// wrapping it carries the accessible label.

import type { ReactNode } from "react";

export type V2IconName =
  | "pin"
  | "minimize"
  | "expand"
  | "fullscreen"
  | "exit"
  | "present"
  | "play"
  | "pause"
  | "reset"
  | "clock"
  | "plus"
  | "x"
  | "trash"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "image"
  | "grip";

export interface V2IconProps {
  name: V2IconName;
  size?: number;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function V2Icon({ name, size = 18 }: V2IconProps): ReactNode {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };
  switch (name) {
    case "pin":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
          <path d="M12 15v5" />
        </svg>
      );
    case "minimize":
      return (
        <svg {...common} {...STROKE}>
          <path d="M15 5l-6 7 6 7" />
        </svg>
      );
    case "expand":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9 5l6 7-6 7" />
        </svg>
      );
    case "fullscreen":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      );
    case "exit":
      return (
        <svg {...common} {...STROKE}>
          <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
        </svg>
      );
    case "present":
      return (
        <svg {...common} {...STROKE}>
          <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 5l12 7-12 7z" />
        </svg>
      );
    case "pause":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case "reset":
      return (
        <svg {...common} {...STROKE}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v4h4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} {...STROKE}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common} {...STROKE}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} {...STROKE}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common} {...STROKE}>
          <path d="M5 19l3-1L19 7a2 2 0 0 0-3-3L5 15l-1 3 1 1Z" />
        </svg>
      );
    case "highlighter":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 19h6M9 14l6-9 4 3-6 9H8l-2-2 3-1Z" />
        </svg>
      );
    case "eraser":
      return (
        <svg {...common} {...STROKE}>
          <path d="M4 15l7-7 6 6-4 4H8zM14 20h6" />
        </svg>
      );
    case "text":
      return (
        <svg {...common} {...STROKE}>
          <path d="M5 6h14M12 6v13M9 19h6" />
        </svg>
      );
    case "image":
      return (
        <svg {...common} {...STROKE}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 15l5-5 4 4 3-3 6 6" />
          <circle cx="9" cy="9" r="1.4" />
        </svg>
      );
    case "grip":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="9" cy="7" r="1.4" />
          <circle cx="15" cy="7" r="1.4" />
          <circle cx="9" cy="12" r="1.4" />
          <circle cx="15" cy="12" r="1.4" />
          <circle cx="9" cy="17" r="1.4" />
          <circle cx="15" cy="17" r="1.4" />
        </svg>
      );
    default:
      return null;
  }
}
