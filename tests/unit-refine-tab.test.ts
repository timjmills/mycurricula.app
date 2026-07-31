import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson } from "@/lib/types";

// Tests for the Unit workspace's REFINE tab — the editable table over every
// lesson in a unit (components/year-v2/unit-tabs/RefineTab.tsx), whose spec is
// the handoff prototype `PHUnits.Table`
// (Documents/Claude Design/7.21.26 Design Handoff Update/source-planning-hub/
// ph-units.jsx:912-996). There is no prose spec and no screenshot for Refine
// anywhere in the handoff, so the prototype IS the spec — and the prototype
// carries bugs that must NOT be ported. Two of them are pinned here.
//
// ── BUG 1: THE VACUOUS DURATIONS PASS ──────────────────────────────────────
// The prototype's completeness function is one chained ternary:
//
//   passDone = (k) => u.lessons.filter(l =>
//     k==='objective' ? !!l.objective.trim()
//   : k==='std'       ? !!l.std
//   : k==='flow'      ? !!l.flowName
//   : k==='assess'    ? l.assessment!=null
//   :                   true            // ← every other key, including 'dur'
//   ).length;
//
// There is no `dur` branch, so the Durations pass falls through to `true` for
// every lesson and the counter reads N/N — "all done!" — over a unit where not
// one duration has been recorded. A progress meter that can only say "finished"
// is worse than no meter, because it actively tells a teacher to stop working.
// This is the single hardest defect class in this repo to catch by eye (a green
// counter looks like success), which is why it is asserted as a THREE-POINT
// curve — 0/N, partial, N/N — and not just "not equal to total": a function
// hard-coded to return 0 would pass a one-sided check just as vacuously.
//
// ── BUG 2: THE FILL-DOWN THAT CLEARS ───────────────────────────────────────
// The prototype's `fillDown` copies `u.lessons[0]`'s value onto every lesson
// with no emptiness guard, so firing it while the first lesson's cell is blank
// silently CLEARS that column across the whole unit — no confirm, no undo.
// `refineFillPatch` returning null for an empty source is what makes the button
// inert instead of destructive, so both halves are pinned.
//
// ── THE HYDRATE WINDOW ─────────────────────────────────────────────────────
// The Supabase hydrate chain takes 11-16s and leaves an EMPTY document mounted
// the whole time (and after a throw). A table that renders "No lessons in this
// unit yet." off `lessons.length === 0` therefore tells a teacher their unit is
// empty for up to sixteen seconds, and tells them the same thing permanently
// when the backend is down — the defect class already pinned for /teach
// (tests/teach-false-empty.test.ts) and /daily (tests/day-empty-kind.test.ts).
// Both directions are asserted: the lie must be gone, AND a settled-and-really-
// empty unit must still be able to say so. A permanent skeleton would pass
// every "the lie is gone" check while stranding the tab loading forever.
//
// WHY THIS RENDERS THE COMPONENT: vitest runs `environment: "node"`, but
// `react-dom/server` renders to a STRING there with no jsdom and no new
// dependency — so these assert the shipped component's real output.
//
// The store is mocked because the tab reads `usePlanner()` for its write path,
// and because `pending` is unreachable both in a test and on a local dev server
// (the planner falls back to lib/mock unless NEXT_PUBLIC_PLANNER_USE_SUPABASE=1,
// which pins hydration to "ready" forever).

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  edits: [] as Array<{
    id: string;
    patch: Record<string, unknown>;
    coalesce?: { key: string; ts: number };
  }>,
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    editLesson: (
      id: string,
      patch: Record<string, unknown>,
      coalesce?: { key: string; ts: number },
    ) => {
      store.edits.push({ id, patch, coalesce });
    },
    describeStandard: (code: string) => code,
    mergeStandards: () => {},
    getSections: () => [],
  }),
  usePlannerDataState: () => store.state,
}));

const { RefineTab } = await import("@/components/year-v2/unit-tabs/RefineTab");
const {
  REFINE_FIELDS,
  REFINE_PASSES,
  refineCompleteness,
  refineFillPatch,
  refinePassProgress,
} = await import("@/lib/unit-refine");

// ── Fixtures ────────────────────────────────────────────────────────────────

