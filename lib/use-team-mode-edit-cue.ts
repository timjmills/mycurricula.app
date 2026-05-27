"use client";

// use-team-mode-edit-cue.ts — W2-B1 inline edit cue layer.
//
// Returns a CSS class name to apply to editable surfaces (lesson title,
// objective, section content) so a teacher SEES that the field they're
// about to edit is part of the team-shared curriculum, not their
// personal copy. Empty string when in Personal mode.
//
// Consumed by lesson-card.tsx and friends — they spread the class into
// their existing className concat (no behavior change, just a ring).
//
// The class is defined in `master-banner.module.css` (the team-mode
// visual system lives there). Exporting the class name as a constant
// keeps the consumers off the magic-string contract.

import { useAppState } from "@/lib/app-state";

/** Class name applied while in Team Curriculum mode. Defined in
 *  `components/shell/master-banner.module.css` (exported as
 *  :global so it works across module boundaries). */
export const TEAM_MODE_EDIT_CUE_CLASS = "myc-team-mode-edit-cue";

/** Returns the cue class name when in Team Curriculum mode, "" otherwise. */
export function useTeamModeEditCue(): string {
  const { editMode } = useAppState();
  return editMode === "master" ? TEAM_MODE_EDIT_CUE_CLASS : "";
}
