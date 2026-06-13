"use client";

// BoardTagPicker — the tag editor embedded inside BoardSettingsPopover (NOT a
// modal of its own). It is the write surface for the Boards Library tagging
// model (lib/teach/board-tags.ts): a board carries any combination of typed
// tags (subject · day · phase · week · time · label). The SAME tag set both
// auto-surfaces the board in a matching lesson/day context and powers Library
// filtering — so editing here changes where the board shows up everywhere.
//
// Persistence mirrors BoardSettingsPopover: it optimistically updates local
// state, writes through `teach.updateBoard` (the `{ tags }` patch is the
// board-tag write path), then re-reads the board set.
// Mutations run in a fire-and-forget `void (async …)()` wrapper so the click
// handlers stay synchronous.
//
// Privacy: tags are STRUCTURE only — never a student name. Tokens-only.

import type { ReactNode } from "react";
import { useState } from "react";
import { Button, Tooltip } from "@/components/ui";
import {
  AUTO_SURFACE_KINDS,
  TAG_KIND_LABEL,
  dedupeTags,
  makeTag,
} from "@/lib/teach/board-tags";
import { teachClient as teach } from "@/lib/teach/client";
import type { Board, BoardTag, BoardTagKind } from "@/lib/types";
import { BoardTagChips } from "./BoardTagChips";
import styles from "./BoardTags.module.css";

export interface BoardTagPickerProps {
  /** The board whose tags are being edited. */
  board: Board;
  /** Re-read the active board set after the repo write. */
  reloadBoards: () => Promise<unknown>;
}

/** The kinds offered in the editor: every auto-surfacing kind EXCEPT `lesson`
 *  (a lesson tag is assigned from the lesson surface, not free-typed here) plus
 *  the library-only `label`. */
const PICKER_KINDS: readonly BoardTagKind[] = [
  ...AUTO_SURFACE_KINDS.filter((k) => k !== "lesson"),
  "label",
];

/** The 8 locked, team-wide subjects (CLAUDE.md §4). Value = subject id; we show
 *  it with a leading capital. The id is what the tag stores + what `cp-subj`
 *  tints on. */
const SUBJECT_IDS = [
  "math",
  "reading",
  "writing",
  "grammar",
  "spelling",
  "ufli",
  "explorers",
  "sel",
] as const;

/** Weekday option labels, indexed 0-based. Display-only — the school's actual
 *  running-day SET is configured elsewhere; the tag stores the index as its
 *  value so it stays decoupled from any 5- or 7-day assumption. */
const WEEKDAY_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Capitalise a subject id for the option label without touching the value. */
function capitalize(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** The initial draft value for a kind. The two `<select>` kinds (subject /
 *  weekday) must start on a REAL, valid value so the Add button is live without
 *  the teacher first interacting with the select — a select that shows "Sunday"
 *  but stores "" would otherwise look ready while Add stays disabled. Free-text
 *  kinds start empty so the placeholder shows and Add stays gated until typed. */
function defaultValueForKind(kind: BoardTagKind): string {
  if (kind === "subject") return SUBJECT_IDS[0];
  if (kind === "weekday") return "0";
  return "";
}

export function BoardTagPicker({
  board,
  reloadBoards,
}: BoardTagPickerProps): ReactNode {
  // Optimistic tag list so chips update instantly while the write + reload
  // settle. Seeded from the board, deduped defensively.
  const [tags, setTags] = useState<BoardTag[]>(() =>
    dedupeTags(board.tags ?? []),
  );
  const [busy, setBusy] = useState(false);

  // The draft tag being composed: the chosen kind + its value.
  const [kind, setKind] = useState<BoardTagKind>("subject");
  // Seeded from the kind's default so a `<select>` kind is immediately addable.
  const [value, setValue] = useState<string>(() =>
    defaultValueForKind("subject"),
  );

  // Persist a tag list: optimistic local update, then repo write + reload.
  // Fire-and-forget so callers stay synchronous (BoardSettingsPopover idiom).
  function persist(next: BoardTag[]): void {
    const deduped = dedupeTags(next);
    setTags(deduped);
    setBusy(true);
    void (async () => {
      try {
        await teach.updateBoard(board.id, { tags: deduped });
        await reloadBoards();
      } finally {
        setBusy(false);
      }
    })();
  }

  function handleAdd(): void {
    const v = value.trim();
    if (!v) return;
    // Subjects/weekdays already carry a readable derived label; free-text kinds
    // (phase/week/slot/label) use the typed value as the label too.
    persist([...tags, makeTag(kind, v)]);
    // Reset the value for the next entry; keep the kind selection sticky.
    setValue(defaultValueForKind(kind));
  }

  function handleRemove(tag: BoardTag): void {
    persist(
      tags.filter((t) => !(t.kind === tag.kind && t.value === tag.value)),
    );
  }

  // Switching kind resets the value to a sensible default for that input type.
  function handleKindChange(nextKind: BoardTagKind): void {
    setKind(nextKind);
    setValue(defaultValueForKind(nextKind));
  }

  // Whether the current draft can be added (non-empty after trim).
  const canAdd = value.trim().length > 0 && !busy;

  return (
    <div className={styles.picker}>
      <Tooltip
        tooltipId="board-tag-picker"
        side="top"
        content="Tag this board by subject, day, week, or a custom label. A tagged board automatically appears in matching lessons and days, and you can filter the Library by any tag."
      >
        <div className={styles.pickerHeading}>Board tags</div>
      </Tooltip>

      <p className={styles.caption}>
        Tags make this board auto-appear in matching lessons and days, and let
        you filter for it in the Library.
      </p>

      {/* Current tags — removable. Empty ⇒ BoardTagChips renders nothing. */}
      <BoardTagChips tags={tags} size="md" onRemove={handleRemove} />

      {/* ── Add a tag ───────────────────────────────────────────────────── */}
      <div className={styles.addRow}>
        <Tooltip
          tooltipId="board-tag-kind"
          side="top"
          content="Pick what kind of tag to add — the dimension it binds the board to."
        >
          <select
            className={styles.kindSelect}
            value={kind}
            disabled={busy}
            aria-label="Tag type"
            onChange={(e) => handleKindChange(e.target.value as BoardTagKind)}
          >
            {PICKER_KINDS.map((k) => (
              <option key={k} value={k}>
                {TAG_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Tooltip>

        {/* The value input adapts to the chosen kind. */}
        {kind === "subject" ? (
          <select
            className={styles.valueSelect}
            value={value}
            disabled={busy}
            aria-label="Subject"
            onChange={(e) => setValue(e.target.value)}
          >
            {SUBJECT_IDS.map((id) => (
              <option key={id} value={id}>
                {capitalize(id)}
              </option>
            ))}
          </select>
        ) : kind === "weekday" ? (
          <select
            className={styles.valueSelect}
            value={value}
            disabled={busy}
            aria-label="Day of the week"
            onChange={(e) => setValue(e.target.value)}
          >
            {WEEKDAY_OPTIONS.map((name, i) => (
              <option key={i} value={String(i)}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={styles.valueInput}
            value={value}
            disabled={busy}
            placeholder={`Add a ${TAG_KIND_LABEL[kind].toLowerCase()}…`}
            aria-label={TAG_KIND_LABEL[kind]}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        )}

        <Button
          size="sm"
          variant="secondary"
          disabled={!canAdd}
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
