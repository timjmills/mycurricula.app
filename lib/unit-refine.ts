// unit-refine.ts — pure derivations for the unit workspace's REFINE tab (the
// 7.21 handoff's `PHUnits.Table`, `source-planning-hub/ph-units.jsx:912-998`).
//
// Refine is the unit's planning SPREADSHEET: one row per lesson, one column per
// planning field, edited in place. Its whole reason to exist is the "pass" — a
// teacher picks one field and fills it down every lesson in the unit in a single
// keyboard run, instead of opening twelve lesson editors.
//
// WHY THIS IS NOT THE INSIGHTS DRAWER. The drawer (components/year-v2/drawer)
// REPORTS: "5 of 8 lessons still to teach are missing something". Refine is the
// REMEDY — the surface where those five get fixed. Diagnosis and repair are two
// jobs, which is why they are two surfaces (CLAUDE.md §3, one job per surface).
// The two must agree, so `refineFieldSet`'s objective / standards / resources
// arms use the SAME predicates as `unitGaps` (lib/unit-workspace-derive.ts) —
// including the injected section-aware `hasResources`, without which a lesson
// whose resources all hang off its sections reads as empty here and full there.
//
// HONESTY CONTRACT. Every column below maps to something the write path
// actually persists — the five planning fields through `LESSON_CONTENT_KEYS`
// (lib/planner/lesson-track-b.ts), and Flow through `setSections`. The
// handoff's per-lesson `done` jsonb is still retired: completeness is DERIVED
// here (the 7.28 migration ruled that column content-derived and dropped it).
//
// ── FLOW: WHAT IT IS HERE, AND WHY IT IS NOT A COPY OF THE HANDOFF ──────────
// The prototype stores a flow as a `flowName` STRING on the lesson
// (pw-data.js:84 seeds `flowName: done.flow ? 'Gradual release' : null`) and
// `fillDown('flow')` copies that string down the column with no guard
// (ph-units.jsx:925). This app has no such field. A lesson's flow is its
// SECTION LIST — a document — so the column is built on three properties the
// prototype never needed:
//
//   1. IT IS DERIVED, NOT STORED. `instantiateSections` stamps every section
//      with the template section it came from (`templateSectionId`, and those
//      ids are `${templateId}-s${n}` — lesson-templates.ts:67-78). A lesson's
//      flow is therefore the `LessonTemplate` whose section ids, headings,
//      minutes and washes the list still matches, in order. Anything else is
//      genuinely a flow the teacher built by hand, and reads "Custom".
//   2. A CHANGE MOVES RESOURCES, IT NEVER DROPS THEM. `refineFlowApply` carries
//      every attached resource onto the new phases round-robin — the same rule
//      `distributeResources` already uses (lesson-flow.ts:189). Without it,
//      "has resources" would have to be a refusal, and since the seed path
//      distributes a lesson's own `resources` across its sections, nearly every
//      real lesson would refuse and the column would be inert.
//   3. IT REFUSES WHAT IT CANNOT PRESERVE. Prose written into a phase has no
//      corresponding phase in another flow (3 sections vs 7), and a phase's
//      delivery status is a record of what happened in a room. Neither can be
//      carried, so a lesson holding either is READ-ONLY here and says so —
//      the same stance `RichSafeCell` takes on rich text. `refineFlowFill`
//      skips those lessons and reports how many it skipped.
//
// Flow is a column and a fill-down but NOT a pass and NOT a completeness dot,
// and that is a data difference rather than an omission: the handoff's
// `flowName` starts null and gets filled, so counting it means something.
// Ours starts FULL — `buildInitialSections` seeds every lesson from
// `DEFAULT_LESSON_TEMPLATE_ID` (planner-store.tsx:632) — so a "flow set" dot
// would be lit on every lesson from creation and a pass counter would read
// "12 of 12 done" the moment a unit exists. A meter that can only say
// "finished" is the exact defect tests/unit-refine-tab.test.ts pins as BUG 1.
// Flow IS in `REFINE_ENTER_COLUMNS`, like `title` — also a column without a
// pass — so an Enter run walks it.
//
// No React, no DOM, no store — exercised directly in tests/unit-refine.test.ts.

import type { Lesson } from "@/lib/types";
import {
  DEFAULT_TINT_SCOPE,
  instantiateSections,
  resolveSectionWash,
  type LessonSectionContent,
  type SectionResource,
} from "@/lib/lesson-flow";
import {
  LESSON_TEMPLATES,
  LESSON_TEMPLATE_BY_ID,
  type LessonTemplate,
} from "@/lib/lesson-templates";
import { stripHtml } from "@/lib/html-text";

// ── Columns ─────────────────────────────────────────────────────────────────

/** The planning fields Refine tracks — the five that make a lesson "planned",
 *  and the five its completeness dots count. Ordered as they appear in the
 *  table, left to right. */
