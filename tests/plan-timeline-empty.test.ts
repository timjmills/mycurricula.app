import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson, Subject, Unit } from "@/lib/types";

// The Plan timeline's honesty contract, pinned against the component's real
// output.
//
// WHY THIS FILE EXISTS. The 7.21 handoff's Timeline derives its lanes from
// `[...new Set(state.units.map(u => u.sid))]` (`ph-units.jsx:323`) over a
// SYNCHRONOUS `PW.build()`, and carries no loading and no error branch
// anywhere. Ported faithfully, three completely different situations —
// an unplanned year, a store still hydrating (11–16s over Supabase), and a
// hydrate that FAILED — all render the same empty grid, and a teacher whose
// backend is down is told they have planned nothing. That is the defect class
// this session removed from six other surfaces (tests/hub-browse-empty.test.ts,
// tests/day-empty-kind.test.ts).
//
// WHY IT MOCKS THE STORE. The pending state is unreachable both in a test and
// on a local dev server: the planner falls back to lib/mock unless
// NEXT_PUBLIC_PLANNER_USE_SUPABASE=1, and `effectiveHydration` then pins
// hydration to "ready" forever. So a browser on localhost can never observe the
// bug, and only a deterministic render can prove it is gone.
//
// WHY react-dom/server. vitest runs `environment: "node"`, but react-dom/server
// renders to a STRING in node with no jsdom and no new dependency — the same
// technique tests/hub-browse-empty.test.ts:23-27 documents.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  units: [] as Unit[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: Object.fromEntries(store.subjects.map((s) => [s.id, s])),
    units: store.units,
    getSections: () => [],
  }),
  usePlannerDataState: () => store.state,
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({ week: 3, currentWeek: 3, currentWeekBasis: "in-range" }),
}));

/** What <Skeleton> paints while pending. Also the marker that the fix has not
 *  overshot into stranding a settled surface on a permanent skeleton. */
const LOADING = 'role="status" aria-busy="true"';
const ERROR_COPY = "Couldn’t load your plan";
const VACANT = "Nothing on the timeline yet";
/** The canvas itself — present only when real lanes rendered. */
const LANE = "data-lane-subject";

const MATH = {
  id: "math",
  name: "Math",
  cls: "math",
  icon: "M",
} as unknown as Subject;

const UNIT = {
  id: "u1",
  subject: "math",
  name: "Unit 1 · Place Value",
  weeks: "Wk 1–2",
  startWeek: 1,
  endWeek: 2,
  shade: 2,
} as unknown as Unit;

function lessonFixture(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    subject: "math",
    unit: "u1",
    title: "Fractions on a number line",
    week: 1,
    day: 0,
    status: "not_done",
    archived: false,
    modified: false,
    moved: null,
    objective: "I can place a fraction",
    resources: [{ id: "r" }],
    standards: ["5.NF.1"],
    ...over,
  } as unknown as Lesson;
}

/**
 * Just the scrolling canvas — the legend deliberately renders REAL marks
 * (a `data-state` per key, and a `data-fork="modified"` sample) so its shape
 * channels are discoverable, which means a whole-document `not.toContain` on
 * either attribute can never fail. Assertions about what a LESSON dot carries
 * have to look past it.
 */
function canvas(html: string): string {
  const i = html.indexOf("_scroller");
  return i === -1 ? "" : html.slice(i);
}

async function render(query = ""): Promise<string> {
  const { PlanTimeline } = await import(
    "@/components/hub-v2/timeline/PlanTimeline"
  );
  return renderToStaticMarkup(
    createElement(PlanTimeline, { query, onOpenDoc: () => {} }),
  );
}

// Pay PlanTimeline's cold transform ONCE, outside any test's measured window.
// See the same note in tests/archive-school-years.test.ts: the first dynamic
// import of this component graph costs more than the default 5000ms testTimeout,
// so without this the first three tests time out on a warm-up cost that has
// nothing to do with what they assert. The per-test budget stays at the default
// so it still guards the render itself.
beforeAll(async () => {
  await import("@/components/hub-v2/timeline/PlanTimeline");
}, 120_000);

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.subjects = [];
  store.units = [];
});

