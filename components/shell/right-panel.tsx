"use client";

// right-panel.tsx — contextual right side panel for the planner shell.
// One job at a time, in priority order:
//   1. todoPanelOpen  → To-do slide-out (TODOS grouped by scope)
//   2. commentsPanelOpen → Shoutbox panel (team chat + comment index)
//   3. selectedLessonId set → Lesson detail
//   4. else → null (panel closed)
//
// ── Shoutbox panel — user-direction 2026-05-27 ────────────────────────────
// The previous "Comments" panel has been renamed and expanded into the
// Shoutbox: a tabbed surface that subsumes BOTH team chat AND the per-
// lesson/per-unit comment index. The four tabs are
//   • Team chat       — quick messages between teachers (placeholder copy
//                       until the realtime backend lands; the existing Day
//                       Shoutbox on /daily is the day-scoped counterpart).
//   • Lesson comments — the original list: lessons that have at least one
//                       comment, with author/recent-line previews.
//   • Unit comments   — comments scoped to a unit (placeholder — no unit
//                       comments exist in the mock yet, but the surface is
//                       wired so the model can drop in).
//   • All comments    — the aggregation index: every comment grouped first
//                       by Subject → Unit → Lesson, with a Jump-to link.
//
// Option (b) from the brief (tabs inside the Shoutbox) was chosen over a
// new global-rail icon to keep the rail's icon count steady — adding a
// fifth icon ("All comments") would have crowded the rail and forced an
// awkward icon vocabulary. Tabs inside one drawer = one entry point, four
// adjacent surfaces. The unread badge on the rail/top-bar trigger remains
// a single number summing across surfaces.
//
// CSS Modules in right-panel.module.css.
// All colors and sizing come from CSS custom properties (tokens.css).

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { usePathname, useRouter } from "next/navigation";
import { TODOS, TAG_BY_ID, LESSONS, LESSON_BY_ID } from "@/lib/mock";
import type { LessonStatus, Subject, SubjectId, Unit } from "@/lib/types";
import { Tooltip } from "@/components/ui";
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

type TodoScope = "personal" | "team";

