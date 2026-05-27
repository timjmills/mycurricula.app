"use client";

// UnitHealthCard.tsx — per-unit health summary card in the Subject view.
//
// Layout:
//   4px top stripe in the subject color (var(--c)) — one color per subject,
//   unit cycling not yet implemented (the mock has one unit per subject).
//   Header row: U# tile · unit name · NOW pill (if current)
//   Progress bar: COVERED — done / total, fills with var(--cd)
//   Stat row: Standards covered/total · Skipped count · When (month range)
//   "Don't miss" callout: soft-tinted box, editable by the lead teacher.
//
// The "Don't miss" field is inline-editable via a small pencil button that
// switches the label to a textarea. Edits are persisted via useSetUnitNote()
// from lib/unit-notes.tsx (localStorage under `mycurricula:unit-dontmiss`).
//
// Subject colors come from the .cp-subj cascade (var(--c)/--cl/--cd)) — the
// parent SubjectView wraps everything in `cp-subj <subjectId>`.

import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import { useSetUnitNote } from "@/lib/unit-notes";
import { Button, Tooltip } from "@/components/ui";
import styles from "./UnitHealthCard.module.css";

// ── Types ─────────────────────────────────────────────────────────────────

export interface UnitHealthData {
  /** Unit id, e.g. "u-m3". */
  id: string;
  /** 1-based display number shown in the U# tile. */
  index: number;
  /** Full unit name. */
  name: string;
  /** Whether this is the active ("NOW") unit for the current week. */
  isCurrent: boolean;
  /** Lessons marked "done". */
  done: number;
  /** Total lessons in the unit. */
  total: number;
  /** Lessons with status "skipped". */
  skipped: number;
  /** Unique standard codes covered (status=done lessons). */
  standardsCovered: number;
  /** Total unique standard codes across all lessons in the unit. */
  standardsTotal: number;
  /** Human-readable span, e.g. "Nov → Jan". Derived from lesson dates. */
  when: string;
  /** The lead teacher's "don't miss" callout for this unit. */
  dontMiss: string;
  /** Whether the current user is the lead teacher (may edit dontMiss). */
  canEdit: boolean;
  /** Editor's display name shown below the callout label. */
  editorName: string;
}

// ── Edit pencil icon ──────────────────────────────────────────────────────

function PencilIcon(): ReactNode {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ── UnitHealthCard ─────────────────────────────────────────────────────────

export function UnitHealthCard({ unit }: { unit: UnitHealthData }): ReactNode {
  const setNote = useSetUnitNote();

  // Editing state — toggled by the pencil button.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit.dontMiss);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea when editing begins.
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end.
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  function handleSave(): void {
    const trimmed = draft.trim();
    setNote(unit.id, trimmed);
    setEditing(false);
  }

  function handleCancel(): void {
    setDraft(unit.dontMiss);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }

  const pct = unit.total > 0 ? Math.round((unit.done / unit.total) * 100) : 0;
  const displayNote = unit.dontMiss; // kept live from prop; draft tracks the edit

  return (
    <div
      className={[styles.card, unit.isCurrent ? styles.cardCurrent : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Top color stripe — uses subject's --c token via the parent cascade */}
      <span className={styles.stripe} aria-hidden="true" />

      {/* Header: U# tile + name + NOW pill */}
      <div className={styles.header}>
        <span className={styles.unitTile} aria-hidden="true">
          U{unit.index}
        </span>
        <div className={styles.headerText}>
          <div className={styles.unitName}>{unit.name}</div>
          {/* W2-B6 subtitle — a one-line context line under the unit name so
              the card stays scannable but reveals lesson count + standards
              coverage without forcing the reader to interpret the stat row
              tiles. */}
          <div className={styles.unitSubtitle}>
            {unit.total} lesson{unit.total === 1 ? "" : "s"} ·{" "}
            {unit.standardsCovered}/{unit.standardsTotal} standards
          </div>
        </div>
        {unit.isCurrent && (
          <span className={styles.nowPill} aria-label="Current unit">
            NOW
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className={styles.progressRow}>
        <span className={styles.progressLabel}>COVERED</span>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% of unit covered`}
        >
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.progressPct}>{pct}%</span>
        <span className={styles.progressFraction}>
          {unit.done}/{unit.total}
        </span>
      </div>

      {/* Stat row: Standards · Skipped · When */}
      <div className={styles.statRow}>
        <div className={styles.statItem}>
          <Tooltip
            content="Fraction of distinct standards covered by completed lessons in this unit."
            side="top"
            tooltipId="unit-health-standards-stat"
          >
            <div className={styles.statItemLabel}>STANDARDS</div>
          </Tooltip>
          <div className={styles.statItemValue}>
            {unit.standardsCovered}{" "}
            <span className={styles.statItemDenom}>
              / {unit.standardsTotal}
            </span>
          </div>
        </div>

        <div className={styles.statItem}>
          <div className={styles.statItemLabel}>SKIPPED</div>
          <div
            className={styles.statItemValue}
            style={unit.skipped > 0 ? { color: "var(--catchup)" } : undefined}
          >
            {unit.skipped}
          </div>
        </div>

        <div className={styles.statItem}>
          <div className={styles.statItemLabel}>WHEN</div>
          <div className={`${styles.statItemValue} ${styles.whenValue}`}>
            {unit.when}
          </div>
        </div>
      </div>

      {/* "Don't miss" callout */}
      <div className={styles.callout}>
        <div className={styles.calloutHeader}>
          <span className={styles.calloutLabel}>DON&apos;T MISS</span>
          <span className={styles.calloutEditor}>{unit.editorName}</span>
          {unit.canEdit && !editing && (
            <Tooltip
              content="Edit the unit's don't-miss callout — the one move the team agrees nobody should skip teaching this unit"
              side="top"
            >
              <Button
                variant="ghost"
                size="sm"
                className={styles.editBtn}
                onClick={() => {
                  setDraft(displayNote);
                  setEditing(true);
                }}
                aria-label="Edit don't-miss callout"
                tooltip="Edit the don't-miss callout for this unit"
              >
                <PencilIcon />
              </Button>
            </Tooltip>
          )}
        </div>

        {editing ? (
          <div className={styles.editArea}>
            <textarea
              ref={textareaRef}
              className={styles.editTextarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              aria-label="Edit don't-miss callout text"
              placeholder="What's the one move not to miss in this unit?"
            />
            <div className={styles.editActions}>
              <Button
                variant="primary"
                size="sm"
                className={styles.saveBtn}
                onClick={handleSave}
                aria-label="Save callout"
                tooltip="Save this don't-miss callout — the whole team sees the new text on their Subject view"
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={styles.cancelBtn}
                onClick={handleCancel}
                aria-label="Cancel edit"
                tooltip="Discard your edits and revert to the previous callout text"
              >
                Cancel
              </Button>
              <span className={styles.editHint}>
                ⌘↵ to save · Esc to cancel
              </span>
            </div>
          </div>
        ) : (
          <p className={styles.calloutText}>
            {displayNote || (
              <span className={styles.calloutEmpty}>
                {unit.canEdit
                  ? "Click the pencil to add a callout for this unit."
                  : "No callout set for this unit."}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
