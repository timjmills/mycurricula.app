"use client";

// The DELIVERY half of the server-seed handshake: a client leaf whose only job
// is to be the thing a Server Component can hand a value to.
//
// The bundle travels here as an ordinary serialized prop — the same plain JSON
// that already crosses the `plannerHydrateBundleAction` boundary — so no promise
// crosses the server/client seam and there is no unhandled-rejection path.
//
// Delivered during RENDER, not in an effect, so the value is available the
// instant this component's chunk reaches the browser rather than one commit
// later. `deliverServerSeed` is idempotent (it resolves an already-settled
// promise, which does nothing) and is a no-op on the server, so the SSR pass
// that produces this component's HTML stores nothing process-global.

import {
  deliverServerSeed,
  type PlannerSeedResult,
} from "@/lib/planner/hydrate-seed";
import { PLANNER_SERVER_SEED_ENABLED } from "@/lib/planner/server-seed-enabled";

export function PlannerSeedDeliver({
  renderId,
  result,
}: {
  renderId: string;
  result: PlannerSeedResult;
}): null {
  // Inert when the feature is off, independently of anything upstream — see the
  // note in PlannerSeedGate. A delivery is the one action here that could put a
  // document onto the channel, so it gets its own gate rather than relying on
  // nobody having produced one.
  if (!PLANNER_SERVER_SEED_ENABLED) return null;
  // Same `renderId` the gate received. A payload whose render has already been
  // superseded is dropped rather than published onto the current channel.
  deliverServerSeed(renderId, result);
  return null;
}
