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
// mount hydration + write-gated pattern used in lib/year-state.tsx.
//
// ── Why a Provider/Context (was: provider-less useState) ──────────────────
// The Weekly chrome has TWO consumers of this state that must agree in real
// time: <WeeklyViewControls> (the WRITER — the Grid/List/Schedule toggle in
// the page-header actions slot) and <WeeklyShell> (the READER — picks
// WeeklyGrid vs. ScheduleTimeline for the canvas). A provider-less hook gave
// each its OWN useState copy, so clicking the toggle updated the controls'
// copy + localStorage but left the shell's copy stale: the canvas only
// switched Grid→Schedule after a full reload. Lifting the state into a
// shared context — one instance mounted above both consumers
// (<WeeklyScheduleProvider> at the top of WeeklyShell) — makes the toggle
// flip the canvas immediately, in-session. The localStorage round-trip and
// SSR-safety are unchanged; only the state's HOME moved from per-hook to the
// shared provider.
//
// Storage keys:
//   • mycurricula:weekly-schedule-mode      → "subject" | "schedule"
//   • mycurricula:weekly-schedule-include-events → "lessons" | "all"

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

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

// ── Public shape ──────────────────────────────────────────────────────────

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

// ── Context ────────────────────────────────────────────────────────────────

const WeeklyScheduleContext = createContext<UseWeeklyScheduleModeReturn | null>(
  null,
);

// ── Provider ────────────────────────────────────────────────────────────────

/**
 * Owns the Subject↔Schedule + Lessons↔All state for the Weekly view and
 * shares ONE instance with every consumer beneath it. Mount it once, above
 * both <WeeklyViewControls> (writer) and the canvas reader — i.e. at the top
 * of <WeeklyShell>.
 *
 * Hydration discipline (unchanged from the old hook): the first render
 * returns DEFAULT_* so the SSR HTML and the first client render match; a
 * post-mount effect hydrates the saved values. Writes are gated on
 * `hydratedRef` so the hydration effect doesn't immediately overwrite storage
 * with the defaults.
 */
export function WeeklyScheduleProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
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

  const value = useMemo<UseWeeklyScheduleModeReturn>(
    () => ({
      mode,
      setMode,
      scheduleMode: mode === "schedule",
      events,
      setEvents,
      includeAllEvents: events === "all",
    }),
    [mode, setMode, events, setEvents],
  );

  // No JSX here so this module can stay a `.ts` file (the importers reference
  // it extensionless); createElement is the plain-TS equivalent of
  // <WeeklyScheduleContext.Provider value={value}>{children}</…>.
  return createElement(WeeklyScheduleContext.Provider, { value }, children);
}

// ── Public hook ──────────────────────────────────────────────────────────

/**
 * Weekly view's inline-pill state. Reads the shared instance from
 * <WeeklyScheduleProvider>; both the writer (WeeklyViewControls) and the
 * reader (WeeklyShell canvas) get the SAME state object, so a toggle is
 * reflected across the view immediately with no reload.
 *
 * Throws if used outside the provider — a loud failure beats two silently
 * desynced copies (the bug this replaced).
 */
export function useWeeklyScheduleMode(): UseWeeklyScheduleModeReturn {
  const ctx = useContext(WeeklyScheduleContext);
  if (!ctx) {
    throw new Error(
      "useWeeklyScheduleMode must be used within a <WeeklyScheduleProvider>",
    );
  }
  return ctx;
}
