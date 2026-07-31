import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { HubBrowseProps } from "@/components/hub-v2/browse/browse-data";
import type { Lesson, Subject, Unit } from "@/lib/types";

// Regression tests for the Planner Hub browse false-empty — the same defect
// class as the /daily false-empty (tests/day-empty-kind.test.ts), on four more
// surfaces. Each of the four hub pickers derives its list from
// `usePlanner().lessons` / `.units` and, when it came up empty, rendered a bare
// `<p className={styles.empty}>` DENYING a match — without ever consulting
// hydration state. Over Supabase the hydrate takes 11–16s and the document is
// legitimately empty for that whole window, so a teacher who landed on /planner
// and searched immediately was told their lesson did not exist.
//
// The no-query half of each picker was ALREADY correct: it delegates to
// <PlannerEmpty>, which branches on the same data state internally
// (components/ui/PlannerEmpty.tsx). Only the search-active branch was raw. Both
// halves are pinned below — the correct half so a refactor that inlines an
// <EmptyState> cannot silently reintroduce the bug on the landing view.
//
// WHY THESE RENDER THE COMPONENTS rather than a pure helper. day-empty.ts
// extracted its decision because vitest runs `environment: "node"` and "cannot
// render React" — true of the DOM, but `react-dom/server` renders to a STRING in
// node with no jsdom and no new dependency. So these assert against the shipped
// components' actual output, and cover PlannerEmpty's own branch too.
//
// The store is mocked because the pending state is unreachable in a test AND on
// a local dev server: the planner falls back to lib/mock unless
// NEXT_PUBLIC_PLANNER_USE_SUPABASE=1, and `effectiveHydration` then pins
// hydration to "ready" forever. The mock is faithful to the real pending shape —
// planner-store dispatches `{ doc: EMPTY_DOC, hydration: "loading" }` on
// hydrate, so "pending" always comes with an empty document.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  subjectById: {} as Record<string, Subject>,
  units: [] as Unit[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: store.subjectById,
    units: store.units,
  }),
  usePlannerDataState: () => store.state,
}));

// CatchUpBrowse reads the planning week from app-state; the real provider is a
// React context that a static render has no way to mount.
vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({ week: 12 }),
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
  weeks: "Wk 1",
} as unknown as Unit;

const LESSON = {
  id: "l1",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  week: 1,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [],
  standards: [],
} as unknown as Lesson;

/** The loading affordance <Skeleton> renders. Also the marker that a fix has NOT
 *  overshot into stranding a settled surface on a permanent skeleton. */
const LOADING = 'role="status" aria-busy="true"';
const ERROR_COPY = "Couldn’t load your plan";

/**
 * The four hub browse pickers and the two empty messages each owns.
 *
 * `denial` is matched WITHOUT quote characters on purpose: three of the four
 * emit CURLY quotes (U+201C/U+201D), and an ASCII-quoted matcher silently never
 * fires — which is exactly how the first live verification of this bug returned
 * a vacuous "not reproduced".
 */
const PICKERS = [
  {
    name: "LessonBrowse",
    load: () => import("@/components/hub-v2/browse/LessonBrowse"),
    export: "LessonBrowse",
    denial: "No lessons match",
    quoted: "“Fractions”",
    vacant: "No lessons yet",
  },
  {
    name: "UnitBrowse",
    load: () => import("@/components/hub-v2/browse/UnitBrowse"),
    export: "UnitBrowse",
    denial: "No units match",
    quoted: "“Fractions”",
    vacant: "No units yet",
  },
  {
    name: "CatchUpBrowse",
    load: () => import("@/components/hub-v2/browse/CatchUpBrowse"),
    export: "CatchUpBrowse",
    denial: "Nothing to catch up matches",
    quoted: "“Fractions”",
    vacant: "Nothing to catch up",
  },
  {
    name: "ResourceBrowse",
    load: () => import("@/components/hub-v2/browse/ResourceBrowse"),
    export: "ResourceBrowse",
    // No query interpolation in this one — the message names the FILTERS, and
    // the branch fires for `query || filter !== "all"`, so a teacher reaches it
    // from a filter chip with nothing typed at all. A static render can only
    // drive the query half; both halves sit behind the SAME guard expression,
    // and the chip path is exercised live on /planner.
    denial: "No resources match your filters",
    quoted: null,
    vacant: "No resources attached yet",
  },
] as const;

async function render(
  picker: (typeof PICKERS)[number],
  query: string,
): Promise<string> {
  const mod = (await picker.load()) as unknown as Record<
    string,
    ComponentType<HubBrowseProps>
  >;
  return renderToStaticMarkup(
    createElement(mod[picker.export], { query, onOpenDoc: () => {} }),
  );
}

