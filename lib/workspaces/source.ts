// lib/workspaces/source.ts — the SERVER-side multi-workspace data source.
//
// All operations go through SECURITY DEFINER RPCs
// (supabase/migrations/20260724120000_multi_workspace.sql):
//   • list_my_workspaces()          — SECTION 10 (read; one row per membership)
//   • set_active_workspace(uuid)    — SECTION 8  (repoint active_school_id)
//   • create_workspace(text)        — SECTION 9  (mint a whole tenant graph)
//   • rename_workspace(uuid, text)  — 20260726120000_rename_workspace.sql
//                                      (relabel a workspace the caller administers)
// The RPCs own ALL authorization, the fail-closed membership re-checks, the
// anti-abuse cap, and the audit rows — this layer never re-implements any of
// that; it just calls the RPC and surfaces the error. Reads that a plain table
// select would do (workspace_members) are deliberately NOT done here: the
// self-only RLS policy would hide sibling members anyway, so the SECURITY DEFINER
// list_my_workspaces RPC is the only correct read path (it aggregates member_count
// without leaking teammate identity).
//
// The client is INJECTED (not imported), so these functions are pure w.r.t. the
// request context and unit-testable with a stub client; the server action
// (lib/workspaces/actions.ts) resolves the real per-request client and passes it.

import type { ServerClient } from "../supabase/helpers";
import {
  mapWorkspaceRows,
  type CreatedWorkspace,
  type WorkspaceRow,
  type WorkspaceSummary,
} from "./row";

/**
 * List every workspace the CALLER belongs to (name, role flags, member count,
 * which is active). Backed by list_my_workspaces, which is SECURITY DEFINER and
 * exposes NO other teacher's identity — only aggregate counts + the caller's own
 * membership set. Deduped defensively by schoolId.
 */
export async function listMyWorkspaces(
  client: ServerClient,
): Promise<WorkspaceSummary[]> {
  const { data, error } = await client.rpc("list_my_workspaces");
  if (error) {
    throw new Error(
      `Workspaces repository list my workspaces failed: ${error.message}`,
    );
  }
  return mapWorkspaceRows((data ?? []) as WorkspaceRow[]);
}

/**
 * Switch the caller's active workspace. The RPC validates membership server-side
 * (a non-member can never activate a foreign tenant) and repoints
 * active_school_id; it is no-op-safe (re-selecting the current workspace is fine).
 */
export async function setActiveWorkspace(
  client: ServerClient,
  schoolId: string,
): Promise<void> {
  const { error } = await client.rpc("set_active_workspace", {
    p_school_id: schoolId,
  });
  if (error) {
    throw new Error(
      `Workspaces repository set active workspace failed: ${error.message}`,
    );
  }
}

/**
 * Mint a whole new tenant graph for the already-existing caller and switch to it.
 * All rules (the anti-abuse cap, the never-attach-to-a-pre-existing-school
 * invariant, the founding-owner=admin seeding) are enforced by the RPC. Returns
 * the new school + its first grade (notebook) uuids.
 */
export async function createWorkspace(
  client: ServerClient,
  name: string,
): Promise<CreatedWorkspace> {
  const { data, error } = await client.rpc("create_workspace", {
    p_name: name,
  });
  if (error) {
    throw new Error(
      `Workspaces repository create workspace failed: ${error.message}`,
    );
  }
  // create_workspace RETURNS TABLE(school_id, grade_level_id) — supabase-js
  // surfaces the single row as a one-element array.
  const row = ((data ?? []) as Array<{
    school_id: string;
    grade_level_id: string;
  }>)[0];
  if (!row) {
    throw new Error(
      "Workspaces repository create workspace returned no row.",
    );
  }
  return { schoolId: row.school_id, gradeLevelId: row.grade_level_id };
}

/**
 * Rename a workspace the caller administers. The RPC re-checks membership + admin
 * rights server-side (a non-member, or a member who is not a workspace admin, can
 * never rename), trims + clamps the name, and updates schools.name only — it
 * never re-homes teachers.school_id or the active pointer. No-op-safe (renaming
 * to the current name commits nothing).
 */
export async function renameWorkspace(
  client: ServerClient,
  schoolId: string,
  name: string,
): Promise<void> {
  const { error } = await client.rpc("rename_workspace", {
    p_school_id: schoolId,
    p_name: name,
  });
  if (error) {
    throw new Error(
      `Workspaces repository rename workspace failed: ${error.message}`,
    );
  }
}
