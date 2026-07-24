"use client";

// planner-store.tsx — the single source of truth for editable curriculum data.
//
// This store holds the "document" — the lessons, their section content, and
// per-cell arrangement layouts — and wraps it in a 50-step undo/redo history.
// It is the authority that every view (Weekly grid, Daily panel, Subject view)
// will read and write; sibling agents wire their views against the usePlanner()
// hook exported here.
//
// ── Design principles ────────────────────────────────────────────────────
// 1. Pure immutable reducer — prior state is never mutated in place.
//    Structural sharing means unchanged lessons/sections share the same object
//    references across history entries, making 50-deep snapshots cheap.
// 2. 50-step capped history (HISTORY_LIMIT). Every content mutation pushes
//    a {doc, label} entry onto `past`; undo/redo swap present ↔ stacks.
// 3. Text-edit coalescing (700ms window, matching coalesceKey) prevents a
//    typing burst from flooding the undo stack — the whole burst lands in a
//    single undo step.
// 4. lastChange carries enough information for scroll-into-view effects
//    to work without the views inspecting the full document diff.
//
// ── Data-planner-item attribute convention ───────────────────────────────
// Sibling agents must add:
//   data-planner-item="lesson:<lessonId>"
// to each rendered lesson card root element. The `scrollPlannerItemIntoView`
// helper (exported below) uses this attribute to bring a lesson into view
// after undo/redo or an external mutation.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { arrayMove } from "@dnd-kit/sortable";

import type {
  Lesson,
  LessonResource,
  LessonStatus,
  StandardsMap,
  Subject,
  SubjectId,
  Unit,
} from "@/lib/types";
import type { LessonSectionContent, SectionResource } from "@/lib/lesson-flow";
import {
  nextInstructionalDay,
  DEFAULT_SCHOOL_WEEK_CONFIG,
} from "@/lib/lesson-schedule";
import {
  newLessonSection,
  newSectionResource,
  instantiateSections,
} from "@/lib/lesson-flow";
import type { CellLayout } from "@/lib/cell-layout";
import { cellKey, isTrivialLayout } from "@/lib/cell-layout";
import { uid } from "@/lib/uid";
import {
  LESSONS,
  ALL_UNITS,
  UNITS,
  SUBJECTS,
  SUBJECT_BY_ID,
  STANDARDS,
  describeStandard as mockDescribeStandard,
} from "@/lib/mock";
import { useAppState } from "@/lib/app-state";
import { snapshotRestorePatch } from "@/lib/fork-diff-restore";
import { MULTI_WORKSPACE } from "@/lib/multi-workspace-flag";
import { plannerClient } from "@/lib/planner/client";
import { resolveGrade } from "@/lib/planner/grade";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces";
import {
  LESSON_TEMPLATE_BY_ID,
  DEFAULT_LESSON_TEMPLATE_ID,
} from "@/lib/lesson-templates";
import { detectFirstFork } from "@/lib/undo-toast-messages";

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum number of undo steps retained. */
export const HISTORY_LIMIT = 50;

/** Milliseconds within which same-key text edits are coalesced into one step.
 *  Exported for the unit tests (tests/planner-store.test.ts). */
export const COALESCE_WINDOW_MS = 700;

// ── Document model ─────────────────────────────────────────────────────────

/** The editable curriculum document — everything views can read and mutate. */
export interface PlannerDoc {
  /** All lessons across all grades and weeks. Grade-scoping is always present
   *  on each Lesson (lesson.subject, lesson.week) — never assume one grade. */
  lessons: Lesson[];
  /** Section content keyed by lesson.id. Initialized lazily on first access
   *  inside selectors; the store seeds every lesson on mount. */
  sections: Record<string, LessonSectionContent[]>;
  /** Arranged cell layouts keyed by cellKey(subjectId, day).
   *  Empty record = every cell uses its default CardStack view. */
  cellLayouts: Record<string, CellLayout>;
}

// ── Catalog model ────────────────────────────────────────────────────────────

/** The planner CATALOG — the read-only reference data every view filters and
 *  labels against: the grade's subjects, its full-year unit superset, its
 *  standards map, and the active grade id. This is deliberately a SIBLING of the
 *  document (not part of PlannerDoc) so it NEVER enters the undo/redo history —
 *  editing a lesson must not put the subject list on the undo stack. The store
 *  hydrates it once per owner alongside the lessons (one dispatch) and replaces
 *  it wholesale on an owner change; it is never mutated by content actions. */
export interface PlannerCatalog {
  /** The 8 locked subjects for the grade, in display order. */
  subjects: Subject[];
  /** The FULL-YEAR unit superset for the grade (every unit any lesson may
   *  reference) — NOT the active-unit-per-subject map. Views that show all units
   *  (SubjectView, TimelineYear) filter this by subject; the active-unit map is
   *  derived separately (see `activeUnitBySubject` on PlannerValue). */
  units: Unit[];
  /** Standards (code → description) for the grade's assigned frameworks. */
  standards: StandardsMap;
  /** The resolved active grade uuid (or the mock "g5" slug under the flag OFF),
   *  or null when no grade is resolved (signed out / no assignment / error). */
  activeGradeId: string | null;
}

// ── History ────────────────────────────────────────────────────────────────

/** One snapshot entry in the undo/redo stacks. */
interface HistoryEntry {
  /** The document state BEFORE the action that produced the NEXT present. */
  doc: PlannerDoc;
  /** Human label of the action that produced the next state (e.g. "Move lesson"). */
  label: string;
}

/** The full history wrapper that the reducer operates on. */
interface HistoryState {
  past: HistoryEntry[];
  present: PlannerDoc;
  future: HistoryEntry[];
}

// ── Hydration status ─────────────────────────────────────────────────────────

/** Explicit load/empty/error lifecycle for the backend-sourced document.
 *  Views read this off the planner value to render a loading or empty state
 *  instead of an ambiguous blank during/after backend hydration.
 *
 *  • "idle"    — not applicable (flag OFF) OR not yet started.
 *  • "loading" — the backend hydrate for the current owner is in flight (or the
 *                owner changed and the prior doc no longer applies).
 *  • "ready"   — a non-empty document is loaded for the current owner. This is
 *                also the permanent state with the Supabase flag OFF.
 *  • "empty"   — hydrate completed but the owner has no lessons (signed-out,
 *                no grade, or a genuinely empty result).
 *  • "error"   — the hydrate threw; the document is empty (never mock). */
export type PlannerHydration = "idle" | "loading" | "ready" | "empty" | "error";

// ── lastChange signal ──────────────────────────────────────────────────────

/** Describes what just changed so views can scroll affected items into view.
 *  The object identity changes on every mutation (including undo/redo), so
 *  effects can depend on it with `useEffect(() => ..., [lastChange])`. */
export interface LastChange {
  /** Action kind, e.g. "moveLesson", "editSection", "undo", "redo". */
  kind: string;
  /** Lesson ids affected by the change. */
  lessonIds: string[];
  /** Section id, if a section mutation was the cause. */
  sectionId?: string;
  /**
   * True when THIS action lazily forked an affected lesson for the first
   * time — it transitioned from unforked (`modified !== true` and not
   * previously `isPersonal`) to personally forked (`modified === true` AND
   * `isPersonal === true`). Computed in the history reducer by diffing the
   * previous and next documents (see detectFirstFork in
   * lib/undo-toast-messages.ts). Consumed by the UndoToastBridge to fire the
   * forking-model education toast (UX roadmap item 02). Never set on
   * undo/redo/hydrate, and structurally impossible for setLessonStatus —
   * completion never forks (CLAUDE.md §2).
   */
  firstFork?: boolean;
}

// ── Actions ────────────────────────────────────────────────────────────────
// All actions are discriminated unions so the reducer can exhaustively match.
// Text-edit actions carry `coalesceKey` + `coalesceTs` for burst coalescing.

interface CoalesceFields {
  /** Stable key for this edit stream, e.g. "lesson:<id>:title". */
  coalesceKey: string;
  /** Timestamp (Date.now()) when the action was dispatched. */
  coalesceTs: number;
}

// ── Lesson actions ──────────────────────────────────────────────────────

type MoveLessonAction = {
  type: "moveLesson";
  id: string;
  // `time` (W3.8c) re-labels the lesson's time slot as part of a cross-period
  // move on the Week edit board. It is a CONTENT relabel, not a placement
  // change, so — unlike day/subject/week — it never sets the `moved` flag.
  patch: { day?: number; subject?: SubjectId; week?: number; time?: string };
};

type SetLessonStatusAction = {
  type: "setLessonStatus";
  id: string;
  status: LessonStatus;
};

type EditLessonAction = {
  type: "editLesson";
  id: string;
  patch: Partial<Lesson>;
} & CoalesceFields;

type DuplicateLessonAction = {
  type: "duplicateLesson";
  id: string;
};

/** Copy all lessons from `sourceWeek` into `targetWeek` (BIG-2). */
type DuplicateWeekAction = {
  type: "duplicateWeek";
  sourceWeek: number;
  targetWeek: number;
};

/** Move a lesson to its next instructional day for the same subject. */
type BumpLessonAction = {
  type: "bumpLesson";
  id: string;
};

/** Soft-delete a lesson by setting lesson.archived = true. */
type ArchiveLessonAction = {
  type: "archiveLesson";
  id: string;
};

/** Restore a soft-deleted lesson by setting lesson.archived = false. */
type UnarchiveLessonAction = {
  type: "unarchiveLesson";
  id: string;
};

/** Revert a personally-modified lesson back to its master/core state. */
type RestoreLessonAction = {
  type: "restoreLesson";
  id: string;
};

/** Relocate a lesson to a target day/subject/week, with optional copy. */
type RelocateLessonAction = {
  type: "relocateLesson";
  id: string;
  target: { day?: number; subject?: SubjectId; week?: number };
  keepOriginal: boolean;
};

/** Revert ONLY a lesson's placement to a captured day/week in ONE history
 *  step (fork-diff scheduling revert — FIX 4). Applies the move (reusing the
 *  moveLesson reducer for CellLayout pruning) AND forces `moved: null`, so the
 *  per-field revert tooltip's "Undo with ⌘Z" (singular) is honest. Content
 *  fields are untouched — a scheduling-only revert must keep the teacher's
 *  text edits (`modified` stays as-is). */
type RevertPlacementAction = {
  type: "revertPlacement";
  id: string;
  to: { day: number; week: number };
};

type SetSaveTargetAction = {
  type: "setSaveTarget";
  id: string;
  target: "personal" | "core";
};

type SetCellLayoutAction = {
  type: "setCellLayout";
  key: string;
  layout: CellLayout | null; // null = delete
};

// ── Section actions ──────────────────────────────────────────────────────

type SetSectionsAction = {
  type: "setSections";
  lessonId: string;
  next: LessonSectionContent[];
};

type ReorderSectionsAction = {
  type: "reorderSections";
  lessonId: string;
  activeId: string;
  overId: string;
};

type EditSectionAction = {
  type: "editSection";
  lessonId: string;
  sectionId: string;
  patch: Partial<LessonSectionContent>;
} & CoalesceFields;

type AddSectionAction = {
  type: "addSection";
  lessonId: string;
  heading?: string;
};

type RemoveSectionAction = {
  type: "removeSection";
  lessonId: string;
  sectionId: string;
};

type DuplicateSectionAction = {
  type: "duplicateSection";
  lessonId: string;
  sectionId: string;
};

type AddSectionResourceAction = {
  type: "addSectionResource";
  lessonId: string;
  sectionId: string;
  /** Full or partial new resource. `type` + `label` are required; `id` is
   *  minted if absent; every other field is optional and carries through. */
  resource: Partial<SectionResource> & {
    type: SectionResource["type"];
    label: string;
  };
};

type EditSectionResourceAction = {
  type: "editSectionResource";
  lessonId: string;
  sectionId: string;
  resourceId: string;
  patch: Partial<SectionResource>;
  coalesceKey?: string;
  coalesceTs?: number;
};

type RemoveSectionResourceAction = {
  type: "removeSectionResource";
  lessonId: string;
  sectionId: string;
  resourceId: string;
};

type MoveSectionResourceAction = {
  type: "moveSectionResource";
  lessonId: string;
  /** The section the resource is being dragged FROM. */
  sourceSectionId: string;
  /** The section being dropped INTO. */
  targetSectionId: string;
  resource: SectionResource;
};

type ToggleSectionWebsiteAction = {
  // NOTE: websiteVisible is local UI state (no undo needed) — see the
  // usePlanner() comment below for how views manage that separately.
  // This action is included for completeness / future persistence.
  type: "toggleSectionWebsite";
  lessonId: string;
  sectionId: string;
};

// ── Persistable section actions ────────────────────────────────────────────
// The section reducer actions whose RESULTING section list must be persisted to
// the backend so the edit survives a reload. Routed through a single helper
// (persistSectionAction) that re-applies the action to the current document and
// tees the resulting `present.sections[lessonId]` through `setSections` — so a
// reorder / add / remove / duplicate / resource-move / resource-add / -remove
// (which the reducer handles but had no durable persist verb) survives reload.
//
// WHY FULL-LIST REPLACE (not the granular source verbs): the source's
// `setSections` is the only section write that is robust to section-id DRIFT
// across the seam. `replace_lesson_sections` deletes + reinserts rows with
// DB-minted ids, so the UI's in-memory section ids never match the persisted
// ids after any persisted section mutation. The granular source verbs
// (addSectionResource/removeSectionResource) key on a single `sectionId`, so a
// follow-up resource edit using a now-stale UI id would silently miss the
// persisted row and be lost on reload. Routing EVERY section/resource mutation
// through the full current-section-list replace means nothing is ever keyed by a
// single section id across the seam — the whole resolved list is sent, matched
// by content + order, and a reload reconciles ids cleanly.

type PersistableSectionAction =
  | ReorderSectionsAction
  | AddSectionAction
  | RemoveSectionAction
  | DuplicateSectionAction
  | EditSectionAction
  | MoveSectionResourceAction
  | AddSectionResourceAction
  | RemoveSectionResourceAction
  // Edits to an EXISTING section resource persist too (audit: this one was
  // missed when the tee was introduced — the UI updated but the change was
  // lost on reload).
  | EditSectionResourceAction;

// ── History control actions ──────────────────────────────────────────────

type UndoAction = { type: "undo" };
type RedoAction = { type: "redo" };
/** Replace the whole document with a backend-hydrated one (planner Supabase
 *  seam). Resets undo/redo history — a hydrate is not an undoable edit.
 *  `hydration` records the resulting lifecycle state and `owner` records which
 *  auth owner the doc was hydrated for, so a later owner change can be detected
 *  and treated as not-ready (preventing a stale-owner flash). */
