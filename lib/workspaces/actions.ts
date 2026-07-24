"use server";

// lib/workspaces/actions.ts — the SERVER bridge for the multi-workspace seam.
//
// The workspaces source (lib/workspaces/source.ts) calls the SECURITY DEFINER
// RPCs; it depends on the per-request server client (next/headers), so it is
// server-only and cannot be bundled into a client component. Client code (the
// notebook-state provider, and later the Settings/switcher UI) reaches it through
// these EXPLICIT, NAMED server actions — deliberately NOT a generic
// method-dispatch: the only operations exposed are list / get-active / set-active
// / create / list-notebooks, so there is no attacker-controlled method name and
// no generic RPC passthrough.
//
// ENVELOPE (mirrors lib/subjects/actions.ts): a Server Action that THROWS has its
// error redacted by Next.js before it reaches the client. We instead RESOLVE with
// a discriminated envelope so an operational failure travels as DATA and never
// leaks a DB/RLS internal — every unexpected error collapses to a generic message
// and is logged server-side.
//
// ── DOUBLE GATE (both must hold before any RPC fires) ──────────────────────
//   1. MULTI_WORKSPACE — the wave flag (lib/multi-workspace-flag.ts). DEFAULT
//      OFF: the backing migration is not yet applied to prod, so until it is +
//      this flag is flipped on in a build, every action short-circuits and the
//      app renders the Phase-1A mock workspace unchanged.
//   2. isPlannerSupabaseConfigured() — the planner's Supabase switch. Workspaces
//      are planner-domain tenancy, so they share it (a real project +
//      NEXT_PUBLIC_PLANNER_USE_SUPABASE=1). When the backend is off (prototype /
//      CI), reads return empty and writes return a friendly error rather than
//      hitting throwaway localhost keys.

import { sb } from "../supabase/helpers";
import { isPlannerSupabaseConfigured } from "../planner/source";
import { MULTI_WORKSPACE } from "../multi-workspace-flag";
import { listWorkspaceNotebooks } from "../admin/queries";
import {
  createWorkspace,
  listMyWorkspaces,
  renameWorkspace,
  setActiveWorkspace,
} from "./source";
import {
  pickActiveWorkspace,
  type CreatedWorkspace,
  type WorkspaceSummary,
} from "./row";

/** Discriminated result envelope for the workspaces actions. */
export type WorkspacesActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

/** The minimal notebook shape the notebook-state provider consumes (structurally
 *  identical to lib/notebook-state.tsx's NotebookEntry — kept local so this
 *  server action never imports the "use client" provider module). A `type` alias
 *  (not an interface) mirrors the proven lib/subjects/actions.ts export posture
 *  for a 'use server' module. */
export type ActiveWorkspaceNotebook = {
  gradeLevelId: string;
  name: string;
  isActive: boolean;
};

/** The active workspace's identity + notebooks, resolved in ONE request. */
export type ActiveWorkspaceContext = {
  /** The caller's currently-active workspace, or null (seam off / no active). */
  workspace: WorkspaceSummary | null;
  /** The active workspace's notebooks (empty when workspace is null). */
  notebooks: ActiveWorkspaceNotebook[];
};

/** Opaque message for any unexpected error, so DB/RLS internals never cross the
 *  boundary. */
const GENERIC_ERROR = "That didn't work — please try again.";

/** Message when the seam isn't wired (flag off / prototype / CI). */
const BACKEND_OFF = "Multiple workspaces aren't available yet.";

/** True only when BOTH gates hold: the wave flag AND a real planner backend. */
function seamEnabled(): boolean {
  return MULTI_WORKSPACE && isPlannerSupabaseConfigured();
}

/** List every workspace the caller belongs to (empty when the seam is off).
 *  Read-only; safe to call from any authed surface. */
export async function listMyWorkspacesAction(): Promise<
  WorkspacesActionResult<WorkspaceSummary[]>
