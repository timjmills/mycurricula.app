"use client";

// AddEventForm.tsx — inline event-creation popover anchored beside the
// icon rail (DAILY-ADD-EVENT-001).
//
// ── Scope ──────────────────────────────────────────────────────────────────
// An "event" here is a non-academic schedule block (assembly, field trip,
// specialist, etc.) that the teacher wants to record on their daily timeline.
// It maps to ScheduleBlock{ type:"non_academic", label, start, end } in
// lib/types.ts — but the schedule store is not yet writable in this prototype
// phase. The form validates the fields and is ready for wiring when the
// backend action lands. (See DAILY-ADD-EVENT-001 in the audit report.)
//
// ── Layout & accessibility ────────────────────────────────────────────────
// Same popover pattern as AddLessonForm: position:fixed anchored beside the
// icon rail, role="dialog" + aria-modal, first-input autoFocus, Escape to
// close, Tab focus trap.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────
// All colors via var(--token); no hard-coded hex; Tailwind layout only;
// no new dependencies; reduced-motion respected.

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  ReactNode,
  KeyboardEvent,
  FormEvent,
  CSSProperties,
} from "react";
import { WEEK_DAYS } from "@/lib/mock";
import { Button, Tooltip } from "@/components/ui";
import styles from "./AddEventForm.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

export interface AddEventFormProps {
  open: boolean;
  onClose: () => void;
  /** 0-based day index for the currently-selected day — shown in the header. */
  day: number;
  /** Configured weekday label ("Sunday") for the header. Falls back to the
   *  Sun–Thu WEEK_DAYS mock BY POSITIONAL INDEX when omitted — which is wrong
   *  for any other configured school week, so planner callers should pass the
   *  real label from their ordered-week source. */
  dayLabel?: string;
  /** Optional viewport point (px) to anchor the popover near. Used by the
   *  weekly frames so the dialog opens beside the triggering cell instead of
   *  the Daily icon-rail default (left:64px, which overlaps the weekly
   *  sidebar). Null/undefined keeps the default CSS positioning — so /daily is
   *  unaffected. */
  anchor?: { x: number; y: number } | null;
}

// ── Focusable element selector for the focus trap ─────────────────────────

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Time helper ───────────────────────────────────────────────────────────

