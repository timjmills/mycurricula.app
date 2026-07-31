"use client";

// use-band-drag.ts — the pointer plumbing for a unit band's week-granularity
// drag. All the ARITHMETIC lives in lib/plan-timeline/drag.ts and is unit
// tested; this file owns only the parts that need a live pointer and a live
// DOM: which band is being dragged, how many pixels a week is right now, and
// when the gesture becomes a drag rather than a click.
//
// ── WHY A COLUMN IS MEASURED, NOT READ ────────────────────────────────────
// `getComputedStyle(el).getPropertyValue("--tl-col")` returns the DECLARED
// value of a custom property, not its used value — and `--tl-col` is declared
// as `max(var(--tl-col-floor), var(--tl-col-user, var(--tl-col-base)))` so the
// touch floor can never be zoomed away (timeline.module.css). `parseFloat` on
// that string is NaN, so anything reading the property would silently fall back
// to a hard-coded 34 and every drag would compute the wrong number of weeks at
// every zoom but one. The track's own rendered width divided by its column
// count is the used value, and it cannot drift from what is on screen.

import { useCallback, useRef, useState } from "react";
import {
  axisWeekCount,
  moveWeekRange,
  resizeWeekRange,
  weekRangeEquals,
  type TimelineBand,
  type WeekRange,
} from "@/lib/plan-timeline";
import type { SubjectId } from "@/lib/types";

/** Pixels of pointer travel before a press is treated as a drag rather than a
 *  click. Below this a band still OPENS its unit — a teacher clicking a bar
 *  with a shaky hand must not re-schedule the unit instead. */
const DRAG_THRESHOLD_PX = 4;

export type BandDragKind = "move" | "resize";

export interface BandDragSession {
  subject: SubjectId;
  unitId: string;
  kind: BandDragKind;
  /** Where the unit was when the gesture started. */
  origin: WeekRange;
  /** Where it would land if the pointer were released now. */
  next: WeekRange;
  /** Has the pointer travelled far enough to be a drag? */
  moved: boolean;
}

export interface UseBandDragInput {
  schoolWeekLen: number;
  axisLength: number;
  /** Commit a finished drag. Called ONLY when the range actually changed. */
  onCommit: (
    subject: SubjectId,
    unitId: string,
    next: WeekRange,
    kind: BandDragKind,
  ) => void;
  /** False in Personal mode — units are TEAM content and the store refuses the
   *  write (planner-store.tsx:3752). No listeners are attached at all, so a
   *  band still behaves as a plain open-the-unit button. */
  enabled: boolean;
}

export interface UseBandDrag {
  session: BandDragSession | null;
  /** Attach to a band's `onPointerDown` (kind "move") or its grip's (kind
   *  "resize"). Returns nothing; a no-op when drag is disabled. */
  begin: (
    e: React.PointerEvent<HTMLElement>,
    subject: SubjectId,
    band: TimelineBand,
    kind: BandDragKind,
  ) => void;
  /** True for one click after a real drag — the band's `onClick` reads it so a
   *  drag never also opens the unit it just moved. */
  consumeClickSuppression: () => boolean;
  /** Keyboard equivalent (CLAUDE.md §4 / audit B6). Commits immediately; there
   *  is no in-flight preview because there is no in-flight state. */
  nudge: (
    subject: SubjectId,
    band: TimelineBand,
    kind: BandDragKind,
    deltaWeeks: number,
  ) => void;
}

