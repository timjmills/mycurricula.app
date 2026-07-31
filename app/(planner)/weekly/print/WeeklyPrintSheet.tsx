"use client";

// app/(planner)/weekly/print/WeeklyPrintSheet.tsx — the printable weekly grid.
//
// A one-page printable matrix of a week's lessons, organised as subjects (rows)
// × school days (columns). No right rail, no top bar chrome, no shoutbox, no
// nav appear in the printed output.
//
// This is the CLIENT half of the route; `page.tsx` is a server component that
// parses the `?week=` / `?subject=` search params and hands them down. The split
// mirrors app/(planner)/weekly/page.tsx, which is how this codebase reads search
// params (it deliberately avoids `useSearchParams` — see
// components/daily/LessonDetail.tsx:282 for the reasoning).
//
// Layout group constraint: this page is inside the (planner) route group so it
// receives the TopBar, MasterBanner, LeftFilterPanel, and RightPanel shell
// wrappers. We suppress them via @media print rules and, on screen, via :global
// CSS that fires when [data-print-view] is present in the DOM. Both techniques
// live in print.module.css / globals.css.
//
// ── The rule this file exists to obey ──────────────────────────────────────
// PAPER HAS NO RECOURSE. A teacher holding a sheet in front of a class cannot
// re-query, cannot scroll, and — critically — cannot tell that anything is
// missing. So every path here either prints a lesson or prints a visible mark
// saying it did not. Concretely:
//
//   • Day columns come from `useOrderedWeekdays()` (the configured school week),
//     never the Sun–Thu `WEEK_DAYS` literal in lib/mock. That literal both
//     mislabelled every column on a Mon–Fri school AND dropped `day >= 5` on a
//     six-day week.
//   • A lesson whose `day` falls outside the configured week gets an explicit
//     "Unscheduled" column rather than falling out of the loop.
//   • A lesson whose subject is not in the catalog gets a row under its raw id
//     rather than being skipped by the catalog iteration.
//   • The subject/unit catalog comes from `usePlanner()`, not lib/mock, so a
//     school with subjects outside the eight mock ids prints them.
//   • Archived (soft-deleted) lessons are excluded, matching every live surface
//     (WeeklyShell.tsx:701, WeekColumns.tsx:229, WeekA/WeekC) and /year/print.
//   • Nothing prints at all until the planner data has settled — see the
//     data-state guard below.
//
// Accessibility: the grid is a <table> with proper <thead>, <tbody>,
// <th scope="col">, and <th scope="row"> so screen readers can navigate it.

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PlannerEmpty } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { stripHtml } from "@/lib/html-text";
import { useLabels } from "@/lib/labels";
import { lessonTime } from "@/lib/mock";
import { resolveSubjectColor } from "@/lib/palette-data";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import type { Lesson, LessonStatus, Subject, SubjectId } from "@/lib/types";
import { useOrderedWeekdays } from "@/lib/week-order";
import styles from "./print.module.css";

// ── Status + provenance vocabulary ────────────────────────────────────────

/**
 * How a lesson went, in words.
 *
 * `not_done` maps to null on purpose: on a forward-looking weekly sheet most
 * lessons have not happened yet, so stamping every one of them "Not done" is
 * pure noise. The four states below are the ones that CHANGE what a teacher
 * does with the row, and the old sheet printed only two of them (a bare dot for
 * done/partial) — so a carried-over lesson printed indistinguishably from one
 * that went perfectly.
 */
const STATUS_LABEL: Readonly<Record<LessonStatus, string | null>> = {
  done: "Done",
  partial: "Partly done",
  carried: "Carried over",
  skipped: "Skipped",
  not_done: null,
};

/**
 * The move markers from the three-tier visual differentiation contract
 * (CLAUDE.md §2). On screen these are ↔ / ⤴ icons; on paper they are words,
 * because a 7pt glyph on a laser printer is a smudge and a screen reader
 * reading "↔" says nothing useful.
 */
const MOVED_LABEL: Readonly<Record<"same-week" | "across-weeks", string>> = {
  "same-week": "Moved this week",
  "across-weeks": "Moved from another week",
};

