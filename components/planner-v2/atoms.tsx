"use client";

// atoms.tsx — the shared visual atoms for the v2 planner frames (the three Day
// frames DayA/B/C and the Week frames WeekA/WeekC). Ported from the design
// bundle's views-shared.jsx (SubjGlyph / StatusDot) plus the repo's three-tier
// forking cue vocabulary (WeekEditBoard's moved-arrow + "Modified" Badge), so
// every frame speaks the same fork language (CLAUDE.md §2). Subject color
// arrives through the `.cp-subj.<cls>` cascade (var(--c)/--cl/--cd) — never a
// hard-coded hue.
//
// Lifted from components/day-v2/atoms.tsx in Wave 5 so the Week frames reuse the
// exact same atoms (the day-v2 module now re-exports these). Components ONLY
// live here (the hook + constants are in ./util) — the Fast-Refresh contract:
// mixing component and non-component exports crashes dev hot edits.

import { useState, type ReactNode } from "react";
import { Badge, Tooltip } from "@/components/ui";
import type { Lesson, Subject } from "@/lib/types";
import type { DayStatus } from "@/lib/day-status";
import { STATUS_WORD } from "./util";
import styles from "./atoms.module.css";

/**
 * The keyboard/AT selection control for a lesson row — a REAL <button> wrapping
 * only the title text (M2, Codex R2). This is why the row container itself is a
 * plain div with a redundant pointer-convenience onClick, NOT a role="button":
 * a role="button" that contains focusable descendants (the Plan/Teach/Finish
 * buttons, the moved-arrow cue) is invalid AT nesting. Native Enter/Space on
 * this button drives selection; the title's typography lives on the inner
 * <span> so the `.cp-root button` reset (which forces font-size:inherit) can't
 * flatten it.
 */
export function SelectTitle({
  selected,
  onSelect,
  titleClassName,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  /** The frame's title-typography class, applied to the inner span. */
  titleClassName: string;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.selectTitle}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={titleClassName}>{children}</span>
    </button>
  );
}

/** The status→dot-color class on atoms.module.css. */
const DOT_CLASS: Record<DayStatus, string> = {
  done: styles.dotDone,
  now: styles.dotNow,
  upcoming: styles.dotUpcoming,
  idle: styles.dotIdle,
};

/** First-letter monogram for a subject glyph (subject.name is the full name). */
function monogram(subject: Subject): string {
  return (subject.name.trim()[0] ?? subject.cls[0] ?? "?").toUpperCase();
}

/** Rounded subject tile with the subject's monogram. The `cp-subj` class pulls
 *  the subject color into `var(--c)` for the tile background. */
