"use client";

// use-school-months — teacher-scoped preference for which calendar months
// belong to the school's academic year.
//
// /year always renders all 12 calendar months by default; this hook gates
// which subset the teacher actually sees. The selection is a list of 0-based
// calendar month indices (0 = January, 11 = December), persisted to
// localStorage so it survives across sessions and is per-device (a real
// backend will lift this onto the school/teacher row later — the storage
// key is namespaced under `mycurricula:` so it never collides with another
// app on the same origin).
//
// SSR-safe pattern mirrors components/weekly/WeeklyShell.tsx's matchMedia
// hydration:
//   1. The initial state is the SSR default (ALL_SCHOOL_MONTHS) so the
//      server-rendered HTML matches the first client render.
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs.
//
// The setter accepts any number[] (so the settings page can pass a preset
// from SCHOOL_MONTH_PRESETS directly); the hook normalizes — clamps to
// 0..11, deduplicates, and sorts — before writing so consumers always see
// a clean canonical list.

import { useCallback, useEffect, useState } from "react";
import { ALL_SCHOOL_MONTHS } from "./year-calendar";

// ── Storage ────────────────────────────────────────────────────────────────

/** localStorage key. Versioned under `mycurricula:` to avoid origin collisions. */
const STORAGE_KEY = "mycurricula:school-months";

/**
 * Normalize a list of calendar month indices: keep only integers in 0..11,
 * dedupe, and sort ascending. An invalid input falls back to all 12 months
 * (matching the default — better than rendering an empty year).
 */
function normalize(input: unknown): number[] {
  if (!Array.isArray(input)) return [...ALL_SCHOOL_MONTHS];
  const seen = new Set<number>();
  for (const v of input) {
    if (typeof v !== "number") continue;
    if (!Number.isInteger(v)) continue;
    if (v < 0 || v > 11) continue;
    seen.add(v);
  }
  if (seen.size === 0) return [...ALL_SCHOOL_MONTHS];
  return Array.from(seen).sort((a, b) => a - b);
}

/** Read + parse the stored value, or return null if unset / invalid. */
function readFromStorage(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    // Malformed JSON or storage disabled (private mode) — fall through.
    return null;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns `[months, setMonths]` for the teacher's chosen school-year months.
 *
 * The state is a sorted list of 0-based calendar month indices. The setter
 * accepts any number[] — the hook normalizes before persisting.
 *
 * Cross-tab sync: when another tab writes to the same storage key, the
 * `storage` event fires here and the local state updates so a teacher with
 * /year and /settings open simultaneously sees consistent state.
 */
export function useSchoolMonths(): [number[], (months: number[]) => void] {
  // Start with the SSR-safe default. We intentionally do NOT read
  // localStorage during the initial render — that would diverge the
  // server-rendered HTML from the first client render and produce a
  // hydration mismatch.
  const [months, setMonthsState] = useState<number[]>(() => [
    ...ALL_SCHOOL_MONTHS,
  ]);

  // Post-mount: sync from localStorage if a value is set.
  useEffect(() => {
    const stored = readFromStorage();
    if (stored != null) setMonthsState(stored);
  }, []);

  // Cross-tab sync. The `storage` event fires on OTHER tabs (not the one
  // doing the write), so this picks up settings-page changes while /year
  // is open in another tab without any extra plumbing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        // Cleared elsewhere — fall back to the default.
        setMonthsState([...ALL_SCHOOL_MONTHS]);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        setMonthsState(normalize(parsed));
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
  const setMonths = useCallback((next: number[]): void => {
    const normalized = normalize(next);
    setMonthsState(normalized);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage disabled / quota exceeded — state still updates in-memory.
    }
  }, []);

  return [months, setMonths];
}
