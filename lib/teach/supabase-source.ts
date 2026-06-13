// lib/teach/supabase-source.ts — Supabase-backed `TeachDataSource` (Phase 1B).
//
// A drop-in implementation of the repository contract defined in
// `lib/teach/queries.ts`, backed by the Teach-View Postgres schema
// (`supabase/migrations/20260530090000_teach_view.sql` for the grid-era base +
// `supabase/migrations/20260531120000_teach_freeform.sql` for the 5.31 free-form
// columns). It mirrors `mock-source.ts` behaviour exactly — the UI awaits both
// identically — but reads/writes durable rows instead of an in-memory store.
//
// CLIENT CHOICE / RLS
//   Reads + writes that belong to the calling teacher go through the
//   per-request server client (`lib/supabase/server.ts`), so Row-Level
//   Security (plan §13.1) is enforced with `auth.uid()`. Cross-user / library
//   reads that the interface exposes (e.g. `listTeamLibraryBoards`,
//   `countMyBoards(ownerId)`, `listMyBoards(ownerId)` for an arbitrary owner)
//   are still RLS-safe because the team-library + team-board policies admit any
//   teacher who can read the grade, and the personal-board policies are
//   owner-scoped. We deliberately use the AUTHED server client (never the
//   service-role admin client) for every method here: nothing in this contract
//   requires bypassing RLS, and using the anon/authed client keeps the privacy
//   + scope doctrine intact. The service-role admin client
//   (`lib/supabase/admin.ts`) is deliberately NOT imported here: nothing in
//   this contract needs to bypass RLS, so the escape hatch stays out of this
//   module until a future cross-user method genuinely requires it.
//
// PRIVACY (plan §11.4 / §13.3)
//   Boards/widgets are STRUCTURE ONLY. Student names / group rosters never
//   reach this layer — they live in the USER-scoped local store on the
//   teacher's device. `widgetToRow()` strips any name-bearing field defensively
//   before a write (see `stripNames`).
//
// SCHEMA (5.31 free-form columns are LIVE)
//   The 20260531120000_teach_freeform migration added every 5.31 domain field
//   this layer needs: `boards` now carries `pages`, `board_theme`, `repeat`,
//   `tags` (jsonb), `background`, `library_visibility` (text), `whiteboard`,
//   `ephemeral` (bool), and `published_by` / `source_board_id` (uuid); `widgets`
//   now carry `canvas` / `appearance` (jsonb). This file reads + writes all of
//   them, so the free-form canvas, multi-page boards, per-widget + board themes,
//   real-link repeat schedules, board tags, and the library model all persist.
//
//   PAGE MODEL: a board's pages live in the `boards.pages` jsonb (BoardPage[]).
//   The flat `widgets` table is the page-0 MIRROR (back-compat with grid-era
//   readers), exactly as the mock's `commitPages` keeps `board.widgets` synced
//   to page-0. When `pages` is null/empty the board reads as a single implicit
//   page built from its flat widget rows (mirrors the mock's `pagesOf`).
//
//   The pages container is denormalized in jsonb (intentional — the migration's
//   design; there is no separate page table). No interface method is blocked by
//   a missing column.

import type {
  Board,
  BoardLibraryVisibility,
  BoardPage,
  BoardScope,
  BoardTag,
  BoardTemplate,
  CanvasPosition,
  RepeatRule,
  RepeatSchedule,
  ThemeOverride,
  Widget,
  WidgetGridPosition,
  WidgetPersistence,
  WidgetType,
} from "../types";
import { boardMatchesContext, type BoardContext } from "./board-tags";
import { ensureCanvas } from "./board-migrate";
import { BoardCapError, MAX_BOARDS_PER_TEACHER } from "./limits";
import type { TeachDataSource } from "./queries";
import { SANDBOX_LESSON_ID } from "./constants";
import { makeUnwrap, sb, type ServerClient } from "../supabase/helpers";
import { slugToUuid } from "../planner/id-bridge";

// ── Supabase client helpers (shared, see lib/supabase/helpers.ts) ────────────

const unwrap = makeUnwrap("Teach repository");

// ── Row shapes (snake_case, as the migration declares them) ───────────────────

interface BoardRow {
  id: string;
  grade_level_id: string;
  subject_id: string | null;
  master_core_lesson_event_id: string | null;
  owner_id: string | null;
  scope: "personal" | "team";
  title: string;
  tint: string | null;
  display_order_within_lesson: number;
  template_id: string | null;
  // 5.31 free-form columns (20260531120000_teach_freeform). jsonb shapes mirror
  // the domain types exactly; text/bool/uuid for the scalar columns.
  pages: BoardPage[] | null;
  board_theme: ThemeOverride | null;
  repeat: RepeatRule[] | null;
  tags: BoardTag[] | null;
  background: string | null;
  whiteboard: boolean;
  ephemeral: boolean;
  library_visibility: BoardLibraryVisibility;
  published_by: string | null;
  source_board_id: string | null;
  created_at: string;
  updated_at: string;
}

interface WidgetRow {
  id: string;
  board_id: string;
  type: WidgetType;
  title: string;
  grid_row: number;
  grid_col: number;
  grid_rowspan: number;
  grid_colspan: number;
  // 5.31 free-form placement + per-widget appearance override (jsonb).
  canvas: CanvasPosition | null;
  appearance: ThemeOverride | null;
  display_order_within_board: number;
  pinned: boolean;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  persistence_override: WidgetPersistence;
  created_at: string;
  updated_at: string;
}

interface BoardTemplateRow {
  id: string;
  grade_level_id: string;
  subject_id: string | null;
  scope: "personal" | "team";
  owner_id: string | null;
  title: string;
  layout: string | null;
  widgets: unknown;
  created_at: string;
  updated_at: string;
}

// The `select(...)` column lists, kept in one place so reads stay consistent.
const BOARD_COLS =
  "id, grade_level_id, subject_id, master_core_lesson_event_id, owner_id, scope, title, tint, display_order_within_lesson, template_id, pages, board_theme, repeat, tags, background, whiteboard, ephemeral, library_visibility, published_by, source_board_id, created_at, updated_at";
const WIDGET_COLS =
  "id, board_id, type, title, grid_row, grid_col, grid_rowspan, grid_colspan, canvas, appearance, display_order_within_board, pinned, config, state, persistence_override, created_at, updated_at";
const TEMPLATE_COLS =
  "id, grade_level_id, subject_id, scope, owner_id, title, layout, widgets, created_at, updated_at";

// ── Privacy: name-stripping for the structure-only invariant ──────────────────
// Belt-and-suspenders: the UI never sends names, but the adapter still strips any
// name-bearing key before a write so a future caller bug can't leak a roster
// into the DB (plan §11.4). Keys are matched case-insensitively.

const NAME_BEARING_KEYS = [
  "names",
  "roster",
  "students",
  "studentnames",
  "members",
];

/** Recursively strip every name-bearing key (case-insensitive) at EVERY depth of
 *  a plain-object/array tree (audit Finding 10). The earlier version stripped only
 *  TOP-LEVEL keys, so a nested roster — `{ groups: [{ members: [...] }] }` — would
 *  leak student names into the persisted jsonb. We now walk nested plain objects
 *  AND arrays, dropping any NAME_BEARING_KEYS wherever they appear. Non-plain
 *  values (primitives, null, Date, etc.) pass through untouched; only object/array
 *  containers are descended. The return type stays `Record<string, unknown>` (the
 *  top-level value the config/state callers always pass is an object). */
function stripNamesDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Walk array elements (a roster could hide one level down inside an array).
    return value.map((v) => stripNamesDeep(v));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (NAME_BEARING_KEYS.includes(k.toLowerCase())) continue;
      out[k] = stripNamesDeep(v);
    }
    return out;
  }
  // Primitive / null / non-plain object (Date, etc.) — nothing to strip.
  return value;
}

/** True for a "plain" object literal (the only container we recurse into). Guards
 *  against descending into class instances / Dates / null, which would lose data
 *  or throw. Mirrors the structure-only jsonb the layer ever persists. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Strip name-bearing keys from a config/state object before persisting it. Thin
 *  wrapper over the recursive `stripNamesDeep` so every call site keeps the same
 *  `Record<string, unknown>` in/out shape it had with the top-level-only version. */
function stripNames(obj: Record<string, unknown>): Record<string, unknown> {
  return stripNamesDeep(obj) as Record<string, unknown>;
}

// ── Row ↔ domain mappers ──────────────────────────────────────────────────────

/** Build a legacy grid position from the widget row's grid columns. */
function rowToGridPosition(row: WidgetRow): WidgetGridPosition {
  return {
    col: row.grid_col,
    row: row.grid_row,
    colSpan: row.grid_colspan,
    rowSpan: row.grid_rowspan,
  };
}

/** Map a widget row → domain Widget. The real `canvas` column is used when set;
 *  otherwise `ensureCanvas` derives a free-form position from the grid columns so
 *  grid-era rows never stack at the editor's default coordinate (matching the
 *  mock's read-time guarantee). `appearance` jsonb maps straight through. */
function rowToWidget(row: WidgetRow): Widget {
  const base: Widget = {
    id: row.id,
    boardId: row.board_id,
    type: row.type,
    title: row.title,
    position: rowToGridPosition(row),
    // Persisted free-form placement wins; null/absent → derived from the grid.
    canvas: row.canvas ?? undefined,
    appearance: row.appearance ?? undefined,
    displayOrder: row.display_order_within_board,
    pinned: row.pinned,
    config: row.config ?? {},
    state: row.state ?? {},
    persistence: row.persistence_override,
    gradeLevelId: "", // filled in by the board mapper (denormalized from board)
  };
  return ensureCanvas(base);
}

/** Map a domain Widget → an insert/update row for the `widgets` table. Strips
 *  name-bearing keys from config/state (privacy). The 5.31 `canvas`/`appearance`
 *  fields persist to their jsonb columns (null when absent → inherit/derive). */
function widgetToRow(
  widget: Widget,
): Omit<WidgetRow, "created_at" | "updated_at"> {
  return {
    id: widget.id,
    board_id: widget.boardId,
    type: widget.type,
    title: widget.title,
    grid_col: widget.position.col,
    grid_row: widget.position.row,
    grid_colspan: widget.position.colSpan,
    grid_rowspan: widget.position.rowSpan,
    canvas: widget.canvas ?? null,
    appearance: widget.appearance ?? null,
    display_order_within_board: widget.displayOrder,
    pinned: widget.pinned,
    config: stripNames(widget.config ?? {}),
    state: stripNames(widget.state ?? {}),
    persistence_override: widget.persistence,
  };
}

/** Map a board row + its widgets → a domain Board. Widgets inherit the board's
 *  grade for the denormalized `gradeLevelId`. The flat `widgets` array (from the
 *  `widgets` table) is the page-0 mirror; the `pages` jsonb column is the
 *  authoritative multi-page container when present. `ensureCanvas` guarantees a
 *  free-form position for every widget (grid-era rows + jsonb pages alike). */
