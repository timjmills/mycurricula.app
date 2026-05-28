"use client";

// search-index.ts — global "search everything" backend (W4-D2, Decision #8).
//
// A pure, data-driven query layer over the four planner sources surfaced by
// the top-bar search input:
//
//   1. Lessons     — the editable curriculum cards (title, objective, subject)
//   2. Standards   — CCSS codes + descriptions from the standards fixture
//   3. Resources   — every LessonResource attached to a lesson (flattened)
//   4. Comments    — Lesson Comment threads (DEFERRED: no comments store exists
//                    today; see "Comments deferral" below)
//
// Architecture:
//   • `searchEverything()` is a pure function. It takes a query, a filter, and
//     the four source arrays the caller already has. No React, no I/O, no
//     globals — testable in isolation, callable from a worker, easy to swap
//     for a Supabase RPC when the backend lands.
//   • `useSearchData()` is the React hook that bundles the four source arrays
//     so a UI consumer (the top-bar) just does:
//        const data = useSearchData();
//        const results = useMemo(
//          () => searchEverything(query, filter, data),
//          [query, filter, data],
//        );
//
// SSR safety:
//   useSearchData() reads from usePlanner() + module-frozen fixtures, all of
//   which are SSR-safe. The hook itself returns a stable object reference
//   keyed on the underlying data arrays, so callers' useMemo dependencies
//   stay clean.
//
// Comments deferral (W4-D2 judgement call):
//   There is no comments document store today. Lessons carry `commentCount`
//   and `unreadComments` integers (lib/types.ts) but the comment bodies live
//   nowhere in code — the top-bar notification bell surfaces a SUMMARY string
//   ("You have 2 new Lesson Comments") from the notification feed
//   (lib/realtime-presence.ts) and the rest is mocked at the lesson-card
//   level.
//
//   Per the task prompt's "edge cases" rule we do NOT invent a comments
//   structure here. `useSearchData()` returns `comments: []` and a brief
//   explanatory comment for the UI agent. The search engine then yields zero
//   comment results — the UI surface will show a "Comments search coming
//   soon" group header in that band. When the real comments store lands
//   (Phase 1B alongside Supabase), wire it into `useSearchData()` here and
//   the search will start returning rows with no other code changes.
//
// Phase-1B migration plan:
//   • `searchEverything()` stays. The data shape it accepts is the contract.
//   • `useSearchData()` swaps its sources for the real Supabase tables
//     (`lessons`, `standards`, `resources`, `comments`) — same arrays, same
//     types, same hook signature.
//   • If volume grows large enough that O(n) substring matching becomes a
//     concern (~1k+ lessons), promote `searchEverything()` to a Supabase
//     RPC backed by a `tsvector` index; the hook keeps the same contract.

import { useMemo } from "react";
import { usePlanner } from "./planner-store";
import { STANDARDS } from "./mock/standards";
import { SUBJECT_BY_ID } from "./mock/subjects";
import { UNIT_BY_ID } from "./mock/units";
import type { Lesson, LessonResource, SubjectId } from "./types";

// ── Public types ─────────────────────────────────────────────────────────

/** Which of the four sources a result row came from. */
export type SearchSource = "lesson" | "standard" | "resource" | "comment";

/**
 * One row in the search-results dropdown.
 *
 * The shape is deliberately UI-agnostic — `link` is a route string the
 * consumer can pass to `router.push`, `subjectId` is a SubjectId the consumer
 * can pass to `useSubjectColor` or `.cp-subj.<id>`, etc. No JSX, no icons,
 * no styling decisions are made here.
 */
export interface SearchResult {
  /** Stable per result, e.g. "lesson:m-12-0" / "standard:5.NF.B.3" /
   *  "resource:m-12-0:0" / "comment:<id>". The UI uses this as the
   *  React key and as a click-tracking handle. */
  id: string;
  /** Which source this row came from — drives the result group + icon. */
  source: SearchSource;
  /** Headline (the bolded first line in the dropdown row). */
  title: string;
  /** 60–120 char preview shown below the title, when available. */
  snippet?: string;
  /** Disambiguating context, e.g. "Math · Fractions · Week 12". */
  breadcrumb: string;
  /** Route to jump to when the row is clicked. */
  link: string;
  /** When the row represents a subject-scoped item, the subject id so the
   *  UI can tint the row's icon strip with the subject color. */
  subjectId?: string;
  /** Which field produced the match — diagnostic / future highlighting. */
  matchedField?: string;
}

