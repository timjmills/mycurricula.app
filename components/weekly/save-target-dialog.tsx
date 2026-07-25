"use client";

// save-target-dialog.tsx — pop-up that asks a teacher where to save lesson edits.
//
// Shown whenever a teacher finishes editing a lesson card. It confirms that the
// change lands in their own Personal Curriculum — a personal fork of the team
// plan, visible only to them. Internal "core" / "master" values are retained in
// code/IDs (Unified Audit Section 0 Decision #2).
//
// ⚠ THE TEAM CURRICULUM CHOICE WAS REMOVED, AND MUST NOT COME BACK UNTIL THE
// WRITE EXISTS. It was a live, reachable, false-success control: the button read
// "Team Curriculum — Updates the shared plan for the whole team" with a "Shared"
// badge, and the store's reducer is `case "setSaveTarget": if (action.target !==
// "personal") return doc;` (lib/planner-store.tsx) — "core" returned the
// document unchanged. Choosing Team was indistinguishable from choosing
// Personal, with no error, no toast, and no visual difference, while the UI said
// the whole team would see it. There was no editMode gate either; it fired in
// Personal mode too.
//
// The user has ruled on this family of defect once already — "hide it until it
// works" — and commit 6324fe8 deleted the equivalent "Push to Team" button for
// exactly this reason. This was the same hazard on a fourth surface (see
// docs/7.23.26-unified-v2-plan.md §5.2). The real master write is Phase 2
// forking semantics and is deliberately NOT built here.
//
// `onChoose` still carries the `"personal" | "core"` union so the seam is intact
// for that wave; nothing in this file can emit "core" today.
//
// Anatomy (top to bottom):
//   • Dim backdrop — full-viewport overlay; click closes.
//   • Modal panel (centered):
//       Heading "Save your changes" + lesson title line
//       One choice card: [Personal Curriculum]
//       The card: icon · title · sub-line description.
//
// Accessibility contract:
//   • role="dialog" + aria-modal="true" + aria-labelledby the heading.
//   • On open: focus moves to the Personalized button (safer default).
//   • Focus trap: Tab / Shift-Tab cycle inside the dialog.
//   • Esc fires onClose.
//   • On close: focus restores to the element that was focused before opening.
//
// Token rules: all color + type + spacing via var(--token) from tokens.css.
// Core choice uses --core-mode / --core-mode-bg / --core-mode-deep.
// Never hard-code hex or px values.

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { Button, Tooltip } from "@/components/ui";
import styles from "./save-target-dialog.module.css";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SaveTargetDialogProps {
  /** Render the dialog only when true. */
  open: boolean;
  /** The lesson's title (plain text), shown in the prompt. */
  lessonTitle: string;
  /** Fired with the teacher's choice. */
  onChoose: (target: "personal" | "core") => void;
  /** Fired when the dialog is dismissed without choosing (Esc / backdrop). */
  onClose: () => void;
}

// ── Focusable query ───────────────────────────────────────────────────────────
// All standard keyboard-reachable elements inside the dialog.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Component ─────────────────────────────────────────────────────────────────

export function SaveTargetDialog({
  open,
  lessonTitle,
  onChoose,
  onClose,
}: SaveTargetDialogProps): ReactNode {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const personalBtnRef = useRef<HTMLButtonElement>(null);
  // Track the element that held focus before the dialog opened so we can
  // restore it on close — avoids a jarring focus jump for keyboard users.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Open / close effects ──────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      // Capture the currently-focused element for restoration later.
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Move focus into the dialog on the next paint so the panel is mounted.
      const frame = requestAnimationFrame(() => {
        personalBtnRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    } else {
      // Restore focus to the element that was active before we opened.
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        // Small timeout lets the dialog finish unmounting before focus moves.
        const timer = setTimeout(() => prev.focus(), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [open]);

  // ── Keyboard handling ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap: keep Tab / Shift-Tab cycling inside the panel.
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;

        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift-Tab: if focus is at the first element, wrap to the last.
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if focus is at the last element, wrap to the first.
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  // ── Backdrop click ────────────────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only close when the click lands directly on the backdrop overlay,
      // not when it bubbles up from the modal panel itself.
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // ── Choice handlers ───────────────────────────────────────────────────────

  const choosePersonal = useCallback(() => onChoose("personal"), [onChoose]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    /* Backdrop — dims the rest of the UI and catches clicks to close. */
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      aria-hidden={false}
    >
      {/* Dialog panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        title="Save confirmation — this lesson edit is kept in your personal copy, which only you can see"
        className={styles.panel}
        onKeyDown={handleKeyDown}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <Tooltip
            content="Save confirmation — this lesson edit is kept in your personal copy, which only you can see."
            side="bottom"
          >
            <h2 id={headingId} className={styles.heading} tabIndex={0}>
              Save your changes
            </h2>
          </Tooltip>
          <p className={styles.lessonLine}>
            <span className={styles.lessonLabel}>Lesson:</span>{" "}
            <span className={styles.lessonTitle}>{lessonTitle}</span>
          </p>
        </div>

        {/* ── Prompt text ─────────────────────────────────────────────────── */}
        <p className={styles.prompt}>These edits stay in your own copy.</p>

        {/* ── Choice cards ────────────────────────────────────────────────── */}
        <div
          className={styles.choices}
          role="group"
          aria-label="Save destination"
        >
          {/* ── Personal Curriculum ─────────────────────────────────────── */}
          <Tooltip
            content="Save into your personal copy only — nobody else's planner is affected. This is the default for everyday lesson tweaks."
            side="top"
          >
            <button
              ref={personalBtnRef}
              type="button"
              className={`${styles.choiceBtn} ${styles.choiceBtnPersonal}`}
              onClick={choosePersonal}
              aria-label="Save to Personal Curriculum — keeps this change in your own copy. Only you see it."
              title="Save into your personal copy only — nobody else's planner is affected"
            >
              {/* Icon — person silhouette outline */}
              <span className={styles.choiceIcon} aria-hidden="true">
                <PersonalIcon />
              </span>
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>
                  Personal Curriculum
                </span>
                <span className={styles.choiceSub}>
                  Keeps this change in your own copy. Only you see it.
                </span>
              </span>
            </button>
          </Tooltip>

        </div>

        {/* ── Dismiss ─────────────────────────────────────────────────────── */}
        {/* Keyboard users reach this via Tab; it is the last focusable element
            so the trap boundary is clearly defined.

            IT SAYS "Close", NOT "Cancel", AND THAT IS THE POINT. `onClose` is
            not a discard: the host treats dismissal as the Personal save
            (weekly-lesson-card's `onClose` calls `onSaveTarget(id,
            "personal")`), and `editLesson` had already persisted the edit
            before this dialog opened. So there was never anything to cancel —
            the old "Cancel — dismiss without saving" label promised a discard
            no code path performs, which is the same false-label defect as the
            Team option removed above, one control away from it. Nothing here
            may be relabelled back to Cancel until an actual revert exists. */}
        <div className={styles.footer}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.cancelBtn}
            onClick={onClose}
            aria-label="Close — your edits are already saved to your personal copy"
            tooltip="Close this message. Your edits are already saved in your personal copy of the lesson."
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
// Minimal, consistent with the pattern in weekly-lesson-card.tsx (ChevronUpIcon
// et al.). No import required — keeps this file self-contained.

function PersonalIcon() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Person head */}
      <circle cx="12" cy="8" r="4" />
      {/* Shoulders */}
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
