// lib/planner/mock-source.ts — in-memory `PlannerDataSource` for v1.
//
// Seeded from `lib/mock` (lessons / units / subjects / standards); holds the
// editable curriculum "document" in a mutable module-level store so the
// prototype behaves like a real backend within a session (edits/moves/creates
// persist for the page's lifetime). Every method is async to match the
// Supabase implementation's signature exactly, so the store awaits both
// identically (plan §11.3).
//
// This is the DEFAULT path: with the Supabase flag OFF the planner store reads
// and writes through here, and its behavior must be byte-identical to the
// pre-source reducer (lib/planner-store.tsx). The mutation semantics below are
// a faithful port of that reducer's `applyDocAction`:
//   • updateLesson      → `editLesson` (spread patch over the lesson; no fork).
//   • moveLesson        → `moveLesson` (set day/week + the moved flag).
//   • setLessonStatus   → `setLessonStatus` (status only — NEVER forks, §2).
//   • createLesson      → append a fresh PERSONAL lesson (isPersonal=true).
//   • softDeleteLesson  → `archiveLesson` (lesson.archived = true).
//   • getSections       → `buildInitialSections` (template + lesson resources).
//   • setSections / add/removeSectionResource → the reducer's section ops.
//
// Sections are seeded lazily and cached per-lesson so resource mutations
// persist across calls within the session (the reducer kept them in its
// `sections` record; here they live in `sectionsStore`).
//
// The id bridge (`resolveLessonId` / `resolveOwnerId`) is slug-tolerant: mock
// ids are slugs ("m-12-0"); the future Supabase rows are uuids. v1 keeps the
// slug as-is; the Supabase adapter (lib/planner/id-bridge.ts) maps slug ↔ uuid.
//
// PRIVACY (§11.4): planner rows carry STRUCTURE only — lesson titles, units,
// standards, resources. No student names are synthesized into any field here.

import type {
  Lesson,
  LessonResource,
  LessonStatus,
  StandardsMap,
  Subject,
  Unit,
  UnitAssessment,
} from "../types";
import type { LessonSectionContent } from "../lesson-flow";
import {
  instantiateSections,
  newLessonSection,
  newSectionResource,
} from "../lesson-flow";
import {
  LESSON_TEMPLATE_BY_ID,
  DEFAULT_LESSON_TEMPLATE_ID,
} from "../lesson-templates";
import { LESSONS, ALL_UNITS, SUBJECTS, STANDARDS } from "../mock";
import type {
  PlannerDataSource,
  LessonPatch,
  LessonMoveTarget,
  ListLessonsOptions,
  SaveTarget,
  UnitAssessmentPatch,
  UnitPatch,
} from "./source";
// The unit-assessment store below holds ROW-shaped records and maps them with
// the SAME pure mappers the Supabase source uses, so the flag-OFF path shares
// the flag-ON clear/validation semantics exactly (rather than re-implementing
// them in domain space and drifting).
import {
  sortUnitAssessments,
  unitAssessmentColumns,
  unitAssessmentFromRow,
  type UnitAssessmentRow,
} from "./unit-assessments";

// ── Id bridge (mock slugs ↔ db uuids) ───────────────────────────────────────

/** Resolve a lesson identifier to the canonical id the store keys on. v1 is the
 *  identity map (slugs are already canonical); the Supabase source maps
 *  slug → uuid via lib/planner/id-bridge.ts. */
export function resolveLessonId(lessonId: string): string {
  return lessonId;
}

/** Resolve a teacher/owner identifier to the canonical id. Identity in v1. */
export function resolveOwnerId(ownerId: string): string {
  return ownerId;
}

// ── Mutable in-memory store ─────────────────────────────────────────────────
// Cloned from the fixtures so editing the live store never mutates the exported
// fixture arrays (which other modules — and the reducer store — also read).

const lessons: Lesson[] = LESSONS.map(cloneLesson);

