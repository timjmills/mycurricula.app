// schedule-data.ts — the per-day-of-week schedule fixture, helpers, and
// constants shared by every Schedule surface (the /schedule route, the
// in-Weekly schedule mode, and the in-Daily schedule mode).
//
// In production a teacher's TimeBlock skeleton is fetched per-teacher ×
// grade × week-cycle and the events that fill the slots come from a
// CoreLessonEvent + ExtraLessonEvent + DayEvent query. While the backend
// isn't wired we hand-author a realistic Sun–Thu week from the existing
// mock SCHEDULE (Monday) extended with per-day variations: Tue swaps in
// PE + Music, Wed adds a Class Meeting, Thu has an early dismissal.
//
// Constants exposed here are the contract every Schedule component reads
// from — change PX_PER_MIN or DAY_START_MIN in one place and the whole
// timeline reflows.

import type { SubjectId } from "@/lib/types";

// ── Geometry constants ───────────────────────────────────────────────────

/** Pixels per minute on the timeline. 1.4 mirrors the artboard scaling:
 *  a 60-minute block is 84px tall, comfortable for a title + label line
 *  plus the time-range footer on blocks ≥50 minutes. */
export const PX_PER_MIN = 1.4;

/** Earliest minute-of-day the timeline renders. 8:00 = 480 minutes. */
export const DAY_START_MIN = 8 * 60;

/** Latest minute-of-day. 15:30 = 930 minutes. */
export const DAY_END_MIN = 15 * 60 + 30;

/** Total minutes shown in one day column. */
export const DAY_TOTAL_MIN = DAY_END_MIN - DAY_START_MIN;

/** Total px height of one day column. */
export const DAY_HEIGHT_PX = DAY_TOTAL_MIN * PX_PER_MIN;

/** Number of hour-row gridlines drawn (8 → 16 inclusive). */
export const HOUR_COUNT = Math.ceil(DAY_TOTAL_MIN / 60) + 1;

// ── Day-of-week index → ScheduleBlock[] ─────────────────────────────────

/** Parse "HH:MM" → minutes from midnight. Defensive on the leading zero
 *  the mock fixture uses. */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  return h * 60 + m;
}

/** Build a ScheduleBlock with minute-of-day cached, so the rendering pass
 *  doesn't re-parse the string on every frame. */
interface TimelineBlock {
  /** Stable id for React keys / future drag-and-drop. */
  id: string;
  type: "academic" | "non_academic";
  /** Minute-of-day, e.g. 480 for 08:00. */
  startMin: number;
  endMin: number;
  /** Original 24h "HH:MM" labels (for tooltips / aria). */
  startLabel: string;
  endLabel: string;
  subject?: SubjectId;
  /** Label for non-academic blocks. Subject blocks render the subject name
   *  as the primary heading; label (if any) becomes the secondary line. */
  label?: string;
  /** Linked lesson id when an academic block has a scheduled lesson. */
  lesson?: string | null;
}

function block(
  id: string,
  type: "academic" | "non_academic",
  start: string,
  end: string,
  fields: { subject?: SubjectId; label?: string; lesson?: string | null } = {},
): TimelineBlock {
  return {
    id,
    type,
    startMin: toMin(start),
    endMin: toMin(end),
    startLabel: start,
    endLabel: end,
    ...fields,
  };
}

/** Five-day fixture. Indexed by day-of-week (0=Sun..4=Thu) to match
 *  Lesson.day. Subject + label fields lift directly into the rendered
 *  block; cross-reference the mock LESSONS for an actual title. */
