// lib/planner/server-seed.ts — the planner hydrate, resolved during the SERVER
// render of the page instead of after the browser boots.
//
// SERVER-ONLY. It reaches `plannerSupabaseSource`, which imports
// `lib/supabase/server.ts` → `next/headers`. Never import this from a client
// component; the client side of the seam is lib/planner/hydrate-seed.ts.
//
// ── THIS RUNS THE EXISTING READ, UNCHANGED ────────────────────────────────────
// It calls the same `buildPlannerHydrateBundle` inside the same
// `withSharedServerClient` scope as `plannerHydrateBundleAction`
// (lib/planner/actions.ts). Same source, same order, same branches, same
// per-request client sharing. The ONLY difference is who invokes it: a React
// Server Component during the page render, rather than a POST from the browser
// ~2.5 s later. Nothing about what a teacher may read moves — every query still
// runs under their own session through the RLS-scoped server client.
//
// ── IT RESOLVES THE OWNER ITSELF, WHICH IS STRICTLY SAFER ─────────────────────
// `plannerHydrateBundleAction` takes `ownerId` from the client. That is sound
// (RLS, not the argument, decides what the caller may see — see the action's
// trust note), but here there is no reason to accept it: the session cookie is
// already in hand, so the owner is READ, not asserted. The client still checks
// that the seed's owner matches the one its own session resolved before using it
// (see `takeServerSeed`), so the two readings can never quietly disagree.
//
// ── AND IT SAYS WHICH TENANT THE ANSWER IS FOR ────────────────────────────────
// The owner is only half of "whose document is this". Multi-workspace has been
// live since 2026-07-24, and a teacher who switches workspace between this
// render and their hydrate is the SAME teacher — so a seed that named only its
// owner could be accepted by a store already showing another workspace's chrome.
// Every `ok: true` seed therefore states the school its reads were scoped by
// (`PlannerSeedScope`), taken from the bundle that performed those reads, and a
// seed whose school cannot be resolved is not produced at all.
//
// ── CACHING: PER-TEACHER, AND NOT A NEW EXPOSURE ──────────────────────────────
// A serialized planner document is per-teacher data with exactly the property
// `mc-theme-axes` has: it must never enter a shared cache. It does not introduce
// that requirement — `app/layout.tsx` already reads `cookies()` for the theme
// axes, which opts the WHOLE tree into dynamic rendering and carries the
// cache-isolation invariant recorded there (no Cache Everything rule, no
// `revalidate` / `force-static` anywhere beneath it). Verified at the time of
// writing: no `revalidate`, `force-static`, `unstable_cache` or `"use cache"`
// exists under `app/` or `lib/`, and `next.config.ts`'s `headers()` sets only
// CSP / Referrer-Policy / nosniff — no `Cache-Control`. This read also calls
// `cookies()` itself (through `createClient`), so the route would be dynamic on
// its own account even if the theme read were removed.
//
// WHAT IS NOT VERIFIABLE FROM THE REPOSITORY: a Cloudflare-side "Cache
// Everything" page rule would break the invariant for the theme cookie and this
// payload alike. That check belongs to whoever owns the zone config.
//
// ── IT NEVER THROWS ───────────────────────────────────────────────────────────
// Every failure — no session, the mock path, a read that blew up — comes back as
// `{ ok: false }`, and the client falls back to the Server Action it would have
// used anyway. A page that has a working fallback must not be taken down by the
// optimisation that was meant to speed it up.

import { createClient } from "../supabase/server";
import { withSharedServerClient } from "../supabase/helpers";
import { MULTI_WORKSPACE } from "../multi-workspace-flag";
import { buildPlannerHydrateBundle } from "./hydrate-bundle";
import { isPlannerSupabaseConfigured } from "./source";
import { plannerSupabaseSource } from "./supabase-source";
import type { PlannerSeedResult } from "./hydrate-seed";
import { PLANNER_SERVER_SEED_ENABLED } from "./server-seed-enabled";

