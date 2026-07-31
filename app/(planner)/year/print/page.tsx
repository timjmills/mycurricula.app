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
//   - usePlanner().subjects   — the REAL subject catalog (see below).
//   - usePlanner().unitById   — the REAL unit lookup (see below).
//   - allYearMonthsFor()      — month bands { label, weeks, startWeekIdx }.
//
// For each (subject, week) cell we collect the set of unit ids touched in
// that week, the lesson count, and how many of those lessons are already done,
// then render either a short unit label or a "—" placeholder. The unit
// shortener trims the leading "Unit N · " prefix when the row already says
// "Math" / "Reading" — keeping cell text scannable.
//
// ── Two things this file used to get wrong, both invisible on paper ────────
//  1. It iterated the MOCK catalog (`SUBJECTS` / `UNIT_BY_ID` from lib/mock)
//     while the store hydrated a real one. Any subject outside the eight mock
//     ids therefore had NO ROW — no warning, no gap, just absent — and any unit
//     the mock had never heard of printed as a raw database id. Both now come
//     from `usePlanner()`, with a trailing catch-all row for a subject id that
//     appears in the lessons but not in the catalog.
//  2. It had no hydration guard at all. The Supabase hydrate takes 11–16s, and
//     printing inside that window emitted a complete, confident, entirely-"—"
//     year plan. The data-state guard below renders the readiness affordance
//     INSTEAD of the month sections until the store settles.

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PlannerEmpty } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useLabels } from "@/lib/labels";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { allYearMonthsFor, type YearMonthBand } from "@/lib/year-calendar";
import { useAcademicYear } from "@/lib/use-academic-year";
import { resolveSubjectColor } from "@/lib/palette-data";
import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";
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

/** Compact date for the academic-year range in the cover header. */
function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
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
  /** How many of those lessons are already marked done — the "where am I in
   *  the plan?" number, and the reason anyone prints a year overview. */
  doneCount: number;
  modified: boolean;
}

/**
 * Collect units present in a (subject, week) intersection. Returns one
 * block per unique unit id, with the count of lessons, how many are done,
 * and whether any of those lessons carry a modification flag.
 *
 * `unitById` is the STORE's lookup, not the mock's — a school's own units
 * resolve to their names instead of printing as raw ids.
 */
function unitsForCell(
  lessons: Lesson[],
  unitById: Record<string, Unit>,
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
      if (l.status === "done") existing.doneCount += 1;
      existing.modified = existing.modified || l.modified;
    } else {
      const unit = unitById[l.unit];
      byUnit.set(l.unit, {
        unitId: l.unit,
        unitName: unit ? shortUnitName(unit.name) : l.unit,
        lessonCount: 1,
        doneCount: l.status === "done" ? 1 : 0,
        modified: l.modified,
      });
    }
  }
  return Array.from(byUnit.values()).sort(
    (a, b) => b.lessonCount - a.lessonCount,
  );
}

/**
 * The rows to print: catalog subjects in their canonical order, then any
 * subject id that appears in a live lesson but not in the catalog.
 *
 * The catch-all matters because the catalog and the lessons are separate
 * hydrates: an orphaned subject id would otherwise be skipped by the catalog
 * loop and vanish from the printed year with nothing to mark its absence.
 */
interface SubjectRow {
  id: SubjectId;
  label: string;
  /** `.cp-subj` modifier class; absent for a subject outside the catalog. */
  cls?: string;
}

