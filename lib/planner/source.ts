// lib/planner/source.ts — the PLANNER data-source contract (Wave A, the frozen
// boundary). Mirrors the Teach seam (lib/teach/queries.ts): one async interface
// that both the in-memory mock and the Supabase-backed implementation satisfy,
// so the planner store hydrates + persists through one shape and the backend is
// a single auditable switch.
//
// SCOPE: lessons + units + subjects + standards + per-lesson sections/resources.
// Grade-scoped + owner/RLS-scoped on every read (multi-grade-ready — no single-
// grade assumption). PRIVACY (§11.4): planner rows carry STRUCTURE only, never
// student names.
//
// FORKING (CLAUDE.md §2): the source owns lazy personal forks — an edit in
// personal mode writes a personal copy row; reads resolve personal over master.
// The reducer store stays unaware; its `isPersonal`/`modified`/`pendingMaster`
// flags map to/from the copies table inside the source.

import type {
  Lesson,
  LessonStatus,
  LessonResource,
  StandardsMap,
  Subject,
  Unit,
} from "../types";
import type { LessonSectionContent } from "../lesson-flow";

/** Optional windowing for `listLessons`. All fields optional; omitting the
 *  whole object preserves the original full-grade read (backward-compatible). */
export interface ListLessonsOptions {
  /** Scope master/authored lessons to one school year (uuid). */
  schoolYearId?: string;
  /** Lower bound (inclusive) on `week_number`. */
  weekStart?: number;
  /** Upper bound (inclusive) on `week_number`. */
  weekEnd?: number;
}

/** Identity for a lesson move (mirrors the reducer's moveLesson args). */
export interface LessonMoveTarget {
  week: number;
  /** Day index, 0 = Sunday … 4 = Thursday (configured-week relative). */
  day: number;
}

/**
 * Where a mutation should land (CLAUDE.md §2 — the forking model). OPTIONAL on
 * every mutator that accepts it; defaults to "personal" so existing callers
 * (which never pass it) keep the current lazy-fork behavior unchanged.
 *
 * • "personal" — the default. An edit lazily forks a personal copy (or edits the
 *   teacher's own authored lesson); the shared master/team row is never touched.
 * • "core" — an AUTHORIZED Team/Master write. The mutator writes the MASTER /
 *   shared-team row instead of forking. Authorization is enforced server-side by
 *   RLS (`can_edit_subject_master`); on an RLS denial the mutator THROWS — it
 *   must NEVER silently fall back to a personal fork (#14: no false success).
 */
export type SaveTarget = "personal" | "core";

/** The fields a lesson edit can patch. A subset of `Lesson` — the content +
 *  flags the reducer mutates. The source decides whether the patch forks. */
export type LessonPatch = Partial<
  Pick<
    Lesson,
    | "title"
    | "objective"
    | "preview"
    | "directions"
    | "notes"
    | "resources"
    | "standards"
    | "time"
    | "status"
    | "reasonNotDone"
    | "tasks"
  >
>;

/**
 * The planner repository contract. Every method is async so the mock and the
 * Supabase implementation share one signature — the store awaits both
 * identically.
 */
export interface PlannerDataSource {
  // ── Reads (hydrate the document) ───────────────────────────────────────────
  /** Resolve the teacher's active grade uuid — `teachers.default_grade_level_id`
   *  first, else the first row in `teacher_grade_assignments`. Lets a caller
   *  hydrate without already knowing the grade. Mock returns the single grade. */
  getActiveGradeLevelId(ownerId: string): Promise<string | null>;
  /** All lessons a teacher sees for a grade: personal forks resolved over
   *  master, soft-deletes excluded (plan §4.3).
   *
   *  `opts` is OPTIONAL and backward-compatible — omitting it reads the full
   *  grade exactly as before. When supplied it narrows the read:
   *    • `schoolYearId` scopes master/authored lessons to one school year.
   *    • `weekStart`/`weekEnd` clamp the read to a `week_number` window.
   *  The mock source ignores `opts` (single in-memory grade). */
  listLessons(
    gradeLevelId: string,
    ownerId: string,
    opts?: ListLessonsOptions,
  ): Promise<Lesson[]>;
  /** Units for a grade, in display order. */
  listUnits(gradeLevelId: string): Promise<Unit[]>;
  /** The 8 locked subjects for a grade. */
  listSubjects(gradeLevelId: string): Promise<Subject[]>;
  /** Standards (code → description) for a grade's assigned frameworks. */
  listStandards(gradeLevelId: string): Promise<StandardsMap>;
  /** The editable section content for one lesson (heading/body/resources),
   *  personal-fork-resolved when `ownerId` is supplied. */
  getSections(
    lessonId: string,
    ownerId?: string,
  ): Promise<LessonSectionContent[]>;
  /** Batched section hydrate — one call seeds every lesson's sections, keyed by
   *  lesson id. Kills the per-lesson N+1 at document-load time. Lessons with no
   *  persisted sections are omitted (callers fall back to `getSections`). */
  getSectionsBatch(
    lessonIds: string[],
    ownerId: string,
  ): Promise<Record<string, LessonSectionContent[]>>;

