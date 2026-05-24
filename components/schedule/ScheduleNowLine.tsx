// ScheduleNowLine.tsx — the live "you are here" indicator on a Schedule
// column. Recipe (from the artboard at lines 721–736):
//   • 2px horizontal red stripe across the column at the current minute.
//   • 10×10 dot on the left edge with a 3px halo (static — no pulse;
//     reduced-motion needs no special branch).
//   • Small "NOW" pill anchored to the right edge.
// The parent (ScheduleColumn) decides whether to mount this — it only
// renders when the column represents today AND the now-minute is within
// [DAY_START_MIN, DAY_END_MIN].

import type { ReactNode } from "react";
import { minuteToTop } from "@/lib/schedule-data";
import styles from "./ScheduleNowLine.module.css";

export interface ScheduleNowLineProps {
  /** Minute-of-day for the now indicator. Parent has already verified this
   *  falls inside the rendered window. */
  nowMin: number;
}

export function ScheduleNowLine({ nowMin }: ScheduleNowLineProps): ReactNode {
  // Convert minutes → px once at render. The line re-renders on the
  // useNowTick cadence (30s) so this math runs at most twice a minute.
  const top = minuteToTop(nowMin);

  return (
    <div
      className={styles.line}
      style={{ top }}
      role="presentation"
      aria-hidden="true"
    >
      <span className={styles.dot} />
      <span className={styles.pill}>NOW</span>
    </div>
  );
}
