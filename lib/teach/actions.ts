"use server";

// lib/teach/actions.ts — the SERVER bridge between client components and the
// Supabase-backed TeachDataSource. The Supabase source (lib/teach/supabase-
// source.ts) is server-only: it imports lib/supabase/server.ts (`next/headers`)
// and runs under the authed user's RLS. Client components cannot import it, so
// they call these server actions instead — each one is a thin, awaited
// pass-through to the same TeachDataSource method.
//
// Selection: when Supabase is configured (isSupabaseConfigured, incl. the
// TEACH_USE_SUPABASE=1 local-stack opt-in) these hit Postgres; otherwise they
// fall back to the in-memory mock so behavior is identical pre-backend. The
// client seam (lib/teach/queries.ts `teach`) stays mock-only + client-safe.
//
// PRIVACY (§11.4): these move STRUCTURE only — boards/widgets/pages/themes/
// repeat/tags. Never student names.

import type {
  Board,
  BoardPage,
  BoardTag,
  RepeatSchedule,
  ThemeOverride,
  Widget,
} from "../types";
import type { BoardContext } from "./board-tags";
import type { TeachDataSource } from "./queries";
import { isSupabaseConfigured } from "./queries";
import { mockTeachSource } from "./mock-source";
import { supabaseTeachSource } from "./supabase-source";

/** The server-resolved data source: real Supabase when configured, else mock.
 *  Resolved per-call so an env flip (or test override) is picked up without a
 *  module-load-time freeze. */
function source(): TeachDataSource {
  return isSupabaseConfigured() ? supabaseTeachSource : mockTeachSource;
}

// ── Boards ──────────────────────────────────────────────────────────────────
export async function listBoardsForLessonAction(
  masterLessonId: string,
  ownerId: string,
): Promise<Board[]> {
  return source().listBoardsForLesson(masterLessonId, ownerId);
}

export async function createBoardAction(
  ...args: Parameters<TeachDataSource["createBoard"]>
): Promise<Board> {
  return source().createBoard(...args);
}

export async function deleteBoardAction(boardId: string): Promise<void> {
  return source().deleteBoard(boardId);
}

export async function duplicateBoardAction(
  boardId: string,
  ownerId: string,
): Promise<Board> {
  return source().duplicateBoard(boardId, ownerId);
}

export async function keepBoardAction(boardId: string): Promise<Board> {
  return source().keepBoard(boardId);
}

// ── Widgets ───────────────────────────────────────────────────────────────
export async function upsertWidgetAction(widget: Widget): Promise<Widget> {
  return source().upsertWidget(widget);
}

export async function updateWidgetAction(
  widgetId: string,
  patch: Partial<Widget>,
): Promise<Widget> {
  return source().updateWidget(widgetId, patch);
}

export async function deleteWidgetAction(widgetId: string): Promise<void> {
  return source().deleteWidget(widgetId);
}

// ── 5.31: pages, free-form canvas, themes, repeat ──────────────────────────
export async function setBoardThemeAction(
  boardId: string,
  theme: ThemeOverride,
): Promise<Board> {
  return source().setBoardTheme(boardId, theme);
}

export async function setBoardRepeatAction(
  boardId: string,
  repeat: RepeatSchedule,
): Promise<Board> {
  return source().setBoardRepeat(boardId, repeat);
}

export async function setBoardTagsAction(
  boardId: string,
  tags: BoardTag[],
): Promise<Board> {
  return source().setBoardTags(boardId, tags);
}

export async function upsertWidgetOnPageAction(
  boardId: string,
  pageId: string | null,
  widget: Widget,
): Promise<Widget> {
  return source().upsertWidgetOnPage(boardId, pageId, widget);
}

export async function moveWidgetAction(
  widgetId: string,
  x: number,
  y: number,
): Promise<Widget> {
  return source().moveWidget(widgetId, x, y);
}

export async function resizeWidgetAction(
  widgetId: string,
  w: number,
): Promise<Widget> {
  return source().resizeWidget(widgetId, w);
}

export async function setWidgetAppearanceAction(
  widgetId: string,
  appearance: ThemeOverride,
): Promise<Widget> {
  return source().setWidgetAppearance(widgetId, appearance);
}

export async function listPagesAction(boardId: string): Promise<BoardPage[]> {
  return source().listPages(boardId);
}

export async function addPageAction(
  boardId: string,
  title?: string,
): Promise<BoardPage> {
  return source().addPage(boardId, title);
}

export async function deletePageAction(
  boardId: string,
  pageId: string,
): Promise<Board> {
  return source().deletePage(boardId, pageId);
}

export async function reorderPagesAction(
  boardId: string,
  orderedPageIds: string[],
): Promise<Board> {
  return source().reorderPages(boardId, orderedPageIds);
}

// ── Library ────────────────────────────────────────────────────────────────
export async function publishBoardToTeamLibraryAction(
  boardId: string,
  ownerId: string,
): Promise<Board> {
  return source().publishBoardToTeamLibrary(boardId, ownerId);
}

export async function copyTeamBoardToMineAction(
  boardId: string,
  ownerId: string,
): Promise<Board> {
  return source().copyTeamBoardToMine(boardId, ownerId);
}

// ── Context filter (shared by library + repeat resolution) ─────────────────
export async function listBoardsForContextAction(
  ctx: BoardContext,
  ownerId: string,
): Promise<Board[]> {
  return source().listBoardsForContext(ctx, ownerId);
}
