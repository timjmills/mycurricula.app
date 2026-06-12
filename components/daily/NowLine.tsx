"use client";

// NowLine.tsx — the 1px indigo "now" line + time chip for the Daily day
// pane (UX roadmap item 03 — orientation).
//
// Behavior (binding spec, "03 · Orientation"):
//   • A 1px indigo line with a small time chip sits at the current time.
//     Indigo = var(--brand-500) — "the v1.3 functional indigo" (see the
//     precedent comment in WeeklyGrid.module.css); never a hard-coded hex
//     (CLAUDE.md §4).
//   • Position derives from the CONFIGURED schedule via lib/now-anchor's
//     resolveNow — including rotating A/B cycles once a rotation engine
//     supplies a `periodsForDay` (the Phase 1A default reads the
//     getDayBlocks fixture and ignores the date; see lib/now-anchor.ts).
//   • Off-hours, non-school days, and holidays: renders NOTHING — the
//     Today chip alone carries orientation.
//   • On first becoming visible it positions its scrollable CONTAINER so
//     the current period sits in view. Container scroll only — never
//     scrollIntoView, which also scrolls ancestor containers (hard rule).
//   • display: none under @media print (see NowLine.module.css).
//
// Geometry contract: this component positions itself with `minuteToTop()`
// from lib/schedule-data — the SAME constants (PX_PER_MIN, DAY_START_MIN)
// every Schedule timeline surface reads — so it lands correctly inside any
// minute-proportional day body (a DAY_HEIGHT_PX column like
// ScheduleColumn's `.body`). Mount it as a child of a position:relative
// timeline body; it is position:absolute and pointer-events:none.
//
// Tick cadence: useNowTick (30s, cleared on unmount) — sub-pixel motion
// per tick at PX_PER_MIN = 1.4, so nothing animates and reduced motion
// needs no special branch. The interval intentionally keeps running while
// the tab is backgrounded so the line is correct the moment the teacher
// returns (see lib/use-now-tick.ts header). The tick is armed ONLY when
// the hosting column IS today — a week of columns mounts seven NowLines
// but runs exactly one interval (review finding L6).
//
// SSR-safety (review finding M4): the clock is never read during the
// initial render. Today's column index starts as null (server HTML and
// the first client paint both render NOTHING) and the real value lands in
// a post-mount effect — same hydration discipline as WeeklyGrid's
// useTodayColumnIndex. A UTC server and a UTC+3 school browser therefore
// can never disagree at hydration time.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CURRENT_WEEK } from "@/lib/mock";
import { useSchoolWeek } from "@/lib/use-school-week";
import { useNowTick } from "@/lib/use-now-tick";
import { useDayHoliday } from "@/lib/use-day-holiday";
import {
  resolveNow,
  todayColumnIndex,
  type PeriodsForDay,
} from "@/lib/now-anchor";
import { getDayBlocks, minuteToTop, formatNow } from "@/lib/schedule-data";
import styles from "./NowLine.module.css";

/** Phase 1A default — the configured per-day timetable fixture. A Phase 1B
 *  rotation engine replaces this with a date-aware resolver; the component
 *  body never changes. */
const defaultPeriodsForDay: PeriodsForDay = (dayIndex) =>
  getDayBlocks(dayIndex);

export interface NowLineProps {
  /**
   * The day index the hosting pane is SHOWING (0-based into the configured
   * school week). The line only renders when this matches today — a pane
   * showing Tuesday must not draw a now-line on Tuesday's timeline when
   * it is actually Sunday.
   */
  day: number;
  /** Configured-timetable resolver override (rotation cycles plug in
   *  here). Defaults to the Phase 1A getDayBlocks fixture. */
  periodsForDay?: PeriodsForDay;
  /**
   * Position the nearest scrollable ancestor so the line (≈ the current
   * period) sits in the top third of the viewport on first render.
   * Container scroll only — never scrollIntoView. Default true.
   */
  autoScroll?: boolean;
}

/** Walk up from `el` to the nearest vertically scrollable ancestor. */
function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function NowLine({
  day,
  periodsForDay = defaultPeriodsForDay,
  autoScroll = true,
}: NowLineProps): ReactNode {
  const { days: schoolWeekDays } = useSchoolWeek();

  // ── Today resolution — SSR-safe house pattern (finding M4) ──────────────
  // Initial state null → server HTML and first client paint render nothing;
  // the real clock answer lands in this post-mount effect. A 60s re-check
  // migrates the line across midnight; setState with the SAME index bails
  // out of re-rendering, so non-event renders don't happen every minute.
  const [todayIdx, setTodayIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setTodayIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);

  // ── The 30s tick — armed ONLY for today's column (finding L6) ───────────
  // Non-today columns (six of seven on a week surface) freeze the hook and
  // never create an interval. When `enabled` flips true at midnight in a
  // long-running tab, the frozen Date self-heals on the first tick (≤30s);
  // the `anchor.dayIndex === day` gate below keeps a stale Date from ever
  // painting a line on the wrong column in that window.
  const isTodayColumn = todayIdx !== null && todayIdx === day;
  const now = useNowTick({ enabled: isTodayColumn });

  const anchor = isTodayColumn
    ? resolveNow({ now, schoolWeekDays, periodsForDay })
    : null;

  // Holiday suppression — the spec says holidays hide both the line and
  // (elsewhere) the emphasis; the Today chip surfaces the holiday banner
  // instead. Hook order: called unconditionally (before any early return),
  // with a benign day index when today isn't resolved / isn't a school day.
  const holiday = useDayHoliday(CURRENT_WEEK, todayIdx ?? 0);

  const minuteOfDay = anchor?.minuteOfDay ?? null;
  const visible =
    minuteOfDay !== null && // mounted + school day + within school hours
    anchor?.dayIndex === day && // hosting pane is showing today
    holiday === null; // not a holiday

  const top = minuteOfDay !== null ? minuteToTop(minuteOfDay) : 0;

  // ── Scroll-to-now (container scroll ONLY — never scrollIntoView) ────────
  // Runs once per mount, the first time the line is visible: sets the
  // nearest scrollable ancestor's scrollTop so the line lands a third of
  // the way down the container. Direct scrollTop assignment scrolls ONLY
  // that container (no ancestor/page movement) and is instant — no motion,
  // so prefers-reduced-motion needs no branch.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);
  useEffect(() => {
    if (!autoScroll || !visible || didScrollRef.current) return;
    const el = rootRef.current;
    if (!el) return;
    const container = findScrollContainer(el);
    if (!container) return;
    const lineTopInContainer =
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTop = Math.max(
      0,
      lineTopInContainer - container.clientHeight / 3,
    );
    didScrollRef.current = true;
  }, [autoScroll, visible]);

  if (!visible || minuteOfDay === null) return null;

  return (
    <div
      ref={rootRef}
      className={styles.line}
      style={{ top }}
      role="presentation"
      aria-hidden="true"
    >
      <span className={styles.chip}>{formatNow(minuteOfDay)}</span>
    </div>
  );
}
