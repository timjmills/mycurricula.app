"use client";

// DailyView.tsx — the Daily view shell.
//
// W4 (v2 redesign): the day's READ surface is now the frame-branched
// <DayViewV2> canvas (components/day-v2). DailyView is the thin host that
// owns the lessons-adjacent seams the canvas can't own by itself and wires
// them in:
//
//   body row → [icon rail] [ isEdit ? <DayEditSplit> : <DayViewV2> ] [schedule rail?]
//
// The canvas renders its OWN day header (day name + date + prev/next nav),
// week strip, lesson list, and add affordances — so the old dock / list
// layouts, the in-column WeekStrip / TodayDashboard, the dnd row-reorder
// machinery, and the reorder-teaching toast are gone from this shell. The
// canvas reads usePlanner / useAppState / useTheme itself for selection and
// status writes; DailyView only feeds it the derived day slice, the day/date
// labels, the holiday node, and the navigation / planner / quick-add / add-
// event seams.
//
// EDIT mode is unchanged: the top-bar View↔Edit toggle (useViewEditMode
// "Day") still swaps in the two-pane <DayEditSplit>, which keeps its own
// data-day-edit-split probe hook and its shared selectedId.
//
// PRESERVED VERBATIM (PR #27 deep-link trio + invariants): the `?lesson=`
// resolver effect, the URL-strip effect, the `?date=` resolver, and the
// `seededFor` latch. These are copied unchanged — do not reorder, merge, or
// touch their deps.
//
// Per-teacher row order: the day slice is still sorted by the persisted
// per-teacher order (readRowOrder / sortByRowOrder) before it reaches the
// canvas, so a previously-saved order still renders. selectedDay is shared
// planner state (useAppState).

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { dateForWeekDay, CURRENT_WEEK } from "@/lib/mock";
import { useOrderedWeekdays } from "@/lib/week-order";
import { useSchoolWeek } from "@/lib/use-school-week";
import { todayColumnIndex } from "@/lib/now-anchor";
import { useDayHoliday } from "@/lib/use-day-holiday";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
// W3.8b — the per-view View↔Edit mode (builder B's lib; the cc_editmode
// localStorage map behind the top-bar ViewEditToggle). NOT app-state's
// forking editMode — see the name-collision note in ViewEditToggle.tsx.
import { useViewEditMode } from "@/lib/edit-mode-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DayEditSplit } from "./DayEditSplit";
import { IconRail } from "./IconRail";
import { AddEventForm } from "./AddEventForm";
import { Button, Tooltip } from "@/components/ui";
import { ScheduleDayPane } from "@/components/schedule";
import { DailySchedulePill } from "./daily-schedule-pill";
import { useDailyScheduleMode } from "@/lib/daily-schedule-state";
import { useLabels } from "@/lib/labels";
// W4 — the v2 Day read canvas. Frame-branched internally (DayA / DayB /
// DayC by useTheme().frame); ignores the global grid/list viewMode (the
// bundle Day has no list/grid modes).
import { DayViewV2 } from "@/components/day-v2";
import styles from "./DailyView.module.css";

// ── Per-teacher row order persistence ────────────────────────────────────
// The saved order is a plain array of lesson ids, stored under a key that
// encodes week + day so each day keeps its own order. All access is
// guarded by `typeof window` so it is inert during SSR. The v2 canvas
// renders the day slice DailyView hands it, so the shell still applies the
// saved order before the lessons reach the canvas.

const ROW_ORDER_PREFIX = "mycurricula:daily-row-order";

/** localStorage key for one week+day's saved row order. */
function rowOrderKey(week: number, day: number): string {
  return `${ROW_ORDER_PREFIX}:w${week}:d${day}`;
}

/** Read the saved per-teacher row order for a week+day, or [] if none. */
function readRowOrder(week: number, day: number): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(rowOrderKey(week, day));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    // Corrupt or unavailable storage — fall back to no saved order.
    return [];
  }
}

