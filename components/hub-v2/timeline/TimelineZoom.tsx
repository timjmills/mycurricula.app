"use client";

// TimelineZoom.tsx — the day-column width control (`ph-units.jsx:494-499`).
//
// The whole canvas's geometry is `calc(var(--tl-col) * n)`, so zoom is one
// custom property. This writes `--tl-col-user`; the stylesheet resolves
//
//     --tl-col: max(var(--tl-col-floor), var(--tl-col-user, var(--tl-col-base)))
//
// which is the ONE thing that keeps a zoom control from breaking the touch
// contract. The handoff's slider bottoms out at `min="16"` px columns
// (`ph-units.jsx:496`) with 14px marks (`ph-units.css:56`) — a third of the
// ≥44px CLAUDE.md §4 requires (audit B8). An inline `--tl-col` would beat both
// the base declaration AND the `any-pointer: coarse` media query that raises
// it, so a teacher on a tablet could zoom their own lesson dots below the size
// their finger can hit and have no way to know why nothing responded.
//
// The floor is not merely enforced — it is REPORTED. The slider reads
// `--tl-col-floor` off the live canvas after mount and uses it as its own
// `min`, so on a coarse pointer the control's travel is the travel it actually
// has. A slider whose bottom third silently does nothing is worse than a
// shorter slider.

import { useEffect, useRef, type ReactNode } from "react";
import { ROOMY_MIN_COL, useColumnMetrics } from "./use-column-metrics";
import styles from "./timeline.module.css";

/** Widest column the slider offers, matching the handoff's `max="130"`
 *  (`ph-units.jsx:496`). It marks no feature threshold — `ROOMY_MIN_COL` (80)
 *  is the one that does. */
const MAX_COL = 130;
/** Fallback shown for one frame if the canvas ref is not resolved yet. */
const FALLBACK_FLOOR = 24;

export interface TimelineZoomProps {
  /** Current column width in px, or null for "the stylesheet's default". */
  value: number | null;
  onChange: (px: number | null) => void;
  /** The canvas root — read for the live `--tl-col-floor` / `--tl-col-base`. */
  canvasRef: React.RefObject<HTMLElement | null>;
}

export function TimelineZoom({
  value,
  onChange,
  canvasRef,
}: TimelineZoomProps): ReactNode {
  // The floor is media-query dependent (`any-pointer: coarse` raises it), and a
  // laptop can gain a coarse pointer mid-session by having a stylus or a touch
  // display woken up. `useColumnMetrics` re-reads on the same media queries the
  // stylesheet uses, so the control never advertises travel the canvas will not
  // honour — and it is the SAME read PlanTimeline resolves `data-zoom` from, so
  // the slider and the canvas cannot disagree about where `roomy` begins.
  const { floor, base } = useColumnMetrics(canvasRef);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // A zoom already set BELOW a newly-raised floor is corrected upward rather
  // than left stranded: the canvas would clamp it anyway, so leaving the slider
  // parked lower would show a position the surface is not at.
  useEffect(() => {
    if (value !== null && value < floor) onChangeRef.current(floor);
  }, [value, floor]);

  const shown = value ?? base ?? FALLBACK_FLOOR;
  const clamped = Math.min(MAX_COL, Math.max(floor, shown));

  return (
    <div className={styles.zoom}>
      <label className={styles.zoomLabel} htmlFor="tl-zoom">
        Zoom
      </label>
      <input
        id="tl-zoom"
        type="range"
        className={styles.zoomRange}
        min={floor}
        max={MAX_COL}
        step={2}
        value={clamped}
        // The accessible name says what it DOES, not what it is — a teacher
        // hearing "Zoom, slider, 34" learns nothing about the surface.
        aria-label="Timeline zoom — how wide each school day is"
        aria-valuetext={`${Math.round(clamped)} pixels per day`}
        // Says what the control ACCOMPLISHES, and only what it actually does.
        //
        // THE TITLE CLAUSE IS BACK, AND IT IS NOW TRUE. This tooltip once ended
        // "Lesson titles appear on the bars once the columns are wide enough"
        // against a canvas where no dot had ever carried text — 0 of 310 at
        // every stop from 16 to 130px, against a positive control of 52 unit
        // labels that did (docs/audits/2026-07-31-qa-plan-timeline.md #3) — so
        // the sentence was removed. The pill it described now exists
        // (`ph-units.jsx:616`, TimelineLaneRow), and the threshold is NAMED
        // rather than left as "wide enough", because a teacher who cannot tell
        // when the promise applies is being sent hunting either way.
        //
        // WHAT IS STILL NOT CLAIMED: that widening makes dots easier to TAP. A
        // dot's target is `--tl-hit` (22px fine / 44px coarse) and is
        // INDEPENDENT of `--tl-col`, so widening a column moves the dots apart
        // without making any of them one pixel bigger.
        title={`Sets how much of the year fits on screen. Narrow to take in more months at once; widen to spread the days out so individual lessons are easier to tell apart — past ${ROOMY_MIN_COL} pixels a day, each lesson shows its title.`}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <button
        type="button"
        className={styles.zoomReset}
        // Disabled rather than hidden: a control that vanishes when it is not
        // needed makes the row reflow every time the slider is touched.
        disabled={value === null}
        title="Return the timeline to its default zoom."
        onClick={() => onChange(null)}
      >
        Reset
      </button>
    </div>
  );
}
