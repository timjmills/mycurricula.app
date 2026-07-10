// week-edit-periods.ts — pure derivation + parsing for the W3.8c period-aligned
// Week EDIT board (components/weekly/WeekEditBoard.tsx).
//
// The store has NO period / startMin field on a Lesson — only `day`, `week`,
// `subject`, and an OPTIONAL freeform display label `time?` (e.g. "8:10–9:10";
// the subject fallback comes from lessonTime() in lib/mock/schedule). Periods
// are therefore DERIVED from the per-day schedule fixture (lib/schedule-data),
// and a lesson is ASSIGNED to a period by matching its effective time label
// (or, failing that, its subject's academic block that day). None of this
// mutates the store — the board reads the derivation every render.
//
// Everything here is pure (no React, no DOM), so the unit tests in
// tests/week-edit-periods.test.ts can exercise the parsing + assignment +
// retime math directly.

import {
  getDayBlocks,
  formatBlockTime,
  type TimelineBlock,
} from "@/lib/schedule-data";
import { lessonTime } from "@/lib/mock/schedule";
import type { SubjectId } from "@/lib/types";

/** The sentinel row key for lessons that could not be placed in any derived
 *  period. The board renders an explicit "Unscheduled" overflow row for these
 *  rather than silently dropping them (the mockup's `arr.filter` VANISHED such
 *  lessons — we do not port that bug). */
export const UNSCHEDULED = "unscheduled";

/** One derived period row — a time band shared across the visible school days.
 *  `label` is the formatted start time (h:mm, 12h, no am/pm) to match the
 *  repo's existing time-label convention (schedule-data.formatBlockTime). */
export interface WeekPeriod {
  /** Stable row key (`p-<startMin>`), used in droppable ids + React keys. */
  key: string;
  startMin: number;
  endMin: number;
  /** Formatted start time, e.g. "8:00". */
  label: string;
}

/** The minimal lesson shape the period helpers need — kept structural so the
 *  pure functions never depend on the full Lesson model (and stay trivially
 *  testable). */
export interface PeriodLesson {
  subject: SubjectId;
  time?: string;
}

// ── 1. Period derivation ────────────────────────────────────────────────────

/** Starts within this many minutes of a cluster's first start merge into ONE
 *  period row. Real timetables stagger the "same" period across days (the
 *  fixture's block-4 starts 13:00 / 13:10 / 13:15 by day); without clustering
 *  each stagger minted its own sparse row and the board read as mostly holes
 *  (user pointer-pass feedback, 7.10.26 — the design mock has ~6 shared
 *  periods, not one row per distinct minute). */
const CLUSTER_TOLERANCE_MIN = 30;

/**
 * Derive the shared period rows for a set of school days. Collects every
 * ACADEMIC block across `dayIndices`, then sweep-clusters the sorted start
 * minutes: a start within CLUSTER_TOLERANCE_MIN of the current cluster's
 * FIRST start joins that cluster (row start = earliest member, row end =
 * latest member end). This folds cross-day staggers of the same period into
 * one row, so day columns fill flush like the design mock instead of
 * scattering across near-duplicate rows. Non-academic blocks (recess, lunch,
 * specials) never form a period — the board plans academic lessons only.
 */
export function deriveWeekPeriods(dayIndices: number[]): WeekPeriod[] {
  const starts = new Map<number, number>(); // startMin -> max endMin
  for (const day of dayIndices) {
    for (const block of getDayBlocks(day)) {
      if (block.type !== "academic") continue;
      const end = starts.get(block.startMin);
      if (end === undefined || block.endMin > end) {
        starts.set(block.startMin, block.endMin);
      }
    }
  }

  const sorted = [...starts.entries()].sort((a, b) => a[0] - b[0]);
  const clusters: Array<{ startMin: number; endMin: number }> = [];
  for (const [startMin, endMin] of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && startMin - current.startMin <= CLUSTER_TOLERANCE_MIN) {
      current.endMin = Math.max(current.endMin, endMin);
    } else {
      clusters.push({ startMin, endMin });
    }
  }

  return clusters.map((p) => ({
    key: `p-${p.startMin}`,
    startMin: p.startMin,
    endMin: p.endMin,
    label: formatBlockTime(p.startMin),
  }));
}

/**
 * Resolve a clustered period row to the DESTINATION DAY's actual timing: the
 * day's academic block whose start falls inside the cluster band
 * [startMin, startMin + CLUSTER_TOLERANCE_MIN]. A cluster key identifies a
 * visual row shared across days, not a valid per-day start — dropping onto
 * the "1:00" row must write Sunday's real 13:10 when that is where Sunday's
 * block in the band begins (Codex gate on the clustering batch). Falls back
 * to the cluster's own timing when the day has no block in the band.
 */
export function periodForDay(
  period: WeekPeriod,
  dayBlocks: readonly TimelineBlock[],
): WeekPeriod {
  const block = dayBlocks.find(
    (b) =>
      b.type === "academic" &&
      b.startMin >= period.startMin &&
      b.startMin - period.startMin <= CLUSTER_TOLERANCE_MIN,
  );
  if (block === undefined) return period;
  return {
    key: period.key,
    startMin: block.startMin,
    endMin: block.endMin,
    label: formatBlockTime(block.startMin),
  };
}

// ── 2. Time-label parsing ───────────────────────────────────────────────────