/** Top-bar dropdown filter. `null` means "all sources". */
export interface SearchFilter {
  source: SearchSource | null;
}

// ── Source-shape contracts (for callers) ─────────────────────────────────
// We narrow the public types so the caller passes exactly what we need.
// Lessons + LessonResources come straight from lib/types. Standards and
// Comments are inferred from their fixture/store shapes; the local aliases
// keep the public API future-proof.

/** One CCSS standard row, as accepted by the search engine. */
export interface StandardEntry {
  /** CCSS code, e.g. "5.NF.B.3". */
  code: string;
  /** Human description of the standard. */
  description: string;
}

/** One resource row, as accepted by the search engine.
 *
 *  The flattening step pre-attaches lesson context so the search engine can
 *  build a breadcrumb without re-traversing the lesson graph. */
export interface ResourceEntry extends LessonResource {
  /** Lesson the resource is attached to — drives the breadcrumb + link. */
  lessonId: string;
  /** Subject of the owning lesson — drives icon tinting in the result row. */
  subject: SubjectId;
  /** Week of the owning lesson — appears in the breadcrumb. */
  week: number;
}

/** One comment row, as accepted by the search engine.
 *
 *  Shape mirrors the eventual Supabase `lesson_comments` table even though
 *  no in-app store exists today. When that store lands, conform to this
 *  shape and the search starts returning rows. */
export interface CommentEntry {
  id: string;
  /** Lesson the comment is attached to — drives the breadcrumb + link. */
  lessonId: string;
  /** The comment body (plain text or a stripped-rich-text snippet). */
  body: string;
  /** Display name of the author — searchable so a teacher can find "Sarah's
   *  comments" easily. */
  authorName: string;
}

/** The bundle a caller passes to `searchEverything()`. */
export interface SearchData {
  lessons: Lesson[];
  standards: StandardEntry[];
  resources: ResourceEntry[];
  comments: CommentEntry[];
}

// ── Tuning ────────────────────────────────────────────────────────────────
// Per-source result caps. Generous enough that "math" returns plenty of
// lessons, conservative enough that the dropdown never grows long enough
// to require its own scroll for the common case.

const MAX_LESSON_RESULTS = 50;
const MAX_STANDARD_RESULTS = 30;
const MAX_RESOURCE_RESULTS = 30;
const MAX_COMMENT_RESULTS = 30;

// ── Match scoring ─────────────────────────────────────────────────────────
// Smaller score = better match. We bake the priority directly into the
// score so a single `.sort((a, b) => a.score - b.score)` does all the work.

const SCORE_EXACT = 0;
const SCORE_PREFIX = 1;
const SCORE_CONTAINS = 2;
const SCORE_SECONDARY_CONTAINS = 3;
const NO_MATCH = Number.POSITIVE_INFINITY;

/** Score a `haystack` against a lowercased query.
 *
 *  Returns one of the SCORE_* constants, or NO_MATCH when the query does not
 *  appear in the haystack at all. `haystack` may be undefined/empty — both
 *  produce NO_MATCH. */
function scoreSubstring(haystack: string | undefined, qLower: string): number {
  if (!haystack) return NO_MATCH;
  const lower = haystack.toLowerCase();
  if (lower === qLower) return SCORE_EXACT;
  if (lower.startsWith(qLower)) return SCORE_PREFIX;
  if (lower.includes(qLower)) return SCORE_CONTAINS;
  return NO_MATCH;
}

/** Truncate a string to ~120 chars on a word boundary, for snippet display. */
function snippet(text: string, max = 120): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

// ── Per-source matchers ──────────────────────────────────────────────────
// Each matcher returns a {result, score} pair so the engine can sort by
// score then slice to the per-source cap. A `score === NO_MATCH` row is
// dropped before sorting.

