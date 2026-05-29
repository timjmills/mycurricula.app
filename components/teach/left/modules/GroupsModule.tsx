"use client";

// GroupsModule — student groups for the active board (plan §3.1, §11.4).
//
// LOCAL-ONLY (privacy hard rule): every name read/written here goes through
// `useTeachGroups` (lib/teach/use-teach-groups.ts) — the USER-scoped local
// store that NEVER touches the database and NEVER syncs across devices. This
// module never imports `lib/teach/queries.ts`; no name ever reaches a Widget
// `config`/`state` or any network path.

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import { PlusIcon, TrashIcon } from "../icons";
import styles from "../TeachLeft.module.css";

export function GroupsModule(): ReactNode {
  const { store, addGroup, removeGroup } = useTeachGroups();
  const [draft, setDraft] = useState("");

  function handleAdd(): void {
    const name = draft.trim();
    if (!name) return;
    addGroup(name);
    setDraft("");
  }

  function memberCount(ids: string[]): string {
    const n = ids.length;
    return `${n} ${n === 1 ? "student" : "students"}`;
  }

  return (
    <div>
      <p className={styles.privacyNote}>
        Groups and names live only on this device — never uploaded, never
        synced. You won&rsquo;t see them on another computer.
      </p>

      {store.groups.length === 0 ? (
        <p className={styles.muted}>
          No groups yet. Add one below — assign students from the Class tab.
        </p>
      ) : (
        store.groups.map((group) => (
          <div key={group.id} className={styles.listRow}>
            <span className={styles.listRowLabel}>{group.name}</span>
            <span className={styles.listRowMeta}>
              {memberCount(group.studentIds)}
            </span>
            <Button
              size="sm"
              variant="icon"
              iconAriaLabel={`Remove group ${group.name}`}
              onClick={() => removeGroup(group.id)}
              tooltip="Remove this group (students are kept)"
            >
              <TrashIcon size={13} />
            </Button>
          </div>
        ))
      )}

      <div className={styles.inlineRow} style={{ marginTop: "var(--r-8)" }}>
        <input
          className={styles.textInput}
          placeholder="New group name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          aria-label="New group name"
        />
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<PlusIcon size={13} />}
          onClick={handleAdd}
          tooltip="Create a group (saved only on this device)"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