export function SubjGlyph({
  subject,
  size = 34,
  radius = 11,
}: {
  subject: Subject;
  size?: number;
  radius?: number;
}): ReactNode {
  return (
    <span
      className={`cp-subj ${subject.cls} ${styles.subjGlyph}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {monogram(subject)}
    </span>
  );
}

/** Small status dot (rail / agenda), colored per derived day-status. */
export function StatusDot({ status }: { status: DayStatus }): ReactNode {
  return (
    <span
      className={`${styles.statusDot} ${DOT_CLASS[status]}`}
      aria-hidden="true"
    />
  );
}

/**
 * Three-tier forking cue for a lesson — the moved arrow (↔ within week, ⤴
 * across weeks) and the "Modified" pill — reusing the exact WeekEditBoard
 * vocabulary + tooltip copy. Renders nothing for an unedited-from-Master
 * lesson. The dashed subject stripe (the third tier) is a per-frame modifier
 * class on the row/item stripe, applied at each callsite.
 */
export function ForkCues({ lesson }: { lesson: Lesson }): ReactNode {
  if (!lesson.moved && !lesson.modified) return null;
  return (
    <span className={styles.forkCues}>
      {lesson.moved && (
        <Tooltip
          content={
            lesson.moved === "across-weeks"
              ? "Moved across weeks in your personal copy — the Team Curriculum version stays in its original slot."
              : "Moved within the week in your personal copy — the Team Curriculum version stays in its original slot."
          }
          side="top"
        >
          <span
            className={styles.movedArrow}
            aria-label={
              lesson.moved === "across-weeks"
                ? "Moved across weeks"
                : "Moved within the week"
            }
            tabIndex={0}
          >
            {lesson.moved === "across-weeks" ? "⤴" : "↔"}
          </span>
        </Tooltip>
      )}
      {lesson.modified && (
        <Tooltip content="Personally modified from the Team Curriculum." side="top">
          <Badge variant="warn" size="sm">
            Modified
          </Badge>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * Completion pill — three visual states (bundle B:5953-5957), shared by all
 * three frames (DayA rows, DayB focus card, DayC hero footer):
 *   • done      → check + "Done" on the done tint
 *   • now       → pulsing dot + "Finish"  (only when isToday, since `status`
 *                 is already gated — off-today it can never be "now")
 *   • otherwise → colored dot + status word ("Up next" / "Planned")
 * Click toggles setLessonStatus(id, done ? "not_done" : "done"); completion is
 * store-owned and NEVER forks.
 */
export function FinishPill({
  status,
  isDone,
  onToggle,
  className,
}: {
  status: DayStatus;
  isDone: boolean;
  onToggle: () => void;
  className?: string;
}): ReactNode {
  return (
    <Tooltip
      content={
        isDone ? "Mark this lesson as not finished" : "Mark this lesson finished"
      }
      side="top"
    >
      <button
        type="button"
        className={`${styles.vaFinish} ${isDone ? styles.vaFinishOn : ""} ${
          className ?? ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-pressed={isDone}
      >
        {isDone ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l5 5L20 6" />
            </svg>
            Done
          </>
        ) : status === "now" ? (
          <>
            <span className={`${styles.vaFdot} ${styles.vaFdotNow}`} />
            Finish
          </>
        ) : (
          <>
            <span
              className={styles.vaFdot}
              style={{
                background:
                  status === "upcoming" ? "var(--honey-500)" : "var(--c)",
              }}
            />
            {STATUS_WORD[status]}
          </>
        )}
      </button>
    </Tooltip>
  );
}

/**
 * The unified "add to this day" affordance — a frame-styled trigger that opens
 * the SAME small create menu in every frame (M4): "New lesson" → onQuickAdd,
 * "Non-instructional event" → onAddEvent (row omitted when null). "Assign
 * existing" is deferred (no dead row). Respects quickAdding (disable + busy)
 * and surfaces quickAddError inline.
 */
export function AddLessonMenu({
  triggerClassName,
  triggerContent,
  tooltipId,
  tooltipContent,
  align = "center",
  wrapperClassName,
  onQuickAdd,
  onAddEvent,
  quickAdding,
  quickAddError,
}: {
  triggerClassName: string;
  triggerContent: ReactNode;
  tooltipId: string;
  tooltipContent: string;
  align?: "center" | "start";
  wrapperClassName?: string;
  onQuickAdd: () => void;
  onAddEvent?: (() => void) | null;
  quickAdding: boolean;
  quickAddError: string | null;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.addWrap} ${wrapperClassName ?? ""}`}>
      <Tooltip content={tooltipContent} tooltipId={tooltipId} side="top">
        <button
          type="button"
          className={triggerClassName}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-busy={quickAdding}
          disabled={quickAdding}
        >
          {triggerContent}
        </button>
      </Tooltip>
      {open && (
        <div
          className={`${styles.vaDayAddMenu} ${
            align === "start" ? styles.menuStart : ""
          }`}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            className={styles.addRowNew}
            onClick={() => {
              setOpen(false);
              onQuickAdd();
            }}
            disabled={quickAdding}
          >
            <span className={styles.addIc} aria-hidden="true">
              +
            </span>
            <span className={styles.addTx}>
              <b>New lesson</b>
              <span>Create a fresh lesson for this day</span>
            </span>
          </button>
          {onAddEvent && (
            <button
              type="button"
              className={styles.addRowEvent}
              onClick={() => {
                setOpen(false);
                onAddEvent();
              }}
            >
              <span className={styles.addIc} aria-hidden="true">
                ★
              </span>
              <span className={styles.addTx}>
                <b>Non-instructional event</b>
                <span>Assembly, field trip, testing, holiday…</span>
              </span>
            </button>
          )}
          {/* "Assign existing lesson" is deferred — no dead row (decision 5). */}
        </div>
      )}
      {quickAddError && (
        <p className={styles.vaError} role="alert">
          {quickAddError}
        </p>
      )}
    </div>
  );
}
