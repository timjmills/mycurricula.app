"use client";

// DayViewV2.tsx — the v2 Day VIEW canvas, and the one place that decides what
// /daily renders.
//
// ── WHAT SHIPS ─────────────────────────────────────────────────────────────
// <DayFocus> — the handoff's focus card + agenda rail — for EVERY appearance
// frame and EVERY theme. It used to be a frame SWITCHER ("glass" → DayA, a
// vertical timeline; "paper" → DayB, a rail + white focus panel; "color" →
// DayC, an agenda + tinted hero), so a teacher who changed their background
// material also changed the Day's INFORMATION ARCHITECTURE. The user retired
// that on 2026-08-01: the appearance axes drive material and colour, never
// layout.
//
// ── WHY DayA / DayB ARE STILL HERE ─────────────────────────────────────────
// They were deleted, and the user asked for them back the same day: "keep all
// three of the views until later and then I will get rid of or merge some of
// the views." So they are RETAINED, not rendered by default, and reachable on
// demand:
//
//     /daily?dayview=a      the glass vertical timeline (legacy)
//     /daily?dayview=b      the paper rail + white focus panel (legacy)
//     /daily                <DayFocus> — the default, and the only one a
//                           teacher sees without typing a URL
//
// This exists so they can be COMPARED against the default before the
// merge/delete decision. It is not a preference, is not persisted, and appears
// in no UI. When that decision lands, delete the files, this switch, and the
// re-export lines held open for them in ./atoms and ./util.
//
// ── `?dayview=c` IS GONE, AND IT NEVER SHOWED ANYTHING NEW ─────────────────
// DayC was the colour agenda + tinted hero that DayFocus was PROMOTED FROM, so
// `c` and the default rendered the same information architecture from two
// copies of the same JSX. The comparison it existed to serve could not be made
// with it, and the copies had already diverged — the shipping card counts the
// lesson's resources and DayC's hero never did, so `?dayview=c` was quietly
// showing a WORSE card than /daily rather than a different one. The value now
// falls through to <DayFocus> with every other unrecognised string; the URL
// still resolves, it just resolves to the Day view. DayA and DayB are genuinely
// different layouts and stay.
//
// Two deliberate mechanics:
//   * The param is read from `window.location` in a mount effect, NOT via
//     useSearchParams — the same call the repo already makes in
//     components/daily/LessonDetail.tsx:282, because useSearchParams drags a
//     Suspense-boundary requirement into a deep client tree. The consequence is
//     that the FIRST paint is always DayFocus and a legacy frame swaps in after
//     hydration. That is the right trade for an inspection affordance: the
//     default render is never gated on client state.
//   * The legacy frames are imported STATICALLY, which is the boring choice and
//     a deliberate one. `next/dynamic({ ssr: false })` would keep them out of
//     /daily's initial bundle (task #53's concern), but its chunk never
//     resolves under the repo's test harness — react-dom/client over linkedom,
//     no bundler — so the escape hatch became unverifiable: the "no param →
//     DayFocus" tests passed and the control that proves the legacy branch is
//     live could not. An untestable lazy boundary on three components that are
//     scheduled for deletion is a worse trade than the bytes. They share almost
//     every dependency with DayFocus (the same atoms, the same CSS module,
//     day-status, lessonTime, UnitChip), so the marginal cost is the component
//     bodies alone. Delete them and this is moot.
//
// It deliberately does NOT read useTheme(): a frame read HERE is what the
// retirement removed, and re-adding one would reintroduce the layout branch.
//
// Builder B (DailyView) owns integration: it filters + orders the visible day's
// lessons, renders the holiday banner/empty-state, and passes the existing
// prev/next, planner-open, and quick-add seams through DayViewV2Props. Every
// other piece of state (lessons, completion, selection, subjects) the canvas
// reads directly from the stores (the W3.8c precedent), so the shell contract
// stays small.

import { useEffect, useState, type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { DayFocus } from "./DayFocus";
import { DayA } from "./DayA";
import { DayB } from "./DayB";

/** The retained legacy frames, by `?dayview=` value. Anything else — absent,
 *  empty, misspelled, the retired `c`, hostile — falls through to <DayFocus>. */
const LEGACY = { a: DayA, b: DayB } as const;

type LegacyKey = keyof typeof LEGACY;

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
   *  Finish (every non-done lesson reads "Planned") and the focus fallback
   *  becomes selectedId → first lesson (current/next are skipped). */
  isToday: boolean;
  /** The selected/focused lesson id, OWNED BY THE SHELL. The canvas does NOT
   *  read global selection: the /daily deep-link resolver keeps its selection
   *  in the shell's LOCAL state and deliberately clears the global
   *  selectedLessonId (the PR#27 warm-nav-bounce fix), so a global binding here
   *  focuses the wrong lesson. Focus fallback: selectedId → current → next
   *  → first (current/next skipped off-today). */
  selectedId: string | null;
  /** Select/focus a lesson (or clear). Called wherever a rail row is clicked or
   *  keyboard-activated; the shell owns the resulting state. */
  onSelect: (id: string | null) => void;
  /** Pre-rendered holiday banner / empty-state — rendered above the lessons as
   *  a banner, or in place of the focus card when there are no lessons.
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

/**
 * The `?dayview=` value on a query string, or null for "render the default".
 *
 * Exported so the test drives the SHIPPED parse rather than re-implementing it:
 * this one function is the whole switch, and a test that re-derived it would
 * stay green while /daily regressed.
 */
export function readDayViewParam(search: string): LegacyKey | null {
  const raw = new URLSearchParams(search).get("dayview");
  return raw === "a" || raw === "b" ? raw : null;
}

export function DayViewV2(props: DayViewV2Props): ReactNode {
  // null on the server and on the first client paint — see the mechanics note
  // above. Only a recognised legacy key ever leaves this state.
  const [legacy, setLegacy] = useState<LegacyKey | null>(null);
  useEffect(() => {
    const read = () => setLegacy(readDayViewParam(window.location.search));
    read();
    // Back/forward between /daily and /daily?dayview=a keeps this component
    // mounted, so a read that only ran on mount would leave the previous frame
    // on screen while the URL said otherwise. `popstate` covers the history
    // buttons; a `router.push` that changed only the query would NOT fire it,
    // and is deliberately not handled — nothing in the app links to
    // `?dayview=`, it is typed. Revisit if it ever gains a UI control.
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const Legacy = legacy ? LEGACY[legacy] : null;
  return Legacy ? <Legacy {...props} /> : <DayFocus {...props} />;
}
