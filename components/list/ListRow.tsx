"use client";

// ListRow.tsx — the shared list-row primitive for all List view surfaces.
//
// Used by WeeklyList (one row per lesson in the day-grouped weekly list)
// and by DailyList (one row per lesson on a single day). The visual rhythm
// is consistent across both surfaces so a teacher's eye adjusts instantly
// when switching between views.
//
// ── Layout (left→right) ────────────────────────────────────────────────
//   [subject monogram tile] [time / weekday chip] [title + preview]
//   [CCSS chip] [resource count] [completion checkbox]
//
// ── Modified / moved visuals ───────────────────────────────────────────
//   modified === true  → 4px DASHED left edge in the subject's deep color
//   moved !== null     → move-arrow icon inline near the title
//                        "same-week" → ↔   "across-weeks" → ⤴
//   No "MODIFIED" pill — that lives on the grid card, not the list row.
//
// ── Completion ─────────────────────────────────────────────────────────
//   The checkbox toggles lesson.status between "not_done" and "done" via
//   usePlanner().setLessonStatus. The toggle is a separate button so the
//   click does not bubble to the row's onClick (navigate to daily view).
//
// ── Accessibility ──────────────────────────────────────────────────────
//   • The row is a <div role="button" tabIndex={0}> rather than a native
//     <button>. The checkbox is a nested native <button role="checkbox">,
//     and HTML forbids interactive content (a button) inside a button —
//     so the row uses the ARIA-button idiom (Enter/Space handled in
//     handleRowKeyDown) to keep the markup valid while staying keyboard
//     reachable.
//   • min-height: 44px (via CSS module) meets the touch-target floor.
//   • The checkbox is a nested <button> with an aria-label.

import type { ReactNode } from "react";
import { useMemo } from "react";
import type { Lesson } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import styles from "./ListRow.module.css";

// ── Em-dash title split ───────────────────────────────────────────────────────
// If the title contains " — " (em-dash with spaces), split on the first
// occurrence so the body of the title stands alone as the dominant headline
// and the qualifier becomes a muted subtitle line below.
// Returns { main, sub } where sub is null when no split point is found.

