"use client";

// WeekEditBoard.tsx — the W3.8c period-aligned Week EDIT board.
//
// While the Week view's View↔Edit toggle is in EDIT (Builder B swaps this in
// for WeekColumns), the weekly canvas becomes a period × day board:
//   • Columns   — one per configured school day (derived from the ordered
//                 school week, never a hard-coded 5; copies WeekColumns' day
//                 derivation via useOrderedWeekdays()).
//   • Rows       — DERIVED period bands (lib/week-edit-periods) in ALIGNED
//                 layout, or 0..maxDepth stack slots in STACKED layout.
//   • Cells      — flush stacked lesson cells sharing a period row; drag moves
//                 a lesson across days AND (aligned) across periods, re-timing
//                 it on a cross-period drop.
//
// Two layouts (state via usePbLayout, owned by Builder B):
//   ALIGNED  — rows are periods; the left rail (52px) shows the period time; a
//              cross-period drop RE-TIMES the lesson (moveLesson { day?, time }).
//   STACKED  — rows are array slots; rail is empty; a drop is a day move only,
//              never a re-time.
//
// DnD engine: dnd-kit (NOT native HTML5), mirroring WeekColumns' pointer-first
// collision detection + keyboard fallback + DragOverlay ghost. Exactly ONE
// moveLesson call per drop (a single undo step). A FLIP glide animates cells to
// their new slots on drop (gated off under reduced motion).
//
// Desktop/tablet canvas: the grid may scroll HORIZONTALLY inside its own track
// (52px + day columns); the DOCUMENT never scrolls sideways (CLAUDE.md §4).

import type { ReactNode } from "react";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useReducedMotion } from "framer-motion";
import { Badge, Button, Tooltip } from "@/components/ui";
import { Icon } from "@/components/lesson-card/icon";
import { useLabels } from "@/lib/labels";
import type { Lesson } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useOrderedWeekdays } from "@/lib/week-order";
import { WEEKDAY_INDEX } from "@/lib/use-school-week";
import { getDayBlocks, formatBlockTime } from "@/lib/schedule-data";
import { lessonTime } from "@/lib/mock/schedule";
import { usePbLayout } from "@/lib/pblayout-state";
import { OpenLessonEditorContext } from "./weekly-lesson-card";
import {
  deriveWeekPeriods,
  assignLessonPeriod,
  retimeLabel,
  UNSCHEDULED,
  type WeekPeriod,
} from "@/lib/week-edit-periods";
import styles from "./WeekEditBoard.module.css";

// ── Plain-text projection ─────────────────────────────────────────────────
// Lesson titles may carry inline rich-text markup (edited on another host).
// The board renders a compact single-line title, so strip tags for display +
// the inline rename seed. Isomorphic regex (mirrors WeeklyLessonCard.stripHtml)
// so SSR and the first client paint agree.
function stripHtml(html: string): string {
  return (html ?? "").slice(0, 2000).replace(/<[^>]*>/g, "");
}

/** Parse a droppable id `weslot:<day>:<rowKey>` back to its parts. rowKey may be
 *  a period key (`p-480`), the UNSCHEDULED sentinel, or a stacked slot
 *  (`row-<n>`). Returns null for anything else (defensive). */
function parseSlotId(
  id: string | null,
  dayCount: number,
): { day: number; rowKey: string } | null {
  if (!id || !id.startsWith("weslot:")) return null;
  const rest = id.slice("weslot:".length);
  const sep = rest.indexOf(":");
  if (sep === -1) return null;
  const day = Number(rest.slice(0, sep));
  const rowKey = rest.slice(sep + 1);
  if (Number.isNaN(day) || day < 0 || day >= dayCount || rowKey === "") {
    return null;
  }
  return { day, rowKey };
}

interface WeekEditBoardProps {
  /** The panel drag-grip node (from WeeklyShell's renderGridPanel). Rendered
   *  absolutely at the board's top-left corner, mirroring how the shell places
   *  the grip above the canvas. Optional — absent when no grip is provided. */
  grip?: ReactNode;
}

