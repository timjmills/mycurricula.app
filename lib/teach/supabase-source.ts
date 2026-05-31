// lib/teach/supabase-source.ts — Supabase-backed `TeachDataSource` (Phase 1B).
//
// A drop-in implementation of the repository contract defined in
// `lib/teach/queries.ts`, backed by the Teach-View Postgres schema
// (`supabase/migrations/20260530090000_teach_view.sql`). It mirrors
// `mock-source.ts` behaviour exactly — the UI awaits both identically — but
// reads/writes durable rows instead of an in-memory store.
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
// SCHEMA GAP (reported to the lead — see the report, NOT patched here)
//   The migration backs the PRE-5.31 grid board model: `boards` carries
//   `tint` + grid widgets, but lacks columns for the 5.31 domain fields
//   (`background`, `tags`, `whiteboard`, `ephemeral`, `library_visibility`,
//   `published_by`, `source_board_id`, `pages`, `board_theme`, `repeat`) and
//   widgets lack `canvas` / `appearance` columns. There is also no
//   `teach_board_tags` / `teach_docked_tools` table. This file maps every
//   column the migration DOES expose and degrades the unmapped 5.31 fields
//   gracefully (see `rowToBoard` / `boardPatchToRow`) so it compiles + runs
//   correctly against the schema as-shipped; the lead must add the missing
//   columns/tables for full 5.31 fidelity before those features persist.

