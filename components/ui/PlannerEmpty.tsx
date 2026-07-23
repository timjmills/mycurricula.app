// PlannerEmpty — an EmptyState that knows the difference between "empty",
// "still loading", and "failed to load".
//
// WHY THIS EXISTS. Every planner surface has an empty state gated on
// `lessons.length === 0`. But the Supabase hydrate chain takes 11–16s, and
// while it runs the document is legitimately empty — so a raw empty state tells
// a teacher "No lessons this week" (and, on the catch-up surfaces, literally
// "All caught up!") for up to 16 seconds before their real plan appears. Worse,
// when the hydrate THROWS, the store keeps an empty document mounted, so a
// backend outage renders as "nothing planned" with no hint anything went wrong.
// That conflation is what made a healthy production deploy look dead and get
// rolled back (see agent_shared_log — the 7.16 cutover incident).
//
// USAGE. Drop-in replacement for <EmptyState> on any planner-data-sourced empty
// state. Same props; it just branches on data readiness first:
//
//   -  <EmptyState heading="No lessons this week yet." />
//   +  <PlannerEmpty heading="No lessons this week yet." />
//
// It reads `usePlannerDataState()`, so it MUST render inside a <PlannerProvider>
// (every /planner-group surface does). For a bespoke loading shape, use the
// bare <Skeleton> primitive instead.

import { usePlannerDataState } from "@/lib/planner-store";
import { EmptyState, type EmptyStateProps } from "./EmptyState";
import { Skeleton } from "./Skeleton";

export interface PlannerEmptyProps extends EmptyStateProps {
  /**
   * Number of skeleton bars to show while pending. Defaults to 3; pass 1 for a
   * single-block placeholder in a tight slot.
   */
  skeletonLines?: number;
}

export function PlannerEmpty({ skeletonLines, ...emptyProps }: PlannerEmptyProps) {
  const state = usePlannerDataState();

  if (state === "pending") {
    return (
      <Skeleton
        lines={skeletonLines}
        size={emptyProps.size ?? "md"}
        label="Loading your plan…"
        className={emptyProps.className}
      />
    );
  }

  if (state === "error") {
    return (
      <EmptyState
        size={emptyProps.size}
        className={emptyProps.className}
        heading="Couldn’t load your plan"
        body="Check your connection and reload. Your saved work is safe."
      />
    );
  }

  // settled → "ready" or a genuinely-empty document; show the real empty state.
  return <EmptyState {...emptyProps} />;
}
