import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mountReact } from "./mount-react";
import type { Lesson, Subject } from "@/lib/types";

// The Day canvas's action cluster must reach ALL THREE destinations the v2
// handoff specifies: Plan, Post, Teach.
//
// Post was the one that never landed. Every Day frame carried the same
// placeholder comment — "Wave 9: a 'Post' (resource wall) button lands here
// once the /post route ships" — and /post shipped without anyone deleting the
// comment. So a teacher looking at the lesson they are about to teach had no
// path from it to that lesson's resource wall; the only way in was to know the
// /post URL.
//
// ── SCOPE CHANGE, 2026-08-01 ────────────────────────────────────────────────
// This file used to run every assertion three times, once per Day FRAME (DayA
// glass / DayB paper / DayC colour). /daily no longer branches its LAYOUT on
// the appearance frame — there is ONE Day view, components/day-v2/DayFocus (the
// former DayC), for every frame and every theme — so the per-frame cases are
// gone with the branch.
//
// The three frames themselves are still in the folder, at the user's request,
// until they decide what to merge or delete; they render only for an explicit
// `?dayview=a|b|c` (see DayViewV2). They are deliberately NOT re-added to the
// loop below: this file asserts what /daily gives a TEACHER, and a URL nobody
// is linked to is not that. `tests/day-view-default.test.ts` covers the switch.
//
// The remaining coverage is not thinner. The retired frames render on no
// surface a teacher can reach without typing a query string, and the surviving
// one is now the ONLY place Plan / Post / Open in Teach exist on /daily, which
// makes these assertions strictly more load-bearing than they were. Two things
// were ADDED to cover what the consolidation newly put at risk:
//   • DayViewV2 — the seam DailyView actually mounts — is exercised alongside
//     DayFocus, so a re-introduced frame branch inside it cannot route /daily
//     to a surface with no Post button while the inner component keeps passing.
//   • A one-of-each count, because "the actions live in exactly one place" is
//     now a product decision (the rail is pure navigation) rather than an
//     accident of which frame was mounted.
//
// Handoff, 7.21 `source-home/`:
//   views-c.jsx:53-55   Plan · Post · Open in Teach  (the focus card footer)
//
// These render the SHIPPED component rather than a helper, for the same reason
// tests/teach-false-empty.test.ts does: vitest runs `environment: "node"`, but
// `react-dom/server` renders to a STRING there with no jsdom and no new
// dependency, so the assertions are about the real component's real output.
//
// The ORDER is pinned as well as the presence. Order is the whole point of a
// three-way action cluster: Open in Teach is the primary, and a Post button
// that lands after it reads as an afterthought rather than the sibling of Plan
// the handoff makes it.

const store = vi.hoisted(() => ({
  subjectById: {} as Record<string, Subject>,
  units: [] as unknown[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    subjectById: store.subjectById,
    units: store.units,
    setLessonStatus: () => {},
    // The focus card reads the lesson's REAL flow and standards from the store.
    // These fixtures carry no sections, so `[]` is the honest answer and the
    // card renders its "no lesson flow" empty state — which is what a lesson
    // with no sections should show. Note there is deliberately no
    // `getSections ?? (() => [])` fallback in the component: that would make a
    // genuine store regression render as "no flow" instead of failing loudly.
    getSections: () => [],
    describeStandard: (code: string) => code,
  }),
  // Settled, so the view renders lessons rather than a hydrate skeleton.
  usePlannerDataState: () => "settled",
}));

// Every href the view routes to, in order. This array is READ — see the
// destination block at the bottom. It used to be write-only: `renderToStaticMarkup`
// fires no events, so nothing could ever push into it, and a Post button wired
// to `/weekly`, to `/teach`, or to nothing at all passed every test in this file.
const pushed: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => {
      pushed.push(href);
    },
  }),
}));

// The unit pop-in reaches for the workspace host context, which no test
// provides — stub it out; it is not what these assert.
vi.mock("@/components/unit-chip", () => ({
  UnitChip: () => null,
}));

const { DayFocus } = await import("@/components/day-v2/DayFocus");
const { DayViewV2 } = await import("@/components/day-v2/DayViewV2");

// ── Fixtures ────────────────────────────────────────────────────────────────

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

/** The teaching tooltip the Post control carries. Asserted on its own because
 *  CLAUDE.md §4 requires a non-obvious control to explain what it ACCOMPLISHES
 *  — a bare "Post" label teaches a first-time teacher nothing. */
const POST_TOOLTIP = "Open this lesson&#x27;s resources on the wall";

/** The Day view, and the seam that mounts it. Both, deliberately — see the
 *  scope note in the header. */
const SURFACES = [
  ["DayFocus", DayFocus],
  ["DayViewV2 (the mounted seam)", DayViewV2],
] as const;

