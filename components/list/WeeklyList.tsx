"use client";

// WeeklyList.tsx — the Weekly view in List mode.
//
// Replaces <WeeklyGrid> in the grid slot of WeeklyShell when
// viewMode === "list". Same data, different presentation: lessons are
// grouped into day sections (one per configured school day) and rendered
// as a vertical stack of <ListRow> items ordered by time slot.
//
// ── School-week coupling ───────────────────────────────────────────────
// The day count and labels come from `useOrderedWeekdays()` (lib/week-order),
// which reads the team's CONFIGURED school week — the same contract the
// WeeklyGrid uses for its column headers. This keeps the day column set
// consistent without duplicating constants, and it is a correctness
// requirement, not a nicety (CLAUDE.md §1): the legacy WEEK_DAYS mock was
// hard-locked to Sun–Thu, so a Mon–Fri school saw wrong labels and a 6-day
// school silently lost its last day section.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useLabels } from "@/lib/labels";
import { useOrderedWeekdays } from "@/lib/week-order";
import type { Lesson, SubjectId } from "@/lib/types";
import { useHolidaysByDay } from "@/lib/use-day-holiday";
import { PlannerEmpty, Tooltip } from "@/components/ui";
import { AddLessonMenu } from "@/components/planner-v2";
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
  /** Teaching tooltip for this day's add trigger — the OUTCOME, not the label. */
  addTooltip: string;
  onQuickAdd: () => void;
  /** True while THIS day's quick-add round-trip is in flight. */
  quickAdding: boolean;
  /** Transient quick-add failure for THIS day, or null. */
  quickAddError: string | null;
}

function DaySection({
  dayIndex,
  dayName,
  lessons,
  holiday,
  onRowClick,
  addTooltip,
  onQuickAdd,
  quickAdding,
  quickAddError,
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

      {/* Add affordance — one per configured school day, OUTSIDE the rows so
          it is never mistaken for a lesson. A holiday day keeps it: a school
          can still schedule a make-up session on a day the calendar calls off,
          and hiding the control would push the only path to that onto a
          different surface — which on a phone is the whole defect this fixes.

          `onAddEvent` is deliberately NOT passed, so the menu offers the one
          row that can actually persist. The other frames pass it, and this is
          a considered asymmetry rather than an oversight: the event row opens
          a form whose submit can only report "Events can’t be saved yet" (the
          schedule store has no addBlock action —
          components/daily/AddEventForm.tsx:182-199). On a desktop frame that
          dead end is one of several paths; here it would sit on the ONLY way a
          phone or tablet teacher can add anything, which is the worst place in
          the app to promise something that discards their input.

          DO NOT "fix" this for parity with the other frames — the asymmetry is
          the decision, not an oversight (adjudicated with the orchestrator,
          task #34). Its exit condition is explicit: when the schedule store can
          actually persist an event, BOTH surfaces get the row and this comment
          goes with it. */}
      <div className={styles.addRow}>
        <AddLessonMenu
          triggerClassName={styles.addTrigger}
          tooltipId="weekly-list-add"
          tooltipContent={addTooltip}
          // The trigger is full-width here (one column, not a scrolling track),
          // so its left edge IS the content's left edge — `start` keeps the menu
          // inside the section instead of centring it over the day above.
          // Placement is clamped to the viewport regardless (AddLessonMenu's
          // `place()`), so this is a preference, not the thing keeping it
          // on-screen.
          align="start"
          onQuickAdd={onQuickAdd}
          quickAdding={quickAdding}
          quickAddError={quickAddError}
          triggerContent={
            <>
              <span className={styles.addPlus} aria-hidden="true">
                +
              </span>
              <span>Add</span>
              {/* Every day's trigger is otherwise byte-identical, so a screen
                  reader would announce "Add" once per day with no way to tell
                  them apart. The day name is visually redundant (the heading is
                  right there) but not redundant to a user navigating by
                  control. */}
              <span className={styles.srOnly}> to {dayName}</span>
            </>
          }
        />
      </div>
    </section>
  );
}

// ── WeeklyList ────────────────────────────────────────────────────────────────