export type RefineFieldKey =
  | "objective"
  | "standards"
  | "duration"
  | "assessment"
  | "resources";

/** How Refine decides a field is filled.
 *
 *  `resources` needs the host's section-aware predicate for the reason spelled
 *  out in `unitGaps`: `Lesson.resources` is only half the truth, because the
 *  composer attaches to a SECTION whenever a section is the destination, and
 *  sections are not on the `Lesson` shape. Without it this module would mark a
 *  lesson's resources missing while the Resources tab beside it lists them.
 */
export interface RefineFieldOptions {
  hasResources?: (lesson: Lesson) => boolean;
}

/**
 * Is this planning field filled in on this lesson?
 *
 * The single source of truth for BOTH the per-row completeness dots and the
 * pass-progress counter, so the two can never disagree about the same lesson.
 */
export function refineFieldSet(
  lesson: Lesson,
  field: RefineFieldKey,
  opts?: RefineFieldOptions,
): boolean {
  switch (field) {
    case "objective":
      return lesson.objective.trim().length > 0;
    case "standards":
      return lesson.standards.length > 0;
    case "duration":
      // `> 0`, not just "present": a persisted 0 is not a planned duration, and
      // the input clears to `undefined` rather than to zero.
      return (lesson.durationMinutes ?? 0) > 0;
    case "assessment":
      // An assessment object with NO kind still counts — it is the drawer's
      // "unclassified" bucket, kept deliberately so a two-way formative /
      // summative split cannot quietly drop a real assessment
      // (drawer/AssessmentsPanel.tsx). Refine must count it the same way.
      //
      // `!= null`, NOT `!== undefined`. The field is typed `assessment?:` and
      // `assessmentFromRow` normalises the DB read path to `undefined`, so this
      // is unreachable from a hydrated lesson — but a hand-built lesson, a
      // fixture, or a JSON round-trip can still carry `null`, and
      // `null !== undefined` is `true`. That reports an EMPTY field as planned,
      // hiding a real gap from both the row dots and the pass counter this
      // function is the single source of truth for.
      return lesson.assessment != null;
    case "resources":
      return opts?.hasResources
        ? opts.hasResources(lesson)
        : lesson.resources.length > 0;
  }
}

// ── Per-lesson completeness (the row's "Planned" dots) ───────────────────────

/** Every field's state on one lesson, plus the filled/total roll-up the row's
 *  dot cluster and its tooltip both read. */
export interface RefineCompleteness {
  objective: boolean;
  standards: boolean;
  duration: boolean;
  assessment: boolean;
  resources: boolean;
  /** How many of the five are filled. */
  filled: number;
  /** Always `REFINE_FIELDS.length` — carried so a caller never hard-codes 5. */
  total: number;
}

/** The five fields, in table order. */
export const REFINE_FIELDS: readonly RefineFieldKey[] = [
  "objective",
  "standards",
  "duration",
  "assessment",
  "resources",
];

export function refineCompleteness(
  lesson: Lesson,
  opts?: RefineFieldOptions,
): RefineCompleteness {
  const objective = refineFieldSet(lesson, "objective", opts);
  const standards = refineFieldSet(lesson, "standards", opts);
  const duration = refineFieldSet(lesson, "duration", opts);
  const assessment = refineFieldSet(lesson, "assessment", opts);
  const resources = refineFieldSet(lesson, "resources", opts);
  const filled = [
    objective,
    standards,
    duration,
    assessment,
    resources,
  ].filter(Boolean).length;
  return {
    objective,
    standards,
    duration,
    assessment,
    resources,
    filled,
    total: REFINE_FIELDS.length,
  };
}

// ── Passes ───────────────────────────────────────────────────────────────────

/** A pass narrows the table to one job: fill THIS field on every lesson. It
 *  highlights the column, counts progress, and is what the Enter-to-advance
 *  keyboard run is for. */
export interface RefinePass {
  key: RefineFieldKey;
  /** Menu label — the field, pluralised, as a teacher would name the job. */
  label: string;
  /** Onboarding-voice tooltip (CLAUDE.md §4) — what the pass accomplishes. */
  tip: string;
}

/**
 * The four passes Refine offers.
 *
 * `resources` is a field and a completeness dot but NOT a pass: attaching a
 * resource opens the composer, so there is no in-cell value to type and no
 * Enter-to-advance run to make. The handoff agrees — its `PASSES` list omits
 * resources too (`ph-units.jsx:913`). Its `flow` pass is dropped for the reason
 * in this file's header.
 */
