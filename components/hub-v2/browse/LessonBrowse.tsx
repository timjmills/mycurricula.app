"use client";

// LessonBrowse.tsx — the Planner Hub's "open a lesson" picker (Wave 8).
//
// Real catalog data only: every non-archived lesson, grouped by subject (always
// real, unlike the bundle's fabricated Day/Week/Month toggle), filtered by the
// live search string. A row click opens the lesson as a LessonDoc.

import { useMemo, type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { useOrderedWeekdays } from "@/lib/week-order";
import { stripHtml } from "@/lib/html-text";
import { StatusDot } from "@/components/planner-v2";
import { deriveDayStatus } from "@/lib/day-status";
import type { Lesson, SubjectId } from "@/lib/types";
import type { HubBrowseProps } from "./browse-data";
import { queryMatches } from "./browse-data";
import styles from "./browse.module.css";

export function LessonBrowse({ query, onOpenDoc }: HubBrowseProps): ReactNode {
  const { lessons, subjects, subjectById, units } = usePlanner();
  const weekdays = useOrderedWeekdays();

  const dayLabel = useMemo(() => {
    const map = new Map<number, string>();
    for (const w of weekdays) map.set(w.index, w.label);
    return (day: number): string => map.get(day) ?? `Day ${day + 1}`;
  }, [weekdays]);

  // Unit display name, keyed by `${subject}:${unitId}` — slugs are unique only
  // WITHIN a subject, so we never do a flat `unitById[slug]` lookup.
  const unitName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) map.set(`${u.subject}:${u.id}`, u.name);
    return (subject: SubjectId, unit: string): string | undefined =>
      map.get(`${subject}:${unit}`);
  }, [units]);

  // Group non-archived, query-matched lessons by subject, in subject order.
  const groups = useMemo(() => {
    const visible = lessons.filter(
      (l) =>
        !l.archived &&
        queryMatches(query, stripHtml(l.title), subjectById[l.subject]?.name),
    );
    return subjects
      .map((subject) => ({
        subject,
        rows: visible
          .filter((l) => l.subject === subject.id)
          .sort((a, b) => a.week - b.week || a.day - b.day),
      }))
      .filter((g) => g.rows.length > 0);
  }, [lessons, subjects, subjectById, query]);

  if (groups.length === 0) {
    return (
      <>
        <Head />
        <p className={styles.empty}>
          {query.trim()
            ? `No lessons match “${query.trim()}”.`
            : "No lessons yet."}
        </p>
      </>
    );
  }

  return (
    <>
      <Head />
      {groups.map(({ subject, rows }) => (
        <div key={subject.id} className={styles.group}>
          <div className={styles.groupHead}>
            {subject.name}
            <span className={styles.groupCount}>{rows.length}</span>
          </div>
          <div className={styles.list}>
            {rows.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                dayLabel={dayLabel}
                unitLabel={unitName(lesson.subject, lesson.unit)}
                onOpen={() =>
                  onOpenDoc({
                    kind: "lesson",
                    id: lesson.id,
                    title: stripHtml(lesson.title),
                    sid: lesson.subject,
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Head(): ReactNode {
  return (
    <div className={styles.head}>
      <div className={styles.crumb}>Planner</div>
      <h1 className={styles.title}>Lessons</h1>
      <p className={styles.sub}>Open any lesson to plan it in place.</p>
    </div>
  );
}

function LessonRow({
  lesson,
  dayLabel,
  unitLabel,
  onOpen,
}: {
  lesson: Lesson;
  dayLabel: (day: number) => string;
  unitLabel: string | undefined;
  onOpen: () => void;
}): ReactNode {
  const { subjectById } = usePlanner();
  const subj = subjectById[lesson.subject as SubjectId];
  // The hub is not the live day, so never paint a false "now": read completion
  // from store truth (isToday=false → done | idle).
  const status = deriveDayStatus(lesson, -1, false);
  return (
    <button
      type="button"
      className={`cp-subj ${subj?.cls ?? ""} ${styles.row} ${lesson.modified ? styles.rowStripeModified : ""}`}
      onClick={onOpen}
    >
      <span className={styles.rowTime}>
        Wk {lesson.week} · {dayLabel(lesson.day)}
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{stripHtml(lesson.title)}</span>
        <span className={styles.rowSub}>
          <span className={styles.rowSubject}>{subj?.name}</span>
          {unitLabel ? ` · ${unitLabel}` : ""}
        </span>
      </span>
      {/* StatusDot is aria-hidden (color only), so name the status for AT. */}
      <span className={styles.srOnly}>
        {status === "done" ? "Taught" : "Not taught yet"}
      </span>
      <StatusDot status={status} />
    </button>
  );
}