import type {
  Board,
  BoardPage,
  BoardTag,
  BoardTemplate,
  CanvasPosition,
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
  "id, grade_level_id, subject_id, master_core_lesson_event_id, owner_id, scope, title, tint, display_order_within_lesson, template_id, created_at, updated_at";
const WIDGET_COLS =
  "id, board_id, type, title, grid_row, grid_col, grid_rowspan, grid_colspan, display_order_within_board, pinned, config, state, persistence_override, created_at, updated_at";
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

/** Map a widget row → domain Widget. `ensureCanvas` derives a free-form canvas
 *  position from the grid columns so grid-era rows never stack at the editor's
 *  default coordinate (matching the mock's read-time guarantee). The schema has
 *  no `canvas`/`appearance` columns, so those domain fields are derived/absent. */
function rowToWidget(row: WidgetRow): Widget {
  const base: Widget = {
    id: row.id,
    boardId: row.board_id,
    type: row.type,
    title: row.title,
    position: rowToGridPosition(row),
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
 *  fields have no column, so they are not persisted (schema gap — reported). */
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
    display_order_within_board: widget.displayOrder,
    pinned: widget.pinned,
    config: stripNames(widget.config ?? {}),
    state: stripNames(widget.state ?? {}),
    persistence_override: widget.persistence,
  };
}

/** Map a board row + its widgets → a domain Board. Widgets inherit the board's
 *  grade for the denormalized `gradeLevelId`. The flat `widgets` array is the
 *  page-0 mirror; with no `pages` column, every board reads as a single implicit
 *  page (the mock's `pagesOf` materializes the same shape on read). */
function rowToBoard(row: BoardRow, widgetRows: WidgetRow[]): Board {
  const widgets = widgetRows
    .slice()
    .sort((a, b) => a.display_order_within_board - b.display_order_within_board)
    .map((wr) => ({ ...rowToWidget(wr), gradeLevelId: row.grade_level_id }));
  return {
    id: row.id,
    masterLessonId: row.master_core_lesson_event_id,
    ownerId: row.owner_id,
    scope: row.scope,
    title: row.title,
    displayOrderWithinLesson: row.display_order_within_lesson,
    templateId: row.template_id,
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

/** The owner's KEPT boards as raw rows (personal scope, this owner). With no
 *  `ephemeral` / `library_visibility` columns in the schema, this cannot exclude
 *  ephemeral whiteboards or published library copies the way the mock does — a
 *  documented consequence of the schema gap. */
async function myBoardRows(
  client: ServerClient,
  ownerId: string,
): Promise<BoardRow[]> {
  const res = await client
    .from("boards")
    .select(BOARD_COLS)
    .eq("scope", "personal")
    .eq("owner_id", ownerId);
  return unwrap(res, "list my boards") as BoardRow[];
}

/** Enforce the per-teacher cap BEFORE any create/duplicate/keep/pull. Throws
 *  `BoardCapError` when the owner is already at `MAX_BOARDS_PER_TEACHER`. */
async function assertUnderCap(
  client: ServerClient,
  ownerId: string,
): Promise<void> {
  const res = await client
    .from("boards")
    .select("id", { count: "exact", head: true })
    .eq("scope", "personal")
    .eq("owner_id", ownerId);
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

/** Locate the board id that owns a widget (the schema has no page table, so a
 *  widget belongs directly to its board). Throws if not found / not visible. */
async function boardIdForWidget(
  client: ServerClient,
  widgetId: string,
): Promise<string> {
  const res = await client
    .from("widgets")
    .select("board_id")
    .eq("id", widgetId)
    .maybeSingle();
  if (res.error) {
    throw new Error(
      `Teach repository widget lookup failed: ${res.error.message}`,
    );
  }
  const row = res.data as { board_id: string } | null;
  if (!row) throw new Error(`Widget not found: ${widgetId}`);
  return row.board_id;
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
        })
        .select(BOARD_COLS)
        .single();
      const newRow = unwrap(ins, "push-to-team (insert board)") as BoardRow;
      await copyWidgetsOnto(client, source.widgets, newRow.id);
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
    // SCHEMA GAP: no `library_visibility` column. The closest stand-in is the
    // grade's team boards; without the column we cannot distinguish a published
    // library copy from a per-lesson team set, so this returns the grade's team
    // boards sorted newest-first. Reported to the lead.
    const res = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("scope", "team")
      .eq("grade_level_id", gradeLevelId);
    const rows = unwrap(res, "list team library boards") as BoardRow[];
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return hydrateBoards(client, rows);
  },

  async countMyBoards(ownerId) {
    const client = await sb();
    const res = await client
      .from("boards")
      .select("id", { count: "exact", head: true })
      .eq("scope", "personal")
      .eq("owner_id", resolveOwnerId(ownerId));
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
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "duplicate board") as BoardRow;
    await copyWidgetsOnto(client, source.widgets, newRow.id);
    return loadBoard(client, newRow.id);
  },

  async createBlankBoard(input) {
    const client = await sb();
    const owner = resolveOwnerId(input.ownerId);
    const lesson =
      input.masterLessonId == null
        ? null
        : resolveLessonId(input.masterLessonId);
    // SCHEMA GAP: no `ephemeral` / `whiteboard` columns. The mock keeps a blank
    // board ephemeral (uncapped) until `keepBoard`; without the column we cannot
    // mark it ephemeral, so a persisted blank board IS a kept personal board.
    // To honour the cap invariant we enforce the cap up front here (the mock
    // defers it to keepBoard). Reported to the lead.
    await assertUnderCap(client, owner);
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
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "create blank board") as BoardRow;
    return loadBoard(client, newRow.id);
  },

  async keepBoard(boardId) {
    const client = await sb();
    // SCHEMA GAP: with no `ephemeral` column a board is always already kept;
    // `createBlankBoard` enforced the cap at open. This is an idempotent reload
    // so the call site keeps working. Reported to the lead.
    return loadBoard(client, boardId);
  },

  async setBoardTags(boardId: string, tags: BoardTag[]) {
    void boardId;
    void tags;
    // SCHEMA GAP: no `tags` column / `teach_board_tags` table. Tags cannot be
    // persisted against the schema as-shipped. Throw loudly rather than silently
    // dropping the write so the UI doesn't believe a tag save succeeded.
    throw new Error(
      "Teach repository setBoardTags is unavailable: the boards schema has no tags column / teach_board_tags table. Add it before wiring board tags.",
    );
  },

  async listBoardsForContext(ctx, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const context = ctx as BoardContext;
    // SCHEMA GAP: no tags column → no auto-surface tag match can be done in SQL.
    // We load the owner's personal boards + the grade's team boards and run the
    // SAME `boardMatchesContext` predicate the mock uses. With tags absent from
    // every row, `boardMatchesContext` returns false for all of them, so this
    // yields an empty list until the tags column lands. Reported to the lead.
    const personal = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("scope", "personal")
      .eq("owner_id", owner);
    const team = await client
      .from("boards")
      .select(BOARD_COLS)
      .eq("scope", "team");
    const personalRows = unwrap(
      personal,
      "context personal boards",
    ) as BoardRow[];
    const teamRows = unwrap(team, "context team boards") as BoardRow[];
    const boards = await hydrateBoards(client, [...personalRows, ...teamRows]);
    return boards.filter((b) => boardMatchesContext(b, context));
  },

  async publishBoardToTeamLibrary(boardId, ownerId) {
    // ownerId is provenance only; the schema has no `published_by` column to
    // record it (see the SCHEMA GAP note on the publish copy below).
    void ownerId;
    const client = await sb();
    const source = await loadBoard(client, boardId);
    // SCHEMA GAP: no `library_visibility` / `published_by` / `source_board_id`
    // columns. We model a publish as a lesson-detached team COPY (the closest
    // the schema allows). It does NOT count toward the cap (team-owned). The
    // provenance fields can't be recorded until the columns land. Reported.
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
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "publish to team library") as BoardRow;
    await copyWidgetsOnto(client, source.widgets, newRow.id);
    return loadBoard(client, newRow.id);
  },

  async copyTeamBoardToMine(boardId, ownerId) {
    const client = await sb();
    const owner = resolveOwnerId(ownerId);
    const source = await loadBoard(client, boardId);
    await assertUnderCap(client, owner);
    // Pull = a PRIVATE editable copy in My Boards, lesson-detached (like the
    // shared original). Counts toward the cap (checked above).
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
      })
      .select(BOARD_COLS)
      .single();
    const newRow = unwrap(ins, "copy team board to mine") as BoardRow;
    await copyWidgetsOnto(client, source.widgets, newRow.id);
    return loadBoard(client, newRow.id);
  },

  // ── 5.31: appearance, repeat, free-form canvas, pages ──────────────────────
  async setBoardTheme(boardId: string, theme: ThemeOverride) {
    void boardId;
    void theme;
    // SCHEMA GAP: no `board_theme` column. Cannot persist. Throw loudly.
    throw new Error(
      "Teach repository setBoardTheme is unavailable: the boards schema has no board_theme column. Add it before wiring board themes.",
    );
  },

  async setBoardRepeat(boardId: string, repeat: RepeatSchedule) {
    void boardId;
    void repeat;
    // SCHEMA GAP: no `repeat` column. Cannot persist. Throw loudly.
    throw new Error(
      "Teach repository setBoardRepeat is unavailable: the boards schema has no repeat column. Add it before wiring board repeat schedules.",
    );
  },

  async upsertWidgetOnPage(boardId, pageId, widget) {
    // SCHEMA GAP: no page table; every widget belongs directly to its board.
    // pageId is ignored — the widget upserts onto the (single implicit) page.
    // Force the boardId so the widget lands on the requested board.
    void pageId;
    return this.upsertWidget({ ...widget, boardId });
  },

  async moveWidget(widgetId, x, y) {
    // SCHEMA GAP: no `canvas` column. The free-form x/y/w cannot be persisted.
    // We reload the widget and return it with the requested canvas applied
    // in-memory so the optimistic UI is correct, but the move does NOT survive a
    // reload until the canvas column lands. Reported to the lead.
    const client = await sb();
    const boardId = await boardIdForWidget(client, widgetId);
    const board = await loadBoard(client, boardId);
    const widget = board.widgets.find((w) => w.id === widgetId);
    if (!widget) throw new Error(`Widget not found: ${widgetId}`);
    const prev: CanvasPosition = widget.canvas ?? { x: 0, y: 0, w: 320 };
    return {
      ...widget,
      canvas: {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        w: prev.w,
      },
    };
  },

  async resizeWidget(widgetId, w) {
    // SCHEMA GAP: no `canvas` column — see `moveWidget`. In-memory only.
    const client = await sb();
    const boardId = await boardIdForWidget(client, widgetId);
    const board = await loadBoard(client, boardId);
    const widget = board.widgets.find((wi) => wi.id === widgetId);
    if (!widget) throw new Error(`Widget not found: ${widgetId}`);
    const prev: CanvasPosition = widget.canvas ?? { x: 0, y: 0, w: 320 };
    return { ...widget, canvas: { x: prev.x, y: prev.y, w: clampWidth(w) } };
  },

  async setWidgetAppearance(widgetId, appearance: ThemeOverride) {
    // SCHEMA GAP: no `appearance` column. In-memory only — see `moveWidget`.
    const client = await sb();
    const boardId = await boardIdForWidget(client, widgetId);
    const board = await loadBoard(client, boardId);
    const widget = board.widgets.find((w) => w.id === widgetId);
    if (!widget) throw new Error(`Widget not found: ${widgetId}`);
    return { ...widget, appearance: { ...appearance } };
  },

  async listPages(boardId) {
    // SCHEMA GAP: no page table. A board reads as a single implicit page built
    // from its widgets (mirrors the mock's `pagesOf`). `ensureCanvas` guarantees
    // a free-form position for every widget so none stack at the default coord.
    const client = await sb();
    const board = await loadBoard(client, boardId);
    const page: BoardPage = {
      id: `${board.id}-p0`,
      order: 0,
      widgets: board.widgets.map((w) => ensureCanvas(w)),
    };
    return [page];
  },

  async addPage(boardId: string, title?: string) {
    void boardId;
    void title;
    // SCHEMA GAP: no page table — cannot append a page. Throw loudly so the UI
    // does not believe a page was created. Reported to the lead.
    throw new Error(
      "Teach repository addPage is unavailable: the schema has no page table. Add multi-page board support before wiring pages.",
    );
  },

  async deletePage(boardId, pageId) {
    // SCHEMA GAP: no page table; a board always has exactly one implicit page,
    // so deleting a page is a no-op that returns the board unchanged (matches
    // the mock's "never delete the only page" guard).
    void pageId;
    const client = await sb();
    return loadBoard(client, boardId);
  },

  async reorderPages(boardId, orderedPageIds) {
    // SCHEMA GAP: one implicit page → reordering is a no-op returning the board.
    void orderedPageIds;
    const client = await sb();
    return loadBoard(client, boardId);
  },
};

// ── Module-private write helpers that need the client ─────────────────────────

/** Insert clones of `widgets` onto `targetBoardId` with fresh ids (the DB issues
 *  them) and re-derived order. Strips names from config/state. The shared copy
 *  primitive behind duplicate / publish / pull / push. */
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
      })
      .select(BOARD_COLS)
      .single();
    const row = unwrap(ins, "seed default team set (board)") as BoardRow;
    await copyWidgetsOnto(client, b.widgets, row.id);
    out.push(await loadBoard(client, row.id));
  }
  return out;
}

// ── Patch → row mappers (only the columns the schema actually has) ─────────────

/** Map a Board patch → the `boards` columns that exist. Unmapped 5.31 fields
 *  (background, tags, whiteboard, ephemeral, libraryVisibility, publishedBy,
 *  sourceBoardId, pages, boardTheme, repeat) are silently skipped because there
 *  is no column for them (schema gap — reported). Only present keys are written
 *  so a partial patch never nulls an untouched column. */
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
  return row;
}

/** Map a Widget patch → the `widgets` columns that exist. The 5.31 `canvas` /
 *  `appearance` fields have no column and are skipped. config/state are
 *  name-stripped. Only present keys are written. */
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
