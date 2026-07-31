import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson } from "@/lib/types";
import type { LessonSectionContent } from "@/lib/lesson-flow";

// Regression tests for the /teach false-empties — the same defect class as the
// Planner Hub browse pickers (tests/hub-browse-empty.test.ts) and the /daily
// false-empty (tests/day-empty-kind.test.ts), on the two highest-traffic Teach
// modules.
//
//   LessonCardModule   "No lesson selected. Pick a lesson from the Lessons tab,
//                       or build a sandbox board."
//   ResourcesModule    "No resources on this lesson yet."
//
// Both derived their claim from usePlanner() alone. `getLesson(id)` scans
// `present.lessons` and `getSections(id)` returns [] — both empty for the whole
// 11–16s Supabase hydrate — so each module asserted absence about content that
// was merely still in flight. app/(teach)/layout.tsx mounts its OWN
// <PlannerProvider>, so EVERY Day/Week→Teach navigation pays that hydrate afresh:
// a teacher opening Teach minutes before class was told their deep-linked lesson
// did not exist, and handed instructions to go find a different one.
//
// TWO DIRECTIONS ARE PINNED, and the second matters as much as the first:
// a settled store must STILL be able to say "not found" / "no resources". A
// permanent skeleton passes every "the lie is gone" assertion while stranding
// Teach loading forever — a worse bug than the one being fixed.
//
// The `activeLessonId == null` branches are pinned UNGUARDED on purpose. Those
// are facts about WORKSPACE state (sandbox mode nulls the id; so does a
// standalone board open, and the tick before TeachWorkspace's default seed
// lands) — true in every data state. Deferring them would replace a correct
// sandbox instruction with a skeleton that never resolves.
//
// WHY THIS RENDERS THE COMPONENTS rather than a pure helper: vitest runs
// `environment: "node"`, but `react-dom/server` renders to a STRING there with
// no jsdom and no new dependency — so these assert the shipped components'
// actual output, and cover PlannerEmpty's own branch too.
//
// The store is mocked because `pending` is unreachable in a test AND on a local
// dev server: the planner falls back to lib/mock unless
// NEXT_PUBLIC_PLANNER_USE_SUPABASE=1, and `effectiveHydration` then pins
// hydration to "ready" forever — which is why this bug cannot be reproduced in a
// browser on localhost. The mock is faithful to the real pending shape:
// planner-store dispatches `{ doc: EMPTY_DOC, hydration: "loading" }` on
// hydrate, so "pending" always comes with an empty document.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  sections: {} as Record<string, LessonSectionContent[]>,
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    getLesson: (id: string) => store.lessons.find((l) => l.id === id),
    getSections: (id: string) => store.sections[id] ?? [],
  }),
  usePlannerDataState: () => store.state,
}));

const { LessonCardModule } = await import(
  "@/components/teach/left/modules/LessonCardModule"
);
const { ResourcesModule } = await import(
  "@/components/teach/right/modules/ResourcesModule"
);

// ── Fixtures ────────────────────────────────────────────────────────────────

const LESSON = {
  id: "m-12-0",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  objective: "I can place a fraction on a number line.",
  week: 12,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [],
  standards: [],
} as unknown as Lesson;

const SECTION: LessonSectionContent = {
  id: "s1",
  templateSectionId: null,
  heading: "Launch",
  prompt: "",
  body: "",
  resources: [
    {
      id: "r1",
      type: "slides",
      label: "Number line deck",
      url: "https://docs.google.com/presentation/d/abc/edit",
    },
  ],
};

/** The loading affordance <Skeleton> renders — also the marker that a fix has
 *  NOT overshot into stranding a settled surface on a permanent skeleton. */
const LOADING = 'role="status" aria-busy="true"';
const LOADING_LABEL = "Loading your plan";
const ERROR_COPY = "Couldn’t load your plan";

// The exact strings a teacher reads. Matched WITHOUT the curly apostrophe where
// one appears mid-word, since an ASCII-quoted matcher silently never fires —
// exactly how an earlier live verification of this defect class returned a
// vacuous "not reproduced".
const NO_LESSON_SELECTED = "No lesson selected";
const LESSON_NOT_FOUND = "isn’t in your plan";
const NO_RESOURCES = "No resources on this lesson yet.";
const SELECT_A_LESSON = "Select a lesson to see its resources here.";

const ALL_STATES = ["pending", "error", "settled"] as const;

function renderLessonCard(activeLessonId: string | null): string {
  return renderToStaticMarkup(
    createElement(LessonCardModule, { activeLessonId }),
  );
}

function renderResources(activeLessonId: string | null): string {
  return renderToStaticMarkup(
    createElement(ResourcesModule, {
      activeLessonId,
      onMagnifyResource: () => {},
    }),
  );
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.sections = {};
});

// ── LessonCardModule ────────────────────────────────────────────────────────

