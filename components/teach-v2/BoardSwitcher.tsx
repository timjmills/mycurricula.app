"use client";

// components/teach-v2/BoardSwitcher.tsx — the v2 board-set switcher (Wave 11
// reachability fix, proposals 1+2). A lesson has up to N boards (Warm-Up …
// Exit Ticket); v1 switched them via the sub-bar numbered pill strip. The v2
// shell dropped the sub-bar, so this restores the CORE mid-lesson function in
// the board header: a pill row of the lesson's boards (active highlighted) →
// selectBoard, a trailing "+ Add board", and a "Browse boards" affordance so
// the Board Library is reachable with a board already open (not just the empty
// state). At >4 boards the pills fold into a dropdown so the header never
// overflows.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Board } from "@/lib/types";
import { Tooltip } from "@/components/ui";
import { V2Icon } from "./icons";
import styles from "./BoardSwitcher.module.css";

const PILL_LIMIT = 4;

export interface BoardSwitcherProps {
  boards: Board[];
  activeBoardId: string | null;
  onSelect: (boardId: string) => void;
  /** Add a board to the active lesson / sandbox. Undefined in standalone scope. */
  onAddBoard: (() => void) | undefined;
  /** Open the Board Library overlay (browse + reuse boards). */
  onBrowseBoards: () => void;
  /** Signal dropdown open-state up so the shell's true-fullscreen Esc defers
   *  while the board menu is on top (top-layer-only Esc). */
  onPopoverChange?: (open: boolean) => void;
}

export function BoardSwitcher({
  boards,
  activeBoardId,
  onSelect,
  onAddBoard,
  onBrowseBoards,
  onPopoverChange,
}: BoardSwitcherProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onPopoverChange?.(menuOpen);
    return () => onPopoverChange?.(false);
  }, [menuOpen, onPopoverChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const active = boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;
  const overflow = boards.length > PILL_LIMIT;

  return (
    <div className={styles.switcher} role="group" aria-label="Boards in this lesson">
      {overflow ? (
        // Dropdown form: active board + a menu of the full set.
        <div className={styles.dropdownWrap} ref={menuRef}>
          <button
            type="button"
            className={`${styles.pill} ${styles.pillOn} ${styles.dropdownTrigger}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            title="Switch board"
          >
            <span className={styles.pillLabel}>{active?.title ?? "Board"}</span>
            <span className={styles.count}>{boards.length}</span>
            <V2Icon name="expand" size={13} />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu" aria-label="Switch board">
              {boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={b.id === active?.id}
                  className={`${styles.menuItem} ${b.id === active?.id ? styles.menuItemOn : ""}`}
                  onClick={() => {
                    onSelect(b.id);
                    setMenuOpen(false);
                  }}
                >
                  {b.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        // Pill row form: one pill per board.
        boards.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`${styles.pill} ${b.id === active?.id ? styles.pillOn : ""}`}
            aria-pressed={b.id === active?.id}
            onClick={() => onSelect(b.id)}
            title={`Switch to ${b.title}`}
          >
            <span className={styles.pillLabel}>{b.title}</span>
          </button>
        ))
      )}

      {onAddBoard ? (
        <Tooltip content="Add another board to this lesson" side="bottom" tooltipId="teach-v2-add-board">
          <button
            type="button"
            className={styles.iconPill}
            aria-label="Add a board"
            onClick={onAddBoard}
          >
            <V2Icon name="plus" size={15} />
          </button>
        </Tooltip>
      ) : null}
      <Tooltip content="Browse your boards and the team's, and open one here" side="bottom" tooltipId="teach-v2-browse-boards">
        <button
          type="button"
          className={styles.iconPill}
          aria-label="Browse boards"
          onClick={onBrowseBoards}
        >
          <V2Icon name="grip" size={15} />
        </button>
      </Tooltip>
    </div>
  );
}
