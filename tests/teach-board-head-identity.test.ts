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
//   1. The identity renders at all once the lesson RESOLVES. The
//      anti-overshoot direction: caring about the hydrate must not blank a
//      header that has the lesson in hand.
//   2. Rich text is STRIPPED. Lesson.title and Lesson.objective may both carry
//      rich-text HTML (lib/types.ts) — the sibling
//      components/teach/left/modules/LessonCardModule.tsx renders them RAW,
//      which React escapes into visible "<p>Fractions</p>" on screen. Both the
//      text node AND the title= attribute go through stripHtml here, so the
//      test asserts BOTH failure shapes: a live tag (sanitizer bypass) and an
//      escaped one (the LessonCardModule bug).
//   3. Nothing definitive renders about a lesson the store has not RESOLVED.
//      `getLesson` scans a document that is empty for the whole 11–16s Supabase
//      hydrate, and app/(teach)/layout.tsx mounts its OWN <PlannerProvider> so
//      every Day/Week→Teach navigation pays it afresh. With no resolved lesson
//      the block names the subject and stops — it never says "No objective
//      recorded." about a lesson that is merely still in flight.
//
// WHAT THIS FILE DOES NOT TEST, AND WHY IT NO LONGER PRETENDS TO. Property 3 is
// enforced by ONE input: whether `getLesson(activeLessonId)` returns a lesson.
// The component reads `usePlanner()` and `stripHtml` and NOTHING ELSE — no
// `usePlannerDataState`, no hydration flag, no error branch (see the component's
// own header: "there is no 'no lesson' copy to be wrong with", because the
// LessonRail's LessonCardModule owns that message). This file used to mock
// `usePlannerDataState` and drive it through pending / error / settled, which
// produced BYTE-IDENTICAL renders and read to a reviewer as three states
// covered when one was: replacing the mocked hook with a function that THREW
// left every test green. The hook and the three-state loop are gone, and the
// remaining tests vary the only input that exists. If an error branch is ever
// wanted here, it is a product change to the component first and a test second
// — never a mock kept alive to imply coverage.
//
// WHY THIS RENDERS THE COMPONENT rather than a pure helper: vitest runs
// `environment: "node"`, but `react-dom/server` renders to a STRING there with
// no jsdom and no new dependency — so these assert the shipped component's
// actual output. Mirrors tests/teach-false-empty.test.ts.
//
// The store is mocked because the real hydrate is unreachable in a test AND on a
// local dev server (the planner falls back to lib/mock unless
// NEXT_PUBLIC_PLANNER_USE_SUPABASE=1). An empty `store.lessons` is faithful to
// both states that matter here: planner-store dispatches `{ doc: EMPTY_DOC }` on
// hydrate and leaves it empty after a throw, so a mid-flight hydrate and a
// FAILED one look identical to this component — an id that resolves to nothing.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    getLesson: (id: string) => store.lessons.find((l) => l.id === id),
  }),
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
  store.lessons = [];
});

// ── 1. The identity renders ─────────────────────────────────────────────────

describe("BoardHeadIdentity — a resolved lesson shows what is being taught", () => {
  it("renders the lesson title and its objective", () => {
    store.lessons = [LESSON];
    const html = render("m-12-0");
    expect(html).toContain("Fractions on a number line");
    expect(html).toContain("I can place a fraction on a number line.");
  });

  it("keeps the subject label alongside the lesson title", () => {
    // The header's ONLY content before this change — losing it would trade one
    // gap for another.
    store.lessons = [LESSON];
    expect(render("m-12-0")).toContain("Math");
  });

  it("falls back to the preview when the objective is empty", () => {
    store.lessons = [{ ...LESSON, objective: "" }];
    const html = render("m-12-0");
    expect(html).toContain("Number lines and thirds.");
    expect(html).not.toContain(NO_OBJECTIVE);
  });

  it("falls back to empty MARKUP too, not just an empty string", () => {
    // "<p></p>" is not an objective. Stripping before the fallback is what
    // stops a blank second line rendering as if it said something.
    store.lessons = [{ ...LESSON, objective: "<p></p>", preview: "" }];
    expect(render("m-12-0")).toContain(NO_OBJECTIVE);
  });

  it("renders standards as compact pills when the lesson is tagged", () => {
    store.lessons = [{ ...LESSON, standards: ["5.NF.B.3"] }];
    const html = render("m-12-0");
    expect(html).toContain("5.NF.B.3");
  });

  it("caps the pills and counts the overflow rather than flooding the header", () => {
    store.lessons = [
      { ...LESSON, standards: ["5.NF.B.3", "5.NF.B.4", "5.NF.A.1", "5.NF.A.2"] },
    ];
    const html = render("m-12-0");
    expect(html).toContain("5.NF.A.1");
    expect(html).not.toContain("5.NF.A.2");
    expect(html).toContain("+1");
  });
});

// ── 2. Rich text is stripped ────────────────────────────────────────────────

describe("BoardHeadIdentity — stored rich text never leaks into the projected header", () => {
  it("strips markup from the title, in the text node AND the title= attribute", () => {
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
    store.lessons = [
      { ...LESSON, objective: "<p>I can <strong>compare</strong> fractions.</p>" },
    ];
    const html = render("m-12-0");
    expect(html).toContain("I can compare fractions.");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("&lt;strong&gt;");
  });
});

// ── 3. An unresolved lesson is never described ──────────────────────────────
//
// The ONE input: whether `getLesson(activeLessonId)` returns a lesson. An id
// that resolves to nothing is what a mid-flight hydrate, a FAILED hydrate and a
// lesson deleted in another tab all look like from inside this component — it
// holds no hydration flag and cannot tell them apart, which is precisely why it
// states nothing about the lesson in any of them.

describe("BoardHeadIdentity — an unresolved lesson is never described", () => {
  it("says nothing definitive about a lesson id the document has no row for", () => {
    // The empty document IS the hydrate window (and the failed hydrate, and the
    // post-delete render). No objective is claimed about a lesson we do not
    // hold, so a backend outage can never surface as "No objective recorded."
    const html = render("m-12-0");
    // THE CONTROL, IN THE SAME EVALUATION. Both assertions below are absence
    // assertions, and an absence assertion cannot tell "the block correctly
    // withheld its copy" from "the component rendered nothing at all" — a
    // crash, a bad prop, a module that failed to import. The subject label is
    // the one thing this header renders unconditionally, so seeing it is what
    // licenses the two `not.toContain`s beneath it. Asserting it in a separate
    // `it` (which is where it used to live) does not count: a different render
    // is a different fact.
    expect(html, "control: the header rendered at all").toContain("Math");
    expect(html).not.toContain(NO_OBJECTIVE);
    expect(html).not.toContain("I can");
  });

  it("still names the subject, so the header is never blank", () => {
    // The anti-overshoot direction: withholding the lesson block must not
    // strand the header itself on nothing.
    expect(render("m-12-0")).toContain("Math");
  });

  it("shows the subject alone when there is no lesson id at all", () => {
    // Sandbox mode nulls activeLessonId (TeachWorkspace `enterSandbox`), as does
    // a standalone board open — a fact about WORKSPACE state, and the branch
    // that skips `getLesson` entirely rather than failing to find a row.
    const html = render(null);
    expect(html).toContain("Math");
    expect(html).not.toContain(NO_OBJECTIVE);
  });
});
