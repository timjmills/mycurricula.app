"use client";

// app/(planner)/weekly/print/page.tsx — BIG-3: printable weekly grid.
//
// A clean, one-page printable matrix of all lessons in the current week,
// organised as subjects (rows) × days (columns). No right rail, no top bar
// chrome, no shoutbox, no nav appear in the printed output.
//
// Layout group constraint: this page is inside the (planner) route group so
// it receives the TopBar, MasterBanner, LeftFilterPanel, and RightPanel shell
// wrappers. We suppress them via @media print rules and, on screen, via
// :global CSS that fires when [data-print-view] is present in the DOM.
// Both techniques live in print.module.css.
//
// Data: reads from usePlanner() and useAppState() so any edits the teacher
// made in the current session are immediately reflected in the print preview.
// Falls back to the mock fixture via the planner store's `lessons` array.
//
// Accessibility: the grid is a <table> with proper <thead>, <tbody>, <th
// scope="col">, and <th scope="row"> so screen readers can navigate it.

import Link from "next/link";
import type { ReactNode } from "react";
import { PlannerEmpty } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useLabels } from "@/lib/labels";
import { usePlanner } from "@/lib/planner-store";
import {
  SUBJECTS,
  SUBJECT_BY_ID,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
} from "@/lib/mock";
import { lessonTime } from "@/lib/mock";
import { resolveSubjectColor } from "@/lib/palette-data";
import type { Lesson, SubjectId } from "@/lib/types";
import styles from "./print.module.css";

// ── helpers ──────────────────────────────────────────────────────────────

/** Group lessons by day index, returning a Record<dayIndex, Lesson[]>. */
function byDay(lessons: Lesson[]): Record<number, Lesson[]> {
  const out: Record<number, Lesson[]> = {};
  for (const l of lessons) {
    (out[l.day] ??= []).push(l);
  }
  return out;
}

/** Format current date as "Monday, 19 May 2026". */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── component ─────────────────────────────────────────────────────────────