/**
 * Sort `lessons` by the saved per-teacher `order`. Lessons present in the
 * saved order keep that order; any lesson NOT yet in the saved order (a
 * newly added lesson) appends at the end in its original relative order.
 */
function sortByRowOrder(lessons: Lesson[], order: string[]): Lesson[] {
  if (order.length === 0) return lessons;
  const rank = new Map(order.map((id, i) => [id, i]));
  // Stable partition: known ids sorted by rank, unknown ids appended.
  const known = lessons
    .filter((l) => rank.has(l.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const unknown = lessons.filter((l) => !rank.has(l.id));
  return [...known, ...unknown];
}

// ── Holiday banner ───────────────────────────────────────────────────────
// Presentational (no hook). Renders the holiday banner above the day's read
// surface — same diagonal-stripe wash recipe as UnitBar.module.css `.holiday`
// so /year, /weekly, and /daily all read the holiday as the same concept.
//
// The hook call stays in the SHELL: DailyView calls useDayHoliday and passes
// `holidayNode={holiday ? <HolidayBanner …/> : null}`. Passing `null` (not an
// always-truthy element that self-hides) is load-bearing — the v2 frames gate
// BOTH their holiday wrapper AND their "No lessons planned" empty-state on
// `holidayNode` being truthy, so an element that renders null on a normal day
// would leave an empty `.holiday` box and swallow the empty-state.

function HolidayBanner({ name }: { name: string }): ReactNode {
  return (
    <Tooltip
      content={`This day is marked as a holiday (${name}) — your team's curriculum says no school on this date.`}
      side="bottom"
    >
      <div
        className={styles.holidayBanner}
        role="status"
        aria-label={`Holiday: ${name} — no school today.`}
      >
        <span className={styles.holidayBannerLabel}>Holiday</span>
        <span className={styles.holidayBannerName}>{name}</span>
      </div>
    </Tooltip>
  );
}

// ── DailyView ────────────────────────────────────────────────────────────

export interface DailyViewProps {
  /** Seed the initial selection from a `/daily?lesson=<id>` deep-link.
   *  When set + the id resolves to a lesson, the view jumps to that
   *  lesson's week + day on mount and clears the query string so day
   *  navigation thereafter is normal. (W1-V5 — closes Subject→Daily
   *  cross-route trust gap.) */
  initialLessonId?: string;
  /** Seed the initial day/week from a `/daily?date=<YYYY-MM-DD>` deep-link
   *  (UX roadmap item 07). Skipped when `initialLessonId` resolves (the lesson
   *  pins its own week + day). Out-of-range / pre-anchor dates degrade to the
   *  default view; the consumed query string is cleared on mount. */
  initialDate?: string;
}

export function DailyView({
  initialLessonId,
  initialDate,
}: DailyViewProps = {}): ReactNode {
  const router = useRouter();
  // selectedDay is shared planner state — the top bar may also change it.
  const { week, selectedDay, setSelectedDay, setWeek, setSelectedLessonId } =
    useAppState();

  // Renameable hierarchy captions — a school may rename "Week" → "Module",
  // etc. Read once for the breadcrumb caption below.
  const labels = useLabels();

  // Configured school week — day labels (the breadcrumb day segment + the
  // canvas's day header label) follow the team's configured week rather than
  // a hard-coded Sun-first fixture. See lib/week-order.ts.
  const weekdays = useOrderedWeekdays();

  // The configured school-week weekday tokens — feeds the "which column is
  // today?" rule (todayColumnIndex indexes into this ordered set).
  const { days: schoolWeekDays } = useSchoolWeek();

  // Today's column index in the configured school week — the SAME SSR-safe
  // recipe TodayJumpButton / NowLine / WeeklyGrid use: null on the server and
  // the first client paint (so the markup matches), resolved post-mount from
  // the real clock. Null on a non-school day (e.g. Saturday) → never "today".
  const [todayColIdx, setTodayColIdx] = useState<number | null>(null);
  useEffect(() => {
    setTodayColIdx(todayColumnIndex(new Date(), schoolWeekDays));
  }, [schoolWeekDays]);

  // Lessons come from the planner store so completions, edits, and undo/redo
  // are immediately reflected. `hydration` gates the deep-link resolver below:
  // under the Supabase flag the doc arrives async, so the resolver must tell
  // "still settling" from "loaded and the id genuinely isn't there".
  // `subjects` + `addLesson` feed the quick-add seam; `subjectById` resolves
  // the breadcrumb subject; `lastChange` drives the post-mutation scroll.
  const {
    lessons,
    lastChange,
    subjectById,
    subjects,
    hydration,
    addLesson,
  } = usePlanner();

  // W3.8b — the Day view's View↔Edit mode (the top-bar ViewEditToggle's
  // persisted cc_editmode flag, capitalized "Day" — bundle-exact key
  // casing). While isEdit, the body renders <DayEditSplit>; else <DayViewV2>.
  const { isEdit, setEdit } = useViewEditMode("Day");

  // ── Per-teacher row order (local + localStorage, NOT the shared doc) ──
  // Keyed by week+day. Initialised EMPTY rather than from localStorage: the
  // server has no localStorage, so seeding state from it in the initializer
  // would make the client's first render diverge from the server HTML and
  // trip a React hydration mismatch. The mount effect below loads the saved
  // order immediately after hydration instead.
  const [rowOrder, setRowOrder] = useState<string[]>([]);

  // Load the saved order after mount, and reload it whenever the week or day
  // changes. Running post-mount keeps the localStorage read off the hydration
  // path; access is SSR-guarded inside readRowOrder regardless.
  useEffect(() => {
    setRowOrder(readRowOrder(week, selectedDay));
  }, [week, selectedDay]);

  // The day's lessons, filtered to week + day and then sorted by the saved
  // per-teacher order. Lessons not yet in the saved order append at the end.
  const dayLessons = useMemo(() => {
    const filtered = lessons.filter(
      (l) => l.week === week && l.day === selectedDay,
    );
    return sortByRowOrder(filtered, rowOrder);
  }, [lessons, week, selectedDay, rowOrder]);

  // Daily view manages its own selected-lesson state (shared with EDIT mode
  // and the breadcrumb). Default: first not-yet-done lesson for the active
  // day; null → empty. If a `?lesson=<id>` deep-link was provided AND the id
  // resolves, seed selectedId with it instead (the matching week+day are also
  // synced post-mount below so the lesson is actually visible).
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialLessonId) {
      const target = lessons.find((l) => l.id === initialLessonId);
      if (target) return target.id;
    }
    const first = lessons.find(
      (l) => l.week === week && l.day === selectedDay && l.status !== "done",
    );
    return first?.id ?? null;
  });

  // Deep-link resolver for a `?lesson=<id>` hand-off (the Weekly / Subject
  // "Go to lesson" buttons, the command palette, a resource row). It selects
  // THAT lesson and syncs the view to its week + day, then drops the query so a
  // later manual day change can't re-trigger it.
  //
  // Why an effect that watches `lessons`/`hydration` instead of running once on
  // mount: under the Supabase flag the document hydrates AFTER mount, so at the
  // first render `lessons` is empty and neither the initializer above nor a
  // mount-only effect can resolve the id — they silently no-op and the view
  // falls back to "first not-done of today". That is the reported bug, and it
  // is worst on a COLD direct load / refresh of `/daily?lesson=…`: on a cold
  // load the auth owner is null for the first frames, so the store settles to
  // hydration "empty" (EMPTY_DOC) for the null owner BEFORE the real owner's
  // lessons load — a transient empty-but-not-loading window. Re-running as the
  // doc actually arrives lets the resolve land the moment the lesson exists.
  // With the flag OFF the mock doc is present synchronously, so this resolves on
  // the first run.
  //
  // `seededFor` is the deep-link id this resolver last settled (resolved OR gave
  // up on). It is STATE (not a ref) so the URL-cleanup effect below re-runs once
  // the seed has committed in its OWN render: the `?lesson=` query is stripped
  // only AFTER the week/day/selection seed lands, never in the same tick (else
  // App Router can re-render the page without the query before the seed commits,
  // dropping it — a race on the cold hydration path). Keyed by id (not a bare
  // boolean) so a NEW deep link arriving while DailyView stays mounted (command
  // palette, another "Go to lesson", a resource row) is still honored; reset
  // when the query is absent so even a repeat link to the SAME lesson re-seeds.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!initialLessonId) {
      // No (or stripped) ?lesson= — re-arm so a later deep link, even to the
      // same lesson, resolves again.
      if (seededFor !== null) setSeededFor(null);
      return;
    }
    if (seededFor === initialLessonId) return; // already settled this id
    const target = lessons.find((l) => l.id === initialLessonId);
    if (target) {
      // Set week/day unconditionally — React bails out of a same-value useState
      // set, so no `!==` guard is needed and `week`/`selectedDay` stay out of
      // the effect (keeping the deps below honest).
      setWeek(target.week);
      setSelectedDay(target.day);
      setSelectedId(target.id);
      // Clear the GLOBAL shell selection the Weekly "Go to lesson" hand-off
      // leaves set (it can't clear it itself without tripping WeeklyShell's
      // URL-write bounce — see the panel handler). We're on /daily now, so
      // clearing here is safe and stops the shell LessonDetailPanel from
      // double-rendering beside Daily's own rail. A cold/Schedule/List-mode
      // load never set it, so this is a harmless no-op there.
      setSelectedLessonId(null);
      setSeededFor(initialLessonId);
      return;
    }
    // Target not present yet. Give up ONLY once the loaded document definitively
    // lacks it: a POPULATED lessons array that doesn't contain the id (a
    // genuinely bad / foreign id), or a terminal "error". An EMPTY array is
    // treated as "still settling" even when `hydration` momentarily reads a
    // non-"loading" value — on a cold load the store passes through hydration
    // "empty" with EMPTY_DOC for the null owner before the real owner's lessons
    // arrive, and latching here would strand the deep link forever. Staying
    // armed while empty costs nothing (there is no lesson to select yet) and the
    // next lessons/hydration change retries.
    if (
      hydration === "error" ||
      (lessons.length > 0 && hydration !== "loading")
    ) {
      setSeededFor(initialLessonId);
    }
    // setWeek / setSelectedDay / setSelectedId / setSelectedLessonId are stable
    // setters and router is stable, so they are intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLessonId, lessons, hydration, seededFor]);

  // Strip the consumed `?lesson=` only AFTER the seed for this id has committed
  // (a separate render from the seed above), so the week/day/selection lands
  // before App Router re-renders the page without the query.
  useEffect(() => {
    if (!initialLessonId || seededFor !== initialLessonId) return;
    router.replace("/daily", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLessonId, seededFor]);

  // `/daily?date=<YYYY-MM-DD>` deep link (UX roadmap item 07) — the sibling of
  // the lesson seed above, skipped whenever that seed resolves (a lesson pins
  // its own week + day). The date→(week, day) math inverts
  // lib/mock/calendar.ts dateForWeekDay: anchor = Week 1 day 0, calendar weeks
  // advance by 7 days regardless of the configured school week. Out-of-range /
  // pre-anchor dates degrade to the default view.
  useEffect(() => {
    if (!initialDate) return;
    if (initialLessonId && lessons.some((l) => l.id === initialLessonId)) {
      // The lesson seed above owns the navigation AND the URL cleanup.
      return;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(initialDate);
    if (m) {
      // Local-midnight Date — the codebase deliberately avoids UTC date math
      // (see lib/use-academic-year.ts) so the calendar day stays stable.
      const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const anchor = dateForWeekDay(1, 0);
      // Math.round absorbs DST hour drift between two local midnights.
      const diffDays = Math.round(
        (target.getTime() - anchor.getTime()) / 86_400_000,
      );
      const targetWeek = Math.floor(diffDays / 7) + 1;
      // Same 1–99 bound the weekly link parser enforces; out-of-range or
      // pre-anchor dates degrade to the default view.
      if (diffDays >= 0 && targetWeek <= 99) {
        const dayIndex = Math.min(
          diffDays % 7,
          Math.max(weekdays.length - 1, 0),
        );
        if (targetWeek !== week) setWeek(targetWeek);
        if (dayIndex !== selectedDay) setSelectedDay(dayIndex);
      }
    }
    // Strip the consumed params on every path — valid, malformed, and
    // out-of-range alike — so a bad date never leaves a dead query string.
    router.replace("/daily", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate]);

  // Add-event form open state (DAILY-ADD-EVENT-001). The form is a
  // position:fixed popover rendered at the bottom of the page tree so it is
  // not clipped by any parent overflow. The v2 canvas opens it via onAddEvent.
  const [addEventOpen, setAddEventOpen] = useState(false);

  // W3.7 — in-flight flag for the one-click quick-add. True from click until
  // the store's addLesson resolves; the canvas add affordance disables while
  // busy so a double-click can never create two lessons.
  const [addingLesson, setAddingLesson] = useState(false);

  // W3.7 audit #3 — transient create-failure message for the quick-add path
  // (addLesson → null). There's no form to hold an inline error, so the
  // message is handed to the canvas and auto-clears after ~6s. The timeout
  // lives in a ref so a second failure replaces (not stacks) the timer, and
  // unmount cleanup can cancel it.
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const quickAddErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    // Unmount-only cleanup — never let the auto-clear fire on a dead tree.
    return () => {
      if (quickAddErrorTimerRef.current !== null) {
        clearTimeout(quickAddErrorTimerRef.current);
      }
    };
  }, []);

  // Selecting a lesson updates the shared selectedId (drives EDIT mode's split
  // and the breadcrumb subject). The v2 VIEW canvas manages its own selection
  // through the planner store, so this is primarily the EDIT-mode seam.
  const handleSelectLesson = useCallback((id: string): void => {
    setSelectedId(id);
  }, []);

  // ── Planner-open seam (W3.7 → W3.8b) ──────────────────────────────────
  // The ONE named entry point for "open this lesson in the daily planner":
  // the canvas's plan affordance (onPlan) and the quick-add flow after a
  // successful create. W3.8b LOCKED DECISION (bundle wins — openPlan on Day):
  // "open" flips the Day view into EDIT mode AND selects the lesson, so every
  // caller lands in the <DayEditSplit> right pane with that lesson active in
  // the fill-in template. Selection is the SHARED selectedId, so flipping back
  // to View keeps the same lesson in context.
  const openLessonPlanner = useCallback(
    (lessonId: string): void => {
      setEdit(true);
      handleSelectLesson(lessonId);
    },
    [handleSelectLesson, setEdit],
  );

  // ── One-click add lesson (W3.7, bundle .vb-railadd/.vc-aadd) ─────────
  // Creates a blank lesson in ONE click — no form. Subject defaults to the
  // day's first lesson's subject (the likeliest continuation), else the
  // catalog's first subject in the app's canonical order. Await-then-select:
  // the store resolves the REAL source-minted id before anything is selected,
  // so the planner never opens on a phantom row (see planner-store's addLesson
  // for why no optimism).
  const handleQuickAddLesson = useCallback(async (): Promise<void> => {
    if (addingLesson) return; // in-flight guard — never double-create
    const subject = dayLessons[0]?.subject ?? subjects[0]?.id;
    if (!subject) return; // catalog not settled yet (backend hydrate)
    setAddingLesson(true);
    // A fresh attempt clears the previous failure message (audit #3).
    if (quickAddErrorTimerRef.current !== null) {
      clearTimeout(quickAddErrorTimerRef.current);
      quickAddErrorTimerRef.current = null;
    }
    setQuickAddError(null);
    try {
      const created = await addLesson({
        subject,
        week,
        day: selectedDay,
        title: "New lesson",
      });
      // null → the source rejected/failed; the store already console.debug'd.
      // W3.7 audit #3 — surface it: with no form to hold the draft, a silent
      // null read as "the click did nothing". Show the transient error line;
      // auto-clear after ~6s.
      if (created) {
        openLessonPlanner(created.id);
      } else {
        setQuickAddError(
          "Couldn’t add the lesson — check your connection and try again.",
        );
        quickAddErrorTimerRef.current = setTimeout(() => {
          quickAddErrorTimerRef.current = null;
          setQuickAddError(null);
        }, 6000);
      }
    } finally {
      setAddingLesson(false);
    }
  }, [
    addingLesson,
    dayLessons,
    subjects,
    addLesson,
    week,
    selectedDay,
    openLessonPlanner,
  ]);

  // ── Scroll preservation ──────────────────────────────────────────────
  // After any store mutation (edit, completion, undo, redo) scroll the
  // affected lesson into view. `lastChange` identity changes on every
  // dispatch — using it as the dep ensures exactly one scroll per mutation.
  // scrollPlannerItemIntoView locates the row by its data-planner-item hook;
  // it no-ops harmlessly if the current surface doesn't render that row.
  useEffect(() => {
    const id = lastChange?.lessonIds[0];
    if (id) {
      scrollPlannerItemIntoView(id);
    }
  }, [lastChange]);

  // The selected lesson, resolved from current store state (drives the
  // breadcrumb subject segment; also the EDIT-mode split reads selectedId).
  const selectedLesson = selectedId
    ? (lessons.find((l) => l.id === selectedId) ?? null)
    : null;

  // ── Day / date labels for the canvas header ────────────────────────────
  const dayLabel = weekdays[selectedDay]?.longLabel ?? "Day";

  // "Jun 14 · 2026" — derived from the same week/day → Date helper the week
  // strip and date resolver use (lib/mock/calendar.ts dateForWeekDay).
  const dateLabel = useMemo(() => {
    const d = dateForWeekDay(week, selectedDay);
    const month = d.toLocaleDateString("en-US", { month: "short" });
    return `${month} ${d.getDate()} · ${d.getFullYear()}`;
  }, [week, selectedDay]);

  // Whether the visible day IS today — the canvas gates its live "now"/
  // "upcoming" split on this (false → no false "now" ring; B/C focus falls
  // back to selection → first lesson). Reuses the app-wide "today" rule
  // (TodayJumpButton / NowLine / WeeklyGrid): the viewed week is the frozen
  // current week AND the viewed day is today's school-week column. CURRENT_WEEK
  // is the mock fixture's current-week source; it resolves from the backend
  // once the Supabase flag is on (see TodayJumpButton's PHASE-1B note).
  const isToday =
    week === CURRENT_WEEK &&
    todayColIdx !== null &&
    todayColIdx === selectedDay;

  // ── Day prev/next with week rollover ───────────────────────────────────
  // The canvas's day-nav arrows call onShiftDay(±1). Shifting past the first
  // instructional day rolls back to the previous week's last day (clamped at
  // week 1); shifting past the last day rolls forward to the next week's first
  // day. Day columns derive from the configured school week (never a hard-
  // coded 5-day assumption); the forward week bound matches the unbounded `]`
  // keyboard shortcut in lib/use-keyboard-shortcuts.ts.
  const handleShiftDay = useCallback(
    (delta: 1 | -1): void => {
      const dayCount = Math.max(weekdays.length, 1);
      const raw = selectedDay + delta;
      // Resolve the target week + day with rollover (clamp at week 1).
      let targetWeek = week;
      let targetDay: number;
      if (raw < 0) {
        if (week > 1) {
          targetWeek = week - 1;
          targetDay = dayCount - 1;
        } else {
          targetDay = 0; // already at week 1 day 0 — clamp
        }
      } else if (raw > dayCount - 1) {
        targetWeek = week + 1;
        targetDay = 0;
      } else {
        targetDay = raw;
      }
      setWeek(targetWeek); // React bails on a same-value set, so week-only-vs-
      setSelectedDay(targetDay); // day-only shifts stay cheap.
      // Reset the selection to the TARGET day so neither the breadcrumb nor a
      // subsequent Edit (DayEditSplit reads selectedId) can carry the prior
      // day's lesson. Mirrors the pre-W4 handleDayChange seed exactly: the new
      // day's first not-done lesson, else null — computed against targetWeek so
      // a week rollover seeds from the day the teacher actually lands on. Also
      // clear the GLOBAL selection: safe here (an on-/daily state change, not a
      // navigation off /weekly, so the WeeklyShell URL-write bounce can't fire)
      // and it stops the v2 canvas from focusing a stale out-of-day lesson.
      const firstOpen = lessons.find(
        (l) =>
          l.week === targetWeek &&
          l.day === targetDay &&
          l.status !== "done",
      );
      setSelectedId(firstOpen?.id ?? null);
      setSelectedLessonId(null);
    },
    [
      selectedDay,
      week,
      weekdays.length,
      lessons,
      setWeek,
      setSelectedDay,
      setSelectedLessonId,
    ],
  );

  // The canvas add-event affordance opens the shared AddEventForm popover.
  const handleOpenAddEvent = useCallback((): void => {
    setAddEventOpen(true);
  }, []);

  // Holiday lookup for the current day — kept in the shell (per the W4 brief)
  // so the resolved node passes to <DayViewV2> as `holidayNode`. `null` on a
  // non-holiday day: the v2 frames key their holiday wrapper AND empty-state
  // branch on this being truthy, so it must not be an always-present element.
  const holiday = useDayHoliday(week, selectedDay);

  // ── Breadcrumb (BIG-7) ─────────────────────────────────────────────────
  // Week N / <Day> / <Subject> — each segment is a clickable link. Subject is
  // drawn from the selected lesson; falls back to null so the segment is
  // omitted rather than showing a stale value when no lesson is selected.
  const breadcrumbSubject = selectedLesson
    ? subjectById[selectedLesson.subject]
    : null;

  // ── Daily schedule-pill state ──────────────────────────────────────────
  // The pill lives in the page-header actions. When ON, a
  // <ScheduleDayPane variant="rail" /> mounts as an additional right-end track
  // in the body row (folds away at ≤1280px so the day canvas keeps width).
  const { scheduleMode: showScheduleRail } = useDailyScheduleMode();

  return (
    <div className={styles.page}>
      {/* ── Page header (page identity + cross-view nav + orphan controls) ──
          The day's own identity (day name + date + prev/next nav) now lives
          inside <DayViewV2>'s header, so this bar keeps only what has no home
          in the canvas: the page-level h1 (single-h1-per-page a11y anchor),
          the cross-view breadcrumb (Week → /weekly, Subject → /year), the
          Daily Schedule pill (drives the schedule rail below), and Present
          (launches the full-screen Teaching View). The old Grid | List toggle
          is gone — the v2 Day surface has no list/grid modes, so the control
          did nothing here (and setting the shared viewMode leaked into
          Weekly/Year). */}
      <div className={styles.dailyPageHeader}>
        <div className={styles.pageHeadText}>
          <h1 className={styles.pageTitle}>Daily View</h1>
          {/* Breadcrumb directly under the title — Week N › Day › Subject.
              Each segment is a real link; the subject segment is omitted
              (not stale) when no lesson is selected. Day labels derive
              from the configured school week (useOrderedWeekdays). */}
          <nav className={styles.headerCrumb} aria-label="Breadcrumb">
            <Link href="/weekly" className={styles.breadcrumbLink}>
              {labels.week} {week}
            </Link>
            <span className={styles.breadcrumbSep} aria-hidden="true">
              ›
            </span>
            <Link href="/daily" className={styles.breadcrumbLink}>
              {dayLabel}
            </Link>
            {breadcrumbSubject && (
              <>
                <span className={styles.breadcrumbSep} aria-hidden="true">
                  ›
                </span>
                <Link
                  href={`/year?subject=${breadcrumbSubject.id}`}
                  className={styles.breadcrumbLink}
                >
                  {breadcrumbSubject.name}
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className={styles.headerActions}>
          <DailySchedulePill />
          <Tooltip
            content="Open this day's boards full-screen for live class delivery"
            side="bottom"
            tooltipId="daily-present"
          >
            <Button
              variant="primary"
              onClick={() => router.push("/teach?present=1")}
              title="Open this day's boards full-screen for live class delivery"
            >
              Present
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Body row: icon rail + day surface + optional schedule rail ──────
          The icon rail is always pinned to the far left as a sibling of the
          body. In VIEW mode the day surface is the full-width <DayViewV2>
          canvas (frame-branched internally, no right rail — the W3.8c
          Week-edit precedent). In EDIT mode the two-pane <DayEditSplit>
          replaces it, unchanged. When the Daily Schedule pill is ON, a
          <ScheduleDayPane variant="rail" /> mounts at the far right as an
          additive track (CSS hides it at ≤1280px). */}
      <div className={styles.bodyRow}>
        {/* ── Far-left: slim icon nav rail (sibling of the body) ─── */}
        <IconRail />
        {isEdit ? (
          /* ── W3.8b Day EDIT mode ─────────────────────────────────────────
              The two-pane agenda + fill-in-template split replaces the read
              canvas while the top-bar View↔Edit toggle is in Edit. Selection
              (selectedId) is SHARED with View mode; quick-add reuses the W3.7
              awaited mutator + error surface; Exit flips the persisted mode
              back to View. */
          <DayEditSplit
            dayLessons={dayLessons}
            week={week}
            day={selectedDay}
            dayLabel={dayLabel}
            selectedId={selectedId}
            onSelect={handleSelectLesson}
            onExit={() => setEdit(false)}
            onQuickAdd={() => void handleQuickAddLesson()}
            quickAdding={addingLesson}
            quickAddError={quickAddError}
          />
        ) : (
          /* ── W4 Day VIEW mode: the v2 read canvas ────────────────────────
              DayViewV2 is frame-branched internally (DayA / DayB / DayC) and
              renders its own day header, week strip, lesson list, and add
              affordances. Selection is the shell's LOCAL selectedId (the same
              state the deep-link trio seeds and Edit mode / the breadcrumb
              share) passed down with its setter — the canvas no longer reads
              the global selectedLessonId, so PR#27's global-clear stays intact
              and a `?lesson=` deep link focuses the RIGHT lesson. The canvas
              still reads usePlanner / useTheme for lessons + status writes;
              DailyView feeds it the derived day slice, labels, holiday node,
              and the nav / plan / quick-add / add-event seams. */
          <DayViewV2
            dayLessons={dayLessons}
            week={week}
            day={selectedDay}
            dayLabel={dayLabel}
            dateLabel={dateLabel}
            isToday={isToday}
            holidayNode={holiday ? <HolidayBanner name={holiday.name} /> : null}
            onShiftDay={handleShiftDay}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPlan={openLessonPlanner}
            onQuickAdd={() => void handleQuickAddLesson()}
            quickAdding={addingLesson}
            quickAddError={quickAddError}
            onAddEvent={handleOpenAddEvent}
          />
        )}
        {/* ── Schedule rail (Schedule pill ON) ─────────────────────────────
            Mounted as an additional track on the right end of the bodyRow.
            CSS hides it at ≤1280px so the day canvas keeps usable width on
            tablet / phone. */}
        {showScheduleRail && (
          <aside className={styles.scheduleRail} aria-label="Schedule rail">
            <ScheduleDayPane day={selectedDay} variant="rail" />
          </aside>
        )}
      </div>

      {/* ── Add-event form ────────────────────────────────────────────────
          Rendered at the root of the page tree so it sits outside every
          overflow:hidden ancestor and appears above all other chrome. It is
          position:fixed — it positions itself correctly regardless of DOM
          depth. Opened by the canvas's add-event affordance (onAddEvent). */}
      <AddEventForm
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        day={selectedDay}
        dayLabel={dayLabel}
      />
    </div>
  );
}