type HydrateAction = {
  type: "hydrate";
  doc: PlannerDoc;
  /** The catalog hydrated alongside the document, so lessons + sections +
   *  catalog land in ONE dispatch — there is never a frame where the lessons
   *  are live but the catalog is still stale (or vice versa). */
  catalog: PlannerCatalog;
  hydration: PlannerHydration;
  owner: string | null;
};
/** Update only the hydration lifecycle flag (e.g. flip to "loading" before an
 *  async hydrate begins) without touching the document or history. */
type SetHydrationAction = { type: "setHydration"; hydration: PlannerHydration };
/** Replace ONLY the catalog slice (subjects/units/standards/grade) without
 *  touching the document or the undo/redo history. Mirrors setHydration: a
 *  non-history side-channel. Used if the catalog ever needs to settle
 *  independently of a full hydrate; the slice is never part of undo/redo. */
type SetCatalogAction = { type: "setCatalog"; catalog: PlannerCatalog };
/** Merge a partial code→description map into the catalog's standards without
 *  touching the document/history. Used by the standards tagging picker so a
 *  freshly-tagged code (which may live OUTSIDE the grade's baseline catalog —
 *  the picker searches the teacher's full EFFECTIVE framework set) resolves to
 *  its wording via describeStandard immediately, with no reload. Additive: it
 *  only ever ADDS keys (existing descriptions win, so a hydrate never loses to
 *  a stale merge). */
type MergeStandardsAction = { type: "mergeStandards"; map: StandardsMap };
/** Insert a freshly-created lesson into the document (W3.7). The payload is
 *  the FULL Lesson RETURNED by the data source's createLesson — carrying the
 *  source-minted id — never an optimistic reducer-side uid. That ordering is
 *  the whole point: the duplicateLesson tee corrupted rows precisely because
 *  the backend minted an id ≠ the reducer's optimistic one (see the addLesson
 *  mutator below). Handled as a NON-HISTORY branch in historyReducer — the
 *  row already exists at the source when this dispatches, so an undo that
 *  removed it from the doc would silently desync from the backend. */
type AddLessonAction = { type: "addLesson"; lesson: Lesson };

/** Exported for the unit tests (tests/planner-store.test.ts) — runtime
 *  dispatch still flows only through the provider's mutator callbacks. */
export type PlannerAction =
  | MoveLessonAction
  | SetLessonStatusAction
  | EditLessonAction
  | DuplicateLessonAction
  | DuplicateWeekAction
  | SetSaveTargetAction
  | SetCellLayoutAction
  | BumpLessonAction
  | ArchiveLessonAction
  | UnarchiveLessonAction
  | RestoreLessonAction
  | RelocateLessonAction
  | RevertPlacementAction
  | SetSectionsAction
  | ReorderSectionsAction
  | EditSectionAction
  | AddSectionAction
  | RemoveSectionAction
  | DuplicateSectionAction
  | AddSectionResourceAction
  | EditSectionResourceAction
  | RemoveSectionResourceAction
  | MoveSectionResourceAction
  | ToggleSectionWebsiteAction
  | UndoAction
  | RedoAction
  | HydrateAction
  | SetHydrationAction
  | SetCatalogAction
  | MergeStandardsAction
  | AddLessonAction;

// ── Human labels for undo/redo tooltips ──────────────────────────────────