function rowToBoard(row: BoardRow, widgetRows: WidgetRow[]): Board {
  const widgets = widgetRows
    .slice()
    .sort((a, b) => a.display_order_within_board - b.display_order_within_board)
    .map((wr) => ({ ...rowToWidget(wr), gradeLevelId: row.grade_level_id }));
  // The `pages` jsonb holds full Widget objects; re-stamp each widget's
  // denormalized grade + ensure a canvas so a grid-era page widget never stacks.
  const pages =
    row.pages && row.pages.length > 0
      ? row.pages.map((p) => ({
          ...p,
          widgets: (p.widgets ?? []).map((w) =>
            ensureCanvas({ ...w, gradeLevelId: row.grade_level_id }),
          ),
        }))
      : undefined;
  return {
    id: row.id,
    masterLessonId: row.master_core_lesson_event_id,
    ownerId: row.owner_id,
    scope: row.scope,
    title: row.title,
    displayOrderWithinLesson: row.display_order_within_lesson,
    templateId: row.template_id,
    // 5.31 domain fields (jsonb / scalar columns) mapped straight through.
    background: row.background,
    tags: row.tags ?? undefined,
    whiteboard: row.whiteboard,
    ephemeral: row.ephemeral,
    libraryVisibility: row.library_visibility,
    publishedBy: row.published_by,
    sourceBoardId: row.source_board_id,
    pages,
    boardTheme: row.board_theme ?? undefined,
    repeat: row.repeat ?? null,
    widgets,
    gradeLevelId: row.grade_level_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The envelope shape stored in `board_templates.widgets` jsonb for Wave-2
 *  templates that carry the full page model + board cosmetics. The DB schema has
 *  no dedicated columns for pages/background/size/board_theme (migration is a
 *  later wave), so we pack them into the existing flexible `widgets` jsonb. A
 *  legacy template stored a bare Widget[] there; `rowToTemplate` detects which. */
interface TemplateEnvelope {
  widgets: Omit<Widget, "boardId">[];
  pages?: BoardPage[];
  background?: string | null;
  size?: "wide" | "a4" | "a3";
  boardTheme?: ThemeOverride;
}

/** True for the Wave-2 envelope object (vs a legacy bare Widget[] array). */
function isTemplateEnvelope(v: unknown): v is TemplateEnvelope {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Array.isArray((v as { widgets?: unknown }).widgets)
  );
}

/** Map a board-template row → a domain BoardTemplate. The `widgets` jsonb is
 *  either a legacy bare `Widget[]` (pre-Wave-2) or a `TemplateEnvelope` carrying
 *  the full page model + board cosmetics; both round-trip to the same domain
 *  shape. */
function rowToTemplate(row: BoardTemplateRow): BoardTemplate {
  const raw = row.widgets;
  const env: TemplateEnvelope = isTemplateEnvelope(raw)
    ? raw
    : { widgets: Array.isArray(raw) ? (raw as Omit<Widget, "boardId">[]) : [] };
  return {
    id: row.id,
    title: row.title,
    scope: row.scope,
    ownerId: row.owner_id,
    widgets: env.widgets,
    pages: env.pages,
    background: env.background,
    size: env.size,
    boardTheme: env.boardTheme,
    gradeLevelId: row.grade_level_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Shared DB helpers ─────────────────────────────────────────────────────────

/** Fetch the widget rows for a set of board ids, grouped by board id. Returns an
 *  empty array for any board with no widgets. */
async function fetchWidgetsByBoard(
  client: ServerClient,
  boardIds: string[],
): Promise<Map<string, WidgetRow[]>> {
  const byBoard = new Map<string, WidgetRow[]>();
  for (const id of boardIds) byBoard.set(id, []);
  if (boardIds.length === 0) return byBoard;
  const res = await client
    .from("widgets")
    .select(WIDGET_COLS)
    .in("board_id", boardIds);
  const rows = unwrap(res, "fetch widgets") as WidgetRow[];
  for (const row of rows) {
    const list = byBoard.get(row.board_id);
    if (list) list.push(row);
    else byBoard.set(row.board_id, [row]);
  }
  return byBoard;
}

/** Load one full board (row + widgets) by id, or throw if it does not exist /
 *  isn't visible under RLS. */
async function loadBoard(
  client: ServerClient,
  boardId: string,
): Promise<Board> {
  const res = await client
    .from("boards")
    .select(BOARD_COLS)
    .eq("id", boardId)
    .maybeSingle();
  if (res.error) {
    throw new Error(`Teach repository load board failed: ${res.error.message}`);
  }
  const row = res.data as BoardRow | null;
  if (!row) throw new Error(`Board not found: ${boardId}`);
  const widgets = await fetchWidgetsByBoard(client, [boardId]);
  return rowToBoard(row, widgets.get(boardId) ?? []);
}

/** Assemble full boards (row + widgets) from board rows in one widget round-trip. */
async function hydrateBoards(
  client: ServerClient,
  rows: BoardRow[],
): Promise<Board[]> {
  if (rows.length === 0) return [];
  const widgets = await fetchWidgetsByBoard(
    client,
    rows.map((r) => r.id),
  );
  return rows.map((r) => rowToBoard(r, widgets.get(r.id) ?? []));
}

/** The owner's KEPT boards as raw rows (personal scope, this owner, NOT ephemeral,
 *  NOT a published Team-Library copy). This is exactly what the 50-cap counts and
 *  what "My Boards" lists, matching the mock's `myBoards` predicate. */
async function myBoardRows(
  client: ServerClient,
  ownerId: string,
): Promise<BoardRow[]> {
  const res = await client
    .from("boards")
    .select(BOARD_COLS)
    .eq("scope", "personal")
    .eq("owner_id", ownerId)
    .eq("ephemeral", false)
    .neq("library_visibility", "team");
  return unwrap(res, "list my boards") as BoardRow[];
}

/** Enforce the per-teacher cap BEFORE any create/duplicate/keep/pull. Throws
 *  `BoardCapError` when the owner is already at `MAX_BOARDS_PER_TEACHER`. Counts
 *  the SAME KEPT set the cap governs (personal, this owner, not ephemeral, not a
 *  published team copy) — matching the mock's `myBoards`/`assertUnderCap`. */
async function assertUnderCap(
  client: ServerClient,
  ownerId: string,
): Promise<void> {
  const res = await client
    .from("boards")
    .select("id", { count: "exact", head: true })
    .eq("scope", "personal")
    .eq("owner_id", ownerId)
    .eq("ephemeral", false)
    .neq("library_visibility", "team");
  if (res.error) {
    throw new Error(`Teach repository cap check failed: ${res.error.message}`);
  }
  if ((res.count ?? 0) >= MAX_BOARDS_PER_TEACHER) {
    throw new BoardCapError();
  }
}

/** Compute the next `display_order_within_lesson` for a sibling set (same lesson
 *  + scope + owner), authoritatively from current rows (mirrors the mock). */
async function nextLessonOrder(
  client: ServerClient,
  masterLessonId: string | null,
  scope: "personal" | "team",
  ownerId: string | null,
): Promise<number> {
  let q = client
    .from("boards")
    .select("display_order_within_lesson")
    .eq("scope", scope);
  q =
    masterLessonId == null
      ? q.is("master_core_lesson_event_id", null)
      : q.eq("master_core_lesson_event_id", masterLessonId);
  q = ownerId == null ? q.is("owner_id", null) : q.eq("owner_id", ownerId);
  const res = await q;
  const rows = unwrap(res, "compute board order") as {
    display_order_within_lesson: number;
  }[];
  return rows.reduce(
    (max, r) => Math.max(max, r.display_order_within_lesson + 1),
    0,
  );
}

/** Compute the next `display_order_within_board` for a board's widgets. */
async function nextWidgetOrder(
  client: ServerClient,
  boardId: string,
): Promise<number> {
  const res = await client
    .from("widgets")
    .select("display_order_within_board")
    .eq("board_id", boardId);
  const rows = unwrap(res, "compute widget order") as {
    display_order_within_board: number;
  }[];
  return rows.reduce(
    (max, r) => Math.max(max, r.display_order_within_board + 1),
    0,
  );
}

/** Pick the first candidate title not already in `taken`. `candidate(n)` yields
 *  the nth form (n starts at 1): the default sequence is the bare title, then
 *  "… (2)", "… (3)", … `taken` is matched verbatim (titles are stored verbatim
 *  in the unique indexes), so the search terminates at the first gap. Pure — no
 *  DB. */
function firstFreeTitle(
  taken: Set<string>,
  candidate: (n: number) => string,
): string {
  for (let n = 1; ; n += 1) {
    const title = candidate(n);
    if (!taken.has(title)) return title;
  }
}

/** Default candidate sequence: `desiredTitle`, then `desiredTitle (2)`, `(3)`, … */
function suffixSequence(desiredTitle: string): (n: number) => string {
  return (n) => (n === 1 ? desiredTitle : `${desiredTitle} (${n})`);
}

/** Copy candidate sequence: `base (copy)`, then `base (copy 2)`, `(copy 3)`, …
 *  Mirrors the convention the audit specifies for `duplicateBoard`. */
function copySequence(baseTitle: string): (n: number) => string {
  return (n) => (n === 1 ? `${baseTitle} (copy)` : `${baseTitle} (copy ${n})`);
}

/** Fetch the current PERSONAL board titles for `(masterLessonId, ownerId)` as a
 *  set. This is the exact key set `uniq_boards_personal_lesson_title`
 *  `(master_core_lesson_event_id, owner_id, title) WHERE scope='personal'`
 *  guards. Re-queried on EVERY caller invocation, so a loop that inserts several
 *  boards in sequence (e.g. `copySandboxBoardsToLesson`, whose default
 *  whiteboards are all titled "Whiteboard") sees the titles it inserted earlier
 *  in the same loop — the per-call re-query is what makes the in-loop case safe
 *  without the caller tracking state. */
async function personalTitleSet(
  client: ServerClient,
  masterLessonId: string,
  ownerId: string,
): Promise<Set<string>> {
  const res = await client
    .from("boards")
    .select("title")
    .eq("scope", "personal")
    .eq("master_core_lesson_event_id", masterLessonId)
    .eq("owner_id", ownerId);
  const rows = unwrap(res, "list personal titles for lesson") as {
    title: string;
  }[];
  return new Set(rows.map((r) => r.title));
}

/** Return a collision-free title for a PERSONAL, lesson-attached board, so an
 *  insert/update never violates `uniq_boards_personal_lesson_title`. The unique
 *  index only applies to lesson-attached personal boards
 *  (`master_core_lesson_event_id IS NOT NULL`), so a sandbox/lesson-less board
 *  (`masterLessonId == null`) or an owner-less row needs no suffixing and the
 *  desired title passes through unchanged.
 *
 *  `sequence` selects the candidate forms: the default appends " (2)", " (3)", …
 *  on collision; `duplicateBoard` passes `copySequence` for the
 *  "… (copy)", "… (copy 2)", … convention. */
async function uniquePersonalTitle(
  client: ServerClient,
  masterLessonId: string | null,
  ownerId: string | null,
  desiredTitle: string,
  sequence: (n: number) => string = suffixSequence(desiredTitle),
): Promise<string> {
  // No index applies off-lesson or without an owner → first candidate as-is.
  if (masterLessonId == null || ownerId == null) return sequence(1);
  const taken = await personalTitleSet(client, masterLessonId, ownerId);
  return firstFreeTitle(taken, sequence);
}

/** Team-scope twin of `uniquePersonalTitle`, guarding
 *  `uniq_boards_team_lesson_title` `(master_core_lesson_event_id, title) WHERE
 *  scope='team'`. Re-queries the lesson's current team titles each call. Off
 *  lesson the index does not apply, so the first candidate passes through. */
async function uniqueTeamTitle(
  client: ServerClient,
  masterLessonId: string | null,
  desiredTitle: string,
  sequence: (n: number) => string = suffixSequence(desiredTitle),
): Promise<string> {
  if (masterLessonId == null) return sequence(1);
  const res = await client
    .from("boards")
    .select("title")
    .eq("scope", "team")
    .eq("master_core_lesson_event_id", masterLessonId);
  const rows = unwrap(res, "list team titles for lesson") as {
    title: string;
  }[];
  return firstFreeTitle(new Set(rows.map((r) => r.title)), sequence);
}

/** Materialize a board's pages — the `pages` jsonb when present, else a single
 *  implicit page 0 built from the board's flat `widgets` (mirrors the mock's
 *  `pagesOf`). Never mutates the board. */
function pagesOf(board: Board): BoardPage[] {
  if (board.pages && board.pages.length > 0) return board.pages;
  return [{ id: `${board.id}-p0`, order: 0, widgets: board.widgets ?? [] }];
}

/** Persist a board's pages: write the authoritative `pages` jsonb AND sync the
 *  `widgets` table to page-0 (the mirror grid-era readers consume), mirroring the
 *  mock's `commitPages`. Pages are renumbered 0..n; page-0's widgets become the
 *  flat widget rows. The flat-table sync is full-replace (delete-then-insert) so
 *  removed widgets don't linger and ids/order stay authoritative. The board's
 *  `updated_at` is bumped. */
async function commitPages(
  client: ServerClient,
  boardId: string,
  pages: BoardPage[],
): Promise<void> {
  const sorted = pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({ ...p, order: i }));
  // PRIVACY (audit H3): strip names from EVERY widget's config/state across ALL
  // pages before the pages jsonb is persisted. commitPages is the chokepoint for
  // page writes that change the widget SET or its config/state (upsert/update/
  // delete widget, add/delete/reorder page, copyBoardContent), so centralizing the
  // strip here keeps the pages jsonb structure-only even if a source board (legacy
  // / imported / directly written) carried names — closing the gap where
  // `copyBoardContent` re-minted multi-page widgets but copied their config/state
  // verbatim. (persistWidgetPatch writes pages WITHOUT this path, but it patches
  // only canvas/appearance — never config/state — so it introduces no names.)
  // stripNames is recursive + idempotent, so paths that already stripped at their
  // boundary are unaffected.
  const cleanPages: BoardPage[] = sorted.map((p) => ({
    ...p,
    widgets: p.widgets.map((w) => ({
      ...w,
      config: stripNames(w.config ?? {}),
      state: stripNames(w.state ?? {}),
    })),
  }));
  const page0 = cleanPages[0]?.widgets ?? [];
  // The page-0 widget mirror rows. `widgetToRow` carries the widget's id (so the
  // flat row matches the pages jsonb) and re-strips config/state.
  const widgetRows = page0.map((w, i) => ({
    ...widgetToRow({ ...w, boardId }),
    display_order_within_board: i,
  }));
  // ATOMIC (audit M6): write the pages jsonb AND replace the page-0 widget mirror
  // in ONE transaction via the RPC, so a mid-sequence failure can no longer leave
  // the mirror stale/empty relative to the authoritative pages. SECURITY INVOKER —
  // the caller's RLS still gates the board update + widget writes (no privilege).
  const res = await client.rpc("teach_commit_board_pages", {
    p_board: boardId,
    p_pages: cleanPages,
    p_widgets: widgetRows,
  });
  if (res.error) {
    throw new Error(
      `Teach repository commit pages failed: ${res.error.message}`,
    );
  }
}

/** Locate the board that owns a widget across ALL its pages. Page-0 widgets live
 *  in the `widgets` table (fast path); widgets on other pages live only in the
 *  owning board's `pages` jsonb, so a table miss falls back to scanning loaded
 *  boards' pages. Returns the board id, owning page, and widget. Throws if not
 *  found / not visible under RLS (mirrors the mock's `findWidget`). */
async function findWidget(
  client: ServerClient,
  widgetId: string,
): Promise<{ board: Board; page: BoardPage; widget: Widget }> {
  // Fast path: a page-0 / flat widget is in the `widgets` table.
  const probe = await client
    .from("widgets")
    .select("board_id")
    .eq("id", widgetId)
    .maybeSingle();
  if (probe.error) {
    throw new Error(
      `Teach repository widget lookup failed: ${probe.error.message}`,
    );
  }
  const probeRow = probe.data as { board_id: string } | null;
  if (probeRow) {
    const board = await loadBoard(client, probeRow.board_id);
    for (const page of pagesOf(board)) {
      const widget = page.widgets.find((w) => w.id === widgetId);
      if (widget) return { board, page, widget };
    }
  }
  // Fallback: the widget lives on a NON-page-0 page, so it exists only in the
  // owning board's `pages` jsonb (the `widgets` table mirrors page-0 only). We
  // scan the multi-page boards visible to the caller (RLS already bounds this to
  // the caller's personal boards + readable team boards) and confirm the widget
  // in memory. Multi-page boards are the only ones with non-page-0 widgets, so
  // the filter `pages != null` keeps the scan tight.
  const scan = await client
    .from("boards")
    .select(BOARD_COLS)
    .not("pages", "is", null);
  if (scan.error) {
    throw new Error(
      `Teach repository widget page-scan failed: ${scan.error.message}`,
    );
  }
  const rows = (scan.data as BoardRow[]) ?? [];
  for (const row of rows) {
    const widgetRows = await fetchWidgetsByBoard(client, [row.id]);
    const board = rowToBoard(row, widgetRows.get(row.id) ?? []);
    for (const page of pagesOf(board)) {
      const widget = page.widgets.find((w) => w.id === widgetId);
      if (widget) return { board, page, widget };
    }
  }
  throw new Error(`Widget not found: ${widgetId}`);
}

/** Clamp a free-form canvas width to the handoff's 230–640 range. A non-finite
 *  input (NaN/±Infinity — e.g. a bad resize delta) would survive `Math.round`
 *  and `Math.min`/`Math.max` as NaN and poison the persisted `canvas.w`, so fall
 *  back to a sane default width (320) when the input is not finite. */
function clampWidth(w: number): number {
  return Number.isFinite(w) ? Math.min(640, Math.max(230, Math.round(w))) : 320;
}

// Pure helpers exported for unit testing only (regression-protect the
// title-collision + width-clamp logic that guards the unique indexes and the
// persisted canvas). Usage stays module-internal; this export is testability.
export { clampWidth, firstFreeTitle, suffixSequence, copySequence, stripNames };

// ── Id bridge (mock slugs ↔ db uuids) ─────────────────────────────────────────
// The Teach board rows key on UUID columns (`master_core_lesson_event_id` is a
// FK to the planner's core_lesson_events.id; `owner_id`/`grade_level_id` are
// RLS-gated uuids). The CLIENT (TeachWorkspace) now passes the REAL auth uid +
// the resolved grade/lesson uuids under the flag, so the common path arrives as
// uuids and these resolvers are pass-throughs.
//
// Audit finding #18 backstop: a fixture SLUG (e.g. the default lesson `m-12-0`)
// must NEVER land verbatim in a uuid column — it would silently miss every row
// (RLS-invisible) and corrupt the FK. So when a non-uuid slips through we map it
// through the SAME deterministic `slugToUuid` bridge the planner importer uses,
// so a slug resolves to the exact uuid the planner assigned that lesson (a Teach
// board then joins the right planner lesson). Owner ids have no importer-side
// slug→uuid mapping, so a non-uuid owner is a genuine bug we surface loudly
// rather than write garbage into the RLS column.

/** RFC-4122 uuid shape guard (any version). Mirrors the planner's UUID_RE. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Assert a value is a bare UUID before it is interpolated into a PostgREST
 *  filter string (e.g. `.or(...)`), so a crafted id can't inject filter syntax
 *  (commas / parens / `.eq.`). RLS still scopes every row, but this keeps the
 *  query well-formed + the predicate exactly as intended. */
function assertUuid(value: string, label: string): string {
  if (!isUuid(value)) {
    throw new Error(`${label} must be a UUID (got an unexpected value)`);
  }
  return value;
}

function resolveLessonId(lessonId: string): string {
  // Already a uuid (the live planner path) → use as-is. A fixture slug →
  // deterministic uuid matching the planner importer (lesson sub-namespace).
  return isUuid(lessonId) ? lessonId : slugToUuid("lesson", lessonId);
}
function resolveOwnerId(ownerId: string): string {
  if (isUuid(ownerId)) return ownerId;
  // A non-uuid owner means a fixture slug (e.g. `ME.id`) leaked past the client
  // guard into an RLS-gated uuid column. There is no importer mapping for owner
  // slugs, so fail loudly instead of corrupting the column / silently writing
  // rows the teacher can never read back.
  throw new Error(
    `Teach repository owner id must be the authenticated auth.uid() (a uuid), got a non-uuid value. A fixture slug must not reach an RLS-gated column.`,
  );
}
function resolveGradeId(gradeLevelId: string): string {
  if (isUuid(gradeLevelId)) return gradeLevelId;
  // Like the owner id, a grade slug (`g5`, the mock `MOCK_GRADE_LEVEL_ID`) has
  // no importer-side uuid mapping — the planner stores real grade uuids. Writing
  // the slug into `boards.grade_level_id` (a uuid column) would create rows that
  // join no real grade and are invisible to RLS. The client resolves the real
  // grade uuid before any create, so a non-uuid here is a bug we surface loudly.
  throw new Error(
    `Teach repository grade id must be a grade uuid, got a non-uuid value ("${gradeLevelId}"). Resolve the real grade uuid before creating a board.`,
  );
}

/** Resolve a lesson's real grade uuid via the `teach_grade_for_lesson` RPC. Grade
 *  does NOT live on the master event row — it lives on the lesson's UNIT, and the
 *  RPC walks lesson→unit→grade (the same path RLS uses). Reading the (nonexistent)
 *  `master_core_lesson_events.grade_level_id` column directly would error under
 *  Supabase, so every caller (createBoard / createBlankBoard / seedDefaultTeamSet)
 *  routes the lesson→grade resolution through this helper. Used both when seeding
 *  the default team set (no caller-supplied grade available) AND to DERIVE the
 *  grade for any lesson-attached board, so the new grade-integrity trigger
 *  (trg_boards_lesson_grade) can never reject a mismatched (lesson, grade) pair. */
async function gradeIdForLesson(
  client: ServerClient,
  lessonUuid: string,
): Promise<string> {
  const res = await client.rpc("teach_grade_for_lesson", {
    p_lesson: lessonUuid,
  });
  if (res.error) {
    throw new Error(
      `Teach repository lesson grade lookup failed: ${res.error.message}`,
    );
  }
  // The RPC returns the grade uuid as a scalar (null when the lesson has no
  // resolvable unit→grade chain). An empty string is treated the same as null.
  const grade = res.data as string | null;
  if (!grade) {
    throw new Error(
      `Teach repository cannot resolve grade: lesson ${lessonUuid} has no resolvable grade.`,
    );
  }
  return grade;
}

// ── Implementation ────────────────────────────────────────────────────────────

export const supabaseTeachSource: TeachDataSource = {
  // ── Boards ────────────────────────────────────────────────────────────────
  async listBoardsForLesson(masterLessonId, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);

    // SANDBOX SENTINEL (audit F4). The UI uses the opaque key
    // SANDBOX_LESSON_ID ("sandbox") as the repo key for the teacher's
    // lesson-LESS ephemeral scratch boards. Under Supabase it is NOT a real
    // lesson — `resolveLessonId` would map it to a fake uuid that matches no
    // master event, so the lesson→grade lookup (gradeIdForLesson) and the
    // grade-integrity trigger would throw on any sandbox create/load. So we map
    // the sentinel to the owner's lesson-less ephemeral PERSONAL boards
    // (scope='personal', owner_id=owner, master_core_lesson_event_id IS NULL,
    // ephemeral=true). NEVER seed a default team set here — the sandbox is the
    // teacher's private scratch surface, not a lesson with a team fallback.
    if (masterLessonId === SANDBOX_LESSON_ID) {
      const res = await client
        .from("boards")
        .select(BOARD_COLS)
        .eq("scope", "personal")
        .eq("owner_id", owner)
        .is("master_core_lesson_event_id", null)
        .eq("ephemeral", true)
        .order("display_order_within_lesson", { ascending: true });
      const rows = unwrap(res, "list sandbox boards") as BoardRow[];
      return hydrateBoards(client, rows);
    }

    const lesson = resolveLessonId(masterLessonId);
    const all = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("master_core_lesson_event_id", lesson);
    const rows = unwrap(all, "list boards for lesson") as BoardRow[];

    // CREATION RULE (Wave 1, #10): a board exists ONLY on an explicit action.
    // Opening Teach on a lesson with no boards returns an EMPTY list (no lazy
    // `seedDefaultTeamSet`) so the workspace lands on the clean empty state.
    // The old auto-seed (and its check-then-act duplicate-set race) is gone;
    // boards are now created only via createBoard / createBlankBoard / the
    // Boards page. Mirrors the mock source's `setForLesson`.
    if (rows.length === 0) {
      return [];
    }

    const personal = rows.filter(
      (b) => b.scope === "personal" && b.owner_id === owner,
    );
    const chosen =
      personal.length > 0 ? personal : rows.filter((b) => b.scope === "team");
    chosen.sort(
      (a, b) => a.display_order_within_lesson - b.display_order_within_lesson,
    );
    return hydrateBoards(client, chosen);
  },

  async createBoard(input) {
    const client = await sb();
    // SANDBOX SENTINEL (audit F4). `createBoard({ masterLessonId: "sandbox" })`
    // creates a lesson-LESS ephemeral scratch board, NOT a board on a real
    // lesson. Treat the sentinel like `masterLessonId == null` for the lesson
    // link (so the grade comes from the caller-supplied uuid via resolveGradeId,
    // never from a fake-uuid lesson lookup that would throw), force the board
    // ephemeral on the insert (sandbox scratch is uncapped + disposable), and
    // SKIP assertUnderCap (an ephemeral scratch board never counts toward the
    // cap — mirrors createBlankBoard's ephemeral path / the mock's sandbox).
    const isSandbox = input.masterLessonId === SANDBOX_LESSON_ID;
    // A new PERSONAL board counts toward the owner's cap; team boards are
    // uncapped, and an ephemeral SANDBOX board is uncapped too.
    if (input.scope === "personal" && input.ownerId != null && !isSandbox) {
      await assertUnderCap(client, resolveOwnerId(input.ownerId));
    }
    const lesson =
      input.masterLessonId == null || isSandbox
        ? null
        : resolveLessonId(input.masterLessonId);
    const owner = input.ownerId == null ? null : resolveOwnerId(input.ownerId);
    const nextOrder = await nextLessonOrder(client, lesson, input.scope, owner);
    // Re-index a default "Board N" title to the authoritative next slot so two
    // stale creates don't collide on a tab label; a custom title is untouched.
    const baseTitle = /^Board \d+$/.test(input.title)
      ? `Board ${nextOrder + 1}`
      : input.title;
    // Guarantee a collision-free title against the per-lesson unique index for
    // this scope (`uniq_boards_personal_lesson_title` /
    // `uniq_boards_team_lesson_title`). This fixes the `copySandboxBoardsToLesson`
    // loop, which deletes the old personal set then re-inserts the sandbox board
    // titles VERBATIM — and the default sandbox whiteboards are all titled
    // "Whiteboard", so the 2nd insert would otherwise collide. The helpers
    // re-query each call, so titles inserted earlier in that same loop are
    // accounted for. Off-lesson boards (`lesson == null`) need no suffix.
    const title =
      input.scope === "personal"
        ? await uniquePersonalTitle(client, lesson, owner, baseTitle)
        : await uniqueTeamTitle(client, lesson, baseTitle);

    // Grade MUST be derived from the lesson when one is attached — the new
    // grade-integrity trigger (trg_boards_lesson_grade) rejects any board whose
    // stamped grade differs from its lesson's grade, regardless of what the
    // caller supplied. Only a lesson-LESS board (sandbox/library copy) falls back
    // to the caller-supplied grade (validated as a uuid by resolveGradeId).
    const gradeLevelId =
      lesson != null
        ? await gradeIdForLesson(client, lesson)
        : resolveGradeId(input.gradeLevelId);

    const insert = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lesson,
        owner_id: owner,
        scope: input.scope,
        title,
        display_order_within_lesson: nextOrder,
        template_id: input.templateId ?? null,
        grade_level_id: gradeLevelId,
        // A SANDBOX board is created EPHEMERAL (uncapped scratch); a normal board
        // leaves `ephemeral` to its DB default (false). The other 5.31
        // cosmetic/structural columns are left to their DB defaults
        // (`whiteboard` → false, `library_visibility` → 'private', the jsonb
        // fields → null) — exactly as the mock's `createBoard` leaves them. A
        // teacher applies a theme/tags/repeat via the dedicated setter methods
        // after creation (setBoardTheme / setBoardTags / setBoardRepeat), which
        // is the mock-parity write path. (Reference parity.)
        ...(isSandbox ? { ephemeral: true } : {}),
      })
      .select(BOARD_COLS)
      .single();
    const boardRow = unwrap(insert, "create board") as BoardRow;

    // Insert any seed widgets, re-linking each to the freshly-issued board id.
    const seedWidgets = input.widgets ?? [];
    if (seedWidgets.length > 0) {
      // Reuse the shared copy primitive so the DB mints fresh widget ids and the
      // order is re-derived (same as duplicate/publish/pull/push paths).
      await copyWidgetsOnto(client, seedWidgets, boardRow.id);
    }
    return loadBoard(client, boardRow.id);
  },

  async updateBoard(boardId, patch) {
    const client = await sb();
    // SECURITY — STRUCTURAL-FIELD WHITELIST (audit F1). updateBoard is reachable
    // via the generic `teachDispatch` `'use server'` endpoint with a
    // client-controlled patch (the typed args are ERASED at runtime). boardPatchToRow
    // maps structural columns (scope, ownerId, gradeLevelId, masterLessonId,
    // templateId, whiteboard, ephemeral, libraryVisibility, publishedBy,
    // sourceBoardId) that RLS does NOT fully gate — e.g. a client could flip a
    // personal board to scope='team' (inject into the shared set), set
    // library_visibility='team' (publish, bypassing the ownership check in
    // publishBoardToTeamLibrary), or spoof published_by. So updateBoard accepts ONLY
    // user-editable cosmetic/organizational fields; every structural change goes
    // through a dedicated guarded method (pushBoardsToTeam / publishBoardToTeamLibrary
    // / copyTeamBoardToMine / keepBoard / reorderBoards). Non-whitelisted keys are
    // dropped (mass-assignment defense).
    const safePatch: Partial<Omit<Board, "id" | "widgets">> = {};
    if (patch.title !== undefined) safePatch.title = patch.title;
    if (patch.displayOrderWithinLesson !== undefined)
      safePatch.displayOrderWithinLesson = patch.displayOrderWithinLesson;
    if (patch.background !== undefined) safePatch.background = patch.background;
    // Board.size persistence lands with Wave 5 Supabase parity (no `size`
    // column / BOARD_COLS mapping yet — mock is the live path today).
    if (patch.tags !== undefined) safePatch.tags = patch.tags;
    if (patch.boardTheme !== undefined) safePatch.boardTheme = patch.boardTheme;
    if (patch.repeat !== undefined) safePatch.repeat = patch.repeat;
    const row = boardPatchToRow(safePatch);
    // TITLE DE-DUP ON RENAME (audit Finding 8): a raw title write bypasses the
    // per-lesson unique-title indexes (`uniq_boards_personal_lesson_title` /
    // `uniq_boards_team_lesson_title`), so a rename that collides with a sibling
    // would throw. When the patch changes the title AND the board is
    // lesson-attached (the only case the indexes guard), resolve a collision-free
    // title against the board's siblings EXCLUDING itself (`.neq("id", boardId)`),
    // then override the row's title. Excluding the board's own row also makes a
    // no-op/near-self rename safe (renaming "Warm-Up" → "Warm-Up" stays as-is
    // instead of bumping to "Warm-Up (2)"). `boardPatchToRow` stays pure — the
    // de-dup lives here. The mock has no unique index so it renames freely; this
    // is the Supabase-only guard that preserves that behaviour without erroring.
    if (safePatch.title !== undefined) {
      const board = await loadBoard(client, boardId);
      if (board.masterLessonId != null) {
        const lesson = resolveLessonId(board.masterLessonId);
        // Mirror personalTitleSet / uniqueTeamTitle, but exclude this board's own
        // row so it never collides with itself. Personal adds the owner filter.
        let q = client
          .from("boards")
          .select("title")
          .eq("scope", board.scope)
          .eq("master_core_lesson_event_id", lesson)
          .neq("id", boardId);
        if (board.scope === "personal") {
          q =
            board.ownerId == null
              ? q.is("owner_id", null)
              : q.eq("owner_id", board.ownerId);
        }
        const sib = await q;
        const rows = unwrap(sib, "list sibling titles for rename") as {
          title: string;
        }[];
        const taken = new Set(rows.map((r) => r.title));
        row.title = firstFreeTitle(taken, suffixSequence(safePatch.title));
      }
    }
    if (Object.keys(row).length > 0) {
      const res = await client.from("boards").update(row).eq("id", boardId);
      if (res.error) {
        throw new Error(
          `Teach repository update board failed: ${res.error.message}`,
        );
      }
    }
    return loadBoard(client, boardId);
  },

  async deleteBoard(boardId) {
    const client = await sb();
    // Widgets cascade via the FK `on delete cascade`, so deleting the board row
    // removes its widgets too.
    const res = await client.from("boards").delete().eq("id", boardId);
    if (res.error) {
      throw new Error(
        `Teach repository delete board failed: ${res.error.message}`,
      );
    }
  },

  async reorderBoards(masterLessonId, ownerId, orderedBoardIds) {
    const client = await sb();
    // Write each id's new order. Done sequentially so a single failure surfaces
    // the offending id rather than a partial-batch ambiguity.
    for (let order = 0; order < orderedBoardIds.length; order += 1) {
      const id = orderedBoardIds[order];
      const res = await client
        .from("boards")
        .update({ display_order_within_lesson: order })
        .eq("id", id);
      if (res.error) {
        throw new Error(
          `Teach repository reorder boards failed at ${id}: ${res.error.message}`,
        );
      }
    }
    return this.listBoardsForLesson(masterLessonId, ownerId);
  },

  // ── Widgets ─────────────────────────────────────────────────────────────
  async upsertWidget(widget) {
    const client = await sb();
    // PAGE-AWARE — but ONLY when the board already has an explicit `pages` jsonb
    // (audit F3). `rowToBoard` treats the `pages` jsonb as authoritative and
    // IGNORES the flat `widgets` table on read for such a board, so a widget
    // written ONLY to the flat table (the Resources-panel "open in board" /
    // drag-to-cell embed path) would be invisible on read AND wiped by the next
    // commitPages. So on a multi-page board the embed must land in the page
    // model: upsert into page-0 (replace by id, else append) and persist via
    // commitPages (which keeps the page-0 table mirror in sync). A FLAT
    // (single-page) board keeps the direct widgets-table write UNCHANGED —
    // routing it through commitPages would materialize a `pages` jsonb for it,
    // after which reads switch to the jsonb and this same flat path goes
    // invisible (audit H1). The mock's upsertWidget operates on board.widgets,
    // which is aliased to pages[0] — so this gating is mock parity.
    const board = await loadBoard(client, widget.boardId);
    if (board.pages && board.pages.length > 0) {
      // Build the widget to store, stripping names from config/state before it
      // enters the persisted page set (privacy invariant — see commitPages).
      const next: Widget = {
        ...widget,
        boardId: board.id,
        position: { ...widget.position },
        canvas: widget.canvas ? { ...widget.canvas } : undefined,
        appearance: widget.appearance ? { ...widget.appearance } : undefined,
        config: stripNames(widget.config ?? {}),
        state: stripNames(widget.state ?? {}),
      };
      const pages = pagesOf(board).map((p) => ({
        ...p,
        widgets: p.widgets.slice(),
      }));
      const page0 = pages[0];
      const idx = page0.widgets.findIndex((w) => w.id === widget.id);
      if (idx >= 0) {
        // Replace in place — keep the widget's existing display order.
        page0.widgets[idx] = next;
      } else {
        // Append with displayOrder authoritatively derived from page-0's current
        // widgets, so two near-simultaneous embeds can't collide on the order.
        next.displayOrder = page0.widgets.reduce(
          (max, w) => Math.max(max, w.displayOrder + 1),
          0,
        );
        page0.widgets.push(next);
      }
      await commitPages(client, board.id, pages);
      // Reload so the returned widget matches the persisted row (commitPages
      // re-stamps grade + ensures a canvas on read).
      const reloaded = await loadBoard(client, board.id);
      for (const page of pagesOf(reloaded)) {
        const w = page.widgets.find((x) => x.id === widget.id);
        if (w) return w;
      }
      // Should be unreachable — we just wrote this widget into page-0.
      throw new Error(`Widget not found after upsert: ${widget.id}`);
    }
    // FLAT board: keep the direct widgets-table write UNCHANGED. Determine insert
    // vs. replace by probing for an existing row id.
    const existing = await client
      .from("widgets")
      .select("id")
      .eq("id", widget.id)
      .maybeSingle();
    if (existing.error) {
      throw new Error(
        `Teach repository upsert widget probe failed: ${existing.error.message}`,
      );
    }
    const row = widgetToRow(widget);
    if (existing.data) {
      const res = await client
        .from("widgets")
        .update(row)
        .eq("id", widget.id)
        .select(WIDGET_COLS)
        .single();
      const updated = unwrap(res, "upsert widget (update)") as WidgetRow;
      return rowToWidget(updated);
    }
    // INSERT: derive displayOrder authoritatively from the board's current
    // widgets so two near-simultaneous embeds can't collide.
    const order = await nextWidgetOrder(client, widget.boardId);
    const res = await client
      .from("widgets")
      .insert({ ...row, display_order_within_board: order })
      .select(WIDGET_COLS)
      .single();
    const inserted = unwrap(res, "upsert widget (insert)") as WidgetRow;
    return rowToWidget(inserted);
  },

  async updateWidget(widgetId, patch) {
    const client = await sb();
    // PAGE-AWARE — but ONLY when the board already has an explicit `pages` jsonb.
    // A board with pages treats the jsonb as authoritative and IGNORES the flat
    // `widgets` table on read (see `rowToBoard`), so an edit there must go through
    // the page model (Finding 4). A FLAT (single-page) board must NOT be pushed
    // through `commitPages`: that would persist a `pages` jsonb for it, after which
    // reads switch to the jsonb and the still-flat `upsertWidget` embed path (the
    // Resources-panel "open in board" / drag-to-cell) goes invisible and is wiped
    // by the next commitPages (audit H1). The mock keeps page-0 in sync via array
    // aliasing and never materializes pages for a single-page board, so a flat
    // board here takes the direct widgets-table write (mock parity).
    const hit = await findWidget(client, widgetId);
    if (hit.board.pages && hit.board.pages.length > 0) {
      // Build the updated domain Widget from ONLY the present patch fields.
      // config/state are name-stripped before entering the persisted page set
      // (privacy invariant — see the induction comment in commitPages / the mock).
      const updated: Widget = {
        ...hit.widget,
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.position !== undefined
          ? { position: { ...patch.position } }
          : {}),
        ...(patch.canvas !== undefined
          ? { canvas: patch.canvas ? { ...patch.canvas } : undefined }
          : {}),
        ...(patch.appearance !== undefined
          ? {
              appearance: patch.appearance
                ? { ...patch.appearance }
                : undefined,
            }
          : {}),
        ...(patch.displayOrder !== undefined
          ? { displayOrder: patch.displayOrder }
          : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.config !== undefined
          ? { config: stripNames(patch.config ?? {}) }
          : {}),
        ...(patch.state !== undefined
          ? { state: stripNames(patch.state ?? {}) }
          : {}),
        ...(patch.persistence !== undefined
          ? { persistence: patch.persistence }
          : {}),
      };
      const updatedPages = pagesOf(hit.board).map((p) =>
        p.id === hit.page.id
          ? {
              ...p,
              widgets: p.widgets.map((w) => (w.id === widgetId ? updated : w)),
            }
          : p,
      );
      await commitPages(client, hit.board.id, updatedPages);
      // Reload so the returned widget matches the persisted row (commitPages
      // re-stamps grade + ensures a canvas on read).
      const reloaded = await loadBoard(client, hit.board.id);
      for (const page of pagesOf(reloaded)) {
        const w = page.widgets.find((x) => x.id === widgetId);
        if (w) return w;
      }
      // Should be unreachable — we just wrote this widget back.
      throw new Error(`Widget not found after update: ${widgetId}`);
    }
    // Flat board: update the widget-table row directly (widgetPatchToRow applies
    // the privacy stripNames on config/state). No `pages` jsonb is written, so the
    // board stays single-page and the flat embed path stays consistent.
    const row = widgetPatchToRow(patch);
    if (Object.keys(row).length > 0) {
      const upd = await client.from("widgets").update(row).eq("id", widgetId);
      if (upd.error) {
        throw new Error(
          `Teach repository update widget failed: ${upd.error.message}`,
        );
      }
    }
    const res = await client
      .from("widgets")
      .select(WIDGET_COLS)
      .eq("id", widgetId)
      .maybeSingle();
    if (res.error) {
      throw new Error(
        `Teach repository reload widget failed: ${res.error.message}`,
      );
    }
    const widgetRow = res.data as WidgetRow | null;
    if (!widgetRow) throw new Error(`Widget not found: ${widgetId}`);
    return rowToWidget(widgetRow);
  },

  async deleteWidget(widgetId) {
    const client = await sb();
    // Idempotent (mock parity): a missing widget is a silent no-op, not an error
    // (delete should be safe to retry / double-fire). findWidget throws
    // "Widget not found" when the widget is gone — swallow exactly that, rethrow
    // anything else (a real query failure).
    let hit: Awaited<ReturnType<typeof findWidget>>;
    try {
      hit = await findWidget(client, widgetId);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Widget not found"))
        return;
      throw e;
    }
    // PAGE-AWARE only when the board already has explicit pages (Finding 4): drop
    // the widget from its owning page via commitPages (so a non-page-0 widget in
    // the authoritative jsonb is actually removed). A FLAT board takes the direct
    // table delete — routing it through commitPages would materialize a `pages`
    // jsonb and desync the flat `upsertWidget` embed path (audit H1).
    if (hit.board.pages && hit.board.pages.length > 0) {
      const prunedPages = pagesOf(hit.board).map((p) =>
        p.id === hit.page.id
          ? { ...p, widgets: p.widgets.filter((w) => w.id !== widgetId) }
          : p,
      );
      await commitPages(client, hit.board.id, prunedPages);
      return;
    }
    const del = await client.from("widgets").delete().eq("id", widgetId);
    if (del.error) {
      throw new Error(
        `Teach repository delete widget failed: ${del.error.message}`,
      );
    }
  },

  // ── Templates ─────────────────────────────────────────────────────────────
  async listBoardTemplates(ownerId) {
    const client = await sb();
    // Validate as a UUID before interpolating into the PostgREST `.or()` filter
    // (defense-in-depth against filter injection; RLS already scopes rows). The
    // owner resolver throws on a non-uuid, and assertUuid is a second guard at
    // the exact interpolation site.
    const owner = assertUuid(resolveOwnerId(ownerId), "ownerId");
    // RLS already limits rows to (personal owner-only) ∪ (team in readable
    // grade); the explicit filter narrows personal rows to this owner.
    const res = await client
      .from("board_templates")
      .select(TEMPLATE_COLS)
      .or(`scope.eq.team,owner_id.eq.${owner}`);
    const rows = unwrap(res, "list board templates") as BoardTemplateRow[];
    return rows.map(rowToTemplate);
  },

  async saveBoardAsTemplate(boardId, title, scope, ownerId) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    // Strip boardId from a widget — a template is board-agnostic — and strip
    // name-bearing config/state defensively (privacy).
    const snapWidget = (w: Widget): Omit<Widget, "boardId"> => ({
      id: w.id,
      type: w.type,
      title: w.title,
      position: { ...w.position },
      canvas: w.canvas ? { ...w.canvas } : undefined,
      appearance: w.appearance ? { ...w.appearance } : undefined,
      displayOrder: w.displayOrder,
      pinned: w.pinned,
      config: stripNames(w.config ?? {}),
      state: stripNames(w.state ?? {}),
      persistence: w.persistence,
      gradeLevelId: w.gradeLevelId,
    });
    // Snapshot the FULL page model so a multi-page board doesn't collapse to
    // page-0 on re-instantiation. The DB has no pages/background/size/theme
    // columns on board_templates (Wave-5 migration), so we pack everything into
    // the existing flexible `widgets` jsonb as a TemplateEnvelope; rowToTemplate
    // unpacks it (and still reads a legacy bare Widget[] for old rows).
    const pages: BoardPage[] = pagesOf(board).map((p) => ({
      id: p.id,
      order: p.order,
      title: p.title,
      background: p.background,
      widgets: p.widgets.map((w) => snapWidget(w) as Widget),
    }));
    const envelope: TemplateEnvelope = {
      widgets: (pages[0]?.widgets ?? []).map((w) => snapWidget(w as Widget)),
      pages,
      background: board.background ?? null,
      size: board.size,
      boardTheme: board.boardTheme ? { ...board.boardTheme } : undefined,
    };
    const res = await client
      .from("board_templates")
      .insert({
        title,
        scope,
        owner_id: scope === "team" ? null : resolveOwnerId(ownerId),
        widgets: envelope,
        grade_level_id: board.gradeLevelId,
      })
      .select(TEMPLATE_COLS)
      .single();
    const row = unwrap(res, "save board as template") as BoardTemplateRow;
    return rowToTemplate(row);
  },

  // ── Push to team (plan §13.1 displacement) ────────────────────────────────
  async pushBoardsToTeam(masterLessonId, boardIds) {
    const client = await sb();
    // Pushing an EMPTY selection must never wipe the lesson's existing team set
    // (the RPC's first act is to delete it). Nothing to displace → return early.
    // (The BoardsModule caller already guards this; this is the repo-side guard.
    // The RPC ALSO rejects an empty p_boards before any delete, so this is the
    // belt to the RPC's suspenders.)
    if (boardIds.length === 0) return [];
    const lesson = resolveLessonId(masterLessonId);
    // ATOMIC DISPLACEMENT (audit Finding 5). The §13.1 push DELETES the lesson's
    // existing team set then re-inserts the pushed boards as the new team set.
    // The old impl ran this as a delete followed by a per-board insert loop —
    // a failure AFTER the delete left the team with NO boards (data loss). We now
    // do the whole displacement through the `teach_replace_lesson_set` RPC, whose
    // plpgsql body is ONE transaction (validate → delete + bulk board insert +
    // bulk page-0 widget mirror insert), so a partial failure rolls everything
    // back. The RPC is SECURITY INVOKER: the caller's RLS still gates every row
    // (it only adds atomicity, never privilege), it VALIDATES the payload before
    // the delete (non-empty boards; every board targets (p_lesson, 'team', null);
    // every widget's board is in the set), and the boards insert fires
    // trg_boards_lesson_grade, so a mis-stamped grade rolls the whole thing back.
    //
    // The app prepares the FULL payloads here (all id-minting + name-stripping +
    // page/widget mapping stays in TS, where it is unit-tested); the RPC is the
    // atomic writer. `buildLessonSetPayloads` replicates `copyBoardContent`'s
    // id-minting in memory instead of issuing per-board DB calls.
    const sources: Board[] = [];
    for (const id of boardIds) sources.push(await loadBoard(client, id));

    // VALIDATE SOURCES (audit F6). Only the caller's OWN personal boards may be
    // pushed into the team set — never a team board, a library copy, or a board
    // from a DIFFERENT lesson. RLS guarantees a readable personal board is the
    // caller's (the personal-board policy is owner-scoped), so `scope ===
    // 'personal'` implies ownership; we still assert the lesson binding so a
    // board belonging to a different lesson can't be smuggled into THIS lesson's
    // team set. Throw a clear error if any source fails the check.
    for (const source of sources) {
      // Compare against the RESOLVED lesson uuid (`lesson`), NOT the raw caller
      // value (`masterLessonId`): when the planner is still mock while Teach runs
      // on Supabase, the caller passes a slug (e.g. "m-12-0") but the loaded boards
      // carry the resolved uuid — comparing the raw value would reject every valid
      // push (audit H2).
      if (source.scope !== "personal" || source.masterLessonId !== lesson) {
        throw new Error(
          "pushBoardsToTeam: every source must be one of your personal boards for this lesson",
        );
      }
    }

    // PRE-VALIDATE TITLES (audit Finding 4 — kept). The new team set must not
    // collide on `uniq_boards_team_lesson_title`. The RPC's delete wipes the whole
    // prior team set for this lesson in the same transaction, so the only
    // collisions that can remain are among the pushed boards themselves (e.g. two
    // default whiteboards both titled "Whiteboard"); resolving them in-memory
    // against an accumulating `taken` set with the team suffix sequence (" (2)",
    // " (3)", …) is exact + needs no DB read of the about-to-be-deleted rows.
    const takenTitles = new Set<string>();
    const resolvedTitles = sources.map((source) => {
      const title = firstFreeTitle(takenTitles, suffixSequence(source.title));
      takenTitles.add(title);
      return title;
    });

    // CRITICAL (the brief): stamp grade_level_id from the TARGET lesson (uniform
    // for ALL boards) so trg_boards_lesson_grade always passes — even if a source
    // board carried a different grade. Derived ONCE from the target lesson.
    const grade = await gradeIdForLesson(client, lesson);
    const { boards: boardPayloads, widgets: widgetPayloads } =
      buildLessonSetPayloads(
        sources,
        lesson,
        "team",
        null,
        grade,
        resolvedTitles,
      );

    // One atomic call: validate, delete the old team set, bulk-insert the new
    // boards and their page-0 widget mirror. A failure rolls the entire
    // transaction back, so the lesson never ends up with its team boards deleted
    // but not repopulated.
    const res = await client.rpc("teach_replace_lesson_set", {
      p_lesson: lesson,
      p_scope: "team",
      p_owner: null,
      p_boards: boardPayloads,
      p_widgets: widgetPayloads,
    });
    if (res.error) {
      throw new Error(
        `Teach repository push-to-team failed: ${res.error.message}`,
      );
    }

    // Reload + return the new team set in display order (same return shape as
    // before: the persisted Board[] for this lesson's team scope).
    const reload = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("master_core_lesson_event_id", lesson)
      .eq("scope", "team")
      .order("display_order_within_lesson", { ascending: true });
    const rows = unwrap(reload, "push-to-team (reload)") as BoardRow[];
    return hydrateBoards(client, rows);
  },

  async replacePersonalSetForLesson(masterLessonId, ownerId, sourceBoardIds) {
    // SANDBOX-PIN write path (audit F5). The personal twin of pushBoardsToTeam:
    // atomically replace the owner's PERSONAL set for the lesson with independent
    // FULL-PAGE copies of the sources. Empty selection → no-op (never wipe the
    // existing set — same guard pushBoardsToTeam carries; the RPC also rejects an
    // empty p_boards before any delete).
    if (sourceBoardIds.length === 0) return [];
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const lesson = resolveLessonId(masterLessonId);
    // De-dupe source ids — buildLessonSetPayloads mints a NEW board id per entry,
    // so a repeated id would create multiple copies of the same sandbox board
    // (audit H1). One copy per distinct source.
    const ids = [...new Set(sourceBoardIds)];
    const sources: Board[] = [];
    for (const id of ids) sources.push(await loadBoard(client, id));

    // SOURCE VALIDATION (audit M2): only the caller's OWN sandbox boards may be
    // pinned — lesson-less, ephemeral, personal, owned by the caller (exactly what
    // createBoard's sandbox branch produces). RLS already bounds loadBoard to the
    // caller's readable boards, but without this an explicit server-action call
    // could replace the lesson's personal set with copies of team / library /
    // other-lesson boards.
    for (const source of sources) {
      if (
        source.scope !== "personal" ||
        source.ownerId !== owner ||
        source.masterLessonId !== null ||
        source.ephemeral !== true
      ) {
        throw new Error(
          "replacePersonalSetForLesson: sources must be your own sandbox boards (lesson-less, ephemeral, personal)",
        );
      }
    }

    // CAP (audit H1): the pinned boards become KEPT (non-ephemeral) personal boards
    // that count toward MAX_BOARDS_PER_TEACHER (the sandbox sources are ephemeral =
    // uncapped, so this is the moment the cap must be enforced). The op REPLACES the
    // lesson's existing personal set, so the net kept count AFTER =
    // (current kept) − (this lesson's old kept set, which is deleted) + (new set).
    const keptCol = () =>
      client
        .from("boards")
        .select("id", { count: "exact", head: true })
        .eq("scope", "personal")
        .eq("owner_id", owner)
        .eq("ephemeral", false)
        .neq("library_visibility", "team");
    const [keptTotalRes, oldLessonRes] = await Promise.all([
      keptCol(),
      keptCol().eq("master_core_lesson_event_id", lesson),
    ]);
    if (keptTotalRes.error || oldLessonRes.error) {
      throw new Error(
        `Teach repository replace-personal-set (cap count) failed: ${
          (keptTotalRes.error ?? oldLessonRes.error)?.message
        }`,
      );
    }
    const keptAfter =
      (keptTotalRes.count ?? 0) - (oldLessonRes.count ?? 0) + sources.length;
    if (keptAfter > MAX_BOARDS_PER_TEACHER) {
      throw new BoardCapError();
    }

    // Resolve collision-free titles against `uniq_boards_personal_lesson_title`.
    // The RPC's delete clears this owner's prior personal set for the lesson in
    // the same transaction, so the only collisions left are among the sources
    // themselves (resolve them in-memory against an accumulating `taken` set).
    const takenTitles = new Set<string>();
    const resolvedTitles = sources.map((source) => {
      const title = firstFreeTitle(takenTitles, suffixSequence(source.title));
      takenTitles.add(title);
      return title;
    });

    // CRITICAL (the brief): stamp grade_level_id from the TARGET lesson (uniform
    // for ALL boards) so trg_boards_lesson_grade always passes.
    const grade = await gradeIdForLesson(client, lesson);
    const { boards: boardPayloads, widgets: widgetPayloads } =
      buildLessonSetPayloads(
        sources,
        lesson,
        "personal",
        owner,
        grade,
        resolvedTitles,
      );

    const res = await client.rpc("teach_replace_lesson_set", {
      p_lesson: lesson,
      p_scope: "personal",
      p_owner: owner,
      p_boards: boardPayloads,
      p_widgets: widgetPayloads,
    });
    if (res.error) {
      throw new Error(
        `Teach repository replace-personal-set failed: ${res.error.message}`,
      );
    }

    // Reload + return the owner's new personal set for the lesson in order.
    const reload = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("master_core_lesson_event_id", lesson)
      .eq("scope", "personal")
      .eq("owner_id", owner)
      .order("display_order_within_lesson", { ascending: true });
    const rows = unwrap(reload, "replace-personal-set (reload)") as BoardRow[];
    return hydrateBoards(client, rows);
  },

  // ── Boards Library ─────────────────────────────────────────────────────────
  async listMyBoards(ownerId) {
    const client = await sb();
    const rows = await myBoardRows(client, resolveOwnerId(ownerId));
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return hydrateBoards(client, rows);
  },

  async listTeamLibraryBoards(gradeLevelId) {
    const client = await sb();
    // The Team Library is exactly the published copies (library_visibility =
    // 'team') in this grade — NOT every per-lesson team set. Mirrors the mock's
    // `libraryVisibility === "team"` filter.
    const res = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("library_visibility", "team")
      .eq("grade_level_id", resolveGradeId(gradeLevelId));
    const rows = unwrap(res, "list team library boards") as BoardRow[];
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return hydrateBoards(client, rows);
  },

  async countMyBoards(ownerId) {
    const client = await sb();
    // Count the SAME kept set the 50-cap governs (personal, this owner, not
    // ephemeral, not a published team copy) — matching `myBoardRows` + the mock.
    const res = await client
      .from("boards")
      .select("id", { count: "exact", head: true })
      .eq("scope", "personal")
      .eq("owner_id", resolveOwnerId(ownerId))
      .eq("ephemeral", false)
      .neq("library_visibility", "team");
    if (res.error) {
      throw new Error(
        `Teach repository count my boards failed: ${res.error.message}`,
      );
    }
    return res.count ?? 0;
  },

  async duplicateBoard(boardId, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const source = await loadBoard(client, boardId);
    await assertUnderCap(client, owner);
    const nextOrder = await nextLessonOrder(
      client,
      source.masterLessonId,
      "personal",
      owner,
    );
    // Derive a collision-free copy title via the shared helper + the "… (copy)",
    // "… (copy 2)", … sequence, so duplicating a lesson-attached board twice
    // doesn't violate `uniq_boards_personal_lesson_title`. The helper re-queries
    // the lesson's current personal titles, so the 2nd duplicate sees the first
    // copy and lands on "… (copy 2)". Off-lesson (a library-pulled board with a
    // null masterLessonId) the index doesn't apply and the title passes through.
    const title = await uniquePersonalTitle(
      client,
      source.masterLessonId,
      owner,
      `${source.title} (copy)`,
      copySequence(source.title),
    );
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: source.masterLessonId,
        owner_id: owner,
        scope: "personal",
        title,
        display_order_within_lesson: nextOrder,
        template_id: source.templateId,
        grade_level_id: source.gradeLevelId,
        // Carry the 5.31 cosmetic + structural fields onto the copy.
        background: source.background ?? null,
        tags: source.tags ?? null,
        board_theme: source.boardTheme ?? null,
        repeat: source.repeat ?? null,
        // A duplicate is the teacher's OWN private board, never a team-library
        // copy, never ephemeral; it records its provenance (mock parity).
        whiteboard: source.whiteboard ?? false,
        ephemeral: false,
        library_visibility: "private",
        published_by: null,
        source_board_id: source.id,
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "duplicate board") as BoardRow;
    // Clone widgets (page-0 mirror) AND re-mirror multi-page structure onto the
    // copy so non-page-0 widgets survive the duplicate. On a copy failure the
    // just-created board row is rolled back so no empty board (or wasted cap
    // slot) is left behind (audit F8).
    await copyBoardContentOrRollback(client, source, newRow.id);
    return loadBoard(client, newRow.id);
  },

  async createBlankBoard(input) {
    const client = await sb();
    const owner = resolveOwnerId(input.ownerId);
    // SANDBOX SENTINEL (audit F4). Like createBoard, the "sandbox" key creates a
    // lesson-LESS ephemeral whiteboard — treat it like `masterLessonId == null`
    // so the grade comes from the caller-supplied uuid (never a fake-uuid lesson
    // lookup that would throw). It already inserts `ephemeral: true`.
    const lesson =
      input.masterLessonId == null || input.masterLessonId === SANDBOX_LESSON_ID
        ? null
        : resolveLessonId(input.masterLessonId);
    // A blank whiteboard starts EPHEMERAL: it does NOT count toward the cap until
    // `keepBoard` (so a capped teacher can still scratch on a throwaway). No
    // assertUnderCap here — the cap is enforced at keep (mock parity).
    const nextOrder = await nextLessonOrder(client, lesson, "personal", owner);
    // Same lesson-present→derive rule as createBoard: a lesson-attached whiteboard
    // must carry the lesson's grade (the trigger rejects a mismatch); a lesson-less
    // sandbox whiteboard falls back to the caller-supplied (uuid) grade.
    const gradeLevelId =
      lesson != null
        ? await gradeIdForLesson(client, lesson)
        : resolveGradeId(input.gradeLevelId);
    // TITLE DE-DUP (audit F9). When LESSON-ATTACHED, resolve a collision-free
    // title against `uniq_boards_personal_lesson_title` (the same helper
    // createBoard uses) so a second "Whiteboard" on the same lesson doesn't
    // violate the unique index. A lesson-LESS / sandbox whiteboard needs no
    // de-dup (the index only guards lesson-attached personal boards), so its
    // title passes through unchanged.
    const title =
      lesson != null
        ? await uniquePersonalTitle(
            client,
            lesson,
            owner,
            input.title ?? "Whiteboard",
          )
        : (input.title ?? "Whiteboard");
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lesson,
        owner_id: owner,
        scope: "personal",
        title,
        display_order_within_lesson: nextOrder,
        template_id: null,
        grade_level_id: gradeLevelId,
        background: null,
        tags: [],
        whiteboard: true,
        ephemeral: true,
        library_visibility: "private",
        published_by: null,
        source_board_id: null,
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "create blank board") as BoardRow;
    return loadBoard(client, newRow.id);
  },

  async keepBoard(boardId) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    // Already kept → idempotent (don't re-check the cap against itself).
    if (board.ephemeral !== true) return board;
    // Cap enforced HERE (the board is still ephemeral, so it isn't double-counted
    // by assertUnderCap), then flip ephemeral off — mirrors the mock.
    await assertUnderCap(client, resolveOwnerId(board.ownerId ?? ""));
    const upd = await client
      .from("boards")
      .update({ ephemeral: false, updated_at: new Date().toISOString() })
      .eq("id", boardId);
    if (upd.error) {
      throw new Error(
        `Teach repository keep board failed: ${upd.error.message}`,
      );
    }
    return loadBoard(client, boardId);
  },

  async setBoardTags(boardId: string, tags: BoardTag[]) {
    const client = await sb();
    // Persist the tag array to the `tags` jsonb column. Tags are display-only
    // structure (no names — see board-tags.ts), so no stripNames is needed.
    const upd = await client
      .from("boards")
      .update({
        tags: tags.map((t) => ({ ...t })),
        updated_at: new Date().toISOString(),
      })
      .eq("id", boardId);
    if (upd.error) {
      throw new Error(
        `Teach repository set board tags failed: ${upd.error.message}`,
      );
    }
    return loadBoard(client, boardId);
  },

  async listBoardsForContext(ctx, ownerId, gradeLevelId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const context = ctx as BoardContext;
    // Auto-surface candidates: the owner's KEPT personal boards + the published
    // Team-Library boards FOR THIS GRADE (audit Finding 9 — the team-library read
    // was previously grade-unscoped, so another grade's published boards could
    // auto-surface), run through the SAME `boardMatchesContext` predicate the mock
    // uses (tags now persist, so matching is live). Personal ephemeral boards are
    // excluded (mock parity). The personal query stays owner-scoped — a teacher's
    // own boards imply their grade, so no grade filter is needed (and not adding
    // one keeps a teacher's cross-grade personal boards reachable as today).
    const personal = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("scope", "personal")
      .eq("owner_id", owner)
      .eq("ephemeral", false);
    const teamLib = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("library_visibility", "team")
      .eq("grade_level_id", resolveGradeId(gradeLevelId));
    const personalRows = unwrap(
      personal,
      "context personal boards",
    ) as BoardRow[];
    const teamRows = unwrap(
      teamLib,
      "context team-library boards",
    ) as BoardRow[];
    // De-dup: a published team-library board could also be the owner's personal
    // board in the (unlikely) overlap — key by id.
    const byId = new Map<string, BoardRow>();
    for (const r of [...personalRows, ...teamRows]) byId.set(r.id, r);
    const boards = await hydrateBoards(client, [...byId.values()]);
    return boards.filter((b) => boardMatchesContext(b, context));
  },

  async publishBoardToTeamLibrary(boardId, ownerId) {
    const client = await sb();
    // Resolve THEN assert the caller-supplied owner is a bare uuid: it is used in
    // the ownership cross-check below + (defensively) compared to the source, so a
    // non-uuid is rejected up front (filter-injection / RLS-corruption defense).
    const owner = assertUuid(resolveOwnerId(ownerId), "ownerId");
    const source = await loadBoard(client, boardId);
    // PUBLISH OWNERSHIP (audit Finding 7): only the teacher's OWN personal board
    // may be published — never a team board, a team-library copy, or someone
    // else's. RLS already guarantees a *readable* personal board is owned by
    // auth.uid() (the personal-board policy is owner-scoped), so a personal board
    // that loadBoard returned IS the caller's; we still assert scope + ownerId
    // explicitly here so the rule is enforced in-app (not only by RLS) and so a
    // team/library source is rejected with a clear message rather than silently
    // publishing a board the caller doesn't own. The mock trusts the caller; this
    // is the Supabase-side guard that makes the (mock-intended) "publish your own
    // board" rule actually hold.
    if (source.scope !== "personal" || source.ownerId == null) {
      throw new Error(
        "Only your own personal board can be published to the Team Library",
      );
    }
    // DERIVE published_by from the verified source owner (NOT the caller arg), so
    // provenance records the true owner even if the caller passed a stale/foreign
    // id. Defense-in-depth: the caller-supplied owner must match the source owner
    // (RLS makes them equal — auth.uid() — so a mismatch is a caller bug).
    if (owner !== source.ownerId) {
      throw new Error("publish owner mismatch");
    }
    // A published board is a lesson-DETACHED, team-owned COPY placed in the Team
    // Library (library_visibility = 'team'). It does NOT count toward the
    // publisher's cap (team-owned, not 'private'), and it records provenance.
    // Additive: the source stays exactly as it was (mock parity).
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: null,
        owner_id: null,
        scope: "team",
        title: source.title,
        display_order_within_lesson: 0,
        template_id: source.templateId,
        grade_level_id: source.gradeLevelId,
        background: source.background ?? null,
        tags: source.tags ?? null,
        board_theme: source.boardTheme ?? null,
        repeat: source.repeat ?? null,
        whiteboard: source.whiteboard ?? false,
        ephemeral: false,
        library_visibility: "team",
        // Provenance derived from the verified source owner, not the caller arg.
        published_by: assertUuid(source.ownerId, "publishedBy"),
        source_board_id: source.id,
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "publish to team library") as BoardRow;
    // Roll back the just-published board if the content copy fails, so the Team
    // Library never shows an empty published board (audit F8).
    await copyBoardContentOrRollback(client, source, newRow.id);
    return loadBoard(client, newRow.id);
  },

  async copyTeamBoardToMine(boardId, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const source = await loadBoard(client, boardId);
    await assertUnderCap(client, owner);
    // Pull = a PRIVATE editable copy in My Boards, lesson-detached (like the
    // shared original). Counts toward the cap (checked above). Records provenance.
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: null,
        owner_id: owner,
        scope: "personal",
        title: source.title,
        display_order_within_lesson: 0,
        template_id: source.templateId,
        grade_level_id: source.gradeLevelId,
        background: source.background ?? null,
        tags: source.tags ?? null,
        board_theme: source.boardTheme ?? null,
        repeat: source.repeat ?? null,
        whiteboard: source.whiteboard ?? false,
        ephemeral: false,
        library_visibility: "private",
        published_by: null,
        source_board_id: source.id,
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "copy team board to mine") as BoardRow;
    // Roll back the just-created copy if the content copy fails, so no empty
    // board (or wasted cap slot) is left in My Boards (audit F8).
    await copyBoardContentOrRollback(client, source, newRow.id);
    return loadBoard(client, newRow.id);
  },

  async copyBoardToLesson(boardId, masterLessonId, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const lesson = resolveLessonId(masterLessonId);
    const source = await loadBoard(client, boardId);
    await assertUnderCap(client, owner);
    // "Open a library board" → add it to the lesson currently in view (audit F11).
    // Unlike copyTeamBoardToMine (a lesson-DETACHED pull into My Boards), this
    // ATTACHES the copy to the target lesson as the teacher's personal board.
    // Grade is DERIVED from the lesson (trg_boards_lesson_grade requires the
    // stamped grade to equal the lesson's), and the title is de-duped against the
    // lesson's personal set so `uniq_boards_personal_lesson_title` can't reject it.
    const grade = await gradeIdForLesson(client, lesson);
    const nextOrder = await nextLessonOrder(client, lesson, "personal", owner);
    const title = await uniquePersonalTitle(
      client,
      lesson,
      owner,
      source.title,
    );
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lesson,
        owner_id: owner,
        scope: "personal",
        title,
        display_order_within_lesson: nextOrder,
        template_id: source.templateId,
        grade_level_id: grade,
        background: source.background ?? null,
        tags: source.tags ?? null,
        board_theme: source.boardTheme ?? null,
        repeat: source.repeat ?? null,
        whiteboard: source.whiteboard ?? false,
        ephemeral: false,
        library_visibility: "private",
        published_by: null,
        source_board_id: source.id,
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "copy board to lesson") as BoardRow;
    // Roll back the just-created copy if the content copy fails (audit F8).
    await copyBoardContentOrRollback(client, source, newRow.id);
    return loadBoard(client, newRow.id);
  },

  // ── 5.31: appearance, repeat, free-form canvas, pages ──────────────────────
  async setBoardTheme(boardId: string, theme: ThemeOverride) {
    const client = await sb();
    // Persist the board-wide theme to the `board_theme` jsonb column.
    const upd = await client
      .from("boards")
      .update({
        board_theme: { ...theme },
        updated_at: new Date().toISOString(),
      })
      .eq("id", boardId);
    if (upd.error) {
      throw new Error(
        `Teach repository set board theme failed: ${upd.error.message}`,
      );
    }
    return loadBoard(client, boardId);
  },

  async setBoardRepeat(boardId: string, repeat: RepeatSchedule) {
    const client = await sb();
    // Real-link repeat rules persist to the `repeat` jsonb column as-is (the
    // matcher resolves them live). Null clears the schedule.
    const upd = await client
      .from("boards")
      .update({
        repeat: repeat ? repeat.map((r) => ({ ...r })) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", boardId);
    if (upd.error) {
      throw new Error(
        `Teach repository set board repeat failed: ${upd.error.message}`,
      );
    }
    return loadBoard(client, boardId);
  },

  async upsertWidgetOnPage(boardId, pageId, widget) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    // Work over a deep-enough copy of the board's pages so the in-memory mutation
    // never aliases the loaded board (mirrors the mock's `upsertWidgetOnPage`).
    const pages = pagesOf(board).map((p) => ({
      ...p,
      widgets: p.widgets.slice(),
    }));
    const target = (pageId && pages.find((p) => p.id === pageId)) || pages[0];
    const next: Widget = {
      ...widget,
      boardId,
      position: { ...widget.position },
      canvas: widget.canvas ? { ...widget.canvas } : undefined,
      appearance: widget.appearance ? { ...widget.appearance } : undefined,
      // Strip names defensively before the widget enters the persisted page set
      // (privacy invariant — mirrors widgetToRow / the mock).
      config: stripNames(widget.config ?? {}),
      state: stripNames(widget.state ?? {}),
    };
    const idx = target.widgets.findIndex((w) => w.id === widget.id);
    if (idx >= 0) {
      target.widgets[idx] = next;
    } else {
      // Derive displayOrder authoritatively from the page's current widgets.
      next.displayOrder = target.widgets.reduce(
        (max, w) => Math.max(max, w.displayOrder + 1),
        0,
      );
      target.widgets.push(next);
    }
    await commitPages(client, boardId, pages);
    return { ...next };
  },

  async moveWidget(widgetId, x, y) {
    const client = await sb();
    const hit = await findWidget(client, widgetId);
    const prev: CanvasPosition = hit.widget.canvas ?? { x: 0, y: 0, w: 320 };
    const canvas: CanvasPosition = {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: prev.w,
    };
    return persistWidgetPatch(client, hit, { canvas });
  },

  async resizeWidget(widgetId, w) {
    const client = await sb();
    const hit = await findWidget(client, widgetId);
    const prev: CanvasPosition = hit.widget.canvas ?? { x: 0, y: 0, w: 320 };
    const canvas: CanvasPosition = { x: prev.x, y: prev.y, w: clampWidth(w) };
    return persistWidgetPatch(client, hit, { canvas });
  },

  async setWidgetAppearance(widgetId, appearance: ThemeOverride) {
    const client = await sb();
    const hit = await findWidget(client, widgetId);
    return persistWidgetPatch(client, hit, { appearance: { ...appearance } });
  },

  async listPages(boardId) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    // `ensureCanvas` guarantees a free-form position for any widget added through
    // a grid-era path so it never stacks at the editor's default coordinate.
    return pagesOf(board).map((p) => ({
      ...p,
      widgets: p.widgets.map((w) => ({ ...ensureCanvas(w) })),
    }));
  },

  async addPage(boardId: string, title?: string) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    const pages = pagesOf(board).map((p) => ({ ...p }));
    const page: BoardPage = {
      id: newPageId(),
      order: pages.length,
      title,
      widgets: [],
    };
    await commitPages(client, boardId, [...pages, page]);
    return { ...page, widgets: [] };
  },

  async deletePage(boardId, pageId) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    const pages = pagesOf(board);
    // Never delete the only page — a board always has ≥1 page (mock parity).
    if (pages.length <= 1) return board;
    await commitPages(
      client,
      boardId,
      pages.filter((p) => p.id !== pageId).map((p) => ({ ...p })),
    );
    return loadBoard(client, boardId);
  },

  async reorderPages(boardId, orderedPageIds) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    const byId = new Map(pagesOf(board).map((p) => [p.id, p]));
    const reordered = orderedPageIds
      .map((id) => byId.get(id))
      .filter((p): p is BoardPage => p != null)
      .map((p, i) => ({ ...p, order: i }));
    // Append any pages the caller omitted (defensive) so none are lost.
    for (const p of pagesOf(board)) {
      if (!orderedPageIds.includes(p.id))
        reordered.push({ ...p, order: reordered.length });
    }
    await commitPages(client, boardId, reordered);
    return loadBoard(client, boardId);
  },

  async updatePage(boardId, pageId, patch) {
    const client = await sb();
    const board = await loadBoard(client, boardId);
    const pages = pagesOf(board).map((p) => {
      if (p.id !== pageId) return p;
      const next = { ...p, ...patch };
      // `background: undefined` means "clear the override → inherit the board":
      // DELETE the key so the persisted pages jsonb omits it entirely (a stored
      // `"background": null` would read as explicit white, not inherit). Mirrors
      // the mock's updatePage so the tri-state round-trips identically.
      if ("background" in patch && patch.background === undefined) {
        delete next.background;
      }
      if ("title" in patch && patch.title === undefined) {
        delete next.title;
      }
      return next;
    });
    await commitPages(client, boardId, pages);
    return loadBoard(client, boardId);
  },

  async createBoardFromTemplate(templateId, ctx) {
    const client = await sb();
    const res = await client
      .from("board_templates")
      .select(TEMPLATE_COLS)
      .eq("id", templateId)
      .single();
    if (res.error || !res.data)
      throw new Error(`Template not found: ${templateId}`);
    const tpl = rowToTemplate(res.data as BoardTemplateRow);
    const owner = assertUuid(resolveOwnerId(ctx.ownerId), "ownerId");
    // SANDBOX SENTINEL (mirrors createBoard, audit F4): the "sandbox" key is NOT a
    // real lesson — treat it like `masterLessonId == null` (grade from the
    // caller-supplied uuid, never a fake-uuid lesson lookup that would throw),
    // force the board ephemeral (uncapped scratch), and SKIP the cap check.
    const isSandbox = ctx.masterLessonId === SANDBOX_LESSON_ID;
    if (!isSandbox) await assertUnderCap(client, owner);
    const lesson =
      ctx.masterLessonId == null || isSandbox
        ? null
        : resolveLessonId(ctx.masterLessonId);
    const gradeLevelId = lesson
      ? await gradeIdForLesson(client, lesson)
      : resolveGradeId(ctx.gradeLevelId);
    const nextOrder = await nextLessonOrder(client, lesson, "personal", owner);
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lesson,
        owner_id: owner,
        scope: "personal",
        title: tpl.title,
        display_order_within_lesson: nextOrder,
        template_id: templateId,
        grade_level_id: gradeLevelId,
        // Restore the board-wide cosmetics captured at save time. `size` is NOT
        // written here (no `size` column yet — Wave 5 Supabase parity; mock keeps it).
        background: tpl.background ?? null,
        board_theme: tpl.boardTheme ?? null,
        tags: [],
        whiteboard: false,
        // A sandbox-created board is ephemeral (uncapped scratch); else kept.
        ephemeral: isSandbox,
        library_visibility: "private",
        published_by: null,
        source_board_id: null,
      })
      .select(BOARD_COLS)
      .single();
    const boardRow = unwrap(ins, "create board from template") as BoardRow;
    // Materialize the FULL page model with fresh page + widget ids when the
    // template carries one (mock parity), syncing the page-0 widget mirror via
    // commitPages. A legacy template (pages absent) falls back to the flat copy.
    if (tpl.pages && tpl.pages.length > 0) {
      const newPages: BoardPage[] = tpl.pages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((p, i) => ({
          id: newPageId(),
          order: i,
          title: p.title,
          background: p.background,
          widgets: p.widgets.map((w, j) => ({
            ...w,
            id: crypto.randomUUID(),
            boardId: boardRow.id,
            displayOrder: j,
            position: { ...w.position },
            canvas: w.canvas ? { ...w.canvas } : undefined,
            appearance: w.appearance ? { ...w.appearance } : undefined,
          })),
        }));
      await commitPages(client, boardRow.id, newPages);
    } else if (tpl.widgets.length > 0) {
      // Templates store widget skeletons without boardId; inject the new board id.
      const seededWidgets: Widget[] = tpl.widgets.map((w) => ({
        ...w,
        boardId: boardRow.id,
      }));
      await copyWidgetsOnto(client, seededWidgets, boardRow.id);
    }
    return loadBoard(client, boardRow.id);
  },
};

