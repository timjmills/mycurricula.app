"use client";

// BoardLibraryModule — the Board Library panel body for the Teach "Boards"
// feature. Two tabs:
//   • My Boards   — the teacher's own reusable boards (counts toward the
//                   50-board cap; the header shows "{n} / 50").
//   • Team Library — boards published to the grade's shared library.
//
// The panel owns its data: it loads through the frozen `teach` repository
// (lib/teach/queries.ts), and a single `refresh()` re-reads after any mutation
// so the list, the cap badge, and the tag-filter pills always agree. Identity
// comes from `ME` (lib/mock/teachers.ts); the grade defaults to "g5" but is a
// prop so the weekday/grade set is never hard-coded internally.
//
// Search filters by title (case-insensitive). Tag-filter pills are derived from
// the tags actually present across the listed boards; selecting pills narrows
// via `boardHasTag` with AND semantics (a board must carry EVERY active tag).
//
// Cap handling: duplicate + pull can throw `BoardCapError` at the 50-board
// limit. We catch it and surface an inline notice instead of letting it throw.
//
// PRIVACY (CLAUDE.md): boards are structure-only; the sole person-name rendered
// is a Team-Library board's publisher (a teacher), resolved via TEACHER_BY_ID.
//
// Chrome (CLAUDE.md §4): tokens only via the .module.css; non-obvious controls
// carry onboarding tooltips; the destructive delete path uses a required
// tooltip (handled inside BoardLibraryCard).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Board, BoardTag } from "@/lib/types";
import { ME, TEACHER_BY_ID } from "@/lib/mock/teachers";
import {
  teach,
  MAX_BOARDS_PER_TEACHER,
  BoardCapError,
} from "@/lib/teach/queries";
import {
  boardHasTag,
  tagDisplayLabel,
  tagKey,
  TAG_KIND_LABEL,
} from "@/lib/teach/board-tags";
import { SearchIcon } from "../right/icons";
import { BoardLibraryCard } from "./BoardLibraryCard";
import styles from "./BoardLibrary.module.css";