export function WeekEditBoard({ grip }: WeekEditBoardProps): ReactNode {
  const labels = useLabels();
  const prefersReducedMotion = useReducedMotion();

  // ── Configured school week — the one ordered-week contract ────────────────
  const weekdays = useOrderedWeekdays();
  const DAY_COUNT = weekdays.length;

  const { week, search, filters, selectedLessonId, setSelectedLessonId } =
    useAppState();
  const { layout } = usePbLayout();

  const { lessons, moveLesson, editLesson, subjects, subjectById } =
    usePlanner();
  const openLessonEditor = React.useContext(OpenLessonEditorContext);

  const subjectNameOf = useCallback(
    (lesson: Lesson): string =>
      subjectById[lesson.subject]?.name ?? lesson.subject,
    [subjectById],
  );

  // ── Inline expansion (UI only) ────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const prevSelectedRef = useRef<string | null>(selectedLessonId);

  // ── dnd-kit drag state ────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Board-local sensors — NOT the shared useDndSensors(): its KeyboardSensor
  // uses sortableKeyboardCoordinates, which only understands SortableContext
  // lists and never yields a move on this bare droppable grid (QA T8: arrows
  // left the active target pinned to the origin cell). The pointer/touch
  // activation constraints mirror lib/collapse-on-drag exactly; only the
  // keyboard coordinate getter is board-specific (cell snapping, below).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
    }),
  );
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // ── Search + filter predicate (verbatim from WeekColumns) ─────────────────
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

  // ── Visible lessons bucketed by day (archived filtered; subject-ordered) ──
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

  // ── Derived period rows (ALIGNED) ─────────────────────────────────────────
  // SCHEDULE_BY_DAY is keyed by ABSOLUTE Sun-first weekday (0=Sun…4=Thu),
  // while a lesson's `day` / an OrderedWeekday's `index` is a POSITION in the
  // configured week — the two coincide only for a Sun-first week. Every
  // schedule lookup therefore maps the column's weekday TOKEN through
  // WEEKDAY_INDEX first, so a Mon–Fri school pulls Monday's blocks for its
  // first column, not Sunday's (Codex gate R3).
  const scheduleDayKeys = useMemo(
    () => weekdays.map((d) => WEEKDAY_INDEX[d.token]),
    [weekdays],
  );
  const periods = useMemo(
    () => deriveWeekPeriods(scheduleDayKeys),
    [scheduleDayKeys],
  );

  // Per-column cached schedule blocks — reused by the period assignment.
  const dayBlocks = useMemo(
    () => scheduleDayKeys.map((d) => getDayBlocks(d)),
    [scheduleDayKeys],
  );

  // ── ALIGNED placement: day → periodKey → lessons[] (+ unscheduled) ────────
  const alignedCells = useMemo(() => {
    // Map keyed by `${day}:${rowKey}`.
    const map = new Map<string, Lesson[]>();
    let anyUnscheduled = false;
    weekdays.forEach(({ index: day }, col) => {
      for (const lesson of byDay[day] ?? []) {
        const rowKey = assignLessonPeriod(lesson, periods, dayBlocks[col]);
        if (rowKey === UNSCHEDULED) anyUnscheduled = true;
        const cellKey = `${day}:${rowKey}`;
        const arr = map.get(cellKey);
        if (arr) arr.push(lesson);
        else map.set(cellKey, [lesson]);
      }
    });
    return { map, anyUnscheduled };
  }, [weekdays, byDay, periods, dayBlocks]);

  // ── STACKED placement: rows 0..maxDepth (+1 drop tail) ────────────────────
  const stackDepth = useMemo(() => {
    let max = 0;
    for (const day of weekdays) {
      max = Math.max(max, (byDay[day.index] ?? []).length);
    }
    // +1 tail row so a teacher always has an empty slot to drop into.
    return max + 1;
  }, [weekdays, byDay]);

  // Effective time label for a lesson (own time, else subject default).
  const effectiveLabel = useCallback(
    (lesson: Lesson): string => lessonTime(lesson),
    [],
  );

  // ── Layout fallback ───────────────────────────────────────────────────────
  // With no derivable periods (a school whose schedule has no academic blocks
  // yet), ALIGNED would collapse to a lone "Unscheduled" rail — or, with no
  // lessons either, to no drop surface at all. Render the STACK layout instead
  // so the board stays a normal day board; the teacher's stored preference is
  // untouched and takes effect as soon as periods exist. (Codex gate, W3.8c.)
  const effectiveLayout: "aligned" | "stacked" =
    periods.length === 0 ? "stacked" : layout;

  // ── Current period of the dragged lesson (for the same-slot / period-change
  //    decision on drop) — resolved against its own day's blocks. lesson.day
  //    IS the column position (the week-order contract), so it indexes the
  //    per-column dayBlocks directly. ─────────────────────────────────────────
  const currentPeriodKey = useCallback(
    (lesson: Lesson): string => {
      const blocks = dayBlocks[lesson.day] ?? [];
      return assignLessonPeriod(lesson, periods, blocks);
    },
    [dayBlocks, periods],
  );

  // ── Collapse a card when its detail panel is dismissed externally ─────────
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedLessonId;
    if (selectedLessonId === null && prev !== null) {
      setExpandedIds((curr) => {
        if (!curr.has(prev)) return curr;
        const next = new Set(curr);
        next.delete(prev);
        return next;
      });
    }
  }, [selectedLessonId]);

  // ── FLIP glide registration ───────────────────────────────────────────────
  // Animate cells to their new slots on drop. Three modes (review L4 — don't
  // pay N×getBoundingClientRect on every drag-over re-render):
  //   "off"     — reduced motion: no measurement at all.
  //   "hold"    — mid-drag: layout is static, so the pre-drag snapshots ARE
  //               the correct FLIP first-frames; skip re-measuring.
  //   "animate" — glide to new positions + take fresh snapshots.
  const flipMode: FlipMode = prefersReducedMotion
    ? "off"
    : activeId !== null
      ? "hold"
      : "animate";
  const registerFlip = useFlip(flipMode);

  // ── DnD handlers ──────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    setActiveId(id);
    setOverId(null);
    // Collapse any inline expansion so drag targets are compact + stable —
    // but NEVER on a keyboard lift: dnd-kit snapshots droppable rects at
    // lift, and collapsing shifts every rect under that snapshot so arrow
    // moves resolve against stale geometry (the kbDrag trap — see
    // components/lesson-editor/LessonEditor.tsx; review L3).
    if (!(event.activatorEvent instanceof KeyboardEvent)) {
      setExpandedIds(new Set());
    }
    const lesson = lessons.find((l) => l.id === id);
    setLiveAnnouncement(
      `Picked up ${lesson?.title ? stripHtml(lesson.title) : "lesson"}. Drag to a different day${
        effectiveLayout === "aligned" ? " or period" : ""
      }.`,
    );
  }

  function handleDragOver(event: DragOverEvent): void {
    setOverId(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const id = String(event.active.id);
    const target = parseSlotId(
      event.over ? String(event.over.id) : null,
      DAY_COUNT,
    );
    setActiveId(null);
    setOverId(null);

    if (target === null) {
      setLiveAnnouncement("Drag cancelled.");
      return;
    }

    const source = lessons.find((l) => l.id === id);
    if (!source || source.week !== week) {
      setLiveAnnouncement("Drag cancelled.");
      return;
    }

    const dayName =
      weekdays.find((d) => d.index === target.day)?.longLabel ??
      String(target.day);
    const dayChanged = source.day !== target.day;

    if (effectiveLayout === "stacked") {
      // STACKED — drop is a cross-day move only. Within-day reorder is NOT
      // supported: the stacked order is the DERIVED subject order, so there is
      // no persisted per-slot order to rewrite (the localStorage row-order
      // pattern keys a different surface and does not compose cleanly here).
      // A same-day drop is therefore a deliberate no-op. (W3.8c decision.)
      if (!dayChanged) {
        setLiveAnnouncement(`Kept in ${dayName}.`);
        return;
      }
      moveLesson(id, { day: target.day });
      setLiveAnnouncement(`Moved to ${dayName}.`);
      return;
    }

    // ── ALIGNED ──────────────────────────────────────────────────────────
    const sourcePeriodKey = currentPeriodKey(source);

    // Dropped back into the exact same day+period → no-op (no spurious undo
    // step, matching WeekColumns' same-slot guard).
    if (!dayChanged && target.rowKey === sourcePeriodKey) {
      setLiveAnnouncement(`Kept in ${dayName}.`);
      return;
    }

    if (target.rowKey === UNSCHEDULED) {
      // The Unscheduled overflow row carries no period, so it cannot re-time.
      // Only a day change is meaningful here.
      if (!dayChanged) {
        setLiveAnnouncement(`Kept in ${dayName}.`);
        return;
      }
      moveLesson(id, { day: target.day });
      setLiveAnnouncement(`Moved to ${dayName}.`);
      return;
    }

    const targetPeriod = periods.find((p) => p.key === target.rowKey) ?? null;
    const periodChanged = target.rowKey !== sourcePeriodKey;

    if (periodChanged && targetPeriod) {
      // Cross-period → re-time. Preserve the lesson's duration; fall back to its
      // subject's default label, then the period length. ONE moveLesson call:
      // include `day` only when it actually changed.
      const newTime = retimeLabel(
        source.time,
        targetPeriod,
        lessonTime({ subject: source.subject }),
      );
      moveLesson(id, {
        ...(dayChanged ? { day: target.day } : {}),
        time: newTime,
      });
      setLiveAnnouncement(`Moved to ${dayName} at ${targetPeriod.label}.`);
      return;
    }

    // Same period, different day → day move only.
    moveLesson(id, { day: target.day });
    setLiveAnnouncement(`Moved to ${dayName}.`);
  }

  function handleDragCancel(): void {
    setActiveId(null);
    setOverId(null);
    setLiveAnnouncement("Drag cancelled.");
  }

  // ── Selection / expansion (header click) ──────────────────────────────────
  const handleToggleExpand = useCallback(
    (lessonId: string): void => {
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

  const handleRename = useCallback(
    (lessonId: string, title: string): void => {
      editLesson(
        lessonId,
        { title },
        { key: `lesson:${lessonId}:title`, ts: Date.now() },
      );
    },
    [editLesson],
  );

  // ── Resolved hovered cell (drives the drop-target highlight) ──────────────
  const overCell = parseSlotId(overId, DAY_COUNT);
  const activeLesson = activeId
    ? (lessons.find((l) => l.id === activeId) ?? null)
    : null;

  // Row descriptors for the active (effective) layout.
  const rows: Array<{ key: string; period: WeekPeriod | null; label: string }> =
    effectiveLayout === "aligned"
      ? [
          ...periods.map((p) => ({ key: p.key, period: p, label: p.label })),
          ...(alignedCells.anyUnscheduled
            ? [{ key: UNSCHEDULED, period: null, label: "Unscheduled" }]
            : []),
        ]
      : Array.from({ length: stackDepth }, (_, i) => ({
          key: `row-${i}`,
          period: null,
          label: "",
        }));

  return (
    <div
      className={styles.root}
      data-week-edit-board=""
      data-layout={effectiveLayout}
      title={
        effectiveLayout === "aligned"
          ? "Your week by period — each row is a time band across every school day. Drag a lesson to another day or period; moving it to a new period re-times it."
          : "Your week stacked by day — drag a lesson to another day to reschedule it."
      }
    >
      {grip}

      {/* Screen-reader live region for drag events. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {liveAnnouncement}
      </div>

      <DndContext
        id="week-edit-board-dnd"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.scroll}>
          <div
            className={styles.grid}
            role="group"
            aria-label={`Week ${week} by ${effectiveLayout === "aligned" ? "period" : "day"} — edit`}
            style={{ "--day-count": DAY_COUNT } as React.CSSProperties}
          >
            {/* Rail corner (sticky). */}
            <div className={`${styles.corner} va-ph`} aria-hidden="true" />

            {/* Day headers (sticky). */}
            {weekdays.map(({ token, label, longLabel }) => (
              <div key={token} className={styles.dayHead}>
                <span className={styles.dayHeadName}>{longLabel}</span>
                <span className={styles.dayHeadDate}>{label}</span>
              </div>
            ))}

            {rows.map((row) => (
                <React.Fragment key={row.key}>
                  {/* Rail cell — period time (aligned) / empty (stacked). */}
                  {effectiveLayout === "aligned" ? (
                    <div
                      className={`${styles.railCell} va-ph ${
                        row.key === UNSCHEDULED ? styles.railUnsched : ""
                      }`}
                    >
                      {row.period ? (
                        <>
                          <span className={styles.railTime}>
                            {row.period.label}
                          </span>
                          <span className={styles.railEnd}>
                            {formatBlockTime(row.period.endMin)}
                          </span>
                        </>
                      ) : (
                        <span className={styles.railUnschedLabel}>
                          Unscheduled
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`${styles.railCell} ${styles.railEmpty}`}
                      aria-hidden="true"
                    />
                  )}

                  {/* Day cells for this row. */}
                  {weekdays.map(({ index: day, longLabel }) => {
                    const cellLessons =
                      effectiveLayout === "aligned"
                        ? (alignedCells.map.get(`${day}:${row.key}`) ?? [])
                        : (() => {
                            const idx = Number(row.key.slice("row-".length));
                            const l = (byDay[day] ?? [])[idx];
                            return l ? [l] : [];
                          })();
                    const isTarget =
                      overCell !== null &&
                      overCell.day === day &&
                      overCell.rowKey === row.key;
                    return (
                      <BoardCell
                        key={`${day}:${row.key}`}
                        id={`weslot:${day}:${row.key}`}
                        lessons={cellLessons}
                        isTarget={isTarget}
                        dragging={activeId !== null}
                        activeId={activeId}
                        rowLabel={
                          effectiveLayout === "aligned" ? row.label : longLabel
                        }
                        expandedIds={expandedIds}
                        selectedId={selectedLessonId}
                        registerFlip={registerFlip}
                        effectiveLabel={effectiveLabel}
                        subjectNameOf={subjectNameOf}
                        onToggleExpand={handleToggleExpand}
                        onRename={handleRename}
                        onOpen={openLessonEditor}
                      />
                    );
                  })}
                </React.Fragment>
            ))}
          </div>
        </div>

        {/* DragOverlay — subject-tinted rotated ghost pill. */}
        <DragOverlay
          dropAnimation={
            prefersReducedMotion
              ? null
              : { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
          }
        >
          {activeLesson && (
            <div className={`${styles.ghost} cp-subj ${activeLesson.subject}`}>
              {stripHtml(activeLesson.title) || labels.lesson}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Collision detection (pointer-first, keyboard closestCenter fallback) ────
// Verbatim strategy from WeekColumns: pointerWithin hit-tests what's under the
// cursor; a pointer miss returns [] (cancel) rather than snapping to a
// neighbor, while keyboard drags (no pointer) fall back to closestCenter.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  return args.pointerCoordinates ? [] : closestCenter(args);
};

// ── Keyboard coordinate getter — snap the drag to whole cells ───────────────
// The dnd-kit grid pattern (the docs' multiple-containers getter): on each
// arrow press, collect every droppable cell strictly in the pressed direction,
// pick the one nearest the dragged rect's current position, and return
// coordinates centering the dragged tile inside it. The keyboard branch of
// `collisionDetection` (closestCenter) then resolves `over` to that cell.
// Arrow steps thus jump cell-to-cell regardless of cell size — the default /
// sortable getters move in fixed pixel increments (or only within a
// SortableContext) and never cross this board's wide slots (QA T8).
const ARROW_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, collisionRect, droppableRects, droppableContainers } },
) => {
  if (!ARROW_CODES.has(event.code)) return undefined;
  event.preventDefault();
  if (!active || !collisionRect) return undefined;

  const horizontal =
    event.code === "ArrowLeft" || event.code === "ArrowRight";

  type Rect = { left: number; top: number; width: number; height: number };
  let best: Rect | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestAligned: Rect | null = null;
  let bestAlignedDist = Number.POSITIVE_INFINITY;

  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;

    // Strictly directional, compared against the dragged rect's OPPOSITE
    // edge: the tile sits inset within its own droppable cell, so the source
    // cell's top/left is already "before" the tile's — a same-edge compare
    // would let ArrowUp/ArrowLeft re-select the origin cell at distance ~0
    // and stall the first press (Codex gate R5). Requiring the candidate to
    // lie wholly beyond the tile's far edge excludes the origin on every
    // axis while keeping all real neighbors (grid cells never overlap).
    if (
      event.code === "ArrowDown" &&
      rect.top < collisionRect.top + collisionRect.height
    )
      continue;
    if (
      event.code === "ArrowUp" &&
      rect.top + rect.height > collisionRect.top
    )
      continue;
    if (
      event.code === "ArrowRight" &&
      rect.left < collisionRect.left + collisionRect.width
    )
      continue;
    if (
      event.code === "ArrowLeft" &&
      rect.left + rect.width > collisionRect.left
    )
      continue;

    const dx =
      rect.left + rect.width / 2 - (collisionRect.left + collisionRect.width / 2);
    const dy =
      rect.top + rect.height / 2 - (collisionRect.top + collisionRect.height / 2);
    const dist = dx * dx + dy * dy;

    // Prefer candidates aligned on the cross axis (a horizontal arrow should
    // stay in its ROW, a vertical arrow in its COLUMN) — pure nearest-center
    // can pick a diagonal neighbor when the same-row cell's center is
    // farther (tall tiles, uneven rows).
    const aligned = horizontal
      ? rect.top < collisionRect.top + collisionRect.height &&
        rect.top + rect.height > collisionRect.top
      : rect.left < collisionRect.left + collisionRect.width &&
        rect.left + rect.width > collisionRect.left;

    if (aligned && dist < bestAlignedDist) {
      bestAlignedDist = dist;
      bestAligned = rect;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = rect;
    }
  }

  const target = bestAligned ?? best;
  if (target === null) return undefined;
  return {
    x: target.left + target.width / 2 - collisionRect.width / 2,
    y: target.top + target.height / 2 - collisionRect.height / 2,
  };
};

// ── BoardCell — one droppable day×row slot holding flush stacked cells ──────
interface BoardCellProps {
  id: string;
  lessons: Lesson[];
  isTarget: boolean;
  dragging: boolean;
  activeId: string | null;
  rowLabel: string;
  expandedIds: Set<string>;
  selectedId: string | null;
  registerFlip: (id: string) => (el: HTMLElement | null) => void;
  effectiveLabel: (lesson: Lesson) => string;
  subjectNameOf: (lesson: Lesson) => string;
  onToggleExpand: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpen: ((id: string) => void) | null;
}

function BoardCell({
  id,
  lessons,
  isTarget,
  dragging,
  activeId,
  rowLabel,
  expandedIds,
  selectedId,
  registerFlip,
  effectiveLabel,
  subjectNameOf,
  onToggleExpand,
  onRename,
  onOpen,
}: BoardCellProps): ReactNode {
  const { setNodeRef } = useDroppable({ id });
  const isEmpty = lessons.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={`${styles.cell} ${isTarget ? styles.cellTarget : ""} ${
        isEmpty ? styles.cellEmpty : ""
      }`}
      role="group"
      aria-label={rowLabel}
    >
      {isEmpty
        ? dragging && (
            <span className={styles.dropGhost} aria-hidden="true">
              Drop here
            </span>
          )
        : lessons.map((lesson) => (
            <LessonCell
              key={lesson.id}
              lesson={lesson}
              timeLabel={effectiveLabel(lesson)}
              subjectName={subjectNameOf(lesson)}
              expanded={expandedIds.has(lesson.id)}
              selected={selectedId === lesson.id}
              dragging={activeId === lesson.id}
              registerFlip={registerFlip}
              onToggleExpand={onToggleExpand}
              onRename={onRename}
              onOpen={onOpen}
            />
          ))}
    </div>
  );
}

// ── LessonCell — one draggable lesson tile ──────────────────────────────────
interface LessonCellProps {
  lesson: Lesson;
  timeLabel: string;
  subjectName: string;
  expanded: boolean;
  selected: boolean;
  dragging: boolean;
  registerFlip: (id: string) => (el: HTMLElement | null) => void;
  onToggleExpand: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpen: ((id: string) => void) | null;
}

const LessonCell = React.memo(function LessonCell({
  lesson,
  timeLabel,
  subjectName,
  expanded,
  selected,
  dragging,
  registerFlip,
  onToggleExpand,
  onRename,
  onOpen,
}: LessonCellProps): ReactNode {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lesson.id,
  });

  // Inline rename — plain-text edit (the board title is single-line). Seeds
  // from the stripped title; commits via onRename (→ editLesson coalesced) only
  // on a real change. A double-click on the title opens the editor.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const plainTitle = stripHtml(lesson.title);

  // Reset any open editor if the tile is reused for a different lesson.
  useEffect(() => {
    setEditing(false);
    setDraft("");
  }, [lesson.id]);

  const beginEdit = useCallback(
    (e: React.SyntheticEvent): void => {
      e.stopPropagation();
      setDraft(plainTitle);
      setEditing(true);
    },
    [plainTitle],
  );

  const commitEdit = useCallback((): void => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== plainTitle) onRename(lesson.id, trimmed);
    setEditing(false);
    setDraft("");
  }, [draft, plainTitle, onRename, lesson.id]);

  // The grip is the SOLE drag activator (dnd-kit listeners + attributes).
  const gripProps: React.HTMLAttributes<HTMLElement> = {
    ...listeners,
    ...attributes,
  };

  const ghosted = dragging || isDragging;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerFlip(lesson.id)(el);
      }}
      className={`cp-subj ${lesson.subject} ${styles.tile} ${
        selected ? styles.tileSelected : ""
      } ${lesson.modified ? styles.tileModified : ""} ${
        lesson.status === "done" ? styles.tileDone : ""
      }`}
      style={{ opacity: ghosted ? 0.4 : 1 }}
      data-planner-item={`lesson:${lesson.id}`}
    >
      {/* Header strip — subject color, grip, subject label, time. The strip's
          onClick is a REDUNDANT pointer convenience (mirrors the bundle's
          header-click toggle); it is deliberately NOT a role="button" — the
          accessible/keyboard expand path is the explicit "Expand" button in
          the tile body, and nesting a button role around the grip (itself a
          button) would mark the grip presentational to AT (Codex round 2). */}
      <div
        className={styles.tileHead}
        onClick={() => onToggleExpand(lesson.id)}
      >
        <Tooltip
          content="Drag to move this lesson to a different day or period — a new period re-times it. Moves stay personal unless you save them to the Team Curriculum."
          side="top"
          tooltipId="week-edit-drag-handle"
        >
          <span
            {...gripProps}
            className={styles.grip}
            role="button"
            tabIndex={0}
            aria-label="Drag to move this lesson"
            title="Drag to move this lesson"
            style={{ cursor: "grab", ...gripProps.style }}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="drag" size={13} />
          </span>
        </Tooltip>
        <span className={styles.tileSubject}>{subjectName}</span>
        <span className={styles.tileTime}>{timeLabel}</span>
      </div>

      {/* Fork cues — moved arrow + Modified pill. */}
      {(lesson.moved || lesson.modified) && (
        <div className={styles.tileCues}>
          {lesson.moved && (
            <Tooltip
              content={
                lesson.moved === "across-weeks"
                  ? "Moved across weeks in your personal copy — the Team Curriculum version stays in its original slot."
                  : "Moved within the week in your personal copy — the Team Curriculum version stays in its original slot."
              }
              side="top"
            >
              <span
                className={styles.movedArrow}
                aria-label={
                  lesson.moved === "across-weeks"
                    ? "Moved across weeks"
                    : "Moved within the week"
                }
                tabIndex={0}
              >
                {lesson.moved === "across-weeks" ? "⤴" : "↔"}
              </span>
            </Tooltip>
          )}
          {lesson.modified && (
            <Tooltip
              content="Personally modified from the Team Curriculum."
              side="top"
            >
              <Badge variant="warn" size="sm">
                Modified
              </Badge>
            </Tooltip>
          )}
        </div>
      )}

      {/* Title — inline rename (double-click) / single-line display. */}
      <div className={styles.tileBody}>
        {editing ? (
          <input
            className={styles.titleInput}
            value={draft}
            autoFocus
            aria-label="Rename lesson"
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setDraft("");
              }
            }}
          />
        ) : (
          <span
            className={styles.tileTitle}
            role="button"
            tabIndex={0}
            title={plainTitle}
            aria-label={`Lesson: ${plainTitle}. Double-click to rename.`}
            onDoubleClick={beginEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "F2") beginEdit(e);
            }}
          >
            {plainTitle}
          </span>
        )}

        {/* Actions — Open (full editor) + Expand/Collapse (inline body). */}
        <div className={styles.tileActions}>
          {onOpen && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.tileBtn}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(lesson.id);
              }}
            >
              Open
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={styles.tileBtn}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(lesson.id);
            }}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>

        {/* Expanded read-only body — objective + unit line (NO new editor). */}
        {expanded && (
          <div className={styles.tileExpand}>
            {lesson.objective && (
              <p className={styles.tileObjective}>
                {stripHtml(lesson.objective)}
              </p>
            )}
            <p className={styles.tileUnit}>{lesson.unit || "Planned"}</p>
          </div>
        )}
      </div>
    </div>
  );
});

