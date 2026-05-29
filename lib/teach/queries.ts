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

import type { Board, BoardTemplate, Widget } from "../types";
import { mockTeachSource } from "./mock-source";

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
}

/**
 * The active data source. v1 is the in-memory mock; Phase 4 swaps this single
 * binding for `supabaseTeachSource` and nothing else in the UI changes.
 */
export const teach: TeachDataSource = mockTeachSource;