const SCHEDULE_BY_DAY: Record<number, TimelineBlock[]> = {
  // ── SUNDAY ─────────────────────────────────────────────────────────────
  0: [
    block("sun-1", "academic", "08:00", "09:00", {
      subject: "math",
      lesson: "m-12-0",
    }),
    block("sun-2", "academic", "09:00", "09:50", {
      subject: "reading",
      lesson: "r-12-0",
    }),
    block("sun-3", "non_academic", "09:50", "10:20", {
      label: "Snack & recess",
    }),
    block("sun-4", "academic", "10:20", "11:10", {
      subject: "writing",
      lesson: "w-12-0",
    }),
    block("sun-5", "non_academic", "11:10", "11:40", {
      label: "Arabic (specialist)",
    }),
    block("sun-6", "non_academic", "11:40", "12:20", { label: "Lunch" }),
    block("sun-7", "academic", "12:20", "13:10", {
      subject: "grammar",
      lesson: null,
    }),
    block("sun-8", "academic", "13:10", "13:40", {
      subject: "spelling",
      lesson: null,
    }),
    block("sun-9", "non_academic", "13:40", "14:10", {
      label: "PE (specialist)",
    }),
    block("sun-10", "academic", "14:10", "14:50", {
      subject: "explorers",
      lesson: "e-12-0",
    }),
    block("sun-11", "non_academic", "14:50", "15:10", {
      label: "Pack-up & dismissal",
    }),
  ],
  // ── MONDAY ─────────────────────────────────────────────────────────────
  1: [
    block("mon-1", "academic", "08:00", "09:00", {
      subject: "math",
      lesson: "m-12-1",
    }),
    block("mon-2", "academic", "09:00", "09:50", {
      subject: "reading",
      lesson: "r-12-1",
    }),
    block("mon-3", "non_academic", "09:50", "10:20", {
      label: "Snack & recess",
    }),
    block("mon-4", "academic", "10:20", "11:10", {
      subject: "writing",
      lesson: "w-12-1",
    }),
    block("mon-5", "non_academic", "11:10", "11:40", {
      label: "Specials — Art (Ms. Chen)",
    }),
    block("mon-6", "non_academic", "11:40", "12:20", { label: "Lunch" }),
    block("mon-7", "academic", "12:20", "13:10", {
      subject: "grammar",
      lesson: null,
    }),
    block("mon-8", "academic", "13:10", "13:40", {
      subject: "ufli",
      lesson: "uf-12-1",
    }),
    block("mon-9", "non_academic", "13:40", "14:10", {
      label: "PE (specialist)",
    }),
    block("mon-10", "academic", "14:10", "14:50", {
      subject: "explorers",
      lesson: null,
    }),
    block("mon-11", "non_academic", "14:50", "15:10", {
      label: "Pack-up & dismissal",
    }),
  ],
  // ── TUESDAY ────────────────────────────────────────────────────────────
  2: [
    block("tue-1", "academic", "08:00", "09:00", {
      subject: "math",
      lesson: null,
    }),
    block("tue-2", "academic", "09:00", "09:50", {
      subject: "reading",
      lesson: null,
    }),
    block("tue-3", "non_academic", "09:50", "10:20", {
      label: "Snack & recess",
    }),
    block("tue-4", "academic", "10:20", "11:20", {
      subject: "writing",
      lesson: null,
    }),
    block("tue-5", "non_academic", "11:20", "11:40", {
      label: "Morning meeting",
    }),
    block("tue-6", "non_academic", "11:40", "12:20", { label: "Lunch" }),
    block("tue-7", "academic", "12:20", "13:00", {
      subject: "sel",
      lesson: null,
    }),
    block("tue-8", "academic", "13:00", "13:50", {
      subject: "grammar",
      lesson: null,
    }),
    block("tue-9", "non_academic", "13:50", "14:15", {
      label: "Music ensemble",
    }),
    block("tue-10", "academic", "14:15", "15:05", {
      subject: "explorers",
      lesson: null,
    }),
  ],
  // ── WEDNESDAY ──────────────────────────────────────────────────────────
  3: [
    block("wed-1", "academic", "08:00", "09:00", {
      subject: "math",
      lesson: null,
    }),
    block("wed-2", "academic", "09:00", "09:50", {
      subject: "reading",
      lesson: null,
    }),
    block("wed-3", "non_academic", "09:50", "10:20", {
      label: "Snack & recess",
    }),
    block("wed-4", "academic", "10:20", "11:10", {
      subject: "writing",
      lesson: null,
    }),
    block("wed-5", "non_academic", "11:10", "11:40", { label: "Library" }),
    block("wed-6", "non_academic", "11:40", "12:20", { label: "Lunch" }),
    block("wed-7", "academic", "12:20", "13:15", {
      subject: "explorers",
      lesson: null,
    }),
    block("wed-8", "academic", "13:15", "14:00", {
      subject: "spelling",
      lesson: null,
    }),
    block("wed-9", "non_academic", "14:00", "14:25", {
      label: "Class meeting",
    }),
    block("wed-10", "non_academic", "14:25", "15:05", {
      label: "Pack-up & dismissal",
    }),
  ],
  // ── THURSDAY ───────────────────────────────────────────────────────────
  4: [
    block("thu-1", "academic", "08:00", "09:00", {
      subject: "math",
      lesson: null,
    }),
    block("thu-2", "academic", "09:00", "10:10", {
      subject: "reading",
      lesson: null,
      label: "Unit 3 assessment",
    }),
    block("thu-3", "non_academic", "10:10", "10:40", {
      label: "Snack & recess",
    }),
    block("thu-4", "academic", "10:40", "11:20", {
      subject: "writing",
      lesson: null,
    }),
    block("thu-5", "non_academic", "11:30", "12:30", {
      label: "Early dismissal — PD",
    }),
  ],
};