export const REFINE_PASSES: readonly RefinePass[] = [
  {
    key: "objective",
    label: "Objectives",
    tip: "Work down the unit writing one “I can…” objective per lesson. Enter jumps to the next lesson.",
  },
  {
    key: "standards",
    label: "Standards",
    tip: "Work down the unit tagging the standards each lesson covers.",
  },
  {
    key: "duration",
    label: "Durations",
    tip: "Work down the unit setting how many minutes each lesson runs. Enter jumps to the next lesson.",
  },
  {
    key: "assessment",
    label: "Assessments",
    tip: "Work down the unit marking which lessons carry a formative or summative check.",
  },
];

/** How far a pass has got: lessons with the field filled, out of all of them. */
export interface RefinePassProgress {
  done: number;
  total: number;
}

/**
 * The table columns Enter can actually walk down.
 *
 * THE GROUND TRUTH IS `registerCell` IN RefineTab.tsx. `advance()` focuses
 * `${column}:${row + 1}` out of the ref map and RETURNS WITHOUT PREVENTING
 * DEFAULT when there is no such entry — so a column that never registers a cell
 * gets whatever Enter natively does there, not an advance. `standards` is that
 * column and always will be: its cell is a `<button>` that opens the tagging
 * picker (a code is unique only per framework, so a single-select cannot serve
 * it), and Enter on a button ACTIVATES it. Promising an Enter run there sends a
 * teacher down a column pressing a key that opens a modal each time.
 *
 * `flow` IS here even though Flow is not a pass, for the same reason `title` is:
 * the list is about the KEYBOARD, not the pass menu. Both the Flow select and
 * the read-only Flow cell a locked lesson renders are focusable and register,
 * so an Enter run walks past a refused row instead of stalling on it.
 *
 * tests/unit-refine.test.ts scrapes RefineTab's real `registerCell("…"` calls
 * and fails if this list and that file ever disagree.
 */
export const REFINE_ENTER_COLUMNS: readonly string[] = [
  "title",
  "objective",
  "flow",
  "duration",
  "assessment",
];

/** Does an Enter press in this pass's column move to the next lesson? */
export function refinePassAdvances(field: RefineFieldKey): boolean {
  return REFINE_ENTER_COLUMNS.includes(field);
}

/**
 * The pass counter's line, as one string.
 *
 * Lives here rather than inline in the component because the interesting part
 * is a CLAIM about the keyboard, and a claim is worth asserting: the banner used
 * to append " — Enter jumps to the next lesson" to every unfinished pass,
 * including Standards, where Enter opens the picker instead. `REFINE_PASSES`
 * already knew — its Standards tip omits that sentence while the objective and
 * duration tips carry it — and the banner overrode that care.
 */
export function refinePassBanner(
  field: RefineFieldKey,
  progress: RefinePassProgress,
): string {
  const label = REFINE_PASSES.find((p) => p.key === field)?.label ?? "";
  const head = `${label}: ${progress.done} of ${progress.total} done`;
  if (progress.done >= progress.total) return head;
  if (refinePassAdvances(field)) return `${head} — Enter jumps to the next lesson`;
  // Standards is the only non-advancing pass today, and its cell opens the
  // tagging picker; the generic arm keeps a future one from inheriting copy
  // about a control it does not have.
  return field === "standards"
    ? `${head} — open a cell to tag its standards`
    : `${head} — open a cell to fill it in`;
}

/**
 * Progress for one pass across a unit's lessons.
 *
 * Counts EVERY lesson, taught or not — unlike `unitGaps`, which skips taught
 * lessons because their planning is history. That difference is deliberate:
 * Refine is a table a teacher edits row by row, so a counter that silently
 * excluded rows visible in front of them could read "8 of 8 done" above a table
 * with three empty cells in it.
 */
export function refinePassProgress(
  lessons: readonly Lesson[],
  field: RefineFieldKey,
  opts?: RefineFieldOptions,
): RefinePassProgress {
  let done = 0;
  for (const l of lessons) if (refineFieldSet(l, field, opts)) done += 1;
  return { done, total: lessons.length };
}

// ── Fill-down ────────────────────────────────────────────────────────────────

/** The fields whose first value can be copied down the whole column.
 *
 *  Only fields where "the same value for every lesson" is a real intent: a unit
 *  where every lesson runs 45 minutes, carries the same standard, or has the
 *  same assessment kind. Title and objective are excluded — twelve identical
 *  objectives is never what anyone meant, and offering the button would invite
 *  a destructive mis-click over content that took the longest to write.
 */
export type RefineFillableKey = Extract<
  RefineFieldKey,
  "standards" | "duration" | "assessment"
>;

/** One fill-down button: the column it fills, and the tooltip that says exactly
 *  what clicking it will overwrite. */
export interface RefineFillable {
  key: RefineFillableKey;
  label: string;
}

