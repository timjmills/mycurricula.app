"use client";

// IconRail.tsx — the slim vertical icon strip on the far-left of the Daily
// view (Image 12 in the design handoff).
//
// In the Daily view the global "filter pane" is suppressed (the sibling
// shell agent owns that), so the far-left chrome is replaced by this rail:
// a quiet 56px-wide column of icon buttons that gestures at the major
// app surfaces — calendar / today, schedule, to-dos, year/month, voice
// notes — with a settings gear pinned to the bottom.
//
// PHASE 1A SCOPE. The buttons are presentational only. They are real
// <button>s with accessible labels and a visual "active" state so the rail
// reads as an actual nav, but they do NOT route anywhere yet. When the app
// shell + router land (Phase 1B) a sibling agent will wire each button to
// its surface; this file owns only the shape + chrome.
//
// CHROME RULES (CLAUDE.md §4):
//   • Tailwind = layout only. All color / type / spacing comes from
//     tokens.css via var(--…). No hard-coded hex or px font sizes.
//   • The rail itself is subject-neutral — it carries no curriculum color.
//     Hover / active states use ink tokens only.
//   • Every button is a ≥44px tap target (WCAG AA / touch).
//   • Icons follow the Lucide-style inline-SVG idiom used throughout the
//     repo (DailyView.tsx, lesson-flow.tsx, resource-tile.tsx): outline
//     strokes, 24×24 viewBox, currentColor strokes, aria-hidden.
//
// ACCESSIBILITY. The rail is a <nav> with an aria-label so screen readers
// announce it as the daily-view navigation. Each button carries an
// aria-label (the icon is decorative), a title for hover tooltips, and an
// aria-pressed boolean so the active state is announced.

import { useState } from "react";
import type { ReactNode } from "react";
import styles from "./IconRail.module.css";

// ── Icon set ─────────────────────────────────────────────────────────────
// Inline SVGs in the existing Lucide-style outline idiom. Each accepts no
// props because every button in the rail renders its icon at the same size
// and the stroke takes the button's `color` via currentColor.

function TodayIcon(): ReactNode {
  // A calendar with the day inside marked — "today" affordance.
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
      {/* Filled "today" marker — a small rounded square inside the grid. */}
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

function ScheduleIcon(): ReactNode {
  // A clock — the daily timetable / schedule affordance.
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

function TodosIcon(): ReactNode {
  // A check-list clipboard — the to-dos affordance.
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

function YearIcon(): ReactNode {
  // A 3×3 grid — the year / month overview affordance.
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

function VoiceIcon(): ReactNode {
  // A microphone — the "voice / quick note" affordance.
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

function SettingsIcon(): ReactNode {
  // A gear — pinned to the bottom of the rail.
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

// ── Item descriptor ──────────────────────────────────────────────────────
// Centralizes the button table so the render is a straight map and a future
// router wire-up only has to swap out `key` for `href`.

interface RailItem {
  /** Stable id used as the active-item key (Phase 1A) and the React key. */
  key: string;
  /** Accessible label — the icon is decorative. */
  label: string;
  /** Render the icon — a noop function so each entry can pick its own. */
  icon: () => ReactNode;
}

const TOP_ITEMS: readonly RailItem[] = [
  { key: "today", label: "Today", icon: TodayIcon },
  { key: "schedule", label: "Schedule", icon: ScheduleIcon },
  { key: "todos", label: "To-dos", icon: TodosIcon },
  { key: "year", label: "Year / month overview", icon: YearIcon },
  { key: "voice", label: "Voice note", icon: VoiceIcon },
] as const;

// The settings gear sits in its own bottom-pinned slot, visually separated
// by an mt:auto. Same `RailItem` shape so the render path is identical.
const BOTTOM_ITEM: RailItem = {
  key: "settings",
  label: "Settings",
  icon: SettingsIcon,
};

// ── IconRail ─────────────────────────────────────────────────────────────

export function IconRail(): ReactNode {
  // The Daily view is the surface this rail lives on, so "today" is the
  // visually-active item by default. Clicking another button just moves the
  // active marker locally — there is no router yet (Phase 1A).
  const [activeKey, setActiveKey] = useState<string>("today");

  return (
    <nav className={styles.rail} aria-label="Daily view navigation">
      {/* ── Top group: the main surface buttons ────────────────────── */}
      <ul className={styles.list} role="list">
        {TOP_ITEMS.map((item) => (
          <li key={item.key} className={styles.item}>
            <button
              type="button"
              // aria-pressed (not aria-current) — these are not yet routes;
              // they are togglable nav affordances within the rail.
              aria-pressed={activeKey === item.key}
              aria-label={item.label}
              title={item.label}
              className={`${styles.button} ${
                activeKey === item.key ? styles.buttonActive : ""
              }`}
              onClick={() => setActiveKey(item.key)}
            >
              <span className={styles.iconSlot} aria-hidden="true">
                {item.icon()}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* ── Bottom-pinned settings gear ───────────────────────────── */}
      <div className={styles.bottom}>
        <button
          type="button"
          aria-pressed={activeKey === BOTTOM_ITEM.key}
          aria-label={BOTTOM_ITEM.label}
          title={BOTTOM_ITEM.label}
          className={`${styles.button} ${
            activeKey === BOTTOM_ITEM.key ? styles.buttonActive : ""
          }`}
          onClick={() => setActiveKey(BOTTOM_ITEM.key)}
        >
          <span className={styles.iconSlot} aria-hidden="true">
            {BOTTOM_ITEM.icon()}
          </span>
        </button>
      </div>
    </nav>
  );
}
