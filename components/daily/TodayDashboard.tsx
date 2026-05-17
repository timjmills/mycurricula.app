"use client";

// TodayDashboard.tsx — Right pane: Today summary when no lesson is selected.
//
// Shows the daily completion summary (progress bar + counts), today's daily
// notes, a read-only slice of today's to-dos, and two quick-glance stat
// cards. Matches the artboard's CPTodayDashboard layout.
//
// All data is derived from mock fixtures filtered to the `selectedDay` prop
// — never filtered to a hard-coded day index.

import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { SUBJECT_BY_ID, TODOS, TAGS } from "@/lib/mock";
import styles from "./DailyView.module.css";

// ── Completion checkbox (read-only display for to-dos) ───────────────────

function TodoCheck({ done }: { done: boolean }): ReactNode {
  if (done) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect width="14" height="14" rx="3.5" fill="var(--done)" />
        <path
          d="M3.5 7l2.5 2.5 4.5-4.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.6"
        y="0.6"
        width="12.8"
        height="12.8"
        rx="3"
        stroke="var(--ink-300)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// ── Props ────────────────────────────────────────────────────────────────

interface TodayDashboardProps {
  /** The day's lessons — already filtered to week + day by the parent. */
  dayLessons: Lesson[];
  /** Full day label, e.g. "Sunday". */
  dayLabel: string;
}

// ── Component ────────────────────────────────────────────────────────────

export function TodayDashboard({
  dayLessons,
  dayLabel,
}: TodayDashboardProps): ReactNode {
  const doneCount = dayLessons.filter((l) => l.status === "done").length;
  const total = dayLessons.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // To-dos due today — mock data is not day-scoped, so we show "today" bucket
  // regardless of which day tab is selected (realistic for a prototype).
  const todosToday = TODOS.filter((t) => t.due === "today");

  return (
    <div className={styles.dashRoot} role="region" aria-label="Today dashboard">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className={styles.dashHeader}>
        <div className={styles.dashEyebrow}>Today</div>
        <h2 className={styles.dashTitle}>{dayLabel}</h2>
        <div className={styles.dashSubtitle}>
          Week dashboard · {total} lessons planned
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className={styles.dashBody}>
        {/* Progress strip */}
        <div
          className={styles.progressWrap}
          role="status"
          aria-label={`${doneCount} of ${total} lessons done`}
        >
          <div className={styles.progressNumbers}>
            <span className={styles.progressCount}>{doneCount}</span>
            <span className={styles.progressOf}>of {total} done</span>
            <div style={{ flex: 1 }} />
            <span className={styles.progressPct}>{pct}%</span>
          </div>
          {/* Per-subject progress bar */}
          <div className={styles.progressBar} role="presentation">
            {dayLessons.map((l) => (
              <div
                key={l.id}
                className={`${styles.progressBarSegment} cp-subj ${l.subject}`}
                style={{
                  background:
                    l.status === "done"
                      ? "var(--c)"
                      : l.status === "partial"
                        ? "var(--cl)"
                        : "var(--ink-100)",
                }}
                title={SUBJECT_BY_ID[l.subject].name}
              />
            ))}
          </div>
          {/* Abbreviated subject labels under the bar */}
          <div className={styles.progressLabels} aria-hidden="true">
            {dayLessons.map((l) => (
              <div key={l.id} className={styles.progressLabel}>
                {SUBJECT_BY_ID[l.subject].name.slice(0, 3)}
              </div>
            ))}
          </div>
        </div>

        {/* Today's to-dos (read-only slice) */}
        <section
          aria-labelledby="dash-todos-label"
          style={{ marginBottom: 20 }}
        >
          <div className={styles.dashSectionHead}>
            <span id="dash-todos-label" className={styles.dashSectionLabel}>
              Today&apos;s to-dos · {todosToday.length}
            </span>
            <button
              className={styles.dashSectionAction}
              aria-label="Open full to-do list"
            >
              Open list →
            </button>
          </div>
          <div>
            {todosToday.slice(0, 6).map((t) => {
              const tagList = t.tags
                .map((id) => TAGS.find((tg) => tg.id === id))
                .filter(Boolean);
              return (
                <div key={t.id} className={styles.todoRow}>
                  <TodoCheck done={t.done} />
                  <span
                    className={`${styles.todoTitle} ${t.done ? styles.todoTitleDone : ""}`}
                  >
                    {t.title}
                  </span>
                  {/* Tag dots */}
                  <span
                    style={{ display: "inline-flex", gap: 3 }}
                    aria-hidden="true"
                  >
                    {tagList.map((tg) => (
                      <span
                        key={tg!.id}
                        className={styles.tagDot}
                        style={{ background: tg!.fg }}
                        title={tg!.label}
                      />
                    ))}
                  </span>
                  {t.scope === "team" && (
                    <span
                      style={{
                        fontSize: "var(--t-11)",
                        color: "var(--ink-400)",
                        background: "var(--ink-100)",
                        padding: "1px 5px",
                        borderRadius: 999,
                      }}
                    >
                      team
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <button className={styles.todoAddBtn} aria-label="Quick-add a to-do">
            + Quick-add a to-do…
          </button>
        </section>

        {/* Stats footer */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Carry-over</div>
            <div
              className={styles.statValue}
              style={{ color: "var(--catchup)" }}
            >
              {dayLessons.filter((l) => l.status === "carried").length}
            </div>
            <div className={styles.statSub}>from previous days</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Standards</div>
            <div
              className={styles.statValue}
              style={{ color: "var(--ink-700)" }}
            >
              {[...new Set(dayLessons.flatMap((l) => l.standards))].length}
            </div>
            <div className={styles.statSub}>addressed today</div>
          </div>
        </div>
      </div>
    </div>
  );
}
