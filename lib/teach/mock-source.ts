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

import type {
  Board,
  BoardPage,
  BoardTag,
  BoardTemplate,
  Widget,
} from "../types";
import {
  BOARDS,
  MOCK_GRADE_LEVEL_ID,
  STARTER_TEMPLATES,
  TEAM_LIBRARY_BOARDS,
} from "../mock/boards";
import { boardMatchesContext, type BoardContext } from "./board-tags";
import { ensureCanvas } from "./board-migrate";
import { BoardCapError, MAX_BOARDS_PER_TEACHER } from "./limits";
import type { TeachDataSource } from "./queries";
// From the leaf module (NOT ./queries) so this import doesn't recreate the
// queries → mock-source → queries runtime cycle. `import type` above is
// erased, so it adds no runtime edge.
import { SANDBOX_LESSON_ID } from "./constants";

// ── Mutable in-memory store ─────────────────────────────────────────────────
// Cloned from the fixtures so editing the live store never mutates the exported
// fixture arrays (which other modules may read).
const boards: Board[] = [...BOARDS, ...TEAM_LIBRARY_BOARDS].map(cloneBoard);
const templates: BoardTemplate[] = [...STARTER_TEMPLATES];

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

function cloneWidget(w: Widget): Widget {
  // Guarantee a free-form canvas position: grid-era fixture widgets carry only a
  // legacy grid `position`, so derive a canvas from it when absent (5.31). Without
  // this every legacy widget would fall back to the editor's single default
  // coordinate and stack on top of one another.
  const c = ensureCanvas(w);
  return {
    ...c,
    position: { ...c.position },
    canvas: c.canvas ? { ...c.canvas } : undefined,
    appearance: c.appearance ? { ...c.appearance } : undefined,
  };
}