function lesson(over: Partial<Lesson> & { id: string }): Lesson {
  return {
    subject: "math",
    unit: "u-m3",
    title: "Untitled",
    objective: "",
    preview: "",
    directions: "",
    notes: "",
    resources: [],
    standards: [],
    week: 12,
    day: 0,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: null,
    status: "planned",
    commentCount: 0,
    unreadComments: 0,
    tasks: [],
    ...over,
  } as unknown as Lesson;
}

/** A deliberately MIXED unit: one fully-planned lesson, one bare one. A unit
 *  where every lesson is complete (or every lesson is empty) cannot tell a real
 *  counter from a hard-coded one. */
const PLANNED = lesson({
  id: "m-12-0",
  title: "Fractions on a number line",
  objective: "I can place a fraction on a number line.",
  standards: ["5.NF.A.1"],
  durationMinutes: 45,
  assessment: { kind: "formative", title: "Exit ticket" },
  day: 0,
});

const BARE = lesson({
  id: "m-12-1",
  title: "Comparing fractions",
  day: 1,
});

const LESSONS = [PLANNED, BARE];

/** The loading affordance <Skeleton> renders — also the marker that a fix has
 *  not overshot into stranding a settled surface on a permanent skeleton. */
const LOADING = 'aria-busy="true"';
const LOADING_LABEL = "Loading your plan";
// Matched WITHOUT the curly apostrophe mid-word: an ASCII-quoted matcher for
// "Couldn't" silently never fires, which is exactly how an earlier live
// verification of this defect class returned a vacuous "not reproduced".
const ERROR_COPY = "load your plan";
const EMPTY_COPY = "No lessons in this unit yet.";

/** Render the tab. Data readiness is driven through the MOCKED STORE, not a
 *  prop: the tab's empty branch is a <PlannerEmpty>, which reads
 *  `usePlannerDataState()` itself. Setting `store.state` is therefore the only
 *  way to exercise the hydrate window — and it exercises the real gate rather
 *  than a prop a future refactor could stop threading. */
function render(lessons: readonly Lesson[]): string {
  return renderToStaticMarkup(
    createElement(RefineTab, { lessons, onPlan: () => {} }),
  );
}

beforeEach(() => {
  store.state = "settled";
  store.edits = [];
});

// ── The columns ─────────────────────────────────────────────────────────────

describe("RefineTab — the table a teacher actually gets", () => {
  it("renders every column of the handoff table", () => {
    const html = render(LESSONS);
    // The ordinal column's header is visually empty; its accessible name is
    // what makes the table legible to a screen reader, so it is asserted as a
    // column like any other.
    for (const heading of [
      "Lesson number",
      "Lesson",
      "Objective",
      "Standards",
      "Min",
      "Assessment",
      "Res",
      "Planned",
    ]) {
      expect(html).toContain(heading);
    }
  });

  it("gives every editable cell an accessible name that says WHICH lesson", () => {
    // Nine identical "Objective" inputs in a column are indistinguishable to a
    // screen-reader user without the row in the name.
    const html = render(LESSONS);
    expect(html).toContain("Objective, lesson 1");
    expect(html).toContain("Minutes, lesson 2");
    expect(html).toContain("Assessment, lesson 2");
  });

  it("shows each lesson's real objective, duration, standard and assessment", () => {
    const html = render(LESSONS);
    expect(html).toContain("I can place a fraction on a number line.");
    expect(html).toContain('value="45"');
    expect(html).toContain("5.NF.A.1");
    // React SSR marks the matching <option> selected, so this proves the select
    // is bound to store truth rather than defaulting to the first option.
    expect(html).toMatch(/<option value="formative" selected/);
  });

  it("renders one row per lesson, including the empty one", () => {
    const html = render(LESSONS);
    expect(html).toContain("Fractions on a number line");
    expect(html).toContain("Comparing fractions");
  });

  it("offers a fill-down only on the fields where one value for all is a real intent", () => {
    // Title and objective must NOT be fillable — twelve identical objectives is
    // never the intent, and the button would sit one mis-click from the content
    // that took the longest to write.
    const html = render(LESSONS);
    expect(html).toContain("Copy the first lesson’s duration");
    expect(html).toContain("Copy the first lesson’s standards");
    expect(html).not.toContain("Copy the first lesson’s objective");
    expect(html).not.toContain("Copy the first lesson’s title");
  });
});

// ── The hydrate window ──────────────────────────────────────────────────────

