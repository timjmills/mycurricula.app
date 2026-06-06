// lib/admin/queries.ts — the admin / aggregation repository seam.
//
// CLAUDE.md §3 / §5 convention: ALL aggregation + admin queries live here (even
// pre-UI). This module holds the typed READ helpers that back the Wave W-D/W-F
// workspace + notebook admin surfaces:
//   • listWorkspaceMembers  — every member of the caller's workspace, with their
//     per-notebook (grade) roles + the workspace seat usage ("3 / 5").
//   • listWorkspaceNotebooks — the workspace's notebooks (grade_levels), active
//     and archived.
//
// READ-ONLY. Every WRITE in this domain goes through the SECURITY DEFINER RPCs in
// supabase/migrations/20260606160000_workspace_notebook_admin.sql
// (create/rename/archive_notebook, set_member_role, remove_member,
// grant/revoke_workspace_admin) — never a direct table write from here. These
// reads run under the caller's session (the server Supabase client), so
// Row-Level Security is what actually scopes the rows: a teacher only ever reads
// their own workspace's members/notebooks (the ~40 RLS policies key off
// auth_teacher_school_id() / can_read_grade()). This module never uses the
// service-role client.
//
// SERVER-ONLY: createClient() imports next/headers (cookies), so this module must
// not be bundled into a client component — call it from Server Components / Route
// Handlers / Server Actions (the same posture as lib/teach's Supabase source).

import { createClient } from "@/lib/supabase/server";

// ── DB-accurate enum mirrors ────────────────────────────────────────────────
// The grade_role Postgres enum (M1) has THREE values — distinct from the mock
// UI's 2-value `TeacherRole` in lib/types.ts. Mirror the DB shape here so admin
// reads are type-honest about 'grade_admin'.
export type GradeRole = "teacher" | "lead" | "grade_admin";

/** One member's role on one notebook (grade) of the workspace. */
export interface NotebookRole {
  gradeLevelId: string;
  /** The notebook's display name (grade_levels.name). */
  notebookName: string;
  role: GradeRole;
}

/** A workspace member, with their per-notebook roles + admin flag. */
export interface WorkspaceMember {
  teacherId: string;
  displayName: string;
  email: string;
  /** True when this teacher holds a school_admins row (workspace admin). */
  isWorkspaceAdmin: boolean;
  /** Their role per notebook they participate in (TGA rows), notebook-sorted. */
  notebookRoles: NotebookRole[];
}

/** Seat ledger for the workspace's team (team_memberships vs seat_cap). */
export interface SeatUsage {
  /** Active members occupying a seat (team_memberships count). */
  used: number;
  /** The seat ceiling (teams.seat_cap; default 5). */
  cap: number;
}

/** The full member roster + seat usage for a workspace. */
export interface WorkspaceMembersResult {
  members: WorkspaceMember[];
  seats: SeatUsage;
}

/** A notebook (grade_levels row) in the workspace, with derived archived flag. */
export interface WorkspaceNotebook {
  gradeLevelId: string;
  name: string;
  displayOrder: number;
  /** grade_levels.is_active — archived notebooks have is_active=false. */
  isActive: boolean;
}

/**
 * List every member of the caller's workspace with their per-notebook roles and
 * the workspace seat usage.
 *
 * RLS scopes this to the caller's own workspace:
 *   • `teachers` read policy returns teammates sharing the caller's school_id;
 *   • `school_admins` / `teacher_grade_assignments` / `grade_levels` reads are
 *     likewise workspace/grade-scoped; a foreign tenant's rows are invisible.
 * The seat ledger comes from the workspace's single `teams` row (Strategy A: 1:1
 * with the school) — readable to any member via the teams_read policy.
 *
 * Returns members sorted by display name, each member's notebookRoles sorted by
 * the notebook's display_order then name.
 */
