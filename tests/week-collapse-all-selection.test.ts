import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";

vi.setConfig({ testTimeout: 30000 });
import type { Lesson, Subject } from "@/lib/types";

// "Collapse all" left the selection ring — and WeeklyShell's `?lesson=` URL
// mirror — on a card it had just shut. Nothing was open, yet something was
// still ringed.
//
// THE RULE IS NARROWER THAN "COLLAPSING RELEASES", and the narrowness is the
// whole point of this file:
//
//   · collapsing a DIFFERENT card must NOT release. The selection then still
//     sits on an OPEN card, so ring and body agree; clearing it would pull the
//     ring off a lesson the teacher is reading. Adjudicated a false positive in
//     `a82b8e2` and pinned there — this file must not contradict it.
//   · collapsing the SELECTED card already releases, at the canvas
//     (WeekA.tsx:316-320).
//   · COLLAPSE-ALL was the remaining hole, and it is the case where the
//     invariant genuinely breaks.
//
// And one more edge that a blunt "clear on collapse-all" would get wrong:
// `collapseAll()` only collapses the ids the canvas is SHOWING. A lesson hidden
// by a filter stays expanded, so a selection sitting on one of those was not
// shut and must survive — along with its deep link. Both directions are
// asserted below; the second is what stops the fix from being a bigger bug than
// the one it closes.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  subjectById: {} as Record<string, Subject>,
}));

const appState = vi.hoisted(() => ({
  selectedLessonId: null as string | null,
  /** Every setSelectedLessonId call, in order. */
  setCalls: [] as (string | null)[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: store.subjectById,
    moveLesson: () => {},
    setLessonStatus: () => {},
    editLesson: () => {},
    duplicateLesson: () => {},
    setSaveTarget: () => {},
    unarchiveLesson: () => {},
    addLesson: async () => null,
    lastChange: null,
  }),
  scrollPlannerItemIntoView: () => {},
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    week: 12,
    currentWeek: 12,
    currentWeekBasis: "date",
    search: "",
    filters: { subjects: [], units: [], statuses: [], standards: [] },
    viewMode: "grid",
    setViewMode: () => {},
    selectedLessonId: appState.selectedLessonId,
    setSelectedLessonId: (id: string | null) => {
      appState.setCalls.push(id);
      appState.selectedLessonId = id;
    },
  }),
}));

// useWeeklyScheduleMode throws outside its own provider, by design.
vi.mock("@/lib/weekly-schedule-state", () => ({
  useWeeklyScheduleMode: () => ({
    setMode: () => {},
    scheduleMode: false,
    events: "lessons",
    setEvents: () => {},
  }),
}));

const WEEKDAYS = [
  { token: "sun", index: 0, label: "Sun", longLabel: "Sunday" },
  { token: "mon", index: 1, label: "Mon", longLabel: "Monday" },
  { token: "tue", index: 2, label: "Tue", longLabel: "Tuesday" },
];

vi.mock("@/lib/week-order", () => ({
  useOrderedWeekdays: () => WEEKDAYS,
}));
vi.mock("@/lib/use-day-holiday", () => ({ useHolidaysByDay: () => new Map() }));
vi.mock("@/lib/labels", () => ({
  useLabels: () => ({ lesson: "Lesson", week: "Week", unit: "Unit" }),
}));
vi.mock("@/components/weekly/weekly-lesson-card", () => ({
  WeeklyLessonCard: ({ lesson }: { lesson: Lesson }) =>
    createElement("div", null, lesson.title),
  OpenLessonEditorContext: { Provider: () => null },
}));
vi.mock("@/components/lesson-card/archive-toast", () => ({
  ArchiveToast: () => null,
}));

const { WeekColumns } = await import("@/components/weekly/WeekColumns");
const { WeeklyViewControls } = await import(
  "@/components/weekly/WeeklyViewControls"
);
const { WeekExpansionProvider } = await import("@/lib/week-expansion");

const SUBJECT = {
  id: "math",
  name: "Math",
  cls: "math",
  color: "var(--subj-1)",
} as unknown as Subject;

const mkLesson = (id: string, title: string, day: number): Lesson =>
  ({
    id,
    subject: "math",
    unit: "u1",
    title,
    preview: "",
    directions: "",
    week: 12,
    day,
    status: "planned",
    archived: false,
    modified: false,
    resources: [],
    standards: [],
  }) as unknown as Lesson;

const VISIBLE = mkLesson("m-12-0", "Fractions on a number line", 0);

function Harness(): ReactNode {
  return createElement(
    WeekExpansionProvider,
    null,
    createElement(WeeklyViewControls, {}),
    createElement(WeekColumns, {}),
  );
}

const byText =
  (text: string) =>
  (el: Element): boolean =>
    (el.textContent ?? "").trim() === text;

beforeEach(() => {
  store.lessons = [VISIBLE];
  store.subjects = [SUBJECT];
  store.subjectById = { math: SUBJECT };
  appState.selectedLessonId = null;
  appState.setCalls.length = 0;
});

describe("Collapse all releases a selection it has shut", () => {
  it("clears the selection when the selected lesson was on screen", async () => {
    const h = await mountReact(Harness);
    try {
      await h.render({});

      // CONTROL: the control is really there and really flips. Without this,
      // "setSelectedLessonId(null) was called" could be satisfied by a button
      // that never existed — `mountReact.click` throws on no match, and the
      // label flip proves the expansion state actually moved.
      await h.click(byText("Expand all"));
      expect(h.html()).toContain("Collapse all");

      appState.selectedLessonId = VISIBLE.id;
      await h.render({});

      await h.click(byText("Collapse all"));
      expect(appState.setCalls).toEqual([null]);
      expect(appState.selectedLessonId).toBeNull();
    } finally {
      await h.unmount();
    }
  });

  it("leaves a selection alone when that lesson is NOT on screen", async () => {
    // `collapseAll()` collapses only the ids the canvas published. A lesson a
    // filter has hidden stays expanded, so its selection was not shut and must
    // survive — otherwise the fix silently drops the teacher's `?lesson=` deep
    // link. This is the counterfactual that keeps the rule narrow.
    const h = await mountReact(Harness);
    try {
      await h.render({});
      await h.click(byText("Expand all"));
      expect(h.html()).toContain("Collapse all"); // same control as above

      appState.selectedLessonId = "m-99-9"; // never published by the canvas
      await h.render({});

      await h.click(byText("Collapse all"));
      expect(appState.setCalls).toEqual([]);
      expect(appState.selectedLessonId).toBe("m-99-9");
    } finally {
      await h.unmount();
    }
  });
});
