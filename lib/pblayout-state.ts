"use client";

// pblayout-state.ts — W3.8c: the Week EDIT board's Aligned/Stacked layout axis.
//
// The 7.2.26 bundle's `cc_pblayout` preference: how the Week edit board lays
// its lessons out — `'aligned'` (lessons line up in shared period ROWS by their
// times) or `'stacked'` (each day column stacks its lessons in order, ignoring
// time alignment). It affects ONLY the Week edit board (components/weekly/
// WeekEditBoard); every VIEW surface is untouched. Persisted per user, local
// UI state only — deliberately EXCLUDED from theme-sync (WAVE-3-PLAN C5, which
// lists `cc_pblayout` alongside `cc_editmode`/`cc_deLeftW` as per-view local
// keys that never become synced appearance axes).
//
// ── Why an EVENT BUS, not a Provider (contrast with edit-mode-state.tsx) ────
// lib/edit-mode-state.tsx lifted `cc_editmode` into a React Context/Provider
// because its readers (the chrome, the Day-edit view, the nav reset callsites)
// are scattered across the (planner) layout tree and a provider-less hook would
// give each its OWN useState copy — the weekly-schedule-state desync bug.
//
// Here the constraint is different and SIMPLER: the two consumers — the toggle
// (in the ViewTitle popover, portaled to <body>) and the board (in the weekly
// canvas) — sit in SEPARATE subtrees with no common provider seam short of the
// app root, AND the bundle's contract is already an event: it writes
// `cc_pblayout` and dispatches a `cc-pblayout` CustomEvent that consumers
// listen for. So we honor that LOCKED contract with a window event bus rather
// than threading a new provider through the shell. Every `usePbLayout()`
// instance subscribes to the same window event, so a flip in the popover
// reaches the board in the same tab immediately — the same coherence a provider
// would give, without the wiring. (The in-process-bus idiom mirrors
// lib/use-rail-layout.ts:215-236, but this one rides the bundle's own
// `cc-pblayout` window event instead of a private Set so the contract is met
// literally.)
//
// PERSISTENCE CONTRACT (LOCKED, bundle-exact): localStorage key `cc_pblayout`,
// values `'aligned'` (default) | `'stacked'`; a change writes storage and
// dispatches `window.dispatchEvent(new CustomEvent('cc-pblayout', { detail }))`.
//
// Hydration discipline (the SSR-safe pattern, mirroring use-rail-layout.ts):
// the first render returns 'aligned' so the server HTML and the first client
// render match; a post-mount effect hydrates the saved value. Any stored value
// that isn't exactly 'stacked' normalizes to 'aligned'.

import { useCallback, useEffect, useState } from "react";

// ── Storage key + value types ─────────────────────────────────────────────

const STORAGE_KEY = "cc_pblayout";

/** Same-tab, cross-subtree bus event (bundle-exact name). Fires on every flip
 *  so the toggle (popover) and the board (canvas) stay in lockstep in one tab. */
const EVENT_NAME = "cc-pblayout";

/** The Week edit board's layout axis. `'aligned'` is the resting default. */
export type PbLayout = "aligned" | "stacked";

const DEFAULT_LAYOUT: PbLayout = "aligned";

// ── Read / write helpers — SSR-guarded, non-fatal on storage errors ────────

/** Coerce any input to a valid PbLayout — anything but 'stacked' → 'aligned'. */
function normalize(value: unknown): PbLayout {
  return value === "stacked" ? "stacked" : DEFAULT_LAYOUT;
}

function readLayout(): PbLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    return normalize(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage unavailable (private mode / disabled) — resting default.
    return DEFAULT_LAYOUT;
  }
}

function writeLayout(value: PbLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Quota or private-mode failure — in-memory state still reflects the flip.
  }
}

// ── Public hook ────────────────────────────────────────────────────────────

export interface UsePbLayoutReturn {
  /** The current board layout. SSR + first client render is 'aligned'; a
   *  post-mount effect hydrates the persisted value. */
  layout: PbLayout;
  /** Set the board layout: validates, persists, and broadcasts the
   *  `cc-pblayout` event so the other consumer (board or toggle) updates
   *  immediately in this tab. Invalid values coerce to 'aligned'. */
  setLayout: (value: PbLayout) => void;
}

/**
 * The Week edit board's Aligned/Stacked layout axis. Reads the persisted
 * `cc_pblayout` value and stays in sync with every other `usePbLayout()`
 * instance in the tab (via the `cc-pblayout` window event) and across tabs
 * (via `storage`). SSR-safe: the server render and first client paint both
 * return 'aligned', so there is no hydration mismatch.
 */
export function usePbLayout(): UsePbLayoutReturn {
  // SSR-safe initial state — never reads localStorage during render.
  const [layout, setLayoutState] = useState<PbLayout>(DEFAULT_LAYOUT);

  // Post-mount hydration + same-tab bus subscription. The `cc-pblayout`
  // CustomEvent fires on every flip from any instance (including this one),
  // so a write in the popover updates the board's copy without a reload.
  useEffect(() => {
    setLayoutState(readLayout());
    const onBus = (e: Event): void => {
      const detail = (e as CustomEvent<unknown>).detail;
      setLayoutState(normalize(detail));
    };
    window.addEventListener(EVENT_NAME, onBus);
    return () => window.removeEventListener(EVENT_NAME, onBus);
  }, []);

  // Cross-tab sync: the native `storage` event fires only in OTHER tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      setLayoutState(normalize(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLayout = useCallback((value: PbLayout): void => {
    const next = normalize(value);
    writeLayout(next);
    // Update THIS instance immediately, then broadcast so sibling instances
    // (the other subtree) pick it up. The dispatching instance also receives
    // its own event; setState with the same value is a no-op re-render.
    setLayoutState(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
    }
  }, []);

  return { layout, setLayout };
}
