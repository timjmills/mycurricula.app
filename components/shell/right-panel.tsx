"use client";

// right-panel.tsx — contextual right side panel for the planner shell.
// One job at a time, in priority order:
//   1. todoPanelOpen  → To-do slide-out (TODOS grouped by scope)
//   2. commentsPanelOpen → Comments browser (lessons with commentCount > 0)
//   3. selectedLessonId set → Lesson detail
//   4. else → null (panel closed)
//
// CSS Modules in right-panel.module.css.
// All colors and sizing come from CSS custom properties (tokens.css).

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import {
  TODOS,
  TAG_BY_ID,
  LESSONS,
  LESSON_BY_ID,
  SUBJECT_BY_ID,
  describeStandard,
} from "@/lib/mock";
import type { LessonStatus } from "@/lib/types";
import styles from "./right-panel.module.css";

// ── Status display helpers ───────────────────────────────────────────────────

const STATUS_LABELS: Record<LessonStatus, string> = {
  not_done: "Not done",
  done: "Done",
  carried: "Carried over",
  skipped: "Skipped",
  partial: "Partial",
};

// Background / foreground for the status badge — matches semantic colors from
// tokens.css without hard-coding hex values.
const STATUS_COLORS: Record<LessonStatus, { bg: string; fg: string }> = {
  not_done: {
    bg: "var(--ink-100)",
    fg: "var(--ink-500)",
  },
  done: {
    bg: "color-mix(in oklch, var(--done) 16%, white)",
    fg: "var(--done)",
  },
  partial: {
    bg: "color-mix(in oklch, var(--fyi) 14%, white)",
    fg: "var(--fyi)",
  },
  carried: {
    bg: "var(--catchup-bg)",
    fg: "var(--catchup)",
  },
  skipped: {
    bg: "var(--ink-100)",
    fg: "var(--ink-400)",
  },
};

// ── Due date label helper ────────────────────────────────────────────────────

function dueLabel(due: string | null): string | null {
  if (!due) return null;
  const map: Record<string, string> = {
    today: "Today",
    tomorrow: "Tomorrow",
    thisweek: "This week",
    thismonth: "This month",
  };
  return map[due] ?? due;
}

// ── Close button SVG ─────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 2L12 12M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Check mark SVG ───────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
      <path
        d="M1.5 4.5L3.8 7L7.5 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TO-DO PANEL
// ════════════════════════════════════════════════════════════════════════════

// The to-do panel groups items by scope (personal vs. team) and renders each
// with a done checkbox and tag pills.

