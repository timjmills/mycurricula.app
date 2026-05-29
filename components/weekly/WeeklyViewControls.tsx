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
import { ToggleGroup } from "@/components/ui";
import styles from "./weekly-view-controls.module.css";

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
