"use client";

// GroupsModule — student groups + roster→group assignment (plan §3.1, §11.4).
//
// LOCAL-ONLY (privacy hard rule): every name/membership read or written here
// goes through `useTeachGroups` (lib/teach/use-teach-groups.ts) — the
// USER-scoped local store that NEVER touches the database and NEVER syncs
// across devices. This module never imports `lib/teach/queries.ts`; no name or
// group membership ever reaches a Widget `config`/`state` or any network path.
//
// Membership model: SINGLE-GROUP. A student belongs to at most one group.
// Assigning a student to a group removes them from any other group they were
// in (a classroom student sits at one table). This keeps the model unambiguous
// and the "Add student" menu small (it offers every roster student not already
// in THIS group; picking one that lives in another group MOVES them).

import { type ReactNode, useState } from "react";
import { Button, Tooltip } from "@/components/ui";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import { CloseIcon, PlusIcon, TrashIcon } from "../icons";
import styles from "../TeachLeft.module.css";

export function GroupsModule(): ReactNode {
  const { store, addGroup, removeGroup, setGroupMembers } = useTeachGroups();
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

  /** Look up a student's display name (LOCAL-ONLY data). */
  function studentName(id: string): string {
    return store.students.find((s) => s.id === id)?.name ?? "Unknown";
  }

  /**
   * Assign a roster student to a group. SINGLE-GROUP model: first strip the
   * student from every OTHER group, then append to the target. All writes go
   * through `setGroupMembers` (local-only).
   */
  function assignToGroup(groupId: string, studentId: string): void {
    for (const g of store.groups) {
      if (g.id === groupId) continue;
      if (g.studentIds.includes(studentId)) {
        setGroupMembers(
          g.id,
          g.studentIds.filter((id) => id !== studentId),
        );
      }
    }
    const target = store.groups.find((g) => g.id === groupId);
    if (!target) return;
    if (target.studentIds.includes(studentId)) return;
    setGroupMembers(groupId, [...target.studentIds, studentId]);
  }

  /** Remove a student from a group (they return to the unassigned pool). */
  function removeFromGroup(groupId: string, studentId: string): void {
    const group = store.groups.find((g) => g.id === groupId);
    if (!group) return;
    setGroupMembers(
      groupId,
      group.studentIds.filter((id) => id !== studentId),
    );
  }

  const hasRoster = store.students.length > 0;

  return (
    <div>
      <p className={styles.privacyNote}>
        Groups and names live only on this device — never uploaded, never
        synced. You won&rsquo;t see them on another computer.
      </p>

      {store.groups.length === 0 ? (
        <p className={styles.muted}>
          No groups yet. Add one below, then drop students into it from the menu
          on each group.
        </p>
      ) : (
        store.groups.map((group) => {
          // Roster students not already in THIS group are assignable. A student
          // currently in another group still appears (single-group: picking
          // them moves them here).
          const assignable = store.students.filter(
            (s) => !group.studentIds.includes(s.id),
          );
          return (
            <div key={group.id} className={styles.groupBlock}>
              <div className={styles.groupBlockHead}>
                <span className={styles.groupBlockName}>{group.name}</span>
                <span className={styles.groupBlockMeta}>
                  {memberCount(group.studentIds)}
                </span>
                <Button
                  size="sm"
                  variant="icon"
                  iconAriaLabel={`Remove group ${group.name}`}
                  onClick={() => removeGroup(group.id)}
                  tooltip="Remove this group (students stay on your roster)"
                >
                  <TrashIcon size={13} />
                </Button>
              </div>

              {group.studentIds.length > 0 ? (
                <div className={styles.memberChips}>
                  {group.studentIds.map((sid) => {
                    const name = studentName(sid);
                    return (
                      <span key={sid} className={styles.memberChip}>
                        <span className={styles.memberChipName}>{name}</span>
                        <button
                          type="button"
                          className={styles.memberChipRemove}
                          aria-label={`Remove ${name} from ${group.name}`}
                          title={`Remove ${name} from ${group.name}`}
                          onClick={() => removeFromGroup(group.id, sid)}
                        >
                          <CloseIcon size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.memberEmpty}>
                  No students in this group yet.
                </p>
              )}

              <div className={styles.addStudentRow}>
                {hasRoster ? (
                  <Tooltip
                    tooltipId="teach-group-assign"
                    side="top"
                    content="Drop a student into this group. Each student sits in one group — picking someone already in another group moves them here."
                  >
                    <select
                      className={styles.addStudentSelect}
                      aria-label={`Add a student to ${group.name}`}
                      value=""
                      disabled={assignable.length === 0}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) assignToGroup(group.id, id);
                        // Reset so the same option can be chosen again later.
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        {assignable.length === 0
                          ? "Everyone is in this group"
                          : "Add student…"}
                      </option>
                      {assignable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Tooltip>
                ) : (
                  <p className={styles.memberEmpty}>
                    Add students in the Class tab first.
                  </p>
                )}
              </div>
            </div>
          );
        })
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
