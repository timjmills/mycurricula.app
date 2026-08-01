import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mountReact } from "./mount-react";

// 30s, matching the other mount-based suites — a real mount plus a click
// sequence breaches vitest's 5s default under parallel lane load. Not a hang
// mask: these fail on an ASSERTION when the behaviour is mutated out.
vi.setConfig({ testTimeout: 30000 });
import type { Lesson, Subject } from "@/lib/types";

// The paper Week frame had NO way to add a lesson.
//
// WeekColumns is the frame the user's own appearance setting renders, and it
// was the only Week frame with no add affordance of any kind: glass has one
// (WeekA's per-day dashed add row) and colour has one (WeekC's per-cell add),
// while an empty paper column rendered the words "No lessons" and stopped
// there. Creating a lesson meant leaving the surface.
//
// This pins BOTH halves of the fix, because half of it is a false pass:
//   1. the trigger renders in EVERY configured school-day column — a single
//      add button somewhere on the surface would satisfy a naive "is there an
//      Add" assertion while still leaving four columns dead; and
//   2. it renders in an EMPTY column, which is the case that motivated the
//      finding. An add row that only appears once a column already has a
//      lesson cannot bootstrap an empty week.
//
// The column count is deliberately NOT five. CLAUDE.md §6 forbids hard-coding
// the school week, so the fixture runs a THREE-day week: a per-day affordance
// derived from a hard-coded weekday set would render five triggers here and
// fail loudly rather than silently agreeing with a 5-day fixture.
//
// Renders the shipped component via `react-dom/server` (vitest runs
// `environment: "node"`; no jsdom, no new dependency) — the same technique as
// tests/teach-false-empty.test.ts.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  subjectById: {} as Record<string, Subject>,
  /** Every `addLesson` call, in order — READ by the wiring block at the bottom. */
  added: [] as { subject: string; week: number; day: number }[],
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
    addLesson: async (draft: { subject: string; week: number; day: number }) => {
      store.added.push({
        subject: draft.subject,
        week: draft.week,
        day: draft.day,
      });
      return null;
    },
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
    selectedLessonId: null,
    setSelectedLessonId: () => {},
  }),
}));

// A THREE-day school week — see the header note. `index` is the value a
// lesson's `day` field must equal to land in that column.
const WEEKDAYS = [
  { token: "sun", index: 0, label: "Sun", longLabel: "Sunday" },
  { token: "mon", index: 1, label: "Mon", longLabel: "Monday" },
  { token: "tue", index: 2, label: "Tue", longLabel: "Tuesday" },
];

vi.mock("@/lib/week-order", () => ({
  useOrderedWeekdays: () => WEEKDAYS,
}));

vi.mock("@/lib/use-day-holiday", () => ({
  useHolidaysByDay: () => new Map(),
}));

vi.mock("@/lib/labels", () => ({
  useLabels: () => ({ lesson: "Lesson", week: "Week", unit: "Unit" }),
}));

// The lesson card and the archive toast are not what this asserts, and the card
// reaches for editor context this test does not provide.
vi.mock("@/components/weekly/weekly-lesson-card", () => ({
  WeeklyLessonCard: () => null,
  OpenLessonEditorContext: { Provider: () => null },
}));
vi.mock("@/components/lesson-card/archive-toast", () => ({
  ArchiveToast: () => null,
}));

const { WeekColumns } = await import("@/components/weekly/WeekColumns");

const SUBJECT = {
  id: "math",
  name: "Math",
  cls: "math",
  color: "var(--subj-1)",
} as unknown as Subject;

const LESSON = {
  id: "m-12-0",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  preview: "",
  directions: "",
  week: 12,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [],
  standards: [],
} as unknown as Lesson;

/** Occurrences of `needle` in `haystack`. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The add trigger's rendered label — `<span>+</span><span>Add</span>`. */
const ADD_TRIGGER = ">Add</span>";

beforeEach(() => {
  store.lessons = [];
  store.subjects = [SUBJECT];
  store.subjectById = { math: SUBJECT };
  store.added.length = 0;
});