export const REFINE_FILLABLE: readonly RefineFillable[] = [
  {
    key: "standards",
    label: "Copy the first lesson’s standards to every lesson in this unit",
  },
  {
    key: "duration",
    label: "Copy the first lesson’s duration to every lesson in this unit",
  },
  {
    key: "assessment",
    label: "Copy the first lesson’s assessment to every lesson in this unit",
  },
];

/**
 * The patch a fill-down applies, derived from the FIRST lesson.
 *
 * Returns `null` when there is nothing to copy — no lessons, or the source
 * lesson's own value is empty. That guard is the difference between "copy 45
 * minutes down" and "silently clear the duration on eleven lessons": the
 * handoff's `fillDown` has no such check and does exactly the latter.
 *
 * Returned as a `Partial<Lesson>` so the caller hands it straight to
 * `editLesson` unchanged — no field-by-field switch at the callsite that could
 * drift from this one.
 */
export function refineFillPatch(
  lessons: readonly Lesson[],
  field: RefineFillableKey,
): Partial<Lesson> | null {
  const patch = rawFillPatch(lessons, field);
  return patch ? clonePatch(patch) : null;
}

/** Deep-enough copy of a fill patch: every array and the assessment object are
 *  copied, so no two lessons a fill touches ever share a reference. Copying once
 *  in `refineFillPatch` is not enough — N lessons receiving the SAME patch object
 *  would all alias one `standards` array, and a later edit to one of them would
 *  mutate every lesson the fill wrote. */
function clonePatch(patch: Partial<Lesson>): Partial<Lesson> {
  const out: Partial<Lesson> = { ...patch };
  if (patch.standards) out.standards = [...patch.standards];
  if (patch.standardIds) out.standardIds = [...patch.standardIds];
  if (patch.assessment) out.assessment = { ...patch.assessment };
  return out;
}

function rawFillPatch(
  lessons: readonly Lesson[],
  field: RefineFillableKey,
): Partial<Lesson> | null {
  const source = lessons[0];
  if (!source) return null;
  switch (field) {
    case "standards": {
      if (source.standards.length === 0) return null;
      // Codes and their index-aligned uuids move TOGETHER or not at all: a code
      // list paired with a stale id list mis-identifies a different catalog row
      // (the same trap StandardsTab documents). When the source has no ids,
      // clear them so identity degrades to the safe code fallback.
      return {
        standards: [...source.standards],
        standardIds: source.standardIds ? [...source.standardIds] : [],
      };
    }
    case "duration": {
      if ((source.durationMinutes ?? 0) <= 0) return null;
      return { durationMinutes: source.durationMinutes };
    }
    case "assessment": {
      // `== null` for the same reason as `refineFieldSet`, but here a `null`
      // source costs more than a wrong dot: `{ ...null }` is `{}`, so the old
      // `=== undefined` guard let it through and returned `{ assessment: {} }`.
      // `clonePatch`'s truthiness check keeps that (an empty object is truthy),
      // so EVERY other lesson in the unit gets written an empty assessment —
      // which `refineFieldSet` then counts as filled, via the unclassified
      // bucket above. One click marks N lessons assessed when none are: this
      // module's "fill-down that clears" failure, arriving through `null`
      // instead of the empty value the guard was written for.
      if (source.assessment == null) return null;
      return { assessment: { ...source.assessment } };
    }
  }
}

// ── Fill-down, as data ───────────────────────────────────────────────────────

/** One `editLesson(id, patch, coalesce)` call, described rather than performed. */
export interface RefineEditDescriptor {
  id: string;
  patch: Partial<Lesson>;
  /** The store's coalescing metadata. Writes sharing a key AND falling inside
   *  the store's 700ms window fold into ONE undo step. */
  coalesce: { key: string; ts: number };
}

/** The coalesce key every write of one fill-down shares. Exported so the
 *  single-undo invariant is asserted against the real string, not a copy of it
 *  that could drift. */
export function refineFillCoalesceKey(field: RefineFillableKey): string {
  return `unit-refine:filldown:${field}`;
}

/**
 * Every write a fill-down would make, as data.
 *
 * THE INVARIANT THIS EXISTS TO MAKE TESTABLE: all N writes carry ONE coalesce
 * key and ONE timestamp, so the store folds them into a SINGLE undo step.
 * Without that, undoing a twelve-lesson fill means pressing ⌘Z twelve times —
 * and a teacher who fills the wrong column has no way to know how many presses
 * they are owed. It cannot be checked through the component: a static render
 * fires no events, so the handler that dispatches these never runs.
 *
 * Returns `[]` when there is nothing to copy (empty unit, or an empty source
 * cell — see `refineFillPatch`), so an inert fill-down dispatches nothing rather
 * than clearing the column. The FIRST lesson is the source and is never written.
 *
 * `ts` is injected rather than read from `Date.now()` here so the caller stamps
 * every write from one clock reading — two readings taken inside a loop can
 * straddle the coalescing window and split the undo step.
 */
