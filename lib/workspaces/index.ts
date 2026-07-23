// lib/workspaces/index.ts — public surface for the multi-workspace seam.
//
// Exposes ONLY client-safe modules: the client facade (which routes to the server
// actions), the pure authorization mirror, and the pure row types/mappers. The
// server-only modules (source.ts → the injected server client; actions.ts →
// 'use server') are imported directly by their server callers and deliberately
// NOT re-exported here, so a client component importing this barrel never pulls
// server code into its bundle.

export {
  workspacesClient,
  listMyWorkspaces,
  getActiveWorkspace,
  getActiveWorkspaceContext,
  setActiveWorkspace,
  createWorkspace,
  WORKSPACE_CHANGED_EVENT,
  type ActiveWorkspaceNotebook,
  type ActiveWorkspaceContext,
} from "./client";

export {
  canCreateWorkspace,
  canSwitchToWorkspace,
  WORKSPACE_CREATION_SAFETY_CAP,
  type CreateWorkspaceContext,
  type SwitchWorkspaceContext,
  type CreateWorkspaceDenyReason,
  type SwitchWorkspaceDenyReason,
  type Decision,
} from "./authz";

export {
  mapWorkspaceRow,
  mapWorkspaceRows,
  resolveWorkspaceRole,
  pickActiveWorkspace,
  isWorkspaceAdminRole,
  WORKSPACE_ROW_COLUMNS,
  type WorkspaceRole,
  type WorkspaceRow,
  type WorkspaceSummary,
  type CreatedWorkspace,
} from "./row";
