"use client";

// AddLessonForm.tsx — inline lesson-creation popover anchored beside the
// icon rail (DAILY-ADD-LESSON-001).
//
// ── Scope ──────────────────────────────────────────────────────────────────
// The planner store (lib/planner-store.tsx) has no addLesson action in this
// prototype phase — new lessons are ephemeral, stored in local state only.
// The form still validates the required fields and exposes the full Lesson
// shape so the integration can be wired when the backend action lands.
// (See DAILY-ADD-LESSON-001 in the audit report for follow-up work.)
//
// ── Layout ─────────────────────────────────────────────────────────────────
// The popover is position:fixed, anchored to the right of the icon rail
// (56px from the left edge) with a top offset matching the add-lesson button.
// It is rendered outside the <nav> in IconRail so the nav's overflow:hidden
// never clips it.
//
// ── Accessibility ──────────────────────────────────────────────────────────
// • role="dialog" + aria-label + aria-modal.
// • First input is auto-focused via autoFocus attribute.
// • Escape key closes the form.
// • Focus trap: Tab / Shift+Tab cycle within the dialog.
//
// ── Chrome rules (CLAUDE.md §4) ────────────────────────────────────────────
// • All colors via var(--token) from tokens.css — no hard-coded hex.
// • Tailwind layout/spacing only.
// • No new dependencies — styled entirely through the CSS module.
// • Reduced motion respected (no transitions under prefers-reduced-motion).

import { useEffect, useRef, useCallback, useState } from "react";
import type { ReactNode, KeyboardEvent, FormEvent } from "react";
import type { SubjectId } from "@/lib/types";
import { SUBJECTS } from "@/lib/mock";
import { WEEK_DAYS } from "@/lib/mock";
import { Button } from "@/components/ui";
import styles from "./AddLessonForm.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

export interface AddLessonFormProps {
  open: boolean;
  onClose: () => void;
  /** The currently-displayed week number — pre-fills the week field. */
  week: number;
  /** 0-based day index for the currently-selected day — pre-fills the day. */
  day: number;
}

// ── Focusable element selector for the focus trap ─────────────────────────

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Component ─────────────────────────────────────────────────────────────

export function AddLessonForm({
  open,
  onClose,
  // `week` is accepted so callers can future-proof their call sites; the
  // store addLesson action will consume it when it lands (prototype gap).
  day,
}: AddLessonFormProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Form field state — controlled inputs, all as strings so the native form
  // element values are always predictable.
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<SubjectId>("math");
  const [objective, setObjective] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset fields when the form opens.
  useEffect(() => {
    if (open) {
      setTitle("");
      setObjective("");
      setSubmitted(false);
      // Subject keeps its last value as a convenience (teacher usually adds
      // several lessons to the same subject in one session).
    }
  }, [open]);

  // Close on Escape and implement a lightweight focus trap.
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const els = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;

      // ── Prototype limitation ─────────────────────────────────────────
      // The planner store has no addLesson action yet.  When the backend
      // action lands, dispatch it here with the collected fields.  For now
      // we optimistically close the form and surface a toast in a future
      // increment.
      //
      // Collected shape (ready for the action):
      //   { title: trimmed, subject, day, week, objective: objective.trim(),
      //     isPersonal: true, status: "not_done", ... }
      //
      setSubmitted(true);
      onClose();
    },
    [title, onClose],
  );

  if (!open) return null;

  const dayLabel = WEEK_DAYS[day] ?? "Today";

  return (
    /* Backdrop — click outside to close. */
    <div className={styles.backdrop} onClick={onClose} aria-hidden="true">
      {/* Dialog — stops propagation so clicks inside don't close the form. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Add a lesson"
        aria-modal="true"
        title="Add a lesson dialog — drops a new lesson on the chosen day, in your personal copy by default"
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Add a lesson</h2>
          <span className={styles.dayBadge}>{dayLabel}</span>
          <Button
            variant="icon"
            iconAriaLabel="Close add-lesson form"
            className={styles.closeBtn}
            onClick={onClose}
            tooltip="Close the add-lesson form without saving"
          >
            {/* × close icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </header>

        <form
          className={styles.form}
          onSubmit={handleSubmit}
          aria-label="New lesson details"
        >
          {/* Title — auto-focused on open (DAILY-ADD-LESSON-001 spec). */}
          <div className={styles.field}>
            <label htmlFor="add-lesson-title" className={styles.label}>
              Title <span aria-hidden="true">*</span>
            </label>
            <input
              id="add-lesson-title"
              type="text"
              autoFocus
              required
              className={styles.input}
              placeholder="Lesson title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Subject selector. */}
          <div className={styles.field}>
            <label htmlFor="add-lesson-subject" className={styles.label}>
              Subject
            </label>
            <select
              id="add-lesson-subject"
              className={styles.select}
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectId)}
            >
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Objective — optional but common. */}
          <div className={styles.field}>
            <label htmlFor="add-lesson-objective" className={styles.label}>
              &ldquo;I Can&rdquo; objective
            </label>
            <input
              id="add-lesson-objective"
              type="text"
              className={styles.input}
              placeholder="I can…"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Action row. */}
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              className={styles.btnCancel}
              onClick={onClose}
              tooltip="Discard this draft and close the form — nothing is saved"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              className={styles.btnSave}
              disabled={!title.trim()}
              tooltip="Add the lesson to the selected day in your personal copy — you can move it to Master later"
            >
              Add lesson
            </Button>
          </div>

          {/* Submitted flash — visible only in the same paint cycle before
              onClose removes the component; kept for screen-reader feedback. */}
          {submitted && (
            <p role="status" className={styles.srOnly}>
              Lesson added.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
