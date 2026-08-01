// lib/workspaces/client.ts — the CLIENT-SIDE facade for the multi-workspace seam.
//
// UI (client components) + the notebook-state provider import from here ONLY —
// never the server-only source/actions internals. Each method calls its explicit
// server action and unwraps the discriminated envelope: on success it returns the
// value; on an operational failure it throws a real Error carrying the friendly,
// client-safe message the action chose.
//
// SEAM-OFF BEHAVIOR: when the wave flag or the planner backend is off, the reads
// resolve to empty/null and the writes throw the friendly BACKEND_OFF message —
// so a caller that runs with the flag OFF sees "no workspaces / no active
// workspace", exactly matching the notebook-state OFF path's decision to keep the
// mock. Callers must treat null/empty as "seam not active", not as an error.

import {
  createWorkspaceAction,
  getActiveWorkspaceAction,
  listMyWorkspacesAction,
  renameWorkspaceAction,
  setActiveWorkspaceAction,
  type ActiveWorkspaceContext,
} from "./actions";
import { readActiveWorkspaceContextRemote } from "./remote";
import type { CreatedWorkspace, WorkspaceSummary } from "./row";

/** Re-exported so client consumers can name the seam result types without
 *  importing the 'use server' actions module directly. */
export type { ActiveWorkspaceNotebook, ActiveWorkspaceContext } from "./actions";

/**
 * Window event broadcast by the workspace switcher after a SUCCESSFUL
 * switch/create (see the invalidation contract below). Client providers that
 * source the active-workspace identity ONCE at mount — notably the settings-
 * LAYOUT NotebookProvider that feeds the /settings overview tile — listen for it
 * and re-fetch. router.refresh() re-runs Server Components but NOT a client
 * provider's mount effect, so without this signal the overview tile would keep
 * showing the prior workspace until a full reload. Fired + listened for ONLY on
 * the MULTI_WORKSPACE ON path (both the switcher and WorkspaceIdentitySync mount
 * only when the flag is on), so the OFF path never sees it.
 */
export const WORKSPACE_CHANGED_EVENT = "mycurricula:workspace-changed";

/** List every workspace the caller belongs to (empty when the seam is off). */
export async function listMyWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await listMyWorkspacesAction();
  if (!res.ok) throw new Error(res.error.message);
  return res.value;
}

/** The caller's currently-active workspace, or null (null when the seam is off). */
export async function getActiveWorkspace(): Promise<WorkspaceSummary | null> {
  const res = await getActiveWorkspaceAction();
  if (!res.ok) throw new Error(res.error.message);
  return res.value;
}

/**
 * The active workspace's identity + notebooks. `{ workspace: null, notebooks: [] }`
 * when the seam is off.
 *
 * ── READ DIRECTLY FROM THE BROWSER, NOT THROUGH THE SERVER ACTION (task #46) ──
 * Next runs client-initiated Server Actions ONE AT A TIME. This read fires at
 * t≈0 from `WorkspaceIdentitySync`'s mount effect with no awaited prerequisite,
 * while the planner hydrate is gated behind `ownerId` (null until a browser auth
 * round trip resolves) — so this one always won the queue and the planner waited
 * out its full duration (677–1311 ms, measured on production by an earlier pass)
 * before its own work began. Reordering does not help; whichever runs second
 * still pays for the first. Taking this read OFF the queue is the only fix that
 * does not simply move the cost onto the workspace chrome.
 *
 * Both underlying reads are RLS-gated and use no service-role client, so the
 * browser has exactly the same authority the action had — see
 * lib/workspaces/remote.ts for the full authority + atomicity analysis
 * (particularly what the pinned notebook read guarantees, and which property
 * this weakens).
 *
 * TO REVERT: call `getActiveWorkspaceContextAction()` here again and unwrap its
 * envelope. That action is deliberately still exported and unchanged — it is
 * both the revert path and the server-side entry point for any future caller.
 */
export async function getActiveWorkspaceContext(): Promise<ActiveWorkspaceContext> {
  return readActiveWorkspaceContextRemote();
}

// ── MUTATIONS — CALLER MUST RE-SOURCE THE PROVIDER AFTER SUCCESS ────────────
// INTEGRATION CONTRACT (read before wiring the switcher/create UI): these two
// mutations move the SERVER-side active-workspace pointer, but NotebookProvider
// sources its identity ONCE at mount (via <WorkspaceIdentitySync>). So after a
// successful switch/create the provider will keep showing the OLD workspace's
// name/notebooks/admin state until it re-sources (Codex R3). This unit ships NO
// switcher/create UI (a separate unit) and therefore NO caller of these methods,
// so nothing goes stale today. When that UI lands it OWNS invalidation: after a
// successful mutation it must re-source the provider — remount the provider
// subtree (e.g. a `key` tied to the active workspace) or route to a fresh mount;
// a bare `router.refresh()` will NOT remount a client provider and is
// insufficient on its own. Do not call these expecting the surrounding UI to
// update automatically.

/** Switch the caller's active workspace (throws BACKEND_OFF when off). The
 *  caller MUST re-source the provider after success — see the contract above. */
export async function setActiveWorkspace(schoolId: string): Promise<void> {
  const res = await setActiveWorkspaceAction(schoolId);
  if (!res.ok) throw new Error(res.error.message);
}

/** Mint a new workspace and switch to it (throws BACKEND_OFF when off). The
 *  caller MUST re-source the provider after success — see the contract above. */
export async function createWorkspace(
  name: string,
): Promise<CreatedWorkspace> {
  const res = await createWorkspaceAction(name);
  if (!res.ok) throw new Error(res.error.message);
  return res.value;
}

/** Rename a workspace the caller administers (throws BACKEND_OFF when off, or the
 *  friendly error the RPC's membership/admin re-check produced). The caller MUST
 *  re-source the provider after success (broadcast WORKSPACE_CHANGED_EVENT) — the
 *  new name is DB-sourced, so the displayed identity won't update otherwise. */
export async function renameWorkspace(
  schoolId: string,
  name: string,
): Promise<void> {
  const res = await renameWorkspaceAction(schoolId, name);
  if (!res.ok) throw new Error(res.error.message);
}

/** Grouped facade for ergonomic imports (`workspacesClient.getActiveWorkspace()`). */
export const workspacesClient = {
  listMyWorkspaces,
  getActiveWorkspace,
  getActiveWorkspaceContext,
  setActiveWorkspace,
  createWorkspace,
  renameWorkspace,
};
