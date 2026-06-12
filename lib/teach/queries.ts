// lib/teach/queries.ts — the Teach repository seam.
//
// Follows the documented `lib/admin/queries.ts` convention: this is the ONLY
// module the Teach UI imports for board / widget / template data. It defines
// the `TeachDataSource` interface and exports a single concrete `teach`
// implementation. Switching the backend on in Phase 4 is a ONE-LINE change
// here — swap `mockTeachSource` for `supabaseTeachSource` (plan §11.3).
//
// Resources do NOT flow through here: they reuse the existing data path via the
// `toTeachResource()` adapter. This seam is board/widget/template only.

import type {
  Board,
  BoardPage,
  BoardTag,
  BoardTemplate,
  RepeatSchedule,
  ThemeOverride,
  Widget,
} from "../types";
import type { BoardContext } from "./board-tags";
import { mockTeachSource } from "./mock-source";
// NOTE: `supabaseTeachSource` (./supabase-source) is SERVER-ONLY — it imports
// lib/supabase/server.ts (`next/headers`), which cannot be bundled into a
// client component. `queries.ts` is imported by client components (e.g.
// TeachWorkspace), so it must NOT statically import the Supabase source. The
// Supabase backend is reached through the server-action layer in
// `lib/teach/actions.ts` (see `teachServerSource`), not this client-safe seam.

// The cap + error live in a leaf module to avoid a runtime circular import
// (this file → mock-source → this file). Re-exported here so the documented
// repository seam remains the single import site for consumers.
export { BoardCapError, MAX_BOARDS_PER_TEACHER } from "./limits";

// SANDBOX_LESSON_ID lives in a leaf module (same reason as BoardCapError above:
// avoid the queries → mock-source → queries runtime cycle). Re-exported here so
// the repository seam stays the single import site for UI consumers.
export { SANDBOX_LESSON_ID } from "./constants";

/**
 * The repository contract for Teach board data. Every method is async
 * (Promise-returning) so the mock and the future Supabase implementation share
 * one signature — the UI awaits both identically.
 */
export interface TeachDataSource {
  // ── Boards ────────────────────────────────────────────────────────────────
  /**
   * List the boards a teacher sees for a lesson: their PERSONAL set where one
   * exists, otherwise the TEAM set (plan §13.1). Lesson + owner ids are
   * slug-tolerant (the id bridge resolves mock slugs ↔ db uuids).
   */
  listBoardsForLesson(
    masterLessonId: string,
    ownerId: string,
  ): Promise<Board[]>;
  createBoard(
    input: Omit<Board, "id" | "widgets" | "createdAt" | "updatedAt"> & {
      widgets?: Board["widgets"];
    },
  ): Promise<Board>;
  updateBoard(
    boardId: string,
    patch: Partial<Omit<Board, "id" | "widgets">>,
  ): Promise<Board>;
  deleteBoard(boardId: string): Promise<void>;
  /** Re-order the board pill strip for a lesson; ids in their new order. */
  reorderBoards(
    masterLessonId: string,
    ownerId: string,
    orderedBoardIds: string[],
  ): Promise<Board[]>;

  // ── Widgets ─────────────────────────────────────────────────────────────
  /** Insert or replace a widget on its board (keyed by `widget.id`). */
  upsertWidget(widget: Widget): Promise<Widget>;
  updateWidget(
    widgetId: string,
    patch: Partial<Omit<Widget, "id" | "boardId">>,
  ): Promise<Widget>;
  deleteWidget(widgetId: string): Promise<void>;

  // ── Templates ─────────────────────────────────────────────────────────────
  listBoardTemplates(ownerId: string): Promise<BoardTemplate[]>;
  /** Save an existing board's shape as a reusable template. */
  saveBoardAsTemplate(
    boardId: string,
    title: string,
    scope: BoardTemplate["scope"],
    ownerId: string,
  ): Promise<BoardTemplate>;

  // ── Push to team (plan §13.1 displacement) ────────────────────────────────
  /**
   * Share a teacher's personal board set with the team. DESTRUCTIVE +
   * team-wide: it deletes the lesson's existing team set and re-inserts the
   * pushed boards as the new team set in one operation. The UI gates this
   * behind an explicit warning (consequence toast + confirm).
   */
  pushBoardsToTeam(
    masterLessonId: string,
    boardIds: string[],
  ): Promise<Board[]>;

