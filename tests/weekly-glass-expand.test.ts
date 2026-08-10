import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";
import type { Lesson, Subject } from "@/lib/types";

// The GLASS Week canvas (WeekA) is the one a click has to open.
//
// Glass is the DEFAULT frame (CLAUDE.md §1), so WeekA — not WeekColumns, and
// not anything under components/weekly/ — is the canvas the teacher who
// reported this is actually looking at. It had no expansion at all: its click
// handler only wrote `selectedLessonId`, which used to open the right panel.
// With the panel gone, an unfixed WeekA answers a click with nothing visible.
//
// This file mounts the REAL WeekA next to the REAL header control, under one
// <WeekExpansionProvider>, and drives it. That pairing is the point: a live
// probe found the cards expanding but the header control absent, and the only
// way to tell "WeekA never published its ids" from "the dev server served a
// stale chunk" is to run the two components together with nothing else in the
// way.
//
// mountReact, not renderToStaticMarkup: publishing happens in an EFFECT and
// expanding happens on a CLICK, and SSR does neither.
//
// ── WHY THIS FILE WAS SKIPPED, AND WHAT WAS ACTUALLY WRONG ─────────────────
// It hung — eight attempts, no output, past a 400s timeout — and was committed
// as `describe.skip` with a note blaming a leaked timer (`useTodayColumnIndex`'s
// 60s window.setInterval). That diagnosis was wrong. Nothing leaked: WeekA's
// visible-id publish was an INFINITE RENDER LOOP, and the loop blocked the event
// loop, so vitest's own timeout could never fire and a hang is what it looked
// like.
//
// The mechanism, now fixed in WeekA.tsx (and WeekC.tsx, which had it too): one
// effect published the visible ids and its CLEANUP published `[]`. The effect
// re-runs on the IDENTITY of the id array, not its contents — so any render that
// handed the canvas a fresh `filters`/`subjects` array re-ran the pair, each half
// committed state, and the canvas span clear → publish → render → clear forever.
// A test double is exactly such a caller: the real stores memoize their context
// value and a hand-written mock does not, which is why this only ever appeared
// under test.
//
// The <LoopGuard> in <Harness> is the standing consequence: if the effect is
// ever recombined, this file FAILS BY NAME on the 300th commit instead of
// hanging. A hang is worse than a failure — "still running" is indistinguishable
// from "passing", and it stalls every gate that includes it.

// A real mount plus a click sequence runs in ~200ms alone, but vitest's 5s
// default is not safe under the full suite's parallel load — CPU contention has
// turned correct mount tests in this repo red before. `hookTimeout` is a
// separate budget; this file uses no beforeAll, so testTimeout is enough.
vi.setConfig({ testTimeout: 30000 });

const LESSONS: Lesson[] = [
  {
    id: "l-1",
    subject: "math",
    unit: "u-1",
    week: 12,
    day: 0,
    title: "Comparing fractions",
    preview: "Warm-up, then partner work.",
    objective: "Compare fractions with unlike denominators.",
    directions: "",
    notes: "",
    status: "not_done",
    standards: [],
    tasks: [],
    resources: [],
  },
  {
    id: "l-2",
    subject: "math",
    unit: "u-1",
    week: 12,
    day: 1,
    title: "Equivalent fractions",
    preview: "Number-line practice.",
    objective: "",
    directions: "",
    notes: "",
    status: "not_done",
    standards: [],
    tasks: [],
    resources: [],
  },
] as unknown as Lesson[];

const SUBJECT: Subject = {
  id: "math",
  name: "Math",
  cls: "math",
} as unknown as Subject;

// Hoisted and returned BY REFERENCE, like the real store's memoized context
// value. Rebuilding `subjects: [SUBJECT]` per call would hand the canvas a fresh
// array on every render — see the loop note in the header.
const planner = vi.hoisted(() => ({
  lessons: [] as unknown[],
  subjects: [] as unknown[],
  subjectById: {} as Record<string, unknown>,
  addLesson: async () => null,
  /** Opt-in: return a FRESH object with fresh arrays on every call, the way an
   *  unmemoized store would. One test turns it on deliberately — see
   *  "survives a store that re-identifies itself on every render". */
  churn: false,
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () =>
    planner.churn
      ? {
          ...planner,
          lessons: [...planner.lessons],
          subjects: [...planner.subjects],
          subjectById: { ...planner.subjectById },
        }
      : planner,
  scrollPlannerItemIntoView: () => {},
}));

