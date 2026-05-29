"use client";

// PresentBar.tsx — the thin top strip shown in Present mode
// (docs/teach-view-plan.md §4.6 T6; Agent A). The board content beneath it is
// Agent C/D's; Agent A owns only this chrome strip + the present-mode exit
// behavior. Prototype reference: `ABTeachPresent`'s dark header.
//
//   [PRESENTING] · board name · class context · · slide counter · prev/next ·
//   Esc exit
//
// A PURE presentational component. It dispatches against the frozen
// `TeachWorkspaceAction` union to leave Present mode
// ({ type: "setPresent", present: false }) and calls back for prev/next slide
// navigation (the slide model lives in the board, Agent C/D). It also installs
// an Escape handler so Esc exits Present even when focus is not on a control —
// the Esc cascade in `use-teach-shortcuts` covers the global case, but the
// PresentBar mounts only in Present mode so a local handler keeps exit reliable
// when the workspace shortcut hook is not mounted in the present subtree.

import type { Dispatch, ReactNode } from "react";
import { useCallback, useEffect } from "react";
import type { TeachWorkspaceAction } from "../TeachWorkspace";
import { Tooltip } from "@/components/ui";
import styles from "./TeachChrome.module.css";

// ── Props ──────────────────────────────────────────────────────────────────

export interface PresentBarProps {
  dispatch: Dispatch<TeachWorkspaceAction>;
  /** Board name shown in the strip (e.g. "Warm-Up board"). */
  boardName: string;
  /** Optional class / lesson context appended after the board name. */
  contextLabel?: string;
  /** Subject of the active lesson — tints the PRESENTING badge via `.cp-subj`.
   *  Falls back to math when absent. */
  subject?: string;
  /** 1-based current slide / board index. */
  slideIndex: number;
  /** Total slides / boards. */
  slideCount: number;
  /** Go to the previous slide / board. Optional. */
  onPrev?: () => void;
  /** Go to the next slide / board. Optional. */
  onNext?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PresentBar({
  dispatch,
  boardName,
  contextLabel,
  subject = "math",
  slideIndex,
  slideCount,
  onPrev,
  onNext,
}: PresentBarProps): ReactNode {
  const exit = useCallback(
    () => dispatch({ type: "setPresent", present: false }),
    [dispatch],
  );

  // Local Escape handler — exits Present reliably even if the global
  // shortcut hook is not mounted in this subtree. Suppressed inside text
  // inputs so an in-board edit keeps Esc for its own cancel.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const ce = t.getAttribute("contenteditable");
        if (ce !== null && ce !== "false") return;
      }
      e.preventDefault();
      exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit]);

  const atStart = slideIndex <= 1;
  const atEnd = slideIndex >= slideCount;

  return (
    <div
      className={styles.presentBar}
      role="toolbar"
      aria-label="Presentation controls"
    >
      <span className={`${styles.presentBadge} cp-subj ${subject}`}>
        PRESENTING
      </span>
      <span className={styles.presentTitle}>
        {boardName}
        {contextLabel ? ` · ${contextLabel}` : ""}
      </span>

      <div className={styles.presentSpacer} aria-hidden="true" />

      <span
        className={styles.presentCounter}
        aria-label={`Slide ${slideIndex} of ${slideCount}`}
      >
        {slideIndex} / {slideCount}
      </span>

      <Tooltip content="Previous board" side="bottom">
        <button
          type="button"
          className={styles.presentNavBtn}
          onClick={onPrev}
          disabled={atStart}
          aria-label="Previous board"
        >
          ‹ prev
        </button>
      </Tooltip>
      <Tooltip content="Next board" side="bottom">
        <button
          type="button"
          className={styles.presentNavBtn}
          onClick={onNext}
          disabled={atEnd}
          aria-label="Next board"
        >
          next ›
        </button>
      </Tooltip>

      <Tooltip
        content="Leave Present mode and return to the editing workspace"
        side="bottom"
        tooltipId="teach-present-exit"
      >
        <button
          type="button"
          className={styles.presentExit}
          onClick={exit}
          aria-label="Exit Present mode"
        >
          <span className={`cp-mono ${styles.kbd}`}>Esc</span> exit
        </button>
      </Tooltip>
    </div>
  );
}
