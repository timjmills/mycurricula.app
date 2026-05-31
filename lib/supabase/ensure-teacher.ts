// ensure-teacher.ts — idempotent teacher + grade-assignment provisioning.
//
// **Why this exists (ultraplan §6 — Part B)**
// RLS requires a signed-in auth user to ALSO have a `teachers` row (id = auth
// uid) AND a `teacher_grade_assignments` row granting access to a grade —
// otherwise every RLS-gated query is denied (verified: insert → "violates
// RLS"). Today both auth paths (Google SSO callback + the Claude bypass) create
// only an `auth.users` row, so a freshly-authenticated user can read nothing.
//
// This helper closes that gap. After an auth user is ensured/created, both
// paths call `ensureTeacherRecord(admin, user)` to upsert the two rows. It is
// idempotent (on-conflict do nothing on the PK / unique key), so it is safe to
// call on every authenticated request.
//
// **Scope of what it provisions**
//   • teachers          — id = auth uid; school_id + default_grade_level_id from
//                          the seeded school/active grade; display_name from the
//                          email local-part; default_view 'weekly';
//                          completion_privacy 'private'.
//   • teacher_grade_assignments — (teacher_id = uid, grade_level_id = that grade,
//                          role 'teacher').
//
// It uses the SERVICE-ROLE admin client (RLS-bypassing) — required because the
// teacher can't yet read/write its own row under RLS until these rows exist.
//
// **Resolution of the school/grade**
//   The seed (supabase/seed.sql) creates one school + one active Grade 5. We
//   resolve them by query (oldest school → its active grade), never by assuming
//   fixed UUIDs, so this survives a re-seed and stays multi-grade-ready (it
//   simply provisions the teacher onto the first active grade; multi-grade
//   assignment is a later admin concern, not auth-time).
//
// **Privacy (CLAUDE.md §11.4):** writes only teacher identity columns derived
// from the auth user — never any student field.

import type { SupabaseClient } from "@supabase/supabase-js";

/** The minimal auth-user shape both call sites can supply. */
export interface AuthUserLike {
  id: string;
  email?: string | null;
}

/** Outcome of a provisioning attempt — useful for logging at the call site. */
export interface EnsureTeacherResult {
  ok: boolean;
  /** Why it was skipped/failed, when ok=false. */
  reason?: string;
  teacherId?: string;
  gradeLevelId?: string;
}

/**
 * Idempotently ensure the `teachers` + `teacher_grade_assignments` rows exist
 * for an authenticated auth user. Uses the service-role admin client.
 *
 * Never throws — returns `{ ok: false, reason }` on any failure so the auth
 * flow that calls it can continue (a failed provision must not block login;
 * the user simply sees empty/denied data until provisioning succeeds on a
 * later request).
 */
export async function ensureTeacherRecord(
  admin: SupabaseClient,
  user: AuthUserLike,
): Promise<EnsureTeacherResult> {
  if (!user?.id) return { ok: false, reason: "missing auth user id" };

  try {
    // Resolve the seeded school (oldest) — the multi-tenant root.
    const { data: school, error: schoolErr } = await admin
      .from("schools")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (schoolErr)
      return { ok: false, reason: `schools: ${schoolErr.message}` };
    if (!school)
      return { ok: false, reason: "no school row (seed not applied)" };

    // Resolve the active grade for that school.
    const { data: grade, error: gradeErr } = await admin
      .from("grade_levels")
      .select("id")
      .eq("school_id", school.id as string)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (gradeErr)
      return { ok: false, reason: `grade_levels: ${gradeErr.message}` };
    if (!grade)
      return { ok: false, reason: "no active grade_level (seed not applied)" };

    const schoolId = school.id as string;
    const gradeId = grade.id as string;
    const email = user.email ?? "";
    const displayName = (email.split("@")[0] || "Teacher").slice(0, 120);

    // Upsert the teachers row. PK = auth uid; on-conflict ignore so we don't
    // clobber a teacher's later-edited preferences (display_name etc.).
    const { error: teacherErr } = await admin.from("teachers").upsert(
      {
        id: user.id,
        school_id: schoolId,
        email,
        display_name: displayName,
        default_view: "weekly",
        completion_privacy: "private",
        default_grade_level_id: gradeId,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (teacherErr)
      return { ok: false, reason: `teachers: ${teacherErr.message}` };

    // Upsert the grade assignment. Unique (teacher_id, grade_level_id); ignore
    // duplicates so a re-run is a no-op and never escalates an existing role.
    const { error: assignErr } = await admin
      .from("teacher_grade_assignments")
      .upsert(
        {
          teacher_id: user.id,
          grade_level_id: gradeId,
          role: "teacher",
        },
        { onConflict: "teacher_id,grade_level_id", ignoreDuplicates: true },
      );
    if (assignErr)
      return {
        ok: false,
        reason: `teacher_grade_assignments: ${assignErr.message}`,
      };

    return { ok: true, teacherId: user.id, gradeLevelId: gradeId };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
