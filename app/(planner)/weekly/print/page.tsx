// app/(planner)/weekly/print/page.tsx — the /weekly/print route entry.
//
// A server component whose only job is to read the search params and hand them
// to the client sheet. Same split as app/(planner)/weekly/page.tsx, which is how
// this codebase reads a search param (it deliberately avoids `useSearchParams`
// and the Suspense boundary it drags in — see components/daily/LessonDetail.tsx:282).
//
// WHY THIS EXISTS AT ALL. The route previously took no params, so `week` fell
// back to whatever the store happened to be sitting on — meaning a teacher who
// navigated to week 7 and hit Print got week 12 on paper, with nothing on the
// sheet to say so. `/weekly/print?week=7` is now the contract any "Print this
// week" affordance links to.
//
// Params:
//   ?week=7             — the week to print. Absent/invalid → the planner's
//                         current week (a bad param must not print a blank
//                         sheet; it prints the sensible default instead).
//   ?subject=math,sel   — narrow to these subject ids. Absent → every subject.
//                         The sheet ANNOUNCES the filter in its header, so a
//                         narrowed printout is never mistaken for the full week.

import type { ReactNode } from "react";
import { WeeklyPrintSheet } from "./WeeklyPrintSheet";

/** First value only — Next hands repeated params as string[], and this scheme
 *  is single-valued (same convention as /weekly and /daily). */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A 1-based week number, or undefined for anything that is not one.
 *
 * Matched against the WHOLE string on purpose. `Number.parseInt` stops at the
 * first non-digit, so it reads "7oops" as 7, "7.9" as 7, and "1e2" as 1 — a
 * corrupted or hand-edited link would then print a week nobody asked for, with
 * the sheet's header confidently naming it. Falling back to the planner's
 * current week is the only honest answer to a param we cannot understand.
 */
function parseWeek(raw: string | undefined): number | undefined {
  if (raw == null || !/^[1-9]\d*$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Comma-separated subject ids, trimmed and de-duped; null when unset/empty. */
function parseSubjects(raw: string | undefined): string[] | null {
  if (raw == null) return null;
  const ids = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
  return ids.length > 0 ? ids : null;
}

export default async function WeeklyPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  return (
    <WeeklyPrintSheet
      week={parseWeek(first(params.week))}
      subjectIds={parseSubjects(first(params.subject))}
    />
  );
}
