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
import { TEACHER_BY_ID } from "@/lib/mock/teachers";
import { teachClient as teach } from "@/lib/teach/client";
import { MAX_BOARDS_PER_TEACHER, BoardCapError } from "@/lib/teach/queries";
import { useConsequenceToast } from "@/lib/consequence-toast";
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
// Sub-scopes within a segment. Each one that has backing data on the `Board`
// shape constrains the visible grid (see `boardMatchesScope`); the axes the data
// layer doesn't track yet (`favorites`, `archived`) honestly resolve to an empty
// set so the control still does something visible instead of silently showing
// the full, wrong list. Surfacing them now matches the handoff IA without faking
// data — when the backend adds a favorite/archive flag they light up for free.

type LibraryScope =
  | "all"
  | "favorites"
  | "recent"
  | "shared"
  | "myboards"
  | "archived";

// How "recent" is bounded — the N most-recently-updated boards in the segment.
const RECENT_LIMIT = 12;

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
  /** Grade whose Team Library is shown. Threaded from TeachWorkspace; may be
   *  undefined briefly under the live flag while the grade resolves (the team
   *  list waits for it rather than passing a mock slug to a uuid column). */
  gradeLevelId?: string;
  /** Parent wires opening a board into the workspace. */
  onOpenBoard?: (board: Board) => void;
  // ── Owner identity (Finding 3 fix) ─────────────────────────────────────────
  // Threaded from TeachWorkspace: `ME.id` under the mock flag, `currentUser.id`
  // (auth uid) under the live flag. Null briefly while the session resolves; the
  // data-load effect and all mutation handlers guard on it so a non-uuid slug
  // never reaches a uuid/RLS column.
  /** The current teacher's owner id (null while the auth session loads). */
  ownerId: string | null;
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

/** Whether a board passes a "My Library" scope (per-board predicate; the
 *  ordering/limit scopes like `recent` are applied to the whole list separately
 *  in `applyScope`). `favorites`/`archived` have no backing field on the Board
 *  shape yet, so they intentionally match nothing — an honest empty set rather
 *  than a silent no-op. */
function boardMatchesScope(board: Board, scope: LibraryScope): boolean {
  switch (scope) {
    case "all":
    case "recent":
      // `recent` filters nothing per-board; it only re-orders + caps the list.
      return true;
    case "shared":
      // Boards published to the grade's Team Library.
      return board.libraryVisibility === "team";
    case "myboards":
      // A teacher's own (owned) boards, excluding the shared team set.
      return board.ownerId != null && board.libraryVisibility !== "team";
    case "favorites":
    case "archived":
      // No favorite/archive flag on the Board shape yet — match nothing.
      return false;
    default:
      return true;
  }
}

/** Apply a scope's list-level transform (ordering + limit for `recent`); the
 *  per-board predicate has already run in the caller. */
function applyScope(list: Board[], scope: LibraryScope): Board[] {
  if (scope !== "recent") return list;
  return list
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, RECENT_LIMIT);
}

// ── BoardLibraryModule ───────────────────────────────────────────────────────