// ── Row model ─────────────────────────────────────────────────────────────

/**
 * One printed subject row.
 *
 * `offWeek` holds lessons whose `day` index has no column in the configured
 * school week — a real case whenever a school shrinks its week, or a lesson
 * predates the change. They are NOT dropped; they print in a trailing
 * "Unscheduled" column so the sheet stays a complete account of the week.
 */
interface SubjectRow {
  subjectId: SubjectId;
  label: string;
  /** `.cp-subj` modifier class; absent for a subject outside the catalog. */
  cls?: string;
  byDay: Map<number, Lesson[]>;
  offWeek: Lesson[];
}

/**
 * Build the printed rows: catalog subjects first (canonical team-wide order, so
 * the sheet matches the on-screen row order), then any subject id that appears
 * in the week's lessons but not in the catalog. Rows with no lessons are
 * omitted — an empty subject row wastes a line of paper — but a subject with
 * ONLY off-week lessons still gets a row, which is the whole point.
 */
function buildRows(
  weekLessons: Lesson[],
  subjects: Subject[],
  dayCount: number,
): SubjectRow[] {
  const bySubject = new Map<SubjectId, Lesson[]>();
  for (const l of weekLessons) {
    const bucket = bySubject.get(l.subject);
    if (bucket) bucket.push(l);
    else bySubject.set(l.subject, [l]);
  }

  const rows: SubjectRow[] = [];
  const emit = (id: SubjectId, label: string, cls?: string): void => {
    const subjLessons = bySubject.get(id);
    if (!subjLessons || subjLessons.length === 0) return;
    const byDay = new Map<number, Lesson[]>();
    const offWeek: Lesson[] = [];
    for (const l of subjLessons) {
      // `day` is a 0-based index INTO the configured week (see lib/week-order).
      // Anything outside that range — or a non-integer from a bad write — has
      // no column, so it goes to the visible overflow rather than nowhere.
      if (Number.isInteger(l.day) && l.day >= 0 && l.day < dayCount) {
        const cell = byDay.get(l.day);
        if (cell) cell.push(l);
        else byDay.set(l.day, [l]);
      } else {
        offWeek.push(l);
      }
    }
    rows.push({ subjectId: id, label, cls, byDay, offWeek });
    bySubject.delete(id);
  };

  for (const subj of subjects) emit(subj.id, subj.name, subj.cls);
  // Whatever is left is a subject the catalog does not know about. Printing it
  // under its raw id is ugly; dropping it is data loss. Ugly wins.
  for (const id of Array.from(bySubject.keys())) emit(id, id);
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format a date as "Monday, 19 May 2026" for the printed header. */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The lesson's time slot, or null.
 *
 * `lessonTime` falls back to `SUBJECT_TIME[subject]` — a mock map keyed by the
 * eight fixture subjects — so it returns undefined for any other subject
 * despite its `string` return type. Treating that as "no time" keeps a custom
 * subject from printing an empty time slot that reads like a missing value.
 */
/**
 * Does the lesson match the top-bar search query?
 *
 * Fields are stripped of markup first — the title and objective are rich text,
 * and a raw `includes` over `<b>Fractions</b>` misses a search for "b>Frac" in
 * one direction and matches tag names in the other. `query` arrives already
 * trimmed and lower-cased.
 */
function matchesQuery(l: Lesson, query: string): boolean {
  return [l.title, l.objective, l.preview, l.notes].some((field) =>
    stripHtml(field ?? "")
      .toLowerCase()
      .includes(query),
  );
}

function timeSlot(l: Lesson): string | null {
  const t = lessonTime(l) as string | undefined;
  return t && t.trim().length > 0 ? t : null;
}

// ── Component ─────────────────────────────────────────────────────────────

export interface WeeklyPrintSheetProps {
  /** Week to print, from `?week=`. Falls back to the planner's current week. */
  week?: number;
  /** Subject ids from `?subject=`; null prints every subject. */
  subjectIds?: string[] | null;
}

export function WeeklyPrintSheet({
  week: weekParam,
  subjectIds = null,
}: WeeklyPrintSheetProps): ReactNode {
  const {
    week: storeWeek,
    currentUser,
    filters,
    search,
  } = useAppState();
  const labels = useLabels();
  const { lessons, subjects, unitById } = usePlanner();
  const dataState = usePlannerDataState();
  const days = useOrderedWeekdays();

  // ── PRECEDENCE: URL param wins when present, store otherwise ──────────────
  //
  // Two different arrivals, two different sources of truth, and the route has
  // to serve both:
  //
  //   • IN-APP navigation (the new "Print" link in the Weekly toolbar). This
  //     route sits under app/(planner)/layout.tsx — the SAME layout as /weekly
  //     — so the App Router preserves <AppStateProvider> across the hop. The
  //     teacher's week, filters and search are all still in the store, and
  //     reading them is what fixes "I filtered to Math, hit Print, and got the
  //     whole unfiltered week."
  //   • COLD LOAD — a bookmark, a pasted URL, a reload. The provider is back at
  //     its initial value and knows nothing, so the URL has to carry it. That
  //     is what `?week=` / `?subject=` are for.
  //
  // The param therefore wins WHEN PRESENT (it is an explicit instruction) and
  // the store answers otherwise. Note the store's `week` is a sibling lane's
  // concern — it is moving from the mock CURRENT_WEEK to a calendar-derived
  // value — and reading it here inherits that fix for free.
  const week = weekParam ?? storeWeek;
  const dayCount = days.length;

  // Subject narrowing: `?subject=` first, else the left filter panel's
  // selection. `filters.subjects` is `SubjectId[]`, empty meaning "no filter".
  const subjectFilter =
    subjectIds && subjectIds.length > 0
      ? subjectIds
      : filters.subjects.length > 0
        ? (filters.subjects as string[])
        : null;
  const unitFilter = filters.units.length > 0 ? filters.units : null;
  const statusFilter = filters.statuses.length > 0 ? filters.statuses : null;
  const standardsFilter =
    filters.standards.length > 0 ? filters.standards : null;
  const query = search.trim().toLowerCase();

  // The week's real, printable lessons. `archived !== true` matches the guard
  // every live surface applies; without it the sheet printed the teacher's
  // deleted lessons back at them as though they were scheduled.
  //
  // Honouring the filters is the least surprising behaviour — printing exactly
  // what the teacher is looking at. It is only safe BECAUSE the sheet says it
  // is filtered (see `filterNote`): a narrowed sheet that stays silent about
  // the narrowing is its own quiet lie, and the more dangerous one, because a
  // teacher reads a printout as the whole week by default.
  const weekLessons = lessons.filter((l) => {
    if (l.week !== week || l.archived === true) return false;
    if (subjectFilter != null && !subjectFilter.includes(l.subject))
      return false;
    if (unitFilter != null && !unitFilter.includes(l.unit)) return false;
    if (statusFilter != null && !statusFilter.includes(l.status)) return false;
    if (
      standardsFilter != null &&
      !l.standards.some((code) => standardsFilter.includes(code))
    )
      return false;
    if (query.length > 0 && !matchesQuery(l, query)) return false;
    return true;
  });

  const rows = buildRows(weekLessons, subjects, dayCount);
  const hasOffWeek = rows.some((r) => r.offWeek.length > 0);
  const colCount = dayCount + 1 + (hasOffWeek ? 1 : 0);

  // A sheet printed over a plan that has not loaded is a confident lie on
  // paper — the most expensive kind. Until the store settles we render the
  // readiness affordance INSTEAD of the grid (not an empty grid with a message
  // in it) and refuse to hand over a print button.
  const settled = dataState === "settled";

  // ── The SECOND readiness axis: the configured school week ────────────────
  // `useSchoolWeek` is SSR-safe by pinning the server render and the first
  // client render to DEFAULT_SCHOOL_WEEK (Sun–Thu) and only adopting the real
  // week in a post-mount effect. That is correct for hydration and wrong for
  // paper: in that window a Mon–Fri school's sheet is labelled Sun–Thu, and a
  // six-day school's Friday lessons are filed under "Unscheduled" — both
  // confident, both wrong, and neither visible as wrong once printed.
  //
  // So the sheet is not "ready" until at least one client effect has run.
  // `mounted` is deliberately NOT allowed to gate the grid itself (a teacher
  // should see their week immediately); it gates the two ways the page becomes
  // PAPER — the Print button, and the @media print rules keyed off
  // data-print-ready, which substitute a one-line notice for a wrong grid if
  // Ctrl+P lands inside the window.
  //
  // WHY `mounted` IS SUFFICIENT ON THE PROTOTYPE PATH, and not merely likely:
  // `useSchoolWeek` adopts its localStorage cache in a post-mount effect, and
  // React batches every state update from a single effect flush into ONE
  // re-render. So the first render in which `mounted` is true is also the
  // first render carrying the cached week — this does not depend on which of
  // the two effects React happens to run first.
  //
  // RESIDUAL, stated rather than papered over: on the DEPLOYED path the
  // authoritative week comes from a network read that resolves in a later
  // tick, which no amount of mount-tracking can wait for. `useSchoolWeek`
  // exposes no readiness signal, and adding one belongs in
  // lib/use-school-week.ts — shared by ~12 surfaces, and not this file's to
  // change. Until it exists, the mitigation is to make the failure VISIBLE
  // rather than silent: the sheet prints the school week it used (see the
  // header below), so a Mon–Fri teacher holding a sheet that says
  // "School week: Sun–Thu" can see it is wrong. That is the whole thesis of
  // this template — a wrong sheet that says what it assumed beats a wrong
  // sheet that says nothing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && settled;

  const today = new Date();

  // EVERY active narrowing, named on the sheet. Not a boolean "filtered" flag:
  // a teacher who prints under a status filter and reads only "filtered" cannot
  // tell WHAT is missing, which is barely better than not being told. Each
  // clause resolves ids to the names the teacher actually chose.
  const filterParts: string[] = [];
  if (subjectFilter != null) {
    filterParts.push(
      subjectFilter
        .map((id) => subjects.find((s) => s.id === id)?.name ?? id)
        .join(", "),
    );
  }
  if (unitFilter != null) {
    filterParts.push(
      unitFilter.map((id) => unitById[id]?.name ?? id).join(", "),
    );
  }
  if (statusFilter != null) {
    filterParts.push(
      statusFilter.map((s) => STATUS_LABEL[s] ?? "Not done").join(", "),
    );
  }
  if (standardsFilter != null) {
    filterParts.push(`standards ${standardsFilter.join(", ")}`);
  }
  if (query.length > 0) {
    filterParts.push(`search “${search.trim()}”`);
  }
  const filterNote =
    filterParts.length > 0 ? `filtered to ${filterParts.join(" · ")}` : null;

  return (
    // data-print-view triggers the CSS :global selectors that hide shell
    // chrome on the screen preview (see globals.css).
    <div
      data-print-view
      data-print-ready={ready ? "true" : "false"}
      className={styles.page}
    >
      {/* ── Screen-only action bar ────────────────────────────────────── */}
      <div className={styles.actions}>
        <Link href="/weekly" className={styles.backLink}>
          ← Back to Weekly
        </Link>
        <button
          type="button"
          className={styles.printBtn}
          onClick={() => window.print()}
          disabled={!ready}
          title={
            ready
              ? "Open your browser's print dialog — choose Print to send to a printer, or Save as PDF to keep a copy of this week."
              : "Still loading your plan and your school week. Printing now could produce a sheet with the wrong days or missing lessons."
          }
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Print-only, and only while data-print-ready="false". The button above
          is not a gate — Ctrl+P ignores it — so this is what actually stands
          between the unready window and a wrong sheet coming out of a printer.
          Hidden on screen and on a ready sheet; see print.module.css.

          The copy branches because a FAILED hydrate is not a slow one: telling
          a teacher whose plan errored to "wait and print again" is an
          instruction that can never resolve, and it hides the fact that
          anything went wrong at all. */}
      <p className={styles.notReady}>
        {dataState === "error"
          ? "Your plan could not be loaded, so this sheet is incomplete — it is not a record of your week. Go back to Weekly, reload, and print again once your lessons appear."
          : "This week is still loading. Close this dialog, wait for the grid to appear, and print again — otherwise the days or the lessons may be wrong."}
      </p>

      {/* ── Print sheet ───────────────────────────────────────────────── */}
      <div className={styles.sheet}>
        {/* Sheet header */}
        <div className={styles.sheetHeader}>
          <h1 className={styles.sheetTitle}>
            {currentUser.curriculumLabel
              ? `${labels.week} ${week} — ${currentUser.curriculumLabel} Curriculum`
              : `${labels.week} ${week}`}
          </h1>
          <span className={styles.sheetMeta}>
            {/* The school week the sheet was BUILT FROM, printed on the sheet.
                It is useful on its own (a substitute learns the week at a
                glance), and it is the mitigation for the residual documented
                at `mounted` above: a teacher whose school runs Mon–Fri can
                see a sheet that says "School week: Sun, Mon, Tue, Wed, Thu"
                is wrong and reprint. An assumption stated on paper is a
                recoverable error; an unstated one is not. */}
            School week: {days.map((d) => d.label).join(", ")}
            <br />
            {filterNote ? `${filterNote} · ` : ""}
            Printed {formatDate(today)}
          </span>
        </div>

        {!settled ? (
          // Not a grid with a message inside it — no grid at all. A printed
          // table of "—" over a plan that has not loaded reads as an authored
          // statement that the week is empty. `heading` is required by
          // EmptyState but unreachable here: PlannerEmpty only reaches its
          // heading in the settled branch, which this ternary excludes.
          <PlannerEmpty heading={`${labels.week} ${week}`} />
        ) : (
          <>
            {/* Subject × day grid */}
            <table
              className={styles.grid}
              aria-label={`${labels.week} ${week} lesson grid`}
            >
              <thead>
                <tr>
                  {/* Subject stub header — empty, describes the stub column. */}
                  <th scope="col" aria-label={labels.subject} />
                  {days.map((d) => (
                    <th key={d.token} scope="col">
                      <abbr title={d.longLabel}>{d.label}</abbr>
                    </th>
                  ))}
                  {hasOffWeek && (
                    <th scope="col" className={styles.offCol}>
                      Unscheduled
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const color = resolveSubjectColor(row.subjectId, "normal");
                  return (
                    // `cp-subj <id>` on the row anchors the @media print
                    // pattern-fallback cascade in globals.css — every stripe
                    // descendant marked `myc-print-stripe` picks up the
                    // per-subject hatch on B&W laser output.
                    <tr
                      key={row.subjectId}
                      className={row.cls ? `cp-subj ${row.cls}` : "cp-subj"}
                    >
                      {/* Subject stub */}
                      <th
                        scope="row"
                        className={styles.subjectCell}
                        style={{ color: color.cd }}
                      >
                        {row.label}
                      </th>
                      {/* Day cells */}
                      {days.map((d) => (
                        <td key={d.token} className={styles.dayCell}>
                          <LessonCell
                            lessons={row.byDay.get(d.index) ?? []}
                            stripe={color.stripe}
                          />
                        </td>
                      ))}
                      {hasOffWeek && (
                        <td className={`${styles.dayCell} ${styles.offCell}`}>
                          <LessonCell
                            lessons={row.offWeek}
                            stripe={color.stripe}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className={styles.emptyRow}>
                      <PlannerEmpty
                        size="sm"
                        heading={`No lessons for ${labels.week} ${week}.`}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {hasOffWeek && (
              <p className={styles.footnote}>
                Lessons under <strong>Unscheduled</strong> sit on a day outside
                your configured school week. Open them in Weekly to give them a
                day.
              </p>
            )}

            {/* Paper has no tooltips and no hover, so the markers have to
                explain themselves on the page or they are decoration. */}
            {rows.length > 0 && <Legend />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Cell ──────────────────────────────────────────────────────────────────

/**
 * The lessons in one (subject, day) intersection.
 *
 * WHAT GOES ON PAPER, and why. Title and time were already here. Added:
 *   • the OBJECTIVE — the "I can…" sentence. It is the single highest-value
 *     line on the sheet: it is what the teacher says out loud, and it is what a
 *     substitute needs to teach the lesson at all.
 *   • the STATUS, in words, for the four states that change what you do next.
 *   • the MOVE / PERSONAL markers, so the forking model (CLAUDE.md §2) survives
 *     the printer instead of being a screen-only affordance.
 *   • the NOTE and, for a lesson that did not happen, the REASON — the two
 *     fields a teacher writes FOR their future self, which is exactly who reads
 *     the printout.
 *
 * Deliberately NOT here: resources (unclickable on paper), standards codes
 * (coverage review is /year/print's job, and eight codes per cell would bury
 * the objective), directions and differentiation (paragraphs — they belong on a
 * single-lesson printout, not in a five-column landscape matrix).
 */
function LessonCell({
  lessons,
  stripe,
}: {
  lessons: Lesson[];
  stripe: string;
}): ReactNode {
  if (lessons.length === 0) {
    return <span className={styles.emptyCell}>—</span>;
  }
  return (
    <>
      {lessons.map((l) => {
        const time = timeSlot(l);
        const status = STATUS_LABEL[l.status];
        const moved = l.moved ? MOVED_LABEL[l.moved] : null;
        const objective = stripHtml(l.objective ?? "");
        const note = stripHtml(l.notes ?? "");
        const reason = stripHtml(l.reasonNotDone ?? "");
        // Only worth printing when the lesson did NOT go to plan; on a done
        // lesson a stale reason string is just confusing.
        const showReason =
          reason.length > 0 && l.status !== "done" && l.status !== "partial";
        return (
          <div key={l.id} className={styles.lessonEntry}>
            <div className={styles.lessonStripe}>
              {/* Subject stripe — dashed when personally modified, per the
                  three-tier differentiation contract. `myc-print-stripe` is
                  the global hook that overlays the subject's B&W hatch under
                  @media print (globals.css W5 print fallback). */}
              <span
                className={`${styles.stripe} myc-print-stripe`}
                aria-hidden="true"
                style={
                  l.modified
                    ? {
                        backgroundImage: `repeating-linear-gradient(to bottom, ${stripe} 0 4px, transparent 4px 8px)`,
                      }
                    : { background: stripe }
                }
              />
              <div className={styles.lessonMeta}>
                <p className={styles.lessonTitle}>{stripHtml(l.title)}</p>
                {objective.length > 0 && (
                  <p className={styles.lessonObjective}>{objective}</p>
                )}
                <p className={styles.lessonMarkers}>
                  {time && <span className={styles.lessonTime}>{time}</span>}
                  {status && (
                    <span
                      className={styles.marker}
                      data-status={l.status}
                      style={
                        l.status === "done" || l.status === "partial"
                          ? { borderColor: stripe }
                          : undefined
                      }
                    >
                      {status}
                    </span>
                  )}
                  {moved && <span className={styles.marker}>{moved}</span>}
                  {l.modified && <span className={styles.marker}>Modified</span>}
                  {l.isPersonal && (
                    <span className={styles.marker}>Personal lesson</span>
                  )}
                </p>
                {showReason && (
                  <p className={styles.lessonAside}>Why: {reason}</p>
                )}
                {note.length > 0 && (
                  <p className={styles.lessonAside}>Note: {note}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────

function Legend(): ReactNode {
  return (
    <div className={styles.legend}>
      <p className={styles.legendLine}>
        <strong>Done</strong> · <strong>Partly done</strong> ·{" "}
        <strong>Carried over</strong> · <strong>Skipped</strong> — how the lesson
        went. Lessons with no mark have not been taught yet.
      </p>
      <p className={styles.legendLine}>
        <strong>Moved this week</strong> / <strong>Moved from another week</strong>{" "}
        — the lesson is not in its originally planned slot.
      </p>
      <p className={styles.legendLine}>
        A dashed stripe, <strong>Modified</strong>, and{" "}
        <strong>Personal lesson</strong> mark your personal copy. Everything else
        on this sheet is the Team Curriculum.
      </p>
    </div>
  );
}
