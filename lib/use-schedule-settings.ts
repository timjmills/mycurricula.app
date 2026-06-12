"use client";

// use-schedule-settings — schedule & rotation configuration state.
//
// Two independent pieces of schedule configuration live here, mirroring
// the SSR-safe localStorage pattern in `lib/use-school-week.ts`
// (SSR default → post-mount localStorage sync → `storage`-event
// cross-tab sync → normalizing setters):
//
//   1. ROTATION — TEAM-scoped. Whether the timetable repeats weekly
//      ("none"), alternates A/B day plans ("ab"), or rotates on an
//      N-day cycle ("cycle", 2–10 instructional days). CLAUDE.md §1
//      mandates rotation support independent of the calendar week —
//      never assume a weekly-only cycle. Team-scoped because the whole
//      grade-level team plans against the same rotation pattern.
//      Stored under `mycurricula:team:schedule-rotation`.
//
//      ONE-TIME SEED: the onboarding wizard already collects rotation +
//      cycle length (lib/onboarding-state.tsx, `data.rotation` /
//      `data.cycleLength` under the `mycurricula:onboarding` key) but
//      until this page existed the choice was never revisitable. On
//      first read, if the team key is unset and a finished-or-partial
//      wizard run exists, we adopt the wizard's value and persist it
//      under the team key — from then on Settings owns the value and
//      wizard edits never re-seed.
//
//   2. TIME BLOCKS — PERSONAL-scoped. The teacher's own daily timetable:
//      per-weekday lists of { start, end, type, subject | label } rows.
//      Personal because each teacher's blocks differ (specialists,
//      pull-outs, co-teaching), matching the per-teacher TimeBlock
//      skeleton in the planning-doc data model. Stored under
//      `mycurricula:user:schedule-blocks`.
//
// Phase 1B seam: both keys migrate to Supabase rows when the backend
// wave lands — rotation onto the `team_settings` row (with the other
// `mycurricula:team:*` values), blocks onto a per-teacher timetable
// table keyed teacher × grade × cycle-day. Planner surfaces do NOT read
// these hooks directly; they go through `lib/use-my-schedule.ts` (the
// read seam) so the fixture fallback and shape conversion live in one
// place.

import { useCallback, useEffect, useState } from "react";
import type { Weekday } from "@/lib/use-school-week";
import { WEEKDAY_INDEX } from "@/lib/use-school-week";
import { SUBJECT_BY_ID } from "@/lib/mock";
import type { SubjectId } from "@/lib/types";

// ── Rotation: types + constants ────────────────────────────────────────────

/** Does the timetable repeat weekly, or rotate? Matches the wizard's
 *  `ScheduleRotation` in lib/onboarding-state.tsx so the seed is 1:1. */
export type ScheduleRotation = "none" | "ab" | "cycle";

export interface RotationSettings {
  rotation: ScheduleRotation;
  /** Cycle length in instructional days. Only meaningful when
   *  `rotation === "cycle"`; clamped to 2–10 (a 1-day cycle is just
   *  "same every day" and >10 stops being a usable rotation). The value
   *  is retained while rotation is "none"/"ab" so switching back to
   *  "cycle" restores the teacher's previous choice. */
  cycleLength: number;
}

export const CYCLE_LENGTH_MIN = 2;
export const CYCLE_LENGTH_MAX = 10;
export const DEFAULT_CYCLE_LENGTH = 4;

export const DEFAULT_ROTATION: RotationSettings = {
  rotation: "none",
  cycleLength: DEFAULT_CYCLE_LENGTH,
};

/**
 * localStorage key. Rotation is TEAM-scoped — the whole grade-level team
 * plans against one rotation pattern, like the school week. Team-scoped
 * settings live under `mycurricula:team:*` and migrate to a
 * `team_settings` row when Supabase lands.
 */
const ROTATION_STORAGE_KEY = "mycurricula:team:schedule-rotation";

/** The onboarding wizard's persistence key (lib/onboarding-state.tsx).
 *  Read once for the rotation seed; never written from here. */
const ONBOARDING_STORAGE_KEY = "mycurricula:onboarding";

const ROTATION_VALUES: readonly ScheduleRotation[] = ["none", "ab", "cycle"];

