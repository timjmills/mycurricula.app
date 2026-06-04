// lib/planner/grade.ts — a thin grade-resolution helper for the planner store.
//
// The store hydrates against a grade uuid, but the reducer only knows the
// signed-in teacher's owner uuid (from the Supabase Auth session via
// app-state's `currentUser.id`). This wrapper turns an owner uuid into the
// active grade uuid through the planner data-source contract, so the hydrate
// effect reads as a single call. Returns `null` when no owner is supplied or
// when the teacher has no resolvable grade — the hydrate effect treats either
// as "skip the backend, keep the mock document".

import { plannerClient } from "./client";

/**
 * Resolve the active grade uuid for an owner. Returns `null` when `ownerId` is
 * falsy (no session) or the backend reports no grade. Never throws — a failed
 * lookup resolves to `null` so the caller can fall back to the mock document.
 */
export async function resolveGrade(
  ownerId: string | null,
): Promise<string | null> {
  if (!ownerId) return null;
  try {
    return await plannerClient.getActiveGradeLevelId(ownerId);
  } catch {
    return null;
  }
}
