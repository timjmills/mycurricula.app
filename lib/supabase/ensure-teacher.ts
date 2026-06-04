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
// **Resolution of the school/grade — FAIL CLOSED (audit #3)**
//   Provisioning must NOT enroll an arbitrary authenticated account into a
//   tenant. A valid Google sign-in (or any minted auth user) only proves the
//   person controls that email — NOT that they belong to a given school. The
//   previous behavior ("oldest school → its active grade, for anyone") was a
//   fail-OPEN multi-tenant hole: an external/wrong-school account silently
//   received another tenant's data.
//
//   The gate is now an explicit email-domain allow-list. We only provision a
//   teacher + grade-assignment row when the authenticated user's email domain
//   is allow-listed to a school. The schema has no `schools.email_domain`
//   column yet, so the allow-list lives in an env var:
//
//     ALLOWED_TEACHER_EMAIL_DOMAINS  (preferred)
//     CLAUDE_PROVISION_EMAIL_DOMAINS (legacy alias, also honored)
//
//   Format: comma-separated `domain` or `domain:school_id` pairs, e.g.
//
//     ALLOWED_TEACHER_EMAIL_DOMAINS="school.edu.qa,example.org:550e8400-e29b-41d4-a716-446655440000"
//
//   • `domain`            → allow-listed; the target school is resolved by
//                           query (oldest school → its active grade) ONLY
//                           because the domain is explicitly trusted.
//   • `domain:school_id`  → allow-listed AND pinned to that exact school
//                           (recommended once more than one tenant exists).
//
//   If the env var is unset, OR the user's email domain is not in the list,
//   NO teacher/grade rows are created. The function returns
//   `{ ok: false, reason: "domain-not-allowlisted" }` and RLS denies access.
//   **The deploy owner MUST set this env var** (Cloudflare worker secret +
//   `.env.local`) or no one — including legitimate teachers — gets provisioned.
//   Still multi-grade-ready (provisions onto the first active grade; multi-grade
//   assignment is a later admin concern, not auth-time) and idempotent for
//   already-provisioned users.
//
// **Privacy (CLAUDE.md §11.4):** writes only teacher identity columns derived
// from the auth user — never any student field.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Parse the email-domain allow-list env var into a domain→schoolId? map.
 *
 * Reads `ALLOWED_TEACHER_EMAIL_DOMAINS` (preferred) and falls back to the
 * legacy `CLAUDE_PROVISION_EMAIL_DOMAINS`. Format: comma-separated `domain`
 * or `domain:school_id` entries. Domains are lower-cased and trimmed; a
 * leading `@` (if someone writes `@school.edu`) is stripped. Blank entries
 * and entries with an empty domain are ignored.
 *
 * Returns an empty Map when the env var is unset/empty — which fails closed
 * (every lookup misses, so nothing is provisioned).
 */
function parseAllowedDomains(): Map<string, string | null> {
  const raw =
    process.env.ALLOWED_TEACHER_EMAIL_DOMAINS ??
    process.env.CLAUDE_PROVISION_EMAIL_DOMAINS ??
    "";
  const map = new Map<string, string | null>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // Split on the FIRST colon only — a school_id is a UUID with no colons,
    // and this keeps the parse robust if the value is ever quoted oddly.
    const colon = trimmed.indexOf(":");
    const rawDomain = colon === -1 ? trimmed : trimmed.slice(0, colon);
    const rawSchool = colon === -1 ? "" : trimmed.slice(colon + 1).trim();
    const domain = rawDomain.trim().toLowerCase().replace(/^@/, "");
    if (!domain) continue;
    map.set(domain, rawSchool || null);
  }
  return map;
}

/**
 * Extract the lower-cased domain from an email address, or null if the value
 * is not a well-formed `local@domain` (exactly one `@`, non-empty on both
 * sides). Conservative on purpose: anything ambiguous returns null so it
 * fails the allow-list check rather than matching unexpectedly.
 */
function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

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
    const email = (user.email ?? "").trim();
    // ── FAIL-CLOSED domain gate (audit #3) ────────────────────────────────
    // Only allow-listed email domains get provisioned. No email → no domain →
    // no provisioning. Never fall back to "the oldest school" for an
    // un-vetted account.
    if (!email) return { ok: false, reason: "domain-not-allowlisted" };
    const domain = emailDomain(email);
    if (!domain) return { ok: false, reason: "domain-not-allowlisted" };

    const allowed = parseAllowedDomains();
    if (!allowed.has(domain)) {
      // Covers both "env unset" (empty map) and "domain not listed".
      return { ok: false, reason: "domain-not-allowlisted" };
    }
    const pinnedSchoolId = allowed.get(domain) ?? null;

    // Resolve the target school. If the allow-list entry pinned a school_id,
    // use it exactly; otherwise the domain is explicitly trusted, so resolving
    // the (single-tenant) seeded school by query is acceptable.
    let schoolId: string;
    if (pinnedSchoolId) {
      const { data: school, error: schoolErr } = await admin
        .from("schools")
        .select("id")
        .eq("id", pinnedSchoolId)
        .maybeSingle();
      if (schoolErr)
        return { ok: false, reason: `schools: ${schoolErr.message}` };
      if (!school)
        return {
          ok: false,
          reason: `allow-listed school_id not found: ${pinnedSchoolId}`,
        };
      schoolId = school.id as string;
    } else {
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
      schoolId = school.id as string;
    }

    // Resolve the active grade for that school.
    const { data: grade, error: gradeErr } = await admin
      .from("grade_levels")
      .select("id")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (gradeErr)
      return { ok: false, reason: `grade_levels: ${gradeErr.message}` };
    if (!grade)
      return { ok: false, reason: "no active grade_level (seed not applied)" };

    const gradeId = grade.id as string;
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
