// lib/wall-scope.ts — the PURE core of the v2 Resource Wall (Wave 9a).
//
// The wall paints SECTIONS of resource cards. WHICH resources, and how they
// cluster into sections, is decided entirely here: six preset scopes
// ("Current Lesson" … "Unit View") resolve a lesson set → sections → items.
// No React, no DOM, no globals, no Date.now() — every derivation is a pure
// transformation over injected inputs, so the whole wall's correctness is
// unit-testable in the node vitest project (which has no jsdom/RTL, making
// pure logic the ONLY testable surface — hence: the real logic lives HERE, and
// the components stay thin renderers over it).
//
// Mirrors the shape of lib/catchup-scope.ts (the just-shipped reference for a
// v2 scope module): a scope vocabulary, injected clock/config, pure plans.
//
// ── THREE CORRECTNESS RULES THIS MODULE EXISTS TO ENFORCE ──────────────────
//
// 1. UNIT IDS ARE UNIQUE ONLY *WITHIN* A SUBJECT. `UNITS` is keyed by subject
//    and two subjects may legitimately carry the same unit id ("u-1"). A bare
//    `unitById[id]` lookup therefore resolves the WRONG subject's unit — a bug
//    this project has shipped before. Every unit resolution goes through
//    {@link findUnit} (matches subject AND id) and every unit-derived key is
//    built by {@link unitKey} (`unit:<subject>:<unitId>`), never the bare id.
//
// 2. TODAY / THIS-WEEK ARE ROTATION-AWARE. A lesson's `day` is a 0-based index
//    INTO THE CONFIGURED school week (lib/week-order.ts), not Sun=0..Sat=6. The
//    caller resolves today's column via `todayColumnIndex(now, schoolWeekDays)`
//    (lib/now-anchor) and passes it in as `todayCol` — null on a non-school day,
//    which resolves to an EMPTY wall rather than a wrong day's lessons.
//    CLAUDE.md §1: never hard-code the weekday set, never slice(0, 4), never
//    assume a weekly cycle. Day LABELS are injected for the same reason.
//
// 3. GRADE-SCOPING IS NEVER ASSUMED. Like lib/catchup-scope, this module takes
//    an ALREADY grade-scoped lesson set (the planner store loads exactly the
//    active grade's lessons — `Lesson` carries no grade field). Nothing here
//    filters, defaults, or hard-codes a grade, so a multi-grade caller composes
//    without touching this file.

import { resourceAliases } from "./resources-dedup";
import type { Lesson, LessonResource, SubjectId, Unit } from "./types";

// ── Preset vocabulary ───────────────────────────────────────────────────────

/** The six preset walls. Values are stable ids; {@link WALL_PRESET_LABEL} holds
 *  the artboard's display copy (the chooser renders labels, never these ids). */
export type WallPreset =
  | "lesson"
  | "today"
  | "week-mixed"
  | "week-subject"
  | "subject"
  | "unit";

/** Display copy per preset — verbatim from the artboard's PRESETS list. */
export const WALL_PRESET_LABEL: Record<WallPreset, string> = {
  lesson: "Current Lesson",
  today: "Today's Lessons (Mixed)",
  "week-mixed": "This Week · Mixed",
  "week-subject": "This Week · Subject",
  subject: "Subject View",
  unit: "Unit View",
};

/** Ordered preset list for the wall chooser. */
export const WALL_PRESETS: readonly WallPreset[] = [
  "lesson",
  "today",
  "week-mixed",
  "week-subject",
  "subject",
  "unit",
] as const;

/**
 * What the teacher is looking at. `lessonId` / `subject` / `unit` are the
 * ANCHORS the presets that need them read; an anchor-needing preset with a
 * missing or unresolvable anchor yields an empty wall (never a silent fallback
 * to "everything", which would show a teacher the wrong plan).
 *
 * `unit` is a unit id — meaningful ONLY together with `subject` (rule 1).
 */
export interface WallScope {
  preset: WallPreset;
  /** Anchor for "Current Lesson". */
  lessonId?: string | null;
  /** Anchor for "This Week · Subject", "Subject View", "Unit View". */
  subject?: SubjectId | null;
  /** Anchor for "Unit View" — scoped by `subject` (rule 1). */
  unit?: string | null;
}

