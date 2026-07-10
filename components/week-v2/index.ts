// Public surface of the v2 Week frames. Consumers (WeeklyShell) import the
// frames from the folder, never a deep file.
//
// Both frames are SELF-CONTAINED (no props) — like WeeklyGrid / WeekColumns they
// read the planner + app-state stores directly and drive selection through the
// shared selectedLessonId channel. WeekA (glass, read-only period × day) is
// Builder A's; WeekC (color, subject lanes) is Builder B's.

export { WeekA } from "./WeekA";
export { WeekC } from "./WeekC";
