"use client";

// app/(planner)/year/print/page.tsx — printable Year (month-stack).
//
// The desktop /year timeline is ~3.4k px wide; browsers fit-to-page-scale
// that to a landscape sheet at ~20% scale, which is illegible on paper. This
// dedicated route re-flows the same data as a vertical month-stack — one
// section per calendar month, each section a compact 8-subject × ~4-5-week
// matrix. Page breaks land between month sections so each month prints on
// its own sheet (or pair of sheets) without losing context.
//
// Mirrors the precedent at /weekly/print:
//   • [data-print-view] on the page root → triggers the global
//     :has() cascade in app/globals.css that hides the planner shell
//     chrome on the screen preview AND under @media print.
//   • Screen-only action bar (Back / Print) hidden in print.
//   • Pure consumer of usePlanner() + useAppState() — any session edits show
//     up immediately in the preview.
//
// Data shape consumed:
//   - usePlanner().lessons    — Lesson[] (week is 1-based, day is 0-based).
//   - allYearMonths()         — month bands { label, weeks, startWeekIdx }.
//   - SUBJECTS                — canonical 8-subject order.
//
// For each (subject, week) cell we collect the set of unit ids touched in
// that week and the lesson count, then render either a short unit label or
// a "—" placeholder. The unit shortener trims the leading "Unit N · " prefix
// when the row already says "Math" / "Reading" — keeping cell text scannable.

import Link from "next/link";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, SUBJECT_BY_ID, UNIT_BY_ID } from "@/lib/mock";
import { allYearMonthsFor } from "@/lib/year-calendar";
import { useAcademicYear } from "@/lib/use-academic-year";
import { resolveSubjectColor } from "@/lib/palette-data";
import type { Lesson, SubjectId } from "@/lib/types";
import styles from "./print.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Format the current date as "Monday, 25 May 2026" for the printed header.
 */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Strip the "Unit N · " prefix from a unit name so the matrix cell reads
 * "Fractions on a Number Line" instead of "Unit 3 · Fractions on a Number
 * Line" — the subject row label already carries enough context.
 *
 * Falls back to the original name if the prefix isn't recognised.
 */
function shortUnitName(name: string): string {
  // Match "Unit 3 · …", "Lessons 84–92 · …", "List 12 · …" — anything before
  // the · separator is metadata the row label makes redundant.
  const dotIdx = name.indexOf("·");
  if (dotIdx > 0 && dotIdx < name.length - 1) {
    return name.slice(dotIdx + 1).trim();
  }
  return name;
}

/**
 * One cell in the month × subject matrix.
 *
 * The unit blocks are sorted by their lessonCount so the largest unit per
 * cell prints first; the modified flag flips the stripe to a dashed pattern,
 * matching the visual differentiation rules from BUILD_STANDARD.md §9.
 */
interface CellUnitBlock {
  unitId: string;
  unitName: string;
  lessonCount: number;
  modified: boolean;
}

/**
 * Collect units present in a (subject, week) intersection. Returns one
 * block per unique unit id, with the count of lessons and whether any of
 * those lessons carry a modification flag.
 */
