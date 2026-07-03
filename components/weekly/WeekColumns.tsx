"use client";

// WeekColumns.tsx — the DAY-COLUMN traversal of the Weekly view.
//
// WeeklyGrid (components/grid/WeeklyGrid.tsx) is the SUBJECT×DAY matrix:
// subject rows crossed with day columns. WeekColumns is the alternate reading
// of the SAME week — one column per configured school day, each column a
// vertical stack of THAT day's lessons across every subject. Same data, same
// rich WeeklyLessonCard (so the v2 frame material register + the three-tier
// forking cue come for free), different arrangement.
//
// Bundle reference: the v2 mockup's "WeekB" surface — `.vb-week` > `.vb-col`
// (a `.vb-colh` sticky header + a stacked card list). This is a faithful,
// idiomatic-React recreation of that layout against the token system.
//
// Desktop/tablet canvas only. WeeklyShell forces WeeklyList at ≤900px, so —
// exactly like WeeklyGrid — this component only ever renders >900px and may
// scroll HORIZONTALLY inside its own `.scroll` container. The DOCUMENT never
// scrolls sideways (CLAUDE.md §4 hard rule); the wide grid scrolls in-track.
//
// Drop model (simpler than the grid's `cell:<subject>:<day>`): each day column
// is a droppable `daycol:<dayIndex>`. Dropping a card there changes ONLY its
// day — the subject is preserved (moveLesson keeps every field the patch omits).
//
// The drag-state / collapse-on-drag / today / holiday / filter logic all mirror
// WeeklyGrid so the two surfaces behave identically; see the citations inline.