describe("the timeline never paints an empty year it cannot vouch for", () => {
  it("shows a loading affordance while the hydrate is in flight", async () => {
    store.state = "pending";
    const html = await render();
    expect(html).not.toContain(VACANT);
    expect(html).not.toContain(LANE);
    expect(html).toContain(LOADING);
    // Without the label a screen-reader user hears silence where the lie was.
    expect(html).toContain("Loading your plan");
  });

  it("reports a FAILED hydrate rather than an unplanned year", async () => {
    store.state = "error";
    const html = await render();
    expect(html).not.toContain(VACANT);
    expect(html).not.toContain(LANE);
    expect(html).toContain(ERROR_COPY);
  });

  it("states the year is genuinely empty once the store has settled", async () => {
    store.state = "settled";
    const html = await render();
    expect(html).toContain(VACANT);
    expect(html).not.toContain(LOADING);
  });

  it("keeps its page head in every state, so the surface never looks broken", async () => {
    for (const state of ["pending", "error", "settled"] as const) {
      store.state = state;
      expect(await render()).toContain("Planner");
    }
  });
});

describe("the guard does not hide the real timeline", () => {
  // The failure mode opposite the one being fixed, and the likelier mistake: a
  // permanent skeleton passes every "the lie is gone" test while never showing
  // a teacher their plan.
  beforeEach(() => {
    store.state = "settled";
    store.subjects = [MATH];
    store.units = [UNIT];
    store.lessons = [lessonFixture()];
  });

  it("renders the lane, the unit band and the lesson dot", async () => {
    const html = await render();
    expect(html).toContain(LANE);
    expect(html).toContain("Place Value");
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(LOADING);
    expect(html).not.toContain(VACANT);
  });

  it("names every lesson dot, at every zoom", async () => {
    // The handoff's dot renders its title only at colw>=80 (`ph-units.jsx:616`)
    // and carries no aria-label and no title, so at the DEFAULT column width of
    // 34 (`:304`) every lesson on the year is an unnamed button (audit B7).
    const html = await render();
    expect(html).toContain(
      'aria-label="Fractions on a number line. Planned."',
    );
  });

  it("states the dot's state in words, not colour alone", async () => {
    store.lessons = [lessonFixture({ status: "done" })];
    expect(await render()).toContain("Taught");
  });

  it("marks a personally modified lesson on the timeline", async () => {
    // CLAUDE.md §2 makes three-tier fork differentiation a contract that holds
    // everywhere; the handoff's dot class list carries none of it
    // (`ph-units.jsx:609-611`). On the one surface showing a teacher their whole
    // year, they must be able to tell which lessons are their own forks.
    store.lessons = [lessonFixture({ modified: true })];
    const html = await render();
    expect(html).toContain('data-fork="modified"');
    expect(html).toContain("Modified");
  });

  it("marks a personally moved lesson, and one that is both", async () => {
    store.lessons = [
      lessonFixture({ id: "a", moved: "same-week" }),
      lessonFixture({ id: "b", day: 1, modified: true, moved: "across-weeks" }),
    ];
    const html = await render();
    expect(html).toContain('data-fork="moved"');
    expect(html).toContain('data-fork="both"');
  });

  it("leaves an unedited lesson unmarked", async () => {
    expect(canvas(await render())).not.toContain("data-fork");
  });

  it("dims a non-matching mark rather than deleting it", async () => {
    // A year with non-matches removed loses the shape that makes it a year
    // (`ph-units.jsx:594,607`).
    const html = await render("nothing-matches-this");
    expect(html).toContain("Fractions on a number line");
    expect(html).toContain("data-dim");
  });

  it("draws no today line on the server, where 'today' is the SERVER's", async () => {
    // `new Date()` during render would make the server's today and the
    // browser's today two answers to one question, and the SSR HTML would
    // disagree with the first client paint. The line arrives in a mount effect.
    const html = await render();
    expect(html).not.toContain("todayLine");
    expect(html).not.toContain('data-today="true"');
  });

  it("accuses no lesson of being missed before today has a position", async () => {
    // A thin, long-past lesson. On the server nothing is known to be past, so
    // it must read as "needs work", never "missed" — under-claiming is the safe
    // direction (lib/plan-timeline/dots.ts:NowRef).
    store.lessons = [
      lessonFixture({ objective: "", resources: [], standards: [] }),
    ];
    const html = canvas(await render());
    expect(html).toContain('data-state="needs_work"');
    expect(html).not.toContain('data-state="missed"');
  });
});

describe("an unconfigurable axis is named, not left blank", () => {
  it("points at Settings when the school week is empty", async () => {
    vi.resetModules();
    vi.doMock("@/lib/use-school-week", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/use-school-week")>()),
      useSchoolWeek: () => ({ days: [], setDays: () => {}, saveState: { status: "idle" } }),
    }));
    store.state = "settled";
    store.subjects = [MATH];
    store.units = [UNIT];
    store.lessons = [lessonFixture()];
    const html = await render();
    expect(html).toContain("No school days configured");
    expect(html).not.toContain(LANE);
    vi.doUnmock("@/lib/use-school-week");
    vi.resetModules();
  });
});
