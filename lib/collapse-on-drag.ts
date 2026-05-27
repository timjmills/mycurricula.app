"use client";

// collapse-on-drag.ts — shared foundation for the collapse-on-drag
// interaction pattern (docs/historical/5.18.26
// collapse_on_drag_pattern.md). When the user picks up a card/section,
// every peer collapses to a single-line chip; on drop they re-expand.
//
// The Weekly view and the Daily section-reorder both build on this; per
// the spec (§2) it is built once. Each surface owns its own DragState —
// the state machine is board-level, never per-card.

import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/** A surface element renders either as full content or a collapsed chip. */
export type Density = "full" | "compact";

/**
 * Board-level drag state machine (spec §2.2). One instance per draggable
 * surface. `dropping` is the brief window for the drop animation.
 */
export type DragState =
  | { phase: "idle" }
  | { phase: "dragging"; activeId: string; overId: string | null }
  | { phase: "dropping"; activeId: string };

/** The density a surface renders at — derived from its drag state. */
export function densityFor(state: DragState): Density {
  return state.phase === "idle" ? "full" : "compact";
}

/**
 * Motion tokens for the pattern (spec §2.4 / §7). App policy is 200ms
 * ease-out, no springs. framer-motion `transition` props reference these;
 * under reduced motion, callers swap to `DRAG_MOTION.reduced`.
 */
export const DRAG_MOTION = {
  /** Collapse-to-chip on drag-start, and re-expand on drop. */
  collapse: { duration: 0.2, ease: "easeOut" },
  /** The dragged chip settling into its final slot. */
  drop: { duration: 0.22, ease: [0.2, 0, 0, 1] },
  /** Drop-indicator sliding between gaps. */
  indicator: { duration: 0.15, ease: "easeOut" },
  /** prefers-reduced-motion fallback — opacity-only, no layout move. */
  reduced: { duration: 0.15, ease: "linear" },
};

/** Chip / overlay visual dimensions (spec §7). */
export const DRAG_CHIP = {
  /** Collapsed Weekly lesson-card height. */
  cardChipHeight: 28,
  /** Collapsed Daily lesson-section height. */
  sectionChipHeight: 40,
  /** Subject color stripe — preserved full-height in chip mode. */
  subjectStripeWidth: 6,
  /** Minimum touch target for the grab handle. */
  handleTouchTarget: 44,
  /** Floating-chip treatment while it rides the cursor. */
  floatingScale: 1.02,
  floatingOpacity: 0.95,
};

/**
 * dnd-kit sensors for the pattern (spec §2.5): pointer, touch, keyboard.
 *
 * The pointer sensor uses a small activation distance so a plain click
 * (which opens / expands a card) is never mis-read as a drag. Touch uses
 * a short press delay — an explicit grab is required, never a body
 * long-press (that conflicts with tap-to-expand). Keyboard support is
 * first-class: Space lifts, arrows move, Space drops, Esc cancels.
 */
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
