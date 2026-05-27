"use client";

// use-rails-drag-intro — W3-C7 first-session pulse gate for the shell rails.
//
// CLAUDE.md §4 mandates that every interactive control has a discoverability
// affordance. The shell rails (GlobalRail + RightIconRail) added drag-to-
// rearrange in Wave 1.5 Lane FA, but the affordance is invisible — a teacher
// has no signal that the icons can be picked up. W3-C7 introduces a one-
// time pulse animation on the FIRST rail icon to telegraph "these are
// draggable". The pulse fires exactly once per teacher (per device today;
// per-user row when Supabase lands in Phase 1B) and is then suppressed
// forever via this hook's localStorage gate.
//
// ── SSR safety ───────────────────────────────────────────────────────────
// Same pattern as lib/use-school-week.ts and lib/tooltip-dismissal.ts:
//   • Initial state is `hasIntroduced: false` so the server-rendered HTML
//     matches the first client render (no hydration mismatch).
//   • A post-mount useEffect reads localStorage and updates the state.
//   • The renderer must wait for `hasIntroduced` to be FALSE *and* for a
//     mount-confirmation flag before painting the pulse — otherwise the
//     server render would briefly paint the animation before the effect
//     can read storage.
//
// ── Storage key ──────────────────────────────────────────────────────────
// `mycurricula:user:rails-drag-introduced` — string "true" once introduced.
// USER-scoped (per-teacher), following the doctrine in lib/app-state.tsx.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mycurricula:user:rails-drag-introduced";

function readFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Storage disabled / private mode — treat as "not yet introduced" so
    // the pulse still tries to fire; the worst case is the user sees it
    // every reload, which is still better than never.
    return false;
  }
}

function writeToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Quota / private-mode failure — state is still good for this session.
  }
}

export interface UseRailsDragIntroResult {
  /**
   * True once the post-mount effect has read localStorage. Renderers MUST
   * gate the pulse on `mounted && !hasIntroduced` so the server-rendered
   * HTML never paints the animation prematurely.
   */
  mounted: boolean;
  /** True once the teacher has been introduced to the drag affordance. */
  hasIntroduced: boolean;
  /** Persist the "introduced" flag so the pulse never fires again. */
  markIntroduced: () => void;
}

/**
 * Returns the first-session drag-intro state. Called by the rail renderer
 * on its FIRST icon only; consumers wrap their pulse animation in a
 * `mounted && !hasIntroduced` gate and call `markIntroduced()` after the
 * animation finishes (typically a 2s setTimeout matching the keyframes
 * duration).
 */
export function useRailsDragIntro(): UseRailsDragIntroResult {
  // SSR-safe initial state. We use a separate `mounted` flag (rather than
  // a tri-state `hasIntroduced: boolean | null`) so callers can write a
  // simple `mounted && !hasIntroduced` boolean check.
  const [mounted, setMounted] = useState(false);
  const [hasIntroduced, setHasIntroduced] = useState(false);

  useEffect(() => {
    setHasIntroduced(readFromStorage());
    setMounted(true);
  }, []);

  const markIntroduced = useCallback((): void => {
    writeToStorage();
    setHasIntroduced(true);
  }, []);

  return { mounted, hasIntroduced, markIntroduced };
}
