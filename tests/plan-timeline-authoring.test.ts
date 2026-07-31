// plan-timeline-authoring.test.ts — the Plan timeline's band-authoring gate,
// pinned against the component's real output.
//
// WHY THIS FILE EXISTS. Dragging a unit band writes a TEAM-WIDE schedule: there
// is one shared `units` row and no personal fork, so the store refuses the
// write outright unless the teacher is in Team Curriculum mode
// (planner-store.tsx:3752). If the surface offered the gesture anyway, a
// teacher in Personal mode would drag a bar, watch it snap back, and be told
// nothing. The gate has to be visible in the MARKUP, not merely in the store.
//
// WHY IT CANNOT BE A BROWSER CHECK. Localhost runs the MOCK planner path, and
// the Personal/Team distinction that gates this is store-level — a live probe
// would be measuring one branch and inferring the other. And an
// absence-assertion ("the grip is not there") FAILS OPEN against a surface that
// has not finished hydrating, which is precisely the trap
// tests/plan-timeline-empty.test.ts documents. A deterministic render can
// assert both branches, in the same run, with no hydration to wait for.
//
// WHY react-dom/server. vitest runs `environment: "node"`; react-dom/server
// renders to a STRING there with no jsdom and no new dependency — the technique
// tests/plan-timeline-empty.test.ts:26-28 already uses.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Lesson, Subject, Unit } from "@/lib/types";

const store = vi.hoisted(() => ({
  editMode: "personal" as "personal" | "master",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  units: [] as Unit[],
  patches: [] as { unitId: string; patch: Record<string, unknown> }[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: Object.fromEntries(store.subjects.map((s) => [s.id, s])),
    units: store.units,
    getSections: () => [],
    editUnitFields: (unitId: string, patch: Record<string, unknown>) => {
      store.patches.push({ unitId, patch });
    },
  }),
  usePlannerDataState: () => "settled",
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({
    week: 3,
    currentWeek: 3,
    currentWeekBasis: "in-range",
    editMode: store.editMode,
  }),
}));

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

const LESSON = {
  id: "l1",
  subject: "math",
  unit: "u1",
  title: "Rounding",
  week: 1,
  day: 0,
  status: "not_done",
  objective: "I can round",
  resources: [{ id: "r" }],
  standards: ["S1"],
  archived: false,
  modified: false,
  moved: null,
} as unknown as Lesson;

/** The band's drag opt-in. Absent when authoring is off. */
const DRAGGABLE = "data-draggable";
/** The resize grip's accessible name — rendered only when authoring is on. */
const GRIP = "Change how many weeks";
/** Named in the band's tooltip when authoring is off, so the ABSENCE of the
 *  gesture is explained where the gesture would have been. */
const BLOCKED = "needs the Team Curriculum mode";

// Imported ONCE, at module scope, rather than inside render().
//
// It was a dynamic import per call, which meant the FIRST test in this file
// paid the cold transform cost of PlanTimeline's whole dependency graph while
// the other seven reused the cache. Alone that is ~1.7s and invisible; under a
// full parallel `vitest run` it crossed the 5s default and failed — the file
// passed in isolation and failed in the suite, which reads exactly like a hang
// in the Personal-mode path and is not one.
//
// Hoisting removes the cost from any single test's measured time. Deliberately
// NOT fixed by raising the timeout: that would have left a real hang, if one
// ever appeared here, indistinguishable from this.
const { PlanTimeline } = await import(
  "@/components/hub-v2/timeline/PlanTimeline"
);

// Stays `async` so the eight existing `await render()` call sites are untouched
// by this fix — the point is to move the import cost, not to churn the tests.
async function render(): Promise<string> {
  return renderToStaticMarkup(
    createElement(PlanTimeline, { query: "", onOpenDoc: () => {} }),
  );
}

beforeEach(() => {
  store.subjects = [MATH];
  store.units = [UNIT];
  store.lessons = [LESSON];
  store.patches = [];
});

describe("Plan timeline — band authoring is gated on Team Curriculum mode", () => {
  it("offers NO drag affordance in Personal mode, and says why", async () => {
    store.editMode = "personal";
    const html = await render();
    // The lane rendered — otherwise this whole assertion is vacuous, which is
    // exactly how an absence-check fails open.
    expect(html).toContain("data-lane-subject");
    expect(html).not.toContain(DRAGGABLE);
    expect(html).not.toContain(GRIP);
    expect(html).toContain(BLOCKED);
  });

  it("offers the drag AND the resize grip in Team Curriculum mode", async () => {
    store.editMode = "master";
    const html = await render();
    expect(html).toContain("data-lane-subject");
    expect(html).toContain(DRAGGABLE);
    expect(html).toContain(GRIP);
    expect(html).not.toContain(BLOCKED);
  });

  it("names the keyboard equivalent, not only the pointer gesture", async () => {
    // CLAUDE.md §4 requires full keyboard navigation, and the handoff's
    // authoring is pointer-only throughout (audit B6). A gesture whose keyboard
    // path exists but is undiscoverable is not much better than none.
    store.editMode = "master";
    const html = await render();
    expect(html).toContain("Shift+");
    expect(html).toContain("Alt+Shift+");
  });
});

describe("Plan timeline — the band states its real week range", () => {
  it("shows the DECLARED weeks, not the drawn ones", async () => {
    store.editMode = "master";
    const html = await render();
    expect(html).toContain("Planned for Wk 1–2");
  });

  it("says a lesson-placed band has no week range rather than implying one", async () => {
    // A unit with no declared weeks is placed from its lessons' dates. Calling
    // that "Planned for Wk 1" would report a schedule nobody set.
    store.editMode = "master";
    store.units = [
      { ...UNIT, weeks: "", startWeek: undefined, endWeek: undefined } as Unit,
    ];
    const html = await render();
    expect(html).toContain("it has no week range set");
    expect(html).not.toContain("Planned for Wk");
  });

  it("flags lessons dated outside the unit's own weeks", async () => {
    // The divergence a week-granularity drag can CREATE: the bar moves, the
    // lessons do not. Silent, it reads as a rendering bug.
    store.editMode = "master";
    store.lessons = [LESSON, { ...LESSON, id: "l2", week: 30 } as Lesson];
    const html = await render();
    expect(html).toContain("1 out");
    expect(html).toContain("dated outside those weeks");
  });
});

describe("Plan timeline — the library drawer", () => {
  it("publishes a needs-attention count on the collapsed bar", async () => {
    store.editMode = "personal";
    store.lessons = [
      { ...LESSON, id: "thin", objective: "", resources: [] } as Lesson,
    ];
    const html = await render();
    expect(html).toContain("1 needs attention");
  });

  it("publishes NO count when the plan is healthy", async () => {
    // A permanent "0 need attention" trains the eye to stop reading it.
    store.editMode = "personal";
    const html = await render();
    expect(html).toContain("data-lane-subject"); // not a vacuous pass
    expect(html).not.toContain("need attention");
  });
});
