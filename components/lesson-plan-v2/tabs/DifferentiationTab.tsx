"use client";

// DifferentiationTab.tsx — Lesson Plan panel, differentiation (W7, B:8408-8412).
//
// Three bordered cards — Support / On level / Extension — each a rich-text
// editor. All three write the WHOLE `LessonDifferentiation` object back through
// one coalesced `editLesson(id, { differentiation })` under
// `lesson:<id>:differentiation`, so editing any tier is one undo step and the
// other two tiers are never dropped.
//
// Ported from components/daily/planning-tabs/PlanningTabs.tsx (:717-746), which
// Wave 3.8 orphaned — leaving `Lesson.differentiation` (lib/types.ts) writable
// by nothing on this branch even though it still round-trips to Supabase
// (lib/planner/supabase-source.ts). This tab closes that regression.
//
// The bundle hardcodes prose in each card ("Provide sentence frames…"). We
// render the REAL field, and the empty state is a placeholder — a lesson with no
// differentiation planned is the common case, not an error.
//
// The editing guard is the same one the objective and notes editors use: local
// state drives the contenteditable synchronously, and an external store update
// (undo/redo from another surface) only reseeds the editors when the teacher is
// not mid-keystroke. `onBlurCapture` on the grid clears the guard once focus
// leaves any tier.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { RichTextEditor } from "@/components/rich-text";
import type { LessonDifferentiation } from "@/lib/types";
import styles from "./tabs.module.css";

const EMPTY_DIFF: LessonDifferentiation = {
  support: "",
  onLevel: "",
  extension: "",
};

const TIERS = [
  ["support", "Support"],
  ["onLevel", "On level"],
  ["extension", "Extension"],
] as const;

export interface DifferentiationTabProps {
  lessonId: string;
}

export function DifferentiationTab({
  lessonId,
}: DifferentiationTabProps): ReactNode {
  const { getLesson, editLesson, subjectById } = usePlanner();
  const lesson = getLesson(lessonId);

  const [diff, setDiff] = useState<LessonDifferentiation>(
    lesson?.differentiation ?? EMPTY_DIFF,
  );
  const editingRef = useRef(false);

  // Reseed every tier on lesson change; clear the guard.
  useEffect(() => {
    setDiff(lesson?.differentiation ?? EMPTY_DIFF);
    editingRef.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reseed on an external store change (undo/redo), never mid-typing.
  const store = lesson?.differentiation;
  useEffect(() => {
    if (!editingRef.current) setDiff(store ?? EMPTY_DIFF);
  }, [store?.support, store?.onLevel, store?.extension]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lesson) {
    return (
      <div className={styles.emptyTab}>This lesson is no longer available.</div>
    );
  }

  function handleChange(tier: keyof LessonDifferentiation, html: string): void {
    editingRef.current = true;
    const next: LessonDifferentiation = { ...diff, [tier]: html };
    setDiff(next);
    editLesson(
      lessonId,
      { differentiation: next },
      { key: `lesson:${lessonId}:differentiation`, ts: Date.now() },
    );
  }

  return (
    // `cp-subj <cls>` carries the subject's --c so each tier editor's focus ring
    // takes the lesson's hue.
    <div
      className={`cp-subj ${subjectById[lesson.subject]?.cls ?? ""} ${styles.tab}`}
    >
      <p className={styles.hint}>
        How the same lesson reaches each group. Anything you write here saves to
        your copy of the lesson.
      </p>
      <div
        className={styles.diffGrid}
        onBlurCapture={() => {
          editingRef.current = false;
        }}
      >
        {TIERS.map(([tier, label]) => (
          <section key={tier} className={styles.diffCard}>
            <h3 className={styles.diffTitle}>{label}</h3>
            <div className={`${styles.editor} ${styles.diffEditor}`}>
              <RichTextEditor
                value={diff[tier]}
                onChange={(html) => handleChange(tier, html)}
                placeholder={`Plan the ${label.toLowerCase()} tier…`}
                ariaLabel={`Differentiation — ${label}`}
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
