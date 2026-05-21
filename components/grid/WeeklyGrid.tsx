"use client";

// WeeklyGrid.tsx — the Weekly view: subjects × configurable-day grid.
//
// Layout (see WeeklyGrid.module.css):
//   row 0      → corner cell + day header cells (one per WEEK_DAYS entry)
//   rows 1..n  → one subject row each: subject-label cell + day cells
//
// Drag-and-drop uses @dnd-kit with the collapse-on-drag pattern (spec §3
// of 5.18.26 collapse_on_drag_pattern.md). The moment any drag starts every
// lesson card collapses to a 28px chip simultaneously; on drop they all
// re-expand. This multiplies visible drop targets and removes mid-drag scroll.
//
// Board-level DragState (spec §2.2):
//   idle      → all cards at full density
//   dragging  → all cards collapse to chips; DragOverlay shows floating chip
//
// NOTE: the `dropping` phase from the original spec has been eliminated
// (Bug 1 fix). Going dragging→idle synchronously in handleDragEnd means
// re-expansion begins within one render cycle (<30ms). The DragOverlay's
// own dropAnimation (220ms cubic-bezier) runs in parallel — they do not
// need to be sequenced.
//
// Expansion snapshot (spec §3.6):
//   On drag-start: snapshot expandedIds → expandedSnapshot.
//   On drop / cancel: restore expandedIds from snapshot, clear snapshot.
//   This preserves the teacher's per-card expansion without re-fetching.
//
// Drop model (spec §3.3):
//   Each cell is a droppable (id = "cell:<subjectId>:<day>").
//   Dropping on a cell moves the lesson's subject + day (optimistic local state).
//   CellDropZones (the old region-based overlay) is no longer used; cell-level
//   drop with the dnd-kit glow replaces it.
//
// Within-cell reorder (spec §3.4):
//   TODO §3.4 — full insertion-line reorder within a same-cell drop is deferred.
//   Currently a same-cell drop is treated as a no-op move (preserves position).
//
// Anchored chrome (spec §3.5):
//   Day headers, subject-label column, and week controls never collapse.
//
// Accessibility (spec §2.5):
//   KeyboardSensor via useDndSensors(). An aria-live="polite" region announces
//   pick-up / over / drop events for screen-reader users.
//
// Theme: `useTheme()` supplies the style axis (quiet/calm/vivid), which
// drives unit-cell shading. The palette axis is handled inside the per-subject
// color hook. The grid reads theme — it never sets it.

import type { ReactNode } from "react";
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
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useReducedMotion } from "framer-motion";
import type { Lesson, LessonStatus, SubjectId } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import type { ViewMode } from "@/lib/app-state";
import { useTheme } from "@/lib/theme";
import { useSubjectColor } from "@/lib/palette";
import {
  SUBJECTS,
  UNITS,
  CURRENT_WEEK,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
  SUBJECT_BY_ID,
} from "@/lib/mock";
import type {
  ContextAction,
  ContextActionPayload,
} from "@/components/lesson-card";
import type { CellLayout } from "@/lib/cell-layout";
import { cellKey } from "@/lib/cell-layout";
import { WeeklyLessonCard } from "@/components/weekly";
import {
  type DragState,
  type Density,
  densityFor,
  useDndSensors,
} from "@/lib/collapse-on-drag";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import { WeekNavigator } from "./WeekNavigator";
import { GridCell } from "./GridCell";
import { resolveCellShade } from "./unitShading";
import type { CellShade } from "./unitShading";
import { useGridNavigation } from "./useGridNavigation";
import type { CellNavProps, CellPos } from "./useGridNavigation";
import styles from "./WeeklyGrid.module.css";

const DAY_COUNT = WEEK_DAYS.length;

/** Span of navigable weeks, derived from the lesson fixture. */
function weekBounds(lessons: Lesson[]): { min: number; max: number } {
  const weeks = lessons.map((l) => l.week);
  return { min: Math.min(...weeks), max: Math.max(...weeks) };
}

