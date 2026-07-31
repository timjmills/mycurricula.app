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

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./timeline.module.css";

/** Widest column the slider offers, matching the handoff's `max="130"`
 *  (`ph-units.jsx:496`) — the width at which a dot can carry its lesson title. */
const MAX_COL = 130;
/** Fallback floor for the first paint, before the computed value is read. The
 *  stylesheet is the authority; this only has to be non-absurd for one frame. */
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
  const [floor, setFloor] = useState(FALLBACK_FLOOR);
  const [base, setBase] = useState<number | null>(null);
  // The floor is media-query dependent (`any-pointer: coarse` raises it), and a
  // laptop can gain a coarse pointer mid-session by having a stylus or a touch
  // display woken up. Re-read on the same media queries the stylesheet uses so
  // the control never advertises travel the canvas will not honour.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const read = (): void => {
      const cs = getComputedStyle(el);
      const f = parseFloat(cs.getPropertyValue("--tl-col-floor"));
      const b = parseFloat(cs.getPropertyValue("--tl-col-base"));
      const nextFloor = Number.isFinite(f) && f > 0 ? f : FALLBACK_FLOOR;
      setFloor(nextFloor);
      setBase(Number.isFinite(b) && b > 0 ? b : null);
    };
    read();
    const mqs = [
      window.matchMedia("(any-pointer: coarse)"),
      window.matchMedia("(max-width: 900px)"),
      window.matchMedia("(max-width: 560px)"),
    ];
    for (const mq of mqs) mq.addEventListener("change", read);
    return () => {
      for (const mq of mqs) mq.removeEventListener("change", read);
    };
  }, [canvasRef]);

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
        title="Widen or narrow each day column. Lesson titles appear on the bars once the columns are wide enough."
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
