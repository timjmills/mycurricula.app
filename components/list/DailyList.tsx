"use client";

// DailyList.tsx — the Daily view's List-mode panel.
//
// Renders a single-column vertical list of all lessons planned for the
// currently selected day (useAppState().selectedDay). Shows:
//   • Header: "DAILY PLAN · LIST VIEW" eyebrow, the day title derived from
//     WEEK_DAYS + dateNumberForWeekDay, and a live stat subtitle
//     ("{X} lessons planned · {N} done").
//   • Body: one <ListRow> per lesson, sorted by time slot earliest-first.
//     Lessons without a time fall back to the configured schedule order
//     (SCHEDULE from lib/mock/schedule). Ties keep insertion order.
//   • Empty-day state: centered SVG illustration + heading + CTA button that
//     opens the AddLessonForm exactly the way DailyView's list column does.
//
// Per the task brief: the right rail stays visible (DailyView mounts it); this
// component only replaces the list + detail columns in the body. It does not
// render the icon rail or right rail.
//
// Sort logic:
//   1. Parse lesson.time as "HH:MM-HH:MM"; compare start minutes.
//   2. Lessons with no time fall back to the SUBJECT schedule order — the
//      position of the lesson's subject in the SCHEDULE array.
//   3. Ties (and all equal positions) keep insertion (store) order.
//
// Empty-day CTA:
//   The "add a lesson" button calls the `onOpenAddLesson` callback from
//   DailyView, which owns the form's open state — same mechanism used by the
//   "+" button in the list column's label row.

import { useMemo } from "react";
import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { WEEK_DAYS, SCHEDULE, dateForWeekDay } from "@/lib/mock";
import { ListRow } from "@/components/list/ListRow";
import { Tooltip } from "@/components/ui";
import styles from "./DailyList.module.css";

// ── Time-sort helpers ────────────────────────────────────────────────────────

/** Parse "HH:MM-HH:MM" → start minute-of-day, or Infinity if unparseable. */
function parseStartMinutes(time: string | undefined): number {
  if (!time) return Infinity;
  const part = time.split("-")[0]?.trim() ?? "";
  const [hStr, mStr] = part.split(":");
  const h = parseInt(hStr ?? "", 10);
  const m = parseInt(mStr ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Infinity;
  return h * 60 + m;
}

/** The schedule position of a subject — used as the tiebreak when a lesson
 *  has no time. Returns the index of the first academic block whose subject
 *  matches, or Infinity if not found. Lower = earlier in the day. */
function schedulePositionFor(lesson: Lesson): number {
  const idx = SCHEDULE.findIndex(
    (block) => block.type === "academic" && block.subject === lesson.subject,
  );
  return idx === -1 ? Infinity : idx;
}

/** Sort lessons for the day: by time start minute, with schedule-order as the
 *  tiebreak for timeless lessons. Stable sort: ties keep insertion order. */
function sortByTime(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => {
    const aMin = parseStartMinutes(a.time);
    const bMin = parseStartMinutes(b.time);
    if (aMin !== bMin) return aMin - bMin;
    // Both have no time (Infinity) → fall back to schedule position
    return schedulePositionFor(a) - schedulePositionFor(b);
  });
}

// ── Day-title helper ─────────────────────────────────────────────────────────
// Produces "Sunday · Jan 18" from the week + day index.
// Month is the abbreviated English name; matches the design screenshot.

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatDayTitle(week: number, dayIndex: number): string {
  const dayName = WEEK_DAYS[dayIndex] ?? "Day";
  const date = dateForWeekDay(week, dayIndex);
  const month = MONTH_LABELS[date.getMonth()];
  const dateNum = date.getDate();
  return `${dayName} · ${month} ${dateNum}`;
}

// ── Empty-day illustration ───────────────────────────────────────────────────
// A simple SVG composed entirely of token-colored shapes — no external assets.

