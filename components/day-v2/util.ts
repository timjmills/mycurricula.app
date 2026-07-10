"use client";

// util.ts — the NON-COMPONENT members of the v2 Day canvas (a hook + a
// constant). Kept OUT of atoms.tsx (which exports only React components) so
// atoms stays a clean Fast-Refresh boundary: a module that mixes component and
// non-component exports can transiently undefine the non-components on a hot
// edit, which crashed the frames in dev (QA root-cause). lib/day-status.ts
// stays purely non-React; this file is where the day-canvas React-adjacent
// helpers (a client hook + a render constant) live.

import { useEffect, useState } from "react";
import { useNowTick } from "@/lib/use-now-tick";
import { minuteOfDay } from "@/lib/schedule-data";
import type { DayStatus } from "@/lib/day-status";

/**
 * The live minute-of-day driving the "now"/"upcoming" status split, SSR-safe.
 * Before mount it returns a sentinel (−1) so the server HTML and the first
 * client paint agree (nothing reads "now"; timed lessons read "upcoming") — the
 * real clock answer lands post-mount, matching the ScheduleDayPane house
 * pattern. The 30s tick keeps the "now" band and pulse current.
 */
export function useNowMin(): number {
  const now = useNowTick();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted ? minuteOfDay(now) : -1;
}

/** Human status word for a derived day-status (matches the bundle STATUS map). */
export const STATUS_WORD: Record<DayStatus, string> = {
  done: "Done",
  now: "Now",
  upcoming: "Up next",
  idle: "Planned",
};

/**
 * True when a row-level event originated inside a nested interactive element.
 * Guards the containers' double-click-to-plan: dblclick fires even when both
 * clicks landed on a nested button (Finish/Plan/Teach) — the buttons'
 * stopPropagation only stops the CLICK events, not the independent dblclick,
 * so an unguarded handler would e.g. toggle Finish twice AND open the planner
 * (Codex R3).
 */
export function fromInteractive(e: { target: EventTarget | null }): boolean {
  const el = e.target;
  return (
    el instanceof Element &&
    el.closest("button, a, input, textarea, select") !== null
  );
}