interface Scored {
  result: SearchResult;
  score: number;
}

/** Build a lesson breadcrumb like "Math · Unit 3 · Week 12". */
function lessonBreadcrumb(lesson: Lesson): string {
  const subject = SUBJECT_BY_ID[lesson.subject]?.name ?? lesson.subject;
  const unit = UNIT_BY_ID[lesson.unit]?.name;
  // Unit names already include "Unit N · …" — keep them whole so the chip
  // reads naturally; just trim the leading "Unit N · " if present so we
  // don't double-up the prefix on long names.
  const unitShort =
    unit && unit.includes(" · ") ? unit.split(" · ").slice(-1)[0] : unit;
  const parts = [subject, unitShort, `Week ${lesson.week}`].filter(
    (s): s is string => Boolean(s),
  );
  return parts.join(" · ");
}

function matchLessons(lessons: Lesson[], qLower: string): Scored[] {
  const out: Scored[] = [];
  for (const lesson of lessons) {
    // Skip archived lessons from search — they are hidden from every visible
    // surface (see lesson.archived contract in lib/types.ts), so they should
    // not be findable via global search either.
    if (lesson.archived) continue;

    const titleScore = scoreSubstring(lesson.title, qLower);
    const objectiveScore = scoreSubstring(lesson.objective, qLower);
    const subjectName = SUBJECT_BY_ID[lesson.subject]?.name;
    const subjectScore = scoreSubstring(subjectName, qLower);

    // Best score across fields drives the sort; track which field matched
    // first so the UI can show a "matched: subject" badge later if it wants.
    let best = NO_MATCH;
    let matchedField: string | undefined;

    if (titleScore < best) {
      best = titleScore;
      matchedField = "title";
    }
    // Objective never beats title in priority — bump objective hits down
    // one rung relative to title hits at the same string score.
    const objAdjusted =
      objectiveScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (objAdjusted < best) {
      best = objAdjusted;
      matchedField = "objective";
    }
    // Subject-name matches behave like a title-contains hit — useful when
    // a teacher types "math" and expects every math lesson to surface.
    const subjAdjusted =
      subjectScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (subjAdjusted < best) {
      best = subjAdjusted;
      matchedField = "subject";
    }

    if (best === NO_MATCH) continue;

    out.push({
      score: best,
      result: {
        id: `lesson:${lesson.id}`,
        source: "lesson",
        title: lesson.title || "(untitled lesson)",
        snippet: lesson.objective
          ? snippet(lesson.objective)
          : lesson.preview
            ? snippet(lesson.preview)
            : undefined,
        breadcrumb: lessonBreadcrumb(lesson),
        link: `/daily?lesson=${lesson.id}`,
        subjectId: lesson.subject,
        matchedField,
      },
    });
  }
  return out;
}

function matchStandards(standards: StandardEntry[], qLower: string): Scored[] {
  const out: Scored[] = [];
  for (const std of standards) {
    const codeScore = scoreSubstring(std.code, qLower);
    const descScore = scoreSubstring(std.description, qLower);

    let best = NO_MATCH;
    let matchedField: string | undefined;

    if (codeScore < best) {
      best = codeScore;
      matchedField = "code";
    }
    // Description matches sort below code matches at the same rank — code
    // matches are far more precise (CCSS codes are short + unique). We
    // therefore demote description hits by one tier.
    const descAdjusted =
      descScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (descAdjusted < best) {
      best = descAdjusted;
      matchedField = "description";
    }

    if (best === NO_MATCH) continue;

    out.push({
      score: best,
      result: {
        id: `standard:${std.code}`,
        source: "standard",
        title: std.code,
        snippet: snippet(std.description),
        breadcrumb: "CCSS standard",
        // No standards-detail page exists yet; jump to the year view filtered
        // by the standard code. The year view does not parse this param today
        // (the consumer UI will gracefully no-op), but the link points at
        // the right surface so a future "Year filtered by standard" wiring
        // works without changing search behaviour.
        link: `/year?standards=${encodeURIComponent(std.code)}`,
        matchedField,
      },
    });
  }
  return out;
}