// ── Resolution input ────────────────────────────────────────────────────────

export interface WallScopeInput {
  scope: WallScope;
  /** The ALREADY grade-scoped lesson set (rule 3). Archived lessons are
   *  filtered out here, so callers pass the raw store list. */
  lessons: readonly Lesson[];
  /** Every unit, across subjects. Resolved via {@link findUnit} (rule 1). */
  units: readonly Unit[];
  /** The week the planner is currently on (drives both week presets). */
  currentWeek: number;
  /**
   * Today's 0-based column in the CONFIGURED school week, or null when today
   * is not a school day (rule 2). From `todayColumnIndex(new Date(), days)` —
   * injected, never read from a clock here.
   */
  todayCol: number | null;
  /** Every resource for one lesson. Injected because the canonical list is a
   *  union of two seams (sections + lesson-level, de-duplicated) that only the
   *  component layer can assemble — see lib/lesson-resources + resources-dedup. */
  resourcesFor: (lesson: Lesson) => readonly LessonResource[];
  /** Display label for a configured-week column index (rule 2 — never a
   *  hard-coded "Sunday"). From `useOrderedWeekdays()`. Falls back to
   *  "Day <n>" when absent. */
  dayLabel?: (dayIndex: number) => string;
  /** Display name for a subject. Falls back to the subject id. */
  subjectLabel?: (subject: SubjectId) => string;
}

// ── Output shape ────────────────────────────────────────────────────────────

/** The four card sizes the wall renders. */
export type WallView = "med" | "large" | "icon" | "list";

/** A lesson a resource is tagged in — a row in the "which board?" chooser. */
export interface WallLessonRef {
  id: string;
  title: string;
}

/**
 * One card on the wall: a resource, flattened for the renderers, plus two
 * pieces of lesson context.
 *
 *   • `lessonId` / `lessonTitle` — the lesson this card was surfaced FROM
 *     (drives the card's subject color and the section it lives in).
 *   • `lessons` — EVERY lesson tagging the same content. `resolveWall`
 *     de-duplicates on content identity, so one card legitimately represents a
 *     resource that lives in several lessons; carrying all the refs is what
 *     makes "send to board" correct (0 -> untagged board; 1 -> that board;
 *     >1 -> the chooser asks which). Dropping it would force a duplicate card
 *     per lesson, or dedupe to one card arbitrarily attributed to a single
 *     lesson — routing send-to-board to whichever lesson the resolver keyed.
 *
 * `type` + `label` are lifted out of `resource` because the section's type
 * filter and search read them on every keystroke; `resource` remains the whole
 * row for the card body, the lightbox, and the board embed.
 */
export interface WallItem {
  /** Stable, unique within a resolution — the React key + the drag id. */
  key: string;
  /** Mirrors `resource.type` — the filter + the type-keyed thumbnail read it. */
  type: LessonResource["type"];
  /** Mirrors `resource.label` — the card title + the search field. */
  label: string;
  resource: LessonResource;
  subjectId: SubjectId;
  /** The lesson this card was surfaced FROM. "" for a note authored straight
   *  onto the wall (a custom section need not belong to a lesson). */
  lessonId: string;
  lessonTitle: string;
  /**
   * EVERY lesson tagging this same content, across the whole visible lesson
   * set — not just the scoped one. "Send to board" reads it: one lesson -> open
   * that board; several -> ask which; none -> an untagged board. Content
   * identity is the dedup module's (server row id, else normalized URL, else
   * type:label:body), so the same file linked from two lessons resolves to one
   * card with two refs.
   */
  lessons: WallLessonRef[];
  /** Transient: a just-added note card still being composed. Never persisted —
   *  the card clears it on commit. */
  composing?: boolean;
}

/**
 * A blank note card, ready to compose — the "Add → note" seam. `lessonId` is
 * optional because a custom section need not belong to a lesson; such a note is
 * wall-local and its "send to board" resolves to an untagged board.
 */
export function makeNoteItem(input: {
  key: string;
  subjectId: SubjectId;
  lessonId?: string;
  lessonTitle?: string;
  body?: string;
}): WallItem {
  return {
    key: input.key,
    type: "notecard",
    label: "Note",
    resource: { type: "notecard", label: "Note", body: input.body ?? "" },
    subjectId: input.subjectId,
    lessonId: input.lessonId ?? "",
    lessonTitle: input.lessonTitle ?? "",
    lessons: [],
    composing: true,
  };
}

