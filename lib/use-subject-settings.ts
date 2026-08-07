"use client";

// use-subject-settings — the four storage-backed states behind
// Settings → Subjects.
//
//   1. useSubjectOverrides()  — TEAM-scoped tweaks to the 8 locked
//      subjects: display rename, academic/non-academic flag, archived
//      flag. Every teacher on the grade-level team sees the same values.
//   2. useHiddenSubjects()    — PERSONAL "I don't teach this" list.
//      Hiding a subject removes it from THIS teacher's views only;
//      teammates are unaffected.
//   3. usePersonalSubjects()  — PERSONAL custom subjects (e.g. "Band",
//      "Quran") this teacher runs outside the team's locked roster.
//   4. useTeamSubjectOrder()  — TEAM-scoped display ORDER of the locked
//      roster. Order is arrangement, not identity: it never adds,
//      removes, renames or recolors a subject.
//
// ── SCOPE HONESTY (read before writing copy about any of these) ───────
// The `mycurricula:team:*` prefix records the INTENDED scope. The
// storage behind it is localStorage, i.e. per-browser — nothing here is
// actually shared with a teammate, or even with this teacher's other
// device, until the team-settings backend lands. Never write UI copy
// promising a teammate will see one of these values (the same rule
// app/settings/calendar/page.tsx states at length for its own four
// team-prefixed keys). Describe the observable effect instead.
//
// Locked-roster doctrine (CLAUDE.md §4): the 8 subjects (math, reading,
// writing, grammar, spelling, ufli, explorers, sel) and their swatch
// mapping are locked team-wide. Nothing in this file can add a 9th team
// subject or invent a color:
//   • Team overrides can RENAME a subject's display label, but the id —
//     and therefore the `.cp-subj.<id>` color class — never changes.
//   • Personal subjects BORROW one of the 8 locked palettes via their
//     `swatch` field (a SubjectId). A personal subject is always painted
//     with an existing subject's color family — never a new color.
//
// SSR-safe pattern mirrors `lib/use-school-week.ts`:
//   1. Initial state is the SSR default (empty override map / empty
//      lists) so server-rendered HTML matches the first client render.
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs so a
//      teacher with /weekly and /settings open simultaneously stays
//      consistent.
//   4. Setters normalize before write; storage failures are swallowed
//      (in-memory state still updates).
//
// One addition over the use-school-week pattern: a SAME-TAB channel.
// The `storage` event only fires on OTHER tabs, but Settings → Subjects
// mounts several instances of these hooks at once (one per card, plus
// useVisibleSubjects composing all three) — archiving a subject in the
// "Team subjects" card must move it into the "Archived" card without a
// reload. Every write therefore also notifies the in-module listener
// set below, keeping all same-tab instances in lockstep.
//
// Persistence today is localStorage; the team overrides migrate to a
// `team_settings` row and the personal pieces to per-user rows when the
// Supabase backend (Phase 1B) lands.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubjectId } from "./types";
import { SUBJECTS, SUBJECT_BY_ID } from "./mock";
// The saved-order normalizer is shared with the per-teacher Weekly row
// order (lib/subject-order.ts). One normalizer, one set of semantics —
// duplicating it is exactly the drift that lets two "orders" disagree
// about what happens to a subject the catalog no longer has.
import { reconcileOrder, type MoveDirection } from "./subject-order";
// Notebook identity for the ORDER key's scope (§4 below). This makes
// useTeamSubjectOrder — and, transitively, useVisibleSubjects — require
// a <NotebookProvider> ancestor. Both mount points that matter provide
// one (app/settings/layout.tsx and app/(planner)/layout.tsx). No cycle:
// notebook-state does not import this module.
import { useNotebookState } from "./notebook-state";

// ── Shared: the locked-roster id set ───────────────────────────────────────

/** Quick membership test for the 8 locked team-subject ids. */
const SUBJECT_ID_SET: ReadonlySet<string> = new Set(SUBJECTS.map((s) => s.id));

/** Canonical roster position, for deterministic sorting of id lists. */
const SUBJECT_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  SUBJECTS.map((s, i) => [s.id, i]),
);

function isSubjectId(v: unknown): v is SubjectId {
  return typeof v === "string" && SUBJECT_ID_SET.has(v);
}

// ── Shared: same-tab change channel ────────────────────────────────────────
// `storage` events are cross-tab only, so sibling hook instances in the
// SAME tab subscribe here instead. Writers emit the freshly-normalized
// value from the event-handler context (never from inside a setState
// updater — that would set sibling state during render); subscribers
// apply it directly. The writer's own subscription re-applies the same
// reference, which React bails out of — harmless.