/** The live, mutable unit superset — cloned from the fixtures so a Track-B unit
 *  edit (updateUnitFields) persists for the session without mutating the
 *  exported `ALL_UNITS` fixture (which other modules also read). Mirrors the
 *  `lessons` store above. NOTE: with the Supabase planner flag OFF the store's
 *  persist tee is a no-op, so unit edits stay REDUCER-LOCAL in the planner store
 *  and never reach here — this store exists to honour the PlannerDataSource
 *  contract faithfully (so a direct `plannerClient.updateUnitFields` call, and
 *  the flag-ON dispatch fallback, behave like a real backend). */
const units: Unit[] = ALL_UNITS.map(cloneUnit);

/** The live unit-assessment rows (B3). Held in ROW shape — `unit_id`,
 *  `display_order`, nullable text columns — so every read goes through
 *  `unitAssessmentFromRow` and every write through `unitAssessmentColumns`,
 *  the same two pure mappers the Supabase source uses. That is what makes the
 *  flag-OFF round-trip a faithful rehearsal of the flag-ON one (invalid `kind`
 *  dropped, a supplied-undefined key clearing to null, an absent key untouched)
 *  instead of a parallel implementation that can drift.
 *
 *  Seeded EMPTY: there are no unit-assessment fixtures in `lib/mock`, and
 *  inventing some would put fake curriculum content in front of a teacher on the
 *  prototype path. The panel's empty state is the honest flag-OFF render. */
const unitAssessmentRows: UnitAssessmentRow[] = [];

/** Section content keyed by lesson id, seeded lazily on first `getSections`
 *  (mirrors the reducer's `sections` record, which seeded every lesson on
 *  mount; here we seed on demand so the store stays cheap). */
const sectionsStore = new Map<string, LessonSectionContent[]>();

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

/** Deep-clone a lesson so the live store never aliases the fixture object (or a
 *  returned object the caller might mutate). Nested arrays are copied. */
function cloneLesson(l: Lesson): Lesson {
  return {
    ...l,
    resources: l.resources.map((r) => ({ ...r })),
    standards: [...l.standards],
    tasks: l.tasks.map((t) => ({
      ...t,
      resources: t.resources.map((r) => ({ ...r })),
      standards: [...t.standards],
    })),
    // Track-B nested fields (B2) — copied so a caller can never mutate the store
    // through a returned lesson (mirrors cloneUnit's Track-B handling). The
    // scalar Track-B fields (durationMinutes/builds/prep/frameworkId/taughtAt)
    // ride the top-level spread.
    assessment: l.assessment ? { ...l.assessment } : undefined,
    frameworkData: l.frameworkData ? { ...l.frameworkData } : undefined,
    // carried permits object OR array — clone each shape correctly (spreading an
    // array into an object literal would corrupt it to a numeric-keyed object).
    carried: l.carried
      ? Array.isArray(l.carried)
        ? [...l.carried]
        : { ...l.carried }
      : undefined,
  };
}

/** Deep-clone a unit so the live store never aliases the fixture object (or a
 *  returned object the caller might mutate). The Track-B nested fields
 *  (essentialQuestions / vocab / kud / frameworkData / customFields / carried /
 *  standardIds) are copied so a caller cannot mutate the store through a
 *  returned unit. */
function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    essentialQuestions: u.essentialQuestions
      ? [...u.essentialQuestions]
      : undefined,
    vocab: u.vocab ? u.vocab.map((v) => ({ ...v })) : undefined,
    kud: u.kud
      ? {
          know: u.kud.know ? [...u.kud.know] : undefined,
          understand: u.kud.understand ? [...u.kud.understand] : undefined,
          doGoal: u.kud.doGoal ? [...u.kud.doGoal] : undefined,
        }
      : undefined,
    standardIds: u.standardIds ? [...u.standardIds] : undefined,
    frameworkData: u.frameworkData ? { ...u.frameworkData } : undefined,
    customFields: u.customFields ? { ...u.customFields } : undefined,
    carried: u.carried ? { ...u.carried } : undefined,
  };
}

