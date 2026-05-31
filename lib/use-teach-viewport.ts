"use client";

// use-teach-viewport — SSR-safe viewport-tier detection for the Teach shell's
// responsive panel behaviour (docs/teach-view-plan.md §10; the Wave-4 TSX
// follow-up to the Wave-3 CSS pass documented in
// docs/teach-a11y-responsive-notes.md "CSS-only limits — needs TSX").
//
// WHY THIS EXISTS. The Wave-3 CSS pass turned the left/right panels into
// `position: fixed` overlay drawers at ≤900px, but `TeachWorkspace.tsx` still
// mounts BOTH panels open by default regardless of viewport, so on a phone or
// tablet two drawers overlap on first load. Fixing that needs the viewport read
// in JS — pure CSS cannot read the collapse state or change the React default.
// This hook is the single source of truth for "which tier are we at", and the
// workspace uses it to (a) auto-collapse both panels when crossing INTO a small
// tier, (b) enforce one-drawer-at-a-time on small screens, and (c) mount the
// tap-to-dismiss scrim only when small.
//
// SSR-SAFE PATTERN, mirrored from lib/use-rail-layout.ts:
//   1. The initial useState is the DESKTOP tier so the server-rendered HTML and
//      the FIRST client render agree (no hydration mismatch). We never read
//      `matchMedia` during render — only inside a post-mount effect.
//   2. A post-mount effect reads the real viewport via `matchMedia` and updates
//      state; from then on the value is correct.
//   3. `change` listeners on each media query keep the tier live as the user
//      resizes / rotates, so the workspace can re-apply sensible defaults on a
//      cross-breakpoint transition.
//
// The breakpoints match the §10 contract + the Wave-3 CSS module breakpoints:
//   • phone  ≤ 480px  — single column, full-height drawers, board 1-up
//   • tablet ≤ 900px  — rails + ONE overlay drawer at a time
//   • desktop > 900px — full shell, both panels may be open

import { useEffect, useState } from "react";

/** The three responsive tiers, widest → narrowest. */
export type TeachViewportTier = "desktop" | "tablet" | "phone";

export interface TeachViewport {
  /** The current tier. SSR + first client render is always "desktop"; a
   *  post-mount effect swaps in the real value. */
  tier: TeachViewportTier;
  /** Convenience: ≤900px (tablet OR phone) — the breakpoint at which panels
   *  become overlay drawers and only one may be open at a time. */
  isSmall: boolean;
  /** Convenience: ≤480px (phone) — full-height drawers, board forced 1-up. */
  isPhone: boolean;
}

// The query strings are intentionally aligned with the Wave-3 CSS module
// breakpoints so JS and CSS never disagree about which tier is active.
const SMALL_QUERY = "(max-width: 900px)";
const PHONE_QUERY = "(max-width: 480px)";

function tierFor(small: boolean, phone: boolean): TeachViewportTier {
  if (phone) return "phone";
  if (small) return "tablet";
  return "desktop";
}

/**
 * SSR-safe Teach viewport tier. Returns `desktop` on the server and the first
 * client paint, then the real tier after mount. Re-renders on cross-breakpoint
 * resize so callers can react to a tier change.
 */
export function useTeachViewport(): TeachViewport {
  // SSR-safe initial state — assume DESKTOP so the server HTML matches the first
  // client render. Never touch matchMedia during render.
  const [vp, setVp] = useState<TeachViewport>(() => ({
    tier: "desktop",
    isSmall: false,
    isPhone: false,
  }));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;

    const smallMql = window.matchMedia(SMALL_QUERY);
    const phoneMql = window.matchMedia(PHONE_QUERY);

    const sync = (): void => {
      const small = smallMql.matches;
      const phone = phoneMql.matches;
      setVp((prev) => {
        const tier = tierFor(small, phone);
        // Skip the state write when nothing changed so we don't churn renders
        // on a resize that stays within the same tier.
        if (
          prev.tier === tier &&
          prev.isSmall === small &&
          prev.isPhone === phone
        )
          return prev;
        return { tier, isSmall: small, isPhone: phone };
      });
    };

    // Read the real viewport now that we're mounted.
    sync();

    smallMql.addEventListener("change", sync);
    phoneMql.addEventListener("change", sync);
    return () => {
      smallMql.removeEventListener("change", sync);
      phoneMql.removeEventListener("change", sync);
    };
  }, []);

  return vp;
}