function labelFor(action: PlannerAction): string {
  switch (action.type) {
    case "moveLesson":
      return "Move lesson";
    case "setLessonStatus":
      return "Mark lesson";
    case "editLesson":
      return "Edit lesson";
    case "duplicateLesson":
      return "Duplicate lesson";
    case "duplicateWeek":
      return `Duplicate week ${action.sourceWeek}`;
    case "setSaveTarget":
      return "Save to " + action.target;
    case "setCellLayout":
      return "Arrange cell";
    case "bumpLesson":
      return "Bump lesson";
    case "archiveLesson":
      return "Archive lesson";
    case "unarchiveLesson":
      return "Unarchive lesson";
    case "restoreLesson":
      return "Restore lesson";
    case "relocateLesson":
      return "Relocate lesson";
    case "revertPlacement":
      return "Revert placement";
    case "setSections":
      return "Edit sections";
    case "reorderSections":
      return "Reorder sections";
    case "editSection":
      return "Edit section";
    case "addSection":
      return "Add section";
    case "removeSection":
      return "Remove section";
    case "duplicateSection":
      return "Duplicate section";
    case "addSectionResource":
      return "Add resource";
    case "editSectionResource":
      return "Edit resource";
    case "removeSectionResource":
      return "Remove resource";
    case "moveSectionResource":
      return "Move resource";
    case "toggleSectionWebsite":
      return "Toggle website";
    case "addLesson":
      // Unreachable today — addLesson early-returns in historyReducer as a
      // non-history action (W3.7) — kept so the label exists if the action
      // ever joins the undo stack.
      return "Add lesson";
    default:
      return "Edit";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build the initial section content for a lesson.
 *  Uses the default template; falls back to a single blank section if the
 *  template registry is missing or misconfigured. The lesson's own
 *  `resources` (the fixture lesson-level array) are threaded through so the
 *  Teach Resources panel + canvas — which read a lesson's resources off its
 *  sections via `getSections(lessonId)` — see real resources. Lazily-added
 *  lessons pass no resources and seed empty sections, as before.
 *
 *  Ids are re-minted DETERMINISTICALLY from the lesson id: this builder runs
 *  during SSR and again at client store init, and the section ids are painted
 *  into the DOM (the `data-flow-section` anchors the agenda navigator jumps
 *  to). Timestamp-based uid() ids diverge across the two passes — hydration
 *  flags the attribute and keeps the server ids, so navigator jumps looking
 *  up client ids find nothing. */
function buildInitialSections(
  lessonId: string,
  resources: LessonResource[] = [],
): LessonSectionContent[] {
  const template = LESSON_TEMPLATE_BY_ID[DEFAULT_LESSON_TEMPLATE_ID];
  let sections: LessonSectionContent[];
  if (!template) {
    const section = newLessonSection();
    section.resources = resources.map((r) => ({
      ...newSectionResource(r.type, r.label),
      ...r,
    }));
    sections = [section];
  } else {
    sections = instantiateSections(template, resources);
  }
  return sections.map((section, i) => ({
    ...section,
    id: `lsec-seed-${lessonId}-${i}`,
    resources: section.resources.map((resource, j) => ({
      ...resource,
      id: `res-seed-${lessonId}-${i}-${j}`,
    })),
  }));
}

/** Seed sections for every lesson in the initial fixture. Each lesson's
 *  fixture `resources` flow onto its sections (round-robin) so the Teach
 *  surface has real resources to render. */
function seedSections(
  lessons: Lesson[],
): Record<string, LessonSectionContent[]> {
  const result: Record<string, LessonSectionContent[]> = {};
  for (const lesson of lessons) {
    result[lesson.id] = buildInitialSections(lesson.id, lesson.resources);
  }
  return result;
}

/** Ensure a lesson has a sections entry; guards lazily-added lessons. */
function ensureSections(
  sections: Record<string, LessonSectionContent[]>,
  lessonId: string,
): LessonSectionContent[] {
  return sections[lessonId] ?? buildInitialSections(lessonId);
}

/** READ-ONLY synthetic-section fallback for the backend hydrate.
 *
 *  `getSectionsBatch` deliberately OMITS lessons that have no persisted
 *  `lesson_sections` rows (its contract: callers fall back). Without a fallback
 *  a section-less lesson's flat `resources` jsonb (loaded onto each Lesson by
 *  listLessons) would never surface after hydrate — the section UI would render
 *  an empty container even though the lesson carries resources. This fills the
 *  gap from the ALREADY-LOADED lessons (no extra round-trips): for every lesson
 *  the batch omitted, it synthesizes the default-template sections from the
 *  lesson's own `resources`, exactly as the flag-OFF seed (`seedSections`) does.
 *
 *  These sections are SYNTHETIC and READ-ONLY by construction: they only flow
 *  INTO the hydrated document for display. They are never written back to the
 *  backend here — the source's persisting mutators (setSections, …) run only on
 *  an explicit teacher edit, at which point the edited set is what persists. A
 *  lesson the teacher never touches keeps zero persisted section rows. */
function fillSyntheticSections(
  lessons: Lesson[],
  batched: Record<string, LessonSectionContent[]>,
): Record<string, LessonSectionContent[]> {
  const result: Record<string, LessonSectionContent[]> = { ...batched };
  for (const lesson of lessons) {
    if (result[lesson.id] === undefined) {
      result[lesson.id] = buildInitialSections(lesson.id, lesson.resources);
    }
  }
  return result;
}

/** Remove a lesson id from every slot in a CellLayout; prunes empty rows/slots. */
function removeIdFromLayout(layout: CellLayout, id: string): CellLayout {
  return layout
    .map((row) =>
      row
        .map((slot) => slot.filter((slotId) => slotId !== id))
        .filter((slot) => slot.length > 0),
    )
    .filter((row) => row.length > 0);
}

// ── Initial document ───────────────────────────────────────────────────────

const INITIAL_DOC: PlannerDoc = {
  lessons: [...LESSONS],
  sections: seedSections(LESSONS),
  cellLayouts: {},
};

/** An empty document — no lessons, no sections, no layouts. Used ONLY when the
 *  Supabase flag is ON to avoid showing mock/prior-user data while loading,
 *  for a signed-out / no-grade / empty-result / errored owner. Never used with
 *  the flag OFF (the prototype path always renders INITIAL_DOC). */
const EMPTY_DOC: PlannerDoc = {
  lessons: [],
  sections: {},
  cellLayouts: {},
};

/** The document the store paints on the FIRST server/client render, before any
 *  backend hydrate runs. With the Supabase flag OFF this is always the mock
 *  (INITIAL_DOC) — byte-identical to the prototype path. With the flag ON it is
 *  EMPTY_DOC, so the very first paint shows "nothing yet" instead of flashing
 *  mock fixtures or a prior owner's data before the hydrate effect resolves.
 *
 *  SSR-SAFE: isPlannerSupabaseConfigured() reads only NEXT_PUBLIC_* env vars,
 *  which are inlined identically into the server bundle and the client bundle,
 *  so this branch yields the same initial state on the server and on the first
 *  client render — no hydration mismatch. */
function pickInitialDoc(): PlannerDoc {
  return isPlannerSupabaseConfigured() ? EMPTY_DOC : INITIAL_DOC;
}

// ── Initial catalog ──────────────────────────────────────────────────────────

/** The catalog the store paints on the FIRST render with the Supabase flag OFF.
 *  It MUST reproduce exactly what views read from `lib/mock` today (R1/R2):
 *   • `subjects` = a copy of SUBJECTS (the 8 locked subjects, display order).
 *   • `units`    = the FULL-YEAR superset ALL_UNITS — the set SubjectView and
 *                  TimelineYear filter over. (NOT the active-8 UNITS map; the
 *                  active-unit-per-subject map is derived in the provider from
 *                  this superset and, under the flag OFF, pinned to the mock
 *                  UNITS map for byte-identical WeeklyGrid output.)
 *   • `standards`= the STANDARDS map (referential — describeStandard reads it).
 *   • `activeGradeId` = "g5" — the single mock grade (mirrors
 *                  plannerMockSource.getActiveGradeLevelId). */
const INITIAL_CATALOG: PlannerCatalog = {
  subjects: [...SUBJECTS],
  units: [...ALL_UNITS],
  standards: STANDARDS,
  activeGradeId: "g5",
};

/** An empty catalog — no subjects, no units, no standards, no grade. Used ONLY
 *  when the Supabase flag is ON to avoid showing mock catalog data while
 *  loading (and for a signed-out / no-grade / empty-result / errored owner).
 *  Never used with the flag OFF (the prototype path always renders
 *  INITIAL_CATALOG). Mirrors EMPTY_DOC's leak-guard role for the catalog. */
const EMPTY_CATALOG: PlannerCatalog = {
  subjects: [],
  units: [],
  standards: {},
  activeGradeId: null,
};

/** The catalog the store paints on the FIRST server/client render, before any
 *  backend hydrate runs. Mirrors `pickInitialDoc()` exactly: flag OFF → the mock
 *  catalog (byte-identical to the prototype path); flag ON → EMPTY_CATALOG, so
 *  the first paint shows "nothing yet" instead of flashing mock fixtures or a
 *  prior owner's catalog before the hydrate effect resolves.
 *
 *  SSR-SAFE for the same reason as pickInitialDoc(): isPlannerSupabaseConfigured()
 *  reads only NEXT_PUBLIC_* env vars, inlined identically server/client. */
function pickInitialCatalog(): PlannerCatalog {
  return isPlannerSupabaseConfigured() ? EMPTY_CATALOG : INITIAL_CATALOG;
}

/** The hydration lifecycle for the first render. Flag OFF → "ready" (the mock is
 *  the permanent document, nothing to load). Flag ON → "loading" (the backend
 *  hydrate effect will resolve it to ready/empty/error for the current owner). */
function pickInitialHydration(): PlannerHydration {
  return isPlannerSupabaseConfigured() ? "loading" : "ready";
}

const INITIAL_HISTORY: HistoryState = {
  past: [],
  present: pickInitialDoc(),
  future: [],
};

// ── Doc reducer ────────────────────────────────────────────────────────────
// Applies one action to a PlannerDoc, returning a new doc.
// Must be a pure function — no mutations, no side effects.

function applyDocAction(doc: PlannerDoc, action: PlannerAction): PlannerDoc {
  switch (action.type) {
    // ── Lesson actions ─────────────────────────────────────────────────

    case "moveLesson": {
      const lessons = doc.lessons.map((l) => {
        if (l.id !== action.id) return l;
        const nextDay = action.patch.day ?? l.day;
        const nextSubject = action.patch.subject ?? l.subject;
        const nextWeek = action.patch.week ?? l.week;
        // `time` (W3.8c cross-period re-time) is a content relabel applied
        // verbatim — mirroring editLesson's reducer, which spreads its patch
        // WITHOUT touching any flag. So `sameSlot` (and thus `moved`) stays
        // day/subject/week-based only: a time-only patch never sets `moved`.
        const nextTime = action.patch.time ?? l.time;
        const sameSlot =
          nextDay === l.day && nextSubject === l.subject && nextWeek === l.week;
        return {
          ...l,
          day: nextDay,
          subject: nextSubject,
          week: nextWeek,
          time: nextTime,
          moved: sameSlot
            ? l.moved
            : nextWeek !== l.week
              ? "across-weeks"
              : ("same-week" as const),
        };
      });

      // Prune the source cell's layout when the lesson moves to a new cell.
      const movedLesson = doc.lessons.find((l) => l.id === action.id);
      if (!movedLesson) return { ...doc, lessons };

      const srcKey = cellKey(movedLesson.subject, movedLesson.day);
      const tgtSubject = action.patch.subject ?? movedLesson.subject;
      const tgtDay = action.patch.day ?? movedLesson.day;
      const tgtKey = cellKey(tgtSubject, tgtDay);

      if (srcKey === tgtKey) return { ...doc, lessons };

      const nextLayouts = { ...doc.cellLayouts };
      if (nextLayouts[srcKey]) {
        const pruned = removeIdFromLayout(nextLayouts[srcKey], action.id);
        if (pruned.length === 0 || isTrivialLayout(pruned)) {
          delete nextLayouts[srcKey];
        } else {
          nextLayouts[srcKey] = pruned;
        }
      }
      return { ...doc, lessons, cellLayouts: nextLayouts };
    }

    case "setLessonStatus": {
      return {
        ...doc,
        lessons: doc.lessons.map((l) =>
          l.id === action.id ? { ...l, status: action.status } : l,
        ),
      };
    }

    case "editLesson": {
      return {
        ...doc,
        lessons: doc.lessons.map((l) =>
          l.id !== action.id ? l : { ...l, ...action.patch },
        ),
      };
    }

    case "duplicateLesson": {
      const source = doc.lessons.find((l) => l.id === action.id);
      if (!source) return doc;
      const copy: Lesson = {
        ...source,
        id: uid("lesson"),
        isPersonal: true,
        modified: false,
        moved: null,
        pendingMaster: false,
        commentCount: 0,
        unreadComments: 0,
      };
      const at = doc.lessons.findIndex((l) => l.id === action.id);
      const lessons = [
        ...doc.lessons.slice(0, at + 1),
        copy,
        ...doc.lessons.slice(at + 1),
      ];
      // Seed sections for the duplicate (deep copy of source sections).
      const sourceSections = ensureSections(doc.sections, action.id);
      const ts = Date.now().toString(36);
      let counter = 0;
      const copiedSections: LessonSectionContent[] = sourceSections.map(
        (s) => ({
          ...s,
          id: uid("lsec"),
          resources: s.resources.map((r) => {
            counter += 1;
            return { ...r, id: `res-${ts}-${counter}` };
          }),
        }),
      );
      return {
        ...doc,
        lessons,
        sections: { ...doc.sections, [copy.id]: copiedSections },
      };
    }

    case "addLesson": {
      // W3.7 — append the SOURCE-CREATED lesson (its id is already the real,
      // source-minted one; see AddLessonAction). Lessons live in a flat array
      // and every view filters/sorts by week/day, so appending places the
      // lesson correctly for its slot — mirroring how duplicateWeek's copies
      // land. Idempotence guard: a double dispatch (re-entry, StrictMode
      // replay) must not insert the same id twice.
      if (doc.lessons.some((l) => l.id === action.lesson.id)) return doc;
      return {
        ...doc,
        lessons: [...doc.lessons, action.lesson],
        // Seed the default-template sections from the lesson's own (empty)
        // resources — the same shape the mock source seeds and the reducer
        // uses for lazily-added lessons (ensureSections).
        sections: {
          ...doc.sections,
          [action.lesson.id]: buildInitialSections(
            action.lesson.id,
            action.lesson.resources,
          ),
        },
      };
    }

    case "duplicateWeek": {
      // Copy every lesson from sourceWeek into targetWeek (BIG-2).
      // Each copy gets a fresh id, isPersonal=true (personal copy), and
      // moved/modified/pendingMaster reset — matching duplicateLesson semantics.
      // Lessons already in targetWeek are left in place; this is an additive
      // operation so teachers can carry forward without losing prior changes.
      const sourceLessons = doc.lessons.filter(
        (l) => l.week === action.sourceWeek,
      );
      if (sourceLessons.length === 0) return doc;

      const copies: Lesson[] = sourceLessons.map((source) => ({
        ...source,
        id: uid("lesson"),
        week: action.targetWeek,
        isPersonal: true,
        modified: false,
        moved: null,
        pendingMaster: false,
        status: "not_done" as const,
        commentCount: 0,
        unreadComments: 0,
      }));

      // Seed sections for each copy (deep-copy source sections).
      const newSections: Record<string, LessonSectionContent[]> = {};
      const ts = Date.now().toString(36);
      let counter = 0;
      for (const [original, copy] of sourceLessons.map(
        (s, i) => [s, copies[i]] as const,
      )) {
        const sourceSections = ensureSections(doc.sections, original.id);
        newSections[copy.id] = sourceSections.map((sec) => ({
          ...sec,
          id: uid("lsec"),
          resources: sec.resources.map((r) => {
            counter += 1;
            return { ...r, id: `res-${ts}-${counter}` };
          }),
        }));
      }

      return {
        ...doc,
        lessons: [...doc.lessons, ...copies],
        sections: { ...doc.sections, ...newSections },
      };
    }

    case "setSaveTarget": {
      if (action.target !== "personal") return doc;
      return {
        ...doc,
        lessons: doc.lessons.map((l) =>
          l.id !== action.id ? l : { ...l, modified: true, isPersonal: true },
        ),
      };
    }

    case "setCellLayout": {
      const nextLayouts = { ...doc.cellLayouts };
      if (action.layout === null || action.layout.length === 0) {
        delete nextLayouts[action.key];
      } else {
        nextLayouts[action.key] = action.layout;
      }
      return { ...doc, cellLayouts: nextLayouts };
    }

    case "bumpLesson": {
      // Compute the next free instructional slot for this lesson's subject,
      // then delegate to the moveLesson reducer logic so moved/across-weeks
      // is set consistently and the source cell layout is pruned.
      const lesson = doc.lessons.find((l) => l.id === action.id);
      if (!lesson) return doc;

      const slot = nextInstructionalDay(
        lesson,
        doc.lessons,
        DEFAULT_SCHOOL_WEEK_CONFIG,
      );
      // No-op when no future slot is available in the data range.
      if (!slot) return doc;

      // Reuse the moveLesson reducer path to get consistent moved-flag handling
      // and layout pruning.
      return applyDocAction(doc, {
        type: "moveLesson",
        id: action.id,
        patch: { week: slot.week, day: slot.day },
      });
    }

    case "archiveLesson": {
      // Soft-delete: mark the lesson archived. Views must filter archived
      // lessons out of all visible surfaces (weekly grid, daily list, subject
      // view, year view). Undoable via unarchiveLesson.
      return {
        ...doc,
        lessons: doc.lessons.map((l) =>
          l.id === action.id ? { ...l, archived: true } : l,
        ),
      };
    }

    case "unarchiveLesson": {
      // Restore a soft-deleted lesson to visible surfaces.
      return {
        ...doc,
        lessons: doc.lessons.map((l) =>
          l.id === action.id ? { ...l, archived: false } : l,
        ),
      };
    }

    case "restoreLesson": {
      // Revert a personally-forked lesson back to the team's version.
      //
      // PROTOTYPE — reads the `Lesson.masterSnapshot` seam (the mock-fixture
      // capture of the team's values); Phase 1B replaces that source with
      // persisted fork lineage, same shape. When the lesson carries a
      // snapshot, "restore" must MEAN restore (roadmap-01 finding H1): the
      // captured content fields (title / objective / preview / standards —
      // via the pure, unit-tested snapshotRestorePatch) are written back AND
      // the captured placement (day / week) is re-applied through the
      // moveLesson delegation below. All of it happens inside this ONE
      // action, so the gesture stays one history step — one ⌘Z brings the
      // whole fork back — and the existing "Restored the team's version"
      // toast stays honest.
      //
      // Lessons WITHOUT a snapshot keep the previous flags-only behavior
      // (clear modified / moved / isPersonal, content untouched): there is
      // nothing captured to restore FROM, and refusing the action would
      // strand a teacher unable to clear stale fork flags on snapshot-less
      // lessons. Phase 1B's persisted lineage closes that gap for every
      // fork; until then the three-tier card signal is only fully truthful
      // where a snapshot exists.
      const lesson = doc.lessons.find((l) => l.id === action.id);
      if (!lesson) return doc;
      const snapshot = lesson.masterSnapshot;

      // Placement first, THROUGH the moveLesson reducer — the same
      // delegation bumpLesson / relocateLesson use — so the source cell's
      // CellLayout is pruned and slot handling stays consistent. moveLesson
      // sets `moved` ("same-week"/"across-weeks"); the flag reset below
      // overrides it to null, which is correct: after a restore the lesson
      // sits exactly where the team put it.
      const placed =
        snapshot &&
        (lesson.day !== snapshot.day || lesson.week !== snapshot.week)
          ? applyDocAction(doc, {
              type: "moveLesson",
              id: action.id,
              patch: { day: snapshot.day, week: snapshot.week },
            })
          : doc;

      return {
        ...placed,
        lessons: placed.lessons.map((l) =>
          l.id !== action.id
            ? l
            : {
                ...l,
                ...(snapshot ? snapshotRestorePatch(snapshot) : {}),
                modified: false,
                moved: null,
                isPersonal: false,
              },
        ),
      };
    }

    case "relocateLesson": {
      // Move (or copy-then-move) a lesson to a target slot.
      //
      // keepOriginal = false: move the source lesson to the target (behaves
      //   exactly like moveLesson — delegates to it for consistency).
      // keepOriginal = true: duplicate the source lesson first, then move
      //   the NEW copy to the target. The original stays in its current slot.
      //
      // Both paths use the moveLesson reducer so the moved / across-weeks
      // flag is set consistently and the source cell layout is pruned.

      if (!action.keepOriginal) {
        // Simple relocate — just a rename for moveLesson.
        return applyDocAction(doc, {
          type: "moveLesson",
          id: action.id,
          patch: action.target,
        });
      }

      // Copy-then-move: duplicate the lesson, then move the copy.
      const afterDup = applyDocAction(doc, {
        type: "duplicateLesson",
        id: action.id,
      });

      // The duplicate is inserted immediately after the source; find it by
      // scanning backwards from the source position for the newly inserted id.
      const srcIdx = afterDup.lessons.findIndex((l) => l.id === action.id);
      if (srcIdx === -1) return doc; // guard: source vanished (shouldn't happen)
      const copy = afterDup.lessons[srcIdx + 1];
      if (!copy) return doc; // guard: duplicate not found

      return applyDocAction(afterDup, {
        type: "moveLesson",
        id: copy.id,
        patch: action.target,
      });
    }

    case "revertPlacement": {
      // Scheduling-only fork revert in ONE step (FIX 4). Run the placement
      // through the moveLesson reducer — same delegation restore/bump/relocate
      // use — so the source cell's CellLayout is pruned and slot handling
      // stays consistent. moveLesson sets `moved` ("same-week"/"across-weeks");
      // we then force it back to null in the SAME pass, because reverting to
      // the captured placement means the lesson sits exactly where the team put
      // it (the move-arrow / stripe must reset immediately). CONTENT is left
      // untouched — `modified` and every text field stay as-is, so the
      // teacher's edits survive a scheduling-only revert.
      const lesson = doc.lessons.find((l) => l.id === action.id);
      if (!lesson) return doc;

      const placed = applyDocAction(doc, {
        type: "moveLesson",
        id: action.id,
        patch: { day: action.to.day, week: action.to.week },
      });

      return {
        ...placed,
        lessons: placed.lessons.map((l) =>
          l.id !== action.id ? l : { ...l, moved: null },
        ),
      };
    }

    // ── Section actions ────────────────────────────────────────────────

    case "setSections": {
      return {
        ...doc,
        sections: { ...doc.sections, [action.lessonId]: action.next },
      };
    }

    case "reorderSections": {
      const current = ensureSections(doc.sections, action.lessonId);
      const oldIndex = current.findIndex((s) => s.id === action.activeId);
      const newIndex = current.findIndex((s) => s.id === action.overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex)
        return doc;
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: arrayMove(current, oldIndex, newIndex),
        },
      };
    }

    case "editSection": {
      const current = ensureSections(doc.sections, action.lessonId);
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: current.map((s) =>
            s.id === action.sectionId ? { ...s, ...action.patch } : s,
          ),
        },
      };
    }

    case "addSection": {
      const current = ensureSections(doc.sections, action.lessonId);
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: [
            ...current,
            newLessonSection(action.heading ?? "New section"),
          ],
        },
      };
    }

    case "removeSection": {
      const current = ensureSections(doc.sections, action.lessonId);
      if (current.length <= 1) return doc; // guard: never remove the last section
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: current.filter((s) => s.id !== action.sectionId),
        },
      };
    }

    case "duplicateSection": {
      const current = ensureSections(doc.sections, action.lessonId);
      const idx = current.findIndex((s) => s.id === action.sectionId);
      if (idx === -1) return doc;
      const source = current[idx];
      const ts = Date.now().toString(36);
      let counter = 0;
      const copy: LessonSectionContent = {
        ...source,
        id: uid("lsec"),
        // " copy" suffix (W3.8 gate fix, mock parity): an identical heading
        // would give two sections the same accessible name — ambiguous for
        // AT users on both this editor's banners and /daily's phase rows.
        // Appended as a trailing TEXT node, safe after any rich-HTML heading.
        heading: `${source.heading} copy`,
        resources: source.resources.map((r) => {
          counter += 1;
          return { ...r, id: `res-${ts}-${counter}` };
        }),
      };
      const next = [...current];
      next.splice(idx + 1, 0, copy);
      return {
        ...doc,
        sections: { ...doc.sections, [action.lessonId]: next },
      };
    }

    case "addSectionResource": {
      const current = ensureSections(doc.sections, action.lessonId);
      const seed = newSectionResource(
        action.resource.type,
        action.resource.label,
      );
      const resource: SectionResource = {
        ...seed, // gives us a fresh id
        ...action.resource, // caller's fields win — type, label, url, etc.
        id: action.resource.id ?? seed.id,
      };
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: current.map((s) =>
            s.id === action.sectionId
              ? { ...s, resources: [...s.resources, resource] }
              : s,
          ),
        },
      };
    }

    case "editSectionResource": {
      const current = ensureSections(doc.sections, action.lessonId);
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: current.map((s) =>
            s.id === action.sectionId
              ? {
                  ...s,
                  resources: s.resources.map((r) =>
                    r.id === action.resourceId ? { ...r, ...action.patch } : r,
                  ),
                }
              : s,
          ),
        },
      };
    }

    case "removeSectionResource": {
      const current = ensureSections(doc.sections, action.lessonId);
      return {
        ...doc,
        sections: {
          ...doc.sections,
          [action.lessonId]: current.map((s) =>
            s.id === action.sectionId
              ? {
                  ...s,
                  resources: s.resources.filter(
                    (r) => r.id !== action.resourceId,
                  ),
                }
              : s,
          ),
        },
      };
    }

    case "moveSectionResource": {
      const current = ensureSections(doc.sections, action.lessonId);
      const { sourceSectionId, targetSectionId, resource } = action;
      // Mirror the exact semantics of handleResourceZoneDrop in lesson-flow.tsx:
      // remove from source, append to target (deduplicates if already present).
      const next = current.map((sec) => {
        if (sec.id === sourceSectionId && sec.id !== targetSectionId) {
          return {
            ...sec,
            resources: sec.resources.filter((r) => r.id !== resource.id),
          };
        }
        if (sec.id === targetSectionId) {
          const without = sec.resources.filter((r) => r.id !== resource.id);
          return { ...sec, resources: [...without, resource] };
        }
        return sec;
      });
      return {
        ...doc,
        sections: { ...doc.sections, [action.lessonId]: next },
      };
    }

    case "toggleSectionWebsite": {
      // websiteVisible is intentionally kept as local UI state in views
      // (no undo required), but we include this action for future persistence.
      // No document change — return doc as-is so the reducer stays pure.
      return doc;
    }

    default:
      return doc;
  }
}

