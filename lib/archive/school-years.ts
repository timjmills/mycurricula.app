// lib/archive/school-years.ts — school-year summaries for the Curriculum
// Archive surface (/archive).
//
// A school year is either CURRENT (the one active plan teachers edit) or
// ARCHIVED (a finished year, kept read-only so the team can look back at what
// they taught). This module exposes a flat, presentation-ready summary for each
// year plus the locked 8-subject "spine" used to render a volume's page-edge.
//
// Data source: today the planner runs on mock fixtures (NEXT_PUBLIC_PLANNER_USE_
// SUPABASE is off), so `useSchoolYears()` returns the curated fixture below —
// which mirrors the real rows already loaded to Supabase (2026–2027 active with
// 185 lessons / 35 units; 2025–2026 archived with its prior plan intact). When
// the planner flips to Supabase the same hook reads `school_years` instead; the
// component contract (SchoolYearSummary) does not change. See
// scripts/README-grade5-load.md for the loaded data and lib/planner/source.ts
// for the `schoolYearId`-scoped read the archived drill-in will use.

import { SUBJECTS } from "@/lib/mock";

/** One subject band on a volume's page-edge — name + its `.cp-subj` class. */
export interface ArchiveSubjectBand {
  id: string;
  name: string;
  /** subject id, used as the `.cp-subj.<cls>` class for the locked color. */
  cls: string;
}

/** Presentation-ready summary of a school year for the archive shelf. */
export interface SchoolYearSummary {
  id: string;
  /** Display label, e.g. "2026–2027". */
  label: string;
  /** ISO start / end of the academic year. */
  startDate: string;
  endDate: string;
  /** True for the single active (editable) year. */
  isCurrent: boolean;
  /** Planned instructional weeks in the year. */
  weeks: number;
  /** Counts across the whole year (master plan). */
  unitCount: number;
  lessonCount: number;
  /** The locked 8-subject spine, in canonical order. */
  subjects: ArchiveSubjectBand[];
}

// The locked 8-subject spine — every year is taught across the same team-wide
// subject set (CLAUDE.md §4), so the page-edge bands are identical across
// volumes; only their saturation differs (live vs archived) in the UI.
const SUBJECT_SPINE: ArchiveSubjectBand[] = SUBJECTS.map((s) => ({
  id: s.id,
  name: s.name,
  cls: s.cls,
}));

// Fixture mirroring the rows loaded to production Supabase. Ordered most-recent
// first so the shelf reads top-to-bottom like a stack of years.
const FIXTURE: SchoolYearSummary[] = [
  {
    id: "2026-2027",
    label: "2026–2027",
    startDate: "2026-08-30",
    endDate: "2027-06-24",
    isCurrent: true,
    weeks: 40,
    unitCount: 35,
    lessonCount: 185,
    subjects: SUBJECT_SPINE,
  },
  {
    id: "2025-2026",
    label: "2025–2026",
    startDate: "2025-08-24",
    endDate: "2026-06-18",
    isCurrent: false,
    weeks: 40,
    unitCount: 8,
    lessonCount: 15,
    subjects: SUBJECT_SPINE,
  },
];

/**
 * The school years for the archive surface. Returns the current year first,
 * then archived years most-recent-first.
 *
 * Stable identity (module-level constant) so consumers can use it directly in
 * render without memoization churn. When the planner moves to Supabase this
 * becomes an async read of `school_years`; the return shape is unchanged.
 */
export function useSchoolYears(): {
  current: SchoolYearSummary | null;
  archived: SchoolYearSummary[];
} {
  const current = FIXTURE.find((y) => y.isCurrent) ?? null;
  const archived = FIXTURE.filter((y) => !y.isCurrent);
  return { current, archived };
}