// ── Module-private write helpers that need the client ─────────────────────────

/** Mint a fresh page id for a jsonb page. Pages live denormalized in the board's
 *  `pages` column (no page table), so the id is generated app-side. */
function newPageId(): string {
  // `crypto.randomUUID` is available in the Node + Edge server runtimes Next
  // uses; it gives a collision-free, RLS-irrelevant page id.
  return `pg-${crypto.randomUUID()}`;
}

/** Apply a `{ canvas? , appearance? }` patch to the located widget and persist
 *  it. A page-0 widget exists in the `widgets` table, so it gets a cheap direct
 *  column update; a non-page-0 widget lives only in the `pages` jsonb, so it is
 *  written back through the board's `pages` column. Returns the updated domain
 *  Widget. */
async function persistWidgetPatch(
  client: ServerClient,
  hit: { board: Board; page: BoardPage; widget: Widget },
  patch: { canvas?: CanvasPosition; appearance?: ThemeOverride },
): Promise<Widget> {
  const { board, page, widget } = hit;
  const updated: Widget = {
    ...widget,
    ...(patch.canvas !== undefined ? { canvas: patch.canvas } : {}),
    ...(patch.appearance !== undefined ? { appearance: patch.appearance } : {}),
  };
  const onPage0 = page.order === 0;
  if (onPage0) {
    if (board.pages && board.pages.length > 0) {
      // ATOMIC (audit M3): a page-0 widget on an EXPLICIT-PAGE board lives in BOTH
      // the flat mirror AND the pages jsonb. Writing them as two separate calls
      // risked a desync on partial failure (the mirror moved while the jsonb stayed
      // stale, so the move/resize was "lost" on read). Route through commitPages,
      // which writes the pages jsonb + replaces the page-0 mirror in ONE
      // transaction (teach_commit_board_pages), so the two always move together.
      const pages = board.pages.map((p) => ({
        ...p,
        widgets: p.widgets.map((w) => (w.id === widget.id ? updated : w)),
      }));
      await commitPages(client, board.id, pages);
      return { ...updated, gradeLevelId: board.gradeLevelId };
    }
    // FLAT (single-page) board: the direct widget-table update IS the whole write
    // (no pages jsonb to keep in sync); bump the board's updated_at alongside.
    const row = widgetPatchToRow(patch);
    const res = await client
      .from("widgets")
      .update(row)
      .eq("id", widget.id)
      .select(WIDGET_COLS)
      .single();
    const widgetRow = unwrap(res, "persist widget patch (table)") as WidgetRow;
    const upd = await client
      .from("boards")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", board.id);
    if (upd.error) {
      throw new Error(
        `Teach repository persist widget patch (touch board) failed: ${upd.error.message}`,
      );
    }
    return { ...rowToWidget(widgetRow), gradeLevelId: board.gradeLevelId };
  }
  // Non-page-0 widget: rewrite the owning page within the jsonb (the widget is
  // not in the table mirror, so commitPages would lose it — patch pages directly,
  // leaving the page-0 table mirror untouched).
  const pages = pagesOf(board).map((p) =>
    p.id === page.id
      ? {
          ...p,
          widgets: p.widgets.map((w) => (w.id === widget.id ? updated : w)),
        }
      : p,
  );
  const upd = await client
    .from("boards")
    .update({ pages, updated_at: new Date().toISOString() })
    .eq("id", board.id);
  if (upd.error) {
    throw new Error(
      `Teach repository persist widget patch (jsonb) failed: ${upd.error.message}`,
    );
  }
  return updated;
}

