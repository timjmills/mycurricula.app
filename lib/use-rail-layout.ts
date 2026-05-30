"use client";

// use-rail-layout — teacher-scoped preference for which icon buttons live on
// the LEFT shell rail vs. the RIGHT shell rail, and what order they appear in.
//
// Product context (CLAUDE.md §1, Wave 1.5 Lane FA): the left icon rail (the
// `GlobalRail`) is the site-wide chrome — surfaces that belong to "the app"
// rather than a single view. The right icon rail is reserved for context-
// specific affordances. The user wants both rails to be arrangeable — a
// teacher should be able to drag any icon button from one rail to the other,
// and the chosen arrangement should persist across reloads (per-device today,
// per-teacher row when Supabase lands in Phase 1B).
//
// Default layout: every icon lives on the LEFT rail in the canonical order
// the GlobalRail has shipped with since Lane CC promoted it out of the Daily
// IconRail. The right rail starts EMPTY — teachers opt-in by dragging
// individual icons over to it.
//
// SSR-safe pattern mirrors lib/use-school-months.ts:
//   1. The initial state is DEFAULT_RAIL_LAYOUT so the server-rendered HTML
//      matches the first client render (no hydration mismatch).
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs so two
//      tabs of the app stay in lockstep.
//
// Normalization is run on every read AND every write: the canonical icon set
// is fixed, so a layout missing an id (or carrying a duplicate) is repaired
// by appending the missing icons to their default side. This guards against
// data added in a future release while a teacher's localStorage still holds
// the older shape.

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Three sides:
 *   • "left"   — the LEFT shell rail (the original GlobalRail).
 *   • "right"  — the RIGHT shell rail (the mirror, RightIconRail).
 *   • "hidden" — neither rail. Icons in the hidden bucket aren't rendered;
 *                the teacher can move them back via the rail context menu
 *                (right-click / long-press on any visible icon, or via the
 *                Settings page once Lane GC lands).
 *
 * Adding "hidden" lets a teacher quietly remove a never-used button from
 * the chrome (e.g. Voice — coming-soon today) without losing it forever.
 */
export type RailSide = "left" | "right" | "hidden";

/**
 * The canonical icon set. Adding a new icon means:
 *   1. extend this union;
 *   2. add it to DEFAULT_LEFT_ORDER (or DEFAULT_RIGHT_ORDER) in the position
 *      it should default to;
 *   3. teach the rail renderer (components/shell/rail-icons.tsx) to draw it.
 *
 * The id strings double as React keys and dnd-kit Draggable ids, so they MUST
 * be stable across releases.
 */
export type RailIconId =
  | "today"
  | "schedule"
  | "todos"
  | "comments"
  | "resources"
  | "year"
  | "voice"
  | "settings";

export interface RailLayout {
  left: RailIconId[];
  right: RailIconId[];
  /** Icons explicitly hidden from both rails. Preserves teacher intent so
   *  the hidden bucket survives reloads / migrations. */
  hidden: RailIconId[];
}

// ── Canonical icon set + defaults ────────────────────────────────────────

const ALL_ICON_IDS: readonly RailIconId[] = [
  "today",
  "schedule",
  "todos",
  "comments",
  "resources",
  "year",
  "voice",
  "settings",
] as const;

/**
 * Default LEFT-rail order — matches the order GlobalRail.tsx has shipped
 * since Lane CC. `settings` is special-cased downstream as the bottom-pinned
 * slot, but its position in this array determines its index within the rail's
 * sortable list. We keep it last in the array so the default visual order
 * stays unchanged.
 */
const DEFAULT_LEFT_ORDER: RailIconId[] = [
  "today",
  "schedule",
  "todos",
  "comments",
  "resources",
  "year",
  "voice",
  "settings",
];

const DEFAULT_RIGHT_ORDER: RailIconId[] = [];
const DEFAULT_HIDDEN_ORDER: RailIconId[] = [];

