// TimerWidget — a STATIC visual timer (ring + digits), display-only in v1
// (docs/teach-view-plan.md §4.5). No live countdown — the interactive timer is
// the Phase 3 widget library. Renders `config.seconds` (or a default) as the
// frozen remaining time and fills the ring proportionally. Pause/reset are
// inert affordances (the live controls arrive with the interactive library).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./widgets.module.css";

const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** mm:ss formatting for the frozen display. */
function format(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function readSeconds(config: Record<string, unknown>): {
  remaining: number;
  total: number;
} {
  const total =
    typeof config.durationSeconds === "number" && config.durationSeconds > 0
      ? config.durationSeconds
      : 600; // 10:00 default
  const remaining =
    typeof config.remainingSeconds === "number" &&
    config.remainingSeconds >= 0 &&
    config.remainingSeconds <= total
      ? config.remainingSeconds
      : Math.round(total * 0.82); // matches the prototype's ~08:14 of 10:00
  return { remaining, total };
}

export function TimerWidget({ widget }: WidgetBodyProps): ReactNode {
  const { remaining, total } = readSeconds(widget.config);
  // Fraction elapsed → how much of the ring is "spent".
  const spent = total > 0 ? 1 - remaining / total : 0;
  const dashOffset = CIRCUMFERENCE * spent;

  return (
    <div className={styles.timer}>
      <div className={styles.timerDigits}>{format(remaining)}</div>
      <svg
        className={styles.timerRing}
        width="70"
        height="70"
        viewBox="0 0 70 70"
        aria-hidden="true"
      >
        <circle
          cx="35"
          cy="35"
          r={RADIUS}
          fill="none"
          stroke="var(--ink-100)"
          strokeWidth="7"
        />
        <circle
          cx="35"
          cy="35"
          r={RADIUS}
          fill="none"
          stroke="var(--writing)"
          strokeWidth="7"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 35 35)"
        />
      </svg>
      <div className={styles.timerControls} aria-hidden="true">
        <span className={styles.roundBtn}>
          <TeachIcon name="pause" size={13} />
        </span>
        <span className={styles.roundBtn}>
          <TeachIcon name="rotate" size={13} />
        </span>
      </div>
    </div>
  );
}
