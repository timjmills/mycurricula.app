"use client";

// TeachSubBar.tsx — the Teach workspace's secondary toolbar
// (docs/teach-view-plan.md §3, §4.1, §4.2, §7; Agent A). Left-to-right
// (prototype `SubBar`):
//   Week ▾ · Subject ▾ · board tab strip (numbered pills + Add Board) ·
//   spacer · layout toolbar (1up…3×3) · ⚙ board settings · action cluster
//   (Present · Full Screen · Pop-Out[soon] · Duplicate[soon]).
//
// A PURE presentational component. Board data + the active subject arrive via
// props (the integrating component reads the teach repository / usePlanner()).
// It dispatches against the frozen `TeachWorkspaceAction` union:
//   • board pill          → { type: "selectBoard", boardId }
//   • layout toolbar      → { type: "setLayout", layout }
//   • Present             → { type: "setPresent", present: true }
//   • Full Screen         → { type: "setFullscreen", fullscreen } + Fullscreen API
//
// Pop-Out + Duplicate are Phase 2 (plan §7) — rendered as `FutureControl`
// "Soon" tiles, never live.

import type { Dispatch, KeyboardEvent, ReactNode } from "react";
import { useCallback } from "react";
import type { TeachWorkspaceAction } from "../TeachWorkspace";
import type { TeachWorkspaceState } from "@/lib/teach/types";
import type { Board, SubjectId } from "@/lib/types";
import { FutureControl, Tooltip } from "@/components/ui";
import styles from "./TeachChrome.module.css";

// The fixed-grid layout toolbar (1up / 2×2 / …) was retired with the move to the
// free-form canvas editor (5.31): a board's widgets are now positioned freely,
// so there is no grid arrangement to pick. Page management lives in the editor.

/** Id of the center board region — the board-tab strip is a `role="tablist"`
 *  whose tabs control this panel (audit A4). The center <main> in
 *  TeachWorkspace carries this id + `role="tabpanel"`. */
export const TEACH_CENTER_PANEL_ID = "teach-center-board";

/** Per-board tab id so each tab can be `aria-labelledby`-referenced and roving
 *  tabindex can move DOM focus to a specific tab. */
