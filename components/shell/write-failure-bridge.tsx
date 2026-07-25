"use client";

// write-failure-bridge — tells the teacher when a planner write did NOT save.
//
// A render-nothing client leaf, mounted ONCE in app/(planner)/layout.tsx inside
// BOTH <PlannerProvider> and <ConsequenceToastProvider>. Same shape and same
// reason as undo-toast-bridge: the store publishes a signal, one leaf turns it
// into a toast, and no gesture callsite has to remember to.
//
// WHY A BRIDGE AND NOT A TOAST FROM THE STORE. The planner's persist tees are
// fire-and-forget — dispatched optimistically AFTER the reducer has already
// committed, from a function that returned long ago. There is no caller to
// return a `{ok:false}` Result to (contrast lib/workspaces/actions.ts, where
// that IS the right pattern because a caller is waiting). And the store cannot
// raise the toast itself: ConsequenceToastProvider mounts as a CHILD of
// PlannerProvider, so `useConsequenceToast()` is out of scope in the provider
// body. Hence a signal on the value, consumed here.
//
// WHAT THE TEACHER LOSES WITHOUT THIS. The optimistic edit stays on screen and
// disappears on the next reload, with the only trace in the browser console. The
// sharpest case is a teacher without `can_edit_subject_master` flipping to Team
// Curriculum: the edit looks completely normal, the write is RLS-denied against
// the shared row, and they find it gone tomorrow with no idea why. That is why
// the copy names the SCOPE — "for the team" is the difference between "something
// went wrong" and "the change you made for everyone did not save".
//
// NO UNDO ACTION on this toast, deliberately. The reducer still holds the
// teacher's value, so there is nothing to undo TO — and offering "Undo" would
// suggest the app can put things right when all it can do is report. The toast
// states the fact and gets out of the way.

import { useEffect, useRef } from "react";
import { usePlanner, type PlannerWriteFailure } from "@/lib/planner-store";
import { useConsequenceToast } from "@/lib/consequence-toast";

/**
 * Per-verb copy: WHAT did not save, and WHAT THE TEACHER WILL ACTUALLY SEE on
 * reload. The second half has to be per-verb, and getting it wrong is not a
 * cosmetic slip — it is this component telling the specific lie it exists to
 * prevent.
 *
 * The optimistic reducer state and the server state disagree in DIFFERENT
 * DIRECTIONS depending on the verb:
 *   • an edit / layout change is on screen and nowhere else → it disappears;
 *   • a MOVE is on screen in the new slot → the card returns to the OLD slot,
 *     it does not vanish;
 *   • an ARCHIVE already removed the lesson from every surface, and the row is
 *     still there → the lesson COMES BACK.
 * One sentence for six verbs said "it's still on screen, but it will be gone if
 * you reload" for all of them — both clauses false for archive, and the wrong
 * outcome for move.
 */
const FAILED_COPY: Record<string, { what: string; consequence: string }> = {
  updateLesson: {
    what: "lesson edit",
    consequence: "It’s still on screen, but it will be gone if you reload.",
  },
  updateUnitFields: {
    what: "unit plan edit",
    consequence: "It’s still on screen, but it will be gone if you reload.",
  },
  setSections: {
    what: "lesson layout change",
    consequence: "It’s still on screen, but it will be gone if you reload.",
  },
  move: {
    what: "lesson move",
    consequence: "The lesson will go back to where it was if you reload.",
  },
  archive: {
    what: "lesson removal",
    consequence: "The lesson will come back if you reload.",
  },
  unarchive: {
    what: "lesson restore",
    consequence: "The lesson will be hidden again if you reload.",
  },
};

/**
 * The sentence a failure becomes. Exported and pure so the copy — which is the
 * whole product of this component, and which was factually inverted for two of
 * six verbs before review — is testable without a DOM.
 *
 * `missed` is how many earlier failures this toast is standing in for (see the
 * bridge for why that is not zero).
 */
export function writeFailureMessage(
  failure: PlannerWriteFailure,
  missed: number,
): string {
  const copy = FAILED_COPY[failure.op];
  const what = copy?.what ?? "change";
  const where = failure.scope === "team" ? " for the Team Curriculum" : "";
  const alsoOthers =
    missed > 0 ? ` (and ${missed} other change${missed === 1 ? "" : "s"})` : "";

  // A TIMEOUT IS NOT A FAILURE, and must not be phrased as one. The request was
  // abandoned rather than cancelled, so it may still commit — and the documented
  // hazard is that it commits AFTER the next write, putting the NEWER edit at
  // risk, not this one. Any sentence predicting what a reload will show would be
  // inventing a certainty nobody has. So it says what is known, and what to do.
  if (failure.kind === "timeout") {
    return `Your ${what}${where}${alsoOthers} is taking too long to save and we’ve stopped waiting. It may or may not have gone through — reload to see what the server actually has.`;
  }
  return `Your ${what}${where}${alsoOthers} didn’t save. ${
    copy?.consequence ?? "Reload to see what the server actually has."
  }`;
}

export function WriteFailureBridge(): null {
  const { lastWriteFailure } = usePlanner();
  const { showConsequence } = useConsequenceToast();
  // Only fire for a signal we have not already shown. The planner value is
  // re-memoized on unrelated state changes, so depending on the object alone
  // would re-toast the same failure; the monotonic id is the real edge.
  const shownIdRef = useRef(0);

  useEffect(() => {
    if (!lastWriteFailure) return;
    if (lastWriteFailure.id <= shownIdRef.current) return;

    // HOW MANY FAILURES THIS TOAST IS STANDING IN FOR. A multi-field
    // `editLesson` splits into one lane PER FIELD, so a Team-mode save that is
    // denied fails N times; React batches the N state updates and only the last
    // survives, so the guard above legitimately shows one toast. Showing one is
    // right — a queue of six identical toasts helps nobody — but silently
    // speaking for six is not. The monotonic id already carries the count.
    const missed = lastWriteFailure.id - shownIdRef.current - 1;
    shownIdRef.current = lastWriteFailure.id;

    showConsequence({ message: writeFailureMessage(lastWriteFailure, missed) });
  }, [lastWriteFailure, showConsequence]);

  return null;
}