  /**
   * Atomically REPLACE the owner's PERSONAL set for a lesson with independent
   * FULL-PAGE copies of `sourceBoardIds` (the sandbox-pin write path: the
   * teacher arranges boards in the lesson-less sandbox, then "pins" that set as
   * their personal copy for a real lesson). The personal twin of
   * `pushBoardsToTeam`: it deletes the owner's existing personal set for the
   * lesson then inserts fresh-id copies of the sources, in `sourceBoardIds`
   * order, in one operation (Supabase routes the delete+insert through the
   * `teach_replace_lesson_set` RPC so a mid-sequence failure rolls back rather
   * than leaving the teacher's set wiped). An empty `sourceBoardIds` is a no-op
   * (returns `[]`) — it never wipes the existing set. Returns the new personal
   * set in order.
   */
  replacePersonalSetForLesson(
    masterLessonId: string,
    ownerId: string,
    sourceBoardIds: string[],
  ): Promise<Board[]>;

  // ── Boards Library (the reusable-board catalog) ────────────────────────────
  /**
   * "My Boards" — every board the teacher owns (personal scope, this owner),
   * across all lessons + the sandbox + whiteboards, EXCLUDING unsaved ephemeral
   * whiteboards. This is the set the 50-cap counts and the library "My Boards"
   * tab lists. Sorted newest-updated first.
   */
  listMyBoards(ownerId: string): Promise<Board[]>;
  /**
   * "Team Library" — boards teammates published (a COPY each), for the grade.
   * Additive + non-destructive: pulling one (`copyTeamBoardToMine`) leaves the
   * shared copy in place. Sorted newest-published first.
   */
  listTeamLibraryBoards(gradeLevelId: string): Promise<Board[]>;
  /** Count the owner's kept boards (drives the cap UI). */
  countMyBoards(ownerId: string): Promise<number>;

  /**
   * Duplicate a board into an INDEPENDENT editable copy owned by `ownerId`
   * (fresh ids, "… (copy)" title, same lesson binding + tags). Counts toward the
   * cap → throws `BoardCapError` when the owner is already at the limit.
   */
  duplicateBoard(boardId: string, ownerId: string): Promise<Board>;

  /**
   * Open a blank free-form whiteboard. It is created EPHEMERAL (does not count
   * toward the cap) so a teacher can scratch instantly; on close the UI prompts
   * "keep this board?" → `keepBoard` (cap enforced) or `deleteBoard` (discard).
   * Attaches to `masterLessonId` when given so it shows in that lesson's strip.
   */
  createBlankBoard(input: {
    ownerId: string;
    gradeLevelId: string;
    masterLessonId?: string | null;
    title?: string;
  }): Promise<Board>;
  /**
   * Promote an ephemeral whiteboard to a kept board ("keep? → Yes"). Enforces
   * the cap at this point → throws `BoardCapError` when at the limit.
   */
  keepBoard(boardId: string): Promise<Board>;

  /** Replace a board's tags (the tag editor / "Repeat" affordance write path). */
  setBoardTags(boardId: string, tags: BoardTag[]): Promise<Board>;

  /**
   * Boards that auto-surface in a context (the tag = assignment behaviour):
   * the owner's boards whose tags match `ctx` (see `boardMatchesContext`),
   * UNION the matching Team-Library boards FOR `gradeLevelId`. The grade is a
   * required scope so a teacher never sees another grade's published boards
   * auto-surfacing in their context (the Team-Library read is grade-scoped).
   */
  listBoardsForContext(
    ctx: BoardContext,
    ownerId: string,
    gradeLevelId: string,
  ): Promise<Board[]>;

  /**
   * Publish a COPY of one of the owner's boards to the shared Team Library
   * (`libraryVisibility: "team"`, lesson-detached, fresh ids). Additive — does
   * not touch the source or any team set. Does NOT count toward the cap.
   */
  publishBoardToTeamLibrary(boardId: string, ownerId: string): Promise<Board>;
  /**
   * Pull a Team-Library board into "My Boards" as a private editable copy.
   * Counts toward the cap → throws `BoardCapError` at the limit.
   */
  copyTeamBoardToMine(boardId: string, ownerId: string): Promise<Board>;
  /**
   * Pull a board (e.g. a Team-Library board, or any lesson-detached library
   * board) into a SPECIFIC lesson as a private personal copy — lesson-attached,
   * fresh ids, FULL pages. The "open a library board" → add-it-to-the-lesson-in-
   * view path. The copy's grade is derived from the target lesson and its title
   * de-duplicated against that lesson's personal set. Counts toward the cap →
   * throws `BoardCapError` at the limit.
   */
  copyBoardToLesson(
    boardId: string,
    masterLessonId: string,
    ownerId: string,
  ): Promise<Board>;