beforeEach(() => {
  store.subjectById = { math: SUBJECT };
  store.units = [];
  pushed.length = 0;
});

describe("Day — the day surface can reach the lesson's resource wall", () => {
  for (const [name, Surface] of SURFACES) {
    it(`${name} renders a Post control`, () => {
      const html = renderToStaticMarkup(
        createElement(Surface as never, BASE_PROPS as never),
      );
      expect(html).toContain(">Post</button>");
    });

    it(`${name}'s Post control carries a teaching tooltip`, () => {
      const html = renderToStaticMarkup(
        createElement(Surface as never, BASE_PROPS as never),
      );
      expect(html).toContain(POST_TOOLTIP);
    });
  }
});

describe("Day — the action cluster follows the handoff's order", () => {
  /** Index of each label's rendered button, or -1. */
  function order(html: string, labels: readonly string[]): number[] {
    return labels.map((l) => html.indexOf(`>${l}</button>`));
  }

  it("the focus card is Plan · Post · Open in Teach (views-c.jsx:53-55)", () => {
    const html = renderToStaticMarkup(
      createElement(DayFocus as never, BASE_PROPS as never),
    );
    const [plan, post, teach] = order(html, ["Plan", "Post", "Open in Teach"]);
    expect(plan).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(plan);
    expect(teach).toBeGreaterThan(post);
  });

  // The rail is pure navigation (user decision, 2026-08-01): clicking a row
  // focuses it, and Plan / Post / Open in Teach live in exactly ONE place. The
  // retired glass frame put a Plan|Post|Teach split on EVERY row, so this is
  // the assertion that stops them creeping back.
  //
  // It is an ABSENCE claim, so it carries a positive control in the SAME
  // render: the row count proves three lessons really rendered. Without it a
  // component that threw, or returned null, would satisfy every `toBe(1)` below
  // by rendering nothing at all.
  it("renders exactly one of each action, however many lessons the day has", () => {
    const threeLessons = {
      ...BASE_PROPS,
      dayLessons: [
        LESSON,
        { ...LESSON, id: "m-12-1" },
        { ...LESSON, id: "m-12-2" },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(DayFocus as never, threeLessons as never),
    );
    const count = (needle: string): number => html.split(needle).length - 1;

    // Positive control: the three rows really did render.
    expect(count('data-planner-item="lesson:')).toBe(3);

    expect(count(">Plan</button>")).toBe(1);
    expect(count(">Post</button>")).toBe(1);
    expect(count(">Open in Teach</button>")).toBe(1);
  });
});

// ── The Post button's DESTINATION ───────────────────────────────────────────
//
// Everything above asserts the button EXISTS, is labelled, and sits in the
// right place. None of it can see where it goes: a static render holds the
// markup and nothing else, so a Post button whose onClick pushed `/weekly` —
// or did nothing at all — satisfied all of those tests. The bug this whole
// file was written for was a MISSING DESTINATION, so leaving the destination
// unasserted left the original defect's nearest neighbour uncovered.
//
// `tests/mount-react.ts` mounts with react-dom/client over linkedom, so a real
// click reaches the real onClick and the router mock records the real href.
//
// Each case clicks the sibling Teach control FIRST as a positive control. A
// harness that clicked the wrong element, or a surface that routed every pill
// to one place, would otherwise be indistinguishable from a correct one.

describe("Day — the Post control goes to the lesson's wall, not somewhere else", () => {
  for (const [name, Surface] of SURFACES) {
    it(`${name} routes Post to /post?lesson=<id>`, async () => {
      const h = await mountReact(Surface as never);
      try {
        await h.render(BASE_PROPS as never);

        // CONTROL: the neighbouring Teach pill routes to its OWN destination.
        // This proves the click reaches a real handler AND that the three pills
        // are not all wired to one href.
        await h.click((el) =>
          /^(Teach|Open in Teach)$/.test(el.textContent ?? ""),
        );
        expect(pushed, `${name} control: Teach`).toEqual([
          "/teach?lesson=m-12-0",
        ]);
        pushed.length = 0;

        await h.click((el) => el.textContent === "Post");
        expect(pushed, `${name}: Post`).toEqual(["/post?lesson=m-12-0"]);
      } finally {
        await h.unmount();
      }
      // The FIRST mountReact in a file pays a one-off cold import of linkedom +
      // react-dom/client, measured here at 5997ms against 112ms for the second
      // case in the same run — so vitest's 5s default fails the first case and
      // passes the identical second one, which reads as "DayFocus is broken and
      // DayViewV2 is fine". This is a constant startup cost being named, not a
      // timeout raised until a flaky assertion goes green: the assertions
      // themselves are unchanged, and the warm case still finishes in ~0.1s.
    }, 20000);
  }
});
