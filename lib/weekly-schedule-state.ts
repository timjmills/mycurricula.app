"use client";

// weekly-schedule-state.ts — Weekly view's inline-pill state.
//
// The Weekly view's chrome now hosts TWO small pills above the grid panel:
//
//   • "Subject ↔ Schedule" — the primary mode toggle. When the teacher flips
//     this to "schedule", the grid panel renders <ScheduleTimeline scope="week"
//     showNonAcademic={includeAllEvents} /> in place of <WeeklyGrid /> /
//     <WeeklyList />. This is NOT the global top-bar Grid/List ViewMode — that
//     stays focused on lesson-card layout. Schedule mode is a view-local
//     mode toggle, hence a view-local state hook.
//
//   • "Lessons only ↔ All events" — only visible when Schedule mode is on.
//     Controls whether non-academic blocks (recess, lunch, morning meeting,
//     etc.) appear in the timeline alongside lesson blocks. Defaults to
//     "lessons only" so a teacher sees just the curriculum at first glance.
//
// Persistence: both pills persist to localStorage. Same SSR-safe + post-
// mount hydration + write-gated pattern used in lib/year-state.tsx — the
// only structural difference here is no Provider/Context, because both pills
// have a single consumer (the Weekly shell). The hook can be called directly
// from the shell and the pill component.
//
// Storage keys:
//   • mycurricula:weekly-schedule-mode      → "subject" | "schedule"
//   • mycurricula:weekly-schedule-include-events → "lessons" | "all"

import { useCallback, useEffect, useRef, useState } from "react";

// ── Storage keys + value types ───────────────────────────────────────────

const MODE_KEY = "mycurricula:weekly-schedule-mode";
const EVENTS_KEY = "mycurricula:weekly-schedule-include-events";

/** Which canvas the Weekly grid panel renders. */
export type WeeklyScheduleMode = "subject" | "schedule";

/** When in Schedule mode, whether non-academic blocks show alongside lessons. */
export type WeeklyScheduleEvents = "lessons" | "all";

const DEFAULT_MODE: WeeklyScheduleMode = "subject";
const DEFAULT_EVENTS: WeeklyScheduleEvents = "lessons";

// ── Read / write helpers — SSR-guarded, non-fatal on storage errors ──────

function readMode(): WeeklyScheduleMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "schedule" || raw === "subject" ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function writeMode(value: WeeklyScheduleMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_KEY, value);
  } catch {
    // Storage full / unavailable — state persists for the session only.
  }
}

function readEvents(): WeeklyScheduleEvents {
  if (typeof window === "undefined") return DEFAULT_EVENTS;
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    return raw === "all" || raw === "lessons" ? raw : DEFAULT_EVENTS;
  } catch {
    return DEFAULT_EVENTS;
  }
}

function writeEvents(value: WeeklyScheduleEvents): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EVENTS_KEY, value);
  } catch {
    // Non-fatal — same reasoning as writeMode.
  }
}

// ── Public hook ──────────────────────────────────────────────────────────

export interface UseWeeklyScheduleModeReturn {
  /** Current Subject ↔ Schedule mode. */
  mode: WeeklyScheduleMode;
  setMode: (value: WeeklyScheduleMode) => void;
  /** Derived convenience boolean — true when mode === "schedule". */
  scheduleMode: boolean;
  /** Lessons-only ↔ All-events toggle (only meaningful in Schedule mode). */
  events: WeeklyScheduleEvents;
  setEvents: (value: WeeklyScheduleEvents) => void;
  /** Derived convenience boolean — true when events === "all". */
  includeAllEvents: boolean;
}

/**
 * Weekly view's inline-pill state.
 *
 * Provider-less: the hook owns its own state and the localStorage round-trip.
 * The first render returns DEFAULT_* so the SSR HTML and first client render
 * match; a post-mount effect hydrates the saved values. Writes are gated on
 * `hydratedRef` so the hydration effect doesn't immediately overwrite storage
 * with the defaults.
 */
export function useWeeklyScheduleMode(): UseWeeklyScheduleModeReturn {
  const [mode, setModeState] = useState<WeeklyScheduleMode>(DEFAULT_MODE);
  const [events, setEventsState] =
    useState<WeeklyScheduleEvents>(DEFAULT_EVENTS);
  const hydratedRef = useRef(false);

  // Post-mount hydration — load any persisted values, then flip the gate.
  // Same effect for both keys so the write gate flips exactly once.
  useEffect(() => {
    const storedMode = readMode();
    const storedEvents = readEvents();
    if (storedMode !== DEFAULT_MODE) setModeState(storedMode);
    if (storedEvents !== DEFAULT_EVENTS) setEventsState(storedEvents);
    hydratedRef.current = true;
  }, []);

  const setMode = useCallback((value: WeeklyScheduleMode): void => {
    setModeState(value);
    if (hydratedRef.current) writeMode(value);
  }, []);

  const setEvents = useCallback((value: WeeklyScheduleEvents): void => {
    setEventsState(value);
    if (hydratedRef.current) writeEvents(value);
  }, []);

  return {
    mode,
    setMode,
    scheduleMode: mode === "schedule",
    events,
    setEvents,
    includeAllEvents: events === "all",
  };
}
