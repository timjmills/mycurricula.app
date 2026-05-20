"use client";

// PaneSplitter.tsx — a draggable boundary between two adjacent panes.
//
// It is a thin, presentation-light control: the parent owns the size state,
// the clamps, and persistence. This component only:
//   • renders the grab bar (a slim neutral handle that thickens on hover);
//   • runs the pointer-capture drag lifecycle and reports each pointer
//     coordinate (clientX in vertical orientation; clientY in horizontal);
//   • supports keyboard resize — ArrowLeft/Right and ArrowUp/Down arrows
//     nudge by one step, Home/End jump to the min/max.
//
// Orientation:
//   • "vertical"  (default) — a slim COLUMN that lives between two
//                              horizontally adjacent panes (e.g. the
//                              Daily list↔detail boundary, or the
//                              center↔right-rail boundary). Reports
//                              clientX during drag; the conventional
//                              arrow mapping is Left/Up = shrink-left,
//                              Right/Down = grow-left.
//   • "horizontal"          — a short ROW that lives between two
//                              vertically stacked panels (e.g. the
//                              Daily right-rail's panel-to-panel
//                              boundaries). Reports clientY during drag;
//                              the conventional arrow mapping is Up =
//                              shrink-above, Down = grow-above. Left/Right
//                              arrows are unused in this orientation
//                              (they fall through to the browser).
//
// Accessibility: it carries role="separator" with aria-orientation,
// aria-valuemin/max/now, and a tabIndex so it is reachable and operable
// without a pointer (WCAG AA / keyboard-nav requirement, CLAUDE.md §4).
// Pointer capture means the drag keeps tracking even if the cursor briefly
// leaves the handle. The thin hit area is widened by CSS padding so it
// stays an easy ≥grab-friendly target without visually shouting.

import { useCallback } from "react";
import type { ReactNode, PointerEvent, KeyboardEvent } from "react";
import styles from "./DailyView.module.css";

/** Either pane-axis. Affects pointer math + arrow-key handling only. */
export type PaneSplitterOrientation = "vertical" | "horizontal";

interface PaneSplitterProps {
  /** Current adjacent-pane SIZE, in px — the aria-valuenow. In vertical
   *  orientation this is a width (px across the columns); in horizontal
   *  orientation this is a height (px down the stack). */
  width: number;
  /** Allowed size bounds — the aria-valuemin / aria-valuemax. */
  min: number;
  max: number;
  /** Called with the live pointer coordinate on each drag move. The parent
   *  resolves it into a clamped size:
   *    • vertical    → receives clientX
   *    • horizontal  → receives clientY
   *  Home/End still drive this with ±Infinity so the parent clamps to the
   *  bounds without the splitter having to know them. */
  onDrag: (clientCoord: number) => void;
  /** Called to nudge the size by one step. The parent decides which pane
   *  the splitter governs and what direction means there. */
  onStep: (direction: -1 | 1) => void;
  /** aria-label for screen readers — defaults to the lesson-list splitter. */
  label?: string;
  /** Axis the separator runs across. Defaults to "vertical" (a slim column
   *  between two horizontal panes), matching the existing Daily list↔detail
   *  and grid↔rail behavior so callers that don't pass it keep working. */
  orientation?: PaneSplitterOrientation;
  /** Optional extra class for the outer separator element. Lets the rail
   *  position a horizontal splitter inline between two stacked panels
   *  without forking the component's pointer-capture wiring. */
  className?: string;
}

export function PaneSplitter({
  width,
  min,
  max,
  onDrag,
  onStep,
  label = "Resize lesson list",
  orientation = "vertical",
  className,
}: PaneSplitterProps): ReactNode {
  const isHorizontal = orientation === "horizontal";

  // ── Pointer drag ──────────────────────────────────────────────────────
  // On pointer-down we capture the pointer so move/up events keep firing on
  // this element even if the cursor outruns it. Each move reports the
  // relevant axis coordinate; the parent resolves it into a clamped size.
  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      // Only the primary button drags; ignore right/middle clicks.
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      // Only track while we hold the capture (i.e. mid-drag).
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      onDrag(isHorizontal ? e.clientY : e.clientX);
    },
    [onDrag, isHorizontal],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  // ── Keyboard resize ───────────────────────────────────────────────────
  // Arrow keys nudge by one step; Home/End jump to the bounds.
  //   • Vertical splitter: Left/Up shrink the left pane, Right/Down grow it
  //     — the conventional WAI-ARIA separator mapping.
  //   • Horizontal splitter: Up shrinks the pane ABOVE, Down grows it.
  //     Left/Right arrows are unused in this orientation and fall through
  //     to the browser (so the focus ring is reachable via Tab without the
  //     arrows scrolling the rail unexpectedly).
  // Home goes fully narrow / short, End fully wide / tall.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          onStep(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          onStep(1);
          break;
        case "ArrowLeft":
          if (isHorizontal) return; // unused on this axis
          e.preventDefault();
          onStep(-1);
          break;
        case "ArrowRight":
          if (isHorizontal) return; // unused on this axis
          e.preventDefault();
          onStep(1);
          break;
        case "Home":
          e.preventDefault();
          // Repeated steps would be noisy; the parent clamps, so a single
          // large step toward the min lands exactly on it.
          onDrag(-Infinity);
          break;
        case "End":
          e.preventDefault();
          onDrag(Infinity);
          break;
        default:
          break;
      }
    },
    [onStep, onDrag, isHorizontal],
  );

  // Class composition. The base `.splitter` class carries the existing
  // vertical look + cursor + transition. When the caller wants a horizontal
  // separator they pass their own `className` to override the cursor +
  // grip orientation styles — the `data-splitter-orientation` attribute
  // below gives them a clean hook to target. This keeps DailyView's CSS
  // module the single source of truth for the vertical look without
  // forcing a fork for the new axis.
  const splitterClass = [styles.splitter, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={splitterClass}
      role="separator"
      aria-orientation={isHorizontal ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      data-splitter-orientation={orientation}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      {/* The visible grip — a short centered bar; the surrounding div is
          the wider, invisible hit/drag area. In horizontal mode the bar
          flips its dimensions (handled by the caller-supplied className
          via a descendant `> span` selector — see RightRail.module.css's
          .railSplitter rules). */}
      <span className={styles.splitterGrip} aria-hidden="true" />
    </div>
  );
}
