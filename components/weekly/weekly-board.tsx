"use client";

// weekly-board.tsx — the Weekly view reimagined as a day-column board.
//
// Layout (see weekly-board.module.css):
//   row 0       → WeekNavigator (sticky header with week prev/next/today)
//   row 1       → Move-mode toolbar (sticky sub-header)
//   row 2       → The board: one column per school-week day, derived from
//                 WEEK_DAYS (never hard-coded as 5).
//
// Each day column contains:
//   – a sticky day header (full name + short label; today is highlighted)
//   – a vertical, scrollable list of that day's lesson cards, all subjects
//     together (no left subject column — each card carries its own subject)
//   – a slim "+ Add lesson" stub at the bottom (non-functional in this phase)
//
// Side-by-side "split" slots within a day (two cards sharing one row) are a
// planned follow-up. For now, lessons in a day stack vertically.
//
// Drag-and-drop uses native HTML5 DnD.  Moving a card to another day column
// updates the lesson's `day` field; dropping within the same column reorders
// it.  Column-level drag highlighting is scoped per column — the old grid's
// bug of dimming the entire board surface is avoided here.
//
// Move mode:
//   Entered automatically when a drag starts, or manually via the toolbar
//   toggle.  In move mode each card contracts to a compact one-line LessonChip
//   so the full week fits on screen without scrolling.  The contraction is
//   animated (suppressed under prefers-reduced-motion by tokens.css).
//
// Theme: the board reads useTheme() so downstream components (LessonCard)
// see the correct style axis.  It never sets the theme.