function cloneBoard(b: Board): Board {
  return {
    ...b,
    tags: b.tags ? b.tags.map((t) => ({ ...t })) : b.tags,
    boardTheme: b.boardTheme ? { ...b.boardTheme } : b.boardTheme,
    repeat: b.repeat ? b.repeat.map((r) => ({ ...r })) : b.repeat,
    pages: b.pages
      ? b.pages.map((p) => ({ ...p, widgets: p.widgets.map(cloneWidget) }))
      : b.pages,
    widgets: b.widgets.map(cloneWidget),
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

/** Re-mint a source board's PAGES onto a new board id with fresh page + widget
 *  ids (the FULL-PAGE copy `replacePersonalSetForLesson` makes). Returns
 *  undefined when the source has no explicit pages (a flat board — its widgets
 *  are copied via `cloneWidgetsOnto` instead). Mirrors the Supabase adapter's
 *  copyBoardContent / buildLessonSetPayloads page re-minting so the two repos
 *  copy a multi-page board identically. */
function clonePagesOnto(
  source: Board,
  boardId: string,
): BoardPage[] | undefined {
  if (!source.pages || source.pages.length === 0) return undefined;
  return source.pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({
      ...p,
      id: nextId("pg"),
      order: i,
      widgets: p.widgets.map((w, j) => ({
        ...w,
        id: nextId("w"),
        boardId,
        displayOrder: j,
        position: { ...w.position },
        canvas: w.canvas ? { ...w.canvas } : undefined,
        appearance: w.appearance ? { ...w.appearance } : undefined,
      })),
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

// ── 5.31 page model helpers ──────────────────────────────────────────────────
// A board's widgets live either on explicit `pages` (multi-page, 5.31) or on the
// legacy flat `widgets` array (treated as a single implicit page). These helpers
// give every mutation ONE consistent view: read pages, find a widget across all
// pages, and keep the flat `widgets` mirror in sync with page-0 so grid-era
// consumers (and the cap/library reads) keep working unchanged.

/** Return a board's pages, materializing a single implicit page from the flat
 *  `widgets` array when the board has none. Never mutates the board. */
function pagesOf(board: Board): BoardPage[] {
  if (board.pages && board.pages.length > 0) return board.pages;
  return [{ id: `${board.id}-p0`, order: 0, widgets: board.widgets ?? [] }];
}

/** Keep `board.pages` authoritative AND mirror page-0's widgets onto the flat
 *  `board.widgets` field so legacy readers stay correct. Sorts pages by order. */
function commitPages(board: Board, pages: BoardPage[]): void {
  const sorted = pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({ ...p, order: i }));
  board.pages = sorted;
  board.widgets = sorted[0]?.widgets ?? [];
  board.updatedAt = new Date().toISOString();
}

/** Find a widget anywhere on a board (across all pages); returns the owning
 *  board, page, and widget, or null. Searches the live store. */
function findWidget(
  widgetId: string,
): { board: Board; page: BoardPage; widget: Widget } | null {
  for (const board of boards) {
    for (const page of pagesOf(board)) {
      const widget = page.widgets.find((w) => w.id === widgetId);
      if (widget) return { board, page, widget };
    }
  }
  return null;
}

/** Clamp a free-form canvas width to the handoff's 230–640 range. */
function clampWidth(w: number): number {
  return Math.min(640, Math.max(230, Math.round(w)));
}

// ── Id bridge (mock slugs ↔ db uuids) ───────────────────────────────────────

/** Resolve a lesson identifier to the canonical id the store keys on. v1 is the
 *  identity map (slugs are already canonical); Phase 4 maps slug → uuid here.
 *
 *  SANDBOX SENTINEL: `listBoardsForLesson`, `createBoard`, and `createBlankBoard`
 *  each special-case SANDBOX_LESSON_ID BEFORE calling this helper — the sentinel
 *  is handled as a lesson-LESS ephemeral personal board (masterLessonId == null,
 *  ephemeral = true, no cap check, no default-team-set seed) to mirror the
 *  Supabase implementation's audit-F4 behaviour. This helper is only reached for
 *  REAL lesson ids, so the identity map is correct here. */
export function resolveLessonId(lessonId: string): string {
  return lessonId;
}

/** Resolve a teacher/owner identifier to the canonical id. Identity in v1. */
export function resolveOwnerId(ownerId: string): string {
  return ownerId;
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** The board set a teacher sees for a lesson: their PERSONAL set where one
 *  exists, otherwise the TEAM set (plan §13.1).
 *
 *  CREATION RULE (Wave 1, #10): a board exists ONLY on an explicit action
 *  (opened, added as a resource, attached to a lesson/phase, or created from the
 *  Boards page). Opening Teach on a lesson with no boards must NOT auto-seed a
 *  default set — it returns an empty list so the workspace lands on the clean
 *  empty state. (The old lazy `buildDefaultBoardSet` seed was removed here and
 *  in supabase-source's `listBoardsForLesson` to honour that rule.) */
function setForLesson(masterLessonId: string, ownerId: string): Board[] {
  const lesson = resolveLessonId(masterLessonId);
  const owner = resolveOwnerId(ownerId);
  const forLesson = boards.filter((b) => b.masterLessonId === lesson);
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
    // SANDBOX SENTINEL (mirrors Supabase audit F4). The "sandbox" key is NOT a
    // real lesson — return the owner's lesson-LESS ephemeral personal boards
    // only (scope personal, this owner, masterLessonId == null, ephemeral ===
    // true), ordered by displayOrderWithinLesson. Never seed the default team
    // set for the sentinel — the sandbox is a private scratch surface.
    if (masterLessonId === SANDBOX_LESSON_ID) {
      const owner = resolveOwnerId(ownerId);
      return boards
        .filter(
          (b) =>
            b.scope === "personal" &&
            b.ownerId === owner &&
            b.masterLessonId == null &&
            b.ephemeral === true,
        )
        .slice()
        .sort((a, b) => a.displayOrderWithinLesson - b.displayOrderWithinLesson)
        .map(cloneBoard);
    }
    return setForLesson(masterLessonId, ownerId).map(cloneBoard);
  },

  async getBoard(boardId) {
    const board = boards.find((b) => b.id === boardId);
    return board ? cloneBoard(board) : null;
  },

  async createBoard(input) {
    // SANDBOX SENTINEL (mirrors Supabase audit F4). `createBoard({ masterLessonId:
    // SANDBOX_LESSON_ID, … })` creates a lesson-LESS ephemeral scratch board: treat
    // the sentinel like masterLessonId == null (so the board is stored lesson-less),
    // force ephemeral = true, and SKIP assertUnderCap (sandbox boards are uncapped
    // and disposable — same as createBlankBoard's ephemeral path).
    const isSandbox = input.masterLessonId === SANDBOX_LESSON_ID;
    // A new PERSONAL board counts toward the owner's cap (the user's "50 total,
    // must delete"); team-set boards (per-lesson fallback) are uncapped, and an
    // ephemeral SANDBOX board is uncapped too.
    if (input.scope === "personal" && input.ownerId != null && !isSandbox) {
      assertUnderCap(resolveOwnerId(input.ownerId));
    }
    const id = nextId("b");
    const now = new Date().toISOString();
    // Derive ordering authoritatively from the CURRENT sibling set (same
    // lesson + scope + owner), so two near-simultaneous creates reading a stale
    // caller-supplied length can't collide on `displayOrderWithinLesson` or the
    // default "Board N" title. The Supabase impl computes the same from rows.
    const lesson =
      input.masterLessonId == null || isSandbox
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
      // Sandbox boards are stored lesson-LESS (masterLessonId = null); a real
      // lesson id is stored verbatim for lesson-attached boards.
      masterLessonId: isSandbox ? null : (input.masterLessonId ?? null),
      ownerId: input.ownerId ?? null,
      scope: input.scope,
      title,
      displayOrderWithinLesson: nextOrder,
      templateId: input.templateId ?? null,
      // Sandbox boards are forced ephemeral so they never count toward the cap
      // (mirrors Supabase's `...(isSandbox ? { ephemeral: true } : {})`).
      ...(isSandbox ? { ephemeral: true } : {}),
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
    // PAGE-AWARE — mirrors the Supabase updateWidget semantics: a board with an
    // explicit `pages` jsonb is authoritative (widget edits go through
    // commitPages so page-2+ widgets are actually updated); a flat board takes
    // the direct array mutation (no pages jsonb is materialized, keeping the
    // flat upsertWidget embed path consistent — Supabase audit H1).
    const hit = findWidget(widgetId);
    if (!hit) throw new Error(`Widget not found: ${widgetId}`);
    if (hit.board.pages && hit.board.pages.length > 0) {
      const updatedPages = pagesOf(hit.board).map((p) =>
        p.id === hit.page.id
          ? {
              ...p,
              widgets: p.widgets.map((w) =>
                w.id === widgetId
                  ? {
                      ...w,
                      ...patch,
                      ...(patch.position
                        ? { position: { ...patch.position } }
                        : {}),
                    }
                  : w,
              ),
            }
          : p,
      );
      commitPages(hit.board, updatedPages);
      // Re-locate the updated widget from the now-committed pages so the
      // returned value matches the authoritative store (mirrors Supabase reload).
      for (const page of pagesOf(hit.board)) {
        const w = page.widgets.find((x) => x.id === widgetId);
        if (w) return { ...w, position: { ...w.position } };
      }
      // Unreachable — we just wrote the widget back.
      throw new Error(`Widget not found after update: ${widgetId}`);
    }
    // Flat board: mutate in-place (no pages jsonb materialised).
    Object.assign(hit.widget, patch);
    if (patch.position) hit.widget.position = { ...patch.position };
    hit.board.updatedAt = new Date().toISOString();
    return { ...hit.widget, position: { ...hit.widget.position } };
  },

  async deleteWidget(widgetId) {
    // PAGE-AWARE — mirrors the Supabase deleteWidget semantics: a board with
    // explicit pages drops the widget via commitPages (so non-page-0 widgets in
    // the authoritative jsonb are actually removed); a flat board splices the
    // flat array directly (audit H1 — no pages jsonb should be materialised).
    // Missing widget is a silent no-op (idempotent, same as Supabase).
    const hit = findWidget(widgetId);
    if (!hit) return;
    if (hit.board.pages && hit.board.pages.length > 0) {
      const prunedPages = pagesOf(hit.board).map((p) =>
        p.id === hit.page.id
          ? { ...p, widgets: p.widgets.filter((w) => w.id !== widgetId) }
          : p,
      );
      commitPages(hit.board, prunedPages);
      return;
    }
    // Flat board: splice from the flat array + stamp updatedAt.
    const idx = hit.board.widgets.findIndex((w) => w.id === widgetId);
    if (idx >= 0) {
      hit.board.widgets.splice(idx, 1);
      hit.board.updatedAt = new Date().toISOString();
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
    // Snapshot the FULL page model (titles, per-page backgrounds, widgets) so a
    // multi-page board doesn't collapse to page-0 when re-instantiated. Widgets
    // are stripped of boardId (a template is board-agnostic). The page-0 widgets
    // also become the flat `widgets` mirror for back-compat readers.
    const snapWidget = (w: Widget): Omit<Widget, "boardId"> => ({
      id: w.id,
      type: w.type,
      title: w.title,
      position: { ...w.position },
      canvas: w.canvas ? { ...w.canvas } : undefined,
      appearance: w.appearance ? { ...w.appearance } : undefined,
      displayOrder: w.displayOrder,
      pinned: w.pinned,
      config: w.config,
      state: w.state,
      persistence: w.persistence,
      gradeLevelId: w.gradeLevelId,
    });
    const snapPages: BoardPage[] = pagesOf(board).map((p) => ({
      id: p.id,
      order: p.order,
      title: p.title,
      background: p.background,
      widgets: p.widgets.map((w) => snapWidget(w) as Widget),
    }));
    const template: BoardTemplate = {
      id: nextId("tpl"),
      title,
      scope,
      ownerId: scope === "team" ? null : resolveOwnerId(ownerId),
      widgets: (snapPages[0]?.widgets ?? []).map((w) => snapWidget(w as Widget)),
      pages: snapPages,
      background: board.background ?? null,
      size: board.size,
      boardTheme: board.boardTheme ? { ...board.boardTheme } : undefined,
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

  async replacePersonalSetForLesson(masterLessonId, ownerId, sourceBoardIds) {
    // Sandbox-pin write path (the personal twin of pushBoardsToTeam). Empty
    // selection → no-op so the existing set is never wiped (parity with the
    // Supabase guard).
    if (sourceBoardIds.length === 0) return [];
    const lesson = resolveLessonId(masterLessonId);
    const owner = resolveOwnerId(ownerId);
    // De-dupe ids (a repeated id would mint multiple copies) — parity with the
    // Supabase H1 fix. Then resolve + VALIDATE every source up front: each must be
    // the caller's OWN sandbox board (personal, owned, lesson-less, ephemeral) —
    // mirrors the Supabase missing-source throw (M7) + source validation (M2). All
    // throwing happens BEFORE the destructive splice below, so a bad input never
    // shrinks/wipes the set.
    const ids = [...new Set(sourceBoardIds)];
    const sources = ids.map((sourceId) => {
      const source = boards.find((b) => b.id === sourceId);
      if (!source) throw new Error(`Board not found: ${sourceId}`);
      if (
        source.scope !== "personal" ||
        source.ownerId !== owner ||
        source.masterLessonId != null ||
        source.ephemeral !== true
      ) {
        throw new Error(
          "replacePersonalSetForLesson: sources must be your own sandbox boards (lesson-less, ephemeral, personal)",
        );
      }
      return source;
    });
    // CAP (parity with Supabase H1): pinned boards become KEPT personal boards that
    // count toward MAX_BOARDS_PER_TEACHER (the sandbox sources are ephemeral =
    // uncapped). Net kept after = (current kept) − (this lesson's old kept set,
    // which is replaced) + (new set).
    const keptTotal = myBoards(owner).length;
    const oldLessonKept = myBoards(owner).filter(
      (b) => b.masterLessonId === lesson,
    ).length;
    if (keptTotal - oldLessonKept + sources.length > MAX_BOARDS_PER_TEACHER) {
      throw new BoardCapError();
    }
    // BUILD-BEFORE-DELETE: build the full replacement list in memory FIRST; the
    // destructive splice happens ONLY after every replacement is ready.
    const now = new Date().toISOString();
    const replaced: Board[] = [];
    sources.forEach((source, order) => {
      const id = nextId("b");
      const pages = clonePagesOnto(source, id);
      const copy: Board = {
        ...cloneBoard(source),
        id,
        ownerId: owner,
        scope: "personal",
        masterLessonId: lesson,
        displayOrderWithinLesson: order,
        // A pinned set board is a kept personal board, never ephemeral / a
        // library copy; it records its provenance.
        ephemeral: false,
        libraryVisibility: "private",
        publishedBy: null,
        sourceBoardId: source.id,
        createdAt: now,
        updatedAt: now,
        // For a flat source, copy the widgets directly; for a multi-page source,
        // commitPages below overrides `widgets` with the re-minted page-0 mirror.
        widgets: cloneWidgetsOnto(source, id),
      };
      if (pages) commitPages(copy, pages);
      replaced.push(copy);
    });
    // Displacement: drop the owner's existing PERSONAL set for this lesson only
    // AFTER all replacements are built — guarantees an atomic swap with no
    // partial-wipe window even when a source id is stale or self-referential.
    for (let i = boards.length - 1; i >= 0; i -= 1) {
      const b = boards[i];
      if (
        b.masterLessonId === lesson &&
        b.scope === "personal" &&
        b.ownerId === owner
      ) {
        boards.splice(i, 1);
      }
    }
    // Now push the fully-built copies into the live store.
    boards.push(...replaced);
    return replaced.map(cloneBoard);
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
    // SANDBOX SENTINEL (mirrors Supabase audit F4): treat the "sandbox" key
    // the same as a null lesson — the board is stored lesson-LESS. No cap check
    // is performed here for any path (cap is enforced at keepBoard, mock parity).
    const lesson =
      input.masterLessonId == null || input.masterLessonId === SANDBOX_LESSON_ID
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

  async listBoardsForContext(ctx, ownerId, gradeLevelId) {
    const owner = resolveOwnerId(ownerId);
    const context = ctx as BoardContext;
    return boards
      .filter((b) => {
        const mine =
          b.scope === "personal" && b.ownerId === owner && b.ephemeral !== true;
        // Team-Library candidates are grade-scoped: a published board only
        // auto-surfaces for its own grade (parity with the Supabase query's
        // `.eq("grade_level_id", …)` filter). The owner's own personal boards
        // stay owner-scoped (a teacher's grade is implied by their boards).
        const teamLib =
          b.libraryVisibility === "team" && b.gradeLevelId === gradeLevelId;
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

  async copyBoardToLesson(boardId, masterLessonId, ownerId) {
    const owner = resolveOwnerId(ownerId);
    const lesson = resolveLessonId(masterLessonId);
    const source = boards.find((b) => b.id === boardId);
    if (!source) throw new Error(`Board not found: ${boardId}`);
    assertUnderCap(owner);
    const id = nextId("b");
    const now = new Date().toISOString();
    // A lesson-ATTACHED private copy (FULL pages) — the "open a library board into
    // the lesson in view" path (F11). Unlike copyTeamBoardToMine (detached), this
    // sets masterLessonId so the board joins the lesson's personal set. Mirrors the
    // Supabase copyBoardToLesson (full-page re-mint via clonePagesOnto+commitPages).
    const order = boards.filter(
      (b) =>
        b.masterLessonId === lesson &&
        b.scope === "personal" &&
        b.ownerId === owner,
    ).length;
    const pages = clonePagesOnto(source, id);
    const copy: Board = {
      ...cloneBoard(source),
      id,
      masterLessonId: lesson,
      ownerId: owner,
      scope: "personal",
      displayOrderWithinLesson: order,
      libraryVisibility: "private",
      publishedBy: null,
      ephemeral: undefined,
      sourceBoardId: source.id,
      widgets: cloneWidgetsOnto(source, id),
      createdAt: now,
      updatedAt: now,
    };
    if (pages) commitPages(copy, pages);
    boards.push(copy);
    return cloneBoard(copy);
  },

  // ── 5.31: appearance, repeat, free-form canvas, pages ──────────────────────

  async setBoardTheme(boardId, theme) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    board.boardTheme = { ...theme };
    board.updatedAt = new Date().toISOString();
    return cloneBoard(board);
  },

  async setBoardRepeat(boardId, repeat) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    // Real-link rules are stored as-is (the matcher resolves them live). Clone
    // so the caller's array can't mutate the store.
    board.repeat = repeat ? repeat.map((r) => ({ ...r })) : null;
    board.updatedAt = new Date().toISOString();
    return cloneBoard(board);
  },

  async upsertWidgetOnPage(boardId, pageId, widget) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
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
    commitPages(board, pages);
    return { ...next };
  },

  async moveWidget(widgetId, x, y) {
    const hit = findWidget(widgetId);
    if (!hit) throw new Error(`Widget not found: ${widgetId}`);
    const prev = hit.widget.canvas ?? { x: 0, y: 0, w: 320 };
    hit.widget.canvas = {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: prev.w,
    };
    hit.board.updatedAt = new Date().toISOString();
    return { ...hit.widget };
  },

  async resizeWidget(widgetId, w) {
    const hit = findWidget(widgetId);
    if (!hit) throw new Error(`Widget not found: ${widgetId}`);
    const prev = hit.widget.canvas ?? { x: 0, y: 0, w: 320 };
    hit.widget.canvas = { x: prev.x, y: prev.y, w: clampWidth(w) };
    hit.board.updatedAt = new Date().toISOString();
    return { ...hit.widget };
  },

  async setWidgetAppearance(widgetId, appearance) {
    const hit = findWidget(widgetId);
    if (!hit) throw new Error(`Widget not found: ${widgetId}`);
    hit.widget.appearance = { ...appearance };
    hit.board.updatedAt = new Date().toISOString();
    return { ...hit.widget };
  },

  async listPages(boardId) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    // ensureCanvas guarantees a free-form position for any widget added through
    // a grid-era path (e.g. right-panel resource embed via upsertWidget) so it
    // never stacks at the editor's default coordinate.
    return pagesOf(board).map((p) => ({
      ...p,
      widgets: p.widgets.map((w) => ({ ...ensureCanvas(w) })),
    }));
  },

  async addPage(boardId, title) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    const pages = pagesOf(board).map((p) => ({ ...p }));
    const page: BoardPage = {
      id: nextId("pg"),
      order: pages.length,
      title,
      widgets: [],
    };
    commitPages(board, [...pages, page]);
    return { ...page, widgets: [] };
  },

  async deletePage(boardId, pageId) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    const pages = pagesOf(board);
    // Never delete the only page — a board always has ≥1 page.
    if (pages.length <= 1) return cloneBoard(board);
    commitPages(
      board,
      pages.filter((p) => p.id !== pageId).map((p) => ({ ...p })),
    );
    return cloneBoard(board);
  },

  async reorderPages(boardId, orderedPageIds) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
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
    commitPages(board, reordered);
    return cloneBoard(board);
  },

  async updatePage(boardId, pageId, patch) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);
    const pages = pagesOf(board).map((p) => {
      if (p.id !== pageId) return p;
      const next = { ...p, ...patch };
      // `background: undefined` in the patch means "clear the override → inherit
      // the board": REMOVE the key entirely so the tri-state is truly `undefined`
      // (a stored `background: undefined` reads the same in JS but would round-trip
      // as an explicit key in jsonb — deleting keeps mock + Supabase identical).
      if ("background" in patch && patch.background === undefined) {
        delete next.background;
      }
      if ("title" in patch && patch.title === undefined) {
        delete next.title;
      }
      return next;
    });
    commitPages(board, pages);
    return cloneBoard(board);
  },

  async createBoardFromTemplate(templateId, ctx) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) throw new Error(`Template not found: ${templateId}`);
    const owner = resolveOwnerId(ctx.ownerId);
    // SANDBOX SENTINEL (mirrors createBoard / createBlankBoard, audit F4): the
    // "sandbox" key is NOT a real lesson — store the board lesson-LESS + ephemeral
    // (uncapped, disposable scratch), so it surfaces in the sandbox view (which
    // queries lesson-less ephemeral boards) instead of a board pinned to a fake
    // "sandbox" lesson id. A real lesson id is stored verbatim (attached board).
    const isSandbox = ctx.masterLessonId === SANDBOX_LESSON_ID;
    // A lesson-attached / detached personal board counts toward the cap; an
    // ephemeral sandbox board does not (cap is enforced at keepBoard).
    if (!isSandbox) assertUnderCap(owner);
    const id = nextId("b");
    const now = new Date().toISOString();
    const lesson =
      ctx.masterLessonId == null || isSandbox
        ? null
        : resolveLessonId(ctx.masterLessonId);
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
    // Materialize the FULL page model with fresh page + widget ids when the
    // template carries one; fall back to a single page from the flat widgets for
    // a legacy (pre-Wave-2) template. Board background/size/theme are restored.
    const tplPages: BoardPage[] =
      tpl.pages && tpl.pages.length > 0
        ? tpl.pages
        : [{ id: "tpl-p0", order: 0, widgets: tpl.widgets as Widget[] }];
    const newPages: BoardPage[] = tplPages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p, i) => ({
        id: nextId("pg"),
        order: i,
        title: p.title,
        background: p.background,
        widgets: p.widgets.map((w, j) => ({
          ...w,
          id: nextId("w"),
          boardId: id,
          displayOrder: j,
          position: { ...w.position },
          canvas: w.canvas ? { ...w.canvas } : undefined,
          appearance: w.appearance ? { ...w.appearance } : undefined,
        })),
      }));
    const board: Board = {
      id,
      masterLessonId: lesson,
      ownerId: owner,
      scope: "personal",
      title: tpl.title,
      displayOrderWithinLesson: nextOrder,
      templateId,
      background: tpl.background ?? null,
      size: tpl.size,
      boardTheme: tpl.boardTheme ? { ...tpl.boardTheme } : undefined,
      tags: [],
      // A sandbox-created board is ephemeral (uncapped scratch) — mirrors the
      // createBoard / createBlankBoard sandbox path.
      ...(isSandbox ? { ephemeral: true } : {}),
      // commitPages below makes `pages` authoritative and mirrors page-0 onto
      // `widgets`; seed `widgets` from page-0 so the shape is valid pre-commit.
      widgets: newPages[0]?.widgets ?? [],
      gradeLevelId: ctx.gradeLevelId ?? MOCK_GRADE_LEVEL_ID,
      createdAt: now,
      updatedAt: now,
    };
    boards.push(board);
    commitPages(board, newPages);
    return cloneBoard(board);
  },
};
