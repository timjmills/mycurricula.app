"use client";

// YearDayCards — the WEEK-scope day cards in the merged Yearly view. One card
// per lesson in the focused week: day name, status dot, lesson title, the
// "I can…" objective pill, up to two standards pills, and a time badge. Clicking
// a card selects the lesson → the right-hand YearLessonPane opens. Carries the
// Curriculum "Daily lessons" content in the Yearly card aesthetic. The subject
// color comes from the ambient `.cp-subj` cascade (--c / --cd). Tokens only.

import type { ReactNode } from "react";
import type { Lesson, LessonStatus } from "@/lib/types";
import { WEEK_DAYS } from "@/lib/mock";
import { StandardPill } from "@/components/ui";
import styles from "./year-day-cards.module.css";

export interface YearDayCardsProps {
  lessons: Lesson[];
  selectedId: string | null;
  onPick: (id: string) => void;
}

function dayName(day: number): string {
  return WEEK_DAYS[day] ?? `Day ${day + 1}`;
}

function IconCheck(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function IconClock(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconSkip(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconDots(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

function statusGlyph(status: LessonStatus): {
  node: ReactNode;
  cls: keyof typeof statusClasses;
  label: string;
} {
  switch (status) {
    case "done":
      return { node: <IconCheck />, cls: "done", label: "Completed" };
    case "partial":
    case "carried":
      return { node: <IconClock />, cls: "cur", label: "In progress" };
    case "skipped":
      return { node: <IconSkip />, cls: "skip", label: "Skipped" };
    default:
      return { node: <IconDots />, cls: "todo", label: "Upcoming" };
  }
}

// Keyed so the switch above stays in sync with the CSS module class names.
const statusClasses = {
  done: "stDone",
  cur: "stCur",
  skip: "stSkip",
  todo: "stTodo",
} as const;

export function YearDayCards({
  lessons,
  selectedId,
  onPick,
}: YearDayCardsProps): ReactNode {
  if (lessons.length === 0) {
    return <div className={styles.empty}>No lessons planned for this week.</div>;
  }

  const ordered = [...lessons].sort((a, b) => a.day - b.day);

  return (
    <div className={styles.grid}>
      {ordered.map((l) => {
        const sel = l.id === selectedId;
        const st = statusGlyph(l.status);
        return (
          <button
            key={l.id}
            type="button"
            className={`${styles.card} ${sel ? styles.cardOn : ""}`}
            onClick={() => onPick(l.id)}
            aria-current={sel}
          >
            <span className={styles.head}>
              <span className={styles.day}>{dayName(l.day)}</span>
              <span
                className={`${styles.status} ${styles[statusClasses[st.cls]]}`}
                title={st.label}
              >
                {st.node}
              </span>
            </span>

            <span className={styles.title}>{l.title}</span>

            {l.objective ? (
              <span className={styles.objective}>
                <span className={styles.objIcon} aria-hidden="true">
                  <IconCheck />
                </span>
                {l.objective}
              </span>
            ) : null}

            {l.standards.length > 0 ? (
              <span className={styles.pills}>
                {l.standards.slice(0, 2).map((code) => (
                  <StandardPill key={code} code={code} />
                ))}
                {l.standards.length > 2 ? (
                  <span className={styles.more}>+{l.standards.length - 2}</span>
                ) : null}
              </span>
            ) : null}

            <span className={styles.foot}>
              <span className={styles.time}>{l.time ?? "45 min"}</span>
              {l.isPersonal ? (
                <span className={styles.personal}>Personal</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