/** Insert clones of `widgets` onto `targetBoardId` with fresh ids (the DB issues
 *  them) and re-derived order. Strips names from config/state. The shared copy
 *  primitive behind seed/create-seed. Carries the 5.31 canvas/appearance jsonb. */
async function copyWidgetsOnto(
  client: ServerClient,
  widgets: Widget[],
  targetBoardId: string,
): Promise<void> {
  if (widgets.length === 0) return;
  const rows = widgets.map((w, i) => {
    const row = widgetToRow({ ...w, boardId: targetBoardId });
    // Drop the source id so the DB mints a new one (independent copy).
    const rest: Record<string, unknown> = { ...row };
    delete rest.id;
    return { ...rest, display_order_within_board: i };
  });
  const res = await client.from("widgets").insert(rows);
  if (res.error) {
    throw new Error(
      `Teach repository copy widgets failed: ${res.error.message}`,
    );
  }
}

/** Build the board + page-0-widget-mirror PAYLOADS for an atomic lesson-set
 *  replace (`teach_replace_lesson_set`), entirely in memory. The shared core of
 *  `pushBoardsToTeam` (team set) AND `replacePersonalSetForLesson` (personal
 *  set): both displace a (lesson, scope, owner) set with independent FULL copies
 *  of `sources`, so both mint fresh ids the SAME way `copyBoardContent` does and
 *  emit the page-0 widget mirror the RPC needs (so the flat `widgets` table stays
 *  in sync with each board's `pages` jsonb).
 *
 *  Per source i the board payload carries every column the RPC's INSERT lists,
 *  with `master_core_lesson_event_id = targetLesson`, `scope`, `owner_id = owner`
 *  (null for team), `title = titles[i]`, `display_order_within_lesson = i`, and —
 *  CRITICAL — `grade_level_id = gradeLevelId` UNIFORMLY (the caller derives this
 *  from the TARGET lesson via `gradeIdForLesson`, so `trg_boards_lesson_grade`
 *  always passes even if a source board carried a different grade).
 *
 *  Widget id-minting mirrors `copyBoardContent`:
 *   - PAGES case: re-mint every page id + widget id; the page-0 mirror widget id
 *     === the id in the `pages` jsonb (so the flat row matches the jsonb exactly).
 *   - FLAT case: the board carries no `pages` jsonb; each source widget becomes a
 *     flat-mirror row with a FRESH id (independent copy, no PK collision).
 *  Names are stripped from config/state at every depth (privacy invariant). */
