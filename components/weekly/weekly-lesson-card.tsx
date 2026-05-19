"use client";

// weekly-lesson-card.tsx — the Lesson Card for the redesigned day-column
// Weekly view. Modelled on a horizontal day-column planner (commonplanner.com
// reference) where each lesson occupies a compact card with a full-bleed
// colored header band that anchors subject + time + title at a glance.
//
// Anatomy (top to bottom):
//   • Three-tier fork stripe (left edge, 5px / 6px compact) — solid / dashed.
//   • Header band — subject-tint fill (`--cl`), deep text (`--cd`):
//       [CompletionCheck]  [Subject name · time]  [move-handle] […]
//       [Lesson title — wraps if long]
//   • Body (collapsed): 2-line preview + footer row (standards badge,
//       resource-type chips, tasks pill, carry-over / pending meta).
//   • Body (expanded): labeled-section rows (Objective → Directions → Notes
//       → Resources → Standards → Tasks) + footer affordance row
//       ("+ Add section" / "Edit Template").
//   • Done = whole card faded: opacity 0.52 + filter desaturate(55%).
//       The checkbox still fires so the teacher can un-mark it.
//
// Density prop (collapse-on-drag pattern, §3.2):
//   density="full"    — default; card exactly as described above.
//   density="compact" — single-line 28px chip used during drag.
//                       Chip anatomy: [stripe] [grab handle] [XX · title] [● status dot]
//                       Everything below the chip row is unmounted via AnimatePresence.
//                       Interaction (edit/expand) is suppressed; chip is drag-only.
//
// Motion: the card root is a plain `motion.div` — NO `layout` or `layoutId`.
// Using framer-motion's `layout` on the root caused FLIP-based scale()
// transforms when height changed from chip (28px) to full (88px+), visually
// stretching text ~3× vertically (Bug 3 fix). Instead, the compact↔full
// density flip is instant (both states are always valid DOM sizes); only the
// rich content inside uses AnimatePresence (opacity+height: 0→auto) so text
// renders at its target font-size from frame one. Under useReducedMotion() →
// DRAG_MOTION.reduced (opacity-only, no height animation).
//
// Style-axis: the card respects `data-style` on <html> (quiet / calm / vivid)
// but its header band is always subject-tinted — that is the Weekly-view
// design contract independent of the style preference.
//
// Gesture coordination (two non-overlapping intents):
//   single click   → expand/collapse, but only on the header band (toggleExpand)
//   double-click   → inline text editing (suppresses expand via stopPropagation)
//   drag handle    → drag the lesson to a new cell via the move-handle icon
//                    in the header band (the ONLY drag affordance on the card)
//
// Types re-exported so the sibling board agent can import without a deep path:
//   export type { ContextAction, ContextActionPayload }

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Density } from "@/lib/collapse-on-drag";
import { DRAG_CHIP, DRAG_MOTION } from "@/lib/collapse-on-drag";
import { SaveTargetDialog } from "@/components/weekly/save-target-dialog";
import { NotePopover } from "@/components/weekly/note-popover";
import type { Lesson, LessonStatus, WeeklyCardDeck } from "@/lib/types";
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
import { RichTextEditor } from "@/components/rich-text";
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

// The stable keys for each section rendered in the expanded body.
// "tasks" is conditional on hasTasks; "objective" conditional on lesson.objective.
// The order array is card-local state so the teacher can reorder without persistence.
type SectionKey =
  | "objective"
  | "directions"
  | "notes"
  | "tasks"
  | "resources"
  | "standards";

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "objective",
  "directions",
  "notes",
  "tasks",
  "resources",
  "standards",
];

// ── Props ────────────────────────────────────────────────────────────────────
// Mirrors LessonCardProps so WeeklyLessonCard is a drop-in for the Weekly grid.

export interface WeeklyLessonCardProps {
  lesson: Lesson;
  /**
   * Dual-density mode for the collapse-on-drag pattern (spec §3.2).
   * - "full"    — default; full card with header band, body, footer.
   * - "compact" — single-line 28px chip; editing/expand interactions suppressed.
   *   The grid sets this to "compact" on all peers while any card is being dragged.
   */
  density?: Density;
  /**
   * True when this card is the floating copy inside dnd-kit's `<DragOverlay>`.
   * The overlay copy must NOT carry the shared framer-motion `layoutId` — the
   * ghosted source card is still mounted with the same id, and two live
   * elements sharing a layoutId makes framer-motion animate between them.
   * Overlay cards opt out of layout animation entirely.
   */
  overlay?: boolean;
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
   * Save-target resolved in the SaveTargetDialog. Fired after the teacher
   * leaves the card and picks where to save their edit: "personal" forks the
   * lesson into their personal copy; "core" writes directly to the shared Core
   * Curriculum. If omitted, the dialog still appears but the choice is logged
   * only (safe for the prototype phase).
   */
  onSaveTarget?: (id: string, target: "personal" | "core") => void;
  /**
   * Multi-lesson pager. When supplied AND `deck.total > 1`, the card renders
   * an in-card pager footer (‹ {index + 1} of {total} ›) pinned to its bottom
   * edge so the teacher can flip through every lesson in a day cell without
   * leaving the card. Absent (or `total <= 1`) → no footer; the collapsed body
   * fills the cell with the lesson preview instead. The grid owns the index
   * and supplies onPrev / onNext to step it.
   */
  deck?: WeeklyCardDeck;
}

