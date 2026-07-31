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
  UnitAssessment,
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
 *  flags the reducer mutates. The source decides whether the patch forks.
 *
 *  B2 (migration 20260728120000) widens this with the Track-B rich lesson
 *  fields — every one is CONTENT (each forks in Personal mode / writes master in
 *  Team mode, exactly like `differentiation`). `taughtAt` is DELIBERATELY absent:
 *  it is READ-ONLY in B2 ("Mark taught" stays on the status/`setLessonStatus`
 *  path — writing `taught_at` on a pristine master lesson would fork it,
 *  violating the completion-never-forks rule, CLAUDE.md §2). */
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
    | "standardIds"
    | "time"
    | "status"
    | "reasonNotDone"
    | "tasks"
    | "differentiation"
    // ── Track-B rich lesson fields (B2) — all content, all fork-per-field ──
    | "durationMinutes"
    | "assessment"
    | "builds"
    | "prep"
    | "frameworkId"
    | "frameworkData"
    | "carried"
  >
>;

/**
 * The editable Track-B workspace fields on a unit (migration 20260728120000 —
 * the B1.7 Unit Plan editor), plus the unit's WEEK RANGE. A subset of `Unit`:
 * the identity fields (id / subject / name / shade) are NOT patchable through
 * this seam.
 *
 * ── THE SCHEDULING FIELDS ARE NOW PATCHABLE, AND THAT IS A REVERSAL ────────
 * This comment previously read "the identity + scheduling fields (… weeks /
 * start_week / end_week) are NOT patchable through this seam", and that was
 * accurate for every consumer up to the Plan timeline: the Unit Plan editor
 * writes content, and a unit's schedule was moved only by whatever created it.
 * The timeline's band drag is the first surface whose entire purpose is to
 * change WHEN a unit is taught, so the allowlist had to open — a `Pick`
 * allowlist that a caller cannot widen is exactly the seam that would
 * otherwise have been worked around with a second, unaudited write path.
 *
 * `startWeek` / `endWeek` are the numbers that are actually stored
 * (`units.start_week` / `end_week`, NOT NULL since
 * 20260518102823_initial_schema.sql:351-352), and they are validated as a PAIR
 * — see `assertUnitWeekPatch`.
 *
 * `Unit.weeks` — the display collapse ("Wk 9–14") — is deliberately NOT
 * patchable. It is DERIVED from the two numbers, and letting a caller supply
 * it independently means a caller can supply one that disagrees with them: the
 * Supabase source would drop the label and re-derive it while the mock stored
 * it verbatim, so the two paths would disagree about the same write. Both
 * sources now derive it through `unitWeeksLabel` below, which removes the
 * divergence rather than validating around it. The store is confirm-only — the
 * catalog is updated from the source's returned row, never from the patch — so
 * nothing needs the label to travel.
 *
 * What this does NOT open: DAY-granularity scheduling. `units.anchor_slot` /
 * `position` and `lessons.pad` / `stack` stay deferred
 * (20260728120000_track_b_workspace_fields.sql:36-42), whose note warns they
 * would "run two scheduling vocabularies in parallel". Moving a unit's week
 * range also does not move its LESSONS — see lib/plan-timeline/drag.ts.
 *
 * The authorization story is unchanged, and it is why this widening is safe to
 * make here rather than needing a new seam: a unit is TEAM content with one
 * shared row, so a schedule change is gated by exactly the same `units_write`
 * RLS predicate as a notes change, and an unauthorized caller gets the same
 * server-side zero-row denial.
 *
 * UNLIKE `LessonPatch`, a unit edit takes NO `SaveTarget`: units are TEAM /
 * MASTER content with no personal-fork table — there is one shared units row per
 * unit, and `units_write` RLS gates the write to a subject-master or grade-lead
 * (initial_schema.sql: `can_edit_subject_master(subject_id) OR
 * is_grade_lead(grade_level_id)`). A teacher who lacks that role has the write
 * denied server-side (0 rows) and the mutator throws — never a silent
 * personal fork (there is nothing to fork into).
 */
export type UnitPatch = Partial<
  Pick<
    Unit,
    | "notes"
    | "bigIdea"
    | "essentialQuestions"
    | "vocab"
    | "kud"
    | "standardIds"
    | "framework"
    | "frameworkData"
    | "customFields"
    | "carried"
    | "defaultFlow"
    | "defaultDuration"
    | "archived"
    // ── Week range (the Plan timeline's band drag) — see the note above ──
    | "startWeek"
    | "endWeek"
  >
>;

