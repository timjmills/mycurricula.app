"use client";

// tooltip-dismissal.ts — W2-B3 dismissible onboarding-tooltip system.
//
// CLAUDE.md §4 (the dismissible model) supersedes the prior "every control
// always shows a tooltip" rule. Each non-obvious control opts into
// dismissibility by passing a stable `tooltipId` to <Tooltip>. The hook
// tracks two pieces of state:
//
//   • Per-id dismissed set — `mycurricula:user:tooltip-dismissed`,
//     stored as a JSON string[]. A teacher clicks "Turn off these tips"
//     inside the bubble; the id is added to the set; subsequent hovers
//     never reopen that specific tooltip.
//   • Global off flag — `mycurricula:user:tooltips-off`, stored as the
//     literal string "true" or "false". When ON, every non-required
//     tooltip is suppressed regardless of per-id dismissal. The toggle
//     lives in Settings → Appearance → Onboarding tooltips.
//
// `required: true` callsites bypass both layers — used for the
// Personal/Team toggle, destructive actions (archive, delete), and
// team-wide settings cards where the warning must always paint.
//
// SSR safety:
//   The hook's initial state is `dismissed: false, globalOff: false` so
//   the server-rendered HTML matches the first client render. Reading
//   localStorage happens inside a useEffect post-mount; React then
//   re-renders with the persisted state. This mirrors the same pattern
//   used by lib/app-state.tsx:312-316 and lib/use-school-week.ts.
//
// Cross-tab sync:
//   The `storage` event fires on OTHER tabs (not the one doing the
//   write), so a teacher who flips the "Show onboarding tooltips"
//   switch in Settings sees the change reflected immediately in any
//   open planner tab.

import { useCallback, useEffect, useState } from "react";

// ── Storage keys ─────────────────────────────────────────────────────────

const DISMISSED_KEY = "mycurricula:user:tooltip-dismissed";
const GLOBAL_OFF_KEY = "mycurricula:user:tooltips-off";

// ── localStorage helpers (SSR-guarded) ──────────────────────────────────

function readDismissedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    // Malformed JSON or storage unavailable — fall through to empty.
  }
  return new Set();
}

function writeDismissedSet(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or private-mode failure — state is still good for this tab.
  }
}

function readGlobalOff(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GLOBAL_OFF_KEY) === "true";
  } catch {
    return false;
  }
}

function writeGlobalOff(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOBAL_OFF_KEY, v ? "true" : "false");
  } catch {
    // Same swallow-and-continue policy as the dismissed-set writer.
  }
}

// ── Public surface ─────────────────────────────────────────────────────

/**
 * Count of currently-dismissed tooltip ids. SSR-safe (returns 0 on the
 * server). Consumed by the Settings page to render "N tips dismissed"
 * + decide whether the "Reset dismissed tooltips" button is enabled.
 *
 * Not a hook — call it inside an effect or event handler so the
 * settings page can refresh after a reset. Subscribing to changes is
 * the consumer's responsibility (e.g. setDismissedCount on dismiss).
 */
export function countDismissed(): number {
  return readDismissedSet().size;
}

/** State + actions returned by `useTooltipDismissal`. */
export interface TooltipDismissalState {
  /**
   * True when THIS tooltip should be suppressed. Reflects either the
   * specific id being in the dismissed set OR the global-off flag.
   * When the caller passes `undefined` for id, this stays false — the
   * settings page consumer reads `globalOff` directly instead.
   */
  dismissed: boolean;
  /**
   * Mark THIS tooltip id as dismissed. No-op when the hook was called
   * with `undefined` (which means "give me the global controls only").
   */
  dismiss: () => void;
  /** True when the global off flag is set in Settings. */
  globalOff: boolean;
  /** Flip the global off flag. Mirrors to localStorage + cross-tab. */
  setGlobalOff: (v: boolean) => void;
  /** Clear every dismissed id. Does NOT touch the global off flag. */
  resetAll: () => void;
}

/**
 * React hook surfacing the dismissibility state for a single tooltip,
 * plus the global controls used by the Settings page.
 *
 * Callers:
 *   • `<Tooltip>` passes its `tooltipId` prop and reads `dismissed`
 *     to decide whether to paint the bubble. `required: true`
 *     callsites bypass this entirely.
 *   • Settings → Appearance passes `undefined` and uses
 *     `{ globalOff, setGlobalOff, resetAll }` to drive the toggle +
 *     reset button.
 */
export function useTooltipDismissal(
  id: string | undefined,
): TooltipDismissalState {
  // Start with defaults (matches the SSR render). Post-mount, the effect
  // below reads localStorage and updates if needed.
  const [dismissed, setDismissed] = useState(false);
  const [globalOff, setGlobalOffState] = useState(false);

  // Mount-time hydration from localStorage.
  useEffect(() => {
    const ids = readDismissedSet();
    const off = readGlobalOff();
    setGlobalOffState(off);
    if (id !== undefined) {
      setDismissed(ids.has(id) || off);
    }
  }, [id]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handler(e: StorageEvent): void {
      if (e.key === DISMISSED_KEY) {
        if (id !== undefined) {
          setDismissed(readDismissedSet().has(id) || readGlobalOff());
        }
      } else if (e.key === GLOBAL_OFF_KEY) {
        const off = readGlobalOff();
        setGlobalOffState(off);
        if (id !== undefined) {
          setDismissed(readDismissedSet().has(id) || off);
        }
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [id]);

  const dismiss = useCallback((): void => {
    if (id === undefined) return;
    const ids = readDismissedSet();
    if (ids.has(id)) return;
    ids.add(id);
    writeDismissedSet(ids);
    setDismissed(true);
  }, [id]);

  const setGlobalOff = useCallback(
    (v: boolean): void => {
      writeGlobalOff(v);
      setGlobalOffState(v);
      if (id !== undefined) {
        // When the global flag flips on, suppress this id immediately;
        // when it flips off, re-evaluate based on the per-id set.
        setDismissed(v || readDismissedSet().has(id));
      }
    },
    [id],
  );

  const resetAll = useCallback((): void => {
    writeDismissedSet(new Set());
    // The per-id `dismissed` may still be true if global-off is on,
    // since a reset doesn't touch the global flag.
    if (id !== undefined) {
      setDismissed(readGlobalOff());
    }
  }, [id]);

  return { dismissed, dismiss, globalOff, setGlobalOff, resetAll };
}