export const DEFAULT_RAIL_LAYOUT: RailLayout = {
  left: [...DEFAULT_LEFT_ORDER],
  right: [...DEFAULT_RIGHT_ORDER],
  hidden: [...DEFAULT_HIDDEN_ORDER],
};

// ── Storage ──────────────────────────────────────────────────────────────

/**
 * localStorage key. The rail arrangement is USER-scoped (per the 2026-05-25
 * scoping doctrine in lib/app-state.tsx) — each teacher chooses their own
 * arrangement of icons; it never affects teammates. USER settings live under
 * `mycurricula:user:*` and will migrate to a `user_settings` row when
 * Supabase lands.
 */
const STORAGE_KEY = "mycurricula:user:rail-layout";

function isRailIconId(v: unknown): v is RailIconId {
  return (
    typeof v === "string" && (ALL_ICON_IDS as readonly string[]).includes(v)
  );
}

/**
 * Normalize a (possibly malformed) layout payload:
 *   • keep only known RailIconId strings;
 *   • drop duplicates ACROSS both sides (an id can only live on one rail);
 *   • append any missing icons to their default side at the end.
 *
 * Returns a fresh layout object — the input is never mutated.
 */
function normalize(input: unknown): RailLayout {
  const seen = new Set<RailIconId>();
  const safeLeft: RailIconId[] = [];
  const safeRight: RailIconId[] = [];
  const safeHidden: RailIconId[] = [];

  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.left)) {
      for (const v of obj.left) {
        if (isRailIconId(v) && !seen.has(v)) {
          seen.add(v);
          safeLeft.push(v);
        }
      }
    }
    if (Array.isArray(obj.right)) {
      for (const v of obj.right) {
        if (isRailIconId(v) && !seen.has(v)) {
          seen.add(v);
          safeRight.push(v);
        }
      }
    }
    if (Array.isArray(obj.hidden)) {
      for (const v of obj.hidden) {
        if (isRailIconId(v) && !seen.has(v)) {
          seen.add(v);
          safeHidden.push(v);
        }
      }
    }
  }

  // Append any icons missing from ALL THREE buckets to their default side
  // so a new release that adds an icon shows up in a predictable spot
  // rather than disappearing from a teacher's localStorage entirely.
  for (const id of ALL_ICON_IDS) {
    if (seen.has(id)) continue;
    if (DEFAULT_RAIL_LAYOUT.left.includes(id)) {
      safeLeft.push(id);
    } else if (DEFAULT_RAIL_LAYOUT.right.includes(id)) {
      safeRight.push(id);
    } else {
      safeHidden.push(id);
    }
  }

  return { left: safeLeft, right: safeRight, hidden: safeHidden };
}

function readFromStorage(): RailLayout | null {
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

function writeToStorage(layout: RailLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage disabled / quota exceeded — state still updates in-memory.
  }
}

// ── Same-tab sync (in-process event bus) ─────────────────────────────────
// Multiple components call useRailLayout() in the same tab — every rail
// icon's <SortableWrap> calls the hook to access moveIcon, and both
// <GlobalRail> and <RightIconRail> call it to read `layout`. Each call
// instantiates its OWN useState — meaning a write from one instance does
// NOT update the others (React doesn't share state between hook calls).
// The native `storage` event only fires on OTHER tabs, so without help
// the two rails would desync after a context-menu pick.
//
// Fix: a tiny in-process event bus. Every hook instance subscribes on
// mount; every successful write broadcasts. Subscribers re-read from
// localStorage to refresh their state. This is the same pattern lots of
// other small hooks in the repo use to stay tab-coherent (see
// lib/app-state.tsx for the full Context-based variant — overkill for a
// rail layout that changes infrequently).

type Listener = (next: RailLayout) => void;
const listeners = new Set<Listener>();

