// Icon set for the Lesson Card — a thin stroked 16×16 grid.
// Ported from the design handoff (project/shared.jsx CPIcon). Every glyph
// is a single <svg> so it inherits `currentColor` and stays crisp at the
// small sizes the card uses.

import type { ReactElement } from "react";

/** Named glyphs the card draws. */
export type IconName =
  | "check"
  | "chevron"
  | "chevronD"
  | "dots"
  | "drag"
  | "link"
  | "pdf"
  | "youtube"
  | "slides"
  | "image"
  | "doc"
  | "website"
  | "print"
  | "eye"
  | "plus"
  | "list";

const PATHS: Record<IconName, ReactElement> = {
  check: <path d="M3 8l3 3 7-7" />,
  chevron: <path d="M5 4l5 4-5 4" />,
  chevronD: <path d="M4 5l4 5 4-5" />,
  dots: (
    <g>
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="13" cy="8" r="1.3" />
    </g>
  ),
  drag: (
    <g>
      <circle cx="5" cy="3" r=".9" />
      <circle cx="5" cy="8" r=".9" />
      <circle cx="5" cy="13" r=".9" />
      <circle cx="11" cy="3" r=".9" />
      <circle cx="11" cy="8" r=".9" />
      <circle cx="11" cy="13" r=".9" />
    </g>
  ),
  link: (
    <path d="M6.5 9.5l3-3M5 11l-1 1a2.5 2.5 0 1 1-3.5-3.5l1-1M11 5l1-1a2.5 2.5 0 1 1 3.5 3.5l-1 1" />
  ),
  pdf: (
    <g>
      <rect x="3" y="1.5" width="9" height="13" rx="1" />
      <path d="M5 7h5M5 9.5h5M5 12h3" />
    </g>
  ),
  youtube: (
    <g>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
      <path d="M7 6l3 2-3 2z" fill="currentColor" stroke="none" />
    </g>
  ),
  slides: (
    <g>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
      <path d="M8 11.5v2M5.5 13.5h5" />
    </g>
  ),
  image: (
    <g>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <circle cx="5.5" cy="6" r="1.3" />
      <path d="M2 12l4-4 3 3 2-2 3 3" />
    </g>
  ),
  doc: (
    <g>
      <path d="M3 1.5h6l3 3V14H3z M9 1.5V4.5H12" />
      <path d="M5 8h6M5 10.5h6M5 13h3" />
    </g>
  ),
  website: (
    <g>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2 2 10 0 12c-2-2-2-10 0-12z" />
    </g>
  ),
  print: (
    <g>
      <path d="M4 6V2h8v4M4 11H2V6h12v5h-2M5 9h6v5H5z" />
    </g>
  ),
  eye: (
    <g>
      <path d="M1 8c2-3.5 4.5-5 7-5s5 1.5 7 5c-2 3.5-4.5 5-7 5s-5-1.5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </g>
  ),
  plus: (
    <g>
      <path d="M8 3v10M3 8h10" />
    </g>
  ),
  list: (
    <g>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </g>
  ),
};

interface IconProps {
  name: IconName;
  /** Square px size; viewBox is fixed at 16. */
  size?: number;
}

/** A single stroked icon that inherits `currentColor`. */
export function Icon({ name, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
