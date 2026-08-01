"use client";

// week-expansion.ts — the Week view's shared inline-expansion state.
//
// WHY THIS EXISTS. /weekly used to answer a lesson click by opening a right
// panel. It no longer has one (see components/shell/right-panel.tsx's /weekly
// gate and the rail removal in WeeklyShell): a click now EXPANDS THE CARD IN
// PLACE, and a single "Expand all" control in the page header opens every
// lesson in the visible week at once.
//
// That control is the reason this state cannot live inside a canvas. The
// button renders in <WeeklyViewControls> (the WeekNavigator `actions` slot,
// above the canvas), while the expanded/collapsed set is consumed by whichever
// canvas the frame axis picked — WeekColumns (paper), WeekA (glass), or WeekC
// (color). Writer and reader sit on opposite sides of the shell, so they need
// ONE shared instance above both. This is the same problem — and the same
// solution — as lib/weekly-schedule-state.ts, whose header records what a
// provider-less hook cost the last time: two useState copies, and a toggle that
// only took effect after a reload.
//
// ── The visible-id registry ────────────────────────────────────────────────
// "Expand all" means "every lesson the teacher can currently SEE", not every
// lesson in the store. The canvas is the only thing that knows that set — it
// owns the week bucketing, the archived exclusion, and the search/filter
// predicate. So the canvas PUBLISHES its rendered ids here (publishVisible),
// and expandAll() expands exactly those. A filtered-down week therefore
// expands only what it shows, and the button's own label can honestly say
// whether everything on screen is already open.
//
// ── No provider? No crash. ─────────────────────────────────────────────────
// useWeeklyScheduleMode() throws outside its provider, which is right for a
// toggle that would otherwise silently desync. This hook must NOT: the three
// canvases are self-contained components that are also rendered directly by
// tests and could be reused outside <WeeklyShell>. Outside a provider each
// consumer falls back to its OWN local instance, so a standalone canvas still
// expands and collapses — it just has no shared "expand all" partner, which is
// exactly the truth of that mounting.
//
// ── Persistence: deliberately none ─────────────────────────────────────────
// Expansion is a reading posture, not a preference — it says "I am looking at
// this right now", so it should not outlive the session the way rail width or
// frame choice do. It is NOT reset on week change either: the set is keyed by
// lesson id, so stepping to week 13 shows collapsed cards (none of week 13's
// ids are in the set) and stepping back to week 12 finds it exactly as it was
// left. That falls out of the id-keyed shape; no week-change effect is needed.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

// ── Public shape ──────────────────────────────────────────────────────────

export interface WeekExpansion {
  /** Is this lesson's card currently expanded in place? */
  isExpanded: (lessonId: string) => boolean;
  /** Expand a collapsed card / collapse an expanded one. */
  toggle: (lessonId: string) => void;
  /**
   * Expand this lesson whether or not it is already expanded. Idempotent on
   * purpose — the callers are a deep link and a double-click, and both can
   * fire against an already-open card, where a toggle would SHUT it.
   */
  expand: (lessonId: string) => void;
  /**
   * Collapse this lesson if it is open; a no-op if it is not. The Esc handler
   * needs "close this one" and must not accidentally open a shut card.
   */
  collapse: (lessonId: string) => void;
  /** Expand every lesson the canvas last published as visible. */
  expandAll: () => void;
  /**
   * Collapse everything the canvas is currently showing. Scoped to the VISIBLE
   * set, not the whole store, so it is the exact inverse of expandAll() and
   * matches a control that says "this week": stepping to another week and
   * collapsing there must not silently discard the reading state a teacher
   * left open on the week they came from.
   */
  collapseAll: () => void;
  /**
   * True when the visible set is non-empty AND every one of its ids is
   * expanded — i.e. the header control should now offer "Collapse all".
   */
  allExpanded: boolean;
  /** How many lessons the canvas is currently showing. Zero hides the control. */
  visibleCount: number;
  /**
   * The canvas reports the lesson ids it is rendering, post-filter. Safe to
   * call every render: an unchanged set is ignored, so this never loops.
   */
  publishVisible: (lessonIds: readonly string[]) => void;
  /**
   * Drag start — remember what was open, then collapse everything to chips
   * (the collapse-on-drag pattern). Restored by restoreSnapshot() on drop or
   * cancel. Nested calls keep the FIRST snapshot, so a drag that starts while
   * another is somehow still unwinding cannot capture the collapsed set and
   * restore a week of shut cards.
   */
  snapshotAndCollapse: () => void;
  /** Drop / cancel — put back whatever snapshotAndCollapse() remembered. */
  restoreSnapshot: () => void;
}

// ── The state engine, shared by the provider and the fallback ─────────────
// Both the provider and the no-provider fallback need identical behavior, so
// the whole implementation lives in one hook and each entry point mounts its
// own instance of it.