// ── History reducer ────────────────────────────────────────────────────────
// Wraps applyDocAction with undo/redo and coalescing logic.

/** Exported (with `historyReducer`) for the unit tests — the reducer is a
 *  pure function, so tests drive it directly without mounting the provider. */
export interface HistoryReducerState {
  history: HistoryState;
  /** The coalesceKey of the last dispatched action (for burst detection). */
  lastCoalesceKey: string | null;
  /** Timestamp of the last dispatched action (ms). */
  lastCoalesceTs: number;
  /** The lastChange signal — updated on every mutation. */
  lastChange: LastChange | null;
  /** The load/empty/error lifecycle for the backend-sourced document. */
  hydration: PlannerHydration;
  /** The auth owner id the present document was hydrated for, or null for the
   *  flag-OFF mock / a signed-out empty doc. The provider compares this against
   *  the current owner to gate readiness — a mismatch means the doc on screen
   *  belongs to a prior owner and must not be treated as ready. */
  hydratedForOwner: string | null;
  /** The reference catalog (subjects/units/standards/grade). A SIBLING of
   *  `history` — it is replaced wholesale on hydrate/setCatalog and NEVER enters
   *  the undo/redo stacks (editing a lesson must not put the subject list on the
   *  undo stack). */
  catalog: PlannerCatalog;
}

const INITIAL_REDUCER_STATE: HistoryReducerState = {
  history: INITIAL_HISTORY,
  lastCoalesceKey: null,
  lastCoalesceTs: 0,
  lastChange: null,
  hydration: pickInitialHydration(),
  // Flag OFF → the mock belongs to no specific owner; null is correct and the
  // provider's owner-gating is bypassed under the flag (see effectiveHydration).
  hydratedForOwner: null,
  // Flag OFF → the mock catalog; flag ON → EMPTY_CATALOG until a hydrate lands.
  catalog: pickInitialCatalog(),
};

// Exported for the unit tests (tests/planner-store.test.ts): the reducer is
// pure (no mutation, no side effects), so coalescing / history-limit /
// section-guard behavior is testable without mounting the provider.
export function historyReducer(
  state: HistoryReducerState,
  action: PlannerAction,
): HistoryReducerState {
  // ── Undo ────────────────────────────────────────────────────────────
  if (action.type === "undo") {
    const { past, present, future } = state.history;
    if (past.length === 0) return state; // no-op

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const newFuture: HistoryEntry[] = [
      { doc: present, label: previous.label },
      ...future,
    ];

    // Determine which lessons changed so the view can scroll to them.
    const changedIds = findChangedLessonIds(present, previous.doc);

    return {
      ...state,
      history: { past: newPast, present: previous.doc, future: newFuture },
      lastCoalesceKey: null,
      lastCoalesceTs: 0,
      lastChange: {
        kind: "undo",
        lessonIds: changedIds,
      },
    };
  }

  // ── Redo ────────────────────────────────────────────────────────────
  if (action.type === "redo") {
    const { past, present, future } = state.history;
    if (future.length === 0) return state; // no-op

    const next = future[0];
    const newFuture = future.slice(1);
    const newPast: HistoryEntry[] = [
      ...past,
      { doc: present, label: next.label },
    ];

    const changedIds = findChangedLessonIds(present, next.doc);

    return {
      ...state,
      history: {
        past: newPast.slice(-HISTORY_LIMIT),
        present: next.doc,
        future: newFuture,
      },
      lastCoalesceKey: null,
      lastCoalesceTs: 0,
      lastChange: {
        kind: "redo",
        lessonIds: changedIds,
      },
    };
  }

  // ── Hydrate ──────────────────────────────────────────────────────────
  // Replace the whole document with the backend-loaded one and RESET history
  // (a hydrate isn't an undoable edit). Used only by the planner Supabase seam
  // on initial load; with the backend flag off this action never fires.
  if (action.type === "hydrate") {
    return {
      ...state,
      history: { past: [], present: action.doc, future: [] },
      lastCoalesceKey: null,
      lastCoalesceTs: 0,
      lastChange: null,
      hydration: action.hydration,
      hydratedForOwner: action.owner,
      // Catalog lands in the SAME dispatch as the document — no frame where the
      // lessons are live but the catalog is stale (or vice versa).
      catalog: action.catalog,
    };
  }

  // ── Set hydration ────────────────────────────────────────────────────
  // Flip only the lifecycle flag (no document/history change). Used to mark
  // "loading" the moment an owner change is detected, before the async hydrate
  // resolves. Never fires with the flag OFF.
  if (action.type === "setHydration") {
    if (state.hydration === action.hydration) return state; // no-op
    return { ...state, hydration: action.hydration };
  }

  // ── Set catalog ───────────────────────────────────────────────────────
  // Replace ONLY the catalog slice (no document/history change). Mirrors
  // setHydration as a non-history side-channel: spread `...state` so the
  // undo/redo stacks are untouched. Never fires with the flag OFF.
  if (action.type === "setCatalog") {
    return { ...state, catalog: action.catalog };
  }

  // ── Merge standards descriptions ──────────────────────────────────────
  // Fold a partial code→description map into the catalog's standards (no
  // document/history change — like setCatalog, a side-channel). EXISTING keys
  // win so a hydrate's authoritative wording is never clobbered by a later
  // merge; only brand-new codes (e.g. a tag from a framework outside the
  // grade's baseline catalog) are added. No-op when nothing new is present.
  if (action.type === "mergeStandards") {
    const incoming = action.map;
    let added = false;
    const merged: StandardsMap = { ...state.catalog.standards };
    for (const code in incoming) {
      if (!(code in merged)) {
        merged[code] = incoming[code];
        added = true;
      }
    }
    if (!added) return state;
    return { ...state, catalog: { ...state.catalog, standards: merged } };
  }

  // ── Add lesson (W3.7 — NON-HISTORY content change) ───────────────────
  // Insert the source-created lesson into the present doc WITHOUT pushing an
  // undo entry. DECISION (locked for this wave): adding a lesson is not
  // undoable — the row already exists at the data source when this action
  // dispatches (the source call IS the persistence), so an undo that removed
  // it from the doc would desync from the backend (the lesson would
  // resurrect on reload). Both history stacks need care (W3.7 audit #2 +
  // re-pass):
  //   • `future` MUST clear — like every content mutation, a new add
  //     invalidates the redo snapshots; they are full-doc captures that
  //     predate the source-created lesson, so redoing one would silently
  //     hide a row that still exists at the backend (audit repro: undo →
  //     add → redo made the fresh lesson vanish).
  //   • `past` MUST be RECONCILED, not left stale — the same action is
  //     applied to every past snapshot so any undo destination still
  //     contains the persisted lesson (mirror repro: add → undo hid it).
  //     The lesson exists at the backend regardless of undo position, so
  //     snapshots must stay truthful to persistence. Safe: applyDocAction's
  //     addLesson id-idempotence guard returns the same doc ref when the
  //     lesson is already present, and no undo entry is pushed (labels are
  //     action metadata, not doc-derived — nothing else in HistoryEntry
  //     needs syncing).
  if (action.type === "addLesson") {
    const nextDoc = applyDocAction(state.history.present, action);
    if (nextDoc === state.history.present) return state; // idempotence no-op
    return {
      ...state,
      history: {
        ...state.history,
        past: state.history.past.map((entry) => ({
          ...entry,
          doc: applyDocAction(entry.doc, action),
        })),
        present: nextDoc,
        future: [],
      },
      lastCoalesceKey: null,
      lastCoalesceTs: 0,
      // lastChange drives scrollPlannerItemIntoView in the views, so the
      // fresh row scrolls into view exactly like any other mutation.
      lastChange: { kind: "addLesson", lessonIds: [action.lesson.id] },
    };
  }

  // ── Content mutations ────────────────────────────────────────────────
  const label = labelFor(action);
  const nextDoc = applyDocAction(state.history.present, action);

  // Derive lastChange before touching history.
  const lastChange = buildLastChange(action);

  // First-fork detection (roadmap 02): both the previous doc (present) and
  // the next doc are in scope here, so this is the one place that can see an
  // affected lesson transition from unforked to personally forked by THIS
  // action. Only Personal-mode flows ever set the modified+isPersonal pair on
  // an existing lesson (the lazy fork — e.g. setSaveTarget "personal");
  // Master/Team-mode writes never touch the forking metadata, so a detected
  // transition implies Personal mode. setLessonStatus rewrites only `status`,
  // so completion can never trip this (CLAUDE.md: completion never forks).
  if (
    detectFirstFork(
      state.history.present.lessons,
      nextDoc.lessons,
      lastChange.lessonIds,
    )
  ) {
    lastChange.firstFork = true;
  }

  // ── Coalescing check ─────────────────────────────────────────────────
  // If the incoming action has a coalesceKey AND it matches the previous
  // key AND it fired within COALESCE_WINDOW_MS, update present in place
  // without pushing a new past entry. This collapses a typing burst into
  // a single undo step.
  // The new editSectionResource action makes both fields optional, so the
  // `in` check returns true even when the property is `undefined` — coerce
  // through the null/now() defaults to keep downstream types strict.
  const coalesceKey =
    "coalesceKey" in action ? (action.coalesceKey ?? null) : null;
  const coalesceTs =
    "coalesceTs" in action ? (action.coalesceTs ?? Date.now()) : Date.now();

  const shouldCoalesce =
    coalesceKey !== null &&
    coalesceKey === state.lastCoalesceKey &&
    coalesceTs - state.lastCoalesceTs <= COALESCE_WINDOW_MS;

  if (shouldCoalesce) {
    // Apply change to present in-place — no new past entry. Carry the hydration
    // lifecycle + hydrated-for owner through unchanged: an edit is not a load.
    return {
      ...state,
      history: { ...state.history, present: nextDoc },
      lastCoalesceKey: coalesceKey,
      lastCoalesceTs: coalesceTs,
      lastChange,
    };
  }

  // ── Normal push ──────────────────────────────────────────────────────
  const newPast: HistoryEntry[] = [
    ...state.history.past,
    { doc: state.history.present, label },
  ].slice(-HISTORY_LIMIT);

  return {
    ...state,
    history: {
      past: newPast,
      present: nextDoc,
      future: [], // any new action clears the redo stack
    },
    lastCoalesceKey: coalesceKey,
    lastCoalesceTs: coalesceTs,
    lastChange,
  };
}

// ── Helpers for reducer ──────────────────────────────────────────────────

/** Find lesson ids whose shape changed between two docs (for scroll signals).
 *  Compares both lessons (object identity) AND sections (array identity) so
 *  that undo/redo of section-only mutations (editSection, addSection, etc.)
 *  still produces a non-empty lessonIds array for scroll-into-view effects. */
function findChangedLessonIds(a: PlannerDoc, b: PlannerDoc): string[] {
  const ids = new Set<string>();

  // Lesson-level changes (moved, status, title, etc.)
  const bById = Object.fromEntries(b.lessons.map((l) => [l.id, l]));
  for (const lesson of a.lessons) {
    if (lesson !== bById[lesson.id]) ids.add(lesson.id);
  }
  for (const lesson of b.lessons) {
    if (!a.lessons.find((l) => l.id === lesson.id)) ids.add(lesson.id);
  }

  // Section-level changes (edit, add, remove, reorder, resource ops).
  // When only sections changed the lessons arrays are identical — check
  // the sections record too so scroll signals work after section undo/redo.
  const allLessonIds = new Set([
    ...Object.keys(a.sections),
    ...Object.keys(b.sections),
  ]);
  for (const id of allLessonIds) {
    if (a.sections[id] !== b.sections[id]) ids.add(id);
  }

  return [...ids];
}

/** Build a lastChange signal from a dispatched action. */
function buildLastChange(action: PlannerAction): LastChange {
  switch (action.type) {
    case "moveLesson":
    case "setLessonStatus":
    case "editLesson":
    case "duplicateLesson":
    case "setSaveTarget":
    case "bumpLesson":
    case "archiveLesson":
    case "unarchiveLesson":
    case "restoreLesson":
    case "relocateLesson":
    case "revertPlacement":
      return { kind: action.type, lessonIds: [action.id] };

    case "duplicateWeek":
      return { kind: action.type, lessonIds: [] };

    case "setCellLayout":
      return { kind: action.type, lessonIds: [] };

    case "setSections":
    case "reorderSections":
    case "addSection":
    case "removeSection":
      return { kind: action.type, lessonIds: [action.lessonId] };

    case "editSection":
      return {
        kind: action.type,
        lessonIds: [action.lessonId],
        sectionId: action.sectionId,
      };

    case "duplicateSection":
      return {
        kind: action.type,
        lessonIds: [action.lessonId],
        sectionId: action.sectionId,
      };

    case "addSectionResource":
    case "editSectionResource":
    case "removeSectionResource":
      return {
        kind: action.type,
        lessonIds: [action.lessonId],
        sectionId: action.sectionId,
      };

    case "moveSectionResource":
      return {
        kind: action.type,
        lessonIds: [action.lessonId],
      };

    case "toggleSectionWebsite":
      return {
        kind: action.type,
        lessonIds: [action.lessonId],
        sectionId: action.sectionId,
      };

    default:
      return { kind: (action as PlannerAction).type, lessonIds: [] };
  }
}

// ── Context & hook ─────────────────────────────────────────────────────────

/** The full public API of the planner store returned by usePlanner(). */
export interface PlannerValue {
  // ── Selectors ──────────────────────────────────────────────────────────
  /** All lessons across all grades and weeks. */
  lessons: Lesson[];
  /** Look up a single lesson by id. Returns undefined if not found. */
  getLesson: (id: string) => Lesson | undefined;
  /** Get the ordered section content array for a lesson. */
  getSections: (lessonId: string) => LessonSectionContent[];
  /** Per-cell arranged layouts (subject:day → CellLayout). */
  cellLayouts: Record<string, CellLayout>;

