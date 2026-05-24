"use client";

// use-now-tick.ts — a live "now" Date that re-renders every 30 seconds.
//
// Used by the Schedule surfaces (ScheduleView's header pill, ScheduleColumn's
// now-line) so the time displayed and the now-line position stay current
// without each consumer running its own interval. Pulling the hook out of
// `lib/schedule-data.ts` keeps that file framework-agnostic (it's just
// constants + pure helpers) and lets other live-time surfaces re-use it.
//
// ── Design notes ─────────────────────────────────────────────────────────
// • SSR-safe: the initial value comes from `new Date()` synchronously on the
//   client; on the server (`typeof window === "undefined"`) the hook never
//   starts an interval. The first render uses the constructor value so we
//   don't render `null` and immediately re-render — both halves of the
//   hydration pair see the same instant-of-construction.
// • 30s cadence is enough resolution for the now-line: the column geometry
//   moves 0.7px per minute (PX_PER_MIN = 1.4), so a 30s tick translates to
//   sub-pixel motion you wouldn't see anyway. Cheaper than 1s.
// • `enabled: false` cleanly turns the hook off — the interval is never
//   created and the returned Date freezes at the last value. Use this when
//   the Schedule mode is hidden (other view-mode active) so a long-running
//   tab doesn't accumulate timers.
// • No `requestAnimationFrame` here on purpose: we want updates while the
//   tab is backgrounded so the now-line is correct the moment the user
//   returns. setInterval continues running in inactive tabs (throttled by
//   the browser but still firing).
// • `prefers-reduced-motion` is intentionally not auto-checked here. The
//   hook simply re-renders; consumers decide whether any motion (e.g. an
//   auto-scroll into view) should be skipped under reduced motion. Surfaces
//   that use this hook should not animate the now-line position itself —
//   the dot's halo carries enough signal.

import { useEffect, useState } from "react";

/** Tick interval in milliseconds — 30s; see the rationale in the header. */
const TICK_MS = 30_000;

interface UseNowTickOptions {
  /** When `false`, no interval runs and the returned Date does not update. */
  enabled?: boolean;
}

/**
 * Return the current Date and re-render every {@link TICK_MS} milliseconds.
 *
 * Pass `enabled: false` to freeze the value (e.g. while a different view
 * mode is mounted) so the timer doesn't keep firing off-screen.
 */
export function useNowTick(options: UseNowTickOptions = {}): Date {
  const { enabled = true } = options;

  // Lazy initial so the server and client first paint match: on the server
  // `Date.now()` is called once per request; on the client, once per mount.
  // The cost is negligible and avoids the "render null, then render Date"
  // flicker some hooks ship with.
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    const id = window.setInterval(() => {
      setNow(new Date());
    }, TICK_MS);

    return () => {
      window.clearInterval(id);
    };
  }, [enabled]);

  return now;
}