> {
  if (!seamEnabled()) return { ok: true, value: [] };
  try {
    const client = await sb();
    const value = await listMyWorkspaces(client);
    return { ok: true, value };
  } catch (e) {
    console.error("listMyWorkspacesAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** The caller's currently-active workspace, or null (null when the seam is off).
 *  Derived from list_my_workspaces' is_active flag. */
export async function getActiveWorkspaceAction(): Promise<
  WorkspacesActionResult<WorkspaceSummary | null>
> {
  if (!seamEnabled()) return { ok: true, value: null };
  try {
    const client = await sb();
    const all = await listMyWorkspaces(client);
    return { ok: true, value: pickActiveWorkspace(all) };
  } catch (e) {
    console.error("getActiveWorkspaceAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** The active workspace's IDENTITY + its NOTEBOOKS, resolved in one server
 *  request (Codex R1 High: reading them as two separate CLIENT→server requests
 *  lets a concurrent switch interleave and tear identity/notebooks across
 *  tenants). Two properties close the cross-tenant window:
 *    1. ONE round-trip — the client cannot switch workspaces between the two
 *       reads (the wide window Codex first described).
 *    2. The notebook read is SCOPED to the just-resolved active workspace id
 *       (listWorkspaceNotebooks(workspace.schoolId)), NOT the ambient RLS
 *       resolver. So even if a concurrent set_active_workspace commits between
 *       the two DB statements (the residual intra-request race — a Server Action
 *       is NOT one DB transaction), the explicit `school_id = <resolved id>`
 *       filter can NEVER return another workspace's notebooks: it degrades at
 *       worst to an empty list (self-healing on the next mount), never a
 *       cross-tenant tear. This is NOT a security leak either way — both
 *       workspaces belong to the caller (RLS fail-closes to memberships).
 *    RESIDUAL: fully transactional atomicity (identity + notebooks in ONE
 *    snapshot) needs a single SECURITY DEFINER RPC. That belongs in the
 *    multi-workspace migration, which is frozen + separately vetted and must not
 *    be modified in this unit — the scoped read above is the correct in-scope
 *    mitigation until that RPC lands with the switcher UI.
 *  The notebook read is only issued once a non-null active workspace resolves (a
 *  null active workspace keeps the provider's mock). Notebooks come from the
 *  existing lib/admin/queries listWorkspaceNotebooks() (reused, no
 *  re-implementation). Returns { workspace: null, notebooks: [] } when off.
 *
 *  NOTE (beyond the literal seam spec): this combined read exists so the
 *  notebook-state ON path can source the real workspace identity + notebook list
 *  without the client importing the server-only admin query. */
export async function getActiveWorkspaceContextAction(): Promise<
  WorkspacesActionResult<ActiveWorkspaceContext>
> {
  if (!seamEnabled()) {
    return { ok: true, value: { workspace: null, notebooks: [] } };
  }
  try {
    const client = await sb();
    const workspace = pickActiveWorkspace(await listMyWorkspaces(client));
    // Only read notebooks once an active workspace is resolved — a null active
    // workspace must NOT surface notebooks (the provider keeps its mock). The
    // read is PINNED to workspace.schoolId so it can never tear to another
    // tenant's notebooks (see the doc above).
    const notebooks: ActiveWorkspaceNotebook[] = workspace
      ? (await listWorkspaceNotebooks(workspace.schoolId)).map((n) => ({
          gradeLevelId: n.gradeLevelId,
          name: n.name,
          isActive: n.isActive,
        }))
      : [];
    return { ok: true, value: { workspace, notebooks } };
  } catch (e) {
    console.error("getActiveWorkspaceContextAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** Switch the caller's active workspace. */
export async function setActiveWorkspaceAction(
  schoolId: string,
): Promise<WorkspacesActionResult<void>> {
  if (!seamEnabled()) {
    return { ok: false, error: { message: BACKEND_OFF } };
  }
  try {
    const client = await sb();
    await setActiveWorkspace(client, schoolId);
    return { ok: true, value: undefined };
  } catch (e) {
    console.error("setActiveWorkspaceAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** Mint a new workspace (tenant) and switch to it. */
export async function createWorkspaceAction(
  name: string,
): Promise<WorkspacesActionResult<CreatedWorkspace>> {
  if (!seamEnabled()) {
    return { ok: false, error: { message: BACKEND_OFF } };
  }
  try {
    const client = await sb();
    const value = await createWorkspace(client, name);
    return { ok: true, value };
  } catch (e) {
    console.error("createWorkspaceAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** Rename a workspace the caller administers. The RPC re-checks membership +
 *  admin rights server-side; a non-member / non-admin is rejected there. */
export async function renameWorkspaceAction(
  schoolId: string,
  name: string,
): Promise<WorkspacesActionResult<void>> {
  if (!seamEnabled()) {
    return { ok: false, error: { message: BACKEND_OFF } };
  }
  try {
    const client = await sb();
    await renameWorkspace(client, schoolId, name);
    return { ok: true, value: undefined };
  } catch (e) {
    console.error("renameWorkspaceAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}
