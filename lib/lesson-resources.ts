// lesson-resources.ts — the canonical "all resources for one lesson event" view.
//
// A lesson's resources live on its sections (LessonSectionContent.resources).
// Several surfaces need to show "every resource for this lesson" as one bag:
//   - the right-rail Resources panel (when scoped to a selected lesson),
//   - the weekly lesson card's inline resource list,
//   - the daily lesson detail.
//
// They must all agree on the same list, so they all derive it through this
// one helper instead of keeping separate stores (audit finding BUG-006).
// Pass the sections array from `usePlanner().getSections(lessonId)`.

import type { LessonSectionContent, SectionResource } from "./lesson-flow";

/** A section resource paired with the section it belongs to, so a flat
 *  "all resources" view can still group, label, or filter by section. */
export interface LessonResourceRef {
  resource: SectionResource;
  /** Id of the section this resource is attached to. */
  sectionId: string;
  /** Heading (rich-text HTML) of the owning section. */
  sectionHeading: string;
}

/**
 * Flatten every section's resources into one ordered list — the canonical
 * "resources for this lesson event". Section order is preserved, then
 * resource order within each section.
 */
export function lessonResourceRefs(
  sections: LessonSectionContent[],
): LessonResourceRef[] {
  const refs: LessonResourceRef[] = [];
  for (const section of sections) {
    for (const resource of section.resources) {
      refs.push({
        resource,
        sectionId: section.id,
        sectionHeading: section.heading,
      });
    }
  }
  return refs;
}

/** Just the resources, flattened — when the section grouping isn't needed. */
export function lessonResources(
  sections: LessonSectionContent[],
): SectionResource[] {
  return sections.flatMap((s) => s.resources);
}

/** Count of every resource attached to a lesson event. */
export function lessonResourceCount(sections: LessonSectionContent[]): number {
  let total = 0;
  for (const section of sections) total += section.resources.length;
  return total;
}
