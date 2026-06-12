"use client";

// compare-to-master.tsx — side-by-side diff between a teacher's personal
// overlay and the Core Curriculum (Master) version of the same lesson.
//
// STUB NOTE: The current data model stores only the teacher's personal copy;
// there is no "master snapshot" field on the Lesson type yet. Until the
// Supabase backend lands (Phase 1B+), the Master pane renders the same
// lesson values but notes clearly that the master snapshot is unavailable.
// When the backend does land, thread a `masterSnapshot: Partial<Lesson>`
// prop in here and replace the "(Master snapshot not available yet)" copy
// with the real diff.
//
// Layout: two panes side-by-side (stacked on narrow viewports). Each
// diffable field occupies one row. Values that differ from each other are
// highlighted with a subtle tinted background. Values that are identical
// render normally; the row still appears so the teacher can see the full
// picture.
//
// Footer:
//   "Restore from Master"  → confirm then call restoreLesson(id).
//                            NOTE: restoreLesson is added by Task #31 (parallel
//                            agent). Until it lands, this button fires onRestore
//                            but the store action is a no-op.
//   "Close"                → onClose().
//
// Focus trap mirrors command-palette.tsx. Escape closes.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/types";
import { Button, Tooltip } from "@/components/ui";
import { STATUS_LABEL } from "./status";
import { WEEK_DAYS } from "@/lib/mock";

// ── Focus-trap selector ───────────────────────────────────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Strip HTML for plain-text display ────────────────────────────────────
function stripHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? tmp.innerText ?? html;
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface CompareToMasterProps {
  lesson: Lesson;
  onClose: () => void;
  /**
   * Triggered by "Restore from Master" after the inline confirmation step.
   * Wire to: restoreLesson(lesson.id) from usePlanner() (Task #31).
   */
  onRestore: () => void;
}

// ── Diff row ──────────────────────────────────────────────────────────────

