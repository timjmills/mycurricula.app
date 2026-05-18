"use client";

// weekly-lesson-card.tsx — the Lesson Card for the redesigned day-column
// Weekly view. Modelled on a horizontal day-column planner (commonplanner.com
// reference) where each lesson occupies a compact card with a full-bleed
// colored header band that anchors subject + time + title at a glance.
//
// Anatomy (top to bottom):
//   • Three-tier fork stripe (left edge, 5px) — solid / dashed / move-arrow.
//   • Header band — subject-tint fill (`--cl`), deep text (`--cd`):
//       [CompletionCheck]  [Subject name · time]  […] [drag]
//       [Lesson title — wraps if long]
//   • Body (collapsed): 2-line preview + footer row (standards badge,
//       resource-type chips, tasks pill, carry-over / pending meta).
//   • Body (expanded): labeled-section rows (Objective → Directions → Notes
//       → Resources → Standards → Tasks) + footer affordance row
//       ("+ Add section" / "Edit Template").
//   • Done = whole card faded: opacity 0.52 + filter desaturate(55%).
//       The checkbox still fires so the teacher can un-mark it.
//
// Style-axis: the card respects `data-style` on <html> (quiet / calm / vivid)
// but its header band is always subject-tinted — that is the Weekly-view
// design contract independent of the style preference.
//
// Gesture coordination (three non-overlapping intents):
//   single click   → onSelect / expand (via handleCardClick / toggleExpand)
//   double-click   → inline text editing (suppresses expand via stopPropagation)
//   press-and-hold → pick-up to drag (280ms hold timer, sets holdReady state)
//
// Types re-exported so the sibling board agent can import without a deep path:
//   export type { ContextAction, ContextActionPayload }

import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import type { Lesson, LessonStatus } from "@/lib/types";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { lessonTime } from "@/lib/mock";
import { useSubjectColor } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { Icon } from "@/components/lesson-card/icon";
import { LessonContextMenu } from "@/components/lesson-card/context-menu";
import type {
  ContextAction,
  ContextActionPayload,
} from "@/components/lesson-card/context-menu";
import {
  CompletionCheck,
  ResourceList,
  ResourceTypeRow,
  StandardsBadge,
  StandardsList,
} from "@/components/lesson-card/parts";
import { cycleStatus } from "@/components/lesson-card/status";
import { TaskRow } from "@/components/lesson-card/task-row";
import styles from "./weekly-lesson-card.module.css";
import "@/components/lesson-card/lesson-card.css";

// Re-export so sibling agents import from one location.
export type {
  ContextAction,
  ContextActionPayload,
} from "@/components/lesson-card/context-menu";

// ── Types ─────────────────────────────────────────────────────────────────────
// The fields a teacher can edit inline; matches the Lesson keys we allow
// to be patched through onEditLesson.
type EditableField = "title" | "preview" | "objective" | "directions" | "notes";

// ── Props ────────────────────────────────────────────────────────────────────
// Mirrors LessonCardProps so WeeklyLessonCard is a drop-in for the Weekly grid.