/** Clamp a cycle length to a valid integer in [MIN, MAX]; non-numbers
 *  fall back to the default. */
function clampCycleLength(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CYCLE_LENGTH;
  }
  return Math.min(
    CYCLE_LENGTH_MAX,
    Math.max(CYCLE_LENGTH_MIN, Math.round(value)),
  );
}

/**
 * Normalize an arbitrary parsed value into RotationSettings: rotation
 * clamped to the three valid tokens (default "none"), cycleLength
 * clamped to a 2–10 integer (default 4).
 */
function normalizeRotation(input: unknown): RotationSettings {
  if (typeof input !== "object" || input === null) {
    return { ...DEFAULT_ROTATION };
  }
  const obj = input as Record<string, unknown>;
  const rotation = ROTATION_VALUES.includes(obj.rotation as ScheduleRotation)
    ? (obj.rotation as ScheduleRotation)
    : "none";
  return { rotation, cycleLength: clampCycleLength(obj.cycleLength) };
}

/** Read + parse the stored rotation. Returns null when unset or when the
 *  stored JSON is malformed (private mode, quota exhaustion, etc.). */
function readRotationFromStorage(): RotationSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROTATION_STORAGE_KEY);
    if (raw == null) return null;
    return normalizeRotation(JSON.parse(raw));
  } catch {
    // Malformed JSON or storage disabled — fall through.
    return null;
  }
}

/**
 * One-time seed from the onboarding wizard. Returns the wizard's
 * rotation + cycle length when a wizard run exists in storage, else
 * null. Only called when the team rotation key is unset — once the seed
 * (or any explicit save) writes the team key, the wizard value is never
 * consulted again.
 */
function seedRotationFromOnboarding(): RotationSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const data = (parsed as { data?: unknown }).data;
    if (typeof data !== "object" || data === null) return null;
    return normalizeRotation(data);
  } catch {
    return null;
  }
}

function persistRotation(value: RotationSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage disabled / quota exceeded — state still updates in-memory.
  }
}

// ── Rotation: hook ─────────────────────────────────────────────────────────

/**
 * Returns the team's schedule-rotation settings plus normalizing setters.
 *
 * SSR-safe: initial state is DEFAULT_ROTATION so server HTML matches the
 * first client render; the real value (stored, or seeded from the
 * onboarding wizard) arrives in a post-mount effect. Cross-tab changes
 * arrive via the `storage` event.
 */
export function useScheduleRotation(): {
  rotation: ScheduleRotation;
  cycleLength: number;
  setRotation: (r: ScheduleRotation) => void;
  setCycleLength: (n: number) => void;
} {
  const [settings, setSettings] = useState<RotationSettings>(() => ({
    ...DEFAULT_ROTATION,
  }));

  // Post-mount: sync from localStorage; seed from the wizard when unset.
  useEffect(() => {
    const stored = readRotationFromStorage();
    if (stored != null) {
      setSettings(stored);
      return;
    }
    const seeded = seedRotationFromOnboarding();
    if (seeded != null) {
      setSettings(seeded);
      // Persist the seed so the team key exists from now on (the
      // one-time part of "one-time seed") and other tabs converge.
      persistRotation(seeded);
    }
  }, []);

  // Cross-tab sync — fires on OTHER tabs only, so a settings change in
  // one tab updates a /schedule deep-link open in another.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== ROTATION_STORAGE_KEY) return;
      if (e.newValue == null) {
        setSettings({ ...DEFAULT_ROTATION });
        return;
      }
      try {
        setSettings(normalizeRotation(JSON.parse(e.newValue)));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Setters merge into the current value, normalize, persist. Depending
  // on `settings` keeps the closure fresh without functional-updater
  // side effects.
  const setRotation = useCallback(
    (r: ScheduleRotation): void => {
      const next = normalizeRotation({ ...settings, rotation: r });
      setSettings(next);
      persistRotation(next);
    },
    [settings],
  );

  const setCycleLength = useCallback(
    (n: number): void => {
      const next = normalizeRotation({ ...settings, cycleLength: n });
      setSettings(next);
      persistRotation(next);
    },
    [settings],
  );

  return {
    rotation: settings.rotation,
    cycleLength: settings.cycleLength,
    setRotation,
    setCycleLength,
  };
}

// ── Time blocks: types + constants ─────────────────────────────────────────

/** One row of a teacher's personal daily timetable, as persisted. */
export interface StoredBlock {
  /** Stable id for React keys / future drag-and-drop. */
  id: string;
  type: "academic" | "non_academic";
  /** 24h "HH:MM" start, e.g. "08:00". */
  start: string;
  /** 24h "HH:MM" end — always after `start` (normalization drops
   *  inverted/zero-length rows). */
  end: string;
  /** Subject for academic blocks. */
  subject?: SubjectId;
  /** Display label for non-academic blocks ("Lunch", "Morning meeting"). */
  label?: string;
}

/** Per-weekday block lists. A missing/empty day means "no custom blocks —
 *  fall back to the fixture day" (see lib/use-my-schedule.ts). */
export type StoredBlocksByDay = Partial<Record<Weekday, StoredBlock[]>>;

/**
 * localStorage key. Time blocks are PERSONAL-scoped — each teacher's
 * timetable is their own (the forking doctrine extended to Settings).
 * Per-teacher values live under `mycurricula:user:*` and migrate to a
 * per-teacher timetable table when Supabase lands.
 */
const BLOCKS_STORAGE_KEY = "mycurricula:user:schedule-blocks";

// ── Time helpers (exported — the editor + read seam reuse them) ────────────

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True when the value is a valid zero-padded 24h "HH:MM" string. */
export function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && HHMM_RE.test(value);
}