  // ── 5.31 redesign: appearance, repeat, free-form canvas, pages ─────────────
  /** Set a board's global appearance theme (the Board Theme panel write path).
   *  Pass `{}` to clear the board theme back to per-widget defaults. */
  setBoardTheme(boardId: string, theme: ThemeOverride): Promise<Board>;
  /** Set a board's REAL repeat schedule (weekday/lesson/subject/week/slot
   *  links). Pass `null` to stop repeating. One board, many live contexts. */
  setBoardRepeat(boardId: string, repeat: RepeatSchedule): Promise<Board>;

  /** Insert or replace a widget on a specific PAGE of a board (free-form canvas).
   *  When `pageId` is omitted the board's first page is used. Keyed by
   *  `widget.id`; derives `displayOrder` on insert. */
  upsertWidgetOnPage(
    boardId: string,
    pageId: string | null,
    widget: Widget,
  ): Promise<Widget>;
  /** Move a widget to a new absolute canvas position (x/y) — drag commit. */
  moveWidget(widgetId: string, x: number, y: number): Promise<Widget>;
  /** Resize a widget's canvas width (corner-resize commit; clamp 230–640). */
  resizeWidget(widgetId: string, w: number): Promise<Widget>;
  /** Set a widget's per-widget appearance override (the Appearance panel write
   *  path). Pass `{}` to reset the widget back to the board theme. */
  setWidgetAppearance(
    widgetId: string,
    appearance: ThemeOverride,
  ): Promise<Widget>;

  /** List a board's pages (always ≥1; a board with no explicit pages yields a
   *  single implicit page built from its flat `widgets`). */
  listPages(boardId: string): Promise<BoardPage[]>;
  /** Append a new blank page to a board; returns the created page. */
  addPage(boardId: string, title?: string): Promise<BoardPage>;
  /** Delete a page (no-op if it is the board's only page). */
  deletePage(boardId: string, pageId: string): Promise<Board>;
  /** Re-order a board's pages by id. */
  reorderPages(boardId: string, orderedPageIds: string[]): Promise<Board>;
}

/**
 * Decide which `TeachDataSource` backs the seam.
 *
 * Supabase is selected when its env is genuinely configured: the public URL
 * must be present AND must not be the local dummy/placeholder value used in
 * dev + CI (where `supabase db reset` runs against `127.0.0.1`/`localhost`
 * with throwaway keys, and the Teach tables are designed-but-unwired). In
 * every other case — no URL, or a localhost placeholder — we fall back to the
 * in-memory mock so the prototype keeps rendering against `lib/mock/`.
 *
 * Keeping the decision in one documented function makes the backend a single,
 * auditable switch (plan §11.3): once a real Supabase project URL is set in
 * the deploy env, the Supabase source takes over with no other code change.
 */
/**
 * True when a real Supabase project is configured (used by the SERVER-side
 * action layer to decide whether to hit Supabase or fall back to the mock).
 * Kept here as the single auditable switch. `TEACH_USE_SUPABASE=1` opts a local
 * stack (127.0.0.1:54321) in for end-to-end verification without changing the
 * CI-safe default (CI runs throwaway localhost keys with the tables unwired).
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.length === 0) return false;
  if (process.env.TEACH_USE_SUPABASE === "1") return true;
  if (url.includes("localhost") || url.includes("127.0.0.1")) return false;
  return true;
}

/**
 * The active CLIENT-SIDE data source. Always the in-memory mock: the Supabase
 * backend is server-only (RLS + `next/headers`), so client components read
 * through this seam and persist through the server actions in
 * `lib/teach/actions.ts`. Swapping the client to call those actions is the
 * remaining wiring step; the seam keeps the prototype rendering meanwhile.
 */
export const teach: TeachDataSource = mockTeachSource;
