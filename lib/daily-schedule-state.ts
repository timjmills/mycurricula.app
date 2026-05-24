"use client";

// daily-schedule-state.ts — Daily view's inline-pill state.
//
// The Daily view's chrome now hosts a single small pill:
//
//   • "Subject ↔ Schedule" — when the teacher flips this to "schedule", the
//     Daily layout mounts <ScheduleDayPane day={selectedDay} scope="rail" />
//     as an additional rail beside the existing chrome. The 4-track grid
//     layout is otherwise unchanged (the lesson list, lesson detail, and
//     existing right rail all stay mounted). This is different from the
//     Weekly behavior, which swaps the canvas — here the schedule is an
//     ADDITIVE surface a teacher can keep alongside their lesson detail.
//
// Daily does NOT get a "Lessons only ↔ All events" pill because the day-
// pane component carries its own Bell / Daily / Events tabs inside.
//
// Persistence: same provider-less localStorage pattern as
// useWeeklyScheduleMode in lib/weekly-schedule-state.ts.
//
// Storage key:
//   • mycurricula:daily-schedule-mode → "subject" | "schedule"

import { useCallback, useEffect, useRef, useState } from "react";

// ── Storage key + value type ─────────────────────────────────────────────

const MODE_KEY = "mycurricula:daily-schedule-mode";

/** Whether the Daily view is mounting the Schedule rail alongside its chrome. */
export type DailyScheduleMode = "subject" | "schedule";

const DEFAULT_MODE: DailyScheduleMode = "subject";

// ── Read / write helpers — SSR-guarded, non-fatal on storage errors ──────

function readMode(): DailyScheduleMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "schedule" || raw === "subject" ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function writeMode(value: DailyScheduleMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_KEY, value);
  } catch {
    // Storage full / unavailable — state persists for the session only.
  }
}

// ── Public hook ──────────────────────────────────────────────────────────

export interface UseDailyScheduleModeReturn {
  /** Current Subject ↔ Schedule mode. */
  mode: DailyScheduleMode;
  setMode: (value: DailyScheduleMode) => void;
  /** Derived convenience boolean — true when mode === "schedule". */
  scheduleMode: boolean;
}

/**
 * Daily view's inline-pill state.
 *
 * Provider-less: same SSR-safe + post-mount hydration + write-gated pattern
 * used in lib/weekly-schedule-state.ts. The first render returns DEFAULT_MODE
 * so the SSR HTML and first client render match; a post-mount effect
 * hydrates the saved value. Writes are gated on `hydratedRef` so the
 * hydration effect doesn't immediately overwrite storage with the default.
 */
export function useDailyScheduleMode(): UseDailyScheduleModeReturn {
  const [mode, setModeState] = useState<DailyScheduleMode>(DEFAULT_MODE);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const stored = readMode();
    if (stored !== DEFAULT_MODE) setModeState(stored);
    hydratedRef.current = true;
  }, []);

  const setMode = useCallback((value: DailyScheduleMode): void => {
    setModeState(value);
    if (hydratedRef.current) writeMode(value);
  }, []);

  return {
    mode,
    setMode,
    scheduleMode: mode === "schedule",
  };
}
