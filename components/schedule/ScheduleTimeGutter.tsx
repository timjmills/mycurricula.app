// ScheduleTimeGutter.tsx — the 44px-wide left axis of the timeline.
//
// Renders HOUR_COUNT labels (8 — 8a → 3p) absolutely-positioned at each
// hour mark. The column reserves DAY_HEIGHT_PX of vertical space so the
// surrounding grid lays out correctly even when this column itself only
// carries floating labels.
//
// Each label is anchored at its minute mark via `translateY(-50%)` so the
// digit's vertical center aligns with the hour gridline drawn inside each
// day column.

import type { ReactNode } from "react";
import {
  DAY_HEIGHT_PX,
  DAY_START_MIN,
  HOUR_COUNT,
  PX_PER_MIN,
} from "@/lib/schedule-data";
import styles from "./ScheduleTimeGutter.module.css";

export function ScheduleTimeGutter(): ReactNode {
  return (
    <div className={styles.gutter} style={{ height: DAY_HEIGHT_PX }}>
      {Array.from({ length: HOUR_COUNT }).map((_, i) => {
        // Each label sits at the i-th hour gridline; DAY_START_MIN is the
        // first label's anchor (8:00 → 0px from the top of the column).
        const minuteFromStart = i * 60;
        const hour = Math.floor((DAY_START_MIN + minuteFromStart) / 60);
        const hour12 = hour > 12 ? hour - 12 : hour;
        const meridiem = hour >= 12 ? "p" : "a";
        return (
          <div
            key={i}
            className={styles.label}
            style={{ top: minuteFromStart * PX_PER_MIN }}
          >
            <span className={styles.hour}>{hour12}</span>
            <span className={styles.meridiem}>{meridiem}</span>
          </div>
        );
      })}
    </div>
  );
}
