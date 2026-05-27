"use client";

// note-popover.tsx — the "Why not done" reason affordance for the Weekly
// Lesson Card. Previously the reason ("Fire drill ate 15 min — pushed
// drafting to Wed") rendered inline as `.reasonRow`, which made the
// collapsed card unbounded inside the fixed-height grid matrix.
//
// This component replaces that inline block with a compact, bounded
// affordance: a small alert-triangle icon button on the card that opens a
// floating popover panel holding the reason text.
//
// Anatomy:
//   • Trigger — a small warning-triangle button in the `--catchup` color,
//     wrapped in a ≥44px hit area (negative-margin trick, mirroring the
//     card's other affordances). Only mounted when a reason exists.
//   • Panel  — an absolutely-positioned floating card on the paper surface:
//       ~260px wide, rounded, subtle border + soft drop shadow.
//       Header row: alert icon + "Note" title + an "X" close button.
//       Body: the reason text in normal `--ink`.
//
// The reason data (`Lesson.reasonNotDone`) is a plain string — there is no
// label / time / author / date — so the panel shows only the title + text.
//
// Dismissal: the X button, a click outside the panel, and the Escape key.
// Under prefers-reduced-motion the open/close fade is suppressed (the CSS
// module zeroes the transition duration).

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Tooltip } from "@/components/ui";
import styles from "./note-popover.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface NotePopoverProps {
  /** The reason text — `Lesson.reasonNotDone`. Plain string, no sub-fields. */
  reason: string;
}

// ── Inline icons ─────────────────────────────────────────────────────────────
// Minimal stroked SVGs defined locally — same self-contained pattern as the
// card's ChevronUpIcon / ChevronDownIcon (no shared Icon import needed).

/** Warning triangle — the reason affordance glyph. */
function AlertIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2L1.5 13.5h13L8 2z" />
      <path d="M8 6.5v3.5" />
      <path d="M8 12h.01" />
    </svg>
  );
}

/** Close (X) glyph for the popover header. */
function CloseIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function NotePopover({ reason }: NotePopoverProps) {
  // open: whether the floating panel is mounted/visible.
  const [open, setOpen] = useState(false);

  // Root wraps both the trigger and the panel so outside-click detection can
  // test containment against this single element.
  const rootRef = useRef<HTMLDivElement>(null);
  // Trigger ref so focus can return to it after the panel closes.
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Stable id pairing the trigger (aria-controls) with the panel.
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // ── Outside-click + Escape dismissal ───────────────────────────────────
  // Only wired while the panel is open. Pointerdown (capture) catches a click
  // anywhere outside the root; Escape closes and restores focus to the trigger.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        // Return focus to the trigger so keyboard users keep their place.
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Trigger — small alert-triangle button. The ≥44px hit area is the
          button itself; the negative margin pulls the oversized target back
          so it does not bloat the footer / band-controls cluster it sits in
          (same trick as the card's `.affordance` controls). stopPropagation
          keeps the click from reaching the card's expand/select handlers.
          Raw <button> retained here because Tooltip.cloneElement injects ref
          and the Button primitive does not forward ref. The trigger also needs
          aria-haspopup="dialog" + aria-controls which are dialog-specific. */}
      <Tooltip
        content="Open the catch-up note — see why this lesson didn't go as planned and any context the team left for next time"
        side="top"
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          aria-label="Why this lesson did not go as planned"
          title="Open the catch-up note explaining why this lesson didn't finish"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <span aria-hidden className={styles.triggerVisual}>
            <AlertIcon size={11} />
          </span>
        </button>
      </Tooltip>

      {/* Floating panel — absolutely positioned, anchored above-right of the
          trigger. Only mounted while open. role="dialog" + aria-label so it
          is announced; clicks inside are stopped from bubbling to the card. */}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Lesson note"
          title="Catch-up note dialog — explains why this lesson fell behind and what to do about it next"
          className={styles.panel}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {/* Header: alert icon + "Note" title + X close button. */}
          <div className={styles.panelHeader}>
            <span aria-hidden className={styles.panelIcon}>
              <AlertIcon size={12} />
            </span>
            <Tooltip
              content="Catch-up note — explains why this lesson fell behind and what the team plans to do about it next."
              side="bottom"
            >
              <span className={styles.panelTitle} tabIndex={0}>
                Note
              </span>
            </Tooltip>
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Close note"
              tooltip="Close this catch-up note popover"
              className={styles.panelClose}
              onClick={(e) => {
                e.stopPropagation();
                close();
                triggerRef.current?.focus();
              }}
            >
              <CloseIcon size={11} />
            </Button>
          </div>

          {/* Body: the reason text. `reasonNotDone` is a plain string, so
              there is nothing else to render — no label / author / date. */}
          <p className={styles.panelBody}>{reason}</p>
        </div>
      )}
    </div>
  );
}