// ── Constants ─────────────────────────────────────────────────────────────────
// Hold threshold used by ReorderableSectionRow: the pointer must be held on
// a section for this long before it enters "ready to drag" state for reordering.
// A deliberate 2-second hold so section reorder is never triggered by accident.
const HOLD_MS = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Strip HTML tags from a string so that RTE-edited HTML values are safe to
 * use in aria-label / title attributes (plain-text contexts).
 * Runs client-side only; falls back to the raw string during SSR (acceptable
 * because aria-labels are never used server-side for correctness).
 */
function stripHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? tmp.innerText ?? html;
}

// ── Component ────────────────────────────────────────────────────────────────

export function WeeklyLessonCard({
  lesson,
  density = "full",
  overlay = false,
  expanded = false,
  selected = false,
  dragging: _dragging = false, // eslint-disable-line @typescript-eslint/no-unused-vars
  onSelect,
  onToggleExpand,
  onToggleComplete,
  onContextAction,
  dragHandleProps,
  onEditLesson,
  onSaveTarget,
  deck,
}: WeeklyLessonCardProps) {
  const { style } = useTheme();
  const color = useSubjectColor(lesson.subject);
  const subject = SUBJECT_BY_ID[lesson.subject];

  // Respect prefers-reduced-motion (spec §2.5 / §2.4): under reduced motion,
  // skip height/layout animation and use opacity-only fade instead.
  const reducedMotion = useReducedMotion();

  // Whether the card is currently in compact (chip) mode.
  const isCompact = density === "compact";

  const [hovered, setHovered] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Save-target dialog state ───────────────────────────────────────────
  // dirty: true when at least one real content change has been committed via
  // commitEdit since the last save-target decision (or since the card mounted).
  // saveDialogOpen: the teacher has left the card and we are asking where to save.
  const [dirty, setDirty] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Ref to the card root so onBlurCapture can test containment.
  const cardRef = useRef<HTMLDivElement>(null);
  // Per-task completion is card-local: the mock fixture is immutable and there
  // is no task-level persistence handler, so the card owns the three-state
  // cycle for each task row. Keyed by task id.
  const [taskStatus, setTaskStatus] = useState<Record<string, LessonStatus>>(
    {},
  );

  // ── Section-reorder state ──────────────────────────────────────────────
  // sectionOrder: the current ordering of sections within the expanded body.
  // Card-local (no persistence) — prototype behavior, consistent with the rest
  // of the card. Resets if the lesson id changes (parent reuses the component).
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(
    DEFAULT_SECTION_ORDER,
  );

  // ── Inline editing state ───────────────────────────────────────────────
  // editingField: which field is currently being edited, or null.
  // draftValue: the in-progress string the teacher is typing.
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");

  // If the parent re-uses this component instance for a different lesson
  // (key not changed) we must not show a stale editor, stale section order,
  // or a stale dirty flag / open dialog.
  useEffect(() => {
    setEditingField(null);
    setDraftValue("");
    setSectionOrder(DEFAULT_SECTION_ORDER);
    setDirty(false);
    setSaveDialogOpen(false);
    // Note: lesson.id change does not reset hovered/menu — those are transient
    // interaction state that should clear naturally via pointer events.
  }, [lesson.id]);

  const done = lesson.status === "done";
  // Show the task section / pill for any lesson that has at least one task.
  // The previous threshold of >= 2 silently hid single-task lessons.
  const hasTasks = lesson.tasks.length >= 1;
  const timeLabel = lessonTime(lesson);

  // ── "Why not done" reason ──────────────────────────────────────────────
  // A catch-up reason is shown only for a not-yet-done lesson that actually
  // carries one. It used to render as an inline `.reasonRow`, which made the
  // collapsed card overflow the fixed-height grid cell — it now lives behind
  // a compact alert-icon affordance that opens NotePopover. `reasonNotDone`
  // is a plain string on the Lesson model (no label / author / date).
  const hasReason = Boolean(lesson.reasonNotDone) && lesson.status !== "done";

  // ── Multi-lesson pager ─────────────────────────────────────────────────
  // The in-card pager footer renders only for a day cell that holds more
  // than one lesson. A single-lesson cell (or no deck at all) shows the
  // taller preview body instead — see the `.bodyFill` class below.
  const hasPager = Boolean(deck) && (deck?.total ?? 0) > 1;

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

  // Bug 4 fix: floating shadow/ring/rotation applies ONLY to the DragOverlay
  // copy (overlay=true). The in-grid card — even while isDragging via
  // useSortable — uses a plain ghost appearance (opacity handled by the
  // SortableLessonItem wrapper) with no ring, no shadow, no rotation.
  // The `dragging` prop is retained for the overlay to receive elevated shadow
  // but only when combined with `overlay`.
  const isFloating = overlay;

  const cardSurface: CSSProperties = {
    position: "relative",
    // Body surface is always neutral so header color contrast is maximum.
    background: "var(--paper)",
    border: selected
      ? `1.5px solid ${color.stripe}`
      : isVivid
        ? `1px solid color-mix(in oklch, ${color.deep} 14%, transparent)`
        : "1px solid var(--ink-150)",
    boxShadow: isFloating
      ? `0 12px 28px rgba(20,22,32,0.18), 0 0 0 1.5px ${color.stripe}`
      : hovered
        ? "0 4px 14px rgba(20,22,32,0.10)"
        : "var(--shadow-card)",
    transform: isFloating ? "rotate(-1.2deg)" : "none",
    cursor: "pointer",
    // Done cards recede but stay readable — a gentle fade with only a light
    // desaturation, so "done" scans at a glance without going washed-out.
    opacity: done ? 0.66 : 1,
    filter: done ? "saturate(72%)" : "none",
    paddingInlineStart: 5,
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

  // handleCardClick: the expand/collapse toggle. Reached only via the
  // keyboard (Enter / Space on the focused card) — a mouse click on the
  // card body no longer toggles; only a click on the header band does.
  const handleCardClick = useCallback(() => {
    if (editingField) return; // an editor is open — ignore stray root clicks
    onSelect?.(lesson.id);
  }, [onSelect, lesson.id, editingField]);

  const toggleExpand = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (editingField) return;
      (onToggleExpand ?? onSelect)?.(lesson.id);
    },
    [onToggleExpand, onSelect, lesson.id, editingField],
  );

  const cycleComplete = useCallback(() => {
    onToggleComplete?.(lesson.id, cycleStatus(lesson.status));
  }, [onToggleComplete, lesson.id, lesson.status]);

  // ── Inline editing handlers ────────────────────────────────────────────

  // Open an editor for `field`, seeding the draft from the lesson's current value.
  // `e` is optional so keyboard handlers can call this without a synthetic event.
  const openEditor = useCallback(
    (field: EditableField, e?: React.SyntheticEvent) => {
      // Block propagation so the double-click / Enter never reaches the band's
      // expand handler or the card's select handler — editing must not resize
      // the cell or toggle selection.
      e?.stopPropagation();
      e?.preventDefault();
      setEditingField(field);
      setDraftValue(lesson[field] as string);
    },
    [lesson],
  );

  // Commit the edited value; a no-op if nothing changed.
  // draftValue is now an HTML string produced by RichTextEditor.
  const commitEdit = useCallback(() => {
    if (!editingField) return;
    // Trim only the outer HTML string (not inner tags). A bare whitespace-only
    // value equals the original when the field was already empty.
    const trimmed = draftValue.trim();
    const original = (lesson[editingField] as string) ?? "";
    if (trimmed !== original) {
      onEditLesson?.(lesson.id, { [editingField]: trimmed });
      // A real change was made — mark this card dirty so the save-target
      // dialog opens when the teacher leaves the card.
      setDirty(true);
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

  // ── Leave-card detection ───────────────────────────────────────────────
  // onBlurCapture fires when any element inside the card loses focus. We use
  // the capture phase so we see the event before child stopPropagation calls.
  // relatedTarget is the element RECEIVING focus — if it is null (page blur)
  // or is outside the card AND outside the SaveTargetDialog itself, the teacher
  // has genuinely left the card. We must not re-open the dialog when focus moves
  // INTO the dialog (otherwise closing the dialog would re-trigger it).
  const handleCardBlurCapture = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // If an editor is still active, wait for commitEdit to close it first —
      // the editor's own blur will fire commitEdit and then the card blur fires.
      if (editingField) return;
      // If the dialog is already open, don't re-trigger.
      if (saveDialogOpen) return;
      // If dirty flag is not set, nothing to ask about.
      if (!dirty) return;

      const next = e.relatedTarget as HTMLElement | null;

      // Focus stayed within the card itself — no dialog needed yet.
      if (next && cardRef.current?.contains(next)) return;

      // Focus moved into the SaveTargetDialog (role="dialog"). Guard against
      // the dialog opening causing its own blur → re-open loop.
      if (next?.closest('[role="dialog"]')) return;

      // Genuine card exit with unsaved changes — open the dialog.
      setSaveDialogOpen(true);
    },
    [editingField, saveDialogOpen, dirty],
  );

  // ── Compact-chip subject code prefix ──────────────────────────────────
  // §3.7: 2-letter subject code prefix for chip mode.
  // We use subject.icon (already 2-char, e.g. "Ma", "Re") as the code —
  // uppercase per spec. A dedicated Settings "Code" field is a future
  // enhancement; the subject monogram is the spec-sanctioned fallback.
  const subjectCode = subject.icon.toUpperCase();

  // ── Motion configuration ───────────────────────────────────────────────
  // Under reduced motion: opacity-only fade for content. Otherwise:
  // DRAG_MOTION.collapse (200ms ease-out, spec §2.4).
  // NOTE: layoutProp is intentionally omitted — the card root does NOT use
  // framer-motion `layout` or `layoutId` (Bug 3 fix: avoids FLIP scale()).
  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  return (
    <motion.div
      ref={cardRef}
      // Bug 3 fix: NO `layout` or `layoutId` on the card root.
      // framer-motion's `layout` uses FLIP (transform: scale()) on height
      // changes, which stretches text 3× when the card grows from 28px (chip)
      // to 88px+ (full). Instead the compact↔full switch is an instant DOM
      // reflow; only the rich content inside uses AnimatePresence
      // (height: 0→auto) so text renders at its correct font-size every frame.
      className={`cp-subj ${subject.cls} ${styles.card} ${isCompact ? styles.cardCompact : ""}`}
      data-style={style}
      // Scroll-into-view anchor — present in BOTH compact and full density
      // so scrollPlannerItemIntoView() always finds this card after a move or
      // undo/redo (planner-store convention: data-planner-item="lesson:<id>").
      data-planner-item={`lesson:${lesson.id}`}
      role="group"
      aria-label={`${subject.name} lesson: ${stripHtml(lesson.title)}`}
      tabIndex={0}
      // In compact mode, suppress editing and expansion — the chip is a
      // drag affordance only. Leave onBlurCapture / context menu off too.
      onBlurCapture={isCompact ? undefined : handleCardBlurCapture}
      onContextMenu={isCompact ? undefined : handleContextMenu}
      onKeyDown={(e) => {
        if (isCompact) return; // chip suppresses all keyboard interaction
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={cardSurface}
    >
      {/* ── Compact chip layout (density="compact") ──────────────────────
          Single-line 28px chip per spec §3.2 / §7. Rendered instead of the
          full header+body when the grid signals a drag is active.
          Anatomy: [6px stripe] [44px grab handle] [XX · title] [4px dot]
          The stripe overflows card height to guarantee full-height coverage
          even when the chip is shorter than the handle's 44px touch target. */}
      {isCompact && (
        <div className={styles.chip}>
          {/* Subject color stripe — full-height, non-negotiable (spec §3.2).
              Width uses DRAG_CHIP.subjectStripeWidth (6px). The stripe is
              absolutely positioned so it spans the entire card height even
              when the chip is only 28px and the grab handle overflows. */}
          <div
            aria-hidden
            className={styles.chipStripe}
            style={{
              width: DRAG_CHIP.subjectStripeWidth,
              background: lesson.modified
                ? undefined // dashed handled via CSS below
                : color.stripe,
              // Dashed stripe when personally modified (same as full mode).
              backgroundImage: lesson.modified
                ? `repeating-linear-gradient(to bottom, ${color.stripe} 0 6px, transparent 6px 11px)`
                : undefined,
            }}
          />

          {/* Grab handle — 44px touch target (spec §2.5 / §7).
              Overflows the 28px chip vertically via negative margin so touch
              ergonomics meet the minimum even at reduced chip height. */}
          {dragHandleProps && (
            <span
              {...dragHandleProps}
              data-drag-handle
              className={`${styles.affordance} ${styles.dragHandle} ${styles.chipHandle}`}
              title="Drag to move this lesson"
              aria-label="Drag to move this lesson"
              role="button"
              tabIndex={0}
              style={{ cursor: "grab", ...dragHandleProps.style }}
            >
              <span aria-hidden className={styles.affordanceVisual}>
                <Icon name="drag" size={13} />
              </span>
            </span>
          )}

          {/* Title with 2-letter subject code prefix (spec §3.2 / §3.7).
              Format: "XX · Lesson title" — prefix in --ink-500, middle-dot
              separator, same weight as the rest of the title (500). */}
          <p className={styles.chipTitle}>
            <span className={styles.chipCode} aria-hidden>
              {subjectCode}
              {" · "}
            </span>
            {/* dangerouslySetInnerHTML stripped for the chip — we need plain
                text in a single-line clamp. Use stripHtml so HTML tags from
                the RTE editor are not rendered as visible markup. */}
            <span>{stripHtml(lesson.title)}</span>
          </p>

          {/* Completion-status dot — 4×4px right of title (spec §3.2). */}
          <span
            aria-hidden
            className={styles.chipDot}
            style={{
              background:
                lesson.status === "done"
                  ? color.stripe
                  : lesson.status === "partial"
                    ? `color-mix(in oklch, ${color.stripe} 55%, var(--paper))`
                    : "var(--ink-200)",
            }}
          />
        </div>
      )}

      {/* ── Full card layout (density="full") ────────────────────────────── */}
      {/* Left fork stripe — aria-hidden, purely decorative/informational.
          Only rendered in full mode; compact has its own chipStripe above. */}
      {!isCompact && <div aria-hidden style={stripeStyle} />}

      {/* ── Full-mode rich content (header band + body) ──────────────────
          Wrapped in AnimatePresence + motion.div so it animates out/in on
          density changes (spec §2.3). Under reduced motion: opacity-only fade
          with no height/layout transitions (spec §2.4). */}
      <AnimatePresence initial={false}>
        {!isCompact && (
          <motion.div
            key="full-content"
            // `.fullContent` makes this wrapper a flex column that grows to
            // fill the card root (flex: 1) so the collapsed body can stretch
            // to the bottom of the cell. The framer-motion height animation
            // (height: 0 → auto) still drives the density in/out transition.
            className={styles.fullContent}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={
              reducedMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }
            }
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={collapseTransition}
            style={{ overflow: "hidden" }}
          >
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
              {/* Band top row: [code badge] check + subject·time + right controls */}
              <div className={styles.bandTop}>
                {/* 2-letter subject code badge — leading edge of the header band.
              Mirrors the compact chip's "XX · Title" prefix so the subject
              is scannable at a glance in full mode too.
              Styled with design tokens only; inherits subject deep color (--cd)
              from the band. aria-hidden because the subject name in bandMeta
              already provides the accessible label. */}
                <span
                  aria-hidden="true"
                  className={styles.bandSubjectCode}
                  style={{ color: color.cd }}
                >
                  {subjectCode}
                </span>

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
                    label={`Mark "${stripHtml(lesson.title)}" — current status ${lesson.status}`}
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
                      style={{
                        background: color.stripe,
                        color: "var(--paper)",
                      }}
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
                  {/* Affordances: drag handle (always shown) + ⋯ menu */}
                  <span className={styles.affordanceRow}>
                    {dragHandleProps && (
                      <span
                        {...dragHandleProps}
                        data-drag-handle
                        className={`${styles.affordance} ${styles.dragHandle}`}
                        title="Drag to move this lesson"
                        aria-label="Drag to move this lesson"
                        role="button"
                        tabIndex={0}
                        style={{ cursor: "grab", ...dragHandleProps.style }}
                      >
                        <span aria-hidden className={styles.affordanceVisual}>
                          <Icon name="drag" size={13} />
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
            Double-click enters inline rich-text edit mode (suppresses expand). */}
              <h3
                className={styles.bandTitle}
                style={{
                  color: color.cd,
                  textDecoration: done ? "line-through" : "none",
                  textDecorationColor: `color-mix(in oklch, ${color.cd} 40%, transparent)`,
                }}
              >
                {editingField === "title" ? (
                  <RichEditorWrapper
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                    className={styles.richEditorTitle}
                  >
                    <RichTextEditor
                      value={draftValue}
                      onChange={setDraftValue}
                      autoFocus
                      singleLine
                      ariaLabel="Edit lesson title"
                    />
                  </RichEditorWrapper>
                ) : (
                  <span
                    className={styles.editableText}
                    tabIndex={0}
                    role="button"
                    aria-label="Edit lesson title"
                    // Swallow the single click so it never reaches the card/band
                    // expand handler — clicking text must not resize the cell.
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => openEditor("title", e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "F2")
                        openEditor("title", e);
                    }}
                    title="Double-click or press Enter to edit"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: lesson.title }}
                  />
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
            {/* Collapsed body grows to fill the remaining cell height via
            `.bodyFill` (flex: 1) so the card always reaches the bottom of its
            grid slot. Expanded body keeps its natural height — the expanded
            card may grow taller than the cell, which is intentional. */}
            <div
              className={`${styles.body} ${!expanded ? styles.bodyFill : ""}`}
            >
              {/* Collapsed: preview text (fills the taller body). Expanded:
            full section rows. Double-click on the preview enters edit mode. */}
              {!expanded ? (
                <p
                  className={`${styles.preview} ${
                    hasPager ? "" : styles.previewFill
                  }`}
                  style={{ color: "var(--ink-700)" }}
                >
                  {editingField === "preview" ? (
                    <RichEditorWrapper
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      className={styles.richEditorBody}
                    >
                      <RichTextEditor
                        value={draftValue}
                        onChange={setDraftValue}
                        autoFocus
                        placeholder="Lesson preview…"
                        ariaLabel="Edit lesson preview"
                      />
                    </RichEditorWrapper>
                  ) : (
                    <span
                      className={styles.editableText}
                      tabIndex={0}
                      role="button"
                      aria-label="Edit lesson preview"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => openEditor("preview", e)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "F2")
                          openEditor("preview", e);
                      }}
                      title="Double-click or press Enter to edit"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: lesson.preview }}
                    />
                  )}
                </p>
              ) : (
                <div className={styles.sections}>
                  {/*
                   * Reorderable sections — iterate sectionOrder so the teacher can
                   * drag-to-reorder via 2-second hold (matching the card's own
                   * hold-to-drag threshold). Absent sections (objective when blank,
                   * tasks when there are none, notes when blank) are skipped.
                   * Each ReorderableSectionRow:
                   *   • owns a separate 2-second hold timer that arms draggable
                   *   • calls stopPropagation on all pointer events so the card-level
                   *     hold timer never fires during a section hold
                   *   • exposes move-up / move-down buttons for keyboard access
                   */}
                  {sectionOrder.map((key, idx) => {
                    // ── Skip absent sections ──────────────────────────────────────
                    if (key === "objective" && !lesson.objective) return null;
                    if (key === "tasks" && !hasTasks) return null;
                    if (
                      key === "notes" &&
                      !lesson.notes &&
                      editingField !== "notes"
                    )
                      return null;

                    // ── Visible index for keyboard move buttons ───────────────────
                    // We need the count of actually-visible sections to decide whether
                    // move-up / move-down are at the boundary.
                    const visibleKeys = sectionOrder.filter((k) => {
                      if (k === "objective" && !lesson.objective) return false;
                      if (k === "tasks" && !hasTasks) return false;
                      if (
                        k === "notes" &&
                        !lesson.notes &&
                        editingField !== "notes"
                      )
                        return false;
                      return true;
                    });
                    const visibleIdx = visibleKeys.indexOf(key);
                    const visibleCount = visibleKeys.length;

                    // ── Section content ───────────────────────────────────────────
                    let sectionLabel = "";
                    let sectionContent: React.ReactNode = null;

                    if (key === "objective") {
                      sectionLabel = "I Can";
                      sectionContent =
                        editingField === "objective" ? (
                          <RichEditorWrapper
                            onCommit={commitEdit}
                            onCancel={cancelEdit}
                            className={styles.richEditorBody}
                          >
                            <RichTextEditor
                              value={draftValue}
                              onChange={setDraftValue}
                              autoFocus
                              placeholder="I can…"
                              ariaLabel="Edit lesson objective"
                            />
                          </RichEditorWrapper>
                        ) : (
                          <p
                            className={`${styles.sectionText} ${styles.editableText}`}
                            style={{
                              fontStyle: "italic",
                              color: "var(--ink-700)",
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label="Edit lesson objective"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => openEditor("objective", e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "F2")
                                openEditor("objective", e);
                            }}
                            title="Double-click or press Enter to edit"
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: objectiveBody }}
                          />
                        );
                    } else if (key === "directions") {
                      sectionLabel = "Directions";
                      sectionContent =
                        editingField === "directions" ? (
                          <RichEditorWrapper
                            onCommit={commitEdit}
                            onCancel={cancelEdit}
                            className={styles.richEditorBody}
                          >
                            <RichTextEditor
                              value={draftValue}
                              onChange={setDraftValue}
                              autoFocus
                              placeholder="Directions…"
                              ariaLabel="Edit lesson directions"
                            />
                          </RichEditorWrapper>
                        ) : (
                          <p
                            className={`${styles.sectionText} ${styles.editableText}`}
                            style={{ color: "var(--ink-700)" }}
                            tabIndex={0}
                            role="button"
                            aria-label="Edit lesson directions"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => openEditor("directions", e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "F2")
                                openEditor("directions", e);
                            }}
                            title="Double-click or press Enter to edit"
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{
                              __html: lesson.directions,
                            }}
                          />
                        );
                    } else if (key === "notes") {
                      sectionLabel = "Notes";
                      sectionContent = (
                        <>
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
                            {notesOpen
                              ? "Hide teacher notes"
                              : "Show teacher notes"}
                          </button>
                          {notesOpen &&
                            (editingField === "notes" ? (
                              <RichEditorWrapper
                                onCommit={commitEdit}
                                onCancel={cancelEdit}
                                className={`${styles.notesBody} ${styles.richEditorBody}`}
                              >
                                <RichTextEditor
                                  value={draftValue}
                                  onChange={setDraftValue}
                                  autoFocus
                                  placeholder="Teacher notes…"
                                  ariaLabel="Edit teacher notes"
                                />
                              </RichEditorWrapper>
                            ) : (
                              <p
                                className={`${styles.notesBody} ${styles.editableText}`}
                                tabIndex={0}
                                role="button"
                                aria-label="Edit teacher notes"
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => openEditor("notes", e)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "F2")
                                    openEditor("notes", e);
                                }}
                                title="Double-click or press Enter to edit"
                                // eslint-disable-next-line react/no-danger
                                dangerouslySetInnerHTML={{
                                  __html: lesson.notes ?? "",
                                }}
                              />
                            ))}
                        </>
                      );
                    } else if (key === "tasks") {
                      sectionLabel = `${lesson.tasks.length} Tasks`;
                      sectionContent = (
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
                      );
                    } else if (key === "resources") {
                      sectionLabel = "Resources";
                      sectionContent = (
                        <ResourceList resources={lesson.resources} />
                      );
                    } else if (key === "standards") {
                      sectionLabel = "Standards";
                      sectionContent = (
                        <StandardsList codes={lesson.standards} />
                      );
                    }

                    return (
                      <ReorderableSectionRow
                        key={key}
                        sectionKey={key}
                        label={sectionLabel}
                        accent={color.cl}
                        ink={color.cd}
                        setSectionOrder={setSectionOrder}
                        visibleIdx={visibleIdx}
                        visibleCount={visibleCount}
                        visibleKeys={visibleKeys}
                        originalIdx={idx}
                      >
                        {sectionContent}
                      </ReorderableSectionRow>
                    );
                  })}

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
                  {/* "Why not done" reason — compact alert-icon affordance.
                      Opens NotePopover with the reason text. Rendered inline in
                      the footer (not as its own row) so the collapsed card
                      stays bounded inside the fixed-height grid cell. Only
                      mounted when the lesson actually carries a reason. */}
                  {hasReason && <NotePopover reason={lesson.reasonNotDone} />}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── In-card pager footer — multi-lesson days ───────────────────────
          A quiet horizontal strip pinned flush with the card's bottom edge
          (within its rounded corners) when this day cell holds more than one
          lesson. Lets the teacher flip through every lesson without leaving
          the card. Rendered as the last flex child of the card root so it
          sits at the bottom; it is unmounted in compact mode and when there
          is only a single lesson (deck absent or total <= 1).
          Mirrors the look of card-stack's `.navBar` (ink-tinted band, top
          hairline) but adapted to live inside the card.
          Page buttons stopPropagation so paging never bubbles to the card /
          cell click or expand handlers. */}
      {!isCompact && hasPager && deck && (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerArrow}
            disabled={deck.index === 0}
            aria-label="Previous lesson"
            onClick={(e) => {
              e.stopPropagation();
              deck.onPrev();
            }}
          >
            <span aria-hidden>‹</span>
          </button>
          <span className={styles.pagerCounter} aria-live="polite">
            {deck.index + 1} of {deck.total}
          </span>
          <button
            type="button"
            className={styles.pagerArrow}
            disabled={deck.index === deck.total - 1}
            aria-label="Next lesson"
            onClick={(e) => {
              e.stopPropagation();
              deck.onNext();
            }}
          >
            <span aria-hidden>›</span>
          </button>
        </div>
      )}

      {/* Context menu and Save-target dialog are portals — they render outside
          the card's DOM subtree and are not affected by the AnimatePresence
          wrapper. Keep them at the root level so they survive compact mode. */}

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

      {/* Save-target dialog — fires when the teacher leaves the card after
          making at least one real content change. Asking "save to Personal
          or Core?" keeps the forking decision explicit rather than silently
          writing to the shared Core Curriculum.
          onClose without a choice defaults to "personal" (safer — never
          auto-writes to the shared plan) and clears dirty so the dialog
          won't re-open unless a new edit is committed. */}
      <SaveTargetDialog
        open={saveDialogOpen}
        lessonTitle={stripHtml(lesson.title)}
        onChoose={(target) => {
          setSaveDialogOpen(false);
          setDirty(false);
          onSaveTarget?.(lesson.id, target);
        }}
        onClose={() => {
          // Dismiss without choosing → default to "personal" (safe fallback:
          // never silently touch the shared Core Curriculum).
          setSaveDialogOpen(false);
          setDirty(false);
          onSaveTarget?.(lesson.id, "personal");
        }}
      />
    </motion.div>
  );
}

