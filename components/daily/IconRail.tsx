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
// ── Lane BD (schedule-and-auth-5.24): Schedule trigger ────────────────────
// The Schedule icon is now a real toggle that opens Lane BB's
// <SchedulePanel /> — a side-drawer over the Daily view showing the day's
// timetable while the teacher works in any sub-surface. Local boolean
// state (`scheduleOpen`) drives both aria-pressed and the panel's `open`
// prop; the panel handles its own positioning/portal so we render it
// inline at the bottom of the rail's <nav>.
//
// Scope limit: the Daily IconRail is mounted on /daily ONLY. So this
// trigger only exposes the Schedule side-panel from /daily for now. A
// later wave will surface the trigger globally (e.g. via the
// LeftFilterPanel or a top-level rail) so teachers can pop the schedule
// open from Weekly, Subject, Unit, etc.
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

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { Button, Tooltip } from "@/components/ui";
// SchedulePanel — Lane BB's right-side drawer. The drawer handles
// its own portal + positioning, so we mount it inline at the bottom
// of the rail and pass it our local toggle state.
import { SchedulePanel } from "@/components/schedule";
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
  // Lane BD: local state for the Schedule side-panel toggle. Kept local
  // (not in useAppState) because the trigger lives on /daily only — see
  // file header. Promote to global state when the trigger goes global.
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <nav className={styles.rail} aria-label="Daily view navigation">
      {/* ── Top group: the main surface buttons ────────────────────── */}
      <ul className={styles.list} role="list">
        {/* Today — this IS the daily view; mark active and no-op navigate. */}
        <li className={styles.item}>
          <Tooltip content="Today" side="right">
            <Button
              variant="icon"
              iconAriaLabel="Today (daily view)"
              aria-pressed={true}
              className={`${styles.button} ${styles.buttonActive}`}
              onClick={() => router.push("/daily")}
            >
              <TodayIcon />
            </Button>
          </Tooltip>
        </li>

        {/* Schedule — wired (Lane BD) to toggle Lane BB's SchedulePanel
              side-drawer. aria-pressed reflects the live open state so
              screen readers announce the toggle correctly. */}
        <li className={styles.item}>
          <Tooltip
            content="Open the schedule side panel — see your day's timetable while you work in any view"
            side="right"
          >
            <Button
              variant="icon"
              iconAriaLabel={
                scheduleOpen ? "Close schedule panel" : "Open schedule panel"
              }
              aria-pressed={scheduleOpen}
              className={`${styles.button} ${scheduleOpen ? styles.buttonActive : ""}`}
              onClick={() => setScheduleOpen((o) => !o)}
            >
              <ScheduleIcon />
            </Button>
          </Tooltip>
        </li>

        {/* To-dos — wired to the right-rail to-do panel toggle. */}
        <li className={styles.item}>
          <Tooltip content="To-dos" side="right">
            <Button
              variant="icon"
              iconAriaLabel={
                todoPanelOpen ? "Close to-do list" : "Open to-do list"
              }
              aria-pressed={todoPanelOpen}
              className={`${styles.button} ${todoPanelOpen ? styles.buttonActive : ""}`}
              onClick={toggleTodoPanel}
            >
              <TodosIcon />
            </Button>
          </Tooltip>
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

      {/* ── Schedule side-panel (Lane BD → Lane BB) ──────────────────
            The panel handles its own positioning and portal, so we
            mount it inline at the bottom of the rail. Local
            `scheduleOpen` drives both aria-pressed on the trigger
            above and `open` here so they never drift. */}
      <SchedulePanel
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
      />

      {/* ── Bottom-pinned settings gear (RAIL-002) ────────────────────
            position:sticky + bottom:0 so the gear is always reachable
            without scrolling, even when the nav is taller than the
            viewport.
            Renders as a Next.js <Link> (not a Button) so it is a real
            navigable anchor — middle-click / cmd-click / "open in new
            tab" all work the way teachers expect from a primary nav
            target. The .button class supplies the same ≥44×44 hit
            target + ink-token chrome as the buttons above. */}
      <div className={styles.bottom}>
        {/* Settings entry → /settings landing. The landing route
            redirects to whichever sub-page the teacher last visited
            (default /settings/curriculum). Unified with the top-bar
            avatar so there is one canonical Settings affordance. */}
        <Tooltip
          content="Settings — your team's curriculum and your personal preferences"
          side="right"
        >
          <Link
            href="/settings"
            aria-label="Settings"
            className={styles.button}
          >
            <SettingsIcon />
          </Link>
        </Tooltip>
      </div>
    </nav>
  );
}
