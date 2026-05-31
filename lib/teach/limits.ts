// lib/teach/limits.ts — Boards Library limits (leaf module, no Teach imports).
//
// Kept separate from `queries.ts` so the mock/Supabase data sources can import
// the cap + error WITHOUT a runtime circular import (queries.ts imports the
// concrete source, which imports these). `queries.ts` re-exports both so the
// documented seam stays the single import site for consumers.

/** The hard per-teacher cap on owned ("My Boards") boards. Reaching it forces a
 *  delete before a new board can be created/duplicated/kept/pulled — there is no
 *  archive tier (the user's "50 total, must delete" decision). Ephemeral
 *  whiteboards do NOT count until kept. */
export const MAX_BOARDS_PER_TEACHER = 50;

/** Thrown by any create/duplicate/keep/pull path when the owner is already at
 *  `MAX_BOARDS_PER_TEACHER`. The UI catches this to prompt a delete instead of
 *  surfacing a raw error. */
export class BoardCapError extends Error {
  readonly cap: number;
  constructor(cap: number = MAX_BOARDS_PER_TEACHER) {
    super(
      `Board limit reached — you can keep up to ${cap} boards. Delete one to make room.`,
    );
    this.name = "BoardCapError";
    this.cap = cap;
  }
}