export function WeeklyList(): ReactNode {
  const router = useRouter();
  const labels = useLabels();
  const { week, setSelectedDay, setSelectedLessonId } = useAppState();
  const { lessons, subjects, addLesson } = usePlanner();
  // The configured school week — one entry per day column, in order. Drives
  // the day COUNT (holiday lookup, bucket array) and the section labels.
  const weekdays = useOrderedWeekdays();
  // Holiday lookup for this week — used to decorate each day section with
  // a subtle grey wash + the holiday name. F#20 (audit-deferred holiday
  // visualization) was originally scoped to /year only; this lights up the
  // /weekly List mode with the same UnitBar.module.css `.holiday` recipe.
  const holidaysByDay = useHolidaysByDay(week, weekdays.length);

  // Filter to lessons in the active week, then group by day index.
  // Rebuilt when the lesson data, the active week, or the configured school
  // week (which sizes the buckets) changes.
  const grouped = useMemo<Lesson[][]>(() => {
    const weekLessons = lessons.filter((l) => l.week === week);

    // Build an array indexed by day (0..weekdays.length-1).
    const buckets: Lesson[][] = weekdays.map(() => []);
    for (const lesson of weekLessons) {
      // Guard against lessons whose day index falls outside the
      // configured week (can happen in edge-case mock data).
      if (lesson.day >= 0 && lesson.day < weekdays.length) {
        buckets[lesson.day].push(lesson);
      }
    }

    // Sort each bucket by time slot.
    return buckets.map((bucket) => [...bucket].sort(compareByTime));
  }, [lessons, week, weekdays]);

  // ── Quick-add (one-click blank lesson, PER DAY) ───────────────────────────
  //
  // WHY THIS SURFACE, WHICH IS NOT OBVIOUS FROM HERE. List looks like the least
  // important Week canvas, and it had no way to create a lesson at all.
  //
  // The standing reason is width-independent: `WeeklyShell`'s `showList` is true
  // whenever the teacher picks List from the Grid|List toggle, at ANY viewport.
  // A desktop teacher in List mode was therefore in a dead end — no add
  // affordance anywhere on the surface. That alone justifies this control and
  // does not depend on any breakpoint.
  //
  // It was ALSO the ≤900px canvas for every frame: `showList = isNarrow ||
  // viewMode === "list"` returned WeeklyList below 900px regardless of frame, so
  // all three frames' add affordances were UNMOUNTED (not hidden) on every phone
  // and tablet, and this component was what the teacher actually got. Whether
  // that gate is still in place depends on a separate change to
  // `WeeklyShell.tsx` — deliberately NOT assumed here, because this file must
  // read correctly either way. If the gate is gone, the List-mode reason above
  // still stands on its own.
  //
  // Ported from WeekColumns' per-day add, including its two hard-won details:
  // the subject is INFERRED (this day's first lesson's subject — the likeliest
  // continuation — else the catalog's first), and a synchronous ref guards the
  // double-tap double-create that `addingDay` state alone cannot (two taps in
  // one tick both pass a state check before the first setState commits). The
  // sync guard matters more here than it did there: this is the touch surface,
  // and a double-tap is the native way to mis-hit a button on a phone.
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [errorDay, setErrorDay] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickAddInFlightRef = useRef(false);
  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const handleQuickAdd = useCallback(
    async (day: number): Promise<void> => {
      if (quickAddInFlightRef.current) return; // sync guard — never double-create
      const subject: SubjectId | undefined =
        grouped[day]?.[0]?.subject ?? subjects[0]?.id;
      if (!subject) return; // catalog not settled yet (backend hydrate)
      quickAddInFlightRef.current = true;
      setAddingDay(day);
      if (errorTimerRef.current !== null) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      setErrorDay(null);
      setErrorMsg(null);
      try {
        const created = await addLesson({
          subject,
          week,
          day,
          title: `New ${labels.lesson.toLowerCase()}`,
        });
        if (created) {
          setSelectedLessonId(created.id);
        } else {
          setErrorDay(day);
          setErrorMsg(
            `Couldn’t add the ${labels.lesson.toLowerCase()} — check your connection and try again.`,
          );
          errorTimerRef.current = setTimeout(() => {
            errorTimerRef.current = null;
            setErrorDay(null);
            setErrorMsg(null);
          }, 6000);
        }
      } finally {
        quickAddInFlightRef.current = false;
        setAddingDay(null);
      }
    },
    [grouped, subjects, addLesson, week, labels.lesson, setSelectedLessonId],
  );

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
      {weekdays.map(({ token, index: dayIndex, longLabel }) => (
        <DaySection
          key={token}
          dayIndex={dayIndex}
          dayName={longLabel}
          lessons={grouped[dayIndex] ?? []}
          holiday={holidaysByDay.get(dayIndex) ?? null}
          onRowClick={handleRowClick}
          // CLAUDE.md §4: the tooltip says what the control ACCOMPLISHES, in
          // context — not "Add", which would restate the label and teach a
          // first-time teacher nothing.
          addTooltip={`Add a ${labels.lesson.toLowerCase()} to this day`}
          onQuickAdd={() => void handleQuickAdd(dayIndex)}
          quickAdding={addingDay === dayIndex}
          quickAddError={errorDay === dayIndex ? errorMsg : null}
        />
      ))}
    </div>
  );
}