import type { ReactNode, KeyboardEvent } from "react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { useReducedMotion } from "framer-motion";
import { Tooltip } from "@/components/ui";
import { useLabels } from "@/lib/labels";
import type { Lesson, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import { useOrderedWeekdays } from "@/lib/week-order";
import { useHolidaysByDay } from "@/lib/use-day-holiday";
import { todayColumnIndex } from "@/lib/now-anchor";
import type { Weekday } from "@/lib/use-school-week";
import { CURRENT_WEEK } from "@/lib/mock";
import {
  type DragState,
  type Density,
  densityFor,
  useDndSensors,
} from "@/lib/collapse-on-drag";
// Direct sibling import (folder convention — WeeklyShell does the same for
// its ./WeeklyViewControls etc.): importing the folder's OWN barrel from a
// module the barrel re-exports is a circular dependency.
import { WeeklyLessonCard } from "./weekly-lesson-card";
import type { ContextAction, ContextActionPayload } from "./weekly-lesson-card";
import styles from "./WeekColumns.module.css";

// ── Today resolution ────────────────────────────────────────────────────────
// Which column (0-based index into the CONFIGURED school week) is today?
// Verbatim from WeeklyGrid.tsx (lines 117-130): SSR-safe (initial null so the
// server HTML carries no emphasis), a 60s interval migrates the emphasis at
// midnight, and setState with the SAME index bails out of re-rendering.
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

export function WeekColumns(): ReactNode {
  const labels = useLabels();

  // ── Configured school week — the ONE ordered-week contract ────────────────
  // Day columns, the day COUNT, and weekday labels all derive from the team's
  // configured school week (never a hard-coded weekday set). `weekdays` is
  // ordered; `.index` is the value a lesson's `day` field must equal to land
  // in that column. SSR-safe by inheritance (see lib/week-order.ts).
  const weekdays = useOrderedWeekdays();
  const DAY_COUNT = weekdays.length;
  const { week, search, filters, selectedLessonId, setSelectedLessonId } =
    useAppState();
  const prefersReducedMotion = useReducedMotion();

  // ── Planner store — single source of truth for lessons ────────────────────
  const {
    lessons,
    moveLesson,
    setLessonStatus,
    editLesson,
    duplicateLesson,
    setSaveTarget,
    lastChange,
    subjects,
    subjectById,
  } = usePlanner();

  // ── Inline expansion state (UI only — not part of history) ────────────────
  // Multiple cards may be open at once; onSelect toggles membership. Mirrors
  // WeeklyGrid's expandedIds Set + drag-start snapshot (WeeklyGrid 212-214).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const expandedSnapshotRef = useRef<Set<string> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Previous app-state selection — lets the sync effect below collapse a card
  // when its detail panel is dismissed from OUTSIDE (WeeklyGrid 222).
  const prevSelectedLessonIdRef = useRef<string | null>(selectedLessonId);

  // ── dnd-kit drag state (board-level; never per-card) ──────────────────────
  const [dragState, setDragState] = useState<DragState>({ phase: "idle" });
  const density: Density = densityFor(dragState);
  const sensors = useDndSensors();

  // ── Accessibility live region ─────────────────────────────────────────────
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // ── Holiday lookup for the active week ────────────────────────────────────
  // Map<dayIndex, Holiday>; days without a holiday are absent (WeeklyGrid 265).
  const holidaysByDay = useHolidaysByDay(week, DAY_COUNT);

  // ── Today emphasis ────────────────────────────────────────────────────────
  // Applies ONLY when the visible week IS the current week AND today is a
  // configured school day; a holiday on today suppresses the emphasis (the
  // holiday treatment carries the orientation instead). Verbatim derivation
  // from WeeklyGrid.tsx lines 280-288, incl. the CURRENT_WEEK mock caveat.
  const schoolWeekTokens = useMemo(
    () => weekdays.map((d) => d.token),
    [weekdays],
  );
  const todayIdx = useTodayColumnIndex(schoolWeekTokens);
  const emphasizedTodayIdx =
    week === CURRENT_WEEK && todayIdx !== null && !holidaysByDay.has(todayIdx)
      ? todayIdx
      : null;

  // ── Scroll preservation after any store mutation ──────────────────────────
  // Scroll the moved/edited card into view so the teacher never loses it
  // (WeeklyGrid 294-298). data-planner-item="lesson:<id>" is on each card root.
  useEffect(() => {
    if (lastChange?.lessonIds[0]) {
      scrollPlannerItemIntoView(lastChange.lessonIds[0]);
    }
  }, [lastChange]);

  // ── Search + filter predicate ─────────────────────────────────────────────
  // Copied verbatim from WeeklyGrid.tsx lines 303-336: search over
  // title+preview+directions; subjects/units/statuses/standards some-match;
  // each axis a no-op when its filter array is empty; filters.showHolidays
  // is intentionally ignored (holidays are a column treatment, not a lesson).
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

  // ── Subject → catalog-order index ─────────────────────────────────────────
  // Within a day column, lessons are ordered by the subject catalog order
  // (the locked team-wide §4 order) so every column reads subjects top-to-
  // bottom in the same sequence. Lessons of the same subject keep their array
  // order (a stable sort preserves it).
  const subjectRank = useMemo(() => {
    const rank = new Map<string, number>();
    subjects.forEach((s, i) => rank.set(s.id, i));
    return rank;
  }, [subjects]);

  // ── byDay — visible lessons bucketed by day, subject-ordered within ───────
  // Applies the week-match + search/filter gates before bucketing, mirroring
  // WeeklyGrid's bySubjectDay (340-352) EXACTLY — including its deliberate
  // absence of an `archived` filter. The 5s ArchiveToast (the undo affordance
  // for the destructive Archive action) renders INSIDE WeeklyLessonCard, so
  // filtering archived here would unmount the card in the same render the
  // teacher archives it and the toast would never paint (§4a W3.6-c3 finding
  // #2). It would also make Paper hide lessons that Glass/Color still show —
  // an appearance axis must never change which data exists. The app-wide
  // "views must filter archived" contract (lib/types.ts) is implemented only
  // by Year today; adopting it on the weekly surfaces is deferred until the
  // archive toast is lifted out of the card.
  const byDay = useMemo(() => {
    const buckets: Lesson[][] = Array.from({ length: DAY_COUNT }, () => []);
    for (const lesson of lessons) {
      if (lesson.week !== week) continue;
      if (lesson.day < 0 || lesson.day >= DAY_COUNT) continue;
      if (!lessonMatchesQuery(lesson)) continue;
      buckets[lesson.day].push(lesson);
    }
    // Stable subject-order sort per column (Array.prototype.sort is stable in
    // every supported runtime, so same-subject lessons keep their order).
    for (const dayLessons of buckets) {
      dayLessons.sort(
        (a, b) =>
          (subjectRank.get(a.subject) ?? 999) -
          (subjectRank.get(b.subject) ?? 999),
      );
    }
    return buckets;
  }, [lessons, week, DAY_COUNT, lessonMatchesQuery, subjectRank]);

  // ── Drop-target resolution (§4a W3.6-c3 finding #1) ───────────────────────
  // Every card is itself a droppable (useSortable wraps useDroppable), so with
  // closestCenter the `over` id while hovering a POPULATED region of a target
  // column is usually a LESSON id, not the column's `daycol:` id — and day
  // columns are densely covered by design. Resolving a lesson-id overId to the
  // day it renders in makes "drop anywhere in the column" work; without this,
  // drops over occupied regions silently no-op while the empty tail works.
  const resolveOverDay = useCallback(
    (overId: string | null): number | null => {
      if (!overId) return null;
      if (overId.startsWith("daycol:")) {
        const day = Number(overId.slice(7));
        return Number.isNaN(day) || day < 0 || day >= DAY_COUNT ? null : day;
      }
      // A lesson id — target the day that lesson is rendered in (this week
      // only; ids from other weeks never render here, but stay defensive).
      const over = lessons.find((l) => l.id === overId);
      if (!over || over.week !== week) return null;
      return over.day >= 0 && over.day < DAY_COUNT ? over.day : null;
    },
    [lessons, week, DAY_COUNT],
  );

  // ── Sync: collapse a card when its detail panel is dismissed externally ───
  // When app-state `selectedLessonId` transitions from a concrete id → null
  // (the WeeklyShell drawer's close button / backdrop / Esc), undo exactly the
  // expansion that the matching click added (WeeklyGrid 421-432).
  useEffect(() => {
    const prev = prevSelectedLessonIdRef.current;
    prevSelectedLessonIdRef.current = selectedLessonId;
    if (selectedLessonId === null && prev !== null) {
      setExpandedIds((curr) => {
        if (!curr.has(prev)) return curr;
        const next = new Set(curr);
        next.delete(prev);
        return next;
      });
    }
  }, [selectedLessonId]);

  // ── dnd-kit event handlers (mirror WeeklyGrid 445-514) ────────────────────

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    // Snapshot the expanded set, then collapse all to chips immediately.
    expandedSnapshotRef.current = new Set(expandedIds);
    setExpandedIds(new Set());
    setDragState({ phase: "dragging", activeId: id, overId: null });
    const lesson = lessons.find((l) => l.id === id);
    const subjectName = lesson ? subjectById[lesson.subject]?.name : "";
    setLiveAnnouncement(
      `Picked up ${subjectName ? subjectName + " lesson: " : "lesson: "}${lesson?.title ?? id}. Drag to a different day.`,
    );
  }

  function handleDragOver(event: DragOverEvent): void {
    const overId = event.over ? String(event.over.id) : null;
    setDragState((prev) =>
      prev.phase === "dragging" ? { ...prev, overId } : prev,
    );
    // Announce the RESOLVED day (a lesson-id overId resolves to the day it
    // renders in — see resolveOverDay), so hovering a populated region still
    // reads "Over Tuesday" rather than staying silent.
    const overDay = resolveOverDay(overId);
    if (overDay !== null) {
      const dayName = weekdays[overDay]?.longLabel ?? String(overDay);
      setLiveAnnouncement(`Over ${dayName}.`);
    }
  }

  function handleDragEnd(event: DragEndEvent): void {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    // Restore the snapshotted expansion set + return to idle synchronously in
    // the same handler so there is no intermediate wrong-state render
    // (WeeklyGrid 484-487). The DragOverlay's own dropAnimation runs in parallel.
    const snapshot = expandedSnapshotRef.current;
    expandedSnapshotRef.current = null;
    setExpandedIds(snapshot ?? new Set());
    setDragState({ phase: "idle" });

    const day = resolveOverDay(overId);
    if (day !== null) {
      const dayName = weekdays[day]?.longLabel ?? String(day);
      // Same-day drop → deliberate no-op: no store dispatch, so no spurious
      // "Move lesson" undo step and no misleading "Dropped in <day>"
      // announcement (§4a W3.6-c3 low #1; the reducer's sameSlot guard already
      // protects the `moved` fork flag either way — planner-store 738-750).
      const source = lessons.find((l) => l.id === activeId);
      if (source && source.week === week && source.day === day) {
        setLiveAnnouncement(`Kept in ${dayName}.`);
        return;
      }
      // Only the day changes — subject is preserved (moveLesson keeps every
      // field the patch omits). Records one undo step ("Move lesson").
      moveLesson(activeId, { day });
      setLiveAnnouncement(`Dropped in ${dayName}.`);
    } else {
      setLiveAnnouncement("Drag cancelled.");
    }
  }

  function handleDragCancel(): void {
    setExpandedIds(expandedSnapshotRef.current ?? new Set());
    expandedSnapshotRef.current = null;
    setDragState({ phase: "idle" });
    setLiveAnnouncement("Drag cancelled.");
  }

  // ── Selection / expansion ──────────────────────────────────────────────────

  // Plain SINGLE click — ONE combined toggle: inline expand AND the detail
  // surface open/close together (WeeklyGrid.handleSelect, 523-548, minus the
  // bulk-selection axis which is grid-only).
  const handleSelect = useCallback(
    (lessonId: string): void => {
      setSelectedId(lessonId);
      const isExpanded = expandedIds.has(lessonId);
      if (isExpanded) {
        if (selectedLessonId === lessonId) setSelectedLessonId(null);
      } else {
        setSelectedLessonId(lessonId);
      }
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(lessonId)) next.delete(lessonId);
        else next.add(lessonId);
        return next;
      });
    },
    [expandedIds, selectedLessonId, setSelectedLessonId],
  );

  // DOUBLE click / Shift+Enter — FORCE-OPEN (idempotent): the lesson ends up
  // both expanded inline AND with its detail panel open (WeeklyGrid 575-590).
  const handleActivateDetail = useCallback(
    (lessonId: string): void => {
      setSelectedLessonId(lessonId);
      setSelectedId(lessonId);
      setExpandedIds((prev) => {
        if (prev.has(lessonId)) return prev;
        const next = new Set(prev);
        next.add(lessonId);
        return next;
      });
    },
    [setSelectedLessonId],
  );

  const handleToggleComplete = useCallback(
    (lessonId: string, nextStatus: LessonStatus): void => {
      setLessonStatus(lessonId, nextStatus);
    },
    [setLessonStatus],
  );

  // Context-menu actions routed to the store so each mutation joins the shared
  // undo/redo history (WeeklyGrid.handleContextAction, 667-693).
  const handleContextAction = useCallback(
    (
      action: ContextAction,
      lessonId: string,
      payload?: ContextActionPayload,
    ): void => {
      if (action === "duplicate") {
        duplicateLesson(lessonId);
        return;
      }
      if (action === "move") {
        const toDay = typeof payload?.day === "number" ? payload.day : null;
        const toWeek = typeof payload?.week === "number" ? payload.week : null;
        if (toDay === null && toWeek === null) return;
        if (toDay !== null && (toDay < 0 || toDay >= DAY_COUNT)) return;
        moveLesson(lessonId, {
          ...(toDay !== null ? { day: toDay } : {}),
          ...(toWeek !== null ? { week: toWeek } : {}),
        });
        setSelectedId(lessonId);
        return;
      }
      if (action === "mark-status" && payload?.status) {
        setLessonStatus(lessonId, payload.status);
      }
    },
    [duplicateLesson, moveLesson, setLessonStatus, DAY_COUNT],
  );

  // Inline text edit — routes through the store with coalescing so a typing
  // burst collapses into one undo step (WeeklyGrid.handleEditLesson, 700-706).
  const handleEditLesson = useCallback(
    (lessonId: string, patch: Partial<Lesson>): void => {
      const field = Object.keys(patch)[0] ?? "patch";
      editLesson(lessonId, patch, {
        key: `lesson:${lessonId}:${field}`,
        ts: Date.now(),
      });
    },
    [editLesson],
  );

  const handleSaveTarget = useCallback(
    (lessonId: string, target: "personal" | "core"): void => {
      setSaveTarget(lessonId, target);
    },
    [setSaveTarget],
  );

  // ── Active lesson for the DragOverlay ─────────────────────────────────────
  const activeLessonId = dragState.phase !== "idle" ? dragState.activeId : null;
  const activeLesson = activeLessonId
    ? lessons.find((l) => l.id === activeLessonId)
    : null;

  const dragActiveId = dragState.phase !== "idle" ? dragState.activeId : null;

  // Resolved hovered DAY during a drag — drives each column's drop glow. The
  // column's own useDroppable isOver misses hovers over its cards (the card's
  // droppable wins closestCenter), so the glow flickered off exactly over the
  // populated region; resolving here keeps it lit column-wide (§4a finding #1).
  const dragOverDayIdx =
    dragState.phase === "dragging" ? resolveOverDay(dragState.overId) : null;

  return (
    <div
      className={styles.page}
      title="Your week arranged one column per school day — each column stacks that day's lessons across every subject. Drag a card to a different day to reschedule it."
    >
      {/* Accessibility live region — announces drag events for screen readers. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {liveAnnouncement}
      </div>

      <DndContext
        // Stable id makes dnd-kit's a11y ids deterministic across SSR/client
        // (WeeklyGrid 761-762) — avoids a hydration mismatch on the drag handle.
        id="weekly-columns-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.scroll}>
          <div
            className={styles.week}
            // A set of per-day lists, NOT a 2-D grid: role=grid without
            // row/gridcell structure is a broken ARIA contract (§4a finding
            // #3). Each child column is a labelled group holding a list.
            role="group"
            aria-label={`Weekly plan by day, ${labels.week.toLowerCase()} ${week}`}
            // One column per configured school day (never a fixed 5).
            style={{ "--day-count": DAY_COUNT } as React.CSSProperties}
          >
            {weekdays.map(({ token, index: dayIdx, label, longLabel }) => (
              <DayColumn
                key={token}
                dayIndex={dayIdx}
                label={label}
                longLabel={longLabel}
                lessons={byDay[dayIdx] ?? []}
                isToday={dayIdx === emphasizedTodayIdx}
                holiday={holidaysByDay.get(dayIdx) ?? null}
                isDropTarget={dragOverDayIdx === dayIdx}
                density={density}
                expandedIds={expandedIds}
                selectedId={selectedLessonId ?? selectedId}
                dragActiveId={dragActiveId}
                emptyLabel={`No ${labels.lesson.toLowerCase()}s`}
                onSelect={handleSelect}
                onActivateDetail={handleActivateDetail}
                onToggleComplete={handleToggleComplete}
                onContextAction={handleContextAction}
                onEditLesson={handleEditLesson}
                onSaveTarget={handleSaveTarget}
              />
            ))}
          </div>
        </div>

        {/* DragOverlay — floating chip follows the cursor (WeeklyGrid 953-978). */}
        <DragOverlay
          dropAnimation={
            prefersReducedMotion
              ? null
              : { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }
          }
        >
          {activeLesson && (
            <div className={styles.overlayCard}>
              <WeeklyLessonCard
                lesson={activeLesson}
                density="compact"
                overlay
                expanded={false}
                selected={false}
                dragging={true}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────────
// One school-day column: a sticky header (day name + short label + optional
// Today chip / holiday pill) over a droppable, sortable vertical stack of that
// day's lesson cards. Split out so useDroppable() runs at a stable hook
// position (it cannot be called inside the .map above).

interface DayColumnProps {
  dayIndex: number;
  label: string;
  longLabel: string;
  lessons: Lesson[];
  isToday: boolean;
  holiday: { name: string } | null;
  /** True while a dragged card hovers ANYWHERE over this column (resolved by
   *  the parent — the column's own isOver misses hovers over its cards). */
  isDropTarget: boolean;
  density: Density;
  expandedIds: Set<string>;
  selectedId: string | null;
  dragActiveId: string | null;
  emptyLabel: string;
  onSelect: (id: string) => void;
  onActivateDetail: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
  onSaveTarget: (id: string, target: "personal" | "core") => void;
}

function DayColumn({
  dayIndex,
  label,
  longLabel,
  lessons,
  isToday,
  holiday,
  isDropTarget,
  density,
  expandedIds,
  selectedId,
  dragActiveId,
  emptyLabel,
  onSelect,
  onActivateDetail,
  onToggleComplete,
  onContextAction,
  onEditLesson,
  onSaveTarget,
}: DayColumnProps): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: `daycol:${dayIndex}` });
  const lessonIds = useMemo(() => lessons.map((l) => l.id), [lessons]);
  const isEmpty = lessons.length === 0;

  // isOver (the column droppable's own hit test — true over the empty tail) OR
  // the parent-resolved isDropTarget (true over the column's CARDS, where the
  // card's droppable wins closestCenter). Together: glow anywhere in-column.
  const glow = isOver || isDropTarget;

  return (
    <div
      ref={setNodeRef}
      // The column is a labelled GROUP, not a grid track: this layout is a set
      // of per-day lists, and claiming role=grid/columnheader without rows or
      // gridcells hands screen readers a broken 2-D contract (§4a finding #3).
      // The group label carries the natural-language day description the old
      // columnheader aria-label held; the header below is purely visual.
      role="group"
      aria-label={
        holiday
          ? `${longLabel} (${label}) — holiday: ${holiday.name}`
          : isToday
            ? `${longLabel} (${label}) — today`
            : `${longLabel} (${label})`
      }
      className={`${styles.col} ${holiday ? styles.colHoliday : ""} ${
        isToday ? styles.colToday : ""
      } ${glow ? styles.colDropGlow : ""}`}
    >
      {/* Sticky day header — visually mirrors WeeklyGrid's day-header markup
          (783-849). Presentational: the group's aria-label above carries the
          day + today/holiday semantics, so the spans + chip stay aria-hidden
          (avoids the "SundaySun" double-read); the holiday pill keeps the
          CLAUDE.md §4 explanatory tooltip and its own label. */}
      <div
        className={`${styles.colHead} ${isToday ? styles.colHeadToday : ""} ${
          holiday ? styles.colHeadHoliday : ""
        }`}
      >
        <span aria-hidden="true" className={styles.colHeadName}>
          {longLabel}
        </span>
        <span aria-hidden="true" className={styles.colHeadDate}>
          {label}
        </span>
        {isToday && (
          <span className={styles.colHeadTodayChip} aria-hidden="true">
            Today
          </span>
        )}
        {holiday && (
          <Tooltip
            content={`This day is marked as a holiday (${holiday.name}) — your team's curriculum says no school on this date.`}
            side="bottom"
          >
            <span
              className={styles.colHeadHolidayPill}
              aria-label={`Holiday: ${holiday.name}`}
            >
              {holiday.name}
            </span>
          </Tooltip>
        )}
      </div>

      {/* Droppable, sortable card stack. verticalListSortingStrategy gives
          dnd-kit the within-column order for within-day reorder. */}
      <SortableContext items={lessonIds} strategy={verticalListSortingStrategy}>
        <div
          className={styles.stack}
          role="list"
          aria-label={`${longLabel} lessons`}
        >
          {isEmpty ? (
            // NOT aria-hidden: a screen-reader teacher must be able to tell an
            // empty day from a rendering gap (§4a low #6). Plain list content —
            // no role="status": five per-column live regions would chatter on
            // every filter change; the sr live region above covers drag events.
            <div className={styles.empty} role="listitem">
              {emptyLabel}
            </div>
          ) : (
            lessons.map((lesson) => (
              <ColumnLessonItem
                key={lesson.id}
                lesson={lesson}
                density={density}
                expanded={expandedIds.has(lesson.id)}
                selected={selectedId === lesson.id}
                dragging={dragActiveId === lesson.id}
                onSelect={onSelect}
                onActivateDetail={onActivateDetail}
                onToggleComplete={onToggleComplete}
                onContextAction={onContextAction}
                onEditLesson={onEditLesson}
                onSaveTarget={onSaveTarget}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ── ColumnLessonItem — dnd-kit sortable wrapper around a lesson card ──────────
// Mirrors GridCell.tsx's SortableLessonItem (111-217): useSortable applies the
// transform to the wrapper; listeners + attributes forward to the card's grip
// via dragHandleProps; single click selects (card's own handler), double-click
// / Shift+Enter opens the detail surface. Memoized so peers don't re-render on
// every onDragOver pointer-move during a drag (GridCell memo note, 100-110).

interface ColumnLessonItemProps {
  lesson: Lesson;
  density: Density;
  expanded: boolean;
  selected: boolean;
  dragging: boolean;
  onSelect: (id: string) => void;
  onActivateDetail: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
  onSaveTarget: (id: string, target: "personal" | "core") => void;
}

const ColumnLessonItem = React.memo(function ColumnLessonItem({
  lesson,
  density,
  expanded,
  selected,
  dragging,
  onSelect,
  onActivateDetail,
  onToggleComplete,
  onContextAction,
  onEditLesson,
  onSaveTarget,
}: ColumnLessonItemProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const wrapperStyle: React.CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    // Ghost the source slot while the DragOverlay follows the cursor.
    opacity: isDragging ? 0.35 : 1,
    position: "relative",
  };

  // dragHandleProps merges dnd-kit listeners + attributes so the grip icon in
  // the card header is the sole drag activator (GridCell 147-150).
  const dragHandleProps: React.HTMLAttributes<HTMLElement> = {
    ...listeners,
    ...attributes,
  };

  function handleWrapperDoubleClick(e: React.MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
    onActivateDetail(lesson.id);
  }

  // Keyboard equivalent of the double-click detail open (GridCell 179-185):
  // plain Enter expands the card inline via the card's own handler, so
  // Shift+Enter is reserved for the full detail surface.
  function handleWrapperKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onActivateDetail(lesson.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={wrapperStyle}
      className={styles.cardSlot}
      role="listitem"
      onDoubleClick={handleWrapperDoubleClick}
      onKeyDown={handleWrapperKeyDown}
      title="Double-click or Shift+Enter for full detail"
    >
      <WeeklyLessonCard
        lesson={lesson}
        density={density}
        expanded={expanded}
        selected={selected}
        dragging={dragging || isDragging}
        onSelect={onSelect}
        onToggleExpand={onSelect}
        onToggleComplete={onToggleComplete}
        onContextAction={onContextAction}
        onEditLesson={onEditLesson}
        onSaveTarget={onSaveTarget}
        dragHandleProps={dragHandleProps}
      />
    </div>
  );
});
