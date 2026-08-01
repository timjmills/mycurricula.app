import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mountReact } from "./mount-react";
import type { Lesson, Subject } from "@/lib/types";

// 30s, matching the other mount-based suites: the first `mountReact` in a file
// pays a one-off cold import of linkedom + react-dom/client (measured ~6s), which
// breaches vitest's 5s default and reports as a bare timeout with no assertion
// text. Not a hang mask — every test here fails on an ASSERTION when the switch
// is mutated out.
vi.setConfig({ testTimeout: 30000 });

// /daily renders ONE Day view — DayFocus — for every appearance frame and every
// theme. DayA / DayB / DayC are retained but unreachable without an explicit
// `?dayview=`; see components/day-v2/DayViewV2.tsx for why they are still here.
//
// ── WHAT WOULD GO WRONG WITHOUT THIS FILE ──────────────────────────────────
// The consolidation's whole point is that the appearance axes stop moving the
// Day's layout. The regression that undoes it is silent: DayViewV2 re-grows a
// `useTheme()` read, and /daily quietly serves a different information
// architecture to teachers on the paper or colour frame while every OTHER test
// in the repo — all of which render DayFocus directly, or render DayViewV2 in
// one appearance — stays green.
//
// So the assertions here are about the SEAM, not the component: what does
// DayViewV2 mount, and what does it take to make it mount something else.
//
// ── THE ESCAPE HATCH IS TESTED IN BOTH DIRECTIONS ──────────────────────────
// "No param → DayFocus" is an absence claim about the legacy frames, and an
// absence FAILS OPEN: it passes just as happily against a `LEGACY` map that is
// empty, a dynamic import that silently rejects, or a marker string that could
// never match anything. Every such case is therefore paired IN THE SAME RUN
// with a positive control that must actually mount a legacy frame — so the
// default is a fact about the switch and not about this test.

