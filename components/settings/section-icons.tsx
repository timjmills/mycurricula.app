// section-icons.tsx — one glyph per settings section, in the house icon
// style (components/shell/rail-icon-meta.tsx): 24-viewBox stroke icons,
// strokeWidth 1.7, round caps/joins, currentColor so each render site
// tints them through the cascade.
//
// Rendered at three sites so a section is recognizable everywhere it
// appears: the settings sidebar tabs (16px), the /settings overview
// tiles (20px), and each section page's header chip (20px). Keyed by the
// sidebar slug — keep in lockstep with SETTINGS_GROUPS in
// app/settings/layout.tsx and the overview tiles in app/settings/page.tsx.

import type { ReactNode } from "react";

interface GlyphProps {
  /** Rendered square size in px. Defaults to 20 (the tile/header size);
   *  the sidebar passes 16. */
  size?: number;
}

function frame(size: number | undefined, paths: ReactNode): ReactNode {
  const s = size ?? 20;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths}
    </svg>
  );
}

/** Curriculum — an open book (the team's shared plan). */
export function CurriculumGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <path d="M12 6.5C10.4 5 8 4.5 5 4.5v13c3 0 5.4.5 7 2 1.6-1.5 4-2 7-2v-13c-3 0-5.4.5-7 2Z" />
      <path d="M12 6.5v13" />
    </>,
  );
}

/** Calendar — month grid with a marked day. */
export function CalendarGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
      <path d="M8.5 14h2.5" />
    </>,
  );
}

/** Schedule — clock face. */
export function ScheduleGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 2" />
    </>,
  );
}

/** Subjects — stacked layers (the subject roster). */
export function SubjectsGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <path d="m12 4 8 4.2-8 4.2-8-4.2L12 4Z" />
      <path d="m5.2 11.9-1.2.7 8 4.2 8-4.2-1.2-.7" />
      <path d="m5.2 15.6-1.2.7 8 4.2 8-4.2-1.2-.7" />
    </>,
  );
}

/** Lesson templates — layout rows (a lesson-flow skeleton). */
export function TemplatesGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M4.5 9.5h15M9.5 9.5v10" />
    </>,
  );
}

/** Workspace & Team — two people. */
export function WorkspaceGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.8 19.5c.6-3 2.7-4.7 5.2-4.7s4.6 1.7 5.2 4.7" />
      <path d="M15.5 5.9a3 3 0 0 1 0 5.2" />
      <path d="M17.4 14.9c1.6.7 2.6 2.2 3 4.1" />
    </>,
  );
}

/** Account — person in a circle. */
export function AccountGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.2 18a5.4 5.4 0 0 1 9.6 0" />
    </>,
  );
}

/** Appearance — paint droplet. */
export function AppearanceGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <path d="M12 4.5s5.75 6 5.75 9.75a5.75 5.75 0 0 1-11.5 0C6.25 10.5 12 4.5 12 4.5Z" />
      <path d="M9.6 14.6a2.6 2.6 0 0 0 2.2 2.4" />
    </>,
  );
}

/** Catch-up — the flame the catch-up cues already use. */
export function CatchupGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <path d="M12 4.5c.6 2.6 2 4.1 3.6 5.7a6.4 6.4 0 1 1-9.4 1.4c.5.9 1.3 1.5 2.3 1.7-.5-2.9.9-6.4 3.5-8.8Z" />
      <path d="M12 19.5a2.7 2.7 0 0 0 2.4-3.9c-.4.5-.9.8-1.5.9 0-1.1-.3-2-.9-2.8a4.3 4.3 0 0 1-2.6 3.4 2.7 2.7 0 0 0 2.6 2.4Z" />
    </>,
  );
}

/** Overview — four tiles (the dashboard itself; used by search/landing). */
export function OverviewGlyph({ size }: GlyphProps): ReactNode {
  return frame(
    size,
    <>
      <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" />
    </>,
  );
}

/** Registry keyed by the sidebar slug (SETTINGS_GROUPS / overview tiles). */
export const SECTION_ICONS: Record<string, (props: GlyphProps) => ReactNode> = {
  curriculum: CurriculumGlyph,
  calendar: CalendarGlyph,
  schedule: ScheduleGlyph,
  subjects: SubjectsGlyph,
  "lesson-templates": TemplatesGlyph,
  workspace: WorkspaceGlyph,
  account: AccountGlyph,
  appearance: AppearanceGlyph,
  "catch-up": CatchupGlyph,
};
