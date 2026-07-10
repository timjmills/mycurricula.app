// browse-data.ts — the non-component leaf for the Planner Hub's four browse
// pickers (Wave 8, Builder B). Types + pure helpers only, so the four `.tsx`
// pickers stay a clean components-only Fast-Refresh boundary.
//
// The shared props contract (`HubBrowseProps`) is defined here rather than in a
// component file so the shell (Builder A's doc-host) can pass a compatible
// `onOpenDoc` callback and TypeScript's structural typing does the rest — the
// nominal type never has to be imported across the ownership boundary.

import type { Lesson, LessonResource, SubjectId, Unit } from "@/lib/types";
import { stripHtml } from "@/lib/html-text";

// ── Shared props contract ──────────────────────────────────────────────────

/** The two document kinds a browse row can open in the hub. Resources are NOT
 *  a doc kind in Wave 8 (WallDoc is Wave 9) — resource cards link out instead. */
export type HubDocKind = "lesson" | "unit";

/** What a browse picker hands the shell when a teacher opens a document. */
export interface HubDocRef {
  kind: HubDocKind;
  /** Lesson.id (kind="lesson") or Unit.id (kind="unit"). */
  id: string;
  /** Display name — the lesson/unit title (lesson titles are stripped of HTML). */
  title: string;
  /** Subject id, for the doc-tab's subject rail. */
  sid: SubjectId;
}

/** Props every hub browse picker receives from the shell. */
export interface HubBrowseProps {
  /** Live global search string from the hub top-bar. May be "" (show all). */
  query: string;
  /** Open a lesson or unit as a hub document. */
  onOpenDoc: (doc: HubDocRef) => void;
}

// ── Query matching ─────────────────────────────────────────────────────────

/**
 * Case-insensitive substring match against any of the supplied fields. An
 * empty/whitespace query matches everything (the picker shows its full list).
 *
 * We use a plain title/subject match rather than lib/search-index's
 * `searchEverything`: that engine returns UI-agnostic `SearchResult` rows
 * (route links, per-source caps of 50) whereas each picker already holds the
 * live catalog and needs to keep its OWN grouping + subject metadata. A local
 * match preserves the full list and the grouping the picker renders.
 */
export function queryMatches(
  query: string,
  ...fields: Array<string | undefined | null>
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return fields.some(
    (f) => typeof f === "string" && f.toLowerCase().includes(needle),
  );
}

// ── Unit ordering (mirrors YearShell.buildLanes) ───────────────────────────

/** Parse a `unit.weeks` label ("Wk 11–16" / "Wk 12") into its start week.
 *  Units with no parseable week sink to the end. */
export function unitStartWeek(unit: Unit): number {
  const nums = unit.weeks.match(/\d+/g);
  if (!nums || nums.length === 0) return Number.MAX_SAFE_INTEGER;
  return Number(nums[0]);
}

/** Strip the "Unit N · " lead-in so a card shows just the unit title. */
export function stripUnitPrefix(name: string): string {
  const idx = name.indexOf("·");
  return idx === -1 ? name.trim() : name.slice(idx + 1).trim();
}

// ── Resource flattening ────────────────────────────────────────────────────

/** One resource surfaced on the Resource wall, tagged with its lesson origin
 *  so the card can show "Math · Wk 12 · Tue" provenance and tint by subject. */
export interface BrowseResourceRef {
  resource: LessonResource;
  /** Stable render key — resources are not de-duplicated across lessons. */
  key: string;
  subject: SubjectId;
  week: number;
  day: number;
  lessonId: string;
  lessonTitle: string;
}

/** Flatten every non-archived lesson's resources into a single list, each
 *  tagged with its owning lesson (id/subject/week/day/title). Resources are NOT
 *  de-duplicated — a recurring anchor chart legitimately repeats, and the
 *  per-lesson provenance is the point. */
export function flattenResources(
  lessons: readonly Lesson[],
): BrowseResourceRef[] {
  const out: BrowseResourceRef[] = [];
  for (const lesson of lessons) {
    if (lesson.archived) continue;
    lesson.resources.forEach((resource, i) => {
      out.push({
        resource,
        key: `${lesson.id}-${i}`,
        subject: lesson.subject,
        week: lesson.week,
        day: lesson.day,
        lessonId: lesson.id,
        lessonTitle: stripHtml(lesson.title),
      });
    });
  }
  return out;
}
