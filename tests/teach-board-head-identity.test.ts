import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson } from "@/lib/types";

// Regression tests for BoardHeadIdentity — the lesson identity block in the v2
// Teach board header (components/teach-v2/BoardHeadIdentity.tsx).
//
// WHAT IT FIXES. The v2 board header named only the SUBJECT ("Math"). The
// lesson's title, its "I can" objective, and its standards lived exclusively in
// the left lesson rail — and TeachV2Shell hides that rail whenever the board is
// expanded or fullscreen (`lessonHidden`). Projecting, i.e. the one moment the
// board is doing its job, the room had no record of what the lesson was or what
// it was for. The header renders in BOTH states, so the identity moved here.
//
// THREE PROPERTIES ARE PINNED, and each one is a bug that has actually shipped
// somewhere in this repo:
//
//   1. The identity renders at all once the store is settled. The
//      anti-overshoot direction: gating for the hydrate must not blank a header
//      that has the lesson in hand.
//   2. Rich text is STRIPPED. Lesson.title and Lesson.objective may both carry
//      rich-text HTML (lib/types.ts) — the sibling
//      components/teach/left/modules/LessonCardModule.tsx renders them RAW,
//      which React escapes into visible "<p>Fractions</p>" on screen. Both the
//      text node AND the title= attribute go through stripHtml here, so the
//      test asserts BOTH failure shapes: a live tag (sanitizer bypass) and an
//      escaped one (the LessonCardModule bug).
//   3. Nothing definitive renders mid-hydrate. `getLesson` scans a document
//      that is empty for the whole 11–16s Supabase hydrate, and
//      app/(teach)/layout.tsx mounts its OWN <PlannerProvider> so every
//      Day/Week→Teach navigation pays it afresh. With no resolved lesson the
//      block names the subject and stops — it never says "No objective
//      recorded." about a lesson that is merely still in flight.
//
// WHY THIS RENDERS THE COMPONENT rather than a pure helper: vitest runs
// `environment: "node"`, but `react-dom/server` renders to a STRING there with
// no jsdom and no new dependency — so these assert the shipped component's
// actual output. Mirrors tests/teach-false-empty.test.ts.
//
// The store is mocked because `pending` is unreachable in a test AND on a local
// dev server: the planner falls back to lib/mock unless
// NEXT_PUBLIC_PLANNER_USE_SUPABASE=1, and `effectiveHydration` then pins
// hydration to "ready" forever. The mock is faithful to the real pending shape:
// planner-store dispatches `{ doc: EMPTY_DOC, hydration: "loading" }` on
// hydrate, so "pending" always comes with an empty document.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    getLesson: (id: string) => store.lessons.find((l) => l.id === id),
  }),
  usePlannerDataState: () => store.state,
  // StandardPill reads the provider-optional catalog for its hover description.
  useCatalogOptional: () => ({
    describeStandard: (code: string) => `Description for ${code}`,
  }),
}));

const { BoardHeadIdentity } = await import(
  "@/components/teach-v2/BoardHeadIdentity"
);

// ── Fixtures ────────────────────────────────────────────────────────────────

const LESSON = {
  id: "m-12-0",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  objective: "I can place a fraction on a number line.",
  preview: "Number lines and thirds.",
  week: 12,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [],
  standards: [],
} as unknown as Lesson;

/** The fallback shown when a RESOLVED lesson genuinely carries no objective —
 *  a settled fact about a lesson we hold, never a claim about the store. */
const NO_OBJECTIVE = "No objective recorded.";

const ALL_STATES = ["pending", "error", "settled"] as const;

function render(activeLessonId: string | null): string {
  return renderToStaticMarkup(
    createElement(BoardHeadIdentity, {
      activeLessonId,
      subjectLabel: "Math",
      subjectGlyph: "∑",
    }),
  );
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
});

// ── 1. The identity renders ─────────────────────────────────────────────────