/** One section of the wall. */
export interface WallSection {
  /** Stable id — the drop-target id. Subject-qualified wherever a unit or
   *  subject is involved (rule 1). */
  id: string;
  title: string;
  /** Secondary line (time, day, week span…) — "" when there is none. */
  meta: string;
  subjectId: SubjectId;
  /**
   * The lessons feeding this section (a mixed section has several).
   * `resolveWall` always populates it; it is OPTIONAL because a section
   * rehydrated from a saved custom wall (wall-state's `parseSection`) carries
   * only the persisted display fields.
   */
  lessonIds?: string[];
  items: WallItem[];
}

// ── Unit resolution (rule 1) ────────────────────────────────────────────────

/**
 * A unit's wall key. ALWAYS subject-qualified: unit ids are unique only within
 * a subject, so a bare id would collide across subjects and merge two different
 * units into one section (rule 1).
 */
export function unitKey(subject: SubjectId, unitId: string): string {
  return `unit:${subject}:${unitId}`;
}

/**
 * Resolve a unit by subject AND id — the ONLY correct lookup (rule 1). Returns
 * null when the subject has no such unit, even if another subject does.
 */
export function findUnit(
  units: readonly Unit[],
  subject: SubjectId,
  unitId: string,
): Unit | null {
  return units.find((u) => u.subject === subject && u.id === unitId) ?? null;
}

// ── Card type vocabulary ────────────────────────────────────────────────────

/** The card families the wall paints + filters by. Derived from a resource's
 *  `type` via {@link wallTypeOf} — the card's thumbnail, badge, and the type
 *  filter all read this ONE mapping so they can never disagree. */
export type WallType =
  | "note"
  | "worksheet"
  | "image"
  | "doc"
  | "video"
  | "link";

/**
 * Map a resource to its card family.
 *
 * `youtube` maps to "video" and the filter list carries a Videos chip. The
 * artboard's TYPE_FILTER omitted video entirely — porting that verbatim would
 * make every YouTube resource UNREACHABLE under any non-"All" filter (it maps
 * to a family no chip selects). The chip is the fix.
 */
export function wallTypeOf(resource: LessonResource): WallType {
  switch (resource.type) {
    case "notecard":
      return "note";
    case "pdf":
      return "worksheet";
    case "image":
      return "image";
    case "slides":
    case "doc":
      return "doc";
    case "youtube":
      return "video";
    case "website":
    case "link":
    default:
      return "link";
  }
}

// The wall's type FILTER (chips + query matching) lives with the surface that
// renders it — components/resource-wall-v2/Section.tsx. It filters on the raw
// `WallItem.type`; this WallType family is a RENDERING concern (which thumbnail
// + badge a card paints), deliberately kept separate so the two never fight
// over one vocabulary.

// ── Lesson scoping ──────────────────────────────────────────────────────────

/** Visible lessons only — archived lessons are soft-deleted and must never
 *  render on any surface (CLAUDE.md §4 / Lesson.archived). */
function visible(lessons: readonly Lesson[]): Lesson[] {
  return lessons.filter((l) => !l.archived);
}

/**
 * The lessons a scope covers, before sectioning. Exported for the wall's
 * counts/empty-state copy — and independently testable.
 *
 * Every anchor-needing preset returns [] when its anchor is missing or does not
 * resolve. "today" returns [] on a non-school day (rule 2).
 */
