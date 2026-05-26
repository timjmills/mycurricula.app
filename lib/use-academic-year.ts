"use client";

// use-academic-year — TEAM-scoped preference for the start + end dates of
// the school's academic year.
//
// The /year Roadmap and Progression views previously derived their week
// range from the hard-coded `DEFAULT_TERM_START` + `WEEKS_IN_YEAR` constants
// in lib/year-calendar.ts. That worked for a single mock fixture, but real
// schools need to set their own boundaries so the timeline visibly aligns
// with the calendar they actually teach against — request from the user
// 2026-05-25: "in the settings there needs to be when the calendar starts
// and ends so that roadmap and progression can start and end at the same
// exactly."
//
// Storage:
//   - localStorage keys `mycurricula:team:academic-year-start` +
//     `mycurricula:team:academic-year-end`. TEAM-scoped because every
//     teacher on a grade-level team teaches against the same calendar (the
//     same policy as use-school-months). The legacy `school-months` hook
//     established the `mycurricula:team:*` namespace; this one follows.
//   - Values stored as ISO date strings (YYYY-MM-DD); the hook hands back
//     Date objects.
//
// SSR-safe pattern (mirrors lib/use-school-months.ts):
//   1. Initial state = the heuristic defaults (sensible North-American
//      academic year). Server-rendered HTML matches the first client render
//      so no hydration mismatch.
//   2. A post-mount effect syncs from localStorage.
//   3. `storage` event listener picks up cross-tab changes — so a teacher
//      with /year and /settings open in two tabs sees consistent state.
//
// Validation:
//   - start < end (strict).
//   - Span clamped to 30..60 weeks. A school year shorter than ~30 weeks or
//     longer than ~60 weeks is almost certainly user error; the setter
//     clamps the span by adjusting the end date toward the boundary rather
//     than rejecting the write outright (so a half-typed date never strands
//     the user).

import { useCallback, useEffect, useState } from "react";

// ── Storage ────────────────────────────────────────────────────────────────

/**
 * localStorage keys. Both academic-year endpoints are TEAM-scoped — every
 * teacher on the grade-level team follows the same calendar. The mental
 * model is documented in lib/app-state.tsx (CURRICULUM_LABEL_KEY) + the
 * 2026-05-25 scoping clarification: team settings live under
 * `mycurricula:team:*` and migrate to a `team_settings` row when the
 * Supabase backend lands.
 */
const STORAGE_KEY_START = "mycurricula:team:academic-year-start";
const STORAGE_KEY_END = "mycurricula:team:academic-year-end";

// ── Validation constants ───────────────────────────────────────────────────

/** Minimum span in weeks the setter accepts before clamping the end date. */
const MIN_SPAN_WEEKS = 30;
/** Maximum span in weeks the setter accepts before clamping the end date. */
const MAX_SPAN_WEEKS = 60;
/** ms per week — pre-computed for cheaper span math. */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// ── Default heuristic ──────────────────────────────────────────────────────

/**
 * Heuristic defaults for a North-American academic year:
 *
 *   - start = the FIRST Sunday in August of the "current academic year".
 *     If today is on or after August 1, the current academic year is the
 *     one starting THIS August; otherwise it's the one that started LAST
 *     August (so a teacher visiting in February sees a year that already
 *     started, not one that hasn't begun yet).
 *   - end   = the LAST Friday in June of the year following start.
 *
 * Sunday/Friday match the most common US weekday boundaries — schools
 * running Sun–Thu (the beta school's calendar) start on a Sunday; schools
 * running Mon–Fri end on a Friday. The user can always override.
 *
 * Both endpoints are anchored to local midnight to keep date math simple
 * across timezones — we never compare to a UTC instant.
 */
function defaultStart(now: Date = new Date()): Date {
  const month = now.getMonth(); // 0 = January
  // If we're already past August 1, the current academic year started
  // THIS August. Otherwise it started LAST August.
  const startYear = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return firstSundayInAugust(startYear);
}

function defaultEnd(start: Date): Date {
  // End of the academic year = last Friday of June in the following year.
  return lastFridayInJune(start.getFullYear() + 1);
}

/** First Sunday in August of `year`. */
function firstSundayInAugust(year: number): Date {
  const aug1 = new Date(year, 7, 1); // August = month index 7
  const dayOfWeek = aug1.getDay(); // 0 = Sunday
  const offsetToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  return new Date(year, 7, 1 + offsetToSunday);
}

/** Last Friday in June of `year`. */
function lastFridayInJune(year: number): Date {
  const jun30 = new Date(year, 5, 30); // June = month index 5
  const dayOfWeek = jun30.getDay(); // 0 = Sunday … 5 = Friday
  const offsetBack = (dayOfWeek - 5 + 7) % 7; // days back to the previous Friday
  return new Date(year, 5, 30 - offsetBack);
}

// ── Date <-> ISO helpers ───────────────────────────────────────────────────

/**
 * Format a Date as "YYYY-MM-DD" in local time. We avoid `toISOString()` here
 * because it emits a UTC instant — a date entered as "Aug 3" in a UTC+8
 * timezone would round-trip as "Aug 2" via UTC. Local YYYY-MM-DD keeps the
 * calendar day stable.
 */
function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" string back into a local-midnight Date. Returns null
 * if the input is malformed — callers fall back to the heuristic default.
 */
