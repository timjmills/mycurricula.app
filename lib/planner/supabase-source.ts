// lib/planner/supabase-source.ts — Supabase-backed `PlannerDataSource` (Phase 1B).
//
// A drop-in implementation of the planner repository contract defined in
// `lib/planner/source.ts`, backed by the curriculum tables in the initial
// schema migration (`supabase/migrations/20260518102823_initial_schema.sql`).
// It satisfies the SAME async interface the in-memory planner mock will — the
// store awaits both identically — but reads/writes durable rows.
//
// CLIENT CHOICE / RLS
//   Every read + write goes through the per-request server client
//   (`lib/supabase/server.ts`), so Row-Level Security (plan §13.1, migration
//   §11) is enforced with `auth.uid()`. The service-role admin client is
//   deliberately NOT imported here: nothing in this contract needs to bypass
//   RLS. Grade-scoping is carried on every read; we never do a bare table scan.
//
// FORKING (CLAUDE.md §2, migration §4.3)
//   `master_core_lesson_events` is the single source of truth;
//   `personal_core_lesson_event_copies` is the per-teacher LAZY fork. Reads
//   resolve a teacher's personal copy over the master where one exists. An edit
//   in personal mode UPSERTS a personal copy row (it never mutates master);
//   completion (`setLessonStatus`) writes `completion_status` and NEVER forks;
//   `softDeleteLesson` sets `deleted_at` on the master row.
//
//   This source operates in personal mode (every mutator takes an `ownerId` and
//   forks against that teacher). Master-mode editing is a separate, explicitly
//   gated surface (the Personal | Master top-bar toggle) that is not part of
//   this contract — the contract's mutators only carry an owner, so they always
//   write the teacher's personal fork. See the SCHEMA-GAP/notes section below.
//
// PRIVACY (§11.4)
//   Planner rows carry STRUCTURE only — title, directions, objectives, notes,
//   resources, standards. Never student names. Nothing here reads or writes a
//   roster.
//
// ID BRIDGE (lib/planner/id-bridge.ts)
//   The mock fixtures + UI speak human SLUGS (lesson `m-12-0`, unit `u-m3`,
//   subject `math`, standard code `5.NF.A.1`); the DB uses uuid PKs. The
//   importer assigns each row a DETERMINISTIC uuid v5 derived from its slug, so
//   `slugToUuid(kind, slug)` resolves slug → uuid without a round-trip, and a
//   per-request reverse index maps the uuids a query returns back to the slugs
//   the domain types expect.
//
// SCHEMA NOTES (migration 20260601120000_planner_sections_personal.sql closed
// the first two gaps; the third remains derived):
//   1. SECTIONS — `lesson_sections` now persists a lesson's editable sections
//      (heading / prompt / body / ordered resources, polymorphic owner). This
//      source writes ONLY owner-scoped personal rows (owner_id = auth.uid(),
//      owner_kind = personal_copy for a master-backed lesson, personal_authored
//      for a teacher-authored one) — it NEVER writes a team/master section
//      (owner_id null), which sidesteps the latent grade-wide write-policy gap
//      the security review flagged. `getSections` reads the teacher's rows and
//      falls back to a single synthetic section (from the lesson's flat
//      resources) when none exist yet, preserving the prior empty state. The
//      flat lesson-level `resources` jsonb is kept mirrored for flat readers.
//   2. createLesson — `personal_authored_lessons` is the home for a teacher's
//      OWN week/day-keyed lesson with no backing master. `createLesson` inserts
//      an owner-scoped row (owner = auth.uid(), grade resolved, subject/unit
//      slugs mapped to uuids); `listLessons` UNIONs the grade's authored rows so
//      created lessons appear. Matches the mock source's createLesson semantics.
//   3. PERSONAL MOVE/ORDER metadata — the FLAT `Lesson.moved` ("same-week" /
//      "across-weeks") is DERIVED here by comparing the personal copy's
//      week/day to its master; the schema has no explicit "moved" column.

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
import type { LessonSectionContent, SectionResource } from "../lesson-flow";
import {
  type LessonMoveTarget,
  type LessonPatch,
  type PlannerDataSource,
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

/** RFC-4122 UUID shape. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string =>
  typeof v === "string" && UUID_RE.test(v);

/**
 * Resolve the grade-level UUID to scope a read by. The CLIENT may pass a mock
 * slug (e.g. "g5") or nothing — never trusted. When the passed value is a real
 * UUID we use it (still RLS-gated); otherwise we resolve the CALLER's actual
 * grade from their `teacher_grade_assignments` row under RLS. Returns null when
 * the caller has no grade (signed out / unprovisioned) — callers treat that as
 * "no data" rather than querying with a bad id.
 */
async function resolveGradeLevelId(
  client: ServerClient,
  passed: string | null | undefined,
): Promise<string | null> {
  if (isUuid(passed)) return passed;
  const { data, error } = await client
    .from("teacher_grade_assignments")
    .select("grade_level_id")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data.grade_level_id as string) ?? null;
}

