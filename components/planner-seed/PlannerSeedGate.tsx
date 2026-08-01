"use client";

// The ANNOUNCEMENT half of the server-seed handshake.
//
// Renders nothing and never suspends, so it ships in the page's FIRST flush and
// its render runs before the planner store's hydrate effect. That ordering is
// the whole job: the store must know a seed is coming before it decides to go
// and fetch one. `<PlannerSeedDeliver>` — the half that carries the actual
// bundle — sits behind a Suspense boundary and may still be streaming at that
// moment, which is exactly why the announcement cannot be its responsibility.
//
// Armed during RENDER rather than in an effect. An effect would also run early
// enough (a child's effect precedes its parent's), but only for a child that has
// mounted, and this component's whole purpose is to be the one that always has.
// `armServerSeed` is idempotent and a no-op on the server, so a re-render or a
// StrictMode double-render cannot arm twice or leak across requests.

import { armServerSeed } from "@/lib/planner/hydrate-seed";
import { PLANNER_SERVER_SEED_ENABLED } from "@/lib/planner/server-seed-enabled";

export function PlannerSeedGate({ renderId }: { renderId: string }): null {
  // Inert when the feature is off, INDEPENDENTLY of the layout declining to
  // mount it. A gate that exists only at the call site is one edit away from
  // being gone; this makes a stray mount harmless rather than merely unlikely.
  if (!PLANNER_SERVER_SEED_ENABLED) return null;
  // `renderId` is minted once per SERVER render of the planner layout and given
  // to both halves of the handshake, so the channel can tell a fresh page render
  // (which supersedes any previous seed) from a re-render of the same one (which
  // must not disturb a consumer already awaiting it).
  armServerSeed(renderId);
  return null;
}