export interface WeeklyLessonCardProps {
  lesson: Lesson;
  /** Expanded-inline disclosure. Default false (collapsed). */
  expanded?: boolean;
  /** Selected ring. Default false. */
  selected?: boolean;
  /** Visual drag state. */
  dragging?: boolean;
  /** Card click — toggles selection / expansion at the grid level. */
  onSelect?: (id: string) => void;
  /** Explicit expand toggle (header band click / caret). Falls back to onSelect. */
  onToggleExpand?: (id: string) => void;
  /** Completion checkbox three-state cycle: done → partial → not_done. */
  onToggleComplete?: (id: string, next: LessonStatus) => void;
  /**
   * Context-menu / per-task actions. `payload` carries action detail:
   * `status` for Mark-status, `day` / `week` / `unit` for Move targets,
   * and `taskId` when the action originated from an inner task row.
   */
  onContextAction?: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
  /** Drag-handle slot — spread onto the card's drag affordance. */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  /**
   * Inline text edit committed. The grid applies the patch and marks the
   * lesson modified (or edits Core Curriculum in master mode).
   */
  onEditLesson?: (id: string, patch: Partial<Lesson>) => void;
  /**
   * The card's hold-drag has fired and the card root is now draggable.
   * The grid uses this to record the dragging id so DnD can proceed via
   * the existing onDragStart / onDrop flow.
   */
  onHoldDragStart?: (id: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
// Hold threshold: pointer must be down this long before the card enters
// "ready to move" state. 280ms is short enough to feel responsive but
// long enough to distinguish from a tap/click.
const HOLD_MS = 280;

// ── Component ────────────────────────────────────────────────────────────────

export function WeeklyLessonCard({
  lesson,
  expanded = false,
  selected = false,
  dragging = false,
  onSelect,
  onToggleExpand,
  onToggleComplete,
  onContextAction,
  dragHandleProps,
  onEditLesson,
  onHoldDragStart,
}: WeeklyLessonCardProps) {
  const { style } = useTheme();
  const color = useSubjectColor(lesson.subject);
  const subject = SUBJECT_BY_ID[lesson.subject];

  const [hovered, setHovered] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Per-task completion is card-local: the mock fixture is immutable and there
  // is no task-level persistence handler, so the card owns the three-state
  // cycle for each task row. Keyed by task id.
  const [taskStatus, setTaskStatus] = useState<Record<string, LessonStatus>>(
    {},
  );

  // ── Hold-to-drag state ─────────────────────────────────────────────────
  // holdReady: the 280ms timer has fired and the card is armed for dragging.
  // While holdReady, the card root is draggable (so a subsequent pointermove
  // triggers HTML5 DnD) and shows the lift/grab visual signal.
  const [holdReady, setHoldReady] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the pointer position at pointerdown so we can cancel if the
  // pointer strays far before the timer fires (mis-tap on a small card).
  const holdOriginRef = useRef<{ x: number; y: number } | null>(null);

  // ── Inline editing state ───────────────────────────────────────────────
  // editingField: which field is currently being edited, or null.
  // draftValue: the in-progress string the teacher is typing.
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");

  const done = lesson.status === "done";
  // Show the task section / pill for any lesson that has at least one task.
  // The previous threshold of >= 2 silently hid single-task lessons.
  const hasTasks = lesson.tasks.length >= 1;
  const timeLabel = lessonTime(lesson);

  // ── Stripe — solid by default, dashed when personally modified ────────────
  // The stripe sits behind the header band via z-index but still reads
  // through the 5px gap at the card's inline-start edge.
  const stripeStyle: CSSProperties = {
    position: "absolute",
    insetBlock: 0,
    insetInlineStart: 0,
    width: 5,
    zIndex: 1,
    ...(lesson.modified
      ? {
          backgroundImage: `repeating-linear-gradient(to bottom, ${color.stripe} 0 6px, transparent 6px 11px)`,
        }
      : { background: color.stripe }),
  };

  // ── Card shell ────────────────────────────────────────────────────────────
  // Body is always neutral/paper so the header band's subject-color fill
  // reads as a strongly distinct zone regardless of the style axis. In vivid
  // mode the card border picks up a subject-tint; quiet/calm stay ink-150.
  const isVivid = style === "vivid";

  const cardSurface: CSSProperties = {
    position: "relative",
    // Body surface is always neutral so header color contrast is maximum.
    background: "var(--paper)",
    border: holdReady
      ? // holdReady ring: a clear subject-colored outline signals "ready to move".
        `2px solid ${color.stripe}`
      : selected
        ? `1.5px solid ${color.stripe}`
        : isVivid
          ? `1px solid color-mix(in oklch, ${color.deep} 14%, transparent)`
          : "1px solid var(--ink-150)",
    boxShadow: dragging
      ? `0 12px 28px rgba(20,22,32,0.18), 0 0 0 1.5px ${color.stripe}`
      : holdReady
        ? // Lift the card: stronger shadow + subtle outer glow to signal "pickable".
          `0 8px 22px rgba(20,22,32,0.16), 0 0 0 3px color-mix(in oklch, ${color.stripe} 28%, transparent)`
        : hovered
          ? "0 4px 14px rgba(20,22,32,0.10)"
          : "var(--shadow-card)",
    // Slight scale-up on holdReady echoes a card being "lifted off the table".
    transform: dragging
      ? "rotate(-1.2deg)"
      : holdReady
        ? "scale(1.025) translateY(-2px)"
        : "none",
    cursor: holdReady ? "grab" : "pointer",
    // Done cards recede but stay readable — a gentle fade with only a light
    // desaturation, so "done" scans at a glance without going washed-out.
    opacity: done ? 0.66 : 1,
    filter: done ? "saturate(72%)" : "none",
    paddingInlineStart: 5,
    // Fast transition when entering holdReady; card snaps back on release.
    transition: holdReady
      ? "box-shadow 0.08s ease, transform 0.08s ease, border-color 0.08s ease"
      : undefined,
  };

  // ── Header band ───────────────────────────────────────────────────────────
  // The band paints with the subject's original Vivid card gradient — a
  // confident colored zone above the neutral (paper) body. A color-matched
  // hard border + drop shadow keep the header/body boundary unmistakable.
  const bandSeparatorColor = `color-mix(in oklch, ${color.stripe} 55%, transparent)`;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openMenuAt = useCallback((x: number, y: number) => {
    setMenu({ x, y });
  }, []);

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenuAt(e.clientX, e.clientY);
    },
    [openMenuAt],
  );

