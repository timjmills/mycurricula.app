"use client";

// WeeklyList.tsx — the Weekly view in List mode.
//
// Replaces <WeeklyGrid> in the grid slot of WeeklyShell when
// viewMode === "list". Same data, different presentation: lessons are
// grouped into day sections (one per configured school day) and rendered
// as a vertical stack of <ListRow> items ordered by time slot.
//
// ── School-week coupling ───────────────────────────────────────────────
// The day count and labels come from WEEK_DAYS / WEEK_DAYS_SHORT, which
// are exported from lib/mock — the same source the WeeklyGrid uses for
// its column headers. This keeps the day column set consistent and avoids
// duplicating constants. When the school-week config layer lands, swap
// this import for the configured-week selector.
//
// ── Grouping ───────────────────────────────────────────────────────────
// We group by lesson.day (0-based index into the school-week config).
// Within each group, lessons are sorted by lesson.time (lexicographic on
// "HH:MM–HH:MM" strings — sufficient for the current data shape; a
// proper time-parse sort should land when the schedule layer arrives).
//
// ── Row click → navigate to Daily view ────────────────────────────────
// Clicking a row calls useAppState().setSelectedDay(lesson.day) and
// setSelectedLessonId(lesson.id) so the Daily view opens focused on that
// lesson, then navigates to /daily via Next.js router.

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useLabels } from "@/lib/labels";
import { WEEK_DAYS } from "@/lib/mock";
import type { Lesson } from "@/lib/types";
import { useHolidaysByDay } from "@/lib/use-day-holiday";
import { PlannerEmpty, Tooltip } from "@/components/ui";
import type { Holiday } from "@/lib/use-holidays";
import { ListRow } from "./ListRow";
import styles from "./WeeklyList.module.css";

// ── Time-sort comparator ─────────────────────────────────────────────────────
// Sort lessons within a day by their time slot label. Lessons without a
// time fall to the end so time-slotted lessons always lead the list.

function compareByTime(a: Lesson, b: Lesson): number {
  const ta = a.time ?? "";
  const tb = b.time ?? "";
  if (ta === tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta < tb ? -1 : 1;
}

// ── DaySection ────────────────────────────────────────────────────────────────
// Renders one day's header + list of rows. Extracted to keep WeeklyList's
// map() body readable and to make it straightforward for DailyList to share
// the empty-day pattern without depending on this component.

interface DaySectionProps {
  dayIndex: number;
  dayName: string;
  lessons: Lesson[];
  /** When set, the day is a configured holiday; the section paints a
   *  subtle grey-stripe wash and surfaces the holiday name in the
   *  header. Lessons (if any) remain visible — teachers may want to see
   *  what they had planned. */
  holiday: Holiday | null;
  onRowClick: (lesson: Lesson) => void;
}

function DaySection({
  dayIndex,
  dayName,
  lessons,
  holiday,
  onRowClick,
}: DaySectionProps): ReactNode {
  const count = lessons.length;
  return (
    <section
      className={`${styles.daySection} ${holiday ? styles.daySectionHoliday : ""}`}
      aria-labelledby={`day-heading-${dayIndex}`}
    >
      <div className={styles.dayHeader}>
        <h2 id={`day-heading-${dayIndex}`} className={styles.dayName}>
          {dayName}
        </h2>
        <span className={styles.lessonCount} aria-label={`${count} lessons`}>
          {count} {count === 1 ? "lesson" : "lessons"}
        </span>
        {/* Holiday pill — same visual vocabulary as the Weekly grid's day
            header pill (.dayHeadHolidayPill). The CLAUDE.md §4 tooltip on
            the marker carries the explanatory copy. */}
        {holiday && (
          <Tooltip
            content={`This day is marked as a holiday (${holiday.name}) — your team's curriculum says no school on this date.`}
            side="bottom"
          >
            <span
              className={styles.holidayPill}
              aria-label={`Holiday: ${holiday.name}`}
            >
              {holiday.name}
            </span>
          </Tooltip>
        )}
      </div>

      {count > 0 ? (
        <div className={styles.rows}>
          {lessons.map((lesson) => (
            <ListRow
              key={lesson.id}
              lesson={lesson}
              time={lesson.time}
              onClick={() => onRowClick(lesson)}
            />
          ))}
        </div>
      ) : holiday ? (
        // A holiday genuinely has no lessons — a real settled-empty, not a
        // hydrate artifact — so keep the plain hint.
        <p className={styles.emptyDay}>Holiday — no lessons planned</p>
      ) : (
        // Non-holiday empty column is gated on the day's lessons (count === 0),
        // which is also true mid-hydrate — PlannerEmpty shows a skeleton while
        // the plan loads instead of a false "No lessons planned".
        <PlannerEmpty size="sm" heading="No lessons planned" />
      )}
    </section>
  );
}

// ── WeeklyList ────────────────────────────────────────────────────────────────

export function WeeklyList(): ReactNode {
  const router = useRouter();
  const labels = useLabels();
  const { week, setSelectedDay, setSelectedLessonId } = useAppState();
  const { lessons } = usePlanner();
  // Holiday lookup for this week — used to decorate each day section with
  // a subtle grey wash + the holiday name. F#20 (audit-deferred holiday
  // visualization) was originally scoped to /year only; this lights up the
  // /weekly List mode with the same UnitBar.module.css `.holiday` recipe.
  const holidaysByDay = useHolidaysByDay(week, WEEK_DAYS.length);

  // Filter to lessons in the active week, then group by day index.
  // The useMemo deps are [lessons, week] — the grouped object is rebuilt
  // only when the lesson data or the active week changes.
  const grouped = useMemo<Lesson[][]>(() => {
    const weekLessons = lessons.filter((l) => l.week === week);

    // Build an array indexed by day (0..WEEK_DAYS.length-1).
    const buckets: Lesson[][] = WEEK_DAYS.map(() => []);
    for (const lesson of weekLessons) {
      // Guard against lessons whose day index falls outside the
      // configured week (can happen in edge-case mock data).
      if (lesson.day >= 0 && lesson.day < WEEK_DAYS.length) {
        buckets[lesson.day].push(lesson);
      }
    }

    // Sort each bucket by time slot.
    return buckets.map((bucket) => [...bucket].sort(compareByTime));
  }, [lessons, week]);

  // Navigate to the Daily view focused on the clicked lesson.
  function handleRowClick(lesson: Lesson): void {
    setSelectedDay(lesson.day);
    setSelectedLessonId(lesson.id);
    router.push("/daily");
  }

  return (
    <div
      className={styles.container}
      role="main"
      aria-label="Weekly plan — list view"
    >
      {/* ── Page heading ── */}
      <div className={styles.header}>
        <div>
          <div className={styles.kicker}>WEEKLY PLAN · LIST VIEW</div>
          <div className={styles.headingRow}>
            {/* h2 (not h1) — the page-level h1 lives in WeeklyShell's
                PageHeader. This in-list week heading is a section. */}
            <h2 className={styles.heading}>
              {labels.week} {week}
            </h2>
            <span className={styles.hint}>
              Same data as the grid view, listed by day.
            </span>
          </div>
        </div>
      </div>

      {/* ── Day sections — one per configured school day ── */}
      {WEEK_DAYS.map((dayName, dayIndex) => (
        <DaySection
          key={dayIndex}
          dayIndex={dayIndex}
          dayName={dayName}
          lessons={grouped[dayIndex] ?? []}
          holiday={holidaysByDay.get(dayIndex) ?? null}
          onRowClick={handleRowClick}
        />
      ))}
    </div>
  );
}
