// day-empty.ts — the pure decision behind /daily's empty state.
//
// Extracted from <DayEmptyState> so the rule that a live production Major turned
// on is unit-testable in the node harness (vitest runs `environment: "node"` and
// cannot render React — see vitest.config.ts). The component is then a thin
// renderer over this function, and the contract is pinned by tests rather than
// by three components agreeing with each other.
//
// THE RULE, and why each arm exists:
//   pending → "loading"  the hydrate takes ~9.5–11.6s over Supabase; for that
//                        whole window the document is legitimately empty, and
//                        saying so is the bug this file exists to prevent.
//   error   → "error"    a failed hydrate also leaves an empty document. Silence
//                        about the failure reads as "you have nothing planned".
//   settled + lessons    → "none"   nothing to say; the caller renders the day.
//   settled + no lessons → "empty"  a genuinely empty day MUST still be told it
//                        is empty. Returning "loading" forever would pass any
//                        test that only checks the false message is gone, and is
//                        a worse bug than the one being fixed.
//
// `hasLessons` is a REQUIRED argument rather than something inferred from the
// caller's own branch. DayFocus and DayB render their empty slot when `pickFocus()`
// returns undefined, which today happens if and only if the day has no lessons
// (`pickFocus` early-returns on `length === 0` and otherwise falls back to
// `dayLessons[0]`). That invariant holds — but it is TRANSITIVE, and this whole
// defect was a component asserting emptiness it had not actually checked. Taking
// the fact directly means a future change to that fallback chain makes the panel
// render nothing rather than resume lying. (§4a Medium: reported as an unproven
// invariant; it is proven today, and is now local instead of inherited.)

import type { PlannerDataState } from "@/lib/planner-store";

/** What /daily should show where a day's lessons would be. */
export type DayEmptyKind = "loading" | "error" | "empty" | "none";

export function dayEmptyKind(
  dataState: PlannerDataState,
  hasLessons: boolean,
): DayEmptyKind {
  if (dataState === "pending") return "loading";
  if (dataState === "error") return "error";
  return hasLessons ? "none" : "empty";
}
