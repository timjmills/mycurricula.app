// lib/subjects/source.ts — the SERVER-side subjects (course) data source.
//
// Reads go through the per-request server client under Row-Level Security
// (subjects_read does the visibility filtering — team courses to the whole grade,
// personal courses to their owner, leads see all — so this makes NO scope filter,
// unlike the planner's team-only subject read). Writes go through the SECURITY
// DEFINER share_course / unshare_course RPCs
// (supabase/migrations/20260717120000_course_sharing_rpcs.sql), which own all
// authorization, the cross-tenant workspace pin, the founding-lock + orphan
// guards, and the audit rows — this layer never re-implements any of that, it
// just calls the RPC and surfaces the error.
//
// The client is INJECTED (not imported), so these functions are pure w.r.t. the
// request context and unit-testable with a stub client; the server action
// (lib/subjects/actions.ts) resolves the real per-request client and passes it.
// PRIVACY (§11.4): course rows carry STRUCTURE only (name / slug / scope), never
// student names.

import { makeUnwrap, type ServerClient } from "../supabase/helpers";
import {
  mapCourseRow,
  mapCourseSharingRow,
  SUBJECT_ROW_COLUMNS,
  type CourseSharingRow,
  type CourseSharingState,
  type CourseSummary,
  type SubjectRow,
} from "./row";

const unwrap = makeUnwrap("Subjects repository");

/**
 * List every course in `gradeLevelId` the CALLER can see. RLS filters; results
 * are ordered by display_order. Grade-scoped (multi-grade-ready — no single-grade
 * assumption). Carries NO contributor identity (see row.ts / list_course_sharing).
 */
export async function listSubjectsForGrade(
  client: ServerClient,
  gradeLevelId: string,
): Promise<CourseSummary[]> {
  const res = await client
    .from("subjects")
    .select(SUBJECT_ROW_COLUMNS)
    .eq("grade_level_id", gradeLevelId)
    .order("display_order", { ascending: true });
  const rows = unwrap(res, "list subjects for grade") as SubjectRow[];
  return rows.map(mapCourseRow);
}

/**
 * Manage-sharing view: the sharing state (incl. contributor identity + the
 * can_share / can_unshare affordance flags) for the courses in `gradeLevelId` the
 * caller may MANAGE. Backed by the gated list_course_sharing RPC, which returns a
 * row only for the caller's own personal courses, their own contributed courses,
 * or — for a workspace admin — every course; a non-manager never receives another
 * teacher's contributor id.
 */
export async function listCourseSharing(
  client: ServerClient,
  gradeLevelId: string,
): Promise<CourseSharingState[]> {
  const { data, error } = await client.rpc("list_course_sharing", {
    p_grade_level_id: gradeLevelId,
  });
  if (error) {
    throw new Error(
      `Subjects repository list course sharing failed: ${error.message}`,
    );
  }
  return ((data ?? []) as CourseSharingRow[]).map(mapCourseSharingRow);
}

/**
 * Share a personal course with the team (personal → team). All rules are enforced
 * by the share_course RPC; a thrown error carries the RPC's message (redacted to a
 * generic string by the action layer for the client).
 */
export async function shareCourse(
  client: ServerClient,
  subjectId: string,
): Promise<void> {
  const { error } = await client.rpc("share_course", {
    p_subject_id: subjectId,
  });
  if (error) {
    throw new Error(
      `Subjects repository share course failed: ${error.message}`,
    );
  }
}

/**
 * Reclaim a shared course back to personal (team → personal). All rules
 * (founding-lock, orphan guard, authz) are enforced by the unshare_course RPC.
 */
export async function unshareCourse(
  client: ServerClient,
  subjectId: string,
): Promise<void> {
  const { error } = await client.rpc("unshare_course", {
    p_subject_id: subjectId,
  });
  if (error) {
    throw new Error(
      `Subjects repository unshare course failed: ${error.message}`,
    );
  }
}