// Pay all four picker graphs' cold transform ONCE, outside any test's measured
// window. See the same note in tests/archive-school-years.test.ts. This file is
// the worst case: `describe.each` means the first test of EACH picker pays its
// own cold import, so four separate tests timed out on warm-up cost — and which
// four moved between runs with suite-wide transform contention. Warming every
// picker up front makes the failures deterministic, and leaves the default
// 5000ms per-test budget guarding the render.
beforeAll(async () => {
  await Promise.all(PICKERS.map((p) => p.load()));
}, 120_000);

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.subjects = [];
  store.subjectById = {};
  store.units = [];
});

describe.each(PICKERS)(
  "$name — a search over an unhydrated store never denies a match",
  (picker) => {
    it("does not deny a match while the hydrate is in flight", async () => {
      store.state = "pending";
      expect(await render(picker, "Fractions")).not.toContain(picker.denial);
    });

    it("shows a loading affordance instead, labelled for screen readers", async () => {
      store.state = "pending";
      const html = await render(picker, "Fractions");
      // Without the label a screen-reader user hears silence where the lie was —
      // the same falsehood moved into the accessibility layer.
      expect(html).toContain(LOADING);
      expect(html).toContain("Loading your plan");
    });

    it("does not deny a match when the hydrate FAILED", async () => {
      // A failed hydrate also leaves an empty document. Denying the match then
      // tells a teacher their lesson does not exist because the backend is down.
      store.state = "error";
      const html = await render(picker, "Fractions");
      expect(html).not.toContain(picker.denial);
      expect(html).toContain(ERROR_COPY);
    });

    it("keeps its header visible in every state, so the surface never looks broken", async () => {
      for (const state of ["pending", "error", "settled"] as const) {
        store.state = state;
        expect(await render(picker, "Fractions")).toContain("Planner");
      }
    });
  },
);

describe.each(PICKERS)(
  "$name — a settled store STILL answers the query honestly",
  (picker) => {
    // The failure mode opposite the one being fixed, and the likelier mistake: a
    // permanent skeleton passes every "the lie is gone" test while stranding the
    // search loading forever, which is worse than the bug.
    it("denies the match once settled with nothing matching", async () => {
      store.state = "settled";
      const html = await render(picker, "Fractions");
      expect(html).toContain(picker.denial);
      expect(html).not.toContain(LOADING);
    });

    if (picker.quoted) {
      it("keeps the query in the message, curly quotes and all", async () => {
        store.state = "settled";
        // Pinned because the copy is what a teacher reads, and it is also what
        // any future live probe has to match on.
        expect(await render(picker, "  Fractions  ")).toContain(picker.quoted);
      });
    }
  },
);

describe.each(PICKERS)(
  "$name — the no-query branch obeys the same contract",
  (picker) => {
    // This half was already honest via <PlannerEmpty>. Pinned so a refactor that
    // inlines an <EmptyState> — the natural "simplification" — cannot
    // reintroduce the bug on the view a teacher sees before data arrives.
    it("shows a skeleton, not an empty-catalog claim, while pending", async () => {
      store.state = "pending";
      const html = await render(picker, "");
      expect(html).not.toContain(picker.vacant);
      expect(html).toContain(LOADING);
    });

    it("reports a failed hydrate rather than an empty catalog", async () => {
      store.state = "error";
      const html = await render(picker, "");
      expect(html).not.toContain(picker.vacant);
      expect(html).toContain(ERROR_COPY);
    });

    it("states the surface is empty once settled and genuinely empty", async () => {
      store.state = "settled";
      const html = await render(picker, "");
      expect(html).toContain(picker.vacant);
      expect(html).not.toContain(LOADING);
    });

    it("treats a whitespace-only query as no query", async () => {
      store.state = "settled";
      expect(await render(picker, "   ")).toContain(picker.vacant);
    });
  },
);

describe("the guard does not hide real content", () => {
  // The anti-overshoot check: gating the denial must not gate the LIST. Proven
  // per-picker here for the two that need only catalog fixtures; all four are
  // additionally exercised against real data by the live probe on /planner.
  it("LessonBrowse still renders a matching lesson", async () => {
    store.state = "settled";
    store.lessons = [LESSON];
    store.subjects = [MATH];
    store.subjectById = { math: MATH };
    store.units = [UNIT];
    const html = await render(PICKERS[0], "Fractions");
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(PICKERS[0].denial);
    expect(html).not.toContain(LOADING);
  });

  it("UnitBrowse still renders a matching unit", async () => {
    store.state = "settled";
    store.lessons = [LESSON];
    store.subjects = [MATH];
    store.subjectById = { math: MATH };
    store.units = [UNIT];
    const html = await render(PICKERS[1], "Place Value");
    expect(html).toContain("Place Value");
    expect(html).not.toContain(PICKERS[1].denial);
    expect(html).not.toContain(LOADING);
  });
});