type ChannelListener<T> = (next: T) => void;

interface SameTabChannel<T> {
  subscribe: (fn: ChannelListener<T>) => () => void;
  emit: (next: T) => void;
}

function createSameTabChannel<T>(): SameTabChannel<T> {
  const listeners = new Set<ChannelListener<T>>();
  return {
    subscribe(fn: ChannelListener<T>): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit(next: T): void {
      for (const fn of listeners) fn(next);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TEAM subject overrides
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One team subject's deviations from its locked defaults. The record is
 * kept MINIMAL — a field is only present when it differs from the
 * default (name = the locked roster name, isAcademic = true,
 * archived = false). `normalizeOverrides` strips redundant fields so
 * "rename back to the original" is indistinguishable from "never
 * renamed".
 */
export interface SubjectOverride {
  /** Team-wide display rename. Absent = the locked roster name. */
  name?: string;
  /** Absent = true (every locked subject is academic by default). */
  isAcademic?: boolean;
  /** Absent = false (active). Archived subjects leave every roster. */
  archived?: boolean;
}

/** The full override map — keyed by the 8 locked subject ids. */
export type SubjectOverrides = Partial<Record<SubjectId, SubjectOverride>>;

/** Patch shape accepted by `updateOverride`. */
export type SubjectOverridePatch = Partial<{
  /**
   * New display name. An empty/whitespace string — or the subject's
   * original locked name — CLEARS the rename (back to default).
   */
  name: string;
  isAcademic: boolean;
  archived: boolean;
}>;

/**
 * localStorage key. Subject overrides are TEAM-scoped — a rename or an
 * archive affects every teacher on the grade-level team (same doctrine
 * as `mycurricula:team:holidays` / `school-week-days`). Migrates to a
 * `team_settings` row when Supabase lands.
 */
const OVERRIDES_KEY = "mycurricula:team:subject-overrides";

/**
 * The onboarding wizard's persisted state (lib/onboarding-state.tsx,
 * `PersistShape` = { stepIndex, data, finished }). Used once below to
 * seed academic flags — see `seedOverridesFromOnboarding`.
 */
const ONBOARDING_KEY = "mycurricula:onboarding";

const overridesChannel = createSameTabChannel<SubjectOverrides>();

/**
 * Normalize a parsed value into a clean, minimal SubjectOverrides map:
 *   • only the 8 locked subject ids are kept (unknown keys dropped);
 *   • `name` is trimmed; empty or identical-to-default names dropped;
 *   • `isAcademic` kept only when explicitly false (true = default);
 *   • `archived` kept only when explicitly true (false = default);
 *   • subjects whose override ends up empty are omitted entirely.
 */
function normalizeOverrides(input: unknown): SubjectOverrides {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  const source = input as Record<string, unknown>;
  const result: SubjectOverrides = {};
  // Iterate the canonical roster (not the input keys) so the output key
  // order is deterministic and unknown ids never survive a round-trip.
  for (const subject of SUBJECTS) {
    const raw = source[subject.id];
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const override: SubjectOverride = {};

    if (typeof o.name === "string") {
      const trimmed = o.name.trim();
      if (trimmed !== "" && trimmed !== subject.name) {
        override.name = trimmed;
      }
    }
    if (o.isAcademic === false) override.isAcademic = false;
    if (o.archived === true) override.archived = true;

    if (Object.keys(override).length > 0) {
      result[subject.id] = override;
    }
  }
  return result;
}

/**
 * ONE-TIME SEED from the onboarding wizard. When the overrides key has
 * never been written but the teacher completed (or started) onboarding,
 * the wizard's per-subject academic flags (`data.subjects[]` —
 * { id, name, color, isAcademic }) carry real configuration we should
 * not lose. We lift `isAcademic: false` flags for locked roster ids
 * into the override map.
 *
 * Returns null when there is nothing to seed FROM (no onboarding state,
 * or it is unreadable). Returns a map — possibly empty — when onboarding
 * state exists; the caller persists even an empty map so the seed is
 * genuinely one-time (re-running the wizard later won't silently
 * overwrite team settings someone has since edited).
 */
function seedOverridesFromOnboarding(): SubjectOverrides | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const data = (parsed as Record<string, unknown>).data;
    if (typeof data !== "object" || data === null) return {};
    const subjects = (data as Record<string, unknown>).subjects;
    if (!Array.isArray(subjects)) return {};

    const seeded: SubjectOverrides = {};
    for (const entry of subjects) {
      if (typeof entry !== "object" || entry === null) continue;
      const s = entry as Record<string, unknown>;
      // Only locked roster ids are seedable — wizard-added custom
      // subjects are a different concept (they map to PERSONAL subjects,
      // a separate adoption wave, not team overrides).
      if (!isSubjectId(s.id)) continue;
      if (s.isAcademic === false) {
        seeded[s.id] = { isAcademic: false };
      }
    }
    return normalizeOverrides(seeded);
  } catch {
    // Unreadable onboarding state — treat as nothing to seed.
    return null;
  }
}

/** Read + parse the stored overrides. Null when unset / malformed. */
function readOverridesFromStorage(): SubjectOverrides | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeOverrides(parsed);
  } catch {
    return null;
  }
}

