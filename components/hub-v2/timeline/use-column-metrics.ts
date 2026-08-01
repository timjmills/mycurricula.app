"use client";

// use-column-metrics.ts — the resolved day-column width, read off the live
// canvas.
//
// ── WHY THIS IS A DOM READ AND NOT A CONSTANT ─────────────────────────────
// The canvas resolves its column as
//
//     --tl-col: max(var(--tl-col-floor), var(--tl-col-user, var(--tl-col-base)))
//
// and BOTH `--tl-col-floor` and `--tl-col-base` move under
// `@media (any-pointer: coarse), (max-width: 900px)` (timeline.module.css).
// So the width a teacher is actually looking at is not derivable from the zoom
// state alone — 34 on a laptop and 46 on the same page on a tablet, with the
// same `null` zoom.
//
// ── AND WHY IT READS THE TWO INPUTS RATHER THAN `--tl-col` ITSELF ─────────
// `getComputedStyle(el).getPropertyValue("--tl-col")` does NOT return "34px".
// An unregistered custom property computes to its substituted TOKEN STREAM, so
// what comes back is the literal string `max(24px, 34px)` — a `parseFloat` of
// it yields NaN, or worse, silently reads the floor and calls it the width.
// `--tl-col-floor` and `--tl-col-base` are plain lengths and do come back as
// "24px", which is why the resolution is redone here in JS instead. (The other
// way out is `@property { syntax: "<length>" }`, which is not scoped to a CSS
// module and would put a generic `--tl-col` in the global registry.)
//
// This is the same read TimelineZoom needs for its slider `min`, so both
// consume it here rather than keeping two copies of the media-query list that
// could drift apart.

import { useEffect, useState } from "react";

/** Fallback for the first paint, before the computed values are read. The
 *  stylesheet is the authority; these only have to be non-absurd for one
 *  frame, and they match the fine-pointer declarations. */
const FALLBACK_FLOOR = 24;
const FALLBACK_BASE = 34;

export interface ColumnMetrics {
  /** `--tl-col-floor` — the touch-target contract's minimum. */
  floor: number;
  /** `--tl-col-base` — the width with no zoom set, or null before the first
   *  read resolves (which is what tells TimelineZoom not to guess). */
  base: number | null;
  /** Has the post-mount read happened? False during SSR and the first paint,
   *  so a consumer can withhold a zoom-dependent attribute rather than emit a
   *  server value the client immediately contradicts. */
  ready: boolean;
}

/**
 * Read `--tl-col-floor` / `--tl-col-base` off `ref`, and re-read whenever one
 * of the stylesheet's own media queries flips. A laptop can gain a coarse
 * pointer mid-session by having a stylus or a touch display woken up.
 */
export function useColumnMetrics(
  ref: React.RefObject<HTMLElement | null>,
): ColumnMetrics {
  const [metrics, setMetrics] = useState<ColumnMetrics>({
    floor: FALLBACK_FLOOR,
    base: null,
    ready: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const cs = getComputedStyle(el);
      const f = parseFloat(cs.getPropertyValue("--tl-col-floor"));
      const b = parseFloat(cs.getPropertyValue("--tl-col-base"));
      setMetrics({
        floor: Number.isFinite(f) && f > 0 ? f : FALLBACK_FLOOR,
        base: Number.isFinite(b) && b > 0 ? b : null,
        ready: true,
      });
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
  }, [ref]);

  return metrics;
}

/**
 * The width one day column actually renders at — the same `max()` the
 * stylesheet performs, redone here because the resolved custom property cannot
 * be read back (see the header).
 */
export function resolvedColumnWidth(
  zoom: number | null,
  metrics: ColumnMetrics,
): number {
  return Math.max(metrics.floor, zoom ?? metrics.base ?? FALLBACK_BASE);
}

/**
 * The handoff's three named zoom stops (`ph-units.jsx:314`):
 *
 *     colw>=80 ? 'roomy' : colw>=30 ? 'cozy' : 'compact'
 *
 * `roomy` is the threshold at which a lesson dot becomes a titled pill
 * (`ph-units.jsx:616`, `ph-v2.css:1644-1653`). The other two name nothing the
 * stylesheet keys off today, and are kept only because the three are one scale
 * — a `data-zoom` that could report `roomy` but never `compact` would be a
 * half-truth for any probe reading it.
 */
export type ZoomName = "compact" | "cozy" | "roomy";

/** `ph-units.jsx:314`. */
export const ROOMY_MIN_COL = 80;
const COZY_MIN_COL = 30;

export function zoomNameFor(columnWidth: number): ZoomName {
  if (columnWidth >= ROOMY_MIN_COL) return "roomy";
  if (columnWidth >= COZY_MIN_COL) return "cozy";
  return "compact";
}
