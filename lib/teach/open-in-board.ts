// lib/teach/open-in-board.ts — "open this card in a board" (Wave 4, #11).
//
// The data ops behind the OpenInBoardDialog: turn any resource/notecard card
// into board content, EITHER as a brand-new board (the open-rule: a board opened
// from a resource CONTAINS that resource) or appended to an existing board. The
// dialog ("ask each time") owns the choice + navigation; this owns the writes.
//
// A card becomes an `embed` widget carrying a {url,label,kind} snapshot — the
// same shape TeachWorkspace.embedResourceAtCell mints — plus a `sourceResourceId`
// link when the source has a persisted id (item 3 "linked but detachable"). A
// NOTECARD has no url of its own, so we embed its POSTER image when it has one
// (a note-only card falls back to a label card). Rendering a notecard's NOTES on
// a board needs a notes-aware widget — that's a Wave-5 concern; documented.

import { teachClient as teach } from "@/lib/teach/client";
import { toTeachResource } from "@/lib/teach/toTeachResource";
import { isNotecard, notecardPoster } from "@/lib/notecards";
import type { Board, LessonResource, TeachResource, Widget } from "@/lib/types";

/** The embed widget config for a card — snapshot + optional source link. */
function embedConfig(resource: LessonResource): Record<string, unknown> {
  const link = resource.resourceId
    ? { sourceResourceId: resource.resourceId }
    : {};
  if (isNotecard(resource)) {
    const poster = notecardPoster(resource);
    const kind: TeachResource["kind"] = poster
      ? toTeachResource(poster).kind
      : "link";
    return {
      url: poster?.url ?? "",
      label: resource.label || "Notecard",
      kind,
      ...link,
    };
  }
  const tr = toTeachResource(resource);
  return { url: resource.url ?? "", label: resource.label, kind: tr.kind, ...link };
}

/** Build the embed widget placing `resource` at (col,row) on `boardId`. */
function buildEmbedWidget(
  boardId: string,
  resource: LessonResource,
  gradeLevelId: string,
  displayOrder: number,
  col: number,
  row: number,
): Widget {
  return {
    id: `w-embed-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    boardId,
    type: "embed",
    title: resource.label || "Resource",
    position: { col, row, colSpan: 1, rowSpan: 1 },
    displayOrder,
    pinned: false,
    config: embedConfig(resource),
    state: {},
    persistence: "inherit",
    gradeLevelId,
  };
}

/**
 * "New board with this card" (#11 + the open-rule). Creates a board (lesson-bound
 * when `lessonId` is given, else lesson-less), seeds it with the card as an embed
 * at (0,0), and KEEPS it (the cap is enforced at keep → may throw BoardCapError).
 * On any failure the ephemeral board is rolled back so no orphan is left behind.
 * Returns the kept board (caller navigates to it).
 */
export async function createBoardWithResource(input: {
  resource: LessonResource;
  ownerId: string;
  gradeLevelId: string;
  lessonId?: string | null;
  title?: string;
}): Promise<Board> {
  const { resource, ownerId, gradeLevelId, lessonId = null, title } = input;
  const board = await teach.createBlankBoard({
    ownerId,
    gradeLevelId,
    masterLessonId: lessonId,
    title: title ?? resource.label ?? "Untitled board",
  });
  try {
    await teach.upsertWidget(
      buildEmbedWidget(board.id, resource, gradeLevelId, 0, 0, 0),
    );
    return await teach.keepBoard(board.id);
  } catch (err) {
    await teach.deleteBoard(board.id).catch(() => {});
    throw err;
  }
}

/**
 * "Add this card to an existing board" (#11). Appends the card as an embed
 * widget to `board` — no new board, no cap hit. Placement spreads across a
 * 3-column grid by widget count so it doesn't stack on (0,0); the teacher
 * rearranges in the editor.
 */
export async function addResourceToBoard(input: {
  board: Board;
  resource: LessonResource;
}): Promise<void> {
  const { board, resource } = input;
  const n = board.widgets?.length ?? 0;
  await teach.upsertWidget(
    buildEmbedWidget(
      board.id,
      resource,
      board.gradeLevelId,
      n,
      n % 3,
      Math.floor(n / 3),
    ),
  );
}
