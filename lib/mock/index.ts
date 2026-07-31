// Barrel for the mock-data fixtures. Import from `@/lib/mock`.
//
// All data is fake but realistic — real CCSS codes, real-feeling lesson
// titles and teacher names — ported from the design handoff project/data.jsx
// and extended to a three-week span (see lessons.ts).

export * from "./subjects";
export * from "./teachers";
export * from "./units";
export * from "./standards";
export * from "./lessons";
export * from "./notes";
export * from "./todos";
export * from "./shoutbox";
export * from "./schedule";
export * from "./calendar";
export * from "./boards";

// ── SUPERSEDED: the hard-coded weekday arrays ──────────────────────────────
//
// These two constants hard-code the beta school's Sun–Thu week, which CLAUDE.md
// §1 forbids: "Never hard-code the weekday set — every calendar surface derives
// its days from this configuration." Indexing them positionally gave a Mon–Fri
// school "Sunday" where it should read "Monday", and truncated a 6-day Mon–Sat
// school to five columns.
//
// The real replacement is `useOrderedWeekdays()` (lib/week-order.ts), which
// pairs each CONFIGURED weekday with its short + long label and its column
// index. Its underlying label maps (`WEEKDAY_LABEL` / `WEEKDAY_LABEL_LONG` in
// lib/use-school-week.ts) are plain non-mock constants covering all seven days.
//
//   WEEK_DAYS[day]        →  useOrderedWeekdays()[day]?.longLabel
//   WEEK_DAYS_SHORT[day]  →  useOrderedWeekdays()[day]?.label
//   WEEK_DAYS.length      →  useOrderedWeekdays().length
//
// STATUS (2026-07-31): ZERO live consumers remain — every call site now reads
// `useOrderedWeekdays()`. The only occurrences left in the repo are prose and a
// string fixture inside tests/no-mock-in-live-surfaces.test.ts, which exercises
// the import PARSER and does not import these values.
//
// They are kept rather than deleted purely as a concurrency courtesy: several
// lanes were editing this tree when the last consumer went away, and removing
// an export out from under an unwritten edit is how a sibling's work breaks.
// Both names are on the mock ratchet's BANNED list, so no new consumer can
// appear. DELETE THEM once the wave settles — that is the intended end state,
// not a permanent deprecation.

/**
 * Day labels for the weekly grid, frozen to the beta school's Sun–Thu week.
 *
 * @deprecated Hard-codes the weekday set (CLAUDE.md §1). Use
 * `useOrderedWeekdays()` from lib/week-order.ts.
 */
export const WEEK_DAYS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
] as const;

/**
 * Short day labels for compact headers, frozen to the beta school's Sun–Thu
 * week.
 *
 * @deprecated Hard-codes the weekday set (CLAUDE.md §1). Use
 * `useOrderedWeekdays()` from lib/week-order.ts.
 */
export const WEEK_DAYS_SHORT: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
] as const;
