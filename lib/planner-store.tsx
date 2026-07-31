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
import {
  createSerialWriteQueue,
  SerialWriteTimeoutError,
} from "@/lib/planner/serial-write-queue";
import {
  classifyAsyncFailure,
  shouldRetryRead,
} from "@/lib/async-failure";
import { diffLessonsForReplay } from "@/lib/planner/doc-replay";
import { resolveGrade } from "@/lib/planner/grade";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";
import type { UnitPatch } from "@/lib/planner/source";
import {
  createUnitWriteQueue,
  staleUnitPatchKeys,
  type UnitWriteQueue,
} from "@/lib/planner/unit-write-queue";
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
/** Patch a unit's editable Track-B workspace fields (B1.7). A CATALOG-level
 *  side-channel like setCatalog/mergeStandards: units live in the reference
 *  catalog (a SIBLING of the document), so a unit edit NEVER enters undo/redo —
 *  editing a big idea must not put the unit list on the lesson undo stack. The
 *  provider tees the same patch to the source's updateUnitFields (flag ON), so
 *  the edit persists to the shared team `units` row; flag OFF it stays
 *  reducer-local, exactly like every other mock-path edit. */
type EditUnitFieldsAction = {
  type: "editUnitFields";
  unitId: string;
  patch: UnitPatch;
};
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
  | EditUnitFieldsAction
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

  // ── Edit unit fields (B1.7 — CATALOG side-channel, NOT undoable) ──────────
  // Merge a Track-B patch into the matching catalog unit. Like setCatalog /
  // mergeStandards this touches only the catalog slice (never the document or
  // undo/redo history) — units are reference data, so a unit edit must not land
  // on the lesson undo stack. No-op when the unit isn't in the catalog (a stale
  // id, or a unit outside the hydrated grade) so a mistargeted edit can't insert
  // a phantom unit. The persist tee (updateUnitFields) fires separately in the
  // provider; flag OFF this reducer update is the only effect.
  if (action.type === "editUnitFields") {
    const idx = state.catalog.units.findIndex((u) => u.id === action.unitId);
    if (idx === -1) return state;
    const nextUnits = state.catalog.units.slice();
    nextUnits[idx] = { ...nextUnits[idx], ...action.patch };
    return { ...state, catalog: { ...state.catalog, units: nextUnits } };
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

/** Split a lesson patch into per-field write groups, so every write touching a
 *  column shares exactly one serial-queue lane no matter which mutator produced
 *  it. Returns `[groupName, patchForThatGroup]` pairs.
 *
 *  `standards` and `standardIds` are index-aligned (same position = same
 *  standard), so they are ONE group: sending them separately lets the codes and
 *  the ids commit out of order and disagree. Exported for the unit tests. */
export function splitPatchByField(
  patch: Partial<Lesson>,
): [string, Partial<Lesson>][] {
  // Two groups hold MORE than one field because their fields cannot be written
  // independently:
  //   standards  — `standards` (codes) and `standardIds` (uuids) are
  //     index-aligned; split across lanes they commit out of order and disagree.
  //   completion — `status` and `reasonNotDone` are ONE row, written
  //     read-modify-write by the source's `writeStatus`. Two concurrent requests
  //     each read the same prior row and each writes its own field plus the
  //     OTHER field's stale value, so the loser's change is silently reverted:
  //     a lesson marked done with its reason wiped, or a reason saved against
  //     the completion state it replaced.
  const MULTI: Record<string, string> = {
    standards: "standards",
    standardIds: "standards",
    status: "completion",
    reasonNotDone: "completion",
  };
  const grouped = new Map<string, Partial<Lesson>>();
  const groups: [string, Partial<Lesson>][] = [];
  for (const key of Object.keys(patch) as (keyof Lesson)[]) {
    const group = MULTI[key];
    if (group) {
      const bucket = grouped.get(group) ?? {};
      (bucket as Record<string, unknown>)[key] = patch[key];
      grouped.set(group, bucket);
      continue;
    }
    groups.push([key, { [key]: patch[key] } as Partial<Lesson>]);
  }
  for (const [name, bucket] of grouped) groups.push([name, bucket]);
  // Stable order so the emitted request sequence is deterministic + testable.
  return groups.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * How many times one hydrate effect will try before it settles to "error".
 *
 * BOUNDED IN BOTH DIRECTIONS, and both bounds matter. Too few and a teacher who
 * navigates twice in quick succession is left staring at a skeleton with nothing
 * coming. Too many (or unbounded) and a teacher clicking around during a slow
 * cold hydrate spawns a retry chain that never terminates. Three attempts covers
 * the realistic case — the live symptom is ONE cancellation per session and the
 * data always renders on the next attempt — and terminates.
 */
const MAX_HYDRATE_ATTEMPTS = 3;

/** A persist failure, published on the planner value so a bridge can surface it.
 *  See `PlannerValue.lastWriteFailure` for why this is a signal, not a Result. */
export interface PlannerWriteFailure {
  /** Monotonic; changes on every failure so an effect can depend on the object. */
  id: number;
  /**
   * `"failed"` — the write definitively did not land, so the teacher's value is
   * on screen and nowhere else.
   * `"timeout"` — the request was ABANDONED, not cancelled, and may still commit
   * (see SerialWriteTimeoutError). The outcome is genuinely unknown, and the
   * edit at risk is the NEWER one, not this one. A surface must not turn this
   * into a definite claim in either direction.
   */
  kind: "failed" | "timeout";
  /** The source verb that failed — "updateLesson", "setSections", "move", … */
  op: string;
  /** Where the lost edit was headed. "team" means a SHARED row: the failure is
   *  team-visible in consequence and the teacher must be told so explicitly. */
  scope: "personal" | "team";
  /** Best-effort message off the error, for the surface to show or log. */
  message: string;
}

/**
 * The serial-queue lane a lesson FIELD write belongs to.
 *
 * Keyed by lesson AND save target AND field group, and every part is load-bearing:
 *   • lesson  — two lessons sharing a lane means the newer patch evicts the older;
 *   • target  — a `core` write targets the SHARED master row and a `personal` one
 *     this teacher's copy. Different rows, no ordering relationship. While the
 *     target lived only in the payload, a Team-mode edit that was RLS-denied
 *     could be reported as SUPERSEDED by a personal payload that landed in the
 *     same slot — master never got the edit and nobody was told;
 *   • group   — see splitPatchByField; per-field so an edit and the undo that
 *     reverses it share exactly one lane.
 */
export function lessonFieldLane(
  lessonId: string,
  saveTarget: "personal" | "core",
  group: string,
): string {
  return `${lessonId}::${saveTarget}::f:${group}`;
}

/**
 * The lane a non-field lesson write belongs to.
 *
 * `archive` is deliberately NOT split by target: `softDeleteLesson` /
 * `unarchiveLesson` take only (lessonId, ownerId) and never touch the shared
 * master row, so there is exactly one row to write and splitting would let a
 * Team-mode archive race a Personal-mode un-archive against it. `move` DOES
 * write a different row per target, so it splits.
 */
export function lessonOpLane(
  lessonId: string,
  axis: string,
  saveTarget: "personal" | "core",
): string {
  return axis === "archive"
    ? `${lessonId}::archive`
    : `${lessonId}::${saveTarget}::${axis}`;
}

/** The lane a SECTION snapshot belongs to — same target-splitting argument as
 *  `lessonFieldLane`: core sections and personal sections are different rows. */
export function sectionLane(
  lessonId: string,
  saveTarget: "personal" | "core",
): string {
  return `${lessonId}::${saveTarget}::sec`;
}

/**
 * Which side of the forking model a failed write actually touched.
 *
 * Derived from the VERB, not the payload's save target. `softDeleteLesson` and
 * `unarchiveLesson` ignore the target entirely and are personal-scoped whatever
 * the top-bar toggle says, so reading the payload told a teacher in Team mode
 * that a personal-only operation "didn't save for the Team Curriculum" — misusing
 * the one word in that message that carries consequence.
 */
export function failureScopeForOp(
  kind: string,
  saveTarget: "personal" | "core",
): "personal" | "team" {
  return kind === "move" && saveTarget === "core" ? "team" : "personal";
}

/**
 * Does `pending` carry everything `failed` did?
 *
 * The rule that decides whether a failed write is inconsequential. Mere
 * existence of a pending payload is NOT enough for partial patches: a lane can
 * legitimately hold differently-shaped ones (the direct completion toggle sends
 * `{status}`, a replayed undo sends `{status, reasonNotDone}`), and suppressing
 * the richer patch's failure because the narrower one is queued loses a field
 * silently.
 *
 * KEY PRESENCE IS NOT ENOUGH EITHER, which is the subtler half. `undefined`
 * means two different things depending on the field: for a Track-B column it is
 * the editor's CLEAR (key-presence semantics — `lessonTrackBColumns` emits
 * `null`), but for a plain scalar the source's `if (patch.x !== undefined)`
 * guard skips it entirely. So a pending `{title: undefined}` does NOT write
 * `title`, and treating it as covering a failed `{title: "A"}` would suppress a
 * real loss. Coverage therefore requires the pending value to be DEFINED —
 * unless the failed one was itself undefined, in which case the two agree.
 */
export function patchCovers(
  failed: Partial<Lesson>,
  pending: Partial<Lesson> | null,
): boolean {
  if (pending === null) return false;
  return Object.keys(failed).every((k) => {
    if (!(k in pending)) return false;
    const failedValue = failed[k as keyof Lesson];
    const pendingValue = pending[k as keyof Lesson];
    // A defined value can only be superseded by another defined value.
    return failedValue === undefined || pendingValue !== undefined;
  });
}

/**
 * Build the failure signal for a write that did not land — or `null` when the
 * failure is inconsequential and must NOT be surfaced.
 *
 * Exported and pure so the two decisions that matter can be tested without
 * mounting a provider: whether to speak at all, and whether this was a definite
 * FAILURE or an unknowable TIMEOUT. Both were previously buried in a callback
 * with no coverage, in the diff whose whole purpose is making silent failures
 * visible.
 */
export function buildWriteFailure(
  id: number,
  op: string,
  scope: "personal" | "team",
  error: unknown,
  inconsequential: boolean,
): PlannerWriteFailure | null {
  if (inconsequential) return null;
  return {
    id,
    // A timeout is not a failure — it is an UNKNOWN. Collapsing the two here
    // would throw away the distinction the queue went to trouble to make, one
    // layer after making it.
    kind: error instanceof SerialWriteTimeoutError ? "timeout" : "failed",
    op,
    scope,
    message:
      error instanceof Error && error.message
        ? error.message
        : "The change could not be saved.",
  };
}

/** A non-field lesson write, before identity (owner / save target) is attached.
 *  `move` is the resolved FINAL slot, never a partial patch — sending a bare
 *  `{ day }` lets the omitted `week` default to 0 server-side and the lesson
 *  vanishes on reload. */
type LessonOp =
  | { kind: "move"; lessonId: string; week: number; day: number }
  | { kind: "archive"; lessonId: string }
  | { kind: "unarchive"; lessonId: string };

/** A `LessonOp` with the identity captured at enqueue time. */
type LessonOpPayload = LessonOp & {
  ownerId: string;
  saveTarget: "personal" | "core";
};

/**
 * The `lastChange.kind` values the document-replay tee persists (see the
 * provider effect). These are EXACTLY the mutators that change the document
 * without writing anything themselves; every other kind already tees its own
 * write, and adding one here would double-send it.
 *
 * `undo`/`redo` are set directly by the reducer's own branches; the other four
 * come from `buildLastChange` below, where `kind` is the action type verbatim.
 */
const REPLAYED_CHANGE_KINDS: ReadonlySet<string> = new Set([
  "undo",
  "redo",
  "bumpLesson",
  "relocateLesson",
  "unarchiveLesson",
]);

/**
 * `restoreLesson` is DELIBERATELY ABSENT from the set above, and that is a
 * decision, not an oversight (§4a gate, Codex High).
 *
 * "Restore the team's version" means the personal FORK should stop existing.
 * The replay diff cannot express that: it writes content fields, and the fork
 * signals (`isPersonal` / `modified` / `moved`) are derived from
 * `is_diverged_from_master`, which no client may set. Replaying restore would
 * therefore push the master's text INTO the personal copy and leave the copy
 * standing — the card keeps its "Modified" pill after reload, and the lesson
 * still does not follow later Team Curriculum updates. That is a NEW wrong
 * state, worse than the honest reducer-local behaviour it replaced.
 *
 * The real fix is a source verb that DELETES the personal copy row. It is not
 * in this change because it is destructive — for a snapshot-less fork it would
 * discard the teacher's own edits, which the reducer's restore does not do — so
 * it needs an explicit product decision, not a data-layer guess. Until then
 * restore stays session-local, exactly as it was.
 */

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
   * uid, no write tee — the source call IS the persistence. (The
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
   * The most recent persist failure, or null. Identity changes on EVERY
   * failure (monotonic `id`), so a bridge can `useEffect(..., [lastWriteFailure])`.
   *
   * WHY THIS IS A SIGNAL AND NOT A RESULT. `lib/workspaces/actions.ts` is the
   * right pattern for a server action — it has a caller, so it resolves
   * `{ok:false,error}` and the caller decides. The planner's persist tees have
   * no caller: they are fire-and-forget, dispatched optimistically after the
   * reducer has already committed, and the function that started them returned
   * long ago. There is nothing to return a Result TO. So the equivalent honesty
   * is to publish the failure where something can render it.
   *
   * The store cannot render it itself: ConsequenceToastProvider mounts as a
   * CHILD of PlannerProvider (see app/(planner)/layout.tsx), so its hook is out
   * of scope in this provider body. A small bridge inside that provider — the
   * same shape as components/shell/undo-toast-bridge.tsx — turns this into a
   * toast. Until one exists the failure still reaches console.error, so nothing
   * regresses; it just stays invisible to the teacher.
   *
   * `scope` is the part that matters most. A teacher without
   * `can_edit_subject_master` who flips to Team Curriculum sees an entirely
   * normal edit, and finds it gone on reload — the write was RLS-denied against
   * the shared row. A toast that says "Team" is the difference between
   * "something failed" and "the change you just made for everyone did not save".
   */
  lastWriteFailure: PlannerWriteFailure | null;
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
   * Patch a unit's editable Track-B workspace fields (B1.7 Unit Plan editor):
   * big idea, essential questions, vocabulary, K/U/D, notes, etc. Units are
   * TEAM / MASTER content — there is NO personal fork, so this always targets
   * the shared `units` row and takes NO save target. The optimistic catalog
   * update lands immediately; with the Supabase flag ON the same patch tees to
   * `updateUnitFields` (RLS-gated to subject-master / grade-lead — an
   * unauthorized write is surfaced via console.error, never a silent personal
   * fork), flag OFF it stays reducer-local. NON-undoable (catalog side-channel).
   *
   * WRITE SEMANTICS (§4a): gated to Team Curriculum mode at the store boundary
   * AND re-checked at send time; per-unit serialized + coalesced so writes never
   * commit out of order; on an RLS denial / error the catalog reconciles from
   * the CANONICAL server row (re-applying any still-pending edit — never a blind
   * baseline revert that could erase a succeeded earlier write) and
   * `onResult(false)` fires (never a false success). Flag OFF, `onResult(true)`
   * fires immediately (the reducer update IS the save).
   */
  editUnitFields: (
    unitId: string,
    patch: UnitPatch,
    onResult?: (ok: boolean) => void,
  ) => void;
  /** Whether a unit has a RETAINED failed write (§4a R5 H2) — a write that
   *  errored after the editor unmounted (close / unit switch). The Unit Plan
   *  editor reads this on open to re-surface the failure with a retry action. */
  hasFailedUnitWrite: (unitId: string) => boolean;
  /** Re-submit a unit's retained failed patch (§4a R5 H2 — the "retry?" action).
   *  Gated to Team mode; a confirmed retry clears the retained patch. */
  retryFailedUnitWrite: (
    unitId: string,
    onResult?: (ok: boolean) => void,
  ) => void;
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

// ── Unit-patch helper (B1.7) ────────────────────────────────────────────────
/** Project a Unit's editable Track-B fields into a `UnitPatch`. Used to merge a
 *  canonical server row back into the catalog — on a successful write's echo and
 *  on the post-failure reconcile (unit-write-queue). Every editable key is
 *  carried (undefined where unset) so the reconcile clears fields the failed
 *  burst had optimistically added, not just changed. */
function unitToPatch(u: Unit): UnitPatch {
  return {
    notes: u.notes,
    bigIdea: u.bigIdea,
    essentialQuestions: u.essentialQuestions,
    vocab: u.vocab,
    kud: u.kud,
    standardIds: u.standardIds,
    framework: u.framework,
    frameworkData: u.frameworkData,
    customFields: u.customFields,
    carried: u.carried,
    defaultFlow: u.defaultFlow,
    defaultDuration: u.defaultDuration,
    archived: u.archived,
    // Week range (the Plan timeline's band drag). Carried here for the same
    // reason as every other editable key: the reconcile rebuilds the catalog
    // unit from the CANONICAL server row, and a projection that omitted the
    // schedule would leave a failed drag's optimistic week range on screen
    // permanently — the one field where a stale local value silently
    // contradicts what every other teacher on the team sees.
    startWeek: u.startWeek,
    endWeek: u.endWeek,
    weeks: u.weeks,
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

  // Live edit-mode ref for the unit-write BOUNDARY GATE (B1.7 §4a M4). Units are
  // TEAM/MASTER content with no personal fork, so editUnitFields must refuse any
  // write when not in Team Curriculum mode — even a stale debounced callback that
  // fires after a Team→Personal switch, or any future/stale caller.
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;

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
    // ── CANCELLED IS NOT FAILED ────────────────────────────────────────────
    // The hydrate runs as a Next server action — a POST to the page route — so
    // navigating away CANCELS it. The browser logs `net::ERR_ABORTED` and the
    // fetch rejects `TypeError: Failed to fetch` about six milliseconds later.
    // This catch used to treat that exactly like a backend error and paint
    // hydration:"error" over an empty document — for a request the teacher
    // themselves cancelled by clicking a link. Live on prod, once per session,
    // on clean auth, and it fed a second surface's false "No lessons planned".
    //
    // A cancelled fetch and a genuinely unreachable network are NOT
    // distinguishable from the error object (see lib/async-failure.ts), so the
    // ambiguity is resolved by OBSERVATION rather than by guessing: an
    // unsettled attempt is retried once, and only a second unsettled attempt —
    // or any error with a real message — is reported as a failure. That also
    // matches the live behaviour, where the data always renders on the retry.
    //
    // Nothing here paints an intermediate state. A superseded attempt leaves
    // hydration on "loading", so no surface is ever told the document is empty
    // because of a click.
    let attempt = 0;
    const runHydrate = async (): Promise<void> => {
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
          // Genuinely empty DOCUMENT — but NOT an empty catalog. The four reads
          // above all succeeded, so subjects/units/standards are live reference
          // data that a freshly-provisioned workspace (or a brand-new school
          // year) needs BEFORE it can hold a single lesson. Dispatching a bare
          // `setHydration` here would keep EMPTY_CATALOG on screen and discard
          // them — and since `hydrate` is the only path into the catalog slice
          // (`setCatalog` exists but is never dispatched), nothing would ever
          // put them back: no subjects → no unit workspace, and DailyView's
          // quick-add silently no-ops when `subjects[0]` is undefined. That is a
          // cold-start deadlock on exactly the path a new school takes.
          //
          // So hydrate the CATALOG with an empty document and settle to "empty":
          // plannerDataStateFromHydration maps "empty" → "settled", so surfaces
          // render their real "no lessons yet" state (never a stuck spinner) while
          // the catalog is fully populated. Sections are skipped deliberately —
          // there are no lessons to batch.
          dispatchRef.current({
            type: "hydrate",
            doc: EMPTY_DOC,
            catalog: { subjects, units, standards, activeGradeId: gradeLevelId },
            hydration: "empty",
            owner: ownerId,
          });
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
        //
        // The batch read is DELIBERATELY not inside the primary try: it is
        // SUPPLEMENTARY. All four primary reads have already succeeded at this
        // point, so letting a sections RPC failure reach the outer catch would
        // throw away a fully-loaded document and paint hydration:"error" — the
        // whole planner blank because of a decoration. `fillSyntheticSections`
        // already handles a lesson the batch omits, so an EMPTY batch is a
        // first-class fallback: every lesson gets read-only synthetic sections
        // from its own already-loaded `resources`, and the teacher's real
        // sections re-appear on the next successful hydrate.
        let batchedSections: Record<string, LessonSectionContent[]> = {};
        try {
          batchedSections = await plannerClient.getSectionsBatch(
            lessons.map((l) => l.id),
            ownerId,
          );
        } catch (err) {
          // Same cancelled-vs-failed distinction as the outer catch, minus the
          // retry: this read is supplementary and the fallback is already
          // correct, so a superseded batch is not worth a second round-trip.
          //
          // THREE MESSAGES, NOT TWO, and the middle one is the point. Collapsing
          // "aborted" and "transport" into a single "cancelled (likely
          // superseded by navigation)" line asserts a CAUSE that this file's own
          // classifier documents as unknowable at this layer — and unlike the
          // hydrate, there is no retry here to settle it by observation. A
          // teacher whose network dropped would silently fall back to synthetic
          // sections under a log line blaming their own navigation. That is the
          // 7.16 misdiagnosis inverted, and it is the reason the classifier has
          // three states rather than two.
          const kind = classifyAsyncFailure(err);
          if (kind === "failed") {
            console.error(
              "[planner] section batch failed; falling back to synthetic sections",
              err,
            );
          } else if (kind === "aborted") {
            console.info(
              "[planner] section batch cancelled; using synthetic sections",
              err,
            );
          } else {
            console.warn(
              "[planner] section batch did not settle — cancelled by navigation OR the network is down, we cannot tell here and do not retry; using synthetic sections. Persisted sections reappear on the next successful hydrate.",
              err,
            );
          }
        }
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
        if (!alive) return;
        const kind = classifyAsyncFailure(err);

        // DEFINITELY cancelled, or not yet settled: try again instead of
        // concluding anything. Distinct log lines on purpose — a console
        // reading "superseded" tells the next person this was a navigation,
        // not breakage. Reading a navigation-abort sweep AS breakage is how the
        // 7.16 cutover was misdiagnosed.
        if (shouldRetryRead(err, attempt, MAX_HYDRATE_ATTEMPTS)) {
          attempt += 1;
          console.info(
            `[planner] hydrate ${kind === "aborted" ? "cancelled" : "did not settle"} (likely superseded by navigation) — retry ${attempt}/${MAX_HYDRATE_ATTEMPTS - 1}; state left on "loading"`,
            err,
          );
          // A short beat so a retry fired mid-navigation isn't cancelled by the
          // same navigation that killed the first attempt.
          await new Promise((r) => setTimeout(r, 400));
          if (!alive) return;
          return runHydrate();
        }
        // A real error, or the retry budget is spent. Stay on EMPTY_DOC —
        // surfacing mock/Grade-5 fixtures as if they were live data would be
        // worse than an honest blank planner — and mark "error" so
        // usePlannerDataState reports `"error"` rather than `"settled"`, which
        // is what stops a surface asserting the teacher's day is empty.
        //
        // "error" EVEN FOR AN EXHAUSTED CANCELLATION, and that is deliberate.
        // Leaving hydration on "loading" would be the honest label for the
        // CAUSE and a lie about the STATE: nothing is loading any more, no
        // further attempt is coming, and the teacher would sit in front of a
        // skeleton forever until the workspace or account changed. From their
        // seat a permanently blank planner IS a failure whatever cancelled it.
        console.error(
          `[planner] hydrate gave up after ${attempt + 1} attempt(s); showing empty document`,
          err,
        );
        dispatchRef.current({ type: "setHydration", hydration: "error" });
      }
    };
    void runHydrate();
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

  // ── THE WRITE-TEE CONTRACT (planner Supabase seam) ──────────────────────
  // Every persist helper below obeys the same three rules. Stated once here so
  // the helpers can refer to "the write-tee contract" instead of restating it.
  //
  //   GATING. Both the backend flag AND a resolved auth uid. With the flag OFF
  //     (or no session) a helper is a no-op, so the prototype path is
  //     byte-identical to the pre-seam reducer — the mutator's dispatch is the
  //     only effect, and a null owner is never sent as a key.
  //   OPTIMISM. Mutators dispatch to the reducer FIRST (snappy UI), then tee the
  //     write. The reducer is the source of truth for the session; the await
  //     lives inside a detached promise so the caller stays synchronous.
  //   ERROR HANDLING. A rejected write leaves the reducer state standing and is
  //     surfaced via console.error — never swallowed, never blocking. A
  //     reconcile toast is unreachable from here: ConsequenceToastProvider
  //     mounts as a CHILD of PlannerProvider (see (planner)/layout), so its hook
  //     is out of scope in this provider body. console.error is the strongest
  //     non-blocking signal available without reordering providers.
  //
  // There is deliberately no generic `persist(method, ...args)` escape hatch any
  // more: every lesson write now belongs to an ORDERED axis (field patch,
  // slot/completion/archive, sections), and an unordered one-shot alongside them
  // is how two edits to the same axis commit out of order with nothing logged.

  // Every persist failure lands here as well as in the console, so a bridge
  // inside ConsequenceToastProvider can tell the teacher. See
  // PlannerValue.lastWriteFailure for why a signal rather than a Result.
  const [lastWriteFailure, setLastWriteFailure] =
    useState<PlannerWriteFailure | null>(null);
  const writeFailureSeqRef = useRef(0);
  const reportWriteFailure = useCallback(
    (
      op: string,
      scope: "personal" | "team",
      err: unknown,
      inconsequential = false,
    ): void => {
      // THE ONLY REASON TO STAY QUIET IS SUPERSESSION — not the error's shape.
      //
      // The hydrate can afford to ignore an "aborted" or ambiguous "transport"
      // rejection because it RETRIES and settles the question by observation. A
      // write has no retry: the queue drains what is pending and moves on. So
      // for a write, an aborted request is just as lost as a failed one, and
      // classifying by error shape here would silently drop exactly the signal
      // this seam exists to provide (a teacher going offline mid-keystroke, or a
      // request cancelled during teardown).
      //
      // What DOES make a failure inconsequential is a newer queued payload that
      // COVERS this one — carries every field it carried. When that lands the
      // teacher's state is saved and this attempt lost a race it never needed to
      // win; reporting it would say their work was lost while the queue is busy
      // saving it. Each caller computes coverage itself, because only it knows
      // whether its payloads are whole values or partial patches.
      const next = buildWriteFailure(
        writeFailureSeqRef.current + 1,
        op,
        scope,
        err,
        inconsequential,
      );
      if (next === null) return;
      writeFailureSeqRef.current = next.id;
      setLastWriteFailure(next);
    },
    [],
  );
  // The write queues are built ONCE in a ref initializer, so their onError
  // closures capture the first render. Reading the reporter through a ref keeps
  // them pointed at the live one regardless of declaration order.
  const reportWriteFailureRef = useRef(reportWriteFailure);
  reportWriteFailureRef.current = reportWriteFailure;

  // ── Serialized (latest-wins) section persistence ────────────────────────
  // W3.8 gate fix (Codex HIGH — persistence ordering race): the lesson editor
  // autosaves per keystroke, and EVERY section persist is a FULL
  // `replace_lesson_sections` swap. Firing those unordered lets a slow early
  // request ("a") commit AFTER a later one ("abc"), leaving the DB stale
  // relative to the UI with no error surfaced.
  //
  // NOW ON THE SHARED QUEUE, not a hand-rolled copy of it. It used to be a
  // second implementation of the same state machine — and it was missing the
  // guard the shared one documents at length: its drain was
  // `.catch(handler).then(settle)`, so a throw from `handler` SKIPS the
  // `.then`, leaves `inFlight` true forever, and silently parks every later
  // section write for that lesson for the rest of the session. That was
  // survivable while the catch body was a bare `console.error`; adding the
  // failure report put a React `setState` inside it and made it reachable.
  // The shared queue already solves this (`try`/`catch` around the reporter
  // plus `.then(settle, settle)`), and brings the hung-send watchdog with it,
  // which the hand-rolled version never had at all.
  //
  // Key = lessonId + saveTarget: a `core` snapshot writes the shared team
  // section rows and a `personal` one writes this teacher's, so they are
  // different rows with no ordering relationship and must not share a slot.
  // Identity is captured INTO the payload at enqueue time, so a mid-flight
  // sign-out or a Personal↔Team flip never retargets an authored snapshot.
  const sectionWriteQueueRef = useRef(
    createSerialWriteQueue<{
      lessonId: string;
      sections: LessonSectionContent[];
      ownerId: string;
      saveTarget: "personal" | "core";
    }>({
      send: (p) =>
        plannerClient.setSections(
          p.lessonId,
          p.sections,
          p.ownerId,
          p.saveTarget,
        ),
      onError: (err, p, pending) => {
        // Per the write-tee contract: reducer state stands and the dropped
        // write is surfaced without blocking the UI.
        console.error("[planner] persist 'setSections' failed", err);
        // A snapshot is the COMPLETE resolved section list, so any pending one
        // covers the failed one — existence is coverage here. (Contrast the
        // field queue, whose payloads are partial patches.)
        reportWriteFailureRef.current(
          "setSections",
          p.saveTarget === "core" ? "team" : "personal",
          err,
          pending !== null,
        );
      },
    }),
  );

  const persistSectionsSerialized = useCallback(
    (lessonId: string, sections: LessonSectionContent[]): void => {
      // Write-tee gating: flag OFF / no session → no-op (prototype mode is
      // reducer-local, byte-identical to the pre-seam behavior).
      if (!isPlannerSupabaseConfigured()) return;
      const ownerId = ownerIdRef.current;
      if (!ownerId) return;
      const saveTarget = saveTargetRef.current;
      sectionWriteQueueRef.current.enqueue(sectionLane(lessonId, saveTarget), {
        lessonId,
        sections,
        ownerId,
        saveTarget,
      });
    },
    [],
  );

  // ── Serialized (latest-wins) lesson-FIELD persistence ───────────────────
  // B3 gate fix (Codex HIGH — the same ordering race W3.8 closed for sections,
  // still open for scalar fields). `editLesson` autosaves per keystroke through
  // the fire-and-forget tee that preceded this queue, so two `updateLesson` calls for one
  // field are UNORDERED on the wire: typing "Quiz" can leave the DB holding
  // "Qu" if the earlier request commits last, and a reload silently discards
  // the newer text. Pre-existing — every scalar field in the B2 lesson editor
  // rides this path — and B3's Assessments drawer is a second editor over it.
  //
  // Serialized PER COALESCE KEY, not per lesson. That distinction is the whole
  // correctness argument: an `updateLesson` payload is a PARTIAL patch, so a
  // per-lesson latest-wins slot would let a newer `{assessment}` DISCARD a
  // still-pending `{title}` and lose an unrelated edit. Same-key patches always
  // carry the same field(s) at their complete current value, so dropping an
  // intermediate one is safe — exactly the property the section queue relies on.
  // Callers without a coalesce key get a key derived from the patch's own field
  // names, so two different fields can never share a slot.
  // The payload carries its own lessonId, so the queue can never apply one
  // lesson's patch to another — the concrete hazard when a queue keyed by a
  // caller-supplied coalesce string shares a slot between two lessons.
  const fieldWriteQueueRef = useRef(
    createSerialWriteQueue<{
      lessonId: string;
      patch: Partial<Lesson>;
      ownerId: string;
      saveTarget: "personal" | "core";
    }>({
      send: (p) =>
        plannerClient.updateLesson(p.lessonId, p.patch, p.ownerId, p.saveTarget),
      onError: (err, p, pending) => {
        // Per the write-tee contract: reducer state stands and the dropped
        // write is surfaced.
        console.error("[planner] persist 'updateLesson' failed", err);
        // COVERAGE, not mere existence. These payloads are PARTIAL patches, and
        // a lane can legitimately carry differently-shaped ones: the direct
        // toggle sends `{status}` while a replayed undo sends
        // `{status, reasonNotDone}`. A pending `{status}` does not carry the
        // reason, so treating it as superseding would lose that field with no
        // trace. Only a pending patch that covers EVERY key of the failed one
        // makes the failure inconsequential.
        const covered = patchCovers(p.patch, pending?.patch ?? null);
        reportWriteFailureRef.current(
          "updateLesson",
          p.saveTarget === "core" ? "team" : "personal",
          err,
          covered,
        );
      },
    }),
  );

  // ── Serialized NON-FIELD lesson writes (slot · completion · archive) ─────
  // The serial queue above closed the ordering race for lesson FIELDS. The other
  // three lesson axes still rode a raw fire-and-forget tee, so two
  // quick drags of the same card raced on the wire: both requests succeed, the
  // slower-but-earlier one commits last, and the DB ends up holding a slot the
  // teacher already moved away from — with nothing logged, because nothing
  // failed. Same hazard for a fast done → not-done → done, and for
  // archive → Undo.
  //
  // One queue, keyed per lesson AND per AXIS, because latest-wins is only safe
  // within an axis: a newer move must supersede an older move, but must never
  // evict a still-pending archive. Archive and un-archive deliberately SHARE
  // the "archive" key — they are two values of one axis, and ordering between
  // them is exactly what an Undo depends on.
  //
  // COMPLETION is NOT here. It rides the FIELD queue as a completion-only
  // `updateLesson` patch, because that is the only way `status` and
  // `reasonNotDone` reach the server in ONE atomic `writeStatus` — and because
  // it puts every completion write, direct or replayed, in a single lane. A
  // completion-only patch provably never forks (isCompletionOnlyPatch).
  const lessonOpQueueRef = useRef(
    createSerialWriteQueue<LessonOpPayload>({
      send: (p) => {
        switch (p.kind) {
          case "move":
            return plannerClient.moveLesson(
              p.lessonId,
              { week: p.week, day: p.day },
              p.ownerId,
              p.saveTarget,
            );
          case "archive":
            return plannerClient.softDeleteLesson(p.lessonId, p.ownerId);
          case "unarchive":
            return plannerClient.unarchiveLesson(p.lessonId, p.ownerId);
        }
      },
      onError: (err, p, pending) => {
        // Per the write-tee contract: reducer state stands and the
        // dropped write is surfaced.
        console.error(`[planner] persist '${p.kind}' failed`, err);
        // Every payload on these lanes is a WHOLE axis value — a fully-resolved
        // {week, day}, or the archived flag — so any pending payload covers the
        // failed one and existence is coverage. (Contrast the field queue, whose
        // payloads are partial patches.)
        //
        // SCOPE COMES FROM THE VERB, NOT THE PAYLOAD. `softDeleteLesson` and
        // `unarchiveLesson` take only (lessonId, ownerId) and are PERSONAL-scoped
        // whatever the toggle says — they never touch the shared master row.
        // Reading `p.saveTarget` here told a teacher in Team mode that a
        // personal-only operation "didn't save for the Team Curriculum", which
        // misuses the one word in this message that carries consequence.
        reportWriteFailureRef.current(
          p.kind,
          failureScopeForOp(p.kind, p.saveTarget),
          err,
          pending !== null,
        );
      },
    }),
  );

  // ── Which side of the fork a lesson was last written to ─────────────────
  // A REPLAYED write (undo/redo) must land on the same side of the forking model
  // as the change it reverses. `saveTargetRef.current` is the target NOW, which
  // is not the same thing: edit a title in Team Curriculum, flip the top-bar
  // toggle to Personal, then ⌘Z — the reducer shows the team edit undone, but a
  // write keyed to the CURRENT target forks a personal copy while the shared
  // master row quietly keeps the change (CLAUDE.md §2).
  //
  // So each lesson remembers the target of its most recent write and a replay
  // reuses it. Undo reverses the most recent action; if that action touched this
  // lesson, this map holds exactly that action's target — so the first undo
  // after a mode flip, the realistic case, is exact.
  //
  // LIMIT, stated plainly: successive undos reaching back PAST a mode change
  // reuse the most recent target rather than each history entry's own. Making
  // that exact means stamping the target onto every history entry — a reducer
  // and action-shape change well beyond this fix. The residual error direction
  // is the safe one (a personal fork where master was meant), never a personal
  // edit silently landing on the team's shared row.
  const lastWriteTargetRef = useRef(new Map<string, "personal" | "core">());
  const writeTargetFor = useCallback(
    (lessonId: string, replay: boolean): "personal" | "core" => {
      const target = replay
        ? (lastWriteTargetRef.current.get(lessonId) ?? saveTargetRef.current)
        : saveTargetRef.current;
      lastWriteTargetRef.current.set(lessonId, target);
      return target;
    },
    [],
  );

  /** Enqueue a slot / archive write on its own per-lesson axis. Write-tee
   *  gating: flag OFF or no session → reducer-local no-op. */
  const persistLessonOp = useCallback(
    (op: LessonOp, replay = false): void => {
      if (!isPlannerSupabaseConfigured()) return;
      const ownerId = ownerIdRef.current;
      if (!ownerId) return;
      // Identity captured at ENQUEUE time so a mid-flight sign-out or a
      // Personal↔Team flip never retargets an already-authored write.
      const axis = op.kind === "unarchive" ? "archive" : op.kind;
      const saveTarget = writeTargetFor(op.lessonId, replay);
      // The ARCHIVE axis is PERSONAL-SCOPED IN THE SOURCE whatever the toggle
      // says: `softDeleteLesson` / `unarchiveLesson` take only (lessonId,
      // ownerId) and never touch the shared master row (§4.6). So its lane must
      // NOT be split by target — there is only one row to write, and splitting
      // would let a Team-mode archive and a Personal-mode un-archive run
      // concurrently against it. `move` DOES write different rows per target,
      // so it splits (see the field queue for the failure this prevents).
      lessonOpQueueRef.current.enqueue(lessonOpLane(op.lessonId, axis, saveTarget), {
        ...op,
        ownerId,
        saveTarget,
      });
    },
    [writeTargetFor],
  );

  /** Persist a lesson content patch, ORDERED PER FIELD.
   *
   *  The queue lane is derived from the PATCH ITSELF — never from a
   *  caller-supplied string. That is the whole correctness argument, and getting
   *  it wrong is subtle: while the lane was the caller's coalesce key, a direct
   *  editor write (`lesson:<id>:title`) and the undo that reverses it
   *  (`replay::title`) landed in DIFFERENT lanes, so both could be in flight for
   *  the same column at once — and a late-committing "New" would overwrite the
   *  "Old" the teacher just undid. Any two writes touching a column must share
   *  exactly one lane, whatever produced them.
   *
   *  So the patch is SPLIT into per-field groups, each with its own lane. A
   *  multi-field patch becomes one request per group; `updateLesson` takes
   *  partial patches, and the alternative — one lane per field COMBINATION —
   *  puts `{title}` and `{title, notes}` in different lanes and re-opens the
   *  same race. `standards` + `standardIds` are index-aligned, so they travel as
   *  ONE group; splitting them would let the codes and the ids disagree. */
  const persistLessonPatchSerialized = useCallback(
    (lessonId: string, patch: Partial<Lesson>, replay = false): void => {
      // Write-tee gating: flag OFF / no session → no-op.
      if (!isPlannerSupabaseConfigured()) return;
      if (!ownerIdRef.current) return;
      // Identity captured at ENQUEUE time so a mid-flight sign-out or a
      // Personal↔Team flip never retargets an already-authored patch. A REPLAY
      // reuses the side of the fork this lesson was last written to — see
      // writeTargetFor.
      const ownerId = ownerIdRef.current;
      const saveTarget = writeTargetFor(lessonId, replay);
      for (const [group, groupPatch] of splitPatchByField(patch)) {
        // ALWAYS namespaced by lessonId — two lessons must never share a lane,
        // or the newer lesson's patch evicts the older one's and loses an edit.
        //
        // AND BY saveTarget, which is the same argument one level down. A `core`
        // write targets the SHARED master row; a `personal` one targets this
        // teacher's copy. They are different rows, so they have no ordering
        // relationship and must not share a slot. With the target only in the
        // payload, this happened: a teacher edits a title in Team Curriculum,
        // the core write is RLS-denied, and before it settles they flip to
        // Personal and type again — the personal payload lands in the same
        // lane's pending slot, the core rejection reads as SUPERSEDED, and it is
        // swallowed. The personal write succeeds, master never got the edit, and
        // nobody is told. That is verbatim the case the write-failure bridge
        // exists to catch. Separating them costs nothing: neither can supersede
        // the other because neither writes the other's row.
        fieldWriteQueueRef.current.enqueue(
          lessonFieldLane(lessonId, saveTarget, group),
          {
            lessonId,
            patch: groupPatch,
            ownerId,
            saveTarget,
          },
        );
      }
    },
    [writeTargetFor],
  );

  // ── Document-replay persistence (undo/redo + the reducer-only mutators) ──
  // Six mutators changed the document and wrote NOTHING:
  //
  //   undo / redo      — the worst of them. Every other mutator persists on the
  //                      way IN, so ⌘Z rewound the reducer alone: the toast
  //                      confirmed an undo that came back on reload, and a Team-
  //                      mode value the teacher had just taken back stayed
  //                      shared with the whole team.
  //   bumpLesson       — reschedule to the next free slot.
  //   relocateLesson   — move (or copy-then-move) to a target slot.
  //   unarchiveLesson  — the Undo half of an archive: the delete committed, the
  //                      restore did not. A whole Catch-Up triage session (the
  //                      surface whose ONLY job is rescheduling) evaporated on
  //                      reload.
  //
  // (`restoreLesson` is the sixth and is deliberately NOT replayed — see the
  // note beside REPLAYED_CHANGE_KINDS. Replaying it would leave a fork standing
  // with master's text in it, which is a new wrong state, not a fix.)
  //
  // All six ask the same question, so they get one answer: the document went
  // from A to B — what has to be written for a reload to show B? `lib/planner/
  // doc-replay.ts` answers it as a pure diff; this effect executes the result
  // through the SAME verbs the hand-written tees use, so a replayed write is
  // indistinguishable from a direct one (serialized field patches included).
  //
  // KNOWN LIMIT (§4a gate, Codex Medium — accepted, not overlooked). The diff
  // runs render-to-render, so if a DIRECT mutator and its undo land in the SAME
  // React batch, the direct write has already been enqueued while the net
  // prevDoc→present diff is empty — no compensating write is sent and the
  // server keeps the pre-undo value. It takes two gestures inside one frame
  // (each real gesture is its own task, so auto-batching does not combine
  // them), and the next edit or reload reconciles it. Closing it properly means
  // capturing replay intent at DISPATCH time rather than diffing documents,
  // which is a bigger change than this fix warrants.
  //
  // KEYED ON `lastChange`, NOT ON THE MUTATORS. Reading the post-dispatch
  // document out of a callback closure would go stale the moment two actions
  // batch into one render. Diffing across renders instead is exact by
  // construction: `prevDocRef` holds the doc this effect last saw, `present` is
  // the committed reducer state, and React's batching simply makes the diff the
  // NET of everything that landed — which is the right thing to persist.
  //
  // The allowlist is the whole safety argument. Only the six kinds above replay;
  // every other mutator already tees its own write, and replaying those too
  // would double-send. `hydrate` clears lastChange to null, so a fresh document
  // arriving from the server can never be mistaken for an edit and echoed back.
  const prevDocRef = useRef<PlannerDoc | null>(null);
  useEffect(() => {
    const prevDoc = prevDocRef.current;
    prevDocRef.current = present;
    // Write-tee gating: flag OFF / no session → reducer-local only.
    if (!isPlannerSupabaseConfigured()) return;
    if (!ownerIdRef.current) return;
    if (!prevDoc || prevDoc === present) return;
    if (!lastChange || !REPLAYED_CHANGE_KINDS.has(lastChange.kind)) return;

    for (const op of diffLessonsForReplay(prevDoc.lessons, present.lessons)) {
      switch (op.kind) {
        case "move":
        case "archive":
        case "unarchive":
          // Through the SAME per-axis serialized queue the direct mutators use,
          // so a replayed write orders correctly against a concurrent direct one
          // for the same lesson+axis (an Undo landing on the heels of the
          // archive it reverses is exactly that case). `replay: true` reuses the
          // side of the fork this lesson was last written to.
          persistLessonOp(op, true);
          break;
        case "completion":
          // BOTH fields in ONE patch, on the shared "completion" lane — see
          // splitPatchByField for why they can never be written separately.
          persistLessonPatchSerialized(
            op.lessonId,
            { status: op.status, reasonNotDone: op.reasonNotDone },
            true,
          );
          break;
        case "patch":
          // Through the serialized queue, which lanes by FIELD — so a replayed
          // patch and a concurrent keystroke autosave for the same column share
          // one lane and commit in order rather than racing.
          persistLessonPatchSerialized(op.lessonId, op.patch, true);
          break;
        case "unpersistable":
          // Surfaced, never swallowed. A lesson appearing or vanishing has no
          // source verb that reproduces it (see doc-replay.ts), so the reducer
          // and the server genuinely disagree until the next hydrate — the one
          // thing the teacher must not be told is that it saved.
          console.error(
            `[planner] '${lastChange.kind}' changed lesson ${op.lessonId} in a way no write can express (${op.reason}); it will not survive reload`,
          );
          break;
      }
    }
    // `present` and `lastChange` are the intended triggers; the persist helpers
    // are stable and listed for lint completeness.
  }, [present, lastChange, persistLessonOp, persistLessonPatchSerialized]);

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
        // Through the SERIALIZED slot queue, so two quick drags of the same card
        // commit in gesture order instead of racing on the wire.
        persistLessonOp({ kind: "move", lessonId: id, week, day });
      }
    },
    [persistLessonOp, present.lessons],
  );

  const setLessonStatus = useCallback(
    (id: string, status: LessonStatus) => {
      dispatchRef.current({ type: "setLessonStatus", id, status });
      // A completion-ONLY patch: the source routes it to `writeStatus` and it
      // never forks (CLAUDE.md §2 — completion is always per-teacher).
      // `reasonNotDone` is deliberately omitted so the server keeps whatever
      // reason it holds; the shared "completion" lane means a replayed undo of
      // this toggle can never be in flight alongside it.
      persistLessonPatchSerialized(id, { status });
    },
    [persistLessonPatchSerialized],
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
      //
      // Routed through the SERIALIZED queue, not a raw one-shot tee, so
      // per-keystroke autosaves for one field can't commit out of order. The
      // caller's `coalesce.key` drives the REDUCER's history coalescing only —
      // it is deliberately NOT the queue lane. The queue derives its lane from
      // the patch's own fields (see persistLessonPatchSerialized), so an edit
      // and the undo that reverses it share one lane and can never be in flight
      // for the same column simultaneously.
      persistLessonPatchSerialized(id, patch);
    },
    [persistLessonPatchSerialized],
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
      // the REAL lesson; there is no write tee because the createLesson
      // call is itself the persistence (mock: instant in-memory append).
      //
      // Identity plumbing follows the write-tee contract: ownerId from ownerIdRef (the
      // live auth uid), grade from gradeLevelIdRef (captured during hydrate).
      // In backend mode both must be resolved before a row can be keyed —
      // bail to null instead of writing a mis-keyed row (the contract's "no
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

  // ── Unit-field persistence — CONFIRM-ONLY (§4a round 4) ───────────────────
  // The per-unit serialize + coalesce + send-time gate state machine lives in
  // lib/planner/unit-write-queue.ts (a pure, dependency-injected module so the
  // concurrency contract is deterministically tested — see
  // tests/unit-write-queue.test.ts). Created ONCE; its dep callbacks read the
  // live refs at call time, so a single instance tracks the latest owner /
  // edit-mode without re-creating.
  //
  // CONFIRM-ONLY: the catalog is NEVER written optimistically. `reconcile` (the
  // reducer dispatch) fires ONLY on a CONFIRMED write's canonical row — so a
  // failed / dropped / mode-switched write leaves the catalog untouched (nothing
  // to revert) and the whole "stale optimistic value" bug class is dissolved.
  // The editor's local draft is the user's live value. Flag OFF, `updateUnitFields`
  // routes to the in-memory mock (the confirming source of truth for the session),
  // so its returned row is dispatched into the catalog just like a real backend —
  // and the mock's own store is updated too, so a full reload persists as well.
  //
  // FAILED-WRITE RETENTION (§4a R5 H2): the editor may unmount (close / unit
  // switch) before an RPC settles, so a post-unmount failure has no component to
  // surface it. The queue retains a failed patch HERE (keyed by unit) so the
  // unit's next open can re-surface / retry it — a confirmed write clears it.
  //
  // …AND A RETAINED PATCH CAN GO STALE. Retention outliving the editor is the
  // point; outliving a RE-HYDRATE is the hazard. The patch is retained
  // alongside the BASELINE — what the unit held, server-confirmed, when the
  // write failed — so `retryFailedUnitWrite` can tell "still the value I
  // diverged from" apart from "a teammate has since changed this" and refuse to
  // blind-overwrite the latter. Units are shared, so a blind retry is a
  // team-wide revert to text nobody had on screen.
  const failedUnitWritesRef = useRef(
    new Map<string, { patch: UnitPatch; baseline: UnitPatch }>(),
  );
  // The live catalog units, mirrored for the queue callbacks + the retry
  // guard (both are stable-identity callbacks that must read the CURRENT
  // catalog, not the one captured when they were created).
  const catalogUnitsRef = useRef(state.catalog.units);
  catalogUnitsRef.current = state.catalog.units;
  /** The unit's current server-confirmed field values, or `{}` when the unit is
   *  not in the catalog (a stale id, or a unit outside the hydrated grade).
   *  Stable identity — it reads the ref, never a captured render's catalog. */
  const confirmedUnitPatch = useCallback((unitId: string): UnitPatch => {
    const unit = catalogUnitsRef.current.find((u) => u.id === unitId);
    return unit ? unitToPatch(unit) : {};
  }, []);
  /**
   * The server-confirmed value each unit field DIVERGED FROM — the thing the
   * failed-write retry guard compares against. Maintained by three rules, and
   * all three are needed; each fixes a different way the guard lies.
   *
   *   CAPTURE at ENQUEUE, not at failure. A request can fail seconds after it
   *     was sent, and a re-hydrate in between may already have replaced the
   *     field with a teammate's value — recording THAT as "what I diverged
   *     from" makes the retry look fresh and silently overwrite their edit.
   *   ADVANCE on our own CONFIRMED write, don't drop. Type "A", type "B"
   *     (coalesced behind it), "A" commits, "B" fails: with the baseline
   *     dropped, "B" has none, the catalog legitimately reads "A", and the guard
   *     would call the teacher's own newer text stale and discard it.
   *   RE-CAPTURE when a NEW write sequence starts. Once nothing is outstanding
   *     for a field, the next edit diverges from whatever the catalog holds NOW
   *     — which may be a teammate's value that arrived while we were idle.
   *     Reusing the stale baseline would flag the teacher's own new edit as
   *     stale on a failure and throw it away.
   */
  const enqueuedUnitBaselineRef = useRef(new Map<string, UnitPatch>());
  /** Unit → the field keys with a write still unsettled or retained-failed.
   *  While a key is in here its baseline is live; once it leaves, the next edit
   *  to that key starts a fresh sequence and re-captures. */
  const outstandingUnitKeysRef = useRef(new Map<string, Set<string>>());
  const unitWriteQueueRef = useRef<UnitWriteQueue | null>(null);
  if (unitWriteQueueRef.current === null) {
    unitWriteQueueRef.current = createUnitWriteQueue({
      updateUnitFields: (unitId, patch) =>
        plannerClient.updateUnitFields(unitId, patch, ownerIdRef.current ?? ""),
      reconcile: (unitId, patch) =>
        dispatchRef.current({ type: "editUnitFields", unitId, patch }),
      canWrite: () => editModeRef.current === "master",
      unitToPatch,
      onError: (message, err) => {
        console.error(message, err);
        // Units are TEAM content with no personal fork, so a failed unit write
        // is ALWAYS team-scoped — the teacher needs to know the whole team did
        // not get the change.
        reportWriteFailureRef.current("updateUnitFields", "team", err);
      },
      retainFailed: (unitId, patch) => {
        const m = failedUnitWritesRef.current;
        const prior = m.get(unitId);
        // The baseline comes from what was recorded at ENQUEUE time, never from
        // the catalog as it stands NOW. Reading it here would be too late: a
        // request can fail seconds after it was sent, and a re-hydrate in
        // between can already have replaced the field with a teammate's value —
        // which would then be recorded as "the value I diverged from", making
        // the retry look fresh and silently overwrite their edit. That is the
        // exact revert the baseline exists to prevent.
        const baseline: UnitPatch = { ...(prior?.baseline ?? {}) };
        const authored = enqueuedUnitBaselineRef.current.get(unitId) ?? {};
        for (const key of Object.keys(patch) as (keyof UnitPatch)[]) {
          if (key in baseline) continue;
          // Assigning key-by-key across a heterogeneous patch type needs the
          // index form; the read side is fully typed.
          (baseline as Record<string, unknown>)[key] = authored[key];
        }
        m.set(unitId, {
          patch: { ...(prior?.patch ?? {}), ...patch },
          baseline,
        });
      },
      // FIELD-WISE clear (§4a R6 H2-B): remove only the fields the confirmed
      // write covered; keep any still-unconfirmed retained fields (e.g. an
      // earlier failed `bigIdea` retry survives a later `notes` success). Drop
      // the entry only when nothing retained remains.
      clearFailed: (unitId, confirmedPatch) => {
        // A confirmed write ADVANCES the enqueue-time baseline to the value that
        // just committed — it does NOT delete it. Deleting looks tidier and is
        // wrong: a coalesced later edit can still be in flight against the same
        // field. Type "A", type "B" (coalesced behind it), "A" confirms, "B"
        // fails — with the baseline deleted, "B" retains no baseline at all, the
        // catalog now legitimately reads "A", and the retry guard would call the
        // teacher's own newer text stale and silently drop it. Advancing instead
        // keeps "no teammate touched this" and "a teammate touched this"
        // distinguishable, which is the guard's entire job.
        const authored = enqueuedUnitBaselineRef.current.get(unitId) ?? {};
        const outstanding = outstandingUnitKeysRef.current.get(unitId);
        for (const key of Object.keys(confirmedPatch) as (keyof UnitPatch)[]) {
          (authored as Record<string, unknown>)[key] = confirmedPatch[key];
          // The sequence for this key has landed. A still-coalesced later write
          // compares against the value just advanced above; a brand-new edit
          // after this point re-captures from the catalog, which by then may
          // carry a teammate's value.
          outstanding?.delete(key);
        }
        enqueuedUnitBaselineRef.current.set(unitId, authored);
        if (outstanding && outstanding.size === 0)
          outstandingUnitKeysRef.current.delete(unitId);
        const m = failedUnitWritesRef.current;
        const retained = m.get(unitId);
        if (!retained) return;
        const next = { ...retained.patch };
        const nextBaseline = { ...retained.baseline };
        for (const key of Object.keys(confirmedPatch) as (keyof UnitPatch)[]) {
          delete next[key];
          delete nextBaseline[key];
        }
        if (Object.keys(next).length === 0) m.delete(unitId);
        else m.set(unitId, { patch: next, baseline: nextBaseline });
      },
    });
  }

  const editUnitFields = useCallback(
    (unitId: string, patch: UnitPatch, onResult?: (ok: boolean) => void) => {
      // BOUNDARY GATE (§4a M4): units are TEAM content — refuse any write when not
      // in Team Curriculum mode at ACCEPT time (the queue re-checks at SEND time
      // too — R2 H2). Blocks a stale debounced callback fired after a
      // Team→Personal switch, and any future/stale caller.
      if (editModeRef.current !== "master") {
        onResult?.(false);
        return;
      }
      // Record what each field is DIVERGING FROM, now, before the request goes
      // out — this is the baseline a later failed-write retry checks against.
      // Captured once per key: the first edit since the last confirmation is the
      // one that left the server's value behind, and every keystroke after it
      // diverges from that same point.
      const authored = enqueuedUnitBaselineRef.current.get(unitId) ?? {};
      const outstanding =
        outstandingUnitKeysRef.current.get(unitId) ?? new Set<string>();
      const confirmed = confirmedUnitPatch(unitId);
      for (const key of Object.keys(patch) as (keyof UnitPatch)[]) {
        // Re-capture ONLY when this key has no write still outstanding. Mid
        // sequence the existing baseline is the right one (a coalesced later
        // keystroke diverges from the same point); at the START of a sequence
        // the catalog is the right one, and it may have moved under us.
        if (!outstanding.has(key)) {
          (authored as Record<string, unknown>)[key] = confirmed[key];
        }
        outstanding.add(key);
      }
      enqueuedUnitBaselineRef.current.set(unitId, authored);
      outstandingUnitKeysRef.current.set(unitId, outstanding);
      // CONFIRM-ONLY: no optimistic catalog write. The queue confirms via the
      // source (mock flag-OFF, server flag-ON) and dispatches the CANONICAL row
      // on success; on failure / mode-drop the catalog is untouched. The editor's
      // draft holds the live value throughout.
      unitWriteQueueRef.current?.enqueue(unitId, patch, onResult);
    },
    [confirmedUnitPatch],
  );

  /** Whether a unit has a retained FAILED write (§4a R5 H2) — the editor reads
   *  this on open to re-surface a post-unmount failure. */
  const hasFailedUnitWrite = useCallback(
    (unitId: string): boolean => failedUnitWritesRef.current.has(unitId),
    [],
  );

  /** Re-submit a unit's retained failed patch (§4a R5 H2 — the "retry?" action).
   *  Gated to Team mode; a confirmed retry clears the retained patch (via the
   *  queue's clearFailed). No-op when nothing is retained.
   *
   *  STALE-SAFE. Every retained key is checked against the unit's CURRENT
   *  server-confirmed value before it is re-sent. A key whose value has moved
   *  since the failure — the only way that happens is a re-hydrate pulling in a
   *  teammate's edit, because the confirm-only model never writes the catalog
   *  otherwise — is DROPPED from the retry and forgotten. Re-sending it would
   *  revert shared team content to text that was not on screen at retry time,
   *  and would report success while doing it. */
  const retryFailedUnitWrite = useCallback(
    (unitId: string, onResult?: (ok: boolean) => void) => {
      if (editModeRef.current !== "master") {
        onResult?.(false);
        return;
      }
      const retained = failedUnitWritesRef.current.get(unitId);
      if (!retained) {
        onResult?.(true); // nothing to retry
        return;
      }
      const stale = staleUnitPatchKeys(
        retained.patch,
        retained.baseline,
        confirmedUnitPatch(unitId),
      );
      if (stale.length > 0) {
        const fresh = { ...retained.patch };
        const freshBaseline = { ...retained.baseline };
        const outstanding = outstandingUnitKeysRef.current.get(unitId);
        for (const key of stale) {
          delete fresh[key];
          delete freshBaseline[key];
          // Abandoned: the field's write sequence is over, so the teacher's NEXT
          // edit to it must re-capture a baseline from the current catalog
          // rather than inherit this dropped one.
          outstanding?.delete(key);
          const authored = enqueuedUnitBaselineRef.current.get(unitId);
          if (authored) delete authored[key];
        }
        if (outstanding && outstanding.size === 0)
          outstandingUnitKeysRef.current.delete(unitId);
        console.error(
          `[planner] retry dropped ${stale.length} field(s) on unit ${unitId} (${stale.join(", ")}): the team's value changed after the write failed, so re-sending would revert it`,
        );
        if (Object.keys(fresh).length === 0) {
          // Nothing left to send. Report FAILURE, not success — the teacher's
          // text did not reach the server and never will; the banner must stay
          // honest about that even though there is no longer anything to retry.
          failedUnitWritesRef.current.delete(unitId);
          onResult?.(false);
          return;
        }
        failedUnitWritesRef.current.set(unitId, {
          patch: fresh,
          baseline: freshBaseline,
        });
        unitWriteQueueRef.current?.enqueue(unitId, fresh, onResult);
        return;
      }
      unitWriteQueueRef.current?.enqueue(unitId, retained.patch, onResult);
    },
    [confirmedUnitPatch],
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
      // after — on the shared "archive" axis, so an immediate Undo (which now
      // persists too, through the document-replay tee) commits AFTER this one
      // rather than racing it.
      persistLessonOp({ kind: "archive", lessonId: id });
    },
    [persistLessonOp],
  );

  // unarchiveLesson / restoreLesson / bumpLesson / relocateLesson dispatch only;
  // their persistence is the DOCUMENT-REPLAY tee (see REPLAYED_CHANGE_KINDS and
  // the effect above), which diffs the resulting document and writes it. They
  // used to write nothing at all — the archive Undo toast affirmed a restore
  // that never committed, and a whole Catch-Up triage session evaporated on
  // reload.
  const unarchiveLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "unarchiveLesson", id });
  }, []);

  // restoreLesson is the exception: still reducer-only, on purpose. Clearing a
  // fork needs a source verb that deletes the personal copy — see the note
  // beside REPLAYED_CHANGE_KINDS for why replaying it instead would be worse.
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
      persistLessonOp({ kind: "move", lessonId: id, week, day });
    },
    [persistLessonOp, present.lessons],
  );

  const setSections = useCallback(
    (lessonId: string, next: LessonSectionContent[]) => {
      dispatchRef.current({ type: "setSections", lessonId, next });
      // Routed through the SAME serialized per-lesson queue as the granular
      // section mutators (an unordered one-shot here could interleave with the
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

  // §4a R6 M-C: evict retained failed-write patches for units no longer in the
  // catalog, so failedUnitWritesRef can't grow unbounded. Keyed on COMMITTED
  // catalog state (this effect only runs after a real commit) — deliberately
  // NOT a render-time presence guard on retainFailed, which would leak
  // speculative/aborted-render catalog state into the shared ref under
  // concurrent React (Codex R7/R8). Tradeoff, documented + bounded: units
  // deleted WHILE their writes are in flight, then failing, each leave a
  // retained entry until the next catalog mutation (any hydrate/setCatalog/edit)
  // prunes them — bounded by the count of units deleted while in-flight (a
  // single catalog replacement can remove several), never unbounded. The
  // entries are inert (a retry is user-initiated from the editor, which cannot
  // open a deleted unit), so they are a negligible memory residual, not a
  // correctness risk.
  useEffect(() => {
    const present = new Set(catalog.units.map((u) => u.id));
    const m = failedUnitWritesRef.current;
    for (const id of [...m.keys()]) if (!present.has(id)) m.delete(id);
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
      lastWriteFailure,
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
      editUnitFields,
      hasFailedUnitWrite,
      retryFailedUnitWrite,
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
      lastWriteFailure,
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
      editUnitFields,
      hasFailedUnitWrite,
      retryFailedUnitWrite,
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
