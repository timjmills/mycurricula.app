"use client";

// util.ts — thin re-export shim. The shared non-component canvas helpers were
// lifted to components/planner-v2 in Wave 5; this shim preserves the day-v2
// import path (`./util`) for DayFocus and for the three legacy Day frames.
//
// `STATUS_WORD` is consumed only by DayB's rail ("8:10 · Planned"). It is still
// forwarded because the user asked on 2026-08-01 to KEEP all three legacy
// frames until they decide what to merge or delete — see DayViewV2's
// `?dayview=` note. Drop it in the same change that deletes DayB, not before.
//
// NON-COMPONENTS ONLY here (components re-export from ./atoms) — keeps this a
// clean Fast-Refresh boundary, mirroring the planner-v2 atoms/util split.

export {
  useNowMin,
  STATUS_WORD,
  fromInteractive,
} from "@/components/planner-v2";