  // ── Lesson mutation actions ────────────────────────────────────────────
  /**
   * Move a lesson to a new day, subject, or week.
   * Sets `moved` to "same-week" or "across-weeks" as appropriate.
   * Also prunes the source cell's CellLayout when the lesson leaves a cell.
   * `time` (W3.8c) re-labels the lesson's time slot for a cross-period move on
   * the Week edit board — a CONTENT relabel that never sets `moved`. It applies
   * reducer-locally ONLY (no persist tee: `time` is unmodelled in the DB and a
   * time-only updateLesson call would spuriously fork — see the mutator body).
   */
  moveLesson: (
    id: string,
    patch: { day?: number; subject?: SubjectId; week?: number; time?: string },
  ) => void;
  /**
   * Set a lesson's completion status (not_done / done / carried / skipped / partial).
   * Marking done never forks the lesson — that is an intentional product rule.
   */
  setLessonStatus: (id: string, status: LessonStatus) => void;
  /**
   * Apply an arbitrary patch to a lesson's top-level fields.
   * For text fields (title, objective, etc.) pass coalesceKey + coalesceTs
   * so rapid edits are collapsed into a single undo step.
   * coalesceKey format: "lesson:<lessonId>:<field>" (e.g. "lesson:m-w11-1:title").
   */
  editLesson: (
    id: string,
    patch: Partial<Lesson>,
    coalesce?: { key: string; ts: number },
  ) => void;
  /** Duplicate a lesson (inserts immediately after source; marks isPersonal). */
  duplicateLesson: (id: string) => void;
  /**
   * Copy all lessons from `sourceWeek` into `targetWeek` (BIG-2 carry-over).
   * Lessons already in the target week are preserved — this is additive.
   * Each copy gets a fresh id, isPersonal=true, and status reset to not_done.
   * Fully undoable (one undo step labelled "Duplicate week N").
   */
  duplicateWeek: (sourceWeek: number, targetWeek: number) => void;
  /**
   * Create a brand-new PERSONAL lesson on a week/day slot (W3.7 — the store's
   * first real create; the daily add-lesson affordances call this).
   * AWAIT-THEN-DISPATCH, the REVERSE of the optimistic mutators above, and
   * deliberately so: it awaits the data source's createLesson (mock resolves
   * instantly; Supabase inserts a personal_authored_lessons row) and then
   * dispatches the RETURNED lesson with its source-minted id. No optimistic
   * uid, no persist() tee — the source call IS the persistence. (The
   * optimistic-uid + fire-and-forget pattern is FORBIDDEN here: it corrupted
   * rows for duplicateLesson — see that mutator's finding #10 note.)
   * Defaults: title "New lesson", no unit, empty objective. `objective`
   * rides INSIDE the create (W3.7 audit #5) — it reaches the source's
   * createLesson atomically instead of a fire-and-forget editLesson tee
   * that could silently drop it. Resolves to the created lesson so
   * callers can select/open it, or null on failure (never throws into the
   * UI). NOT undoable this wave — see the reducer's addLesson branch.
   */
  addLesson: (input: {
    subject: Lesson["subject"];
    week: number;
    day: number;
    title?: string;
    objective?: string;
  }) => Promise<Lesson | null>;
  /**
   * Record whether a save was targeting personal or core.
   * "personal" sets modified=true and isPersonal=true (lazy fork).
   * "core" is a no-op until the Master write flow lands.
   */
  setSaveTarget: (id: string, target: "personal" | "core") => void;
  /**
   * Replace or delete a cell's arrangement layout.
   * Pass layout=null to revert the cell to the default CardStack view.
   */
  setCellLayout: (key: string, layout: CellLayout | null) => void;
  /**
   * Move a lesson to its next instructional day for the same subject.
   * Skips to the next free slot using the configured school week (default:
   * Sun–Thu, dayCount=5). If the lesson is already on the last day of the
   * week, it wraps to the same day of the next week.
   * No-op when no future slot is available in the data range.
   */
  bumpLesson: (id: string) => void;
  /**
   * Soft-delete a lesson by setting lesson.archived = true.
   * Views must filter archived lessons out of all visible surfaces
   * (weekly grid, daily list, subject view, year view).
   * Undoable via unarchiveLesson + the store's existing history stack.
   */
  archiveLesson: (id: string) => void;
  /** Restore an archived lesson. Pair with archiveLesson for the undo toast. */
  unarchiveLesson: (id: string) => void;
  /**
   * Revert a personally-modified lesson back to its master/core state.
   * Sets lesson.modified = false, lesson.moved = null, lesson.isPersonal = false.
   * NOTE: content fields (title, objective, etc.) are NOT reverted — the
   * master snapshot is not yet in the data model. This will be extended
   * when snapshots land with the Supabase backend.
   */
  restoreLesson: (id: string) => void;
  /**
   * Relocate a lesson to a target day/subject/week.
   * - keepOriginal = false → behaves like moveLesson: the source is updated.
   * - keepOriginal = true  → duplicates the lesson first, then moves the
   *   NEW copy to the target. The original stays put.
   * Both paths use the existing moveLesson reducer for the placement so
   * the moved/across-weeks flag is set consistently. Undoable.
   */
  relocateLesson: (
    id: string,
    target: { day?: number; subject?: SubjectId; week?: number },
    keepOriginal: boolean,
  ) => void;
  /**
   * Revert ONLY a lesson's placement to a captured day/week in ONE undoable
   * step (fork-diff scheduling revert — FIX 4). Applies the move AND clears
   * `moved` in a single reducer pass, so one ⌘Z brings the placement back —
   * matching the per-field revert tooltip's singular "Undo with ⌘Z". Content
   * fields stay untouched (a scheduling-only revert keeps the teacher's text).
   * Tees persistence the SAME way moveLesson does (resolved {week,day} via the
   * Personal | Team-Curriculum save target), so the reverted placement
   * survives reload in backend mode. The reducer-local `moved` flag is NOT
   * persisted (it is not a LessonMoveTarget field).
   */
  revertPlacement: (id: string, to: { day: number; week: number }) => void;

  // ── Section mutation actions ───────────────────────────────────────────
  /**
   * Replace the entire section array for a lesson.
   * Used by LessonFlow for bulk operations (e.g. reset-to-baseline-order).
   */
  setSections: (lessonId: string, next: LessonSectionContent[]) => void;
  /** Reorder sections via dnd-kit's activeId / overId pattern. */
  reorderSections: (lessonId: string, activeId: string, overId: string) => void;
  /**
   * Patch one section's fields.
   * For heading/body edits pass coalesce so typing bursts collapse to one step.
   * coalesceKey format: "section:<lessonId>:<sectionId>:<field>".
   */
  editSection: (
    lessonId: string,
    sectionId: string,
    patch: Partial<LessonSectionContent>,
    coalesce?: { key: string; ts: number },
  ) => void;
  /** Add a blank section at the end of a lesson's section list. */
  addSection: (lessonId: string, heading?: string) => void;
  /** Remove a section (no-op if it is the last one). */
  removeSection: (lessonId: string, sectionId: string) => void;
  /** Duplicate a section, inserting the copy immediately after the original. */
  duplicateSection: (lessonId: string, sectionId: string) => void;
  /** Add a resource to a section. Pass `type` + `label` minimally; carry
   *  through `url`, `provider`, `displayMode`, etc. for real embeds. */
  addSectionResource: (
    lessonId: string,
    sectionId: string,
    resource: Partial<SectionResource> & {
      type: SectionResource["type"];
      label: string;
    },
  ) => void;
  /** Patch a section resource (e.g. flip a link's displayMode). Coalesced
   *  under `editResource:<lessonId>:<sectionId>:<resourceId>`. */
  editSectionResource: (
    lessonId: string,
    sectionId: string,
    resourceId: string,
    patch: Partial<SectionResource>,
  ) => void;
  /** Remove a resource chip from a section. */
  removeSectionResource: (
    lessonId: string,
    sectionId: string,
    resourceId: string,
  ) => void;
  /** Move a resource chip from one section to another (native HTML5 drag drop). */
  moveSectionResource: (
    lessonId: string,
    sourceSectionId: string,
    targetSectionId: string,
    resource: SectionResource,
  ) => void;
  /**
   * Toggle the website-preview panel for a section.
   * NOTE: websiteVisible is local UI state; this action is provided for
   * consistency and future persistence. Views may still keep their own
   * boolean state for the actual show/hide if they need isolation.
   */
  toggleSectionWebsite: (lessonId: string, sectionId: string) => void;

  // ── History ────────────────────────────────────────────────────────────
  /** Revert to the previous document state. No-op if the past stack is empty. */
  undo: () => void;
  /** Re-apply the next document state. No-op if the future stack is empty. */
  redo: () => void;
  /** True when there is at least one step available to undo. */
  canUndo: boolean;
  /** True when there is at least one step available to redo. */
  canRedo: boolean;
  /**
   * The number of undoable steps currently on the past stack (= past.length).
   * ADDITIVE — the UndoToastBridge's batch-detection seam (§4a review M2):
   * a single dispatch advances this by exactly 1, while a bulk gesture that
   * dispatches N actions in one batch (e.g. WeeklyGrid.handleBulkMove)
   * advances it by N. The bridge compares successive values to detect a
   * multi-entry advance and suppress a misleading single-step undo toast.
   * Note: at HISTORY_LIMIT the past stack is truncated, so an observed jump
   * can undercount — acceptable until item 06's real batch undo lands.
   */
  historyDepth: number;
  /**
   * The human label of the action that WILL be undone next, or null.
   * Use this to render tooltip text like "Undo Move lesson".
   */
  undoLabel: string | null;
  /**
   * The human label of the action that WILL be redone next, or null.
   * Use this to render tooltip text like "Redo Add section".
   */
  redoLabel: string | null;

  // ── Scroll signal ──────────────────────────────────────────────────────
  /**
   * Set on every mutation AND on undo/redo. The object identity changes on
   * every dispatch so views can key effects on it:
   *   useEffect(() => { scrollPlannerItemIntoView(lastChange.lessonIds[0]); },
   *             [lastChange]);
   */
  lastChange: LastChange | null;

  // ── Hydration lifecycle ─────────────────────────────────────────────────
  /**
   * The load/empty/error lifecycle of the (backend-sourced) document.
   *
   * • With the Supabase flag OFF this is permanently "ready" — the mock
   *   fixtures are the document and there is nothing to load.
   * • With the flag ON it is "loading" on the first paint (and whenever the
   *   auth owner changes), then settles to "ready" (lessons loaded), "empty"
   *   (no grade / no lessons / signed out), or "error" (hydrate threw).
   *
   * Views should render a loading or empty state instead of an ambiguous blank
   * when this is not "ready". It is owner-keyed: if the auth owner changes, it
   * reverts to "loading" until the new owner's document hydrates, so a teacher
   * never sees the previous owner's lessons.
   */
  hydration: PlannerHydration;

  // ── Catalog (reference data — never undoable) ───────────────────────────
  // The grade's read-only reference data, routed through the store so views
  // stop importing the `lib/mock` catalogs directly. ADDITIVE: every field
  // below is new — no existing PlannerValue field changed. With the Supabase
  // flag OFF these reproduce exactly what views read from `lib/mock` today
  // (see PARITY notes at each field); with the flag ON they come from the
  // backend hydrate (EMPTY until the owner's catalog loads — never mock).
  /**
   * The grade's subjects, in display order. Flag OFF = a copy of SUBJECTS.
   * The subject→color mapping is locked team-wide; this is the ordered list
   * views iterate (left filter rail, subject view, year roadmap).
   */
  subjects: Subject[];
  /**
   * The FULL-YEAR unit superset for the grade — every unit any lesson may
   * reference. Flag OFF = a copy of ALL_UNITS. Views that show all units
   * (SubjectView, TimelineYear) filter THIS by subject. NOT the active-unit
   * map — see `activeUnitBySubject` for the per-subject "current" unit.
   */
  units: Unit[];
  /** Unit lookup by unit id, derived from `units` (mirrors mock UNIT_BY_ID). */
  unitById: Record<string, Unit>;
  /** Subject lookup by subject id, derived from `subjects`. */
  subjectById: Record<SubjectId, Subject>;
  /**
   * The active unit per subject — the single "current" unit a subject column
   * shows (WeeklyGrid `UNITS[subjectId]`, left filter rail).
   *
   * Flag OFF: pinned to the mock UNITS map EXACTLY (byte-identical to what
   * WeeklyGrid reads today). Flag ON: derived from `units` — see the provider
   * `useMemo` for the derivation (first unit per subject as a safe default;
   * CURRENT_WEEK is out of scope, see the TODO there).
   */
  activeUnitBySubject: Record<SubjectId, Unit | undefined>;
  /** Standards map (code → description). Flag OFF = STANDARDS. */
  standards: StandardsMap;
  /**
   * Look up a standard's description by code; returns the code itself when
   * unknown. Flag OFF this matches the mock `describeStandard` exactly. Derived
   * from `standards` so it tracks the hydrated catalog under the flag.
   */
  describeStandard: (code: string) => string;
  /**
   * Merge freshly-resolved code→description pairs into the catalog's standards
   * map (additive; existing keys win). The standards tagging picker calls this
   * when a teacher tags a standard from a framework OUTSIDE the grade's baseline
   * catalog, so describeStandard resolves its wording instantly without a reload.
   * No-op with the Supabase flag OFF (the mock catalog already describes every
   * mock code) and a no-op when nothing new is present.
   */
  mergeStandards: (map: StandardsMap) => void;
  /**
   * The resolved active grade id (the mock "g5" slug under the flag OFF, the
   * grade uuid under the flag ON), or null when no grade is resolved.
   */
  activeGradeId: string | null;
}

const PlannerContext = createContext<PlannerValue | null>(null);

/** Read the planner store. Throws if called outside a <PlannerProvider>. */
export function usePlanner(): PlannerValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) {
    throw new Error("usePlanner must be used within a <PlannerProvider>");
  }
  return ctx;
}

// ── Data-readiness (the honesty signal for empty states) ────────────────────
// Collapses the five-state `hydration` into the three cases an empty-state
// renderer actually needs to tell apart. The whole point is that "the document
// is empty" and "the document has not loaded yet" are DIFFERENT — conflating
// them is what makes a still-loading planner render "No lessons this week" (and,
// worse, "All caught up!") for the 11–16s the Supabase hydrate chain takes.
//
//   pending → hydrate in flight; show a skeleton, never an empty message.
//   error   → the hydrate threw; the store keeps an empty document mounted, so
//             WITHOUT this branch a backend failure reads as "nothing planned".
//             This gets its own copy, not the empty state.
//   settled → "ready" or a genuinely-empty "empty"; render the real empty state.
//
// Flag OFF (mock/v1) is permanently "ready" via effectiveHydration, so this is a
// no-op there and cannot regress the prototype path.
export type PlannerDataState = "pending" | "error" | "settled";

/** Pure hydration → data-state mapping. Exported so it can be unit-tested
 *  without a provider; the hook is a one-line wrapper over it. */
export function plannerDataStateFromHydration(
  hydration: PlannerHydration,
): PlannerDataState {
  if (hydration === "idle" || hydration === "loading") return "pending";
  if (hydration === "error") return "error";
  return "settled"; // "ready" | "empty"
}

