// lib/subjects/client.ts — the CLIENT-SIDE facade for the per-course sharing seam.
//
// UI (client components) import from here ONLY — never the server-only source.
// Each method calls its explicit server action and unwraps the discriminated
// envelope: on success it returns the value; on an operational failure it throws a
// real Error carrying the friendly, client-safe message the action chose. This is
// the single import site the phase-ii planner view adoption will consume.

import {
  listCourseSharingAction,
  listSubjectsForGradeAction,
  shareCourseAction,
  unshareCourseAction,
} from "./actions";
import type { CourseSharingState, CourseSummary } from "./row";

/** List every course in a grade the caller can see (no contributor identity). */
export async function listSubjectsForGrade(
  gradeLevelId: string,
): Promise<CourseSummary[]> {
  const res = await listSubjectsForGradeAction(gradeLevelId);
  if (!res.ok) throw new Error(res.error.message);
  return res.value;
}

/** Manage-sharing view: sharing state + affordance flags for courses the caller
 *  may manage in a grade. Contributor identity is gated server-side. */
export async function listCourseSharing(
  gradeLevelId: string,
): Promise<CourseSharingState[]> {
  const res = await listCourseSharingAction(gradeLevelId);
  if (!res.ok) throw new Error(res.error.message);
  return res.value;
}

/** Share a personal course with the team (personal → team). */
export async function shareCourse(subjectId: string): Promise<void> {
  const res = await shareCourseAction(subjectId);
  if (!res.ok) throw new Error(res.error.message);
}

/** Reclaim a shared course back to personal (team → personal). */
export async function unshareCourse(subjectId: string): Promise<void> {
  const res = await unshareCourseAction(subjectId);
  if (!res.ok) throw new Error(res.error.message);
}

/** Grouped facade for ergonomic imports (`subjectsClient.shareCourse(…)`). */
export const subjectsClient = {
  listSubjectsForGrade,
  listCourseSharing,
  shareCourse,
  unshareCourse,
};
