"use client";

// use-school-week — team-scoped preference for which weekdays the school
// runs (the "school week").
//
// CLAUDE.md §1 mandates this be configurable: schools in Qatar run
// Sun–Thu, US schools run Mon–Fri, and some programs run a 3-day week.
// Every calendar surface (Weekly grid columns, Daily day list, Schedule)
// must derive its days from this configuration — never hard-code a
// 5-day Mon–Fri assumption.
//
// SSR-safe pattern mirrors `lib/use-school-months.ts`:
//   1. Initial state is the SSR default (DEFAULT_SCHOOL_WEEK = Sun–Thu,
//      matching the beta school) so server-rendered HTML matches the
//      first client render.
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs so a
//      teacher with /weekly and /settings open simultaneously sees a
//      consistent week shape.
//
// The setter normalizes — clamps to the seven valid weekday tokens,
// dedupes, sorts by weekday position (Sun=0..Sat=6), and refuses to
// shrink the selection to zero (we always keep at least one day so the
// Weekly grid has at least one column to render).

import { useCallback, useEffect, useState } from "react";

// ── Types + constants ──────────────────────────────────────────────────────

/** The seven weekday tokens, in Sunday-first order (Sun=0..Sat=6). */
export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Canonical Sunday-first order for normalization + display. */
export const WEEKDAY_ORDER: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/**
 * Position of each weekday in the Sun-first order, so we can sort a
 * user's selection deterministically without depending on Array index
 * lookups in hot paths.
 */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Default school week — matches the beta Qatar school (Sun–Thu) and
 * the existing mock fixtures. Treat this as sample data, not a
 * constraint (CLAUDE.md §1).
 */
export const DEFAULT_SCHOOL_WEEK: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
] as const;

/**
 * Named preset registry. The settings UI offers Sun–Thu / Mon–Fri /
 * Mon–Sat by default; `custom` is the implicit selection when the
 * user's set matches no named preset.
 */
export const SCHOOL_WEEK_PRESETS = {
  sunThu: ["sun", "mon", "tue", "wed", "thu"] as Weekday[],
  monFri: ["mon", "tue", "wed", "thu", "fri"] as Weekday[],
  monSat: ["mon", "tue", "wed", "thu", "fri", "sat"] as Weekday[],
} as const;

export type SchoolWeekPresetKey = keyof typeof SCHOOL_WEEK_PRESETS;

// ── Storage ────────────────────────────────────────────────────────────────

/**
 * localStorage key. School week is TEAM-scoped — every teacher on the
 * grade-level team follows the same weekly cadence so the Weekly grid
 * columns line up across the team. Team-scoped settings live under
 * `mycurricula:team:*` and migrate to a `team_settings` row when
 * Supabase lands.
 */
const STORAGE_KEY = "mycurricula:team:school-week-days";

/**
 * Normalize a list of weekday tokens: keep only valid tokens, dedupe,
 * and sort by Sun-first position. If the result is empty (invalid
 * input, or the caller passed `[]`), fall back to the default so the
 * Weekly grid is never asked to render zero columns.
 */
function normalize(input: unknown): Weekday[] {
  if (!Array.isArray(input)) return [...DEFAULT_SCHOOL_WEEK];
  const seen = new Set<Weekday>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (v in WEEKDAY_INDEX) {
      seen.add(v as Weekday);
    }
  }
  if (seen.size === 0) return [...DEFAULT_SCHOOL_WEEK];
  return Array.from(seen).sort((a, b) => WEEKDAY_INDEX[a] - WEEKDAY_INDEX[b]);
}

/**
 * Read + parse the stored value. Returns null when unset or when the
 * stored JSON is malformed (private mode, quota exhaustion, etc.).
 */
function readFromStorage(): Weekday[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    // Malformed JSON or storage disabled — fall through.
    return null;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns the team's school-week selection plus a setter.
 *
 * The state is a sorted list of weekday tokens. The setter accepts
 * any Weekday[] — the hook normalizes (clamps to valid tokens,
 * dedupes, sorts, refuses empty) before persisting.
 *
 * Cross-tab sync: when another tab writes to the same storage key,
 * the `storage` event fires here and the local state updates.
 */
export function useSchoolWeek(): {
  days: Weekday[];
  setDays: (d: Weekday[]) => void;
} {
  // Start with the SSR-safe default. We intentionally do NOT read
  // localStorage during the initial render — that would diverge the
  // server-rendered HTML from the first client render and produce a
  // hydration mismatch.
  const [days, setDaysState] = useState<Weekday[]>(() => [
    ...DEFAULT_SCHOOL_WEEK,
  ]);

  // Post-mount: sync from localStorage if a value is set.
  useEffect(() => {
    const stored = readFromStorage();
    if (stored != null) setDaysState(stored);
  }, []);

  // Cross-tab sync. The `storage` event fires on OTHER tabs (not the
  // one doing the write), so this picks up settings-page changes while
  // /weekly is open in another tab without any extra plumbing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        // Cleared elsewhere — fall back to the default.
        setDaysState([...DEFAULT_SCHOOL_WEEK]);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        setDaysState(normalize(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Setter. Normalizes, updates local state, and persists. Wrapped in
  // useCallback so consumers can pass it through props / deps without
  // forcing re-renders.
  const setDays = useCallback((next: Weekday[]): void => {
    const normalized = normalize(next);
    setDaysState(normalized);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage disabled / quota exceeded — state still updates in-memory.
    }
  }, []);

  return { days, setDays };
}

// ── Preset helpers ─────────────────────────────────────────────────────────

/**
 * Find the preset key whose weekday set matches the given selection
 * exactly. Returns "custom" if no preset matches. Order-insensitive
 * because both sides are normalized through `Set`.
 */
export function detectSchoolWeekPreset(
  days: Weekday[],
): SchoolWeekPresetKey | "custom" {
  const set = new Set(days);
  for (const [key, value] of Object.entries(SCHOOL_WEEK_PRESETS)) {
    if (value.length !== set.size) continue;
    if (value.every((d) => set.has(d))) {
      return key as SchoolWeekPresetKey;
    }
  }
  return "custom";
}
