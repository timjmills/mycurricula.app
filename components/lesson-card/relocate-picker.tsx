"use client";

// relocate-picker.tsx — "Where do you want to move this lesson?" popover.
//
// Opened from the context menu's "Relocate…" item. Asks:
//   • Target day      — segmented control for the school-week days.
//   • Target week     — current week ± N (spin-buttons).
//   • Target subject  — defaults to the lesson's current subject.
//   • Keep original?  — checkbox; when checked the lesson is duplicated,
//                       otherwise moved (relocateLesson(id, target, false)).
//
// Submit → calls relocateLesson(id, { day, week, subject }, keepOriginal).
// Escape or click-outside → closes without acting.
//
// Focus trap mirrors command-palette.tsx: Tab / Shift-Tab cycle inside the
// panel; on open focus moves to the first interactive element.
//
// Tokens only — var(--token) from tokens.css. No new dependencies. ≥44px
// touch targets on all primary controls.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lesson, SubjectId } from "@/lib/types";
import { SUBJECTS, WEEK_DAYS_SHORT } from "@/lib/mock";
import { Button, Tooltip } from "@/components/ui";

// ── Focus-trap selector (mirrors command-palette.tsx) ─────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Props ─────────────────────────────────────────────────────────────────

export interface RelocateTarget {
  day: number;
  week: number;
  subject: SubjectId;
}