describe("BoardHeadIdentity — a settled store shows what is being taught", () => {
  it("renders the lesson title and its objective", () => {
    store.state = "settled";
    store.lessons = [LESSON];
    const html = render("m-12-0");
    expect(html).toContain("Fractions on a number line");
    expect(html).toContain("I can place a fraction on a number line.");
  });

  it("keeps the subject label alongside the lesson title", () => {
    // The header's ONLY content before this change — losing it would trade one
    // gap for another.
    store.state = "settled";
    store.lessons = [LESSON];
    expect(render("m-12-0")).toContain("Math");
  });

  it("falls back to the preview when the objective is empty", () => {
    store.state = "settled";
    store.lessons = [{ ...LESSON, objective: "" }];
    const html = render("m-12-0");
    expect(html).toContain("Number lines and thirds.");
    expect(html).not.toContain(NO_OBJECTIVE);
  });

  it("falls back to empty MARKUP too, not just an empty string", () => {
    // "<p></p>" is not an objective. Stripping before the fallback is what
    // stops a blank second line rendering as if it said something.
    store.state = "settled";
    store.lessons = [{ ...LESSON, objective: "<p></p>", preview: "" }];
    expect(render("m-12-0")).toContain(NO_OBJECTIVE);
  });

  it("renders standards as compact pills when the lesson is tagged", () => {
    store.state = "settled";
    store.lessons = [{ ...LESSON, standards: ["5.NF.B.3"] }];
    const html = render("m-12-0");
    expect(html).toContain("5.NF.B.3");
  });

  it("caps the pills and counts the overflow rather than flooding the header", () => {
    store.state = "settled";
    store.lessons = [
      { ...LESSON, standards: ["5.NF.B.3", "5.NF.B.4", "5.NF.A.1", "5.NF.A.2"] },
    ];
    const html = render("m-12-0");
    expect(html).toContain("5.NF.A.1");
    expect(html).not.toContain("5.NF.A.2");
    expect(html).toContain("+1");
  });

  it("renders the lesson the moment it lands, even if the store still reports pending", () => {
    // Ordering guard: a resolved lesson wins over the data state, so a slow
    // hydration flag can never blank a header whose content is already present.
    store.state = "pending";
    store.lessons = [LESSON];
    expect(render("m-12-0")).toContain("Fractions on a number line");
  });
});

// ── 2. Rich text is stripped ────────────────────────────────────────────────

describe("BoardHeadIdentity — stored rich text never leaks into the projected header", () => {
  it("strips markup from the title, in the text node AND the title= attribute", () => {
    store.state = "settled";
    store.lessons = [{ ...LESSON, title: "<p>Fractions</p>" }];
    const html = render("m-12-0");
    expect(html).toContain("Fractions");
    // A live tag would mean the strip was skipped entirely...
    expect(html).not.toContain("<p>");
    // ...and an ESCAPED one is the shipped LessonCardModule bug: React escapes
    // the raw string, so a teacher reads the literal characters "<p>Fractions".
    expect(html).not.toContain("&lt;p&gt;");
  });

  it("strips markup from the objective", () => {
    store.state = "settled";
    store.lessons = [
      { ...LESSON, objective: "<p>I can <strong>compare</strong> fractions.</p>" },
    ];
    const html = render("m-12-0");
    expect(html).toContain("I can compare fractions.");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("&lt;strong&gt;");
  });
});

// ── 3. The hydrate window states nothing ────────────────────────────────────

describe("BoardHeadIdentity — an unresolved lesson is never described mid-hydrate", () => {
  it("says nothing definitive about the lesson while the hydrate is in flight", () => {
    store.state = "pending";
    const html = render("m-12-0");
    expect(html).not.toContain(NO_OBJECTIVE);
    expect(html).not.toContain("I can");
  });

  it("still names the subject, so the header is never blank", () => {
    // The anti-overshoot direction: deferring the lesson block must not strand
    // the header itself on nothing.
    store.state = "pending";
    expect(render("m-12-0")).toContain("Math");
  });

  it("says nothing definitive when the hydrate FAILED either", () => {
    // A failed hydrate also leaves an empty document; an objective claim then
    // would be a falsehood caused by a backend outage.
    store.state = "error";
    expect(render("m-12-0")).not.toContain(NO_OBJECTIVE);
  });

  it.each(ALL_STATES)(
    "shows the subject alone with no lesson id at all, in the %s state",
    (state) => {
      // Sandbox mode nulls activeLessonId (TeachWorkspace `enterSandbox`), as
      // does a standalone board open — a fact about WORKSPACE state, true in
      // every data state.
      store.state = state;
      const html = render(null);
      expect(html).toContain("Math");
      expect(html).not.toContain(NO_OBJECTIVE);
    },
  );
});