export default function WeeklyPrintPage(): ReactNode {
  const { week, currentUser } = useAppState();
  const labels = useLabels();
  const { lessons } = usePlanner();

  // Only lessons in the current week, in day order.
  const weekLessons = lessons
    .filter((l) => l.week === week)
    .sort((a, b) => a.day - b.day);

  // Number of instructional days — derived from the mock's WEEK_DAYS so we
  // respect the school-week configuration rather than assuming 5 days.
  const dayCount = WEEK_DAYS.length;
  const dayIndices = Array.from({ length: dayCount }, (_, i) => i);

  // Group by subject, then within each subject by day.
  // We iterate SUBJECTS (the canonical team-wide order) so the row order
  // matches the design system's subject priority — not arbitrary lesson order.
  const lessonsBySubjectDay = new Map<SubjectId, Record<number, Lesson[]>>();
  for (const subj of SUBJECTS) {
    const subjLessons = weekLessons.filter((l) => l.subject === subj.id);
    if (subjLessons.length > 0) {
      lessonsBySubjectDay.set(subj.id, byDay(subjLessons));
    }
  }

  const today = new Date();

  return (
    // data-print-view triggers the CSS :global selectors that hide shell
    // chrome on the screen preview (see print.module.css).
    <div data-print-view className={styles.page}>
      {/* ── Screen-only action bar ────────────────────────────────────── */}
      <div className={styles.actions}>
        <Link href="/weekly" className={styles.backLink}>
          ← Back to Weekly
        </Link>
        <button
          type="button"
          className={styles.printBtn}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>

      {/* ── Print sheet ───────────────────────────────────────────────── */}
      <div className={styles.sheet}>
        {/* Sheet header */}
        <div className={styles.sheetHeader}>
          <h1 className={styles.sheetTitle}>
            {currentUser.curriculumLabel
              ? `${labels.week} ${week} — ${currentUser.curriculumLabel} Curriculum`
              : `${labels.week} ${week}`}
          </h1>
          <span className={styles.sheetMeta}>Printed {formatDate(today)}</span>
        </div>

        {/* Subject × day grid */}
        <table
          className={styles.grid}
          aria-label={`${labels.week} ${week} lesson grid`}
        >
          <thead>
            <tr>
              {/* Subject stub header — empty, describes the stub column. */}
              <th scope="col" aria-label={labels.subject} />
              {dayIndices.map((di) => (
                <th key={di} scope="col">
                  {WEEK_DAYS_SHORT[di]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(lessonsBySubjectDay.entries()).map(
              ([subjectId, dayMap]) => {
                const subj = SUBJECT_BY_ID[subjectId];
                const color = resolveSubjectColor(subjectId, "normal");
                return (
                  // `cp-subj <id>` on the row anchors the @media print
                  // pattern-fallback cascade in globals.css — every stripe
                  // descendant marked `myc-print-stripe` picks up the
                  // per-subject hatch on B&W laser output.
                  <tr key={subjectId} className={`cp-subj ${subj.cls}`}>
                    {/* Subject stub */}
                    <th
                      scope="row"
                      className={styles.subjectCell}
                      style={{ color: color.cd }}
                    >
                      {subj.name}
                    </th>
                    {/* Day cells */}
                    {dayIndices.map((di) => {
                      const cellLessons = dayMap[di] ?? [];
                      return (
                        <td key={di} className={styles.dayCell}>
                          {cellLessons.length === 0 ? (
                            <span className={styles.emptyCell}>—</span>
                          ) : (
                            cellLessons.map((l) => {
                              const timeStr = lessonTime(l);
                              return (
                                <div key={l.id} className={styles.lessonEntry}>
                                  <div className={styles.lessonStripe}>
                                    {/* Subject stripe — dashed when modified.
                                        `myc-print-stripe` is the global hook
                                        that overlays the subject's B&W hatch
                                        pattern under @media print (see
                                        globals.css W5 print fallback). */}
                                    <span
                                      className={`${styles.stripe} myc-print-stripe`}
                                      aria-hidden="true"
                                      style={
                                        l.modified
                                          ? {
                                              backgroundImage: `repeating-linear-gradient(to bottom, ${color.stripe} 0 4px, transparent 4px 8px)`,
                                            }
                                          : { background: color.stripe }
                                      }
                                    />
                                    <div className={styles.lessonMeta}>
                                      <p className={styles.lessonTitle}>
                                        {/* Strip HTML tags from title — the
                                            RTE may have stored HTML strings. */}
                                        {stripHtml(l.title)}
                                        {l.status === "done" && (
                                          <span
                                            className={styles.statusDot}
                                            aria-label="Done"
                                            style={{
                                              background: color.stripe,
                                            }}
                                          />
                                        )}
                                        {l.status === "partial" && (
                                          <span
                                            className={styles.statusDot}
                                            aria-label="Partially done"
                                            style={{
                                              background: `color-mix(in oklch, ${color.stripe} 50%, #fff)`,
                                            }}
                                          />
                                        )}
                                      </p>
                                      <span className={styles.lessonTime}>
                                        {timeStr}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              },
            )}
            {/* If no subjects have lessons this week, show an empty-state row.
                colSpan keeps it spanning the whole matrix. PlannerEmpty (in
                place of the italic text node) so an empty week mid-hydrate
                shows a skeleton and a failed load shows an error affordance,
                instead of a false "No lessons" line. This page renders inside
                the (planner) PlannerProvider (it already reads usePlanner()),
                so PlannerEmpty is safe here. */}
            {lessonsBySubjectDay.size === 0 && (
              <tr>
                <td colSpan={dayCount + 1} style={{ padding: "24px 8px" }}>
                  <PlannerEmpty
                    size="sm"
                    heading={`No lessons for ${labels.week} ${week}.`}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Utility: strip HTML tags ──────────────────────────────────────────────
// Client-side only (document available because this is "use client").
function stripHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? tmp.innerText ?? html;
}
