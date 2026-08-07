"use client";

// DayEmptyState.tsx — the ONE "this day has nothing in it" message for all three
// v2 Day frames, and the one place that knows the difference between "nothing
// planned" and "not loaded yet".
//
// WHY IT EXISTS (live prod Major, 2026-07-25). DayA/DayB/DayC each carried their
// own copy of `<p className={styles.emptyDay}>No lessons planned for this day.</p>`,
// branched on `dayLessons.length === 0` alone. Over Supabase the planner hydrate
// takes ~9.5–11.6s, and for that whole window the document is legitimately empty
// — so /daily asserted a teacher's timetable was EMPTY, on the one surface whose
// entire job is "what am I teaching right now?", on every load, cold and warm.
// Reproduced 4/4 on production. `/weekly` already said "Loading your plan…"
// instead; `day-v2` was simply never wired into the 7.23 loading-honesty work
// (usePlannerDataState + PlannerEmpty + Skeleton, master 9020f3a).
//
// Three frames, three copies of the string: fixing one leaves two lying. Hence a
// shared component rather than three parallel edits — a fourth frame gets the
// honesty for free, and cannot reintroduce the bug by copying a sibling.
//
// THE SETTLED BRANCH STILL SAYS SO. A genuinely empty day must still be told it
// is empty; replacing the lie with a permanent skeleton would pass any test that
// only checks the lie is gone, and would be a worse bug (a day that never stops
// loading). `settled` renders the original `<p>` byte-for-byte — same class, same
// copy — so the v2 design is untouched for the case it was designed for.
//
// NOT <PlannerEmpty>. That primitive is the right call on surfaces whose empty
// state is already an <EmptyState> card (DailyViewV1, DayEditSplit, WeeklyList).
// Here the handoff's empty state is a quiet centered line, and swapping in a card
// would change a handoff-governed surface's look to fix a loading bug. Same
// contract, same copy, this surface's own shape — mirroring how WeeklyShell
// reaches for the bare <WeekGridSkeleton> rather than PlannerEmpty for its grid.
//
// Flag-OFF is unaffected: `usePlannerDataState()` is permanently "settled" on the
// mock/v1 path (planner-store `effectiveHydration`), so this is a no-op there.

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui";
import { usePlannerDataState } from "@/lib/planner-store";
import { dayEmptyKind } from "./day-empty";
import styles from "./day-v2.module.css";

export interface DayEmptyStateProps {
  /**
   * Whether the day actually has lessons. REQUIRED — the settled branch may
   * only claim the day is empty when it has been told the day is empty, never
   * because a caller's own branch implies it. See ./day-empty for why.
   */
  hasLessons: boolean;
  /** Skeleton bars while the hydrate is in flight. DayA stands in for a day
   *  LIST; DayFocus/DayB for a single focus panel, which wants fewer. */
  skeletonLines?: number;
}

export function DayEmptyState({
  hasLessons,
  skeletonLines = 3,
}: DayEmptyStateProps): ReactNode {
  const kind = dayEmptyKind(usePlannerDataState(), hasLessons);

  if (kind === "none") return null;

  if (kind === "loading") {
    // role="status" aria-busy + a visually-hidden label live inside <Skeleton>,
    // so a screen reader hears "Loading your plan…" rather than being told the
    // day is empty — which is the same lie in the accessibility layer.
    //
    // Wrapped in `.emptyDay` so the loading state occupies the SAME slot the
    // message would (24px block, max-width 860px, centered) in all three of the
    // containers this renders into — DayA's `.vaDay`, DayB's `.focusEmpty`,
    // DayFocus's `.heroEmpty`. A bare full-bleed Skeleton would land differently in
    // each. Worth being deliberate about: this branch cannot be seen on the mock
    // path (hydration is pinned "ready"), so it ships without a screenshot.
    return (
      <div className={styles.emptyDay}>
        <Skeleton lines={skeletonLines} size="sm" label="Loading your plan…" />
      </div>
    );
  }

  if (kind === "error") {
    // Same words as PlannerEmpty's error branch, deliberately — a teacher who
    // meets this on /weekly and again on /daily should read one voice, not two.
    return (
      <p className={styles.emptyDay} role="status">
        Couldn’t load your plan. Check your connection and reload — your saved
        work is safe.
      </p>
    );
  }

  return <p className={styles.emptyDay}>No lessons planned for this day.</p>;
}
