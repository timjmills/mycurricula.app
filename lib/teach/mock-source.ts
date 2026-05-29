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

import type { Board, BoardTemplate, Widget } from "../types";
import {
  BOARDS,
  buildDefaultBoardSet,
  MOCK_GRADE_LEVEL_ID,
} from "../mock/boards";
import type { TeachDataSource } from "./queries";

// ── Mutable in-memory store ─────────────────────────────────────────────────
// Cloned from the fixtures so editing the live store never mutates the exported
// fixture arrays (which other modules may read).
const boards: Board[] = BOARDS.map(cloneBoard);
const templates: BoardTemplate[] = [];

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

function cloneBoard(b: Board): Board {
  return {
    ...b,
    widgets: b.widgets.map((w) => ({ ...w, position: { ...w.position } })),
  };
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
    const id = nextId("b");
    const now = new Date().toISOString();
    const board: Board = {
      id,
      masterLessonId: input.masterLessonId,
      ownerId: input.ownerId ?? null,
      scope: input.scope,
      title: input.title,
      displayOrderWithinLesson: input.displayOrderWithinLesson,
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
    if (idx >= 0) board.widgets[idx] = next;
    else board.widgets.push(next);
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
};
