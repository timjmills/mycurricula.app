"use client";

// GridCell.tsx — one day×subject cell of the Weekly grid.
//
// A cell is a drop target for lesson cards and stacks any number of
// lessons vertically. Empty cells show the affordance from the spec
// (faint hint + 40×40 add button + subject-tinted hover border);
// populated cells show a faint inline add button on hover so a teacher
// can drop a second lesson into an already-used slot.
//
// When a cell holds multiple lessons it defaults to a collapsed view:
// CardStack renders one card + a stacked-deck affordance with prev/next
// arrows. Clicking the cell's non-card area (or the collapse button when
// open) toggles the cell between collapsed and maximized. Only one cell
// is maximized at a time — that is enforced by the parent WeeklyGrid.
//
// Split-slot layout: when a CellLayout is present, the cell renders its
// arranged row/slot structure instead of the flat CardStack default.
// CellDropZones overlays drop-region affordances while a drag is active.
//
// Context-menu "stack / unstack" is a planned follow-up; this increment
// is drag-based arrangement only.
//
// Drag-and-drop is native HTML5 DnD (no extra dependency). The LessonCard
// renders its own grab affordance fed by `dragHandleProps` (`draggable` +
// `onDragStart`/`onDragEnd`). The move-handle icon in the card header is the
// only drag affordance — the card body stays free for click-to-expand.

import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Lesson, LessonStatus, SubjectId } from "@/lib/types";
import { WeeklyLessonCard } from "@/components/weekly";
import type { ContextAction, ContextActionPayload } from "@/components/weekly";
import type { CellLayout, DropRegion } from "@/lib/cell-layout";
import type { CellShade } from "./unitShading";
import type { CellNavProps } from "./useGridNavigation";
import { CardStack } from "./card-stack";
import { CellDropZones } from "./cell-drop-zones";
import styles from "./WeeklyGrid.module.css";

interface GridCellProps {
  subjectId: SubjectId;
  day: number;
  /** Lessons in this cell, in stable order. */
  lessons: Lesson[];
  /** Background + accent for unit shading. */
  shade: CellShade;
  /** The lesson currently being dragged (anywhere in the grid). */
  draggingId: string | null;
  /** Ids of lessons expanded inline. */
  expandedIds: Set<string>;
  /** Currently selected lesson id. */
  selectedId: string | null;
  /**
   * Whether this cell is currently maximized (showing all lessons).
   * When false with >1 lesson, CardStack collapses to a single-card view.
   */
  maximized: boolean;
  /**
   * Arranged layout for this cell, or null for the default CardStack view.
   * Provided by WeeklyGrid when the teacher has placed lessons with a
   * DropRegion (half-left/right, above/below, on).
   */
  cellLayout: CellLayout | null;
  /** Start dragging a lesson out of this cell. */
  onDragStart: (lessonId: string) => void;
  /** Dragging ended without (or after) a drop. */
  onDragEnd: () => void;
  /** A card was dropped onto this cell (legacy / simple case). */
  onDrop: (subjectId: SubjectId, day: number) => void;
  /**
   * A card was dropped onto this cell with explicit region placement.
   * CellDropZones fires this via the `onPick` callback.
   */
  onDropRegion: (subjectId: SubjectId, day: number, region: DropRegion) => void;
  /** The empty/inline add button was pressed. */
  onAdd: (subjectId: SubjectId, day: number) => void;
  /** A lesson card was clicked — select + toggle inline expand. */
  onSelect: (lessonId: string) => void;
  /** Completion checkbox cycled. */
  onToggleComplete: (lessonId: string, next: LessonStatus) => void;
  /** Context-menu action on a lesson card; payload carries move/status detail. */
  onContextAction: (
    action: ContextAction,
    lessonId: string,
    payload?: ContextActionPayload,
  ) => void;
  /** Roving-tabindex + arrow-key props for this cell (subject×day). */
  navProps: CellNavProps;
  /**
   * Request to toggle the maximized state of this cell. WeeklyGrid
   * enforces single-cell-maximized; this cell just asks.
   */
  onToggleMaximize: (subjectId: SubjectId, day: number) => void;
  /**
   * Inline text edit committed on a lesson card. The grid applies the content
   * patch. Threaded from WeeklyGrid through to WeeklyLessonCard.
   */
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
  /**
   * Save-target chosen in the SaveTargetDialog after a real edit. "personal"
   * forks the lesson into the teacher's copy; "core" writes to the shared Core
   * Curriculum. Threaded from WeeklyGrid through to WeeklyLessonCard.
   */
  onSaveTarget: (id: string, target: "personal" | "core") => void;
}

