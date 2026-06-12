// fork-diff — pure field-level diff of a personally-forked lesson against
// its Master / Team-Curriculum snapshot (UX roadmap item 01, "Fork diff
// view"). PROTOTYPE: today the snapshot comes from the additive
// `Lesson.masterSnapshot` mock-fixture field; Phase 1B swaps that source for
// persisted fork lineage without touching this module — the diff logic is
// the same either way, which is why it lives here as pure, unit-tested
// functions with no React and no store imports.
//
// Design decisions (item-01 spec, 6.12.26 handoff):
//   • Field-level granularity: title, objective, preview, standards,
//     scheduling (day/week), and lesson-flow sections each diff
//     independently. A moved-only lesson yields JUST the scheduling row.
//   • HTML fields (title/objective/preview/sections) are compared AND
//     displayed as sanitized, tag-stripped plain text. Input passes through
//     the existing sanitizeHtml() boundary first, so even a hostile stored
//     payload can never reach the UI — the diff renders text nodes only,
//     never raw HTML.
//   • Weekday names come through an INJECTED `dayLabel` resolver, never a
//     hard-coded weekday array (CLAUDE.md hard rule: the school week is
//     configured). Callers wire it to useOrderedWeekdays(); tests wire it to
//     orderedWeekdaysFrom(DEFAULT_SCHOOL_WEEK). This module deliberately
//     imports no view/hook code so it stays pure and node-testable.
//   • Standards compare as an order-insensitive set (tag lists carry no
//     meaningful order) but display in stored order.
//   • Live lesson-flow sections are store-owned (PlannerDoc.sections), not a
//     Lesson field, so the caller passes their flattened plain text via
//     options. The sections row only renders when BOTH sides exist.
//
// One deliberate exception to "pure": the COMPARE_REQUEST_EVENT name +
// requestCompare() dispatcher live here because this module is the one file
// both entry points (card context menu) and the consumer (LessonDetail)
// already import. requestCompare touches window only when CALLED from an
// event handler — importing this module stays side-effect-free and
// node-testable.

import type { Lesson, LessonMasterSnapshot } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize-html";

// ── Public shapes ───────────────────────────────────────────────────────────

/** One divergent field, ready to render: `master` is the Team-Curriculum
 *  value (the "removed" side, --danger-tint), `personal` is the teacher's
 *  value (the "added" side, --done-tint). Both are plain text — safe to
 *  render as React text nodes. */
export interface FieldDiff {
  field:
    | "title"
    | "objective"
    | "preview"
    | "standards"
    | "scheduling"
    | "sections";
  label: string;
  master: string;
  personal: string;
}

/** The slice of Lesson the diff reads — kept structural so tests and future
 *  callers don't need to build a full Lesson. */
export type DiffableLesson = Pick<
  Lesson,
  "title" | "objective" | "preview" | "standards" | "day" | "week"
>;

export interface ForkDiffOptions {
  /** Day index (0-based into the CONFIGURED school week) → weekday name.
   *  Injected by the caller (wire to useOrderedWeekdays() in views) so this
   *  module never hard-codes the school week. */
  dayLabel: (dayIndex: number) => string;
  /** The lesson's CURRENT lesson-flow sections flattened to plain text.
   *  Sections live in the planner store (not on Lesson), so the caller
   *  supplies them. Omit to skip the sections row entirely. */
  currentSectionsText?: string;
}

// ── Plain-text extraction ───────────────────────────────────────────────────

/** The named entities sanitized editor output can still carry. (The
 *  serializer may also emit NUMERIC forms — e.g. linkedom writes &nbsp; as
 *  &#160; — which are decoded generically below.) */
const NAMED_ENTITIES: ReadonlyArray<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  // &amp; LAST so it can't manufacture new entities out of double-escapes.
  [/&amp;/g, "&"],
];

/** Decode decimal / hex numeric character references (&#160; / &#xA0;). */
function decodeNumericEntities(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code: string) => {
    const point =
      code[0] === "x" || code[0] === "X"
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : match;
  });
}

/**
 * Reduce a (possibly rich-text HTML) field value to display-safe plain text:
 * sanitize through the strict allowlist FIRST (never trust stored HTML),
 * then drop the remaining tags, decode the few entities the editor emits,
 * and collapse whitespace. The result is rendered as a text node only.
 */
export function stripToText(value: string): string {
  if (typeof value !== "string" || value.length === 0) return "";
  // Fast path: no markup at all — skip the sanitizer round-trip.
  let text =
    value.includes("<") || value.includes("&")
      ? sanitizeHtml(value).replace(/<[^>]*>/g, "")
      : value;
  text = decodeNumericEntities(text);
  for (const [pattern, replacement] of NAMED_ENTITIES) {
    text = text.replace(pattern, replacement);
  }
  // U+00A0 (from &nbsp;/&#160;) collapses with ordinary whitespace.
  return text.replace(/[\s ]+/g, " ").trim();
}

// ── Whole-lesson restore patch ──────────────────────────────────────────────