/** Parse a valid "HH:MM" into minutes from midnight. Callers must check
 *  `isValidHHMM` first — this does no validation of its own. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  return h * 60 + m;
}

/** Format minutes-from-midnight back to zero-padded "HH:MM". Clamped to
 *  [0, 23:59] so slot math near midnight can't produce "24:30". */
export function minutesToHHMM(min: number): string {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// ── Time blocks: normalization ─────────────────────────────────────────────

/** Validate one parsed entry into a StoredBlock, or null when malformed.
 *  Deterministic (no id synthesis) so normalize(normalize(x)) === normalize(x)
 *  and the editor can compare persisted snapshots by JSON string. */
function normalizeBlock(input: unknown): StoredBlock | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id === "") return null;
  if (obj.type !== "academic" && obj.type !== "non_academic") return null;
  if (!isValidHHMM(obj.start) || !isValidHHMM(obj.end)) return null;
  // Zero-length and inverted ranges are dropped — the timeline can't
  // render them and the editor shows the row unsaved until fixed.
  if (hhmmToMinutes(obj.end) <= hhmmToMinutes(obj.start)) return null;

  const block: StoredBlock = {
    id: obj.id,
    type: obj.type,
    start: obj.start,
    end: obj.end,
  };
  // Subject must be one of the eight known ids; anything else is stripped
  // (the block survives — a missing subject renders as an unlabeled
  // academic block rather than crashing the cp-subj cascade).
  if (typeof obj.subject === "string" && obj.subject in SUBJECT_BY_ID) {
    block.subject = obj.subject as SubjectId;
  }
  if (typeof obj.label === "string" && obj.label.trim() !== "") {
    block.label = obj.label.trim();
  }
  return block;
}

/**
 * Normalize one day's block list: drop malformed entries, dedupe ids
 * (first occurrence wins), and sort by start time (then end) so every
 * consumer sees a chronologically ordered day.
 */
export function normalizeDayBlocks(input: unknown): StoredBlock[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: StoredBlock[] = [];
  for (const entry of input) {
    const block = normalizeBlock(entry);
    if (block == null || seen.has(block.id)) continue;
    seen.add(block.id);
    out.push(block);
  }
  out.sort(
    (a, b) =>
      hhmmToMinutes(a.start) - hhmmToMinutes(b.start) ||
      hhmmToMinutes(a.end) - hhmmToMinutes(b.end),
  );
  return out;
}

/** Normalize a whole per-day map. Only valid weekday keys survive, and
 *  days whose lists normalize to empty are dropped entirely — "day key
 *  present" therefore always means "has at least one custom block". */
