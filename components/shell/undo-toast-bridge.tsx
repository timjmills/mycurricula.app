"use client";

// undo-toast-bridge — wires every undoable planner gesture to the global
// undo toast (UX roadmap item 02, "safety without friction").
//
// A render-nothing client leaf mounted ONCE in app/(planner)/layout.tsx,
// inside both <PlannerProvider> and <UndoToastProvider>. It watches the
// store's `lastChange` signal (object identity changes per mutation) and
// fires `showUndoToast` CENTRALLY — the pattern is built once here instead
// of at N gesture callsites, so every view's moves/completion/fork/revert
// get the toast for free.
//
// What toasts (decision logic lives in lib/undo-toast-messages.ts):
//   • moveLesson / relocateLesson / bumpLesson — "Moved to {weekday}" /
//     "Moved to Week {n}", read from the lesson's CURRENT slot post-action.
//     Weekday names come from the configured school week
//     (useOrderedWeekdays) — never a hard-coded array (CLAUDE.md).
//   • setLessonStatus — "Marked done" / "Marked not done".
//   • first-time fork — the forking-model education copy; wins over the
//     gesture's own message. Suppressed outside Personal mode as
//     defense-in-depth (the reducer's transition detection only fires from
//     Personal-mode flows anyway).
//   • restoreLesson — "Restored the team's version".
// Undo for all of these dispatches the store's existing `undo` — the same
// single history step the top bar would revert.
//
// What NEVER toasts: undo/redo/hydrate, catalog/hydration side-channels,
// text-edit coalesced bursts (editLesson/editSection — keystroke noise),
// section/resource plumbing. Exception: an editLesson that first-forked the
// lesson DOES toast (the fork education).
//
// Stale-toast clearing (§4a review M1): the toast's Undo is the store's
// GENERIC single-step undo, so a visible toast is only honest while the
// history entry it describes is still the TOP of the undo stack. Therefore
// EVERY lastChange advance that does not itself produce a toast — undo/redo,
// every non-toasting content kind (text edits, section plumbing, layout,
// duplication, …), and bulk batches — calls clearUndoToast(), so a visible
// toast can never outlive the history step it describes. Hydrate /
// setCatalog / setHydration stay ignored: setCatalog and setHydration never
// touch lastChange (same object identity — the advance guard filters them),
// and hydrate resets lastChange to null AND empties the history stacks, so a
// surviving toast's undo is a harmless no-op rather than a wrong revert.
//
// Bulk batches (§4a review M2): a gesture like WeeklyGrid.handleBulkMove
// dispatches N moveLesson actions in one React batch — the bridge sees only
// the FINAL lastChange but the store's historyDepth jumps by N. A single
// "Moved to {day}" toast whose Undo restores 1 of N would be worse than no
// toast, so a multi-entry advance clears any live toast and toasts nothing.
// Item 06's batch undo (one history entry per gesture) will let bulk moves
// toast honestly later.
//
// Suppression subtlety: the toast must not fire on initial mount or when a
// provider remount replays a stale `lastChange` — `lastSeenRef` initializes
// to whatever lastChange is live at mount and the effect only acts when the
// object identity advances past it.

import { useEffect, useRef } from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useUndoToast } from "@/lib/undo-toast";
import { useOrderedWeekdays } from "@/lib/week-order";
import {
  isBulkHistoryAdvance,
  undoToastMessage,
} from "@/lib/undo-toast-messages";