export function usePlannerDataState(): PlannerDataState {
  return plannerDataStateFromHydration(usePlanner().hydration);
}

// ── Provider-optional catalog hook ─────────────────────────────────────────
// The reference-data slice (subjects/units/standards/grade + lookups), readable
// WITHOUT a <PlannerProvider> in scope. The strict usePlanner() throws when no
// provider wraps the consumer; but LessonCard + its parts also render in
// /settings/appearance as a live theme PREVIEW, where there is NO
// PlannerProvider — calling usePlanner() there would throw. Those callsites only
// need the catalog (subjectById / describeStandard), so this hook returns the
// catalog from context WHEN a provider exists and a mock fallback when one does
// NOT. The fallback reproduces exactly what the card read from `lib/mock` before
// the catalog was routed through the store, so the no-provider preview is
// unchanged AND flag-OFF (with a provider) stays byte-identical (the provider's
// catalog under the flag OFF is the same mock data — see INITIAL_CATALOG).
//
// This hook is ADDITIVE: usePlanner() keeps throwing for the strict consumers
// (views that genuinely require the full store). Only catalog-only callsites
// that must survive a no-provider render should use this.

/** The catalog surface readable with or without a <PlannerProvider>. A strict
 *  subset of PlannerValue's catalog fields — never the document or mutators. */
export interface CatalogValue {
  subjects: Subject[];
  units: Unit[];
  unitById: Record<string, Unit>;
  subjectById: Record<SubjectId, Subject>;
  activeUnitBySubject: Record<SubjectId, Unit | undefined>;
  standards: StandardsMap;
  describeStandard: (code: string) => string;
  activeGradeId: string | null;
}

/** The mock catalog fallback, built ONCE at module load from `lib/mock`. Used
 *  when useCatalogOptional() runs with no <PlannerProvider> (settings preview).
 *  Mirrors what LessonCard/parts imported from `lib/mock` directly before the
 *  catalog was routed through the store, so a no-provider render is unchanged.
 *
 *  `unitById` / `activeUnitBySubject` reproduce the mock maps exactly:
 *  `unitById` indexes the FULL-YEAR superset (ALL_UNITS, like UNIT_BY_ID), and
 *  `activeUnitBySubject` is the active-unit map (mock UNITS), matching the
 *  provider's flag-OFF derivation. */
const MOCK_CATALOG_FALLBACK: CatalogValue = {
  subjects: SUBJECTS as Subject[],
  units: ALL_UNITS as Unit[],
  unitById: Object.fromEntries(ALL_UNITS.map((u) => [u.id, u])) as Record<
    string,
    Unit
  >,
  subjectById: SUBJECT_BY_ID,
  activeUnitBySubject: UNITS,
  standards: STANDARDS,
  describeStandard: mockDescribeStandard,
  activeGradeId: "g5",
};

/**
 * Provider-OPTIONAL catalog accessor. Returns the planner store's catalog when a
 * <PlannerProvider> is in scope; returns the mock catalog fallback when one is
 * NOT (e.g. the Settings → Appearance lesson-card preview, which mounts cards
 * with no provider). Never throws — the whole point is no-provider safety.
 */
export function useCatalogOptional(): CatalogValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) return MOCK_CATALOG_FALLBACK;
  // A provider is in scope: surface its catalog slice. (Under the flag OFF this
  // IS the same mock data; under the flag ON it is the hydrated backend catalog.)
  return {
    subjects: ctx.subjects,
    units: ctx.units,
    unitById: ctx.unitById,
    subjectById: ctx.subjectById,
    activeUnitBySubject: ctx.activeUnitBySubject,
    standards: ctx.standards,
    describeStandard: ctx.describeStandard,
    activeGradeId: ctx.activeGradeId,
  };
}

// ── Provider ───────────────────────────────────────────────────────────────

interface PlannerProviderProps {
  children: ReactNode;
}

/** Provides the planner store to the entire planner shell. Mount inside
 *  <AppStateProvider> in app/(planner)/layout.tsx. */
