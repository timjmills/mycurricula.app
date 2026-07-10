"use client";

// util.ts — thin re-export shim. The shared non-component canvas helpers
// (useNowMin hook + STATUS_WORD + fromInteractive) were lifted to
// components/planner-v2 in Wave 5; this shim preserves the day-v2 import path
// (`./util`) so DayA/B/C are unchanged.
//
// NON-COMPONENTS ONLY here (components re-export from ./atoms) — keeps this a
// clean Fast-Refresh boundary, mirroring the planner-v2 atoms/util split.

export { useNowMin, STATUS_WORD, fromInteractive } from "@/components/planner-v2";