// A LIVE app-state double: `setSelectedLessonId` writes back, so the selection
// rules under test (which read the current selection to decide what a click
// leaves behind) are exercised against a value that actually moves. A stub that
// swallowed the write would make every selection assertion vacuous.
//
// One object, mutated in place — the real provider hands out a memoized value
// and a fresh object per call is not a faithful double (it is also what turned a
// slow test into an infinite loop; see the header).
const appState = vi.hoisted(() => ({
  week: 12,
  currentWeek: 12,
  currentWeekBasis: "date",
  search: "",
  filters: { subjects: [], units: [], statuses: [], standards: [] },
  selectedLessonId: null as string | null,
  setSelectedLessonId: (id: string | null) => {
    appState.selectedLessonId = id;
  },
  viewMode: "grid",
  setViewMode: () => {},
}));

vi.mock("@/lib/app-state", () => ({ useAppState: () => appState }));

vi.mock("@/lib/weekly-schedule-state", () => ({
  useWeeklyScheduleMode: () => ({
    setMode: () => {},
    scheduleMode: false,
    events: "lessons",
    setEvents: () => {},
  }),
}));

// A TWO-day school week — deliberately not five. CLAUDE.md §6 forbids
// hard-coding the weekday set, and a fixture that happened to match a
// hard-coded five would hide exactly that bug.
const WEEKDAYS = vi.hoisted(() => [
  { token: "sun", index: 0, label: "Sun", longLabel: "Sunday" },
  { token: "mon", index: 1, label: "Mon", longLabel: "Monday" },
]);
vi.mock("@/lib/week-order", () => ({ useOrderedWeekdays: () => WEEKDAYS }));

// The ⋮ menu routes with the app router, which has no provider in a bare
// mount. Recorded rather than discarded so a later test can assert the four
// destinations actually navigate.
const PUSHED: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => void PUSHED.push(href),
    replace: () => {},
  }),
}));

// <UnitChip> reaches for the global unit-workspace host, which has no
// provider in a bare mount. Stubbed to nothing: this file is about expansion,
// and the chip's own behaviour is covered elsewhere.
vi.mock("@/components/unit-chip", () => ({ UnitChip: () => null }));

// `useNowMin` runs a live setInterval to keep the "now" marker current. Frozen
// here because the clock is not what is under test and a wall-clock read makes
// the "now" styling depend on when the suite runs. (It is NOT what hung this
// file — see the header; the timer is cleaned up on unmount like any other.)
vi.mock("@/components/planner-v2", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNowMin: () => 0,
}));

const NO_HOLIDAYS = vi.hoisted(() => new Map());
vi.mock("@/lib/use-day-holiday", () => ({ useHolidaysByDay: () => NO_HOLIDAYS }));
vi.mock("@/lib/schedule-data", () => ({
  getDayBlocks: () => [],
  minuteOfDay: () => 0,
}));
vi.mock("@/lib/week-edit-periods", () => ({
  deriveWeekPeriods: () => [],
  assignLessonPeriod: () => "unscheduled",
  UNSCHEDULED: "unscheduled",
}));
vi.mock("@/lib/now-anchor", () => ({
  isTodayEmphasisWeek: () => false,
  todayColumnIndex: () => null,
}));
vi.mock("@/lib/labels", () => ({
  useLabels: () => ({ lesson: "Lesson", week: "Week" }),
}));

// Filled here rather than in the hoisted factory, which runs before the fixtures
// above exist. The arrays are then held BY REFERENCE for the rest of the file.
planner.lessons = LESSONS;
planner.subjects = [SUBJECT];
planner.subjectById = { math: SUBJECT };

const { WeekExpansionProvider, useWeekExpansion } = await import(
  "@/lib/week-expansion"
);
const { WeekA } = await import("@/components/week-v2/WeekA");
const { WeeklyViewControls } = await import(
  "@/components/weekly/WeeklyViewControls"
);

// ── The render-loop guard ─────────────────────────────────────────────────
// Counts renders and THROWS past a ceiling, so the failure this file was skipped
// for cannot come back as a hang.
//
// TWO details are load-bearing, both learned by measuring a guard that did not
// fire while the run hung anyway:
//
//  1. It throws during RENDER, not from a <Profiler onRender>. A commit-phase
//     throw is swallowed and the loop carries on.
//  2. It CONSUMES the expansion context. `children` elements keep their identity
//     across a provider's own state change, so React bails out of re-rendering a
//     plain sibling — only context consumers are forced to re-render, and the
//     loop lives entirely among them. A guard outside the context counts to one
//     and watches the loop from the outside.
//
// 300 is far above anything below (a mount plus a few clicks is single digits)
// and far below "forever". Reset per mount by `mount()`.
let renders = 0;
const RENDER_CEILING = 300;