export function refineFillDescriptors(
  lessons: readonly Lesson[],
  field: RefineFillableKey,
  ts: number,
): RefineEditDescriptor[] {
  const patch = rawFillPatch(lessons, field);
  if (!patch) return [];
  const key = refineFillCoalesceKey(field);
  return lessons.slice(1).map((l) => ({
    id: l.id,
    // A fresh copy per lesson: one shared patch object would alias its
    // `standards` array across every lesson the fill touched.
    patch: clonePatch(patch),
    coalesce: { key, ts },
  }));
}

// ── Flow ─────────────────────────────────────────────────────────────────────
//
// See this file's header for why Flow is derived rather than stored, and why it
// is a column + fill-down but not a pass or a dot. Everything below is pure: it
// takes section lists in and returns section lists out, so the destructive case
// can be exercised with real content in a test instead of a browser.

/** Why a lesson's Flow cell refuses to be changed here.
 *
 *  Each value names something a flow change CANNOT carry across, so the cell
 *  renders read-only rather than performing a write that loses it. Ordered by
 *  what a teacher would recognise first when they look at the row. */
export type RefineFlowLock =
  /** A phase holds prose. Flows do not correspond phase-for-phase (Minimal has
   *  3, Madeline Hunter has 7), so there is nowhere to put it. */
  | "written"
  /** A phase carries a delivery status — a record of what happened in a room,
   *  which a reshuffle of the phases would silently erase. */
  | "delivered"
  /** The section list matches no built-in flow: the teacher built this
   *  structure themselves, and replacing it discards that work. */
  | "custom";

/** A lesson's flow, as the Refine cell shows it. */
export interface RefineFlow {
  /** The built-in flow this lesson is on, or null for a custom / absent one.
   *  Set even when `lock` is non-null — a locked lesson can still be the SOURCE
   *  of a fill-down, it just cannot be the target of one. */
  templateId: string | null;
  /** What the cell displays: the flow's short name, "Custom", or "—". */
  label: string;
  /** Non-null when the cell is read-only. */
  lock: RefineFlowLock | null;
}

/** Shown when a lesson has no sections at all. Not a refusal — a lesson with no
 *  phases has nothing to lose, so picking a flow here is the safest write in
 *  the column. */
const FLOW_NONE_LABEL = "—";
/** Shown when the section list matches no built-in flow. */
const FLOW_CUSTOM_LABEL = "Custom";

/**
 * The flow name as a table cell shows it — the template name with any
 * parenthetical dropped ("Gradual Release (I Do / We Do / You Do)" → "Gradual
 * Release"). DERIVED rather than a second hand-written list, so a template
 * renamed in lesson-templates.ts cannot leave a stale label here.
 */
export function refineFlowLabel(template: LessonTemplate): string {
  return template.name.split(" (")[0];
}

/** Which built-in template owns a given template-section id. Built once —
 *  `refineFlowOf` runs per row, per render. */
const TEMPLATE_BY_SECTION_ID: Record<string, LessonTemplate> = (() => {
  const out: Record<string, LessonTemplate> = {};
  for (const t of LESSON_TEMPLATES) for (const s of t.sections) out[s.id] = t;
  return out;
})();

/** The Flow select's options, grouped. Two groups because the handoff's select
 *  has two (`PW.FLOW_GROUPS`, pw-data.js:68) — but on OUR axis, `recommended`,
 *  rather than the prototype's General / Curricular-approaches taxonomy, which
 *  this app's template library does not carry and which would have to be
 *  invented to reproduce. */
export interface RefineFlowGroup {
  label: string;
  options: readonly { id: string; label: string; description: string }[];
}

export const REFINE_FLOW_GROUPS: readonly RefineFlowGroup[] = [
  {
    label: "Recommended",
    options: LESSON_TEMPLATES.filter((t) => t.recommended).map(flowOption),
  },
  {
    label: "All flows",
    options: LESSON_TEMPLATES.filter((t) => !t.recommended).map(flowOption),
  },
];

/** The Flow fill-down's tooltip. Deliberately NOT phrased as "copy the first
 *  lesson's flow": the other three fill-downs copy a value into an empty cell,
 *  and this one REPLACES a structure. */
export const REFINE_FLOW_FILL_LABEL =
  "Put every lesson in this unit on the first lesson’s flow — resources move to the new phases, and any lesson with writing in its phases is left alone";

/** Why the Flow fill-down is disabled. Different from the other three: theirs is
 *  an empty source cell, this one is a source whose structure no built-in flow
 *  explains, so there is no flow to hand to anybody. */
export const REFINE_FLOW_FILL_DISABLED =
  "Nothing to copy — the first lesson in this unit isn’t on one of the built-in flows.";

