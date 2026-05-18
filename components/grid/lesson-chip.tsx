"use client";

// lesson-chip.tsx — compact single-line chip for the Weekly grid's move mode.
//
// Move mode contracts every cell to a set of horizontal chips so the whole
// calendar fits on screen and lessons can be dragged around without scrolling.
// LessonChip is that chip — one per lesson (or one representing a stack).
//
// Visual anatomy (left-to-right):
//   [3px subject stripe] [status dot] [title…] [⧉ n badge if stacked]
//
// Subject color: the chip root carries `cp-subj ${lesson.subject}` so the
//   PaletteProvider's CSS bridge resolves --c / --cl / --cd exactly as
//   LessonCard does — no duplicated color logic here.
//
// States:
//   selected  → inset subject-color ring (border + bg tint).
//   dragging  → elevated shadow + slight rotation.
//   stacked   → a pill badge "⧉ {n}" on the right end.
//
// Keyboard: the chip renders as a <button>; onSelect fires on click and
//   on Enter / Space. :focus-visible ring is driven by the CSS module.

import type { ReactNode } from "react";
import type { Lesson, LessonStatus } from "@/lib/types";
import styles from "./lesson-chip.module.css";

// ── Public contract ──────────────────────────────────────────────────────────

export interface LessonChipProps {
  lesson: Lesson;
  /** Highlight this chip as the currently selected lesson. */
  selected?: boolean;
  /** Visual drag state — elevates the chip with shadow + slight tilt. */
  dragging?: boolean;
  /**
   * When >1, this chip stands for a stack of lessons. A stack badge
   * (⧉ n) appears on the right end so the teacher sees at a glance that
   * several lessons are collapsed into this chip.
   */
  stackCount?: number;
  /**
   * Spread onto the chip element so the parent can make it draggable.
   * Typically: { draggable: true, onDragStart, onDragEnd }.
   */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  /** Called with the lesson id when the chip is clicked or activated. */
  onSelect?: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Compact single-line chip for a lesson in the grid's contracted move mode. */
export function LessonChip({
  lesson,
  selected = false,
  dragging = false,
  stackCount,
  dragHandleProps,
  onSelect,
}: LessonChipProps): ReactNode {
  const isStacked = typeof stackCount === "number" && stackCount > 1;

  // Build class list: cp-subj resolves --c/--cl/--cd via the palette bridge,
  // which mirrors exactly how LessonCard handles subject colors.
  const chipClass = [
    // Global classes — outside the CSS module so the palette bridge can
    // override them and they compose with other cp-* utilities.
    "cp-subj",
    lesson.subject,
    // Module classes for state styling.
    styles.chip,
    selected ? styles.selected : "",
    dragging ? styles.dragging : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleClick(): void {
    onSelect?.(lesson.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(lesson.id);
    }
  }

  return (
    <button
      type="button"
      className={chipClass}
      // Scroll-into-view anchor (planner-store convention).
      // scrollPlannerItemIntoView() queries this attribute to find the card
      // after a move/undo/redo, even while the weekly-board is in compact mode.
      data-planner-item={`lesson:${lesson.id}`}
      aria-pressed={selected}
      aria-label={
        isStacked
          ? `${lesson.title} and ${stackCount! - 1} more, ${lesson.subject}`
          : `${lesson.title}, ${lesson.subject}`
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      // Spread drag props (draggable, onDragStart, onDragEnd) from the parent.
      // Cast via unknown because dragHandleProps is HTMLAttributes<HTMLElement>
      // but we are on a <button>; the attributes are identical at runtime.
      {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
    >
      {/* Status dot — completion at a glance */}
      <StatusDot status={lesson.status} />

      {/* Lesson title — single line, ellipsis on overflow */}
      <span className={styles.title}>{lesson.title}</span>

      {/* Stack badge — only when this chip represents multiple lessons */}
      {isStacked && <StackBadge count={stackCount!} />}
    </button>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Small dot indicating lesson completion status. */
function StatusDot({ status }: { status: LessonStatus }): ReactNode {
  const dotClass =
    status === "done"
      ? styles.dotDone
      : status === "partial"
        ? styles.dotPartial
        : styles.dotPending;

  const label =
    status === "done"
      ? "Done"
      : status === "partial"
        ? "Partial"
        : status === "carried"
          ? "Carried over"
          : status === "skipped"
            ? "Skipped"
            : "Not done";

  return (
    <span
      className={`${styles.dot} ${dotClass}`}
      role="img"
      aria-label={label}
    />
  );
}

/**
 * Stack badge: a prominent pill showing ⧉ {n} so teachers see at a glance
 * that several lessons are collapsed into this chip. The ⧉ glyph (U+29C9,
 * "Two Joined Squares") reads as "stacked layers" — widely supported in
 * system fonts at this scale.
 */
function StackBadge({ count }: { count: number }): ReactNode {
  return (
    <span
      className={styles.stackBadge}
      aria-label={`${count} lessons stacked`}
      role="img"
    >
      {/* Layered-cards SVG icon — clearer than the Unicode glyph at 10px */}
      <StackIcon />
      {count}
    </span>
  );
}

/** Miniature "stacked rectangles" icon for the stack badge. */
function StackIcon(): ReactNode {
  return (
    <svg
      className={styles.stackIcon}
      width={9}
      height={9}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Two overlapping rectangles suggesting a deck of cards */}
      <rect x="0" y="3" width="9" height="7" rx="1.5" opacity="0.65" />
      <rect x="3" y="0" width="9" height="7" rx="1.5" />
    </svg>
  );
}
