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
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { arrayMove } from "@dnd-kit/sortable";

import type {
  Lesson,
  LessonResource,
  LessonStatus,
  SubjectId,
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
import { LESSONS } from "@/lib/mock";
import {
  LESSON_TEMPLATE_BY_ID,
  DEFAULT_LESSON_TEMPLATE_ID,
} from "@/lib/lesson-templates";

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum number of undo steps retained. */
export const HISTORY_LIMIT = 50;

/** Milliseconds within which same-key text edits are coalesced into one step. */
const COALESCE_WINDOW_MS = 700;

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
  patch: { day?: number; subject?: SubjectId; week?: number };
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

// ── History control actions ──────────────────────────────────────────────

type UndoAction = { type: "undo" };
type RedoAction = { type: "redo" };

type PlannerAction =
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
  | RedoAction;

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
 *  lessons pass no resources and seed empty sections, as before. */
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

/** Seed sections for every lesson in the initial fixture. Each lesson's
 *  fixture `resources` flow onto its sections (round-robin) so the Teach
 *  surface has real resources to render. */
function seedSections(
  lessons: Lesson[],
): Record<string, LessonSectionContent[]> {
  const result: Record<string, LessonSectionContent[]> = {};
  for (const lesson of lessons) {
    result[lesson.id] = buildInitialSections(lesson.resources);
  }
  return result;
}

/** Ensure a lesson has a sections entry; guards lazily-added lessons. */
function ensureSections(
  sections: Record<string, LessonSectionContent[]>,
  lessonId: string,
): LessonSectionContent[] {
  return sections[lessonId] ?? buildInitialSections();
}

/** Duplicate uid helper (mirrors lesson-flow.ts, avoids importing its counter). */
let _seq = 0;
function uid(prefix: string): string {
  _seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_seq}`;
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

const INITIAL_HISTORY: HistoryState = {
  past: [],
  present: INITIAL_DOC,
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
        const sameSlot =
          nextDay === l.day && nextSubject === l.subject && nextWeek === l.week;
        return {
          ...l,
          day: nextDay,
          subject: nextSubject,
          week: nextWeek,
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
      // Revert a personally-modified lesson back to its master/core appearance.
      // Sets the forking flags to their "unforked" state: modified=false,
      // moved=null, isPersonal=false.
      //
      // NOTE: This does NOT revert content fields (title, objective, preview,
      // directions, etc.) because the master snapshot is not yet stored in the
      // data model. When master snapshots land (planned alongside the Supabase
      // backend), this case must also restore the content fields from the
      // snapshot. Until then only the forking metadata is cleared.
      return {
        ...doc,
        lessons: doc.lessons.map((l) =>
          l.id !== action.id
            ? l
            : { ...l, modified: false, moved: null, isPersonal: false },
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

interface HistoryReducerState {
  history: HistoryState;
  /** The coalesceKey of the last dispatched action (for burst detection). */
  lastCoalesceKey: string | null;
  /** Timestamp of the last dispatched action (ms). */
  lastCoalesceTs: number;
  /** The lastChange signal — updated on every mutation. */
  lastChange: LastChange | null;
}

const INITIAL_REDUCER_STATE: HistoryReducerState = {
  history: INITIAL_HISTORY,
  lastCoalesceKey: null,
  lastCoalesceTs: 0,
  lastChange: null,
};

function historyReducer(
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

  // ── Content mutations ────────────────────────────────────────────────
  const label = labelFor(action);
  const nextDoc = applyDocAction(state.history.present, action);

  // Derive lastChange before touching history.
  const lastChange = buildLastChange(action);

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
    // Apply change to present in-place — no new past entry.
    return {
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
   */
  moveLesson: (
    id: string,
    patch: { day?: number; subject?: SubjectId; week?: number },
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

  const { history, lastChange } = state;
  const { past, present, future } = history;

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

  // ── Mutation callbacks ────────────────────────────────────────────────

  const moveLesson = useCallback(
    (
      id: string,
      patch: { day?: number; subject?: SubjectId; week?: number },
    ) => {
      dispatchRef.current({ type: "moveLesson", id, patch });
    },
    [],
  );

  const setLessonStatus = useCallback((id: string, status: LessonStatus) => {
    dispatchRef.current({ type: "setLessonStatus", id, status });
  }, []);

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
    },
    [],
  );

  const duplicateLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "duplicateLesson", id });
  }, []);

  const duplicateWeek = useCallback(
    (sourceWeek: number, targetWeek: number) => {
      dispatchRef.current({ type: "duplicateWeek", sourceWeek, targetWeek });
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

  const archiveLesson = useCallback((id: string) => {
    dispatchRef.current({ type: "archiveLesson", id });
  }, []);

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

  const setSections = useCallback(
    (lessonId: string, next: LessonSectionContent[]) => {
      dispatchRef.current({ type: "setSections", lessonId, next });
    },
    [],
  );

  const reorderSections = useCallback(
    (lessonId: string, activeId: string, overId: string) => {
      dispatchRef.current({
        type: "reorderSections",
        lessonId,
        activeId,
        overId,
      });
    },
    [],
  );

  const editSection = useCallback(
    (
      lessonId: string,
      sectionId: string,
      patch: Partial<LessonSectionContent>,
      coalesce?: { key: string; ts: number },
    ) => {
      dispatchRef.current({
        type: "editSection",
        lessonId,
        sectionId,
        patch,
        coalesceKey: coalesce?.key ?? `section:${lessonId}:${sectionId}:patch`,
        coalesceTs: coalesce?.ts ?? Date.now(),
      });
    },
    [],
  );

  const addSection = useCallback((lessonId: string, heading?: string) => {
    dispatchRef.current({ type: "addSection", lessonId, heading });
  }, []);

  const removeSection = useCallback((lessonId: string, sectionId: string) => {
    dispatchRef.current({ type: "removeSection", lessonId, sectionId });
  }, []);

  const duplicateSection = useCallback(
    (lessonId: string, sectionId: string) => {
      dispatchRef.current({ type: "duplicateSection", lessonId, sectionId });
    },
    [],
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
      dispatchRef.current({
        type: "addSectionResource",
        lessonId,
        sectionId,
        resource,
      });
    },
    [],
  );

  const editSectionResource = useCallback(
    (
      lessonId: string,
      sectionId: string,
      resourceId: string,
      patch: Partial<SectionResource>,
    ) => {
      dispatchRef.current({
        type: "editSectionResource",
        lessonId,
        sectionId,
        resourceId,
        patch,
        coalesceKey: `editResource:${lessonId}:${sectionId}:${resourceId}`,
        coalesceTs: Date.now(),
      });
    },
    [],
  );

  const removeSectionResource = useCallback(
    (lessonId: string, sectionId: string, resourceId: string) => {
      dispatchRef.current({
        type: "removeSectionResource",
        lessonId,
        sectionId,
        resourceId,
      });
    },
    [],
  );

  const moveSectionResource = useCallback(
    (
      lessonId: string,
      sourceSectionId: string,
      targetSectionId: string,
      resource: SectionResource,
    ) => {
      dispatchRef.current({
        type: "moveSectionResource",
        lessonId,
        sourceSectionId,
        targetSectionId,
        resource,
      });
    },
    [],
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
      setSaveTarget,
      setCellLayout,
      bumpLesson,
      archiveLesson,
      unarchiveLesson,
      restoreLesson,
      relocateLesson,
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
      undoLabel,
      redoLabel,
      lastChange,
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
      setSaveTarget,
      setCellLayout,
      bumpLesson,
      archiveLesson,
      unarchiveLesson,
      restoreLesson,
      relocateLesson,
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
      undoLabel,
      redoLabel,
      lastChange,
    ],
  );

  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
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