export function PlannerProvider({ children }: PlannerProviderProps): ReactNode {
  const [state, dispatch] = useReducer(historyReducer, INITIAL_REDUCER_STATE);

  // Keep a stable ref to dispatch so useCallback deps don't bloat.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // ── Identity from auth (NOT the mock slug) ─────────────────────────────
  // RLS needs the real auth uid (a uuid), not the mock `ME.id` slug. The uid
  // already lives in app-state's `currentUser.id`, hydrated from the live
  // Supabase session (null while loading / signed out). AppStateProvider wraps
  // PlannerProvider in app/(planner)/layout.tsx, so reading it here is safe —
  // no provider reorder needed. We stash it in a ref so the persist callbacks
  // (kept stable on `[persist]`) always read the latest uid without
  // re-creating on every auth change.
  const { currentUser, editMode } = useAppState();
  const ownerIdRef = useRef<string | null>(currentUser.id);
  ownerIdRef.current = currentUser.id;

  // ── Resolved save target (#14) ───────────────────────────────────────────
  // The top-bar Personal | Team-Curriculum toggle lives in app-state as
  // `editMode` ("personal" | "master"). It maps to the source's SaveTarget:
  // "master" → "core" (an AUTHORIZED write to the SHARED Team Curriculum row),
  // "personal" → "personal" (the default lazy-fork). Stashed in a ref so the
  // persist callbacks (kept stable on `[persist]`) read the latest target
  // without re-creating on every mode flip. Completion (setLessonStatus) never
  // uses this — it is always per-teacher (CLAUDE.md §2). With the Supabase flag
  // OFF the save target never reaches a mutator that branches on it (persist is
  // a no-op), so flag-OFF behavior is byte-identical.
  const saveTargetRef = useRef<"personal" | "core">(
    editMode === "master" ? "core" : "personal",
  );
  saveTargetRef.current = editMode === "master" ? "core" : "personal";

  // The resolved grade uuid, captured during hydrate. createLesson needs a real
  // grade uuid for the row it writes (the reducer never carries one). Null until
  // a hydrate resolves it; a create attempted before then skips persistence (the
  // optimistic reducer row stands and a later reload re-reads the backend).
  const gradeLevelIdRef = useRef<string | null>(null);

  // ── Backend hydration (planner Supabase seam) ──────────────────────────
  // When NEXT_PUBLIC_PLANNER_USE_SUPABASE=1, the document is sourced ENTIRELY
  // from the backend for the CURRENT auth owner — the mock fixtures are never
  // shown under the flag. With the flag OFF this effect is a no-op and the
  // store renders the mock fixtures exactly as before (byte-identical).
  //
  // Leak guard (finding #4): under the flag we must never show mock data nor a
  // prior owner's data. So:
  //   • The effect re-runs whenever the owner id changes (added to deps).
  //   • It resets to EMPTY_DOC synchronously at the top of every run, BEFORE
  //     awaiting, so stale data from a previous owner / the mock seed is gone
  //     while the new owner's lessons load.
  //   • A null owner (signed out / session not resolved) loads EMPTY_DOC — not
  //     the mock — and stops.
  //   • A null grade, an empty result, or any error loads EMPTY_DOC — never the
  //     mock LESSONS — so another teacher's data / Grade-5 fixtures can't leak.
  // Hydration resets undo/redo (a load is not an undoable edit); EMPTY_DOC is
  // hydrated the same way so the history baseline is the empty doc, not stale
  // mock content.
  const ownerId = currentUser.id;
  // Multi-workspace re-hydrate trigger (flag-gated; OFF path inert). The epoch
  // bumps when the workspace switcher broadcasts WORKSPACE_CHANGED_EVENT, so
  // the hydrate effect below re-runs against the NEW active workspace's grade
  // (getActiveGradeLevelId resolves via auth_teacher_school_id under the flag).
  // The useState itself is always present (inert OFF — the notebook-state
  // precedent), but OFF the listener never mounts (the flag-gated
  // <PlannerWorkspaceSync/> in the return below), so the epoch is frozen at 0
  // and the dep array behaves exactly like the old `[ownerId]`. NOTE the
  // load-bearing mechanism is remount-on-navigation + the workspace-scoped
  // resolver — both switch surfaces live outside the (planner)/(teach) provider
  // trees, so this provider is normally unmounted when a switch commits; the
  // event completes the contract if a switch surface ever lands inside planner
  // chrome. Accepted limitation: cross-tab switches don't propagate (window
  // events — same as notebook-state's WorkspaceIdentitySync).
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const onWorkspaceChanged = useCallback(() => {
    setWorkspaceEpoch((e) => e + 1);
  }, []);
  useEffect(() => {
    if (!isPlannerSupabaseConfigured()) return; // flag OFF → keep mock, no-op

    // Reset stale data immediately. Without this, a sign-out / account switch /
    // slow load would leave the previous owner's (or the mock) document on
    // screen until the async work resolved. The hydrate carries the CURRENT
    // owner + a "loading" status so the readiness gate (effectiveHydration)
    // knows this empty doc belongs to the owner being loaded — not the prior
    // owner whose lessons must never flash through.
    gradeLevelIdRef.current = null;
    dispatchRef.current({
      type: "hydrate",
      doc: EMPTY_DOC,
      // Catalog resets to EMPTY in lockstep with the document so a prior owner's
      // subjects/units/standards never linger on screen while the new owner's
      // catalog loads (mirrors the EMPTY_DOC lesson leak guard).
      catalog: EMPTY_CATALOG,
      hydration: "loading",
      owner: ownerId,
    });

    // Signed out / session not resolved → the empty doc is the FINAL state for a
    // null owner; mark it "empty" (not "loading") so views show an empty state
    // rather than a permanent spinner.
    if (!ownerId) {
      dispatchRef.current({ type: "setHydration", hydration: "empty" });
      return;
    }

    let alive = true;
    void (async () => {
      try {
        const gradeLevelId = await resolveGrade(ownerId);
        if (!alive) return;
        if (!gradeLevelId) {
          // No grade → stay EMPTY_DOC (never mock), settle to "empty".
          dispatchRef.current({ type: "setHydration", hydration: "empty" });
          return;
        }
        // Stash the resolved grade uuid so createLesson tees (duplicate*) have a
        // real grade to key new rows on without re-resolving per call.
        gradeLevelIdRef.current = gradeLevelId;
        // Fetch lessons AND the catalog (subjects/units/standards) in ONE
        // Promise.all so they resolve together — the success path then lands
        // both in a single `hydrate` dispatch (no frame where lessons are live
        // but the catalog is stale). All four reads are grade-scoped through
        // plannerClient. Under the flag the catalog NEVER falls back to mock:
        // any null owner / null grade / error keeps EMPTY_CATALOG, matching the
        // EMPTY_DOC lesson leak guard.
        const [lessons, subjects, units, standards] = await Promise.all([
          plannerClient.listLessons(gradeLevelId, ownerId),
          plannerClient.listSubjects(gradeLevelId),
          plannerClient.listUnits(gradeLevelId),
          plannerClient.listStandards(gradeLevelId),
        ]);
        if (!alive) return;
        if (lessons.length === 0) {
          // Genuinely empty → stay EMPTY_DOC, settle to "empty".
          dispatchRef.current({ type: "setHydration", hydration: "empty" });
          return;
        }
        // Batched section hydrate — one round-trip seeds every lesson's
        // sections (kills the prior per-lesson N+1). Lessons the batch omits
        // (no persisted sections) are filled with READ-ONLY synthetic sections
        // built from each lesson's ALREADY-LOADED flat `resources` — see
        // fillSyntheticSections. This reuses data the listLessons read already
        // returned (no extra masters/authored round-trips) and never persists:
        // a section-less lesson's resources surface for display, but the backend
        // still has zero section rows until the teacher explicitly edits.
        const batchedSections = await plannerClient.getSectionsBatch(
          lessons.map((l) => l.id),
          ownerId,
        );
        if (!alive) return;
        const sections = fillSyntheticSections(lessons, batchedSections);
        dispatchRef.current({
          type: "hydrate",
          doc: { lessons, sections, cellLayouts: {} },
          // The catalog hydrated for this owner/grade lands in the SAME dispatch
          // as the document. `listUnits` returns the FULL-YEAR superset (the
          // Supabase source selects every grade unit; the mock source returns
          // ALL_UNITS) so `store.units` is the superset every view filters over;
          // the active-unit-per-subject map is derived from it in the provider.
          catalog: { subjects, units, standards, activeGradeId: gradeLevelId },
          hydration: "ready",
          owner: ownerId,
        });
      } catch (err) {
        // On any backend/auth error, stay on EMPTY_DOC (already hydrated above)
        // rather than falling back to the mock — surfacing mock/Grade-5 fixtures
        // as if they were live data would be worse than an honest blank planner.
        // Surface the failure so a dropped hydrate is visible in the console.
        if (!alive) return;
        console.error("[planner] hydrate failed; showing empty document", err);
        dispatchRef.current({ type: "setHydration", hydration: "error" });
      }
    })();
    return () => {
      alive = false;
    };
    // workspaceEpoch: not read inside — it exists to RE-RUN this hydrate when
    // the active workspace changes (frozen at 0 with the flag OFF). The effect
    // already handles a re-run safely: it resets to EMPTY_DOC + "loading"
    // synchronously before awaiting, and `alive` cancels superseded fetches.
  }, [ownerId, workspaceEpoch]);

  const { history, lastChange } = state;
  const { past, present, future } = history;

  // Latest present document, mirrored into a ref so the synchronous section
  // persist helper (persistSectionAction) can re-apply an action to the CURRENT
  // document without listing `present` in its dep array (which would re-create it
  // on every edit). The reducer is the source of truth; this ref only feeds the
  // best-effort persist tee with the same pure transform the reducer ran.
  //
  // INTRA-TICK ACCUMULATION: persistSectionAction ADVANCES this ref by the action
  // it just applied (see below), so two section mutations dispatched in the SAME
  // tick — before React re-renders — each build on the prior one instead of both
  // reading the stale pre-render doc (which would make the second persist clobber
  // the first). On the next render this line resets the ref to the authoritative
  // committed reducer state (which by then includes every dispatched action), so
  // the ref reconciles to truth and never drifts.
  const presentRef = useRef(present);
  presentRef.current = present;

  // ── Selectors ────────────────────────────────────────────────────────

  const getLesson = useCallback(
    (id: string) => present.lessons.find((l) => l.id === id),
    [present.lessons],
  );

  const getSections = useCallback(
    (lessonId: string): LessonSectionContent[] =>
      ensureSections(present.sections, lessonId),
    [present.sections],
  );

  // ── Optimistic persistence tee (planner Supabase seam) ─────────────────
  // Mutators dispatch to the reducer FIRST (snappy optimistic UI), then fire a
  // best-effort write through plannerClient. Gated on BOTH the backend flag AND
  // a resolved auth uid — with the flag OFF (or no session) this is a no-op, so
  // the prototype path is byte-identical to the pre-seam reducer (the mutator's
  // dispatch is the only effect). The reducer remains the source of truth for
  // the session; a rejected write is surfaced via console.error (never blocks
  // the UI thread). Fire-and-await: the await lives inside the detached promise
  // so the caller stays synchronous + optimistic.
  const persist = useCallback(
    <M extends keyof typeof plannerClient>(
      method: M,
      ...args: Parameters<(typeof plannerClient)[M]>
    ): void => {
      if (!isPlannerSupabaseConfigured()) return;
      if (!ownerIdRef.current) return; // no session → never send null/slug
      const fn = plannerClient[method] as (
        ...a: Parameters<(typeof plannerClient)[M]>
      ) => Promise<unknown>;
      void fn.apply(plannerClient, args).catch((err: unknown) => {
        // Reducer state stands; surface the failure so a dropped write is
        // visible. A reconcile toast is unavailable here — ConsequenceToast-
        // Provider mounts as a CHILD of PlannerProvider (see (planner)/layout),
        // so its hook is out of scope in this provider body. console.error is
        // the strongest non-blocking signal reachable without reordering
        // providers or adding a dependency.
        console.error(`[planner] persist '${String(method)}' failed`, err);
      });
    },
    [],
  );

  // ── Serialized (latest-wins) section persistence ────────────────────────
  // W3.8 gate fix (Codex HIGH — persistence ordering race): the lesson editor
  // autosaves per keystroke, and EVERY section persist is a FULL
  // `replace_lesson_sections` swap. Firing those through the fire-and-forget
  // `persist()` tee makes them UNORDERED on the wire — a slow early request
  // ("a") can commit AFTER a later one ("abc"), leaving the DB stale relative
  // to the UI with no error surfaced.
  //
  // Fix: per-lesson LATEST-WINS serialization. Each lessonId keeps at most
  //   • ONE in-flight RPC, and
  //   • ONE pending "latest snapshot" slot.
  // While a write is in flight, newer snapshots simply OVERWRITE the pending
  // slot (each payload is the complete resolved section list, so intermediate
  // states are safely skippable); when the in-flight settles — success OR
  // failure — the pending snapshot (if any) is sent next. At most one RPC per
  // lesson is ever outstanding, so commits land in send order and the final
  // DB state always equals the last UI state. No timers: a trailing debounce
  // would merely reduce write volume; the serialization IS the correctness
  // fix (and a debounce alone would NOT fix ordering).
  //
  // Identity (ownerId / saveTarget) is captured INTO the snapshot at enqueue
  // time, so a mid-flight sign-out or a Personal↔Team toggle flip never
  // retargets an already-authored snapshot.
  const sectionWriteQueueRef = useRef(
    new Map<
      string,
      {
        inFlight: boolean;
        pending: {
          sections: LessonSectionContent[];
          ownerId: string;
          saveTarget: "personal" | "core";
        } | null;
      }
    >(),
  );

  const persistSectionsSerialized = useCallback(
    (lessonId: string, sections: LessonSectionContent[]): void => {
      // Same gating as persist(): flag OFF / no session → no-op (prototype
      // mode is reducer-local, byte-identical to the pre-seam behavior).
      if (!isPlannerSupabaseConfigured()) return;
      if (!ownerIdRef.current) return;

      let entry = sectionWriteQueueRef.current.get(lessonId);
      if (!entry) {
        entry = { inFlight: false, pending: null };
        sectionWriteQueueRef.current.set(lessonId, entry);
      }
      const queued = entry;
      // Latest wins: overwrite (never queue behind) the pending snapshot.
      queued.pending = {
        sections,
        ownerId: ownerIdRef.current,
        saveTarget: saveTargetRef.current,
      };
      if (queued.inFlight) return; // the settle handler drains the slot

      const sendNext = (): void => {
        const next = queued.pending;
        if (!next) {
          queued.inFlight = false;
          // Settled with nothing pending — drop the map entry so a long
          // editing session doesn't retain one slot per touched lesson
          // (audit re-pass Low); a later write simply re-creates it.
          sectionWriteQueueRef.current.delete(lessonId);
          return;
        }
        queued.pending = null;
        queued.inFlight = true;
        void plannerClient
          .setSections(lessonId, next.sections, next.ownerId, next.saveTarget)
          .catch((err: unknown) => {
            // Mirror persist()'s error contract: reducer state stands and the
            // dropped write is surfaced without blocking the UI. A newer
            // pending snapshot (drained below) supersedes the failed payload.
            console.error("[planner] persist 'setSections' failed", err);
          })
          .then(() => {
            queued.inFlight = false;
            sendNext();
          });
      };
      sendNext();
    },
    [],
  );

  // ── Granular section-mutator persistence ───────────────────────────────
  // Several section reducer actions (reorder / add / remove / duplicate section,
  // move resource) mutate `present.sections[lessonId]` but had NO dedicated
  // persist verb — so the edit was lost on reload. This helper re-applies the
  // SAME pure transform the reducer runs (applyDocAction) to the CURRENT
  // document, then tees the RESULTING section list through the serialized
  // setSections queue above so the whole new arrangement is durable AND
  // ordered. The payload is exactly the reducer's resulting
  // `present.sections[lessonId]` (via ensureSections on the next doc), so the
  // persisted set matches what the UI shows.
  //
  // FORKING (#14): the serialized queue captures `saveTargetRef.current` — the
  // live Personal | Team-Curriculum toggle — so a Team/Master-mode section edit
  // writes the SHARED team section rows (RLS-gated, throws on denial) instead of
  // being forced into a personal fork. This mirrors updateLesson/moveLesson and
  // is the regression the stale Codex branch introduced by dropping saveTarget.
  // With the Supabase flag OFF the queue is a no-op, so this is reducer-local.
  const persistSectionAction = useCallback(
    (action: PersistableSectionAction): void => {
      const nextDoc = applyDocAction(presentRef.current, action);
      // A no-op reducer action (e.g. reorder with equal indices) leaves the doc
      // object identical — nothing to persist.
      if (nextDoc === presentRef.current) return;
      // Advance the ref so a second same-tick section mutation re-applies its
      // action ON TOP of this one (and persists the combined result), rather
      // than re-reading the stale pre-render doc and clobbering this change. The
      // next render resets presentRef to the committed reducer state.
      presentRef.current = nextDoc;
      persistSectionsSerialized(
        action.lessonId,
        ensureSections(nextDoc.sections, action.lessonId),
      );
    },
    [persistSectionsSerialized],
  );

  // ── Mutation callbacks ────────────────────────────────────────────────

  const moveLesson = useCallback(
    (
      id: string,
      patch: {
        day?: number;
        subject?: SubjectId;
        week?: number;
        time?: string;
      },
    ) => {
      dispatchRef.current({ type: "moveLesson", id, patch });
      // W3.8c — a `time` relabel applies REDUCER-LOCALLY ONLY (the dispatch
      // above; still one action = one undo step). It is deliberately NOT teed
      // to persistence: `time` is unmodelled in the DB — every
      // supabase-source updateLesson write branch skips it ("derived/
      // unmodelled"), yet `time` sits in that source's contentKeys, so a
      // time-only updateLesson call would take the fork path with an EMPTY
      // patch — spuriously forking the lesson while persisting nothing
      // (Codex gate, round 2). Until a lesson time/period column lands
      // (Phase 1B, with the per-school timetable), a cross-period re-time is
      // durable in mock mode and session-local when the Supabase planner
      // flag is on; the day move below persists either way.
      if (patch.week != null || patch.day != null) {
        // Persist the lesson's RESOLVED final slot, not the bare patch. Call
        // sites (e.g. the weekly board) pass only { day }; sending that raw lets
        // an omitted `week` default to 0 server-side, persisting the lesson into
        // week 0 so it vanishes on reload (finding #8). Merge the patch over the
        // current lesson so an unchanged axis keeps its real value.
        // NOTE: the move contract (LessonMoveTarget) is slot-only (week/day);
        // it has no subject field, so a subject-only move is reducer-local and
        // does not tee here — matching the prior behavior.
        const current = present.lessons.find((l) => l.id === id);
        const week = patch.week ?? current?.week ?? 0;
        const day = patch.day ?? current?.day ?? 0;
        // saveTarget threads the Personal | Team-Curriculum mode: "core" moves
        // the shared master row (#14, RLS-gated), else a personal-copy move.
        persist(
          "moveLesson",
          id,
          { week, day },
          ownerIdRef.current ?? "",
          saveTargetRef.current,
        );
      }
    },
    [persist, present.lessons],
  );

  const setLessonStatus = useCallback(
    (id: string, status: LessonStatus) => {
      dispatchRef.current({ type: "setLessonStatus", id, status });
      persist("setLessonStatus", id, status, ownerIdRef.current ?? "");
    },
    [persist],
  );

  const editLesson = useCallback(
    (
      id: string,
      patch: Partial<Lesson>,
      coalesce?: { key: string; ts: number },
    ) => {
      dispatchRef.current({
        type: "editLesson",
        id,
        patch,
        coalesceKey: coalesce?.key ?? `lesson:${id}:patch`,
        coalesceTs: coalesce?.ts ?? Date.now(),
      });
      // Only the content fields the source's LessonPatch accepts are teed; the
      // source decides whether the edit forks (personal) or writes the shared
      // master row (core — #14 authorized Team-Curriculum write, RLS-gated).
      persist(
        "updateLesson",
        id,
        patch,
        ownerIdRef.current ?? "",
        saveTargetRef.current,
      );
    },
    [persist],
  );

  const duplicateLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "duplicateLesson", id });
    // DELIBERATELY NOT PERSISTED (finding #10). Teeing this to `createLesson`
    // wrote a CORRUPT row: the backend mints its own id (≠ the reducer's
    // optimistic id) and createLesson writes a blank lesson, so neither the
    // duplicated content/sections nor follow-up edits keyed to the optimistic
    // id reach the server. Writing corrupt blank rows is worse than not
    // persisting, so the duplicate stays reducer-local until a proper server
    // "duplicate" verb exists.
    // TODO: durable duplication needs a server-side `duplicateLesson` op that
    // deep-copies content + sections and RETURNS the real row id so the store
    // can reconcile the optimistic id. Until then a reload will not show the
    // duplicate — honest and non-corrupting.
  }, []);

  const duplicateWeek = useCallback(
    (sourceWeek: number, targetWeek: number) => {
      dispatchRef.current({ type: "duplicateWeek", sourceWeek, targetWeek });
      // DELIBERATELY NOT PERSISTED (finding #10). Same corruption as
      // duplicateLesson: teeing each copy to `createLesson` wrote blank rows
      // with backend-minted ids that don't match the optimistic ids, losing the
      // copied content/sections. Stays reducer-local until a server "duplicate"
      // verb exists.
      // TODO: durable week-duplication needs a server op that deep-copies each
      // lesson (content + sections) into the target week and returns the real
      // row ids for reconciliation. Until then a reload will not show the copied
      // week — honest and non-corrupting.
    },
    [],
  );

  const addLesson = useCallback(
    async (input: {
      subject: Lesson["subject"];
      week: number;
      day: number;
      title?: string;
      objective?: string;
    }): Promise<Lesson | null> => {
      // W3.7 — AWAIT-THEN-DISPATCH. The duplicate* mutators above document
      // why the usual optimistic tee is FORBIDDEN for creates: the backend
      // mints its own id, so an optimistic reducer uid writes a corrupt/
      // orphaned row. Here the source resolves FIRST and the reducer receives
      // the REAL lesson; there is no persist() tee because the createLesson
      // call is itself the persistence (mock: instant in-memory append).
      //
      // Identity plumbing mirrors persist(): ownerId from ownerIdRef (the
      // live auth uid), grade from gradeLevelIdRef (captured during hydrate).
      // In backend mode both must be resolved before a row can be keyed —
      // bail to null instead of writing a mis-keyed row (persist()'s "no
      // session → never send null/slug" guard, extended to the grade).
      if (isPlannerSupabaseConfigured()) {
        if (!ownerIdRef.current || !gradeLevelIdRef.current) {
          console.debug(
            "[planner] addLesson skipped — owner/grade not resolved yet",
          );
          return null;
        }
      }
      // W3.7 audit #1 — capture identity BEFORE the await. The refs are
      // live: the owner can sign out/switch and the grade can re-hydrate
      // while createLesson is in flight, and dispatching the resolved row
      // into the NEW identity's doc would graft another owner's lesson into
      // it. Snapshot both now; re-check after the await and drop the
      // dispatch on any mismatch (the row is keyed to the captured identity
      // and will surface on that identity's next hydrate).
      const capturedOwnerId = ownerIdRef.current;
      const capturedGradeLevelId = gradeLevelIdRef.current;
      try {
        const lesson = await plannerClient.createLesson(
          {
            gradeLevelId: capturedGradeLevelId ?? "",
            subject: input.subject,
            // No unit yet — a fresh lesson starts unfiled. The Supabase
            // source maps "" → null unit_id (nullable FK); the mock stores
            // it verbatim.
            unit: "",
            week: input.week,
            day: input.day,
            title: input.title ?? "New lesson",
            objective: input.objective,
          },
          capturedOwnerId ?? "",
          capturedGradeLevelId ?? undefined,
        );
        // W3.7 audit #1 — stale-identity guard. Same null contract as the
        // bail above: callers already branch on null, so a skipped dispatch
        // reads as "create didn't land here" (it landed for the captured
        // identity, not this one).
        if (
          ownerIdRef.current !== capturedOwnerId ||
          gradeLevelIdRef.current !== capturedGradeLevelId
        ) {
          console.debug(
            "[planner] addLesson resolved after owner/grade changed — dispatch skipped",
          );
          return null;
        }
        dispatchRef.current({ type: "addLesson", lesson });
        return lesson;
      } catch (err) {
        // Never throw into the UI — callers branch on null. console.debug
        // (not error): the persist tee's console.error convention is for
        // writes whose optimistic state already renders; here nothing
        // rendered, so the caller owns the user-facing signal.
        console.debug("[planner] addLesson failed", err);
        return null;
      }
    },
    [],
  );

  const setSaveTarget = useCallback(
    (id: string, target: "personal" | "core") => {
      dispatchRef.current({ type: "setSaveTarget", id, target });
    },
    [],
  );

  const setCellLayout = useCallback(
    (key: string, layout: CellLayout | null) => {
      dispatchRef.current({ type: "setCellLayout", key, layout });
    },
    [],
  );

  const bumpLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "bumpLesson", id });
  }, []);

  const archiveLesson = useCallback(
    (id: string) => {
      dispatchRef.current({ type: "archiveLesson", id });
      // Soft-delete is PERSONAL-scoped in the source (archives the owner's copy;
      // never mutates the shared master row). Optimistic: reducer first, persist
      // after. unarchiveLesson stays local-only — the contract has no
      // "restore" method yet (TODO: add a source un-delete when it lands).
      persist("softDeleteLesson", id, ownerIdRef.current ?? "");
    },
    [persist],
  );

  const unarchiveLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "unarchiveLesson", id });
  }, []);

  const restoreLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "restoreLesson", id });
  }, []);

  const relocateLesson = useCallback(
    (
      id: string,
      target: { day?: number; subject?: SubjectId; week?: number },
      keepOriginal: boolean,
    ) => {
      dispatchRef.current({ type: "relocateLesson", id, target, keepOriginal });
    },
    [],
  );

  const revertPlacement = useCallback(
    (id: string, to: { day: number; week: number }) => {
      // One dispatch → one history step (FIX 4): the reducer applies the move
      // AND clears `moved` in a single pass, so the fork-diff scheduling
      // revert is a single ⌘Z (matching its singular tooltip).
      dispatchRef.current({ type: "revertPlacement", id, to });
      // Tee persistence the SAME way moveLesson does: send the RESOLVED final
      // slot { week, day } (not a bare patch) under the live Personal |
      // Team-Curriculum save target, so the reverted placement survives reload
      // in backend mode. `to.day`/`to.week` are both required, so the resolved
      // slot is exactly the target; we still merge over the current lesson to
      // mirror moveLesson's defensive idiom 1:1. The reducer-local `moved`
      // flag is intentionally NOT persisted (not a LessonMoveTarget field) —
      // matching the two-dispatch behavior this replaces.
      const current = present.lessons.find((l) => l.id === id);
      const week = to.week ?? current?.week ?? 0;
      const day = to.day ?? current?.day ?? 0;
      persist(
        "moveLesson",
        id,
        { week, day },
        ownerIdRef.current ?? "",
        saveTargetRef.current,
      );
    },
    [persist, present.lessons],
  );

  const setSections = useCallback(
    (lessonId: string, next: LessonSectionContent[]) => {
      dispatchRef.current({ type: "setSections", lessonId, next });
      // Routed through the SAME serialized per-lesson queue as the granular
      // section mutators (a direct persist() here could interleave with the
      // queued keystroke writes and re-introduce the ordering race). The
      // queue captures the live saveTarget: "core" writes the shared team
      // section rows (#14, RLS-gated), else a personal fork.
      persistSectionsSerialized(lessonId, next);
    },
    [persistSectionsSerialized],
  );

  const reorderSections = useCallback(
    (lessonId: string, activeId: string, overId: string) => {
      const action: ReorderSectionsAction = {
        type: "reorderSections",
        lessonId,
        activeId,
        overId,
      };
      dispatchRef.current(action);
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const editSection = useCallback(
    (
      lessonId: string,
      sectionId: string,
      patch: Partial<LessonSectionContent>,
      coalesce?: { key: string; ts: number },
    ) => {
      const action: EditSectionAction = {
        type: "editSection",
        lessonId,
        sectionId,
        patch,
        coalesceKey: coalesce?.key ?? `section:${lessonId}:${sectionId}:patch`,
        coalesceTs: coalesce?.ts ?? Date.now(),
      };
      dispatchRef.current(action);
      // Persist via the full current-section-list replace, like every other
      // section mutation. Call sites commit ONE-SHOT (body on blur, rename /
      // minutes on Enter, status per tap) — the coalesce key batches UNDO
      // history, not writes, so this does not flood the RPC.
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const addSection = useCallback(
    (lessonId: string, heading?: string) => {
      const action: AddSectionAction = {
        type: "addSection",
        lessonId,
        heading,
      };
      dispatchRef.current(action);
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const removeSection = useCallback(
    (lessonId: string, sectionId: string) => {
      const action: RemoveSectionAction = {
        type: "removeSection",
        lessonId,
        sectionId,
      };
      dispatchRef.current(action);
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const duplicateSection = useCallback(
    (lessonId: string, sectionId: string) => {
      const action: DuplicateSectionAction = {
        type: "duplicateSection",
        lessonId,
        sectionId,
      };
      dispatchRef.current(action);
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const addSectionResource = useCallback(
    (
      lessonId: string,
      sectionId: string,
      resource: Partial<SectionResource> & {
        type: SectionResource["type"];
        label: string;
      },
    ) => {
      const action: AddSectionResourceAction = {
        type: "addSectionResource",
        lessonId,
        sectionId,
        resource,
      };
      dispatchRef.current(action);
      // Persist via the full current-section-list replace (not the granular
      // source `addSectionResource`, which keys on a single `sectionId` that may
      // have drifted from the DB-minted id after a prior persisted section
      // mutation — see PersistableSectionAction). The replay re-applies this same
      // action and tees the resolved list through `setSections` with the live
      // saveTarget, so a Team/Master-mode resource add writes the shared rows.
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const editSectionResource = useCallback(
    (
      lessonId: string,
      sectionId: string,
      resourceId: string,
      patch: Partial<SectionResource>,
    ) => {
      const action = {
        type: "editSectionResource",
        lessonId,
        sectionId,
        resourceId,
        patch,
        coalesceKey: `editResource:${lessonId}:${sectionId}:${resourceId}`,
        coalesceTs: Date.now(),
      } as const;
      dispatchRef.current(action);
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const removeSectionResource = useCallback(
    (lessonId: string, sectionId: string, resourceId: string) => {
      const action: RemoveSectionResourceAction = {
        type: "removeSectionResource",
        lessonId,
        sectionId,
        resourceId,
      };
      dispatchRef.current(action);
      // Full-list replace, same rationale as addSectionResource: never key a
      // persist on a single (possibly-drifted) section/resource id across the
      // seam. Threads the live saveTarget so a Team/Master-mode removal writes
      // the shared section rows (RLS-gated) rather than forking.
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const moveSectionResource = useCallback(
    (
      lessonId: string,
      sourceSectionId: string,
      targetSectionId: string,
      resource: SectionResource,
    ) => {
      const action: MoveSectionResourceAction = {
        type: "moveSectionResource",
        lessonId,
        sourceSectionId,
        targetSectionId,
        resource,
      };
      dispatchRef.current(action);
      persistSectionAction(action);
    },
    [persistSectionAction],
  );

  const toggleSectionWebsite = useCallback(
    (lessonId: string, sectionId: string) => {
      dispatchRef.current({
        type: "toggleSectionWebsite",
        lessonId,
        sectionId,
      });
    },
    [],
  );

  const undo = useCallback(() => dispatchRef.current({ type: "undo" }), []);
  const redo = useCallback(() => dispatchRef.current({ type: "redo" }), []);

  // ── History derived values ────────────────────────────────────────────

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const undoLabel = canUndo ? past[past.length - 1].label : null;
  const redoLabel = canRedo ? future[0].label : null;
  // ADDITIVE — the UndoToastBridge's batch-detection seam (§4a review M2).
  // See the PlannerValue doc comment for the contract.
  const historyDepth = past.length;

  // ── Owner-keyed hydration readiness ────────────────────────────────────
  // The reducer's `hydration` is the raw lifecycle for whatever doc is on
  // screen. But between an owner change and the re-hydrate that follows it,
  // the effect's synchronous reset has not run yet for this render — so the
  // present doc may still belong to the PRIOR owner. We must never paint that
  // prior owner's lessons as "ready". Gate readiness on the hydrated-for owner
  // matching the current owner: any mismatch is treated as "loading" so views
  // show a loading state instead of the stale owner's data.
  //
  // Flag OFF is unaffected: the mock document is owner-agnostic (hydratedForOwner
  // and ownerId are both irrelevant), and the reducer's hydration is permanently
  // "ready" — short-circuit before the owner check so the prototype path stays
  // byte-identical.
  const effectiveHydration: PlannerHydration = !isPlannerSupabaseConfigured()
    ? "ready"
    : state.hydratedForOwner !== ownerId
      ? "loading"
      : state.hydration;

  // ── Catalog derivations ─────────────────────────────────────────────────
  // The catalog slice (subjects/units/standards/grade) is a non-history sibling
  // of the document. Derive the lookup maps + the per-subject active unit +
  // describeStandard from it here, memoized on the slice so hot render paths
  // (every lesson card reads describeStandard / unitById) get STABLE references
  // that change only when the catalog actually changes (hydrate / setCatalog).
  const { catalog } = state;

  const unitById = useMemo<Record<string, Unit>>(() => {
    // Mirrors the mock UNIT_BY_ID: id → Unit over the full-year superset.
    const map: Record<string, Unit> = {};
    for (const u of catalog.units) map[u.id] = u;
    return map;
  }, [catalog.units]);

  const subjectById = useMemo<Record<SubjectId, Subject>>(() => {
    const map = {} as Record<SubjectId, Subject>;
    for (const s of catalog.subjects) map[s.id] = s;
    return map;
  }, [catalog.subjects]);

  const activeUnitBySubject = useMemo<
    Record<SubjectId, Unit | undefined>
  >(() => {
    // PARITY (R2): WeeklyGrid + the left filter read the active-unit-per-subject
    // map. With the flag OFF we MUST reproduce the mock UNITS map byte-identical,
    // so return a copy of it directly — deriving from the superset would pick a
    // different unit (e.g. ALL_UNITS' first math unit "m-u1" vs. UNITS' "u-m3").
    if (!isPlannerSupabaseConfigured()) {
      return { ...UNITS };
    }
    // Flag ON: derive the active unit per subject from the full-year superset.
    // DERIVATION: pick the FIRST unit listed for each subject as a safe default.
    // A true "active" pick would test which unit's week span contains the
    // current instructional week, but CURRENT_WEEK is explicitly OUT of scope
    // for this wave (it must not be imported or routed through the store), and
    // Unit.weeks is a human label ("Wk 9–14"), not a numeric span. First-per-
    // subject is deterministic and never empty when the subject has any unit.
    // TODO(catalog): once a current-week notion is plumbed through the store,
    // replace "first unit" with "the unit whose week span contains the current
    // week, else the first unit".
    const map = {} as Record<SubjectId, Unit | undefined>;
    for (const u of catalog.units) {
      if (map[u.subject] === undefined) map[u.subject] = u;
    }
    return map;
  }, [catalog.units]);

  const describeStandard = useCallback(
    (code: string): string => {
      // PARITY: mirrors the mock describeStandard exactly — return the mapped
      // description, else the code itself for an unknown standard.
      return catalog.standards[code] ?? code;
    },
    [catalog.standards],
  );

  // Merge freshly-tagged code→description pairs into the catalog (additive).
  // Stable across renders (dispatchRef), so it never destabilizes the value memo.
  const mergeStandards = useCallback((map: StandardsMap) => {
    if (!map || Object.keys(map).length === 0) return;
    dispatchRef.current({ type: "mergeStandards", map });
  }, []);

  // ── Stable context value ──────────────────────────────────────────────
  // Memoized on the doc and history boundaries — views re-render only when
  // the document or history flags actually change.

  const value = useMemo<PlannerValue>(
    () => ({
      lessons: present.lessons,
      getLesson,
      getSections,
      cellLayouts: present.cellLayouts,
      moveLesson,
      setLessonStatus,
      editLesson,
      duplicateLesson,
      duplicateWeek,
      addLesson,
      setSaveTarget,
      setCellLayout,
      bumpLesson,
      archiveLesson,
      unarchiveLesson,
      restoreLesson,
      relocateLesson,
      revertPlacement,
      setSections,
      reorderSections,
      editSection,
      addSection,
      removeSection,
      duplicateSection,
      addSectionResource,
      editSectionResource,
      removeSectionResource,
      moveSectionResource,
      toggleSectionWebsite,
      undo,
      redo,
      canUndo,
      canRedo,
      historyDepth,
      undoLabel,
      redoLabel,
      lastChange,
      hydration: effectiveHydration,
      // Catalog (additive) — reference data routed through the store.
      subjects: catalog.subjects,
      units: catalog.units,
      unitById,
      subjectById,
      activeUnitBySubject,
      standards: catalog.standards,
      describeStandard,
      mergeStandards,
      activeGradeId: catalog.activeGradeId,
    }),
    [
      present.lessons,
      present.cellLayouts,
      getLesson,
      getSections,
      moveLesson,
      setLessonStatus,
      editLesson,
      duplicateLesson,
      duplicateWeek,
      addLesson,
      setSaveTarget,
      setCellLayout,
      bumpLesson,
      archiveLesson,
      unarchiveLesson,
      restoreLesson,
      relocateLesson,
      revertPlacement,
      setSections,
      reorderSections,
      editSection,
      addSection,
      removeSection,
      duplicateSection,
      addSectionResource,
      editSectionResource,
      removeSectionResource,
      moveSectionResource,
      toggleSectionWebsite,
      undo,
      redo,
      canUndo,
      canRedo,
      historyDepth,
      undoLabel,
      redoLabel,
      lastChange,
      effectiveHydration,
      // Catalog derivations (stable across renders unless the slice changes).
      catalog.subjects,
      catalog.units,
      unitById,
      subjectById,
      activeUnitBySubject,
      catalog.standards,
      describeStandard,
      mergeStandards,
      catalog.activeGradeId,
    ],
  );

  return (
    <PlannerContext.Provider value={value}>
      {/* Multi-workspace ON-path listener. `MULTI_WORKSPACE` is a build-inlined
          `false` when the flag is off, so this renders `null` and the sync
          component — and its effect — never mount: the OFF build's render is
          unchanged (the notebook-state WorkspaceIdentitySync precedent). */}
      {MULTI_WORKSPACE ? (
        <PlannerWorkspaceSync onChanged={onWorkspaceChanged} />
      ) : null}
      {children}
    </PlannerContext.Provider>
  );
}

/**
 * Null-rendering listener for the workspace switcher's WORKSPACE_CHANGED_EVENT
 * (mirrors notebook-state's WorkspaceIdentitySync). Mounted ONLY on the
 * MULTI_WORKSPACE ON path; its sole job is to bump the provider's
 * workspaceEpoch so the hydrate effect re-runs against the NEW active
 * workspace. The existing hydrate machinery does the rest: reset-before-await
 * (no stale-workspace flash) + `alive` cancellation (superseded fetches can't
 * land).
 */
function PlannerWorkspaceSync({ onChanged }: { onChanged: () => void }): null {
  useEffect(() => {
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
  }, [onChanged]);
  return null;
}

// ── Scroll helper ──────────────────────────────────────────────────────────

/**
 * Scroll a lesson card into view using the data-planner-item attribute.
 *
 * Convention for sibling agents:
 *   Add   data-planner-item="lesson:<lessonId>"
 *   to the root element of every rendered lesson card (weekly card, daily
 *   card, subject card, etc.). This helper queries that attribute to find
 *   the element and calls scrollIntoView.
 *
 * Usage in a view:
 *   useEffect(() => {
 *     if (lastChange?.lessonIds[0]) {
 *       scrollPlannerItemIntoView(lastChange.lessonIds[0]);
 *     }
 *   }, [lastChange]);
 */
export function scrollPlannerItemIntoView(lessonId: string): void {
  const el = document.querySelector(`[data-planner-item="lesson:${lessonId}"]`);
  el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
