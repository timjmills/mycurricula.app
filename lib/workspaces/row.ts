// lib/workspaces/row.ts — PURE row shapes + mappers for the multi-workspace seam.
//
// No server imports: this module is safe to load anywhere (client, tests) and
// carries the RPC-row → domain mappings so they are unit-testable without a
// database. The server source (lib/workspaces/source.ts) calls list_my_workspaces
// and maps each row with mapWorkspaceRow / mapWorkspaceRows.
//
// The rows come from the list_my_workspaces() RPC
// (supabase/migrations/20260724120000_multi_workspace.sql SECTION 10), which is
// SECURITY DEFINER and returns ONE row per workspace the CALLER belongs to. It
// exposes NO other teacher's identity — only the aggregate member_count and the
// caller's own membership/ownership/admin flags. There is therefore no
// contributor-identity / least-privilege concern to mirror from the subjects seam.

/** The caller's relationship to a workspace, derived from is_owner / is_admin. */
export type WorkspaceRole = "owner" | "admin" | "member";

/** A raw `list_my_workspaces()` RPC result row (snake_case, DB-shaped). */
export interface WorkspaceRow {
  school_id: string;
  name: string;
  is_owner: boolean;
  is_admin: boolean;
  member_count: number;
  is_active: boolean;
}

/** A workspace as the UI consumes it (camelCase, role + solo derived). */
export interface WorkspaceSummary {
  /** schools.id — the tenant this workspace maps to. */
  schoolId: string;
  /** schools.name — the workspace display label. */
  name: string;
  /** Derived: 'owner' (founder) ⊃ 'admin' (school_admins) ⊃ 'member'. */
  role: WorkspaceRole;
  /** True for the caller's currently-focused workspace (auth_teacher_school_id). */
  isActive: boolean;
  /** Derived: a workspace with one member (or fewer) is solo, not a team. */
  isSolo: boolean;
  /** Aggregate member count for the workspace (no per-teammate identity). */
  memberCount: number;
}

/** The result of create_workspace(): the newly-minted tenant's school + its
 *  first grade (notebook). camelCase mirror of the RPC's RETURNS TABLE. */
export interface CreatedWorkspace {
  /** schools.id of the new workspace (now the caller's active workspace). */
  schoolId: string;
  /** grade_levels.id of the new workspace's single starter notebook. */
  gradeLevelId: string;
}

/** The exact columns list_my_workspaces() projects — documented for parity + the
 *  leak-guard test. These come from the RPC's RETURNS TABLE, NOT a `.select()`
 *  on a table (the RPC is the only read path; there is no client table read of
 *  workspace_members beyond the self-only RLS policy). */
export const WORKSPACE_ROW_COLUMNS =
  "school_id, name, is_owner, is_admin, member_count, is_active";

/** Derive the caller's role from the two capability booleans. Owner wins over
 *  admin (a founder is always also the workspace admin per the migration's
 *  create_workspace, but the label should read as owner). */
export function resolveWorkspaceRole(row: {
  is_owner: boolean;
  is_admin: boolean;
}): WorkspaceRole {
  if (row.is_owner) return "owner";
  if (row.is_admin) return "admin";
  return "member";
}

/** Map one list_my_workspaces() row to a WorkspaceSummary. Pure. */
export function mapWorkspaceRow(row: WorkspaceRow): WorkspaceSummary {
  return {
    schoolId: row.school_id,
    name: row.name,
    role: resolveWorkspaceRole(row),
    isActive: row.is_active,
    // A workspace with a single member (or a defensively-null/zero count) is a
    // solo workspace — the "solo vs. team is DERIVED per workspace from its
    // membership count" rule (migration header / MEMORY workspace-model-decisions).
    isSolo: (row.member_count ?? 0) <= 1,
    memberCount: row.member_count ?? 0,
  };
}

/** Map + DEDUPE a list of RPC rows by schoolId (first occurrence wins). The RPC
 *  returns one row per membership and workspace_members is unique per (school,
 *  teacher), so duplicates should never occur — this is defense in depth so a
 *  future RPC change that fans out rows (e.g. a join multiplying by grades) can
 *  never surface the same workspace twice in the switcher. Pure. */