function matchResources(resources: ResourceEntry[], qLower: string): Scored[] {
  const out: Scored[] = [];
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const labelScore = scoreSubstring(r.label, qLower);
    const mimeScore = scoreSubstring(r.mimeType, qLower);
    const providerScore = scoreSubstring(r.provider, qLower);
    // The `type` enum ("slides" / "pdf" / "doc" / …) is the most teacher-
    // visible label for a resource, so include it in the searchable set.
    const typeScore = scoreSubstring(r.type, qLower);

    let best = NO_MATCH;
    let matchedField: string | undefined;

    if (labelScore < best) {
      best = labelScore;
      matchedField = "label";
    }
    // Demote secondary fields one rung relative to label hits.
    const mimeAdjusted =
      mimeScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (mimeAdjusted < best) {
      best = mimeAdjusted;
      matchedField = "mimeType";
    }
    const providerAdjusted =
      providerScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (providerAdjusted < best) {
      best = providerAdjusted;
      matchedField = "provider";
    }
    const typeAdjusted =
      typeScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (typeAdjusted < best) {
      best = typeAdjusted;
      matchedField = "type";
    }

    if (best === NO_MATCH) continue;

    const subjectName = SUBJECT_BY_ID[r.subject]?.name ?? r.subject;
    const breadcrumb = [subjectName, `Week ${r.week}`, r.type].join(" · ");

    out.push({
      score: best,
      result: {
        id: `resource:${r.lessonId}:${i}`,
        source: "resource",
        title: r.label || "(untitled resource)",
        snippet: r.provider
          ? `${r.provider}${r.mimeType ? ` · ${r.mimeType}` : ""}`
          : r.mimeType,
        breadcrumb,
        // Resources without a direct URL (legacy fixture rows) fall back to
        // jumping to the owning lesson; resources WITH a URL still route via
        // the lesson so the teacher lands in the right context to open it.
        link: `/daily?lesson=${r.lessonId}`,
        subjectId: r.subject,
        matchedField,
      },
    });
  }
  return out;
}

function matchComments(comments: CommentEntry[], qLower: string): Scored[] {
  const out: Scored[] = [];
  for (const c of comments) {
    const bodyScore = scoreSubstring(c.body, qLower);
    const authorScore = scoreSubstring(c.authorName, qLower);

    let best = NO_MATCH;
    let matchedField: string | undefined;

    if (bodyScore < best) {
      best = bodyScore;
      matchedField = "body";
    }
    const authorAdjusted =
      authorScore === NO_MATCH ? NO_MATCH : SCORE_SECONDARY_CONTAINS;
    if (authorAdjusted < best) {
      best = authorAdjusted;
      matchedField = "author";
    }

    if (best === NO_MATCH) continue;

    out.push({
      score: best,
      result: {
        id: `comment:${c.id}`,
        source: "comment",
        title: snippet(c.body, 80),
        snippet: `by ${c.authorName}`,
        breadcrumb: "Lesson comment",
        link: `/daily?lesson=${c.lessonId}`,
        matchedField,
      },
    });
  }
  return out;
}

// ── Engine entry point ────────────────────────────────────────────────────

/**
 * Search across the four planner sources and return ranked results.
 *
 * Contract:
 *   • Empty / whitespace-only `query` → returns `[]` (no work).
 *   • Match is case-insensitive substring across the per-source fields
 *     described in this file's header.
 *   • Each source is sorted by best-match-first and capped at its own
 *     limit (lessons 50, others 30).
 *   • When `filter.source` is set, only that source's results are returned;
 *     other sources are not even iterated (cheap early-exit).
 *
 * Pure function — call from a React render, a worker, or a test.
 */
