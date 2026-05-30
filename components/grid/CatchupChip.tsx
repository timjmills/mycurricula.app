"use client";

// CatchupChip.tsx — the compact "🔥 N catch-up" pill beside the week header.
//
// Replaces the old full-width CatchupWeekBar banner with a small, glanceable
// chip that deep-links into the dedicated /catch-up triage screen (mark done,
// skip, carry over). It self-gates exactly like the bar did:
//
//   1. The global Catch-up feature is enabled (Settings toggle ON), AND
//   2. The current week has at least one uncovered item.
//
// No per-week dismissal — the chip is small enough that it never crowds the
// header, and the top-bar flame badge still surfaces the rollup count.
//
// State comes from the same hooks the bar read (useCatchup, useAppState,
// usePlanner) plus countForWeek — no new data logic, no changed catch-up
// semantics. The chip is rendered by <WeekNavigator> (opt-in via its
// `showCatchupChip` prop) so it reads as part of the week header.

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { useCatchup } from "@/lib/catchup-state";
import { countForWeek } from "@/lib/catchup-data";
import { usePlanner } from "@/lib/planner-store";
import styles from "./catchup-chip.module.css";

export function CatchupChip(): ReactNode {
  const router = useRouter();
  const { week } = useAppState();
  const { enabled, actions } = useCatchup();
  const { lessons } = usePlanner();

  // Layer-1 gate: feature flag off ⇒ no chip.
  if (!enabled) return null;

  // Re-derive on each render — the count is a cheap single pass over the
  // week's lessons and stays in lockstep with the planner-store mutations.
  const count = countForWeek(lessons, week, actions);
  if (count === 0) return null;

  const label = `${count} ${count === 1 ? "lesson" : "lessons"} fell behind this week — open Catch-up to triage (mark done, skip, or carry over)`;

  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => router.push("/catch-up")}
      aria-label={label}
      title={label}
    >
      <FlameIcon />
      <span className={styles.text}>{count} catch-up</span>
    </button>
  );
}

// Flame glyph — matches the in-bar icon vocabulary from CatchupWeekBar.tsx
// (single-stroke, 24×24 viewBox, currentColor).
function FlameIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5C8.5 17 10 19 12 19c2 0 4-2 4-4.5 0-1.5-1-2.5-2-3.5.5 2-1 2.5-1 2.5 0-2-1-3-1-4.5 0-1 .5-2 1-2.5C9 8 8.5 12 8.5 14.5z" />
    </svg>
  );
}
