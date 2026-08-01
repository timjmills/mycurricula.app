"use client";

// atoms.tsx — thin re-export shim. The shared v2 planner atoms were lifted to
// components/planner-v2 in Wave 5 so the Week frames reuse them; this shim
// preserves the day-v2 import path (`./atoms`) for DayFocus and for the three
// legacy Day frames.
//
// `SubjGlyph` / `StatusDot` are consumed only by DayA/DayB, which /daily no
// longer renders by default (DayFocus does). They are still forwarded because
// the user asked on 2026-08-01 to KEEP all three legacy frames until they
// decide what to merge or delete — see DayViewV2's `?dayview=` note. Delete
// these two lines in the same change that deletes those files, not before.
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