describe("RefineTab — an empty unit is never called empty mid-hydrate", () => {
  it("does not claim the unit is empty while the hydrate is in flight", () => {
    store.state = "pending";
    expect(render([])).not.toContain(EMPTY_COPY);
  });

  it("shows a loading affordance instead, labelled for screen readers", () => {
    // Without the label a screen-reader user hears silence where the lie was —
    // the same falsehood moved into the accessibility layer.
    store.state = "pending";
    const html = render([]);
    expect(html).toContain(LOADING);
    expect(html).toContain(LOADING_LABEL);
  });

  it("renders no table chrome while pending — a header row over nothing is a claim too", () => {
    store.state = "pending";
    const html = render([]);
    expect(html).not.toContain("Assessment");
    expect(html).not.toContain("Planned");
  });

  it("does not claim the unit is empty when the hydrate FAILED", () => {
    store.state = "error";
    const html = render([]);
    expect(html).not.toContain(EMPTY_COPY);
    expect(html).toContain(ERROR_COPY);
  });
});

describe("RefineTab — a settled store still answers honestly", () => {
  it("states the emptiness once settled and genuinely empty", () => {
    store.state = "settled";
    const html = render([]);
    expect(html).toContain(EMPTY_COPY);
    expect(html).not.toContain(LOADING);
  });

  it("renders the table the moment lessons land, even if the store still reports pending", () => {
    // The anti-overshoot check: gating the empty message must not gate the
    // TABLE. A permanent skeleton passes every "the lie is gone" assertion
    // while stranding the tab loading forever — a worse bug than the one being
    // fixed.
    store.state = "pending";
    const html = render(LESSONS);
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(LOADING);
  });
});

// ── Bug 1: the Durations pass must not be vacuous ───────────────────────────

describe("the Durations pass counts real durations (the prototype's missing branch)", () => {
  it("reports partial progress on a unit where only some lessons have a duration", () => {
    const p = refinePassProgress(LESSONS, "duration");
    expect(p.total).toBe(2);
    // The prototype's fall-through returned `true` for every lesson here.
    expect(p.done).toBe(1);
    expect(p.done).toBeLessThan(p.total);
  });

  it("reports 0 of N when NOT ONE lesson has a duration", () => {
    const p = refinePassProgress([BARE, lesson({ id: "x" })], "duration");
    expect(p).toEqual({ done: 0, total: 2 });
  });

  it("reports N of N only when every lesson really has one", () => {
    // The other half of the curve: a counter hard-coded to 0 would satisfy the
    // two assertions above just as vacuously as `true` satisfied the prototype.
    const p = refinePassProgress(
      [PLANNED, lesson({ id: "y", durationMinutes: 30 })],
      "duration",
    );
    expect(p).toEqual({ done: 2, total: 2 });
  });

  it("does not count a persisted 0 as a planned duration", () => {
    const p = refinePassProgress([lesson({ id: "z", durationMinutes: 0 })], "duration");
    expect(p.done).toBe(0);
  });

  it("counts every pass the tab offers against real lesson content", () => {
    // Guards the whole family, not just `dur`: any pass that always returns
    // `total` is the same defect wearing a different key.
    const bareOnly = [BARE];
    for (const pass of REFINE_PASSES) {
      expect(refinePassProgress(bareOnly, pass.key).done).toBe(0);
    }
  });
});

describe("per-lesson completeness backs the Planned dots", () => {
  it("marks a fully-planned lesson's fields set and a bare one's unset", () => {
    const full = refineCompleteness(PLANNED);
    expect(full.objective).toBe(true);
    expect(full.standards).toBe(true);
    expect(full.duration).toBe(true);
    expect(full.assessment).toBe(true);

    const bare = refineCompleteness(BARE);
    expect(bare.objective).toBe(false);
    expect(bare.standards).toBe(false);
    expect(bare.duration).toBe(false);
    expect(bare.assessment).toBe(false);
    expect(bare.filled).toBe(0);
    expect(bare.total).toBe(REFINE_FIELDS.length);
  });

  it("reads resources through the host's section-aware predicate", () => {
    // `Lesson.resources` is only half the truth — the composer attaches to a
    // SECTION whenever one is the destination, and sections are not on the
    // Lesson shape. Without the predicate a lesson would read "no resources"
    // one tab away from a Resources tab listing them.
    expect(refineCompleteness(BARE).resources).toBe(false);
    expect(
      refineCompleteness(BARE, { hasResources: () => true }).resources,
    ).toBe(true);
  });
});

