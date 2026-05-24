"use client";

// CatchupRow — one uncovered-item row inside the Catch-up screen body.
//
// Each row carries the cp-subj.<id> cascade so `var(--c)` resolves to the
// subject color, used for the left stripe, the uppercase subject metadata,
// and the dashed "Carry over" outline. The visible left stripe is rendered
// via background-image rather than border-left so the dashed variant
// (used when the underlying lesson is .modified) lines up against the
// row's 4px reservation.
//
// Status tints: `partial` and `carried` get a soft color-mix tint; the
// neutral `not_done` falls back to paper and `skipped` reads on ink-100.
// All actions delegate up to the parent via callbacks — this row owns
// only its own "note draft" UI state.

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import type { CatchupItem } from "@/lib/catchup-data";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { StatusPill } from "./StatusPill";
import styles from "./CatchupRow.module.css";

interface CatchupRowProps {
  item: CatchupItem;
  selected: boolean;
  /** Persisted note text from useCatchup() — empty string if none yet. */
  note: string;
  onToggleSelect: () => void;
  onMarkDone: () => void;
  onSkip: () => void;
  onCarryOver: () => void;
  onJumpToLesson: () => void;
  onSaveNote: (next: string) => void;
}

// Small inline SVG icons — keep them token-driven via stroke=currentColor.

function IconLink() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconPencil() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Map status → row background tint. See StatusPill for the matching
// foreground tokens. `not_done` reads as the baseline (paper).
function rowBgFor(status: CatchupItem["status"]): string {
  switch (status) {
    case "partial":
      return "color-mix(in srgb, var(--important) 8%, white)";
    case "carried":
      return "color-mix(in srgb, var(--catchup) 8%, white)";
    case "skipped":
      return "var(--ink-100)";
    case "not_done":
    default:
      return "var(--paper)";
  }
}

// Build the left stripe via background — solid when the lesson is unedited,
// repeating-linear-gradient when modified (dashed variant from BUILD_STANDARD).
function stripeStyle(modified: boolean): CSSProperties {
  if (!modified) {
    return {
      backgroundImage: "linear-gradient(var(--c), var(--c))",
      backgroundRepeat: "no-repeat",
      backgroundSize: "4px 100%",
      backgroundPosition: "0 0",
    };
  }
  return {
    backgroundImage:
      "repeating-linear-gradient(to bottom, var(--c) 0 4px, transparent 4px 8px)",
    backgroundRepeat: "no-repeat",
    backgroundSize: "4px 100%",
    backgroundPosition: "0 0",
  };
}

// Unit-short helper: strip the "Unit N · " prefix the meta line shows.
function shortUnit(unit: string): string {
  return unit.replace(/^Unit\s+\d+\s+·\s+/i, "");
}

export function CatchupRow({
  item,
  selected,
  note,
  onToggleSelect,
  onMarkDone,
  onSkip,
  onCarryOver,
  onJumpToLesson,
  onSaveNote,
}: CatchupRowProps) {
  const subj = SUBJECT_BY_ID[item.subject];
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(note);

  const checkboxId = useId();
  const noteFieldId = useId();
  // Prefer a teacher-added note from useCatchup over the lesson's stale
  // reasonNotDone (the latter is the mock snapshot — Catch-up notes win).
  const visibleNote = note || item.reasonNotDone;

  const handleEditNote = () => {
    setDraft(note); // start from the persisted catch-up note, not reasonNotDone
    setEditingNote(true);
  };

  const handleNoteBlur = () => {
    onSaveNote(draft);
    setEditingNote(false);
  };

  return (
    <div
      className={`cp-subj ${subj.cls} ${styles.row}`}
      style={{
        background: selected
          ? "color-mix(in srgb, var(--c) 6%, var(--paper))"
          : rowBgFor(item.status),
        ...stripeStyle(item.modified),
      }}
      data-planner-item={`lesson:${item.lessonId}`}
    >
      <input
        type="checkbox"
        id={checkboxId}
        className={styles.checkbox}
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${item.title}`}
      />

      <div className={styles.body}>
        {/* Metadata row: SUBJECT · unit · day · status pill */}
        <div className={styles.meta}>
          <span className={styles.subject} style={{ color: "var(--c)" }}>
            {subj.name}
          </span>
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>
          <span className={styles.unit}>{shortUnit(item.unit)}</span>
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>
          <span className={styles.day}>{item.dayLabel}</span>
          <span className={styles.metaSpacer} />
          <StatusPill status={item.status} />
        </div>

        <div className={styles.title}>{item.title}</div>

        {item.preview ? (
          <div className={styles.preview}>{item.preview}</div>
        ) : null}

        {/* Note row — three modes: persisted note chip, inline edit, or
            the "Add a note" affordance when none exists yet. */}
        {editingNote ? (
          <div className={styles.noteEdit}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus the
                textarea when the teacher clicks "Add a note" so they can
                type immediately. */}
            <textarea
              id={noteFieldId}
              autoFocus
              rows={2}
              className={styles.noteField}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Add a note (optional)"
              aria-label="Add a note for this lesson"
            />
          </div>
        ) : visibleNote ? (
          <button
            type="button"
            className={styles.noteChip}
            onClick={handleEditNote}
            aria-label="Edit note"
          >
            <span className={styles.noteLabel}>Note</span>
            <span className={styles.noteBody}>{visibleNote}</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles.addNote}
            onClick={handleEditNote}
          >
            <IconPencil />
            Add a note
          </button>
        )}

        {/* Actions row: standards chips + resource count + per-row actions. */}
        <div className={styles.actions}>
          {item.standards.length > 0 && (
            <div className={styles.standards}>
              {item.standards.map((code) => (
                <span key={code} className={`cp-mono ${styles.standard}`}>
                  {code}
                </span>
              ))}
            </div>
          )}
          {item.resources > 0 && (
            <span
              className={styles.resources}
              aria-label={`${item.resources} resource${
                item.resources === 1 ? "" : "s"
              }`}
            >
              <IconLink />
              {item.resources}
            </span>
          )}
          <span className={styles.actionsSpacer} />
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onMarkDone}
          >
            Mark done
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnMuted}`}
            onClick={onSkip}
          >
            Skipped
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={onCarryOver}
          >
            Carry over to…
          </button>
          <button
            type="button"
            className={styles.actionLink}
            onClick={onJumpToLesson}
          >
            Jump to lesson
          </button>
        </div>
      </div>
    </div>
  );
}
