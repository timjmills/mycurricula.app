"use client";

// NotesModule — display the day's notes while teaching (plan §3.1). Reuses the
// Daily notes fixture (notesForDay) keyed off the active week's selected day.
// Display-only in v1 — editing notes lives in Daily.

import { type ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { notesForDay, TEACHER_BY_ID, WEEK_DAYS } from "@/lib/mock";
import type { DailyNote } from "@/lib/types";
import styles from "../TeachLeft.module.css";

function priorityClass(priority: DailyNote["priority"]): string {
  switch (priority) {
    case "urgent":
      return styles.noteRowUrgent;
    case "important":
      return styles.noteRowImportant;
    default:
      return styles.noteRowFyi;
  }
}

export function NotesModule(): ReactNode {
  const { selectedDay } = useAppState();
  const notes = notesForDay(selectedDay);
  const dayLabel = WEEK_DAYS[selectedDay] ?? `Day ${selectedDay + 1}`;

  if (notes.length === 0) {
    return <p className={styles.muted}>No notes for {dayLabel}.</p>;
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{dayLabel} notes</span>
      </div>
      {notes.map((note, i) => {
        const author = TEACHER_BY_ID[note.author]?.name ?? note.author;
        return (
          <div
            key={`${note.day}-${i}`}
            className={`${styles.noteRow} ${priorityClass(note.priority)}`}
          >
            <div className={styles.noteMeta}>
              {note.priority} · {note.scope} · {author}
            </div>
            <div className={styles.noteBody}>{note.body}</div>
          </div>
        );
      })}
    </div>
  );
}
