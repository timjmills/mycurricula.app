// Thin "today" selectors for the home screen, composing the existing mock
// helpers (no new data shapes). "Today" is the mock's current day/week so the
// home screen agrees with the planner. Deterministic (no real `Date`) to stay
// SSR/hydration-safe — the greeting derives from the mock clock, not wall time.

import { getDayBlocks, todayDayIndex, nowMinuteMock } from "@/lib/schedule-data";
import { LESSONS, CURRENT_WEEK, lessonsForWeek } from "@/lib/mock/lessons";
import { TODOS, TAG_BY_ID } from "@/lib/mock/todos";
import { notesForDay } from "@/lib/mock/notes";
import { shoutboxForDay } from "@/lib/mock/shoutbox";
import { dateForWeekDay } from "@/lib/mock/calendar";

export const TODAY = todayDayIndex();
export const WEEK = CURRENT_WEEK;

type Tag = (typeof TAG_BY_ID)[string];

export function todayDate(): Date {
  return dateForWeekDay(WEEK, TODAY);
}

export function greetingWord(nowMin: number = nowMinuteMock()): string {
  if (nowMin < 12 * 60) return "Good morning";
  if (nowMin < 17 * 60) return "Good afternoon";
  return "Good evening";
}

export function todaySchedule() {
  return getDayBlocks(TODAY);
}

export function todayLessons() {
  return LESSONS.filter((l) => l.week === WEEK && l.day === TODAY && !l.archived);
}

export interface TodoWithTags {
  id: string;
  title: string;
  scope: "personal" | "team";
  tags: Tag[];
}

export function todayTodos(): TodoWithTags[] {
  return TODOS.filter((t) => t.due === "today" && !t.done).map((t) => ({
    id: t.id,
    title: t.title,
    scope: t.scope,
    tags: t.tags.map((id) => TAG_BY_ID[id]).filter((x): x is Tag => Boolean(x)),
  }));
}

export function todayNotes() {
  return notesForDay(TODAY).filter(
    (n) => n.priority === "urgent" || n.priority === "important",
  );
}

export function todayShoutbox() {
  return shoutboxForDay(WEEK, TODAY);
}

export interface WeekProgress {
  done: number;
  total: number;
  pct: number;
}

export function weekProgress(): WeekProgress {
  const all = lessonsForWeek(WEEK).filter((l) => !l.archived);
  const done = all.filter((l) => l.status === "done").length;
  return {
    done,
    total: all.length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
  };
}

export { nowMinuteMock };