/** Resolve the authed teacher's own id (auth.uid()) server-side, ignoring any
 *  client-passed ownerId (which may be a mock slug like "lh"). Returns null when
 *  signed out. */
async function resolveAuthOwner(client: ServerClient): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
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

// ── Weekday enum ↔ day-index bridge ──────────────────────────────────────────
// The DB stores `day_of_week` as the `weekday` enum ('sun'..'sat'); the FLAT
// `Lesson.day` is a 0-based index into the CONFIGURED school week (0 = Sunday …
// 4 = Thursday for the beta school). We map against the full Sun-first weekday
// order so the bridge is total (every enum value has an index), and the beta
// Sun–Thu week happens to land 0–4. NOTE: when the school-week config wave lands
// (CLAUDE.md §1), the index should derive from the school's configured weekday
// SET, not this fixed Sun-first order — flagged for the lead. We never hard-code
// a 5-day assumption here; the array spans all seven days.

const WEEKDAY_ORDER = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;
type Weekday = (typeof WEEKDAY_ORDER)[number];

function weekdayToDayIndex(day: Weekday): number {
  const i = WEEKDAY_ORDER.indexOf(day);
  return i < 0 ? 0 : i;
}

function dayIndexToWeekday(day: number): Weekday {
  return WEEKDAY_ORDER[day] ?? "sun";
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

// ── Row shapes (snake_case, as the migration declares them) ───────────────────

/** A `master_core_lesson_events` row (the columns this source reads). */
interface MasterEventRow {
  id: string;
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

/** A `personal_core_lesson_event_copies` row (the lazy fork). */
interface PersonalCopyRow {
  id: string;
  teacher_id: string;
  master_core_lesson_event_id: string;
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

/** A `lesson_sections` row (the editable section content, any owner kind). The
 *  planner source ALWAYS writes owner-scoped personal rows from here (owner_id =
 *  the resolved auth uid) — never a team/master section (owner_id null), which
 *  would exercise the broader RLS write path. See the SECURITY note in the
 *  section-mutation helpers. */
interface LessonSectionRow {
  id: string;
  owner_kind: LessonOwnerKind;
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

/** A `personal_authored_lessons` row (a teacher's OWN week/day-keyed lesson with
 *  no master to fork). Mirrors the master event's content columns. */
interface PersonalAuthoredRow {
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

/** The polymorphic owner kind for a `lesson_sections` row (migration enum). */
type LessonOwnerKind = "master" | "personal_copy" | "personal_authored";

// Column lists kept in one place so reads stay consistent.
const MASTER_COLS =
  "id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, deleted_at";
const COPY_COLS =
  "id, teacher_id, master_core_lesson_event_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, is_diverged_from_master";
const COMPLETION_COLS = "core_lesson_event_id, status, reason_not_done";
const UNIT_COLS = "id, grade_level_id, subject_id, name, start_week, end_week";
const SUBJECT_COLS =
  "id, grade_level_id, name, color, parent_id, display_order";
const STANDARD_COLS = "id, code, description";
const LESSON_SECTION_COLS =
  "id, owner_kind, owner_lesson_id, owner_id, grade_level_id, template_section_id, heading, prompt, body, resources, display_order";
const PERSONAL_AUTHORED_COLS =
  "id, owner_id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, status, reason_not_done, deleted_at";

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

/** Coerce a jsonb `resources` value (a section's inline resources, which carry
 *  an `id`) to a typed `SectionResource[]`. Defensive: filters to objects with a
 *  string `type` + `label`, minting an id where the stored shape lacks one. */
function jsonToSectionResources(
  raw: unknown,
  lessonId: string,
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
      const rec = r as Record<string, unknown>;
      const id =
        typeof rec.id === "string" && rec.id.length > 0
          ? rec.id
          : `${lessonId}-${sectionId}-r${i}`;
      out.push({ ...(rec as unknown as LessonResource), id });
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
 *  set, which we don't have from the DB — so we map a unit uuid back to a slug
 *  by reversing `slugToUuid` over the KNOWN mock unit slugs, and fall back to
 *  the uuid itself for unknown units. */
async function loadUnitIndex(
  client: ServerClient,
  gradeLevelId: string,
): Promise<{ rows: UnitRow[]; uuidToUnitSlug: Map<string, string> }> {
  const res = await client
    .from("units")
    .select(UNIT_COLS)
    .eq("grade_level_id", gradeLevelId);
  const rows = unwrap(res, "list units") as UnitRow[];
  // We cannot reverse a uuid→slug without the slug set. The domain `Unit.id`
  // the UI expects IS the slug; the importer set `unit.id = slugToUuid("unit",
  // slug)`. Since the planner store keys units by their domain id, we expose the
  // DB uuid AS the unit id here (stable + unique) — the UI joins lessons↔units
  // by this same id, so internal consistency holds even though it's a uuid
  // rather than the human `u-m3` slug. (A human-slug round-trip needs the
  // importer to persist the slug; flagged for the lead.)
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
  async listLessons(gradeLevelId, ownerId) {
    const client = await sb();

    // Resolve real ids server-side: the client may pass mock slugs ("g5"/"lh").
    // grade ← the caller's assignment (or the passed UUID); owner ← auth.uid().
    const grade = await resolveGradeLevelId(client, gradeLevelId);
    const owner = (await resolveAuthOwner(client)) ?? ownerId;
    if (!grade) return [];

    // 1. Resolve the grade's subjects + units (and their slug indexes), so we
    //    can scope master events to the grade (events carry unit_id/subject_id
    //    but not grade_level_id) and map back to domain slugs.
    const [{ uuidToSubjectId }, { rows: unitRows, uuidToUnitSlug }, standards] =
      await Promise.all([
        loadSubjectIndex(client, grade),
        loadUnitIndex(client, grade),
        loadStandardsIndex(client, grade),
      ]);
    const gradeUnitIds = unitRows.map((u) => u.id);
    if (gradeUnitIds.length === 0) return [];

    // 2. Master events for the grade's units, excluding soft-deletes.
    const masterRes = await client
      .from("master_core_lesson_events")
      .select(MASTER_COLS)
      .in("unit_id", gradeUnitIds)
      .is("deleted_at", null)
      .order("week_number", { ascending: true })
      .order("display_order_within_day", { ascending: true });
    const masterRows = unwrap(
      masterRes,
      "list master lessons",
    ) as MasterEventRow[];
    if (masterRows.length === 0) return [];
    const masterIds = masterRows.map((m) => m.id);

    // 3. This teacher's personal copies for those masters (the lazy fork), and
    //    their completion rows. Both keyed by the MASTER event id. RLS already
    //    scopes to auth.uid(); `owner` is the resolved auth id.
    const [copyRes, complRes] = await Promise.all([
      client
        .from("personal_core_lesson_event_copies")
        .select(COPY_COLS)
        .eq("teacher_id", owner)
        .in("master_core_lesson_event_id", masterIds),
      client
        .from("completion_status")
        .select(COMPLETION_COLS)
        .eq("teacher_id", owner)
        .in("core_lesson_event_id", masterIds),
    ]);
    const copyRows = unwrap(
      copyRes,
      "list personal copies",
    ) as PersonalCopyRow[];
    const complRows = unwrap(complRes, "list completion") as CompletionRow[];

    const copyByMaster = new Map<string, PersonalCopyRow>();
    for (const c of copyRows)
      copyByMaster.set(c.master_core_lesson_event_id, c);
    const complByMaster = new Map<string, CompletionRow>();
    for (const c of complRows) complByMaster.set(c.core_lesson_event_id, c);

    // 4. Resolve personal-over-master and map each to a FLAT Lesson.
    const masterDerived = masterRows.map((master) => {
      const copy = copyByMaster.get(master.id);
      const compl = complByMaster.get(master.id);
      const status = compl ? statusFromDb(compl.status) : "not_done";
      const reasonNotDone = compl?.reason_not_done ?? "";

      // Effective content: the personal copy where one exists, else master.
      const src = copy ?? master;
      const subjectId = uuidToSubjectId.get(src.subject_id) ?? "math";
      const unitSlug = uuidToUnitSlug.get(src.unit_id) ?? src.unit_id;

      return buildLesson({
        id: master.id, // completion/boards key on the master id — keep it stable.
        subject: subjectId,
        unit: unitSlug,
        week: src.week_number,
        day: weekdayToDayIndex(src.day_of_week),
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
      });
    });

    // 5. UNION the teacher's own personal-authored lessons for the grade
    //    (owner-scoped; created via `createLesson`). These have no master to
    //    fork — they are personal by definition. RLS limits to auth.uid()'s
    //    rows; the explicit owner filter keeps the read owner-scoped.
    if (!owner) return masterDerived;
    const authoredRes = await client
      .from("personal_authored_lessons")
      .select(PERSONAL_AUTHORED_COLS)
      .eq("owner_id", owner)
      .eq("grade_level_id", grade)
      .is("deleted_at", null)
      .order("week_number", { ascending: true })
      .order("display_order_within_day", { ascending: true });
    const authoredRows = unwrap(
      authoredRes,
      "list personal-authored lessons",
    ) as PersonalAuthoredRow[];

    const authoredDerived = authoredRows.map((row) =>
      authoredRowToLesson(
        row,
        uuidToSubjectId.get(row.subject_id) ?? "math",
        row.unit_id ? (uuidToUnitSlug.get(row.unit_id) ?? row.unit_id) : "",
        standards,
      ),
    );

    return [...masterDerived, ...authoredDerived];
  },

  async listUnits(gradeLevelId) {
    const client = await sb();
    const grade = await resolveGradeLevelId(client, gradeLevelId);
    if (!grade) return [];
    const { rows, uuidToUnitSlug } = await loadUnitIndex(client, grade);
    const { uuidToSubjectId } = await loadSubjectIndex(client, grade);
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
    const grade = await resolveGradeLevelId(client, gradeLevelId);
    if (!grade) return [];
    const { rows, uuidToSubjectId } = await loadSubjectIndex(client, grade);
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
    const grade = await resolveGradeLevelId(client, gradeLevelId);
    if (!grade) return {};
    const { map } = await loadStandardsIndex(client, grade);
    return map;
  },

  async getSections(lessonId) {
    // `lesson_sections` is the source of truth for a lesson's editable sections
    // (heading/prompt/body/ordered resources). We read THIS teacher's
    // owner-scoped rows for the lesson (RLS already limits to auth.uid()'s rows;
    // the explicit `owner_id` filter excludes any team/master section the source
    // never authors). When the teacher has no persisted sections yet we keep
    // today's empty-state behaviour: synthesize a single section from the
    // lesson's flat `resources` jsonb so the Teach/section UI always has a real
    // container to read.
    const client = await sb();
    const owner = await resolveAuthOwner(client);

    if (owner) {
      const secRes = await client
        .from("lesson_sections")
        .select(LESSON_SECTION_COLS)
        .eq("owner_lesson_id", lessonId)
        .eq("owner_id", owner)
        .order("display_order", { ascending: true });
      const rows = unwrap(secRes, "get sections") as LessonSectionRow[];
      if (rows.length > 0) {
        return rows.map((row) => sectionRowToContent(row, lessonId));
      }
    }

    // Empty state: derive a single synthetic section from the lesson's resources
    // (personal copy where one exists, else master, else personal-authored).
    const resources = owner
      ? await readResources(client, lessonId, owner)
      : await readResourcesAnonymous(client, lessonId);
    const section: LessonSectionContent = {
      id: `${lessonId}-s0`,
      templateSectionId: null,
      heading: "Lesson",
      prompt: "",
      body: "",
      resources: resources.map((r, i) => ({ ...r, id: `${lessonId}-r${i}` })),
    };
    return [section];
  },

  // ── Lesson mutations ─────────────────────────────────────────────────────
  async updateLesson(lessonId, patch, clientOwnerId) {
    // Personal mode: lazily fork. Status is handled by `setLessonStatus` (it
    // never forks), so a status-only patch is delegated there; any content key
    // forks the lesson.
    const client = await sb();
    // The client may pass a mock slug ("lh"); writes are keyed + RLS-gated on
    // the real auth uid. Resolve it server-side.
    const ownerId = (await resolveAuthOwner(client)) ?? clientOwnerId;
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
      // Status-only patch: never forks.
      return this.setLessonStatus(lessonId, patch.status, ownerId);
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

  async moveLesson(lessonId, target: LessonMoveTarget, clientOwnerId) {
    const client = await sb();
    const ownerId = (await resolveAuthOwner(client)) ?? clientOwnerId;
    await forkAndPatch(client, lessonId, ownerId, () => ({
      week_number: target.week,
      day_of_week: dayIndexToWeekday(target.day),
    }));
    return reloadLesson(client, lessonId, ownerId);
  },

  async setLessonStatus(lessonId, status, clientOwnerId) {
    // Completion NEVER forks (CLAUDE.md §2). Upsert the completion_status row.
    const client = await sb();
    const ownerId = (await resolveAuthOwner(client)) ?? clientOwnerId;
    await writeStatus(client, lessonId, ownerId, status, undefined);
    return reloadLesson(client, lessonId, ownerId);
  },

  async createLesson(input, clientOwnerId) {
    // A teacher's OWN week/day-keyed lesson with no backing master now persists
    // to `personal_authored_lessons` (migration 20260601120000). Owner-scoped:
    // owner = the resolved auth uid (NOT the client-passed slug); grade resolved
    // server-side; subject/unit slugs mapped to uuids. Mirrors the mock source's
    // createLesson semantics (fresh personal lesson, empty content, not_done).
    const client = await sb();
    const owner = await resolveAuthOwner(client);
    if (!owner) {
      throw new Error(
        "Planner repository createLesson failed: no authenticated teacher.",
      );
    }
    void clientOwnerId; // client-passed owner is never trusted (may be a slug).

    const grade = await resolveGradeLevelId(client, input.gradeLevelId);
    if (!grade) {
      throw new Error(
        "Planner repository createLesson failed: caller has no grade assignment.",
      );
    }

    const subjectId = await resolveSubjectId(client, grade, input.subject);
    if (!subjectId) {
      throw new Error(
        `Planner repository createLesson failed: subject not found for grade: ${input.subject}`,
      );
    }
    const unitId = resolveUnitId(input.unit);

    const insert = {
      owner_id: owner,
      grade_level_id: grade,
      unit_id: unitId,
      subject_id: subjectId,
      week_number: input.week,
      day_of_week: dayIndexToWeekday(input.day),
      title: input.title,
      directions: null,
      learning_objectives: [],
      notes: null,
      resources: [],
      standards: [],
      display_order_within_day: 0,
      status: "not_done",
      reason_not_done: null,
    };

    const res = await client
      .from("personal_authored_lessons")
      .insert(insert)
      .select(PERSONAL_AUTHORED_COLS)
      .single();
    const row = unwrap(res, "create lesson") as PersonalAuthoredRow;

    const standardsIndex = await loadStandardsIndex(client, grade);
    return authoredRowToLesson(row, input.subject, input.unit, standardsIndex);
  },

  async softDeleteLesson(lessonId, ownerId) {
    // Soft-delete the MASTER lesson (30-day window, §4.6). RLS gates whether
    // this teacher may write the master; the ownerId is accepted for parity with
    // the contract but the delete targets the shared master row.
    void ownerId;
    const client = await sb();
    const res = await client
      .from("master_core_lesson_events")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", lessonId);
    if (res.error) {
      throw new Error(
        `Planner repository soft-delete lesson failed: ${res.error.message}`,
      );
    }
  },

  // ── Section + resource mutations ──────────────────────────────────────────
  //
  // SECURITY: every write below is OWNER-SCOPED — owner_id is the resolved auth
  // uid and the owner_kind reflects how the lesson is owned (personal_copy /
  // personal_authored). This source NEVER writes a team/master section
  // (owner_id null), which would otherwise let a teacher insert a grade-wide
  // section pointing at any lesson in their grade (the latent `lesson_sections`
  // write-policy gap flagged by the security review). Keeping every row
  // owner-gated sidesteps that path entirely.
  async setSections(lessonId, sections, clientOwnerId) {
    const client = await sb();
    const owner = await resolveAuthOwner(client);
    if (!owner) {
      throw new Error(
        "Planner repository setSections failed: no authenticated teacher.",
      );
    }
    void clientOwnerId;
    const { ownerKind, gradeLevelId } = await resolveSectionOwner(
      client,
      lessonId,
      owner,
    );

    // Replace the teacher's section set for this lesson: delete their existing
    // owner-scoped rows, then insert the new ordered set. (A full replace keeps
    // heading/body/order/resources authoritative for the section table.)
    const del = await client
      .from("lesson_sections")
      .delete()
      .eq("owner_lesson_id", lessonId)
      .eq("owner_id", owner);
    if (del.error) {
      throw new Error(
        `Planner repository setSections (clear) failed: ${del.error.message}`,
      );
    }

    if (sections.length > 0) {
      const rows = sections.map((section, i) => ({
        owner_kind: ownerKind,
        owner_lesson_id: lessonId,
        owner_id: owner,
        grade_level_id: gradeLevelId,
        template_section_id: isUuid(section.templateSectionId)
          ? section.templateSectionId
          : null,
        heading: section.heading,
        prompt: section.prompt,
        body: section.body,
        resources: section.resources,
        display_order: i,
      }));
      const ins = await client.from("lesson_sections").insert(rows);
      if (ins.error) {
        throw new Error(
          `Planner repository setSections (insert) failed: ${ins.error.message}`,
        );
      }
    }

    // Mirror the UNION of section resources back to the lesson's flat
    // `resources` jsonb so flat-resource readers (weekly card / daily detail)
    // stay in sync. The section table is now the source of truth for
    // heading/body/order; the flat mirror is a denormalized convenience.
    const merged = flattenSectionResources(sections);
    await patchLessonResources(client, lessonId, owner, ownerKind, merged);

    return this.getSections(lessonId);
  },

  async addSectionResource(lessonId, sectionId, resource, clientOwnerId) {
    const client = await sb();
    const owner = await resolveAuthOwner(client);
    if (!owner) {
      throw new Error(
        "Planner repository addSectionResource failed: no authenticated teacher.",
      );
    }
    void clientOwnerId;
    const { ownerKind, gradeLevelId } = await resolveSectionOwner(
      client,
      lessonId,
      owner,
    );

    const sections = await ensurePersistedSections(
      client,
      lessonId,
      owner,
      ownerKind,
      gradeLevelId,
    );
    const target =
      sections.find((s) => s.id === sectionId) ?? sections[0] ?? null;
    if (!target) {
      throw new Error(
        `Planner repository addSectionResource failed: no section to add to for lesson ${lessonId}.`,
      );
    }
    const added: SectionResource = {
      ...stripResourceRuntimeId(resource),
      id: `${lessonId}-${target.id}-r${target.resources.length}`,
    };
    const next = sections.map((s) =>
      s.id === target.id ? { ...s, resources: [...s.resources, added] } : s,
    );
    return this.setSections(lessonId, next, owner);
  },

  async removeSectionResource(lessonId, sectionId, resourceId, clientOwnerId) {
    const client = await sb();
    const owner = await resolveAuthOwner(client);
    if (!owner) {
      throw new Error(
        "Planner repository removeSectionResource failed: no authenticated teacher.",
      );
    }
    void clientOwnerId;
    const { ownerKind, gradeLevelId } = await resolveSectionOwner(
      client,
      lessonId,
      owner,
    );

    const sections = await ensurePersistedSections(
      client,
      lessonId,
      owner,
      ownerKind,
      gradeLevelId,
    );
    const next = sections.map((s) =>
      s.id === sectionId
        ? { ...s, resources: s.resources.filter((r) => r.id !== resourceId) }
        : s,
    );
    return this.setSections(lessonId, next, owner);
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
      }
    : {
        teacher_id: ownerId,
        master_core_lesson_event_id: master.id,
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
 *  by deriving the grade from the lesson's unit. */
async function reloadLesson(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<Lesson> {
  const master = await loadMaster(client, lessonId);

  // Derive the grade from the lesson's unit so subject/standard slugs resolve.
  const unitRes = await client
    .from("units")
    .select("id, grade_level_id, subject_id, name, start_week, end_week")
    .eq("id", master.unit_id)
    .maybeSingle();
  const unitRow = unwrapMaybe(unitRes, "reload lesson unit") as UnitRow | null;
  if (!unitRow) throw new Error(`Unit not found for lesson: ${lessonId}`);
  const gradeLevelId = unitRow.grade_level_id;

  const [{ uuidToSubjectId }, standards, copy, complRes] = await Promise.all([
    loadSubjectIndex(client, gradeLevelId),
    loadStandardsIndex(client, gradeLevelId),
    loadCopy(client, lessonId, ownerId),
    client
      .from("completion_status")
      .select(COMPLETION_COLS)
      .eq("teacher_id", ownerId)
      .eq("core_lesson_event_id", lessonId)
      .maybeSingle(),
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
    unit: src.unit_id, // uuid-as-slug (see loadUnitIndex note)
    week: src.week_number,
    day: weekdayToDayIndex(src.day_of_week),
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

/** Load a teacher's personal-authored lesson by id (owner-scoped), or null. */
async function loadAuthored(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<PersonalAuthoredRow | null> {
  const res = await client
    .from("personal_authored_lessons")
    .select(PERSONAL_AUTHORED_COLS)
    .eq("id", lessonId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  return unwrapMaybe(res, "load authored lesson") as PersonalAuthoredRow | null;
}

/** Read the effective resources for a lesson (personal copy where one exists,
 *  else master, else the teacher's personal-authored lesson) as a typed array.
 *  Owner-scoped: only the auth uid's copy / authored rows are consulted. */
async function readResources(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<LessonResource[]> {
  const authored = await loadAuthored(client, lessonId, ownerId);
  if (authored) return jsonToResources(authored.resources);
  const copy = await loadCopy(client, lessonId, ownerId);
  if (copy) return jsonToResources(copy.resources);
  const master = await loadMasterMaybe(client, lessonId);
  return master ? jsonToResources(master.resources) : [];
}

/** Read a lesson's master resources when no teacher is resolved (signed-out
 *  empty-state read). Returns an empty array if the lesson isn't a master row. */
async function readResourcesAnonymous(
  client: ServerClient,
  lessonId: string,
): Promise<LessonResource[]> {
  const master = await loadMasterMaybe(client, lessonId);
  return master ? jsonToResources(master.resources) : [];
}

/** Load a master row by id, returning null (not throwing) when absent — used by
 *  the section paths where the lesson may instead be a personal-authored row. */
async function loadMasterMaybe(
  client: ServerClient,
  lessonId: string,
): Promise<MasterEventRow | null> {
  const res = await client
    .from("master_core_lesson_events")
    .select(MASTER_COLS)
    .eq("id", lessonId)
    .maybeSingle();
  return unwrapMaybe(
    res,
    "load master lesson (maybe)",
  ) as MasterEventRow | null;
}

/** Map a `lesson_sections` row → the frontend `LessonSectionContent`. */
function sectionRowToContent(
  row: LessonSectionRow,
  lessonId: string,
): LessonSectionContent {
  return {
    id: row.id,
    templateSectionId: row.template_section_id,
    heading: row.heading,
    prompt: row.prompt,
    body: row.body,
    resources: jsonToSectionResources(row.resources, lessonId, row.id),
  };
}

/** Resolve how a lesson is owned (for the polymorphic `lesson_sections.owner_kind`)
 *  and the grade to denormalize onto its sections. Owner-scoped: a
 *  personal-authored lesson (owner = auth uid) → 'personal_authored'; otherwise
 *  the lesson is a master event and the teacher's sections fork it as
 *  'personal_copy'. We NEVER write owner_kind 'master' / owner_id null here. */
async function resolveSectionOwner(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
): Promise<{ ownerKind: LessonOwnerKind; gradeLevelId: string }> {
  const authored = await loadAuthored(client, lessonId, ownerId);
  if (authored) {
    return {
      ownerKind: "personal_authored",
      gradeLevelId: authored.grade_level_id,
    };
  }
  const master = await loadMasterMaybe(client, lessonId);
  if (!master) throw new Error(`Lesson not found: ${lessonId}`);
  // Derive the grade from the master lesson's unit.
  const unitRes = await client
    .from("units")
    .select("id, grade_level_id")
    .eq("id", master.unit_id)
    .maybeSingle();
  const unitRow = unwrapMaybe(unitRes, "resolve section owner grade") as {
    id: string;
    grade_level_id: string;
  } | null;
  if (!unitRow) throw new Error(`Unit not found for lesson: ${lessonId}`);
  return { ownerKind: "personal_copy", gradeLevelId: unitRow.grade_level_id };
}

/** Read the teacher's persisted owner-scoped sections for a lesson, or — when
 *  none exist yet — synthesize the empty-state single section from the lesson's
 *  effective resources so a resource add/remove has a real container. */
async function ensurePersistedSections(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
  ownerKind: LessonOwnerKind,
  gradeLevelId: string,
): Promise<LessonSectionContent[]> {
  void ownerKind;
  void gradeLevelId;
  const secRes = await client
    .from("lesson_sections")
    .select(LESSON_SECTION_COLS)
    .eq("owner_lesson_id", lessonId)
    .eq("owner_id", ownerId)
    .order("display_order", { ascending: true });
  const rows = unwrap(secRes, "ensure sections") as LessonSectionRow[];
  if (rows.length > 0) {
    return rows.map((row) => sectionRowToContent(row, lessonId));
  }
  const resources = await readResources(client, lessonId, ownerId);
  return [
    {
      id: `${lessonId}-s0`,
      templateSectionId: null,
      heading: "Lesson",
      prompt: "",
      body: "",
      resources: resources.map((r, i) => ({
        ...r,
        id: `${lessonId}-s0-r${i}`,
      })),
    },
  ];
}

/** Mirror a resource union onto the lesson's flat `resources` jsonb. For a
 *  personal-authored lesson the row is updated in place (owner-scoped); for a
 *  master-backed lesson the write forks a personal copy (never mutates master).
 *  Resource runtime ids are stripped to match the flat lesson-resources shape. */
async function patchLessonResources(
  client: ServerClient,
  lessonId: string,
  ownerId: string,
  ownerKind: LessonOwnerKind,
  resources: LessonResource[],
): Promise<void> {
  if (ownerKind === "personal_authored") {
    const res = await client
      .from("personal_authored_lessons")
      .update({ resources })
      .eq("id", lessonId)
      .eq("owner_id", ownerId);
    if (res.error) {
      throw new Error(
        `Planner repository mirror authored resources failed: ${res.error.message}`,
      );
    }
    return;
  }
  await forkAndPatch(client, lessonId, ownerId, () => ({ resources }));
}

/** Resolve a subject SLUG (the locked SubjectId, e.g. "math") to its uuid PK for
 *  a grade. Loads the grade's subject rows and matches on the resolved slug. */
async function resolveSubjectId(
  client: ServerClient,
  gradeLevelId: string,
  subject: SubjectId,
): Promise<string | null> {
  if (isUuid(subject)) return subject;
  const { rows, uuidToSubjectId } = await loadSubjectIndex(
    client,
    gradeLevelId,
  );
  for (const row of rows) {
    if (uuidToSubjectId.get(row.id) === subject) return row.id;
  }
  return null;
}

/** Resolve a unit identifier (uuid-as-slug from the read path, or a mock slug)
 *  to a unit uuid. Returns null when unresolvable — the column is nullable. */
function resolveUnitId(unit: string | null | undefined): string | null {
  if (!unit) return null;
  if (isUuid(unit)) return unit;
  return slugToUuid("unit", unit);
}

/** Map a `personal_authored_lessons` row → the FLAT domain `Lesson`. The
 *  authored lesson is always personal (isPersonal=true) and has no master to be
 *  "moved" relative to, so `moved` is null. */
function authoredRowToLesson(
  row: PersonalAuthoredRow,
  subject: SubjectId,
  unit: string,
  standards: { uuidToCode: Map<string, string> },
): Lesson {
  const status: LessonStatus =
    row.status === "done" ||
    row.status === "skipped" ||
    row.status === "partial"
      ? row.status
      : row.status === "carried_over"
        ? "carried"
        : "not_done";
  return buildLesson({
    id: row.id,
    subject,
    unit,
    week: row.week_number,
    day: weekdayToDayIndex(row.day_of_week),
    title: row.title,
    objective: objectivesToObjective(row.learning_objectives),
    directions: row.directions ?? "",
    notes: row.notes ?? "",
    resources: jsonToResources(row.resources),
    standards: standardUuidsToCodes(row.standards, standards.uuidToCode),
    status,
    reasonNotDone: row.reason_not_done ?? "",
    isPersonal: true,
    modified: false,
    moved: null,
  });
}

/** Strip a section resource's runtime `id` so the persisted shape matches the
 *  lesson-level `resources` jsonb contract (which has no per-resource id). */
function stripResourceRuntimeId(resource: LessonResource): LessonResource {
  // `LessonResource` itself has no `id`; a `SectionResource` adds one. Spread
  // the resource and drop any stray `id` defensively.
  const out: Record<string, unknown> = { ...resource };
  delete out.id;
  return out as unknown as LessonResource;
}

/** Flatten the per-section resources into a single lesson-level array, stripping
 *  runtime ids (privacy/contract — sections are a frontend construct). */
function flattenSectionResources(
  sections: LessonSectionContent[],
): LessonResource[] {
  const out: LessonResource[] = [];
  for (const section of sections) {
    for (const r of section.resources) {
      out.push(stripResourceRuntimeId(r));
    }
  }
  return out;
}
