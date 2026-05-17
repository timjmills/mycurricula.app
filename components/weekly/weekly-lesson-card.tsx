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
// Types re-exported so the sibling board agent can import without a deep path:
//   export type { ContextAction, ContextActionPayload }

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
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
}

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

  const done = lesson.status === "done";
  const hasTasks = lesson.tasks.length >= 2;
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
  // White base (quiet/calm) or subject-tint base (vivid) — matching the
  // existing LessonCard surface convention. The header band is always
  // subject-tinted regardless of style.
  const isVivid = style === "vivid";

  const cardSurface: CSSProperties = {
    position: "relative",
    background: isVivid ? color.bg : "var(--paper)",
    border: selected
      ? `1.5px solid ${color.stripe}`
      : isVivid
        ? `1px solid color-mix(in oklch, ${color.deep} 14%, transparent)`
        : "1px solid var(--ink-150)",
    boxShadow: dragging
      ? `0 12px 28px rgba(20,22,32,0.18), 0 0 0 1.5px ${color.stripe}`
      : hovered
        ? "0 4px 14px rgba(20,22,32,0.10)"
        : "var(--shadow-card)",
    transform: dragging ? "rotate(-1.2deg)" : "none",
    // Fade the whole card when done; the CSS filter also desaturates so the
    // subject color recedes, making "done" immediately scannable in the grid.
    opacity: done ? 0.52 : 1,
    filter: done ? "saturate(45%)" : "none",
    paddingInlineStart: 5,
  };

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

  const handleCardClick = useCallback(() => {
    onSelect?.(lesson.id);
  }, [onSelect, lesson.id]);

  const toggleExpand = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      (onToggleExpand ?? onSelect)?.(lesson.id);
    },
    [onToggleExpand, onSelect, lesson.id],
  );

  const cycleComplete = useCallback(() => {
    onToggleComplete?.(lesson.id, cycleStatus(lesson.status));
  }, [onToggleComplete, lesson.id, lesson.status]);

  // Strip the "I can" prefix for display; the band label makes it explicit.
  const objectiveBody = useMemo(
    () => lesson.objective.replace(/^I can\s+/i, ""),
    [lesson.objective],
  );

  return (
    <div
      className={`cp-subj ${subject.cls} ${styles.card}`}
      data-style={style}
      role="group"
      aria-label={`${subject.name} lesson: ${lesson.title}`}
      tabIndex={0}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={cardSurface}
    >
      {/* Left fork stripe — aria-hidden, purely decorative/informational */}
      <div aria-hidden style={stripeStyle} />

      {/* ── Header band ─────────────────────────────────────────────────── */}
      {/* Subject-tint fill (`--cl`) with deep text (`--cd`). Always tinted
          regardless of the card style axis — this is the Weekly-view contract.
          The band carries: subject name, time label, move/modified indicators,
          drag handle, ⋯ affordance, and the lesson title below them. */}
      <div
        className={styles.band}
        style={{ background: color.cl }}
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

          {/* Subject · time meta — the two identifiers at a glance */}
          <div className={styles.bandMeta} style={{ color: color.cd }}>
            <span className={styles.bandSubject}>{subject.name}</span>
            <span className={styles.bandDot} aria-hidden>
              ·
            </span>
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

        {/* Lesson title — second line of the band */}
        <h3
          className={styles.bandTitle}
          style={{
            color: color.cd,
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: `color-mix(in oklch, ${color.cd} 40%, transparent)`,
          }}
        >
          {lesson.title}
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
        {/* Collapsed: 2-line preview only. Expanded: full section rows. */}
        {!expanded ? (
          <p
            className={styles.preview}
            style={{ color: isVivid ? color.deep : "var(--ink-500)" }}
          >
            {lesson.preview}
          </p>
        ) : (
          <div className={styles.sections}>
            {/* Objective section */}
            {lesson.objective && (
              <SectionRow label="I Can" accent={color.cl} ink={color.cd}>
                <p
                  className={styles.sectionText}
                  style={{ fontStyle: "italic", color: "var(--ink-700)" }}
                >
                  {objectiveBody}
                </p>
              </SectionRow>
            )}

            {/* Directions section */}
            <SectionRow label="Directions" accent={color.cl} ink={color.cd}>
              <p
                className={styles.sectionText}
                style={{ color: "var(--ink-700)" }}
              >
                {lesson.directions}
              </p>
            </SectionRow>

            {/* Teacher notes — hover-gated disclosure */}
            {lesson.notes && (
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
                {notesOpen && (
                  <p className={styles.notesBody}>{lesson.notes}</p>
                )}
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