export function mapWorkspaceRows(rows: readonly WorkspaceRow[]): WorkspaceSummary[] {
  const seen = new Set<string>();
  const out: WorkspaceSummary[] = [];
  for (const row of rows) {
    if (seen.has(row.school_id)) continue;
    seen.add(row.school_id);
    out.push(mapWorkspaceRow(row));
  }
  return out;
}

/** The active workspace in a mapped list, or null when none is flagged active
 *  (e.g. the backend is off, or the caller has no memberships). Pure. */
export function pickActiveWorkspace(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary | null {
  return workspaces.find((w) => w.isActive) ?? null;
}

/** Whether a workspace summary confers workspace-admin capability (owner OR
 *  admin). This is the ON-path replacement for the mock `ME.role === "lead"`
 *  derivation in lib/notebook-state.tsx. Pure. */
export function isWorkspaceAdminRole(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

// ── Workspace ROSTER (list_workspace_members RPC) ────────────────────────────
// The roster rows come from the list_workspace_members(p_school_id) RPC
// (supabase/migrations/20260725120000_workspace_roster.sql): SECURITY DEFINER,
// membership re-checked server-side (any MEMBER of the workspace may read its
// roster). Unlike list_my_workspaces, this projection DOES carry per-teammate
// identity (display_name + email) — a DECIDED parity with the home roster,
// which already shows fellow members' emails (components/team/TeamPage.tsx).
// It still never carries active_school_id (the leak-guard test pins this).

/** A raw `list_workspace_members()` RPC result row (snake_case, DB-shaped). */
export interface WorkspaceRosterRow {
  teacher_id: string;
  display_name: string;
  email: string;
  is_owner: boolean;
  is_admin: boolean;
  joined_at: string;
}

/** One roster member as the admin/queries layer consumes it (camelCase). */
export interface WorkspaceRosterEntry {
  teacherId: string;
  displayName: string;
  email: string;
  /** workspace_members.is_owner — the founding/creating teacher. */
  isOwner: boolean;
  /** True when this teacher holds a school_admins row IN THIS workspace. */
  isWorkspaceAdmin: boolean;
  /** workspace_members.created_at — when they joined this workspace. */
  joinedAt: string;
}

/** The exact columns list_workspace_members() projects — documented for parity
 *  with the RPC's RETURNS TABLE + the leak-guard test (never active_school_id). */
export const WORKSPACE_ROSTER_ROW_COLUMNS =
  "teacher_id, display_name, email, is_owner, is_admin, joined_at";

/** Map one list_workspace_members() row to a WorkspaceRosterEntry. Pure. */
export function mapRosterRow(row: WorkspaceRosterRow): WorkspaceRosterEntry {
  return {
    teacherId: row.teacher_id,
    displayName: row.display_name ?? "",
    email: row.email ?? "",
    isOwner: Boolean(row.is_owner),
    isWorkspaceAdmin: Boolean(row.is_admin),
    joinedAt: row.joined_at,
  };
}

/** Map + DEDUPE roster rows by teacher_id (first occurrence wins) and sort by
 *  display name then email (mirrors the RPC's ORDER BY, re-asserted here so the
 *  UI order is deterministic even if a future RPC edit drops it). The RPC
 *  returns one row per membership and workspace_members is unique per (school,
 *  teacher), so duplicates should never occur — dedupe is defense in depth,
 *  same posture as mapWorkspaceRows above. Pure. */
export function mapRosterRows(
  rows: readonly WorkspaceRosterRow[],
): WorkspaceRosterEntry[] {
  const seen = new Set<string>();
  const out: WorkspaceRosterEntry[] = [];
  for (const row of rows) {
    if (seen.has(row.teacher_id)) continue;
    seen.add(row.teacher_id);
    out.push(mapRosterRow(row));
  }
  return out.sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName) ||
      a.email.localeCompare(b.email),
  );
}
