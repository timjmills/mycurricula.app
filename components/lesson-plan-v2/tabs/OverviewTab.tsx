"use client";

// OverviewTab.tsx — the Lesson Plan panel's first tab (W7, bundle B:8376-8393).
//
// One bordered "Learning target (student-facing)" card holding the OBJECTIVE
// editor, plus a read-only meta card (subject · unit · week/day · status).
//
// The objective editor is a PORT of components/daily/planning-tabs/PlanningTabs
// (:632-656), which Wave 3.8's rebuild orphaned. It preserves that file's
// contract exactly:
//
//   • The STORED objective carries a plain-text "I can " prefix (the app-wide
//     convention every other consumer strips with /^I can\s+/i — weekly cards,
//     right-panel, Teach). The editor holds only the TRAILING text; the prefix
//     is re-attached on commit, so the stored shape never changes and clearing
//     the field stores "" rather than a dangling "I can ".
//   • `singleLine` — Enter can't introduce block markup into a field other
//     surfaces render as one plain-text line.
//   • Writes are coalesced under `lesson:<id>:objective`, so a burst of
//     keystrokes collapses into ONE undo step.
//   • An editing guard stops external store updates (undo/redo from another
//     view) from overwriting content mid-keystroke; the editor reseeds when the
//     lesson changes, or when the store value changes while the teacher is not
//     typing.
//
// Deliberately NOT built from the bundle (see the W7 report):
//   • The schedule card (`<input type=date>` / `<input type=time>`). The app has
//     no lesson date — it models week + day indices — and `Lesson.time` has NO
//     database column, so a time editor could not persist, and a time-only
//     write would spuriously fork a Personal lesson.
//   • "Formative check" and "Homework / follow-up". No model backs either; the
//     mockup writes them to `localStorage cc_res_<id>`. A field that silently
//     discards what the teacher types is worse than an absent one.
//
// The editor omits `chromeless`: there is no external RtToolbar in the v2 plan
// panel, so the floating selection toolbar (the Weekly view's behavior) is the
// right chrome here.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { RichTextEditor } from "@/components/rich-text";
// The shared status→words map, hoisted to a LEAF module so the header, stat
// strip, and this tab can never drift to different words for the same status
// (a `partial` lesson once read "Planned" up top and "Partly taught" here).
// Import the leaf, NOT "@/components/lesson-plan-v2" — that barrel closes an
// import cycle (barrel → PlanPage → tabs → barrel).
import { LESSON_STATUS_LABEL } from "../lesson-status";
import styles from "./tabs.module.css";

/** Strip the app-wide plain-text "I can " objective prefix for editing.
 *  Mirrors the regex the weekly/lesson cards use for display. */
function stripICanPrefix(html: string): string {
  return html.replace(/^I can\s+/i, "");
}

export interface OverviewTabProps {
  lessonId: string;
}

export function OverviewTab({ lessonId }: OverviewTabProps): ReactNode {
  const { getLesson, editLesson, subjectById, unitById } = usePlanner();
  const lesson = getLesson(lessonId);

  // Local editor state drives the contenteditable synchronously; every change
  // coalesce-commits to the store.
  const [objectiveHtml, setObjectiveHtml] = useState<string>(
    stripICanPrefix(lesson?.objective ?? ""),
  );
  const editingRef = useRef(false);

  // Reseed on lesson change and clear the editing guard.
  useEffect(() => {
    setObjectiveHtml(stripICanPrefix(lesson?.objective ?? ""));
    editingRef.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reseed when the store value changes under a still-selected lesson (undo /
  // redo from another surface) — but never while the teacher is typing.
  const storeObjective = lesson?.objective ?? "";
  useEffect(() => {
    if (!editingRef.current) setObjectiveHtml(stripICanPrefix(storeObjective));
  }, [storeObjective]);

  if (!lesson) {
    return (
      <div className={styles.emptyTab}>This lesson is no longer available.</div>
    );
  }

  function handleObjectiveChange(html: string): void {
    editingRef.current = true;
    setObjectiveHtml(html);
    const trimmed = html.trim();
    editLesson(
      lessonId,
      { objective: trimmed ? `I can ${trimmed}` : "" },
      { key: `lesson:${lessonId}:objective`, ts: Date.now() },
    );
  }

  const subject = subjectById[lesson.subject];
  const unit = unitById[lesson.unit];

  return (
    // `cp-subj <cls>` carries the subject's --c / --cl / --cd custom properties
    // (tokens.css, bridged by lib/palette.tsx). We set it on our own root rather
    // than relying on an ancestor, so the subject dot and the editor focus ring
    // are correct no matter what chrome hosts the tab.
    <div className={`cp-subj ${subject?.cls ?? ""} ${styles.tab}`}>
      <section className={styles.card}>
        <h3 className={styles.cardLabel}>Learning target (student-facing)</h3>
        <div
          className={styles.iCanRow}
          onBlurCapture={() => {
            editingRef.current = false;
          }}
        >
          {/* The stored prefix, shown as a lead-in. aria-hidden because the
              editor's own label already spells out the full "I can …" frame. */}
          <span className={styles.iCanLabel} aria-hidden="true">
            I can
          </span>
          <div className={styles.iCanEditor}>
            <RichTextEditor
              value={objectiveHtml}
              onChange={handleObjectiveChange}
              singleLine
              placeholder="state the lesson objective…"
              ariaLabel="Lesson objective (completes “I can …”)"
            />
          </div>
        </div>
        <p className={`${styles.hint} ${styles.hintUnder}`}>
          Written as the sentence a student would finish. This is the line that
          shows on the weekly card.
        </p>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardLabel}>Lesson</h3>
        <div className={styles.metaGrid}>
          <div className={styles.metaCell}>
            <span className={styles.metaKey}>Subject</span>
            <span className={`${styles.metaVal} ${styles.subjectVal}`}>
              <span className={styles.subjectDot} aria-hidden="true" />
              {subject?.name ?? lesson.subject}
            </span>
          </div>
          <div className={styles.metaCell}>
            <span className={styles.metaKey}>Unit</span>
            <span className={styles.metaVal}>{unit?.name ?? "No unit"}</span>
          </div>
          <div className={styles.metaCell}>
            <span className={styles.metaKey}>Week</span>
            <span className={styles.metaVal}>Week {lesson.week}</span>
          </div>
          <div className={styles.metaCell}>
            <span className={styles.metaKey}>Status</span>
            <span className={styles.metaVal}>
              <span
                className={`${styles.statusChip} ${
                  lesson.status === "done" ? styles.statusDone : ""
                }`}
              >
                {LESSON_STATUS_LABEL[lesson.status]}
              </span>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
