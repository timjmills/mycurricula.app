"use client";

// lesson-card.tsx — the Lesson Card, the atomic unit of every grid view.
//
// One component, three styles (driven by useTheme().style):
//   • quiet — white card, thin 4px solid subject stripe.
//   • calm  — white card + a rounded subject-monogram tile in the header.
//   • vivid — subject-tint background fill + matching stripe; the title
//             stays ink-900 so it clears AA on the tinted surface.
//
// Three-tier personal-mode differentiation (§3.4):
//   • unedited       → solid stripe, no marker.
//   • modified       → DASHED stripe + "Modified" pill (top-right).
//   • moved          → solid stripe + move-arrow (↔ same-week / ⤴ across).
//   • modified+moved → all three compose.
//
// Disclosure tiers (§6.5): collapsed by default (title, stripe, 2-line
// preview, completion check, standards badge, resource icons); expanded
// reveals full directions, hover-gated notes, full resource + standards
// lists, and inner task rows for multi-task lessons.

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { Lesson, LessonStatus } from "@/lib/types";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { useSubjectColor } from "@/lib/palette";
import { useTeamModeEditCue } from "@/lib/use-team-mode-edit-cue";
import { useTheme } from "@/lib/theme";
import { useTeacherPresence } from "@/lib/realtime-presence";
import { EditingIndicator } from "./editing-indicator";
import { Icon } from "./icon";
import { LessonContextMenu } from "./context-menu";
import type { ContextAction, ContextActionPayload } from "./context-menu";
import {
  CompletionCheck,
  ResourceList,
  ResourceTypeRow,
  StandardsBadge,
  StandardsList,
  SubjectMonogram,
} from "./parts";
import { cycleStatus } from "./status";
import { TaskRow } from "./task-row";
import { Badge, Button, Tooltip } from "@/components/ui";
import styles from "./lesson-card.module.css";
import "./lesson-card.css";

export type { ContextAction, ContextActionPayload } from "./context-menu";

export interface LessonCardProps {
  lesson: Lesson;
  /** Expanded-inline disclosure. Default false (collapsed). */
  expanded?: boolean;
  /** Selected ring. Default false. */
  selected?: boolean;
  /** Card click — toggles selection / expansion at the grid level. */
  onSelect?: (id: string) => void;
  /** Explicit expand toggle (caret / header). Falls back to onSelect. */
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
  /** Visual drag state passthrough. */
  dragging?: boolean;
  /** Compact density for narrow grid cells. Default false. */
  dense?: boolean;
}

/** Two-letter monogram for the calm/vivid header tile. */
const SUBJECT_GLYPH: Record<string, string> = {
  math: "Ma",
  reading: "Re",
  writing: "Wr",
  grammar: "Gr",
  spelling: "Sp",
  ufli: "Uf",
  explorers: "Ex",
  sel: "Se",
};

