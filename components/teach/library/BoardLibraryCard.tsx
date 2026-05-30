"use client";

// BoardLibraryCard — one board rendered as a rich card in the Board Library
// (5.31 Boards & Widgets handoff, screenshot 3-board-library.png). Purely
// presentational: every async mutation (open / duplicate / repeat / share /
// delete / pull) lives in BoardLibraryModule and is threaded in as a callback.
//
// The card renders the board's identity:
//   • a kind-keyed structural preview on a tinted header,
//   • the title,
//   • colored tag chips (subject / day / time / type — see tag-tone bridge),
//   • a "Repeats: X" line (when the board repeats) + the owner (Team / Personal),
//   • an action row — Open · Duplicate · Repeat · Share · More.
//
// PRIVACY (CLAUDE.md): boards carry STRUCTURE only. The only person-name shown
// is the PUBLISHER of a Team-Library board (a teacher), never a student. The
// preview is always structural (no names, no student data).
//
// Chrome rules (CLAUDE.md §4): tokens only — colour/type/radius/spacing come
// from app/tokens.css via the .module.css and the tag-tone bridge. The Repeat
// action opens the RepeatScheduleEditor (owned by the module); the destructive
// delete path keeps the required-tooltip + two-step inline confirm.

import type { ReactNode } from "react";
import type { Board, BoardTag } from "@/lib/types";
import { tagDisplayLabel, tagKey, TAG_KIND_LABEL } from "@/lib/teach/board-tags";
import { Button, Tooltip } from "@/components/ui";
import { TeachIcon } from "@/components/teach/widgets";
import { ExternalIcon, CopyLinkIcon, MoreIcon } from "../right/icons";
import styles from "./BoardLibrary.module.css";

// ── Tag-tone bridge ──────────────────────────────────────────────────────────
// The handoff colour-keys tags by what the tag MEANS (subject = warm, type =
// teal/green, day = orange, time = amber, week = blue, label/free = purple).
// Each tone resolves to a (bg, fg) token pair — tokens only, no hex. Subject is
// the one kind whose tone varies; we keep it stable per the kind here (the
// 8-subject swatch mapping is locked team-wide and lives in the palette system,
// but a small library chip uses the neutral subject tone to avoid re-deriving a
// per-subject hue inside a tokens-only chip).

type ChipTone =
  | "red"
  | "orange"
  | "amber"
  | "blue"
  | "green"
  | "teal"
  | "purple"
  | "pink"
  | "gray";

/** (bg, fg) token pair per tone. `red/amber/blue/green/pink/gray` use the
 *  shared `--tag-*` family; `orange/purple/teal` borrow the `--wf-*` chip/accent
 *  families (teal folds onto green — the tag family has no teal). */
const TONE_VARS: Record<ChipTone, { bg: string; fg: string }> = {
  red: { bg: "var(--tag-red-bg)", fg: "var(--tag-red-fg)" },
  orange: { bg: "var(--wf-orange-chip)", fg: "var(--wf-orange-accent)" },
  amber: { bg: "var(--tag-amber-bg)", fg: "var(--tag-amber-fg)" },
  blue: { bg: "var(--tag-blue-bg)", fg: "var(--tag-blue-fg)" },
  green: { bg: "var(--tag-green-bg)", fg: "var(--tag-green-fg)" },
  teal: { bg: "var(--wf-green-chip)", fg: "var(--wf-green-accent)" },
  purple: { bg: "var(--wf-purple-chip)", fg: "var(--wf-purple-accent)" },
  pink: { bg: "var(--tag-pink-bg)", fg: "var(--tag-pink-fg)" },
  gray: { bg: "var(--tag-gray-bg)", fg: "var(--tag-gray-fg)" },
};

/** Tag KIND → chip tone. Mirrors the handoff colour-key. */
function toneForTag(tag: BoardTag): ChipTone {
  switch (tag.kind) {
    case "subject":
      return "red";
    case "weekday":
      return "orange";
    case "slot":
      return "amber";
    case "week":
      return "blue";
    case "lesson":
      return "green";
    case "phase":
      return "teal";
    case "label":
      return "purple";
    default:
      return "gray";
  }
}

// ── Tag chips ────────────────────────────────────────────────────────────────
// Self-contained (no import from a sibling chip component) so this file builds
// on its own. Each chip uses the shared label helper so wording never drifts.

function TagChips({ board }: { board: Board }): ReactNode {
  const tags = board.tags ?? [];
  if (tags.length === 0) return null;
  return (
    <div className={styles.tagRow}>
      {tags.map((tag) => {
        const tone = TONE_VARS[toneForTag(tag)];
        return (
          <span
            key={tagKey(tag)}
            className={styles.tagChip}
            style={{ background: tone.bg, color: tone.fg }}
            title={`${TAG_KIND_LABEL[tag.kind]}: ${tagDisplayLabel(tag)}`}
          >
            {tagDisplayLabel(tag)}
          </span>
        );
      })}
    </div>
  );
}

// ── Kind-keyed structural preview ────────────────────────────────────────────
// A tiny, name-free thumbnail that hints at the board's purpose. We key off the
// board's primary tag kind (or whiteboard flag); the preview is always
// structural lines/icons — never student content.

