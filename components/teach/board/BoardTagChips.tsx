"use client";

// BoardTagChips — a read-only horizontal row of board-tag chips (the Boards
// Library tagging model; lib/teach/board-tags.ts). Pure/presentational: it
// renders whatever tag set it's handed, tints subject chips through the
// app-wide `.cp-subj` palette bridge, and optionally exposes a per-chip remove
// affordance when an `onRemove` callback is supplied (used by BoardTagPicker).
//
// Privacy: tags are STRUCTURE only (subject / day / phase / week / slot /
// label) — never a student name. Tokens-only; no hex, no px font sizes.

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import {
  TAG_KIND_LABEL,
  tagDisplayLabel,
  tagKey,
} from "@/lib/teach/board-tags";
import type { BoardTag } from "@/lib/types";
import styles from "./BoardTags.module.css";

export interface BoardTagChipsProps {
  /** The tags to render. Empty ⇒ the component renders nothing. */
  tags: BoardTag[];
  /** Cap the number of chips shown; the remainder collapses into a "+N" chip. */
  max?: number;
  /** Chip scale — "sm" for inline/library rows, "md" for the editor. */
  size?: "sm" | "md";
  /** When given, each chip gets a ✕ remove control (destructive tooltip). */
  onRemove?: (tag: BoardTag) => void;
}

export function BoardTagChips({
  tags,
  max,
  size = "sm",
  onRemove,
}: BoardTagChipsProps): ReactNode {
  // No tags ⇒ render nothing (no add affordance lives here — that's the picker).
  if (tags.length === 0) return null;

  // Apply the overflow cap, reserving one slot for the "+N" chip.
  const overflow = max != null && tags.length > max ? tags.length - max : 0;
  const shown = overflow > 0 ? tags.slice(0, max) : tags;

  return (
    <div className={`${styles.chips} ${size === "md" ? styles.chipsMd : ""}`}>
      {shown.map((tag) => {
        // Subject chips tint through the app-wide palette bridge: `cp-subj
        // <subjectId>` exposes --c/--cl/--cd, which the chip styles consume.
        const isSubject = tag.kind === "subject";
        const chipClass = isSubject
          ? `${styles.chip} ${styles.chipSubject} cp-subj ${tag.value}`
          : styles.chip;

        return (
          <span
            key={tagKey(tag)}
            className={chipClass}
            // Touch users hold the chip for the kind + value context.
            title={`${TAG_KIND_LABEL[tag.kind]}: ${tagDisplayLabel(tag)}`}
          >
            {/* Kind prefix — tells a teacher which dimension this tag binds. */}
            <span className={styles.chipKind}>{TAG_KIND_LABEL[tag.kind]}</span>
            <span className={styles.chipLabel}>{tagDisplayLabel(tag)}</span>
            {onRemove ? (
              <Tooltip required side="top" content="Remove this tag">
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove the ${TAG_KIND_LABEL[tag.kind]} tag "${tagDisplayLabel(tag)}"`}
                  onClick={() => onRemove(tag)}
                >
                  ✕
                </button>
              </Tooltip>
            ) : null}
          </span>
        );
      })}

      {overflow > 0 ? (
        <span
          className={`${styles.chip} ${styles.chipOverflow}`}
          // The hidden tags surface on hold for touch users.
          title={tags
            .slice(max)
            .map((t) => `${TAG_KIND_LABEL[t.kind]}: ${tagDisplayLabel(t)}`)
            .join("\n")}
          aria-label={`${overflow} more tag${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
