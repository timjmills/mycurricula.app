"use client";

// BoardSettingsPopover — the ⚙ board-settings surface for the active teaching
// board (docs/teach-view-plan.md §9, §13.5; audit G1). Reached from the sub-bar
// gear (TeachSubBar → onBoardSettings). It offers:
//
//   • Rename board — edits the active board's title through the `teach` repo.
//   • Reorder hint — boards reorder by dragging thumbnails in the Boards module
//     (no inline reorder here; this is the discoverability hint the audit asks
//     for).
//   • Reset board — DESTRUCTIVE. Clears every widget on the active board via the
//     repo, gated by an always-on (`required`) tooltip + a two-step confirm +
//     a consequence toast naming the effect (CLAUDE.md §4).
//
// Lives under components/teach/board/ but is mounted by TeachWorkspace, which
// owns the active board + reloadBoards. Tokens-only; SSR-safe (client-only).

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@/components/ui";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { teachClient as teach } from "@/lib/teach/client";
import type { Board } from "@/lib/types";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./BoardSettingsPopover.module.css";

export interface BoardSettingsPopoverProps {
  /** The board being configured. */
  board: Board;
  /** Close the popover. */
  onClose: () => void;
  /** Re-read the active board set after a mutating repo call. */
  reloadBoards: () => Promise<Board[]>;
}

export function BoardSettingsPopover({
  board,
  onClose,
  reloadBoards,
}: BoardSettingsPopoverProps): ReactNode {
  const { showConsequence } = useConsequenceToast();
  const [title, setTitle] = useState(board.title);
  const [busy, setBusy] = useState(false);
  // Two-step confirm gate for the destructive board reset.
  const [confirmReset, setConfirmReset] = useState(false);
  // Authoritative widget count ACROSS ALL PAGES (gate G3-2). `board.widgets` is
  // only the page-0 mirror, so gating the reset on it would wrongly disable the
  // button — and mislabel the count — for a board whose widgets live on later
  // pages. Load the real page model once on open; fall back to the flat mirror
  // until it resolves.
  const [allWidgetCount, setAllWidgetCount] = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusTrap({ containerRef: dialogRef, initialFocusRef: inputRef });

  // Load the authoritative all-pages widget count for the reset gate/label.
  useEffect(() => {
    let alive = true;
    void teach.listPages(board.id).then((pages) => {
      if (alive) setAllWidgetCount(pages.flatMap((p) => p.widgets).length);
    });
    return () => {
      alive = false;
    };
  }, [board.id]);

  // Esc closes (focus trap owns Tab containment; Esc-to-close lives here).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleRename(): Promise<void> {
    const next = title.trim();
    if (!next || next === board.title) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await teach.updateBoard(board.id, { title: next });
      await reloadBoards();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(): Promise<void> {
    setConfirmReset(false);
    setBusy(true);
    try {
      // Clear every widget on the active board, ACROSS ALL PAGES. `board.widgets`
      // is only the page-0 flat mirror, so a multi-page board would keep its
      // later-page widgets while the toast claimed "all removed" (gate N3). Read
      // the authoritative page model and gather every page's widgets; fall back
      // to the flat mirror if the repo returned no pages. Delete one-by-one so
      // the mock + future Supabase impls behave identically.
      const pages = await teach.listPages(board.id);
      const pageIds = pages.flatMap((p) => p.widgets).map((w) => w.id);
      const ids = pageIds.length > 0 ? pageIds : board.widgets.map((w) => w.id);
      for (const id of ids) {
        await teach.deleteWidget(id);
      }
      await reloadBoards();
      showConsequence({
        message: `"${board.title}" was reset — all its widgets were removed.`,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // All-pages count once loaded; the page-0 mirror as the loading fallback.
  const widgetCount = allWidgetCount ?? board.widgets.length;

  return (
    <div
      className={styles.scrim}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Settings for the "${board.title}" board`}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>Board settings</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close board settings"
          >
            ✕
          </button>
        </header>

        {/* ── Rename ──────────────────────────────────────────────────────── */}
        <label className={styles.fieldLabel} htmlFor="board-rename-input">
          Board name
        </label>
        <div className={styles.renameRow}>
          <input
            id="board-rename-input"
            ref={inputRef}
            className={styles.input}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename();
            }}
            aria-label="Board name"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={() => void handleRename()}
          >
            Save
          </Button>
        </div>

        {/* Board paper/background now lives in the editor's appearance popover
            (the "Appearance" toolbar button) so it sits next to the board and
            renders live — one place, #11. */}

        {/* ── Reorder hint ────────────────────────────────────────────────── */}
        <p className={styles.hint}>
          To reorder boards, drag a board thumbnail up or down in the Boards
          panel on the left.
        </p>

        {/* ── Reset board (DESTRUCTIVE) ───────────────────────────────────── */}
        <div className={styles.dangerZone}>
          <div className={styles.dangerLabel}>Reset board</div>
          <p className={styles.hint}>
            Remove every widget on this board ({widgetCount}). The board itself
            stays; this only clears its contents.
          </p>
          {confirmReset ? (
            <div className={styles.dangerRow}>
              <Tooltip
                required
                side="top"
                content="Permanently remove every widget on this board — this can't be undone"
              >
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void handleReset()}
                >
                  Remove all widgets
                </Button>
              </Tooltip>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Tooltip
              required
              side="top"
              content="Clear all widgets from this board — a destructive reset"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || widgetCount === 0}
                onClick={() => setConfirmReset(true)}
              >
                Reset board
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
