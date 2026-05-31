"use client";

// rail-icon-meta.tsx — central registry of rail-icon glyphs + metadata.
//
// Wave 1.5 Lane FA put the SVG glyphs and the per-icon onClick wiring in
// rail-icons.tsx so the LEFT and RIGHT rails could share one renderer. The
// glyphs themselves, plus the human-readable label and the onboarding blurb
// for each icon, are now needed in MORE than one place:
//
//   • rail-icons.tsx — the rail renderer, which paints the wired buttons;
//   • RailContextMenu.tsx — the right-click / long-press placement menu,
//     which needs the pretty label for its copy;
//   • the new "add panel" picker (built alongside this module), which needs
//     the glyph + label + a one-line description for each addable icon.
//
// Rather than re-declare the glyphs or copy the label table into the picker,
// every consumer reads from this single registry. The glyph components are
// MOVED here verbatim from rail-icons.tsx; the label table mirrors the copy
// that previously lived inline in RailContextMenu.tsx; the blurb table is
// new (the picker needs a sentence per icon and this is the natural home).
//
// Keep the three tables (order, label, blurb) and the RailGlyph switch in
// lockstep with the RailIconId union in lib/use-rail-layout.ts — adding an
// icon means extending that union AND every table here.

import type { ReactNode } from "react";
import type { RailIconId } from "@/lib/use-rail-layout";

// ── Icon glyphs ──────────────────────────────────────────────────────────

export function TodayIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2.5" x2="8" y2="6" />
      <line x1="16" y1="2.5" x2="16" y2="6" />
      <rect
        x="10.5"
        y="12.5"
        width="3.5"
        height="3.5"
        rx="0.6"
        fill="currentColor"
      />
    </svg>
  );
}

export function ScheduleIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

export function TodosIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z" />
      <path d="M16 4.5h2a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2" />
      <polyline points="8.5 12 10.5 14 14 10.5" />
      <line x1="8.5" y1="17" x2="15.5" y2="17" />
    </svg>
  );
}

export function YearIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="5" height="5" rx="0.8" />
      <rect x="9.5" y="3.5" width="5" height="5" rx="0.8" />
      <rect x="15.5" y="3.5" width="5" height="5" rx="0.8" />
      <rect x="3.5" y="9.5" width="5" height="5" rx="0.8" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
      <rect x="15.5" y="9.5" width="5" height="5" rx="0.8" />
      <rect x="3.5" y="15.5" width="5" height="5" rx="0.8" />
      <rect x="9.5" y="15.5" width="5" height="5" rx="0.8" />
      <rect x="15.5" y="15.5" width="5" height="5" rx="0.8" />
    </svg>
  );
}

export function VoiceIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

export function ChatIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ResourcesIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11.5z" />
      <path d="M10 13.5l1.5 1.5 3-3" />
    </svg>
  );
}

export function SettingsIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.27.652.875 1.106 1.59 1.18H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Metadata tables ──────────────────────────────────────────────────────

/**
 * Canonical display order for icon pickers / settings lists. This is the
 * order the "add panel" picker walks; it is intentionally independent of any
 * one teacher's rail arrangement (which lives in use-rail-layout's RailLayout).
 */
export const RAIL_ICON_ORDER: readonly RailIconId[] = [
  "today",
  "schedule",
  "todos",
  "comments",
  "resources",
  "year",
  "voice",
  "settings",
] as const;

/**
 * Pretty-name for each icon — the user-visible label used by the context
 * menu's copy and the picker's row title. Mirrors the copy that previously
 * lived inline in RailContextMenu.tsx.
 */
export const RAIL_ICON_LABEL: Record<RailIconId, string> = {
  today: "Today",
  schedule: "Schedule",
  todos: "To-dos",
  comments: "Team Shoutbox",
  resources: "Resources",
  year: "Year overview",
  voice: "Voice note",
  settings: "Settings",
};

/**
 * One short onboarding-voice sentence per icon — tells a first-time teacher
 * what the feature accomplishes. Consumed by the add-panel picker so each
 * addable icon carries a plain-language description.
 */
export const RAIL_ICON_BLURB: Record<RailIconId, string> = {
  today: "Jump to today's lessons in the Daily view.",
  schedule: "Today's time blocks in a side-panel while you work.",
  todos: "A running checklist for the day.",
  comments: "Quick messages with teachers covering the same lessons.",
  resources:
    "Links, slides, handouts and videos for the lesson you're viewing.",
  year: "Zoom out to the arc of your whole year.",
  voice: "Dictate a quick voice note into a lesson.",
  settings: "Your team's curriculum and your personal preferences.",
};

// ── Glyph dispatch ─────────────────────────────────────────────────────────
// Returns the matching glyph element for a RailIconId. Note the id "comments"
// maps to ChatIcon (the shoutbox icon) — the rail-layout id and the glyph
// name diverge there for historical reasons (see RailIcon's "comments" case).

export function RailGlyph({ id }: { id: RailIconId }): ReactNode {
  switch (id) {
    case "today":
      return <TodayIcon />;
    case "schedule":
      return <ScheduleIcon />;
    case "todos":
      return <TodosIcon />;
    case "comments":
      return <ChatIcon />;
    case "resources":
      return <ResourcesIcon />;
    case "year":
      return <YearIcon />;
    case "voice":
      return <VoiceIcon />;
    case "settings":
      return <SettingsIcon />;
  }
}