  // ── Lesson mutations (the reducer commits through these) ───────────────────
  /** Patch a lesson's content/flags. In personal mode this lazily forks
   *  (writes a personal copy); in master mode it edits the master.
   *
   *  `saveTarget` (OPTIONAL, default "personal") selects the destination: omit
   *  it (or pass "personal") for the existing lazy-fork behavior; pass "core" to
   *  write the MASTER row (authorized Team-Curriculum edit, RLS-gated). */
  updateLesson(
    lessonId: string,
    patch: LessonPatch,
    ownerId: string,
    saveTarget?: SaveTarget,
  ): Promise<Lesson>;
  /** Move a lesson to a new week/day slot. `saveTarget` as in `updateLesson`
   *  ("core" moves the master row instead of forking; default "personal"). */
  moveLesson(
    lessonId: string,
    target: LessonMoveTarget,
    ownerId: string,
    saveTarget?: SaveTarget,
  ): Promise<Lesson>;
  /** Set completion status. Completion NEVER forks (CLAUDE.md §2) — so
   *  `saveTarget` is accepted for signature parity but is intentionally inert:
   *  completion is always per-teacher and never writes the master row. */
  setLessonStatus(
    lessonId: string,
    status: LessonStatus,
    ownerId: string,
    saveTarget?: SaveTarget,
  ): Promise<Lesson>;
  /** Create a teacher's own (personal) lesson in a slot. `gradeLevelId` is the
   *  RESOLVED grade uuid the row is keyed on (the Supabase source needs a real
   *  uuid for `personal_authored_lessons.grade_level_id`); it defaults to
   *  `input.gradeLevelId` when omitted so existing callers keep working. */
  createLesson(
    input: {
      gradeLevelId: string;
      subject: Lesson["subject"];
      unit: string;
      week: number;
      day: number;
      title: string;
    },
    ownerId: string,
    gradeLevelId?: string,
  ): Promise<Lesson>;
  /** Soft-delete a lesson — PERSONAL-scoped (§4.6). For a master-derived lesson
   *  the owner's personal copy is archived (lazy-forked if absent); a
   *  teacher-authored lesson sets its own `deleted_at`. The shared master row is
   *  NEVER mutated. */
  softDeleteLesson(lessonId: string, ownerId: string): Promise<void>;

  // ── Section + resource mutations ───────────────────────────────────────────
  /** Replace a lesson's full section list (reorder / bulk edit). `saveTarget`
   *  (OPTIONAL, default "personal") as in `updateLesson`: "core" writes the
   *  shared team section rows (owner_id null) instead of the teacher's personal
   *  fork, RLS-gated. */
  setSections(
    lessonId: string,
    sections: LessonSectionContent[],
    ownerId: string,
    saveTarget?: SaveTarget,
  ): Promise<LessonSectionContent[]>;
  /** Add a resource to a section. */
  addSectionResource(
    lessonId: string,
    sectionId: string,
    resource: LessonResource,
    ownerId: string,
  ): Promise<LessonSectionContent[]>;
  /** Remove a resource from a section. */
  removeSectionResource(
    lessonId: string,
    sectionId: string,
    resourceId: string,
    ownerId: string,
  ): Promise<LessonSectionContent[]>;
}

/**
 * True when the planner should persist to Supabase. Defaults OFF: the prototype
 * renders against the in-memory mock. Opt in with
 * `NEXT_PUBLIC_PLANNER_USE_SUPABASE=1` (set alongside a real Supabase project,
 * or a local stack). Kept separate from the Teach flag so each surface can be
 * cut over independently.
 */
export function isPlannerSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.length === 0) return false;
  return process.env.NEXT_PUBLIC_PLANNER_USE_SUPABASE === "1";
}
