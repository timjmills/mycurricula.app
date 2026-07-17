// lib/subjects/authz.ts — PURE authorization mirror for per-course sharing.
//
// The DB is the ENFORCEMENT point: share_course / unshare_course
// (supabase/migrations/20260717120000_course_sharing_rpcs.sql) are SECURITY
// DEFINER RPCs that re-check every rule server-side off auth.uid(). This module
// re-expresses those exact predicates as pure TypeScript so that:
//   1. the client can decide whether to SHOW a share/unshare affordance without a
//      round-trip (a denied action must still fail closed at the RPC — this is a
//      cosmetic gate only, never the security boundary), and
//   2. the authorization matrix is unit-testable in this repo, which has no DB
//      harness (see tests/course-sharing-rpcs.test.ts).
//
// KEEP IN LOCKSTEP with the SQL. If the RPC's authz / guards change, change these
// predicates in the same commit — a drift here is a lie to the UI, not a security
// hole (the RPC still enforces), but it will mis-gate affordances.

/** Whether a course is currently a shared TEAM course or a PERSONAL course. */
export type CourseScope = "team" | "personal";

/** Inputs the SHARE decision depends on — resolved server-side in the RPC, and
 *  resolvable client-side from the caller's session + the course row. */
export interface ShareCourseContext {
  /** The authenticated caller (auth.uid()). */
  callerId: string;
  /** The course's current scope. Only a `personal` course can be shared. */
  scope: CourseScope;
  /** The personal course's owner (subjects.owner_id). Null for a team course. */
  ownerId: string | null;
  /** is_school_admin(<the course's grade's school>) for the caller. */
  callerIsSchoolAdmin: boolean;
  /** can_read_grade(<the course's grade>) for the caller. */
  callerCanReadGrade: boolean;
}

/** Inputs the UNSHARE decision depends on. */
export interface UnshareCourseContext {
  /** The authenticated caller (auth.uid()). */
  callerId: string;
  /** The course's current scope. Only a `team` course can be unshared. */
  scope: CourseScope;
  /** subjects.shared_by_teacher_id — the CONTRIBUTOR (the personal owner at share
   *  time) the course reclaims to. The contributor may reclaim their own shared
   *  course. NULL only for founding/team-native courses (which the founding-lock
   *  guard rejects first) or when the contributor's account was removed. */
  sharedByTeacherId: string | null;
  /** is_school_admin(<the course's grade's school>) for the caller. */
  callerIsSchoolAdmin: boolean;
  /** subjects.shared_from_personal — true only for a course created by
   *  share_course. False for the 8 founding subjects and any never-shared team
   *  course → those can never be unshared. */
  sharedFromPersonal: boolean;
  /** The DISTINCT teacher ids with dependent content (a personal fork, an
   *  authored lesson, or a completion) on this course. The orphan guard blocks
   *  when any of these is NOT the reclaim target (see canUnshareCourse) — the
   *  reclaim target keeps visibility as the new owner, everyone else loses it. */
  contentTeacherIds: readonly string[];
}

/** Why a share/unshare is not permitted (stable codes for tests + UI copy). */
export type ShareDenyReason =
  | "not-authenticated"
  | "already-team"
  | "not-owner-or-admin"
  | "cannot-read-grade";

export type UnshareDenyReason =
  | "not-authenticated"
  | "not-team"
  | "founding-subject"
  | "not-contributor-or-admin"
  | "has-other-teacher-content";

export type Decision<R> = { allowed: true } | { allowed: false; reason: R };

const ALLOW = { allowed: true } as const;
function deny<R>(reason: R): { allowed: false; reason: R } {
  return { allowed: false, reason };
}

/** The teacher an unshare reclaims the course to: the contributor
 *  (shared_by_teacher_id), or the caller as a fallback ONLY when the
 *  contributor's account is gone. Mirrors the SQL's
 *  `v_target_owner := coalesce(v_shared_by, v_uid)`. */
export function reclaimTargetId(ctx: {
  callerId: string;
  sharedByTeacherId: string | null;
}): string {
  return ctx.sharedByTeacherId ?? ctx.callerId;
}

/**
 * Mirror of `share_course` (personal → team). Order matches the SQL's guard
 * order so the first-failing reason is identical to the RPC's raised error.
 */
export function canShareCourse(
  ctx: ShareCourseContext,
): Decision<ShareDenyReason> {
  if (!ctx.callerId) return deny<ShareDenyReason>("not-authenticated");
  // Only a personal course can be shared (an already-team course errors).
  if (ctx.scope !== "personal") return deny<ShareDenyReason>("already-team");
  // Capability: the course's owner OR a workspace admin.
  const isOwner = ctx.ownerId != null && ctx.ownerId === ctx.callerId;
  if (!(isOwner || ctx.callerIsSchoolAdmin)) {
    return deny<ShareDenyReason>("not-owner-or-admin");
  }
  // Cannot share into a grade the caller cannot read.
  if (!ctx.callerCanReadGrade)
    return deny<ShareDenyReason>("cannot-read-grade");
  return ALLOW;
}

/**
 * Mirror of `unshare_course` (team → personal). Order matches the SQL: team →
 * founding-lock → capability → orphan guard.
 */
export function canUnshareCourse(
  ctx: UnshareCourseContext,
): Decision<UnshareDenyReason> {
  if (!ctx.callerId) return deny<UnshareDenyReason>("not-authenticated");
  // Only a team course can be unshared.
  if (ctx.scope !== "team") return deny<UnshareDenyReason>("not-team");
  // Founding-lock: only a course that originated from a personal share is
  // reclaimable. The 8 founding subjects carry shared_from_personal=false.
  if (!ctx.sharedFromPersonal) {
    return deny<UnshareDenyReason>("founding-subject");
  }
  // Capability: the CONTRIBUTOR (shared_by_teacher_id) OR a workspace admin. The
  // contributor may reclaim their own shared course; an admin may too (and it
  // still returns to the contributor).
  const isContributor =
    ctx.sharedByTeacherId != null && ctx.sharedByTeacherId === ctx.callerId;
  if (!(isContributor || ctx.callerIsSchoolAdmin)) {
    return deny<UnshareDenyReason>("not-contributor-or-admin");
  }
  // Orphan guard: refuse when any teacher OTHER THAN THE RECLAIM TARGET has
  // dependent content. The target keeps visibility (they become owner) so their
  // rows never orphan; everyone else — INCLUDING an admin caller who reclaims to
  // someone else — loses visibility and would orphan. Excludes the target, NOT
  // the caller (Codex R1 C).
  const target = reclaimTargetId(ctx);
  if (ctx.contentTeacherIds.some((id) => id !== target)) {
    return deny<UnshareDenyReason>("has-other-teacher-content");
  }
  return ALLOW;
}