export function LessonCard({
  lesson,
  expanded = false,
  selected = false,
  onSelect,
  onToggleExpand,
  onToggleComplete,
  onContextAction,
  dragHandleProps,
  dragging = false,
  dense = false,
}: LessonCardProps) {
  const { style } = useTheme();
  const color = useSubjectColor(lesson.subject);
  const subject = SUBJECT_BY_ID[lesson.subject];

  // W4-D1: per-lesson presence lookup. The hook reads from a module-frozen
  // map today (lib/realtime-presence.ts); the result drives both the
  // <EditingIndicator> chip AND the title row's padding-right reservation
  // so the title never runs under the absolutely-positioned indicator
  // cluster. `editorCount` is 0 for every lesson that has no active
  // editors — the common case keeps its historical padding.
  const { activeEditors } = useTeacherPresence();
  const editorCount = activeEditors.get(lesson.id)?.length ?? 0;

  const [hovered, setHovered] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Per-task completion is card-local: the mock fixture is immutable and
  // there is no task-level persistence handler, so the card owns the
  // three-state cycle for its own task rows. Keyed by task id.
  const [taskStatus, setTaskStatus] = useState<Record<string, LessonStatus>>(
    {},
  );

  const isVivid = style === "vivid";
  const isCalm = style === "calm";
  const done = lesson.status === "done";
  const hasTasks = lesson.tasks.length >= 2;

  // ── Stripe — solid by default, dashed when personally modified ────────
  const stripeWidth = isVivid ? 5 : 4;
  const stripeStyle: CSSProperties = {
    position: "absolute",
    insetBlock: 0,
    insetInlineStart: 0,
    width: stripeWidth,
    ...(lesson.modified
      ? {
          backgroundImage: `repeating-linear-gradient(to bottom, ${color.stripe} 0 6px, transparent 6px 11px)`,
        }
      : { background: color.stripe }),
  };

  // ── Card surface — white for quiet/calm, subject tint for vivid ───────
  const surface: CSSProperties = {
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
    paddingInlineStart: stripeWidth,
  };

  // Title always reads as ink-900 — verified AA on white and on the
  // tinted vivid fill, since the fill is a light/highlight tone.
  const padX = dense ? 9 : 11;

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

  const objective = useMemo(
    () => lesson.objective.replace(/^I can\s+/i, ""),
    [lesson.objective],
  );

  // W2-B1: inline edit cue ring on the lesson title surface while
  // editMode === "master". Empty string in Personal mode (no visual
  // change). Class is defined in master-banner.module.css :global.
  const teamModeCue = useTeamModeEditCue();

  return (
    <div
      className={`cp-subj ${subject.cls} ${styles.card}`}
      data-style={style}
      // Scroll anchor for the program-wide history — scrollPlannerItemIntoView()
      // queries this attribute to bring an edited/undone lesson back into view.
      data-planner-item={`lesson:${lesson.id}`}
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
      style={surface}
    >
      <div aria-hidden style={stripeStyle} />

      {/* Top-right indicator cluster — editing pill / move arrow / Modified pill / ⋯
          W4-D1: the EditingIndicator is FIRST in the row so it reads as
          status context BEFORE the personal-fork pills. It renders null
          when no other teacher is editing, so the cluster keeps its
          historical layout for the common case. */}
      <div
        style={{
          position: "absolute",
          top: 5,
          right: 5,
          display: "flex",
          alignItems: "center",
          gap: 4,
          zIndex: 2,
        }}
      >
        <EditingIndicator lessonId={lesson.id} />
        {lesson.moved && (
          <Tooltip
            content={
              lesson.moved === "across-weeks"
                ? "This lesson was moved across weeks in your personal copy — the Team Curriculum version still lives in the original slot."
                : "This lesson was moved within the week in your personal copy — the Team Curriculum version still lives in the original slot."
            }
            side="top"
          >
            <span
              title={
                lesson.moved === "across-weeks"
                  ? "Moved across weeks in your personal copy"
                  : "Moved within the week in your personal copy"
              }
              aria-label={
                lesson.moved === "across-weeks"
                  ? "Moved across weeks"
                  : "Moved within the week"
              }
              tabIndex={0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 3,
                background: color.cl,
                color: color.cd,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {lesson.moved === "across-weeks" ? "⤴" : "↔"}
            </span>
          </Tooltip>
        )}
        {/* Modified pill — bespoke: subject-color background (color.deep), no
            Badge semantic match. The deep tone clears AA vs white text in all
            palettes; the saturated stripe tone fails AA on warm hues. */}
        {lesson.modified && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "1px 6px",
              borderRadius: 999,
              background: color.deep,
              color: "var(--paper)",
            }}
          >
            Modified
          </span>
        )}
        {/* Interactive affordances — each a full 44×44 touch target. */}
        <span className={styles.affordanceRow}>
          {/* Drag handle — bespoke: dnd-kit spreads dragHandleProps here; cannot
              be a <Button> as it receives an external ref and event spread. */}
          {dragHandleProps && (
            <Tooltip
              content="Drag to move this lesson — moves stay personal unless you save them to the Team Curriculum."
              side="top"
            >
              <span
                {...dragHandleProps}
                className={styles.affordance}
                title="Drag to move this lesson"
                aria-label="Drag handle"
                role="button"
                tabIndex={0}
                style={{ cursor: "grab", ...dragHandleProps.style }}
              >
                <span aria-hidden className={styles.affordanceVisual}>
                  <Icon name="drag" size={12} />
                </span>
              </span>
            </Tooltip>
          )}
          {/* ⋯ menu button — <Button variant="icon"> with <Tooltip>. The
              styles.affordance className overrides Button's own styles to
              preserve the hover-reveal behaviour defined in lesson-card.module.css. */}
          <Tooltip
            content="Open the lesson menu — mark status, move this lesson to another day or week, edit details, or save changes to the Team Curriculum"
            side="top"
          >
            <Button
              variant="icon"
              size="sm"
              className={styles.affordance}
              onClick={handleAffordance}
              iconAriaLabel="More actions"
              aria-haspopup="menu"
              tooltip="Open the lesson menu — mark status, move the lesson, edit, or push changes to Team Curriculum"
            >
              <span className={styles.affordanceVisual}>
                <Icon name="dots" size={12} />
              </span>
            </Button>
          </Tooltip>
        </span>
      </div>

      {/* Header row — check + (monogram) + title + caret */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: dense ? 7 : 9,
          padding: `${dense ? 8 : 9}px ${padX}px 4px ${padX + 3}px`,
        }}
      >
        <div className={styles.cardCheckWrap} style={{ marginTop: 1 }}>
          <CompletionCheck
            status={lesson.status}
            size={dense ? 15 : 16}
            onCycle={cycleComplete}
            label={`Mark "${lesson.title}" — current status ${lesson.status}`}
          />
        </div>

        {(isCalm || isVivid) && (
          <SubjectMonogram
            glyph={SUBJECT_GLYPH[lesson.subject] ?? subject.icon}
            fill={color.tile}
            ink={color.deep}
            size={dense ? 28 : 32}
          />
        )}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            // Leave room for the top-right indicator cluster.
            // W4-D1: reserve ~120px when an EditingIndicator paints so the
            // title doesn't underrun the chip; the indicator clamps itself
            // to maxWidth: 130 so the reservation is generous-but-finite.
            paddingRight:
              (editorCount > 0 ? 124 : 0) +
              (lesson.modified ? 64 : 0) +
              (lesson.moved ? 20 : 0) +
              (dragHandleProps ? 24 : 22),
          }}
        >
          {(isCalm || isVivid) && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: color.deep,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 1,
              }}
            >
              {subject.name}
            </div>
          )}
          <h3
            className={teamModeCue}
            style={{
              margin: 0,
              padding: teamModeCue ? "2px 6px" : 0,
              fontSize: 14,
              fontWeight: 500,
              color: "var(--ink-900)",
              lineHeight: 1.3,
              textWrap: "pretty",
              textDecoration: done ? "line-through" : "none",
              textDecorationColor: "var(--ink-300)",
            }}
          >
            {lesson.title}
          </h3>
        </div>

        {/* Expand caret — bespoke: structural, has styles.caretOpen rotation
            animation; keeping as native button per task spec. */}
        <Tooltip
          content={
            expanded
              ? "Collapse this lesson back to the preview card."
              : "Expand this lesson to see full directions, resources, standards, and any sub-tasks."
          }
          side="top"
        >
          <button
            type="button"
            className={styles.caret}
            onClick={toggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse lesson" : "Expand lesson"}
            title={
              expanded
                ? "Collapse this lesson back to the preview card"
                : "Expand this lesson to see full directions, resources, standards, and any sub-tasks"
            }
          >
            <span
              aria-hidden
              className={`${styles.caretVisual} ${
                expanded ? styles.caretOpen : ""
              }`}
            >
              <Icon name="chevronD" size={12} />
            </span>
          </button>
        </Tooltip>
      </div>

      {/* Objective + preview (collapsed) */}
      <div style={{ padding: `0 ${padX}px 5px ${padX + 3}px` }}>
        {lesson.objective && (
          <div
            // title= on a non-interactive div: provides a browser tooltip for
            // sighted pointer users. Not a control, so no Tooltip primitive
            // is needed; WCAG requires Tooltip only on interactive elements.
            title="Lesson objective (I Can statement)"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 5,
              fontSize: 11,
              lineHeight: 1.4,
              color: color.deep,
              fontStyle: "italic",
              marginBottom: 3,
              textWrap: "pretty",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                padding: "1px 4px",
                borderRadius: 3,
                background: color.cl,
                color: color.cd,
                fontStyle: "normal",
                flex: "0 0 auto",
                marginTop: 1,
                textTransform: "uppercase",
              }}
            >
              I can
            </span>
            <span style={{ flex: 1 }}>{objective}</span>
          </div>
        )}
        {!expanded && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.45,
              color: isVivid ? color.deep : "var(--ink-500)",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textWrap: "pretty",
            }}
          >
            {lesson.preview}
          </p>
        )}
      </div>

      {/* Expanded body — full directions, notes, resources, standards, tasks */}
      {expanded && (
        <div
          style={{
            padding: `2px ${padX}px 6px ${padX + 3}px`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Section label="Directions">
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: isVivid ? color.deep : "var(--ink-700)",
                textWrap: "pretty",
              }}
            >
              {lesson.directions}
            </p>
          </Section>

          {lesson.notes && (
            <div>
              {/* Notes toggle — <Button variant="ghost" size="sm">; the
                  styles.notesToggle className overrides to match the existing
                  hover-reveal style defined in lesson-card.module.css. */}
              <Button
                variant="ghost"
                size="sm"
                className={styles.notesToggle}
                onClick={(e) => {
                  e.stopPropagation();
                  setNotesOpen((v) => !v);
                }}
                aria-expanded={notesOpen}
                leadingIcon={<Icon name="eye" size={12} />}
                tooltip={
                  notesOpen
                    ? "Hide the team's private teacher notes for this lesson"
                    : "Reveal the team's private teacher notes — context that only fellow teachers see, never students"
                }
              >
                {notesOpen ? "Hide teacher notes" : "Show teacher notes"}
              </Button>
              {notesOpen && (
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: "var(--ink-700)",
                    background: "var(--ink-50)",
                    border: "1px solid var(--ink-100)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    textWrap: "pretty",
                  }}
                >
                  {lesson.notes}
                </p>
              )}
            </div>
          )}

          {hasTasks && (
            <Section label={`${lesson.tasks.length} lesson tasks`}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {lesson.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={{
                      ...task,
                      status: taskStatus[task.id] ?? task.status,
                    }}
                    parentSubject={lesson.subject}
                    onCycle={(next) => {
                      setTaskStatus((prev) => ({ ...prev, [task.id]: next }));
                      onContextAction?.("mark-status", lesson.id, {
                        status: next,
                        taskId: task.id,
                      });
                    }}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section label="Resources">
            <ResourceList resources={lesson.resources} />
          </Section>

          <Section label="Standards">
            <StandardsList codes={lesson.standards} />
          </Section>
        </div>
      )}

      {/* Footer — standards badge + resource icons + tasks pill + meta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `0 ${padX}px ${dense ? 7 : 8}px ${padX + 3}px`,
          flexWrap: "wrap",
        }}
      >
        {lesson.standards.length > 0 && (
          <StandardsBadge codes={lesson.standards} />
        )}
        <ResourceTypeRow resources={lesson.resources} dense={dense} />
        {hasTasks && (
          <Tooltip
            content={`${lesson.tasks.length} lesson task${lesson.tasks.length === 1 ? "" : "s"} inside this lesson — expand the card to tick them off.`}
            side="top"
          >
            <span
              title={`${lesson.tasks.length} lesson tasks inside this lesson`}
              tabIndex={0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "1px 6px 1px 4px",
                borderRadius: 999,
                background: color.cl,
                color: color.cd,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              <Icon name="list" size={9} />
              {lesson.tasks.length} tasks
            </span>
          </Tooltip>
        )}
        {lesson.commentCount > 0 && (
          <Tooltip
            content={`${lesson.commentCount} Lesson Comment${lesson.commentCount === 1 ? "" : "s"} from your team — open the card to read them. Lesson Comments live in the Team Shoutbox under the All-comments tab.`}
            side="top"
          >
            <span
              title={`${lesson.commentCount} Lesson Comment${lesson.commentCount === 1 ? "" : "s"} from your team`}
              tabIndex={0}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                color: isVivid ? color.deep : "var(--ink-500)",
              }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>
                💬
              </span>
              {lesson.commentCount}
              {lesson.unreadComments > 0 && (
                <span
                  aria-label={`${lesson.unreadComments} unread`}
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -3,
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: "var(--urgent)",
                  }}
                />
              )}
            </span>
          </Tooltip>
        )}
        <div style={{ flex: 1 }} />
        {/* pendingMaster — <Badge variant="warn">: maps to --important token pair. */}
        {lesson.pendingMaster && <Badge variant="warn">Core ↑</Badge>}
        {/* carried — <Badge variant="danger">: maps to --catchup token pair. */}
        {lesson.status === "carried" && (
          <Badge variant="danger">carry-over</Badge>
        )}
      </div>

      {/* "Why not done" reason — only when the teacher recorded one */}
      {lesson.reasonNotDone && lesson.status !== "done" && (
        <div
          style={{ padding: `0 ${padX}px ${dense ? 8 : 9}px ${padX + 3}px` }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: "var(--catchup)",
              background: "var(--catchup-bg)",
              borderRadius: 5,
              padding: "6px 8px",
              textWrap: "pretty",
            }}
          >
            <span aria-hidden style={{ fontWeight: 700 }}>
              🔥
            </span>
            <span>{lesson.reasonNotDone}</span>
          </div>
        </div>
      )}

      {menu && (
        <LessonContextMenu
          lesson={lesson}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onAction={(action, payload) => {
            // The status submenu carries an explicit target status; route
            // it through onToggleComplete so the completion state actually
            // updates, then still report the raw action (with its full
            // payload — day/week target for Move, etc.) to the host.
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

/** A labelled block inside the expanded card body. */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "var(--ink-400)",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}