function broadcast(layout: RailLayout): void {
  for (const fn of listeners) fn(layout);
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UseRailLayoutResult {
  /** The current arrangement. Server-rendered HTML uses DEFAULT_RAIL_LAYOUT;
   *  a post-mount effect syncs from localStorage. */
  layout: RailLayout;
  /**
   * Move an icon to `toSide` at `toIndex`. If the icon already lives on
   * `toSide`, this re-orders it within the same rail. The hook normalizes
   * every write so callers don't need to worry about uniqueness invariants.
   */
  moveIcon: (id: RailIconId, toSide: RailSide, toIndex: number) => void;
  /** Restore the canonical default arrangement (every icon on the left rail
   *  in its default order). */
  resetToDefault: () => void;
}

export function useRailLayout(): UseRailLayoutResult {
  // SSR-safe initial state — never reads localStorage during render.
  const [layout, setLayout] = useState<RailLayout>(() => ({
    left: [...DEFAULT_RAIL_LAYOUT.left],
    right: [...DEFAULT_RAIL_LAYOUT.right],
    hidden: [...DEFAULT_RAIL_LAYOUT.hidden],
  }));

  // Mirror the latest layout in a ref so the mutators can compute the next
  // value WITHOUT reading it inside a setState updater. The updater is the
  // wrong place for side-effects (writeToStorage / broadcast): broadcast
  // fans a setState out to every other hook instance, and doing that during
  // this instance's render phase trips React's "Cannot update a component
  // while rendering a different component" guard. Keeping a ref lets us run
  // those effects in the event handler (commit phase) instead.
  const layoutRef = useRef<RailLayout>(layout);
  layoutRef.current = layout;

  // Post-mount: sync from localStorage if a value is set, and subscribe to
  // in-process broadcasts so a write from any hook instance updates every
  // other instance in the same tab.
  useEffect(() => {
    const stored = readFromStorage();
    if (stored != null) setLayout(stored);
    const listener: Listener = (next) => setLayout(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        setLayout({
          left: [...DEFAULT_RAIL_LAYOUT.left],
          right: [...DEFAULT_RAIL_LAYOUT.right],
          hidden: [...DEFAULT_RAIL_LAYOUT.hidden],
        });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        setLayout(normalize(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Commit a fully-computed next layout: persist it, update THIS instance,
  // and broadcast to sibling instances. Runs in the event-handler (commit)
  // phase — never inside a setState updater — so the broadcast's cascading
  // setStates don't fire during render. `broadcast` notifies every listener
  // including this instance's own (registered in the mount effect), so a
  // single broadcast keeps all instances in lockstep; we also call setLayout
  // directly so the writing instance updates even before its listener runs.
  const commit = useCallback((next: RailLayout): void => {
    writeToStorage(next);
    setLayout(next);
    broadcast(next);
  }, []);

  const moveIcon = useCallback(
    (id: RailIconId, toSide: RailSide, toIndex: number): void => {
      // Read the latest layout from the ref (not state) so back-to-back
      // moves within one render tick each build on the previous result.
      const prev = layoutRef.current;
      // Strip the icon from EVERY bucket so it can only ever live in one
      // place. This is the single invariant the renderer relies on.
      const left = prev.left.filter((x) => x !== id);
      const right = prev.right.filter((x) => x !== id);
      const hidden = prev.hidden.filter((x) => x !== id);
      let target: RailIconId[];
      if (toSide === "left") target = left;
      else if (toSide === "right") target = right;
      else target = hidden;
      const idx = Math.max(0, Math.min(toIndex, target.length));
      target.splice(idx, 0, id);
      const next = normalize({ left, right, hidden });
      // Keep the ref current immediately so a second moveIcon in the same
      // tick sees this result (setLayout is async; the ref is synchronous).
      layoutRef.current = next;
      commit(next);
    },
    [commit],
  );

  const resetToDefault = useCallback((): void => {
    const next: RailLayout = {
      left: [...DEFAULT_RAIL_LAYOUT.left],
      right: [...DEFAULT_RAIL_LAYOUT.right],
      hidden: [...DEFAULT_RAIL_LAYOUT.hidden],
    };
    layoutRef.current = next;
    commit(next);
  }, [commit]);

  return { layout, moveIcon, resetToDefault };
}
