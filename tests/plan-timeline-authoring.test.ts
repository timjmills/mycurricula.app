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

import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Lesson, Subject, Unit } from "@/lib/types";

const store = vi.hoisted(() => ({
  editMode: "personal" as "personal" | "master",
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
    // A DELIBERATE NO-OP, not a capture. This file renders statically, so no
    // event can ever reach a write from here and a capture array would sit
    // permanently empty while making the file look like it covered the write
    // path — which is exactly what it used to do. What a unit drag actually
    // writes, including the same-slug refusal, is asserted through a real mount
    // in tests/plan-timeline-reschedule.test.ts.
    editUnitFields: () => {},
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

// ── WHY EVERY FIXTURE IS RENDERED ONCE, IN ONE HOOK ──────────────────────
//
// This file used to render inside each `it`, and under a full parallel
// `vitest run` its FIRST test intermittently failed with "Test timed out in
// 5000ms" while the other seven passed. That reads exactly like a hang on the
// Personal-mode path — the mode that first test happens to use, and the app's
// DEFAULT mode — so it was worth settling rather than assuming. It was
// MEASURED, not reasoned about:
//
//   40 alternating renders, same fixtures, same process:
//     personal   avg 258.8ms   max 758ms   (cold 494ms)
//     master     avg 261.95ms  max 641ms   (cold 116ms)
//
// The two paths cost the SAME, and master is fractionally dearer — so there is
// no Personal-specific loop and no unresolved promise. Two independent facts
// agree. On the very run that produced those timings, three OTHER lanes'
// repo-scanning tests timed out at exactly 5000ms in the same suite, none of
// them touching this code. And the live probe
// (scripts/probe-plan-timeline-w2.mjs) renders /planner in Personal mode at
// three viewports and reports `personal:0` draggable bands — which it could not
// do if the component hung there.
//
// The mechanism is mundane: each `it` did ~260ms of genuine React SSR, and a
// full run burns ~470s of transform CPU inside ~70s of wall clock, so a single
// render inflates past 5s whenever this file lands in a saturated window. The
// first test is simply the most exposed — it also pays the cold render.
//
// The fix is to stop paying that cost eight times, NOT to raise the per-test
// timeout. Each distinct fixture is rendered once below and every `it` becomes
// a string comparison costing microseconds. `beforeAll` carries an explicit
// budget, and that is a different thing from a masked hang: the work is
// measured and bounded (~6.6s cold import plus five ~260ms renders), it is paid
// once, and RENDER_BUDGET_MS still fails LOUDLY and BY NAME on a render that
// genuinely never returns.

const { PlanTimeline } = await import(
  "@/components/hub-v2/timeline/PlanTimeline"
);

/** A single render exceeding this is a hang, not contention — the measured
 *  worst case is 758ms, so this is ~20x headroom and still finite. */
const RENDER_BUDGET_MS = 15_000;

function renderNow(): string {
  const t0 = Date.now();
  const out = renderToStaticMarkup(
    createElement(PlanTimeline, { query: "", onOpenDoc: () => {} }),
  );
  const ms = Date.now() - t0;
  if (ms > RENDER_BUDGET_MS) {
    // Named, so a real regression can never arrive disguised as a flaky timeout.
    throw new Error(
      `PlanTimeline render took ${ms}ms (budget ${RENDER_BUDGET_MS}ms) at editMode=${store.editMode} — that is a hang, not load`,
    );
  }
  return out;
}

/** Every fixture this file asserts against, rendered exactly once. */
const html: Record<string, string> = {};

beforeAll(() => {
  const base = (): void => {
    store.subjects = [MATH];
    store.units = [UNIT];
    store.lessons = [LESSON];
  };

  base();
  store.editMode = "personal";
  html.personal = renderNow();

  base();
  store.editMode = "master";
  html.master = renderNow();

  base();
  store.editMode = "master";
  store.units = [
    { ...UNIT, weeks: "", startWeek: undefined, endWeek: undefined } as Unit,
  ];
  html.masterNoWeeks = renderNow();

  base();
  store.editMode = "master";
  store.lessons = [LESSON, { ...LESSON, id: "l2", week: 30 } as Lesson];
  html.masterOutside = renderNow();

  // ELEVEN outside, for the substring trap below: `toContain("1 out")` is
  // satisfied by "11 out", so the one-lesson assertion could not tell the
  // right number from a wrong one until there was a fixture that produced a
  // wrong one.
  base();
  store.editMode = "master";
  store.lessons = [
    LESSON,
    ...Array.from(
      { length: 11 },
      (_, i) => ({ ...LESSON, id: `far-${i}`, week: 30 + i }) as Lesson,
    ),
  ];
  html.masterOutsideEleven = renderNow();

  base();
  store.editMode = "personal";
  store.lessons = [
    { ...LESSON, id: "thin", objective: "", resources: [] } as Lesson,
  ];
  html.personalThin = renderNow();
  // A generous but FINITE budget for the batch. The cold import alone measures
  // ~6.6s and the five renders ~1.3s, so ~8s is expected and the rest is
  // contention headroom. An infinite loop still fails here.
}, 60_000);

describe("Plan timeline — band authoring is gated on Team Curriculum mode", () => {
  it("offers NO drag affordance in Personal mode, and says why", () => {
    // The lane rendered — otherwise this whole assertion is vacuous, which is
    // exactly how an absence-check fails open.
    expect(html.personal).toContain("data-lane-subject");
    expect(html.personal).not.toContain(DRAGGABLE);
    expect(html.personal).not.toContain(GRIP);
    expect(html.personal).toContain(BLOCKED);
  });

  it("offers the drag AND the resize grip in Team Curriculum mode", () => {
    expect(html.master).toContain("data-lane-subject");
    expect(html.master).toContain(DRAGGABLE);
    expect(html.master).toContain(GRIP);
    expect(html.master).not.toContain(BLOCKED);
  });

  it("names the keyboard equivalent, not only the pointer gesture", () => {
    // CLAUDE.md §4 requires full keyboard navigation, and the handoff's
    // authoring is pointer-only throughout (audit B6). A gesture whose keyboard
    // path exists but is undiscoverable is not much better than none.
    expect(html.master).toContain("Shift+");
    expect(html.master).toContain("Alt+Shift+");
  });
});

describe("Plan timeline — the band states its real week range", () => {
  it("shows the DECLARED weeks, not the drawn ones", () => {
    expect(html.master).toContain("Planned for Wk 1–2");
  });

  it("says a lesson-placed band has no week range rather than implying one", () => {
    // A unit with no declared weeks is placed from its lessons' dates. Calling
    // that "Planned for Wk 1" would report a schedule nobody set.
    expect(html.masterNoWeeks).toContain("it has no week range set");
    expect(html.masterNoWeeks).not.toContain("Planned for Wk");
  });

  it("flags lessons dated outside the unit's own weeks", () => {
    // The divergence a week-granularity drag can CREATE: the bar moves, the
    // lessons do not. Silent, it reads as a rendering bug.
    //
    // ANCHORED ON THE `>`. The badge renders `{n} out` as the element's first
    // child, so ">1 out" can only be a badge whose number is exactly 1 —
    // whereas the bare `toContain("1 out")` this used to be is a substring of
    // "11 out", "21 out", "101 out" and every other count ending in 1. A
    // counter that reported the wrong number would have passed unchanged, and
    // an off-by-N count is the likeliest way this goes wrong.
    expect(html.masterOutside).toContain(">1 out");
    expect(html.masterOutside).toContain("dated outside those weeks");
  });

  it("reports the real count, not a number that merely ends in one", () => {
    // The pair that gives the assertion above its teeth: the same markup with
    // ELEVEN outside lessons must read "11 out" and must NOT satisfy the
    // one-lesson matcher.
    expect(html.masterOutsideEleven).toContain(">11 out");
    expect(html.masterOutsideEleven).not.toContain(">1 out");
    // The sentence agrees with the badge, and pluralises.
    expect(html.masterOutsideEleven).toContain(
      "11 of its lessons are dated outside those weeks",
    );
    expect(html.masterOutside).toContain(
      "1 of its lessons is dated outside those weeks",
    );
  });
});

describe("Plan timeline — the library drawer", () => {
  /** The drawer's own always-present marker — the collapsed toggle's CSS-module
   *  class, which the transform emits as `_drawerToggle_<hash>`.
   *
   *  It is the positive control for every absence assertion below, because
   *  those assertions are about the DRAWER and `data-lane-subject` is not: that
   *  attribute belongs to TimelineLaneRow, a SIBLING subtree. A drawer that
   *  failed to render at all — or that PlanTimeline stopped mounting — left the
   *  lane rows untouched, so the old control passed while the thing under test
   *  was simply absent. A control has to live in the same subtree as the thing
   *  whose absence it licenses.
   *
   *  Structural rather than a copy string on purpose: the toggle's tooltip
   *  wording is live product copy and has already been reworded once, and a
   *  control that breaks on a copy edit trains people to weaken controls. */
  const DRAWER = "drawerToggle";

  it("publishes a needs-attention count on the collapsed bar", () => {
    expect(html.personalThin).toContain(DRAWER);
    expect(html.personalThin).toContain("1 needs attention");
  });

  it("publishes NO count when the plan is healthy", () => {
    // A permanent "0 need attention" trains the eye to stop reading it.
    expect(html.personal, "control: the drawer rendered").toContain(DRAWER);
    expect(html.personal).not.toContain("need attention");
    // The badge is a BUTTON with its own tooltip ("N thing(s) in your plan
    // need(s) a second look"), so assert on that too: a count rendered without
    // its label — or a label rendered without its count — still fails.
    // Matched on "in your plan need" rather than "needs a second look",
    // because the DRAWER ROOT's own title carries that phrase unconditionally
    // (TimelineDrawer.tsx:177) and would make this assertion fail for a reason
    // that has nothing to do with the badge.
    expect(html.personal).not.toContain("in your plan need");
  });
});
