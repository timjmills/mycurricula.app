"use client";

// subject-order.ts — per-teacher display order for the Weekly grid's subject
// rows.
//
// What this is (and is NOT):
//   The 8 subjects and their colors are LOCKED team-wide (CLAUDE.md §4) — this
//   hook NEVER changes a subject's identity, color, or membership. It only
//   reorders the ROWS in the teacher's own Weekly view. It is therefore a
//   PERSONAL preference (each teacher arranges their grid as they like), not a
//   team-wide setting like the school week.
//
// Persistence:
//   localStorage today, under a `mycurricula:user:*` key (personal scope, the
//   same convention tooltip-dismissal.ts uses). When Supabase lands (Phase 1B),
//   this drops into a per-user row — see the SUPABASE EXTENSION POINT note on
//   `useSubjectOrder` below. The stored shape is a plain `SubjectId[]`, which
//   maps 1:1 onto a `jsonb` / `text[]` column.
//
// Robustness contract:
//   `reconcileOrder()` is the single normalizer. Given any saved order it:
//     • drops ids that are no longer real subjects (a subject was renamed /
//       removed from the catalog), and
//     • APPENDS any catalog subject the saved order is missing, at its
//       canonical position relative to the other appended ids.
//   So a NEW subject added to the locked set after a teacher saved an order is
//   never dropped — it surfaces at the end (canonical-relative), and the
//   teacher can move it. The result always contains exactly the catalog's
//   subjects, each once.
//
// SSR safety:
//   The hook's initial state is the CANONICAL order (the catalog as given), so
//   the server-rendered HTML matches the first client paint. The saved order is
//   read from localStorage in a post-mount effect and applied with a re-render
//   — identical to lib/use-school-week.ts and lib/tooltip-dismissal.ts. The
//   server never reaches localStorage, so there is no hydration mismatch.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubjectId } from "@/lib/types";
import { SUBJECTS } from "@/lib/mock";

// ── Storage key ──────────────────────────────────────────────────────────────
//
// PERSONAL scope (`mycurricula:user:*`) — each teacher's own row arrangement.
// Contrast with `mycurricula:team:*` (school week, holidays), which every
// teacher on the grade team shares. A personal preference must never write to a
// team key (CLAUDE.md §4: order is per-teacher, identity/color is team-locked).
const STORAGE_KEY_BASE = "mycurricula:user:weekly-subject-order";

/**
 * Build the storage key, optionally GRADE-scoped. CLAUDE.md is emphatic the
 * data model must never assume a single grade level. Two grades have different
 * subject sets, so a single shared key would let a Grade-5 reorder bleed into
 * Grade-6's row order (the saved order reconciles into the other catalog). A
 * `scopeKey` (the active grade id) namespaces the key so each grade keeps its
 * own arrangement. When no scope is given (the Grade-5-only Phase-1A default),
 * the base key is used unchanged so existing saves are not orphaned.
 */
function storageKeyFor(scopeKey: string | null | undefined): string {
  return scopeKey ? `${STORAGE_KEY_BASE}:${scopeKey}` : STORAGE_KEY_BASE;
}

// ── Canonical order ──────────────────────────────────────────────────────────

/** The locked canonical subject order (the catalog's display order). */
const CANONICAL_ORDER: readonly SubjectId[] = SUBJECTS.map((s) => s.id);

/** Direction for `move()`. */
export type MoveDirection = "up" | "down";

// ── Pure reconciliation ──────────────────────────────────────────────────────

/**
 * Reconcile a (possibly stale / partial / malformed) saved order against the
 * authoritative catalog order so the result ALWAYS contains exactly the
 * catalog's subjects, each exactly once.
 *
 *   1. Keep saved ids that are still real catalog subjects, in saved order
 *      (de-duped — a corrupt save with repeats collapses to first occurrence).
 *   2. Append any catalog subject the saved order omitted, in canonical order
 *      relative to one another (so a newly-added locked subject lands in a
 *      stable, predictable slot the teacher can then move).
 *
 * Exposed (not just used internally) so non-React call sites and tests can
 * derive the same shape. `catalogOrder` is passed in rather than read from the
 * module constant so a future grade with a different subject set reuses this
 * untouched.
 */
