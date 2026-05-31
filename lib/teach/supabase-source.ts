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
//   ONE REMAINING GAP: there is still no `board_templates`-level appearance and
//   no separate page table — pages are denormalized in jsonb (intentional, the
//   migration's design). No interface method is blocked by a missing column.

import type {
  Board,
  BoardLibraryVisibility,
  BoardPage,
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
import { MOCK_GRADE_LEVEL_ID, buildDefaultBoardSet } from "../mock/boards";
import { boardMatchesContext, type BoardContext } from "./board-tags";
import { ensureCanvas } from "./board-migrate";
import { BoardCapError, MAX_BOARDS_PER_TEACHER } from "./limits";
import type { TeachDataSource } from "./queries";
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
      `Teach repository ${context} failed: ${result.error.message}`,
    );
  }
  if (result.data == null) {
    throw new Error(`Teach repository ${context} returned no data.`);
  }
  return result.data;
}

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

function stripNames(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NAME_BEARING_KEYS.includes(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
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

/** Map a board-template row → a domain BoardTemplate. `widgets` jsonb is the
 *  array of board-agnostic widget skeletons saved at template-creation time. */
function rowToTemplate(row: BoardTemplateRow): BoardTemplate {
  const widgets = Array.isArray(row.widgets)
    ? (row.widgets as Omit<Widget, "boardId">[])
    : [];
  return {
    id: row.id,
    title: row.title,
    scope: row.scope,
    ownerId: row.owner_id,
    widgets,
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
  const page0 = sorted[0]?.widgets ?? [];
  // 1) Write the pages jsonb + bump updated_at on the board row.
  const upd = await client
    .from("boards")
    .update({ pages: sorted, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  if (upd.error) {
    throw new Error(
      `Teach repository commit pages (board) failed: ${upd.error.message}`,
    );
  }
  // 2) Replace the flat widget mirror with page-0's widgets. Delete the board's
  //    current widget rows, then insert page-0 in order (fresh-id-safe: page-0
  //    widgets already carry stable ids, which we preserve so links survive).
  const del = await client.from("widgets").delete().eq("board_id", boardId);
  if (del.error) {
    throw new Error(
      `Teach repository commit pages (clear widgets) failed: ${del.error.message}`,
    );
  }
  if (page0.length > 0) {
    const rows = page0.map((w, i) => ({
      ...widgetToRow({ ...w, boardId }),
      display_order_within_board: i,
    }));
    const ins = await client.from("widgets").insert(rows);
    if (ins.error) {
      throw new Error(
        `Teach repository commit pages (insert widgets) failed: ${ins.error.message}`,
      );
    }
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

/** Clamp a free-form canvas width to the handoff's 230–640 range. */
function clampWidth(w: number): number {
  return Math.min(640, Math.max(230, Math.round(w)));
}

// ── Id bridge (mock slugs ↔ db uuids) ─────────────────────────────────────────
// Identity for now: the live planner already supplies db uuids once the backend
// is wired. Kept as explicit hooks so a slug→uuid bridge lands in one place if
// the planner still hands slugs through during the transition.

function resolveLessonId(lessonId: string): string {
  return lessonId;
}
function resolveOwnerId(ownerId: string): string {
  return ownerId;
}

/** RFC-4122 UUID shape. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Assert a value is a bare UUID before it is interpolated into a PostgREST
 *  filter string (e.g. `.or(...)`), so a crafted id can't inject filter syntax
 *  (commas / parens / `.eq.`). RLS still scopes every row, but this keeps the
 *  query well-formed + the predicate exactly as intended. */
function assertUuid(value: string, label: string): string {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID (got an unexpected value)`);
  }
  return value;
}

// ── Implementation ────────────────────────────────────────────────────────────

export const supabaseTeachSource: TeachDataSource = {
  // ── Boards ────────────────────────────────────────────────────────────────
  async listBoardsForLesson(masterLessonId, ownerId) {
    const client = await sb();
    const lesson = resolveLessonId(masterLessonId);
    const owner = resolveOwnerId(ownerId);

    const all = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("master_core_lesson_event_id", lesson);
    const rows = unwrap(all, "list boards for lesson") as BoardRow[];

    if (rows.length === 0) {
      // Lazily seed the default team set so opening Teach on any lesson works
      // (mirrors the mock's setForLesson fallback). The default builder yields
      // domain boards; insert them as the team set, then return the persisted
      // rows so caller-visible ids are the real db uuids.
      return seedDefaultTeamSet(client, lesson);
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
    // A new PERSONAL board counts toward the owner's cap; team boards are uncapped.
    if (input.scope === "personal" && input.ownerId != null) {
      await assertUnderCap(client, resolveOwnerId(input.ownerId));
    }
    const lesson =
      input.masterLessonId == null
        ? null
        : resolveLessonId(input.masterLessonId);
    const owner = input.ownerId == null ? null : resolveOwnerId(input.ownerId);
    const nextOrder = await nextLessonOrder(client, lesson, input.scope, owner);
    // Re-index a default "Board N" title to the authoritative next slot so two
    // stale creates don't collide on a tab label; a custom title is untouched.
    const title = /^Board \d+$/.test(input.title)
      ? `Board ${nextOrder + 1}`
      : input.title;

    const insert = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lesson,
        owner_id: owner,
        scope: input.scope,
        title,
        display_order_within_lesson: nextOrder,
        template_id: input.templateId ?? null,
        grade_level_id: input.gradeLevelId ?? MOCK_GRADE_LEVEL_ID,
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
    const row = boardPatchToRow(patch);
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
    // Determine insert vs. replace by probing for an existing row id.
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
    const row = widgetPatchToRow(patch);
    if (Object.keys(row).length > 0) {
      const res = await client.from("widgets").update(row).eq("id", widgetId);
      if (res.error) {
        throw new Error(
          `Teach repository update widget failed: ${res.error.message}`,
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
    const res = await client.from("widgets").delete().eq("id", widgetId);
    if (res.error) {
      throw new Error(
        `Teach repository delete widget failed: ${res.error.message}`,
      );
    }
  },

  // ── Templates ─────────────────────────────────────────────────────────────
  async listBoardTemplates(ownerId) {
    const client = await sb();
    // Validate as a UUID before interpolating into the PostgREST `.or()` filter
    // (defense-in-depth against filter injection; RLS already scopes rows).
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
    // Strip boardId from each widget — a template is board-agnostic — and strip
    // name-bearing config/state defensively (privacy).
    const widgets = board.widgets.map((w) => ({
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
    }));
    const res = await client
      .from("board_templates")
      .insert({
        title,
        scope,
        owner_id: scope === "team" ? null : resolveOwnerId(ownerId),
        widgets,
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
    const lesson = resolveLessonId(masterLessonId);
    // Displacement: delete the lesson's existing team set, then re-insert the
    // pushed boards as the new team set. Done as a sequence of awaited calls
    // (supabase-js has no client-side multi-statement transaction; a stored
    // procedure is the lead's option for true atomicity — noted as a finding).
    const del = await client
      .from("boards")
      .delete()
      .eq("master_core_lesson_event_id", lesson)
      .eq("scope", "team");
    if (del.error) {
      throw new Error(
        `Teach repository push-to-team (clear) failed: ${del.error.message}`,
      );
    }
    const pushed: Board[] = [];
    for (let order = 0; order < boardIds.length; order += 1) {
      const source = await loadBoard(client, boardIds[order]);
      const ins = await client
        .from("boards")
        .insert({
          master_core_lesson_event_id: lesson,
          owner_id: null,
          scope: "team",
          title: source.title,
          display_order_within_lesson: order,
          template_id: source.templateId,
          grade_level_id: source.gradeLevelId,
          // Carry the source's cosmetic/structural fields onto the team copy.
          background: source.background ?? null,
          tags: source.tags ?? null,
          board_theme: source.boardTheme ?? null,
          repeat: source.repeat ?? null,
          whiteboard: source.whiteboard ?? false,
          // A per-lesson team board is never ephemeral and is not a library copy.
          ephemeral: false,
          library_visibility: "private",
          published_by: null,
          source_board_id: source.id,
        })
        .select(BOARD_COLS)
        .single();
      const newRow = unwrap(ins, "push-to-team (insert board)") as BoardRow;
      await copyBoardContent(client, source, newRow.id);
      pushed.push(await loadBoard(client, newRow.id));
    }
    return pushed;
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
      .eq("grade_level_id", gradeLevelId);
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
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: source.masterLessonId,
        owner_id: owner,
        scope: "personal",
        title: `${source.title} (copy)`,
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
    // copy so non-page-0 widgets survive the duplicate.
    await copyBoardContent(client, source, newRow.id);
    return loadBoard(client, newRow.id);
  },

  async createBlankBoard(input) {
    const client = await sb();
    const owner = resolveOwnerId(input.ownerId);
    const lesson =
      input.masterLessonId == null
        ? null
        : resolveLessonId(input.masterLessonId);
    // A blank whiteboard starts EPHEMERAL: it does NOT count toward the cap until
    // `keepBoard` (so a capped teacher can still scratch on a throwaway). No
    // assertUnderCap here — the cap is enforced at keep (mock parity).
    const nextOrder = await nextLessonOrder(client, lesson, "personal", owner);
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lesson,
        owner_id: owner,
        scope: "personal",
        title: input.title ?? "Whiteboard",
        display_order_within_lesson: nextOrder,
        template_id: null,
        grade_level_id: input.gradeLevelId ?? MOCK_GRADE_LEVEL_ID,
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
    await assertUnderCap(client, board.ownerId ?? "");
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

  async listBoardsForContext(ctx, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const context = ctx as BoardContext;
    // Auto-surface candidates: the owner's KEPT personal boards + every published
    // Team-Library board, run through the SAME `boardMatchesContext` predicate
    // the mock uses (tags now persist, so matching is live). Personal ephemeral
    // boards are excluded (mock parity).
    const personal = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("scope", "personal")
      .eq("owner_id", owner)
      .eq("ephemeral", false);
    const teamLib = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("library_visibility", "team");
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
    const owner = assertUuid(resolveOwnerId(ownerId), "ownerId");
    const source = await loadBoard(client, boardId);
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
        published_by: owner,
        source_board_id: source.id,
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "publish to team library") as BoardRow;
    await copyBoardContent(client, source, newRow.id);
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
    await copyBoardContent(client, source, newRow.id);
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
 *  written back through `commitPages`. Returns the updated domain Widget. */
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
    // Fast path: update the widget-table row directly.
    const row = widgetPatchToRow(patch);
    const res = await client
      .from("widgets")
      .update(row)
      .eq("id", widget.id)
      .select(WIDGET_COLS)
      .single();
    const widgetRow = unwrap(res, "persist widget patch (table)") as WidgetRow;
    // Keep the `pages` jsonb in sync when the board carries explicit pages, so a
    // later page read sees the same canvas/appearance (the table is page-0's
    // mirror, but the jsonb is authoritative for the page model).
    if (board.pages && board.pages.length > 0) {
      const pages = board.pages.map((p) => ({
        ...p,
        widgets: p.widgets.map((w) => (w.id === widget.id ? updated : w)),
      }));
      const upd = await client
        .from("boards")
        .update({ pages, updated_at: new Date().toISOString() })
        .eq("id", board.id);
      if (upd.error) {
        throw new Error(
          `Teach repository persist widget patch (page sync) failed: ${upd.error.message}`,
        );
      }
    } else {
      // Single-page board: just bump the board's updated_at.
      const upd = await client
        .from("boards")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", board.id);
      if (upd.error) {
        throw new Error(
          `Teach repository persist widget patch (touch board) failed: ${upd.error.message}`,
        );
      }
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

/** Copy a source board's FULL content (multi-page structure + widgets) onto a
 *  freshly-created target board. Behind duplicate / publish / pull. When the
 *  source has explicit pages it re-mints every page id + widget id and writes the
 *  `pages` jsonb (and syncs the page-0 widget-table mirror via `commitPages`);
 *  otherwise it falls back to the flat widget copy. Fresh ids keep the copy
 *  independent so editing it never touches the original. */
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

/** Seed + return the default team board set for a lesson with no boards yet. */
async function seedDefaultTeamSet(
  client: ServerClient,
  lessonId: string,
): Promise<Board[]> {
  const defaults = buildDefaultBoardSet(lessonId);
  const out: Board[] = [];
  for (let i = 0; i < defaults.length; i += 1) {
    const b = defaults[i];
    const ins = await client
      .from("boards")
      .insert({
        master_core_lesson_event_id: lessonId,
        owner_id: null,
        scope: "team",
        title: b.title,
        display_order_within_lesson: b.displayOrderWithinLesson ?? i,
        template_id: b.templateId ?? null,
        grade_level_id: b.gradeLevelId ?? MOCK_GRADE_LEVEL_ID,
        // Carry any 5.31 fields the default builder set on the seed board.
        background: b.background ?? null,
        tags: b.tags ?? null,
        board_theme: b.boardTheme ?? null,
        repeat: b.repeat ?? null,
        whiteboard: b.whiteboard ?? false,
        ephemeral: false,
        library_visibility: "private",
      })
      .select(BOARD_COLS)
      .single();
    const row = unwrap(ins, "seed default team set (board)") as BoardRow;
    await copyBoardContent(client, b, row.id);
    out.push(await loadBoard(client, row.id));
  }
  return out;
}

// ── Patch → row mappers (only the columns the schema actually has) ─────────────

/** Map a Board patch → its `boards` columns (all 5.31 columns now exist). Only
 *  present keys are written so a partial patch never nulls an untouched column.
 *  NOTE: `pages` is intentionally NOT written here — the page model is mutated
 *  through `commitPages` (which also syncs the page-0 widget-table mirror), so a
 *  raw `updateBoard({ pages })` would desync the mirror. `widgets` is excluded by
 *  the patch type. */
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
  if (patch.gradeLevelId !== undefined) row.grade_level_id = patch.gradeLevelId;
  // 5.31 columns.
  if (patch.background !== undefined) row.background = patch.background ?? null;
  if (patch.tags !== undefined)
    row.tags = patch.tags ? patch.tags.map((t) => ({ ...t })) : null;
  if (patch.whiteboard !== undefined)
    row.whiteboard = patch.whiteboard ?? false;
  if (patch.ephemeral !== undefined) row.ephemeral = patch.ephemeral ?? false;
  if (patch.libraryVisibility !== undefined)
    row.library_visibility = patch.libraryVisibility ?? "private";
  if (patch.publishedBy !== undefined)
    row.published_by = patch.publishedBy ?? null;
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
  if (patch.gradeLevelId !== undefined) row.grade_level_id = patch.gradeLevelId;
  return row;
}

// Re-export the cap symbols so a consumer that imports from this module (rather
// than the seam) still sees them. The seam (`queries.ts`) remains the canonical
// import site.
export { BoardCapError, MAX_BOARDS_PER_TEACHER };
