"use client";

// use-phone-viewport.ts — "is this a phone-width viewport?" (below the tablet
// tier). SSR-safe matchMedia, mirroring the isNarrow pattern in WeeklyShell.
//
// Product decision (2026-07-10): editing a lesson plan is a TABLET+/desktop
// affordance — phones are view-only. The chrome hides the View/Edit toggle on
// phones; this hook is the render-layer SAFETY NET so a persisted edit state
// (e.g. carried over from a tablet session) can't strand a phone user in an
// editor with no toggle to leave. The responsive contract (CLAUDE.md §4) puts
// the tablet tier at 600–900px, so "phone" is < 600px.

import { useEffect, useState } from "react";

/** Below the 600px tablet start. */
export const PHONE_MQ = "(max-width: 599.98px)";

/**
 * True on phone-width viewports. Defaults to `false` on the server and the
 * first client paint (a server has no viewport; false ≡ "assume larger"), then
 * syncs to the real width post-mount and on every viewport change.
 */
export function usePhoneViewport(): boolean {
  const [isPhone, setIsPhone] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(PHONE_MQ);
    setIsPhone(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setIsPhone(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    // Older Safari/Chrome (pre-2020) only shipped addListener.
    mq.addListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
    return () => mq.removeListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
  }, []);

  return isPhone;
}