function buildLessonSetPayloads(
  sources: Board[],
  targetLesson: string,
  scope: BoardScope,
  owner: string | null,
  gradeLevelId: string,
  titles: string[],
): { boards: Record<string, unknown>[]; widgets: Record<string, unknown>[] } {
  const boards: Record<string, unknown>[] = [];
  const widgets: Record<string, unknown>[] = [];
  for (let order = 0; order < sources.length; order += 1) {
    const source = sources[order];
    const newBoardId = crypto.randomUUID();
    let pagesPayload: BoardPage[] | null;
    if (source.pages && source.pages.length > 0) {
      // MULTI-PAGE: re-mint every page id + widget id, keep the domain shape
      // `rowToBoard` reads back. gradeLevelId + ensureCanvas are re-applied on
      // READ, so we need not set them in the jsonb, but we DO keep canvas/
      // appearance when present. Names are stripped now so the stored `pages`
      // jsonb is already structure-only.
      const newPages: BoardPage[] = source.pages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((p, i) => ({
          id: newPageId(),
          order: i,
          title: p.title,
          widgets: p.widgets.map((w, j) => ({
            ...w,
            id: crypto.randomUUID(),
            boardId: newBoardId,
            displayOrder: j,
            position: { ...w.position },
            canvas: w.canvas ? { ...w.canvas } : undefined,
            appearance: w.appearance ? { ...w.appearance } : undefined,
            config: stripNames(w.config ?? {}),
            state: stripNames(w.state ?? {}),
          })),
        }));
      pagesPayload = newPages;
      // The page-0 widgets become the flat mirror — KEEP the id just minted so
      // the flat row matches the `pages` jsonb page-0 widget exactly.
      (newPages[0]?.widgets ?? []).forEach((w, idx) => {
        widgets.push({
          ...widgetToRow({ ...w, boardId: newBoardId }),
          id: w.id,
          display_order_within_board: idx,
        });
      });
    } else {
      // FLAT (no pages): the board payload carries no pages jsonb; each source
      // widget becomes a flat-mirror row with a FRESH id (avoids a PK collision
      // and keeps the copy independent). widgetToRow strips names.
      pagesPayload = null;
      source.widgets.forEach((w, idx) => {
        widgets.push({
          ...widgetToRow({ ...w, boardId: newBoardId }),
          id: crypto.randomUUID(),
          display_order_within_board: idx,
        });
      });
    }
    // The board row payload — every column the RPC's INSERT lists, NOT NULL
    // columns explicitly set. master_core_lesson_event_id === the RPC's p_lesson;
    // owner_id is null for team, the owner for personal.
    boards.push({
      id: newBoardId,
      grade_level_id: gradeLevelId,
      subject_id: null,
      master_core_lesson_event_id: targetLesson,
      owner_id: owner,
      scope,
      title: titles[order],
      tint: null,
      display_order_within_lesson: order,
      template_id: source.templateId ?? null,
      board_theme: source.boardTheme ?? null,
      repeat: source.repeat ?? null,
      tags: source.tags ?? null,
      background: source.background ?? null,
      whiteboard: source.whiteboard ?? false,
      // A board in a per-lesson set is never ephemeral and is not a library copy.
      ephemeral: false,
      library_visibility: "private",
      published_by: null,
      source_board_id: source.id,
      pages: pagesPayload,
    });
  }
  return { boards, widgets };
}

