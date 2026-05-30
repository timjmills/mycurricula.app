// lib/teach/board-tags.ts — the board-tag matching + display layer.
//
// Tags are the binding model for the Boards Library (the user's "multi-tag
// flexible" + "auto-surface + filter" decisions): a board carries any
// combination of typed tags (subject, lesson, phase, weekday, week, slot) or a
// free-text label, or none. The SAME tag set powers two surfaces:
//   1. LIBRARY FILTERING — the library narrows on a chosen tag (any kind).
//   2. AUTO-SURFACING — a board whose tags match the open context (e.g. Monday ·
//      Math) appears automatically as an available board there. The tag IS the
//      assignment; "Repeat this board" is just tagging it to more contexts.
//
// This module is pure logic (no React, no I/O) so both the repository
// (`listBoardsForContext`) and the UI (tag chips, filter pills) share one
// matching definition and labels never drift. No hex / tokens here.

import type { Board, BoardTag, BoardTagKind } from "../types";

/** The context a teacher is currently viewing, used to decide which tagged
 *  boards auto-surface. Every field is optional: a context dimension that is
 *  absent simply does not constrain matching. Weekday is a 0-based index into
 *  the CONFIGURED school week (never a hard-coded 5/7-day assumption). */
export interface BoardContext {
  lessonId?: string | null;
  subjectId?: string | null;
  phase?: string | null;
  weekday?: number | null;
  weekId?: string | null;
  slotId?: string | null;
}

/** Human label for each tag kind (the chip prefix / filter group header). */
export const TAG_KIND_LABEL: Record<BoardTagKind, string> = {
  subject: "Subject",
  lesson: "Lesson",
  phase: "Phase",
  weekday: "Day",
  week: "Week",
  slot: "Time",
  label: "Label",
};

/** The kinds that can auto-surface (map to a `BoardContext` dimension). A
 *  `label` tag is library-only — it filters but never auto-surfaces. */
export const AUTO_SURFACE_KINDS: readonly BoardTagKind[] = [
  "subject",
  "lesson",
  "phase",
  "weekday",
  "week",
  "slot",
];

/** Short weekday names, indexed 0-based. Display-only; the actual weekday SET a
 *  school runs is configured elsewhere — this just labels an index. */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Build a tag tersely (keeps call sites readable). */
export function makeTag(
  kind: BoardTagKind,
  value: string,
  label?: string,
): BoardTag {
  return label ? { kind, value, label } : { kind, value };
}

/** Resolve the `BoardContext` field a tag kind binds to. Returns `undefined`
 *  for `label` (never context-bound). Single source of truth for the kind ↔
 *  context-dimension mapping used by matching below. */
function contextValueForKind(
  kind: BoardTagKind,
  ctx: BoardContext,
): string | null | undefined {
  switch (kind) {
    case "subject":
      return ctx.subjectId ?? undefined;
    case "lesson":
      return ctx.lessonId ?? undefined;
    case "phase":
      return ctx.phase ?? undefined;
    case "weekday":
      return ctx.weekday == null ? undefined : String(ctx.weekday);
    case "week":
      return ctx.weekId ?? undefined;
    case "slot":
      return ctx.slotId ?? undefined;
    case "label":
      return undefined;
  }
}

/**
 * Whether a board should auto-surface in the given context.
 *
 * Semantics (deliberate, documented):
 *   • A tag whose kind maps to a context dimension that is PRESENT must match
 *     that dimension's value, or the board is excluded (a contradiction — e.g. a
 *     `subject:math` board never surfaces in a Reading context).
 *   • A tag whose context dimension is ABSENT is ignored (it neither matches nor
 *     contradicts — a `weekday:1` board surfaces on Monday regardless of
 *     subject).
 *   • The board must have AT LEAST ONE positively-matching context tag, so an
 *     untagged board (or a label-only board) never surfaces everywhere.
 *
 * `label` tags are skipped entirely (library-only).
 */
export function boardMatchesContext(board: Board, ctx: BoardContext): boolean {
  const tags = board.tags ?? [];
  let matched = 0;
  for (const tag of tags) {
    if (tag.kind === "label") continue;
    const ctxValue = contextValueForKind(tag.kind, ctx);
    if (ctxValue === undefined) continue; // dimension not in context → ignore
    if (ctxValue === tag.value) {
      matched += 1;
    } else {
      return false; // contradiction → never surface here
    }
  }
  return matched > 0;
}

/** Whether a board carries a specific tag (exact kind+value) — the library
 *  filter-pill predicate. */
export function boardHasTag(
  board: Board,
  kind: BoardTagKind,
  value: string,
): boolean {
  return (board.tags ?? []).some((t) => t.kind === kind && t.value === value);
}

/** Display label for a tag. Uses the explicit `label` when present; otherwise
 *  derives a readable string per kind (weekday index → name; others → value).
 *  Subject/lesson/slot values are ids the caller may prettify further, but this
 *  guarantees a non-empty label everywhere a chip renders. */
export function tagDisplayLabel(tag: BoardTag): string {
  if (tag.label) return tag.label;
  if (tag.kind === "weekday") {
    const i = Number(tag.value);
    return Number.isInteger(i) && i >= 0 && i < WEEKDAY_NAMES.length
      ? WEEKDAY_NAMES[i]
      : tag.value;
  }
  if (tag.kind === "week") return `Week ${tag.value}`;
  return tag.value;
}

/** A stable key for a tag (dedupe + React keys). */
export function tagKey(tag: BoardTag): string {
  return `${tag.kind}:${tag.value}`;
}

/** Dedupe a tag list by kind+value, preserving first-seen order + label. */
export function dedupeTags(tags: readonly BoardTag[]): BoardTag[] {
  const seen = new Set<string>();
  const out: BoardTag[] = [];
  for (const t of tags) {
    const k = tagKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