  const handleAffordance = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      openMenuAt(r.right, r.bottom + 2);
    },
    [openMenuAt],
  );

  // handleCardClick: fires on a plain single click on the card root.
  // Guards against misfires when a hold has already fired (holdReady)
  // so the drag pick-up doesn't also trigger an expand toggle.
  const handleCardClick = useCallback(() => {
    if (holdReady) return; // hold gesture took precedence — don't expand
    if (editingField) return; // an editor is open — ignore stray root clicks
    onSelect?.(lesson.id);
  }, [onSelect, lesson.id, holdReady, editingField]);

  const toggleExpand = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (holdReady) return;
      if (editingField) return;
      (onToggleExpand ?? onSelect)?.(lesson.id);
    },
    [onToggleExpand, onSelect, lesson.id, holdReady, editingField],
  );

  const cycleComplete = useCallback(() => {
    onToggleComplete?.(lesson.id, cycleStatus(lesson.status));
  }, [onToggleComplete, lesson.id, lesson.status]);

  // ── Hold-to-drag handlers ──────────────────────────────────────────────
  // pointerdown on the card body starts the 280ms hold timer. If the pointer
  // is released, cancelled, or moves more than 8px before the timer fires, the
  // gesture is treated as a click and holdReady stays false.

  const cancelHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdOriginRef.current = null;
  }, []);

  const handleBodyPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      // Only the primary pointer (finger / left mouse button) triggers a hold.
      if (e.button !== 0 && e.pointerType !== "touch") return;
      // Don't hijack the explicit drag handle — it has its own DnD wiring.
      if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
      // Don't start a hold timer when any text editor is active.
      if (editingField) return;

      holdOriginRef.current = { x: e.clientX, y: e.clientY };
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdOriginRef.current = null;
        // Arm the card for dragging.
        setHoldReady(true);
        onHoldDragStart?.(lesson.id);
      }, HOLD_MS);
    },
    [lesson.id, editingField, onHoldDragStart],
  );

  const handleBodyPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!holdOriginRef.current || holdTimerRef.current === null) return;
      const dx = e.clientX - holdOriginRef.current.x;
      const dy = e.clientY - holdOriginRef.current.y;
      // 8px movement tolerance: cancels the hold so the teacher can scroll.
      if (dx * dx + dy * dy > 64) {
        cancelHoldTimer();
      }
    },
    [cancelHoldTimer],
  );

  const handleBodyPointerUp = useCallback(() => {
    // Pointer released before the hold fired → cancel; it was just a click.
    cancelHoldTimer();
    // If holdReady, a real DnD drag has started (or the teacher just lifted
    // without dragging). Reset holdReady so the card returns to rest state.
    // The dragend event on the card root also resets it (see below).
    setHoldReady(false);
  }, [cancelHoldTimer]);

  // ── Inline editing handlers ────────────────────────────────────────────

  // Open an editor for `field`, seeding the draft from the lesson's current value.
  const openEditor = useCallback(
    (field: EditableField, e: MouseEvent) => {
      // Block propagation so the double-click never reaches the band's expand
      // handler or the card's select handler — editing must not resize the cell.
      e.stopPropagation();
      e.preventDefault();
      cancelHoldTimer();
      setEditingField(field);
      setDraftValue(lesson[field] as string);
    },
    [lesson, cancelHoldTimer],
  );

  // Commit the edited value; a no-op if nothing changed.
  const commitEdit = useCallback(() => {
    if (!editingField) return;
    const trimmed = draftValue.trim();
    if (trimmed !== (lesson[editingField] as string)) {
      onEditLesson?.(lesson.id, { [editingField]: trimmed });
    }
    setEditingField(null);
    setDraftValue("");
  }, [editingField, draftValue, lesson, onEditLesson]);

  // Cancel the edit without saving.
  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setDraftValue("");
  }, []);

  // Strip the "I can" prefix for display; the band label makes it explicit.
  const objectiveBody = useMemo(
    () => lesson.objective.replace(/^I can\s+/i, ""),
    [lesson.objective],
  );

  return (
    <div
      className={`cp-subj ${subject.cls} ${styles.card} ${holdReady ? styles.cardHoldReady : ""}`}
      data-style={style}
      role="group"
      aria-label={`${subject.name} lesson: ${lesson.title}`}
      tabIndex={0}
      // The card root becomes draggable only when holdReady — this lets the
      // existing HTML5 DnD flow drive the actual move. At rest, draggable is
      // false so a finger scroll / single click is never hijacked.
      draggable={holdReady}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        // If the pointer left the card without starting a drag, disarm.
        if (!dragging) {
          cancelHoldTimer();
          setHoldReady(false);
        }
      }}
      // Hold-drag: pointerdown starts the timer; pointermove cancels on movement;
      // pointerup / pointercancel cancel if the hold hasn't fired yet.
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handleBodyPointerMove}
      onPointerUp={handleBodyPointerUp}
      onPointerCancel={handleBodyPointerUp}
      // When a real DnD drag starts from the card root (holdReady path),
      // wire it into the grid's existing drag flow.
      onDragStart={(e) => {
        if (!holdReady) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lesson.id);
        // dragHandleProps.onDragStart wires the grid's draggingId — call it.
        // HTMLDivElement extends HTMLElement so the event is compatible.
        dragHandleProps?.onDragStart?.(e as React.DragEvent<HTMLElement>);
      }}
      onDragEnd={(e) => {
        setHoldReady(false);
        dragHandleProps?.onDragEnd?.(e as React.DragEvent<HTMLElement>);
      }}
      style={cardSurface}
    >
      {/* Left fork stripe — aria-hidden, purely decorative/informational */}
      <div aria-hidden style={stripeStyle} />

      {/* Screen-reader announcement when the card enters "ready to move" state. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {holdReady ? `${lesson.title} ready to drag. Drag to move it.` : ""}
      </div>

      {/* ── Header band ─────────────────────────────────────────────────── */}
      {/* Deeply-tinted subject fill (noticeably deeper than the body) with
          deep text (`--cd`). Always tinted regardless of the style axis —
          this is the Weekly-view design contract. The hard bottom border plus
          drop shadow make the header/body boundary unmistakable at a glance.
          The band carries: subject name, time label, move/modified indicators,
          drag handle, ⋯ affordance, and the lesson title below them. */}
      <div
        className={styles.band}
        style={{
          background: color.gradient,
          borderBottom: `2px solid ${bandSeparatorColor}`,
          boxShadow: `0 2px 6px color-mix(in oklch, ${color.stripe} 18%, transparent)`,
        }}
        onClick={toggleExpand}
        role="button"
        tabIndex={-1}
        aria-label={expanded ? "Collapse lesson" : "Expand lesson"}
      >
        {/* Band top row: check + subject·time + right controls */}
        <div className={styles.bandTop}>
          {/* Completion check — always on top of the faded state so it's
              reachable even when done=true. */}
          <div
            className={styles.bandCheckWrap}
            onClick={(e) => e.stopPropagation()}
          >
            <CompletionCheck
              status={lesson.status}
              size={15}
              onCycle={cycleComplete}
              label={`Mark "${lesson.title}" — current status ${lesson.status}`}
            />
          </div>

          {/* Subject eyebrow + time — grouped identifier row.
              Subject name: uppercase eyebrow label (strong, compact).
              Time: tabular-numeric, slightly softer weight, separated by
              a thin vertical rule so the two pieces read as one unit. */}
          <div className={styles.bandMeta} style={{ color: color.cd }}>
            <span className={styles.bandSubject}>{subject.name}</span>
            <span className={styles.bandMetaSep} aria-hidden />
            <span className={styles.bandTime}>{timeLabel}</span>
          </div>

          {/* Right indicator cluster: move arrow, Modified pill, drag, ⋯ */}
          <div
            className={styles.bandControls}
            onClick={(e) => e.stopPropagation()}
          >
            {lesson.moved && (
              <span
                className={styles.indicator}
                title={
                  lesson.moved === "across-weeks"
                    ? "Moved across weeks"
                    : "Moved within the week"
                }
                aria-label={
                  lesson.moved === "across-weeks"
                    ? "Moved across weeks"
                    : "Moved within the week"
                }
                style={{ background: color.stripe, color: "var(--paper)" }}
              >
                {lesson.moved === "across-weeks" ? "⤴" : "↔"}
              </span>
            )}
            {lesson.modified && (
              <span
                className={styles.modifiedPill}
                title="Personally modified from the Core Curriculum"
                // Deep (~700–800) tone: white text clears AA in every palette.
                style={{ background: color.deep, color: "var(--paper)" }}
              >
                Modified
              </span>
            )}
            {/* Affordances: drag handle (optional) + ⋯ menu */}
            <span className={styles.affordanceRow}>
              {dragHandleProps && (
                <span
                  {...dragHandleProps}
                  data-drag-handle
                  className={styles.affordance}
                  title="Drag to move"
                  aria-label="Drag handle"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "grab", ...dragHandleProps.style }}
                >
                  <span aria-hidden className={styles.affordanceVisual}>
                    <Icon name="drag" size={11} />
                  </span>
                </span>
              )}
              <button
                type="button"
                className={styles.affordance}
                onClick={handleAffordance}
                title="More actions"
                aria-label="More actions"
                aria-haspopup="menu"
              >
                <span aria-hidden className={styles.affordanceVisual}>
                  <Icon name="dots" size={11} />
                </span>
              </button>
            </span>
          </div>
        </div>

        {/* Lesson title — prominent second line of the band. Weight 600,
            one size step up from before, so it reads as the headline of
            the labeled zone rather than a secondary detail.
            Double-click enters inline edit mode (suppresses expand). */}
        <h3
          className={styles.bandTitle}
          style={{
            color: color.cd,
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: `color-mix(in oklch, ${color.cd} 40%, transparent)`,
          }}
        >
          {editingField === "title" ? (
            <EditableInput
              value={draftValue}
              onChange={setDraftValue}
              onCommit={commitEdit}
              onCancel={cancelEdit}
              className={styles.editInput}
              style={{ color: color.cd, background: "transparent" }}
              aria-label="Edit lesson title"
            />
          ) : (
            <span
              className={styles.editableText}
              onDoubleClick={(e) => openEditor("title", e)}
              title="Double-click to edit"
            >
              {lesson.title}
            </span>
          )}
        </h3>

        {/* Caret — indicates expand state, positioned at bottom-right of band */}
        <span
          aria-hidden
          className={`${styles.caret} ${expanded ? styles.caretOpen : ""}`}
        >
          <Icon name="chevronD" size={11} />
        </span>
      </div>

      {/* ── Card body ───────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* Collapsed: 2-line preview only. Expanded: full section rows.
            Double-click on the preview text enters inline edit mode. */}
        {!expanded ? (
          <p className={styles.preview} style={{ color: "var(--ink-700)" }}>
            {editingField === "preview" ? (
              <EditableTextarea
                value={draftValue}
                onChange={setDraftValue}
                onCommit={commitEdit}
                onCancel={cancelEdit}
                className={styles.editTextarea}
                aria-label="Edit lesson preview"
              />
            ) : (
              <span
                className={styles.editableText}
                onDoubleClick={(e) => openEditor("preview", e)}
                title="Double-click to edit"
              >
                {lesson.preview}
              </span>
            )}
          </p>
        ) : (
          <div className={styles.sections}>
            {/* Objective section — double-click text to edit inline */}
            {lesson.objective && (
              <SectionRow label="I Can" accent={color.cl} ink={color.cd}>
                {editingField === "objective" ? (
                  <EditableTextarea
                    value={draftValue}
                    onChange={setDraftValue}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                    className={styles.editTextarea}
                    style={{ fontStyle: "italic" }}
                    aria-label="Edit lesson objective"
                  />
                ) : (
                  <p
                    className={`${styles.sectionText} ${styles.editableText}`}
                    style={{ fontStyle: "italic", color: "var(--ink-700)" }}
                    onDoubleClick={(e) => openEditor("objective", e)}
                    title="Double-click to edit"
                  >
                    {objectiveBody}
                  </p>
                )}
              </SectionRow>
            )}

            {/* Directions section — double-click text to edit inline */}
            <SectionRow label="Directions" accent={color.cl} ink={color.cd}>
              {editingField === "directions" ? (
                <EditableTextarea
                  value={draftValue}
                  onChange={setDraftValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  className={styles.editTextarea}
                  aria-label="Edit lesson directions"
                />
              ) : (
                <p
                  className={`${styles.sectionText} ${styles.editableText}`}
                  style={{ color: "var(--ink-700)" }}
                  onDoubleClick={(e) => openEditor("directions", e)}
                  title="Double-click to edit"
                >
                  {lesson.directions}
                </p>
              )}
            </SectionRow>

            {/* Teacher notes — hover-gated disclosure; text is editable on double-click */}
            {(lesson.notes || editingField === "notes") && (
              <SectionRow label="Notes" accent={color.cl} ink={color.cd}>
                <button
                  type="button"
                  className={styles.notesToggle}
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotesOpen((v) => !v);
                  }}
                  aria-expanded={notesOpen}
                >
                  <Icon name="eye" size={11} />
                  {notesOpen ? "Hide teacher notes" : "Show teacher notes"}
                </button>
                {notesOpen &&
                  (editingField === "notes" ? (
                    <EditableTextarea
                      value={draftValue}
                      onChange={setDraftValue}
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      className={`${styles.notesBody} ${styles.editTextarea}`}
                      aria-label="Edit teacher notes"
                    />
                  ) : (
                    <p
                      className={`${styles.notesBody} ${styles.editableText}`}
                      onDoubleClick={(e) => openEditor("notes", e)}
                      title="Double-click to edit notes"
                    >
                      {lesson.notes}
                    </p>
                  ))}
              </SectionRow>
            )}

            {/* Tasks — multi-task lesson station rows */}
            {hasTasks && (
              <SectionRow
                label={`${lesson.tasks.length} Tasks`}
                accent={color.cl}
                ink={color.cd}
              >
                <div className={styles.taskList}>
                  {lesson.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={{
                        ...task,
                        status: taskStatus[task.id] ?? task.status,
                      }}
                      parentSubject={lesson.subject}
                      onCycle={(next) => {
                        setTaskStatus((prev) => ({
                          ...prev,
                          [task.id]: next,
                        }));
                        onContextAction?.("mark-status", lesson.id, {
                          status: next,
                          taskId: task.id,
                        });
                      }}
                    />
                  ))}
                </div>
              </SectionRow>
            )}

            {/* Resources */}
            <SectionRow label="Resources" accent={color.cl} ink={color.cd}>
              <ResourceList resources={lesson.resources} />
            </SectionRow>

            {/* Standards */}
            <SectionRow label="Standards" accent={color.cl} ink={color.cd}>
              <StandardsList codes={lesson.standards} />
            </SectionRow>

            {/* Footer affordances — "+ Add section" / "Edit Template" */}
            <div className={styles.expandedFooter}>
              <button
                type="button"
                className={styles.footerBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onContextAction?.("add-to-todo", lesson.id);
                }}
              >
                <Icon name="plus" size={11} />
                Add section
              </button>
              <button
                type="button"
                className={styles.footerBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onContextAction?.("print", lesson.id);
                }}
              >
                Edit Template
              </button>
            </div>
          </div>
        )}

        {/* ── Collapsed footer — meta chips + carry-over + pending ──────── */}
        {!expanded && (
          <div className={styles.footer}>
            {lesson.standards.length > 0 && (
              <StandardsBadge codes={lesson.standards} />
            )}
            <ResourceTypeRow resources={lesson.resources} dense />
            {hasTasks && (
              <span
                className={styles.tasksPill}
                title={`${lesson.tasks.length} lesson tasks`}
                style={{ background: color.cl, color: color.cd }}
              >
                <Icon name="list" size={9} />
                {lesson.tasks.length} tasks
              </span>
            )}
            {lesson.commentCount > 0 && (
              <span
                className={styles.commentBadge}
                title={`${lesson.commentCount} comment${lesson.commentCount === 1 ? "" : "s"}`}
                style={{ color: isVivid ? color.deep : "var(--ink-500)" }}
              >
                <span aria-hidden>💬</span>
                {lesson.commentCount}
                {lesson.unreadComments > 0 && (
                  <span
                    aria-label={`${lesson.unreadComments} unread`}
                    className={styles.unreadDot}
                  />
                )}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {lesson.pendingMaster && (
              <span
                className={styles.metaPill}
                style={{
                  background: "var(--important-bg)",
                  color: "var(--important)",
                }}
              >
                Core ↑
              </span>
            )}
            {lesson.status === "carried" && (
              <span className={styles.carryLabel}>carry-over</span>
            )}
          </div>
        )}

        {/* ── "Why not done" reason ─────────────────────────────────────── */}
        {lesson.reasonNotDone && lesson.status !== "done" && (
          <div className={styles.reasonRow}>
            <span aria-hidden style={{ fontWeight: 700 }}>
              🔥
            </span>
            <span>{lesson.reasonNotDone}</span>
          </div>
        )}
      </div>

      {/* Context menu — portal, positional */}
      {menu && (
        <LessonContextMenu
          lesson={lesson}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onAction={(action, payload) => {
            // The status submenu carries an explicit target status; route it
            // through onToggleComplete so the completion state actually updates,
            // then also report the raw action to the host.
            if (action === "mark-status" && payload?.status) {
              onToggleComplete?.(lesson.id, payload.status);
            }
            onContextAction?.(action, lesson.id, payload);
          }}
        />
      )}
    </div>
  );
}

