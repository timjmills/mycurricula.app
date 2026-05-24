"use client";

// daily-schedule-pill.tsx — inline pill above the Daily lesson-list column.
//
// A single Subject ↔ Schedule pill that controls whether the Daily view
// mounts an additional <ScheduleDayPane day={selectedDay} scope="rail" />
// alongside its existing 4-track layout. The pill is owned by the Daily
// view's chrome (not the global top-bar) so the top-bar Grid/List toggle
// stays focused on lesson-card layout.
//
// Unlike Weekly's pill, Daily's Schedule mode does NOT swap the canvas —
// it just mounts the schedule rail beside everything else. See the comment
// in DailyView.tsx where it is consumed.
//
// State is owned by useDailyScheduleMode() in lib/daily-schedule-state.ts.

import type { ReactNode } from "react";
import { ToggleGroup } from "@/components/ui";
import { useDailyScheduleMode } from "@/lib/daily-schedule-state";
import styles from "./daily-schedule-pill.module.css";

export function DailySchedulePill(): ReactNode {
  const { mode, setMode } = useDailyScheduleMode();

  return (
    <div className={styles.bar} role="toolbar" aria-label="Daily view mode">
      {/* Eyebrow — quiet section label on the left, matching Weekly's pill bar. */}
      <span className={styles.eyebrow} aria-hidden="true">
        VIEW
      </span>

      {/* Pushes the pill to the right edge of the bar. */}
      <span className={styles.spacer} />

      <ToggleGroup
        options={[
          {
            value: "subject",
            label: "Subject",
            ariaLabel: "Subject lesson list",
          },
          {
            value: "schedule",
            label: "Schedule",
            ariaLabel: "Show schedule rail alongside lesson detail",
          },
        ]}
        value={mode}
        onChange={setMode}
        variant="subtle"
        size="sm"
        ariaLabel="Daily canvas mode"
      />
    </div>
  );
}