/**
 * The `Unit.weeks` display label for a week range.
 *
 * ONE formatter, exported from the seam both sources import, because three
 * places have to agree on it character for character: the Supabase read mapper
 * (`mapUnitRow`), the mock source (which has no read mapper and must derive it
 * itself), and the timeline's band tooltip. A one-character difference — a
 * hyphen where the EN DASH belongs — makes a unit card visibly flicker between
 * two spellings on every successful write, and breaks
 * `lib/plan-timeline/bands.ts:unitWeekRange`'s fallback parser, which is the
 * only path for any unit whose numeric fields are absent.
 */
export function unitWeeksLabel(start: number, end: number): string {
  return start === end ? `Wk ${start}` : `Wk ${start}–${end}`;
}

/**
 * Validate a patch's week range. Throws; call BEFORE any write.
 *
 * ── WHY THE SEAM VALIDATES AND NOT JUST THE CALLER ────────────────────────
 * `UnitPatch` is a public write seam, not a private argument of the timeline's
 * drag. The drag happens to produce only well-formed ranges (see
 * lib/plan-timeline/drag.ts, whose `normalise` cannot emit a reversed one),
 * but the type now permits any caller to send `{ startWeek: 20 }` on a unit
 * whose `end_week` is 5 — and the result is a unit whose band renders
 * inside-out, whose `unitWeekRange` silently swaps the ends, and whose pacing
 * maths runs against a negative duration. That is shared TEAM content, so one
 * bad caller corrupts the schedule every teacher sees.
 *
 * TWO RULES, and the first is the one that makes the second enforceable:
 *
 *   1. BOTH ENDS TOGETHER. A patch carrying one week key without the other is
 *      rejected. Validating a single end would require reading the current row
 *      first — a round trip, and a race with any concurrent write between the
 *      read and the update. Demanding the pair makes the patch self-describing
 *      and the check local. Every real caller already has both.
 *   2. `start <= end`, and both positive integers. The columns are NOT NULL
 *      integers, so a fractional or non-positive value is a constraint
 *      violation that would fail the WHOLE statement — taking the content keys
 *      travelling in the same patch down with it.
 *
 * A database `CHECK (start_week <= end_week)` would be the belt to this
 * braces and is worth adding; it needs a migration, which is not this seam's
 * to write.
 */
/**
 * The keys that make up a unit's schedule, as ONE logical field.
 *
 * `startWeek` and `endWeek` are validated as a pair (see
 * `assertUnitWeekPatch`), so any per-key operation that can drop one of them
 * must drop both or produce something the write seam will refuse. Exported so
 * the rule lives next to the invariant it protects rather than being
 * re-derived at each callsite.
 */
export const UNIT_WEEK_KEYS = ["startWeek", "endWeek"] as const;

/**
 * Given a set of patch keys being dropped, return the set actually to drop.
 *
 * The failed-write retry (`planner-store.tsx:retryFailedUnitWrite`) drops
 * individual keys whose team value has moved since the failure. Applied
 * key-by-key to the schedule that produces `{ startWeek }` without `endWeek` —
 * a patch `assertUnitWeekPatch` will refuse, which strands the retry
 * permanently in a state that can never succeed. Dropping the whole schedule
 * together is the honest resolution: the team's weeks have moved on, so the
 * teacher's stale week range is exactly what must not be re-sent.
 */
export function expandStaleUnitKeys(
  stale: readonly (keyof UnitPatch)[],
): (keyof UnitPatch)[] {
  const set = new Set<keyof UnitPatch>(stale);
  if (UNIT_WEEK_KEYS.some((k) => set.has(k))) {
    for (const k of UNIT_WEEK_KEYS) set.add(k);
  }
  return [...set];
}

export function assertUnitWeekPatch(patch: UnitPatch): void {
  const hasStart = patch.startWeek !== undefined;
  const hasEnd = patch.endWeek !== undefined;
  if (!hasStart && !hasEnd) return;
  if (hasStart !== hasEnd) {
    throw new Error(
      "updateUnitFields: startWeek and endWeek must be patched together — a single end cannot be validated without reading the row it is being compared against",
    );
  }
  const start = patch.startWeek as number;
  const end = patch.endWeek as number;
  for (const [field, value] of [
    ["startWeek", start],
    ["endWeek", end],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(
        `updateUnitFields: ${field} must be a positive integer week, got ${value}`,
      );
    }
  }
  if (start > end) {
    throw new Error(
      `updateUnitFields: startWeek (${start}) must not be after endWeek (${end})`,
    );
  }
}

