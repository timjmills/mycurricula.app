"use client";

// save-target-dialog.tsx — pop-up that asks a teacher where to save lesson edits.
//
// Shown whenever a teacher finishes editing a lesson card and the app needs to
// know whether the change goes to their own Personalized Curriculum (a personal
// fork of the master plan, visible only to them) or to the shared Core
// Curriculum (the Master plan every team member sees).
//
// Anatomy (top to bottom):
//   • Dim backdrop — full-viewport overlay; click closes.
//   • Modal panel (centered):
//       Heading "Save your changes" + lesson title line
//       Two choice cards, side-by-side on wider viewports:
//         [Personalized Curriculum]  [Core Curriculum  ← weighted warning]
//       Each card: icon · title · sub-line description.
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
  const chooseCore = useCallback(() => onChoose("core"), [onChoose]);

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
        className={styles.panel}
        onKeyDown={handleKeyDown}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <h2 id={headingId} className={styles.heading}>
            Save your changes
          </h2>
          <p className={styles.lessonLine}>
            <span className={styles.lessonLabel}>Lesson:</span>{" "}
            <span className={styles.lessonTitle}>{lessonTitle}</span>
          </p>
        </div>

        {/* ── Prompt text ─────────────────────────────────────────────────── */}
        <p className={styles.prompt}>Where should these edits be saved?</p>

        {/* ── Choice cards ────────────────────────────────────────────────── */}
        <div
          className={styles.choices}
          role="group"
          aria-label="Save destination"
        >
          {/* ── Personalized Curriculum ─────────────────────────────────── */}
          <button
            ref={personalBtnRef}
            type="button"
            className={`${styles.choiceBtn} ${styles.choiceBtnPersonal}`}
            onClick={choosePersonal}
            aria-label="Save to Personalized Curriculum — keeps this change in your own copy. Only you see it."
          >
            {/* Icon — person silhouette outline */}
            <span className={styles.choiceIcon} aria-hidden="true">
              <PersonalIcon />
            </span>
            <span className={styles.choiceText}>
              <span className={styles.choiceTitle}>
                Personalized Curriculum
              </span>
              <span className={styles.choiceSub}>
                Keeps this change in your own copy. Only you see it.
              </span>
            </span>
          </button>

          {/* ── Core Curriculum ─────────────────────────────────────────── */}
          {/* Visual weight: uses --core-mode token family (soft red/pink) to
              signal that this is the weightier, team-wide action. Not alarming —
              the tokens.css comment says "carries the shared plan warning without
              feeling like an emergency" — but clearly distinct from Personal. */}
          <button
            type="button"
            className={`${styles.choiceBtn} ${styles.choiceBtnCore}`}
            onClick={chooseCore}
            aria-label="Save to Core Curriculum — updates the shared plan for the whole team."
          >
            {/* Icon — stacked-pages / team plan symbol */}
            <span className={styles.choiceIcon} aria-hidden="true">
              <CoreIcon />
            </span>
            <span className={styles.choiceText}>
              <span className={styles.choiceTitle}>Core Curriculum</span>
              <span className={styles.choiceSub}>
                Updates the shared plan for the whole team.
              </span>
            </span>
            {/* Subtle "shared" badge reinforces the weight of this choice */}
            <span className={styles.coreBadge} aria-hidden="true">
              Shared
            </span>
          </button>
        </div>

        {/* ── Dismiss link ────────────────────────────────────────────────── */}
        {/* Keyboard users can reach Cancel via Tab; it is the last focusable
            element so the trap boundary is clearly defined. */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            aria-label="Cancel — dismiss without saving"
          >
            Cancel
          </button>
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

function CoreIcon() {
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
      {/* Stack of pages suggesting the shared master plan */}
      <rect x="4" y="6" width="14" height="14" rx="2" />
      <path d="M7 6V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v12" />
      {/* Horizontal lines inside the page to suggest content */}
      <line x1="7" y1="11" x2="15" y2="11" />
      <line x1="7" y1="14" x2="13" y2="14" />
    </svg>
  );
}
