// lib/teach/boardToResource.ts — Board → resource adapter (Wave 4, #9).
//
// A learning board "counts as a resource" (WAVES §2 #9): it shows up in the same
// resource lists as files and links so a teacher sees every artifact for a
// lesson — boards included — in one place. This is the ONLY board→resource
// direction; the reverse (a resource embedded ONTO a board) lives in
// lib/board-embed.ts and is unrelated.
//
// The produced row is deliberately a *base* `type:"link"` LessonResource carrying
// the Teach-only `kind:"board"` discriminator + a required `boardId`. Board-aware
// lists (daily Resources, the Teach Resources panel) branch on `boardId`/`kind`
// to render the board glyph + an "Open board" action; any non-board-aware switch
// on the planner `type` just sees a link and never breaks. Pure — no I/O.

import type { Board, TeachResource } from "../types";

/** A board surfaced as a resource row. Assignable to BOTH `TeachResource` (the
 *  Teach Resources panel) and `SectionResource` (= LessonResource + `id`, the
 *  daily list), so one adapter feeds every board-aware surface. `boardId` is
 *  narrowed to required here (it's the discriminator). */
export type BoardResource = TeachResource & { id: string; boardId: string };

/** A stable resource-row id for a board row, namespaced so it can never collide
 *  with a real resource's id in a deduped/keyed list. */
export function boardResourceId(boardId: string): string {
  return `board:${boardId}`;
}

/** Project a Board onto a resource row. No `url` — opening a board navigates to
 *  the editor (`boardResourceHref`), it is never framed in-canvas. */
export function boardToTeachResource(board: Board): BoardResource {
  return {
    id: boardResourceId(board.id),
    type: "link",
    kind: "board",
    boardId: board.id,
    label: board.title.trim() ? board.title : "Untitled board",
    defaultRenderTarget: "external",
    tags: [],
  };
}

/** The editor deep-link for opening a board resource. A lesson-bound board keeps
 *  its lesson in the URL so the editor loads that set; a lesson-less board opens
 *  standalone (board id only — TeachWorkspace standalone scope). */
export function boardResourceHref(
  boardId: string,
  lessonId?: string | null,
): string {
  const params = new URLSearchParams();
  if (lessonId) params.set("lesson", lessonId);
  params.set("board", boardId);
  return `/teach?${params.toString()}`;
}