// ── SectionRow ────────────────────────────────────────────────────────────────
// A labeled section row inside the expanded card body. Each row has a small
// colored pill label (same technique as the "I can" badge in LessonCard) so
// section headings read distinctly without heavy borders.

function SectionRow({
  label,
  accent,
  ink,
  children,
}: {
  label: string;
  /** Subject light fill for the label pill background. */
  accent: string;
  /** Subject deep color for the label pill text. */
  ink: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.sectionRow}>
      <div
        className={styles.sectionLabel}
        style={{ background: accent, color: ink }}
      >
        {label}
      </div>
      <div className={styles.sectionContent}>{children}</div>
    </section>
  );
}

// ── EditableInput ─────────────────────────────────────────────────────────────
// Single-line inline editor used for the lesson title field. Commits on
// Enter or blur; cancels on Escape. Auto-focuses when mounted.

function EditableInput({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      className={className}
      style={style}
      aria-label={ariaLabel}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        // Enter commits; Escape cancels; both stop the event so it doesn't
        // bubble up to the card's own keydown handler.
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

// ── EditableTextarea ──────────────────────────────────────────────────────────
// Multi-line inline editor used for preview, objective, directions, and notes.
// Commits on blur or Ctrl+Enter / Cmd+Enter. Escape cancels. Auto-focuses.

function EditableTextarea({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <textarea
      value={value}
      className={className}
      style={style}
      aria-label={ariaLabel}
      autoFocus
      rows={3}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        // Ctrl/Cmd+Enter commits; Escape cancels; plain Enter is a newline.
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
