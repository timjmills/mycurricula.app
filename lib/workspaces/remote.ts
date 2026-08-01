// lib/workspaces/remote.ts — the BROWSER-side read of the active workspace's
// identity + notebooks.
//
// ── WHY THIS EXISTS (the /weekly load-time work, task #46) ────────────────────
// Next runs client-initiated Server Actions strictly ONE AT A TIME on a shared
// queue. On a /weekly first load there are exactly two such actions: this read
// (via `getActiveWorkspaceContextAction`) and the planner hydrate bundle. This
// one fires at t≈0 — `WorkspaceIdentitySync`'s mount effect calls it with no
// awaited prerequisite — while the planner hydrate is gated behind `ownerId`,
// which is null until a browser auth round trip resolves. So this read ALWAYS
// wins the queue, and the planner waits out its full duration (measured on
// production by an earlier pass: 677–1311 ms) before its own ~4.4 s begins.
//
// Reordering does not help: whichever runs second still pays for the first.
// The only fix is to take one of them OFF the queue. This module does that —
// the same two reads, issued straight from the browser to Supabase, where they
// overlap freely with everything else instead of serialising. It is the pattern
// `lib/school-week-remote.ts` already uses for `auth_teacher_school_id`.
//
// BOTH READS ARE RLS-GATED, WHICH IS WHY THIS IS SAFE TO MOVE:
//   • `list_my_workspaces()` is SECURITY DEFINER and resolves `auth.uid()`
//     itself (migration 20260724120000, SECTION 10). It exposes no other
//     teacher's identity — only aggregate counts and the caller's own flags.
//   • the notebook read is a plain `grade_levels` select, gated by
//     `grade_levels_read` (school_id = auth_teacher_school_id() OR school admin).
// Neither uses the service-role client. The server action reached them through
// the RLS-scoped per-request client, so the browser (anon key + the caller's own
// session) has exactly the same authority — no privilege is added or removed.
//
// ── THE ATOMICITY PROPERTY, HONESTLY ─────────────────────────────────────────
// `getActiveWorkspaceContextAction` documents TWO properties that closed a
// cross-tenant tear (Codex R1). This module keeps one and weakens the other, and
// the one it keeps is the one doing the work:
//
//   KEPT — the notebook read is PINNED to the just-resolved `workspace.schoolId`
//     rather than to the ambient RLS resolver. So even if a concurrent
//     `set_active_workspace` commits between the two reads, the explicit
//     `school_id = <resolved id>` filter CANNOT return another workspace's
//     notebooks. The pair is internally consistent by construction: identity A
//     with A's notebooks, or identity A with an empty list. Never a tear.
//
//   WEAKENED — "ONE round trip". Two browser requests is a wider interleaving
//     window than two DB statements inside one action. But a Server Action was
//     never one transaction either (the action's own comment says so), so this
//     widens a window that already existed rather than opening a new one. The
//     worst outcome is unchanged and self-healing: a stale-but-consistent
//     identity that the next mount or WORKSPACE_CHANGED_EVENT re-sources. And
//     per the action's own note this is not a security question in either
//     version — both workspaces belong to the caller, and RLS fail-closes to
//     memberships.
//
// TO REVERT: point `getActiveWorkspaceContext` (lib/workspaces/client.ts) back
// at `getActiveWorkspaceContextAction`. That action is deliberately still
// exported and unchanged.

import { createClient } from "../supabase/client";
import { isPlannerSupabaseConfigured } from "../planner/source";
import { MULTI_WORKSPACE } from "../multi-workspace-flag";
import {
  mapWorkspaceRows,
  pickActiveWorkspace,
  type WorkspaceRow,
} from "./row";
import type {
  ActiveWorkspaceContext,
  ActiveWorkspaceNotebook,
} from "./actions";

/**
 * Opaque failure message, kept character-identical to `GENERIC_ERROR` in
 * lib/workspaces/actions.ts.
 *
 * DUPLICATED, NOT IMPORTED, AND NOT BY CHOICE: a `'use server'` module may only
 * export async functions, so the action's copy cannot be shared. Keep the two in
 * step — this is the string a caller may surface, and the two paths must not
 * disagree about what a failure says while both are reachable.
 */
const GENERIC_ERROR = "That didn't work — please try again.";

/** The exact columns the notebook read projects. Mirrors
 *  `listWorkspaceNotebooks` (lib/admin/queries.ts) so the two agree on shape. */
const NOTEBOOK_COLUMNS = "id, name, display_order, is_active";

/** The same DOUBLE GATE the server action applies. Both must hold before any
 *  query fires, so a flag-off deployment issues exactly the requests it issues
 *  today — none. */
function seamEnabled(): boolean {
  return MULTI_WORKSPACE && isPlannerSupabaseConfigured();
}

/** The seam-off / no-active-workspace answer. Callers treat this as "seam not
 *  active" and keep the mock — never as an error. */
const EMPTY_CONTEXT: ActiveWorkspaceContext = {
  workspace: null,
  notebooks: [],
};

/**
 * The active workspace's identity + its notebooks, read directly from the
 * browser. Behaviourally identical to `getActiveWorkspaceContextAction` — same
 * gate, same shape, same pinned notebook read, same opaque failure message —
 * but it does not occupy a slot in Next's Server Action queue.
 *
 * THROWS on a read failure, matching the facade's existing contract (the action
 * resolved a `{ok:false}` envelope which `getActiveWorkspaceContext` then threw).
 * `WorkspaceIdentitySync` catches it and fails closed, clearing any stale
 * identity rather than retaining it.
 */
export async function readActiveWorkspaceContextRemote(): Promise<ActiveWorkspaceContext> {
  if (!seamEnabled()) return EMPTY_CONTEXT;

  const supabase = createClient();

  const { data, error } = await supabase.rpc("list_my_workspaces");
  if (error) {
    // The real error is logged where a developer can see it; only the opaque
    // message travels, so a DB/RLS internal never becomes UI text.
    console.error(
      "readActiveWorkspaceContextRemote (workspaces) failed:",
      error,
    );
    throw new Error(GENERIC_ERROR);
  }

  const workspace = pickActiveWorkspace(
    mapWorkspaceRows((data ?? []) as WorkspaceRow[]),
  );
  // No active workspace → do NOT read notebooks. The provider keeps its mock,
  // and reading them would be a request whose result is discarded.
  if (!workspace) return EMPTY_CONTEXT;

  // PINNED to the resolved workspace, never the ambient RLS resolver — see the
  // atomicity note in this file's header. This filter is what makes a torn read
  // impossible rather than merely unlikely.
  const { data: rows, error: notebooksError } = await supabase
    .from("grade_levels")
    .select(NOTEBOOK_COLUMNS)
    .eq("school_id", workspace.schoolId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (notebooksError) {
    console.error(
      "readActiveWorkspaceContextRemote (notebooks) failed:",
      notebooksError,
    );
    throw new Error(GENERIC_ERROR);
  }

  const notebooks: ActiveWorkspaceNotebook[] = (
    (rows ?? []) as Array<{
      id: string;
      name: string | null;
      is_active: boolean | null;
    }>
  ).map((row) => ({
    gradeLevelId: row.id,
    name: row.name ?? "",
    isActive: row.is_active ?? false,
  }));

  return { workspace, notebooks };
}
