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

import { useCallback, useEffect, useMemo, useState } from "react";
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

  // SSR-safe: start at the canonical order. The saved order (if any) is read
  // post-mount in the effect below and applied with a re-render, so the server
  // HTML and the first client paint agree (no hydration mismatch).
  const [order, setOrderState] = useState<SubjectId[]>(() =>
    reconcileOrder(stableCatalog, stableCatalog),
  );

  // Post-mount: hydrate from localStorage. Re-runs if the catalog OR the
  // storage key (grade scope) changes, so switching grade re-reads that grade's
  // saved order against its own catalog.
  useEffect(() => {
    const stored = readRawStoredOrder(storageKey);
    // Single reconciliation point — against the LIVE catalog, so a saved order
    // is normalized to whatever subject set this grade actually has.
    setOrderState(reconcileOrder(stored, stableCatalog));
  }, [stableCatalog, storageKey]);

  // Cross-tab sync — a reorder in another /weekly tab reflects here. The
  // `storage` event fires only on OTHER tabs (not the writer), matching the
  // pattern in use-school-week.ts / tooltip-dismissal.ts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handler(e: StorageEvent): void {
      if (e.key !== storageKey) return;
      if (e.newValue == null) {
        setOrderState(reconcileOrder(null, stableCatalog));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        setOrderState(
          reconcileOrder(Array.isArray(parsed) ? parsed : null, stableCatalog),
        );
      } catch {
        // Ignore malformed cross-tab values; keep current state.
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [stableCatalog, storageKey]);

  const setOrder = useCallback(
    (next: readonly SubjectId[]): void => {
      const reconciled = reconcileOrder(next, stableCatalog);
      setOrderState(reconciled);
      writeStoredOrder(storageKey, reconciled);
    },
    [stableCatalog, storageKey],
  );

  const move = useCallback(
    (id: SubjectId, dir: MoveDirection): void => {
      setOrderState((prev) => {
        const idx = prev.indexOf(id);
        if (idx === -1) return prev;
        const target = dir === "up" ? idx - 1 : idx + 1;
        // No-op at the ends — nothing to swap with.
        if (target < 0 || target >= prev.length) return prev;
        const nextOrder = [...prev];
        // Swap the two adjacent entries.
        [nextOrder[idx], nextOrder[target]] = [
          nextOrder[target],
          nextOrder[idx],
        ];
        writeStoredOrder(storageKey, nextOrder);
        return nextOrder;
      });
    },
    [storageKey],
  );

  return { order, setOrder, move };
}