function normalizeBlocksByDay(input: unknown): StoredBlocksByDay {
  if (typeof input !== "object" || input === null) return {};
  const out: StoredBlocksByDay = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in WEEKDAY_INDEX)) continue;
    const blocks = normalizeDayBlocks(value);
    if (blocks.length > 0) out[key as Weekday] = blocks;
  }
  return out;
}

/** Read + parse the stored map. Returns null when unset or malformed. */
function readBlocksFromStorage(): StoredBlocksByDay | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BLOCKS_STORAGE_KEY);
    if (raw == null) return null;
    return normalizeBlocksByDay(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Same-tab change channel. The `storage` event only fires on OTHER tabs,
 * but one page can mount several useScheduleBlocks() instances (the
 * settings editor plus the useMySchedule read seam) — without this, a
 * same-tab write would leave sibling instances stale (e.g. the
 * empty-state "sample" preview resurrecting just-deleted blocks).
 * Dispatched only after a SUCCESSFUL write, so listeners re-reading
 * storage always observe the value the writer persisted.
 */
const BLOCKS_EVENT = "mycurricula:schedule-blocks-updated";

function persistBlocks(value: StoredBlocksByDay): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BLOCKS_STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new Event(BLOCKS_EVENT));
  } catch {
    // Storage disabled / quota exceeded — state still updates in-memory
    // for the writing instance; siblings are not notified (re-reading
    // failed storage would hand them the stale value).
  }
}

// ── Time blocks: hook ──────────────────────────────────────────────────────

/**
 * Returns the teacher's personal time-block map plus normalizing setters.
 *
 *   • `setDayBlocks(day, blocks)` — replace one day. The list is
 *     normalized (malformed rows dropped, sorted by start); an empty
 *     result removes the day key so the fixture fallback re-engages.
 *   • `setAllBlocks(map)`        — replace the whole map (used by the
 *     editor's "Copy to all days" and its Undo).
 *
 * SSR default is `{}` (every day falls back to the fixture); the stored
 * map arrives post-mount; cross-tab edits arrive via the `storage` event.
 */
export function useScheduleBlocks(): {
  blocksByDay: StoredBlocksByDay;
  setDayBlocks: (day: Weekday, blocks: StoredBlock[]) => void;
  setAllBlocks: (next: StoredBlocksByDay) => void;
} {
  const [blocksByDay, setBlocksState] = useState<StoredBlocksByDay>(() => ({}));

  // Post-mount: sync from localStorage if a value is set.
  useEffect(() => {
    const stored = readBlocksFromStorage();
    if (stored != null) setBlocksState(stored);
  }, []);

  // Cross-tab sync (storage event) + same-tab sync (BLOCKS_EVENT — a
  // sibling hook instance in THIS tab persisted; re-read storage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== BLOCKS_STORAGE_KEY) return;
      if (e.newValue == null) {
        setBlocksState({});
        return;
      }
      try {
        setBlocksState(normalizeBlocksByDay(JSON.parse(e.newValue)));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    const sameTab = (): void => {
      setBlocksState(readBlocksFromStorage() ?? {});
    };
    window.addEventListener("storage", handler);
    window.addEventListener(BLOCKS_EVENT, sameTab);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(BLOCKS_EVENT, sameTab);
    };
  }, []);

  // Depends on `blocksByDay` (like the rotation setters) so the merge
  // reads fresh state without functional-updater side effects — React
  // Strict Mode double-invokes updater functions, so persisting inside
  // one would double-write storage.
  const setDayBlocks = useCallback(
    (day: Weekday, blocks: StoredBlock[]): void => {
      if (!(day in WEEKDAY_INDEX)) return;
      const normalized = normalizeDayBlocks(blocks);
      const next: StoredBlocksByDay = { ...blocksByDay };
      if (normalized.length === 0) {
        delete next[day];
      } else {
        next[day] = normalized;
      }
      setBlocksState(next);
      persistBlocks(next);
    },
    [blocksByDay],
  );

  const setAllBlocks = useCallback((nextInput: StoredBlocksByDay): void => {
    const next = normalizeBlocksByDay(nextInput);
    setBlocksState(next);
    persistBlocks(next);
  }, []);

  return { blocksByDay, setDayBlocks, setAllBlocks };
}
