"use client";

// ClassModule — the class roster (plan §3.1, §11.4). v1 is a basic
// add/rename/remove roster editor.
//
// LOCAL-ONLY (privacy hard rule): names live exclusively in `useTeachGroups`
// (lib/teach/use-teach-groups.ts) — the USER-scoped local store that NEVER
// touches the database and NEVER syncs across devices. This module never
// imports `lib/teach/queries.ts`. There is no roster entity, no students
// table, no cross-device name storage anywhere in Teach (CLAUDE.md §1:
// students are out of product scope).

import { type ReactNode, useState } from "react";
import { Button, Tooltip } from "@/components/ui";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import { PlusIcon, TrashIcon } from "../icons";
import styles from "../TeachLeft.module.css";

export function ClassModule(): ReactNode {
  const { store, addStudent, renameStudent, removeStudent, clearAll } =
    useTeachGroups();
  const [draft, setDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  function handleAdd(): void {
    const name = draft.trim();
    if (!name) return;
    addStudent(name);
    setDraft("");
  }

  return (
    <div>
      <p className={styles.privacyNote}>
        Your class roster stays on this device only. Names are never uploaded or
        synced — open Teach elsewhere and this list will be empty.
      </p>

      {store.students.length === 0 ? (
        <p className={styles.muted}>
          No students yet. Add names below to use the Groups tab.
        </p>
      ) : (
        store.students.map((student) => (
          <div key={student.id} className={styles.listRow}>
            <input
              className={styles.textInput}
              value={student.name}
              onChange={(e) => renameStudent(student.id, e.target.value)}
              aria-label={`Student name: ${student.name}`}
            />
            <Button
              size="sm"
              variant="icon"
              iconAriaLabel={`Remove ${student.name}`}
              onClick={() => removeStudent(student.id)}
              tooltip="Remove this student from your local roster"
            >
              <TrashIcon size={13} />
            </Button>
          </div>
        ))
      )}

      <div className={styles.inlineRow} style={{ marginTop: "var(--r-8)" }}>
        <input
          className={styles.textInput}
          placeholder="Add a student"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          aria-label="Add a student"
        />
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<PlusIcon size={13} />}
          onClick={handleAdd}
          tooltip="Add a student to your local roster (this device only)"
        >
          Add
        </Button>
      </div>

      {store.students.length > 0 ? (
        <div className={styles.boardActions}>
          {confirmClear ? (
            <>
              <Tooltip
                required
                side="top"
                content="Erase your entire local roster and all groups on this device — this cannot be undone"
              >
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    clearAll();
                    setConfirmClear(false);
                  }}
                >
                  Erase roster
                </Button>
              </Tooltip>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Tooltip
              required
              side="top"
              content="Erase the whole local roster and groups from this device"
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmClear(true)}
              >
                Clear all
              </Button>
            </Tooltip>
          )}
        </div>
      ) : null}
    </div>
  );
}