const store = vi.hoisted(() => ({
  subjectById: {} as Record<string, Subject>,
  units: [] as unknown[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    subjectById: store.subjectById,
    units: store.units,
    setLessonStatus: () => {},
    lessons: [],
  }),
  // Settled, so the view renders lessons rather than a hydrate skeleton.
  usePlannerDataState: () => "settled",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

// The unit pop-in reaches for the workspace host context, which no test
// provides — it is not what these assert.
vi.mock("@/components/unit-chip", () => ({
  UnitChip: () => null,
}));

const { DayViewV2, readDayViewParam } = await import(
  "@/components/day-v2/DayViewV2"
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
  objective: "I can place a fraction on a number line.",
  preview: "",
  directions: "",
  week: 12,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [],
  standards: ["5.NF.B.3"],
} as unknown as Lesson;

const BASE_PROPS = {
  dayLessons: [LESSON],
  week: 12,
  day: 0,
  dayLabel: "Sunday",
  dateLabel: "Jun 14 · 2026",
  isToday: true,
  selectedId: "m-12-0",
  onSelect: () => {},
  onShiftDay: () => {},
  onPlan: () => {},
  onQuickAdd: () => {},
  quickAdding: false,
  quickAddError: null,
};

// Markers unique to DayFocus. Deliberately NOT ">Open in Teach</button>" —
// the legacy frames carry that pill too, so an assertion on it would have
// reported the paper frame as the focus view. (It did, on the first run of this
// file; the marker was changed, not the expectation.) Two of them, so a single
// renamed label cannot make the default look absent.
/** The focus card's learning-target box. No legacy frame has one. */
const FOCUS_TARGET = "Learning target";
/** The first of the focus card's numbered flow chips. */
const FOCUS_FLOW = "Warm-up";

beforeEach(() => {
  store.subjectById = { math: SUBJECT };
  store.units = [];
});

// ── The parse — this one function IS the switch ─────────────────────────────
//
// Exported from the component and imported here rather than re-implemented: a
// test that re-derived the parse would keep passing while the shipped one
// regressed, which is the failure mode this whole file exists to catch.

describe("readDayViewParam — only a|b|c reach a legacy frame", () => {
  const CASES: [label: string, search: string, expected: string | null][] = [
    ["no query at all", "", null],
    ["an unrelated param", "?lesson=m-12-0", null],
    ["the key with no value", "?dayview=", null],
    ["the default named explicitly", "?dayview=focus", null],
    ["an unknown frame", "?dayview=d", null],
    ["the wrong case", "?dayview=A", null],
    ["a path-ish value", "?dayview=../DayA", null],
    // POSITIVE CONTROLS — without these every row above passes against a
    // function that returns null unconditionally.
    ["the glass frame", "?dayview=a", "a"],
    ["the paper frame", "?dayview=b", "b"],
    ["the colour frame", "?dayview=c", "c"],
    ["a legacy key after another param", "?lesson=m-12-0&dayview=b", "b"],
  ];

  for (const [label, search, expected] of CASES) {
    it(`${label} → ${expected === null ? "the default view" : expected}`, () => {
      expect(readDayViewParam(search)).toBe(expected);
    });
  }
});

// ── What DayViewV2 actually mounts ──────────────────────────────────────────

describe("DayViewV2 renders the focus + rail Day view", () => {
  it("server-renders DayFocus, before any client state exists", () => {
    // The server has no `window`, so the switch cannot have read a param. This
    // pins that the DEFAULT branch — not the effect — is what paints first: a
    // switch that started on a legacy frame and corrected itself after hydration
    // would flash the wrong layout on every load.
    const html = renderToStaticMarkup(
      createElement(DayViewV2 as never, BASE_PROPS as never),
    );
    expect(html).toContain(FOCUS_TARGET);
    expect(html).toContain(FOCUS_FLOW);
  });

  it("still renders DayFocus after hydration when no ?dayview= is present", async () => {
    const h = await mountReact(DayViewV2 as never);
    try {
      await h.render(BASE_PROPS as never);
      expect(h.html()).toContain(FOCUS_TARGET);
      expect(h.html()).toContain(FOCUS_FLOW);
    } finally {
      await h.unmount();
    }
  });

  it("swaps to the legacy paper frame for ?dayview=b, and back for a bad value", async () => {
    // THE POSITIVE CONTROL for the two tests above. Both of those would pass
    // against a switch whose legacy branch was dead code — an empty LEGACY map,
    // a rejected dynamic import, a `legacy` state that never leaves null. This
    // one fails unless a legacy frame really does mount.
    //
    // `location.search` is mutated on the harness's own window between mount and
    // render, so the effect reads it exactly as it would in a browser. The
    // harness ships `location` without a `search` key (tests/mount-react.ts:103),
    // which is itself the "no param" case.
    const h = await mountReact(DayViewV2 as never);
    const loc = (globalThis as unknown as { window: { location: { search?: string } } })
      .window.location;
    try {
      loc.search = "?dayview=b";
      await h.render(BASE_PROPS as never);
      // The effect runs during the mount above and the frames are statically
      // imported, so there is nothing to wait for. (This is why they are not
      // `next/dynamic` — see the note in DayViewV2.)

      // DayB is a different layout, so the focus card's own furniture is gone…
      expect(h.html()).not.toContain(FOCUS_TARGET);
      expect(h.html()).not.toContain(FOCUS_FLOW);
      // …and something did render in its place — the lesson title. Without this
      // the absence above would pass against a blank screen, which is precisely
      // what a broken legacy branch looks like.
      expect(h.html()).toContain("Fractions on a number line");

      // BACK BUTTON. The component stays mounted across a history move, so a
      // param read that only ran on mount would strand the teacher on the
      // legacy frame while the URL said /daily. This is the case Codex's §4a
      // review raised; the popstate listener is the answer to it.
      loc.search = "";
      const w = (globalThis as unknown as { window: Window }).window;
      w.dispatchEvent(new (w as unknown as { Event: typeof Event }).Event("popstate"));
      await h.render(BASE_PROPS as never);
      expect(h.html()).toContain(FOCUS_TARGET);
      expect(h.html()).toContain(FOCUS_FLOW);
    } finally {
      loc.search = "";
      await h.unmount();
    }
  });
});
