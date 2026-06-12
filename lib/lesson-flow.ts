// lesson-flow.ts — the per-lesson section model.
//
// A lesson-flow TEMPLATE (lib/lesson-templates.ts) is a reusable shape.
// When a teacher opens an academic lesson, the template is *instantiated*
// into editable section content for that one lesson: each section gets a
// styleable heading, a rich-text body, and its own list of resources.
//
// Sections can be reordered within the lesson, and resources can be moved
// from one section to another. Editing here changes only this lesson — the
// template is untouched (sections can also be edited in the template, see
// the Lesson Templates settings page).

import type { LessonTemplate } from "./lesson-templates";
import type { LessonResource } from "./types";
import { uid } from "./uid";

/** A resource attached to a specific lesson section. Carries an id so it
 *  can be dragged between sections. */
export interface SectionResource extends LessonResource {
  id: string;
}

/** One section of a lesson, instantiated from a template section. */
export interface LessonSectionContent {
  id: string;
  /** The template section this came from, or null for a section the
   *  teacher added directly to the lesson. */
  templateSectionId: string | null;
  /** Section heading — rich-text HTML, so it can be styled (font, color,
   *  highlight, weight) independently of the body. */
  heading: string;
  /** Guiding prompt shown as placeholder text while the body is empty. */
  prompt: string;
  /** Section body — rich-text HTML. */
  body: string;
  /** Resources attached to this section, in display order. */
  resources: SectionResource[];
}

/** A fresh resource for a section. */
export function newSectionResource(
  type: LessonResource["type"] = "link",
  label = "New resource",
): SectionResource {
  return { id: uid("res"), type, label };
}

/** A blank section the teacher adds directly to a lesson. */
export function newLessonSection(
  heading = "New section",
): LessonSectionContent {
  return {
    id: uid("lsec"),
    templateSectionId: null,
    heading,
    prompt: "",
    body: "",
    resources: [],
  };
}

/** Promote a fixture `LessonResource` (no runtime id) to a `SectionResource`
 *  by minting a stable id. Every other field is preserved verbatim, so the
 *  Teach panel / canvas, Daily detail, and weekly card all see the same
 *  `type`/`url`/`provider`/`thumbnailUrl`/… the fixture carried. */
function toSectionResource(resource: LessonResource): SectionResource {
  return { ...resource, id: uid("res") };
}

/**
 * Distribute a lesson's resources across its sections round-robin, so each
 * resource lands on a real section (and the first sections fill first). Used
 * by `instantiateSections` to thread a lesson's fixture `resources` into the
 * section-resource model the Teach surface reads. Pure — does not mutate the
 * input sections.
 */
function distributeResources(
  sections: LessonSectionContent[],
  resources: LessonResource[],
): LessonSectionContent[] {
  if (sections.length === 0 || resources.length === 0) return sections;
  // Clone the per-section resource arrays so we never alias the inputs.
  const next = sections.map((s) => ({ ...s, resources: [...s.resources] }));
  resources.forEach((resource, i) => {
    next[i % next.length].resources.push(toSectionResource(resource));
  });
  return next;
}

/**
 * Instantiate a lesson's editable sections from a lesson-flow template.
 * Each template section becomes section content whose heading is the template
 * label and whose prompt guides the teacher.
 *
 * When the caller threads the lesson's own `resources` (the fixture
 * lesson-level array), they are distributed across the sections — round-robin —
 * so the Teach Resources panel + canvas, which read a lesson's resources off
 * its sections via `getSections(lessonId)`, see real, varied resources instead
 * of an empty bag. Omitting `resources` (the lazily-added-lesson path) yields
 * the previous behaviour: sections with empty resource lists.
 */
export function instantiateSections(
  template: LessonTemplate,
  resources: LessonResource[] = [],
): LessonSectionContent[] {
  const sections = template.sections.map((s) => ({
    id: uid("lsec"),
    templateSectionId: s.id,
    heading: s.label,
    prompt: s.prompt,
    body: "",
    resources: [] as SectionResource[],
  }));
  return distributeResources(sections, resources);
}