function boardPreviewKind(board: Board): string {
  if (board.whiteboard) return "whiteboard";
  const tags = board.tags ?? [];
  if (tags.some((t) => t.kind === "subject")) return "subject";
  if (tags.some((t) => t.kind === "weekday")) return "day";
  if (tags.some((t) => t.kind === "phase")) return "phase";
  return "generic";
}

function BoardPreview({ board }: { board: Board }): ReactNode {
  const kind = boardPreviewKind(board);
  const icon =
    kind === "whiteboard"
      ? "model"
      : kind === "subject"
        ? "notes"
        : kind === "day"
          ? "calendar"
          : kind === "phase"
            ? "check"
            : "grid";
  return (
    <div className={styles.preview} aria-hidden="true">
      <span className={styles.previewBox}>
        <span className={styles.previewTitle}>{board.title}</span>
        <span className={styles.previewIcon}>
          <TeachIcon name={icon} size={22} />
        </span>
      </span>
    </div>
  );
}

// ── Repeat label ─────────────────────────────────────────────────────────────
// Joins the board's repeat-rule labels for the "Repeats:" line. Empty/null →
// no line (the card renders only the owner).

function repeatSummary(board: Board): string | null {
  const rules = board.repeat;
  if (!rules || rules.length === 0) return null;
  return rules.map((r) => r.label).join(" · ");
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardLibraryCardProps {
  /** The board to render. */
  board: Board;
  /** Which segment the card lives in — drives the action set + owner label. */
  tab: "mine" | "team";
  /** Display name of the publisher (team cards only); falls back gracefully. */
  publisherName?: string;
  /** Open this board in the workspace (both segments). */
  onOpen: (board: Board) => void;
  /** Duplicate as an independent copy (Personal). */
  onDuplicate?: (board: Board) => void;
  /** Open the Repeat editor for this board (Personal). */
  onRepeat?: (board: Board) => void;
  /** Publish a copy to the Team Library (Personal). */
  onPublish?: (board: Board) => void;
  /** Delete this board (Personal, destructive). */
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
  onRepeat,
  onPublish,
  onDelete,
  onAddToMine,
  confirmingDelete = false,
  onRequestDelete,
  onCancelDelete,
}: BoardLibraryCardProps): ReactNode {
  const repeats = repeatSummary(board);
  // Owner label: a Team-Library card shows its publisher (a teacher); a personal
  // card shows "Personal"; an unpublished team board shows the grade team.
  const ownerLabel =
    tab === "team"
      ? (publisherName ?? "Grade 5 Team")
      : board.ownerId
        ? "Personal"
        : "Grade 5 Team";

  return (
    <div className={styles.card}>
      <BoardPreview board={board} />

      <h3 className={styles.cardTitle}>{board.title}</h3>

      <TagChips board={board} />

      {/* Repeats + owner line. */}
      <div className={styles.metaLine}>
        {repeats ? (
          <span className={styles.repeats}>
            <TeachIcon name="rotate" size={13} /> Repeats: {repeats}
          </span>
        ) : null}
        <span className={styles.owner}>
          <TeachIcon name="users" size={13} /> {ownerLabel}
        </span>
      </div>

      {/* Actions — differ per segment. Personal: Open · Duplicate · Repeat ·
          Share · Delete (two-step). Team: Open · Add to my boards. */}
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
            <Button size="sm" variant="ghost" onClick={() => onCancelDelete?.()}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => onOpen(board)}
              title="Open this board in the editor"
            >
              <span className={styles.actionIcon}>
                <ExternalIcon />
              </span>
              Open
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => onDuplicate?.(board)}
              title="Make an independent copy in My Boards"
            >
              <span className={styles.actionIcon}>
                <CopyLinkIcon />
              </span>
              Duplicate
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => onRepeat?.(board)}
              title="Schedule this one board into many days, lessons, or subjects"
            >
              <span className={styles.actionIcon}>
                <TeachIcon name="rotate" size={18} />
              </span>
              Repeat
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => onPublish?.(board)}
              title="Share a copy with your team in the Team Library"
            >
              <span className={styles.actionIcon}>
                <TeachIcon name="users" size={18} />
              </span>
              Share
            </button>
            <Tooltip required content={`Delete "${board.title}" from My Boards`}>
              <button
                type="button"
                className={styles.action}
                aria-label={`Delete ${board.title}`}
                onClick={() => onRequestDelete?.(board)}
              >
                <span className={styles.actionIcon}>
                  <MoreIcon />
                </span>
                More
              </button>
            </Tooltip>
          </div>
        )
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={() => onOpen(board)}
            title="Open this board in the editor"
          >
            <span className={styles.actionIcon}>
              <ExternalIcon />
            </span>
            Open
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => onAddToMine?.(board)}
            title="Copy this team board into My Boards to edit your own version"
          >
            <span className={styles.actionIcon}>
              <CopyLinkIcon />
            </span>
            Add to mine
          </button>
        </div>
      )}
    </div>
  );
}
