import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson, Subject } from "@/lib/types";

// The Day canvas's per-lesson action cluster must reach ALL THREE destinations
// the v2 handoff specifies: Plan, Post, Teach.
//
// Post was the one that never landed. All three frames carried the same
// placeholder comment — "Wave 9: a 'Post' (resource wall) button lands here
// once the /post route ships" — and /post shipped without anyone deleting the
// comment. So a teacher looking at the lesson they are about to teach had no
// path from it to that lesson's resource wall, on any frame; the only way in
// was to know the /post URL.
//
// Handoff, 7.21 `source-home/`:
//   views-a.jsx:42-44   Plan · Post · Teach          (glass timeline row)
//   views-b.jsx:47-49   Open in Teach · Lesson plan · Post   (paper focus panel)
//   views-c.jsx:53-55   Plan · Post · Open in Teach  (colour hero footer)
//
// These render the SHIPPED frames rather than a helper, for the same reason
// tests/teach-false-empty.test.ts does: vitest runs `environment: "node"`, but
// `react-dom/server` renders to a STRING there with no jsdom and no new
// dependency, so the assertions are about the real components' real output.
//
// The ORDER is pinned as well as the presence. Order is the whole point of a
// three-way action cluster: Teach is the primary on B and C, and a Post button
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
  }),
  // Settled, so the frames render lessons rather than a hydrate skeleton.
  usePlannerDataState: () => "settled",
}));

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

const { DayA } = await import("@/components/day-v2/DayA");
const { DayB } = await import("@/components/day-v2/DayB");
const { DayC } = await import("@/components/day-v2/DayC");

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

/** The teaching tooltip every frame's Post control carries. Asserted on its own
 *  because CLAUDE.md §4 requires a non-obvious control to explain what it
 *  ACCOMPLISHES — a bare "Post" label teaches a first-time teacher nothing. */
const POST_TOOLTIP = "Open this lesson&#x27;s resources on the wall";

const FRAMES = [
  ["DayA (glass)", DayA],
  ["DayB (paper)", DayB],
  ["DayC (colour)", DayC],
] as const;

beforeEach(() => {
  store.subjectById = { math: SUBJECT };
  store.units = [];
  pushed.length = 0;
});

describe("Day — every frame can reach the lesson's resource wall", () => {
  for (const [name, Frame] of FRAMES) {
    it(`${name} renders a Post control`, () => {
      const html = renderToStaticMarkup(
        createElement(Frame as never, BASE_PROPS as never),
      );
      expect(html).toContain(">Post</button>");
    });

    it(`${name}'s Post control carries a teaching tooltip`, () => {
      const html = renderToStaticMarkup(
        createElement(Frame as never, BASE_PROPS as never),
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

  it("DayA is Plan · Post · Teach (views-a.jsx:42-44)", () => {
    const html = renderToStaticMarkup(
      createElement(DayA as never, BASE_PROPS as never),
    );
    const [plan, post, teach] = order(html, ["Plan", "Post", "Teach"]);
    expect(plan).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(plan);
    expect(teach).toBeGreaterThan(post);
  });

  it("DayB is Open in Teach · Lesson plan · Post (views-b.jsx:47-49)", () => {
    const html = renderToStaticMarkup(
      createElement(DayB as never, BASE_PROPS as never),
    );
    const [teach, plan, post] = order(html, [
      "Open in Teach",
      "Lesson plan",
      "Post",
    ]);
    expect(teach).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(teach);
    expect(post).toBeGreaterThan(plan);
  });

  it("DayC is Plan · Post · Open in Teach (views-c.jsx:53-55)", () => {
    const html = renderToStaticMarkup(
      createElement(DayC as never, BASE_PROPS as never),
    );
    const [plan, post, teach] = order(html, [
      "Plan",
      "Post",
      "Open in Teach",
    ]);
    expect(plan).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(plan);
    expect(teach).toBeGreaterThan(post);
  });
});
