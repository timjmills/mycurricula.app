// GroupsWidget — student groups, restyled into the 5.31 system (consumes the
// `--w-*` themeable vars + _WidgetKit primitives, incl. the privacy-safe Avatar).
// Names NEVER come from `widget.config` or the repository — they live only in
// `useTeachGroups()` (localStorage on the teacher's device); the widget's
// persistable `config` carries STRUCTURE only (group/slot counts). When the local
// store is empty we render that structure as anonymous placeholder slots.
//
// PRIVACY (§11.4): members render as initials-on-tint `Avatar`s only — no full
// name is ever shown or stored. Behaviour + export unchanged from v1.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (per widget-defaults SEEDS).

"use client";

import type { ReactNode } from "react";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import type { TeachGroup } from "@/lib/teach/use-teach-groups";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Avatar, FootNote } from "./_WidgetKit";
import styles from "./GroupsWidget.module.css";
import kit from "./widgets530.module.css";

/** Two-letter initials from a name (LOCAL-ONLY data — display only). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
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
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Groups" />
      <div className={styles.list}>
        {rows.map((row) => (
          <div key={row.key} className={`${kit.card} ${styles.group}`}>
            <div className={styles.groupHead}>
              <span className={styles.groupName}>{row.name}</span>
              <span className={styles.groupCount}>
                {row.members.length} student
                {row.members.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className={styles.avatars}>
              {row.members.map((m) => (
                <Avatar key={m.id} label={m.label} size={1.9} />
              ))}
              {Array.from({ length: row.emptySlots }).map((_, i) => (
                <span key={`empty-${i}`} className={styles.empty}>
                  +
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <FootNote
        tone={hasLocalGroups ? "green" : "gray"}
        icon={<KitIcon name="users" size={1} />}
      >
        {hasLocalGroups
          ? "Saved on this device only"
          : "Add names in the Groups panel — kept on this device only"}
      </FootNote>
    </div>
  );
}
