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
//   Format: comma-separated `domain:school_id` pairs, e.g.
//
//     ALLOWED_TEACHER_EMAIL_DOMAINS="school.edu.qa:550e8400-e29b-41d4-a716-446655440000"
//
//   • `domain:school_id`  → allow-listed AND pinned to that exact school. This
//                           is now the ONLY accepted form: every domain MUST
//                           name the tenant it belongs to.
//   • bare `domain`       → IGNORED (fails closed). The previous "bare domain →
//                           resolve the oldest school by created_at" fallback
//                           was a single-tenant assumption (violates CLAUDE.md's
//                           multi-tenant rule) and silently enrolled accounts
//                           into whichever school happened to be first. It is
//                           gone — there is NO guessed-school fallback.
//
//   ── ENV MIGRATION REQUIRED (breaking config change) ──────────────────────
//   If the live deploy currently sets a BARE domain (e.g.
//   `ALLOWED_TEACHER_EMAIL_DOMAINS="school.edu.qa"`), it MUST be updated to the
//   pinned form `"school.edu.qa:<school_uuid>"` BEFORE this change ships, or
//   EVERY teacher is locked out (provisioning fails closed with reason
//   `domain-not-pinned-to-school`). Look up the school UUID with
//   `select id, name, created_at from schools;` and set the secret on the
//   Cloudflare worker AND in `.env.local`.
//
//   If the env var is unset, OR the user's email domain is not in the list,
//   OR the matched entry has no `:school_id`, NO teacher/grade rows are created.
//   The function returns `{ ok: false, reason: … }` and RLS denies access. The
//   reason distinguishes "domain not listed at all" (`domain-not-allowlisted`)
//   from "listed but not pinned to a school" (`domain-not-pinned-to-school`) so
//   a lockout is diagnosable from logs.
//   Still multi-grade-ready (provisions onto the first active grade; multi-grade
//   assignment is a later admin concern, not auth-time) and idempotent for
//   already-provisioned users.
//
// **Privacy (CLAUDE.md §11.4):** writes only teacher identity columns derived
// from the auth user — never any student field.

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Provisioning mode (ultraplan §4 / Wave 1) ─────────────────────────────
//
// The app provisions a freshly-authenticated user one of two ways:
//
//   • "domain"     — TODAY'S behavior, verbatim: fail-closed enrollment into a
//                    tenant via the `ALLOWED_TEACHER_EMAIL_DOMAINS` allow-list
//                    (the school-first model). This is the DEFAULT and the only
//                    implemented path.
//   • "individual" — the teacher-first model (ultraplan): every signup gets its
//                    own private workspace. NOT IMPLEMENTED in Wave 1 — branched
//                    here as a fail-closed stub so the dispatch wiring exists
//                    before the real implementation lands (Wave 3).
//
// The mode is read ONCE through `provisioningMode()` (a typed reader, not
// scattered `process.env` reads) so the branch point is single + greppable.
// Unknown / unset / malformed → "domain", so the default deploy is unchanged.

export type ProvisioningMode = "domain" | "individual";

/**
 * Resolve the active provisioning mode from `process.env.PROVISIONING_MODE`.
 *
 * Only the exact lowercase token `"individual"` selects the individual model;
 * EVERYTHING else — unset, empty, mixed-case typo, garbage — resolves to
 * `"domain"`. Failing safe to the current behavior guarantees that a missing or
 * fat-fingered env var never silently flips a deploy into the (stubbed,
 * fail-closed) individual path.
 */
export function provisioningMode(): ProvisioningMode {
  return process.env.PROVISIONING_MODE === "individual"
    ? "individual"
    : "domain";
}

/**
 * Parse the email-domain allow-list env var into a domain→schoolId? map.
 *
 * Reads `ALLOWED_TEACHER_EMAIL_DOMAINS` (preferred) and falls back to the
 * legacy `CLAUDE_PROVISION_EMAIL_DOMAINS`. Format: comma-separated
 * `domain:school_id` entries. Domains are lower-cased and trimmed; a leading
 * `@` (if someone writes `@school.edu`) is stripped. Blank entries and entries
 * with an empty domain are ignored.
 *
 * A bare `domain` (no `:school_id`) is RETAINED in the map with a `null` value
 * rather than dropped — this lets the caller distinguish "domain not listed at
 * all" from "listed but not pinned to a school" and report the explicit
 * `domain-not-pinned-to-school` reason for the latter, so a misconfiguration
 * (e.g. an un-migrated bare-domain env var) is diagnosable from logs. Both
 * still FAIL CLOSED — a `null` (unpinned) entry never resolves to a school.
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
 * THE single provisioning entry point. Every auth path (Google GSI, OAuth code
 * callback, Claude bypass) calls this one function — fa68392 already converged
 * the three call sites onto it, and Wave 1 keeps that convergence: there is no
 * other provisioning hook (the middleware refreshes the session only; it does
 * NOT provision). Branch the provisioning STRATEGY here, behind
 * `provisioningMode()`, so the dispatch lives in exactly one place.
 *
 *   • "domain" (default)  → `ensureTeacherDomain` — the existing allow-list
 *                           behavior, byte-for-byte unchanged.
 *   • "individual"        → `ensureIndividualWorkspace` — Wave 3; a fail-closed
 *                           stub for now.
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
  if (provisioningMode() === "individual") {
    return ensureIndividualWorkspace(admin, user);
  }
  return ensureTeacherDomain(admin, user);
}

/**
 * Domain-allow-list provisioning — the school-first model and the DEFAULT.
 *
 * This is the original `ensureTeacherRecord` body, moved verbatim behind the
 * `provisioningMode()` dispatch above with ZERO logic change. In `"domain"`
 * mode (the default) the call path is identical to before Wave 1.
 *
 * Idempotently ensures the `teachers` + `teacher_grade_assignments` rows exist
 * for an authenticated auth user. Uses the service-role admin client.
 */
