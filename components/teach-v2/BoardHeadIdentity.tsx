"use client";

// BoardHeadIdentity — the "what am I teaching, and what is it for?" block in the
// v2 Teach board header.
//
// WHY IT EXISTS. The v2 board header only ever named the SUBJECT ("Math"). The
// lesson's title, its "I can" objective, and its standards lived exclusively in
// the left lesson rail — and the rail is exactly what disappears when a teacher
// expands the board or goes fullscreen to project (TeachV2Shell's
// `lessonHidden`). So the moment the board is doing its actual job, the room had
// no on-screen record of what the lesson was or what it was for. The header
// renders in BOTH states, so the identity belongs here.
//
// PRESENTATIONAL + SSR-RENDERABLE IN ISOLATION. It takes the subject's glyph and
// label as props (the shell already resolves them from SUBJECT_BY_ID) and reads
// nothing from the board/canvas/annotation engines — so it can be rendered to a
// string in a node test. Its only data seam is usePlanner()/usePlannerDataState(),
// mirroring components/teach/left/modules/LessonCardModule.tsx.
//
// THE HYDRATE WINDOW. `getLesson` scans a document that is empty for the whole
// Supabase hydrate, and app/(teach)/layout.tsx mounts its OWN <PlannerProvider>
// so every Day/Week→Teach navigation pays it afresh. This block therefore never
// states an absence it cannot know: with no resolved lesson it renders the
// subject name alone and stops. There is no "no lesson" copy to be wrong with —
// the LessonRail's LessonCardModule owns that message (and defers it correctly),
// and a header is the wrong place to repeat it. A resolved lesson wins over the
// data state, so a slow hydration flag can never blank a title already in hand.
//
// RICH TEXT. Lesson.title and Lesson.objective may both carry rich-text HTML
// (lib/types.ts). Everything here — including every title= attribute — goes
// through stripHtml, so a stored "<p>Fractions</p>" reads as "Fractions" rather
// than leaking markup into a projected header.

import { type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { stripHtml } from "@/lib/html-text";
import { StandardPill } from "@/components/ui";
import styles from "./TeachV2Shell.module.css";

/** How many standards pills fit beside the objective before they start
 *  competing with the board switcher + tool cluster for header width. */
const STANDARDS_SHOWN = 3;

export interface BoardHeadIdentityProps {
  /** The active master lesson id, or null in sandbox / no-lesson mode. */
  activeLessonId: string | null;
  /** The subject's display name — resolved by the shell from SUBJECT_BY_ID. */
  subjectLabel: string;
  /** The subject's glyph, already defaulted by the shell. */
  subjectGlyph: string;
}

export function BoardHeadIdentity({
  activeLessonId,
  subjectLabel,
  subjectGlyph,
}: BoardHeadIdentityProps): ReactNode {
  const { getLesson } = usePlanner();
  const lesson = activeLessonId ? getLesson(activeLessonId) : undefined;

  // Strip FIRST, then fall back: an objective stored as empty markup ("<p></p>")
  // is not an objective, and would otherwise render as a blank line.
  const title = lesson ? stripHtml(lesson.title) : "";
  const objective = lesson
    ? stripHtml(lesson.objective) ||
      stripHtml(lesson.preview) ||
      "No objective recorded."
    : "";
  const standards = lesson?.standards ?? [];

  // With no lesson in hand the header names the subject and says nothing more —
  // true whether the store is mid-hydrate, failed, or genuinely lesson-less.
  const heading = title || subjectLabel;

  return (
    <span className={styles.identity}>
      <span className={styles.boardGlyph} aria-hidden="true">
        {subjectGlyph}
      </span>
      <span className={styles.identityText}>
        <span className={styles.boardName} title={heading}>
          {heading}
        </span>
        {lesson ? (
          <span className={styles.identityMeta}>
            <span className={styles.subjectTag}>{subjectLabel}</span>
            <span className={styles.objective} title={objective}>
              {objective}
            </span>
            {standards.length > 0 ? (
              <span className={styles.identityStandards}>
                {standards.slice(0, STANDARDS_SHOWN).map((code) => (
                  <StandardPill key={code} code={code} />
                ))}
                {standards.length > STANDARDS_SHOWN ? (
                  <span className={styles.standardsMore}>
                    +{standards.length - STANDARDS_SHOWN}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}