function TodoPanel(): ReactNode {
  const { toggleTodoPanel } = useAppState();

  const personal = TODOS.filter((t) => t.scope === "personal");
  const team = TODOS.filter((t) => t.scope === "team");

  // Counts for the scope tabs — undone items only (what needs attention).
  const personalOpen = personal.filter((t) => !t.done).length;
  const teamOpen = team.filter((t) => !t.done).length;

  function renderGroup(
    label: string,
    items: typeof TODOS,
    count: number,
  ): ReactNode {
    return (
      <>
        <div className={styles.todoGroup} role="rowgroup">
          <span>{label}</span>
          <span className={styles.todoGroupCount}>{count} open</span>
        </div>
        {items.map((todo) => {
          const due = dueLabel(todo.due);
          return (
            <div
              key={todo.id}
              className={
                todo.due === "today" && !todo.done
                  ? `${styles.todoRow} ${styles.todoRowOverdue}`
                  : styles.todoRow
              }
            >
              {/* Done checkbox — purely visual state in the prototype; a real
                  implementation would call a mutation. */}
              <span className={styles.checkSlot}>
                <span
                  role="checkbox"
                  aria-checked={todo.done}
                  tabIndex={0}
                  aria-label={`Mark "${todo.title}" as ${todo.done ? "not done" : "done"}`}
                  className={
                    todo.done
                      ? `${styles.todoCheck} ${styles.todoCheckDone}`
                      : styles.todoCheck
                  }
                >
                  {todo.done && <CheckIcon />}
                </span>
              </span>

              {/* Title + meta row */}
              <div className={styles.todoContent}>
                <p
                  className={
                    todo.done
                      ? `${styles.todoTitle} ${styles.todoTitleDone}`
                      : styles.todoTitle
                  }
                >
                  {todo.title}
                </p>
                <div className={styles.todoMeta}>
                  {due && <span className={styles.todoScopeKind}>{due}</span>}
                  {todo.tags.map((tagId) => {
                    const tag = TAG_BY_ID[tagId];
                    if (!tag) return null;
                    return (
                      <span
                        key={tagId}
                        className={styles.tagPill}
                        style={{ background: tag.bg, color: tag.fg }}
                      >
                        <span
                          aria-hidden
                          className={styles.tagDot}
                          style={{ background: tag.fg }}
                        />
                        {tag.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div
      className={`cp-root ${styles.panel}`}
      role="complementary"
      aria-label="To-do list"
    >
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>To-do</h2>
        <button
          type="button"
          className={`cp-focusable ${styles.closeBtn}`}
          onClick={toggleTodoPanel}
          aria-label="Close to-do panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Scope tabs */}
      <div className={styles.todoTabs} role="tablist">
        <span
          className={`${styles.todoTab} ${styles.todoTabActive}`}
          role="tab"
          aria-selected="true"
        >
          Personal
          <span
            className={`${styles.todoTabCount} ${styles.todoTabCountActive}`}
          >
            {personalOpen}
          </span>
        </span>
        <span className={styles.todoTab} role="tab" aria-selected="false">
          Team
          <span className={styles.todoTabCount}>{teamOpen}</span>
        </span>
      </div>

      {/* Scrollable list */}
      <div className={styles.body} role="table" aria-label="Personal to-dos">
        {personal.length > 0 ? (
          renderGroup("Personal", personal, personalOpen)
        ) : (
          <p className={styles.emptyState}>No personal to-dos yet.</p>
        )}
        {team.length > 0 && (
          <div role="rowgroup">{renderGroup("Team", team, teamOpen)}</div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMMENTS PANEL
// ════════════════════════════════════════════════════════════════════════════

// Lists every lesson that has at least one comment. Shows title, subject name,
// total comment count, and an unread badge when there are unread comments.

function CommentsPanel(): ReactNode {
  const { toggleCommentsPanel } = useAppState();

  const withComments = LESSONS.filter((l) => l.commentCount > 0);

  return (
    <div
      className={`cp-root ${styles.panel}`}
      role="complementary"
      aria-label="Comments"
    >
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>Comments</h2>
        <button
          type="button"
          className={`cp-focusable ${styles.closeBtn}`}
          onClick={toggleCommentsPanel}
          aria-label="Close comments panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* List */}
      <div className={styles.body}>
        {withComments.length === 0 ? (
          <p className={styles.emptyState}>No comments yet.</p>
        ) : (
          withComments.map((lesson) => {
            const subj = SUBJECT_BY_ID[lesson.subject];
            return (
              <div key={lesson.id} className={styles.commentRow}>
                {/* Subject color dot — scoped so --c resolves via cp-subj. */}
                <span
                  className={`cp-subj ${subj.cls}`}
                  aria-hidden
                  style={{ display: "contents" }}
                >
                  <span
                    className={styles.commentSubjectDot}
                    style={{ background: "var(--c)" }}
                  />
                </span>

                <div className={styles.commentContent}>
                  <p className={styles.commentTitle}>{lesson.title}</p>
                  <p className={styles.commentSubjectName}>{subj.name}</p>
                  <div className={styles.commentCounts}>
                    <span className={styles.commentTotal}>
                      {lesson.commentCount}{" "}
                      {lesson.commentCount === 1 ? "comment" : "comments"}
                    </span>
                    {lesson.unreadComments > 0 && (
                      <span
                        className={styles.commentUnreadBadge}
                        aria-label={`${lesson.unreadComments} unread`}
                      >
                        {lesson.unreadComments} new
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LESSON DETAIL PANEL
// ════════════════════════════════════════════════════════════════════════════

// Shows the full detail for a single lesson: objective, directions, notes,
// resources, standards, and completion status. The subject-color stripe at
// the top anchors visual identity with the rest of the planner.

function LessonDetailPanel({ lessonId }: { lessonId: string }): ReactNode {
  const { setSelectedLessonId } = useAppState();
  const lesson = LESSON_BY_ID[lessonId];

  // Guard: lesson not found (stale id after mock updates).
  if (!lesson) {
    return (
      <div
        className={`cp-root ${styles.panel}`}
        role="complementary"
        aria-label="Lesson detail"
      >
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Lesson</h2>
          <button
            type="button"
            className={`cp-focusable ${styles.closeBtn}`}
            onClick={() => setSelectedLessonId(null)}
            aria-label="Close lesson detail"
          >
            <CloseIcon />
          </button>
        </div>
        <p className={styles.emptyState}>Lesson not found.</p>
      </div>
    );
  }

  const subj = SUBJECT_BY_ID[lesson.subject];
  const statusColors = STATUS_COLORS[lesson.status];

  return (
    <div
      className={`cp-root ${styles.panel}`}
      role="complementary"
      aria-label={`Lesson detail: ${lesson.title}`}
    >
      {/* Thin subject-color stripe at the very top */}
      <div
        className={`cp-subj ${subj.cls} ${styles.detailSubjectStripe}`}
        style={{ background: "var(--c)" }}
        aria-hidden
      />

      {/* Header — subject label + lesson title + close */}
      <div className={styles.header}>
        <h2 className={styles.headerTitle} title={lesson.title}>
          {lesson.title}
        </h2>
        <button
          type="button"
          className={`cp-focusable ${styles.closeBtn}`}
          onClick={() => setSelectedLessonId(null)}
          aria-label="Close lesson detail"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* Subject + objective */}
        <section className={styles.detailSection}>
          <p
            className={`cp-subj ${subj.cls} ${styles.detailSubjectLabel}`}
            style={{ color: "var(--c)" }}
          >
            {subj.name}
          </p>
          {lesson.objective && (
            <p className={styles.detailObjective}>{lesson.objective}</p>
          )}
        </section>

        {/* Directions */}
        {lesson.directions && (
          <section className={styles.detailSection}>
            <p className={styles.detailLabel}>Directions</p>
            <p className={styles.detailBody}>{lesson.directions}</p>
          </section>
        )}

        {/* Notes */}
        {lesson.notes && (
          <section className={styles.detailSection}>
            <p className={styles.detailLabel}>Notes</p>
            <p className={styles.detailNoteBody}>{lesson.notes}</p>
          </section>
        )}

        {/* Resources */}
        {lesson.resources.length > 0 && (
          <section className={styles.detailSection}>
            <p className={styles.detailLabel}>Resources</p>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {lesson.resources.map((res, i) => (
                <li key={`${res.type}-${i}`}>
                  <span className={styles.detailResource}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        fontSize: "var(--t-10, var(--t-11))",
                        color: "var(--ink-400)",
                        textTransform: "uppercase",
                        letterSpacing: "0.4px",
                        fontWeight: 600,
                        width: 42,
                      }}
                    >
                      {res.type}
                    </span>
                    <span className={styles.detailResourceLabel}>
                      {res.label}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Standards */}
        {lesson.standards.length > 0 && (
          <section className={styles.detailSection}>
            <p className={styles.detailLabel}>Standards</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lesson.standards.map((code) => (
                <div key={code} className={styles.detailStdRow}>
                  <span
                    className={`cp-mono cp-subj ${subj.cls} ${styles.detailStdCode}`}
                    style={{
                      background: "var(--cl)",
                      color: "var(--cd)",
                    }}
                  >
                    {code}
                  </span>
                  <span className={styles.detailStdDesc}>
                    {describeStandard(code)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Status */}
        <div className={styles.statusRow}>
          <span className={styles.detailLabel} style={{ margin: 0 }}>
            Status
          </span>
          <span
            className={styles.statusBadge}
            style={{
              background: statusColors.bg,
              color: statusColors.fg,
            }}
          >
            {STATUS_LABELS[lesson.status]}
          </span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ════════════════════════════════════════════════════════════════════════════

export function RightPanel(): ReactNode {
  const { todoPanelOpen, commentsPanelOpen, selectedLessonId } = useAppState();

  // Priority: to-do > comments > lesson detail > null.
  if (todoPanelOpen) return <TodoPanel />;
  if (commentsPanelOpen) return <CommentsPanel />;
  if (selectedLessonId)
    return <LessonDetailPanel lessonId={selectedLessonId} />;
  return null;
}
