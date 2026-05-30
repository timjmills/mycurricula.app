// lib/teach/mock-source.ts — in-memory `TeachDataSource` for v1.
//
// Seeded from `lib/mock/boards.ts`; holds boards/widgets/templates in a mutable
// module-level store so the prototype behaves like a real backend within a
// session (creates/edits/deletes persist for the page's lifetime). Every method
// is async to match the Supabase implementation's signature exactly, so the UI
// awaits both identically (plan §11.3).
//
// The id bridge (`resolveLessonId` / `resolveOwnerId`) is slug-tolerant: mock
// lesson ids are slugs ("m-12-0"); the future Supabase rows are uuids. v1 keeps
// the slug as-is; Phase 4's adapter maps slug ↔ uuid in one place.
//
// PRIVACY (plan §11.4): boards/widgets persisted here carry STRUCTURE only.
// Name-bearing data (group rosters, name-picker entries) never reaches this
// store — it lives in the USER-scoped local store on the teacher's machine. The
// future `boardToRow()` Supabase adapter asserts/strips any name-bearing field
// before a write; this mock does not synthesize names into `config`/`state`.

import type { Board, BoardTag, BoardTemplate, Widget } from "../types";
import {
  BOARDS,
  buildDefaultBoardSet,
  MOCK_GRADE_LEVEL_ID,
  TEAM_LIBRARY_BOARDS,
} from "../mock/boards";
import { boardMatchesContext, type BoardContext } from "./board-tags";
import { BoardCapError, MAX_BOARDS_PER_TEACHER } from "./limits";
import type { TeachDataSource } from "./queries";

// ── Mutable in-memory store ─────────────────────────────────────────────────
// Cloned from the fixtures so editing the live store never mutates the exported
// fixture arrays (which other modules may read).
const boards: Board[] = [...BOARDS, ...TEAM_LIBRARY_BOARDS].map(cloneBoard);
const templates: BoardTemplate[] = [];

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

function cloneBoard(b: Board): Board {
  return {
    ...b,
    tags: b.tags ? b.tags.map((t) => ({ ...t })) : b.tags,
    widgets: b.widgets.map((w) => ({ ...w, position: { ...w.position } })),
  };
}

/** Deep-clone a board's widgets onto a NEW board id (fresh widget ids too) — the
 *  shared copy primitive behind duplicate / publish / pull. */
function cloneWidgetsOnto(source: Board, boardId: string): Widget[] {
  return source.widgets.map((w) => ({
    ...w,
    id: nextId("w"),
    boardId,
    position: { ...w.position },
  }));
}

/** The owner's KEPT boards (personal scope, this owner, not ephemeral, not a
 *  published Team-Library copy). This is exactly what the 50-cap counts and what
 *  the "My Boards" library lists. */
function myBoards(owner: string): Board[] {
  return boards.filter(
    (b) =>
      b.scope === "personal" &&
      b.ownerId === owner &&
      b.ephemeral !== true &&
      b.libraryVisibility !== "team",
  );
}

/** Throw `BoardCapError` when the owner is already at the cap. Called BEFORE any
 *  create/duplicate/keep/pull that would add a kept board. */
function assertUnderCap(owner: string): void {
  if (myBoards(owner).length >= MAX_BOARDS_PER_TEACHER) {
    throw new BoardCapError();
  }
}

// ── Id bridge (mock slugs ↔ db uuids) ───────────────────────────────────────

/** Resolve a lesson identifier to the canonical id the store keys on. v1 is the
 *  identity map (slugs are already canonical); Phase 4 maps slug → uuid here. */
export function resolveLessonId(lessonId: string): string {
  return lessonId;
}

