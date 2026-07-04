"use client";

// AddLessonForm.tsx — inline lesson-creation popover anchored beside the
// icon rail (DAILY-ADD-LESSON-001).
//
// ── Scope ──────────────────────────────────────────────────────────────────
// W3.7 — submit is REAL: it awaits the planner store's addLesson mutator
// (which awaits the data source's createLesson — mock or Supabase — and
// dispatches the returned lesson with its source-minted id), then closes and
// hands the new id to `onCreated` so the caller can select/open it. The
// optional objective rides INSIDE the create input (W3.7 audit #5) — the
// prior post-create editLesson tee could fail silently and strand the lesson
// without its objective. The prior documented no-op (DAILY-ADD-LESSON-001)
// is gone.
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

import { useLayoutEffect, useRef, useCallback, useState } from "react";
import type { ReactNode, KeyboardEvent, FormEvent } from "react";
import type { SubjectId } from "@/lib/types";
import { WEEK_DAYS } from "@/lib/mock";
import { usePlanner } from "@/lib/planner-store";
import { Button, Tooltip } from "@/components/ui";
import styles from "./AddLessonForm.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

export interface AddLessonFormProps {
  open: boolean;
  onClose: () => void;
  /** The currently-displayed week number — pre-fills the week field. */
  week: number;
  /** 0-based day index for the currently-selected day — pre-fills the day. */
  day: number;
  /** W3.7 — called with the CREATED lesson's source-minted id after a
   *  successful submit (fires just before onClose). DailyView routes it to
   *  the openLessonPlanner seam so the new lesson opens immediately. */
  onCreated?: (lessonId: string) => void;
}

// ── Focusable element selector for the focus trap ─────────────────────────

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Component ─────────────────────────────────────────────────────────────

export function AddLessonForm({
  open,
  onClose,
  week,
  day,
  onCreated,
}: AddLessonFormProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Subject picker options come from the planner store's catalog (frozen
  // API), not lib/mock — safe here, AddLessonForm is rendered by DailyView
  // (and DailyList) under the (planner) /daily route (PlannerProvider).
  // addLesson is the W3.7 real create; the optional objective rides in its
  // input (audit #5), so no post-create edit tee is needed.
  const { subjects, addLesson } = usePlanner();

  // Form field state — controlled inputs, all as strings so the native form
  // element values are always predictable.
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<SubjectId>("math");
  const [objective, setObjective] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // In-flight guard — true from submit until the source resolves. Blocks a
  // double Enter/click from creating two lessons. Drives the disabled/label
  // presentation only; the AUTHORITATIVE guard is inFlightRef below.
  const [busy, setBusy] = useState(false);
  // W3.7 audit #4 — ref twin of `busy`. State resets when the popover
  // closes/reopens mid-create (the `open` effect below), which would let a
  // second submit through while the first round-trip is still in flight →
  // two lessons. The ref survives the open/close cycle and is checked at
  // the top of handleSubmit; it clears only when the create settles.
  const inFlightRef = useRef(false);
  // W3.7 audit #3 — create-failure message (addLesson → null). Cleared on
  // open and on the next submit attempt; rendered as the form's inline
  // role="alert" line (AddEventForm's errorMsg pattern).
  const [createError, setCreateError] = useState<string | null>(null);
  // W3.7 audit re-pass — submit GENERATION token. A create can outlive the
  // form session that started it (submit A, close mid-flight, reopen, type
  // draft B): when A settles, the stale completion must not touch the NEW
  // session's state — setCreateError would pin A's error on B's draft, and
  // onCreated + onClose would close and discard B. Every open/close
  // transition bumps the counter; each submit captures it and skips ALL
  // form-state effects on mismatch. The store-level dispatch already
  // happened inside addLesson, so a successful stale create still lands in
  // the day list (correct); only the form stays hands-off.
  const submitGenRef = useRef(0);

  // Reset fields when the form opens. Deliberately does NOT touch
  // inFlightRef (audit #4) — a create still in flight from a previous
  // open must keep blocking submits.
  //
  // useLayoutEffect, not useEffect (audit re-pass confirmation finding): the
  // generation bump must be SYNCHRONOUS with the open/close commit. A passive
  // effect runs after paint, leaving a window where an awaited create resolves
  // against the old token and mutates the new session anyway; layout effects
  // flush before the browser yields to the event loop, so no awaited
  // continuation can interleave.
  useLayoutEffect(() => {
    // BOTH transitions (open and close) invalidate any in-flight submit's
    // claim on the form state — bump before the open-gated reset.
    submitGenRef.current += 1;
    if (open) {
      setTitle("");
      setObjective("");
      setSubmitted(false);
      setBusy(false);
      setCreateError(null);
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
      // inFlightRef, not `busy`, is the double-create gate (audit #4):
      // `busy` resets on close/reopen while a create can still be pending.
      if (!trimmed || inFlightRef.current) return;

      // ── W3.7 — the real create ───────────────────────────────────────
      // Await the store's addLesson (which awaits the data source and
      // dispatches the RETURNED lesson — no optimistic id, see
      // planner-store). The optional objective rides in the create input
      // (audit #5) so it lands atomically with the row. On failure (null)
      // the form stays open with the draft intact AND shows an inline
      // error (audit #3) — the store already console.debug'd the cause.
      inFlightRef.current = true;
      // Capture this submit's generation (audit re-pass) — if the popover
      // closes/reopens before the create settles, the ref moves on and the
      // completion below goes hands-off on the form.
      const gen = submitGenRef.current;
      setBusy(true);
      setCreateError(null); // a fresh attempt clears the previous failure
      void (async () => {
        try {
          const lesson = await addLesson({
            subject,
            week,
            day,
            title: trimmed,
            objective: objective.trim() || undefined,
          });
          // Stale-session guard (audit re-pass): skip ALL form-state
          // effects — no error on the wrong draft, no onCreated/onClose
          // discarding it. A successful create is already in the day list
          // via the store dispatch; inFlightRef still clears in finally.
          if (gen !== submitGenRef.current) return;
          if (!lesson) {
            setBusy(false);
            setCreateError(
              "Couldn’t add the lesson — check your connection and try again.",
            );
            return;
          }
          setSubmitted(true);
          onCreated?.(lesson.id);
          onClose();
        } finally {
          inFlightRef.current = false;
        }
      })();
    },
    [title, subject, week, day, objective, addLesson, onCreated, onClose],
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
          <Tooltip
            content="Add a lesson dialog — drops a new lesson on the chosen day, in your personal copy by default"
            side="bottom"
          >
            <h2 className={styles.title} tabIndex={0}>
              Add a lesson
            </h2>
          </Tooltip>
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
              {subjects.map((s) => (
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

          {/* Create-failure line (W3.7 audit #3) — addLesson resolved null
              (source rejected/failed); the draft stays intact above so the
              teacher can retry. Cleared on the next submit attempt.
              role="alert" so screen readers announce the failure
              (AddEventForm's inline errorMsg pattern). */}
          {createError && (
            <p className={styles.errorMsg} role="alert">
              {createError}
            </p>
          )}

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
              // Disabled while empty AND while the create round-trip is in
              // flight (W3.7) — a double Enter must not mint two lessons.
              disabled={!title.trim() || busy}
              aria-busy={busy}
              tooltip="Add the lesson to the selected day in your personal copy — you can move it to the Team Curriculum later"
            >
              {busy ? "Adding…" : "Add lesson"}
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