export async function listWorkspaceMembers(): Promise<WorkspaceMembersResult> {
  const supabase = await createClient();

  // Teammates (RLS → same workspace). Explicit columns; never `select *`.
  const { data: teacherRows, error: teachersError } = await supabase
    .from("teachers")
    .select("id, display_name, email")
    .order("display_name", { ascending: true });
  if (teachersError) throw teachersError;
  const teachers = teacherRows ?? [];

  // Workspace admins (school_admins rows visible to the caller = their own
  // workspace). teacher_id is nullable (standalone admin accounts) — filter
  // those out of the per-teacher flag set.
  const { data: adminRows, error: adminsError } = await supabase
    .from("school_admins")
    .select("teacher_id");
  if (adminsError) throw adminsError;
  const adminIds = new Set(
    (adminRows ?? [])
      .map((r) => r.teacher_id as string | null)
      .filter((id): id is string => id != null),
  );

  // Per-notebook roles: TGA rows joined to their grade's name. RLS returns only
  // grades the caller can read (their workspace). The embedded grade_levels
  // alias gives us the notebook name + ordering in one round-trip.
  const { data: tgaRows, error: tgaError } = await supabase
    .from("teacher_grade_assignments")
    .select(
      "teacher_id, role, grade_level_id, grade_levels(name, display_order)",
    );
  if (tgaError) throw tgaError;

  // Group TGA rows by teacher, carrying the notebook name + order for sorting.
  type TgaJoin = {
    teacher_id: string;
    role: GradeRole;
    grade_level_id: string;
    grade_levels: { name: string | null; display_order: number | null } | null;
  };
  const rolesByTeacher = new Map<
    string,
    Array<NotebookRole & { displayOrder: number }>
  >();
  for (const raw of (tgaRows ?? []) as unknown as TgaJoin[]) {
    const list = rolesByTeacher.get(raw.teacher_id) ?? [];
    list.push({
      gradeLevelId: raw.grade_level_id,
      notebookName: raw.grade_levels?.name ?? "",
      role: raw.role,
      displayOrder: raw.grade_levels?.display_order ?? 0,
    });
    rolesByTeacher.set(raw.teacher_id, list);
  }

  const members: WorkspaceMember[] = teachers.map((t) => {
    const roles = (rolesByTeacher.get(t.id as string) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.displayOrder - b.displayOrder ||
          a.notebookName.localeCompare(b.notebookName),
      )
      .map(({ gradeLevelId, notebookName, role }) => ({
        gradeLevelId,
        notebookName,
        role,
      }));
    return {
      teacherId: t.id as string,
      displayName: (t.display_name as string) ?? "",
      email: (t.email as string) ?? "",
      isWorkspaceAdmin: adminIds.has(t.id as string),
      notebookRoles: roles,
    };
  });

  // Seat usage from the workspace's single team row. There is exactly one team
  // per workspace (teams.school_id NOT NULL UNIQUE), so `maybeSingle()` is
  // correct; a solo/legacy workspace with no team row yields a sensible default.
  const { data: teamRow, error: teamError } = await supabase
    .from("teams")
    .select("id, seat_cap")
    .maybeSingle();
  if (teamError) throw teamError;

  let seats: SeatUsage = { used: members.length, cap: 5 };
  if (teamRow) {
    const { count, error: countError } = await supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamRow.id as string);
    if (countError) throw countError;
    seats = { used: count ?? 0, cap: (teamRow.seat_cap as number) ?? 5 };
  }

  return { members, seats };
}

/**
 * List the caller's workspace notebooks (grade_levels rows), active and
 * archived. RLS returns only grades in the caller's workspace
 * (grade_levels_read: school_id = auth_teacher_school_id() OR school admin).
 *
 * Sorted by display_order then name (the order create_notebook assigns:
 * appended after existing notebooks). The `isActive=false` rows are the archived
 * notebooks (archive_notebook soft-archives; nothing is ever deleted).
 */
export async function listWorkspaceNotebooks(): Promise<WorkspaceNotebook[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, display_order, is_active")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((g) => ({
    gradeLevelId: g.id as string,
    name: (g.name as string) ?? "",
    displayOrder: (g.display_order as number) ?? 0,
    isActive: (g.is_active as boolean) ?? false,
  }));
}
