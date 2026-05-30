"use client";

// daily-schedule-pill.tsx — the Daily view's Subject ↔ Schedule toggle.
//
// A single Subject ↔ Schedule toggle that controls whether the Daily view
// mounts an additional <ScheduleDayPane day={selectedDay} scope="rail" />
// alongside its existing 4-track layout. Unlike Weekly's toggle, Daily's
// Schedule mode does NOT swap the canvas — it just mounts the schedule rail
// beside everything else. See the comment in DailyView.tsx where it's used.
//
// W5: this used to render as a standalone in-page "VIEW" bar (eyebrow + slim
// row). It now renders as a bare toggle hosted in the Daily PageHeader's
// `actions` slot — mirroring the Weekly view, where the view toggle lives on
// the title row rather than in a separate chrome bar.
//
// State is owned by useDailyScheduleMode() in lib/daily-schedule-state.ts.

import type { ReactNode } from "react";
import { ToggleGroup } from "@/components/ui";
import { useDailyScheduleMode } from "@/lib/daily-schedule-state";

export function DailySchedulePill(): ReactNode {
  const { mode, setMode } = useDailyScheduleMode();

  return (
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
      variant="prominent"
      size="sm"
      ariaLabel="Daily view mode"
    />
  );
}