export function BoardLibraryModule({
  gradeLevelId,
  onOpenBoard,
  ownerId,
}: BoardLibraryModuleProps): ReactNode {
  const { showConsequence } = useConsequenceToast();

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
    // Guard: skip the load until the owner is resolved (auth not yet available
    // or mock path misconfigured). Show an empty, non-loading state so the UI
    // stays consistent; the effect below re-runs when ownerId becomes non-null.
    if (!ownerId) {
      setLoading(false);
      setBoards([]);
      return;
    }
    setLoading(true);
    try {
      // The Team Library query needs a resolved grade. Under the live flag the
      // grade resolves a tick after ownerId, so gradeLevelId can briefly be
      // undefined; passing the old "g5" mock slug to resolveGradeId would throw
      // (audit L4). Skip the team list until the grade arrives — the effect
      // re-runs (gradeLevelId is in the deps). "mine" never needs a grade.
      const listPromise =
        tab === "mine"
          ? teach.listMyBoards(ownerId)
          : gradeLevelId
            ? teach.listTeamLibraryBoards(gradeLevelId)
            : Promise.resolve([] as Board[]);
      const [list, count] = await Promise.all([
        listPromise,
        teach.countMyBoards(ownerId),
      ]);
      setBoards(list);
      setMyCount(count);
    } finally {
      setLoading(false);
    }
  }, [tab, ownerId, gradeLevelId]);

  useEffect(() => {
    // Reset transient UI when the segment changes, then load. Scope is reset to
    // "all" so a `myboards`/`shared` selection doesn't carry into a segment
    // where it would silently constrain (or empty) the list.
    setConfirmingDeleteId(null);
    setRepeatingBoard(null);
    setCapNotice(false);
    setScope("all");
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

  // ── Derived: visible boards (scope + search + use filter + AND tag filters) ─
  const visible = useMemo<Board[]>(() => {
    const q = query.trim().toLowerCase();
    const activeTags = filterPills.filter((t) =>
      activeFilters.has(filterIdFor(t)),
    );
    const use = activeUse
      ? (USE_FILTERS.find((u) => u.id === activeUse) ?? null)
      : null;
    const filtered = boards.filter((board) => {
      if (!boardMatchesScope(board, scope)) return false;
      if (q && !board.title.toLowerCase().includes(q)) return false;
      if (use && !boardMatchesUse(board, use)) return false;
      for (const tag of activeTags) {
        if (!boardHasTag(board, tag.kind, tag.value)) return false; // AND
      }
      return true;
    });
    return applyScope(filtered, scope);
  }, [boards, scope, query, filterPills, activeFilters, activeUse]);

  // ── Derived: the Team Library strip (always the team set, capped to 4) ────
  const [teamStrip, setTeamStrip] = useState<Board[]>([]);
  useEffect(() => {
    // Wait for a resolved grade before querying the Team Library (audit L4): under
    // the live flag gradeLevelId is briefly undefined, and a mock slug would throw
    // in resolveGradeId. The effect re-runs when the grade arrives.
    if (!gradeLevelId) {
      setTeamStrip([]);
      return;
    }
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
      // Guard: owner must be resolved before writing a new repo row.
      if (!ownerId) return;
      setCapNotice(false);
      try {
        await teach.duplicateBoard(board.id, ownerId);
        await refresh();
      } catch (err) {
        // Detect the cap robustly: under the live flag Next.js redacts the error
        // class across the Server Action boundary, so `instanceof` alone is not
        // reliable. Check the `.name` property as a fallback (M8).
        if (
          err instanceof BoardCapError ||
          (err as { name?: string } | null)?.name === "BoardCapError"
        ) {
          setCapNotice(true);
        } else {
          showConsequence({
            message: "Couldn't do that just now — please try again.",
          });
        }
      }
    },
    [ownerId, refresh, showConsequence],
  );

  const handlePublish = useCallback(
    async (board: Board): Promise<void> => {
      // Guard: publish writes the owner id into a uuid/RLS column; skip until
      // the real auth uid is resolved (audit finding #18).
      if (!ownerId) return;
      try {
        await teach.publishBoardToTeamLibrary(board.id, ownerId);
        await refresh();
      } catch (err) {
        // Publish can throw the "only your own personal board" ownership error
        // under the live flag. Surface feedback rather than letting it reject
        // unhandled from this fire-and-forget callback (M8).
        if (
          err instanceof BoardCapError ||
          (err as { name?: string } | null)?.name === "BoardCapError"
        ) {
          setCapNotice(true);
        } else {
          showConsequence({
            message: "Couldn't do that just now — please try again.",
          });
        }
      }
    },
    [ownerId, refresh, showConsequence],
  );

  const handleAddToMine = useCallback(
    async (board: Board): Promise<void> => {
      // Guard: owner must be resolved before copying a team board to mine.
      if (!ownerId) return;
      setCapNotice(false);
      try {
        await teach.copyTeamBoardToMine(board.id, ownerId);
        await refresh();
      } catch (err) {
        // Detect the cap robustly: under the live flag Next.js redacts the error
        // class across the Server Action boundary, so `instanceof` alone is not
        // reliable. Check the `.name` property as a fallback (M8).
        if (
          err instanceof BoardCapError ||
          (err as { name?: string } | null)?.name === "BoardCapError"
        ) {
          setCapNotice(true);
        } else {
          showConsequence({
            message: "Couldn't do that just now — please try again.",
          });
        }
      }
    },
    [ownerId, refresh, showConsequence],
  );

  const handleDelete = useCallback(
    async (board: Board): Promise<void> => {
      setConfirmingDeleteId(null);
      await teach.deleteBoard(board.id);
      // Deleting frees a slot, so a stale "at the limit" notice no longer holds.
      setCapNotice(false);
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
                : scope === "favorites"
                  ? "No favorite boards yet — star a board to keep it here."
                  : scope === "archived"
                    ? "No archived boards."
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