export function UndoToastBridge(): null {
  const { lastChange, lessons, historyDepth, undo } = usePlanner();
  const { showUndoToast, clearUndoToast } = useUndoToast();
  const { editMode } = useAppState();
  const orderedDays = useOrderedWeekdays();

  // Mount/replay guard: seed with the lastChange live at mount so neither the
  // first render nor a provider-remount replay produces a toast. Only a NEW
  // object identity (a fresh mutation) advances past this ref.
  const lastSeenRef = useRef(lastChange);

  // The previous document's lessons — the "before" side of the move/copy
  // comparisons. Advanced to the current array on every effect run.
  const prevLessonsRef = useRef(lessons);

  // The undo-stack depth as of the last effect run — the "before" side of the
  // bulk-batch detection (§4a M2). One dispatch advances depth by ≤1; a depth
  // jump >1 means N entries landed under a single observed lastChange.
  const lastDepthRef = useRef(historyDepth);

  useEffect(() => {
    const prevLessons = prevLessonsRef.current;
    prevLessonsRef.current = lessons;
    const prevDepth = lastDepthRef.current;
    lastDepthRef.current = historyDepth;

    if (lastChange === lastSeenRef.current) return; // mount / replay / no-op
    lastSeenRef.current = lastChange;
    // Hydrate resets the signal to null — never toast it. It also empties the
    // history stacks, so an already-visible toast needs no clearing: its undo
    // degrades to a no-op rather than a wrong revert. (setCatalog /
    // setHydration never advance lastChange at all — the identity guard above
    // already filtered them, with lastDepthRef kept in sync regardless.)
    if (!lastChange) return;

    const { kind, lessonIds } = lastChange;
    // History controls never toast — and they CONSUME/RESTORE the history
    // step a visible toast describes, so that toast is now stale: its Undo
    // would revert something other than what it says (§4a M1). Retire it.
    if (kind === "undo" || kind === "redo") {
      clearUndoToast();
      return;
    }

    // Bulk batch (§4a M2): N dispatches landed as one observed advance. A
    // single-step Undo toast would restore 1 of N while claiming the whole
    // gesture — worse than no toast. Clear and stay silent; item 06's batch
    // undo (one history entry per gesture) re-enables toasting here later.
    if (isBulkHistoryAdvance(prevDepth, historyDepth)) {
      clearUndoToast();
      return;
    }

    const id = lessonIds[0];
    let lesson = id ? lessons.find((l) => l.id === id) : undefined;
    const prevLesson = id ? prevLessons.find((l) => l.id === id) : undefined;

    // Relocate-with-copy: the SOURCE lesson (lessonIds[0]) stays put and a
    // new copy lands on the target slot. When the source's slot is unchanged,
    // the thing that actually moved is the lesson that exists now but did not
    // exist before — compare ITS slot against the source's prior slot. The
    // message then says "Copied to …", not "Moved to …" (§4a L3).
    let isCopy = false;
    if (
      kind === "relocateLesson" &&
      lesson &&
      prevLesson &&
      lesson.day === prevLesson.day &&
      lesson.week === prevLesson.week &&
      lesson.subject === prevLesson.subject
    ) {
      const prevIds = new Set(prevLessons.map((l) => l.id));
      const copy = lessons.find((l) => !prevIds.has(l.id));
      if (copy) {
        lesson = copy;
        isCopy = true;
      }
    }

    const message = undoToastMessage({
      kind,
      // Defense-in-depth: the reducer's transition detection can only fire
      // from Personal-mode flows, but never educate about forking while the
      // viewer is deliberately editing the Team Curriculum.
      firstFork: lastChange.firstFork === true && editMode === "personal",
      lesson,
      prevLesson,
      isCopy,
      // Configured school week → weekday name (never a hard-coded array).
      // The defensive fallback covers a day index outside the configured
      // week (stale data after the team shrinks the week).
      dayLabel: (day) => orderedDays[day]?.longLabel ?? `Day ${day + 1}`,
    });
    if (!message) {
      // A non-toasting mutation still advanced history (§4a M1): a visible
      // toast no longer describes the top history entry, so its Undo would
      // revert THIS change (e.g. a note edit) instead of what it says.
      clearUndoToast();
      return;
    }

    // Undo = the store's existing single-step undo — identical to the top
    // bar's; the provider handles ⌘Z, the 6s pause, and last-in-wins.
    showUndoToast({ message, onUndo: undo });
  }, [
    lastChange,
    lessons,
    historyDepth,
    editMode,
    orderedDays,
    showUndoToast,
    clearUndoToast,
    undo,
  ]);

  return null;
}
