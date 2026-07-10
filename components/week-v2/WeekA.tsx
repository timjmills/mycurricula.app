"use client";

// WeekA.tsx — Frame "glass" for the v2 Week canvas: a READ-ONLY period × day
// grid. It is the view sibling of the Wave-3 Week EDIT board
// (components/weekly/WeekEditBoard.tsx) and reuses the EXACT same derivation
// (lib/week-edit-periods) — no new period logic, no drag, no inline rename.
// Those live in Edit mode; here a teacher scans the week and clicks a lesson to
// select it (opens the resources panel) or double-clicks to open the full
// editor.
//
// Self-contained by design — like WeeklyGrid / WeekColumns / WeekC it takes NO
// props and reads the planner + app-state stores directly. selectedLessonId is
// the canonical select/open channel the shell's URL-write effect + the resources
// RightRail both consume, so selecting a tile opens the rail exactly as the
// other frames do (matches WeekC, the sibling frame).
//
// Bundle reference: the 7.2.26 v2 "WeekA" glass frame (B:874-887). The design
// values are recreated against the token system — every color is a var(--…),
// subject color arrives through `.cp-subj.<cls>` (var(--c) accent / --cd ink),
// and the cell tint mixes toward the tone-aware --panel-bg (never white) so
// Night/dark themes don't wash out.
//
// Day columns, the day COUNT, and weekday labels all derive from the configured
// school week (useOrderedWeekdays — never a hard-coded 5-day set). Schedule
// lookups map each column's weekday TOKEN through WEEKDAY_INDEX first (the
// SCHEDULE fixture is keyed by absolute Sun-first weekday, while a lesson's
// `day` is a POSITION in the configured week), exactly as WeekEditBoard does.

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Tooltip } from "@/components/ui";
import type { Lesson, SubjectId } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useLabels } from "@/lib/labels";
import { useOrderedWeekdays } from "@/lib/week-order";
import { WEEKDAY_INDEX, type Weekday } from "@/lib/use-school-week";
import { getDayBlocks } from "@/lib/schedule-data";
import { useHolidaysByDay } from "@/lib/use-day-holiday";
import { todayColumnIndex } from "@/lib/now-anchor";
import { CURRENT_WEEK } from "@/lib/mock";
import {
  deriveWeekPeriods,
  assignLessonPeriod,
  UNSCHEDULED,
  type WeekPeriod,
} from "@/lib/week-edit-periods";
import { deriveDayStatus } from "@/lib/day-status";
import { stripHtml } from "@/lib/html-text";
import {
  SelectTitle,
  ForkCues,
  AddLessonMenu,
  useNowMin,
  fromInteractive,
} from "@/components/planner-v2";
// Full-editor opener — deep import (NOT the @/components/weekly barrel, which
// re-exports WeeklyShell → a cycle). Same context WeekC/WeeklyShell use; null
// outside <WeeklyShell>, in which case double-click falls back to select.
import { OpenLessonEditorContext } from "@/components/weekly/weekly-lesson-card";
// Non-instructional-event popover — a self-contained position:fixed dialog
// ({ open, onClose, day }); reused verbatim from the Daily canvas (as WeekC does).
import { AddEventForm } from "@/components/daily/AddEventForm";
import styles from "./WeekA.module.css";

// ── Today resolution ────────────────────────────────────────────────────────
// Which column (0-based index into the CONFIGURED school week) is today?
// Verbatim from WeekColumns/WeekC: SSR-safe (initial null so the server HTML
// carries no emphasis), a 60s interval migrates the emphasis at midnight.
function useTodayColumnIndex(
  schoolWeekDays: readonly Weekday[],
): number | null {
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);
  return idx;
}