export function useBandDrag({
  schoolWeekLen,
  axisLength,
  onCommit,
  enabled,
}: UseBandDragInput): UseBandDrag {
  const [session, setSession] = useState<BandDragSession | null>(null);
  // The live session also lives in a ref: the pointermove/up listeners are
  // attached once per gesture and would otherwise close over the first render's
  // null. Refs, not a re-subscribed effect — a listener that re-attaches on
  // every pointermove drops events between removal and re-addition.
  const sessionRef = useRef<BandDragSession | null>(null);
  const startXRef = useRef(0);
  const weekPxRef = useRef(0);
  const suppressClickRef = useRef(false);

  const maxWeek = axisWeekCount(axisLength, schoolWeekLen);

  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const begin = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      subject: SubjectId,
      band: TimelineBand,
      kind: BandDragKind,
    ) => {
      if (!enabled) return;
      // PRIMARY BUTTON ONLY. A right-click reaching this would start a drag
      // that the context menu then swallows the pointerup for, leaving the
      // session live and the next click re-scheduling a unit.
      if (e.button !== 0) return;
      if (maxWeek < 1 || schoolWeekLen <= 0) return;

      const el = e.currentTarget;
      const track = el.closest<HTMLElement>("[data-tl-track]");
      if (!track) return;
      const columns = Number(track.dataset.tlTrack);
      if (!Number.isFinite(columns) || columns <= 0) return;
      const colPx = track.getBoundingClientRect().width / columns;
      if (!Number.isFinite(colPx) || colPx <= 0) return;

      weekPxRef.current = colPx * schoolWeekLen;
      startXRef.current = e.clientX;

      const started: BandDragSession = {
        subject,
        unitId: band.unitId,
        kind,
        origin: band.weekRange,
        next: band.weekRange,
        moved: false,
      };
      sessionRef.current = started;
      setSession(started);

      // Pointer capture on the element that was pressed, so the gesture
      // survives the pointer leaving the (narrow) band or the (12px) grip —
      // which it does immediately on any drag worth making.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety, not a requirement: the window-level listeners
        // below track the pointer regardless. Swallowed rather than logged
        // because a failed capture has no user-visible consequence.
      }

      const onMove = (ev: PointerEvent): void => {
        const live = sessionRef.current;
        if (!live) return;
        const dx = ev.clientX - startXRef.current;
        const moved = live.moved || Math.abs(dx) > DRAG_THRESHOLD_PX;
        const deltaWeeks = Math.round(dx / weekPxRef.current);
        const next =
          live.kind === "move"
            ? moveWeekRange(live.origin, deltaWeeks, maxWeek)
            : resizeWeekRange(live.origin, deltaWeeks, maxWeek);
        if (moved === live.moved && weekRangeEquals(next, live.next)) return;
        const updated = { ...live, next, moved };
        sessionRef.current = updated;
        setSession(updated);
      };

      const finish = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        const live = sessionRef.current;
        sessionRef.current = null;
        setSession(null);
        if (!live) return;
        // The click that follows a real drag must not ALSO open the unit.
        suppressClickRef.current = live.moved;
        if (live.moved && !weekRangeEquals(live.next, live.origin)) {
          commitRef.current(live.subject, live.unitId, live.next, live.kind);
        }
      };

      const cancel = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        // A CANCELLED gesture commits nothing. `pointercancel` fires when the
        // browser takes the pointer over (a system gesture, a scroll the
        // touch-action rules did allow) — the teacher did not let go, so
        // treating it as a release would re-schedule a unit from an
        // interrupted gesture.
        const live = sessionRef.current;
        sessionRef.current = null;
        setSession(null);
        suppressClickRef.current = live?.moved ?? false;
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
    },
    [enabled, maxWeek, schoolWeekLen],
  );

  const consumeClickSuppression = useCallback((): boolean => {
    const was = suppressClickRef.current;
    suppressClickRef.current = false;
    return was;
  }, []);

  const nudge = useCallback(
    (
      subject: SubjectId,
      band: TimelineBand,
      kind: BandDragKind,
      deltaWeeks: number,
    ) => {
      if (!enabled || maxWeek < 1) return;
      const next =
        kind === "move"
          ? moveWeekRange(band.weekRange, deltaWeeks, maxWeek)
          : resizeWeekRange(band.weekRange, deltaWeeks, maxWeek);
      // Silent no-op at the ends of the year: a keyboard user holding an arrow
      // key against the axis edge must not emit one write, one toast and one
      // undo offer per repeat.
      if (weekRangeEquals(next, band.weekRange)) return;
      commitRef.current(subject, band.unitId, next, kind);
    },
    [enabled, maxWeek],
  );

  return { session, begin, consumeClickSuppression, nudge };
}
