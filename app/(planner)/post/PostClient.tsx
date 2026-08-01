"use client";

// The client half of /post: validates the URL anchors against the live stores
// and mounts <ResourceWall> with the two seams only a route can supply.
//
// resourcesFor is the CANONICAL per-lesson resource list. A lesson's live
// resources belong to its SECTIONS (usePlanner().getSections — see
// lib/lesson-resources, audit BUG-006); `lesson.resources` is only the
// fixture seed threaded into the initial sections and never updates after
// a teacher edits. The wall's built-in default reads that seed (it has no
// section store), so without this injection the wall would silently show
// a frozen snapshot. The union with the lesson-level rows is deduped by
// content identity so a row that seeded a section doesn't double-render.
// (Board sends need no seam here — the wall mounts OpenInBoardDialog itself,
// which owns the copy, grade resolution, and its own navigation.)
import { useCallback } from "react";
import { ResourceWall } from "@/components/resource-wall-v2";
import { usePlanner } from "@/lib/planner-store";
import { lessonResources } from "@/lib/lesson-resources";
import { dedupeLessonResources } from "@/lib/resources-dedup";
import { SUBJECT_BY_ID } from "@/lib/mock/subjects";
import type { Lesson, LessonResource, SubjectId } from "@/lib/types";
import type { WallPreset } from "@/lib/wall-scope";

export function PostClient({
  lessonId,
  subjectId,
  unitId,
  preset = null,
}: {
  lessonId: string | null;
  subjectId: string | null;
  unitId: string | null;
  /**
   * A landing preset asked for by `?preset=`, already narrowed to the union by
   * the route. Null when the URL carried none — the overwhelmingly common
   * case — and the wall then infers its landing preset from the anchors below,
   * exactly as before.
   *
   * This is the ONLY route onto the two WEEK presets: `anchoredPreset` maps
   * anchors to lesson / subject / unit / today and can never return
   * "week-mixed" or "week-subject".
   */
  preset?: WallPreset | null;
}) {
  const { getLesson, getSections } = usePlanner();

  // Anchors resolve against the live stores: an unknown lesson id is dropped
  // (→ the no-focus default preset), an unknown subject id is dropped (unit
  // rides on subject, so it drops too — unit ids are unique only per subject).
  const focusLesson = lessonId ? (getLesson(lessonId) ?? null) : null;
  const focusSubject =
    subjectId && subjectId in SUBJECT_BY_ID ? (subjectId as SubjectId) : null;

  const resourcesFor = useCallback(
    (lesson: Lesson): readonly LessonResource[] =>
      dedupeLessonResources({
        sectionResources: lessonResources(getSections(lesson.id)),
        lessonResources: lesson.resources,
      }),
    [getSections],
  );

  return (
    <ResourceWall
      focusLessonId={focusLesson?.id ?? null}
      focusSubject={focusSubject ?? focusLesson?.subject ?? null}
      focusUnit={focusSubject ? unitId : null}
      // The RAW query, unvalidated: the wall uses it as the deep link's IDENTITY,
      // which the resolved anchors above cannot carry. They go null and back
      // again every time the planner (re-)hydrates — `getLesson` has nothing to
      // answer with until it lands — whereas this changes only when the URL does.
      initialPreset={preset}
      // The preset joins the deep link's IDENTITY. Without it, navigating from
      // /post?preset=week-mixed to /post?preset=subject would leave anchorKey
      // unchanged (both have no anchors) and the wall would not treat the
      // second link as a new deep link at all.
      anchorKey={`${lessonId ?? ""}|${subjectId ?? ""}|${unitId ?? ""}|${preset ?? ""}`}
      resourcesFor={resourcesFor}
    />
  );
}
