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
import { LESSONS, UNITS, SUBJECTS, STANDARDS } from "../mock";
import type {
  PlannerDataSource,
  LessonPatch,
  LessonMoveTarget,
} from "./source";

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
  };
}

/** Deep-clone a section list (and its resources) so callers can't mutate the
 *  store through a returned array. */
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

// ── Implementation ────────────────────────────────────────────────────────────

export const plannerMockSource: PlannerDataSource = {
  // ── Reads ──────────────────────────────────────────────────────────────────

  async listLessons(
    _gradeLevelId: string,
    _ownerId: string,
  ): Promise<Lesson[]> {
    // The single mock grade makes the grade-scope filter a pass-through (every
    // fixture lesson belongs to it). Soft-deletes are excluded (plan §4.3), the
    // same as the views, which filter `archived === true`. The scope params are
    // honoured by the Supabase source (grade + RLS); the mock keeps them in the
    // signature so the contract is identical.
    void _gradeLevelId;
    void _ownerId;
    return lessons.filter((l) => l.archived !== true).map(cloneLesson);
  },

  async listUnits(_gradeLevelId: string): Promise<Unit[]> {
    // UNITS is the active-unit-per-subject map; the contract returns an ordered
    // array. Subjects' display order is the source of truth, so order by it.
    void _gradeLevelId;
    return SUBJECTS.map((s) => UNITS[s.id]).filter((u): u is Unit => u != null);
  },

  async listSubjects(_gradeLevelId: string): Promise<Subject[]> {
    void _gradeLevelId;
    return SUBJECTS.map((s) => ({ ...s }));
  },

  async listStandards(_gradeLevelId: string): Promise<StandardsMap> {
    void _gradeLevelId;
    return { ...STANDARDS };
  },

  async getSections(lessonId: string): Promise<LessonSectionContent[]> {
    return cloneSections(ensureSections(lessonId));
  },

  // ── Lesson mutations ─────────────────────────────────────────────────────────

  async updateLesson(
    lessonId: string,
    patch: LessonPatch,
    _ownerId: string,
  ): Promise<Lesson> {
    const lesson = findLesson(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    // Mirror the reducer's `editLesson`: spread the patch over the lesson. This
    // does NOT fork — the personal-fork write lands in the Supabase source; the
    // mock keeps the pre-source single-document behavior byte-identical.
    void _ownerId;
    Object.assign(lesson, patch);
    return cloneLesson(lesson);
  },

  async moveLesson(
    lessonId: string,
    target: LessonMoveTarget,
    _ownerId: string,
  ): Promise<Lesson> {
    const lesson = findLesson(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    // Port of the reducer's `moveLesson` flag logic: a real slot change sets
    // `moved` to "across-weeks" (week changed) or "same-week" (day only).
    void _ownerId;
    const sameSlot = target.week === lesson.week && target.day === lesson.day;
    lesson.day = target.day;
    lesson.week = target.week;
    lesson.moved = sameSlot
      ? lesson.moved
      : target.week !== lesson.week
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
  ): Promise<Lesson> {
    const lesson = findLesson(lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    // Completion NEVER forks (CLAUDE.md §2) — status only.
    void _ownerId;
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
    },
    _ownerId: string,
  ): Promise<Lesson> {
    // A teacher-created lesson is PERSONAL by definition (isPersonal=true),
    // unmodified/unmoved, with empty content and a fresh id — matching the
    // reducer's duplicate/personal-create flag defaults.
    void _ownerId;
    const lesson: Lesson = {
      id: nextId("lesson"),
      subject: input.subject,
      unit: input.unit,
      title: input.title,
      objective: "",
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

  // ── Section + resource mutations ───────────────────────────────────────────

  async setSections(
    lessonId: string,
    sections: LessonSectionContent[],
    _ownerId: string,
  ): Promise<LessonSectionContent[]> {
    const id = resolveLessonId(lessonId);
    // Clone on the way IN so the store doesn't alias the caller's array, then
    // again on the way OUT so the caller can't mutate the store.
    void _ownerId;
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