export async function buildServerSeed(): Promise<PlannerSeedResult> {
  // ── THE PRODUCER'S OWN GATE, AND IT IS FIRST FOR A REASON ─────────────────
  // Not the call site's job. `app/(planner)/layout.tsx` also declines to mount
  // the seed components, but a gate that lives only at the caller means this
  // function still DOES THE WORK for any future or direct invocation, and a
  // stray mount would serialize and deliver a seed with the switch off. "The
  // feature is inert" and "each end is independently inert" are different
  // claims; only the second survives someone mounting this component next year.
  //
  // Before the session read and before the hydrate, so a disabled build does no
  // work at all rather than doing it and discarding the result — "returned
  // nothing" and "did nothing" are different, and off must mean the second.
  if (!PLANNER_SERVER_SEED_ENABLED) {
    return { ok: false, reason: "disabled" };
  }

  // The mock path never round-trips (the bundle runs in the browser against
  // `plannerMockSource`), so there is nothing to save and a seed would only add
  // a payload. Flag OFF is therefore byte-identical to before this file existed.
  if (!isPlannerSupabaseConfigured()) {
    return { ok: false, reason: "mock path" };
  }

  try {
    const supabase = await createClient();
    // `getUser()` rather than `getSession()`: it validates the token with the
    // auth server instead of trusting whatever the cookie claims. This read is
    // the one that decides whose lessons get serialized into the page, so it is
    // not a place to save a round trip.
    const { data, error } = await supabase.auth.getUser();
    const ownerId = data.user?.id;
    if (error || !ownerId) {
      return { ok: false, reason: "no session" };
    }

    const bundle = await withSharedServerClient(() =>
      buildPlannerHydrateBundle(plannerSupabaseSource, ownerId),
    );

    // ── THE LABEL COMES FROM THE DATA, NOT FROM A POINTER READ AROUND IT ─────
    // `bundle.schoolId` is the school that owns the grade every read in this
    // bundle was scoped by (lib/planner/hydrate-bundle.ts). It is therefore a
    // FACT ABOUT THE ROWS, established by the same pass that produced them.
    //
    // This replaced a before/after bracket around the read: resolve the
    // teacher's active-workspace pointer, run the ~4.4 s hydrate, resolve it
    // again, and publish only if it had not moved. That was evidence, not proof
    // — a bracket cannot observe the middle of what it brackets, so an
    // A → B → A switch inside the window produced a label asserting something
    // the code had never verified. That is the same defect class this whole
    // mechanism exists to remove: a check that passes while the data came from
    // somewhere else. Keying the label to the grade removes the window rather
    // than narrowing it, because a grade does not change schools.
    //
    // Unnameable → no seed. The client falls back to the hydrate action exactly
    // as it does on the mock path, so the cost of failing closed is a round
    // trip. For an ORDINARY member this is also where a workspace switch
    // mid-read lands: RLS hides a grade outside their current workspace, the
    // label resolves null, and nothing is published. A SCHOOL ADMIN reads it
    // successfully (`grade_levels_read`'s `is_school_admin` arm), so they get a
    // seed — correctly labelled with that grade's real school, which their own
    // client then refuses if it expected a different workspace. Suppression is
    // the ordinary-member case; CORRECTNESS is everyone's.
    if (!bundle.schoolId) {
      return { ok: false, reason: "bundle could not be scoped to a workspace" };
    }

    return {
      ok: true,
      ownerId,
      scope: {
        // WHICH QUESTION the client must ask to check this. Under
        // MULTI_WORKSPACE it resolves its ACTIVE workspace; off, its HOME
        // school. Both are compared against the same `schoolId` above, and a
        // seed built under one seam must never satisfy a consumer running the
        // other — see `PlannerSeedScope`.
        seam: MULTI_WORKSPACE ? "workspace" : "home",
        schoolId: bundle.schoolId,
        // The bundle's OTHER scoping key. The client cannot check it (resolving
        // it is what the hydrate is for); it travels so the seed can say what
        // it is.
        gradeLevelId: bundle.gradeLevelId,
      },
      bundle,
    };
  } catch (err) {
    // Logged server-side, where the error is still intact and useful. Only the
    // reason string crosses to the browser: a raw Postgres error carries table
    // and column names and would route around Next's error redaction.
    console.error(
      "[planner] server seed failed; the client will fall back to the hydrate action",
      err,
    );
    return { ok: false, reason: "read failed" };
  }
}