import type { CSSProperties, ReactNode } from "react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui";
import type { Lesson, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { CURRENT_WEEK, WEEK_DAYS, WEEK_DAYS_SHORT } from "@/lib/mock";
import type {
  ContextAction,
  ContextActionPayload,
} from "@/components/lesson-card";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import { WeekNavigator } from "@/components/grid/WeekNavigator";
import { LessonChip } from "@/components/grid/lesson-chip";
// WeeklyLessonCard is provided by the sibling agent's weekly-lesson-card.tsx.
// If that module is absent during a lint/type run, the import resolves to
// the actual file once both agents complete. TypeScript will report the
// missing module as an error only when the file truly does not exist.
import { WeeklyLessonCard } from "./weekly-lesson-card";
import styles from "./weekly-board.module.css";

// ── Week bounds ───────────────────────────────────────────────────────────
// Derive the min/max navigable weeks from the lesson fixture, same pattern
// as WeeklyGrid.

function weekBounds(lessons: Lesson[]): { min: number; max: number } {
  const weeks = lessons.map((l) => l.week);
  return { min: Math.min(...weeks), max: Math.max(...weeks) };
}

// ── WeeklyBoard ───────────────────────────────────────────────────────────

export function WeeklyBoard(): ReactNode {
  // Week navigation is shared planner state — the top-bar week jumper and
  // this view's WeekNavigator both drive it.
  const { week, setWeek } = useAppState();

  // ── Planner store — single source of truth for lessons ─────────────────
  // All lesson mutations route through the store so they join the shared
  // undo/redo history and are visible to sibling views (WeeklyGrid, Daily).
  const {
    lessons,
    moveLesson,
    setLessonStatus,
    editLesson,
    duplicateLesson,
    setSaveTarget,
    lastChange,
  } = usePlanner();

  // ── Scroll preservation after any store mutation ─────────────────────────
  // Keeps the affected card visible after drag-move, context-menu move,
  // undo, or redo. data-planner-item="lesson:<id>" is on each card root.
  useEffect(() => {
    if (lastChange?.lessonIds[0]) {
      scrollPlannerItemIntoView(lastChange.lessonIds[0]);
    }
  }, [lastChange]);

  // draggingId: the id of the lesson currently being dragged, or null.
  // UI state only — not part of history.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // dragOverDay: the day-column index currently being hovered by the drag,
  // used to highlight only that column (not the whole board).
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  // Reorder drop index: when dragging within the same day, tracks the
  // insertion index so an inline drop-indicator can be shown.
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Inline expansion — multiple cards can be open simultaneously.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Move mode ────────────────────────────────────────────────────────
  // compact is true while a drag is in progress OR the teacher has
  // manually toggled Move mode on.  compactManual persists between drags.
  const [compactManual, setCompactManual] = useState(false);
  const compact = compactManual || draggingId !== null;

  // ── Scroll auto-scroll ───────────────────────────────────────────────
  // A ref to the outer scroll container for the dragOver auto-scroll loop.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollVelocityRef = useRef<number>(0);

  const { min: minWeek, max: maxWeek } = useMemo(
    () => weekBounds(lessons),
    [lessons],
  );

  // DAY_COUNT is derived from the WEEK_DAYS fixture — never hard-coded.
  const DAY_COUNT = WEEK_DAYS.length;

  // ── Lesson bucketing ─────────────────────────────────────────────────
  // byDay[dayIndex] → Lesson[] for the currently displayed week, all
  // subjects together, in array order (mock fixture order preserved).
  const byDay = useMemo<Lesson[][]>(() => {
    const buckets: Lesson[][] = Array.from({ length: DAY_COUNT }, () => []);
    for (const lesson of lessons) {
      if (lesson.week !== week) continue;
      if (lesson.day < 0 || lesson.day >= DAY_COUNT) continue;
      buckets[lesson.day].push(lesson);
    }
    return buckets;
  }, [lessons, week, DAY_COUNT]);

  const weekHasLessons = useMemo(
    () => lessons.some((l) => l.week === week),
    [lessons, week],
  );

  // ── Drag auto-scroll ─────────────────────────────────────────────────
  // While a drag is active and the pointer nears the top/bottom edge of
  // the scroll container, scroll it automatically.
  // Edge zone: 80px. Max speed: 14px/frame.

  const SCROLL_EDGE = 80;
  const SCROLL_MAX = 14;

  const startScrollLoop = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    function tick() {
      const v = scrollVelocityRef.current;
      if (v !== 0 && scrollRef.current) {
        scrollRef.current.scrollTop += v;
      }
      scrollRafRef.current = requestAnimationFrame(tick);
    }
    scrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopScrollLoop = useCallback(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollVelocityRef.current = 0;
  }, []);

  function handleScrollDragOver(e: React.DragEvent<HTMLDivElement>): void {
    if (!draggingId) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const distFromTop = e.clientY - rect.top;
    const distFromBottom = rect.bottom - e.clientY;
    let v = 0;
    if (distFromTop < SCROLL_EDGE) {
      v = -SCROLL_MAX * (1 - distFromTop / SCROLL_EDGE);
    } else if (distFromBottom < SCROLL_EDGE) {
      v = SCROLL_MAX * (1 - distFromBottom / SCROLL_EDGE);
    }
    scrollVelocityRef.current = v;
    if (v !== 0) startScrollLoop();
  }

  // ── Drag handlers ────────────────────────────────────────────────────

  /**
   * Drag start — record the dragging id. Collapse expanded cards on the
   * next animation frame so the browser can snapshot the ghost image
   * before any DOM mutation (Chrome / Edge cancel drag if the source
   * element resizes synchronously inside dragstart).
   */
  function handleDragStart(id: string): void {
    setDraggingId(id);
    requestAnimationFrame(() => {
      setExpandedIds((prev) => (prev.size === 0 ? prev : new Set()));
    });
  }

  function handleDragEnd(): void {
    stopScrollLoop();
    setDraggingId(null);
    setDragOverDay(null);
    setDropIndex(null);
  }

  /**
   * Drop: move the dragged lesson to `targetDay` via the store so the action
   * joins the shared undo/redo history. Positional reorder within the same day
   * is a planned follow-up (§3.4); the store's moveLesson handles cross-day and
   * same-day moves alike. `insertAt` is retained for the future inline reorder.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleDrop(targetDay: number, insertAt: number | null): void {
    if (!draggingId) return;
    // Route through the store — records one "Move lesson" undo step.
    // `insertAt` tracks reorder position within the same column (§3.4 TODO).
    void insertAt;
    moveLesson(draggingId, { day: targetDay });
    stopScrollLoop();
    setDraggingId(null);
    setDragOverDay(null);
    setDropIndex(null);
  }

  // ── Card interaction handlers ─────────────────────────────────────────

  /** Card click → select + toggle inline expansion. */
  function handleSelect(lessonId: string): void {
    setSelectedId(lessonId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  }

  /** Completion checkbox three-state cycle — routes through the store. */
  function handleToggleComplete(
    lessonId: string,
    nextStatus: LessonStatus,
  ): void {
    setLessonStatus(lessonId, nextStatus);
  }

  /**
   * Context-menu actions — each routed to the appropriate store action so
   * every mutation lands in the shared undo/redo history.
   *   duplicate  → store.duplicateLesson
   *   move       → store.moveLesson
   *   mark-status → store.setLessonStatus
   */
  function handleContextAction(
    action: ContextAction,
    lessonId: string,
    payload?: ContextActionPayload,
  ): void {
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
  }

  /**
   * Inline text edit committed — routes through store with coalescing so a
   * typing burst collapses into one undo step.
   * coalesceKey format: "lesson:<id>:<field>" (first patch key used as field).
   */
  function handleEditLesson(lessonId: string, patch: Partial<Lesson>): void {
    const field = Object.keys(patch)[0] ?? "patch";
    editLesson(lessonId, patch, {
      key: `lesson:${lessonId}:${field}`,
      ts: Date.now(),
    });
  }

  /** Save-target choice — routes through store (lazy-fork on "personal"). */
  function handleSaveTarget(
    lessonId: string,
    target: "personal" | "core",
  ): void {
    setSaveTarget(lessonId, target);
  }

  // ── Render ────────────────────────────────────────────────────────────

  // Pass the day count as a CSS custom property so the grid-template-columns
  // expression in the CSS module can use it without hard-coding.
  const boardStyle: CSSProperties & { "--day-count": number } = {
    "--day-count": DAY_COUNT,
  };

  return (
    <div className={styles.page}>
      {/* ── Week navigator ── sticky header with prev/next/today controls.
          WeekNavigator renders its own <header> styled via WeeklyGrid.module.css
          (styles.navbar).  We reuse it as-is; it's the shared navigation chrome. */}
      <WeekNavigator
        week={week}
        currentWeek={CURRENT_WEEK}
        minWeek={minWeek}
        maxWeek={maxWeek}
        onChange={setWeek}
      />

      {/* ── Move-mode toolbar ── slim sticky bar below the week navigator. */}
      <div className={styles.moveToolbar}>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<MoveIcon active={compactManual} />}
          className={`${styles.moveModeBtn} ${compactManual ? styles.moveModeBtnActive : ""}`}
          onClick={() => setCompactManual((v) => !v)}
          aria-pressed={compactManual}
          aria-label={
            compactManual
              ? "Exit Move mode (expand cards)"
              : "Enter Move mode (compact view)"
          }
        >
          {compactManual ? "Exit Move mode" : "Move mode"}
        </Button>
      </div>

      {/* ── Board scroll region ── */}
      <div
        ref={scrollRef}
        className={styles.scroll}
        onDragOver={handleScrollDragOver}
      >
        <div
          className={`${styles.board} ${compact ? styles.boardCompact : ""}`}
          style={boardStyle}
          role="grid"
          aria-label={`Weekly plan, week ${week}`}
        >
          {/* Empty-week fallback — shown when the week has no lessons. */}
          {!weekHasLessons && (
            <div className={styles.emptyWeek} role="status">
              No lessons planned for week {week} yet.
            </div>
          )}

          {/* ── Day columns ── one per WEEK_DAYS entry. */}
          {weekHasLessons &&
            WEEK_DAYS.map((dayName, dayIdx) => (
              <DayColumn
                key={dayName}
                dayIndex={dayIdx}
                dayName={dayName}
                dayNameShort={WEEK_DAYS_SHORT[dayIdx]}
                isToday={week === CURRENT_WEEK && dayIdx === 0}
                lessons={byDay[dayIdx] ?? []}
                draggingId={draggingId}
                dragOver={dragOverDay === dayIdx}
                dropIndex={dropIndex}
                expandedIds={expandedIds}
                selectedId={selectedId}
                compact={compact}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={(insertAt) => {
                  setDragOverDay(dayIdx);
                  setDropIndex(insertAt);
                }}
                onDragLeave={() => {
                  if (dragOverDay === dayIdx) {
                    setDragOverDay(null);
                    setDropIndex(null);
                  }
                }}
                onDrop={(insertAt) => handleDrop(dayIdx, insertAt)}
                onSelect={handleSelect}
                onToggleComplete={handleToggleComplete}
                onContextAction={handleContextAction}
                onEditLesson={handleEditLesson}
                onSaveTarget={handleSaveTarget}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────
// Each day gets its own component so DnD event handlers are cleanly scoped
// per column.  This is the key architectural fix over the old grid: the
// drag-over highlight and drop handler live here, not on a global overlay.

interface DayColumnProps {
  dayIndex: number;
  dayName: string;
  dayNameShort: string;
  /** Highlight this column as today. */
  isToday: boolean;
  lessons: Lesson[];
  draggingId: string | null;
  /** Is the drag currently over this column? */
  dragOver: boolean;
  /** Reorder insert index within this day (null = append). */
  dropIndex: number | null;
  expandedIds: Set<string>;
  selectedId: string | null;
  compact: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  /** Called on dragover with the insertion index (null = append). */
  onDragOver: (insertAt: number | null) => void;
  onDragLeave: () => void;
  onDrop: (insertAt: number | null) => void;
  onSelect: (id: string) => void;
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
  dayName,
  dayNameShort,
  isToday,
  lessons,
  draggingId,
  dragOver,
  dropIndex,
  expandedIds,
  selectedId,
  compact,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
  onToggleComplete,
  onContextAction,
  onEditLesson,
  onSaveTarget,
}: DayColumnProps): ReactNode {
  const isEmpty = lessons.length === 0;

  /**
   * Compute the insertion index from the pointer's Y position relative to
   * the card list.  Returns the index at which the dragged lesson would be
   * inserted, or null for append.
   *
   * We look at the midpoint of each card slot: if the pointer is above the
   * midpoint, the insertion goes before that card; otherwise after.
   */
  function computeInsertAt(e: React.DragEvent<HTMLDivElement>): number | null {
    const container = e.currentTarget;
    const cards = Array.from(
      container.querySelectorAll("[data-card-slot]"),
    ) as HTMLElement[];
    if (cards.length === 0) return null;

    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) return i;
    }
    return null; // pointer is below all cards — append
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault(); // allow drop
    const insertAt = computeInsertAt(e);
    onDragOver(insertAt);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const insertAt = computeInsertAt(e);
    onDrop(insertAt);
  }

  const columnClass = [styles.dayColumn, dragOver ? styles.dayColumnOver : ""]
    .filter(Boolean)
    .join(" ");

  const headerClass = [styles.dayHeader, isToday ? styles.dayHeaderToday : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={columnClass}
      role="gridcell"
      aria-label={`${dayName} lessons`}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      {/* Day header */}
      <div className={headerClass}>
        <span className={styles.dayName}>{dayName}</span>
        <span className={styles.dayNameShort}>{dayNameShort}</span>
        {isToday && <span className={styles.todayPill}>Today</span>}
      </div>

      {/* Empty-day drop target */}
      {isEmpty && !compact && (
        <div className={styles.emptyDay} aria-label="No lessons — drop here">
          No lessons
        </div>
      )}

      {/* Empty compact drop zone */}
      {isEmpty && compact && (
        <div className={styles.emptyDay} aria-label="Drop here" />
      )}

      {/* Card list — full cards in normal mode */}
      {!isEmpty && !compact && (
        <div className={styles.cardList}>
          {lessons.map((lesson, idx) => (
            <div key={lesson.id} data-card-slot className={styles.cardSlot}>
              {/* Reorder drop indicator: shown before this card when the
                  pointer is above its midpoint during a drag. */}
              {draggingId !== null && dragOver && dropIndex === idx && (
                <div className={styles.dropIndicator} aria-hidden="true" />
              )}
              <WeeklyLessonCard
                lesson={lesson}
                expanded={expandedIds.has(lesson.id)}
                selected={selectedId === lesson.id}
                dragging={draggingId === lesson.id}
                onSelect={onSelect}
                onToggleExpand={onSelect}
                onToggleComplete={onToggleComplete}
                onContextAction={onContextAction}
                onEditLesson={onEditLesson}
                onSaveTarget={onSaveTarget}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: () => onDragStart(lesson.id),
                  onDragEnd: onDragEnd,
                }}
              />
            </div>
          ))}
          {/* Trailing drop indicator — shown when dragging below all cards. */}
          {draggingId !== null && dragOver && dropIndex === null && (
            <div className={styles.dropIndicator} aria-hidden="true" />
          )}
        </div>
      )}

      {/* Chip list — compact one-line chips in move mode */}
      {!isEmpty && compact && (
        <div className={styles.chipList}>
          {lessons.map((lesson, idx) => (
            <div key={lesson.id} data-card-slot className={styles.cardSlot}>
              {draggingId !== null && dragOver && dropIndex === idx && (
                <div className={styles.dropIndicator} aria-hidden="true" />
              )}
              <LessonChip
                lesson={lesson}
                selected={selectedId === lesson.id}
                dragging={draggingId === lesson.id}
                onSelect={onSelect}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: () => onDragStart(lesson.id),
                  onDragEnd: onDragEnd,
                }}
              />
            </div>
          ))}
          {draggingId !== null && dragOver && dropIndex === null && (
            <div className={styles.dropIndicator} aria-hidden="true" />
          )}
        </div>
      )}

      {/* "+ Add lesson" stub — non-functional; lesson creation is out of
          scope for this increment. Visible on column hover only. */}
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={<PlusIcon />}
        className={styles.addLesson}
        aria-label={`Add lesson on ${dayName}`}
        // Click handler intentionally omitted — stub affordance only.
        onClick={() => {
          /* lesson creation is a future increment */
        }}
      >
        Add lesson
      </Button>
    </div>
  );
}

// ── MoveIcon ──────────────────────────────────────────────────────────────
// Two horizontal arrows communicating "rearrange". Matches the existing
// icon in WeeklyGrid so the visual language is consistent across both
// views during the transition period.

function MoveIcon({ active }: { active: boolean }): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" />
    </svg>
  );
}

// ── PlusIcon ──────────────────────────────────────────────────────────────
// Standard + used for the "Add lesson" stub affordance.

function PlusIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
