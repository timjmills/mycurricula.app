"use client";

// BoardLibraryModule — the Board Library surface for the Teach "Boards" feature
// (5.31 Boards & Widgets handoff, screenshot 3-board-library.png).
//
// LAYOUT (matches the handoff):
//   • Top row — a Team / Personal segmented toggle + search + a "N / 50 boards
//     used" usage meter.
//   • Sidebar — My Library (All Boards / Favorites / Recent / Shared with Team /
//     My Boards / Archived) + Filter by Use (Lesson / Part of Lesson / Free
//     Board / Day / Week / Subject / Schedule Time / Whiteboard — colour-keyed).
//   • Main — colored filter pills + a reflowing board-card grid + a "Boards are
//     separate from resources" explainer + a Team Library strip + a Tips bar.
//
// FORKING / SEGMENTS: the Personal segment lists the teacher's own boards
// (counts toward the 50-board cap) via `listMyBoards`; the Team segment lists
// boards published to the grade's shared library via `listTeamLibraryBoards`.
// A single `refresh()` re-reads after any mutation so the list, the cap meter,
// and the filter pills always agree.
//
// REPEAT: the Repeat action opens the RepeatScheduleEditor inline; on save the
// module calls `teach.setBoardRepeat(boardId, repeat)` then refreshes.
//
// Cap handling: duplicate + pull can throw `BoardCapError` at the 50-board
// limit. We catch it and surface an inline notice instead of letting it throw.
//
// PRIVACY (CLAUDE.md): boards are structure-only; the sole person-name rendered
// is a Team-Library board's publisher (a teacher), resolved via TEACHER_BY_ID.
//
// Chrome (CLAUDE.md §4): tokens only via the .module.css; the Team/Personal
// toggle + filters are real labelled controls; the destructive delete path uses
// a required tooltip + two-step confirm (handled inside BoardLibraryCard).
// Responsive: full-screen on desktop AND usable inside a ~300–340px side panel —
// the sidebar collapses to a scrolling row and the grid reflows to one column.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  Board,
  BoardTag,
  BoardTagKind,
  RepeatSchedule,
} from "@/lib/types";
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
import { TeachIcon, type TeachIconName } from "@/components/teach/widgets";
import { BoardLibraryCard } from "./BoardLibraryCard";
import { RepeatScheduleEditor } from "./RepeatScheduleEditor";
import styles from "./BoardLibrary.module.css";

// `mine` = the Personal segment; `team` = the Team segment.
type Tab = "mine" | "team";

// ── Sidebar: "My Library" scopes ─────────────────────────────────────────────
// Presentational sub-scopes within a segment. `all` is the default; the others
// are presented but only `all` constrains the list today (the Favorites /
// Recent / Archived axes land with the backend). Surfacing them now matches the
// handoff IA without faking data.

type LibraryScope =
  | "all"
  | "favorites"
  | "recent"
  | "shared"
  | "myboards"
  | "archived";

const LIBRARY_SCOPES: ReadonlyArray<{
  id: LibraryScope;
  label: string;
  icon: TeachIconName;
}> = [
  { id: "all", label: "All Boards", icon: "grid" },
  { id: "favorites", label: "Favorites", icon: "star" },
  { id: "recent", label: "Recent", icon: "timer" },
  { id: "shared", label: "Shared with Team", icon: "users" },
  { id: "myboards", label: "My Boards", icon: "notes" },
  { id: "archived", label: "Archived", icon: "model" },
];

// ── Sidebar: "Filter by Use" (tag-kind filters) ──────────────────────────────
// Each entry filters the list to boards carrying a tag of the given KIND (any
// value). Colour-keyed to match the handoff. `whiteboard`/`free` filter the
// board's `whiteboard` flag rather than a tag kind.

interface UseFilter {
  id: string;
  label: string;
  icon: TeachIconName;
  /** Tag kind to match (any value), or "whiteboard" for the flag. */
  match: BoardTagKind | "whiteboard";
}

