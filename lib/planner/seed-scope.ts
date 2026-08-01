// lib/planner/seed-scope.ts — the CONSUMER's own answer to "which workspace am
// I hydrating?", used to check a server-rendered seed before it is accepted.
//
// ── WHY THE CLIENT HAS TO ASK FOR ITSELF ──────────────────────────────────────
// A seed states which workspace its queries were scoped by (lib/planner/
// hydrate-seed.ts, `PlannerSeedScope`). A statement is only worth checking
// against an INDEPENDENT reading — if the consumer took its expectation from the
// same payload it is validating, the check would confirm nothing. So this
// resolves the identity from the browser's own Supabase session, exactly as
// `takeServerSeed`'s owner check compares the client's session-resolved owner
// against the server's cookie-resolved one.
//
// ── IT MIRRORS THE PLANNER'S OWN RESOLVER, BRANCH FOR BRANCH ──────────────────
// `plannerSupabaseSource.getActiveGradeLevelId` scopes to the ACTIVE workspace
// via `auth_teacher_school_id()` under MULTI_WORKSPACE, and is workspace-agnostic
// with the flag off (the teacher's HOME school, through `teachers`). Resolving a
// DIFFERENT school here than the planner scopes by would rebuild the bug one
// layer down — a check that passes while the data is from somewhere else — so the
// branch is copied rather than simplified. Same reasoning, same shape, as
// `resolveGoverningSchool` in lib/school-week-remote.ts, which exists for
// precisely this reason.
//
// ── ONE ROUND TRIP, OFF THE SERVER-ACTION QUEUE ───────────────────────────────
// Read straight from the browser (RLS-gated, anon key, the caller's own session)
// rather than through a Server Action, so it cannot take a slot in the queue the
// hydrate is waiting on — the lib/workspaces/remote.ts finding. It costs ONE
// request, issued only when a seed is actually waiting to be checked
// (`takeServerSeed` calls this as a thunk after it has claimed one) and
// overlapping the wait for that seed.
//
// ── NEVER THROWS; UNKNOWN IS A REFUSAL ────────────────────────────────────────
// Every failure path resolves `null`, and `null` REFUSES the seed rather than
// waving it through — the caller falls back to the Server Action it would have
// used anyway. Fail-closed here costs a round trip; failing open would cost a
// teacher the wrong workspace's plan.

import { createClient } from "@/lib/supabase/client";
import { MULTI_WORKSPACE } from "@/lib/multi-workspace-flag";
import type { ExpectedSeedIdentity } from "./hydrate-seed";
import { isPlannerSupabaseConfigured } from "./source";

/**
 * WHO this browser is signed in as — read from its own session, not from
 * anything the server put in the page.
 *
 * ── `getSession()` AND NOT `getUser()`, DELIBERATELY ──────────────────────────
 * `getUser()` validates the token with the auth server; `getSession()` reads the
 * session this browser is holding. The second is the right instrument HERE, and
 * the reason is what the check is FOR:
 *
 *   • The question is not "is this token authentic". The seed's content was
 *     already built under a session the SERVER validated — middleware calls
 *     `getUser()` on every matched request, so an unauthenticated caller never
 *     gets a seeded page at all. What we are detecting is DIVERGENCE between two
 *     legitimate identities: the one the document was rendered for, and the one
 *     the browser now holds.
 *   • For that question a local read is not weaker. A stale tab's stored session
 *     genuinely IS teacher B's — it is the same cookie store the whole origin
 *     shares — so reading it locally detects the divergence exactly as well as a
 *     round trip would.
 *   • It is not a defence against a forged local session, and does not need to
 *     be: an attacker who can rewrite this browser's session storage can already
 *     read the rendered page.
 *   • `getUser()` would put a network round trip on the critical path — the very
 *     cost the seed exists to remove — to buy none of the above.
 *
 * Returns null when there is no session, which REFUSES the seed.
 */
async function readBrowserUserId(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.debug("[planner] seed identity: session read failed", error.message);
    return null;
  }
  return data.session?.user?.id ?? null;
}

/**
 * WHO this browser is, and WHICH workspace it believes it is hydrating.
 *
 * `null` means UNKNOWN — no window, the prototype path, no owner, no session, no
 * school, or a failed read. Callers must treat it as a refusal, never as "any
 * workspace will do".
 */
export async function readExpectedSeedIdentity(
  ownerId: string,
): Promise<ExpectedSeedIdentity | null> {
  // Same posture as the seed channel itself: this is a BROWSER-side reading of
  // identity. Running it during SSR would answer a different request's question.
  if (typeof window === "undefined") return null;
  if (!isPlannerSupabaseConfigured()) return null;
  if (!ownerId) return null;

  try {
    const supabase = createClient();

    // WHO first, and cheaply — a local read that short-circuits the workspace
    // round trip when there is no session to hydrate for at all.
    const userId = await readBrowserUserId(supabase);
    if (!userId) return null;

    // ⚠ `userId` IS A SNAPSHOT FROM BEFORE THE WORKSPACE QUERY BELOW. The session
    // can change across that await, so the consumer gets a way to re-read it at
    // the moment it actually uses the seed rather than trusting this value to
    // still be true. See `ExpectedSeedIdentity.revalidate` — the checking is the
    // channel's job; supplying the reading is this module's.
    const revalidate = () => readBrowserUserId(supabase);

    if (MULTI_WORKSPACE) {
      // The ACTIVE workspace, through the same membership-validated funnel every
      // RLS policy reads. Never `teachers.school_id` — that is the HOME school,
      // and a teacher working inside a joined workspace would then "expect" the
      // wrong one and refuse every seed they should have had.
      const { data, error } = await supabase.rpc("auth_teacher_school_id");
      if (error) {
        console.debug("[planner] seed scope: workspace lookup failed", error.message);
        return null;
      }
      const schoolId = (data as string | null) ?? null;
      return schoolId
        ? { userId, seam: "workspace", schoolId, revalidate }
        : null;
    }

    const { data, error } = await supabase
      .from("teachers")
      .select("school_id")
      .eq("id", ownerId)
      .maybeSingle();
    if (error) {
      console.debug("[planner] seed scope: home school lookup failed", error.message);
      return null;
    }
    const schoolId =
      (data as { school_id: string | null } | null)?.school_id ?? null;
    return schoolId ? { userId, seam: "home", schoolId, revalidate } : null;
  } catch (err) {
    console.debug("[planner] seed scope: resolve error", err);
    return null;
  }
}