function TodoPanel(): ReactNode {
  const { toggleTodoPanel } = useAppState();
  // Active scope tab — "personal" or "team".
  const [activeScope, setActiveScope] = useState<TodoScope>("personal");

  const personal = TODOS.filter((t) => t.scope === "personal");
  const team = TODOS.filter((t) => t.scope === "team");

  // Counts for the scope tabs — undone items only (what needs attention).
  const personalOpen = personal.filter((t) => !t.done).length;
  const teamOpen = team.filter((t) => !t.done).length;

  // Items to display in the scrollable list.
  const visibleItems = activeScope === "personal" ? personal : team;
  const visibleOpen = activeScope === "personal" ? personalOpen : teamOpen;
  const emptyMessage =
    activeScope === "personal"
      ? "No personal to-dos yet."
      : "No team to-dos yet.";

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
              {/* Done checkbox — real <button> so it is keyboard-operable.
                  Purely visual state in the prototype; a real implementation
                  would call a mutation here. */}
              <span className={styles.checkSlot}>
                <button
                  type="button"
                  aria-pressed={todo.done}
                  aria-label={`Mark "${todo.title}" as ${todo.done ? "not done" : "done"}`}
                  className={
                    todo.done
                      ? `${styles.todoCheck} ${styles.todoCheckDone}`
                      : styles.todoCheck
                  }
                >
                  {todo.done && <CheckIcon />}
                </button>
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

      {/* Scope tabs — real buttons so both tabs are keyboard-operable. */}
      <div className={styles.todoTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeScope === "personal"}
          className={
            activeScope === "personal"
              ? `${styles.todoTab} ${styles.todoTabActive}`
              : styles.todoTab
          }
          onClick={() => setActiveScope("personal")}
        >
          Personal
          <span
            className={
              activeScope === "personal"
                ? `${styles.todoTabCount} ${styles.todoTabCountActive}`
                : styles.todoTabCount
            }
          >
            {personalOpen}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeScope === "team"}
          className={
            activeScope === "team"
              ? `${styles.todoTab} ${styles.todoTabActive}`
              : styles.todoTab
          }
          onClick={() => setActiveScope("team")}
        >
          Team
          <span
            className={
              activeScope === "team"
                ? `${styles.todoTabCount} ${styles.todoTabCountActive}`
                : styles.todoTabCount
            }
          >
            {teamOpen}
          </span>
        </button>
      </div>

      {/* Scrollable list — shows only the active scope's items. */}
      <div
        className={styles.body}
        role="table"
        aria-label={`${activeScope === "personal" ? "Personal" : "Team"} to-dos`}
      >
        {visibleItems.length > 0 ? (
          renderGroup(
            activeScope === "personal" ? "Personal" : "Team",
            visibleItems,
            visibleOpen,
          )
        ) : (
          <p className={styles.emptyState}>{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SHOUTBOX PANEL (formerly the Comments panel)
// ════════════════════════════════════════════════════════════════════════════

// Tabbed surface — four tabs (Team chat / Lesson comments / Unit comments /
// All comments). See file header for the option-(b) reasoning. The panel is
// triggered by useAppState().commentsPanelOpen — the internal state name is
// preserved per the rename brief; only USER-VISIBLE labels carry "Shoutbox".

type ShoutboxTabId = "team" | "lesson" | "unit" | "all";

const SHOUTBOX_TABS: ReadonlyArray<{
  id: ShoutboxTabId;
  label: string;
  tooltip: string;
}> = [
  {
    id: "team",
    label: "Team chat",
    tooltip:
      "Team chat — quick messages between teachers covering the same lessons and units. The day-scoped Today's Shoutbox on the Daily view is the per-day counterpart.",
  },
  {
    id: "lesson",
    label: "Lesson Comments",
    tooltip:
      "Lesson Comments — comments your teammates have left on specific lessons. Click a row to jump to that lesson.",
  },
  {
    id: "unit",
    label: "Unit Comments",
    tooltip:
      "Unit Comments — comments left on whole units (a chapter's worth of lessons). Use these for unit-wide observations like pacing or assessment notes.",
  },
  {
    id: "all",
    label: "All comments",
    tooltip:
      "Every comment across the curriculum, grouped by Subject → Unit → Lesson. Use this when you want to scan the whole conversation at once.",
  },
];

// Internal record for an aggregated comment row. Built from the existing
// commentCount/unreadComments scalars on each lesson — when the real
// per-comment author/text model lands this is the shape that view rows
// will consume directly. Keeping the synthesis inline (vs. inventing fake
// authors/timestamps) makes the seam easy to spot at backend swap-in time.
interface CommentRow {
  lessonId: string;
  lessonTitle: string;
  subjectId: string;
  unitId: string;
  count: number;
  unread: number;
}

function CommentsPanel(): ReactNode {
  const { toggleCommentsPanel, setSelectedLessonId } = useAppState();
  // Subject / unit labels now come from the planner catalog (catalog
  // migration). Flag OFF these mirror the mock SUBJECT_BY_ID / UNIT_BY_ID
  // byte-identically; flag ON they resolve the hydrated grade's (uuid-keyed)
  // subjects and units — the key fix for the All-comments unit headers.
  const { subjectById, unitById } = usePlanner();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ShoutboxTabId>("team");

  // ── All lesson-scoped comments — flat aggregation ────────────────────
  // `lib/planner-store.tsx` only exposes scalar counts (commentCount /
  // unreadComments) per lesson today; the per-comment author/text shape
  // arrives with the backend. The aggregation we can produce now is
  // therefore one row per lesson-that-has-comments, not one row per
  // individual comment. The "All comments" tab groups those rows by
  // Subject → Unit → Lesson per the brief.
  const lessonComments = useMemo<CommentRow[]>(
    () =>
      LESSONS.filter((l) => l.commentCount > 0).map((l) => ({
        lessonId: l.id,
        lessonTitle: l.title,
        subjectId: l.subject,
        unitId: l.unit,
        count: l.commentCount,
        unread: l.unreadComments,
      })),
    [],
  );

  // ── Group lesson rows for the "All comments" tab ─────────────────────
  // Subject → Unit → list-of-lesson-rows. A Map preserves the natural
  // first-encounter ordering of the LESSONS fixture, which is grouped
  // sensibly enough for the index without a stable sort key.
  const groupedAll = useMemo(() => {
    const bySubject = new Map<string, Map<string, CommentRow[]>>();
    for (const row of lessonComments) {
      let byUnit = bySubject.get(row.subjectId);
      if (!byUnit) {
        byUnit = new Map();
        bySubject.set(row.subjectId, byUnit);
      }
      const rows = byUnit.get(row.unitId) ?? [];
      rows.push(row);
      byUnit.set(row.unitId, rows);
    }
    return bySubject;
  }, [lessonComments]);

  // Click a comment row → open the lesson detail in the right panel. The
  // panel itself flips from comments view to lesson-detail view because of
  // the priority order at the bottom of this file: setting selectedLessonId
  // while keeping commentsPanelOpen=true still resolves to LessonDetailPanel
  // (LessonDetail wins over the comments tab when both are set), and the
  // teacher can return via the Daily Resources panel or by reopening the
  // Shoutbox icon. NOTE: routes are not changed — the lesson surfaces in
  // the same right-rail drawer.
  function jumpToLesson(lessonId: string): void {
    setSelectedLessonId(lessonId);
  }

  function jumpToUnit(subjectId: string): void {
    // Subject pages show the unit lanes; jumping there is the closest
    // analogue to "open this unit" until the dedicated /unit route lands.
    router.push(`/subject/${subjectId}`);
    toggleCommentsPanel();
  }

  return (
    <div
      className={`cp-root ${styles.panel}`}
      role="complementary"
      aria-label="Team Shoutbox"
    >
      {/* Header */}
      <div className={styles.header}>
        <Tooltip
          content="The Team Shoutbox — quick messages between teachers plus the index of every Lesson and Unit Comment across the curriculum. The day-scoped Today's Shoutbox on the Daily view is the per-day counterpart."
          side="bottom"
        >
          <h2 className={styles.headerTitle} tabIndex={0}>
            Team Shoutbox
          </h2>
        </Tooltip>
        <button
          type="button"
          className={`cp-focusable ${styles.closeBtn}`}
          onClick={toggleCommentsPanel}
          aria-label="Close Team Shoutbox panel"
          title="Close the Team Shoutbox panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Tabs row — reuses the .todoTabs / .todoTab vocabulary so the visual
          treatment matches the To-do panel above. */}
      <div
        className={styles.todoTabs}
        role="tablist"
        aria-label="Team Shoutbox sections"
      >
        {SHOUTBOX_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Tooltip key={tab.id} content={tab.tooltip} side="bottom">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={
                  isActive
                    ? `${styles.todoTab} ${styles.todoTabActive}`
                    : styles.todoTab
                }
                onClick={() => setActiveTab(tab.id)}
                title={tab.tooltip}
              >
                {tab.label}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Body — one panel at a time, content shaped by activeTab. */}
      <div className={styles.body}>
        {activeTab === "team" && <TeamChatTab />}
        {activeTab === "lesson" && (
          <LessonCommentsTab
            rows={lessonComments}
            onJump={jumpToLesson}
            subjectById={subjectById}
          />
        )}
        {activeTab === "unit" && <UnitCommentsTab />}
        {activeTab === "all" && (
          <AllCommentsTab
            grouped={groupedAll}
            onJumpLesson={jumpToLesson}
            onJumpUnit={jumpToUnit}
            subjectById={subjectById}
            unitById={unitById}
          />
        )}
      </div>
    </div>
  );
}

// ── Team chat tab — placeholder for the realtime backend ─────────────────
// The Day Shoutbox on /daily is the per-day counterpart. The global Team
// Shoutbox is a Phase 1B feature — until the backend lands the tab carries
// onboarding-voice copy explaining where teachers can chat today.

function TeamChatTab(): ReactNode {
  return (
    <div
      style={{
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <p
        className={styles.emptyState}
        style={{ padding: 0, textAlign: "left" }}
      >
        Team chat is the team-wide, always-on conversation. Use it for quick
        messages between teachers covering the same lessons and units.
      </p>
      <p
        className={styles.emptyState}
        style={{ padding: 0, textAlign: "left" }}
      >
        While the global team chat is still being built, head to{" "}
        <strong>Today&apos;s Shoutbox</strong> on the Daily view — it&apos;s the
        day-scoped version that&apos;s live today.
      </p>
    </div>
  );
}

// ── Lesson Comments tab ──────────────────────────────────────────────────
// The original Comments-panel list, relabelled. Each row shows the lesson
// title, subject, total comment count, and unread chip. Clicking jumps to
// the lesson detail view in the same right-panel drawer.

function LessonCommentsTab({
  rows,
  onJump,
  subjectById,
}: {
  rows: CommentRow[];
  onJump: (lessonId: string) => void;
  subjectById: Record<SubjectId, Subject>;
}): ReactNode {
  if (rows.length === 0) {
    return (
      <p className={styles.emptyState}>
        No Lesson Comments yet — teachers&apos; lesson comments will appear
        here.
      </p>
    );
  }
  return (
    <>
      {rows.map((row) => {
        const subj = subjectById[row.subjectId as SubjectId];
        if (!subj) return null;
        return (
          <Tooltip
            key={row.lessonId}
            content={`Jump to "${row.lessonTitle}" — opens the lesson detail in this panel.`}
            side="left"
          >
            <button
              type="button"
              className={styles.commentRow}
              onClick={() => onJump(row.lessonId)}
              aria-label={`Open ${row.lessonTitle} (${row.count} Lesson Comment${row.count === 1 ? "" : "s"})`}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {/* Subject color dot */}
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
                <p className={styles.commentTitle}>{row.lessonTitle}</p>
                <p className={styles.commentSubjectName}>{subj.name}</p>
                <div className={styles.commentCounts}>
                  <span className={styles.commentTotal}>
                    {row.count} Lesson Comment{row.count === 1 ? "" : "s"}
                  </span>
                  {row.unread > 0 && (
                    <span
                      className={styles.commentUnreadBadge}
                      aria-label={`${row.unread} unread`}
                    >
                      {row.unread} new
                    </span>
                  )}
                </div>
              </div>
            </button>
          </Tooltip>
        );
      })}
    </>
  );
}

// ── Unit Comments tab — placeholder until the model lands ────────────────
// Unit-scoped comments aren't in the fixture yet; the data shape will
// arrive with the backend. The tab is still rendered so the surface and
// the language are in place when the model becomes available.

function UnitCommentsTab(): ReactNode {
  return (
    <p className={styles.emptyState}>
      No Unit Comments yet — when teachers leave comments on a whole unit (e.g.
      about pacing or assessment), they&apos;ll appear here grouped by subject.
    </p>
  );
}

// ── All comments aggregation tab ─────────────────────────────────────────
// Every comment row grouped by Subject → Unit → Lesson. Each lesson row
// carries a Jump button; each unit header is itself a button that opens
// the subject view (closest analogue to "see this unit" until /unit lands).

function AllCommentsTab({
  grouped,
  onJumpLesson,
  onJumpUnit,
  subjectById,
  unitById,
}: {
  grouped: Map<string, Map<string, CommentRow[]>>;
  onJumpLesson: (lessonId: string) => void;
  onJumpUnit: (subjectId: string) => void;
  subjectById: Record<SubjectId, Subject>;
  unitById: Record<string, Unit>;
}): ReactNode {
  if (grouped.size === 0) {
    return (
      <p className={styles.emptyState}>
        No comments yet — teachers&apos; lesson + unit comments will appear
        here.
      </p>
    );
  }

  return (
    <>
      {Array.from(grouped.entries()).map(([subjectId, byUnit]) => {
        const subj = subjectById[subjectId as SubjectId];
        if (!subj) return null;
        return (
          <section
            key={subjectId}
            aria-labelledby={`shoutbox-subj-${subjectId}`}
          >
            {/* Subject header — reuses the sticky group header from
                .todoGroup so visual rhythm matches the To-do panel above. */}
            <div
              className={styles.todoGroup}
              id={`shoutbox-subj-${subjectId}`}
              role="rowgroup"
            >
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
              <span>{subj.name}</span>
            </div>

            {Array.from(byUnit.entries()).map(([unitId, rows]) => {
              const unit = unitById[unitId];
              const unitTotal = rows.reduce((n, r) => n + r.count, 0);
              const unitUnread = rows.reduce((n, r) => n + r.unread, 0);
              return (
                <div key={unitId}>
                  {/* Unit row — a sub-group header. Click jumps to the
                      subject view (closest analogue). */}
                  <Tooltip
                    content={`Open ${subj.name} curriculum to see this unit in context.`}
                    side="left"
                  >
                    <button
                      type="button"
                      onClick={() => onJumpUnit(subjectId)}
                      aria-label={`Open ${unit?.name ?? unitId} (${unitTotal} comment${unitTotal === 1 ? "" : "s"} across ${rows.length} lesson${rows.length === 1 ? "" : "s"})`}
                      title={`Open ${subj.name} curriculum to see this unit`}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        cursor: "pointer",
                        padding: "8px 16px 6px 28px",
                        fontSize: "var(--t-11)",
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        borderBottom: "1px solid var(--ink-100)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span>{unit?.name ?? unitId}</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          color: "var(--ink-400)",
                          fontWeight: 500,
                        }}
                      >
                        {unitTotal} · {rows.length} lesson
                        {rows.length === 1 ? "" : "s"}
                        {unitUnread > 0 && (
                          <span
                            className={styles.commentUnreadBadge}
                            style={{ marginLeft: 6 }}
                            aria-label={`${unitUnread} unread`}
                          >
                            {unitUnread} new
                          </span>
                        )}
                      </span>
                    </button>
                  </Tooltip>

                  {/* Lesson rows under this unit */}
                  {rows.map((row) => (
                    <Tooltip
                      key={row.lessonId}
                      content={`Jump to "${row.lessonTitle}" — opens the lesson detail in this panel.`}
                      side="left"
                    >
                      <button
                        type="button"
                        className={styles.commentRow}
                        onClick={() => onJumpLesson(row.lessonId)}
                        aria-label={`Open ${row.lessonTitle} (${row.count} Lesson Comment${row.count === 1 ? "" : "s"})`}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          cursor: "pointer",
                          paddingLeft: 28,
                        }}
                      >
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
                          <p className={styles.commentTitle}>
                            {row.lessonTitle}
                          </p>
                          <div className={styles.commentCounts}>
                            <span className={styles.commentTotal}>
                              {row.count} Lesson Comment
                              {row.count === 1 ? "" : "s"}
                            </span>
                            {row.unread > 0 && (
                              <span
                                className={styles.commentUnreadBadge}
                                aria-label={`${row.unread} unread`}
                              >
                                {row.unread} new
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
    </>
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
  // Subject label + standard descriptions come from the planner catalog
  // (catalog migration). Flag OFF these mirror the mock SUBJECT_BY_ID /
  // describeStandard byte-identically; flag ON they track the hydrated grade.
  const { subjectById, describeStandard } = usePlanner();
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

  const subj = subjectById[lesson.subject];

  // Guard: subject not found in lookup (e.g. stale mock data).
  if (!subj) return null;

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
                        fontSize: "var(--t-10)",
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
  const pathname = usePathname();

  // ── /weekly gate (W3 carry-over fix) ───────────────────────────────────
  // On the Weekly view the <WeeklyRailDrawer> overlay is the canonical
  // surface for the to-do / Shoutbox / lesson-detail rail content — it
  // mounts on ≤1280px viewports via WeeklyShell. The shell-level
  // <RightPanel> reads the same `todoPanelOpen` / `commentsPanelOpen`
  // flags, so without this gate BOTH surfaces would mount when a rail
  // icon is clicked on Weekly at narrow widths (the shell pops a 320px
  // column AND the drawer slides in over it). Returning null here on
  // /weekly leaves the WeeklyRailDrawer as the single source for that
  // content; every other route keeps the shell panel unchanged.
  if (pathname?.startsWith("/weekly")) return null;

  // Priority: to-do > comments > lesson detail > null.
  if (todoPanelOpen) return <TodoPanel />;
  if (commentsPanelOpen) return <CommentsPanel />;
  if (selectedLessonId)
    return <LessonDetailPanel lessonId={selectedLessonId} />;
  return null;
}
