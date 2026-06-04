// lib/planner/supabase-source.ts — Supabase-backed `PlannerDataSource` (Phase 1B).
//
// A drop-in implementation of the planner repository contract defined in
// `lib/planner/source.ts`, backed by the curriculum tables in the initial
// schema migration (`supabase/migrations/20260518102823_initial_schema.sql`),
// the sections + authored-lessons tables
// (`20260601120000_planner_sections_personal.sql`), and the scale-hardening
// denormalization (`20260604120000_planner_scale_hardening.sql` — the local
// `grade_level_id` on the two hot lesson tables + `archived_at` on personal
// copies). It satisfies the SAME async interface the in-memory planner mock
// does — the store awaits both identically — but reads/writes durable rows.
//
// CLIENT CHOICE / RLS
//   Every read + write goes through the per-request server client
//   (`lib/supabase/server.ts`), so Row-Level Security (plan §13.1, migration
//   §11) is enforced with `auth.uid()`. The service-role admin client is
//   deliberately NOT imported here: nothing in this contract needs to bypass
//   RLS. Grade-scoping is carried on every read; we never do a bare table scan.
//
// SERVER-ONLY: `lib/supabase/server.ts` awaits `cookies()`, so this module is
//   server-only by construction and must never be imported into a client
//   component (the mock source is the client/default path).
//
// FORKING (CLAUDE.md §2, migration §4.3)
//   `master_core_lesson_events` is the single source of truth;
//   `personal_core_lesson_event_copies` is the per-teacher LAZY fork. Reads
//   resolve a teacher's personal copy over the master where one exists. An edit
//   in personal mode UPSERTS a personal copy row (it never mutates master);
//   completion (`setLessonStatus`) writes `completion_status` and NEVER forks.
//   `softDeleteLesson` is PERSONAL-scoped: a master-derived lesson archives the
//   teacher's personal copy (`archived_at`, lazy-forking first if absent) and
//   NEVER touches the shared master row; a teacher-authored lesson sets its own
//   `deleted_at`.
//
//   This source operates in personal mode (every mutator takes an `ownerId` and
//   forks against that teacher). Master-mode editing is a separate, explicitly
//   gated surface (the Personal | Master top-bar toggle) that is not part of
//   this contract — the contract's mutators only carry an owner, so they always
//   write the teacher's personal fork.
//
// SECTIONS (lesson_sections, migration 20260601120000)
//   A lesson's editable sections (heading / prompt / body / ordered resources)
//   persist in `lesson_sections`, keyed polymorphically by
//   (owner_kind, owner_lesson_id). Reads resolve the teacher's own
//   (owner_id = ownerId) rows over the team/master (owner_id null) rows. A
//   lesson with no persisted section rows falls back to a single synthetic
//   section carrying the lesson's flat `resources` jsonb so reads never break.
//
// PRIVACY (§11.4)
//   Planner rows carry STRUCTURE only — title, directions, objectives, notes,
//   resources, standards, section headings/bodies. Never student names.
//
// ID BRIDGE (lib/planner/id-bridge.ts)
//   The mock fixtures + UI speak human SLUGS (lesson `m-12-0`, unit `u-m3`,
//   subject `math`, standard code `5.NF.A.1`); the DB uses uuid PKs. The
//   importer assigns each row a DETERMINISTIC uuid v5 derived from its slug, so
//   `slugToUuid(kind, slug)` resolves slug → uuid without a round-trip, and a
//   per-request reverse index maps the uuids a query returns back to the slugs
//   the domain types expect.

import type {
  Lesson,
  LessonMoved,
  LessonResource,
  LessonStatus,
  LessonTask,
  StandardsMap,
  Subject,
  SubjectId,
  Unit,
} from "../types";
import { SUBJECTS } from "../mock/subjects";
import type { LessonSectionContent } from "../lesson-flow";
import type { SectionResource } from "../lesson-flow";
import {
  type LessonMoveTarget,
  type LessonPatch,
  type PlannerDataSource,
  type SaveTarget,
} from "./source";
import { buildReverseIndex, slugToUuid } from "./id-bridge";
import { createClient } from "../supabase/server";

// ── Supabase client helper ───────────────────────────────────────────────────
// The server client is async (it awaits `cookies()`), so every method resolves
// it first. Resolving per call keeps the request-scoped auth session correct.

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function sb(): Promise<ServerClient> {
  return createClient();
}

/** Wrap a supabase-js `{ data, error }` envelope: throw a descriptive Error on
 *  `error`, otherwise return `data`. Centralises the error-handling contract so
 *  every call site stays terse and no error is silently swallowed. */
function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T {
  if (result.error) {
    throw new Error(
      `Planner repository ${context} failed: ${result.error.message}`,
    );
  }
  if (result.data == null) {
    throw new Error(`Planner repository ${context} returned no data.`);
  }
  return result.data;
}

/** Like `unwrap`, but tolerates a null `data` (for `.maybeSingle()` reads where
 *  "no row" is a valid answer). Still throws on a transport/SQL error. */
function unwrapMaybe<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T | null {
  if (result.error) {
    throw new Error(
      `Planner repository ${context} failed: ${result.error.message}`,
    );
  }
  return result.data;
}

// ── Chunked `.in(...)` lookups ────────────────────────────────────────────────
// A PostgREST `.in("col", ids)` serializes every id into the request URL, so a
// large id set (a grade with thousands of master events) can blow the URL /
// proxy length limit. `chunkedIn` slices the id set into fixed-size batches,
// runs `query(idsChunk)` per batch, and concatenates the rows. An empty id set
// short-circuits to `[]` (PostgREST `.in("col", [])` is valid but wasteful).

/** Max ids per `.in(...)` batch. ~150 keeps each request URL well under the
 *  typical 2–8KB proxy/URL ceiling even with uuid (36-char) ids. */
const IN_CHUNK_SIZE = 150;

async function chunkedIn<T>(
  ids: string[],
  query: (
    idsChunk: string[],
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  context: string,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const res = await query(chunk);
    out.push(...(unwrap(res, context) as T[]));
  }
  return out;
}

/** True when `s` looks like a canonical uuid (8-4-4-4-12 hex). Used to tell a
 *  real `units.id` uuid (pass through) from a fixture SLUG (`u-m3`, hash it) so
 *  createLesson never re-hashes an already-resolved unit id (Codex #6). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// ── Weekday enum ↔ day-index bridge ──────────────────────────────────────────
// The DB stores `day_of_week` as the `weekday` enum ('sun'..'sat'); the FLAT
// `Lesson.day` is a 0-based index into the CONFIGURED school week. The mapping
// is NOT a fixed Sun-first order (CLAUDE.md §1: NEVER hard-code the weekday set):
// it derives from the school's `schools.school_week` (a `weekday[]` in the
// configured running order), so day 0 is the school's FIRST teaching day. A
// Mon–Fri school maps day 0 → 'mon'; the beta Sun–Thu school maps day 0 → 'sun'.
//
// `school_week` is resolved once per request (via `resolveSchoolWeek`, cached on
// the request-scoped server client) and threaded into the bridge functions. When
// it is unavailable (no teacher row / no school / unset), we fall back to the
// `FALLBACK_WEEKDAY_ORDER` below — the full Sun-first seven-day order, so the
// bridge stays total — and the call site logs the degraded path once.

const FALLBACK_WEEKDAY_ORDER = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;
type Weekday = (typeof FALLBACK_WEEKDAY_ORDER)[number];

/** A resolved school-week mapping: the configured weekday order (day index →
 *  weekday enum) plus its inverse (weekday enum → day index). */
interface WeekMap {
  /** day index → weekday enum (the school's configured running order). */
  order: readonly Weekday[];
  /** weekday enum → day index (inverse of `order`). */
  indexOf: Map<Weekday, number>;
}

/** Build a `WeekMap` from a configured weekday order. Falls back to the full
 *  Sun-first seven-day order when the configured set is empty/absent so the
 *  bridge is always total. */
function buildWeekMap(order: readonly Weekday[] | null | undefined): WeekMap {
  const resolved = order && order.length > 0 ? order : FALLBACK_WEEKDAY_ORDER;
  const indexOf = new Map<Weekday, number>();
  resolved.forEach((wd, i) => {
    // First occurrence wins (a well-formed school_week has no duplicates).
    if (!indexOf.has(wd)) indexOf.set(wd, i);
  });
  return { order: resolved, indexOf };
}

/** The default (fallback) week map — full Sun-first order. Used when the school
 *  week cannot be resolved (logged at the call site). */
const FALLBACK_WEEK_MAP: WeekMap = buildWeekMap(FALLBACK_WEEKDAY_ORDER);

function weekdayToDayIndex(day: Weekday, week: WeekMap): number {
  const i = week.indexOf.get(day);
  // A weekday outside the configured week (e.g. a Friday lesson in a Sun–Thu
  // school) has no column; fall back to the absolute Sun-first index so the
  // mapping stays total rather than collapsing to day 0.
  if (i != null) return i;
  const abs = FALLBACK_WEEKDAY_ORDER.indexOf(day);
  return abs < 0 ? 0 : abs;
}

