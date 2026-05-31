// BoardEmptyState — the T9 empty-board CTA (docs/teach-view-plan.md §4.6). A
// dashed card with "Add your first widget", contextual copy, and one-tap widget
// pills that open the picker pre-targeting the board's first cell (0,0). Pill
// tints come from each type's board tint token via the catalog.

"use client";

import type { CSSProperties, ReactNode } from "react";
import type { BoardCellTarget } from "@/lib/teach/types";
import { WIDGET_CATALOG, boardTintVar, TeachIcon } from "../widgets";
import styles from "./board.module.css";

export interface BoardEmptyStateProps {
  boardId: string;
  boardTitle: string;
  /** Open the picker (or directly add) for the chosen cell. The pills pass the
   *  board's first cell so a one-tap add lands at (0,0). */
  onPick?: (target: BoardCellTarget) => void;
}

// The eight pills the prototype surfaces (a curated subset of the 12 types).
const PILL_TYPES = [
  "timer",
  "objective",
  "groups",
  "agenda",
  "notes",
  "slides",
  "youtube",
  "poll",
] as const;

export function BoardEmptyState({
  boardId,
  boardTitle,
  onPick,
}: BoardEmptyStateProps): ReactNode {
  const firstCell: BoardCellTarget = { boardId, col: 0, row: 0 };
  const pills = PILL_TYPES.map((t) =>
    WIDGET_CATALOG.find((m) => m.type === t),
  ).filter((m): m is NonNullable<typeof m> => Boolean(m));

  return (
    <div className={styles.emptyBoard}>
      <div className={styles.emptyBoardCard}>
        <span className={styles.emptyBoardIcon}>
          <TeachIcon name="plus" size={26} />
        </span>
        <div className={styles.emptyBoardTitle}>Add your first widget</div>
        <div className={styles.emptyBoardText}>
          This {boardTitle} board is empty. Drag a resource from the right
          panel, or pick a widget below to get started.
        </div>
        <div className={styles.emptyBoardPills}>
          {pills.map((meta) => {
            const tint = boardTintVar(meta.tint);
            return (
              <button
                key={meta.type}
                type="button"
                className={styles.pill}
                style={
                  tint
                    ? ({ ["--pill-bg" as string]: tint } as CSSProperties)
                    : undefined
                }
                onClick={() => onPick?.(firstCell)}
              >
                <TeachIcon name={meta.icon} size={13} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