function buildSubjectRows(lessons: Lesson[], subjects: Subject[]): SubjectRow[] {
  const rows: SubjectRow[] = subjects.map((s) => ({
    id: s.id,
    label: s.name,
    cls: s.cls,
  }));
  const known = new Set<string>(subjects.map((s) => s.id));
  for (const l of lessons) {
    if (l.archived) continue;
    if (known.has(l.subject)) continue;
    known.add(l.subject);
    rows.push({ id: l.subject, label: l.subject });
  }
  return rows;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function YearPrintPage(): ReactNode {
  // useAppState() — read currentUser.curriculumLabel for the cover title
  // (omitted entirely when the label is empty so the title still scans).
  const { currentUser } = useAppState();
  const labels = useLabels();
  const { lessons, subjects, unitById } = usePlanner();
  const dataState = usePlannerDataState();
  // TEAM-scoped academic year — same hook the screen Year view reads.
  // Print + screen layouts stay in lockstep so the printed range mirrors
  // exactly what the teacher sees in /year.
  const { start: yearStart, end: yearEnd } = useAcademicYear();

  const months = allYearMonthsFor(yearStart, yearEnd);
  const subjectRows = buildSubjectRows(lessons, subjects);
  const today = new Date();
  // Until the store settles, a full month-stack of "—" is not an empty year —
  // it is a document asserting an empty year. Refuse to draw it, and refuse to
  // hand over the print button.
  const settled = dataState === "settled";

  // The second readiness axis, same shape as /weekly/print's school-week gate.
  // `useAcademicYear` pins the server render and the first client render to a
  // heuristic default and adopts the school's real range in a post-mount
  // effect — so inside that window the month bands and every "Wk N" header
  // belong to a year the school does not teach. `mounted` gates only what
  // becomes PAPER (the print button, and the @media print rules keyed off
  // data-print-ready); the on-screen stack renders throughout, because a
  // teacher watching the preview can see it settle.
  //
  // Unlike /weekly/print's school week, this axis has NO residual: the whole
  // of `useAcademicYear` is a synchronous localStorage read in a post-mount
  // effect (lib/use-academic-year.ts:310) with no network path at all, and
  // React batches every update from one effect flush into a single re-render.
  // So the first render with `mounted === true` already carries the school's
  // range — regardless of which effect React runs first. The printed range in
  // the header below states the assumption anyway, on the same principle.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && settled;

  return (
    // data-print-view triggers the global :has() cascade in app/globals.css
    // that hides the planner shell chrome on-screen preview.
    <div
      data-print-view
      data-print-ready={ready ? "true" : "false"}
      className={styles.page}
    >
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
          disabled={!ready}
          title={
            ready
              ? "Open your browser's print dialog — choose Print to send to a printer, or Save as PDF to keep a copy of the year overview."
              : "Still loading your plan and your academic year. Printing now could produce an overview with the wrong weeks or missing units."
          }
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Print-only, and only while data-print-ready="false". The disabled
          button above is not a gate — Ctrl+P ignores it — so this is what
          stands between the unready window and an overview whose week
          numbering belongs to a year the school does not teach.

          The copy branches because a FAILED hydrate is not a slow one: telling
          a teacher whose plan errored to "wait and print again" is an
          instruction that can never resolve, and it buries the failure. */}
      <p className={styles.notReady}>
        {dataState === "error"
          ? "Your plan could not be loaded, so this overview is incomplete — it is not a record of your year. Go back to Year, reload, and print again once your units appear."
          : "This year overview is still loading. Close this dialog, wait for the month sections to appear, and print again — otherwise the weeks or the units may be wrong."}
      </p>

      {/* ── Print sheet ───────────────────────────────────────────────── */}
      <div className={styles.sheet}>
        {/* Cover header — prints once at the top of the first page. */}
        <div className={styles.sheetHeader}>
          <h1 className={styles.sheetTitle}>
            {currentUser.curriculumLabel
              ? `Yearly Plan — ${currentUser.curriculumLabel} Curriculum`
              : "Yearly Plan"}
          </h1>
          <span className={styles.sheetMeta}>
            {/* The academic range the month bands and every "Wk N" header were
                derived from, stated on the sheet. A year overview whose week
                numbering silently disagrees with the school's calendar is
                unfalsifiable on paper; this makes it checkable. */}
            Academic year: {formatShort(yearStart)} – {formatShort(yearEnd)}
            <br />
            Printed {formatDate(today)}
          </span>
        </div>

        {/* Data-readiness gate. `heading` is required by EmptyState but
            unreachable here — PlannerEmpty only reaches its heading in the
            settled branch, which this guard excludes. */}
        {!settled && <PlannerEmpty heading="Yearly Plan" />}

        {/* One <section> per calendar month that actually has academic
            weeks. `allYearMonthsFor` returns 12 entries (one per calendar
            month) — months with `weeks: 0` would render an empty table, so
            we filter them out. CSS handles the page-break-before rules; the
            first section opts out of the page break so the first month sits
            flush under the cover header on page 1. */}
        {settled &&
          months
            .filter((band) => band.weeks > 0)
            .map((band, mi) => (
              <MonthSection
                key={`${band.label}-${band.startWeekIdx}`}
                band={band}
                first={mi === 0}
                rows={subjectRows}
                lessons={lessons}
                unitById={unitById}
                subjectLabel={labels.subject}
              />
            ))}
      </div>
    </div>
  );
}

