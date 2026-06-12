// deep-links.ts — shareable planner URLs: pure builders + parsers. No I/O.
//
// The URL scheme for "6.12.26 UX roadmap item 07" (deep links, Phase 1A.5):
// stable, copy-pasteable URLs for every week / day / unit that extend the
// EXISTING planner routes rather than inventing new ones:
//
//   /weekly?week=14&subject=math          (optionally &lesson=…&grade=…)
//   /daily?date=2026-09-14&lesson=…       (optionally &grade=…)
//   /subject/math#unit-3
//
// Consumed by the planner route pages (app/(planner)/weekly, /daily,
// /subject/[slug]) to read incoming params, and by "Copy link" actions in
// overflow menus to produce them. Builders emit root-relative URLs; callers
// prepend the origin only when copying to the clipboard.
//
// What goes in the URL (and what doesn't):
//   • State worth SHARING — week number, calendar date, subject, lesson id,
//     unit index — lives in the URL.
//   • Ephemeral state — open menus, selection, scroll — does NOT.
//   • Links NEVER encode Personal/Master mode: each viewer resolves
//     Personal-first per the forking model (CLAUDE.md §2), so the same URL
//     shows each teacher their own version.
//   • Grade scoping is always an explicit `grade` param, never assumed —
//     CLAUDE.md's hard rule that no data shape may assume a single grade.
//     It is optional today (the beta is Grade 5-only) but carried verbatim
//     so multi-grade links work without a scheme change.
//
// Parsers are strict-but-forgiving: a REQUIRED field that fails validation
// (non-integer week, malformed date) nulls the whole link; an OPTIONAL field
// that fails validation (unknown subject, bad lesson/grade) is silently
// dropped while the rest of the link survives. A typo'd share should degrade
// to "right view, default focus", not a dead end.

import type { SubjectId } from "./types";
import { SUBJECTS } from "./mock/subjects";

// ── Link shapes ───────────────────────────────────────────────────────────

/** A link into the Weekly view. `week` is the 1-based academic week number
 *  (same integer the `Lesson.week` field carries). */
export interface WeeklyLink {
  week: number;
  subject?: SubjectId;
  lesson?: string;
  grade?: string;
}

/** A link into the Daily view. `date` is a local calendar date, YYYY-MM-DD —
 *  the same shape lib/use-holidays.ts and lib/use-academic-year.ts store. */
export interface DailyLink {
  date: string;
  lesson?: string;
  grade?: string;
}

/** A link into a per-subject Curriculum page (/subject/[slug]), optionally
 *  anchored to a unit via the `#unit-N` hash. `unit` is 1-based. */
export interface SubjectLink {
  subject: SubjectId;
  unit?: number;
}

// ── Validation primitives ─────────────────────────────────────────────────

/** The 8 locked subject ids (CLAUDE.md §4), via the canonical runtime list.
 *  lib/mock/subjects.ts is the same source palette.tsx and the planner
 *  store validate against, so an unknown slug here is unknown everywhere. */
const SUBJECT_ID_SET = new Set<string>(SUBJECTS.map((s) => s.id));

/** YYYY-MM-DD check — shape mirrors ISO_DATE_RE in lib/use-holidays.ts,
 *  plus REAL calendar validation: a typo'd shared link must degrade to
 *  "right view, default focus", not hand every consumer an impossible date
 *  (§4a review M4 + gate finding). Whether the date falls inside the academic
 *  year stays the consuming view's call, since that depends on per-school
 *  calendar configuration this pure module must not assume. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(value: string): boolean {
  const m = value.match(ISO_DATE_RE);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject calendar-impossible days (Feb 30, Apr 31, non-leap Feb 29) by
  // round-tripping through a UTC Date: if any component is rewritten, the
  // calendar rejected it. UTC sidesteps DST/local-offset edge cases — this
  // is a validity check, never a timezone-bearing value.
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/** `#unit-3` (leading `#` optional, as `location.hash` includes it but a
 *  stored fragment string may not). */
const UNIT_HASH_RE = /^#?unit-(\d+)$/;

