"use client";

// weekly-schedule-pills.tsx — small inline-pills bar above the Weekly grid.
//
// The Weekly view's chrome hosts two pills that govern the grid panel's
// canvas, independent of the top-bar Grid/List ViewMode:
//
//   • "Subject ↔ Schedule" — the primary mode toggle. Flips the canvas
//     between the existing WeeklyGrid / WeeklyList and the time-blocked
//     <ScheduleTimeline scope="week" />.
//   • "Lessons only ↔ All events" — only visible when Schedule mode is on.
//     Toggles whether non-academic blocks (recess, lunch, etc.) appear in
//     the timeline alongside lesson blocks.
//
// The bar renders as a slim ~36px strip with a "VIEW" eyebrow on the left
// and the pills right-aligned. Sits on var(--paper) with a 1px var(--ink-100)
// bottom border so it reads as a chrome row separating from the grid below.
//
// State is owned by useWeeklyScheduleMode() in lib/weekly-schedule-state.ts —
// the hook is provider-less, so the WeeklyShell calls the hook to read state
// (for the grid-panel branch) and this component calls the same hook to read
// the pill values it renders. Both reads resolve to the same localStorage-
// backed state because both consumers hydrate from the same key.
//
// Visual style: ToggleGroup primitive, variant="subtle", size="sm". Subtle
// is the right choice here per BUILD_STANDARD §7 — these are contextual
// switches inside a chrome bar, not the primary top-bar mode switch.

import type { ReactNode } from "react";
import { ToggleGroup } from "@/components/ui";
import { useWeeklyScheduleMode } from "@/lib/weekly-schedule-state";
import styles from "./weekly-schedule-pills.module.css";

export function WeeklySchedulePills(): ReactNode {
  const { mode, setMode, scheduleMode, events, setEvents } =
    useWeeklyScheduleMode();

  return (
    <div className={styles.bar} role="toolbar" aria-label="Weekly view mode">
      {/* Eyebrow label — quiet, all-caps, sits on the left of the bar. */}
      <span className={styles.eyebrow} aria-hidden="true">
        VIEW
      </span>

      {/* Pushes the pills to the right edge of the bar. */}
      <span className={styles.spacer} />

      {/* Primary canvas mode toggle. */}
      <ToggleGroup
        options={[
          { value: "subject", label: "Subject", ariaLabel: "Subject grid" },
          {
            value: "schedule",
            label: "Schedule",
            ariaLabel: "Schedule timeline",
          },
        ]}
        value={mode}
        onChange={setMode}
        variant="subtle"
        size="sm"
        ariaLabel="Weekly canvas mode"
      />

      {/* Lessons-only / All-events pill — only meaningful in Schedule mode.
          We hide it entirely outside Schedule mode rather than disabling it,
          so the bar reads less cluttered when the toggle has no effect. */}
      {scheduleMode && (
        <ToggleGroup
          options={[
            {
              value: "lessons",
              label: "Lessons only",
              ariaLabel: "Show lesson blocks only",
            },
            {
              value: "all",
              label: "All events",
              ariaLabel: "Show all blocks including non-academic events",
            },
          ]}
          value={events}
          onChange={setEvents}
          variant="subtle"
          size="sm"
          ariaLabel="Schedule events filter"
        />
      )}
    </div>
  );
}