/** Persist the override map. Storage failures are swallowed. */
function writeOverridesToStorage(next: SubjectOverrides): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled / quota exceeded — in-memory state still updates.
  }
}

/**
 * Returns the team's subject-override map plus a patch-style setter.
 *
 * `updateOverride(id, patch)` merges the patch into the subject's
 * current override, re-normalizes the whole map (so redundant fields
 * are stripped — renaming back to the original name clears the rename),
 * persists, and propagates to every other hook instance: same-tab
 * siblings via the channel, other tabs via the `storage` event.
 */
export function useSubjectOverrides(): {
  overrides: SubjectOverrides;
  updateOverride: (id: SubjectId, patch: SubjectOverridePatch) => void;
} {
  // SSR-safe default — no overrides. We intentionally do NOT read
  // localStorage during the initial render (hydration mismatch guard).
  const [overrides, setOverrides] = useState<SubjectOverrides>({});
  // Latest-value ref so the stable setter can read-modify-write without
  // re-creating itself per render (and without an impure setState
  // updater — writes + emits must happen in event-handler context).
  const latestRef = useRef<SubjectOverrides>(overrides);

  /** Apply a new value to this instance (state + ref). */
  const apply = useCallback((next: SubjectOverrides): void => {
    latestRef.current = next;
    setOverrides(next);
  }, []);

  // Post-mount: sync from localStorage; seed from onboarding when the
  // key has never been written (one-time — see seedOverridesFromOnboarding).
  useEffect(() => {
    const stored = readOverridesFromStorage();
    if (stored != null) {
      apply(stored);
      return;
    }
    const seeded = seedOverridesFromOnboarding();
    if (seeded != null) {
      // Persist even an empty seed so this branch never runs again —
      // the overrides key existing IS the "already seeded" marker.
      writeOverridesToStorage(seeded);
      apply(seeded);
    }
  }, [apply]);

  // Same-tab sync — sibling hook instances (other cards on the settings
  // page, useVisibleSubjects consumers) announce their writes here.
  useEffect(() => overridesChannel.subscribe(apply), [apply]);

  // Cross-tab sync. The `storage` event fires on OTHER tabs (not the
  // one doing the write), so the settings page in one tab and /weekly
  // in another stay consistent without extra plumbing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== OVERRIDES_KEY) return;
      if (e.newValue == null) {
        apply({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        apply(normalizeOverrides(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [apply]);

  const updateOverride = useCallback(
    (id: SubjectId, patch: SubjectOverridePatch): void => {
      if (!isSubjectId(id)) return;
      const prev = latestRef.current;
      const next = normalizeOverrides({
        ...prev,
        [id]: { ...prev[id], ...patch },
      });
      apply(next);
      writeOverridesToStorage(next);
      overridesChannel.emit(next);
    },
    [apply],
  );

  return { overrides, updateOverride };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. PERSONAL hidden-subjects list ("I don't teach this")
// ═══════════════════════════════════════════════════════════════════════════

/**
 * localStorage key. PERSONAL-scoped — hiding a subject affects only
 * this teacher's views (per-user keys live under `mycurricula:user:*`,
 * same scoping as the theme keys). Teammates still see the subject;
 * the Master plan is untouched.
 */
const HIDDEN_KEY = "mycurricula:user:hidden-subjects";

const hiddenChannel = createSameTabChannel<SubjectId[]>();

/**
 * Normalize an id list: keep only valid locked-roster ids, dedupe, and
 * sort by canonical roster position so consumers see a stable order.
 * (Personal subjects can't be hidden — a teacher deletes their own
 * subject instead — so only the 8 locked ids are valid here.)
 */
function normalizeHidden(input: unknown): SubjectId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<SubjectId>();
  for (const v of input) {
    if (isSubjectId(v)) seen.add(v);
  }
  return Array.from(seen).sort(
    (a, b) => (SUBJECT_INDEX[a] ?? 0) - (SUBJECT_INDEX[b] ?? 0),
  );
}

/** Read + parse the stored hidden list. Null when unset / malformed. */
function readHiddenFromStorage(): SubjectId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeHidden(parsed);
  } catch {
    return null;
  }
}

/** Persist the hidden list. Storage failures are swallowed. */
function writeHiddenToStorage(next: SubjectId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled / quota exceeded — in-memory state still updates.
  }
}

/**
 * Returns this teacher's hidden-subject ids plus setters.
 *
 * `setHidden` replaces the whole list (normalized); `toggleHidden`
 * flips a single subject's membership — the natural shape for the
 * per-row switches on Settings → Subjects.
 */
export function useHiddenSubjects(): {
  hidden: SubjectId[];
  setHidden: (ids: SubjectId[]) => void;
  toggleHidden: (id: SubjectId) => void;
} {
  // SSR-safe default — nothing hidden.
  const [hidden, setHiddenState] = useState<SubjectId[]>([]);
  const latestRef = useRef<SubjectId[]>(hidden);

  const apply = useCallback((next: SubjectId[]): void => {
    latestRef.current = next;
    setHiddenState(next);
  }, []);

  // Post-mount: sync from localStorage if a value is set.
  useEffect(() => {
    const stored = readHiddenFromStorage();
    if (stored != null) apply(stored);
  }, [apply]);

  // Same-tab sync (see useSubjectOverrides for the rationale).
  useEffect(() => hiddenChannel.subscribe(apply), [apply]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== HIDDEN_KEY) return;
      if (e.newValue == null) {
        apply([]);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        apply(normalizeHidden(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [apply]);

  /** Commit a new list: normalize, apply, persist, propagate. */
  const commit = useCallback(
    (ids: SubjectId[]): void => {
      const next = normalizeHidden(ids);
      apply(next);
      writeHiddenToStorage(next);
      hiddenChannel.emit(next);
    },
    [apply],
  );

  const setHidden = useCallback(
    (ids: SubjectId[]): void => commit(ids),
    [commit],
  );

  const toggleHidden = useCallback(
    (id: SubjectId): void => {
      if (!isSubjectId(id)) return;
      const set = new Set(latestRef.current);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      commit(Array.from(set));
    },
    [commit],
  );

  return { hidden, setHidden, toggleHidden };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PERSONAL custom subjects
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A subject this teacher runs that is NOT part of the team's locked
 * roster — "Band", "Quran", "Homeroom", etc.
 *
 * The `swatch` field is how personal subjects respect the locked-color
 * doctrine: instead of inventing a new color, a personal subject
 * BORROWS one of the 8 locked subject palettes. Rendering a personal
 * subject means painting it with `.cp-subj.<swatch>` (or
 * `useSubjectColor(swatch)`), so it picks up the borrowed family's
 * full token set — tint, accent, ink — across every theme.
 */
export interface PersonalSubject {
  /** Stable slug id, always prefixed `p-` (e.g. "p-band"). The prefix
   *  keeps personal ids disjoint from the locked SubjectId union so no
   *  lookup can confuse the two. */
  id: string;
  /** Display name, trimmed, non-empty. */
  name: string;
  /** Which locked subject's color family this subject borrows. */
  swatch: SubjectId;
}

/**
 * localStorage key. PERSONAL-scoped — these subjects exist only in this
 * teacher's account (`mycurricula:user:*`). Migrates to per-user rows
 * when Supabase lands.
 */
const PERSONAL_KEY = "mycurricula:user:personal-subjects";

const personalChannel = createSameTabChannel<PersonalSubject[]>();

/** Lowercase-slugify a display name for use inside a personal id. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/**
 * Build a unique `p-`-prefixed id from a display name. Collisions (two
 * subjects named "Band") get a numeric suffix — `p-band`, `p-band-2`…
 */
function makePersonalSubjectId(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const base = slugify(name) || "subject";
  const candidate = `p-${base}`;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`p-${base}-${n}`)) n += 1;
  return `p-${base}-${n}`;
}

/**
 * Normalize a parsed value into a clean PersonalSubject[]:
 *   • drop entries that aren't object-shaped;
 *   • trim names; drop entries whose name is empty after trim;
 *   • drop entries whose swatch isn't one of the 8 locked ids (the
 *     never-invent-a-color rule — an unknown swatch has no palette);
 *   • dedupe ids (first occurrence wins); regenerate malformed ids
 *     (missing the `p-` prefix) from the name so user data survives.
 */
function normalizePersonal(input: unknown): PersonalSubject[] {
  if (!Array.isArray(input)) return [];
  const cleaned: PersonalSubject[] = [];
  const taken = new Set<string>();
  for (const v of input) {
    if (typeof v !== "object" || v === null) continue;
    const obj = v as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (name === "") continue;
    if (!isSubjectId(obj.swatch)) continue;
    const id =
      typeof obj.id === "string" && obj.id.startsWith("p-") && obj.id.length > 2
        ? obj.id
        : makePersonalSubjectId(name, taken);
    if (taken.has(id)) continue; // duplicate id — first occurrence wins
    taken.add(id);
    cleaned.push({ id, name, swatch: obj.swatch });
  }
  return cleaned;
}

/** Read + parse the stored personal list. Null when unset / malformed. */
function readPersonalFromStorage(): PersonalSubject[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PERSONAL_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizePersonal(parsed);
  } catch {
    return null;
  }
}

/** Persist the personal list. Storage failures are swallowed. */
function writePersonalToStorage(next: PersonalSubject[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSONAL_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled / quota exceeded — in-memory state still updates.
  }
}

/**
 * Returns this teacher's personal subjects plus mutation helpers.
 *
 * `add(name, swatch)` trims + validates, generates a unique `p-` id,
 * persists, and returns true when the subject was created (false =
 * invalid input: empty name or unknown swatch). `remove(id)` deletes
 * by id.
 */
export function usePersonalSubjects(): {
  subjects: PersonalSubject[];
  add: (name: string, swatch: SubjectId) => boolean;
  remove: (id: string) => void;
} {
  // SSR-safe default — empty list.
  const [subjects, setSubjects] = useState<PersonalSubject[]>([]);
  const latestRef = useRef<PersonalSubject[]>(subjects);

  const apply = useCallback((next: PersonalSubject[]): void => {
    latestRef.current = next;
    setSubjects(next);
  }, []);

  // Post-mount: sync from localStorage if a value is set.
  useEffect(() => {
    const stored = readPersonalFromStorage();
    if (stored != null) apply(stored);
  }, [apply]);

  // Same-tab sync (see useSubjectOverrides for the rationale).
  useEffect(() => personalChannel.subscribe(apply), [apply]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== PERSONAL_KEY) return;
      if (e.newValue == null) {
        apply([]);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        apply(normalizePersonal(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [apply]);

  /** Commit a new list: apply, persist, propagate. */
  const commit = useCallback(
    (next: PersonalSubject[]): void => {
      apply(next);
      writePersonalToStorage(next);
      personalChannel.emit(next);
    },
    [apply],
  );

  const add = useCallback(
    (name: string, swatch: SubjectId): boolean => {
      const trimmed = name.trim();
      if (trimmed === "" || !isSubjectId(swatch)) return false;
      const prev = latestRef.current;
      const taken = new Set(prev.map((s) => s.id));
      commit([
        ...prev,
        { id: makePersonalSubjectId(trimmed, taken), name: trimmed, swatch },
      ]);
      return true;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string): void => {
      commit(latestRef.current.filter((s) => s.id !== id));
    },
    [commit],
  );

  return { subjects, add, remove };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TEAM subject order
// ═══════════════════════════════════════════════════════════════════════════
//
// The locked roster's DISPLAY ORDER. Ordering is arrangement, not
// identity — it can never add, drop, rename or recolor a subject
// (CLAUDE.md §4: the subject→slot map is not a preference). The stored
// value is a plain `SubjectId[]`, which maps 1:1 onto the
// `subjects.display_order` column when the backend lands.
//
// Team-scoped, unlike lib/subject-order.ts (`mycurricula:user:…`), which
// is one teacher's private Weekly ROW arrangement. Two different
// questions: "what order does this roster read in" vs "how do I like my
// own grid stacked". They share `reconcileOrder`, nothing else.

/**
 * localStorage key BASE. TEAM-scoped by intent, per-browser in fact —
 * see the SCOPE HONESTY note at the top of this file before writing UI
 * copy about it. Migrates to `subjects.display_order` (already present
 * in the schema) when the team-settings backend lands.
 *
 * The real key is NOTEBOOK-scoped via `teamSubjectOrderStorageKey`
 * (Codex F3 review, Medium 3): a bare key would be browser-global, so a
 * reorder in one notebook/workspace would rearrange every other one on
 * the same browser — a multi-grade violation (CLAUDE.md: never assume a
 * single grade). The bare base key survives only as the read-once
 * legacy-fallback source for values written before scoping landed.
 */
const ORDER_KEY_BASE = "mycurricula:team:subject-order";

/**
 * Build the storage key for a notebook scope. Pure + exported so the
 * scoping rule is unit-testable without React.
 *
 * WHY THE NOTEBOOK (grade_levels) ID, not a workspace:notebook composite
 * — coordinator-approved 2026-08-07:
 *   • On the MULTI_WORKSPACE **ON** path, notebook ids are per-workspace
 *     UUIDs, so notebook scoping already isolates workspaces: workspace
 *     A's Grade 5 and workspace B's Grade 5 are different ids.
 *   • On today's **OFF** path `workspaceId` is always null, so a
 *     composite would degrade to exactly this with more moving parts.
 *   • This mirrors the repo's one existing scoping precedent,
 *     lib/subject-order.ts `storageKeyFor` (grade-scoped for the same
 *     reason).
 * Residual gap, on the record: OFF-path notebook ids are static mock
 * strings, and the SIBLING team keys this order composes with
 * (subject-overrides, holidays, …) remain browser-global — tracked
 * separately, out of this wave's scope.
 *
 * A null/undefined/empty scope (identity still resolving on the ON
 * path, or no provider value) falls back to the bare base key.
 */
export function teamSubjectOrderStorageKey(
  scope: string | null | undefined,
): string {
  return scope ? `${ORDER_KEY_BASE}:${scope}` : ORDER_KEY_BASE;
}

/**
 * The locked roster in catalog order — the DEFAULT catalog
 * `useTeamSubjectOrder` reconciles against when the caller passes none.
 * UI code should not import this: the hook returns its resolved
 * `catalog`, and reset/deviation checks go through that so they follow a
 * caller-supplied catalog. Exported for tests and for the default.
 */
export const CANONICAL_SUBJECT_ORDER: readonly SubjectId[] = SUBJECTS.map(
  (s) => s.id,
);

/**
 * Same-tab channel, KEYED by storage key — unlike the three flat-key
 * channels above. Instances announce which key they wrote so a
 * subscriber whose scope differs (mid notebook-switch, or a stale-scope
 * write racing a scope flip) never applies another notebook's order.
 */
const orderChannel = createSameTabChannel<{
  storageKey: string;
  next: SubjectId[];
}>();

export type { MoveDirection };

/**
 * Normalize any stored/parsed value into a complete, de-duped permutation
 * of `catalogOrder`:
 *   • unknown or removed ids are dropped;
 *   • duplicates collapse to their first occurrence;
 *   • a catalog subject the saved order never mentioned is APPENDED (in
 *     canonical-relative order) rather than lost — so a subject added to
 *     the roster after a teacher saved an order still appears.
 *
 * `catalogOrder` is a parameter, not a module constant read, so a grade
 * with a different subject set reuses this untouched (CLAUDE.md: never
 * assume a single grade).
 */
export function normalizeSubjectOrder(
  input: unknown,
  catalogOrder: readonly SubjectId[] = CANONICAL_SUBJECT_ORDER,
): SubjectId[] {
  return reconcileOrder(
    Array.isArray(input) ? (input as unknown[]) : null,
    catalogOrder,
  );
}

/**
 * Move one subject one slot up or down, purely.
 *
 * `among` is the subset the teacher can actually SEE — the active roster,
 * which excludes archived subjects. Without it a "move up" past an
 * archived neighbour would swap with a row that isn't rendered and look
 * like nothing happened. With it, the subject swaps with its nearest
 * VISIBLE neighbour while ids outside `among` hold their absolute slots.
 * Omit `among` for a plain adjacent swap.
 *
 * Returns the SAME array reference when nothing moved — an unknown id, or
 * a subject already at the first/last visible slot — so a caller can test
 * `next === order` to suppress a no-op toast.
 */
export function moveSubjectInOrder(
  order: readonly SubjectId[],
  id: SubjectId,
  dir: MoveDirection,
  among?: readonly SubjectId[],
): readonly SubjectId[] {
  const index = order.indexOf(id);
  if (index === -1) return order; // not in this order — nothing to move
  const step = dir === "up" ? -1 : 1;
  const visible = among ? new Set<SubjectId>(among) : null;

  // Walk in `dir` to the nearest swappable neighbour, stepping over any
  // id that is not currently visible.
  let target = index + step;
  while (target >= 0 && target < order.length) {
    if (visible === null || visible.has(order[target])) break;
    target += step;
  }
  if (target < 0 || target >= order.length) return order; // at the boundary

  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Read + parse the order under one key. Null when unset / malformed /
 *  not an array. Normalizes against the LIVE catalog the hook resolved —
 *  never a module constant — so a non-default catalog is respected. */
function readOrderFromStorage(
  storageKey: string,
  catalogOrder: readonly SubjectId[],
): SubjectId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return normalizeSubjectOrder(parsed, catalogOrder);
  } catch {
    return null;
  }
}

/**
 * Persist the order under one key. Storage failures are swallowed for the
 * caller's purposes — in-memory state still updates — but REPORTED, because
 * one caller cannot treat them as harmless: the legacy migration deletes the
 * only other copy of the value once it believes this write landed.
 *
 * @returns true when the value is known to be persisted.
 */
function writeOrderToStorage(
  storageKey: string,
  next: readonly SubjectId[],
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    return true;
  } catch {
    // Storage disabled / quota exceeded — in-memory state still updates.
    return false;
  }
}

/**
 * Resolve a notebook's stored order, migrating the pre-scoping value if this
 * is the first notebook to meet it.
 *
 * Exported and separated from the hook so the migration can be tested at all:
 * it lives in an effect, effects do not run under `react-dom/server`, and the
 * vitest environment is `node`. A guard that cannot be exercised is how the
 * original leak shipped described as "read-once" while being read once PER
 * SCOPE — a distinction no test was in a position to catch.
 *
 * The claim is a write-then-delete, and the delete is conditional on the write
 * having actually landed, so no failure path can destroy the value.
 *
 * KNOWN RESIDUAL — two tabs, two notebooks, opened at the same instant can both
 * read the legacy value before either deletes it, and it lands in both scopes.
 * localStorage has no atomic test-and-set, so closing this properly needs
 * `navigator.locks` and an async effect. Left open deliberately: the bound is
 * two notebooks in a rare interleaving, against EVERY notebook before this
 * change, and the residual is cosmetic ordering rather than data loss.
 */
export function loadTeamSubjectOrder(
  storageKey: string,
  catalogOrder: readonly SubjectId[],
): SubjectId[] {
  let stored = readOrderFromStorage(storageKey, catalogOrder);
  if (stored === null && storageKey !== ORDER_KEY_BASE) {
    const legacy = readOrderFromStorage(ORDER_KEY_BASE, catalogOrder);
    if (legacy !== null) {
      // DELETE ONLY AFTER A CONFIRMED WRITE. In private mode or at quota the
      // scoped write fails silently while removeItem succeeds, and deleting
      // regardless would destroy the teacher's only saved reorder — trading a
      // cosmetic leak for actual data loss. On a failed write the legacy entry
      // stays and simply gets offered again next time.
      if (writeOrderToStorage(storageKey, legacy)) {
        try {
          window.localStorage.removeItem(ORDER_KEY_BASE);
        } catch {
          // Migration missed, value intact: the next notebook claims it.
        }
      }
      stored = legacy;
    }
  }
  return stored ?? normalizeSubjectOrder(null, catalogOrder);
}

/** Options for `useTeamSubjectOrder`. */
export interface UseTeamSubjectOrderOptions {
  /**
   * The authoritative subject catalog to reconcile against. Defaults to
   * the locked canonical 8. Pass the id list the consuming surface
   * ACTUALLY renders (useVisibleSubjects passes the roster it composes)
   * so that when a live planner catalog replaces the fixture, this seam
   * follows the caller instead of a module constant. Every returned
   * `order` is a complete permutation of THIS list.
   */
  catalogOrder?: readonly SubjectId[];
}

/**
 * Returns the team's subject order plus setters.
 *
 * `order` is ALWAYS a complete permutation of `catalog` (the resolved
 * catalog, also returned so callers can reset to it / detect deviation
 * without importing any fixture-derived constant). SSR-safe by the same
 * three steps as the hooks above: canonical order on the server and the
 * first client paint, localStorage in a post-mount effect, `storage` +
 * same-tab channel for propagation.
 *
 * SCOPE IS RESOLVED INTERNALLY — LOAD-BEARING, do not add a
 * caller-supplied scope parameter. The settings page and
 * useVisibleSubjects each mount their own instance of this hook; if
 * scope were a parameter they could disagree, and a reorder would write
 * one key while the seam reads another — mutations silently invisible.
 * Deriving it here, from the one shared <NotebookProvider>, makes that
 * divergence impossible. (Consequence: this hook — and transitively
 * useVisibleSubjects — throws outside a NotebookProvider. Both real
 * mount points provide one: app/settings/layout.tsx and
 * app/(planner)/layout.tsx.)
 *
 * `moveSubject` returns true when the order actually changed, so the
 * caller can skip the toast on a boundary press.
 */
export function useTeamSubjectOrder(options: UseTeamSubjectOrderOptions = {}): {
  order: SubjectId[];
  /** The resolved catalog (canonical order) — the reset target. */
  catalog: SubjectId[];
  setOrder: (ids: readonly SubjectId[]) => void;
  moveSubject: (
    id: SubjectId,
    dir: MoveDirection,
    among?: readonly SubjectId[],
  ) => boolean;
} {
  const { catalogOrder = CANONICAL_SUBJECT_ORDER } = options;

  // The notebook scope — see the LOAD-BEARING note above. Empty string
  // (identity still loading on the ON path) degrades to the base key.
  const { activeNotebookId } = useNotebookState();
  const scope = activeNotebookId || null;
  const storageKey = useMemo(() => teamSubjectOrderStorageKey(scope), [scope]);

  // Stable identity for the catalog so the effects below don't re-run
  // per render (callers typically pass a fresh array each render) —
  // same idiom as lib/subject-order.ts.
  const catalogJoinKey = catalogOrder.join("|");
  const stableCatalog = useMemo(
    () => [...catalogOrder],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogJoinKey],
  );

  // SSR-safe default — the catalog order.
  const [order, setOrderState] = useState<SubjectId[]>(() =>
    normalizeSubjectOrder(null, stableCatalog),
  );
  const latestRef = useRef<SubjectId[]>(order);

  const apply = useCallback((next: SubjectId[]): void => {
    latestRef.current = next;
    setOrderState(next);
  }, []);

  // Post-mount (and on scope/catalog change): sync from localStorage.
  //
  // LEGACY FALLBACK — MIGRATED ONCE, not consulted once per scope.
  // A value written before scoping landed lives under the bare base key. The
  // first version of this read it whenever the scoped key was unset, which is
  // true for EVERY notebook the teacher has not yet reordered — so one legacy
  // reorder reappeared in every grade and every workspace, which is exactly
  // the cross-notebook bleed the scoping was introduced to stop. The comment
  // called it "read-once"; it was read once per scope, and those are only the
  // same thing when there is one scope.
  //
  // So the first notebook to observe it CLAIMS it: the value is written under
  // that notebook's scoped key and the bare key is then removed. Nothing is
  // lost (the write precedes the delete), and no second notebook can inherit
  // it. Deleting is what makes this a migration rather than a shared default.
  useEffect(() => {
    apply(loadTeamSubjectOrder(storageKey, stableCatalog));
  }, [apply, storageKey, stableCatalog]);

  // Same-tab sync — KEYED: apply only writes to this instance's scope.
  useEffect(
    () =>
      orderChannel.subscribe((msg) => {
        if (msg.storageKey === storageKey) apply(msg.next);
      }),
    [apply, storageKey],
  );

  // Cross-tab sync — only this scope's key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== storageKey) return;
      if (e.newValue == null) {
        apply(normalizeSubjectOrder(null, stableCatalog));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        apply(normalizeSubjectOrder(parsed, stableCatalog));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [apply, storageKey, stableCatalog]);

  /** Commit a new order: normalize, apply, persist, propagate. */
  const commit = useCallback(
    (ids: readonly SubjectId[]): SubjectId[] => {
      const next = normalizeSubjectOrder(ids, stableCatalog);
      apply(next);
      writeOrderToStorage(storageKey, next);
      orderChannel.emit({ storageKey, next });
      return next;
    },
    [apply, storageKey, stableCatalog],
  );

  const setOrder = useCallback(
    (ids: readonly SubjectId[]): void => {
      commit(ids);
    },
    [commit],
  );

  const moveSubject = useCallback(
    (
      id: SubjectId,
      dir: MoveDirection,
      among?: readonly SubjectId[],
    ): boolean => {
      const prev = latestRef.current;
      const next = moveSubjectInOrder(prev, id, dir, among);
      if (next === prev) return false; // boundary / unknown id — no write
      commit(next);
      return true;
    },
    [commit],
  );

  return { order, catalog: stableCatalog, setOrder, moveSubject };
}

// ── Display helpers ────────────────────────────────────────────────────────

/**
 * Effective display name for a locked team subject — the team rename
 * when one exists, otherwise the locked roster name. Pure helper so
 * non-hook code paths (sorting, search indexing) can share the logic.
 */
export function effectiveSubjectName(
  id: SubjectId,
  overrides: SubjectOverrides,
): string {
  return overrides[id]?.name ?? SUBJECT_BY_ID[id].name;
}
