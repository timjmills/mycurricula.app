"use client";

// BoardLibraryCard — one board rendered as a compact card in the Board Library
// panel (Teach "Boards" feature). Purely presentational: every async mutation
// (open / duplicate / publish / delete / pull) lives in BoardLibraryModule and
// is threaded in as a callback. The card just renders the board's identity —
// title, tag chips, widget count, publisher (team cards only) — and the action
// row appropriate to the active tab.
//
// PRIVACY (CLAUDE.md): boards carry STRUCTURE only. The only person-name shown
// is the PUBLISHER of a Team-Library board (a teacher), never a student.
//
// Chrome rules (CLAUDE.md §4): tokens only — colour/type/radius/spacing come
// from app/tokens.css via the .module.css. Tag chips are rendered inline here
// (a tiny self-contained implementation using tagDisplayLabel) so this card has
// no hard dependency on the parallel BoardTagChips component.

import type { ReactNode } from "react";
import type { Board } from "@/lib/types";
import { tagDisplayLabel, tagKey } from "@/lib/teach/board-tags";
import { Button, Tooltip } from "@/components/ui";
import styles from "./BoardLibrary.module.css";

// ── Inline tag chips ─────────────────────────────────────────────────────────
// Deliberately self-contained (no import from @/components/teach/board) so this
// file builds on its own while a sibling agent lands the shared BoardTagChips.
// Each chip uses the shared label helper so wording never drifts from the rest
// of the app; styling is the tokens-only .tagChip class.

function InlineTagChips({ board }: { board: Board }): ReactNode {
  const tags = board.tags ?? [];
  if (tags.length === 0) return null;
  return (
    <div className={styles.tagRow}>
      {tags.map((tag) => (
        <span key={tagKey(tag)} className={styles.tagChip}>
          {tagDisplayLabel(tag)}
        </span>
      ))}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardLibraryCardProps {
  /** The board to render. */
  board: Board;
  /** Which tab the card lives in — drives the action set. */
  tab: "mine" | "team";
  /** Display name of the publisher (team cards only); falls back gracefully. */
  publisherName?: string;
  /** Open this board in the workspace (both tabs). */
  onOpen: (board: Board) => void;
  /** Duplicate as an independent copy (My Boards). */
  onDuplicate?: (board: Board) => void;
  /** Publish a copy to the Team Library (My Boards). */
  onPublish?: (board: Board) => void;
  /** Delete this board (My Boards, destructive). */
  onDelete?: (board: Board) => void;
  /** Pull a Team-Library board into My Boards. */
  onAddToMine?: (board: Board) => void;
  // ── Delete two-step confirm (state owned by the module so only one card is
  //    ever mid-confirm) ──────────────────────────────────────────────────────
  /** True when this card is showing its inline "Delete? / Cancel" confirm. */
  confirmingDelete?: boolean;
  /** Ask the module to enter the confirm state for this card. */
  onRequestDelete?: (board: Board) => void;
  /** Ask the module to leave the confirm state. */
  onCancelDelete?: () => void;
}

// ── BoardLibraryCard ─────────────────────────────────────────────────────────

export function BoardLibraryCard({
  board,
  tab,
  publisherName,
  onOpen,
  onDuplicate,
  onPublish,
  onDelete,
  onAddToMine,
  confirmingDelete = false,
  onRequestDelete,
  onCancelDelete,
}: BoardLibraryCardProps): ReactNode {
  const widgetCount = board.widgets.length;
  const widgetLabel = `${widgetCount} widget${widgetCount === 1 ? "" : "s"}`;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{board.title}</span>
      </div>

      {/* Meta line — widget count, and (team only) the publisher's name. */}
      <div className={styles.cardMeta}>
        <span>{widgetLabel}</span>
        {tab === "team" && publisherName ? (
          <>
            <span className={styles.metaDot} aria-hidden="true" />
            <span className={styles.publisher}>by {publisherName}</span>
          </>
        ) : null}
      </div>

      <InlineTagChips board={board} />

      {/* Actions — differ per tab. The delete path is a two-step inline confirm
          gated by an always-on (required) tooltip per CLAUDE.md §4. */}
      {tab === "mine" ? (
        confirmingDelete ? (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>Delete this board?</span>
            <Tooltip
              required
              content={`Permanently delete "${board.title}" — this can't be undone`}
            >
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete?.(board)}
              >
                Delete
              </Button>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCancelDelete?.()}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            <Button size="sm" variant="secondary" onClick={() => onOpen(board)}>
              Open
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDuplicate?.(board)}
              tooltip="Make an independent copy of this board in My Boards"
            >
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPublish?.(board)}
              tooltip="Share a copy of this board with your team in the Team Library"
            >
              Publish
            </Button>
            <Tooltip
              required
              content={`Delete "${board.title}" from My Boards`}
            >
              <Button
                size="sm"
                variant="ghost"
                iconAriaLabel={`Delete ${board.title}`}
                onClick={() => onRequestDelete?.(board)}
              >
                Delete
              </Button>
            </Tooltip>
          </div>
        )
      ) : (
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => onOpen(board)}>
            Open
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddToMine?.(board)}
            tooltip="Copy this team board into My Boards so you can edit your own version"
          >
            Add to my boards
          </Button>
        </div>
      )}
    </div>
  );
}