/** Copy a source board's FULL content (multi-page structure + widgets) onto a
 *  freshly-created target board. Behind duplicate / publish / pull / push / seed.
 *  When the source has explicit pages it re-mints every page id + widget id and
 *  writes the `pages` jsonb (and syncs the page-0 widget-table mirror via
 *  `commitPages`); otherwise it falls back to the flat widget copy. Fresh ids
 *  keep the copy independent so editing it never touches the original. */
async function copyBoardContent(
  client: ServerClient,
  source: Board,
  targetBoardId: string,
): Promise<void> {
  if (source.pages && source.pages.length > 0) {
    const pages: BoardPage[] = source.pages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p, i) => ({
        id: newPageId(),
        order: i,
        title: p.title,
        widgets: p.widgets.map((w, j) => ({
          ...w,
          id: crypto.randomUUID(),
          boardId: targetBoardId,
          displayOrder: j,
          position: { ...w.position },
          canvas: w.canvas ? { ...w.canvas } : undefined,
          appearance: w.appearance ? { ...w.appearance } : undefined,
        })),
      }));
    await commitPages(client, targetBoardId, pages);
    return;
  }
  await copyWidgetsOnto(client, source.widgets, targetBoardId);
}

/** Copy `source`'s content onto a freshly-INSERTED target board, with a
 *  COMPENSATING DELETE on failure (audit F8). The copy paths (duplicate /
 *  publish / pull) insert the board row FIRST, then copy widgets/pages. If the
 *  content copy throws (a widget insert fails, the page sync fails, …), the
 *  board row would otherwise survive as an EMPTY, visible board the teacher never
 *  asked for (and, for a capped path like duplicate/pull, it would still consume
 *  a cap slot). So on any copy error we delete the just-created board row (its
 *  widgets cascade) and rethrow the original error — the operation is then
 *  all-or-nothing from the teacher's perspective. (The page-0/flat widget inserts
 *  inside copyBoardContent are not themselves a single transaction, but the
 *  board+content pair is made effectively atomic by this rollback.) */