function flowOption(t: LessonTemplate): {
  id: string;
  label: string;
  description: string;
} {
  return { id: t.id, label: refineFlowLabel(t), description: t.description };
}

/** Does this section hold prose a teacher wrote? Measured on the STRIPPED body,
 *  so an empty rich-text wrapper (`<p></p>`, which every contenteditable emits
 *  the moment it is focused) does not read as writing and lock the cell on a
 *  lesson nobody has actually typed into. */
function sectionHasProse(s: LessonSectionContent): boolean {
  return stripHtml(s.body).length > 0;
}

/**
 * Is this section list still, exactly, this template's shape?
 *
 * Strict on purpose. Every field compared here is one a teacher can change in
 * the lesson editor, so a difference means they shaped this lesson by hand —
 * and the whole point of the "custom" lock is that Refine must not overwrite a
 * structure it did not create. A loose match (say, ids only) would let a
 * renamed, re-timed, recoloured flow read as pristine and be replaced.
 *
 * `prompt` IS OMITTED, DELIBERATELY, and the omission is the safer half of the
 * trade. A prompt is placeholder text a lesson only ever receives FROM its
 * template — no per-lesson surface writes one (`editSection` is called from
 * LessonAgendaNav, LessonEditor and lesson-flow, and none of them patch
 * `prompt`; the only prompt editor is the TEMPLATE editor,
 * components/lesson-templates/template-section-editor.tsx:122, which edits a
 * teacher's own template rather than a lesson). So a prompt difference is never
 * teacher work on THIS lesson — it can only mean the built-in's prompt copy was
 * edited after this lesson was seeded, and comparing it would then lock every
 * previously-created lesson in the school, permanently, over a wording tweak.
 * `refineFlowApply` regenerates prompts from the template anyway, so nothing
 * authored is lost by ignoring them here.
 */
function matchesTemplate(
  sections: readonly LessonSectionContent[],
  t: LessonTemplate,
): boolean {
  if (sections.length !== t.sections.length) return false;
  return sections.every((s, i) => {
    const ts = t.sections[i];
    return (
      s.templateSectionId === ts.id &&
      s.heading === ts.label &&
      (s.minutes ?? null) === (ts.minutes ?? null) &&
      // Both sides through `resolveSectionWash`: instantiation BAKES the
      // round-robin default into the section, so a pristine section's stored
      // color is non-null while the template's is absent. Comparing raw would
      // mark every seeded lesson custom.
      resolveSectionWash(s.color, i) === resolveSectionWash(ts.color, i) &&
      (s.tintScope ?? DEFAULT_TINT_SCOPE) === (ts.tintScope ?? DEFAULT_TINT_SCOPE)
    );
  });
}

/**
 * Read a lesson's flow off its sections.
 *
 * The lock arms run before the "custom" arm deliberately: a lesson with written
 * phases is refused for the reason the teacher cares about ("you wrote in
 * these") rather than the incidental one ("this doesn't match a template"),
 * which is usually also true of it.
 */
export function refineFlowOf(
  sections: readonly LessonSectionContent[],
): RefineFlow {
  if (sections.length === 0)
    return { templateId: null, label: FLOW_NONE_LABEL, lock: null };

  const owner = sections[0].templateSectionId
    ? TEMPLATE_BY_SECTION_ID[sections[0].templateSectionId]
    : undefined;
  const matched = owner && matchesTemplate(sections, owner) ? owner : null;
  const templateId = matched?.id ?? null;
  const label = matched ? refineFlowLabel(matched) : FLOW_CUSTOM_LABEL;

  if (sections.some(sectionHasProse))
    return { templateId, label, lock: "written" };
  if (sections.some((s) => (s.status ?? "idle") !== "idle"))
    return { templateId, label, lock: "delivered" };
  if (!matched) return { templateId: null, label, lock: "custom" };
  return { templateId, label, lock: null };
}

/** The read-only cell's explanation, in the onboarding voice CLAUDE.md §4 asks
 *  for: what is true, and where the teacher can do the thing instead. */
export function refineFlowLockReason(lock: RefineFlowLock): string {
  switch (lock) {
    case "written":
      return "This lesson’s phases already have writing in them, and a different flow has different phases to put it in. Open the lesson in the Lesson Planner to change its structure without losing the text.";
    case "delivered":
      return "Some of this lesson’s phases are marked started or completed. Changing the flow would throw that record away — open it in the Lesson Planner instead.";
    case "custom":
      return "This lesson’s phases were built by hand rather than from one of the flows below, so there is nothing here to swap safely. Open it in the Lesson Planner to reshape it.";
  }
}