// ── ReorderableSectionRow ─────────────────────────────────────────────────────
// A labeled section row that the teacher can drag to reorder within the
// expanded card body. Supports two reorder gestures:
//
//   • Press-and-hold (2 s) → section enters "hold-ready" state (visual lift +
//     grab cursor). Once armed, dragging it with native HTML5 DnD repositions
//     it in the order (HOLD_MS threshold).
//
//   • Move-up / move-down buttons — keyboard-accessible alternative. Rendered
//     inside each section row as small ghost buttons.  They shift the section
//     one position in the visible list and are disabled at the boundary.
//
// Gesture isolation: ALL pointer handlers call stopPropagation() so they do
// not bubble into the card's own event handlers. The section drag events
// similarly stop propagation so they cannot bubble into the card's onDragStart.

function ReorderableSectionRow({
  sectionKey,
  label,
  accent,
  ink,
  children,
  setSectionOrder,
  visibleIdx,
  visibleCount,
  visibleKeys,
}: {
  sectionKey: SectionKey;
  label: string;
  /** Subject light fill for the label pill background. */
  accent: string;
  /** Subject deep color for the label pill text. */
  ink: string;
  children: React.ReactNode;
  setSectionOrder: React.Dispatch<React.SetStateAction<SectionKey[]>>;
  /** Position of this section in the visible (non-absent) list. */
  visibleIdx: number;
  visibleCount: number;
  /** Ordered keys of all visible sections (for keyboard move). */
  visibleKeys: SectionKey[];
  /** Index of this key in the full sectionOrder array. */
  originalIdx: number;
}) {
  // ── Per-section hold state ───────────────────────────────────────────────
  // holdReady: this section's 2-second hold has fired and it can now be dragged.
  const [holdReady, setHoldReady] = useState(false);
  // dragOver: another section is being dragged and is hovering over this one.
  const [dragOver, setDragOver] = useState(false);
  const sectionHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sectionHoldOriginRef = useRef<{ x: number; y: number } | null>(null);

  const cancelSectionHold = () => {
    if (sectionHoldTimerRef.current !== null) {
      clearTimeout(sectionHoldTimerRef.current);
      sectionHoldTimerRef.current = null;
    }
    sectionHoldOriginRef.current = null;
  };

  // ── Reorder helpers ──────────────────────────────────────────────────────
  // Swap the dragged section key with the target section key in the full order.
  const moveSectionAfter = (draggedKey: SectionKey, targetKey: SectionKey) => {
    setSectionOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKey);
      const targetPos = next.indexOf(targetKey);
      // Insert the dragged section immediately after the target.
      next.splice(targetPos + 1, 0, draggedKey);
      return next;
    });
  };

  const moveSectionBefore = (draggedKey: SectionKey, targetKey: SectionKey) => {
    setSectionOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKey);
      const targetPos = next.indexOf(targetKey);
      next.splice(targetPos, 0, draggedKey);
      return next;
    });
  };

  // Keyboard move: shift this section one position in the visible list.
  const moveKeyboard = (direction: "up" | "down") => {
    const targetVisibleIdx =
      direction === "up" ? visibleIdx - 1 : visibleIdx + 1;
    if (targetVisibleIdx < 0 || targetVisibleIdx >= visibleCount) return;
    const neighborKey = visibleKeys[targetVisibleIdx];
    if (direction === "up") {
      moveSectionBefore(sectionKey, neighborKey);
    } else {
      moveSectionAfter(sectionKey, neighborKey);
    }
  };

  // ── Pointer handlers ──────────────────────────────────────────────────────
  // ALL must stopPropagation so the card-level hold timer never fires.

  const handleSectionPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Stop ALL propagation immediately — this is the critical gesture isolator.
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType !== "touch") return;

    sectionHoldOriginRef.current = { x: e.clientX, y: e.clientY };
    sectionHoldTimerRef.current = setTimeout(() => {
      sectionHoldTimerRef.current = null;
      sectionHoldOriginRef.current = null;
      setHoldReady(true);
    }, HOLD_MS);
  };

  const handleSectionPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!sectionHoldOriginRef.current || sectionHoldTimerRef.current === null)
      return;
    const dx = e.clientX - sectionHoldOriginRef.current.x;
    const dy = e.clientY - sectionHoldOriginRef.current.y;
    // Cancel hold if the pointer strays more than 8px (scroll intent).
    if (dx * dx + dy * dy > 64) {
      cancelSectionHold();
    }
  };

  const handleSectionPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    cancelSectionHold();
    setHoldReady(false);
  };

  // ── DnD handlers — section drag source ───────────────────────────────────
  const handleSectionDragStart = (e: React.DragEvent<HTMLElement>) => {
    // Critical: stop so the card's own onDragStart is never triggered by this.
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-section-key", sectionKey);
  };

  const handleSectionDragEnd = (e: React.DragEvent<HTMLElement>) => {
    e.stopPropagation();
    setHoldReady(false);
    setDragOver(false);
  };

  // ── DnD handlers — section drop target ───────────────────────────────────
  const handleSectionDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.stopPropagation();
    // Only react to section drags (our custom type), not card drags.
    if (!e.dataTransfer.types.includes("text/x-section-key")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleSectionDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.stopPropagation();
    // Only clear when the pointer truly leaves this section element.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleSectionDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const draggedKey = e.dataTransfer.getData(
      "text/x-section-key",
    ) as SectionKey;
    if (!draggedKey || draggedKey === sectionKey) return;
    // Determine drop position: above or below the midpoint of this element.
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      moveSectionBefore(draggedKey, sectionKey);
    } else {
      moveSectionAfter(draggedKey, sectionKey);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const isFirst = visibleIdx === 0;
  const isLast = visibleIdx === visibleCount - 1;

  return (
    <section
      className={`${styles.sectionRow} ${holdReady ? styles.sectionRowHoldReady : ""} ${dragOver ? styles.sectionRowDragOver : ""}`}
      // draggable is only active after the hold fires so plain pointer
      // interactions (click, scroll) are never hijacked.
      draggable={holdReady}
      // Pointer events — all stop propagation to guard the card-level hold.
      onPointerDown={handleSectionPointerDown}
      onPointerMove={handleSectionPointerMove}
      onPointerUp={handleSectionPointerUp}
      onPointerCancel={handleSectionPointerUp}
      // DnD — drag source
      onDragStart={handleSectionDragStart}
      onDragEnd={handleSectionDragEnd}
      // DnD — drop target
      onDragOver={handleSectionDragOver}
      onDragLeave={handleSectionDragLeave}
      onDrop={handleSectionDrop}
      aria-label={`${label} section`}
    >
      {/* Section header row: pill label + keyboard move buttons */}
      <div className={styles.sectionHeader}>
        <div
          className={styles.sectionLabel}
          style={{ background: accent, color: ink }}
        >
          {label}
        </div>

        {/* Move-up / move-down — keyboard-accessible reorder alternative.
            Hidden visually until the section is focused/hovered so they
            don't clutter the default state. Disabled at the boundaries. */}
        <div
          className={styles.sectionMoveControls}
          // Don't let these button clicks bubble up to the section
          // pointerDown handler and start the hold timer.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.sectionMoveBtn}
            onClick={() => moveKeyboard("up")}
            disabled={isFirst}
            aria-label={`Move ${label} section up`}
            title={`Move ${label} section up`}
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className={styles.sectionMoveBtn}
            onClick={() => moveKeyboard("down")}
            disabled={isLast}
            aria-label={`Move ${label} section down`}
            title={`Move ${label} section down`}
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      {/* Screen-reader announcement when this section enters "hold ready". */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {holdReady ? `${label} section ready to drag. Drag to reorder.` : ""}
      </div>

      <div className={styles.sectionContent}>{children}</div>
    </section>
  );
}

// ── Keyboard-reorder icons ────────────────────────────────────────────────────
// Minimal inline SVG chevrons — no import needed, consistent with the existing
// PlusIcon / CollapseIcon / ExpandIcon pattern in GridCell.tsx.

function ChevronUpIcon() {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ── RichEditorWrapper ─────────────────────────────────────────────────────────
// Thin shell that hosts a RichTextEditor instance inside the card. Handles the
// three editing gestures that the card cares about but that RichTextEditor does
// not expose as props:
//   • Escape           → cancel (discard draft)
//   • blur out of area → commit (focusout fires when focus leaves both the
//                         editor AND the floating toolbar — relatedTarget check)
//   • click / dblclick  → stopPropagation so the card's expand handler is deaf
//
// Sizing is supplied through `className` so callers (title vs. body fields)
// can independently constrain width, font, and min-height via CSS Modules.

function RichEditorWrapper({
  onCommit,
  onCancel,
  className,
  children,
}: {
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.richEditorWrap} ${className ?? ""}`}
      // Commit when focus genuinely leaves this subtree (editor + toolbar both
      // use position:fixed / portal, so check relatedTarget to avoid false
      // triggers when the user clicks a toolbar button).
      onBlur={(e) => {
        // relatedTarget points to the element receiving focus (null = page blur
        // or focus leaving the document entirely → commit in both cases).
        const next = e.relatedTarget as HTMLElement | null;

        // 1. Focus stayed within the wrapper DOM subtree (handles the case where
        //    the toolbar is position:fixed but still in the DOM under us).
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;

        // 2. Focus moved to the floating rich-text toolbar (role="toolbar")
        //    rendered by RichTextEditor — identified by role so it works even
        //    when CSS transform/stacking context moves the rendered position.
        if (next?.closest('[role="toolbar"]')) return;

        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      // Block card-level pointer events so the editor doesn't expand/select.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