function unitsForCell(
  lessons: Lesson[],
  subjectId: SubjectId,
  weekIdx0: number,
): CellUnitBlock[] {
  // Lesson.week is 1-based in the mock; weekIdx0 is 0-based.
  const lessonWeek = weekIdx0 + 1;
  const byUnit = new Map<string, CellUnitBlock>();
  for (const l of lessons) {
    if (l.subject !== subjectId) continue;
    if (l.week !== lessonWeek) continue;
    if (l.archived) continue;
    const existing = byUnit.get(l.unit);
    if (existing) {
      existing.lessonCount += 1;
      existing.modified = existing.modified || l.modified;
    } else {
      const unit = UNIT_BY_ID[l.unit];
      byUnit.set(l.unit, {
        unitId: l.unit,
        unitName: unit ? shortUnitName(unit.name) : l.unit,
        lessonCount: 1,
        modified: l.modified,
      });
    }
  }
  return Array.from(byUnit.values()).sort(
    (a, b) => b.lessonCount - a.lessonCount,
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function YearPrintPage(): ReactNode {
  // useAppState() — read currentUser.curriculumLabel for the cover title
  // (omitted entirely when the label is empty so the title still scans).
  const { currentUser } = useAppState();
  const { lessons } = usePlanner();
  // TEAM-scoped academic year — same hook the screen Year view reads.
  // Print + screen layouts stay in lockstep so the printed range mirrors
  // exactly what the teacher sees in /year.
  const { start: yearStart, end: yearEnd } = useAcademicYear();

  const months = allYearMonthsFor(yearStart, yearEnd);
  const today = new Date();

  return (
    // data-print-view triggers the global :has() cascade in app/globals.css
    // that hides the planner shell chrome on-screen preview.
    <div data-print-view className={styles.page}>
      {/* ── Screen-only action bar ────────────────────────────────────── */}
      <div className={styles.actions}>
        <Link
          href="/year"
          className={styles.backLink}
          title="Leave the print preview and go back to the interactive Year timeline — your year plan stays exactly as it was."
        >
          ← Back to Year
        </Link>
        <button
          type="button"
          className={styles.printBtn}
          onClick={() => window.print()}
          title="Open your browser's print dialog — choose Print to send to a printer, or Save as PDF to keep a copy of the year overview."
        >
          Print / Save as PDF
        </button>
      </div>

      {/* ── Print sheet ───────────────────────────────────────────────── */}
      <div className={styles.sheet}>
        {/* Cover header — prints once at the top of the first page. */}
        <div className={styles.sheetHeader}>
          <h1 className={styles.sheetTitle}>
            {currentUser.curriculumLabel
              ? `Yearly Plan — ${currentUser.curriculumLabel} Curriculum`
              : "Yearly Plan"}
          </h1>
          <span className={styles.sheetMeta}>Printed {formatDate(today)}</span>
        </div>

        {/* One <section> per calendar month that actually has academic
            weeks. `allYearMonthsFor` returns 12 entries (one per calendar
            month) — months with `weeks: 0` would render an empty table, so
            we filter them out. CSS handles the page-break-before rules; the
            first section opts out of the page break so the first month sits
            flush under the cover header on page 1. */}
        {months
          .filter((band) => band.weeks > 0)
          .map((band, mi) => {
            // Generate the absolute 0-based week indices that fall inside
            // this month band — used both for column headers and cell lookups.
            const weekIndices = Array.from(
              { length: band.weeks },
              (_, i) => band.startWeekIdx + i,
            );

            return (
              <section
                key={`${band.label}-${band.startWeekIdx}`}
                className={styles.monthSection}
                data-first={mi === 0 ? "true" : undefined}
                aria-label={`${band.label} schedule`}
              >
                <h2 className={styles.monthTitle}>{band.label}</h2>

                <table
                  className={styles.grid}
                  aria-label={`${band.label} subject × week matrix`}
                >
                  <thead>
                    <tr>
                      {/* Subject stub column. */}
                      <th scope="col" aria-label="Subject" />
                      {weekIndices.map((wi) => (
                        <th key={wi} scope="col">
                          Wk {wi + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SUBJECTS.map((subj) => {
                      const subjectId = subj.id as SubjectId;
                      const color = resolveSubjectColor(subjectId, "normal");
                      return (
                        <tr
                          key={subj.id}
                          className={`cp-subj ${subj.cls}`}
                          data-subject={subj.id}
                        >
                          {/* Subject stub — colored by the cp-subj cascade,
                            falls back to the resolved hex so paper output
                            keeps color even if the cascade is suppressed. */}
                          <th
                            scope="row"
                            className={styles.subjectCell}
                            style={{ color: color.cd }}
                          >
                            {/* myc-print-stripe is the W5 B&W hatch hook:
                                under @media print it reads the
                                --subject-pattern cascaded from the cp-subj
                                class on the parent <tr> and paints a distinct
                                per-subject hatch so the stripe survives a
                                mono printer (see app/globals.css). */}
                            <span
                              className={`${styles.subjectStripe} myc-print-stripe`}
                              aria-hidden="true"
                              style={{ background: color.stripe }}
                            />
                            {SUBJECT_BY_ID[subjectId].name}
                          </th>

                          {weekIndices.map((wi) => {
                            const blocks = unitsForCell(lessons, subjectId, wi);
                            return (
                              <td key={wi} className={styles.weekCell}>
                                {blocks.length === 0 ? (
                                  <span className={styles.emptyCell}>—</span>
                                ) : (
                                  blocks.map((b) => (
                                    <div
                                      key={b.unitId}
                                      className={styles.unitBlock}
                                    >
                                      {/* myc-print-stripe is the W5 B&W hatch
                                          hook: the unit belongs to this
                                          subject row, so under @media print it
                                          inherits the same --subject-pattern
                                          from the cp-subj class on the parent
                                          <tr> and prints a distinct per-subject
                                          hatch on a mono printer (see
                                          app/globals.css). The dashed modified
                                          treatment only carries on color
                                          output; B&W readers rely on the hatch
                                          for subject identity. */}
                                      <span
                                        className={`${styles.unitStripe} myc-print-stripe`}
                                        aria-hidden="true"
                                        style={
                                          b.modified
                                            ? {
                                                backgroundImage: `repeating-linear-gradient(to bottom, ${color.stripe} 0 4px, transparent 4px 8px)`,
                                              }
                                            : { background: color.stripe }
                                        }
                                      />
                                      <span className={styles.unitText}>
                                        <span className={styles.unitName}>
                                          {b.unitName}
                                        </span>
                                        <span className={styles.unitCount}>
                                          {b.lessonCount}{" "}
                                          {b.lessonCount === 1
                                            ? "lesson"
                                            : "lessons"}
                                        </span>
                                      </span>
                                    </div>
                                  ))
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
      </div>
    </div>
  );
}