function boardTabId(boardId: string): string {
  return `teach-board-tab-${boardId}`;
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface TeachSubBarProps {
  state: TeachWorkspaceState;
  dispatch: Dispatch<TeachWorkspaceAction>;
  /** Boards for the active lesson, in display order — the numbered pill strip. */
  boards: readonly Board[];
  /** Subject of the active lesson — drives the subject-tinted active pill via
   *  `.cp-subj.<id>` on the strip root. Falls back to math when absent. */
  subject?: SubjectId;
  /** Week label for the Week ▾ chip (e.g. "Week 12"). */
  weekLabel?: string;
  /** Subject label for the Subject ▾ chip (e.g. "Math"). */
  subjectLabel?: string;
  /** Add a new board to the active lesson. Optional. */
  onAddBoard?: () => void;
  /** Open board settings (⚙). Optional. */
  onBoardSettings?: () => void;
  /** Request the whole-view Fullscreen API toggle. The reducer flag is set here;
   *  the actual `requestFullscreen()` / `exitFullscreen()` is the caller's so
   *  the API lives with the element it targets. Optional. */
  onToggleFullscreen?: (next: boolean) => void;
  /** Open the Board Library overlay (Team/Personal browse). Optional. */
  onOpenBoardLibrary?: () => void;
  /** Open the Widget Library overlay (browse + add a widget). Optional. */
  onOpenWidgetLibrary?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeachSubBar({
  state,
  dispatch,
  boards,
  subject = "math",
  weekLabel = "This week",
  subjectLabel = "Subject",
  onAddBoard,
  onBoardSettings,
  onToggleFullscreen,
  onOpenBoardLibrary,
  onOpenWidgetLibrary,
}: TeachSubBarProps): ReactNode {
  const handlePresent = useCallback(
    () => dispatch({ type: "setPresent", present: true }),
    [dispatch],
  );

  const handleFullscreen = useCallback(() => {
    const next = !state.fullscreen;
    dispatch({ type: "setFullscreen", fullscreen: next });
    onToggleFullscreen?.(next);
  }, [state.fullscreen, dispatch, onToggleFullscreen]);

  // Roving tabindex + Arrow-key navigation across the board tab strip
  // (audit A4 — WAI-ARIA tabs expect Left/Right to move between tabs).
  const handleBoardTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (
        e.key !== "ArrowRight" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowUp"
      ) {
        return;
      }
      if (boards.length === 0) return;
      e.preventDefault();
      const currentIndex = Math.max(
        0,
        boards.findIndex((b) => b.id === state.activeBoardId),
      );
      const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + delta + boards.length) % boards.length;
      const next = boards[nextIndex];
      if (!next) return;
      dispatch({ type: "selectBoard", boardId: next.id });
      e.currentTarget
        .querySelector<HTMLButtonElement>(`[id="${boardTabId(next.id)}"]`)
        ?.focus();
    },
    [boards, state.activeBoardId, dispatch],
  );

  return (
    <div className={styles.subBar}>
      {/* Week ▾ — the week/subject jumpers are not wired in v1 (audit B3).
          Rendered as honest disabled "Soon" chips (the active week/subject are
          still shown as live context) rather than dead dropdown buttons. */}
      <FutureControl
        variant="ghost"
        label={weekLabel}
        trailingIcon={<ChevronDownIcon />}
        tooltip="Switch which week you're teaching from — coming after beta"
      />

      {/* Subject ▾ — Soon (audit B3). */}
      <FutureControl
        variant="ghost"
        label={subjectLabel}
        trailingIcon={<ChevronDownIcon />}
        tooltip="Filter the board strip to one subject — coming after beta"
      />

      {/* Board tab strip — subject-tinted active pill via .cp-subj. */}
      <div
        className={`${styles.boardStrip} cp-subj ${subject}`}
        role="tablist"
        aria-label="Lesson boards"
        onKeyDown={handleBoardTabKeyDown}
      >
        {boards.map((board, i) => {
          const isActive = board.id === state.activeBoardId;
          return (
            <Tooltip
              key={board.id}
              content={`Switch to the "${board.title}" board — its widgets replace the canvas`}
              side="bottom"
              tooltipId="teach-board-tab"
            >
              <button
                type="button"
                id={boardTabId(board.id)}
                role="tab"
                aria-selected={isActive}
                aria-controls={isActive ? TEACH_CENTER_PANEL_ID : undefined}
                // Roving tabindex — only the active board tab is tab-reachable;
                // Arrow keys move between the rest (handled on the tablist).
                tabIndex={isActive ? 0 : -1}
                className={`${styles.boardTab} ${isActive ? styles.boardTabActive : ""}`}
                onClick={() =>
                  dispatch({ type: "selectBoard", boardId: board.id })
                }
              >
                <span className={styles.boardNum} aria-hidden="true">
                  {i + 1}
                </span>
                {board.title}
              </button>
            </Tooltip>
          );
        })}

        {/* + Add Board */}
        <Tooltip
          content="Add a new board to this lesson (a new teaching phase)"
          side="bottom"
          tooltipId="teach-add-board"
        >
          {/* No chevron (audit G7): Add Board is a direct action, not a menu —
              a dropdown caret would imply options that don't exist. */}
          <button
            type="button"
            className={styles.addBoard}
            onClick={onAddBoard}
            aria-label="Add board"
          >
            <PlusIcon />
            Add Board
          </button>
        </Tooltip>
      </div>

      <div className={styles.spacer} aria-hidden="true" />

      {/* Library entries — browse/add boards + widgets (5.31). */}
      {onOpenWidgetLibrary ? (
        <Tooltip
          content="Browse the full widget library and add one to this board"
          side="bottom"
          tooltipId="teach-widget-library"
        >
          <button
            type="button"
            className={styles.contextChip}
            onClick={onOpenWidgetLibrary}
            aria-label="Open widget library"
          >
            <PlusIcon />
            Widgets
          </button>
        </Tooltip>
      ) : null}
      {onOpenBoardLibrary ? (
        <Tooltip
          content="Open the board library — browse your boards and the team's, and reuse them"
          side="bottom"
          tooltipId="teach-board-library"
        >
          <button
            type="button"
            className={styles.contextChip}
            onClick={onOpenBoardLibrary}
            aria-label="Open board library"
          >
            Library
          </button>
        </Tooltip>
      ) : null}

      {/* ⚙ board settings. */}
      <Tooltip
        content="Board settings — rename, reorder, or reset this board"
        side="bottom"
        tooltipId="teach-board-settings"
      >
        <button
          type="button"
          className={styles.gearBtn}
          onClick={onBoardSettings}
          aria-label="Board settings"
        >
          <CogIcon />
        </button>
      </Tooltip>

      {/* Action cluster. */}
      <div className={styles.actionCluster}>
        {/* Present — Phase 1 functional. */}
        <Tooltip
          content="Present this board full-screen for the class — all editing chrome hides"
          side="bottom"
          tooltipId="teach-present"
        >
          <button
            type="button"
            className={`${styles.boardTab} cp-subj ${subject} ${styles.boardTabActive}`}
            onClick={handlePresent}
            aria-label="Present this board"
          >
            <PlayIcon />
            Present
          </button>
        </Tooltip>

        {/* Full Screen — Phase 1 functional (Fullscreen API). */}
        <Tooltip
          content={
            state.fullscreen
              ? "Exit full screen — show the browser chrome again"
              : "Fill the whole screen with the Teach workspace (hides browser chrome)"
          }
          side="bottom"
          tooltipId="teach-fullscreen"
        >
          <button
            type="button"
            className={styles.contextChip}
            onClick={handleFullscreen}
            aria-pressed={state.fullscreen}
            aria-label={state.fullscreen ? "Exit full screen" : "Full screen"}
          >
            <FullscreenIcon />
            Full Screen
          </button>
        </Tooltip>

        {/* Pop-Out + Duplicate — Phase 2 (plan §7). */}
        <FutureControl
          label="Pop-Out"
          leadingIcon={<PopOutIcon />}
          tooltip="Pop the board into a second window for a second monitor — coming after beta"
        />
        <FutureControl
          label="Duplicate"
          leadingIcon={<DuplicateIcon />}
          tooltip="Mirror this board to a second window — coming after beta"
        />
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function ChevronDownIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PlusIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CogIcon(): ReactNode {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15H4a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function PlayIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function FullscreenIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" />
    </svg>
  );
}

function PopOutIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6" />
      <path d="M10 14L20 4" />
      <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

function DuplicateIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="12" height="12" rx="1" />
      <path d="M4 16V4h12" />
    </svg>
  );
}