/**
 * The section list a lesson would have on a different flow.
 *
 * WHAT IT PRESERVES, AND WHY THAT IS THE WHOLE FEATURE. Every resource attached
 * to any of the current phases is CARRIED onto the new ones, round-robin — the
 * distribution rule `instantiateSections` itself uses for a lesson's resources
 * (lesson-flow.ts:189). Resource identity travels with it: the existing
 * `SectionResource.id`s are reused rather than re-minted, so nothing downstream
 * that keys off a resource id sees a delete-plus-create.
 *
 * WHAT IT DOES NOT PRESERVE: phase bodies and phase statuses. It cannot — the
 * flows have different phases — which is exactly why `refineFlowOf` locks a
 * lesson carrying either and this function is never reached for one. The guard
 * is in the caller, not here, because this stays a pure "what would it look
 * like" so a test can compare before and after.
 *
 * Returns the current list UNCHANGED for a template with no sections. No
 * built-in is empty, so this is unreachable today; it exists because the
 * alternative when `next.length === 0` is `i % 0` → NaN, which would drop every
 * carried resource on the floor.
 */
export function refineFlowApply(
  current: readonly LessonSectionContent[],
  template: LessonTemplate,
): LessonSectionContent[] {
  const next = instantiateSections(template).map((s) => ({
    ...s,
    resources: [] as SectionResource[],
  }));
  if (next.length === 0) return current.map((s) => ({ ...s }));
  const carried = current.flatMap((s) => s.resources);
  carried.forEach((r, i) => {
    next[i % next.length].resources.push(r);
  });
  return next;
}

/**
 * The section list to write for ONE lesson, or `null` to refuse.
 *
 * THE GUARD IS HERE AND NOT ONLY IN THE CELL because the cell's decision is
 * made at RENDER and acted on at CLICK, and the store can move in between — a
 * background hydrate lands, or the teacher writes a phase in the Lesson Planner
 * and comes back. The select would still be the live one the last paint
 * produced, and its `onChange` would replace a list that had since acquired
 * writing. Re-reading the CURRENT sections at write time closes that window;
 * `FlowCell` deciding what to render is then a presentation choice rather than
 * the only thing standing between a click and lost work.
 *
 * Returns null when the lesson is locked, or when `templateId` names no
 * built-in — refusing beats guessing, because the guess writes an empty list.
 */
export function refineFlowSetWrite(
  current: readonly LessonSectionContent[],
  templateId: string,
): LessonSectionContent[] | null {
  const template = LESSON_TEMPLATE_BY_ID[templateId];
  if (!template) return null;
  if (refineFlowOf(current).lock !== null) return null;
  return refineFlowApply(current, template);
}

/** One lesson a Flow fill-down would rewrite, with the list it replaced.
 *
 *  `previous` is what the toast's Undo restores. It is captured here rather
 *  than re-read at undo time on purpose: by then the store holds the NEW list,
 *  so a re-read would "restore" the thing being undone. */
export interface RefineFlowWrite {
  id: string;
  next: LessonSectionContent[];
  previous: LessonSectionContent[];
}

/** Everything a Flow fill-down would do, as data — see `refineFlowFill`. */
export interface RefineFlowFill {
  /** The flow being copied down, or null when the first lesson has none to
   *  give (no sections, or a structure that matches no built-in flow). */
  templateId: string | null;
  /** The flow's short name, for the toast. Empty when `templateId` is null. */
  label: string;
  /** The lessons to rewrite. Never includes the first lesson — it is the
   *  source — and never a lesson already on this flow, which would be a
   *  no-op write and a wasted undo step. */
  writes: RefineFlowWrite[];
  /** How many lessons were REFUSED because their phases hold work this cannot
   *  carry. Surfaced in the toast: a fill-down that silently touched 7 of 12
   *  rows and said "done" would read as a bug in the other five. */
  skipped: number;
}

/**
 * Every write a Flow fill-down would make, as data.
 *
 * THE PROPERTY THIS EXISTS TO MAKE TESTABLE, and the reason this whole column
 * was left unbuilt until now: a naive version overwrites twelve lessons' actual
 * section content — the teacher's writing — on one click of a 20px button. The
 * skip rule is what stops it, and a skip rule can only be trusted if it has been
 * SEEN to fire against a fixture that really does hold content. Producing the
 * writes as data (rather than dispatching them from a click handler) is what
 * lets a test seed a written phase, run the fill, and assert the lesson is
 * absent from `writes` and counted in `skipped`.
 *
 * The source is the FIRST lesson, matching every other fill-down in this file,
 * and it is never written. A LOCKED first lesson is still a valid source: being
 * unable to change a lesson's flow says nothing about being unable to read it.
 *
 * `sectionsOf` is injected because sections are not on the `Lesson` shape —
 * the same reason `refineFieldSet` takes `hasResources`.
 */