function LoopGuard(): null {
  useWeekExpansion(); // subscribe — see (2) above
  renders += 1;
  if (renders > RENDER_CEILING) {
    throw new Error(
      `render loop: the Week canvas re-rendered ${renders} times for one mount — ` +
        "the visible-id publish is re-running itself (see the file header)",
    );
  }
  return null;
}

function Harness(): ReactNode {
  return createElement(
    WeekExpansionProvider,
    null,
    createElement(LoopGuard, {}),
    createElement(WeeklyViewControls, {}),
    createElement(WeekA, {}),
  );
}

/** Fresh mount + fresh counters. Every test starts from a known selection. */
async function mount(): Promise<Awaited<ReturnType<typeof mountReact>>> {
  renders = 0;
  PUSHED.length = 0;
  appState.selectedLessonId = null;
  planner.churn = false;
  return mountReact(Harness);
}

const isExpandAll = (el: Element): boolean =>
  (el.textContent ?? "").trim() === "Expand all";

describe("the glass Week canvas expands in place", () => {
  it("renders its lessons AND publishes them to the header control", async () => {
    const h = await mount();
    try {
      await h.render({});
      const html = h.html();

      // POSITIVE CONTROL first. If WeekA rendered no tiles then every
      // statement below about expansion is about an empty canvas, and the
      // header control's absence would be correct rather than a bug.
      expect(html).toContain("Comparing fractions");
      expect(html).toContain("Equivalent fractions");

      // The header control is the evidence that WeekA's publish effect reached
      // the SHARED provider instance — not a private fallback of its own.
      expect(html).toContain("Expand all");
    } finally {
      await h.unmount();
    }
  });

  it("a click on a tile opens that lesson's body in place", async () => {
    const h = await mount();
    try {
      await h.render({});
      // Collapsed: the objective is not on screen anywhere.
      expect(h.html()).not.toContain(
        "Compare fractions with unlike denominators",
      );

      // The accessible click path is the SelectTitle button.
      await h.click((el) => (el.textContent ?? "").includes("Comparing"));

      // Expanded IN PLACE — the body text is now rendered, and it is inside
      // the tile rather than in some panel elsewhere.
      expect(h.html()).toContain("Compare fractions with unlike denominators");
      // The OTHER lesson stayed shut, so this was an expansion and not a
      // whole-canvas mode flip.
      expect(h.html()).not.toContain("Number-line practice");
    } finally {
      await h.unmount();
    }
  });

  it("one click does not open-then-close the tile", async () => {
    // The double-fire hazard this canvas was rewritten around: the tile div's
    // onClick and the nested <SelectTitle> button's onClick both reach
    // handleSelect for a single click on the title, because SelectTitle does
    // not stop propagation. A toggle called twice cancels itself and the tile
    // never opens — a bug that looks exactly like "expansion is not wired".
    // The `fromInteractive` guard on the tile is what prevents it, and this is
    // the test that would catch its removal.
    const h = await mount();
    try {
      await h.render({});
      await h.click((el) => (el.textContent ?? "").includes("Comparing"));
      expect(h.html()).toContain("Compare fractions with unlike denominators");
    } finally {
      await h.unmount();
    }
  });

  it("Expand all opens every lesson on the canvas", async () => {
    const h = await mount();
    try {
      await h.render({});
      await h.click(isExpandAll);

      // l-1 has an objective; l-2 has only a preview. Both must open, and the
      // two different field sets are the point — a tile with no objective must
      // still expand rather than render an empty box.
      expect(h.html()).toContain("Compare fractions with unlike denominators");
      expect(h.html()).toContain("Number-line practice");
      expect(h.html()).toContain("Collapse all");
    } finally {
      await h.unmount();
    }
  });

  it("collapsing the selected tile releases the selection with it", async () => {
    // The rule the canvas states in handleSelect: a shut card must not keep the
    // selected ring, and `selectedLessonId` is what the ring AND WeeklyShell's
    // `?lesson=` URL mirror both read. Selection is asserted through the store,
    // not the markup, because the ring is a hashed CSS-module class — matching on
    // that would pass for any class whose name happened to survive.
    const h = await mount();
    try {
      await h.render({});
      await h.click((el) => (el.textContent ?? "").includes("Comparing"));
      expect(appState.selectedLessonId).toBe("l-1");
      expect(h.html()).toContain("Compare fractions with unlike denominators");

      await h.click((el) => (el.textContent ?? "").includes("Comparing"));
      expect(appState.selectedLessonId).toBeNull();
      expect(h.html()).not.toContain(
        "Compare fractions with unlike denominators",
      );
    } finally {
      await h.unmount();
    }
  });

  it("collapsing a DIFFERENT tile leaves the selection on the one still open", async () => {
    // Codex gate, Medium: "collapsing a card that is no longer the selected
    // lesson leaves selectedLessonId pointing at the other lesson". It does —
    // and that is the correct state, which is why this test exists rather than a
    // fix. The lesson the selection points at is STILL EXPANDED, so the ring and
    // the open body agree; moving or clearing the selection here would take the
    // ring off a card the teacher is reading. Both halves are asserted, so this
    // fails if either drifts.
    const h = await mount();
    try {
      await h.render({});
      await h.click((el) => (el.textContent ?? "").includes("Comparing"));
      await h.click(isExpandAll);
      expect(appState.selectedLessonId).toBe("l-1");

      // Collapse the OTHER lesson.
      await h.click((el) => (el.textContent ?? "").includes("Equivalent"));

      expect(appState.selectedLessonId).toBe("l-1");
      // Selected → still open.
      expect(h.html()).toContain("Compare fractions with unlike denominators");
      // Collapsed → really shut (the positive control for the assertion above:
      // both strings come from the same expanded-body markup, so one being
      // present proves the other's absence is a collapse, not an empty canvas).
      expect(h.html()).not.toContain("Number-line practice");
    } finally {
      await h.unmount();
    }
  });

  it("the menu's fourth row names the place it actually goes", async () => {
    // The handoff carries the lesson into its library overlay; /planner takes no
    // lesson (no route params anywhere in the app), so the row is labelled for
    // the destination instead of implying a lesson-scoped one it cannot deliver
    // (Codex gate, Medium). This pins the label, the honest title, and the route.
    const h = await mount();
    try {
      await h.render({});
      await h.click(
        (el) =>
          (el.getAttribute("aria-label") ?? "").startsWith("Open, teach, or post"),
      );

      // Queried through the DOCUMENT, not the harness container: the menu is a
      // React portal to document.body (it has to be — a tile's hover `transform`
      // was otherwise capturing its position:fixed containing block), so a
      // container-scoped query finds nothing and this test would pass or fail
      // for reasons unrelated to the row it is pinning.
      const doc = (globalThis as unknown as { document: Document }).document;
      const menuRows = Array.from(
        doc.querySelectorAll<HTMLButtonElement>("[role=group] button"),
      );
      const row = menuRows.find(
        (b) => (b.textContent ?? "").trim() === "Planner hub",
      );
      expect(row).toBeTruthy();
      expect(row?.getAttribute("title")).toBe(
        "Open the Planner hub — browse the whole plan. It does not open this lesson.",
      );

      // And the other three still carry the lesson, so the divergence is one row
      // and not a general loss of scope.
      const teach = menuRows.find(
        (b) => (b.textContent ?? "").trim() === "Teach",
      );
      expect(teach).toBeTruthy();
      await h.clickElement(teach!);
      expect(PUSHED).toEqual(["/teach?lesson=l-1"]);
    } finally {
      await h.unmount();
    }
  });

  it("survives a store that re-identifies itself on every render", async () => {
    // THE REGRESSION TEST FOR THE HANG. The canvas must not turn a caller's
    // re-render into an unbounded loop of its own. Here the store hands back a
    // fresh object with fresh arrays every call — what an unmemoized provider
    // does, and what every hand-written double does — so `visibleLessonIds`
    // changes IDENTITY on every render while its contents never move.
    //
    // With the publish and its clear in one effect, that re-ran `[] → ids` per
    // render, each half committed state, and the canvas span forever: the loop
    // blocked the event loop, so vitest could not even time it out. The <LoopGuard>
    // ceiling in <Harness> is what turns that back into a named failure.
    //
    // It ends on a positive control: a canvas that rendered nothing would also
    // never loop, and would pass a bare "did not throw".
    const h = await mount();
    planner.churn = true;
    try {
      await h.render({});
      expect(h.html()).toContain("Comparing fractions");
      await h.click((el) => (el.textContent ?? "").includes("Comparing"));
      expect(h.html()).toContain("Compare fractions with unlike denominators");
    } finally {
      planner.churn = false;
      await h.unmount();
    }
  });

  it("every tile carries the handoff's four-destination menu trigger", async () => {
    // V2 Framework.md:416-417 gives the Week cell a Plan/Teach menu. The user
    // moved it onto a ⋮ so the body click could expand instead; this pins that
    // it exists on EVERY tile, not just the first.
    const h = await mount();
    try {
      await h.render({});
      const triggers = (
        h.html().match(/aria-label="Open, teach, or post/g) ?? []
      ).length;
      expect(triggers).toBe(2);
    } finally {
      await h.unmount();
    }
  });
});
