// lib/workspaces/authz.ts — PURE authorization mirror for the multi-workspace RPCs.
//
// The DB is the ENFORCEMENT point: set_active_workspace / create_workspace
// (supabase/migrations/20260724120000_multi_workspace.sql SECTIONS 8-9) are
// SECURITY DEFINER RPCs that re-check every rule server-side off auth.uid(), and
// the fail-closed auth_teacher_school_id() resolver (SECTION 6) makes a poked
// active_school_id incapable of widening scope regardless of the UI. This module
// re-expresses the RPCs' CHEAP preconditions as pure TypeScript so that:
//   1. the client can decide whether to SHOW a "create workspace" / "switch"
//      affordance without a round-trip (a denied action must STILL fail closed at
//      the RPC — this is a cosmetic gate only, never the security boundary), and
//   2. the decision matrix is unit-testable in this repo, which has no DB harness
//      (see tests/workspaces-rpcs.test.ts).
//
// KEEP IN LOCKSTEP with the SQL. If an RPC's guard order or its anti-abuse cap
// changes, change these predicates in the same commit — a drift here is a lie to
// the UI, not a security hole (the RPC still enforces), but it will mis-gate
// affordances (e.g. offer "create" past the cap, then error on submit).

/**
 * The workspace-creation SAFETY CAP the create_workspace RPC enforces
 * (`c_max_owned constant integer := 25`). This is an anti-abuse / anti-fabrication
 * guard on tenant minting, deliberately GENEROUS — it is NOT a business/plan tier
 * limit (CLAUDE.md §1: free-tier limits + seat counts are undecided and must not
 * be encoded here). Mirrored ONLY so the UI can pre-empt the RPC's error; the RPC
 * is the enforcement point. KEEP EQUAL to the SQL constant.
 */
export const WORKSPACE_CREATION_SAFETY_CAP = 25;

/** Inputs the CREATE-WORKSPACE decision depends on — resolved server-side in the
 *  RPC, and resolvable client-side from the caller's session + their membership
 *  list (list_my_workspaces gives the owned count). */
export interface CreateWorkspaceContext {
  /** The authenticated caller (auth.uid()). Empty ⇒ not authenticated. */
  callerId: string;
  /** Whether the caller already has a teacher profile. The RPC extends an
   *  existing account; it does not mint a teachers row. */
  hasTeacherProfile: boolean;
  /** How many workspaces the caller currently OWNS (workspace_members where
   *  is_owner). Gated by the safety cap. */
  ownedWorkspaceCount: number;
}

/** Inputs the SWITCH-WORKSPACE decision depends on. */
export interface SwitchWorkspaceContext {
  /** The authenticated caller (auth.uid()). Empty ⇒ not authenticated. */
  callerId: string;
  /** The target workspace (schools.id). Empty ⇒ no target. */
  targetSchoolId: string;
  /** is_workspace_member(target) for the caller — the RPC's fail-closed gate. A
   *  non-member can NEVER point their active workspace at a foreign tenant. */
  isMember: boolean;
}

/** Why a create/switch is not permitted (stable codes for tests + UI copy). */
export type CreateWorkspaceDenyReason =
  | "not-authenticated"
  | "no-teacher-profile"
  | "safety-cap-reached";

export type SwitchWorkspaceDenyReason =
  | "not-authenticated"
  | "no-target"
  | "not-a-member";

export type Decision<R> = { allowed: true } | { allowed: false; reason: R };

const ALLOW = { allowed: true } as const;
function deny<R>(reason: R): { allowed: false; reason: R } {
  return { allowed: false, reason };
}

/**
 * Mirror of create_workspace's preconditions (SECTION 9). Order matches the SQL's
 * guard order so the first-failing reason is identical to the RPC's raised error:
 * authenticated → has-profile → anti-abuse cap.
 */
export function canCreateWorkspace(
  ctx: CreateWorkspaceContext,
): Decision<CreateWorkspaceDenyReason> {
  if (!ctx.callerId)
    return deny<CreateWorkspaceDenyReason>("not-authenticated");
  if (!ctx.hasTeacherProfile)
    return deny<CreateWorkspaceDenyReason>("no-teacher-profile");
  // `>=` mirrors the SQL: `if v_owned >= c_max_owned then raise`.
  if (ctx.ownedWorkspaceCount >= WORKSPACE_CREATION_SAFETY_CAP) {
    return deny<CreateWorkspaceDenyReason>("safety-cap-reached");
  }
  return ALLOW;
}

/**
 * Mirror of set_active_workspace's preconditions (SECTION 8). Order matches the
 * SQL: authenticated → target-present → membership re-check (fail closed).
 */
export function canSwitchToWorkspace(
  ctx: SwitchWorkspaceContext,
): Decision<SwitchWorkspaceDenyReason> {
  if (!ctx.callerId)
    return deny<SwitchWorkspaceDenyReason>("not-authenticated");
  if (!ctx.targetSchoolId)
    return deny<SwitchWorkspaceDenyReason>("no-target");
  // The RPC's crown-jewel gate: only a genuine membership may be activated.
  if (!ctx.isMember) return deny<SwitchWorkspaceDenyReason>("not-a-member");
  return ALLOW;
}
