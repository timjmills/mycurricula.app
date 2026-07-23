// lib/planner/grade.ts — a thin grade-resolution helper for the planner store.
//
// The store hydrates against a grade uuid, but the reducer only knows the
// signed-in teacher's owner uuid (from the Supabase Auth session via
// app-state's `currentUser.id`). This wrapper turns an owner uuid into the
// active grade uuid through the planner data-source contract, so the hydrate
// effect reads as a single call.

import { plannerClient } from "./client";

/**
 * Resolve the active grade uuid for an owner.
 *
 * Returns `null` when `ownerId` is falsy (no session) or when the backend
 * reports NO grade for a real owner (a teacher who has none configured yet).
 * The hydrate effect settles either to an empty document.
 *
 * A failed LOOKUP — the backend query threw (an outage, an auth/RLS failure, a
 * dropped server-action request) — is deliberately NOT swallowed to `null`; it
 * PROPAGATES. The store's hydrate `catch` turns a throw into the "error" state
 * ("Couldn't load your plan"), whereas a `null` renders a false "empty". The two
 * must not be conflated: this used to `catch { return null }`, so a total outage
 * at the very first hydrate step read as an empty plan ("all caught up") instead
 * of a load error. `getActiveGradeLevelId` already returns `null` for a genuine
 * no-grade and throws only on a real failure (supabase-source `unwrapMaybe`),
 * so passing the distinction straight through is all that's needed. Flag OFF /
 * mock never throws (it returns a constant grade), so this is a no-op there.
 */
export async function resolveGrade(
  ownerId: string | null,
): Promise<string | null> {
  if (!ownerId) return null;
  // `return await` (not a bare `return`) keeps this async frame on the stack for
  // a rejected lookup, so the failure surfaces from here rather than being
  // adopted as a detached rejected promise.
  return await plannerClient.getActiveGradeLevelId(ownerId);
}