export function scopeLessons(
  input: Pick<
    WallScopeInput,
    "scope" | "lessons" | "units" | "currentWeek" | "todayCol"
  >,
): Lesson[] {
  const { scope, currentWeek, todayCol } = input;
  const lessons = visible(input.lessons);

  switch (scope.preset) {
    case "lesson": {
      if (!scope.lessonId) return [];
      const l = lessons.find((x) => x.id === scope.lessonId);
      return l ? [l] : [];
    }
    case "today":
      // Non-school day → nothing is "today" (rule 2). Never a wrong day.
      if (todayCol === null) return [];
      return lessons.filter(
        (l) => l.week === currentWeek && l.day === todayCol,
      );
    case "week-mixed":
      return lessons.filter((l) => l.week === currentWeek);
    case "week-subject":
      if (!scope.subject) return [];
      return lessons.filter(
        (l) => l.week === currentWeek && l.subject === scope.subject,
      );
    case "subject":
      if (!scope.subject) return [];
      return lessons.filter((l) => l.subject === scope.subject);
    case "unit":
      // Subject-qualified (rule 1): the same unit id under another subject is a
      // DIFFERENT unit and must not leak in. The unit must also resolve in the
      // CATALOG for this subject — an anchor pointing at a unit id that has no
      // catalog row (stale/deleted, or valid only under another subject) is an
      // unresolvable anchor and yields an empty wall, per this function's
      // contract, rather than gathering lessons behind a phantom unit.
      if (!scope.subject || !scope.unit) return [];
      if (findUnit(input.units, scope.subject, scope.unit) === null) return [];
      return lessons.filter(
        (l) => l.subject === scope.subject && l.unit === scope.unit,
      );
    default:
      return [];
  }
}

// ── Sectioning ──────────────────────────────────────────────────────────────

/**
 * alias -> the lessons carrying that content, across the WHOLE visible lesson
 * set. Built once per resolution and shared by every item, so "which lessons is
 * this resource in?" is a map read rather than an O(lessons x resources) scan
 * per card.
 *
 * Scanning ALL visible lessons (not just the scoped ones) is deliberate: a
 * resource on the Current-Lesson wall may also be tagged in three other
 * lessons, and the board chooser has to offer all of them.
 */
function buildTagIndex(input: WallScopeInput): Map<string, WallLessonRef[]> {
  const index = new Map<string, WallLessonRef[]>();
  for (const lesson of visible(input.lessons)) {
    const ref: WallLessonRef = { id: lesson.id, title: lesson.title };
    for (const resource of input.resourcesFor(lesson)) {
      for (const alias of resourceAliases(resource)) {
        const refs = index.get(alias);
        // One lesson can carry the same content twice (two sections linking the
        // same doc) — the chooser must not list it twice.
        if (!refs) index.set(alias, [ref]);
        else if (!refs.some((r) => r.id === lesson.id)) refs.push(ref);
      }
    }
  }
  return index;
}

/** Every lesson tagging `resource`, via any of its identity aliases. */
function lessonsTagging(
  resource: LessonResource,
  index: Map<string, WallLessonRef[]>,
): WallLessonRef[] {
  const seen = new Set<string>();
  const out: WallLessonRef[] = [];
  for (const alias of resourceAliases(resource)) {
    for (const ref of index.get(alias) ?? []) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      out.push(ref);
    }
  }
  return out;
}

/** Build one section's items from a lesson's resources. */
function itemsOf(
  lesson: Lesson,
  input: WallScopeInput,
  tagIndex: Map<string, WallLessonRef[]>,
): WallItem[] {
  return input.resourcesFor(lesson).map((resource, i) => ({
    // Index-qualified: a lesson can legitimately carry two rows with the same
    // label/url (dedup is the caller's concern), and duplicate React keys would
    // drop cards silently.
    key: `${lesson.id}#${i}`,
    type: resource.type,
    label: resource.label,
    resource,
    subjectId: lesson.subject,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessons: lessonsTagging(resource, tagIndex),
  }));
}

/** A section per lesson, in the given lesson order. */
function sectionsByLesson(
  lessons: readonly Lesson[],
  input: WallScopeInput,
  tagIndex: Map<string, WallLessonRef[]>,
): WallSection[] {
  return lessons.map((l) => ({
    id: `lesson:${l.id}`,
    title: l.title,
    meta: l.time ?? "",
    subjectId: l.subject,
    lessonIds: [l.id],
    items: itemsOf(l, input, tagIndex),
  }));
}

