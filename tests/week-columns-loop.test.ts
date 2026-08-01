import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";

// A real mount plus clicks; 30s matches the other mount-based suites. NOT a
// hang mask — the <LoopGuard> below turns the failure this file exists for into
// a named assertion, so a timeout here would mean something else went wrong.
vi.setConfig({ testTimeout: 30000 });
import type { Lesson, Subject } from "@/lib/types";

// WeekColumns — the PAPER Week frame — published its visible ids in one effect
// whose CLEANUP published `[]`.
//
// `a82b8e2` found and fixed exactly this in WeekA and WeekC, and said so in its
// message: "components/weekly/WeekColumns.tsx:301-303 has the identical pattern
// and is NOT fixed here". This is that lane.
//
// THE MECHANISM. The effect's re-run condition is the IDENTITY of
// `visibleLessonIds`, not its contents. `byDay` is memoized on `lessons`,
// `filters`, `search` and `subjects` — so a store that hands back a fresh
// `filters` or `subjects` array on every call (an unmemoized provider, and every
// hand-written double) gives `byDay` a new identity per render, which gives
// `visibleLessonIds` a new identity, which re-runs the effect, which publishes
// `[]` on the way out and `ids` on the way in. Both halves commit state. The
// canvas spins forever.
//
// The comment that shipped above it at :285 reasoned "publishVisible ignores an
// unchanged list — so this settles in one pass rather than looping". That is
// true of the PUBLISH and false of the pair: the cleanup's `[]` is never the
// unchanged list, so it always commits, and the next publish always commits
// back. The guarantee the comment relied on is the very thing the cleanup
// defeats. This is worth stating because the same sentence would read as
// correct in review again.
//
// WHY IT MATTERS MORE HERE THAN IN THE GLASS FRAME. WeekColumns is the frame the
// user's own appearance setting renders, so unlike WeekA this is not
// hypothetical, and unlike WeekA it had no test at all.
//
// ── TWO INSTRUMENT FINDINGS, inherited from tests/weekly-glass-expand.test.ts ──
// Both cost that lane real measurement; do not re-derive them:
//   1. A throw from `<Profiler onRender>` is SWALLOWED in the commit phase. The
//      run hangs anyway with the guard installed.
//   2. A guard that is not a CONTEXT CONSUMER never re-renders. `children`
//      element identity survives a provider's own state change, so React bails
//      out of the sibling and the guard counts to one while the loop runs beside
//      it.
// Hence: a render-phase throw, from a component that subscribes to the
// expansion context.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  subjectById: {} as Record<string, Subject>,
  /** When true the store re-identifies its arrays on every call. */
  churn: false,
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    // `churn` is what an unmemoized provider does. The CONTENTS never move —
    // only the identity — so any loop this produces is the canvas's own doing.
    lessons: store.churn ? [...store.lessons] : store.lessons,
    subjects: store.churn ? [...store.subjects] : store.subjects,
    subjectById: store.churn ? { ...store.subjectById } : store.subjectById,
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
    // A FRESH filters object per call when churning — this is the input that
    // actually re-identifies `byDay` in the shipped component.
    filters: store.churn
      ? { subjects: [], units: [], statuses: [], standards: [] }
      : FILTERS,
    selectedLessonId: null,
    setSelectedLessonId: () => {},
  }),
}));

const FILTERS = { subjects: [], units: [], statuses: [], standards: [] };

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

// The card is not what this asserts, and it reaches for editor context this
// test does not provide. It DOES have to render the title, because the title is
// this suite's positive control.
vi.mock("@/components/weekly/weekly-lesson-card", () => ({
  WeeklyLessonCard: ({ lesson }: { lesson: Lesson }) =>
    createElement("div", null, lesson.title),
  OpenLessonEditorContext: { Provider: () => null },
}));
vi.mock("@/components/lesson-card/archive-toast", () => ({
  ArchiveToast: () => null,
}));

const { WeekColumns } = await import("@/components/weekly/WeekColumns");
const { WeekExpansionProvider, useWeekExpansion } = await import(
  "@/lib/week-expansion"
);

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

// ── The render-loop guard ─────────────────────────────────────────────────
// 300 is far above a normal mount (single digits) and far below "forever".
let renders = 0;
const RENDER_CEILING = 300;

function LoopGuard(): null {
  useWeekExpansion(); // subscribe — see instrument finding (2) in the header
  renders += 1;
  if (renders > RENDER_CEILING) {
    throw new Error(
      `render loop: the paper Week canvas re-rendered ${renders} times for one ` +
        "mount — the visible-id publish is re-running itself (see the header)",
    );
  }
  return null;
}

function Harness(): ReactNode {
  return createElement(
    WeekExpansionProvider,
    null,
    createElement(LoopGuard, {}),
    createElement(WeekColumns, {}),
  );
}

/** Reads what the canvas published, for the second test's assertion. */
let seenCount = -1;
function PublishSpy(): null {
  seenCount = useWeekExpansion().visibleCount;
  return null;
}
function PublishHarness(): ReactNode {
  return createElement(
    WeekExpansionProvider,
    null,
    createElement(PublishSpy, {}),
    createElement(WeekColumns, {}),
  );
}

beforeEach(() => {
  renders = 0;
  seenCount = -1;
  store.lessons = [LESSON];
  store.subjects = [SUBJECT];
  store.subjectById = { math: SUBJECT };
  store.churn = false;
});

describe("WeekColumns — the paper Week frame does not loop on a churning store", () => {
  it("survives a store that re-identifies itself on every render", async () => {
    // THE REGRESSION TEST. With the publish and its clear in one effect this
    // never returns: the loop blocks the event loop, so vitest's own timeout
    // cannot fire and the symptom is a HANG rather than a failure. The
    // <LoopGuard> ceiling is what turns it back into a named assertion.
    //
    // It ends on a POSITIVE CONTROL: a canvas that rendered nothing would also
    // never loop, and would sail through a bare "did not throw".
    store.churn = true;
    const h = await mountReact(Harness);
    try {
      await h.render({});
      expect(h.html()).toContain("Fractions on a number line");
      // …and re-rendering the caller (what a parent's own state change does)
      // must not start it either.
      await h.render({});
      expect(h.html()).toContain("Fractions on a number line");
      expect(renders).toBeLessThan(RENDER_CEILING);
    } finally {
      store.churn = false;
      await h.unmount();
    }
  });

  it("still publishes its visible ids, so Expand all has something to expand", async () => {
    // The fix must not be "stop publishing". This is the behaviour the effect
    // exists for, and it is what a naive de-loop (dropping the publish, or
    // gating it behind a ref) would silently break.
    // `visibleCount` and not `visibleIds`: the ids are the provider's private
    // state and the interface deliberately exposes only the count (the header
    // control needs "is there anything to expand", not the list).
    const h = await mountReact(PublishHarness);
    try {
      await h.render({});
      expect(seenCount).toBe(1);
    } finally {
      await h.unmount();
    }
  });
});
