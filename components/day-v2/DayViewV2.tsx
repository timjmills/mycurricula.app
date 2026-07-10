"use client";

// DayViewV2.tsx — the frame switcher for the v2 Day VIEW canvas. The appearance
// frame (useTheme().frame) selects one of three faithful renderings of the same
// day:
//   • "glass" → DayA  — Calm Recede vertical timeline
//   • "paper" → DayB  — Bright Workspace rail + focus
//   • "color" → DayC  — Color-forward agenda + hero
//
// Builder B (DailyView) owns integration: it filters + orders the visible day's
// lessons, renders the holiday banner/empty-state, and passes the existing
// prev/next, planner-open, and quick-add seams through DayViewV2Props. Every
// other piece of state (lessons, completion, selection, subjects) each frame
// reads directly from the stores (the W3.8c precedent), so the shell contract
// stays small.

import { type ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { Lesson } from "@/lib/types";
import { DayA } from "./DayA";
import { DayB } from "./DayB";
import { DayC } from "./DayC";

export interface DayViewV2Props {
  /** The visible day's lessons, already filtered + ordered by the shell. */
  dayLessons: Lesson[];
  /** Week number (context; the shell owns navigation). */
  week: number;
  /** 0-based position in the configured school week. */
  day: number;
  /** Long weekday name, e.g. "Sunday". */
  dayLabel: string;
  /** Date sublabel, e.g. "Jun 14 · 2026". */
  dateLabel: string;
  /** Whether the visible day IS today. Gates the live "now"/"upcoming" split:
   *  when false, the wall clock never paints a false "now" ring / pulsing
   *  Finish (every non-done lesson reads "Planned") and the B/C focus fallback
   *  becomes selectedId → first lesson (current/next are skipped). */
  isToday: boolean;
  /** The selected/focused lesson id, OWNED BY THE SHELL. The canvas does NOT
   *  read global selection: the /daily deep-link resolver keeps its selection
   *  in the shell's LOCAL state and deliberately clears the global
   *  selectedLessonId (the PR#27 warm-nav-bounce fix), so a global binding here
   *  focuses the wrong lesson. B/C focus fallback: selectedId → current → next
   *  → first (current/next skipped off-today). */
  selectedId: string | null;
  /** Select/focus a lesson (or clear). Called wherever a row/rail/agenda item
   *  is clicked or keyboard-activated; the shell owns the resulting state. */
  onSelect: (id: string | null) => void;
  /** Pre-rendered holiday banner / empty-state — rendered above the lessons
   *  (DayA) or in place of the focus/hero when there are no lessons (DayB/C).
   *  Lessons still render when present. */
  holidayNode?: ReactNode | null;
  /** Prev/next day handler (handles week rollover in the shell). */
  onShiftDay: (delta: 1 | -1) => void;
  /** Open the daily planner focused on a lesson (existing openLessonPlanner). */
  onPlan: (id: string) => void;
  /** Quick-add a blank lesson to this day (existing seam). */
  onQuickAdd: () => void;
  /** True while a quick-add round-trip is in flight (disables the add rows). */
  quickAdding: boolean;
  /** Transient quick-add failure message, or null. */
  quickAddError: string | null;
  /** Open the AddEventForm popover; when null the "Non-instructional event"
   *  menu row is omitted (no dead row). */
  onAddEvent?: (() => void) | null;
}

export function DayViewV2(props: DayViewV2Props): ReactNode {
  const { frame } = useTheme();
  if (frame === "paper") return <DayB {...props} />;
  if (frame === "color") return <DayC {...props} />;
  return <DayA {...props} />;
}
