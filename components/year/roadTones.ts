// roadTones.ts — thin subject → cp-subj class helper.
//
// The Year view previously kept its own custom ROAD_TONES palette (washed-out
// hex values). That palette has been removed in favour of the canonical
// highlight palette — the same `.cp-subj.<id>` cascade used by the Weekly
// grid cards (see app/tokens.css, lib/palette.tsx). Subject colors must ONLY
// come from that cascade. This file is kept as a stable export point so that
// callers can derive the correct className without duplicating the logic.

import type { SubjectId } from "@/lib/types";

/**
 * Returns the combined className that activates the canonical subject-color
 * cascade: `"cp-subj <subjectId>"`. Apply this to any element that needs
 * `var(--c)` / `var(--cl)` / `var(--cd)` to resolve to the subject palette.
 */
export function subjectClassName(subjectId: SubjectId): string {
  return `cp-subj ${subjectId}`;
}
