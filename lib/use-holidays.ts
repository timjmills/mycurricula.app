"use client";

// use-holidays — team-scoped editor for the school's holidays /
// non-instruction days.
//
// A holiday is a single calendar date (YYYY-MM-DD) plus a free-text name
// (e.g. "Eid al-Fitr", "Spring Break — Mon"). The list persists to
// localStorage under `mycurricula:team:holidays`; per the team-scoping
// doctrine (see lib/app-state.tsx `CURRICULUM_LABEL_KEY` for the full
// mental model) holidays are the SAME for every teacher on the
// grade-level team — they migrate to a `team_settings` row when the
// backend lands.
//
// Each holiday gets a stable `id` (generated on add) so the settings UI
// can render a keyed list and remove a single item without index drift
// across reorders / cross-tab sync.
//
// SSR-safe pattern mirrors lib/use-school-months.ts exactly:
//   1. Initial state is the empty list so server-rendered HTML matches
//      the first client render (no hydration mismatch).
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs.
//
// Default = [] (no holidays). The Year view greys out a week cell only
// when a holiday actually lands on it — an empty default means the view
// is unaffected until a teacher adds one.

import { useCallback, useEffect, useState } from "react";

// ── Public shape ───────────────────────────────────────────────────────────

export interface Holiday {
  /** Generated on add. Unique within the list. */
  id: string;
  /** ISO date string YYYY-MM-DD (calendar date — no time component). */
  date: string;
  /** Free-text label, e.g. "Eid al-Fitr", "Spring Break". */
  name: string;
}

export interface UseHolidaysResult {
  holidays: Holiday[];
  add: (h: Omit<Holiday, "id">) => void;
  remove: (id: string) => void;
  clear: () => void;
}

// ── Storage ────────────────────────────────────────────────────────────────

/**
 * localStorage key. Holidays are TEAM-scoped — every teacher on the
 * grade-level team sees the same set. Per the 2026-05-25 scoping
 * clarification (see lib/app-state.tsx `CURRICULUM_LABEL_KEY` for the
 * full mental model), team settings live under `mycurricula:team:*` and
 * migrate to a `team_settings` row when Supabase lands.
 */
const STORAGE_KEY = "mycurricula:team:holidays";

/** YYYY-MM-DD shape check — keeps malformed dates out of the store. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Generate a short id for a new holiday. Math.random + timestamp is
 * good enough for a localStorage-backed list — collisions are
 * effectively impossible at the scale of one team's holidays (~30/year).
 */
function makeId(): string {
  return `hol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize a parsed value into a clean Holiday[]: drop entries that
 * aren't shaped like a holiday, trim names, default ids, and sort by
 * date ascending so consumers see a canonical list.
 */
function normalize(input: unknown): Holiday[] {
  if (!Array.isArray(input)) return [];
  const cleaned: Holiday[] = [];
  for (const v of input) {
    if (typeof v !== "object" || v === null) continue;
    const obj = v as Record<string, unknown>;
    const date = typeof obj.date === "string" ? obj.date : "";
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!ISO_DATE_RE.test(date)) continue;
    if (!name) continue;
    const id = typeof obj.id === "string" && obj.id ? obj.id : makeId();
    cleaned.push({ id, date, name });
  }
  cleaned.sort((a, b) => a.date.localeCompare(b.date));
  return cleaned;
}

/** Read + parse the stored value. Returns null when unset / malformed. */
function readFromStorage(): Holiday[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return null;
  }
}

/** Persist (or clear) the holidays list. Storage failures are swallowed. */
function writeToStorage(next: Holiday[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled / quota exceeded — in-memory state still updates.
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns the holiday list plus mutation helpers. The list is always
 * sorted by date ascending and survives across tabs via the `storage`
 * event handler below.
 */
export function useHolidays(): UseHolidaysResult {
  // SSR-safe default — empty list. We intentionally do NOT read
  // localStorage during the initial render (that would diverge the
  // server-rendered HTML from the first client render).
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Post-mount: sync from localStorage if a value is set.
  useEffect(() => {
    const stored = readFromStorage();
    if (stored != null) setHolidays(stored);
  }, []);

  // Cross-tab sync. The `storage` event fires on OTHER tabs (not the
  // one doing the write), so editing on /settings/curriculum while
  // /year is open updates the grey-out without any extra plumbing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        setHolidays([]);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        setHolidays(normalize(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────

  const add = useCallback((h: Omit<Holiday, "id">): void => {
    const date = typeof h.date === "string" ? h.date : "";
    const name = typeof h.name === "string" ? h.name.trim() : "";
    if (!ISO_DATE_RE.test(date) || !name) return;
    setHolidays((prev) => {
      const next = [...prev, { id: makeId(), date, name }].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      writeToStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string): void => {
    setHolidays((prev) => {
      const next = prev.filter((h) => h.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback((): void => {
    setHolidays([]);
    writeToStorage([]);
  }, []);

  return { holidays, add, remove, clear };
}