// ── useFlip — FLIP glide across re-layouts ──────────────────────────────────
// Registers a ref per lesson id, snapshots each element's viewport rect after
// layout, and on the next layout applies the inverted delta then releases it
// with a short cubic-bezier ease. Modes (review L4 — the dep-less layout
// effect otherwise pays N×getBoundingClientRect on EVERY render, including
// per-cell drag-over highlight churn):
//   "animate" — apply deltas vs the held snapshots, then re-snapshot.
//   "hold"    — mid-drag: layout is static, so the held pre-drag snapshots
//               already ARE the correct first-frames; measure nothing.
//   "off"     — reduced motion: measure nothing and drop any held snapshots
//               (stale rects must not produce a glide if the preference
//               flips mid-session).
type FlipMode = "animate" | "hold" | "off";

function useFlip(
  mode: FlipMode,
): (id: string) => (el: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());

  const register = useCallback(
    (id: string) =>
      (el: HTMLElement | null): void => {
        if (el) nodes.current.set(id, el);
        else nodes.current.delete(id);
      },
    [],
  );

  useLayoutEffect(() => {
    if (mode === "off") {
      if (prevRects.current.size > 0) prevRects.current = new Map();
      return;
    }
    if (mode === "hold") return;

    nodes.current.forEach((el, id) => {
      const prev = prevRects.current.get(id);
      if (!prev) return;
      const cur = el.getBoundingClientRect();
      const dx = prev.left - cur.left;
      const dy = prev.top - cur.top;
      if (dx === 0 && dy === 0) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Force a reflow so the browser paints the inverted start frame.
      void el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = "transform .28s cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "";
      });
    });

    // Snapshot current positions for the next animate pass.
    const next = new Map<string, DOMRect>();
    nodes.current.forEach((el, id) => next.set(id, el.getBoundingClientRect()));
    prevRects.current = next;
  });

  return register;
}