describe("WeekColumns — the paper Week frame can add a lesson", () => {
  it("renders one add trigger per configured school day", () => {
    const html = renderToStaticMarkup(createElement(WeekColumns));
    expect(count(html, ADD_TRIGGER)).toBe(WEEKDAYS.length);
  });

  it("renders the add trigger in a column with NO lessons", () => {
    // Every column is empty here, so any trigger at all proves the affordance
    // does not depend on existing content.
    store.lessons = [];
    const html = renderToStaticMarkup(createElement(WeekColumns));
    expect(html).toContain("No lessons");
    expect(count(html, ADD_TRIGGER)).toBe(WEEKDAYS.length);
  });

  it("still renders one per day when only one day is populated", () => {
    store.lessons = [LESSON];
    const html = renderToStaticMarkup(createElement(WeekColumns));
    expect(count(html, ADD_TRIGGER)).toBe(WEEKDAYS.length);
  });

  it("gives the trigger a tooltip that says what it accomplishes", () => {
    // CLAUDE.md §4: a non-obvious control explains its OUTCOME, not its label.
    const html = renderToStaticMarkup(createElement(WeekColumns));
    expect(html).toContain("Add a lesson to this day");
  });

  it("does not offer an event the app cannot save", () => {
    // The trigger used to promise "a lesson OR A NON-INSTRUCTIONAL EVENT". The
    // lesson half works; the event half opens a form whose submit can only
    // report "Events can’t be saved yet" — the schedule store has no addBlock
    // action (components/daily/AddEventForm.tsx:182-199). A teacher who reads
    // the promise plans their assembly into a dialog that discards it.
    const html = renderToStaticMarkup(createElement(WeekColumns));
    expect(html).not.toContain("non-instructional event");
  });
});

// ── Which DAY each trigger adds to ──────────────────────────────────────────
//
// THE HOLE THE COUNTING TESTS ABOVE LEAVE. All three triggers render
// BYTE-IDENTICALLY — `<span>+</span><span>Add</span>`, same class, same
// tooltip — so `count(html, ">Add</span>") === 3` is satisfied by three
// triggers all wired to `handleQuickAdd(0)`. That is not a hypothetical
// slip: the callsite reads `onQuickAdd={() => void handleQuickAdd(dayIdx)}`
// inside a `.map`, and closing over the wrong variable (or over a stale `pos`)
// is the classic way that line goes wrong. Every assertion above would still
// pass while Monday's and Tuesday's Add buttons silently created Sunday
// lessons — a lesson landing on the wrong day with no error anywhere.
//
// Only a real click can see the argument. `tests/mount-react.ts` mounts with
// react-dom/client over linkedom, so the menu opens, "New lesson" is clickable,
// and `addLesson` records the `day` the closure actually passed.
//
// (The three triggers being indistinguishable in the markup is ALSO an
// accessibility defect — CLAUDE.md §4 wants a per-day accessible name, so a
// screen-reader user does not hear "Add" three times with no way to tell the
// columns apart. That is a change to the shipped component and is reported
// separately; this block covers the wiring, which is the data bug.)

/** Matcher for the nth (0-based) add trigger in document order. */
function nthAddTrigger(n: number): (el: Element) => boolean {
  let seen = -1;
  return (el) => {
    if ((el.textContent ?? "") !== "+Add") return false;
    seen += 1;
    return seen === n;
  };
}

const NEW_LESSON_ROW = (el: Element): boolean =>
  (el.textContent ?? "").startsWith("+New lesson");

describe("WeekColumns — each column's trigger adds to ITS OWN day", () => {
  it("passes the column's day index, not a shared one", async () => {
    const h = await mountReact(WeekColumns as never);
    try {
      await h.render({} as never);

      for (let i = 0; i < WEEKDAYS.length; i += 1) {
        await h.click(nthAddTrigger(i));
        await h.click(NEW_LESSON_ROW);
      }

      // VACUITY GUARD FIRST: a matcher that silently matched nothing, or a menu
      // that never opened, would leave `added` empty and make every claim below
      // an assertion about nothing. `mountReact.click` throws on no match, but
      // the count is the cheap belt-and-braces.
      expect(store.added).toHaveLength(WEEKDAYS.length);

      // THE PROPERTY: the nth trigger adds to the nth configured school day.
      expect(store.added.map((a) => a.day)).toEqual(
        WEEKDAYS.map((d) => d.index),
      );
      // And it carries the browsed week, not a default.
      expect(store.added.every((a) => a.week === 12)).toBe(true);
    } finally {
      await h.unmount();
    }
  });
});
