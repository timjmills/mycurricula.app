"use client";

// BoardBackgroundPicker — the classroomscreen-style board background chooser
// (Teach Phase 3). A tabbed swatch grid (Colours · Patterns · Gradients) plus a
// "None" (paper) option. Picking a swatch persists `Board.background` through
// the `teach` repo and re-reads the board set so the canvas updates live.
//
// Tokens-only: every swatch renders `var(--teach-bg-<id>)` from the catalog in
// lib/teach/backgrounds.ts (whose CSS lives in app/tokens.css). SSR-safe —
// client-only, no storage read during render.

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import {
  BOARD_BACKGROUNDS,
  BOARD_BACKGROUND_CATEGORIES,
  boardBackgroundCss,
  type BoardBackgroundCategory,
} from "@/lib/teach/backgrounds";
import { teach } from "@/lib/teach/queries";
import type { Board } from "@/lib/types";
import styles from "./BoardBackgroundPicker.module.css";

export interface BoardBackgroundPickerProps {
  /** The board whose background is being set. */
  board: Board;
  /** Re-read the active board set after the repo write. */
  reloadBoards: () => Promise<Board[]>;
}

export function BoardBackgroundPicker({
  board,
  reloadBoards,
}: BoardBackgroundPickerProps): ReactNode {
  const [tab, setTab] = useState<BoardBackgroundCategory>("solid");
  const [busy, setBusy] = useState(false);
  // Optimistic selection so the swatch ring updates instantly while the repo
  // write + reload settle.
  const [selected, setSelected] = useState<string | null>(
    board.background ?? null,
  );

  async function apply(id: string | null): Promise<void> {
    setSelected(id);
    setBusy(true);
    try {
      await teach.updateBoard(board.id, { background: id });
      await reloadBoards();
    } finally {
      setBusy(false);
    }
  }

  const swatches = BOARD_BACKGROUNDS.filter((b) => b.category === tab);

  return (
    <div className={styles.root}>
      {/* Category tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Background type">
        <button
          type="button"
          role="tab"
          aria-selected={selected === null}
          className={`${styles.noneTab} ${selected === null ? styles.tabActive : ""}`}
          disabled={busy}
          onClick={() => void apply(null)}
        >
          None
        </button>
        {BOARD_BACKGROUND_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            className={`${styles.tab} ${tab === c.id ? styles.tabActive : ""}`}
            onClick={() => setTab(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Swatch grid */}
      <div className={styles.grid}>
        {swatches.map((bg) => {
          const isSel = selected === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              className={`${styles.swatch} ${isSel ? styles.swatchActive : ""}`}
              style={
                {
                  ["--swatch-bg" as string]: boardBackgroundCss(bg.id),
                } as CSSProperties
              }
              disabled={busy}
              aria-label={`${bg.label}${isSel ? " (selected)" : ""}`}
              aria-pressed={isSel}
              title={bg.label}
              onClick={() => void apply(bg.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
