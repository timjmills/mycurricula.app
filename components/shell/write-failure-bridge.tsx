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
import { usePlanner } from "@/lib/planner-store";
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
    shownIdRef.current = lastWriteFailure.id;

    const copy = FAILED_COPY[lastWriteFailure.op];
    const what = copy?.what ?? "change";
    const where =
      lastWriteFailure.scope === "team" ? " for the Team Curriculum" : "";

    // A TIMEOUT IS NOT A FAILURE, and must not be phrased as one. The request
    // was abandoned rather than cancelled, so it may still commit — and the
    // documented hazard is that it commits AFTER the next write, putting the
    // NEWER edit at risk, not this one. Any sentence that predicts what a reload
    // will show would be inventing a certainty nobody has. So it says what is
    // actually known, and what to do about it.
    showConsequence({
      message:
        lastWriteFailure.kind === "timeout"
          ? `Your ${what}${where} is taking too long to save and we’ve stopped waiting. It may or may not have gone through — reload to see what the server actually has.`
          : `Your ${what}${where} didn’t save. ${copy?.consequence ?? "Reload to see what the server actually has."}`,
    });
  }, [lastWriteFailure, showConsequence]);

  return null;
}