/** A section per subject, first-appearance order (deterministic given input). */
function sectionsBySubject(
  lessons: readonly Lesson[],
  input: WallScopeInput,
  tagIndex: Map<string, WallLessonRef[]>,
): WallSection[] {
  const order: SubjectId[] = [];
  const bySubject = new Map<SubjectId, Lesson[]>();
  for (const l of lessons) {
    const bucket = bySubject.get(l.subject);
    if (bucket) {
      bucket.push(l);
    } else {
      order.push(l.subject);
      bySubject.set(l.subject, [l]);
    }
  }
  return order.map((sid) => {
    const group = bySubject.get(sid) ?? [];
    return {
      id: `subject:${sid}`,
      title: input.subjectLabel?.(sid) ?? sid,
      meta: `${group.length} lesson${group.length === 1 ? "" : "s"}`,
      subjectId: sid,
      lessonIds: group.map((l) => l.id),
      items: group.flatMap((l) => itemsOf(l, input, tagIndex)),
    };
  });
}

/** A section per configured-week day column, ascending (rule 2 — the label is
 *  injected; the index is a configured-week column, not a weekday number). */
function sectionsByDay(
  lessons: readonly Lesson[],
  input: WallScopeInput,
  tagIndex: Map<string, WallLessonRef[]>,
): WallSection[] {
  const byDay = new Map<number, Lesson[]>();
  for (const l of lessons) {
    const bucket = byDay.get(l.day);
    if (bucket) bucket.push(l);
    else byDay.set(l.day, [l]);
  }
  return [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) => {
      const group = byDay.get(day) ?? [];
      return {
        id: `day:${day}`,
        title: input.dayLabel?.(day) ?? `Day ${day + 1}`,
        meta: `${group.length} lesson${group.length === 1 ? "" : "s"}`,
        // A mixed day carries several subjects; the first lesson's subject
        // drives the section's stripe (the CARDS carry their own subject).
        subjectId: group[0].subject,
        lessonIds: group.map((l) => l.id),
        items: group.flatMap((l) => itemsOf(l, input, tagIndex)),
      };
    });
}

/** A section per unit within ONE subject, first-appearance order. Keys are
 *  subject-qualified via {@link unitKey} (rule 1). */
function sectionsByUnit(
  lessons: readonly Lesson[],
  input: WallScopeInput,
  tagIndex: Map<string, WallLessonRef[]>,
): WallSection[] {
  const order: string[] = [];
  const byUnit = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const key = unitKey(l.subject, l.unit);
    const bucket = byUnit.get(key);
    if (bucket) {
      bucket.push(l);
    } else {
      order.push(key);
      byUnit.set(key, [l]);
    }
  }
  return order.map((key) => {
    const group = byUnit.get(key) ?? [];
    const first = group[0];
    // Subject AND id — never `unitById[slug]` (rule 1).
    const unit = findUnit(input.units, first.subject, first.unit);
    return {
      id: key,
      title: unit?.name ?? first.unit,
      meta: unit?.weeks ?? "",
      subjectId: first.subject,
      lessonIds: group.map((l) => l.id),
      items: group.flatMap((l) => itemsOf(l, input, tagIndex)),
    };
  });
}

/**
 * Resolve a scope to the wall's sections — the module's headline function.
 *
 * Sectioning per preset:
 *   • Current Lesson       → one section (that lesson).
 *   • Today's (Mixed)      → a section per lesson taught today (artboard).
 *   • This Week · Mixed    → a section per configured-week day column.
 *   • This Week · Subject  → a section per lesson of that subject this week.
 *   • Subject View         → a section per unit of that subject.
 *   • Unit View            → a section per lesson in that unit.
 *
 * Deterministic: same inputs → same output, ordering included.
 */
export function resolveWall(input: WallScopeInput): WallSection[] {
  const lessons = scopeLessons(input);
  if (lessons.length === 0) return [];
  const tagIndex = buildTagIndex(input);

  switch (input.scope.preset) {
    case "lesson":
    case "today":
    case "week-subject":
    case "unit":
      return sectionsByLesson(lessons, input, tagIndex);
    case "week-mixed":
      return sectionsByDay(lessons, input, tagIndex);
    case "subject":
      return sectionsByUnit(lessons, input, tagIndex);
    default:
      return sectionsBySubject(lessons, input, tagIndex);
  }
}

/** Total cards across sections — the wall's count badge + empty-state gate. */
export function wallItemCount(sections: readonly WallSection[]): number {
  let n = 0;
  for (const s of sections) n += s.items.length;
  return n;
}
