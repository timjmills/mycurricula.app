"use client";

// lib/archive/school-years.ts — school-year summaries for the Curriculum
// Archive surface (/archive).
//
// A school year is either CURRENT (the one active plan teachers edit) or
// ARCHIVED (a finished year, kept read-only so the team can look back at what
// they taught). This module exposes a flat, presentation-ready summary for the
// current year plus the subject "spine" used to render a volume's page-edge.
//
// ── WHY THIS FILE WAS REWRITTEN (2026-07-31) ────────────────────────────────
//
// It previously exported a module-level `FIXTURE` and returned it
// UNCONDITIONALLY — there was no data source in the file at all, and no
// `USE_SUPABASE` branch to reach one. Every teacher, at every school, in their
// very first year, was shown a sealed volume reading "2025–2026 · 8 units ·
// 15 lessons · 40 weeks" and a current-year card reading "2026–2027 · 35 units
// · 185 lessons", beside a live CTA into their real /weekly.
//
// That is a worse failure than the false-empty class fixed elsewhere in this
// session. A false-empty says "you have nothing" when you have something; this
// said "HERE IS YOUR RECORD" and printed invented numbers. A teacher could
// reasonably believe last year's plan had been archived and was retrievable
// when nothing was ever archived — and nothing CAN be: no rollover / roll-
// forward code exists anywhere in the repo, and the `school_year_archived`
// audit action the schema declares is never emitted.
//
// A read of the production DB on 2026-07-31 shows the numbers were wrong even
// for the one school they were copied from — that year holds 49 units and 1239
// lessons, not 35 / 185.
//
// ── THE HONESTY CONTRACT NOW ────────────────────────────────────────────────
//
//   1. A count is printed only when it can be SOURCED. Where a number cannot be
//      sourced it is `null` and the surface renders a loading or unavailable
//      affordance — never a placeholder digit, never a silent 0.
//   2. `useSchoolYears()` carries a STATE DISCRIMINATOR. (The old comment here
//      claimed the return shape "is unchanged" when this goes async. That was
//      false — without a pending/error state a 11–16s Supabase hydrate renders
//      as a truthful-looking count of zero. See components/ui/PlannerEmpty.tsx
//      for the same lesson learned on the planner surfaces.)
//   3. No archived year is asserted unless something real produced one.
//
// ── WHERE THE HONEST NUMBERS COME FROM ──────────────────────────────────────
//
// CURRENT YEAR — label / span / weeks come from `useAcademicYear()`, the single
// team-scoped academic-year value the rest of the app already runs on (/year's
// roadmap + progression, and app-state's current-week resolver). Deriving the
// label from it means /archive can never disagree with /year. Its unit and
// lesson counts come from the planner store — the teacher's OWN hydrated
// document (mock fixtures with the flag off, Supabase rows with it on) —
// gated on `usePlannerDataState()` so an in-flight or failed hydrate prints
// nothing rather than zero.
//
// ARCHIVED YEARS — NOT SOURCEABLE TODAY, so this hook returns none and reports
// `archiveSupported: false`, which is what the surface renders its copy from.
// This is a deliberate design decision, not an omission. Three separate things
// block a real read, and the first is a schema gap:
//
//   • `school_years` HAS NO ARCHIVE COLUMN (supabase/migrations/
//     20260518102823_initial_schema.sql). "Archived" is expressible only as
//     `!is_active` — and that is NOT the same predicate. Production currently
//     contains a school whose ONLY year row is `is_active = false` with zero
//     units and zero lessons (a provisioning artifact). Under a naive
//     `!is_active` read that teacher would be shown NO current year and one
//     sealed volume of a year they never taught: the same fabrication in a new
//     costume. Sealing needs to be stated explicitly (an `archived_at`, or a
//     status enum distinguishing "sealed" from "provisioned, never activated"),
//     which is a MIGRATION — reported, deliberately not applied.
//   • There is no write path. Nothing rolls a year forward, so no honest
//     archived row can exist yet even with a column to hold it.
//   • The read seam is server-only. lib/planner/supabase-source.ts queries
//     `school_years` (`resolveActiveSchoolYearId`) but awaits `cookies()`, so a
//     client component cannot call it; a real shelf needs a `listSchoolYears`
//     method on the PlannerDataSource contract plus a server action. Per-year
//     COUNTS need more than that again: only `units` carries `school_year_id`
//     (lessons reach a year indirectly through their unit), so a lesson count
//     per archived year is a join, and any lesson not attached to a unit is
//     uncountable per year.
//
// When those land, they wire in through `resolveSchoolYears`' `archived` /
// `archiveSupported` inputs — the shelf's render path stays live and is pinned
// by tests/archive-school-years.test.ts, so this is a wire left connected, not
// a feature deleted.

import { useMemo } from "react";

import {
  usePlanner,
  usePlannerDataState,
  type PlannerDataState,
} from "@/lib/planner-store";
import {
  useAcademicYear,
  academicYearDateToIso,
} from "@/lib/use-academic-year";
import { weeksInRange } from "@/lib/year-calendar";

/** One subject band on a volume's page-edge — name + its `.cp-subj` class. */
export interface ArchiveSubjectBand {
  id: string;
  name: string;
  /** subject id, used as the `.cp-subj.<cls>` class for the locked color. */
  cls: string;
}