async function ensureTeacherDomain(
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
    // A domain MUST be pinned to a specific tenant. There is NO "guess the
    // oldest school" fallback — that was a single-tenant assumption (CLAUDE.md
    // multi-tenant rule) that silently enrolled accounts into whichever school
    // sorted first. A listed-but-unpinned domain fails closed with an explicit,
    // diagnosable reason (see the ENV MIGRATION note in the file header).
    if (!pinnedSchoolId) {
      return { ok: false, reason: "domain-not-pinned-to-school" };
    }

    // Resolve the target school by its pinned id, exactly.
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
    const schoolId = school.id as string;

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

    // ── Cross-tenant hardening ───────────────────────────────────────────────
    // Before writing anything, reject if this auth uid is already bound to a
    // DIFFERENT school, or already carries grade rows that belong to a different
    // school. A domain re-pin (or a malicious/buggy path) must never quietly
    // migrate an existing teacher across tenants or leave them straddling two.
    // Pure hardening — a correctly-configured single-tenant teacher has no
    // mismatched rows, so this never locks out a legitimate user.
    const { data: existingTeacher, error: existingTeacherErr } = await admin
      .from("teachers")
      .select("id, school_id, default_grade_level_id")
      .eq("id", user.id)
      .maybeSingle();
    if (existingTeacherErr)
      return {
        ok: false,
        reason: `teachers(existing): ${existingTeacherErr.message}`,
      };
    if (existingTeacher?.school_id && existingTeacher.school_id !== schoolId) {
      return { ok: false, reason: "existing teacher school mismatch" };
    }

    // Validate that every existing grade assignment AND the existing
    // default_grade_level_id belongs to the resolved school.
    const { data: assignments, error: assignmentsErr } = await admin
      .from("teacher_grade_assignments")
      .select("grade_level_id")
      .eq("teacher_id", user.id);
    if (assignmentsErr)
      return {
        ok: false,
        reason: `teacher_grade_assignments(existing): ${assignmentsErr.message}`,
      };

    const gradeIdsToValidate = new Set<string>();
    for (const assignment of assignments ?? []) {
      if (assignment.grade_level_id) {
        gradeIdsToValidate.add(assignment.grade_level_id as string);
      }
    }
    if (existingTeacher?.default_grade_level_id) {
      gradeIdsToValidate.add(existingTeacher.default_grade_level_id as string);
    }

    if (gradeIdsToValidate.size > 0) {
      const gradeIds = [...gradeIdsToValidate];
      const { data: existingGrades, error: existingGradesErr } = await admin
        .from("grade_levels")
        .select("id, school_id")
        .in("id", gradeIds);
      if (existingGradesErr)
        return {
          ok: false,
          reason: `grade_levels(existing): ${existingGradesErr.message}`,
        };
      const schoolByGrade = new Map(
        (existingGrades ?? []).map((row) => [
          row.id as string,
          row.school_id as string,
        ]),
      );
      for (const existingGradeId of gradeIds) {
        // Unknown grade id (not found) OR a grade in another school → mismatch.
        if (schoolByGrade.get(existingGradeId) !== schoolId) {
          return {
            ok: false,
            reason: "existing grade assignment school mismatch",
          };
        }
      }
    }

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

    // Re-verify after the upsert (provisioning atomicity). The upsert uses
    // ignoreDuplicates, so under a CONCURRENT first-provision for the same uid
    // the loser's write is a no-op against the winner's row — and the pre-write
    // cross-tenant check above can't see a row the racing request hasn't
    // committed yet. Re-read the persisted teacher and confirm it is bound to
    // the school we resolved BEFORE attaching any grade assignment, so a race
    // during a domain re-pin can never bind an assignment to the wrong tenant.
    const { data: persistedTeacher, error: persistedErr } = await admin
      .from("teachers")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (persistedErr)
      return { ok: false, reason: `teachers(verify): ${persistedErr.message}` };
    if (!persistedTeacher)
      return { ok: false, reason: "teachers(verify): row missing after upsert" };
    if (persistedTeacher.school_id !== schoolId)
      return { ok: false, reason: "existing teacher school mismatch" };

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

/**
 * Individual (teacher-first) provisioning — the lockout-free path (ultraplan
 * Wave 3, §2/§5).
 *
 * When `PROVISIONING_MODE="individual"`, every fresh signup lands in its OWN
 * private workspace with NO domain check and NO shared-tenant lookup: a hidden
 * per-team `schools` row + an active grade + the 8 locked subjects + a personal
 * `school_years` row + a `teachers` row (id = auth uid) + a lead
 * `teacher_grade_assignments` row + self `subject_team_memberships`
 * (`can_edit_master=true`, so "solo = Master") + a `teams` row owned by the user
 * + the owner's `team_memberships` seat.
 *
 * ── Atomicity + idempotency live in the DB. ──
 * All of the above is performed by the `provision_individual_workspace` RPC
 * (migration 20260606130000) inside a SINGLE transaction: a partial failure
 * rolls back every insert (no orphan rows), and a re-run / double signup is a
 * no-op that returns the existing workspace (the RPC guards on an already-owned
 * team). This wrapper therefore stays thin — it just invokes the RPC with the
 * service-role admin client (required: the user has no `teachers` row yet, so it
 * cannot write any RLS-gated row itself) and maps the result.
 *
 * Never throws — returns `{ ok: false, reason }` on any failure, matching
 * `ensureTeacherDomain`, so a failed provision degrades to denied/empty data
 * rather than blocking login.
 */
export async function ensureIndividualWorkspace(
  admin: SupabaseClient,
  user: AuthUserLike,
): Promise<EnsureTeacherResult> {
  if (!user?.id) return { ok: false, reason: "missing auth user id" };

  try {
    // ── Already provisioned? Return early; do NOT call the provisioning RPC. ──
    // provision_individual_workspace is fail-closed (guard #2): for ANY existing
    // teachers row that does not OWN a team — i.e. every INVITED member and every
    // backfilled non-owner teammate — it RAISES. Calling it on each sign-in would
    // surface that raise as a hard, fail-closed login failure and lock teammates
    // out. An existing teachers row means the account is already set up (owner OR
    // member); resolve the grade to land on and return. The RPC is reserved for
    // brand-new accounts (no teachers row yet).
    const { data: existing, error: existingErr } = await admin
      .from("teachers")
      .select("default_grade_level_id")
      .eq("id", user.id)
      .maybeSingle();
    if (existingErr) {
      return {
        ok: false,
        reason: `ensureIndividualWorkspace: teacher lookup failed: ${existingErr.message}`,
      };
    }
    if (existing) {
      // Land on the teacher's default grade if set, else any grade they are
      // assigned to (an invited member always holds a TGA from redeem/backfill;
      // the owner holds one from provisioning/backfill).
      let gradeLevelId =
        ((existing as Record<string, unknown>).default_grade_level_id as
          | string
          | null
          | undefined) ?? undefined;
      if (!gradeLevelId) {
        const { data: tga, error: tgaErr } = await admin
          .from("teacher_grade_assignments")
          .select("grade_level_id")
          .eq("teacher_id", user.id)
          .limit(1)
          .maybeSingle();
        // Distinguish a transient read failure from the genuine "no grade" end
        // state below, so a one-off denial is diagnosable in logs (audit Low).
        if (tgaErr) {
          return {
            ok: false,
            reason: `ensureIndividualWorkspace: grade lookup failed: ${tgaErr.message}`,
          };
        }
        gradeLevelId =
          ((tga as Record<string, unknown> | null)?.grade_level_id as
            | string
            | undefined) ?? undefined;
      }
      if (!gradeLevelId) {
        return {
          ok: false,
          reason: "ensureIndividualWorkspace: existing teacher has no grade",
        };
      }
      return { ok: true, teacherId: user.id, gradeLevelId };
    }

    const email = (user.email ?? "").trim();
    // Display name = email local-part (same derivation as the domain path); the
    // RPC clamps/falls back to "Teacher" if this is empty.
    const displayName = (email.split("@")[0] || "Teacher").slice(0, 120);

    // The RPC does ALL the work atomically + idempotently. It returns one row
    // ({ teacher_id, grade_level_id }) on success.
    const { data, error } = await admin.rpc("provision_individual_workspace", {
      p_uid: user.id,
      p_email: email,
      p_display_name: displayName,
    });
    if (error) {
      return {
        ok: false,
        reason: `provision_individual_workspace: ${error.message}`,
      };
    }

    // `returns table(...)` surfaces as an array of rows over PostgREST. Accept
    // either an array (take the first row) or a bare object, defensively.
    const row = Array.isArray(data) ? data[0] : data;
    const gradeLevelId =
      row && typeof row === "object"
        ? ((row as Record<string, unknown>).grade_level_id as
            | string
            | undefined)
        : undefined;

    // The teacher row is keyed to the auth uid; the grade comes from the RPC.
    // A successful RPC that returns no grade id is treated as a failure so a
    // caller never proceeds with a half-resolved workspace.
    if (!gradeLevelId) {
      return {
        ok: false,
        reason: "provision_individual_workspace: no grade returned",
      };
    }

    return { ok: true, teacherId: user.id, gradeLevelId };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
