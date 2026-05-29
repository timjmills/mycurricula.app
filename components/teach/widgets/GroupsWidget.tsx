// GroupsWidget — student groups, rendered from the LOCAL-ONLY groups store
// (docs/teach-view-plan.md §11.4, §13.3). Names NEVER come from `widget.config`
// or the repository — they live only in `useTeachGroups()` (localStorage on the
// teacher's device). The widget's persistable `config` carries STRUCTURE only
// (group/slot counts); when the local store is empty we render that structure
// as anonymous initial-less placeholder slots so the tile still reads.
//
// Display-only in v1 (no live re-grouping). The avatar colours cycle a fixed
// set of subject/highlighter tokens — never a hard-coded hex.

"use client";

import type { ReactNode } from "react";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import type { TeachGroup } from "@/lib/teach/use-teach-groups";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./widgets.module.css";

// Avatar swatch cycle — token-driven, no literal hex (CLAUDE.md §4).
const AVATAR_VARS = [
  "var(--writing)",
  "var(--done)",
  "var(--tag-blue)",
  "var(--urgent)",
] as const;

/** Two-letter initials from a name (LOCAL-ONLY data — used for display only). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readStructure(config: Record<string, unknown>): {
  groupCount: number;
  slotsPerGroup: number;
} {
  const groupCount =
    typeof config.groupCount === "number" && config.groupCount > 0
      ? config.groupCount
      : 4;
  const slotsPerGroup =
    typeof config.slotsPerGroup === "number" && config.slotsPerGroup > 0
      ? config.slotsPerGroup
      : 5;
  return { groupCount, slotsPerGroup };
}

export function GroupsWidget({ widget }: WidgetBodyProps): ReactNode {
  const { store } = useTeachGroups();
  const { groupCount, slotsPerGroup } = readStructure(widget.config);

  // Prefer the real local roster; otherwise render the structural skeleton.
  const hasLocalGroups = store.groups.length > 0;

  const rows: {
    key: string;
    name: string;
    members: { id: string; label: string }[];
    emptySlots: number;
  }[] = hasLocalGroups
    ? store.groups.map((g: TeachGroup, gi: number) => {
        const members = g.studentIds
          .map((sid) => store.students.find((s) => s.id === sid))
          .filter((s): s is NonNullable<typeof s> => Boolean(s))
          .map((s) => ({ id: s.id, label: initials(s.name) }));
        return {
          key: g.id,
          name: g.name || `Group ${gi + 1}`,
          members,
          emptySlots: Math.max(0, slotsPerGroup - members.length),
        };
      })
    : Array.from({ length: groupCount }).map((_, gi) => ({
        key: `skeleton-${gi}`,
        name: `Group ${gi + 1}`,
        members: [],
        emptySlots: slotsPerGroup,
      }));

  return (
    <div className={`${styles.body} ${styles.groups}`}>
      {rows.map((row) => (
        <div key={row.key} className={styles.groupRow}>
          <span className={styles.groupName}>{row.name}</span>
          <span className={styles.groupCount}>
            {row.members.length} student{row.members.length === 1 ? "" : "s"}
          </span>
          <div className={styles.avatars}>
            {row.members.map((m, i) => (
              <span
                key={m.id}
                className={styles.avatar}
                style={{ background: AVATAR_VARS[i % AVATAR_VARS.length] }}
              >
                {m.label}
              </span>
            ))}
            {Array.from({ length: row.emptySlots }).map((_, i) => (
              <span key={`empty-${i}`} className={styles.avatarEmpty}>
                +
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className={styles.groupsHint}>
        {hasLocalGroups ? (
          <>
            <TeachIcon name="users" size={11} /> Saved on this device only
          </>
        ) : (
          "Add names in the Groups panel — kept on this device only"
        )}
      </div>
    </div>
  );
}