function useWeekExpansionEngine(): WeekExpansion {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // The visible set is STATE, not a ref, because `allExpanded` is derived from
  // it and has to recompute when it moves — a ref would go stale and the
  // header control would sit on the wrong label. The extra renders it can
  // cause are bounded: publishVisible below returns early unless the ids
  // actually changed, which is precisely when a re-render was needed anyway.
  const [visibleIds, setVisibleIds] = useState<readonly string[]>([]);
  // Non-null only between snapshotAndCollapse() and restoreSnapshot().
  const snapshotRef = useRef<ReadonlySet<string> | null>(null);

  const isExpanded = useCallback(
    (lessonId: string): boolean => expandedIds.has(lessonId),
    [expandedIds],
  );

  const toggle = useCallback((lessonId: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(lessonId)) next.add(lessonId);
      return next;
    });
  }, []);

  const expandAll = useCallback((): void => {
    // Union rather than replace: ids that scrolled out of the filter stay
    // expanded, so narrowing a filter and widening it again does not silently
    // collapse the cards the teacher had already opened.
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }, [visibleIds]);

  const expand = useCallback((lessonId: string): void => {
    setExpandedIds((prev) => {
      if (prev.has(lessonId)) return prev; // same Set — React bails out
      const next = new Set(prev);
      next.add(lessonId);
      return next;
    });
  }, []);

  const collapse = useCallback((lessonId: string): void => {
    setExpandedIds((prev) => {
      if (!prev.has(lessonId)) return prev;
      const next = new Set(prev);
      next.delete(lessonId);
      return next;
    });
  }, []);

  const collapseAll = useCallback((): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.delete(id);
      return next;
    });
  }, [visibleIds]);

  const publishVisible = useCallback((lessonIds: readonly string[]): void => {
    // The functional form reads the live value, so this callback keeps a
    // stable identity and the canvas effect that calls it does not re-fire
    // every time the visible set moves.
    setVisibleIds((prev) =>
      prev.length === lessonIds.length &&
      prev.every((id, i) => id === lessonIds[i])
        ? prev // unchanged — return the SAME array so React bails out
        : lessonIds.slice(),
    );
  }, []);

  const snapshotAndCollapse = useCallback((): void => {
    setExpandedIds((prev) => {
      if (snapshotRef.current === null) snapshotRef.current = prev;
      return new Set<string>();
    });
  }, []);

  const restoreSnapshot = useCallback((): void => {
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    // A restore with no snapshot means the drag never collapsed anything;
    // leaving the current set alone is right, and clearing it would shut every
    // card the teacher opened mid-drag.
    if (snapshot !== null) setExpandedIds(snapshot);
  }, []);

  // Recomputed rather than stored: the visible set and the expanded set both
  // move, and a cached boolean would be the thing that goes stale.
  const allExpanded = useMemo(
    () =>
      visibleIds.length > 0 && visibleIds.every((id) => expandedIds.has(id)),
    [expandedIds, visibleIds],
  );

  return useMemo<WeekExpansion>(
    () => ({
      isExpanded,
      toggle,
      expand,
      collapse,
      expandAll,
      collapseAll,
      allExpanded,
      visibleCount: visibleIds.length,
      publishVisible,
      snapshotAndCollapse,
      restoreSnapshot,
    }),
    [
      isExpanded,
      toggle,
      expand,
      collapse,
      expandAll,
      collapseAll,
      allExpanded,
      visibleIds,
      publishVisible,
      snapshotAndCollapse,
      restoreSnapshot,
    ],
  );
}

// ── Context + provider ────────────────────────────────────────────────────

const WeekExpansionContext = createContext<WeekExpansion | null>(null);

/**
 * Owns the Week view's expanded-card set and shares ONE instance with every
 * consumer beneath it. Mount it once, above BOTH the header control
 * (<WeeklyViewControls>) and the canvas — i.e. at the top of <WeeklyShell>.
 */
export function WeekExpansionProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const value = useWeekExpansionEngine();
  // createElement, not JSX, so this module stays a `.ts` file — matching
  // lib/weekly-schedule-state.ts, which its importers reference extensionless.
  return createElement(WeekExpansionContext.Provider, { value }, children);
}

// ── Public hook ───────────────────────────────────────────────────────────

/**
 * The Week view's inline-expansion state.
 *
 * Inside <WeekExpansionProvider> every caller shares one set, so the header's
 * "Expand all" and a card's own click are operating on the same thing. Outside
 * it, the caller gets a private instance instead of an exception — see the
 * "No provider? No crash." note at the top of this file.
 */
export function useWeekExpansion(): WeekExpansion {
  // Hooks cannot be called conditionally, so the fallback engine is mounted
  // unconditionally and simply discarded when a provider is present. It holds
  // two useState cells and three refs; the waste is not measurable.
  const fallback = useWeekExpansionEngine();
  const shared = useContext(WeekExpansionContext);
  return shared ?? fallback;
}