async function copyBoardContentOrRollback(
  client: ServerClient,
  source: Board,
  targetBoardId: string,
): Promise<void> {
  try {
    await copyBoardContent(client, source, targetBoardId);
  } catch (err) {
    // Best-effort cleanup; surface the ORIGINAL failure regardless of whether the
    // compensating delete itself errors (don't mask the root cause).
    await client.from("boards").delete().eq("id", targetBoardId);
    throw err;
  }
}

// ── Patch → row mappers (the columns the schema actually has) ──────────────────

/** Map a Board patch → its `boards` columns (all 5.31 columns now exist). Only
 *  present keys are written so a partial patch never nulls an untouched column.
 *  NOTE: `pages` is intentionally NOT written here — the page model is mutated
 *  through `commitPages` (which also syncs the page-0 widget-table mirror), so a
 *  raw `updateBoard({ pages })` would desync the mirror. `widgets` is excluded by
 *  the patch type. The hardened resolvers (`resolveLessonId`/`resolveOwnerId`/
 *  `resolveGradeId`) are applied to the uuid-bearing columns so a fixture slug
 *  can never land in an RLS-gated column via a patch. */
function boardPatchToRow(
  patch: Partial<Omit<Board, "id" | "widgets">>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.masterLessonId !== undefined)
    row.master_core_lesson_event_id =
      patch.masterLessonId == null
        ? null
        : resolveLessonId(patch.masterLessonId);
  if (patch.ownerId !== undefined)
    row.owner_id = patch.ownerId == null ? null : resolveOwnerId(patch.ownerId);
  if (patch.scope !== undefined) row.scope = patch.scope;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.displayOrderWithinLesson !== undefined)
    row.display_order_within_lesson = patch.displayOrderWithinLesson;
  if (patch.templateId !== undefined) row.template_id = patch.templateId;
  if (patch.gradeLevelId !== undefined)
    row.grade_level_id = resolveGradeId(patch.gradeLevelId);
  // 5.31 columns.
  if (patch.background !== undefined) row.background = patch.background ?? null;
  // Board.size persistence lands with Wave 5 Supabase parity.
  if (patch.tags !== undefined)
    row.tags = patch.tags ? patch.tags.map((t) => ({ ...t })) : null;
  if (patch.whiteboard !== undefined)
    row.whiteboard = patch.whiteboard ?? false;
  if (patch.ephemeral !== undefined) row.ephemeral = patch.ephemeral ?? false;
  if (patch.libraryVisibility !== undefined)
    row.library_visibility = patch.libraryVisibility ?? "private";
  if (patch.publishedBy !== undefined)
    row.published_by =
      patch.publishedBy == null ? null : resolveOwnerId(patch.publishedBy);
  if (patch.sourceBoardId !== undefined)
    row.source_board_id = patch.sourceBoardId ?? null;
  if (patch.boardTheme !== undefined)
    row.board_theme = patch.boardTheme ? { ...patch.boardTheme } : null;
  if (patch.repeat !== undefined)
    row.repeat = patch.repeat ? patch.repeat.map((r) => ({ ...r })) : null;
  return row;
}

