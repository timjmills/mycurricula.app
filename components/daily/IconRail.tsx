"use client";

// IconRail.tsx — the slim vertical icon strip on the far-left of the Daily
// view (Image 12 in the design handoff).
//
// ── What changed in Wave 2 (RAIL-001, RAIL-002, POLISH-014) ────────────────
// RAIL-001: Buttons are now wired:
//   • "Today" — visually active; navigates to /daily via Next Link (currently
//     the active page so it refreshes in place, no-op).
//   • "To-dos" — calls useAppState().toggleTodoPanel; aria-pressed reflects
//     the live todoPanelOpen state.
//   • "Schedule", "Year / month overview", "Voice note" — these surfaces do
//     not exist yet. They render as clearly inert "coming soon" affordances:
//     no aria-pressed toggle behavior, cursor:default, a tooltip that reads
//     "<Surface> — coming soon", and a small "soon" chip over the icon.
// RAIL-002: The Settings gear is always visible without scrolling. The <nav>
//   now sets overflow:hidden on narrow heights; the gear's parent uses
//   position:sticky + bottom:0 so the hardware-level sticky algorithm keeps
//   it in view regardless of the nav height.
// POLISH-014: Every button already carried a `title` attribute in the
//   original; confirmed present and correct — no gap to fill.
//
// ── Add-lesson / Add-event forms ───────────────────────────────────────────
// The "+ Add a lesson" and "+ Add an event" buttons are in DailyView.tsx.
// DailyView owns their open-state and renders AddLessonForm / AddEventForm at
// the root of its page tree so the popovers are never clipped by overflow.
// The icon rail no longer carries duplicate affordances.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────
//   • Tailwind = layout only. All color / type / spacing via tokens.css.
//   • The rail is subject-neutral (ink tokens only).
//   • Every interactive button is a ≥44px tap target (WCAG AA).
//   • Icons follow the Lucide-style inline-SVG idiom.
//   • Reduced motion is respected by the consumed form components.
//
// ACCESSIBILITY: The rail is a <nav> with aria-label. Each wired button
// carries aria-pressed (boolean) and a descriptive aria-label + title.
// Coming-soon buttons carry aria-disabled="true" and no aria-pressed so
// screen-readers don't announce them as interactive toggles.

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import styles from "./IconRail.module.css";

// ── Icon set ─────────────────────────────────────────────────────────────
// Inline SVGs in the Lucide-style outline idiom. 20×20 rendered size,
// 24×24 viewBox. currentColor strokes follow the button's color token.

function TodayIcon(): ReactNode {
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
      {/* Filled "today" marker — small rounded square inside the grid. */}
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

// ── IconRail ─────────────────────────────────────────────────────────────

export function IconRail(): ReactNode {
  const { todoPanelOpen, toggleTodoPanel } = useAppState();
  const router = useRouter();

  return (
    <nav className={styles.rail} aria-label="Daily view navigation">
      {/* ── Top group: the main surface buttons ────────────────────── */}
      <ul className={styles.list} role="list">
        {/* Today — this IS the daily view; mark active and no-op navigate. */}
        <li className={styles.item}>
          <button
            type="button"
            aria-pressed={true}
            aria-label="Today (daily view)"
            title="Today"
            className={`${styles.button} ${styles.buttonActive}`}
            onClick={() => router.push("/daily")}
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <TodayIcon />
            </span>
          </button>
        </li>

        {/* Schedule — coming soon; inert affordance.
              A plain <span> has no interactive role — screen readers ignore it.
              pointer-events:none in CSS keeps it outside the keyboard tab order.
              Sighted users see the title tooltip on hover. */}
        <li className={styles.item}>
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Schedule — coming soon"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <ScheduleIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </li>

        {/* To-dos — wired to the right-rail to-do panel toggle. */}
        <li className={styles.item}>
          <button
            type="button"
            aria-pressed={todoPanelOpen}
            aria-label={todoPanelOpen ? "Close to-do list" : "Open to-do list"}
            title="To-dos"
            className={`${styles.button} ${todoPanelOpen ? styles.buttonActive : ""}`}
            onClick={toggleTodoPanel}
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <TodosIcon />
            </span>
          </button>
        </li>

        {/* Year / month overview — coming soon; inert affordance. */}
        <li className={styles.item}>
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Year / month overview — coming soon"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <YearIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </li>

        {/* Voice note — coming soon; inert affordance. */}
        <li className={styles.item}>
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Voice note — coming soon"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <VoiceIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </li>
      </ul>

      {/* ── Bottom-pinned settings gear (RAIL-002) ────────────────────
            position:sticky + bottom:0 so the gear is always reachable
            without scrolling, even when the nav is taller than the
            viewport. */}
      <div className={styles.bottom}>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className={styles.button}
          onClick={() => router.push("/settings/appearance")}
        >
          <span className={styles.iconSlot} aria-hidden="true">
            <SettingsIcon />
          </span>
        </button>
      </div>
    </nav>
  );
}
