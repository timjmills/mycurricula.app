"use client";

// WeeklyViewControls.tsx — the merged Weekly-view chrome control.
//
// Rendered in the page-header `actions` slot. It folds two previously-separate
// controls into one row:
//
//   • the old top-right Grid | List | Schedule layout toggle (ViewModeToggle),
//     except "Schedule" no longer navigates to /schedule — it flips the
//     view-local schedule mode so the time-blocked <ScheduleTimeline> renders
//     in place inside the grid panel; and
//   • the standalone in-grid "VIEW" bar's Lessons-only | All-events scope
//     toggle, which now appears inline beside the main toggle ONLY while
//     Schedule mode is active.
//
// State comes from two hooks the WeeklyShell already reads: useAppState()
// (viewMode/setViewMode) and useWeeklyScheduleMode() (mode/scheduleMode +
// events). Picking Grid/List sets mode back to "subject"; picking Schedule
// sets mode to "schedule" without touching the grid/list preference, so
// returning from Schedule lands on the prior Grid/List choice.
//
// The /schedule route still exists and is reachable from the left rail — this
// control intentionally does NOT route there.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import {
  useWeeklyScheduleMode,
  type WeeklyScheduleEvents,
} from "@/lib/weekly-schedule-state";
import { useWeekExpansion } from "@/lib/week-expansion";
import { Button, ToggleGroup, Tooltip } from "@/components/ui";
import styles from "./weekly-view-controls.module.css";

// ── Expand-all chevron ────────────────────────────────────────────────────
// Rotates 180° when everything on screen is already open, so the glyph reads
// as the direction the press will take the week — the same treatment the v2
// handoff gives its lesson-flow expander (mockup: the `pl-flowbtn` chevron,
// `transform: rotate(180deg)` while open). The rotation is a ~200ms ease-out
// per CLAUDE.md §4's card-expand timing; `prefers-reduced-motion` drops it to
// no transition (see weekly-view-controls.module.css) rather than removing the
// rotation, so the glyph still points the right way without animating there.
function ExpandChevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${styles.expandChevron} ${open ? styles.expandChevronOpen : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Main toggle value space: the two grid/list view modes plus "schedule". */
type MainMode = "grid" | "list" | "schedule";

interface WeeklyViewControlsProps {
  /**
   * True on the narrow tier (≤900px), where WeeklyShell forces the WeeklyList
   * canvas and refuses to render the in-place ScheduleTimeline (`showSchedule =
   * !isNarrow && scheduleMode`). Passed down from WeeklyShell — the single
   * source of truth for the breakpoint — rather than re-derived here, so the
   * control and the canvas can never disagree about whether Schedule renders.
   */
  isNarrow?: boolean;
}

export function WeeklyViewControls({
  isNarrow = false,
}: WeeklyViewControlsProps): ReactNode {
  const { viewMode, setViewMode } = useAppState();
  const { setMode, scheduleMode, events, setEvents } = useWeeklyScheduleMode();
  const { allExpanded, visibleCount, expandAll, collapseAll } =
    useWeekExpansion();

  // Offering "Schedule" on the narrow tier would let the control claim a mode
  // the body never shows — the header would flip to Schedule + reveal the scope
  // toggle while the canvas stayed a lesson list. So on narrow we drop the
  // Schedule option entirely (the dedicated /schedule route is the phone/tablet
  // entry, still reachable from the left rail) and report the value as the
  // grid/list mode regardless of any persisted schedule preference carried over
  // from a wider viewport.
  const scheduleActive = scheduleMode && !isNarrow;

  // The main toggle reflects schedule-vs-content state: when schedule is
  // active (and renderable) the value is "schedule", otherwise it tracks the
  // grid/list view mode.
  const mainValue: MainMode = scheduleActive ? "schedule" : viewMode;

  return (
    <div className={styles.controls}>
      {/* ── Expand all / Collapse all ─────────────────────────────────────
          The Week has no right panel, so expanding a card in place is how a
          teacher reads a lesson without leaving the surface — and this is the
          control that does it for the whole week at once. Directed by the user
          alongside the panel removal, and shaped after the v2 handoff's
          lesson-flow expander (V2 Framework.md:425-426, "expand-all /
          collapse-all at the top"). The handoff specifies that control for the
          LESSON FLOW, not the week grid; the pattern is borrowed deliberately
          rather than cited as week-surface spec.

          ONE button, not two. It reports the state the week is in and offers
          the opposite, so the teacher never has to work out which of a pair is
          live — and `allExpanded` is computed against what the canvas actually
          renders, so a filtered week that is fully open says "Collapse all"
          honestly.

          Hidden — not disabled — when the canvas has nothing expandable:
          Schedule mode, List mode, the Edit board, and a genuinely empty week
          all publish zero visible ids. That follows the scope toggle below,
          which is hidden on the same reasoning, and it means the control can
          never be present-but-inert. The trade-off is that the header shifts
          when a week loads its first lesson; a permanently disabled button on
          every empty week reads worse. */}
      {visibleCount > 0 && (
        <Tooltip
          content={
            allExpanded
              ? "Close every lesson on this week back to its title and preview."
              : "Open every lesson on this week in place, so you can read objectives, tasks and notes without leaving the grid."
          }
          side="bottom"
          tooltipId="weekly-expand-all"
        >
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<ExpandChevron open={allExpanded} />}
            onClick={() => (allExpanded ? collapseAll() : expandAll())}
            // The label already changes with the state, so aria-pressed would
            // say the same thing twice and screen readers would announce a
            // toggle that renames itself — confusing rather than helpful.
            aria-label={
              allExpanded
                ? `Collapse all ${visibleCount} lessons this week`
                : `Expand all ${visibleCount} lessons this week`
            }
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </Tooltip>
      )}
      <ToggleGroup<MainMode>
        ariaLabel="Weekly view mode"
        variant="prominent"
        size="sm"
        value={mainValue}
        onChange={(v) => {
          if (v === "schedule") {
            // Render the in-place ScheduleTimeline; the grid/list view mode is
            // left untouched so switching back returns to the prior choice.
            setMode("schedule");
            return;
          }
          setMode("subject");
          setViewMode(v);
        }}
        options={[
          {
            value: "grid",
            label: "Grid",
            title: "See the week as a subject-by-day grid",
            tooltipId: "weekly-view-grid",
          },
          {
            value: "list",
            label: "List",
            title: "See the week as a scrollable list of lessons",
            tooltipId: "weekly-view-list",
          },
          // Schedule is omitted on the narrow tier (see scheduleActive note).
          ...(isNarrow
            ? []
            : [
                {
                  value: "schedule" as const,
                  label: "Schedule",
                  title: "Show the week as a time-blocked schedule",
                  tooltipId: "weekly-schedule-toggle",
                },
              ]),
        ]}
      />
      {/* Scope toggle — only meaningful when Schedule is actually rendering, so
          it's hidden otherwise (incl. the narrow tier) rather than disabled,
          keeping the header row uncluttered. */}
      {scheduleActive && (
        <ToggleGroup<WeeklyScheduleEvents>
          ariaLabel="Weekly event scope"
          variant="subtle"
          size="sm"
          value={events}
          onChange={(v) => setEvents(v)}
          options={[
            {
              value: "lessons",
              label: "Lessons only",
              title: "Show only academic lessons",
              tooltipId: "weekly-events-lessons",
            },
            {
              value: "all",
              label: "All events",
              title: "Include non-academic events (lunch, assembly, etc.)",
              tooltipId: "weekly-events-all",
            },
          ]}
        />
      )}
    </div>
  );
}
