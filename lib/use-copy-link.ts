"use client";

// use-copy-link.ts — the shared "Copy link" gesture for deep links (UX
// roadmap item 07).
//
// Every Copy-link affordance (weekly card overflow menu, lesson-detail
// header, subject unit header) routes through this hook so the behavior is
// identical everywhere:
//
//   1. The caller supplies a ROOT-RELATIVE planner URL from one of the
//      lib/deep-links builders (buildWeeklyLink / buildDailyLink /
//      buildSubjectLink) — never a hand-built string.
//   2. The hook prepends `window.location.origin` so the copied text is an
//      ABSOLUTE, paste-into-team-chat URL.
//   3. `navigator.clipboard.writeText` inside try/catch — on success the
//      roadmap-02 toast confirms ("Link copied", no Undo); on failure
//      (permissions, non-secure context, missing Clipboard API) the toast
//      explains the fallback instead of failing silently.
//
// The toast is provider-OPTIONAL (useUndoToastOptional): the lesson-card
// context menu also renders in the Settings → Appearance preview, which
// mounts no UndoToastProvider — there the copy still works, just without
// the confirmation bubble.

import { useCallback } from "react";
import { useUndoToastOptional } from "@/lib/undo-toast";

/** Copy `location.origin + relativeUrl` to the clipboard and confirm via
 *  the undo-toast ("Link copied"). Returns a stable callback. */
export function useCopyLink(): (relativeUrl: string) => Promise<void> {
  const toast = useUndoToastOptional();

  return useCallback(
    async (relativeUrl: string): Promise<void> => {
      const absolute = `${window.location.origin}${relativeUrl}`;
      try {
        // Throws (or rejects) when the Clipboard API is unavailable or the
        // browser denies the write — both routes land in the catch below.
        await navigator.clipboard.writeText(absolute);
        toast?.showUndoToast({ message: "Link copied" });
      } catch {
        toast?.showUndoToast({
          message: "Couldn't copy — copy from the address bar",
        });
      }
    },
    [toast],
  );
}
