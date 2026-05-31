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

/** Day labels for the weekly grid. The school week runs Sunday–Thursday. */
export const WEEK_DAYS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
] as const;

/** Short day labels for compact headers. */
export const WEEK_DAYS_SHORT: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
] as const;