type Tab = "mine" | "team";

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardLibraryModuleProps {
  /** Grade whose Team Library is shown. Defaults to the mock grade. */
  gradeLevelId?: string;
  /** Parent wires opening a board into the workspace. */
  onOpenBoard?: (board: Board) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stable identity for a tag-filter pill (kind + value). Mirrors `tagKey` but
 *  named locally to read as a filter id at call sites. */
function filterIdFor(tag: BoardTag): string {
  return tagKey(tag);
}

// ── BoardLibraryModule ───────────────────────────────────────────────────────

export function BoardLibraryModule({
  gradeLevelId = "g5",
  onOpenBoard,
}: BoardLibraryModuleProps): ReactNode {
  const ownerId = ME.id;

  const [tab, setTab] = useState<Tab>("mine");
  const [query, setQuery] = useState("");
  // Active tag filters, keyed by `tagKey` — AND semantics across the set.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    () => new Set(),
  );

  const [boards, setBoards] = useState<Board[]>([]);
  const [myCount, setMyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Inline cap notice (shown when a mutation hits the 50-board limit).
  const [capNotice, setCapNotice] = useState(false);
  // Which board (if any) is mid delete-confirm — only My Boards.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  // ── Load ────────────────────────────────────────────────────────────────
  // Re-read the active tab's list AND the cap count together so every surface
  // stays consistent after any mutation. Always refresh the count (the badge is
  // shown for My Boards regardless of which tab is active).
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        tab === "mine"
          ? teach.listMyBoards(ownerId)
          : teach.listTeamLibraryBoards(gradeLevelId),
        teach.countMyBoards(ownerId),
      ]);
      setBoards(list);
      setMyCount(count);
    } finally {
      setLoading(false);
    }
  }, [tab, ownerId, gradeLevelId]);

  useEffect(() => {
    // Reset transient UI when the tab changes, then load.
    setConfirmingDeleteId(null);
    setCapNotice(false);
    void refresh();
  }, [refresh]);

  // ── Derived: tag-filter pills present across the loaded boards ────────────
  // Deduped by kind+value; each pill shows its kind label + display value so a
  // teacher can tell a Subject pill from a Day pill at a glance.
  const filterPills = useMemo<BoardTag[]>(() => {
    const seen = new Set<string>();
    const out: BoardTag[] = [];
    for (const board of boards) {
      for (const tag of board.tags ?? []) {
        const id = filterIdFor(tag);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(tag);
      }
    }
    return out;
  }, [boards]);

  // Drop any active filter that no longer exists in the current tab's tag set
  // (prevents a stale filter from silently hiding everything after a tab swap).
  useEffect(() => {
    setActiveFilters((prev) => {
      if (prev.size === 0) return prev;
      const available = new Set(filterPills.map(filterIdFor));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (available.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filterPills]);

  // ── Derived: visible boards (search + AND tag filters) ────────────────────
  const visible = useMemo<Board[]>(() => {
    const q = query.trim().toLowerCase();
    // Resolve each active filter id back to its kind+value via the pill list.
    const activeTags = filterPills.filter((t) =>
      activeFilters.has(filterIdFor(t)),
    );
    return boards.filter((board) => {
      if (q && !board.title.toLowerCase().includes(q)) return false;
      for (const tag of activeTags) {
        if (!boardHasTag(board, tag.kind, tag.value)) return false; // AND
      }
      return true;
    });
  }, [boards, query, filterPills, activeFilters]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Each catches BoardCapError so the cap is a friendly inline message, not a
  // thrown error. Other failures are left to bubble (genuinely exceptional).

  const handleOpen = useCallback(
    (board: Board): void => {
      onOpenBoard?.(board);
    },
    [onOpenBoard],
  );

  const handleDuplicate = useCallback(
    async (board: Board): Promise<void> => {
      setCapNotice(false);
      try {
        await teach.duplicateBoard(board.id, ownerId);
        await refresh();
      } catch (err) {
        if (err instanceof BoardCapError) setCapNotice(true);
        else throw err;
      }
    },
    [ownerId, refresh],
  );

  const handlePublish = useCallback(
    async (board: Board): Promise<void> => {
      await teach.publishBoardToTeamLibrary(board.id, ownerId);
      await refresh();
    },
    [ownerId, refresh],
  );

  const handleAddToMine = useCallback(
    async (board: Board): Promise<void> => {
      setCapNotice(false);
      try {
        await teach.copyTeamBoardToMine(board.id, ownerId);
        await refresh();
      } catch (err) {
        if (err instanceof BoardCapError) setCapNotice(true);
        else throw err;
      }
    },
    [ownerId, refresh],
  );

  const handleDelete = useCallback(
    async (board: Board): Promise<void> => {
      setConfirmingDeleteId(null);
      await teach.deleteBoard(board.id);
      await refresh();
    },
    [refresh],
  );

  // ── Filter pill toggle ────────────────────────────────────────────────────
  const toggleFilter = useCallback((id: string): void => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const atCap = myCount >= MAX_BOARDS_PER_TEACHER;

  return (
    <div className={styles.root}>
      {/* ── Header: tabs + cap badge ─────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.tabs} role="tablist" aria-label="Board library">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            className={`${styles.tab} ${tab === "mine" ? styles.tabActive : ""}`}
            onClick={() => setTab("mine")}
          >
            My Boards
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "team"}
            className={`${styles.tab} ${tab === "team" ? styles.tabActive : ""}`}
            onClick={() => setTab("team")}
          >
            Team Library
          </button>
        </div>

        <div className={styles.capRow}>
          <span className={styles.capLabel}>Your boards</span>
          <span
            className={`${styles.capBadge} ${atCap ? styles.capBadgeFull : ""}`}
            title={`You have ${myCount} of ${MAX_BOARDS_PER_TEACHER} boards`}
          >
            {myCount} / {MAX_BOARDS_PER_TEACHER}
          </span>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search boards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search boards by title"
        />
      </div>

      {/* ── Tag-filter pills ─────────────────────────────────────────────── */}
      {filterPills.length > 0 ? (
        <div
          className={styles.filters}
          role="group"
          aria-label="Filter boards by tag"
        >
          {filterPills.map((tag) => {
            const id = filterIdFor(tag);
            const active = activeFilters.has(id);
            return (
              <button
                key={id}
                type="button"
                className={`${styles.filterPill} ${
                  active ? styles.filterPillActive : ""
                }`}
                aria-pressed={active}
                onClick={() => toggleFilter(id)}
                title={`Show only boards tagged ${TAG_KIND_LABEL[tag.kind]}: ${tagDisplayLabel(tag)}`}
              >
                <span className={styles.filterKind}>
                  {TAG_KIND_LABEL[tag.kind]}
                </span>
                {tagDisplayLabel(tag)}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ── Cap notice (inline) ──────────────────────────────────────────── */}
      {capNotice ? (
        <p className={styles.capNotice} role="status">
          You&rsquo;re at the {MAX_BOARDS_PER_TEACHER}-board limit — delete one
          to make room.
        </p>
      ) : null}

      {/* ── Body: list / empty / loading ─────────────────────────────────── */}
      <div className={styles.body}>
        {loading ? (
          <p className={styles.empty}>Loading boards…</p>
        ) : visible.length === 0 ? (
          <p className={styles.empty}>
            {boards.length === 0
              ? tab === "mine"
                ? "No boards yet. Build one on a lesson, then it shows up here."
                : "Your team hasn't shared any boards yet."
              : "No boards match your search and filters."}
          </p>
        ) : (
          visible.map((board) => (
            <BoardLibraryCard
              key={board.id}
              board={board}
              tab={tab}
              publisherName={
                tab === "team" && board.publishedBy
                  ? TEACHER_BY_ID[board.publishedBy]?.name
                  : undefined
              }
              onOpen={handleOpen}
              onDuplicate={handleDuplicate}
              onPublish={handlePublish}
              onAddToMine={handleAddToMine}
              onDelete={handleDelete}
              confirmingDelete={confirmingDeleteId === board.id}
              onRequestDelete={(b) => setConfirmingDeleteId(b.id)}
              onCancelDelete={() => setConfirmingDeleteId(null)}
            />
          ))
        )}
      </div>

      {/* ── Footer count ─────────────────────────────────────────────────── */}
      {!loading && boards.length > 0 ? (
        <p className={styles.count}>
          {visible.length === boards.length
            ? `${boards.length} board${boards.length === 1 ? "" : "s"}`
            : `${visible.length} of ${boards.length} boards`}
        </p>
      ) : null}
    </div>
  );
}