function EmptyDayIllustration(): ReactNode {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={styles.emptyIllustration}
    >
      {/* Calendar base */}
      <rect
        x="8"
        y="14"
        width="48"
        height="42"
        rx="6"
        fill="var(--ink-100)"
        stroke="var(--ink-200)"
        strokeWidth="1.5"
      />
      {/* Header band */}
      <rect x="8" y="14" width="48" height="12" rx="6" fill="var(--ink-200)" />
      <rect x="8" y="20" width="48" height="6" fill="var(--ink-200)" />
      {/* Binding rings */}
      <rect
        x="20"
        y="10"
        width="6"
        height="9"
        rx="3"
        fill="var(--paper)"
        stroke="var(--ink-300)"
        strokeWidth="1.5"
      />
      <rect
        x="38"
        y="10"
        width="6"
        height="9"
        rx="3"
        fill="var(--paper)"
        stroke="var(--ink-300)"
        strokeWidth="1.5"
      />
      {/* Blank content lines */}
      <rect x="16" y="34" width="32" height="4" rx="2" fill="var(--ink-150)" />
      <rect x="16" y="42" width="24" height="4" rx="2" fill="var(--ink-150)" />
      <rect x="16" y="50" width="20" height="4" rx="2" fill="var(--ink-150)" />
    </svg>
  );
}

// ── DailyList ────────────────────────────────────────────────────────────────

interface DailyListProps {
  /** Called when the user clicks "+ Add a lesson" in the empty-day state.
   *  DailyView owns the AddLessonForm open state; this prop wires the CTA. */
  onOpenAddLesson: () => void;
}

export function DailyList({ onOpenAddLesson }: DailyListProps): ReactNode {
  const { week, selectedDay, setSelectedLessonId } = useAppState();
  const { lessons } = usePlanner();

  // Filter to the active week + day, then sort by time.
  const dayLessons = useMemo(() => {
    const filtered = lessons.filter(
      (l) => l.week === week && l.day === selectedDay,
    );
    return sortByTime(filtered);
  }, [lessons, week, selectedDay]);

  // Live stats from the filtered + sorted list.
  const doneCount = dayLessons.filter((l) => l.status === "done").length;
  const totalCount = dayLessons.length;

  // Day title: "Sunday · Jan 18"
  const dayTitle = formatDayTitle(week, selectedDay);

  // Row click: set the globally selected lesson id so the existing lesson
  // detail experience reflects the selection. We stay on /daily.
  function handleRowClick(lessonId: string): void {
    setSelectedLessonId(lessonId);
  }

  return (
    <div className={styles.container}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.eyebrow}>DAILY PLAN · LIST VIEW</div>
        <div className={styles.titleRow}>
          {/* h2 (not h1) — the page-level h1 lives in DailyView's
              PageHeader so the page has exactly one h1 in the a11y
              tree. This day title is a section heading underneath it. */}
          <h2 className={styles.title}>{dayTitle}</h2>
          {totalCount > 0 && (
            <span className={styles.stat}>
              {totalCount} {totalCount === 1 ? "lesson" : "lessons"} planned
              {" · "}
              {doneCount} done
            </span>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {totalCount > 0 ? (
        <div
          className={styles.list}
          role="list"
          aria-label={`Lessons for ${dayTitle}`}
        >
          {dayLessons.map((lesson) => (
            // Each ListRow is wrapped in a role="listitem" div so the list
            // context is correctly communicated to assistive technology.
            <div key={lesson.id} role="listitem">
              <ListRow
                lesson={lesson}
                time={lesson.time}
                onClick={() => handleRowClick(lesson.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        /* ── Empty-day state ─────────────────────────────────────────── */
        <div className={styles.empty} role="status">
          <EmptyDayIllustration />
          <p className={styles.emptyHeading}>No lessons planned for today</p>
          <Tooltip
            content="Drop a new lesson onto today's schedule — opens the add-lesson form pre-filled with today's date."
            side="top"
          >
            <button
              type="button"
              className={styles.addLessonCta}
              onClick={onOpenAddLesson}
              aria-label="Add a lesson for today"
              title="Drop a new lesson onto today's schedule — opens the add-lesson form pre-filled with today's date"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M6 1.5v9M1.5 6h9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Add a lesson
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
