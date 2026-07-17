// lib/subjects/index.ts — public surface for the per-course sharing seam.
//
// Exposes ONLY client-safe modules: the client facade (which routes to the server
// actions), the pure authorization mirror, and the pure row types/mapper. The
// server-only modules (source.ts → next/headers; actions.ts → 'use server') are
// imported directly by their server callers and deliberately NOT re-exported here,
// so a client component importing this barrel never pulls server code into its
// bundle.

export {
  subjectsClient,
  listSubjectsForGrade,
  listCourseSharing,
  shareCourse,
  unshareCourse,
} from "./client";

export {
  canShareCourse,
  canUnshareCourse,
  reclaimTargetId,
  type CourseScope,
  type ShareCourseContext,
  type UnshareCourseContext,
  type ShareDenyReason,
  type UnshareDenyReason,
  type Decision,
} from "./authz";

export {
  mapCourseRow,
  mapCourseSharingRow,
  resolveSubjectSlug,
  SUBJECT_ROW_COLUMNS,
  type CourseSummary,
  type SubjectRow,
  type CourseSharingRow,
  type CourseSharingState,
} from "./row";