export function WeekA(): ReactNode {
  const labels = useLabels();
  const { week, search, filters, selectedLessonId, setSelectedLessonId } =
    useAppState();
  const { lessons, subjects, subjectById, addLesson } = usePlanner();
  const openLessonEditor = useContext(OpenLessonEditorContext);
  const nowMin = useNowMin();

  // ── Configured school week — the one ordered-week contract ────────────────
  const weekdays = useOrderedWeekdays();
  const DAY_COUNT = weekdays.length;

  // Schedule lookups are keyed by ABSOLUTE Sun-first weekday; map each column's
  // token through WEEKDAY_INDEX (Codex gate R3 on the edit board — a Mon–Fri
  // school must pull Monday's blocks for its first column, not Sunday's).
  const scheduleDayKeys = useMemo(
    () => weekdays.map((d) => WEEKDAY_INDEX[d.token]),
    [weekdays],
  );
  const periods = useMemo(
    () => deriveWeekPeriods(scheduleDayKeys),
    [scheduleDayKeys],
  );
  const dayBlocks = useMemo(
    () => scheduleDayKeys.map((d) => getDayBlocks(d)),
    [scheduleDayKeys],
  );

  // ── Holidays + today emphasis ─────────────────────────────────────────────
  const holidaysByDay = useHolidaysByDay(week, DAY_COUNT);
  const schoolWeekTokens = useMemo(
    () => weekdays.map((d) => d.token),
    [weekdays],
  );
  const todayIdx = useTodayColumnIndex(schoolWeekTokens);
  // Emphasis applies only when the visible week is the current week AND today is
  // a configured school day with no holiday (a holiday carries its own marker) —
  // verbatim gate from WeekColumns/WeekC. Off-emphasis columns never show a
  // "now" ring (deriveDayStatus's isToday=false collapses non-done to idle).
  const emphasizedTodayIdx =
    week === CURRENT_WEEK && todayIdx !== null && !holidaysByDay.has(todayIdx)
      ? todayIdx
      : null;

  // ── Search + filter predicate (verbatim from WeekColumns/WeekC) ───────────
  const lessonMatchesQuery = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lesson: Lesson): boolean => {
      if (q) {
        const hay =
          `${lesson.title} ${lesson.preview} ${lesson.directions}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (
        filters.subjects.length > 0 &&
        !filters.subjects.includes(lesson.subject)
      )
        return false;
      if (filters.units.length > 0 && !filters.units.includes(lesson.unit))
        return false;
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(lesson.status)
      )
        return false;
      if (filters.standards.length > 0) {
        const hasStandard = filters.standards.some((code) =>
          lesson.standards.includes(code),
        );
        if (!hasStandard) return false;
      }
      return true;
    };
  }, [search, filters]);

  // ── Subject catalog order (stable within-cell ordering) ───────────────────
  const subjectRank = useMemo(() => {
    const rank = new Map<string, number>();
    subjects.forEach((s, i) => rank.set(s.id, i));
    return rank;
  }, [subjects]);

  // ── Visible lessons bucketed by day (archived excluded; subject-ordered) ──
  // Mirrors WeekColumns.byDay, including the archived-exclusion contract.
  const byDay = useMemo(() => {
    const buckets: Lesson[][] = Array.from({ length: DAY_COUNT }, () => []);
    for (const lesson of lessons) {
      if (lesson.archived === true) continue;
      if (lesson.week !== week) continue;
      if (lesson.day < 0 || lesson.day >= DAY_COUNT) continue;
      if (!lessonMatchesQuery(lesson)) continue;
      buckets[lesson.day].push(lesson);
    }
    for (const dayLessons of buckets) {
      dayLessons.sort(
        (a, b) =>
          (subjectRank.get(a.subject) ?? 999) -
          (subjectRank.get(b.subject) ?? 999),
      );
    }
    return buckets;
  }, [lessons, week, DAY_COUNT, lessonMatchesQuery, subjectRank]);

  // ── Cell placement: `${day}:${periodKey}` → lessons[] (+ unscheduled) ─────
  // Same assignment the edit board uses. Real data is NOT one-lesson-per-period
  // (the bundle's positional grid was) — a cell stacks every lesson that lands
  // in it, and anything unplaceable falls to the explicit "Unscheduled" row
  // rather than vanishing (never drop a lesson).
  const { cellMap, anyUnscheduled } = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    let unscheduled = false;
    weekdays.forEach(({ index: day }, col) => {
      for (const lesson of byDay[day] ?? []) {
        const rowKey = assignLessonPeriod(lesson, periods, dayBlocks[col]);
        if (rowKey === UNSCHEDULED) unscheduled = true;
        const key = `${day}:${rowKey}`;
        const arr = map.get(key);
        if (arr) arr.push(lesson);
        else map.set(key, [lesson]);
      }
    });
    return { cellMap: map, anyUnscheduled: unscheduled };
  }, [weekdays, byDay, periods, dayBlocks]);

  // Rows: the derived periods, plus the Unscheduled overflow row when needed.
  const rows: Array<{ key: string; period: WeekPeriod | null; label: string }> =
    useMemo(
      () => [
        ...periods.map((p) => ({ key: p.key, period: p, label: p.label })),
        ...(anyUnscheduled
          ? [{ key: UNSCHEDULED, period: null, label: "Unscheduled" }]
          : []),
      ],
      [periods, anyUnscheduled],
    );

  // ── Selection / open (mirrors WeekC) ──────────────────────────────────────
  // Idempotent SELECT (not a toggle): the tile onClick AND the SelectTitle
  // button both call this, so a toggle would cancel itself on a title click.
  const handleSelect = useCallback(
    (lessonId: string): void => {
      setSelectedLessonId(lessonId);
    },
    [setSelectedLessonId],
  );
  // Double-click OPENS the full lesson editor (the shell's canonical open);
  // outside <WeeklyShell> the context is null → fall back to selecting.
  const handleOpen = useCallback(
    (lessonId: string): void => {
      if (openLessonEditor) openLessonEditor(lessonId);
      else setSelectedLessonId(lessonId);
    },
    [openLessonEditor, setSelectedLessonId],
  );

  // ── Quick-add (one-click blank lesson, PER DAY) ───────────────────────────
  // The glass add row is per-DAY (not per-subject like WeekC's per-cell add), so
  // the subject is INFERRED: the day's first lesson's subject (the likeliest
  // continuation), else the catalog's first subject — exactly DailyView's
  // day-level inference. Busy/error are scoped per day so one add never busies
  // every column. On success the new lesson is selected (opens its detail panel,
  // matching WeekC).
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [errorDay, setErrorDay] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous in-flight guard — `addingDay` is React STATE, so two clicks in
  // the same tick both pass the state check before the first setState commits
  // and BOTH create a lesson (reviewer LOW). A ref flips immediately, so the
  // second click sees it and bails.
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
        byDay[day]?.[0]?.subject ?? subjects[0]?.id;
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
          title: "New lesson",
        });
        if (created) {
          setSelectedLessonId(created.id);
        } else {
          setErrorDay(day);
          setErrorMsg(
            "Couldn’t add the lesson — check your connection and try again.",
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
    [byDay, subjects, addLesson, week, setSelectedLessonId],
  );

  // ── Add non-instructional event (per day) ─────────────────────────────────
  const [addEventDay, setAddEventDay] = useState<number | null>(null);
  // Anchor for the event popover — the add cell's LIVE rect, captured on
  // onClickCapture (below) so it works for BOTH mouse and keyboard: a keyboard
  // Enter on a button fires a synthesized click (no pointer event), and the
  // capture phase runs before the menu row's onClick → onAddEvent, so the ref
  // is fresh when the popover reads it. Without it AddEventForm falls back to
  // Daily's left:64px, which overlaps the sidebar in the weekly frames. Mirrors
  // WeekC (lead's final pattern). Passed as AddEventForm's `anchor`.
  const addEventAnchorRef = useRef<{ x: number; y: number } | null>(null);

  // ── One lesson tile ───────────────────────────────────────────────────────
  // Container is a plain div (pointer-convenience onClick = select; double-click
  // = open, guarded by fromInteractive since dblclick fires even over a nested
  // button). The accessible/keyboard select path is the SelectTitle <button>.
  function renderTile(lesson: Lesson, isToday: boolean): ReactNode {
    const subject = subjectById[lesson.subject];
    if (!subject) return null;
    const status = deriveDayStatus(lesson, nowMin, isToday);
    const selected = selectedLessonId === lesson.id;
    return (
      <div
        key={lesson.id}
        data-planner-item={`lesson:${lesson.id}`}
        className={`cp-subj ${subject.cls} ${styles.tile} ${
          lesson.modified ? styles.tileModified : ""
        } ${status === "now" ? styles.tileNow : ""} ${
          selected ? styles.tileSelected : ""
        } ${status === "done" ? styles.tileDone : ""}`}
        onClick={() => handleSelect(lesson.id)}
        onDoubleClick={(e: MouseEvent<HTMLDivElement>) => {
          if (!fromInteractive(e)) handleOpen(lesson.id);
        }}
        title="Double-click to open the full lesson"
      >
        <SelectTitle
          selected={selected}
          onSelect={() => handleSelect(lesson.id)}
          titleClassName={styles.tileTitle}
        >
          {stripHtml(lesson.title)}
        </SelectTitle>
        <div className={styles.tileSubject}>{subject.name}</div>
        <ForkCues lesson={lesson} />
      </div>
    );
  }

  return (
    <div
      className={styles.page}
      title="Your week at a glance — one row per class period, one column per school day. Click a lesson to open it in the resources panel; double-click to edit it. Reordering (drag to reschedule) lives in Edit mode."
    >
      <div className={styles.scroll}>
        <div
          className={styles.grid}
          role="group"
          aria-label={`Weekly plan by period, ${labels.week.toLowerCase()} ${week}`}
          // One column per configured school day (never a fixed 5).
          style={{ "--day-count": DAY_COUNT } as CSSProperties}
        >
          {/* Row 1 — empty corner + day headers. */}
          <div className={styles.corner} aria-hidden="true" />
          {weekdays.map(({ token, label, longLabel, index }) => {
            const holiday = holidaysByDay.get(index) ?? null;
            const isToday = index === emphasizedTodayIdx;
            return (
              <div
                key={token}
                className={`${styles.dayHead} ${
                  isToday ? styles.dayHeadToday : ""
                } ${holiday ? styles.dayHeadHoliday : ""}`}
              >
                <span className={styles.dayHeadName}>
                  {label}
                  {isToday ? (
                    <span className={styles.srOnly}> (today)</span>
                  ) : null}
                </span>
                <span aria-hidden="true" className={styles.dayHeadSub}>
                  {longLabel}
                </span>
                {isToday && (
                  <span className={styles.todayChip} aria-hidden="true">
                    Today
                  </span>
                )}
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
            );
          })}

          {/* Period rows. */}
          {rows.map((row) => (
            <React.Fragment key={row.key}>
              <div className={styles.gutter}>
                {row.period ? (
                  <span className={styles.gutterTime}>{row.period.label}</span>
                ) : (
                  <span className={styles.gutterUnsched}>Unscheduled</span>
                )}
              </div>
              {weekdays.map(({ token, index: day }) => {
                const cellLessons = cellMap.get(`${day}:${row.key}`) ?? [];
                const isToday = day === emphasizedTodayIdx;
                return (
                  <div
                    key={token}
                    className={styles.dayCell}
                    role="group"
                    aria-label={row.label}
                  >
                    {cellLessons.map((lesson) => renderTile(lesson, isToday))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {/* Add row — one dashed add affordance per day. */}
          <div className={styles.gutter} aria-hidden="true" />
          {weekdays.map(({ token, index: day }) => (
            <div
              key={token}
              className={styles.addCell}
              // Capture the cell's live rect on any click inside it (incl. the
              // synthesized click a keyboard Enter fires) so the event popover
              // anchors beside this column, not at Daily's left:64px default.
              // currentTarget is always the cell regardless of which child was hit.
              onClickCapture={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                addEventAnchorRef.current = { x: r.left, y: r.bottom };
              }}
            >
              <AddLessonMenu
                triggerClassName={styles.addTrigger}
                tooltipId="week-a-add"
                tooltipContent={`Add a ${labels.lesson.toLowerCase()} or a non-instructional event to this day`}
                align="center"
                onQuickAdd={() => void handleQuickAdd(day)}
                onAddEvent={() => setAddEventDay(day)}
                quickAdding={addingDay === day}
                quickAddError={errorDay === day ? errorMsg : null}
                triggerContent={
                  <>
                    <span className={styles.addPlus} aria-hidden="true">
                      +
                    </span>
                    <span>Add</span>
                  </>
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Non-instructional-event popover — fixed-position, at the page root so
          it escapes the scroll container's overflow (same as WeekC). */}
      <AddEventForm
        open={addEventDay !== null}
        onClose={() => setAddEventDay(null)}
        day={addEventDay ?? 0}
        // Configured weekday label (correct for any school week, not the Sun–Thu
        // mock the form falls back to by positional index) + anchor beside the
        // clicked column (Codex M2 + B's anchor prop).
        dayLabel={
          weekdays.find((w) => w.index === (addEventDay ?? 0))?.longLabel
        }
        anchor={addEventAnchorRef.current}
      />
    </div>
  );
}