/** A valid week number is a positive integer (weeks are 1-based). The
 *  upper bound is a sanity cap, not calendar knowledge — no school year
 *  has hundreds of weeks, and an absurd `week=1e20` should not reach the
 *  views (§4a review L6). */
const MAX_WEEK = 99;
function isValidWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= MAX_WEEK;
}

function isValidSubject(value: string): value is SubjectId {
  return SUBJECT_ID_SET.has(value);
}

// ── Builders ──────────────────────────────────────────────────────────────
// All builders return root-relative URLs and omit absent params entirely
// (never `subject=undefined`). URLSearchParams handles the encoding, so
// lesson ids and grade labels with reserved characters round-trip safely.

/** `/weekly?week=14&subject=math&lesson=…&grade=…`. Throws on a week its
 *  own parser would reject — an invalid build input is a callsite bug,
 *  and a silently unparseable share-link is the worst failure mode. */
export function buildWeeklyLink(l: WeeklyLink): string {
  if (!isValidWeek(l.week)) {
    throw new Error(`buildWeeklyLink: invalid week ${l.week}`);
  }
  const params = new URLSearchParams();
  params.set("week", String(l.week));
  if (l.subject) params.set("subject", l.subject);
  if (l.lesson) params.set("lesson", l.lesson);
  if (l.grade) params.set("grade", l.grade);
  return `/weekly?${params.toString()}`;
}

/** `/daily?date=2026-09-14&lesson=…&grade=…`. Throws on a date its own
 *  parser would reject (see buildWeeklyLink). */
export function buildDailyLink(l: DailyLink): string {
  if (!isValidDate(l.date)) {
    throw new Error(`buildDailyLink: invalid date ${l.date}`);
  }
  const params = new URLSearchParams();
  params.set("date", l.date);
  if (l.lesson) params.set("lesson", l.lesson);
  if (l.grade) params.set("grade", l.grade);
  return `/daily?${params.toString()}`;
}

/** `/subject/math` or `/subject/math#unit-3`. SubjectId is a closed
 *  lowercase-slug union, so the path segment needs no encoding. */
export function buildSubjectLink(l: SubjectLink): string {
  if (l.unit !== undefined && (!Number.isInteger(l.unit) || l.unit < 1)) {
    throw new Error(`buildSubjectLink: invalid unit ${l.unit}`);
  }
  const hash = l.unit !== undefined ? `#unit-${l.unit}` : "";
  return `/subject/${l.subject}${hash}`;
}

// ── Parsers ───────────────────────────────────────────────────────────────

/** Parse Weekly-view search params. Missing/invalid `week` ⇒ null (it is
 *  the link's one required field); invalid optional fields are dropped. */
export function parseWeeklyParams(params: URLSearchParams): WeeklyLink | null {
  const rawWeek = params.get("week");
  if (rawWeek === null || !/^\d+$/.test(rawWeek)) return null;
  const week = Number(rawWeek);
  if (!isValidWeek(week)) return null;

  const link: WeeklyLink = { week };
  const subject = params.get("subject");
  if (subject !== null && isValidSubject(subject)) link.subject = subject;
  const lesson = params.get("lesson");
  if (lesson) link.lesson = lesson;
  const grade = params.get("grade");
  if (grade) link.grade = grade;
  return link;
}

/** Parse Daily-view search params. Missing/malformed `date` ⇒ null;
 *  invalid optional fields are dropped. */
export function parseDailyParams(params: URLSearchParams): DailyLink | null {
  const date = params.get("date");
  if (date === null || !isValidDate(date)) return null;

  const link: DailyLink = { date };
  const lesson = params.get("lesson");
  if (lesson) link.lesson = lesson;
  const grade = params.get("grade");
  if (grade) link.grade = grade;
  return link;
}

/** Parse a `#unit-3` fragment (with or without the leading `#`) into the
 *  1-based unit index, or null when the hash is absent or malformed. */
export function parseUnitHash(hash: string): number | null {
  const m = hash.match(UNIT_HASH_RE);
  if (!m) return null;
  const unit = Number(m[1]);
  return Number.isInteger(unit) && unit >= 1 ? unit : null;
}
