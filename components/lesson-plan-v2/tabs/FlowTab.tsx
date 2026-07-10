"use client";

// FlowTab.tsx — the Lesson Plan panel's lesson-flow tab (W7, bundle B:8395-8399).
//
// Read-only. It renders the lesson's REAL sections from the planner store —
// `getSections(lessonId)` → LessonSectionContent[] — as numbered rows:
//
//     [1]  Warm-up            · 5 min
//     [2]  Direct instruction · 15 min
//
// Editing sections belongs to <LessonEditor>, not here; this tab is the
// at-a-glance shape of the period.
//
// Two things the bundle gets wrong and this file deliberately does not:
//
//   • The mockup hardcodes `[['Warm-up',5],['Direct instruction',15],…]`. Real
//     sections come from the store and a lesson commonly has NONE (most
//     fixtures don't) — so the empty state is the common case, not an edge.
//   • `lesson_sections.minutes` is NULLABLE. A row without minutes renders no
//     "· N min" suffix (never a dangling separator), and the TOTAL sums only
//     the sections that actually carry minutes. When some rows are untimed the
//     total says so, rather than quietly under-reporting the period length.
//
// Section headings are stored as rich-text HTML. They render here through
// `stripHtml` as plain text — the same round-trip contract the agenda navigator
// and the phase-title input use (lib/html-text.ts) — so a heading can never
// inject markup into this read-only list.

import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { stripHtml } from "@/lib/html-text";
import styles from "./tabs.module.css";

export interface FlowTabProps {
  lessonId: string;
}

export function FlowTab({ lessonId }: FlowTabProps): ReactNode {
  const { getLesson, getSections, subjectById } = usePlanner();
  const lesson = getLesson(lessonId);
  const sections = getSections(lessonId);

  if (!lesson) {
    return (
      <div className={styles.emptyTab}>This lesson is no longer available.</div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className={styles.emptyTab}>
        No lesson flow yet. Open the lesson editor to add sections — a warm-up,
        a main task, a close.
      </div>
    );
  }

  const timed = sections.filter(
    (s) => typeof s.minutes === "number" && Number.isFinite(s.minutes),
  );
  const totalMinutes = timed.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const untimedCount = sections.length - timed.length;

  return (
    // `cp-subj <cls>` carries the subject's --c / --cd custom properties so the
    // step numerals take the lesson's hue without depending on host chrome.
    <div
      className={`cp-subj ${subjectById[lesson.subject]?.cls ?? ""} ${styles.tab}`}
    >
      <section className={styles.card}>
        <h3 className={styles.cardLabel}>Lesson flow</h3>
        <ol className={styles.flowList}>
          {sections.map((section, i) => {
            const heading = stripHtml(section.heading ?? "");
            const minutes = section.minutes;
            return (
              <li key={section.id} className={styles.flowRow}>
                <span className={styles.flowNum} aria-hidden="true">
                  {i + 1}
                </span>
                <span
                  className={`${styles.flowHeading} ${
                    heading ? "" : styles.flowUntitled
                  }`}
                >
                  {heading || "Untitled section"}
                </span>
                {typeof minutes === "number" && Number.isFinite(minutes) && (
                  <span className={styles.flowMin}>{minutes} min</span>
                )}
              </li>
            );
          })}
        </ol>

        {/* A total is only meaningful over the sections that carry minutes. */}
        {timed.length > 0 && (
          <p className={styles.flowTotal}>
            <span>Total {totalMinutes} min</span>
            {untimedCount > 0 && (
              <span className={styles.flowTotalNote}>
                {untimedCount === 1
                  ? "1 section has no time set"
                  : `${untimedCount} sections have no time set`}
              </span>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
