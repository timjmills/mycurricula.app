// lib/teach/lesson-phases.ts — a lesson's REAL phases, for validated phase tags.
//
// Wave 4 (#3): a board's `phase` tag was a FREE-TEXT slug, so nothing tied it to
// the lesson's actual phases (sections) — a typo or a since-renamed phase left a
// board tagged to a phase that doesn't exist. This module derives the lesson's
// real phase set from its sections so the tag editor can offer a validated
// PICKER (not free text) and the chips can flag an orphaned phase tag.
//
// A phase IS a lesson section (`LessonSectionContent`); there is no separate
// phase entity. The tag VALUE is the slugified section heading — the same
// derivation the mock seed uses (`lib/mock/boards.ts`), so a board tagged from a
// section matches that section's auto-surface context. Pure — no React, no I/O.

import type { LessonSectionContent } from "../lesson-flow";

/** A lesson phase as the tag editor consumes it: the slug stored on the tag +
 *  the human heading shown in the picker / chip. */
export interface LessonPhase {
  /** The `BoardTag{kind:"phase"}` value — a slug of the section heading. */
  slug: string;
  /** The section heading as plain text (the option / chip label). */
  label: string;
}

/** Slugify a phase title → its tag value. SINGLE SOURCE OF TRUTH for the phase
 *  slug (the mock seed imports this), so a board tagged from a section can never
 *  drift from the section it should match. */
export function phaseSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip rich-text HTML to plain text — section headings are sanitized HTML, but
 *  a tag label/slug wants the text. Minimal + allocation-light (no DOM). */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The lesson's real, selectable phases — one per section with a non-empty
 * heading, deduped by slug (two sections that slug to the same phase collapse,
 * so the picker never offers a duplicate). Section order is preserved.
 */
export function phasesForLesson(
  sections: LessonSectionContent[],
): LessonPhase[] {
  const seen = new Set<string>();
  const out: LessonPhase[] = [];
  for (const s of sections) {
    const label = stripHtml(s.heading);
    if (!label) continue;
    const slug = phaseSlug(label);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label });
  }
  return out;
}