/**
 * The content fields the store's `restoreLesson` reducer writes back when
 * reverting a fork to the team's version — exactly the snapshot-captured
 * Lesson fields (title, objective, preview, standards). Placement (day/week)
 * is deliberately NOT included: the reducer routes placement through its
 * moveLesson delegation so CellLayout pruning and moved-flag handling stay
 * consistent with every other move. Pure and unit-tested here; the
 * planner-store reducer is the consumer.
 */
export function snapshotRestorePatch(
  snapshot: LessonMasterSnapshot,
): Pick<Lesson, "title" | "objective" | "preview" | "standards"> {
  return {
    title: snapshot.title,
    objective: snapshot.objective,
    preview: snapshot.preview,
    // Fresh array — the restored lesson must never share the snapshot's
    // array identity (a later in-place standards edit would silently
    // corrupt the captured master values).
    standards: [...snapshot.standards],
  };
}

// ── Compare-request event (M6) ──────────────────────────────────────────────

/**
 * Same-document "open the fork diff" signal. The card context menu deep-links
 * to `/daily?lesson=<id>&compare=1`, but when the target lesson is ALREADY
 * selected in Daily the router push changes neither `lesson.id` nor any prop
 * LessonDetail re-effects on — and the App Router commits the URL only after
 * the RSC round-trip, so reading window.location right after push is racy.
 * A plain window CustomEvent carrying the lesson id is the simplest reliable
 * mechanism (no useSearchParams Suspense requirement in a deep client
 * component): the menu dispatches it alongside the push; a mounted
 * LessonDetail for that lesson acts on it immediately.
 */
export const COMPARE_REQUEST_EVENT = "mycurricula:compare-lesson";

/** Detail payload for COMPARE_REQUEST_EVENT. */
export interface CompareRequestDetail {
  lessonId: string;
}

/** Dispatch the compare-request signal (client-only; no-op shape on SSR is
 *  unnecessary — callers are event handlers). */
export function requestCompare(lessonId: string): void {
  window.dispatchEvent(
    new CustomEvent<CompareRequestDetail>(COMPARE_REQUEST_EVENT, {
      detail: { lessonId },
    }),
  );
}

// ── Entry-point predicate ───────────────────────────────────────────────────

/**
 * True when the fork-diff surfaces (card context menu, lesson-detail header,
 * the panel itself) should offer "Compare with Team Curriculum": a master
 * snapshot exists AND the lesson actually diverged (modified content and/or
 * a moved placement). Never shown on unedited lessons (item-01 spec).
 */
export function canCompareWithTeam(
  lesson: Pick<Lesson, "masterSnapshot" | "modified" | "moved">,
): boolean {
  return (
    lesson.masterSnapshot != null &&
    (lesson.modified === true || lesson.moved != null)
  );
}

// ── Diff ────────────────────────────────────────────────────────────────────

/** Order-insensitive standards equality (display keeps stored order). */
function sameStandards(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((code, i) => code === sortedB[i]);
}

/**
 * Field-level diff of a lesson against its Master snapshot. Returns one
 * FieldDiff per DIVERGENT field, in spec order (content fields, then
 * standards, then scheduling, then sections); identical fields are omitted,
 * so a moved-only lesson yields exactly one scheduling row.
 */
export function diffLessonAgainstMaster(
  lesson: DiffableLesson,
  snapshot: LessonMasterSnapshot,
  options: ForkDiffOptions,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Content fields — compared and displayed as stripped plain text, so a
  // markup-only change (e.g. the editor wrapping the same words in <b>) is
  // not reported as a divergence.
  const contentFields = [
    { field: "title", label: "Title" },
    { field: "objective", label: "Objective" },
    { field: "preview", label: "Preview" },
  ] as const;
  for (const { field, label } of contentFields) {
    const master = stripToText(snapshot[field]);
    const personal = stripToText(lesson[field]);
    if (master !== personal) {
      diffs.push({ field, label, master, personal });
    }
  }

  // Standards — set comparison, stored-order display.
  if (!sameStandards(lesson.standards, snapshot.standards)) {
    diffs.push({
      field: "standards",
      label: "Standards",
      master: snapshot.standards.join(", "),
      personal: lesson.standards.join(", "),
    });
  }

  // Scheduling — one combined row for day + week, formatted through the
  // injected configured-week resolver. This is the ONLY row a moved-only
  // lesson produces.
  if (lesson.day !== snapshot.day || lesson.week !== snapshot.week) {
    const place = (day: number, week: number): string =>
      `${options.dayLabel(day)} · Week ${week}`;
    diffs.push({
      field: "scheduling",
      label: "Scheduling",
      master: place(snapshot.day, snapshot.week),
      personal: place(lesson.day, lesson.week),
    });
  }

  // Sections — only when BOTH sides exist: the snapshot captured the master
  // sections AND the caller supplied the live store-owned sections text.
  if (snapshot.sections != null && options.currentSectionsText != null) {
    const master = stripToText(snapshot.sections);
    const personal = stripToText(options.currentSectionsText);
    if (master !== personal) {
      diffs.push({ field: "sections", label: "Lesson flow", master, personal });
    }
  }

  return diffs;
}
