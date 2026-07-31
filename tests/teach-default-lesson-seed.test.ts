import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { slugToUuid } from "@/lib/planner/id-bridge";
import type { Lesson } from "@/lib/types";

// Regression tests for the Teach default-lesson seed.
//
// TeachWorkspace opened a deep-link-less /teach by dispatching
// `selectLesson` with a hard-coded MOCK FIXTURE SLUG ("m-12-0"). Under
// NEXT_PUBLIC_PLANNER_USE_SUPABASE the planner's lesson ids are db uuids and
// `getLesson` is an `id ===` scan, so that slug could never match — and there is
// no fallback. The lesson card was therefore unresolvable PERMANENTLY, not for
// the 11–16s hydrate window that tests/teach-false-empty.test.ts covers. The two
// defects compound: that lane split the empty branch so the miss now reads
// "That lesson isn't in your plan.", which is honest about the id it was handed
// and wrong about the teacher's plan, because the id was never theirs.
//
// It stayed invisible because the BOARDS still loaded: lib/teach/supabase-source.ts
// routes a non-uuid lesson id through the same deterministic `slugToUuid` bridge
// the planner importer uses, so the board strip filled from a lesson the card
// could not name.
//
// WHY THE UUID REGIME IS BUILT WITH `slugToUuid` AND NOT AN ARBITRARY UUID: it
// pins the STRONGEST form of the claim. Even in the one workspace where the
// bridge's premise holds — the beta school, whose lesson row genuinely IS
// `slugToUuid("lesson", "m-12-0")` — the raw slug still matches nothing the
// STORE holds, because the store hydrates db uuids. Mapping the seed through the
// bridge would paper over the card for that single tenant and reproduce the bug
// verbatim for every school whose lessons were created through the app rather
// than imported from fixtures. (The bridge is not universally safe either:
// subjects are NOT slug-derived, which is what broke lesson creation earlier the
// same day.)
//
// THE INVARIANT UNDER TEST, which holds without naming either regime: the
// workspace never selects an id it has not seen in the hydrated store.
//
// Both directions are pinned, and the second matters as much as the first. The
// mock/prototype path currently works — /teach opens on the fixture's populated
// board — and a fix that made prod honest by blanking localhost would be a
// straight trade, not a fix.
//
// WHY THIS TESTS A PURE RESOLVER PLUS A RENDER rather than mounting
// TeachWorkspace: vitest runs `environment: "node"` and `react-dom/server` never
// runs effects, so the seed EFFECT is unreachable here. The decision it makes is
// extracted to `resolveDefaultLessonId`, and feeding that decision straight into
// the component the workspace actually renders covers the whole user-visible
// consequence: which id gets selected, and what a teacher then reads.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    getLesson: (id: string) => store.lessons.find((l) => l.id === id),
    getSections: () => [],
  }),
  usePlannerDataState: () => store.state,
}));

const { resolveDefaultLessonId } = await import(
  "@/components/teach/TeachWorkspace"
);
const { LessonCardModule } = await import(
  "@/components/teach/left/modules/LessonCardModule"
);

// ── Fixtures: the same lesson under each id regime ───────────────────────────

/** The fixture slug TeachWorkspace seeded unconditionally. Quoted here as the
 *  DEFECT's input, so these tests keep describing it after the constant that
 *  held it is gone. */
const FIXTURE_SLUG = "m-12-0";

/** What the beta school's row is actually keyed on — the strongest available
 *  stand-in for a live planner lesson id. */
const DB_UUID = slugToUuid("lesson", FIXTURE_SLUG);

function lesson(id: string, over: Partial<Lesson> = {}): Lesson {
  return {
    id,
    subject: "math",
    unit: "u1",
    title: "Equivalent fractions warm-up",
    objective: "I can find three equivalent fractions for a given fraction.",
    week: 12,
    day: 0,
    status: "planned",
    archived: false,
    modified: false,
    resources: [],
    standards: [],
    ...over,
  } as unknown as Lesson;
}

/** Flag OFF / localhost: the planner store hydrates lib/mock, whose ids ARE
 *  slugs. */
const MOCK_REGIME = [lesson(FIXTURE_SLUG)];
/** Flag ON / production: the planner store hydrates db rows, whose ids are
 *  uuids. */
const UUID_REGIME = [lesson(DB_UUID)];

const LESSON_NOT_FOUND = "isn’t in your plan"; // curly apostrophe: matched mid-word
const NO_LESSON_SELECTED = "No lesson selected";

