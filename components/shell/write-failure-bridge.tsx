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

/** Human copy per failed verb. Deliberately plain: the teacher needs to know
 *  WHAT did not save and WHERE it was going, not the verb's internal name. */
const WHAT_FAILED: Record<string, string> = {
  updateLesson: "lesson edit",
  updateUnitFields: "unit plan edit",
  setSections: "lesson layout change",
  move: "lesson move",
  archive: "lesson removal",
  unarchive: "lesson restore",
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

    const what = WHAT_FAILED[lastWriteFailure.op] ?? "change";
    const where =
      lastWriteFailure.scope === "team"
        ? " for the Team Curriculum"
        : "";
    showConsequence({
      message: `Your ${what}${where} didn’t save. It’s still on screen, but it will be gone if you reload.`,
    });
  }, [lastWriteFailure, showConsequence]);

  return null;
}