function splitTitle(title: string): { main: string; sub: string | null } {
  const idx = title.indexOf(" — ");
  if (idx === -1) return { main: title, sub: null };
  return { main: title.slice(0, idx), sub: title.slice(idx + 3) };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ListRowProps {
  /** The lesson to display. */
  lesson: Lesson;
  /**
   * Time-slot label shown in the chip, e.g. "8:10–9:10".
   * When omitted, falls back to lesson.time. The `weekday` prop is used
   * instead when the row appears in a subject-scoped list (e.g. "W12 · Mon").
   */
  time?: string;
  /**
   * Alternative to `time` for subject or unit list contexts.
   * E.g. "W12 · Mon". Shown instead of `time` when both are provided.
   */
  weekday?: string;
  /**
   * When true, the 1-line preview text below the title is suppressed.
   * Useful in ultra-compact contexts where vertical space is scarce.
   */
  dense?: boolean;
  /** Called when the row body is clicked (not the checkbox). */
  onClick?: () => void;
}

// ── Monogram helper ──────────────────────────────────────────────────────────
// Derives the 2-letter monogram from a subject id, matching the artboard's
// M523_SUBJ short values: math→Ma, reading→Re, writing→Wr, grammar→Gr,
// spelling→Sp, ufli→Uf, explorers→Ex, sel→Se.

const MONOGRAM: Record<string, string> = {
  math: "Ma",
  reading: "Re",
  writing: "Wr",
  grammar: "Gr",
  spelling: "Sp",
  ufli: "Uf",
  explorers: "Ex",
  sel: "Se",
};

function monogramFor(subjectId: string): string {
  return (
    MONOGRAM[subjectId] ??
    subjectId.slice(0, 2).replace(/^\w/, (c) => c.toUpperCase())
  );
}

// ── Subject label helper ─────────────────────────────────────────────────────
// Short uppercase label shown above the time chip, matches artboard vocabulary.

const SUBJECT_LABEL: Record<string, string> = {
  math: "MATH",
  reading: "READING",
  writing: "WRITING",
  grammar: "GRAMMAR",
  spelling: "SPELLING",
  ufli: "UFLI",
  explorers: "EXPLORERS",
  sel: "SEL",
};

function subjectLabelFor(subjectId: string): string {
  return SUBJECT_LABEL[subjectId] ?? subjectId.toUpperCase();
}

// ── Move-arrow icon ──────────────────────────────────────────────────────────
// Inline unicode arrows communicate how the lesson was relocated.
// same-week → ↔ (left-right arrow)   across-weeks → ⤴ (up+right arrow)

function MoveArrow({ moved }: { moved: Lesson["moved"] }): ReactNode {
  if (!moved) return null;
  const symbol = moved === "across-weeks" ? "⤴" : "↔";
  const label =
    moved === "across-weeks" ? "Moved across weeks" : "Moved within the week";
  return (
    <span
      className={styles.moveIcon}
      aria-label={label}
      title={label}
      role="img"
    >
      {symbol}
    </span>
  );
}

// ── Resource link icon ───────────────────────────────────────────────────────
// A minimal paperclip SVG that signals "N resources attached."

function LinkIcon(): ReactNode {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// ── Checkmark icon ───────────────────────────────────────────────────────────

function CheckIcon(): ReactNode {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8l3 3 7-7" />
    </svg>
  );
}

// ── ListRow ──────────────────────────────────────────────────────────────────

export function ListRow({
  lesson,
  time,
  weekday,
  dense = false,
  onClick,
}: ListRowProps): ReactNode {
  const { setLessonStatus } = usePlanner();

  // Resolved time/weekday display — weekday takes precedence when provided.
  const chipLabel = weekday ?? time ?? lesson.time ?? "";

  const isDone = lesson.status === "done";

  // Row CSS classes — subject class drives --c/--cl/--cd via the .cp-subj
  // cascade (palette bridge in lib/palette.tsx), modified adds dashed edge.
  const rowClasses = useMemo(() => {
    const base = [styles.row, `cp-subj ${lesson.subject}`];
    if (lesson.modified) base.push(styles.rowModified);
    if (isDone) base.push(styles.done);
    return base.join(" ");
  }, [lesson.subject, lesson.modified, isDone]);

  // Em-dash title split — body of the title is the dominant headline;
  // the qualifier (after " — ") becomes a muted subtitle line below.
  const { main: titleMain, sub: titleSub } = useMemo(
    () => splitTitle(lesson.title),
    [lesson.title],
  );

  // Toggle completion without bubbling to the row's onClick. The native
  // <button> below gives Enter+Space + focus management for free, so the
  // bespoke key handler that the previous <span role="checkbox"> needed is
  // gone — only the click stopPropagation remains so the row's onClick
  // (navigate to daily) doesn't also fire when the checkbox is toggled.
  function handleCheckboxClick(e: React.MouseEvent): void {
    e.stopPropagation();
    setLessonStatus(lesson.id, isDone ? "not_done" : "done");
  }

  function handleRowKeyDown(e: React.KeyboardEvent): void {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick();
    }
  }

  return (
    // The row is a div+role="button"+tabIndex rather than a native <button>
    // because the completion control inside it is a real <button>, and HTML
    // forbids nested interactive content. handleRowKeyDown supplies the
    // Enter/Space activation a native button would have given for free.
    <div
      role="button"
      tabIndex={0}
      className={rowClasses}
      onClick={onClick}
      onKeyDown={handleRowKeyDown}
      data-planner-item={`lesson:${lesson.id}`}
      aria-label={`${subjectLabelFor(lesson.subject)} — ${lesson.title}${isDone ? " (done)" : ""}`}
      title={`Open "${lesson.title}" in the Daily view — see the full lesson plan, notes, and attached resources`}
    >
      {/* Subject monogram tile — background color from .cp-subj cascade */}
      <span className={styles.tile} aria-hidden="true">
        {monogramFor(lesson.subject)}
      </span>

      {/* Time / weekday chip */}
      <span className={styles.timeCol} aria-hidden="true">
        <span className={styles.subjLabel}>
          {subjectLabelFor(lesson.subject)}
        </span>
        {chipLabel && <span className={styles.timeLabel}>{chipLabel}</span>}
      </span>

      {/* Title + optional subtitle + optional preview.
          titleMain is the dominant headline; titleSub is the em-dash
          qualifier rendered as a smaller muted line below the title.
          The move indicator sits on the title row so it scans alongside
          the primary text without visual competition. */}
      <span className={styles.body}>
        <span className={styles.titleRow}>
          <span className={styles.title}>{titleMain}</span>
          {/* Move indicator — only when lesson was relocated */}
          <MoveArrow moved={lesson.moved} />
        </span>
        {titleSub && <span className={styles.titleSub}>{titleSub}</span>}
        {!dense && lesson.preview && (
          <span className={styles.preview}>{lesson.preview}</span>
        )}
      </span>

      {/* CCSS chip — count of standards attached */}
      {lesson.standards.length > 0 && (
        <span
          className={`${styles.ccssChip} cp-mono`}
          aria-label={`${lesson.standards.length} CCSS standard${lesson.standards.length === 1 ? "" : "s"}`}
        >
          CCSS·{lesson.standards.length}
        </span>
      )}

      {/* Resource count */}
      {lesson.resources.length > 0 && (
        <span
          className={styles.resourceCount}
          aria-label={`${lesson.resources.length} resource${lesson.resources.length === 1 ? "" : "s"}`}
        >
          <LinkIcon />
          {lesson.resources.length}
        </span>
      )}

      {/* Completion checkbox — separate interactive target. A native
          <button type="button" role="checkbox"> gives Enter+Space + focus
          for free; the negative-margin hit-area trick lives in the CSS
          module so the visible chip stays small while the tap target meets
          the touch floor. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        title={
          isDone
            ? "Mark this lesson not done — useful if you completed it by mistake or need to re-teach"
            : "Mark this lesson done — completion is personal and never forks the team's Master copy"
        }
        className={`${styles.checkbox}${isDone ? ` ${styles.checked}` : ""}`}
        onClick={handleCheckboxClick}
      >
        {isDone && <CheckIcon />}
      </button>
    </div>
  );
}
