"use client";

// Quiet Dawn below-the-fold day-rows. Understated, borderless rows with hairline
// dividers (not heavy cards). Each consumes the lib/home/today selectors. Links
// (not buttons) navigate into the planner, so the .cp-root button reset doesn't
// apply here.

import Link from "next/link";
import type { ComponentType } from "react";
import {
  todaySchedule,
  todayTodos,
  todayLessons,
  weekProgress,
  todayShoutbox,
  todayNotes,
} from "@/lib/home/today";
import { TIPS } from "@/lib/home/tips";
import { TEACHER_BY_ID } from "@/lib/mock/teachers";
import type { HomeRowId } from "@/lib/home/use-home-layout";
import styles from "./rows.module.css";

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function Row({
  label,
  children,
  action,
  size,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  /** "tall" cards span two dashboard rows — schedule + lessons anchor the grid. */
  size?: "tall";
}) {
  return (
    <section className={`${styles.row} ${size === "tall" ? styles.tall : ""}`}>
      <header className={styles.rowHead}>
        <h2 className={styles.rowLabel}>{label}</h2>
        {action}
      </header>
      <div className={styles.rowBody}>{children}</div>
    </section>
  );
}

export function TodayScheduleRow() {
  const blocks = todaySchedule();
  return (
    <Row label="Today's schedule" size="tall">
      {blocks.length ? (
        <ul className={styles.schedule}>
          {blocks.map((b) => (
            <li key={b.id} className={`cp-subj ${b.subject ?? ""} ${styles.block}`}>
              <span className={styles.blockTime}>{b.startLabel}</span>
              <span className={styles.blockDot} aria-hidden />
              <span className={styles.blockName}>
                {b.subject ? cap(b.subject) : b.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No blocks scheduled today.</p>
      )}
    </Row>
  );
}

export function TodoRow() {
  const todos = todayTodos();
  return (
    <Row
      label="To-do"
      action={
        <Link href="/weekly" className={styles.rowLink}>
          Open planner
        </Link>
      }
    >
      {todos.length ? (
        <ul className={styles.todos}>
          {todos.map((t) => (
            <li key={t.id} className={styles.todo}>
              <span className={styles.todoCheck} aria-hidden />
              <span className={styles.todoTitle}>{t.title}</span>
              <span className={styles.todoTags}>
                {t.tags.map((tg) => (
                  <span
                    key={tg.id}
                    className={styles.tag}
                    style={{ background: tg.bg, color: tg.fg }}
                  >
                    {tg.label}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Nothing due today.</p>
      )}
    </Row>
  );
}

export function TodayLessonsRow() {
  const lessons = todayLessons();
  return (
    <Row
      label="Today's lessons"
      size="tall"
      action={
        <Link href="/daily" className={styles.rowLink}>
          Open Daily
        </Link>
      }
    >
      {lessons.length ? (
        <ul className={styles.lessons}>
          {lessons.map((l) => (
            <li key={l.id} className={`cp-subj ${l.subject} ${styles.lesson}`}>
              <span className={styles.lessonStripe} aria-hidden />
              <div className={styles.lessonText}>
                <span className={styles.lessonTitle}>{l.title}</span>
                {l.objective && <span className={styles.lessonObj}>{l.objective}</span>}
              </div>
              {l.status === "done" && (
                <span className={styles.doneTick} aria-label="done">
                  ✓
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No lessons scheduled today.</p>
      )}
    </Row>
  );
}

export function WeekProgressRow() {
  const { done, total, pct } = weekProgress();
  return (
    <Row label="This week's progress">
      <div className={styles.progress}>
        <div className={styles.progressTrack}>
          <span className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <p className={styles.progressLabel}>
          {done} of {total} lessons done · {pct}% this week
        </p>
      </div>
    </Row>
  );
}

export function ShoutboxRow() {
  const msgs = todayShoutbox();
  const notes = todayNotes();
  const empty = !msgs.length && !notes.length;
  return (
    <Row label="Team shoutbox & notes">
      {notes.map((n, i) => (
        <div key={`note-${i}`} className={`${styles.note} ${styles[n.priority] ?? ""}`}>
          <span className={styles.noteBadge}>{n.priority}</span>
          <span>{n.body}</span>
        </div>
      ))}
      {msgs.map((m) => (
        <div key={m.id} className={styles.msg}>
          <span className={styles.msgMeta}>
            <b>{TEACHER_BY_ID[m.author]?.name ?? m.author}</b> · {m.time}
          </span>
          <p className={styles.msgBody}>{m.body}</p>
        </div>
      ))}
      {empty && <p className={styles.empty}>No messages or notes today.</p>}
    </Row>
  );
}

export function QuickLinksRow() {
  const links: [string, string][] = [
    ["/weekly", "Weekly"],
    ["/daily", "Daily"],
    ["/year", "Year"],
    ["/subject", "Curriculum"],
  ];
  return (
    <Row label="Jump back in">
      <div className={styles.links}>
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={styles.jumpCard}>
            {label}
          </Link>
        ))}
      </div>
    </Row>
  );
}

export function TipsRow() {
  return (
    <Row label="Tips & help">
      <p className={styles.tip}>{TIPS[0]}</p>
    </Row>
  );
}

export const HOME_ROWS: Record<HomeRowId, ComponentType> = {
  schedule: TodayScheduleRow,
  todo: TodoRow,
  lessons: TodayLessonsRow,
  progress: WeekProgressRow,
  shoutbox: ShoutboxRow,
  links: QuickLinksRow,
  tips: TipsRow,
};
