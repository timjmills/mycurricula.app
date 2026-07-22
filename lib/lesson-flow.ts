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

/** Per-phase delivery status (6.11.26 daily handoff §7). Independent of
 *  the lesson-level LessonStatus — setting a phase's status never
 *  completes (or forks) the lesson. Display vocabulary is the design
 *  system's fixed set: done → "Completed", progress → "In progress",
 *  idle → "Not started". */
export type SectionStatus = "idle" | "progress" | "done";

/** Where a section's wash color paints (W3.8 lesson editor, D2).
 *  "field"  — banner AND body field are washed (the mock's tintText:true,
 *             the DEFAULT when the field is absent).
 *  "header" — banner only; the body field stays on the plain surface. */
export type SectionTintScope = "header" | "field";

/** The default tint scope when a section carries none (mock parity —
 *  planbook-edit seeds every section with tintText:true). */
export const DEFAULT_TINT_SCOPE: SectionTintScope = "field";

// ── Section wash ramp (W3.8, D2) ─────────────────────────────────────────
// A section's `color` stores a TOKEN NAME from this curated ramp — NEVER a
// hex. The editor resolves it to CSS as `--rc: var(<token>)` on the block
// root, so every theme re-tints through tokens.css. The ramp maps the v2
// bundle's SECTION_WASHES hexes onto the nearest existing `--subj-N-bright`
// accents (app/tokens.css "Bright chip accents" scale) — consumed here only
// through color-mix washes, the 14px ColorDot, and the banner-label ink mix,
// which sits inside that scale's outline/dot register:
//
//   mock #2E6FD6 (blue)   → --subj-10-bright  #4788d1
//   mock #4E9A5B (green)  → --subj-13-bright  #47d183
//   mock #C8961A (gold)   → --subj-1-bright   #e8bb17
//   mock #E07A3E (orange) → --subj-2-bright   #e87917
//   mock #7A5BD6 (purple) → --subj-8-bright   #7147d1
//   mock #3FA7C5 (cyan)   → --subj-11-bright  #47b6d1
//   mock #E0566B (red)    → --subj-4-bright   #e8174b
//   mock #8FB339 (lime)   → --subj-15-bright  #81d147
//
// The mock's ColorDot popover offers TWO extra swatches beyond the wash
// ramp (its DOT_COLORS list): #C53F7B (berry) → --subj-5-bright #e8179b,
// and #6E6C82 (neutral slate) → --ink-500 (the rich-text "Ink light").

/** Round-robin wash assignment order — mirrors the mock's SECTION_WASHES. */
export const SECTION_WASH_TOKENS = [
  "--subj-10-bright", // blue
  "--subj-13-bright", // green
  "--subj-1-bright", // gold
  "--subj-2-bright", // orange
  "--subj-8-bright", // purple
  "--subj-11-bright", // cyan
  "--subj-4-bright", // red/rose
  "--subj-15-bright", // lime
] as const;

/** The ColorDot popover's 10 swatches — mock DOT_COLORS order. */
export const SECTION_SWATCH_TOKENS = [
  "--subj-10-bright", // blue
  "--subj-11-bright", // cyan
  "--subj-13-bright", // green
  "--subj-15-bright", // lime
  "--subj-1-bright", // gold
  "--subj-2-bright", // orange
  "--subj-4-bright", // red/rose
  "--subj-5-bright", // berry
  "--subj-8-bright", // purple
  "--ink-500", // neutral slate
] as const;

/** The default wash token for a section by its index (round-robin). */
export function sectionWashToken(index: number): string {
  return SECTION_WASH_TOKENS[
    ((index % SECTION_WASH_TOKENS.length) + SECTION_WASH_TOKENS.length) %
      SECTION_WASH_TOKENS.length
  ];
}

/** Allowlist guard for a stored section color. Only a token from the curated
 *  ramp may reach an inline `--rc: var(<token>)` style — anything else
 *  (a hex, a raw string, a token outside the ramp) falls back to the
 *  round-robin default at render time. Defense in depth on top of the
 *  format CHECK in the lesson_sections migration. */
export function isSectionAppearanceToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (SECTION_SWATCH_TOKENS as readonly string[]).includes(value)
  );
}

/** Resolve a section's EFFECTIVE wash token: its stored color when it is a
 *  known ramp token, else the round-robin default for its index. */
export function resolveSectionWash(
  color: string | undefined,
  index: number,
): string {
  return isSectionAppearanceToken(color) ? color : sectionWashToken(index);
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
  /** Planned phase length, rendered as "· N min" after the heading.
   *  Null/absent → no time shown (the handoff's optional-minutes rule —
   *  never a dangling separator). */
  minutes?: number | null;
  /** Phase delivery status — drives the phaseHead status chip and the
   *  agenda navigator's done tint. Defaults to "idle". */
  status?: SectionStatus;
  /** Section wash color (W3.8 lesson editor, D2) — a TOKEN NAME from the
   *  curated ramp (SECTION_SWATCH_TOKENS), never a hex. Absent → the editor
   *  falls back to the round-robin default for the section's index
   *  (sectionWashToken). Persisted as `lesson_sections.color`. */
  color?: string;
  /** Whether the wash paints the banner only ("header") or the body field
   *  too ("field" — the default, mock tintText:true). Persisted as
   *  `lesson_sections.tint_scope`. */
  tintScope?: SectionTintScope;
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
  const sections = template.sections.map((s, i) => ({
    id: uid("lsec"),
    templateSectionId: s.id,
    heading: s.label,
    prompt: s.prompt,
    body: "",
    resources: [] as SectionResource[],
    minutes: s.minutes ?? null,
    status: "idle" as SectionStatus,
    // W3.8 (D2): headers default to DIFFERENT washes — the template may pin a
    // section's color/tint (lesson-template defaults override), else the wash
    // is round-robin by index and BAKED at instantiation so it stays with the
    // section through reorders (mock parity: color belongs to the section).
    color: s.color ?? sectionWashToken(i),
    tintScope: s.tintScope ?? DEFAULT_TINT_SCOPE,
  }));
  return distributeResources(sections, resources);
}