export interface RelocatePickerProps {
  lesson: Lesson;
  onClose: () => void;
  /**
   * Called when the teacher confirms the move.
   * Wire to: relocateLesson(id, target, keepOriginal) from usePlanner().
   * NOTE: relocateLesson is added by the parallel lesson-store agent (Task #31).
   * Until it lands this callback fires but the store action is a no-op.
   */
  onRelocate: (target: RelocateTarget, keepOriginal: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function RelocatePicker({
  lesson,
  onClose,
  onRelocate,
}: RelocatePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [day, setDay] = useState(lesson.day);
  const [week, setWeek] = useState(lesson.week);
  const [subject, setSubject] = useState<SubjectId>(lesson.subject);
  const [keepOriginal, setKeepOriginal] = useState(false);

  // ── Open: capture previous focus, move focus into panel ──────────────────
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // ── Close: restore focus ──────────────────────────────────────────────────
  const close = useCallback(() => {
    const prev = previousFocusRef.current;
    onClose();
    if (prev && typeof prev.focus === "function") {
      setTimeout(() => prev.focus(), 0);
    }
  }, [onClose]);

  // ── Keyboard: Esc closes; Tab traps focus inside panel ───────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
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
    [close],
  );

  // ── Click-outside → close ─────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [close]);

  // ── Clamp week to a sane range around the current lesson week ─────────────
  // Allow moving ±13 weeks (a full academic quarter in either direction).
  const MIN_WEEK = Math.max(1, lesson.week - 13);
  const MAX_WEEK = lesson.week + 13;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onRelocate({ day, week, subject }, keepOriginal);
      close();
    },
    [day, week, subject, keepOriginal, onRelocate, close],
  );

  return (
    // Backdrop — click-outside is handled by the mousedown listener above.
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(20, 22, 32, 0.24)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Relocate lesson"
        title="Relocate lesson dialog — pick a new day, week, and subject; optionally keep the original lesson where it is"
        onKeyDown={handleKeyDown}
        style={{
          background: "var(--paper)",
          borderRadius: 10,
          border: "1px solid var(--ink-150)",
          boxShadow: "var(--shadow-popover)",
          padding: "20px 22px 18px",
          width: 320,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        {/* Header */}
        <Tooltip
          content="Relocate lesson dialog — pick a new day, week, and subject; optionally keep the original lesson where it is. Moves are personal unless you explicitly save them to the Team Curriculum."
          side="bottom"
        >
          <div
            tabIndex={0}
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--ink-900)",
              marginBottom: 18,
            }}
          >
            Relocate lesson
          </div>
        </Tooltip>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* ── Day picker ──────────────────────────────────────────────── */}
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--ink-500)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
                display: "block",
              }}
            >
              Day
            </legend>
            <div style={{ display: "flex", gap: 4 }}>
              {WEEK_DAYS_SHORT.map((label, i) => (
                <Tooltip
                  key={label}
                  content={`Move this lesson to ${label} of the target week.`}
                  side="bottom"
                >
                  <button
                    type="button"
                    aria-pressed={day === i}
                    onClick={() => setDay(i)}
                    title={`Move this lesson to ${label} of the target week`}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderRadius: 6,
                      border:
                        day === i
                          ? "2px solid var(--ink-700)"
                          : "1px solid var(--ink-200)",
                      background: day === i ? "var(--ink-900)" : "var(--paper)",
                      color: day === i ? "var(--paper)" : "var(--ink-700)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "background 120ms, color 120ms, border 120ms",
                    }}
                  >
                    {label}
                  </button>
                </Tooltip>
              ))}
            </div>
          </fieldset>

          {/* ── Week picker ─────────────────────────────────────────────── */}
          <div>
            <label
              htmlFor="relocate-week"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--ink-500)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Week
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Tooltip content="Step back one school week." side="top">
                <button
                  type="button"
                  aria-label="Previous week"
                  title="Step back one school week"
                  disabled={week <= MIN_WEEK}
                  onClick={() => setWeek((w) => Math.max(MIN_WEEK, w - 1))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 6,
                    border: "1px solid var(--ink-200)",
                    background: "var(--paper)",
                    color: "var(--ink-700)",
                    fontSize: 16,
                    cursor: week <= MIN_WEEK ? "not-allowed" : "pointer",
                    opacity: week <= MIN_WEEK ? 0.38 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  −
                </button>
              </Tooltip>
              <input
                id="relocate-week"
                type="number"
                min={MIN_WEEK}
                max={MAX_WEEK}
                value={week}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v))
                    setWeek(Math.min(MAX_WEEK, Math.max(MIN_WEEK, v)));
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 6,
                  border: "1px solid var(--ink-200)",
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--ink-900)",
                  // Remove native number arrows — the ± buttons serve that purpose.
                  MozAppearance: "textfield",
                }}
              />
              <Tooltip content="Step forward one school week." side="top">
                <button
                  type="button"
                  aria-label="Next week"
                  title="Step forward one school week"
                  disabled={week >= MAX_WEEK}
                  onClick={() => setWeek((w) => Math.min(MAX_WEEK, w + 1))}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 6,
                    border: "1px solid var(--ink-200)",
                    background: "var(--paper)",
                    color: "var(--ink-700)",
                    fontSize: 16,
                    cursor: week >= MAX_WEEK ? "not-allowed" : "pointer",
                    opacity: week >= MAX_WEEK ? 0.38 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Subject picker ──────────────────────────────────────────── */}
          <div>
            <label
              htmlFor="relocate-subject"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--ink-500)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Subject
            </label>
            <select
              id="relocate-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectId)}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 6,
                border: "1px solid var(--ink-200)",
                padding: "0 10px",
                fontSize: 14,
                color: "var(--ink-900)",
                background: "var(--paper)",
                appearance: "auto",
              }}
            >
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* ── Keep original checkbox ─────────────────────────────────── */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              minHeight: 44,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={keepOriginal}
              onChange={(e) => setKeepOriginal(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                flexShrink: 0,
                cursor: "pointer",
              }}
            />
            <span
              style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.4 }}
            >
              Keep the original here
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--ink-400)",
                  marginTop: 1,
                }}
              >
                Leaves a copy in the current slot; creates a new one at the
                target.
              </span>
            </span>
          </label>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 2,
            }}
          >
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={close}
              tooltip="Close this picker without relocating the lesson"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              tooltip={
                keepOriginal
                  ? "Create a copy of this lesson at the chosen day and week — the original stays where it is"
                  : "Move this lesson to the chosen day and week — it disappears from its current slot"
              }
            >
              {keepOriginal ? "Duplicate to here" : "Move here"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
