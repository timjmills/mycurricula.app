"use client";

// NotesTab.tsx — the Unit Explorer's Notes tab body.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0). A single shared unit note,
// keyed on subject + unit so a bare slug can't share one note across two
// subjects' same-named units.

import { useId, type ReactNode } from "react";
import type { SubjectId } from "@/lib/types";
import { useUnitNote, useSetUnitNote } from "@/lib/unit-notes";
import styles from "../UnitExplorer.module.css";

export function NotesTab({
  subjectId,
  unitId,
}: {
  subjectId: SubjectId;
  unitId: string;
}): ReactNode {
  // Notes key on subject + unit — unit slugs are unique only within a
  // subject, so a bare-slug key would share one note across two subjects'
  // same-named units (see lib/unit-notes.tsx "Keying").
  const note = useUnitNote(subjectId, unitId);
  const setNote = useSetUnitNote();
  const fieldId = useId();
  return (
    <div className={styles.notes}>
      <label htmlFor={fieldId} className={styles.notesLabel}>
        Unit note — a shared reminder for the team
      </label>
      <textarea
        id={fieldId}
        className={styles.notesArea}
        value={note}
        placeholder="The one move not to forget in this unit…"
        onChange={(e) => setNote(subjectId, unitId, e.target.value)}
        rows={5}
      />
    </div>
  );
}