export function reconcileOrder(
  saved: readonly unknown[] | null | undefined,
  catalogOrder: readonly SubjectId[] = CANONICAL_ORDER,
): SubjectId[] {
  const valid = new Set<SubjectId>(catalogOrder);
  const result: SubjectId[] = [];
  const placed = new Set<SubjectId>();

  if (Array.isArray(saved)) {
    for (const raw of saved) {
      if (typeof raw !== "string") continue;
      const id = raw as SubjectId;
      // Only real, not-yet-placed catalog subjects survive.
      if (valid.has(id) && !placed.has(id)) {
        result.push(id);
        placed.add(id);
      }
    }
  }

  // Append catalog subjects the saved order never mentioned, canonical order.
  for (const id of catalogOrder) {
    if (!placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }

  return result;
}

// ── localStorage helpers (SSR-guarded) ───────────────────────────────────────

/**
 * Read the RAW saved order from localStorage as a string[], WITHOUT
 * reconciling. Reconciliation must happen exactly once, at the call site,
 * against the LIVE `catalogOrder` — never here against the module's
 * hard-coded `SUBJECTS`. Reconciling here would treat any id not in the
 * Grade-5 locked set as invalid and drop it, so a future grade with a
 * different subject set would silently lose its saved order before the hook
 * could reconcile it against the correct catalog. Returning the raw array and
 * letting the single hook-level `reconcileOrder(stored, stableCatalog)` call
 * be the only normalizer keeps the multi-grade-ready contract intact
 * (CLAUDE.md: never assume a single grade).
 */
function readRawStoredOrder(storageKey: string): unknown[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    // Malformed JSON or storage unavailable — caller falls back to canonical.
    return null;
  }
}

function writeStoredOrder(
  storageKey: string,
  order: readonly SubjectId[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // Quota / private-mode failure — in-memory state is still correct.
  }
}

// ── Scope-stamped state ──────────────────────────────────────────────────────

/**
 * An order TOGETHER WITH the storage key it was read under.
 *
 * Namespacing the key is not enough on its own: React state survives a scope
 * change, so between the render that resolves the new grade's key and the
 * passive effect that loads it, the hook holds the PREVIOUS grade's order
 * under the NEW grade's key. A `move()` in that window used to read the
 * previous grade's arrangement and persist it under this one — the same
 * cross-scope leak the namespacing was introduced to stop, re-entering
 * through the switch rather than through the key. The stamp is what makes
 * that window detectable; a bare array cannot say which grade it is from.
 */
interface LoadedOrder {
  /** The key `order` was read under. `null` before the first load (SSR + the
   *  first client paint), which matches no scope and so reads as canonical. */
  storageKey: string | null;
  order: SubjectId[];
}

// ── Public surface ───────────────────────────────────────────────────────────

/** State + actions returned by `useSubjectOrder`. */
export interface SubjectOrderState {
  /**
   * The teacher's subject-row order. Always a full, de-duped permutation of
   * the catalog's subjects (reconciled — never drops or invents a subject).
   * On the server and the first client paint this is the canonical order;
   * the saved order arrives post-mount.
   */
  order: SubjectId[];
  /** Replace the whole order (e.g. a future drag-to-reorder). Reconciled + persisted. */
  setOrder: (next: readonly SubjectId[]) => void;
  /**
   * Move one subject up or down by one slot. No-op at the ends. Persists the
   * new order. This is what the per-row move buttons call.
   */
  move: (id: SubjectId, dir: MoveDirection) => void;
}

/** Options for `useSubjectOrder`. */
export interface UseSubjectOrderOptions {
  /**
   * The authoritative subject order to reconcile against — pass
   * `usePlanner().subjects.map(s => s.id)` so the hook follows whatever catalog
   * the planner exposes (flag ON/OFF). Defaults to the locked canonical 8. The
   * reconcile step guarantees the returned order is always a complete
   * permutation of THIS list.
   */
  catalogOrder?: readonly SubjectId[];
  /**
   * Optional namespace for the storage key — pass the active grade id
   * (`usePlanner().activeGradeId`). Two grades have different subject sets, so
   * without this a Grade-5 reorder would bleed into another grade's row order.
   * When null/undefined the base (un-namespaced) key is used, which is the
   * correct Grade-5-only Phase-1A behavior and keeps existing saves intact.
   */
  scopeKey?: string | null;
}

