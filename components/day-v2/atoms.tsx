"use client";

// atoms.tsx — thin re-export shim. The shared v2 planner atoms were lifted to
// components/planner-v2 in Wave 5 so the Week frames reuse them; this shim
// preserves the day-v2 import path (`./atoms`) so DayA/B/C are unchanged.
//
// COMPONENTS ONLY here (the hook + constants re-export from ./util) — the
// Fast-Refresh contract: mixing component and non-component exports crashes dev
// hot edits.

export {
  SelectTitle,
  SubjGlyph,
  StatusDot,
  ForkCues,
  FinishPill,
  AddLessonMenu,
} from "@/components/planner-v2";