// ── One month band ────────────────────────────────────────────────────────
//
// Extracted from the page body because the subject × week matrix is three
// nested maps deep; inline it was ~120 lines at eight levels of indentation,
// which is where the mock-catalog reads hid in plain sight for as long as they
// did. Pure presentation — every decision is made by the caller.

function MonthSection({
  band,
  first,
  rows,
  lessons,
  unitById,
  subjectLabel,
}: {
  band: YearMonthBand;
  first: boolean;
  rows: SubjectRow[];
  lessons: Lesson[];
  unitById: Record<string, Unit>;
  subjectLabel: string;
}): ReactNode {
  // The absolute 0-based week indices inside this month band — used both for
  // the column headers and the cell lookups.
  const weekIndices = Array.from(
    { length: band.weeks },
    (_, i) => band.startWeekIdx + i,
  );

  return (
    <section
      className={styles.monthSection}
      data-first={first ? "true" : undefined}
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
            <th scope="col" aria-label={subjectLabel} />
            {weekIndices.map((wi) => (
              <th key={wi} scope="col">
                Wk {wi + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const color = resolveSubjectColor(row.id, "normal");
            return (
              <tr
                key={row.id}
                className={row.cls ? `cp-subj ${row.cls}` : "cp-subj"}
                data-subject={row.id}
              >
                {/* Subject stub — colored by the cp-subj cascade, falls back
                    to the resolved token so paper output keeps color even if
                    the cascade is suppressed. */}
                <th
                  scope="row"
                  className={styles.subjectCell}
                  style={{ color: color.cd }}
                >
                  {/* myc-print-stripe is the W5 B&W hatch hook: under
                      @media print it reads the --subject-pattern cascaded
                      from the cp-subj class on the parent <tr> and paints a
                      distinct per-subject hatch so the stripe survives a mono
                      printer (see app/globals.css). */}
                  <span
                    className={`${styles.subjectStripe} myc-print-stripe`}
                    aria-hidden="true"
                    style={{ background: color.stripe }}
                  />
                  {row.label}
                </th>

                {weekIndices.map((wi) => (
                  <td key={wi} className={styles.weekCell}>
                    <WeekCell
                      blocks={unitsForCell(lessons, unitById, row.id, wi)}
                      stripe={color.stripe}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/**
 * One (subject, week) intersection: the units taught, how many lessons each
 * carries, and how many of those are already done.
 *
 * The done count is the one lesson-level fact worth the ink at year scale. The
 * Year view's whole job is "where am I in the plan?" (CLAUDE.md §1), and a
 * printed year that shows only what is PLANNED cannot answer it. Everything
 * else lesson-level — titles, objectives, standards — stays off this sheet: at
 * ~36 weeks × N subjects there is no room, and /weekly/print is where a teacher
 * goes for lesson detail.
 */
function WeekCell({
  blocks,
  stripe,
}: {
  blocks: CellUnitBlock[];
  stripe: string;
}): ReactNode {
  if (blocks.length === 0) {
    return <span className={styles.emptyCell}>—</span>;
  }
  return (
    <>
      {blocks.map((b) => (
        <div key={b.unitId} className={styles.unitBlock}>
          {/* myc-print-stripe is the W5 B&W hatch hook: the unit belongs to
              this subject row, so under @media print it inherits the same
              --subject-pattern from the cp-subj class on the parent <tr> and
              prints a distinct per-subject hatch on a mono printer (see
              app/globals.css). The dashed modified treatment only carries on
              color output; B&W readers rely on the hatch for subject
              identity. */}
          <span
            className={`${styles.unitStripe} myc-print-stripe`}
            aria-hidden="true"
            style={
              b.modified
                ? {
                    backgroundImage: `repeating-linear-gradient(to bottom, ${stripe} 0 4px, transparent 4px 8px)`,
                  }
                : { background: stripe }
            }
          />
          <span className={styles.unitText}>
            <span className={styles.unitName}>{b.unitName}</span>
            <span className={styles.unitCount}>
              {b.lessonCount} {b.lessonCount === 1 ? "lesson" : "lessons"}
              {b.doneCount > 0 && ` · ${b.doneCount} done`}
            </span>
          </span>
        </div>
      ))}
    </>
  );
}