function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const out = new Date(y, mo, d);
  // Defensive: catch invalid combinations like "2026-02-31" that JS would
  // happily roll forward into March.
  if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) {
    return null;
  }
  return out;
}

// ── Storage IO ─────────────────────────────────────────────────────────────

function readStart(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_START);
    if (raw == null) return null;
    return isoToDate(raw);
  } catch {
    return null;
  }
}

function readEnd(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_END);
    if (raw == null) return null;
    return isoToDate(raw);
  } catch {
    return null;
  }
}

// ── Validation / normalization ────────────────────────────────────────────

/**
 * Normalize a (start, end) pair so it satisfies the invariants:
 *   - start < end.
 *   - (end - start) clamped to [MIN_SPAN_WEEKS, MAX_SPAN_WEEKS].
 *
 * Returns a fresh pair — never mutates the inputs. Strategy:
 *   - If end <= start, push end to start + the heuristic default span
 *     (38 weeks — sits midway in the valid range).
 *   - If span < MIN_SPAN_WEEKS, push end forward to start + MIN.
 *   - If span > MAX_SPAN_WEEKS, pull end back to start + MAX.
 *
 * `start` is treated as the anchor; we only ever move `end` so the user's
 * most recent edit on either side is preserved as faithfully as possible.
 */
function normalizePair(start: Date, end: Date): { start: Date; end: Date } {
  const safeStart = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  let safeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const spanMs = safeEnd.getTime() - safeStart.getTime();
  const spanWeeks = spanMs / MS_PER_WEEK;

  if (spanWeeks <= 0) {
    // Invalid order — reset to a sensible default span.
    safeEnd = new Date(safeStart.getTime() + 38 * MS_PER_WEEK);
  } else if (spanWeeks < MIN_SPAN_WEEKS) {
    safeEnd = new Date(safeStart.getTime() + MIN_SPAN_WEEKS * MS_PER_WEEK);
  } else if (spanWeeks > MAX_SPAN_WEEKS) {
    safeEnd = new Date(safeStart.getTime() + MAX_SPAN_WEEKS * MS_PER_WEEK);
  }

  return { start: safeStart, end: safeEnd };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseAcademicYearResult {
  /** First day of the school year (local midnight). */
  start: Date;
  /** Last day of the school year (local midnight). */
  end: Date;
  /** Update the start date. The end is clamped to maintain invariants. */
  setStart: (d: Date) => void;
  /** Update the end date. Clamped to maintain invariants. */
  setEnd: (d: Date) => void;
}

/**
 * Returns the team-scoped academic-year endpoints + setters. The setters
 * persist to localStorage and validate before writing.
 *
 * Cross-tab sync is wired up via the `storage` event — a settings-page
 * edit in one tab is reflected in /year open in another tab without any
 * extra plumbing.
 */
export function useAcademicYear(): UseAcademicYearResult {
  // SSR-safe initial state: the heuristic defaults. We do NOT read
  // localStorage during initial render — that would diverge the SSR HTML
  // from the first client render and cause a hydration mismatch.
  const [start, setStartState] = useState<Date>(() => defaultStart());
  const [end, setEndState] = useState<Date>(() => defaultEnd(defaultStart()));

  // Post-mount: read stored values, fall back to heuristic defaults.
  useEffect(() => {
    const storedStart = readStart();
    const storedEnd = readEnd();
    const nextStart = storedStart ?? defaultStart();
    const nextEnd = storedEnd ?? defaultEnd(nextStart);
    const { start: ns, end: ne } = normalizePair(nextStart, nextEnd);
    setStartState(ns);
    setEndState(ne);
  }, []);

  // Cross-tab sync. Fires only on OTHER tabs, never the writer.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY_START && e.key !== STORAGE_KEY_END) return;
      const s = readStart() ?? defaultStart();
      const en = readEnd() ?? defaultEnd(s);
      const norm = normalizePair(s, en);
      setStartState(norm.start);
      setEndState(norm.end);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setStart = useCallback(
    (next: Date): void => {
      const { start: ns, end: ne } = normalizePair(next, end);
      setStartState(ns);
      setEndState(ne);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(STORAGE_KEY_START, dateToIso(ns));
        window.localStorage.setItem(STORAGE_KEY_END, dateToIso(ne));
      } catch {
        // Storage disabled / quota — state still updates in-memory.
      }
    },
    [end],
  );

  const setEnd = useCallback(
    (next: Date): void => {
      const { start: ns, end: ne } = normalizePair(start, next);
      setStartState(ns);
      setEndState(ne);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(STORAGE_KEY_START, dateToIso(ns));
        window.localStorage.setItem(STORAGE_KEY_END, dateToIso(ne));
      } catch {
        // ignore
      }
    },
    [start],
  );

  return { start, end, setStart, setEnd };
}

// ── Pure helpers — exported for use by year-calendar.ts and tests ─────────

export {
  defaultStart as defaultAcademicYearStart,
  defaultEnd as defaultAcademicYearEnd,
  dateToIso as academicYearDateToIso,
  isoToDate as academicYearIsoToDate,
  normalizePair as normalizeAcademicYearPair,
  MIN_SPAN_WEEKS as ACADEMIC_YEAR_MIN_SPAN_WEEKS,
  MAX_SPAN_WEEKS as ACADEMIC_YEAR_MAX_SPAN_WEEKS,
};