/**
 * Per-teacher Weekly subject-row order, persisted to localStorage.
 *
 * SUPABASE EXTENSION POINT (Phase 1B):
 *   Today the order lives in localStorage under a `mycurricula:user:*` key
 *   (grade-namespaced when `scopeKey` is supplied). When the backend lands,
 *   swap `readRawStoredOrder` / `writeStoredOrder` for a per-user persisted
 *   value — e.g. a `user_settings(user_id, key, value jsonb)` row, or a
 *   `weekly_subject_order text[]` column on the teacher's profile, keyed by
 *   `(user_id, grade_id)`. The stored shape is already a plain `SubjectId[]`,
 *   so the column type is a `jsonb` array or `text[]` with no transform. Keep
 *   `reconcileOrder` as the read-time normalizer regardless of backend, so a
 *   server value that predates a catalog change is still reconciled to the live
 *   subject set on read. The hook's public surface ({ order, setOrder, move })
 *   does not change.
 */
export function useSubjectOrder(
  options: UseSubjectOrderOptions = {},
): SubjectOrderState {
  const { catalogOrder = CANONICAL_ORDER, scopeKey = null } = options;

  // The grade-namespaced storage key. Recomputed only when the scope changes.
  const storageKey = useMemo(() => storageKeyFor(scopeKey), [scopeKey]);

  // Stable identity for the catalog order so the effects below don't re-run on
  // every render (the caller typically passes a fresh array each render).
  const catalogJoinKey = catalogOrder.join("|");
  const stableCatalog = useMemo(
    () => [...catalogOrder],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogJoinKey],
  );

  // The canonical order for THIS catalog — the SSR value, and the fallback
  // whenever the loaded order belongs to a different scope (see the key-bound
  // read at the end of the hook).
  const canonical = useMemo(
    () => reconcileOrder(stableCatalog, stableCatalog),
    [stableCatalog],
  );

  // SSR-safe: start at the canonical order, stamped with no scope. The saved
  // order (if any) is read post-mount in the effect below and applied with a
  // re-render, so the server HTML and the first client paint agree (no
  // hydration mismatch).
  const [loaded, setLoaded] = useState<LoadedOrder>(() => ({
    storageKey: null,
    order: canonical,
  }));
  // Latest-value ref so the callbacks below can read-modify-write without
  // re-creating themselves per render, and WITHOUT reading state from inside a
  // setState updater — see `move`.
  const latestRef = useRef<LoadedOrder>(loaded);

  /** Apply an order to this instance (state + ref), STAMPED with the key it
   *  was read under. */
  const apply = useCallback((key: string, next: SubjectId[]): void => {
    const held = latestRef.current;
    if (held.storageKey === key && held.order === next) return;
    const value: LoadedOrder = { storageKey: key, order: next };
    latestRef.current = value;
    setLoaded(value);
  }, []);

  // Post-mount: hydrate from localStorage. Re-runs if the catalog OR the
  // storage key (grade scope) changes, so switching grade re-reads that grade's
  // saved order against its own catalog.
  useEffect(() => {
    const stored = readRawStoredOrder(storageKey);
    // Single reconciliation point — against the LIVE catalog, so a saved order
    // is normalized to whatever subject set this grade actually has.
    apply(storageKey, reconcileOrder(stored, stableCatalog));
  }, [apply, stableCatalog, storageKey]);

  // Cross-tab sync — a reorder in another /weekly tab reflects here. The
  // `storage` event fires only on OTHER tabs (not the writer), matching the
  // pattern in use-school-week.ts / tooltip-dismissal.ts.
  //
  // NO SAME-TAB CHANNEL, deliberately — not an omission. Both TEAM hooks in
  // lib/use-subject-settings.ts carry one because Settings → Subjects mounts
  // several instances at once and they must agree without a reload. This
  // PERSONAL key has two consumers, WeeklyGrid and WeekC, which are
  // alternative Week canvases: one or the other renders, never both. Add a
  // channel here the day that stops being true (a second live consumer, or a
  // reorder control outside the canvas) — until then it would be moving parts
  // with nothing to synchronise.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handler(e: StorageEvent): void {
      if (e.key !== storageKey) return;
      if (e.newValue == null) {
        apply(storageKey, reconcileOrder(null, stableCatalog));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        apply(
          storageKey,
          reconcileOrder(Array.isArray(parsed) ? parsed : null, stableCatalog),
        );
      } catch {
        // Ignore malformed cross-tab values; keep current state.
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [apply, stableCatalog, storageKey]);

  const setOrder = useCallback(
    (next: readonly SubjectId[]): void => {
      // Safe against the switch window by construction: the ids come from the
      // caller, not from this hook's state, so there is nothing stale to read.
      const reconciled = reconcileOrder(next, stableCatalog);
      apply(storageKey, reconciled);
      writeStoredOrder(storageKey, reconciled);
    },
    [apply, stableCatalog, storageKey],
  );

  const move = useCallback(
    (id: SubjectId, dir: MoveDirection): void => {
      // TWO defects used to live in this callback, and they are independent.
      //
      // 1. STALE SCOPE. It read `prev` from state, which in the switch window
      //    is the PREVIOUS grade's order, and wrote it under the new grade's
      //    key. The stamp below is the guard: when the held order belongs to
      //    another scope, re-read this scope's own saved order instead.
      // 2. IMPURE WRITE. The whole body ran inside a `setOrderState(prev =>
      //    …)` updater with `writeStoredOrder` called from within it. Updaters
      //    must be pure — React may invoke one more than once for a single
      //    dispatch (StrictMode double-invokes them in development, which is
      //    exactly what this repo's tests run under), so one keypress issued
      //    two localStorage writes. Reading through the ref and applying
      //    afterwards keeps the write in event-handler context, where it
      //    happens once.
      // 3. STALE CATALOG — a SECOND axis on the same window. The stamp says
      //    which KEY the held order came from, not which CATALOG it was
      //    reconciled against, so when the catalog changes without the key
      //    changing (a subject added to or removed from the roster) the held
      //    order is a permutation of the OLD catalog until the effect re-runs.
      //    Moving from it persists an order that omits a new subject or
      //    retains a removed one. Reconciling here rather than adding a second
      //    stamp keeps ONE source of truth: `reconcileOrder` is already the
      //    normalizer, and it is idempotent, so this costs nothing when the
      //    catalog has not moved. (Self-healing, so severity is lower than it
      //    reads: the next read re-appends a missing subject. But the persisted
      //    value is briefly wrong and the teacher's chosen position for it is
      //    lost, so it is still a bug.)
      const held = latestRef.current;
      const base =
        held.storageKey === storageKey
          ? held.order
          : readRawStoredOrder(storageKey);
      const prev = reconcileOrder(base, stableCatalog);

      const idx = prev.indexOf(id);
      if (idx === -1) return;
      const target = dir === "up" ? idx - 1 : idx + 1;
      // No-op at the ends — nothing to swap with, and nothing to persist.
      if (target < 0 || target >= prev.length) return;

      const nextOrder = [...prev];
      // Swap the two adjacent entries.
      [nextOrder[idx], nextOrder[target]] = [nextOrder[target], nextOrder[idx]];

      apply(storageKey, nextOrder);
      writeStoredOrder(storageKey, nextOrder);
    },
    [apply, stableCatalog, storageKey],
  );

  // KEY-BOUND READ. Between the render that resolves a new grade's key and the
  // passive effect that loads it, `loaded` still holds the previous grade's
  // arrangement — one paint in which the rows would otherwise be ordered by a
  // grade the teacher is no longer looking at. The canonical order is the
  // honest value for that frame.
  //
  // Reconciled for the same reason `move` reconciles: the stamp tracks the KEY
  // but not the CATALOG, so a catalog change with an unchanged key would
  // otherwise render a permutation of the old roster. Memoized so the returned
  // identity is stable across renders — `useVisibleSubjects` and the grid keep
  // `order` in dependency arrays, and a fresh array per render would churn
  // every one of them.
  const order = useMemo(
    () =>
      loaded.storageKey === storageKey
        ? reconcileOrder(loaded.order, stableCatalog)
        : canonical,
    [loaded, storageKey, stableCatalog, canonical],
  );

  return { order, setOrder, move };
}