/** A single day/subject cell: drop target, card stack, empty affordance. */
export function GridCell({
  subjectId,
  day,
  lessons,
  shade,
  draggingId,
  expandedIds,
  selectedId,
  maximized,
  cellLayout,
  onDragStart,
  onDragEnd,
  onDrop,
  onDropRegion,
  onAdd,
  onSelect,
  onToggleComplete,
  onContextAction,
  navProps,
  onToggleMaximize,
  onEditLesson,
  onSaveTarget,
}: GridCellProps): ReactNode {
  const [dragOver, setDragOver] = useState(false);

  // Clear the local dragOver highlight whenever the drag session ends.
  // Without this, pressing Escape (which fires onDragEnd on the source
  // but no onDragLeave on the target) leaves the last-hovered cell
  // stuck in its .cellDragOver highlight indefinitely.
  useEffect(() => {
    if (!draggingId) setDragOver(false);
  }, [draggingId]);

  const isEmpty = lessons.length === 0;
  // Multi-lesson cells collapse by default; only maximized ones show all cards.
  const hasMultiple = lessons.length > 1;

  // Unit shading + subject accent are passed to the cell as custom props
  // so the CSS module can tint the background and the hover/drop border.
  const cssVars = {
    "--cell-bg": shade.bg,
    "--cell-accent": shade.accent,
  } as React.CSSProperties;

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    if (!draggingId) return;
    e.preventDefault(); // mark as a valid drop target
    e.dataTransfer.dropEffect = "move";
  }

  function handleNativeDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    // Native drop without a CellDropZones pick — fall back to simple move.
    if (draggingId) onDrop(subjectId, day);
  }

  // CellDropZones fires this when the teacher picks a specific region.
  // It takes priority over the native onDrop handler above because the
  // CellDropZones overlay covers the cell and stops propagation.
  function handleRegionPick(region: DropRegion): void {
    setDragOver(false);
    onDropRegion(subjectId, day, region);
  }

  // The cell is the roving-tabindex focus target for keyboard navigation
  // (planning_document §6.5). navProps supplies tabIndex / arrow-key
  // handling / the data attribute focus moves resolve against.
  const lessonCount = lessons.length;
  const cellLabel =
    lessonCount === 0
      ? "Empty cell"
      : maximized
        ? `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}, expanded`
        : `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}, collapsed`;

  // Build a WeeklyLessonCard node for a given lesson — reused in both the
  // default CardStack path and the split-slot layout path.
  // Note: WeeklyLessonCard is a drop-in for LessonCard (same props) and does
  // not accept a `dense` prop — the grid width (~190px) naturally constrains
  // the card to a compact footprint.
  function renderCard(lesson: Lesson): ReactNode {
    return (
      <div key={lesson.id} className={styles.cardSlot}>
        <WeeklyLessonCard
          lesson={lesson}
          expanded={expandedIds.has(lesson.id)}
          selected={selectedId === lesson.id}
          dragging={draggingId === lesson.id}
          onSelect={onSelect}
          onToggleExpand={onSelect}
          onToggleComplete={onToggleComplete}
          // Forward the full context-action payload (e.g. the target
          // day for "Move to day") straight through to the grid.
          onContextAction={onContextAction}
          // onEditLesson: inline text edits committed by the card.
          onEditLesson={onEditLesson}
          // onSaveTarget: save-target dialog resolved; the card calls this after
          // the teacher picks "personal" or "core" and clears its dirty flag.
          onSaveTarget={onSaveTarget}
          dragHandleProps={{
            draggable: true,
            onDragStart: (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", lesson.id);
              onDragStart(lesson.id);
            },
            onDragEnd,
          }}
        />
      </div>
    );
  }

  // Build the default flat card list for the CardStack fallback path.
  const cardNodes: ReactNode[] = lessons.map((lesson) => renderCard(lesson));

  // Clicking the cell background (not a card, not a button) maximizes it.
  // We only fire when the click lands directly on the cell wrapper or on
  // non-interactive chrome — stopPropagation on the LessonCard and the
  // CardStack arrows keeps card interactions clean.
  function handleCellClick(e: MouseEvent<HTMLDivElement>): void {
    if (isEmpty || !hasMultiple) return;
    // Ignore clicks that already hit a button/interactive child; those
    // handlers stop propagation themselves.
    if (
      (e.target as HTMLElement).closest(
        "button, a, [role='button'], [data-card-interactive]",
      )
    )
      return;
    onToggleMaximize(subjectId, day);
  }

  // Space/Enter on the cell wrapper also toggles maximize (keyboard parity).
  function handleCellKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if ((e.key === "Enter" || e.key === " ") && hasMultiple) {
      e.preventDefault();
      onToggleMaximize(subjectId, day);
    }
  }

  const stateClass =
    !isEmpty && hasMultiple
      ? maximized
        ? styles.cellMaximized
        : styles.cellCollapsed
      : "";

  // ── Split-slot layout renderer ─────────────────────────────────────────
  // When a CellLayout is present the cell renders its row/slot structure
  // rather than the flat CardStack. A row with two slots renders them
  // side-by-side at half width via the .layoutRow and .layoutSlotHalf CSS
  // classes. A slot with >1 lesson is paged via CardStack just as before.
  //
  // In maximized mode all rows and all slot cards are visible — the teacher
  // sees the full arranged layout without paging.
  function renderLayout(layout: CellLayout): ReactNode {
    return layout.map((row, rowIdx) => {
      const isSplit = row.length === 2;
      return (
        <div
          key={rowIdx}
          className={isSplit ? styles.layoutRowSplit : styles.layoutRow}
        >
          {row.map((slot, slotIdx) => {
            // Resolve lessons for this slot from the cell's lesson array.
            const slotLessons = slot
              .map((id) => lessons.find((l) => l.id === id))
              .filter((l): l is Lesson => l !== undefined);

            const slotCards = slotLessons.map((l) => renderCard(l));

            return (
              <div
                key={slotIdx}
                className={
                  isSplit ? styles.layoutSlotHalf : styles.layoutSlotFull
                }
              >
                {/*
                 * A slot with >1 lesson pages via CardStack (paged stack).
                 * A slot with exactly 1 lesson renders it directly.
                 * maximized=true shows every card in the slot vertically.
                 */}
                <CardStack cards={slotCards} maximized={maximized} />
              </div>
            );
          })}
        </div>
      );
    });
  }

  return (
    <div
      className={`${styles.cell} ${stateClass} ${dragOver ? styles.cellDragOver : ""}`}
      style={cssVars}
      role="gridcell"
      aria-label={cellLabel}
      aria-expanded={hasMultiple ? maximized : undefined}
      {...navProps}
      onDragOver={handleDragOver}
      onDragEnter={() => draggingId && setDragOver(true)}
      onDragLeave={(e) => {
        // Only clear when the pointer truly leaves the cell, not when it
        // crosses into a child element.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false);
        }
      }}
      onDrop={handleNativeDrop}
      onClick={handleCellClick}
      onKeyDown={handleCellKeyDown}
    >
      {/*
       * CellDropZones overlays the cell during a drag to show the teacher
       * where their lesson will land. onPick fires with the chosen region
       * and takes priority over the native onDrop fallback above.
       *
       * `visible` is gated on BOTH a drag being active AND the pointer
       * being over this specific cell (dragOver). Without this guard the
       * overlay mounts on every cell the moment any drag begins, dimming
       * the whole grid and stacking overlapping zone labels (~40 cells).
       */}
      <CellDropZones
        visible={!!draggingId && dragOver}
        hasLessons={!isEmpty}
        onPick={handleRegionPick}
      />

      {isEmpty ? (
        <div className={styles.emptyCell}>
          <p className={styles.emptyHint}>Drag a lesson here or click +</p>
          <button
            type="button"
            className={styles.cellAdd}
            onClick={() => onAdd(subjectId, day)}
            aria-label="Add a lesson to this day"
          >
            <PlusIcon />
          </button>
        </div>
      ) : (
        <>
          {/* Collapse button — visible when maximized. */}
          {hasMultiple && (
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={(e) => {
                // Stop so the cell's own click handler doesn't fire too.
                e.stopPropagation();
                onToggleMaximize(subjectId, day);
              }}
              aria-label={maximized ? "Collapse cards" : "Expand all cards"}
            >
              {maximized ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          )}

          {/*
           * Arranged row/slot structure when a CellLayout is present,
           * or the default CardStack otherwise.
           *   maximized=false + >1 card → one card + stacked affordance + arrows
           *   maximized=true           → all cards visible
           *   0 or 1 card              → renders children directly, no chrome
           */}
          {cellLayout !== null ? (
            renderLayout(cellLayout)
          ) : (
            <CardStack cards={cardNodes} maximized={maximized} />
          )}

          {/* Faint add button — shown on cell hover. */}
          <button
            type="button"
            className={styles.cellAddInline}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(subjectId, day);
            }}
            aria-label="Add another lesson to this day"
          >
            <PlusIcon small />
            Add
          </button>
        </>
      )}
    </div>
  );
}

function PlusIcon({ small = false }: { small?: boolean }): ReactNode {
  const size = small ? 13 : 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Up-chevron: collapse the maximized cell back to single-card view. */
function CollapseIcon(): ReactNode {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

/** Down-chevron: expand the cell to show all cards. */
function ExpandIcon(): ReactNode {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
