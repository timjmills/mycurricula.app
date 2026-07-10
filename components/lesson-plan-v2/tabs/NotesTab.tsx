"use client";

// NotesTab.tsx — the Lesson Plan panel's notes tab (W7, bundle B:8425-8431).
//
// ONE editor bound to `lesson.notes`, writing through a coalesced
// `editLesson(id, { notes })` under `lesson:<id>:notes`. Ported from
// components/daily/planning-tabs/PlanningTabs.tsx (:701-715) — itself the old
// LessonDetail "My notes" section, moved wholesale with its state, store-sync,
// and editing guard. Wave 3.8 orphaned that file, leaving `Lesson.notes`
// unwritable on this branch.
//
// TWO deliberate departures from the bundle:
//
//   1. It is a rich-text editor, NOT a `<textarea>`. `Lesson.notes` holds
//      rich-text HTML (that's what every other writer of the field has ever
//      stored). A textarea bound to it would show existing notes as raw markup
//      and would flatten formatting on the next keystroke — a data-loss bug
//      dressed up as a simpler control.
//   2. The bundle's second "Co-teacher / support notes" box is NOT rendered.
//      `Lesson.notes` is a single field; there is no model behind a second box,
//      so it would silently discard whatever the teacher typed into it.
//
// The editor omits `chromeless`: with no external RtToolbar in the v2 plan
// panel, the floating selection toolbar is the correct chrome.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { RichTextEditor } from "@/components/rich-text";
import styles from "./tabs.module.css";

export interface NotesTabProps {
  lessonId: string;
}

export function NotesTab({ lessonId }: NotesTabProps): ReactNode {
  const { getLesson, editLesson, subjectById } = usePlanner();
  const lesson = getLesson(lessonId);

  const [notesHtml, setNotesHtml] = useState<string>(lesson?.notes ?? "");
  const editingRef = useRef(false);

  useEffect(() => {
    setNotesHtml(lesson?.notes ?? "");
    editingRef.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const storeNotes = lesson?.notes ?? "";
  useEffect(() => {
    if (!editingRef.current) setNotesHtml(storeNotes);
  }, [storeNotes]);

  if (!lesson) {
    return (
      <div className={styles.emptyTab}>This lesson is no longer available.</div>
    );
  }

  function handleChange(html: string): void {
    editingRef.current = true;
    setNotesHtml(html);
    editLesson(
      lessonId,
      { notes: html },
      { key: `lesson:${lessonId}:notes`, ts: Date.now() },
    );
  }

  return (
    // `cp-subj <cls>` carries the subject's --c so the editor's focus ring takes
    // the lesson's hue.
    <div
      className={`cp-subj ${subjectById[lesson.subject]?.cls ?? ""} ${styles.tab}`}
    >
      <section className={styles.card}>
        <h3 className={styles.cardLabel}>My notes</h3>
        <p className={`${styles.hint} ${styles.hintOver}`}>
          Private to you — reminders, what to watch for, what to change next
          time.
        </p>
        <div
          className={`${styles.editor} ${styles.editorTall}`}
          onBlurCapture={() => {
            editingRef.current = false;
          }}
        >
          <RichTextEditor
            value={notesHtml}
            onChange={handleChange}
            placeholder="Add private notes for yourself…"
            ariaLabel="Teacher notes"
          />
        </div>
      </section>
    </div>
  );
}