function dayIndexToWeekday(day: number, week: WeekMap): Weekday {
  return week.order[day] ?? week.order[0] ?? "sun";
}

// ── School-week resolution (per-request cache) ───────────────────────────────
// Resolve the teacher's school's configured `school_week` once per request and
// cache it on the request-scoped server client (a fresh client per request, so
// the WeakMap entry lives exactly one request — no cross-request leakage).

const schoolWeekCache = new WeakMap<object, Promise<WeekMap>>();

/** Resolve the configured `school_week` for a teacher's school → a `WeekMap`.
 *  Cached per request (keyed on the server client). On any failure (no teacher
 *  row, no school, transport error) this logs once and returns the fallback
 *  Sun-first map so callers never throw on the day↔weekday bridge. */
async function resolveSchoolWeek(
  client: ServerClient,
  ownerId: string,
): Promise<WeekMap> {
  const cached = schoolWeekCache.get(client);
  if (cached) return cached;
  const promise = (async (): Promise<WeekMap> => {
    try {
      const teacherRes = await client
        .from("teachers")
        .select("school_id")
        .eq("id", ownerId)
        .maybeSingle();
      if (teacherRes.error) throw new Error(teacherRes.error.message);
      const schoolId = (teacherRes.data as { school_id: string } | null)
        ?.school_id;
      if (!schoolId) {
        console.warn(
          `[planner] school_week unavailable (no school for teacher ${ownerId}); using Sun-first fallback order.`,
        );
        return FALLBACK_WEEK_MAP;
      }
      const schoolRes = await client
        .from("schools")
        .select("school_week")
        .eq("id", schoolId)
        .maybeSingle();
      if (schoolRes.error) throw new Error(schoolRes.error.message);
      const order = (schoolRes.data as { school_week: Weekday[] } | null)
        ?.school_week;
      if (!order || order.length === 0) {
        console.warn(
          `[planner] school_week unset for school ${schoolId}; using Sun-first fallback order.`,
        );
        return FALLBACK_WEEK_MAP;
      }
      return buildWeekMap(order);
    } catch (err) {
      console.warn(
        `[planner] school_week resolution failed; using Sun-first fallback order: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return FALLBACK_WEEK_MAP;
    }
  })();
  schoolWeekCache.set(client, promise);
  return promise;
}

// ── Status enum ↔ domain bridge ──────────────────────────────────────────────
// The DB `lesson_completion` enum ('not_done','done','skipped','carried_over',
// 'partial') differs from the FLAT `LessonStatus` ('not_done','done','carried',
// 'skipped','partial') on exactly one value: carried_over ↔ carried.

type DbCompletion =
  | "not_done"
  | "done"
  | "skipped"
  | "carried_over"
  | "partial";

function statusToDb(status: LessonStatus): DbCompletion {
  return status === "carried" ? "carried_over" : status;
}

function statusFromDb(status: DbCompletion): LessonStatus {
  return status === "carried_over" ? "carried" : status;
}

/** Coerce a free-text `status` column (personal_authored_lessons stores `status`
 *  as text, not the enum) back to a `LessonStatus`, defaulting to "not_done". */
function statusFromText(raw: string | null): LessonStatus {
  switch (raw) {
    case "done":
    case "skipped":
    case "partial":
    case "not_done":
      return raw;
    case "carried_over":
    case "carried":
      return "carried";
    default:
      return "not_done";
  }
}

// ── Row shapes (snake_case, as the migration declares them) ───────────────────

/** A `master_core_lesson_events` row (the columns this source reads). After the
 *  scale-hardening migration the table carries a local `grade_level_id`. */
interface MasterEventRow {
  id: string;
  grade_level_id: string | null;
  unit_id: string;
  subject_id: string;
  week_number: number;
  day_of_week: Weekday;
  title: string;
  directions: string | null;
  learning_objectives: unknown; // jsonb: string[]
  notes: string | null;
  resources: unknown; // jsonb: LessonResource[]
  standards: string[]; // uuid[]
  display_order_within_day: number;
  deleted_at: string | null;
}

/** A `personal_core_lesson_event_copies` row (the lazy fork). Carries the
 *  scale-hardening `archived_at` (personal soft-delete) + `grade_level_id`. */
interface PersonalCopyRow {
  id: string;
  teacher_id: string;
  master_core_lesson_event_id: string;
  grade_level_id: string | null;
  unit_id: string;
  subject_id: string;
  week_number: number;
  day_of_week: Weekday;
  title: string;
  directions: string | null;
  learning_objectives: unknown;
  notes: string | null;
  resources: unknown;
  standards: string[];
  display_order_within_day: number;
  is_diverged_from_master: boolean;
  archived_at: string | null;
}

/** A `personal_authored_lessons` row (a teacher's OWN lesson, no master). */
interface AuthoredLessonRow {
  id: string;
  owner_id: string;
  grade_level_id: string;
  unit_id: string | null;
  subject_id: string;
  week_number: number;
  day_of_week: Weekday;
  title: string;
  directions: string | null;
  learning_objectives: unknown;
  notes: string | null;
  resources: unknown;
  standards: string[];
  display_order_within_day: number;
  status: string | null;
  reason_not_done: string | null;
  deleted_at: string | null;
}

interface CompletionRow {
  core_lesson_event_id: string;
  status: DbCompletion;
  reason_not_done: string | null;
}

interface UnitRow {
  id: string;
  grade_level_id: string;
  subject_id: string;
  name: string;
  start_week: number;
  end_week: number;
}

interface SubjectRow {
  id: string;
  grade_level_id: string;
  name: string;
  color: string; // stable slug ('math', 'reading', …)
  parent_id: string | null;
  display_order: number;
}

interface StandardRow {
  id: string;
  code: string;
  description: string | null;
}

/** A `lesson_sections` row (the editable section content for a lesson). */
interface SectionRow {
  id: string;
  owner_kind: "master" | "personal_copy" | "personal_authored";
  owner_lesson_id: string;
  owner_id: string | null;
  grade_level_id: string;
  template_section_id: string | null;
  heading: string;
  prompt: string;
  body: string;
  resources: unknown; // jsonb: SectionResource[]
  display_order: number;
}

// Column lists kept in one place so reads stay consistent.
const MASTER_COLS =
  "id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, deleted_at";
const COPY_COLS =
  "id, teacher_id, master_core_lesson_event_id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, is_diverged_from_master, archived_at";
const AUTHORED_COLS =
  "id, owner_id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, status, reason_not_done, deleted_at";
const COMPLETION_COLS = "core_lesson_event_id, status, reason_not_done";
const UNIT_COLS = "id, grade_level_id, subject_id, name, start_week, end_week";
const SUBJECT_COLS =
  "id, grade_level_id, name, color, parent_id, display_order";
const STANDARD_COLS = "id, code, description";
const SECTION_COLS =
  "id, owner_kind, owner_lesson_id, owner_id, grade_level_id, template_section_id, heading, prompt, body, resources, display_order";

// ── jsonb helpers ─────────────────────────────────────────────────────────────

/** Coerce a jsonb `learning_objectives` value (array of strings) to the FLAT
 *  `Lesson.objective` (a single statement). The fixtures carry one "I Can"
 *  objective; multiple objectives join with a space so nothing is dropped. */
function objectivesToObjective(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.filter((o): o is string => typeof o === "string").join(" ");
  }
  if (typeof raw === "string") return raw;
  return "";
}

/** Coerce the FLAT `Lesson.objective` back to the jsonb `learning_objectives`
 *  array shape the column expects. Empty objective → empty array. */
function objectiveToObjectives(objective: string): string[] {
  return objective.trim().length > 0 ? [objective] : [];
}

/** Coerce a jsonb `resources` value to a typed `LessonResource[]`. Defensive:
 *  filters to objects carrying at least a string `type`/`label`. */
function jsonToResources(raw: unknown): LessonResource[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is LessonResource =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as { type?: unknown }).type === "string" &&
      typeof (r as { label?: unknown }).label === "string",
  );
}

/** Coerce a jsonb section `resources` value to typed `SectionResource[]`,
 *  minting a stable id when the persisted row lacks one. */
function jsonToSectionResources(
  raw: unknown,
  sectionId: string,
): SectionResource[] {
  if (!Array.isArray(raw)) return [];
  const out: SectionResource[] = [];
  raw.forEach((r, i) => {
    if (
      typeof r === "object" &&
      r !== null &&
      typeof (r as { type?: unknown }).type === "string" &&
      typeof (r as { label?: unknown }).label === "string"
    ) {
      const res = r as SectionResource & { id?: unknown };
      const id =
        typeof res.id === "string" && res.id.length > 0
          ? res.id
          : `${sectionId}-r${i}`;
      out.push({ ...res, id });
    }
  });
  return out;
}

// ── Standards uuid[] ↔ slug code[] bridge ─────────────────────────────────────
// Standard CODES are the slugs (`5.NF.A.1`); the DB stores `standards uuid[]`.
// `slugToUuid("standard", code)` maps code → uuid; the reverse index maps the
// uuids back. We build the reverse index from the grade's loaded standard codes
// once per read so a lesson's `standards uuid[]` resolve to the code slugs the
// domain expects.

function standardUuidsToCodes(
  uuids: string[],
  uuidToCode: Map<string, string>,
): string[] {
  return uuids
    .map((u) => uuidToCode.get(u))
    .filter((c): c is string => typeof c === "string");
}

function standardCodesToUuids(codes: string[]): string[] {
  return codes.map((c) => slugToUuid("standard", c));
}

// ── Row → domain mappers ──────────────────────────────────────────────────────

/** Map a master OR personal-copy event row → the FLAT domain `Lesson`. The
 *  caller supplies the slug ids (unit/subject already resolved back to slugs),
 *  the resolved standard codes, the completion status, and the fork flags. */
function buildLesson(args: {
  /** Caller-visible lesson id (the MASTER slug — completion + boards key on it). */
  id: string;
  subject: SubjectId;
  unit: string;
  week: number;
  day: number;
  title: string;
  objective: string;
  directions: string;
  notes: string;
  resources: LessonResource[];
  standards: string[];
  status: LessonStatus;
  reasonNotDone: string;
  isPersonal: boolean;
  modified: boolean;
  moved: LessonMoved;
}): Lesson {
  // `preview` is a short summary; the fixtures fall it back to directions. With
  // no dedicated preview column we mirror that: first line of directions.
  const preview = args.directions.split("\n")[0]?.slice(0, 280) ?? "";
  const tasks: LessonTask[] = []; // multi-task lessons are not modelled in this schema.
  return {
    id: args.id,
    subject: args.subject,
    unit: args.unit,
    title: args.title,
    objective: args.objective,
    preview,
    directions: args.directions,
    notes: args.notes,
    resources: args.resources,
    standards: args.standards,
    week: args.week,
    day: args.day,
    isPersonal: args.isPersonal,
    pendingMaster: false, // master-promotion queue is out of this contract's scope.
    reasonNotDone: args.reasonNotDone,
    modified: args.modified,
    moved: args.moved,
    status: args.status,
    commentCount: 0,
    unreadComments: 0,
    tasks,
  };
}

/** Derive `Lesson.moved` for a personal copy by comparing its slot to the
 *  master's. null when unmoved, "same-week" when only the day changed,
 *  "across-weeks" when the week changed. */
function deriveMoved(
  master: { week_number: number; day_of_week: Weekday },
  copy: { week_number: number; day_of_week: Weekday },
): LessonMoved {
  if (copy.week_number !== master.week_number) return "across-weeks";
  if (copy.day_of_week !== master.day_of_week) return "same-week";
  return null;
}

// ── Read scaffolding (grade → frameworks → standards, subject/unit indexes) ───

/** The set of subject slugs (the locked team-wide subject ids). Used to map a
 *  subject `color` slug back to a `SubjectId`. */
const SUBJECT_IDS = new Set<string>(SUBJECTS.map((s) => s.id));

/** Resolve a subject row's slug. The migration stores the stable slug in
 *  `color` (per its comment: 'math','reading',… so the palette bridge / cp-subj
 *  classes resolve it). Fall back to the reverse-index lookup by uuid. */
function subjectSlugOf(
  row: SubjectRow,
  uuidToSlug: Map<string, string>,
): SubjectId {
  if (SUBJECT_IDS.has(row.color)) return row.color as SubjectId;
  const bySlug = uuidToSlug.get(row.id);
  if (bySlug && SUBJECT_IDS.has(bySlug)) return bySlug as SubjectId;
  // Last resort: a name match against the locked set, else 'math'. This only
  // fires if the importer diverged from the locked palette (flagged upstream).
  return (SUBJECT_IDS.has(row.color) ? row.color : "math") as SubjectId;
}

/** Load the grade's subjects as rows, plus uuid→slug + uuid→SubjectId indexes. */
async function loadSubjectIndex(
  client: ServerClient,
  gradeLevelId: string,
): Promise<{
  rows: SubjectRow[];
  uuidToSubjectId: Map<string, SubjectId>;
}> {
  const res = await client
    .from("subjects")
    .select(SUBJECT_COLS)
    .eq("grade_level_id", gradeLevelId)
    .eq("scope", "team")
    .order("display_order", { ascending: true });
  const rows = unwrap(res, "list subjects") as SubjectRow[];
  // Reverse index over the locked subject slugs, so a uuid resolves to a slug
  // even when `color` is unexpectedly blank.
  const uuidToSlug = buildReverseIndex(
    "subject",
    SUBJECTS.map((s) => s.id),
  );
  const uuidToSubjectId = new Map<string, SubjectId>();
  for (const row of rows) {
    uuidToSubjectId.set(row.id, subjectSlugOf(row, uuidToSlug));
  }
  return { rows, uuidToSubjectId };
}

/** Load the grade's units as rows, plus a uuid→slug index built from the loaded
 *  unit set (the slug is recovered via the deterministic reverse map; the
 *  importer assigns `slugToUuid("unit", slug)`). The reverse map needs the slug
 *  set, which we don't have from the DB — so we expose the DB uuid AS the unit
 *  id (stable + unique); the UI joins lessons↔units by this same id, so internal
 *  consistency holds even though it's a uuid rather than the human `u-m3` slug. */
async function loadUnitIndex(
  client: ServerClient,
  gradeLevelId: string,
): Promise<{ rows: UnitRow[]; uuidToUnitSlug: Map<string, string> }> {
  const res = await client
    .from("units")
    .select(UNIT_COLS)
    .eq("grade_level_id", gradeLevelId);
  const rows = unwrap(res, "list units") as UnitRow[];
  const uuidToUnitSlug = new Map<string, string>();
  for (const row of rows) uuidToUnitSlug.set(row.id, row.id);
  return { rows, uuidToUnitSlug };
}

/** Resolve the grade's assigned frameworks → their standards rows, returning a
 *  `StandardsMap` (code → description) and a uuid→code index for lesson tagging. */
async function loadStandardsIndex(
  client: ServerClient,
  gradeLevelId: string,
): Promise<{ map: StandardsMap; uuidToCode: Map<string, string> }> {
  // grade → frameworks
  const gfa = await client
    .from("grade_framework_assignments")
    .select("framework_id")
    .eq("grade_level_id", gradeLevelId);
  const frameworkRows = unwrap(gfa, "list grade frameworks") as {
    framework_id: string;
  }[];
  const frameworkIds = frameworkRows.map((r) => r.framework_id);
  if (frameworkIds.length === 0) {
    return { map: {}, uuidToCode: new Map() };
  }
  // frameworks → standards. Scope to the grade as well (standards rows carry an
  // optional grade_level_id; a null grade_level_id means cross-grade, which we
  // still want, so we filter by framework only — RLS limits visibility).
  const std = await client
    .from("standards")
    .select(STANDARD_COLS)
    .in("framework_id", frameworkIds);
  const rows = unwrap(std, "list standards") as StandardRow[];
  const map: StandardsMap = {};
  const uuidToCode = new Map<string, string>();
  for (const row of rows) {
    map[row.code] = row.description ?? row.code;
    uuidToCode.set(row.id, row.code);
  }
  return { map, uuidToCode };
}

// ── Implementation ────────────────────────────────────────────────────────────

export const plannerSupabaseSource: PlannerDataSource = {
  // ── Reads ──────────────────────────────────────────────────────────────────

  async getActiveGradeLevelId(ownerId) {
    const client = await sb();
    // 1. The teacher's explicit default grade, if set.
    const teacherRes = await client
      .from("teachers")
      .select("default_grade_level_id")
      .eq("id", ownerId)
      .maybeSingle();
    const teacher = unwrapMaybe(teacherRes, "get active grade (teacher)") as {
      default_grade_level_id: string | null;
    } | null;
    if (teacher?.default_grade_level_id) return teacher.default_grade_level_id;

    // 2. Fallback: the first grade the teacher is assigned to (stable order by
    //    created_at so the resolution is deterministic across calls).
    const assignRes = await client
      .from("teacher_grade_assignments")
      .select("grade_level_id, created_at")
      .eq("teacher_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const assign = unwrapMaybe(assignRes, "get active grade (assignment)") as {
      grade_level_id: string;
    } | null;
    return assign?.grade_level_id ?? null;
  },

  async listLessons(gradeLevelId, ownerId, opts) {
    const client = await sb();

    // 1. Resolve the grade's subjects + units (and their slug indexes), the
    //    standards index, and the school's configured week map (day↔weekday).
    //    Subjects/units map DB uuids back to domain slugs.
    const [{ uuidToSubjectId }, { uuidToUnitSlug }, standards, week] =
      await Promise.all([
        loadSubjectIndex(client, gradeLevelId),
        loadUnitIndex(client, gradeLevelId),
        loadStandardsIndex(client, gradeLevelId),
        resolveSchoolWeek(client, ownerId),
      ]);

    // OPTIONAL windowing: when `opts` is omitted, behaviour is unchanged (the
    // full grade is read). `weekStart`/`weekEnd` scope the master + authored
    // reads to a `week_number` window; `schoolYearId` scopes to a school year.
    // Defaults keep existing callers byte-identical.
    const weekStart = opts?.weekStart;
    const weekEnd = opts?.weekEnd;
    const schoolYearId = opts?.schoolYearId;

    // School-year scoping is carried on `units`, NOT on the lesson tables:
    // neither `master_core_lesson_events` nor `personal_authored_lessons` has a
    // `school_year_id` column (only `units` does). So when a school year is
    // requested we first resolve the unit ids in that (grade, school_year) and
    // constrain the lesson reads by `unit_id IN (…)`. Resolved once and reused.
    let schoolYearUnitIds: string[] | null = null;
    if (schoolYearId != null) {
      const unitsRes = await client
        .from("units")
        .select("id")
        .eq("grade_level_id", gradeLevelId)
        .eq("school_year_id", schoolYearId);
      const unitRows = unwrap(unitsRes, "list school-year units") as {
        id: string;
      }[];
      schoolYearUnitIds = unitRows.map((u) => u.id);
      // No units in that school year → no master/authored lessons to read.
      if (schoolYearUnitIds.length === 0) return [];
    }

    // 2. Master events for the grade — read the DENORMALIZED local
    //    grade_level_id column directly (no units join — the #1 scale fix),
    //    excluding soft-deletes. Optionally scoped to a school-year / week window.
    let masterQuery = client
      .from("master_core_lesson_events")
      .select(MASTER_COLS)
      .eq("grade_level_id", gradeLevelId)
      .is("deleted_at", null);
    if (schoolYearUnitIds != null)
      masterQuery = masterQuery.in("unit_id", schoolYearUnitIds);
    if (weekStart != null)
      masterQuery = masterQuery.gte("week_number", weekStart);
    if (weekEnd != null) masterQuery = masterQuery.lte("week_number", weekEnd);
    const masterRes = await masterQuery
      .order("week_number", { ascending: true })
      .order("display_order_within_day", { ascending: true });
    const masterRows = unwrap(
      masterRes,
      "list master lessons",
    ) as MasterEventRow[];

    const masterIds = masterRows.map((m) => m.id);

    // 3. This teacher's personal copies for those masters (the lazy fork), their
    //    completion rows, and the teacher's own AUTHORED lessons for the grade.
    //    Copies/completion are keyed by the MASTER event id. The `.in(masterIds)`
    //    lookups are CHUNKED (a large grade can have thousands of master ids,
    //    which would otherwise blow the PostgREST/proxy URL length limit).
    let authoredQuery = client
      .from("personal_authored_lessons")
      .select(AUTHORED_COLS)
      .eq("owner_id", ownerId)
      .eq("grade_level_id", gradeLevelId)
      .is("deleted_at", null);
    if (schoolYearUnitIds != null)
      // Authored lessons carry a nullable unit_id; school-year scoping keeps
      // only those tied to a unit in the requested year (untied authored
      // lessons fall outside any school-year window by construction).
      authoredQuery = authoredQuery.in("unit_id", schoolYearUnitIds);
    if (weekStart != null)
      authoredQuery = authoredQuery.gte("week_number", weekStart);
    if (weekEnd != null)
      authoredQuery = authoredQuery.lte("week_number", weekEnd);

    const [copyRows, complRows, authoredRes] = await Promise.all([
      chunkedIn<PersonalCopyRow>(
        masterIds,
        (ids) =>
          client
            .from("personal_core_lesson_event_copies")
            .select(COPY_COLS)
            .eq("teacher_id", ownerId)
            .in("master_core_lesson_event_id", ids),
        "list personal copies",
      ),
      chunkedIn<CompletionRow>(
        masterIds,
        (ids) =>
          client
            .from("completion_status")
            .select(COMPLETION_COLS)
            .eq("teacher_id", ownerId)
            .in("core_lesson_event_id", ids),
        "list completion",
      ),
      authoredQuery
        .order("week_number", { ascending: true })
        .order("display_order_within_day", { ascending: true }),
    ]);
    const authoredRows = unwrap(
      authoredRes,
      "list authored lessons",
    ) as AuthoredLessonRow[];

    const copyByMaster = new Map<string, PersonalCopyRow>();
    for (const c of copyRows)
      copyByMaster.set(c.master_core_lesson_event_id, c);
    const complByMaster = new Map<string, CompletionRow>();
    for (const c of complRows) complByMaster.set(c.core_lesson_event_id, c);

    // 4. Resolve personal-over-master and map each to a FLAT Lesson, EXCLUDING
    //    masters the owner has archived for themselves (archived_at not null on
    //    their personal copy — a personal soft-delete that never touches master).
    const masterLessons: Lesson[] = [];
    for (const master of masterRows) {
      const copy = copyByMaster.get(master.id);
      if (copy?.archived_at) continue; // personal soft-delete — hide from owner.
      const compl = complByMaster.get(master.id);
      const status = compl ? statusFromDb(compl.status) : "not_done";
      const reasonNotDone = compl?.reason_not_done ?? "";

      // Effective content: the personal copy where one exists, else master.
      const src = copy ?? master;
      const subjectId = uuidToSubjectId.get(src.subject_id) ?? "math";
      const unitSlug = uuidToUnitSlug.get(src.unit_id) ?? src.unit_id;

      masterLessons.push(
        buildLesson({
          id: master.id, // completion/boards key on the master id — keep it stable.
          subject: subjectId,
          unit: unitSlug,
          week: src.week_number,
          day: weekdayToDayIndex(src.day_of_week, week),
          title: src.title,
          objective: objectivesToObjective(src.learning_objectives),
          directions: src.directions ?? "",
          notes: src.notes ?? "",
          resources: jsonToResources(src.resources),
          standards: standardUuidsToCodes(src.standards, standards.uuidToCode),
          status,
          reasonNotDone,
          isPersonal: copy != null,
          modified: copy?.is_diverged_from_master ?? false,
          moved: copy ? deriveMoved(master, copy) : null,
        }),
      );
    }

    // 5. Teacher-authored lessons (no master). These are always personal; their
    //    completion lives on their own `status` column (not completion_status).
    const authoredLessons = authoredRows.map((a) => {
      const subjectId = uuidToSubjectId.get(a.subject_id) ?? "math";
      const unitSlug = a.unit_id
        ? (uuidToUnitSlug.get(a.unit_id) ?? a.unit_id)
        : "";
      return buildLesson({
        id: a.id,
        subject: subjectId,
        unit: unitSlug,
        week: a.week_number,
        day: weekdayToDayIndex(a.day_of_week, week),
        title: a.title,
        objective: objectivesToObjective(a.learning_objectives),
        directions: a.directions ?? "",
        notes: a.notes ?? "",
        resources: jsonToResources(a.resources),
        standards: standardUuidsToCodes(a.standards, standards.uuidToCode),
        status: statusFromText(a.status),
        reasonNotDone: a.reason_not_done ?? "",
        isPersonal: true,
        modified: false,
        moved: null,
      });
    });

    return [...masterLessons, ...authoredLessons];
  },

  async listUnits(gradeLevelId) {
    const client = await sb();
    const { rows, uuidToUnitSlug } = await loadUnitIndex(client, gradeLevelId);
    const { uuidToSubjectId } = await loadSubjectIndex(client, gradeLevelId);
    return rows.map((row) => {
      const subject = uuidToSubjectId.get(row.subject_id) ?? "math";
      const weeks =
        row.start_week === row.end_week
          ? `Wk ${row.start_week}`
          : `Wk ${row.start_week}–${row.end_week}`;
      const unit: Unit = {
        id: uuidToUnitSlug.get(row.id) ?? row.id,
        subject,
        name: row.name,
        weeks,
        // `shade` is a UI color-cycling level not modelled in the schema; the
        // mock seeds 2 as the common value. Deterministic default keeps cards
        // from all rendering shade 1.
        shade: 2,
      };
      return unit;
    });
  },

  async listSubjects(gradeLevelId) {
    const client = await sb();
    const { rows, uuidToSubjectId } = await loadSubjectIndex(
      client,
      gradeLevelId,
    );
    // Map each DB subject row to the domain Subject, drawing the icon/cls from
    // the locked team-wide catalog (CLAUDE.md §4 — subject→swatch is locked).
    const catalogById = new Map(SUBJECTS.map((s) => [s.id, s]));
    return rows.map((row) => {
      const id = uuidToSubjectId.get(row.id) ?? ("math" as SubjectId);
      const catalog = catalogById.get(id);
      const subject: Subject = {
        id,
        name: row.name || (catalog?.name ?? id),
        cls: id,
        icon: catalog?.icon ?? id.slice(0, 2),
        parent: catalog?.parent,
      };
      return subject;
    });
  },

  async listStandards(gradeLevelId) {
    const client = await sb();
    const { map } = await loadStandardsIndex(client, gradeLevelId);
    return map;
  },

  async getSections(lessonId, ownerId) {
    // Read the persisted `lesson_sections` for this lesson, personal-fork
    // resolved: the teacher's own (owner_id = ownerId) rows resolve over the
    // team/master (owner_id null) rows. If there are no persisted section rows,
    // fall back to a single synthetic section carrying the lesson's flat
    // `resources` jsonb so reads never break.
    const client = await sb();
    const rows = await loadSectionRows(client, lessonId, ownerId);
    if (rows.length > 0) return mapSectionRows(rows);
    return [await syntheticSection(client, lessonId, ownerId)];
  },

  async getSectionsBatch(lessonIds, ownerId) {
    // One batched call seeds every lesson's sections, killing the per-lesson
    // N+1 at hydrate time. We CHUNK the `.in("owner_lesson_id", lessonIds)`
    // lookup (a full-year grade can carry thousands of lesson ids, which would
    // otherwise blow the PostgREST/proxy URL length limit and blank section
    // hydration — Codex #4). Each chunk's rows merge into one set; behaviour is
    // identical for small id sets. We then group in memory, picking the
    // personal-fork row over the team row for each (lesson, section slot).
    // Lessons with NO persisted section rows are OMITTED from the result (the
    // contract: callers fall back to getSections).
    const out: Record<string, LessonSectionContent[]> = {};
    if (lessonIds.length === 0) return out;

    const client = await sb();
    const rows = await chunkedIn<SectionRow>(
      lessonIds,
      (ids) =>
        client
          .from("lesson_sections")
          .select(SECTION_COLS)
          .in("owner_lesson_id", ids)
          .order("display_order", { ascending: true }),
      "get sections batch",
    );

    // Group rows by lesson, then resolve personal-over-team within each lesson.
    const byLesson = new Map<string, SectionRow[]>();
    for (const row of rows) {
      const list = byLesson.get(row.owner_lesson_id);
      if (list) list.push(row);
      else byLesson.set(row.owner_lesson_id, [row]);
    }
    for (const [lessonId, lessonRows] of byLesson) {
      const resolved = resolvePersonalOverTeam(lessonRows, ownerId);
      if (resolved.length > 0) out[lessonId] = mapSectionRows(resolved);
    }
    return out;
  },

  // ── Lesson mutations ─────────────────────────────────────────────────────
  async updateLesson(
    lessonId,
    patch,
    ownerId,
    saveTarget: SaveTarget = "personal",
  ) {
    // Owner-kind branch (Codex #7): a teacher-AUTHORED lesson patches its OWN
    // `personal_authored_lessons` row directly (no fork — it has no master);
    // a master-derived lesson lazily forks into `personal_core_lesson_event_copies`.
    const client = await sb();
    const authored = await loadAuthored(client, lessonId, ownerId);

    if (authored) {
      const next: Partial<AuthoredLessonRow> = {};
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.objective !== undefined)
        next.learning_objectives = objectiveToObjectives(patch.objective);
      if (patch.directions !== undefined) next.directions = patch.directions;
      if (patch.notes !== undefined) next.notes = patch.notes;
      if (patch.resources !== undefined)
        next.resources =
          patch.resources as unknown as AuthoredLessonRow["resources"];
      if (patch.standards !== undefined)
        next.standards = standardCodesToUuids(patch.standards);
      // Authored completion lives on its OWN `status`/`reason_not_done` columns
      // (NOT `completion_status`, which FKs to master events).
      if (patch.status !== undefined) next.status = statusToDb(patch.status);
      if (patch.reasonNotDone !== undefined)
        next.reason_not_done = patch.reasonNotDone;
      // `preview`/`time`/`tasks` are derived/unmodelled — skipped, as for copies.
      if (Object.keys(next).length > 0) {
        const upd = await client
          .from("personal_authored_lessons")
          .update(next)
          .eq("id", lessonId)
          .eq("owner_id", ownerId);
        if (upd.error) {
          throw new Error(
            `Planner repository update authored lesson failed: ${upd.error.message}`,
          );
        }
      }
      return reloadAuthoredLesson(client, lessonId, ownerId);
    }

    // Master-derived path: status-only patch is delegated to setLessonStatus
    // (which never forks); any content key forks the lesson.
    const contentKeys: (keyof LessonPatch)[] = [
      "title",
      "objective",
      "preview",
      "directions",
      "notes",
      "resources",
      "standards",
      "time",
      "tasks",
    ];
    const hasContent = contentKeys.some((k) => patch[k] !== undefined);

    if (patch.status !== undefined && !hasContent) {
      // Status-only patch: never forks (completion is always per-teacher, so the
      // saveTarget is irrelevant here — see setLessonStatus).
      return this.setLessonStatus(lessonId, patch.status, ownerId);
    }

    // ── #14 AUTHORIZED MASTER-WRITE ──────────────────────────────────────────
    // saveTarget === "core": write the SHARED master row instead of forking a
    // personal copy. Authorization is enforced server-side by RLS
    // (`can_edit_subject_master`); an unauthorized write affects 0 rows (RLS
    // denial is silent in PostgREST), so `patchMaster` re-selects and THROWS if
    // nothing came back — never a silent fall-through to a personal fork (#14:
    // no false success). Completion (status/reasonNotDone) still NEVER touches
    // master — it is written per-teacher below regardless of target.
    if (saveTarget === "core") {
      const next: Partial<MasterEventRow> = {};
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.objective !== undefined)
        next.learning_objectives = objectiveToObjectives(patch.objective);
      if (patch.directions !== undefined) next.directions = patch.directions;
      if (patch.notes !== undefined) next.notes = patch.notes;
      if (patch.resources !== undefined)
        next.resources =
          patch.resources as unknown as MasterEventRow["resources"];
      if (patch.standards !== undefined)
        next.standards = standardCodesToUuids(patch.standards);
      // `preview`/`time`/`tasks` have no master column (derived/unmodelled) —
      // skipped, exactly as in the personal-copy patch below.
      if (Object.keys(next).length > 0) {
        await patchMaster(client, lessonId, next);
      }
      // Completion never forks and never writes master — write it per-teacher.
      if (patch.status !== undefined) {
        await writeStatus(client, lessonId, ownerId, patch.status, undefined);
      }
      if (patch.reasonNotDone !== undefined) {
        await writeStatus(
          client,
          lessonId,
          ownerId,
          undefined,
          patch.reasonNotDone,
        );
      }
      return reloadLesson(client, lessonId, ownerId);
    }

    await forkAndPatch(client, lessonId, ownerId, (copy) => {
      const next: Partial<PersonalCopyRow> = {};
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.objective !== undefined)
        next.learning_objectives = objectiveToObjectives(patch.objective);
      if (patch.directions !== undefined) next.directions = patch.directions;
      if (patch.notes !== undefined) next.notes = patch.notes;
      if (patch.resources !== undefined) next.resources = patch.resources;
      if (patch.standards !== undefined)
        next.standards = standardCodesToUuids(patch.standards);
      // `preview`/`time`/`tasks` have no column in the copies table — they are
      // derived (preview) or unmodelled (time/tasks). Skipped intentionally.
      void copy;
      return next;
    });

    // A content edit also writes a status, if present (status never forks).
    if (patch.status !== undefined) {
      await writeStatus(client, lessonId, ownerId, patch.status, undefined);
    }
    if (patch.reasonNotDone !== undefined) {
      await writeStatus(
        client,
        lessonId,
        ownerId,
        undefined,
        patch.reasonNotDone,
      );
    }

    return reloadLesson(client, lessonId, ownerId);
  },

  async moveLesson(
    lessonId,
    target: LessonMoveTarget,
    ownerId,
    saveTarget: SaveTarget = "personal",
  ) {
    const client = await sb();
    const week = await resolveSchoolWeek(client, ownerId);
    const dayOfWeek = dayIndexToWeekday(target.day, week);

    // Owner-kind branch (Codex #7): an authored lesson moves on its own row;
    // a master-derived lesson moves via the lazy fork (personal) or the shared
    // master row (#14 authorized core move).
    const authored = await loadAuthored(client, lessonId, ownerId);
    if (authored) {
      const upd = await client
        .from("personal_authored_lessons")
        .update({ week_number: target.week, day_of_week: dayOfWeek })
        .eq("id", lessonId)
        .eq("owner_id", ownerId);
      if (upd.error) {
        throw new Error(
          `Planner repository move authored lesson failed: ${upd.error.message}`,
        );
      }
      return reloadAuthoredLesson(client, lessonId, ownerId);
    }

    // #14 AUTHORIZED MASTER-WRITE: move the SHARED master row's slot instead of
    // forking. RLS-gated; `patchMaster` throws on a 0-row (unauthorized) write
    // rather than silently forking.
    if (saveTarget === "core") {
      await patchMaster(client, lessonId, {
        week_number: target.week,
        day_of_week: dayOfWeek,
      });
      return reloadLesson(client, lessonId, ownerId);
    }

    await forkAndPatch(client, lessonId, ownerId, () => ({
      week_number: target.week,
      day_of_week: dayOfWeek,
    }));
    return reloadLesson(client, lessonId, ownerId);
  },

  async setLessonStatus(
    lessonId,
    status,
    ownerId,
    _saveTarget: SaveTarget = "personal",
  ) {
    // Completion NEVER forks (CLAUDE.md §2) and NEVER writes the master row —
    // it is always per-teacher. `_saveTarget` is accepted for signature parity
    // but is intentionally inert: a "core" completion is a contradiction.
    void _saveTarget;
    const client = await sb();

    // Owner-kind branch (Codex #7): an authored lesson has no master event, so
    // its completion can't live in `completion_status` (that table FKs to
    // master_core_lesson_events). Write the authored row's own `status` column.
    const authored = await loadAuthored(client, lessonId, ownerId);
    if (authored) {
      const upd = await client
        .from("personal_authored_lessons")
        .update({ status: statusToDb(status) })
        .eq("id", lessonId)
        .eq("owner_id", ownerId);
      if (upd.error) {
        throw new Error(
          `Planner repository set authored status failed: ${upd.error.message}`,
        );
      }
      return reloadAuthoredLesson(client, lessonId, ownerId);
    }

    await writeStatus(client, lessonId, ownerId, status, undefined);
    return reloadLesson(client, lessonId, ownerId);
  },

  async createLesson(input, ownerId, gradeLevelId) {
    // A teacher's OWN week/day-keyed lesson with no backing master lands in
    // `personal_authored_lessons` (migration 20260601120000). The row is
    // strictly owner-scoped (RLS: owner_id = auth.uid()). `gradeLevelId` is the
    // RESOLVED grade uuid the row keys on; it defaults to `input.gradeLevelId`.
    const client = await sb();
    const grade = gradeLevelId ?? input.gradeLevelId;
    // Resolve the subject slug → its DB uuid for this grade (the column is a
    // NOT-NULL FK to subjects). The importer keys subjects by the slug-derived
    // uuid, so the deterministic bridge resolves it without a round-trip.
    const subjectUuid = slugToUuid("subject", input.subject);
    // Unit id (Codex #6): the column is a nullable FK to `units.id` (real uuid).
    // `input.unit` may already BE a real units.id uuid (the DB read path exposes
    // the unit as its uuid — see loadUnitIndex) or a fixture SLUG (`u-m3`). Only
    // hash a slug; re-hashing an already-uuid id mints a DIFFERENT, non-existent
    // uuid that fails the FK / drops the lesson from unit views. We detect a uuid
    // by shape and pass it through unchanged.
    // NOTE (separate pre-flip blocker, Codex #6): SubjectView / TimelineYear
    // still compare a lesson's `unit` against the MOCK ALL_UNITS slugs, so an
    // authored lesson keyed by a real units.id uuid won't match those slug-based
    // groupings until the unit catalog is routed through the store. Out of scope
    // here (needs the store + catalog change); flagged so it isn't lost.
    const unitUuid = input.unit
      ? isUuid(input.unit)
        ? input.unit
        : slugToUuid("unit", input.unit)
      : null;
    const week = await resolveSchoolWeek(client, ownerId);

    const row = {
      owner_id: ownerId,
      grade_level_id: grade,
      unit_id: unitUuid,
      subject_id: subjectUuid,
      week_number: input.week,
      day_of_week: dayIndexToWeekday(input.day, week),
      title: input.title,
      directions: null,
      learning_objectives: [] as string[],
      notes: null,
      resources: [] as LessonResource[],
      standards: [] as string[],
      display_order_within_day: 0,
      status: "not_done",
      reason_not_done: null,
    };

    const res = await client
      .from("personal_authored_lessons")
      .insert(row)
      .select(AUTHORED_COLS)
      .single();
    const inserted = unwrap(res, "create lesson") as AuthoredLessonRow;

    // Map the inserted row back to a FLAT Lesson. Resolve subject/unit/standard
    // slugs against the lesson's grade so the domain id matches the read path.
    const [{ uuidToSubjectId }, { uuidToUnitSlug }, standards] =
      await Promise.all([
        loadSubjectIndex(client, grade),
        loadUnitIndex(client, grade),
        loadStandardsIndex(client, grade),
      ]);
    const subjectId = uuidToSubjectId.get(inserted.subject_id) ?? input.subject;
    // The read path exposes a unit AS its DB uuid (loadUnitIndex maps id→id), so
    // the authored lesson's `unit` round-trips to the SAME real units.id it was
    // written with — listLessons resolves it identically.
    const unitSlug = inserted.unit_id
      ? (uuidToUnitSlug.get(inserted.unit_id) ?? inserted.unit_id)
      : "";

    return buildLesson({
      id: inserted.id,
      subject: subjectId,
      unit: unitSlug,
      week: inserted.week_number,
      day: weekdayToDayIndex(inserted.day_of_week, week),
      title: inserted.title,
      objective: objectivesToObjective(inserted.learning_objectives),
      directions: inserted.directions ?? "",
      notes: inserted.notes ?? "",
      resources: jsonToResources(inserted.resources),
      standards: standardUuidsToCodes(inserted.standards, standards.uuidToCode),
      status: statusFromText(inserted.status),
      reasonNotDone: inserted.reason_not_done ?? "",
      isPersonal: true,
      modified: false,
      moved: null,
    });
  },

  async softDeleteLesson(lessonId, ownerId) {
    // PERSONAL-scoped soft-delete (§4.6). NEVER mutates the shared master row.
    //   • Teacher-authored lesson → set its own `deleted_at`.
    //   • Master-derived lesson   → archive the teacher's personal copy
    //     (`archived_at`), lazy-forking the copy first if it does not exist.
    const client = await sb();

    // 1. If this is an authored lesson the owner owns, soft-delete it directly.
    const authoredRes = await client
      .from("personal_authored_lessons")
      .select("id")
      .eq("id", lessonId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    const authored = unwrapMaybe(
      authoredRes,
      "soft-delete lesson (authored lookup)",
    ) as { id: string } | null;
    if (authored) {
      const del = await client
        .from("personal_authored_lessons")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", lessonId)
        .eq("owner_id", ownerId);
      if (del.error) {
        throw new Error(
          `Planner repository soft-delete authored lesson failed: ${del.error.message}`,
        );
      }
      return;
    }

    // 2. Otherwise it's a master-derived lesson: archive the owner's personal
    //    copy. Lazy-fork the copy first (cloning master content) so a teacher
    //    who never edited a master can still hide it for themselves.
    await forkAndPatch(client, lessonId, ownerId, () => ({
      archived_at: new Date().toISOString(),
    }));
  },

  // ── Section + resource mutations ──────────────────────────────────────────
  async setSections(
    lessonId,
    sections,
    ownerId,
    saveTarget: SaveTarget = "personal",
  ) {
    // Persist the full section list to `lesson_sections`, owner-scoped (personal
    // fork: owner_id = ownerId). Owner-kind is resolved so an authored lesson's
    // sections carry owner_kind='personal_authored' and a master-derived
    // lesson's carry 'personal_copy' (Codex #7).
    //
    // #14 AUTHORIZED MASTER-WRITE: saveTarget === "core" writes the SHARED team
    // section rows (owner_kind='master', owner_id=null) instead of the teacher's
    // personal fork. The `replace_lesson_sections` RPC runs SECURITY INVOKER, so
    // its INSERTs are RLS-checked as the caller; an unauthorized master section
    // write fails the `with check` (`can_edit_subject_master`) and RAISES — the
    // error is surfaced (thrown) below, never silently downgraded to a personal
    // fork. A "core" save only makes sense for a master-derived lesson; an
    // authored lesson has no master, so it always writes its own personal rows.
    //
    // ATOMIC replace (Codex #5): the prior path INSERTED then DELETEd across two
    // round-trips — an insert OK followed by a delete failure left duplicate /
    // stale rows. We now delegate the full swap to the transactional RPC
    // `replace_lesson_sections` (SECURITY INVOKER — RLS still applies), which
    // deletes the owner's prior rows for this lesson and inserts the new set in a
    // SINGLE transaction. Either the whole replace commits or none of it does, so
    // no partial/duplicate state can persist. Section `resources` jsonb is passed
    // through unchanged (never dropped). An empty `sections` list clears the
    // owner's rows for this lesson. If the RPC is unavailable at runtime the call
    // errors and is surfaced (thrown) so the store's persist error path logs it —
    // never silently swallowed.
    const client = await sb();
    const grade = await resolveLessonGrade(client, lessonId, ownerId);
    const personalOwnerKind = await resolveOwnerKind(client, lessonId, ownerId);

    // For a "core" save against a MASTER-derived lesson the rows are the shared
    // team set: owner_kind='master', owner_id=null. An authored lesson has no
    // master, so even a "core" request stays on its own personal_authored rows.
    const writeCore =
      saveTarget === "core" && personalOwnerKind === "personal_copy";
    const ownerKind = writeCore ? "master" : personalOwnerKind;
    const rowOwnerId = writeCore ? null : ownerId;

    // Map each section → the p_sections JSON element shape the RPC expects (keys
    // → columns). `display_order` is the array position; `template_section_id` is
    // null when absent. `resources` passes through as a jsonb array.
    const pSections = sections.map((s, i) => ({
      heading: s.heading,
      prompt: s.prompt,
      body: s.body,
      resources: s.resources, // preserve the section's resources jsonb array.
      display_order: i,
      template_section_id: s.templateSectionId ?? null,
    }));

    const rpc = await client.rpc("replace_lesson_sections", {
      p_owner_lesson_id: lessonId,
      p_owner_kind: ownerKind,
      p_owner_id: rowOwnerId, // teacher uid (personal fork); null for master/team.
      p_grade_level_id: grade,
      p_sections: pSections,
    });
    if (rpc.error) {
      throw new Error(
        `Planner repository set sections (replace) failed: ${rpc.error.message}`,
      );
    }

    return this.getSections(lessonId, ownerId);
  },

  async addSectionResource(lessonId, sectionId, resource, ownerId) {
    // Append a resource to a single section. The section may be a persisted
    // owner/team row, or a synthetic id from a not-yet-persisted lesson — in the
    // latter case we materialize the current sections first, then append.
    const sections = await this.getSections(lessonId, ownerId);
    const minted: SectionResource = {
      ...resource,
      id:
        (resource as Partial<SectionResource>).id ??
        `${sectionId}-r${Date.now().toString(36)}`,
    };
    const next = sections.map((s) =>
      s.id === sectionId ? { ...s, resources: [...s.resources, minted] } : s,
    );
    return this.setSections(lessonId, next, ownerId);
  },

  async removeSectionResource(lessonId, sectionId, resourceId, ownerId) {
    const sections = await this.getSections(lessonId, ownerId);
    const next = sections.map((s) =>
      s.id === sectionId
        ? { ...s, resources: s.resources.filter((r) => r.id !== resourceId) }
        : s,
    );
    return this.setSections(lessonId, next, ownerId);
  },
};

// ── Module-private write helpers ──────────────────────────────────────────────

/** Load the master row by id (throws if missing / not visible under RLS). */
async function loadMaster(
  client: ServerClient,
  lessonId: string,
): Promise<MasterEventRow> {
  const res = await client
    .from("master_core_lesson_events")
    .select(MASTER_COLS)
    .eq("id", lessonId)
    .maybeSingle();
  const row = unwrapMaybe(res, "load master lesson") as MasterEventRow | null;
  if (!row) throw new Error(`Lesson not found: ${lessonId}`);
  return row;
}

/** Load this teacher's personal copy for a master, or null if not yet forked. */
async function loadCopy(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<PersonalCopyRow | null> {
  const res = await client
    .from("personal_core_lesson_event_copies")
    .select(COPY_COLS)
    .eq("teacher_id", ownerId)
    .eq("master_core_lesson_event_id", lessonId)
    .maybeSingle();
  return unwrapMaybe(res, "load personal copy") as PersonalCopyRow | null;
}

/**
 * The LAZY-FORK primitive. Ensures a personal copy exists for (owner, master) —
 * cloning the master's fields on first edit — then applies `patch(copy)` to it
 * and marks it diverged. NEVER mutates the master row. Upsert is keyed on the
 * table's `unique (teacher_id, master_core_lesson_event_id)` constraint.
 *
 * `grade_level_id` is denormalized onto the copy too (kept filled by the table's
 * BEFORE trigger, but we set it explicitly from the master for clarity).
 */
async function forkAndPatch(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
  patch: (copy: PersonalCopyRow | null) => Partial<PersonalCopyRow>,
): Promise<void> {
  const master = await loadMaster(client, lessonId);
  const existing = await loadCopy(client, lessonId, ownerId);

  // The full copy row, cloning master content where the copy doesn't exist yet.
  const base: Omit<PersonalCopyRow, "id"> = existing
    ? {
        teacher_id: existing.teacher_id,
        master_core_lesson_event_id: existing.master_core_lesson_event_id,
        grade_level_id: existing.grade_level_id,
        unit_id: existing.unit_id,
        subject_id: existing.subject_id,
        week_number: existing.week_number,
        day_of_week: existing.day_of_week,
        title: existing.title,
        directions: existing.directions,
        learning_objectives: existing.learning_objectives,
        notes: existing.notes,
        resources: existing.resources,
        standards: existing.standards,
        display_order_within_day: existing.display_order_within_day,
        is_diverged_from_master: existing.is_diverged_from_master,
        archived_at: existing.archived_at,
      }
    : {
        teacher_id: ownerId,
        master_core_lesson_event_id: master.id,
        grade_level_id: master.grade_level_id,
        unit_id: master.unit_id,
        subject_id: master.subject_id,
        week_number: master.week_number,
        day_of_week: master.day_of_week,
        title: master.title,
        directions: master.directions,
        learning_objectives: master.learning_objectives,
        notes: master.notes,
        resources: master.resources,
        standards: master.standards,
        display_order_within_day: master.display_order_within_day,
        is_diverged_from_master: false,
        archived_at: null,
      };

  const applied = patch(existing);
  const row = { ...base, ...applied, is_diverged_from_master: true };

  const res = await client
    .from("personal_core_lesson_event_copies")
    .upsert(row, { onConflict: "teacher_id,master_core_lesson_event_id" });
  if (res.error) {
    throw new Error(
      `Planner repository fork/patch failed: ${res.error.message}`,
    );
  }
}

/**
 * #14 AUTHORIZED MASTER-WRITE primitive. UPDATE the SHARED master row in place
 * (never forks). Authorization is enforced server-side by the `master_events_write`
 * RLS policy (`can_edit_subject_master(subject_id)`); an unauthorized caller's
 * UPDATE silently matches 0 rows under PostgREST (RLS filters the row out of the
 * UPDATE's scope rather than raising), so we `.select()` the affected rows back
 * and THROW when none returned — guaranteeing a core save that could not persist
 * surfaces an error rather than reporting a false success (and never falls back
 * to a personal fork). A transport/SQL error is surfaced the same way.
 */
async function patchMaster(
  client: ServerClient,
  lessonId: string,
  patch: Partial<MasterEventRow>,
): Promise<void> {
  const res = await client
    .from("master_core_lesson_events")
    .update(patch)
    .eq("id", lessonId)
    .is("deleted_at", null)
    .select("id");
  if (res.error) {
    throw new Error(
      `Planner repository master write failed: ${res.error.message}`,
    );
  }
  const rows = (res.data ?? []) as { id: string }[];
  if (rows.length === 0) {
    // 0 rows = RLS denied the write (no can_edit_subject_master) OR the master
    // row is missing/soft-deleted. Either way the Team Curriculum was NOT
    // changed — throw so the caller's persist error path reports it, instead of
    // a teacher believing they edited the team plan when nobody else did (#14).
    throw new Error(
      `Planner repository master write affected no rows for lesson ${lessonId} — not authorized to edit this subject's Team Curriculum, or the lesson no longer exists.`,
    );
  }
}

/**
 * Upsert the (owner, master) completion row. Completion NEVER forks (it writes
 * `completion_status`, never the copies table). Either `status` or
 * `reasonNotDone` (or both) may be supplied; an undefined field is left
 * untouched on an existing row (and defaults on insert).
 */
async function writeStatus(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
  status: LessonStatus | undefined,
  reasonNotDone: string | undefined,
): Promise<void> {
  // Read the existing row so a partial update doesn't clobber the other field.
  const existing = await client
    .from("completion_status")
    .select(COMPLETION_COLS)
    .eq("teacher_id", ownerId)
    .eq("core_lesson_event_id", lessonId)
    .maybeSingle();
  if (existing.error) {
    throw new Error(
      `Planner repository load completion failed: ${existing.error.message}`,
    );
  }
  const prev = existing.data as CompletionRow | null;

  const row = {
    teacher_id: ownerId,
    core_lesson_event_id: lessonId,
    status:
      status !== undefined ? statusToDb(status) : (prev?.status ?? "not_done"),
    reason_not_done:
      reasonNotDone !== undefined
        ? reasonNotDone
        : (prev?.reason_not_done ?? null),
  };

  const res = await client
    .from("completion_status")
    .upsert(row, { onConflict: "teacher_id,core_lesson_event_id" });
  if (res.error) {
    throw new Error(
      `Planner repository write completion failed: ${res.error.message}`,
    );
  }
}

/** Re-read a single lesson (personal-over-master + completion) after a mutation
 *  and map it to the FLAT domain Lesson. Resolves subject/unit/standard slugs
 *  by deriving the grade from the lesson's denormalized grade column (fallback:
 *  the lesson's unit). */
async function reloadLesson(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<Lesson> {
  const master = await loadMaster(client, lessonId);

  // Prefer the denormalized grade column; fall back to the unit's grade if the
  // column is somehow null (pre-backfill rows).
  let gradeLevelId = master.grade_level_id;
  let unitRow: UnitRow | null = null;
  if (!gradeLevelId) {
    const unitRes = await client
      .from("units")
      .select(UNIT_COLS)
      .eq("id", master.unit_id)
      .maybeSingle();
    unitRow = unwrapMaybe(unitRes, "reload lesson unit") as UnitRow | null;
    if (!unitRow) throw new Error(`Unit not found for lesson: ${lessonId}`);
    gradeLevelId = unitRow.grade_level_id;
  }

  const [
    { uuidToSubjectId },
    { uuidToUnitSlug },
    standards,
    copy,
    complRes,
    week,
  ] = await Promise.all([
    loadSubjectIndex(client, gradeLevelId),
    loadUnitIndex(client, gradeLevelId),
    loadStandardsIndex(client, gradeLevelId),
    loadCopy(client, lessonId, ownerId),
    client
      .from("completion_status")
      .select(COMPLETION_COLS)
      .eq("teacher_id", ownerId)
      .eq("core_lesson_event_id", lessonId)
      .maybeSingle(),
    resolveSchoolWeek(client, ownerId),
  ]);
  if (complRes.error) {
    throw new Error(
      `Planner repository reload completion failed: ${complRes.error.message}`,
    );
  }
  const compl = complRes.data as CompletionRow | null;

  const src = copy ?? master;
  return buildLesson({
    id: master.id,
    subject: uuidToSubjectId.get(src.subject_id) ?? "math",
    unit: uuidToUnitSlug.get(src.unit_id) ?? src.unit_id,
    week: src.week_number,
    day: weekdayToDayIndex(src.day_of_week, week),
    title: src.title,
    objective: objectivesToObjective(src.learning_objectives),
    directions: src.directions ?? "",
    notes: src.notes ?? "",
    resources: jsonToResources(src.resources),
    standards: standardUuidsToCodes(src.standards, standards.uuidToCode),
    status: compl ? statusFromDb(compl.status) : "not_done",
    reasonNotDone: compl?.reason_not_done ?? "",
    isPersonal: copy != null,
    modified: copy?.is_diverged_from_master ?? false,
    moved: copy ? deriveMoved(master, copy) : null,
  });
}

// ── Authored-lesson helpers (Codex #7) ────────────────────────────────────────

/** Load a teacher's OWN authored lesson by id, or null if this id is not an
 *  authored lesson the owner owns (then the caller treats it as master-derived).
 *  Excludes soft-deleted rows. */
async function loadAuthored(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<AuthoredLessonRow | null> {
  const res = await client
    .from("personal_authored_lessons")
    .select(AUTHORED_COLS)
    .eq("id", lessonId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  return unwrapMaybe(res, "load authored lesson") as AuthoredLessonRow | null;
}

/** Re-read a single AUTHORED lesson after a mutation → the FLAT domain Lesson.
 *  Authored lessons are always personal, never forked, and carry their own
 *  status; the unit/subject/standard slugs resolve against the lesson's grade. */
async function reloadAuthoredLesson(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<Lesson> {
  const authored = await loadAuthored(client, lessonId, ownerId);
  if (!authored) throw new Error(`Authored lesson not found: ${lessonId}`);

  const [{ uuidToSubjectId }, { uuidToUnitSlug }, standards, week] =
    await Promise.all([
      loadSubjectIndex(client, authored.grade_level_id),
      loadUnitIndex(client, authored.grade_level_id),
      loadStandardsIndex(client, authored.grade_level_id),
      resolveSchoolWeek(client, ownerId),
    ]);

  const subjectId = uuidToSubjectId.get(authored.subject_id) ?? "math";
  const unitSlug = authored.unit_id
    ? (uuidToUnitSlug.get(authored.unit_id) ?? authored.unit_id)
    : "";

  return buildLesson({
    id: authored.id,
    subject: subjectId,
    unit: unitSlug,
    week: authored.week_number,
    day: weekdayToDayIndex(authored.day_of_week, week),
    title: authored.title,
    objective: objectivesToObjective(authored.learning_objectives),
    directions: authored.directions ?? "",
    notes: authored.notes ?? "",
    resources: jsonToResources(authored.resources),
    standards: standardUuidsToCodes(authored.standards, standards.uuidToCode),
    status: statusFromText(authored.status),
    reasonNotDone: authored.reason_not_done ?? "",
    isPersonal: true,
    modified: false,
    moved: null,
  });
}

// ── Section read/resolve helpers ──────────────────────────────────────────────

/** Load the `lesson_sections` rows for one lesson, personal-fork resolved (the
 *  owner's rows resolve over the team/master rows). Returns the resolved set in
 *  display order. */
async function loadSectionRows(
  client: ServerClient,
  lessonId: string,
  ownerId: string | undefined,
): Promise<SectionRow[]> {
  const res = await client
    .from("lesson_sections")
    .select(SECTION_COLS)
    .eq("owner_lesson_id", lessonId)
    .order("display_order", { ascending: true });
  const rows = unwrap(res, "get sections") as SectionRow[];
  return resolvePersonalOverTeam(rows, ownerId);
}

/** Resolve a lesson's section rows personal-over-team: if the owner has ANY of
 *  their own (owner_id = ownerId) rows for this lesson, use ONLY those; else use
 *  the team/master (owner_id null) rows. (A teacher who has edited sections owns
 *  the full set — set-replace semantics in `setSections` guarantee this.) */
function resolvePersonalOverTeam(
  rows: SectionRow[],
  ownerId: string | undefined,
): SectionRow[] {
  if (ownerId) {
    const own = rows.filter((r) => r.owner_id === ownerId);
    if (own.length > 0) {
      return [...own].sort((a, b) => a.display_order - b.display_order);
    }
  }
  return rows
    .filter((r) => r.owner_id == null)
    .sort((a, b) => a.display_order - b.display_order);
}

/** Map persisted section rows → the domain `LessonSectionContent[]`. */
function mapSectionRows(rows: SectionRow[]): LessonSectionContent[] {
  return rows.map((row) => ({
    id: row.id,
    templateSectionId: row.template_section_id,
    heading: row.heading,
    prompt: row.prompt,
    body: row.body,
    resources: jsonToSectionResources(row.resources, row.id),
  }));
}

/** Build the synthetic single section for a lesson that has no persisted section
 *  rows yet — it carries the lesson's effective (personal-fork-resolved) flat
 *  `resources` so the section UI has a real container to read. */
async function syntheticSection(
  client: ServerClient,
  lessonId: string,
  ownerId: string | undefined,
): Promise<LessonSectionContent> {
  const resources = await readResources(client, lessonId, ownerId);
  return {
    id: `${lessonId}-s0`,
    templateSectionId: null,
    heading: "Lesson",
    prompt: "",
    body: "",
    resources: resources.map((r, i) => ({ ...r, id: `${lessonId}-r${i}` })),
  };
}

/** Read the effective resources for a lesson (personal copy where one exists,
 *  else master; or the authored lesson's own resources) as a typed array. */
async function readResources(
  client: ServerClient,
  lessonId: string,
  ownerId: string | undefined,
): Promise<LessonResource[]> {
  if (ownerId) {
    const copy = await loadCopy(client, lessonId, ownerId);
    if (copy) return jsonToResources(copy.resources);
  }
  // Try the master row; if absent, try a teacher-authored lesson.
  const masterRes = await client
    .from("master_core_lesson_events")
    .select("id, resources")
    .eq("id", lessonId)
    .maybeSingle();
  const master = unwrapMaybe(masterRes, "read resources (master)") as {
    id: string;
    resources: unknown;
  } | null;
  if (master) return jsonToResources(master.resources);

  const authoredRes = await client
    .from("personal_authored_lessons")
    .select("id, resources")
    .eq("id", lessonId)
    .maybeSingle();
  const authored = unwrapMaybe(authoredRes, "read resources (authored)") as {
    id: string;
    resources: unknown;
  } | null;
  if (authored) return jsonToResources(authored.resources);

  throw new Error(`Lesson not found: ${lessonId}`);
}

/** Resolve the grade uuid for a lesson (master or authored) — used when writing
 *  `lesson_sections.grade_level_id` (NOT NULL). */
async function resolveLessonGrade(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<string> {
  // Master lesson: prefer the denormalized grade column.
  const masterRes = await client
    .from("master_core_lesson_events")
    .select("id, grade_level_id, unit_id")
    .eq("id", lessonId)
    .maybeSingle();
  const master = unwrapMaybe(masterRes, "resolve lesson grade (master)") as {
    id: string;
    grade_level_id: string | null;
    unit_id: string;
  } | null;
  if (master) {
    if (master.grade_level_id) return master.grade_level_id;
    const unitRes = await client
      .from("units")
      .select("grade_level_id")
      .eq("id", master.unit_id)
      .maybeSingle();
    const unit = unwrapMaybe(unitRes, "resolve lesson grade (unit)") as {
      grade_level_id: string;
    } | null;
    if (unit) return unit.grade_level_id;
  }

  // Authored lesson the owner owns.
  const authoredRes = await client
    .from("personal_authored_lessons")
    .select("id, grade_level_id")
    .eq("id", lessonId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const authored = unwrapMaybe(
    authoredRes,
    "resolve lesson grade (authored)",
  ) as { id: string; grade_level_id: string } | null;
  if (authored) return authored.grade_level_id;

  throw new Error(`Lesson not found (resolve grade): ${lessonId}`);
}

/** Resolve the `lesson_owner_kind` for a section row this owner is writing. A
 *  master-derived lesson the teacher edits is a `personal_copy` section (owner-
 *  scoped); a teacher-authored lesson is `personal_authored`. */
async function resolveOwnerKind(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<"personal_copy" | "personal_authored"> {
  const authoredRes = await client
    .from("personal_authored_lessons")
    .select("id")
    .eq("id", lessonId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const authored = unwrapMaybe(
    authoredRes,
    "resolve owner kind (authored)",
  ) as { id: string } | null;
  return authored ? "personal_authored" : "personal_copy";
}
