// year-standards-coverage.ts — pure helper that rolls a lesson set up into a
// standards-coverage report for the Yearly view's StandardsCoveragePanel.
//
// "Coverage" mirrors the STANDARDS stat card (components/year/YearStatCards.tsx)
// so the card and the panel never disagree: a standard is COUNTED when any
// lesson in the set tags it (the denominator), and TAUGHT when at least one
// DONE lesson tags it (the numerator). A standard tagged only by not-yet-done
// lessons is an untaught "gap". There is no external "required standards" list
// in the data model yet (Phase 1B+), so coverage is relative to the standards
// that actually appear in the scoped lessons.
//
// Pure + side-effect-free so it memoizes cleanly. The caller passes the already
// archived-filtered, scope-narrowed lessons (year → subject → unit → week).

import type { Lesson, LessonStatus } from "@/lib/types";

/** One lesson that tags a standard, with enough context to deep-link back. */
export interface CoverageLessonRef {
  id: string;
  title: string;
  status: LessonStatus;
  week: number;
  day: number;
}

/** A standard surfaced in the coverage panel. */
export interface StandardCoverageRef {
  code: string;
  /** True when ≥1 DONE lesson tags this standard (matches YearStatCards). */
  taught: boolean;
  /** Lessons tagging this standard, in week→day order. */
  lessonsCovering: CoverageLessonRef[];
}

export interface StandardsCoverage {
  /** All standards appearing in the lesson set, sorted by code. */
  standards: StandardCoverageRef[];
  /** Count taught (≥1 done lesson) — the STANDARDS card numerator. */
  covered: number;
  /** Count of unique standards in the set — the STANDARDS card denominator. */
  total: number;
}

/** Build the coverage report for a (scoped, archived-filtered) lesson set. */
export function standardsCoverage(lessons: Lesson[]): StandardsCoverage {
  const map = new Map<string, StandardCoverageRef>();
  // Stable week→day order so each standard's covering-lessons read chronologically.
  const ordered = [...lessons].sort((a, b) => a.week - b.week || a.day - b.day);
  for (const l of ordered) {
    for (const code of l.standards) {
      let ref = map.get(code);
      if (!ref) {
        ref = { code, taught: false, lessonsCovering: [] };
        map.set(code, ref);
      }
      ref.lessonsCovering.push({
        id: l.id,
        title: l.title,
        status: l.status,
        week: l.week,
        day: l.day,
      });
      if (l.status === "done") ref.taught = true;
    }
  }
  const standards = Array.from(map.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  return {
    standards,
    covered: standards.filter((s) => s.taught).length,
    total: standards.length,
  };
}
