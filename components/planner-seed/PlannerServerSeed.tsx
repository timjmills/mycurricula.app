// A SERVER Component that performs the planner hydrate during the page render
// and hands the result to a client leaf.
//
// Mounted behind a `<Suspense>` boundary in app/(planner)/layout.tsx, which is
// what makes this free rather than expensive: the shell — chrome, nav, the
// planner canvas skeleton — flushes to the browser immediately, and the browser
// starts downloading the app bundle while THIS is still awaiting the database.
// Without the boundary the whole document would block on the read, moving the
// wait from a place where it overlaps the JS download to a place where nothing
// overlaps it at all.
//
// Renders no DOM. It exists purely to be a place where an `await` can happen at
// request time.
//
// PRIVACY (§11.4): STRUCTURE only — lessons / units / subjects / standards /
// sections, exactly the payload the hydrate action already returns. Never
// student names.

import { buildServerSeed } from "@/lib/planner/server-seed";
import { PLANNER_SERVER_SEED_ENABLED } from "@/lib/planner/server-seed-enabled";
import { PlannerSeedDeliver } from "./PlannerSeedDeliver";

export async function PlannerServerSeed({
  renderId,
}: {
  renderId: string;
}): Promise<React.ReactElement | null> {
  // Inert when the feature is off, independently of the layout not mounting it.
  // Returning before the await also means a stray mount costs no database read —
  // `buildServerSeed` guards itself as well, so this is the cheap outer skin
  // rather than the guarantee.
  if (!PLANNER_SERVER_SEED_ENABLED) return null;
  // `buildServerSeed` is documented never to throw — every failure is an
  // `{ ok: false }` the client falls back from. The catch is belt-and-braces so
  // that a future edit to it cannot turn a slow planner into an error page.
  let result;
  try {
    result = await buildServerSeed();
  } catch (err) {
    console.error("[planner] server seed threw unexpectedly", err);
    result = { ok: false as const, reason: "unexpected" };
  }
  return <PlannerSeedDeliver renderId={renderId} result={result} />;
}