function renderLessonCard(activeLessonId: string | null): string {
  return renderToStaticMarkup(
    createElement(LessonCardModule, { activeLessonId }),
  );
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
});

// ── The defect, pinned ───────────────────────────────────────────────────────

describe("the id regimes are genuinely different (the premise these tests rest on)", () => {
  it("does not silently collapse: the slug and the db uuid are distinct ids", () => {
    // If this ever passed by accident, every assertion below would be vacuous.
    expect(DB_UUID).not.toBe(FIXTURE_SLUG);
    expect(DB_UUID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("shows what the old unconditional seed produced under the uuid regime", () => {
    // The reproduction. Selecting the fixture slug against a store of uuids
    // renders the miss — and it is not a hydrate transient: the store here is
    // SETTLED, so this is the steady state a teacher was left in.
    store.state = "settled";
    store.lessons = UUID_REGIME;
    expect(renderLessonCard(FIXTURE_SLUG)).toContain(LESSON_NOT_FOUND);
  });
});

// ── The resolver ─────────────────────────────────────────────────────────────

describe("resolveDefaultLessonId — never returns an id the store cannot resolve", () => {
  it("returns nothing under the uuid regime, so nothing unresolvable is selected", () => {
    expect(resolveDefaultLessonId(UUID_REGIME)).toBeNull();
  });

  it("still returns the fixture lesson under the mock regime", () => {
    // The anti-overshoot check: prod is not made honest by blanking localhost.
    expect(resolveDefaultLessonId(MOCK_REGIME)).toBe(FIXTURE_SLUG);
  });

  it("returns nothing for a mid-hydrate (empty) store", () => {
    // Belt and braces for the effect's `pending` gate: even if the decision were
    // taken before the document landed, an empty store yields no seed rather
    // than a guess.
    expect(resolveDefaultLessonId([])).toBeNull();
  });

  it("does not seed an ARCHIVED fixture lesson", () => {
    // LessonListModule filters archived lessons out, so seeding one would
    // highlight no row in the list beside the card.
    expect(
      resolveDefaultLessonId([lesson(FIXTURE_SLUG, { archived: true })]),
    ).toBeNull();
  });

  it("holds the invariant over every regime: any id returned is IN the store", () => {
    for (const lessons of [MOCK_REGIME, UUID_REGIME, [], [lesson("x-1-0")]]) {
      const seed = resolveDefaultLessonId(lessons);
      if (seed !== null) {
        expect(lessons.some((l) => l.id === seed)).toBe(true);
      }
    }
  });
});

// ── What a teacher reads, per regime ─────────────────────────────────────────

describe("the seeded card under the uuid regime (production)", () => {
  it("never claims a lesson is missing from the teacher's plan", () => {
    store.state = "settled";
    store.lessons = UUID_REGIME;
    const html = renderLessonCard(resolveDefaultLessonId(UUID_REGIME));
    expect(html).not.toContain(LESSON_NOT_FOUND);
  });

  it("says no lesson is selected, and how to pick one", () => {
    // The honest alternative to a guess. Selecting nothing is a fact about
    // WORKSPACE state, so this copy is correct in every data state — and it
    // carries the recovery instruction, unlike the miss it replaces.
    store.state = "settled";
    store.lessons = UUID_REGIME;
    const html = renderLessonCard(resolveDefaultLessonId(UUID_REGIME));
    expect(html).toContain(NO_LESSON_SELECTED);
    expect(html).toContain("Pick a lesson from the Lessons tab");
  });

  it("is not stranded on a skeleton — the prompt renders, settled", () => {
    // Deferring forever would pass every "the lie is gone" assertion while
    // leaving Teach loading for good.
    store.state = "settled";
    store.lessons = UUID_REGIME;
    expect(renderLessonCard(resolveDefaultLessonId(UUID_REGIME))).not.toContain(
      'aria-busy="true"',
    );
  });
});

describe("the seeded card under the mock regime (localhost / the prototype)", () => {
  it("still opens on the fixture lesson's card, unchanged", () => {
    store.state = "settled";
    store.lessons = MOCK_REGIME;
    const html = renderLessonCard(resolveDefaultLessonId(MOCK_REGIME));
    expect(html).toContain("Equivalent fractions warm-up");
    expect(html).not.toContain(LESSON_NOT_FOUND);
    expect(html).not.toContain(NO_LESSON_SELECTED);
  });
});