const USE_FILTERS: readonly UseFilter[] = [
  { id: "lesson", label: "Lesson", icon: "notes", match: "lesson" },
  { id: "phase", label: "Part of Lesson", icon: "check", match: "phase" },
  { id: "free", label: "Free Board", icon: "model", match: "whiteboard" },
  { id: "day", label: "Day", icon: "calendar", match: "weekday" },
  { id: "week", label: "Week", icon: "calendar", match: "week" },
  { id: "subject", label: "Subject", icon: "notes", match: "subject" },
  { id: "slot", label: "Schedule Time", icon: "timer", match: "slot" },
  { id: "whiteboard", label: "Whiteboard", icon: "model", match: "whiteboard" },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardLibraryModuleProps {
  /** Grade whose Team Library is shown. Defaults to the mock grade. */
  gradeLevelId?: string;
  /** Parent wires opening a board into the workspace. */
  onOpenBoard?: (board: Board) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stable identity for a tag-filter pill (kind + value). */
function filterIdFor(tag: BoardTag): string {
  return tagKey(tag);
}

/** Whether a board satisfies a "Filter by Use" entry. */
function boardMatchesUse(board: Board, use: UseFilter): boolean {
  if (use.match === "whiteboard") return board.whiteboard === true;
  return (board.tags ?? []).some((t) => t.kind === use.match);
}

// ── BoardLibraryModule ───────────────────────────────────────────────────────

export function BoardLibraryModule({
  gradeLevelId = "g5",
  onOpenBoard,
}: BoardLibraryModuleProps): ReactNode {
  const ownerId = ME.id;

  const [tab, setTab] = useState<Tab>("mine");
  const [scope, setScope] = useState<LibraryScope>("all");
  const [query, setQuery] = useState("");
  // Active tag-value filter pills, keyed by `tagKey` — AND semantics.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    () => new Set(),
  );
  // Active "Filter by Use" entry id (kind-level), or null.
  const [activeUse, setActiveUse] = useState<string | null>(null);

  const [boards, setBoards] = useState<Board[]>([]);
  const [myCount, setMyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [capNotice, setCapNotice] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  // The board whose Repeat editor is open (Personal only), or null.
  const [repeatingBoard, setRepeatingBoard] = useState<Board | null>(null);
  // Dismissible Tips bar.
  const [showTips, setShowTips] = useState(true);

  // ── Load ────────────────────────────────────────────────────────────────
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
    // Reset transient UI when the segment changes, then load.
    setConfirmingDeleteId(null);
    setRepeatingBoard(null);
    setCapNotice(false);
    void refresh();
  }, [refresh]);

  // ── Derived: tag-value filter pills present across the loaded boards ──────
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

  // Drop any active filter that no longer exists in the current segment's set.
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

  // ── Derived: visible boards (search + use filter + AND tag filters) ───────
  const visible = useMemo<Board[]>(() => {
    const q = query.trim().toLowerCase();
    const activeTags = filterPills.filter((t) =>
      activeFilters.has(filterIdFor(t)),
    );
    const use = activeUse
      ? (USE_FILTERS.find((u) => u.id === activeUse) ?? null)
      : null;
    return boards.filter((board) => {
      if (q && !board.title.toLowerCase().includes(q)) return false;
      if (use && !boardMatchesUse(board, use)) return false;
      for (const tag of activeTags) {
        if (!boardHasTag(board, tag.kind, tag.value)) return false; // AND
      }
      return true;
    });
  }, [boards, query, filterPills, activeFilters, activeUse]);

  // ── Derived: the Team Library strip (always the team set, capped to 4) ────
  const [teamStrip, setTeamStrip] = useState<Board[]>([]);
  useEffect(() => {
    let alive = true;
    void teach.listTeamLibraryBoards(gradeLevelId).then((list) => {
      if (alive) setTeamStrip(list.slice(0, 4));
    });
    return () => {
      alive = false;
    };
  }, [gradeLevelId]);

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  // Repeat: open the editor inline; on save write through the repo + refresh.
  const handleSaveRepeat = useCallback(
    async (repeat: RepeatSchedule): Promise<void> => {
      const board = repeatingBoard;
      if (!board) return;
      await teach.setBoardRepeat(board.id, repeat);
      setRepeatingBoard(null);
      await refresh();
    },
    [repeatingBoard, refresh],
  );

  // ── Filter toggles ──────────────────────────────────────────────────────
  const toggleFilter = useCallback((id: string): void => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleUse = useCallback((id: string): void => {
    setActiveUse((prev) => (prev === id ? null : id));
  }, []);

  const atCap = myCount >= MAX_BOARDS_PER_TEACHER;
  const capPct = Math.min(
    100,
    Math.round((myCount / MAX_BOARDS_PER_TEACHER) * 100),
  );

  return (
    <div className={styles.root}>
      {/* ── Top row: segment toggle + search + usage meter ───────────────── */}
      <div className={styles.topRow}>
        <div
          className={styles.segments}
          role="tablist"
          aria-label="Board library"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "team"}
            className={`${styles.segment} ${tab === "team" ? styles.segmentActive : ""}`}
            onClick={() => setTab("team")}
          >
            Team Boards
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            className={`${styles.segment} ${tab === "mine" ? styles.segmentActive : ""}`}
            onClick={() => setTab("mine")}
          >
            Personal Boards
          </button>
        </div>

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

        <div
          className={styles.meter}
          title={`You have ${myCount} of ${MAX_BOARDS_PER_TEACHER} boards`}
        >
          <span className={styles.meterLabel}>
            <strong className={atCap ? styles.meterFull : undefined}>
              {myCount}
            </strong>{" "}
            / {MAX_BOARDS_PER_TEACHER} boards used
          </span>
          <span className={styles.meterTrack} aria-hidden="true">
            <span
              className={`${styles.meterFill} ${atCap ? styles.meterFillFull : ""}`}
              style={{ width: `${capPct}%` }}
            />
          </span>
        </div>
      </div>

      {/* ── Body: sidebar + main ─────────────────────────────────────────── */}
      <div className={styles.shell}>
        {/* Sidebar */}
        <aside
          className={styles.sidebar}
          aria-label="Board library filters"
          title="Filter your boards by library scope or by use"
        >
          <nav className={styles.navGroup} aria-label="My library">
            <p className={styles.navHeading}>My Library</p>
            {LIBRARY_SCOPES.map((item) => {
              const active = scope === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                  aria-pressed={active}
                  onClick={() => setScope(item.id)}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    <TeachIcon name={item.icon} size={18} />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          <nav className={styles.navGroup} aria-label="Filter by use">
            <p className={styles.navHeading}>Filter by Use</p>
            {USE_FILTERS.map((item) => {
              const active = activeUse === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${styles[`use_${item.id}`] ?? ""} ${active ? styles.navItemActive : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleUse(item.id)}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    <TeachIcon name={item.icon} size={18} />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className={styles.usageCard}>
            <p className={styles.usageText}>
              You can create up to{" "}
              <strong>{MAX_BOARDS_PER_TEACHER} boards.</strong>
            </p>
            <p className={styles.usageSub}>
              You&rsquo;re using {myCount} boards.
            </p>
            <span className={styles.meterTrack} aria-hidden="true">
              <span
                className={`${styles.meterFill} ${atCap ? styles.meterFillFull : ""}`}
                style={{ width: `${capPct}%` }}
              />
            </span>
          </div>
        </aside>

        {/* Main */}
        <div className={styles.main}>
          {/* Colored tag-value filter pills */}
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
                    className={`${styles.filterPill} ${active ? styles.filterPillActive : ""}`}
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

          {/* Cap notice (inline) */}
          {capNotice ? (
            <p className={styles.capNotice} role="status">
              You&rsquo;re at the {MAX_BOARDS_PER_TEACHER}-board limit — delete
              one to make room.
            </p>
          ) : null}

          {/* Card grid / empty / loading */}
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
            <div className={styles.grid}>
              {visible.map((board) => (
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
                  onRepeat={(b) => setRepeatingBoard(b)}
                  onPublish={handlePublish}
                  onAddToMine={handleAddToMine}
                  onDelete={handleDelete}
                  confirmingDelete={confirmingDeleteId === board.id}
                  onRequestDelete={(b) => setConfirmingDeleteId(b.id)}
                  onCancelDelete={() => setConfirmingDeleteId(null)}
                />
              ))}
            </div>
          )}

          {/* Repeat editor (Personal) — inline below the grid for the open board */}
          {repeatingBoard ? (
            <section
              className={styles.repeatPanel}
              aria-label="Repeat schedule"
            >
              <p className={styles.repeatHead}>
                Repeat <strong>{repeatingBoard.title}</strong>
              </p>
              <RepeatScheduleEditor
                boardTitle={repeatingBoard.title}
                initial={repeatingBoard.repeat}
                onSave={(repeat) => void handleSaveRepeat(repeat)}
                onCancel={() => setRepeatingBoard(null)}
              />
            </section>
          ) : null}

          {/* Explainer + Team Library strip */}
          <div className={styles.footerGrid}>
            <div className={styles.explainer}>
              <p className={styles.explainerTitle}>
                Boards are separate from resources.
              </p>
              <p className={styles.explainerBody}>
                Drag a resource onto a board when you need it — resources live
                on their own and a board just references them.
              </p>
            </div>

            <div className={styles.teamLibrary}>
              <div className={styles.teamLibraryHead}>
                <span className={styles.teamLibraryTitle}>Team Library</span>
              </div>
              <p className={styles.teamLibrarySub}>
                Boards shared with your team
              </p>
              {teamStrip.length > 0 ? (
                <div className={styles.teamStrip}>
                  {teamStrip.map((board) => {
                    const by = board.publishedBy
                      ? TEACHER_BY_ID[board.publishedBy]?.name
                      : undefined;
                    return (
                      <button
                        key={board.id}
                        type="button"
                        className={styles.teamCard}
                        onClick={() => handleOpen(board)}
                        title={`Open ${board.title}`}
                      >
                        <span className={styles.teamCardTitle}>
                          {board.title}
                        </span>
                        {by ? (
                          <span className={styles.teamCardBy}>
                            <TeachIcon name="users" size={12} /> {by}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.teamEmpty}>No team-shared boards yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tips bar (dismissible) ───────────────────────────────────────── */}
      {showTips ? (
        <div className={styles.tips} role="note">
          <span className={styles.tipsIcon} aria-hidden="true">
            <TeachIcon name="star" size={16} />
          </span>
          <span className={styles.tipsText}>
            <strong>Tips:</strong> Duplicate a board to save time. Use Repeat to
            schedule it on multiple days or subjects. Share boards to
            collaborate with your team.
          </span>
          <button
            type="button"
            className={styles.tipsClose}
            onClick={() => setShowTips(false)}
            aria-label="Dismiss tips"
            title="Dismiss tips"
          >
            <TeachIcon name="x" size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
