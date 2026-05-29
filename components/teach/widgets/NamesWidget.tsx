// NamesWidget — name picker / cold-call, rendered from the LOCAL-ONLY groups
// store (docs/teach-view-plan.md §11.4, §13.3). Like GroupsWidget, names NEVER
// come from `widget.config` or the repository — only from `useTeachGroups()`
// (localStorage on the teacher's device). The persistable `config` carries
// STRUCTURE only (slot count / placeholder initials). Display-only in v1: it
// shows a "picked" name (the first student) plus the roster slots; live
// randomizing is the Phase 3 interactive library. The accent is subject-tinted.

"use client";

import type { ReactNode } from "react";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import type { WidgetBodyProps } from "./types";
import styles from "./widgets.module.css";

function readSlotLabels(config: Record<string, unknown>): string[] {
  const labels = config.slotLabels;
  if (Array.isArray(labels)) {
    const parsed = labels.filter((l): l is string => typeof l === "string");
    if (parsed.length > 0) return parsed;
  }
  const count =
    typeof config.slotCount === "number" && config.slotCount > 0
      ? config.slotCount
      : 6;
  return Array.from({ length: count }).map(() => "•");
}

export function NamesWidget({ widget, subjectId }: WidgetBodyProps): ReactNode {
  const { store } = useTeachGroups();

  // LOCAL-ONLY names take priority; otherwise show the structural placeholders.
  const localNames = store.students.map((s) => s.name).filter(Boolean);
  const hasLocal = localNames.length > 0;
  const slots = hasLocal ? localNames : readSlotLabels(widget.config);
  const picked = hasLocal ? localNames[0] : "Ready";

  return (
    <div className={`cp-subj ${subjectId} ${styles.body} ${styles.names}`}>
      <div className={styles.namesPick}>{picked}</div>
      <div className={styles.namesSlots}>
        {slots.slice(0, 12).map((label, i) => (
          <span key={`${label}-${i}`} className={styles.nameSlot}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