/**
 * The editable content of a UNIT assessment (migration 20260729120000 — the B3
 * Assessments drawer). A subset of `UnitAssessment`: `id` / `unitId` are
 * identity (fixed at create) and `position` moves only through
 * `reorderUnitAssessments`, so none of the three is patchable here.
 *
 * KEY-PRESENCE, not value-presence: a key PRESENT with an `undefined` value is a
 * deliberate CLEAR (writes NULL); a key ABSENT is left untouched. The mapper
 * (`lib/planner/unit-assessments.ts`) implements that with `in patch`.
 *
 * Like `UnitPatch` — and UNLIKE `LessonPatch` — this takes NO `SaveTarget`:
 * unit assessments are TEAM curriculum content with no personal-fork table.
 * There is one shared row set per unit, gated server-side by
 * `unit_assessments_write` (the same tenancy predicate as `units_write`,
 * resolved through the parent unit). A teacher without that role has the write
 * denied server-side (0 rows) and the mutator throws — never a silent personal
 * fork (there is nothing to fork into).
 */
export type UnitAssessmentPatch = Partial<
  Pick<UnitAssessment, "kind" | "title" | "purpose" | "notes">
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
  /** Units for a grade, in display order. Omitting `opts` scopes to the
   *  school's ACTIVE year (plus legacy null-year units) — matching the
   *  default `listLessons` read. An explicit `schoolYearId` (the archive
   *  drill-in) returns exactly that year's units so archived lessons keep
   *  their unit metadata. The mock source ignores `opts` (single year). */
  listUnits(
    gradeLevelId: string,
    opts?: { schoolYearId?: string },
  ): Promise<Unit[]>;
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
   *  `input.gradeLevelId` when omitted so existing callers keep working.
   *  `objective` (W3.7 audit #5) rides in the create itself so the row lands
   *  atomically — the prior post-create editLesson tee could fail silently
   *  and strand a lesson without its objective. Omitted → "". */
  createLesson(
    input: {
      gradeLevelId: string;
      subject: Lesson["subject"];
      unit: string;
      week: number;
      day: number;
      title: string;
      objective?: string;
    },
    ownerId: string,
    gradeLevelId?: string,
  ): Promise<Lesson>;
  /** Soft-delete a lesson — PERSONAL-scoped (§4.6). For a master-derived lesson
   *  the owner's personal copy is archived (lazy-forked if absent); a
   *  teacher-authored lesson sets its own `deleted_at`. The shared master row is
   *  NEVER mutated. */
  softDeleteLesson(lessonId: string, ownerId: string): Promise<void>;
  /** Reverse `softDeleteLesson` — PERSONAL-scoped, the exact mirror image. A
   *  teacher-authored lesson clears its own `deleted_at`; a master-derived one
   *  clears `archived_at` on the owner's personal copy. The shared master row is
   *  NEVER mutated.
   *
   *  WHY IT EXISTS: without it, "Undo" on an archive was reducer-only — the
   *  delete committed, the restore did not, and the lesson came back deleted on
   *  reload while the toast said otherwise. Idempotent: restoring a lesson that
   *  is not archived (or whose personal copy does not exist — nothing was ever
   *  archived) is a no-op, never an error. */
  unarchiveLesson(lessonId: string, ownerId: string): Promise<void>;

  // ── Unit mutations (the Unit Plan editor commits through this) ─────────────
  /** Patch a unit's editable Track-B workspace fields (big idea, essential
   *  questions, vocabulary, K/U/D, notes, …). Units are TEAM / MASTER content:
   *  there is NO personal fork, so this always writes the shared `units` row and
   *  takes NO `SaveTarget`. Authorization is enforced server-side by the
   *  `units_write` RLS policy (`can_edit_subject_master(subject_id) OR
   *  is_grade_lead(grade_level_id)`); an unauthorized write matches 0 rows and
   *  the Supabase source THROWS (never a silent no-op). `ownerId` is carried for
   *  signature parity with the other mutators; the write is scoped by
   *  `auth.uid()` under RLS, not by this argument. Returns the updated unit. */
  updateUnitFields(
    unitId: string,
    patch: UnitPatch,
    ownerId: string,
  ): Promise<Unit>;

  // ── Unit assessments (B3 — many per unit, TEAM content) ────────────────────
  // A unit owns MULTIPLE assessments (pre-test / mid-unit / final), each with a
  // kind + title + purpose + notes and a stable order. They are team curriculum
  // content exactly like the editable unit fields (no personal fork, no
  // `SaveTarget`); `unit_assessments_write` RLS is the authorization gate and an
  // unauthorized write matches 0 rows, which the Supabase source THROWS on —
  // never a silent no-op. Distinct from the B2 LESSON assessment
  // (`Lesson.assessment`), which is untouched by these methods.
  //
  // ⚠ APPLY COUPLING (§4c): the Supabase implementation names the
  // `unit_assessments` table, which exists only once migration 20260729120000 is
  // applied. Under the planner Supabase flag these methods THROW before the
  // apply (`relation … does not exist`) — surfaced, never a silent empty list —
  // so nothing may call them from a hydrate path until the migration lands. The
  // flag-OFF mock path round-trips in memory and is unaffected.

  /** A unit's assessments, in display order. Batched by design: the Assessments
   *  panel reads a whole subject/grade at once, and a per-unit call would be an
   *  N+1 across every unit in the catalog. Returns a map keyed by the SAME unit
   *  ids that were passed in; a unit with no assessments is present with an
   *  empty array (so a caller can distinguish "read, none" from "not read").
   *  An empty `unitIds` short-circuits to `{}` without a round-trip. */
  listUnitAssessments(
    unitIds: string[],
  ): Promise<Record<string, UnitAssessment[]>>;
  /** Append a new assessment to a unit. It lands LAST — `position` = the unit's
   *  current MAX + 1, deliberately NOT the row count: positions are left SPARSE
   *  after a delete (deleting the middle of 0,1,2 leaves 0,2 — nothing
   *  renumbers), and a count would hand the new row a position that COLLIDES
   *  with a survivor instead of appending. `input` may be empty — a blank
   *  assessment the teacher then fills in is valid (every content field is
   *  nullable, and an absent `kind` is a real state, not an error). Returns the
   *  created row as the server confirmed it. */
  createUnitAssessment(
    unitId: string,
    input: UnitAssessmentPatch,
    ownerId: string,
  ): Promise<UnitAssessment>;
  /** Patch one assessment's content. `position` is NOT patchable here (use
   *  `reorderUnitAssessments`). An empty patch is a no-op that still re-reads
   *  and returns the canonical row. */
  updateUnitAssessment(
    assessmentId: string,
    patch: UnitAssessmentPatch,
    ownerId: string,
  ): Promise<UnitAssessment>;
  /** Remove an assessment. A REAL, HARD delete of the whole row — never a
   *  soft-null of `kind`. Nulling fields individually is what left the prototype
   *  with orphaned `purpose`/`notes` text behind a cleared kind, resurfacing
   *  later; a row-based model deletes the row, so every field goes with it.
   *  There is no soft-delete column anywhere in this table (team content with no
   *  personal fork has no per-teacher hide to model).
   *
   *  NOT idempotent by design: deleting a row that is already gone (or that RLS
   *  hides) affects 0 rows and THROWS, so an unauthorized delete can never be
   *  mistaken for a successful one. Surviving rows are NOT renumbered — see
   *  `createUnitAssessment` on why positions stay sparse. */
  deleteUnitAssessment(assessmentId: string, ownerId: string): Promise<void>;
  /** Reorder a unit's assessments. `orderedIds` is the final order — each id's
   *  array index becomes its `position`, so this is also what COMPACTS a sparse
   *  sequence back to a dense 0…n-1.
   *
   *  REJECTS malformed input rather than absorbing it (migration 20260729140000
   *  hardened the RPC, and the mock source mirrors it): DUPLICATE ids throw, and
   *  so does ANY id that is not an assessment of `unitId` — foreign, stale, or
   *  hidden from the caller by RLS. Earlier revisions ignored those silently,
   *  which let a stale client request report a clean success. A client cannot
   *  reorder another unit's rows by smuggling ids in; it gets an error.
   *
   *  COMPLETENESS is NOT required: ids omitted from `orderedIds` keep their
   *  positions. That is deliberate, so a teammate's concurrent insert cannot make
   *  an otherwise-valid drag fail. Ordering stays deterministic regardless —
   *  `sortUnitAssessments` is total-ordered and breaks ties by id.
   *
   *  Atomic in the Supabase source (one RPC, not N updates), so a failure can
   *  never leave a half-applied order. Returns the unit's assessments in their
   *  new confirmed order.
   *
   *  DELIBERATE AUTHORIZATION ASYMMETRY — do not "fix" this. The RPC validates
   *  ids with a SELECT, which since migration 20260729140000 is gated by
   *  `can_read_grade` alone, while the UPDATE itself is gated by
   *  `can_edit_subject_master OR is_grade_lead`. So a subject master with NO
   *  grade assignment can update a row directly but cannot reorder: validation
   *  sees zero rows and the RPC raises. That is intended and fail-closed —
   *  someone who cannot READ a unit's assessments has no list to drag and should
   *  not be resequencing them. Widening the RPC's validation to the write
   *  predicate would hand reorder rights to a role that cannot see what it is
   *  reordering. The same role is already effectively locked out elsewhere
   *  (`patchUnit` does `.update(...).select("id")`, which it could not read back
   *  either), so this is consistent with the rest of the seam, not new. */
  reorderUnitAssessments(
    unitId: string,
    orderedIds: string[],
    ownerId: string,
  ): Promise<UnitAssessment[]>;

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