/**
 * Parse one "H:MM" clock token to minute-of-day. The school-day heuristic:
 * an hour < 7 is read as PM (+12), so "1:10" → 13:10 (the labels carry no
 * am/pm markers, and the school day runs 8:00–15:30 — see DAY_START_MIN /
 * DAY_END_MIN in schedule-data). Returns null on anything that isn't a bare
 * clock token.
 */
function parseClockToken(token: string): number | null {
  const m = token.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m === null) return null;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  // Hours 1–6 are afternoon periods (no am/pm marker on these labels).
  if (hours < 7) hours += 12;
  return hours * 60 + mins;
}

/**
 * Parse a "8:10–9:10"-style range label to start/end minutes. Lenient on the
 * separator (en-dash, em-dash, or hyphen). Returns null when either side is
 * not a bare clock token (garbage, am/pm markers, a single time, empty).
 */
export function parseTimeLabel(
  label: string,
): { startMin: number; endMin: number } | null {
  if (!label) return null;
  const parts = label.split(/[–—-]/);
  if (parts.length < 2) return null;
  const startMin = parseClockToken(parts[0]);
  const endMin = parseClockToken(parts[1]);
  if (startMin === null || endMin === null) return null;
  return { startMin, endMin };
}

// ── 3. Lesson → period assignment ───────────────────────────────────────────

/** Return the key of the period whose START is nearest to `startMin` (ties go
 *  to the earlier period — `periods` is start-sorted and the loop keeps the
 *  first best). `periods` must be non-empty.
 *
 *  Deliberately NEAREST-START, never "containing": the widest-end derivation
 *  rule above produces OVERLAPPING bands on real schedules (e.g. 12:20–13:15
 *  overlapping 13:10–13:40), and a containing-first lookup lets an earlier
 *  stretched band shadow a later row — making that row unreachable and a drop
 *  onto it silently re-resolve elsewhere (one phantom undo step + DB write,
 *  zero visible movement). Nearest-start makes every derived row reachable and
 *  a re-timed drop idempotent by construction: retimeLabel starts the lesson
 *  at exactly the target period's startMin, and rows are keyed by distinct
 *  startMin, so the re-resolve distance to the dropped-on row is always 0.
 *  (W3.8c adversarial-review HIGH.) */
function nearestPeriodKey(periods: WeekPeriod[], startMin: number): string {
  let best = periods[0];
  let bestDist = Math.abs(startMin - best.startMin);
  for (const p of periods) {
    const dist = Math.abs(startMin - p.startMin);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best.key;
}

/**
 * Resolve which period row a lesson belongs to on a given day, in precedence:
 *   (a) its effective time label (lesson.time ?? subject fallback) parses →
 *       the period whose start is nearest that start minute;
 *   (b) else its subject matches an academic block that day → that block's
 *       period;
 *   (c) else UNSCHEDULED.
 * `dayBlocks` is the target day's schedule (getDayBlocks(day)).
 */
export function assignLessonPeriod(
  lesson: PeriodLesson,
  periods: WeekPeriod[],
  dayBlocks: readonly TimelineBlock[],
): string {
  if (periods.length === 0) return UNSCHEDULED;

  // (a) effective time label
  const parsed = parseTimeLabel(lessonTime(lesson));
  if (parsed !== null) return nearestPeriodKey(periods, parsed.startMin);

  // (b) subject's academic block that day
  const block = dayBlocks.find(
    (b) => b.type === "academic" && b.subject === lesson.subject,
  );
  if (block !== undefined) return nearestPeriodKey(periods, block.startMin);

  // (c) unplaceable
  return UNSCHEDULED;
}

// ── 4. Re-time on cross-period drop ─────────────────────────────────────────

/** Floor a lesson block never runs shorter than this, so a re-timed lesson
 *  keeps a usable duration even if the source label was degenerate. */
const MIN_DURATION_MIN = 30;
/** Last-resort duration when nothing else resolves one. */
const DEFAULT_DURATION_MIN = 45;

/**
 * Compute the new time label for a lesson dropped into `targetPeriod` (a
 * cross-period move re-times the lesson). The duration is preserved from the
 * lesson's current label, else its subject fallback label, else the target
 * period's own length, else a 45-minute default — and never shorter than 30
 * minutes. The new label starts at the period's start minute and is formatted
 * EXACTLY like lessonTime()/SUBJECT_TIME ("8:10–9:10", en-dash, 12h, no am/pm).
 */
export function retimeLabel(
  currentLabel: string | undefined,
  targetPeriod: WeekPeriod,
  subjectFallbackLabel: string | undefined,
): string {
  const fromCurrent = currentLabel ? parseTimeLabel(currentLabel) : null;
  const fromFallback = subjectFallbackLabel
    ? parseTimeLabel(subjectFallbackLabel)
    : null;

  let duration: number;
  if (fromCurrent !== null) {
    duration = fromCurrent.endMin - fromCurrent.startMin;
  } else if (fromFallback !== null) {
    duration = fromFallback.endMin - fromFallback.startMin;
  } else {
    const periodLen = targetPeriod.endMin - targetPeriod.startMin;
    duration = periodLen > 0 ? periodLen : DEFAULT_DURATION_MIN;
  }
  duration = Math.max(duration, MIN_DURATION_MIN);

  const start = targetPeriod.startMin;
  const end = start + duration;
  return `${formatBlockTime(start)}–${formatBlockTime(end)}`;
}