describe("LessonCardModule — an unresolved lesson id is never called missing mid-hydrate", () => {
  it("does not claim the lesson is absent while the hydrate is in flight", () => {
    store.state = "pending";
    const html = renderLessonCard("m-12-0");
    expect(html).not.toContain(LESSON_NOT_FOUND);
    expect(html).not.toContain(NO_LESSON_SELECTED);
  });

  it("shows a loading affordance instead, labelled for screen readers", () => {
    store.state = "pending";
    const html = renderLessonCard("m-12-0");
    // Without the label a screen-reader user hears silence where the lie was —
    // the same falsehood moved into the accessibility layer.
    expect(html).toContain(LOADING);
    expect(html).toContain(LOADING_LABEL);
  });

  it("does not claim the lesson is absent when the hydrate FAILED", () => {
    // A failed hydrate also leaves an empty document. Denying the lesson then
    // tells a teacher their plan is gone because the backend is down.
    store.state = "error";
    const html = renderLessonCard("m-12-0");
    expect(html).not.toContain(LESSON_NOT_FOUND);
    expect(html).toContain(ERROR_COPY);
  });
});

describe("LessonCardModule — a settled store still answers honestly", () => {
  it("states the miss once settled with the lesson genuinely absent", () => {
    store.state = "settled";
    const html = renderLessonCard("m-12-0");
    expect(html).toContain(LESSON_NOT_FOUND);
    expect(html).not.toContain(LOADING);
  });

  it("keeps the recovery instruction alongside the miss", () => {
    store.state = "settled";
    expect(renderLessonCard("m-12-0")).toContain("Pick a lesson from the");
  });

  it("renders the real lesson when the store holds it", () => {
    // The anti-overshoot check: gating the denial must not gate the CARD.
    store.state = "settled";
    store.lessons = [LESSON];
    const html = renderLessonCard("m-12-0");
    expect(html).toContain("Fractions on a number line");
    expect(html).toContain("I can place a fraction on a number line.");
    expect(html).not.toContain(LOADING);
    expect(html).not.toContain(LESSON_NOT_FOUND);
  });

  it("renders the lesson the moment it lands, even if the store still reports pending", () => {
    // Ordering guard: a resolved lesson wins over the data state, so a slow
    // hydration flag can never blank a card whose content is already present.
    store.state = "pending";
    store.lessons = [LESSON];
    expect(renderLessonCard("m-12-0")).toContain("Fractions on a number line");
  });
});

describe("LessonCardModule — no lesson id is a workspace fact, not a store fact", () => {
  it.each(ALL_STATES)(
    "keeps the sandbox instruction in the %s state",
    (state) => {
      // Sandbox mode nulls activeLessonId (TeachWorkspace `enterSandbox`), as
      // does a standalone board open. Deferring here would hide the only
      // instruction telling a teacher how to get out of an empty Teach.
      store.state = state;
      const html = renderLessonCard(null);
      expect(html).toContain(NO_LESSON_SELECTED);
      expect(html).not.toContain(LOADING);
      expect(html).not.toContain(LESSON_NOT_FOUND);
    },
  );
});

// ── ResourcesModule ─────────────────────────────────────────────────────────

describe("ResourcesModule — an empty resource list is never called empty mid-hydrate", () => {
  it("does not claim the lesson has no resources while the hydrate is in flight", () => {
    store.state = "pending";
    expect(renderResources("m-12-0")).not.toContain(NO_RESOURCES);
  });

  it("shows a loading affordance instead, labelled for screen readers", () => {
    store.state = "pending";
    const html = renderResources("m-12-0");
    expect(html).toContain(LOADING);
    expect(html).toContain(LOADING_LABEL);
  });

  it("does not claim the lesson has no resources when the hydrate FAILED", () => {
    store.state = "error";
    const html = renderResources("m-12-0");
    expect(html).not.toContain(NO_RESOURCES);
    expect(html).toContain(ERROR_COPY);
  });

  it("keeps its search box and filter chips in every state, so the panel never looks broken", () => {
    for (const state of ALL_STATES) {
      store.state = state;
      const html = renderResources("m-12-0");
      expect(html).toContain("Search this lesson&#x27;s resources");
      expect(html).toContain("Handouts");
    }
  });
});

describe("ResourcesModule — a settled store still answers honestly", () => {
  it("states the emptiness once settled and genuinely empty", () => {
    store.state = "settled";
    const html = renderResources("m-12-0");
    expect(html).toContain(NO_RESOURCES);
    expect(html).not.toContain(LOADING);
  });

  it("renders the lesson's resources when the store holds them", () => {
    // The anti-overshoot check: gating the empty message must not gate the GRID.
    store.state = "settled";
    store.sections = { "m-12-0": [SECTION] };
    const html = renderResources("m-12-0");
    expect(html).toContain("Number line deck");
    expect(html).toContain("1 resource");
    expect(html).not.toContain(NO_RESOURCES);
    expect(html).not.toContain(LOADING);
  });

  it("renders resources the moment they land, even if the store still reports pending", () => {
    store.state = "pending";
    store.sections = { "m-12-0": [SECTION] };
    expect(renderResources("m-12-0")).toContain("Number line deck");
  });
});

describe("ResourcesModule — no lesson id is a workspace fact, not a store fact", () => {
  it.each(ALL_STATES)("keeps the select-a-lesson prompt in the %s state", (state) => {
    store.state = state;
    const html = renderResources(null);
    expect(html).toContain(SELECT_A_LESSON);
    expect(html).not.toContain(LOADING);
    expect(html).not.toContain(NO_RESOURCES);
  });
});