export function searchEverything(
  query: string,
  filter: SearchFilter,
  data: SearchData,
): SearchResult[] {
  const qTrimmed = query.trim();
  if (qTrimmed === "") return [];
  const qLower = qTrimmed.toLowerCase();

  const wantsAll = filter.source === null;
  const out: SearchResult[] = [];

  if (wantsAll || filter.source === "lesson") {
    const scored = matchLessons(data.lessons, qLower);
    scored.sort((a, b) => a.score - b.score);
    for (const s of scored.slice(0, MAX_LESSON_RESULTS)) out.push(s.result);
  }

  if (wantsAll || filter.source === "standard") {
    const scored = matchStandards(data.standards, qLower);
    scored.sort((a, b) => a.score - b.score);
    for (const s of scored.slice(0, MAX_STANDARD_RESULTS)) out.push(s.result);
  }

  if (wantsAll || filter.source === "resource") {
    const scored = matchResources(data.resources, qLower);
    scored.sort((a, b) => a.score - b.score);
    for (const s of scored.slice(0, MAX_RESOURCE_RESULTS)) out.push(s.result);
  }

  if (wantsAll || filter.source === "comment") {
    const scored = matchComments(data.comments, qLower);
    scored.sort((a, b) => a.score - b.score);
    for (const s of scored.slice(0, MAX_COMMENT_RESULTS)) out.push(s.result);
  }

  return out;
}

// ── React hook: bundle the four sources ───────────────────────────────────

/**
 * Build the `SearchData` bundle from in-app state. The hook is intentionally
 * tiny — it bridges the planner store + module-frozen fixtures into the
 * pure-function search engine so the top-bar can do:
 *
 *   const data = useSearchData();
 *   const results = useMemo(
 *     () => searchEverything(query, filter, data),
 *     [query, filter, data],
 *   );
 *
 * Returns a memoised `SearchData` whose identity only changes when the
 * underlying source arrays change — keeps the consumer's `useMemo` cheap.
 */
export function useSearchData(): SearchData {
  const { lessons } = usePlanner();

  // Standards: flatten the StandardsMap (code → description) into the
  // StandardEntry[] shape the engine wants. The map is module-frozen so
  // this could be hoisted to module scope, but keeping it inside the hook
  // means a future hook-based standards store (per-team picks, custom
  // standards, etc.) can swap in without changing the call site.
  const standards = useMemo<StandardEntry[]>(() => {
    return Object.entries(STANDARDS).map(([code, description]) => ({
      code,
      description,
    }));
  }, []);

  // Resources: flatten every lesson's resources into a single array, tagging
  // each entry with the owning lesson's id/subject/week so the engine can
  // build the breadcrumb without re-traversing the lesson graph. Tasks'
  // sub-resources are intentionally not included today — they are rare in
  // fixtures and the search engine doesn't need to disambiguate task vs
  // lesson ownership in the result row. When the data layer adds rich
  // section resources (lib/lesson-flow.ts), add them here.
  const resources = useMemo<ResourceEntry[]>(() => {
    const out: ResourceEntry[] = [];
    for (const lesson of lessons) {
      if (lesson.archived) continue;
      for (const r of lesson.resources) {
        out.push({
          ...r,
          lessonId: lesson.id,
          subject: lesson.subject,
          week: lesson.week,
        });
      }
    }
    return out;
  }, [lessons]);

  // Comments: DEFERRED. See "Comments deferral" in this file's header.
  //
  // There is no persistent comments store in the app today (lesson.commentCount
  // is an integer, no bodies, no authors). When the comments document store
  // lands (Phase 1B alongside Supabase), wire it here:
  //
  //   const { comments: rawComments } = useCommentsStore();
  //   const comments = useMemo<CommentEntry[]>(
  //     () => rawComments.map(c => ({
  //       id: c.id,
  //       lessonId: c.lessonId,
  //       body: stripRichText(c.body),
  //       authorName: c.author.name,
  //     })),
  //     [rawComments],
  //   );
  //
  // Until then `comments` is an empty array and the search engine yields zero
  // comment rows. The UI agent should surface a "Comments search coming
  // soon" header in the result group when the active filter is "comment".
  const comments = useMemo<CommentEntry[]>(() => [], []);

  return useMemo<SearchData>(
    () => ({ lessons, standards, resources, comments }),
    [lessons, standards, resources, comments],
  );
}