/** Deep-clone a section list (and its resources) so callers can't mutate the
 *  store through a returned array. The object spread carries EVERY section
 *  field verbatim — including the W3.8 appearance pair (`color` /
 *  `tintScope`), so the mock round-trips them exactly like the Supabase
 *  source's lesson_sections columns. */
function cloneSections(
  sections: LessonSectionContent[],
): LessonSectionContent[] {
  return sections.map((s) => ({
    ...s,
    resources: s.resources.map((r) => ({ ...r })),
  }));
}

// ── Section seeding (ports planner-store.tsx buildInitialSections) ───────────

/** Build the initial section content for a lesson — a faithful port of the
 *  reducer store's `buildInitialSections`. Uses the default lesson-flow
 *  template; the lesson's own fixture `resources` thread onto the sections so
 *  the Teach surface sees real resources. Falls back to a single blank section
 *  carrying the resources if the template registry is missing. */
function buildInitialSections(
  resources: LessonResource[] = [],
): LessonSectionContent[] {
  const template = LESSON_TEMPLATE_BY_ID[DEFAULT_LESSON_TEMPLATE_ID];
  if (!template) {
    const section = newLessonSection();
    section.resources = resources.map((r) => ({
      ...newSectionResource(r.type, r.label),
      ...r,
    }));
    return [section];
  }
  return instantiateSections(template, resources);
}

/** Return the live (cached) sections for a lesson, seeding them on first
 *  access. A lazily-created lesson (no fixture resources) seeds empty sections,
 *  matching the reducer's `ensureSections` fallback. */
function ensureSections(lessonId: string): LessonSectionContent[] {
  const id = resolveLessonId(lessonId);
  const existing = sectionsStore.get(id);
  if (existing) return existing;
  const lesson = lessons.find((l) => l.id === id);
  const seeded = buildInitialSections(lesson?.resources);
  sectionsStore.set(id, seeded);
  return seeded;
}

/** Find a lesson in the live store by (resolved) id. */
function findLesson(lessonId: string): Lesson | undefined {
  const id = resolveLessonId(lessonId);
  return lessons.find((l) => l.id === id);
}

/** Find a unit in the live store by id. */
function findUnit(unitId: string): Unit | undefined {
  return units.find((u) => u.id === unitId);
}

// ── Implementation ────────────────────────────────────────────────────────────