// ── Bug 2: fill-down must never clear a column ──────────────────────────────

describe("fill-down copies a value down — and refuses to clear one", () => {
  it("builds the patch from the FIRST lesson's value", () => {
    expect(refineFillPatch(LESSONS, "duration")).toEqual({
      durationMinutes: 45,
    });
  });

  it("returns null when the source cell is empty, so the button cannot blank the column", () => {
    // The prototype has no such guard: firing it with a blank first cell wipes
    // the column across the unit, with no confirm and no undo.
    const sourceless = [BARE, PLANNED];
    expect(refineFillPatch(sourceless, "duration")).toBeNull();
    expect(refineFillPatch(sourceless, "standards")).toBeNull();
    expect(refineFillPatch(sourceless, "assessment")).toBeNull();
  });

  it("returns null for an empty unit rather than throwing", () => {
    expect(refineFillPatch([], "duration")).toBeNull();
  });

  it("disables the fill-down button when there is nothing to copy", () => {
    // The guard has to be visible, not just internal — an enabled button that
    // does nothing teaches a teacher the feature is broken.
    const html = render([BARE, PLANNED]);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
  });
});

// ── RICH TEXT: the silent data-loss path ────────────────────────────────────
//
// `Lesson.title` and `Lesson.objective` MAY CONTAIN HTML (lib/types.ts:330).
// The title is authored through <RichTextEditor singleLine> in
// components/daily/LessonDetail.tsx:671; the objective the same way in
// LessonWorkspace.tsx:259 and PlanningTabs.tsx:661 (storing `I can ${html}`).
//
// The tab first shipped binding `value={l.objective}` into a plain <input> and
// writing `e.target.value` straight back. An <input> cannot hold HTML, so a
// bolded objective rendered as the literal `I can <em>place</em> a fraction…`
// and the FIRST KEYSTROKE committed that literal — markup destroyed, silently,
// no error, no undo prompt.
//
// IT COULD NOT BE CAUGHT BY RUNNING THE APP LOCALLY. Every fixture in this very
// file is plain text, and so is lib/mock — so the bug is invisible to a local
// dev server and to every other test here. That is the same shape as the
// computed-FK bug that took lesson creation down 100% on production: a premise
// true in fixtures, false against real rows. Hence a test that MANUFACTURES the
// markup rather than waiting to meet it.
//
// The fix is deliberately conservative: plain values stay fully editable (the
// common case, and the whole point of the tab), and a value carrying markup goes
// read-only showing the stripped text. Note what is NOT done — it never strips
// on WRITE, which would lose the markup just as permanently while looking fixed.

const RICH = lesson({
  id: "m-12-2",
  title: "<p>Comparing <em>unlike</em> denominators</p>",
  objective: "I can compare fractions with <strong>unlike</strong> denominators.",
  day: 2,
});

describe("RefineTab — rich text is never flattened by a table cell", () => {
  it("shows the readable text, not the raw markup", () => {
    const html = render([RICH]);
    // The teacher sees words, not tags.
    expect(html).toContain("Comparing unlike denominators");
    expect(html).toContain(
      "I can compare fractions with unlike denominators.",
    );
  });

  it("never leaks tags into the cell, escaped or otherwise", () => {
    const html = render([RICH]);
    // Two failure shapes, and BOTH must be absent. A live `<em>` would mean the
    // markup reached the DOM as markup; an escaped `&lt;em&gt;` is the shape the
    // original bug produced — React escaping the literal the teacher was about
    // to overwrite. Asserting only one of these would pass over the real bug.
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("&lt;em&gt;");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("&lt;strong&gt;");
  });

  it("makes the rich cells read-only rather than silently destructive", () => {
    const html = render([RICH]);
    expect(html).toContain("readonly");
    expect(html).toContain('aria-readonly="true"');
    // And it says WHY — an inert input with no explanation reads as a bug.
    expect(html).toContain("Lesson Planner");
  });

  it("leaves plain lessons fully editable — the fix must not overshoot", () => {
    // If the guard were too broad it would freeze the whole column and quietly
    // remove the feature. PLANNED carries no markup, so both its cells stay live.
    const html = render([PLANNED]);
    expect(html).toContain("Fractions on a number line");
    expect(html).toContain("I can place a fraction on a number line.");
    expect(html).not.toContain('aria-readonly="true"');
  });
});