/** Round a Date to the next 5-minute boundary and return "HH:MM". */
function nextRoundTime(): string {
  const now = new Date();
  const mins = Math.ceil((now.getMinutes() + 1) / 5) * 5;
  const d = new Date(now);
  d.setMinutes(mins, 0, 0);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Add `durationMins` to a "HH:MM" time string. Returns "HH:MM". */
function addMinutes(time: string, durationMins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + durationMins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function AddEventForm({
  open,
  onClose,
  day,
  dayLabel,
  anchor,
}: AddEventFormProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  const defaultStart = nextRoundTime();
  const defaultEnd = addMinutes(defaultStart, 30);

  const [label, setLabel] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  // Honest prototype notice: the schedule store has no addBlock action yet, so
  // an event can't actually be saved. On submit we surface this VISIBLY rather
  // than announcing a phantom success and closing (the old behavior).
  const [notWiredNotice, setNotWiredNotice] = useState(false);

  // Viewport size, tracked live while open: the anchored clamp below must
  // recompute when the viewport shrinks mid-open (device rotation,
  // split-screen, virtual keyboard) or the dialog can extend below the NEW
  // viewport bottom (Codex W5 R4). A bare re-render tick would do, but
  // holding the size in state keeps the clamp math readable. NOT a
  // close-on-resize — the mobile virtual keyboard fires resize while typing.
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(
    null,
  );
  useEffect(() => {
    if (!open) return;
    const update = (): void =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  // Reset on open; keep start/end as sensible "current time + 30m" defaults.
  useEffect(() => {
    if (open) {
      const s = nextRoundTime();
      setLabel("");
      setStart(s);
      setEnd(addMinutes(s, 30));
      setNotWiredNotice(false);
    }
  }, [open]);

  // Recalculate end when start changes (if end would be before start, push it
  // 30 minutes ahead automatically so the user only has to fix one field).
  const handleStartChange = useCallback(
    (next: string) => {
      setStart(next);
      setNotWiredNotice(false);
      if (next >= end) {
        setEnd(addMinutes(next, 30));
      }
    },
    [end],
  );

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
      const trimmed = label.trim();
      if (!trimmed) return;
      if (start >= end) return;

      // ── Prototype limitation ─────────────────────────────────────────
      // The schedule store has no addBlock action yet, so this cannot persist.
      // Surface that HONESTLY (a visible notice) instead of announcing a
      // phantom "Event added." and silently closing. The fields + validation
      // are left intact so the Phase-1B wiring drops straight in here:
      //   dispatch { type: "non_academic", label: trimmed, start, end }
      //   onto the day's schedule for `week` / `day`.
      setNotWiredNotice(true);
    },
    [label, start, end],
  );

  if (!open) return null;

  const resolvedDayLabel = dayLabel ?? WEEK_DAYS[day] ?? "Today";
  const timeError = start >= end ? "End must be after start" : null;

  // When a caller supplies an anchor point, position the fixed dialog beside it
  // (clamped fully on-screen), overriding the CSS icon-rail default. The
  // Daily callsite passes no anchor, so its left:64px behavior is unchanged.
  const anchoredStyle: CSSProperties | undefined = anchor
    ? (() => {
        const DIALOG_W = 280; // matches .dialog width
        const DIALOG_H = 360; // generous height estimate for the clamp
        const vw =
          viewport?.w ??
          (typeof window !== "undefined" ? window.innerWidth : 1280);
        const vh =
          viewport?.h ??
          (typeof window !== "undefined" ? window.innerHeight : 800);
        const top = Math.max(12, Math.min(anchor.y, vh - DIALOG_H));
        return {
          left: Math.max(12, Math.min(anchor.x, vw - DIALOG_W - 12)),
          top,
          // DIALOG_H is only an ESTIMATE — a taller real form (notice shown,
          // large text/zoom) must not extend past the viewport bottom, so cap
          // the height from the CLAMPED top and let overflow-y scroll
          // internally (Codex W5 R3).
          maxHeight: vh - top - 12,
          // Cancel the CSS vertical-centering transform + slide animation, which
          // assume the default centered position and would fight the anchor.
          transform: "none",
          animation: "none",
        };
      })()
    : undefined;

  return (
    /* Backdrop — click outside to close. */
    <div className={styles.backdrop} onClick={onClose} aria-hidden="true">
      {/* Dialog — stops propagation so clicks inside don't close the form. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Add an event"
        aria-modal="true"
        title="Add a non-academic event (assembly, field trip, specialist) to this day's timeline"
        className={styles.dialog}
        style={anchoredStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <Tooltip
            content="Add a non-academic event (assembly, field trip, specialist) to this day's timeline. Events live alongside your lessons in the daily schedule."
            side="bottom"
          >
            <h2 className={styles.title} tabIndex={0}>
              Add an event
            </h2>
          </Tooltip>
          <span className={styles.dayBadge}>{resolvedDayLabel}</span>
          <Button
            variant="icon"
            iconAriaLabel="Close add-event form"
            className={styles.closeBtn}
            onClick={onClose}
            tooltip="Close the add-event form without saving"
          >
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
          aria-label="New event details"
        >
          {/* Label / name — auto-focused on open. */}
          <div className={styles.field}>
            <label htmlFor="add-event-label" className={styles.label}>
              Event name <span aria-hidden="true">*</span>
            </label>
            <input
              id="add-event-label"
              type="text"
              autoFocus
              required
              className={styles.input}
              placeholder="Assembly, field trip…"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setNotWiredNotice(false);
              }}
              maxLength={80}
            />
          </div>

          {/* Time range — start + end side by side. */}
          <div className={styles.timeRow}>
            <div className={styles.field}>
              <label htmlFor="add-event-start" className={styles.label}>
                Start
              </label>
              <input
                id="add-event-start"
                type="time"
                required
                className={styles.input}
                value={start}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="add-event-end" className={styles.label}>
                End
              </label>
              <input
                id="add-event-end"
                type="time"
                required
                className={`${styles.input} ${timeError ? styles.inputError : ""}`}
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setNotWiredNotice(false);
                }}
                aria-describedby={
                  timeError ? "add-event-time-error" : undefined
                }
              />
            </div>
          </div>
          {timeError && (
            <p
              id="add-event-time-error"
              className={styles.errorMsg}
              role="alert"
            >
              {timeError}
            </p>
          )}

          {/* Action row. */}
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              className={styles.btnCancel}
              onClick={onClose}
              tooltip="Discard this draft event and close the form"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              className={styles.btnSave}
              disabled={!label.trim() || !!timeError}
              tooltip="Add this event to the day's schedule between the start and end times"
            >
              Add event
            </Button>
          </div>

          {notWiredNotice && (
            <p role="status" className={styles.notWired}>
              Events can’t be saved yet — coming with editable schedules.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