export function refineFlowFill(
  lessons: readonly Lesson[],
  sectionsOf: (lessonId: string) => readonly LessonSectionContent[],
): RefineFlowFill {
  const empty: RefineFlowFill = {
    templateId: null,
    label: "",
    writes: [],
    skipped: 0,
  };
  const source = lessons[0];
  if (!source) return empty;

  const sourceFlow = refineFlowOf(sectionsOf(source.id));
  if (sourceFlow.templateId === null) return empty;
  const template = LESSON_TEMPLATE_BY_ID[sourceFlow.templateId];
  // A derived id with no template behind it would mean TEMPLATE_BY_SECTION_ID
  // and LESSON_TEMPLATE_BY_ID disagree — impossible today, but returning
  // "nothing to copy" is the safe reading of an impossible state.
  if (!template) return empty;

  const writes: RefineFlowWrite[] = [];
  let skipped = 0;
  for (const l of lessons.slice(1)) {
    const current = sectionsOf(l.id);
    const flow = refineFlowOf(current);
    if (flow.lock !== null) {
      skipped += 1;
      continue;
    }
    if (flow.templateId === template.id) continue; // already on it
    writes.push({
      id: l.id,
      next: refineFlowApply(current, template),
      previous: current.map((s) => ({ ...s, resources: [...s.resources] })),
    });
  }
  return {
    templateId: template.id,
    label: refineFlowLabel(template),
    writes,
    skipped,
  };
}

/**
 * Deep value equality via a KEY-SORTED serialisation.
 *
 * Used to compare resources, whose shape is `LessonResource` — `type`, `label`,
 * `url`, `provider`, `thumbnailUrl` and whatever that type grows next. Listing
 * the fields by hand would be the bug: a field added later would silently stop
 * being compared, and the failure is a silent overwrite rather than a type
 * error. Key-sorting matters because these objects are rebuilt by spread at
 * several points, and property order is not guaranteed to survive that.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}

/**
 * Are these two section lists the same lesson content?
 *
 * Compares what a teacher could have AUTHORED between the fill and the undo —
 * structure, headings, bodies, phase status, timings, wash, and the resources
 * themselves BY VALUE. By value, not by id: the composer edits a resource in
 * place and keeps its id, so an id-and-position check would call a renamed or
 * re-pointed link "unchanged" and let Undo roll the rename away.
 *
 * Not reference identity either: the store hands out a fresh array on every
 * reducer pass and a hydrate replaces the whole map, so `===` would call an
 * untouched lesson "changed" and make Undo silently do nothing.
 */
function sameSections(
  a: readonly LessonSectionContent[],
  b: readonly LessonSectionContent[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      x.id === y.id &&
      x.templateSectionId === y.templateSectionId &&
      x.heading === y.heading &&
      x.body === y.body &&
      (x.status ?? "idle") === (y.status ?? "idle") &&
      (x.minutes ?? null) === (y.minutes ?? null) &&
      x.color === y.color &&
      x.tintScope === y.tintScope &&
      x.resources.length === y.resources.length &&
      x.resources.every((r, j) => stableJson(r) === stableJson(y.resources[j]))
    );
  });
}

/**
 * Which of a fill-down's writes are still safe to undo.
 *
 * THE SAME RULE AS THE SKIP RULE, POINTED BACKWARDS. The fill refuses to
 * overwrite work it did not create; its Undo has to refuse the same thing. The
 * toast outlives the click, and a teacher can open a rewritten lesson, write
 * into a phase, and then reach back for Undo — at which point restoring the
 * captured `previous` would destroy the newer writing to repair the older
 * change. So a write is undone only while the lesson still holds EXACTLY what
 * the fill put there; anything else is left alone.
 *
 * Erring toward doing nothing is the right side here: a teacher who wanted the
 * old flow back can pick it in the cell, but nobody can retype a lost phase.
 */
export function refineFlowUndoable(
  writes: readonly RefineFlowWrite[],
  sectionsOf: (lessonId: string) => readonly LessonSectionContent[],
): RefineFlowWrite[] {
  return writes.filter((w) => sameSections(sectionsOf(w.id), w.next));
}

/**
 * The toast line a completed Flow fill-down shows.
 *
 * Says what happened AND what did not. The skip clause is the load-bearing half:
 * without it the teacher reads "Flow set to Gradual Release" over a unit where
 * five lessons still have the old structure, and the only way to find out is to
 * open all five.
 */
export function refineFlowFillMessage(fill: RefineFlowFill): string {
  const n = fill.writes.length;
  const head =
    n === 0
      ? `No lesson needed “${fill.label}”`
      : `Flow set to “${fill.label}” on ${n} lesson${n === 1 ? "" : "s"}`;
  if (fill.skipped === 0) return `${head}.`;
  const s = fill.skipped;
  return `${head}. ${s} lesson${s === 1 ? "" : "s"} left alone — ${s === 1 ? "its" : "their"} phases already hold work a flow change can’t carry.`;
}
