// FocusMode — a single widget fullscreened within the board canvas (T7,
// docs/teach-view-plan.md §4.6). It overlays the grid (positioned absolutely
// over the canvas, NOT the whole viewport). Esc or a click on the backdrop
// returns to the board (dispatches focusWidget(null) via `onClose`). A shrink
// button in the card header does the same. Display-only body in v1.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { SubjectId, Widget } from "@/lib/types";
import { WidgetBody, widgetMeta, boardTintVar, TeachIcon } from "../widgets";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./board.module.css";

export interface FocusModeProps {
  widget: Widget;
  subjectId?: SubjectId;
  /** Return to the board (dispatch focusWidget(null)). */
  onClose: () => void;
}

export function FocusMode({
  widget,
  subjectId,
  onClose,
}: FocusModeProps): ReactNode {
  const scrimRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const meta = widgetMeta(widget.type);
  const tileBg = boardTintVar(meta?.tint ?? "none");

  // Esc closes. Bound at the document so it works regardless of focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Trap Tab within the dialog and move focus onto the focus card on open;
  // focus restores to the trigger (the widget's Expand button) on close
  // (audit A1). The card is the initial target — it's the programmatic
  // `tabIndex={-1}` focus host so a keyboard user lands inside the overlay.
  useFocusTrap({ containerRef: scrimRef, initialFocusRef: cardRef });

  return (
    <div
      ref={scrimRef}
      className={styles.focusScrim}
      role="dialog"
      aria-modal="true"
      aria-label={`${widget.title} — focus mode`}
      onMouseDown={(e) => {
        // Click on the backdrop (not the card) returns to the board.
        if (e.target === scrimRef.current) onClose();
      }}
    >
      <div className={styles.focusHead}>
        <span className={styles.focusBadge}>FOCUS MODE</span>
        <span className={styles.focusHint}>
          Press <span className={`cp-mono ${styles.focusKey}`}>Esc</span> or
          click outside to return to the board
        </span>
        <button
          type="button"
          className={styles.focusBtn}
          aria-label="Exit focus mode"
          onClick={onClose}
        >
          <TeachIcon name="shrink" size={16} />
        </button>
      </div>
      <div className={styles.focusStage}>
        <div
          ref={cardRef}
          tabIndex={-1}
          className={styles.focusCard}
          style={
            tileBg
              ? ({ ["--tile-bg" as string]: tileBg } as CSSProperties)
              : undefined
          }
        >
          <div className={styles.focusCardHead}>
            <span className={styles.focusCardKicker}>
              {meta?.kicker ?? widget.title.toUpperCase()}
            </span>
          </div>
          <div className={styles.focusCardBody}>
            <WidgetBody widget={widget} subjectId={subjectId} />
          </div>
        </div>
      </div>
    </div>
  );
}
