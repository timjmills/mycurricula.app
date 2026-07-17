// lib/subjects/row.ts — PURE row shapes + mappers for the subjects (course) seam.
//
// No server imports: this module is safe to load anywhere (client, tests) and
// carries the DB-row → domain mappings so they are unit-testable without a
// database. The server source (lib/subjects/source.ts) selects SUBJECT_ROW_COLUMNS
// and maps each row with mapCourseRow; the manage-sharing view maps the
// list_course_sharing RPC rows with mapCourseSharingRow.
//
// CONTRIBUTOR-IDENTITY LEAST PRIVILEGE (Codex R1 M): the ordinary grade course
// list (CourseSummary / SUBJECT_ROW_COLUMNS) deliberately carries NO provenance —
// not shared_by_teacher_id and not shared_from_personal — so a plain teammate
// never learns who contributed a shared course. Provenance lives ONLY on
// CourseSharingState, populated by the gated list_course_sharing RPC.

import type { SubjectId } from "../types";
import { SUBJECTS } from "../mock/subjects";
import type { CourseScope } from "./authz";

/** The locked team-wide subject slugs (math, reading, …). A subjects row stores
 *  its stable slug in `color` (per the schema comment), which the palette bridge
 *  / `.cp-subj.<slug>` classes resolve. */
const SUBJECT_IDS = new Set<string>(SUBJECTS.map((s) => s.id));

/** A `subjects` row for the ordinary grade list — NO provenance columns. */
export interface SubjectRow {
  id: string;
  grade_level_id: string;
  name: string;
  color: string; // stable slug ('math', 'reading', …)
  parent_id: string | null;
  display_order: number;
  scope: CourseScope;
  owner_id: string | null;
}

/** A course as the ordinary grade list exposes it (no contributor identity). */
export interface CourseSummary {
  id: string;
  gradeLevelId: string;
  name: string;
  /** Resolved subject slug (drives color / cp-subj classes). */
  subjectId: SubjectId;
  parentId: string | null;
  displayOrder: number;
  scope: CourseScope;
  /** subjects.owner_id — the owning teacher for a personal course; null for team.
   *  Under RLS a reader only ever sees their OWN personal course, so this never
   *  reveals another teacher's ownership. */
  ownerId: string | null;
}

/** The exact column list the ordinary source selects — provenance excluded. */
export const SUBJECT_ROW_COLUMNS =
  "id, grade_level_id, name, color, parent_id, display_order, scope, owner_id";

/** Resolve a row's `color` slug to a locked SubjectId, defaulting to `math` when
 *  the slug is unexpectedly outside the locked set (flagged upstream at import). */
export function resolveSubjectSlug(color: string): SubjectId {
  return (SUBJECT_IDS.has(color) ? color : "math") as SubjectId;
}

/** Map a `subjects` DB row to a CourseSummary. Pure. */
export function mapCourseRow(row: SubjectRow): CourseSummary {
  return {
    id: row.id,
    gradeLevelId: row.grade_level_id,
    name: row.name,
    subjectId: resolveSubjectSlug(row.color),
    parentId: row.parent_id,
    displayOrder: row.display_order,
    scope: row.scope,
    ownerId: row.owner_id,
  };
}

// ── Manage-sharing view (gated list_course_sharing RPC) ─────────────────────

/** A `list_course_sharing` RPC result row — returned ONLY for courses the caller
 *  may manage, so its contributor identity is never leaked to a non-manager. */
export interface CourseSharingRow {
  subject_id: string;
  scope: CourseScope;
  shared_from_personal: boolean;
  shared_by_teacher_id: string | null;
  shared_by_name: string | null;
  can_share: boolean;
  can_unshare: boolean;
}

/** The manage-sharing state the UI affordance consumes. Provenance-bearing. */
export interface CourseSharingState {
  subjectId: string;
  scope: CourseScope;
  /** True for a team course that came from a personal share (→ reclaimable). */
  sharedFromPersonal: boolean;
  /** The contributor a shared course reclaims to; null for founding/team-native. */
  sharedByTeacherId: string | null;
  /** The contributor's display name (for the manage UI), when known. */
  sharedByName: string | null;
  /** Whether the caller may share this (personal) course. */
  canShare: boolean;
  /** Whether the caller may unshare this (team) course — scope + founding-lock +
   *  capability only; the content orphan-block is evaluated at unshare time. */
  canUnshare: boolean;
}

/** Map a `list_course_sharing` RPC row to CourseSharingState. Pure. */
export function mapCourseSharingRow(row: CourseSharingRow): CourseSharingState {
  return {
    subjectId: row.subject_id,
    scope: row.scope,
    sharedFromPersonal: row.shared_from_personal,
    sharedByTeacherId: row.shared_by_teacher_id,
    sharedByName: row.shared_by_name,
    canShare: row.can_share,
    canUnshare: row.can_unshare,
  };
}