interface DiffField {
  label: string;
  masterValue: string;
  personalValue: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export function CompareToMaster({
  lesson,
  onClose,
  onRestore,
}: CompareToMasterProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // confirmRestore: true when the teacher has clicked "Restore from Master"
  // and we're showing the inline "Are you sure?" step before calling onRestore.
  const [confirmRestore, setConfirmRestore] = useState(false);

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

  // ── Keyboard: Esc closes; Tab traps ──────────────────────────────────────
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

  // ── Build the diff rows ───────────────────────────────────────────────────
  // STUB: The master version is not stored in the current data model.
  // Each "master" value here is the lesson's current value (they appear
  // identical because there is only one record). Once the backend lands and
  // a `masterSnapshot` prop is available, replace the `masterValue` side
  // with `masterSnapshot[field]` for each field.
  const dayLabel = WEEK_DAYS[lesson.day] ?? `Day ${lesson.day}`;
  const diffFields: DiffField[] = [
    {
      label: "Title",
      masterValue: "(Team Curriculum snapshot not available yet)",
      personalValue: stripHtml(lesson.title),
    },
    {
      label: "Objective",
      masterValue: "(Team Curriculum snapshot not available yet)",
      personalValue: stripHtml(lesson.objective),
    },
    {
      label: "Day",
      masterValue: "(Team Curriculum snapshot not available yet)",
      personalValue: dayLabel,
    },
    {
      label: "Time",
      masterValue: "(Team Curriculum snapshot not available yet)",
      personalValue: lesson.time ?? "—",
    },
    {
      label: "Status",
      masterValue: "(Team Curriculum snapshot not available yet)",
      personalValue: STATUS_LABEL[lesson.status] ?? lesson.status,
    },
  ];

  // A row is "different" when the two values are not identical plain-text.
  // Since master values are all stub text right now they will always match
  // the sentinel string; this logic is ready for when real data arrives.
  const isDifferent = (f: DiffField) =>
    f.masterValue !== f.personalValue &&
    f.masterValue !== "(Team Curriculum snapshot not available yet)";

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--scrim-soft)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compare to Team Curriculum"
        title="Compare to Team Curriculum dialog — see your personal edits side-by-side with the team's curriculum version of this lesson"
        onKeyDown={handleKeyDown}
        style={{
          background: "var(--paper)",
          borderRadius: 10,
          border: "1px solid var(--ink-150)",
          boxShadow: "var(--shadow-popover)",
          width: 640,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--ink-100)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <Tooltip
              content="Compare to Team Curriculum dialog — see your personal edits side-by-side with the team's curriculum version of this lesson. Useful before deciding whether to push your changes to the team."
              side="bottom"
            >
              <div
                tabIndex={0}
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--ink-900)",
                  marginBottom: 3,
                }}
              >
                Compare to Team Curriculum
              </div>
            </Tooltip>
            <div
              style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.4 }}
            >
              {stripHtml(lesson.title)}
            </div>
          </div>
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Close comparison"
            onClick={close}
            tooltip="Close the comparison without changing anything"
            style={{ flexShrink: 0 }}
          >
            ×
          </Button>
        </div>

        {/* ── Stub notice ──────────────────────────────────────────────────── */}
        {/* TODO (backend): Remove this notice once the Supabase backend stores
            master snapshots and the `masterSnapshot` prop is threaded through. */}
        <div
          style={{
            padding: "10px 22px",
            background: "var(--important-bg)",
            borderBottom: "1px solid var(--ink-100)",
            fontSize: 12,
            color: "var(--important)",
            lineHeight: 1.45,
          }}
        >
          Team Curriculum snapshots are not yet stored in the data model. The
          Team Curriculum column below shows placeholder text. Once the
          backend lands, this panel will show the real diff.
        </div>

        {/* ── Column headers ───────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 1fr",
            padding: "8px 22px 0",
            gap: 12,
          }}
        >
          <div />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--ink-400)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              paddingBottom: 4,
            }}
          >
            Team Curriculum
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--ink-400)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              paddingBottom: 4,
            }}
          >
            Your version
          </div>
        </div>

        {/* ── Diff rows ────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            padding: "0 22px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {diffFields.map((field) => {
            const different = isDifferent(field);
            const rowBg = different ? "var(--important-bg)" : "transparent";
            return (
              <div
                key={field.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 1fr",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--ink-100)",
                  background: rowBg,
                  // Extend the highlight to the panel edges by negative margin.
                  marginLeft: different ? -22 : 0,
                  marginRight: different ? -22 : 0,
                  paddingLeft: different ? 22 : 0,
                  paddingRight: different ? 22 : 0,
                }}
              >
                {/* Field label */}
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    paddingTop: 1,
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  {field.label}
                </div>

                {/* Master value */}
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink-400)",
                    lineHeight: 1.45,
                    fontStyle: "italic",
                  }}
                >
                  {field.masterValue}
                </div>

                {/* Personal value */}
                <div
                  style={{
                    fontSize: 13,
                    color: different ? "var(--ink-900)" : "var(--ink-700)",
                    fontWeight: different ? 500 : 400,
                    lineHeight: 1.45,
                  }}
                >
                  {field.personalValue}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "14px 22px 16px",
            borderTop: "1px solid var(--ink-100)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {/* Confirm-restore inline step — shown after first click. */}
          {confirmRestore ? (
            <>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ink-600, var(--ink-700))",
                  marginRight: 4,
                  flex: 1,
                }}
              >
                This will replace your personal version with the Team
                Curriculum. Are you sure?
              </span>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setConfirmRestore(false)}
                tooltip="Cancel the restore — your personal edits stay intact"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={() => {
                  onRestore();
                  close();
                }}
                tooltip="Confirm: replace your personal copy with the Team Curriculum version (your edits will be lost)"
              >
                Restore from Team Curriculum
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setConfirmRestore(true)}
                tooltip="Discard your personal edits and revert to the Team Curriculum version — you'll be asked to confirm"
              >
                Restore from Team Curriculum
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={close}
                tooltip="Close this comparison without making any changes"
              >
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