/** Resolve a teacher/owner identifier to the canonical id. Identity in v1. */
export function resolveOwnerId(ownerId: string): string {
  return ownerId;
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** The board set a teacher sees for a lesson: their PERSONAL set where one
 *  exists, otherwise the TEAM set (plan §13.1). When a lesson has no seeded
 *  boards at all, lazily materialize the default five-phase team set. */
function setForLesson(masterLessonId: string, ownerId: string): Board[] {
  const lesson = resolveLessonId(masterLessonId);
  const owner = resolveOwnerId(ownerId);
  const forLesson = boards.filter((b) => b.masterLessonId === lesson);
  if (forLesson.length === 0) {
    // Lazily seed a default team set so opening Teach on any lesson works.
    const seeded = buildDefaultBoardSet(lesson).map((b) => ({
      ...b,
      id: nextId("b"),
      widgets: b.widgets.map((w) => ({ ...w, id: nextId("w") })),
    }));
    // Re-link each widget's boardId to the freshly-issued board id.
    for (const board of seeded) {
      board.widgets = board.widgets.map((w) => ({ ...w, boardId: board.id }));
    }
    boards.push(...seeded);
    return seeded;
  }
  const personal = forLesson.filter(
    (b) => b.scope === "personal" && b.ownerId === owner,
  );
  if (personal.length > 0) {
    return personal.sort(
      (a, b) => a.displayOrderWithinLesson - b.displayOrderWithinLesson,
    );
  }
  return forLesson
    .filter((b) => b.scope === "team")
    .sort((a, b) => a.displayOrderWithinLesson - b.displayOrderWithinLesson);
}

// ── Implementation ────────────────────────────────────────────────────────────

export const mockTeachSource: TeachDataSource = {
  async listBoardsForLesson(masterLessonId, ownerId) {
    return setForLesson(masterLessonId, ownerId).map(cloneBoard);
  },

  async createBoard(input) {
    // A new PERSONAL board counts toward the owner's cap (the user's "50 total,
    // must delete"); team-set boards (per-lesson fallback) are uncapped.
    if (input.scope === "personal" && input.ownerId != null) {
      assertUnderCap(resolveOwnerId(input.ownerId));
    }
    const id = nextId("b");
    const now = new Date().toISOString();
    // Derive ordering authoritatively from the CURRENT sibling set (same
    // lesson + scope + owner), so two near-simultaneous creates reading a stale
    // caller-supplied length can't collide on `displayOrderWithinLesson` or the
    // default "Board N" title. The Supabase impl computes the same from rows.
    const lesson =
      input.masterLessonId == null
        ? null
        : resolveLessonId(input.masterLessonId);
    const owner = input.ownerId == null ? null : resolveOwnerId(input.ownerId);
    const siblings = boards.filter(
      (b) =>
        b.masterLessonId === lesson &&
        b.scope === input.scope &&
        b.ownerId === owner,
    );
    const nextOrder = siblings.reduce(
      (max, b) => Math.max(max, b.displayOrderWithinLesson + 1),
      0,
    );
    // Re-index a default "Board N" title to the authoritative next slot so two
    // stale creates don't both produce the same tab label. A custom title is
    // left untouched.
    const title = /^Board \d+$/.test(input.title)
      ? `Board ${nextOrder + 1}`
      : input.title;
    const board: Board = {
      id,
      masterLessonId: input.masterLessonId,
      ownerId: input.ownerId ?? null,
      scope: input.scope,
      title,
      displayOrderWithinLesson: nextOrder,
      templateId: input.templateId ?? null,
      gradeLevelId: input.gradeLevelId ?? MOCK_GRADE_LEVEL_ID,
      widgets: (input.widgets ?? []).map((w) => ({ ...w, boardId: id })),
      createdAt: now,
      updatedAt: now,
    };
    boards.push(board);
    return cloneBoard(board);
  },

  async updateBoard(boardId, patch) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    Object.assign(board, patch, { updatedAt: new Date().toISOString() });
    return cloneBoard(board);
  },

  async deleteBoard(boardId) {
    const idx = boards.findIndex((b) => b.id === boardId);
    if (idx >= 0) boards.splice(idx, 1);
  },

  async reorderBoards(masterLessonId, ownerId, orderedBoardIds) {
    const set = setForLesson(masterLessonId, ownerId);
    const byId = new Map(set.map((b) => [b.id, b]));
    orderedBoardIds.forEach((id, order) => {
      const board = byId.get(id);
      if (board) {
        board.displayOrderWithinLesson = order;
        board.updatedAt = new Date().toISOString();
      }
    });
    return setForLesson(masterLessonId, ownerId).map(cloneBoard);
  },

  async upsertWidget(widget) {
    const board = boards.find((b) => b.id === widget.boardId);
    if (!board) throw new Error(`Board not found: ${widget.boardId}`);
    const idx = board.widgets.findIndex((w) => w.id === widget.id);
    const next: Widget = { ...widget, position: { ...widget.position } };
    if (idx >= 0) {
      board.widgets[idx] = next;
    } else {
      // INSERT: derive `displayOrder` authoritatively from the board's current
      // widgets, overriding a possibly-stale caller-supplied length so two
      // near-simultaneous embeds can't collide on the same order. (A replace of
      // an existing widget keeps its order.) The Supabase impl computes the same
      // from existing rows.
      next.displayOrder = board.widgets.reduce(
        (max, w) => Math.max(max, w.displayOrder + 1),
        0,
      );
      board.widgets.push(next);
    }
    board.updatedAt = new Date().toISOString();
    return { ...next, position: { ...next.position } };
  },

  async updateWidget(widgetId, patch) {
    for (const board of boards) {
      const widget = board.widgets.find((w) => w.id === widgetId);
      if (widget) {
        Object.assign(widget, patch);
        if (patch.position) widget.position = { ...patch.position };
        board.updatedAt = new Date().toISOString();
        return { ...widget, position: { ...widget.position } };
      }
    }
    throw new Error(`Widget not found: ${widgetId}`);
  },

  async deleteWidget(widgetId) {
    for (const board of boards) {
      const idx = board.widgets.findIndex((w) => w.id === widgetId);
      if (idx >= 0) {
        board.widgets.splice(idx, 1);
        board.updatedAt = new Date().toISOString();
        return;
      }
    }
  },

  async listBoardTemplates(ownerId) {
    const owner = resolveOwnerId(ownerId);
    return templates
      .filter((t) => t.scope === "team" || t.ownerId === owner)
      .map((t) => ({ ...t }));
  },

  async saveBoardAsTemplate(boardId, title, scope, ownerId) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    const now = new Date().toISOString();
    const template: BoardTemplate = {
      id: nextId("tpl"),
      title,
      scope,
      ownerId: scope === "team" ? null : resolveOwnerId(ownerId),
      // Strip boardId from each widget — a template is board-agnostic.
      widgets: board.widgets.map((w) => ({
        id: w.id,
        type: w.type,
        title: w.title,
        position: { ...w.position },
        displayOrder: w.displayOrder,
        pinned: w.pinned,
        config: w.config,
        state: w.state,
        persistence: w.persistence,
        gradeLevelId: w.gradeLevelId,
      })),
      gradeLevelId: board.gradeLevelId,
      createdAt: now,
      updatedAt: now,
    };
    templates.push(template);
    return { ...template };
  },

  async pushBoardsToTeam(masterLessonId, boardIds) {
    const lesson = resolveLessonId(masterLessonId);
    // Displacement (plan §13.1): drop the existing team set for this lesson…
    for (let i = boards.length - 1; i >= 0; i -= 1) {
      const b = boards[i];
      if (b.masterLessonId === lesson && b.scope === "team") {
        boards.splice(i, 1);
      }
    }
    // …then re-insert the pushed boards as the new team set (fresh ids so the
    // teacher's personal originals are untouched).
    const now = new Date().toISOString();
    const pushed: Board[] = [];
    boardIds.forEach((sourceId, order) => {
      const source = boards.find((b) => b.id === sourceId);
      if (!source) return;
      const id = nextId("b");
      const copy: Board = {
        ...cloneBoard(source),
        id,
        ownerId: null,
        scope: "team",
        masterLessonId: lesson,
        displayOrderWithinLesson: order,
        createdAt: now,
        updatedAt: now,
        widgets: source.widgets.map((w) => ({
          ...w,
          id: nextId("w"),
          boardId: id,
          position: { ...w.position },
        })),
      };
      boards.push(copy);
      pushed.push(copy);
    });
    return pushed.map(cloneBoard);
  },

  // ── Boards Library ─────────────────────────────────────────────────────────

  async listMyBoards(ownerId) {
    const owner = resolveOwnerId(ownerId);
    return myBoards(owner)
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(cloneBoard);
  },

  async listTeamLibraryBoards(gradeLevelId) {
    return boards
      .filter(
        (b) =>
          b.libraryVisibility === "team" && b.gradeLevelId === gradeLevelId,
      )
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(cloneBoard);
  },

  async countMyBoards(ownerId) {
    return myBoards(resolveOwnerId(ownerId)).length;
  },

  async duplicateBoard(boardId, ownerId) {
    const owner = resolveOwnerId(ownerId);
    const source = boards.find((b) => b.id === boardId);
    if (!source) throw new Error(`Board not found: ${boardId}`);
    assertUnderCap(owner);
    const id = nextId("b");
    const now = new Date().toISOString();
    // A duplicate is INDEPENDENT (the user's "duplicate vs repeat" split): it
    // joins the source's lesson strip as a personal copy with its own ids.
    const siblings = boards.filter(
      (b) =>
        b.masterLessonId === source.masterLessonId &&
        b.scope === "personal" &&
        b.ownerId === owner,
    );
    const nextOrder = siblings.reduce(
      (max, b) => Math.max(max, b.displayOrderWithinLesson + 1),
      0,
    );
    const copy: Board = {
      ...cloneBoard(source),
      id,
      ownerId: owner,
      scope: "personal",
      title: `${source.title} (copy)`,
      displayOrderWithinLesson: nextOrder,
      // A duplicate is the teacher's OWN private board, never a team-library copy.
      libraryVisibility:
        source.libraryVisibility === "team"
          ? "private"
          : source.libraryVisibility,
      publishedBy: null,
      ephemeral: undefined,
      sourceBoardId: source.id,
      widgets: cloneWidgetsOnto(source, id),
      createdAt: now,
      updatedAt: now,
    };
    boards.push(copy);
    return cloneBoard(copy);
  },

  async createBlankBoard(input) {
    const owner = resolveOwnerId(input.ownerId);
    const id = nextId("b");
    const now = new Date().toISOString();
    const lesson =
      input.masterLessonId == null
        ? null
        : resolveLessonId(input.masterLessonId);
    // Ordered after the lesson's current personal siblings so it lands at the
    // end of the strip; a lesson-less whiteboard starts at 0.
    const siblings = boards.filter(
      (b) =>
        b.masterLessonId === lesson &&
        b.scope === "personal" &&
        b.ownerId === owner,
    );
    const nextOrder = siblings.reduce(
      (max, b) => Math.max(max, b.displayOrderWithinLesson + 1),
      0,
    );
    const board: Board = {
      id,
      masterLessonId: lesson,
      ownerId: owner,
      scope: "personal",
      title: input.title ?? "Whiteboard",
      displayOrderWithinLesson: nextOrder,
      templateId: null,
      background: null,
      tags: [],
      whiteboard: true,
      // Ephemeral until kept — does NOT count toward the cap (no assertUnderCap
      // here, so a capped teacher can still scratch on a throwaway whiteboard).
      ephemeral: true,
      libraryVisibility: "private",
      publishedBy: null,
      sourceBoardId: null,
      widgets: [],
      gradeLevelId: input.gradeLevelId ?? MOCK_GRADE_LEVEL_ID,
      createdAt: now,
      updatedAt: now,
    };
    boards.push(board);
    return cloneBoard(board);
  },

  async keepBoard(boardId) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    // Already kept → idempotent no-op (don't re-check the cap against itself).
    if (board.ephemeral !== true) return cloneBoard(board);
    // Cap enforced HERE (keep), not at open — the board is still ephemeral so it
    // isn't double-counted by assertUnderCap.
    assertUnderCap(board.ownerId ?? "");
    board.ephemeral = false;
    board.updatedAt = new Date().toISOString();
    return cloneBoard(board);
  },

  async setBoardTags(boardId, tags) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    board.tags = tags.map((t: BoardTag) => ({ ...t }));
    board.updatedAt = new Date().toISOString();
    return cloneBoard(board);
  },

  async listBoardsForContext(ctx, ownerId) {
    const owner = resolveOwnerId(ownerId);
    const context = ctx as BoardContext;
    return boards
      .filter((b) => {
        const mine =
          b.scope === "personal" && b.ownerId === owner && b.ephemeral !== true;
        const teamLib = b.libraryVisibility === "team";
        if (!mine && !teamLib) return false;
        return boardMatchesContext(b, context);
      })
      .map(cloneBoard);
  },

  async publishBoardToTeamLibrary(boardId, ownerId) {
    const owner = resolveOwnerId(ownerId);
    const source = boards.find((b) => b.id === boardId);
    if (!source) throw new Error(`Board not found: ${boardId}`);
    const id = nextId("b");
    const now = new Date().toISOString();
    // A published board is a lesson-DETACHED, team-owned COPY. It does NOT count
    // toward the publisher's cap (team-owned), and it is additive: the source
    // stays exactly as it was.
    const copy: Board = {
      ...cloneBoard(source),
      id,
      masterLessonId: null,
      ownerId: null,
      scope: "team",
      displayOrderWithinLesson: 0,
      libraryVisibility: "team",
      publishedBy: owner,
      ephemeral: undefined,
      sourceBoardId: source.id,
      widgets: cloneWidgetsOnto(source, id),
      createdAt: now,
      updatedAt: now,
    };
    boards.push(copy);
    return cloneBoard(copy);
  },

  async copyTeamBoardToMine(boardId, ownerId) {
    const owner = resolveOwnerId(ownerId);
    const source = boards.find((b) => b.id === boardId);
    if (!source) throw new Error(`Board not found: ${boardId}`);
    assertUnderCap(owner);
    const id = nextId("b");
    const now = new Date().toISOString();
    // Pull = a PRIVATE editable copy in My Boards (lesson-detached, like the
    // shared original). Counts toward the cap (checked above).
    const copy: Board = {
      ...cloneBoard(source),
      id,
      masterLessonId: null,
      ownerId: owner,
      scope: "personal",
      displayOrderWithinLesson: 0,
      libraryVisibility: "private",
      publishedBy: null,
      ephemeral: undefined,
      sourceBoardId: source.id,
      widgets: cloneWidgetsOnto(source, id),
      createdAt: now,
      updatedAt: now,
    };
    boards.push(copy);
    return cloneBoard(copy);
  },
};