/** Map a Widget patch → its `widgets` columns (the 5.31 `canvas` / `appearance`
 *  jsonb columns now exist). config/state are name-stripped (privacy). Only
 *  present keys are written. */
function widgetPatchToRow(
  patch: Partial<Omit<Widget, "id" | "boardId">>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.position !== undefined) {
    row.grid_col = patch.position.col;
    row.grid_row = patch.position.row;
    row.grid_colspan = patch.position.colSpan;
    row.grid_rowspan = patch.position.rowSpan;
  }
  if (patch.canvas !== undefined) row.canvas = patch.canvas ?? null;
  if (patch.appearance !== undefined)
    row.appearance = patch.appearance ? { ...patch.appearance } : null;
  if (patch.displayOrder !== undefined)
    row.display_order_within_board = patch.displayOrder;
  if (patch.pinned !== undefined) row.pinned = patch.pinned;
  if (patch.config !== undefined) row.config = stripNames(patch.config ?? {});
  if (patch.state !== undefined) row.state = stripNames(patch.state ?? {});
  if (patch.persistence !== undefined)
    row.persistence_override = patch.persistence;
  // NOTE: `gradeLevelId` is deliberately NOT written here. The `widgets` table
  // has no `grade_level_id` column (it is denormalized onto the widget at READ
  // time by `rowToWidget`/`rowToBoard`, stamped from the owning board's grade).
  // Writing a non-existent column makes PostgREST reject the whole UPDATE with
  // PGRST204 ("column not found"), so a benign widget patch that happens to
  // carry `gradeLevelId` would fail. Grade lives on the board, not the widget.
  return row;
}

// Re-export the cap symbols so a consumer that imports from this module (rather
// than the seam) still sees them. The seam (`queries.ts`) remains the canonical
// import site.
export { BoardCapError, MAX_BOARDS_PER_TEACHER };
