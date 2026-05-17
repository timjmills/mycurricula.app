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

let seq = 0;
/** A short unique id for sections and resources created at runtime. */
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
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

/**
 * Instantiate a lesson's editable sections from a lesson-flow template.
 * Each template section becomes empty section content whose heading is the
 * template label and whose prompt guides the teacher.
 */
export function instantiateSections(
  template: LessonTemplate,
): LessonSectionContent[] {
  return template.sections.map((s) => ({
    id: uid("lsec"),
    templateSectionId: s.id,
    heading: s.label,
    prompt: s.prompt,
    body: "",
    resources: [],
  }));
}
