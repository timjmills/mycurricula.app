"use client";

// DailyView.tsx — the Daily view: two-pane lesson list + right-pane detail.
//
// Layout:
//   top chrome → day selector tabs + daily notes banner
//   body row   → left pane (lesson list) | right pane (lesson detail OR dashboard)
//
// Left pane: filtered day lessons — each row has a subject-color stripe,
//   subject label, lesson title, and completion checkbox. Clicking selects.
//   Below the list: "Today's Events" section with a non-functional "+ Add"
//   affordance (Phase 1A stub per spec §5.3).
//
// Right pane (one job at a time, never mixed):
//   • lesson selected  → <LessonDetail>
//   • nothing selected → <TodayDashboard>
//
// Default selection: first lesson whose status !== "done"; none → dashboard.
//
// selectedDay state is shared planner state (useAppState). Internal selected-
// lesson state is local to this component — never written to global
// selectedLessonId (per task brief: Daily has its own right pane).

import { useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Lesson, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import {
  LESSONS,
  SUBJECT_BY_ID,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
  notesForDay,
} from "@/lib/mock";
import { LessonDetail } from "./LessonDetail";
import { TodayDashboard } from "./TodayDashboard";
import styles from "./DailyView.module.css";

// ── Completion checkbox — small inline svg, status-aware ─────────────────

function LessonCheckbox({ status }: { status: LessonStatus }): ReactNode {
  const size = 14;
  if (status === "done") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-label="Done"
        aria-hidden="true"
        focusable="false"
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
  if (status === "partial") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-label="Partial"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          width="14"
          height="14"
          rx="3.5"
          fill="var(--important-bg)"
          stroke="var(--important)"
          strokeWidth="1.2"
        />
        <rect
          x="3.5"
          y="6"
          width="7"
          height="2"
          rx="1"
          fill="var(--important)"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-label="Not done"
      aria-hidden="true"
      focusable="false"
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

// ── Lesson row in the left pane ──────────────────────────────────────────
// A dedicated component keeps the subject-color hook call at a stable
// position — the same pattern used by WeeklyGrid's SubjectRow.

interface LessonRowProps {
  lesson: Lesson;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
}

function LessonRow({
  lesson,
  selected,
  onSelect,
  onToggleComplete,
}: LessonRowProps): ReactNode {
  const subj = SUBJECT_BY_ID[lesson.subject];

  function handleCheckClick(e: React.MouseEvent): void {
    e.stopPropagation(); // don't also select the lesson on checkbox click
    const next: LessonStatus =
      lesson.status === "not_done"
        ? "done"
        : lesson.status === "done"
          ? "partial"
          : "not_done";
    onToggleComplete(lesson.id, next);
  }

  return (
    <button
      className={`${styles.lessonRow} ${selected ? styles.lessonRowSelected : ""} cp-subj ${lesson.subject}`}
      onClick={() => onSelect(lesson.id)}
      aria-pressed={selected}
      aria-label={`${subj.name}: ${lesson.title}, ${lesson.status}`}
    >
      {/* 3px subject-color left stripe */}
      <span className={styles.lessonStripe} aria-hidden="true" />

      {/* Completion checkbox — click handled separately */}
      <span
        role="checkbox"
        aria-checked={lesson.status === "done"}
        aria-label={`Mark ${lesson.title} done`}
        tabIndex={-1}
        onClick={handleCheckClick}
        style={{ flexShrink: 0, display: "inline-flex" }}
      >
        <LessonCheckbox status={lesson.status} />
      </span>

      {/* Subject label + lesson title */}
      <div className={styles.lessonRowContent}>
        <div className={styles.lessonSubjectLabel}>{subj.name}</div>
        <div
          className={`${styles.lessonTitle} ${lesson.status === "done" ? styles.lessonTitleDone : ""}`}
        >
          {lesson.title}
        </div>
      </div>

      {/* Personal fork indicator */}
      {lesson.isPersonal && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: lesson.pendingMaster
              ? "var(--important)"
              : "var(--c, var(--ink-400))",
            flexShrink: 0,
          }}
          title={
            lesson.pendingMaster ? "Pending push to Master" : "Personal copy"
          }
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ── Daily Notes banner ───────────────────────────────────────────────────
// Rendered above the two-pane body; hidden if the day has no notes.

interface NotesBannerProps {
  day: number;
}

function NotesBanner({ day }: NotesBannerProps): ReactNode {
  const notes = notesForDay(day);
  if (notes.length === 0) return null;

  return (
    <div className={styles.notesBanner} role="region" aria-label="Daily notes">
      {notes.map((n, i) => (
        <div
          key={i}
          className={`${styles.noteItem} ${n.priority === "urgent" ? "cp-pulse" : ""}`}
          data-priority={n.priority}
          role="alert"
          aria-live={n.priority === "urgent" ? "assertive" : "polite"}
        >
          <span
            className={styles.noteItemBody}
            style={{ fontStyle: n.scope === "personal" ? "italic" : "normal" }}
          >
            {n.body}
          </span>
          <span className={styles.noteItemScope}>
            {n.scope === "shared" ? "team" : "mine"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Day selector tabs ─────────────────────────────────────────────────────
// Tabs across the top let the teacher switch which day they are viewing.
// We show a row of colored dots beneath each tab to surface how many notes
// each day has (coloring by priority).

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  fyi: "var(--fyi)",
};

interface DayBarProps {
  selectedDay: number;
  onSelect: (d: number) => void;
}

function DayBar({ selectedDay, onSelect }: DayBarProps): ReactNode {
  return (
    <div className={styles.dayBar} role="tablist" aria-label="Day selector">
      {WEEK_DAYS.map((day, i) => {
        const dayNotes = notesForDay(i);
        const isActive = i === selectedDay;
        return (
          <button
            key={day}
            role="tab"
            aria-selected={isActive}
            aria-controls="daily-pane-body"
            className={`${styles.dayBtn} ${isActive ? styles.dayBtnActive : ""}`}
            onClick={() => onSelect(i)}
          >
            <span>{WEEK_DAYS_SHORT[i]}</span>
            {/* Priority dot row — visual indicator for notes on that day */}
            {dayNotes.length > 0 && (
              <span className={styles.dayBtnDotWrap} aria-hidden="true">
                {dayNotes.slice(0, 3).map((n, j) => (
                  <span
                    key={j}
                    className={styles.dayBtnDot}
                    style={{ background: PRIORITY_COLORS[n.priority] }}
                  />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── DailyView ────────────────────────────────────────────────────────────

export function DailyView(): ReactNode {
  // selectedDay is shared planner state — the top bar may also change it.
  const { week, selectedDay, setSelectedDay } = useAppState();

  // All lessons live in local state so completion toggles don't mutate the
  // imported fixture — the same pattern used by WeeklyGrid.
  const [lessons, setLessons] = useState<Lesson[]>(() => [...LESSONS]);

  // Daily view manages its own selected-lesson state (per task brief).
  // Default: first not-yet-done lesson; null → show dashboard.
  const dayLessons = useMemo(
    () => lessons.filter((l) => l.week === week && l.day === selectedDay),
    [lessons, week, selectedDay],
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = LESSONS.find(
      (l) => l.week === week && l.day === selectedDay && l.status !== "done",
    );
    return first?.id ?? null;
  });

  // When the day changes, default-select the first not-done lesson (or null).
  function handleDayChange(d: number): void {
    setSelectedDay(d);
    const first = lessons.find(
      (l) => l.week === week && l.day === d && l.status !== "done",
    );
    setSelectedId(first?.id ?? null);
  }

  const handleToggleComplete = useCallback(
    (lessonId: string, nextStatus: LessonStatus): void => {
      setLessons((prev) =>
        prev.map((l) => (l.id === lessonId ? { ...l, status: nextStatus } : l)),
      );
    },
    [],
  );

  // The selected lesson, resolved from the current lesson state so
  // completion toggles are immediately reflected in the right pane.
  const selectedLesson = selectedId
    ? (lessons.find((l) => l.id === selectedId) ?? null)
    : null;

  const doneCount = dayLessons.filter((l) => l.status === "done").length;

  return (
    <div className={styles.page}>
      {/* ── Top chrome: day selector + notes banner ──────────────── */}
      <DayBar selectedDay={selectedDay} onSelect={handleDayChange} />
      <NotesBanner day={selectedDay} />

      {/* ── Two-pane body ─────────────────────────────────────────── */}
      <div id="daily-pane-body" className={styles.body} role="tabpanel">
        {/* ── Left pane: lesson list ─────────────────────────────── */}
        <div className={styles.leftPane}>
          {/* Day name + done count */}
          <div className={styles.leftPaneHead}>
            <div className={styles.leftPaneDay}>{WEEK_DAYS[selectedDay]}</div>
            <div className={styles.leftPaneDate}>Week {week}</div>
            <div className={styles.leftPaneMeta}>
              {doneCount} of {dayLessons.length} done
            </div>
          </div>

          {/* Scrollable lesson list */}
          <div
            className={styles.leftScroll}
            role="list"
            aria-label="Today's lessons"
          >
            {dayLessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                selected={selectedId === lesson.id}
                onSelect={setSelectedId}
                onToggleComplete={handleToggleComplete}
              />
            ))}

            {dayLessons.length === 0 && (
              <div
                style={{
                  padding: "24px 12px",
                  textAlign: "center",
                  color: "var(--ink-400)",
                  fontSize: "var(--t-13)",
                }}
                role="status"
              >
                No lessons planned for {WEEK_DAYS[selectedDay]}.
              </div>
            )}

            {/* Dashboard selector button — appears below the lesson list */}
            <button
              className={`${styles.dashboardBtn} ${!selectedId ? styles.dashboardBtnActive : ""}`}
              onClick={() => setSelectedId(null)}
              aria-pressed={!selectedId}
              aria-label="Show today dashboard"
            >
              {/* Grid/dashboard icon */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="0.75"
                  y="0.75"
                  width="4.5"
                  height="4.5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="6.75"
                  y="0.75"
                  width="4.5"
                  height="4.5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="0.75"
                  y="6.75"
                  width="4.5"
                  height="4.5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="6.75"
                  y="6.75"
                  width="4.5"
                  height="4.5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              Today dashboard
            </button>

            {/* Today's Events section */}
            <div className={styles.eventsSection}>
              <div className={styles.eventsSectionHead}>
                <span className={styles.eventsSectionLabel}>
                  Today&apos;s Events
                </span>
              </div>
              {/* Stub add-event affordance — non-functional in Phase 1A */}
              <button
                className={styles.addEventBtn}
                aria-label="Add an event"
                disabled
              >
                {/* Plus icon */}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5.5 1v9M1 5.5h9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Add an event
              </button>
            </div>
          </div>
        </div>

        {/* ── Right pane: detail OR dashboard ──────────────────────── */}
        <div className={styles.rightPane}>
          {selectedLesson ? (
            <LessonDetail
              lesson={selectedLesson}
              onToggleComplete={handleToggleComplete}
            />
          ) : (
            <TodayDashboard
              dayLessons={dayLessons}
              dayLabel={WEEK_DAYS[selectedDay]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
