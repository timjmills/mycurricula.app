"use client";

// save-confirm-dialog.tsx — courtesy confirm shown when a teacher clicks
// OUTSIDE the Settings popup while it holds unsaved-looking changes.
//
// Settings auto-persist to localStorage, so this is NOT a data-loss warning —
// it's a "did you mean to leave?" courtesy. The popup shell
// (app/settings/layout.tsx, owned by builder-shell) opens this when an
// outside-click lands AND `useSettingsDirty().isDirty()` reports a change.
//
// Anatomy:
//   • Dim backdrop — full-viewport overlay. z-index 900 puts it ABOVE the
//     Settings popup backdrop (800). Click closes via onKeepEditing.
//   • Modal panel (centered): heading + reassuring body line + two buttons.
//
// Accessibility contract (cloned from components/weekly/save-target-dialog.tsx):
//   • role="dialog" + aria-modal="true" + aria-labelledby the heading.
//   • On open: focus moves to the primary "Save & close" button.
//   • Focus trap: Tab / Shift-Tab cycle inside the panel.
//   • Esc fires onKeepEditing.
//   • On close: focus restores to the element focused before opening.
//
// Token rules: all color + type + spacing via var(--token) from tokens.css.
// Never hard-code hex or px values. Reduced motion collapses the fade-in.

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";
import styles from "./save-confirm-dialog.module.css";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SaveConfirmDialogProps {
  /** Render the dialog only when true. */
  open: boolean;
  /** Primary — close the popup. Changes are already persisted. */
  onSaveAndClose: () => void;
  /** Secondary / dismiss (Esc, backdrop) — stay in Settings. */
  onKeepEditing: () => void;
}

// ── Focusable query ───────────────────────────────────────────────────────────
// All standard keyboard-reachable elements inside the dialog.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Component ─────────────────────────────────────────────────────────────────

export function SaveConfirmDialog({
  open,
  onSaveAndClose,
  onKeepEditing,
}: SaveConfirmDialogProps): ReactNode {
  const headingId = useId();
  const primaryId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Track the element that held focus before opening so we can restore it on
  // close — avoids a jarring focus jump for keyboard users.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Open / close effects ──────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      // Capture the currently-focused element for restoration later.
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Move focus to the primary button on the next paint so it's mounted.
      // The Button primitive isn't a forwardRef, so we locate the rendered
      // <button> by id rather than holding a ref to the component.
      const frame = requestAnimationFrame(() => {
        const primary =
          panelRef.current?.querySelector<HTMLButtonElement>(
            `#${CSS.escape(primaryId)}`,
          ) ?? null;
        primary?.focus();
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
  }, [open, primaryId]);

  // ── Keyboard handling ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onKeepEditing();
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
    [onKeepEditing],
  );

  // ── Backdrop click ────────────────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only close when the click lands directly on the backdrop overlay,
      // not when it bubbles up from the modal panel itself.
      if (e.target === e.currentTarget) {
        onKeepEditing();
      }
    },
    [onKeepEditing],
  );

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
        <h2 id={headingId} className={styles.heading}>
          Save changes and close?
        </h2>
        <p className={styles.body}>
          Your changes are saved automatically. Close settings and go back to
          your planner?
        </p>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {/* "Save & close" / "Keep editing" are self-evident labels, so per
            CLAUDE.md §4 they carry no onboarding tooltip — only clear
            aria-labels. */}
        <div className={styles.actions}>
          <Button
            variant="ghost"
            className={styles.keepBtn}
            onClick={onKeepEditing}
            aria-label="Keep editing — stay in settings"
          >
            Keep editing
          </Button>
          <Button
            id={primaryId}
            variant="primary"
            className={styles.saveBtn}
            onClick={onSaveAndClose}
            aria-label="Save and close — return to your planner"
          >
            Save &amp; close
          </Button>
        </div>
      </div>
    </div>
  );
}