export function WeeklyGrid(): ReactNode {
  const { style } = useTheme();
  const { week, setWeek, search, viewMode, filters } = useAppState();
  const prefersReducedMotion = useReducedMotion();

  // ── Planner store — single source of truth for lessons and layouts ─────────
  // Lesson mutations route through the store so they join the shared undo/redo
  // history and are visible to sibling views (Daily, Subject, TopBar).
  const {
    lessons,
    cellLayouts,
    moveLesson,
    setLessonStatus,
    editLesson,
    duplicateLesson,
    setSaveTarget,
    lastChange,
  } = usePlanner();

  // ── Inline expansion state ─────────────────────────────────────────────────
  // UI state only — expansion is not part of history.
  // Multiple cards may be open at once (spec §6.5 / §3.6).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  // Snapshot captured at drag-start; restored on drop / cancel (spec §3.6).
  const expandedSnapshotRef = useRef<Set<string> | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [maximizedCell, setMaximizedCell] = useState<string | null>(null);

  // ── dnd-kit drag state (spec §2.2) ────────────────────────────────────────
  // Also UI state — drag phase is never part of history.
  const [dragState, setDragState] = useState<DragState>({ phase: "idle" });
  const density: Density = densityFor(dragState);

  // ── Sensors (spec §2.1 / §2.5) ────────────────────────────────────────────
  const sensors = useDndSensors();

  // ── Accessibility live region ─────────────────────────────────────────────
  // Announces pick-up / over / drop for screen readers (spec §2.5).
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // ── Week bounds — derived from all lessons (including store mutations) ─────
  const { min: minWeek, max: maxWeek } = useMemo(
    () => weekBounds(lessons),
    [lessons],
  );

  // ── Scroll preservation after any store mutation ───────────────────────────
  // When a lesson is moved (drag, context-menu, undo/redo) we scroll the
  // affected card into view so the teacher never loses track of it.
  // data-planner-item="lesson:<id>" is set on each WeeklyLessonCard root.
  useEffect(() => {
    if (lastChange?.lessonIds[0]) {
      scrollPlannerItemIntoView(lastChange.lessonIds[0]);
    }
  }, [lastChange]);

  // ── Search + filter predicate ─────────────────────────────────────────────
  // Applied before bucketing so GridCell never sees lessons that don't match.
  // Each axis is a no-op when the corresponding array is empty (no constraint).
  const lessonMatchesQuery = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lesson: Lesson): boolean => {
      // Search filter (TOPBAR-003): title or preview/directions contains query.
      if (q) {
        const hay =
          `${lesson.title} ${lesson.preview} ${lesson.directions}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Subject filter — lesson.subject must be in the active set.
      if (
        filters.subjects.length > 0 &&
        !filters.subjects.includes(lesson.subject)
      )
        return false;
      // Unit filter — lesson.unit must be in the active set.
      if (filters.units.length > 0 && !filters.units.includes(lesson.unit))
        return false;
      // Status filter — lesson.status must be in the active set.
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(lesson.status)
      )
        return false;
      // Standards filter — lesson must carry at least one of the active codes.
      if (filters.standards.length > 0) {
        const hasStandard = filters.standards.some((code) =>
          lesson.standards.includes(code),
        );
        if (!hasStandard) return false;
      }
      return true;
    };
  }, [search, filters]);

  // ── bySubjectDay — lessons bucketed by subject × day ──────────────────────
  // Applies the search + filter predicate so non-matching lessons are hidden.
  const bySubjectDay = useMemo(() => {
    const buckets: Record<string, Lesson[][]> = {};
    for (const s of SUBJECTS) {
      buckets[s.id] = Array.from({ length: DAY_COUNT }, () => []);
    }
    for (const lesson of lessons) {
      if (lesson.week !== week) continue;
      if (lesson.day < 0 || lesson.day >= DAY_COUNT) continue;
      if (!lessonMatchesQuery(lesson)) continue;
      buckets[lesson.subject]?.[lesson.day].push(lesson);
    }
    return buckets;
  }, [lessons, week, lessonMatchesQuery]);

  const weekHasLessons = useMemo(
    () => lessons.some((l) => l.week === week),
    [lessons, week],
  );

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const expandCell = useCallback(
    (pos: CellPos) => {
      const subject = SUBJECTS[pos.row];
      const cellLessons = bySubjectDay[subject.id]?.[pos.col] ?? [];
      if (cellLessons.length === 0) return;
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const l of cellLessons) next.add(l.id);
        return next;
      });
      setSelectedId(cellLessons[0].id);
    },
    [bySubjectDay],
  );

  const collapseAll = useCallback(() => {
    setExpandedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(() => {
      const next = new Set<string>();
      for (const l of lessons) {
        if (l.week === week) next.add(l.id);
      }
      return next;
    });
  }, [lessons, week]);

  const gridNav = useGridNavigation({
    rowCount: SUBJECTS.length,
    colCount: DAY_COUNT,
    onActivate: expandCell,
    onCollapse: collapseAll,
  });

  // ── dnd-kit event handlers ─────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    // Snapshot which cards are currently expanded (spec §3.6).
    expandedSnapshotRef.current = new Set(expandedIds);
    // Collapse all to chips immediately.
    setExpandedIds(new Set());
    setDragState({ phase: "dragging", activeId: id, overId: null });
    // Announce pick-up for screen readers.
    const lesson = lessons.find((l) => l.id === id);
    const subjectName = lesson ? SUBJECT_BY_ID[lesson.subject]?.name : "";
    setLiveAnnouncement(
      `Picked up ${subjectName ? subjectName + " lesson: " : "lesson: "}${lesson?.title ?? id}. Drag to a new cell.`,
    );
  }

  function handleDragOver(event: DragOverEvent): void {
    const overId = event.over ? String(event.over.id) : null;
    setDragState((prev) =>
      prev.phase === "dragging" ? { ...prev, overId } : prev,
    );
    // Screen-reader position announcement.
    if (overId?.startsWith("cell:")) {
      const [, subjectId, dayStr] = overId.split(":");
      const dayName = WEEK_DAYS[Number(dayStr)] ?? dayStr;
      const subj = SUBJECTS.find((s) => s.id === subjectId);
      setLiveAnnouncement(`Over ${subj?.name ?? subjectId}, ${dayName}.`);
    }
  }

  function handleDragEnd(event: DragEndEvent): void {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    // Bug 1 fix: go straight to `idle` SYNCHRONOUSLY — no `dropping` phase,
    // no setTimeout. Re-expansion begins in the same render cycle as the drop
    // event, giving a <30ms first-frame target. The DragOverlay's dropAnimation
    // (220ms cubic-bezier) runs in parallel via dnd-kit and does not block this.
    // Restore the snapshotted expansion set atomically in the same handler
    // so there is no intermediate render where expandedIds is wrong (spec §3.6).
    const snapshot = expandedSnapshotRef.current;
    expandedSnapshotRef.current = null;
    setExpandedIds(snapshot ?? new Set());
    setDragState({ phase: "idle" });

    if (overId?.startsWith("cell:")) {
      const [, subjectId, dayStr] = overId.split(":");
      const day = Number(dayStr);
      // Route through the store — this records one undo step ("Move lesson")
      // and prunes the source cell's CellLayout automatically (store reducer).
      moveLesson(activeId, { day, subject: subjectId as SubjectId });
      // Announce drop.
      const [, tgtSubjectId, tgtDayStr] = overId.split(":");
      const dayName = WEEK_DAYS[Number(tgtDayStr)] ?? tgtDayStr;
      const subj = SUBJECTS.find((s) => s.id === tgtSubjectId);
      setLiveAnnouncement(
        `Dropped in ${subj?.name ?? tgtSubjectId}, ${dayName}.`,
      );
    } else {
      // Dropped outside a cell — no move.
      setLiveAnnouncement("Drag cancelled.");
    }
  }

  function handleDragCancel(): void {
    // Restore snapshot and reset.
    setExpandedIds(expandedSnapshotRef.current ?? new Set());
    expandedSnapshotRef.current = null;
    setDragState({ phase: "idle" });
    setLiveAnnouncement("Drag cancelled.");
  }

  // ── Simple helpers ─────────────────────────────────────────────────────────

  function handleAdd(subjectId: SubjectId, day: number): void {
    void subjectId;
    void day;
  }

  function handleSelect(lessonId: string): void {
    setSelectedId(lessonId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  }

  function handleToggleMaximize(subjectId: SubjectId, day: number): void {
    const key = `${subjectId}:${day}`;
    setMaximizedCell((prev) => (prev === key ? null : key));
  }

  /** Completion toggle — routes through store (one undo step per cycle). */
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

  // ── Active lesson for DragOverlay ─────────────────────────────────────────
  const activeLessonId = dragState.phase !== "idle" ? dragState.activeId : null;
  const activeLesson = activeLessonId
    ? lessons.find((l) => l.id === activeLessonId)
    : null;

  return (
    <div className={styles.page}>
      {/* Accessibility live region — announces drag events for screen readers. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {liveAnnouncement}
      </div>

      <WeekNavigator
        week={week}
        currentWeek={CURRENT_WEEK}
        minWeek={minWeek}
        maxWeek={maxWeek}
        onChange={setWeek}
      />

      {/* ── Toolbar — anchored chrome (spec §3.5) ──────────────────────── */}
      <div className={styles.moveToolbar}>
        <button
          type="button"
          className={styles.moveModeBtn}
          onClick={expandAll}
          aria-label="Expand all lesson cards"
        >
          Expand all
        </button>
        <button
          type="button"
          className={styles.moveModeBtn}
          onClick={collapseAll}
          aria-label="Minimize all lesson cards"
        >
          Minimize all
        </button>
      </div>

      {/* ── DndContext wraps the entire scrollable grid ──────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.scroll}>
          <div
            className={styles.grid}
            role="grid"
            aria-label={`Weekly plan, week ${week}`}
          >
            {/* ── Day header row — anchored chrome (spec §3.5) ── */}
            <div className={styles.cornerCell} role="presentation" />
            {WEEK_DAYS.map((dayName, dayIdx) => (
              <div
                key={dayName}
                role="columnheader"
                className={`${styles.dayHead} ${
                  week === CURRENT_WEEK && dayIdx === 0
                    ? styles.dayHeadToday
                    : ""
                }`}
              >
                <span>{dayName}</span>
                <span className={styles.dayHeadDate}>
                  {WEEK_DAYS_SHORT[dayIdx]}
                </span>
              </div>
            ))}

            {/* ── Subject rows ── */}
            {!weekHasLessons && (
              <div className={styles.emptyWeek} role="status">
                No lessons planned for week {week} yet.
              </div>
            )}
            {SUBJECTS.map((subject, rowIdx) => (
              <SubjectRow
                key={subject.id}
                rowIndex={rowIdx}
                subjectId={subject.id}
                cells={bySubjectDay[subject.id]}
                style={style}
                viewMode={viewMode}
                dragState={dragState}
                density={density}
                expandedIds={expandedIds}
                selectedId={selectedId}
                maximizedCell={maximizedCell}
                cellLayouts={cellLayouts}
                cellProps={gridNav.cellProps}
                onAdd={handleAdd}
                onSelect={handleSelect}
                onToggleComplete={handleToggleComplete}
                onContextAction={handleContextAction}
                onToggleMaximize={handleToggleMaximize}
                onEditLesson={handleEditLesson}
                onSaveTarget={handleSaveTarget}
              />
            ))}
          </div>
        </div>

        {/* ── DragOverlay — floating chip follows cursor (spec §6.1 / §7) ── */}
        <DragOverlay
          dropAnimation={
            prefersReducedMotion
              ? null
              : {
                  duration: 220,
                  easing: "cubic-bezier(0.2, 0, 0, 1)",
                }
          }
        >
          {activeLesson && (
            <div className={styles.overlayCard}>
              {/* The floating drag chip. `overlay` triggers the floating
                  shadow/ring/rotation on the card (Bug 4 fix: in-grid cards
                  never show those styles, even when isDragging is true). */}
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

// ── SubjectRow ────────────────────────────────────────────────────────────────
// Split into its own component so the subject-color hook (one per row)
// is called at a stable position — hooks can't run inside the .map above.
// Also anchored chrome: the subject label never collapses (spec §3.5).

interface SubjectRowProps {
  rowIndex: number;
  subjectId: SubjectId;
  cells: Lesson[][];
  style: ReturnType<typeof useTheme>["style"];
  viewMode: ViewMode;
  dragState: DragState;
  density: Density;
  expandedIds: Set<string>;
  selectedId: string | null;
  maximizedCell: string | null;
  cellLayouts: Record<string, CellLayout>;
  cellProps: (row: number, col: number) => CellNavProps;
  onAdd: (subjectId: SubjectId, day: number) => void;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
  onToggleMaximize: (subjectId: SubjectId, day: number) => void;
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
  onSaveTarget: (id: string, target: "personal" | "core") => void;
}

function SubjectRow({
  rowIndex,
  subjectId,
  cells,
  style,
  viewMode,
  dragState,
  density,
  expandedIds,
  selectedId,
  maximizedCell,
  cellLayouts,
  cellProps,
  onAdd,
  onSelect,
  onToggleComplete,
  onContextAction,
  onToggleMaximize,
  onEditLesson,
  onSaveTarget,
}: SubjectRowProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const subject = SUBJECTS.find((s) => s.id === subjectId)!;
  const unit = UNITS[subjectId];

  const shade: CellShade = resolveCellShade(style, color, unit.shade);

  return (
    <>
      {/* Subject label — anchored chrome, never collapses (spec §3.5) */}
      <div className={`${styles.subjectHead} cp-subj ${subjectId}`}>
        <span
          className={styles.subjectTile}
          style={{ background: color.tile, color: color.deep }}
          aria-hidden="true"
        >
          {subject.icon}
        </span>
        <span className={styles.subjectName} style={{ color: color.deep }}>
          {subject.name}
        </span>
      </div>

      {Array.from({ length: DAY_COUNT }, (_, day) => (
        <GridCell
          key={day}
          subjectId={subjectId}
          day={day}
          lessons={cells?.[day] ?? []}
          shade={shade}
          viewMode={viewMode}
          dragState={dragState}
          density={density}
          expandedIds={expandedIds}
          selectedId={selectedId}
          maximized={maximizedCell === `${subjectId}:${day}`}
          cellLayout={cellLayouts[cellKey(subjectId, day)] ?? null}
          navProps={cellProps(rowIndex, day)}
          onAdd={onAdd}
          onSelect={onSelect}
          onToggleComplete={onToggleComplete}
          onContextAction={onContextAction}
          onToggleMaximize={onToggleMaximize}
          onEditLesson={onEditLesson}
          onSaveTarget={onSaveTarget}
        />
      ))}
    </>
  );
}