/**
 * How much of the surface can be trusted right now.
 *
 *   pending → the planner hydrate is in flight; counts are UNKNOWN, not zero.
 *   error   → the hydrate threw; the store keeps an empty document mounted, so
 *             without this branch a backend outage reads as "0 lessons".
 *   ready   → counts reflect the teacher's real document.
 *
 * Mirrors `PlannerDataState` deliberately (planner-store.tsx) — one vocabulary
 * for data readiness across the app.
 */
export type SchoolYearsState = "pending" | "error" | "ready";

/** Presentation-ready summary of a school year for the archive shelf. */
export interface SchoolYearSummary {
  /**
   * A render key. For the current year this is DERIVED from the span, not a
   * `school_years.id` — the real uuid is not readable from a client component
   * (see the header). Never treat it as a database identifier.
   */
  id: string;
  /** Display label, e.g. "2026–2027". */
  label: string;
  /** ISO start / end of the academic year. */
  startDate: string;
  endDate: string;
  /** True for the single active (editable) year. */
  isCurrent: boolean;
  /** Instructional weeks in the year, derived the same way /year lays out its
   *  week columns (`weeksInRange`). */
  weeks: number;
  /**
   * Counts across the year. `null` means NOT SOURCEABLE — the surface must
   * render a loading/unavailable affordance rather than a number. Never
   * substitute 0: "no lessons" and "we don't know yet" are different claims.
   */
  unitCount: number | null;
  lessonCount: number | null;
  /** The subject spine, in the catalog's canonical order. */
  subjects: ArchiveSubjectBand[];
}

/** What the archive surface renders from. */
export interface SchoolYearsView {
  state: SchoolYearsState;
  current: SchoolYearSummary | null;
  archived: SchoolYearSummary[];
  /**
   * Whether year archiving exists at all — read + write path AND a schema that
   * can express "sealed". False today (see the header); the surface uses it to
   * explain an empty shelf honestly instead of implying the teacher simply has
   * no history.
   */
  archiveSupported: boolean;
}

/** Anything with the soft-archive flag both `Lesson` and `Unit` carry. */
interface MaybeArchived {
  archived?: boolean;
}

export interface ResolveSchoolYearsInput {
  /** Readiness of the planner document the counts are taken from. */
  dataState: PlannerDataState;
  /** The team's academic-year bounds (`useAcademicYear`). */
  start: Date;
  end: Date;
  /** The hydrated document. Soft-archived rows are excluded from the counts —
   *  views filter them out of every visible surface, so counting them would
   *  overstate the plan. */
  lessons: readonly MaybeArchived[];
  units: readonly MaybeArchived[];
  subjects: readonly ArchiveSubjectBand[];
  /** Archived years from a REAL source. Absent until one exists. */
  archived?: readonly SchoolYearSummary[];
  /** Whether that source exists. Absent → false. */
  archiveSupported?: boolean;
}

/** "2026–2027", or just "2027" when the year opens and closes in one calendar
 *  year (a southern-hemisphere calendar). En dash, matching the `label` column
 *  convention in `school_years`. */
function yearLabel(start: Date, end: Date): string {
  const from = start.getFullYear();
  const to = end.getFullYear();
  return from === to ? `${from}` : `${from}–${to}`;
}

const isLive = (row: MaybeArchived): boolean => row.archived !== true;

/**
 * The pure decision behind `useSchoolYears()`. Exported so the honesty contract
 * is testable without a React tree or a database
 * (tests/archive-school-years.test.ts).
 */
export function resolveSchoolYears(
  input: ResolveSchoolYearsInput,
): SchoolYearsView {
  const state: SchoolYearsState =
    input.dataState === "pending"
      ? "pending"
      : input.dataState === "error"
        ? "error"
        : "ready";

  // Counts are the ONLY part gated on the hydrate. The span comes from a
  // settings value that is available immediately, so a pending surface still
  // names the year it is about instead of blanking out.
  const counted = state === "ready";
  const startDate = academicYearDateToIso(input.start);
  const endDate = academicYearDateToIso(input.end);

  const current: SchoolYearSummary = {
    id: `current:${startDate}`,
    label: yearLabel(input.start, input.end),
    startDate,
    endDate,
    isCurrent: true,
    weeks: weeksInRange(input.start, input.end),
    unitCount: counted ? input.units.filter(isLive).length : null,
    lessonCount: counted ? input.lessons.filter(isLive).length : null,
    subjects: input.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      cls: s.cls,
    })),
  };

  // `archiveSupported` GATES the shelf, it does not merely describe it. A
  // caller that hands over archived years without declaring a real source
  // behind them gets none rendered — which is the whole failure this file was
  // rewritten for, and the cheapest way to stop it recurring is to make
  // "these came from somewhere real" a claim someone has to make explicitly.
  const archiveSupported = input.archiveSupported ?? false;

  return {
    state,
    current,
    archived: archiveSupported ? [...(input.archived ?? [])] : [],
    archiveSupported,
  };
}

/**
 * The school years for the archive surface: the current year (from the team's
 * academic-year setting + the teacher's hydrated document) and any archived
 * years a real source supplies — today, none.
 *
 * Must render inside a `<PlannerProvider>`; every route in the (planner) group
 * is, including /archive.
 */
export function useSchoolYears(): SchoolYearsView {
  const { start, end } = useAcademicYear();
  const { lessons, units, subjects } = usePlanner();
  const dataState = usePlannerDataState();

  return useMemo(
    () =>
      resolveSchoolYears({
        dataState,
        start,
        end,
        lessons,
        units,
        subjects,
      }),
    [dataState, start, end, lessons, units, subjects],
  );
}