export const plannerMockSource: PlannerDataSource = {
  // ── Reads ──────────────────────────────────────────────────────────────────

  async getActiveGradeLevelId(_ownerId: string): Promise<string | null> {
    // The prototype runs a single Grade 5 grade; the resolver is a constant
    // here. The Supabase source reads teachers.default_grade_level_id (falling
    // back to teacher_grade_assignments). Keeping the param honours the contract.
    void _ownerId;
    return "g5";
  },

  async listLessons(
    _gradeLevelId: string,
    _ownerId: string,
    _opts?: ListLessonsOptions,
  ): Promise<Lesson[]> {
    // The single mock grade makes the grade-scope filter a pass-through (every
    // fixture lesson belongs to it). Soft-deletes are excluded (plan §4.3), the
    // same as the views, which filter `archived === true`. The scope params are
    // honoured by the Supabase source (grade + RLS); the mock keeps them in the
    // signature so the contract is identical. `_opts` (school-year/week window)
    // is accepted for parity and intentionally a NO-OP here, so the in-memory
    // behaviour stays byte-identical to the pre-windowing mock.
    void _gradeLevelId;
    void _ownerId;
    void _opts;
    return lessons.filter((l) => l.archived !== true).map(cloneLesson);
  },

  async listUnits(
    _gradeLevelId: string,
    _opts?: { schoolYearId?: string },
  ): Promise<Unit[]> {
    // `_opts` is ignored — the mock holds a single in-memory year.
    void _opts;
    // The contract's listUnits MUST return ALL units for the grade (the
    // full-year superset), matching the Supabase source which selects every
    // grade unit. The live `units` store is that superset (seeded from
    // ALL_UNITS) — the set SubjectView and TimelineYear filter over
    // (`units.filter(u => u.subject === id)`). The store derives the
    // active-unit-per-subject map from this superset, so returning the active-8
    // here (the old behavior) would starve the catalog. Clone each row (incl.
    // the Track-B nested fields) so callers can't mutate the store.
    void _gradeLevelId;
    return units.map(cloneUnit);
  },

  async listSubjects(_gradeLevelId: string): Promise<Subject[]> {
    void _gradeLevelId;
    return SUBJECTS.map((s) => ({ ...s }));
  },

  async listStandards(_gradeLevelId: string): Promise<StandardsMap> {
    void _gradeLevelId;
    return { ...STANDARDS };
  },

  async getSections(
    lessonId: string,
    _ownerId?: string,
  ): Promise<LessonSectionContent[]> {
    // `ownerId` is accepted for contract parity (the Supabase source resolves a
    // personal fork by it); the single-document mock ignores it.
    void _ownerId;
    return cloneSections(ensureSections(lessonId));
  },

  async getSectionsBatch(
    lessonIds: string[],
    _ownerId: string,
  ): Promise<Record<string, LessonSectionContent[]>> {
    // Batched seed — the same per-lesson `ensureSections` logic mapped over the
    // requested ids in one call, so the store hydrates every lesson's sections
    // without N async round-trips. Behaviour per lesson is identical to
    // `getSections`; ownerId is ignored (single-document mock).
    void _ownerId;
    const out: Record<string, LessonSectionContent[]> = {};
    for (const lessonId of lessonIds) {
      out[resolveLessonId(lessonId)] = cloneSections(ensureSections(lessonId));
    }
    return out;
  },

  // ── Lesson mutations ─────────────────────────────────────────────────────────

  async updateLesson(
    lessonId: string,
    patch: LessonPatch,
    _ownerId: string,
    _saveTarget?: SaveTarget,
  ): Promise<Lesson> {
    const lesson = findLesson(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    // Mirror the reducer's `editLesson`: spread the patch over the lesson. This
    // does NOT fork — the personal-fork write lands in the Supabase source; the
    // mock keeps the pre-source single-document behavior byte-identical.
    //
    // `_saveTarget` is accepted for contract parity (#14): a "core" save in the
    // Supabase source writes the shared master row, but the single-document mock
    // has no master/personal split — every write already lands in the one shared
    // doc — so both targets edit the same lesson here, a NO-OP distinction that
    // keeps flag-OFF behavior byte-identical.
    void _ownerId;
    void _saveTarget;
    Object.assign(lesson, patch);
    return cloneLesson(lesson);
  },

  async moveLesson(
    lessonId: string,
    target: LessonMoveTarget,
    _ownerId: string,
    _saveTarget?: SaveTarget,
  ): Promise<Lesson> {
    const lesson = findLesson(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    // Port of the reducer's `moveLesson` flag logic: a real slot change sets
    // `moved` to "across-weeks" (week changed) or "same-week" (day only).
    // `_saveTarget` is parity-only here (see updateLesson): the single shared
    // mock doc has no master/personal split, so both targets move the same row.
    void _ownerId;
    void _saveTarget;
    // BOTH comparisons must read the PRE-move slot. Deriving `moved` after
    // assigning `lesson.week` compared the target against itself, so the test
    // was always false and EVERY cross-week move was labelled "same-week" —
    // the wrong move-arrow icon (↔ instead of ⤴) on the whole flag-OFF path.
    // Capture the origin first; mutate after.
    const fromWeek = lesson.week;
    const fromDay = lesson.day;
    const sameSlot = target.week === fromWeek && target.day === fromDay;
    lesson.day = target.day;
    lesson.week = target.week;
    lesson.moved = sameSlot
      ? lesson.moved
      : target.week !== fromWeek
        ? "across-weeks"
        : "same-week";
    // NOTE: cell-layout pruning is view-local (CellLayout lives in the store,
    // not the data source), so it is intentionally not modeled here.
    return cloneLesson(lesson);
  },

  async setLessonStatus(
    lessonId: string,
    status: LessonStatus,
    _ownerId: string,
    _saveTarget?: SaveTarget,
  ): Promise<Lesson> {
    const lesson = findLesson(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    // Completion NEVER forks (CLAUDE.md §2) — status only. `_saveTarget` is
    // inert for completion in BOTH sources (status is always per-teacher and
    // never writes the master row); accepted only for signature parity.
    void _ownerId;
    void _saveTarget;
    lesson.status = status;
    return cloneLesson(lesson);
  },

  async createLesson(
    input: {
      gradeLevelId: string;
      subject: Lesson["subject"];
      unit: string;
      week: number;
      day: number;
      title: string;
      objective?: string;
    },
    _ownerId: string,
    _gradeLevelId?: string,
  ): Promise<Lesson> {
    // A teacher-created lesson is PERSONAL by definition (isPersonal=true),
    // unmodified/unmoved, with empty content and a fresh id — matching the
    // reducer's duplicate/personal-create flag defaults. `gradeLevelId` is the
    // resolved-uuid override the Supabase source needs; the mock keys off the
    // single grade and ignores it.
    void _ownerId;
    void _gradeLevelId;
    const lesson: Lesson = {
      id: nextId("lesson"),
      subject: input.subject,
      unit: input.unit,
      title: input.title,
      // W3.7 audit #5 — objective rides in the create (no post-create edit
      // tee); the one-click flow passes none → "".
      objective: input.objective ?? "",
      preview: "",
      directions: "",
      notes: "",
      resources: [],
      standards: [],
      week: input.week,
      day: input.day,
      isPersonal: true,
      pendingMaster: false,
      reasonNotDone: "",
      modified: false,
      moved: null,
      status: "not_done",
      commentCount: 0,
      unreadComments: 0,
      tasks: [],
    };
    lessons.push(lesson);
    // Seed empty sections (no fixture resources), as the reducer did for
    // lazily-added lessons.
    sectionsStore.set(lesson.id, buildInitialSections());
    return cloneLesson(lesson);
  },

  async softDeleteLesson(lessonId: string, _ownerId: string): Promise<void> {
    const lesson = findLesson(lessonId);
    // Idempotent: a missing/already-archived lesson is a no-op. Soft-delete
    // (mark archived) mirrors the reducer's `archiveLesson`; reads exclude it.
    void _ownerId;
    if (lesson) lesson.archived = true;
  },

  async unarchiveLesson(lessonId: string, _ownerId: string): Promise<void> {
    const lesson = findLesson(lessonId);
    // Mirror of softDeleteLesson, and idempotent for the same reason: a
    // missing / already-visible lesson is a no-op, never an error.
    void _ownerId;
    if (lesson) lesson.archived = false;
  },

  // ── Unit mutations ─────────────────────────────────────────────────────────

  async updateUnitFields(
    unitId: string,
    patch: UnitPatch,
    _ownerId: string,
  ): Promise<Unit> {
    const unit = findUnit(unitId);
    if (!unit) throw new Error(`Unit not found: ${unitId}`);
    // Mirror the reducer's `editUnitFields`: spread the patch over the unit.
    // Units are a single shared document in the mock (no team/personal split),
    // and RLS authorization is a Supabase-only concern — so `_ownerId` is
    // parity-only here. Only the keys present in `patch` are overwritten, so an
    // absent field is never nulled.
    //
    // WEEK-RANGE PARITY (the Plan timeline's band drag). `UnitPatch` now also
    // carries `startWeek` / `endWeek` / `weeks`, and the blanket assign is the
    // RIGHT behaviour for all three here — unlike the Supabase source, which
    // must drop `weeks` because there is no such column and `mapUnitRow`
    // re-derives the label from the two numbers. The mock has no derivation
    // step and no reload echo: what is assigned IS the canonical value, so
    // dropping `weeks` here would leave a mock unit's label frozen at its old
    // schedule and the flag-OFF path would diverge visibly from flag-ON.
    void _ownerId;
    Object.assign(unit, patch);
    return cloneUnit(unit);
  },

  // ── Unit assessments (B3) ──────────────────────────────────────────────────

  async listUnitAssessments(
    unitIds: string[],
  ): Promise<Record<string, UnitAssessment[]>> {
    // Every requested unit gets a key (empty array when it has none), matching
    // the Supabase source — so a caller can tell "read, none" from "not read".
    const out: Record<string, UnitAssessment[]> = {};
    for (const unitId of unitIds) {
      out[unitId] = sortUnitAssessments(
        unitAssessmentRows
          .filter((r) => r.unit_id === unitId)
          .map(unitAssessmentFromRow),
      );
    }
    return out;
  },

  async createUnitAssessment(
    unitId: string,
    input: UnitAssessmentPatch,
    _ownerId: string,
  ): Promise<UnitAssessment> {
    // Appends LAST via MAX(display_order) + 1, matching the Supabase source
    // exactly — positions are left SPARSE after a delete, so a COUNT-based next
    // position would collide with a survivor instead of landing last.
    //
    // KNOWN DIVERGENCE (accepted, not an oversight): production enforces
    // `unit_id → units.id` with a foreign key, so creating against an unknown
    // unit fails there and succeeds here. It is not reachable from the app — the
    // only caller passes the open unit's own id, which by definition exists —
    // and the mock's synthetic fixtures deliberately use ids outside the catalog
    // so the layer can be unit-tested in isolation. Adding a catalog lookup here
    // would buy nothing the FK does not already guarantee in production, while
    // forcing every fixture to hold a real unit. Revisit if a caller ever
    // constructs a unit id rather than passing one through.
    // `_ownerId` is parity-only: unit assessments are team content and
    // authorization is a Supabase/RLS concern the single-document mock has no
    // equivalent of.
    void _ownerId;
    const maxOrder = unitAssessmentRows
      .filter((r) => r.unit_id === unitId)
      // -1 seeds the empty case, so the first row lands at 0.
      .reduce((max, r) => Math.max(max, r.display_order ?? 0), -1);
    const row: UnitAssessmentRow = {
      id: nextId("uassess"),
      unit_id: unitId,
      display_order: maxOrder + 1,
      ...unitAssessmentColumns(input),
    };
    unitAssessmentRows.push(row);
    return unitAssessmentFromRow(row);
  },

  async updateUnitAssessment(
    assessmentId: string,
    patch: UnitAssessmentPatch,
    _ownerId: string,
  ): Promise<UnitAssessment> {
    void _ownerId;
    const row = unitAssessmentRows.find((r) => r.id === assessmentId);
    if (!row) throw new Error(`Unit assessment not found: ${assessmentId}`);
    // Only the keys PRESENT in the patch are written (a present-but-undefined
    // key clears to null; an absent key is untouched) — the mapper owns that.
    Object.assign(row, unitAssessmentColumns(patch));
    return unitAssessmentFromRow(row);
  },

  async deleteUnitAssessment(
    assessmentId: string,
    _ownerId: string,
  ): Promise<void> {
    void _ownerId;
    const i = unitAssessmentRows.findIndex((r) => r.id === assessmentId);
    // Deliberately NOT idempotent (unlike softDeleteLesson): deleting a row that
    // isn't there throws, mirroring the Supabase source's 0-rows-affected throw,
    // so a no-op delete can never read as a success on either path.
    if (i < 0) throw new Error(`Unit assessment not found: ${assessmentId}`);
    unitAssessmentRows.splice(i, 1);
  },

  async reorderUnitAssessments(
    unitId: string,
    orderedIds: string[],
    _ownerId: string,
  ): Promise<UnitAssessment[]> {
    void _ownerId;
    // An id's array index becomes its display_order.
    //
    // VALIDATES LIKE THE RPC, deliberately. `reorder_unit_assessments`
    // (migration 20260729140000) RAISES on duplicate ids and on ids that are not
    // assessments of this unit. If the mock quietly ignored them instead, the
    // flag-OFF path would report a clean success for input production rejects —
    // so a client bug would pass every local test and only surface on real
    // Supabase. The mock exists to rehearse the real semantics, not a lenient
    // imitation of them.
    //
    // Completeness is NOT required, matching the RPC: omitted rows keep their
    // positions, and `sortUnitAssessments` is total-ordered (ties break by id),
    // so a sparse or briefly-colliding display_order still renders stably.
    if (orderedIds.length > 0) {
      const distinct = new Set(orderedIds);
      if (distinct.size !== orderedIds.length) {
        throw new Error(
          `reorderUnitAssessments: orderedIds contains duplicate ids (${orderedIds.length} supplied, ${distinct.size} distinct)`,
        );
      }
      const owned = orderedIds.filter((id) =>
        unitAssessmentRows.some((r) => r.id === id && r.unit_id === unitId),
      ).length;
      if (owned !== orderedIds.length) {
        throw new Error(
          `reorderUnitAssessments: ${orderedIds.length - owned} of ${orderedIds.length} ids are not assessments of unit ${unitId} (stale or foreign)`,
        );
      }
      orderedIds.forEach((id, i) => {
        const row = unitAssessmentRows.find(
          (r) => r.id === id && r.unit_id === unitId,
        );
        if (row) row.display_order = i;
      });
    }
    return sortUnitAssessments(
      unitAssessmentRows
        .filter((r) => r.unit_id === unitId)
        .map(unitAssessmentFromRow),
    );
  },

  // ── Section + resource mutations ───────────────────────────────────────────

  async setSections(
    lessonId: string,
    sections: LessonSectionContent[],
    _ownerId: string,
    _saveTarget?: SaveTarget,
  ): Promise<LessonSectionContent[]> {
    const id = resolveLessonId(lessonId);
    // Clone on the way IN so the store doesn't alias the caller's array, then
    // again on the way OUT so the caller can't mutate the store. `_saveTarget`
    // is parity-only: the single shared mock doc has no team/personal section
    // split, so both targets write the one section list (byte-identical).
    void _ownerId;
    void _saveTarget;
    const next = cloneSections(sections);
    sectionsStore.set(id, next);
    return cloneSections(next);
  },

  async addSectionResource(
    lessonId: string,
    sectionId: string,
    resource: LessonResource,
    _ownerId: string,
  ): Promise<LessonSectionContent[]> {
    const current = ensureSections(lessonId);
    // Mint a stable section-resource id (the reducer's addSectionResource seeds
    // one via newSectionResource and lets the caller's fields win). The contract
    // passes a bare LessonResource (no id), so always mint here.
    void _ownerId;
    const seed = newSectionResource(resource.type, resource.label);
    const next = current.map((s) =>
      s.id === sectionId
        ? {
            ...s,
            resources: [...s.resources, { ...seed, ...resource, id: seed.id }],
          }
        : s,
    );
    sectionsStore.set(resolveLessonId(lessonId), next);
    return cloneSections(next);
  },

  async removeSectionResource(
    lessonId: string,
    sectionId: string,
    resourceId: string,
    _ownerId: string,
  ): Promise<LessonSectionContent[]> {
    const current = ensureSections(lessonId);
    void _ownerId;
    const next = current.map((s) =>
      s.id === sectionId
        ? { ...s, resources: s.resources.filter((r) => r.id !== resourceId) }
        : s,
    );
    sectionsStore.set(resolveLessonId(lessonId), next);
    return cloneSections(next);
  },
};