// ── Public API ───────────────────────────────────────────────────────────

/** Return a frozen snapshot of one day's blocks. The fixture rarely
 *  mutates; callers pass the result straight into a render. */
export function getDayBlocks(day: number): readonly TimelineBlock[] {
  return SCHEDULE_BY_DAY[day] ?? [];
}

/**
 * Return blocks for every day of the school week, ordered by day index.
 *
 * `dayCount` is REQUIRED rather than defaulted: it used to be the literal
 * `[0, 1, 2, 3, 4]`, a hard-coded 5-day week (CLAUDE.md §1 forbids that), and a
 * default of 5 would preserve exactly the landmine — the next caller would
 * inherit the beta school's week without being asked. Pass
 * `useSchoolWeek().days.length` (or `useOrderedWeekdays().length`).
 *
 * Currently unused; the schedule surfaces render per-column via
 * `getDayBlocks`. Kept because it is the natural shape for a whole-week
 * export/print pass.
 */
export function getWeekBlocks(
  dayCount: number,
): ReadonlyArray<readonly TimelineBlock[]> {
  return Array.from({ length: Math.max(dayCount, 0) }, (_, d) =>
    getDayBlocks(d),
  );
}

/** Re-export the row shape for consumers. */
export type { TimelineBlock };

// ── Time helpers ─────────────────────────────────────────────────────────

/** Minute-of-day for the supplied Date. Used by the live now-line tick. */
export function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Convert minute-of-day to pixels-from-day-start. Clamped to [0, DAY_HEIGHT_PX]. */
export function minuteToTop(min: number): number {
  return Math.max(
    0,
    Math.min(DAY_HEIGHT_PX, (min - DAY_START_MIN) * PX_PER_MIN),
  );
}

/** True when the supplied minute-of-day falls inside the rendered window. */
export function isMinuteWithinDay(min: number): boolean {
  return min >= DAY_START_MIN && min <= DAY_END_MIN;
}

/** Format a minute-of-day as "h:mm" (12h, no leading zero on the hour). */
export function formatBlockTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")}`;
}

/** Format a minute-of-day as "h:mm AM/PM" — used by the page-header pill
 *  ("Now · 10:32 AM") and ARIA labels. */
export function formatNow(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ── Today resolution ─────────────────────────────────────────────────────

/**
 * MOCK "today" — a frozen constant, NOT a clock read.
 *
 * It returns 1 (Monday) unconditionally so the fixture's now-line and today
 * border land on the most-developed sample day. It has never consulted the
 * date, and it cannot consult the configured school week, so on a Mon–Fri
 * school it points at Tuesday and on a 3-day Mon/Wed/Fri week at Wednesday.
 *
 * The real answer is `todayColumnIndex(now, schoolWeekDays)` in
 * lib/now-anchor.ts — a pure resolution of the injected clock against the
 * CONFIGURED school week, returning null when today is not a school day. Every
 * live surface now uses it (the schedule route, the schedule drawer, the
 * timeline, the weekly grid, the daily view, the chrome clock).
 *
 * The single remaining caller is `lib/home/today.ts`, the v1 /home fixture
 * module, whose whole purpose is to be deterministic — converting it is the
 * separate "/home reads a mock helper" ticket, not a rename.
 *
 * @deprecated Mock fixture. New code must call `todayColumnIndex` from
 * lib/now-anchor.ts.
 */
export function mockTodayDayIndex(): number {
  return 1; // Monday
}

/** Mock "now" minute-of-day — 10:32 AM, matching the artboard. Production
 *  uses `minuteOfDay(new Date())`. */
export function nowMinuteMock(): number {
  return 10 * 60 + 32;
}
