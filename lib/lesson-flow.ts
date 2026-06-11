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

/** Per-phase delivery status (6.11.26 daily handoff §7). Independent of
 *  the lesson-level LessonStatus — setting a phase's status never
 *  completes (or forks) the lesson. Display vocabulary is the design
 *  system's fixed set: done → "Completed", progress → "In progress",
 *  idle → "Not started". */
export type SectionStatus = "idle" | "progress" | "done";

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
  /** Planned phase length, rendered as "· N min" after the heading.
   *  Null/absent → no time shown (the handoff's optional-minutes rule —
   *  never a dangling separator). */
  minutes?: number | null;
  /** Phase delivery status — drives the phaseHead status chip and the
   *  agenda navigator's done tint. Defaults to "idle". */
  status?: SectionStatus;
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
    minutes: 10, // prototype default for a fresh phase ("New Phase · 10 min")
    status: "idle",
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
    minutes: s.minutes ?? null,
    status: "idle" as SectionStatus,
  }));
  return distributeResources(sections, resources);
}
