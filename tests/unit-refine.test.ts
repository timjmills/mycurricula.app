import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  REFINE_PASSES,
  refineCompleteness,
  refineFieldSet,
  refineFillPatch,
  refinePassProgress,
} from "@/lib/unit-refine";
import type { Lesson } from "@/lib/types";
import type { RefineTabProps } from "@/components/year-v2/unit-tabs";

// Tests for the REFINE tab — the unit workspace's planning spreadsheet, built in
// Wave 5 to close the 7.21 handoff's one genuinely unowned tab
// (`ph-workspace.jsx:272` lists it; B3 excluded it; nobody picked it up).
//
// Two halves, both of which FAIL before this wave (neither the module nor the
// component existed):
//
//   1. The pure derivations in lib/unit-refine.ts. The load-bearing ones are the
//      guards, not the arithmetic: a fill-down that fires on an empty source
//      CLEARS a whole column, and a completeness predicate that disagrees with
//      the Insights drawer makes two surfaces in the same modal contradict each
//      other about the same lesson.
//
//   2. The rendered component's readiness contract. Localhost runs the MOCK
//      planner path, where `usePlannerDataState` is pinned to "settled" forever
//      — so the pending/error states are unreachable in a browser and can only
//      be proven deterministically. `react-dom/server` renders to a STRING under
//      `environment: "node"` with no jsdom and no new dependency, so these
//      assert against the SHIPPED component's real output (the same technique as
//      tests/hub-browse-empty.test.ts).

// ── Store mock ───────────────────────────────────────────────────────────────
// `pending` always comes with an empty document — planner-store dispatches
// `{ doc: EMPTY_DOC, hydration: "loading" }` on hydrate — so the mock is
// faithful to the real pending shape.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  edits: [] as Array<{ id: string; patch: Partial<Lesson>; key?: string }>,
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    editLesson: (
      id: string,
      patch: Partial<Lesson>,
      coalesce?: { key: string; ts: number },
    ) => {
      store.edits.push({ id, patch, key: coalesce?.key });
    },
    describeStandard: (code: string) => code,
    mergeStandards: () => {},
  }),
  usePlannerDataState: () => store.state,
}));

// The composer is a provider-backed singleton with no provider in a static
// render; the component already degrades via `useComposerOptional`, and this
// pins the degraded path rather than the happy one.
vi.mock("@/components/composer", () => ({
  useComposerOptional: () => null,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    subject: "math",
    unit: "u1",
    title: "Fractions on a number line",
    objective: "",
    preview: "",
    directions: "",
    notes: "",
    resources: [],
    standards: [],
    week: 1,
    day: 0,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: "none",
    status: "not_done",
    commentCount: 0,
    unreadComments: 0,
    tasks: [],
    archived: false,
    ...over,
  } as unknown as Lesson;
}

// ── 1. Fill-down: the guard that stops it clearing a column ──────────────────

describe("refineFillPatch — never turns a copy into a wipe", () => {
  // THE bug this guard exists for. The handoff's `fillDown` (ph-units.jsx:921)
  // copies `first.dur` down unconditionally, so clicking it when the first
  // lesson has no duration writes `null` over every OTHER lesson's duration.
  // Same for standards and assessment. One click, whole column gone, and the
  // teacher's only clue is the values vanishing.
  it("returns null when the source lesson has no duration", () => {
    expect(refineFillPatch([lesson(), lesson({ id: "l2" })], "duration")).toBe(
      null,
    );
  });

  it("returns null when the source lesson has no standards", () => {
    expect(refineFillPatch([lesson(), lesson({ id: "l2" })], "standards")).toBe(
      null,
    );
  });

  it("returns null when the source lesson has no assessment", () => {
    expect(
      refineFillPatch([lesson(), lesson({ id: "l2" })], "assessment"),
    ).toBe(null);
  });

  it("returns null for an empty unit rather than throwing", () => {
    expect(refineFillPatch([], "duration")).toBe(null);
  });

  it("copies a real duration", () => {
    expect(
      refineFillPatch([lesson({ durationMinutes: 45 }), lesson({ id: "l2" })], "duration"),
    ).toEqual({ durationMinutes: 45 });
  });

  it("treats a zero duration as nothing to copy", () => {
    // A persisted 0 is not a planned duration — copying it down would write a
    // meaningless value over eleven real ones.
    expect(refineFillPatch([lesson({ durationMinutes: 0 })], "duration")).toBe(
      null,
    );
  });
});

describe("refineFillPatch — standards carry their identity or none at all", () => {
  // Codes are unique only PER framework (AERO and WIDA-ELD both define "S1"),
  // so `standardIds` is the real identity and is INDEX-ALIGNED with `standards`.
  // Copying codes while leaving the target's old ids in place would point the
  // new codes at a different catalog row entirely.
  it("copies codes and their index-aligned uuids together", () => {
    const patch = refineFillPatch(
      [lesson({ standards: ["5.NF.1", "5.NF.2"], standardIds: ["a", "b"] })],
      "standards",
    );
    expect(patch).toEqual({
      standards: ["5.NF.1", "5.NF.2"],
      standardIds: ["a", "b"],
    });
  });

  it("clears the id list when the source has no uuids, never omits it", () => {
    // Omitting the key would leave the TARGET's stale ids aligned to codes that
    // no longer exist. An explicit empty array degrades identity to the safe
    // `code#index` fallback instead.
    const patch = refineFillPatch(
      [lesson({ standards: ["5.NF.1"] })],
      "standards",
    );
    expect(patch).toEqual({ standards: ["5.NF.1"], standardIds: [] });
  });

  it("copies the standards array by value, not by reference", () => {
    // A shared array reference would make a later edit to one lesson mutate
    // every lesson the fill touched.
    const source = lesson({ standards: ["5.NF.1"] });
    const patch = refineFillPatch([source], "standards");
    expect(patch?.standards).not.toBe(source.standards);
  });

  it("copies the assessment object by value, not by reference", () => {
    const source = lesson({ assessment: { kind: "formative", title: "Exit" } });
    const patch = refineFillPatch([source], "assessment");
    expect(patch?.assessment).toEqual({ kind: "formative", title: "Exit" });
    expect(patch?.assessment).not.toBe(source.assessment);
  });
});

// ── 2. Completeness agrees with the Insights drawer ──────────────────────────

describe("refineFieldSet — the same truth the drawer reports", () => {
  it("counts an assessment with NO kind as present", () => {
    // The drawer keeps an "unclassified" bucket precisely so a two-way
    // formative/summative split can't drop a real assessment
    // (drawer/AssessmentsPanel.tsx). Refine must agree, or the same lesson reads
    // "has an assessment" in the drawer and "missing" one tab away.
    expect(
      refineFieldSet(lesson({ assessment: { title: "Exit ticket" } }), "assessment"),
    ).toBe(true);
  });

  it("does not count an absent assessment", () => {
    expect(refineFieldSet(lesson(), "assessment")).toBe(false);
  });

  it("treats a whitespace-only objective as unset", () => {
    expect(refineFieldSet(lesson({ objective: "   " }), "objective")).toBe(false);
  });

  it("treats a zero duration as unset", () => {
    expect(refineFieldSet(lesson({ durationMinutes: 0 }), "duration")).toBe(false);
  });

  it("uses the injected section-aware resource predicate", () => {
    // `Lesson.resources` is only half the truth: the composer attaches to a
    // SECTION whenever a section is the destination, and sections are not on the
    // Lesson shape. Without the injected predicate this reads "no resources" for
    // a lesson whose Resources tab, in the same modal, lists them — the exact
    // disagreement `unitGaps` documents.
    const l = lesson();
    expect(refineFieldSet(l, "resources")).toBe(false);
    expect(refineFieldSet(l, "resources", { hasResources: () => true })).toBe(
      true,
    );
  });
});

describe("refineCompleteness", () => {
  it("rolls the five fields up without hard-coding the total", () => {
    const c = refineCompleteness(
      lesson({ objective: "I can add fractions", durationMinutes: 45 }),
    );
    expect(c.filled).toBe(2);
    expect(c.total).toBe(5);
    expect(c.objective).toBe(true);
    expect(c.standards).toBe(false);
  });
});

describe("refinePassProgress", () => {
  it("counts taught lessons too, so the counter matches the visible rows", () => {
    // Unlike `unitGaps` (which skips taught lessons because their planning is
    // history), Refine is a table the teacher edits row by row. A counter that
    // excluded rows would read "1 of 1 done" above a table with two empty cells.
    const lessons = [
      lesson({ id: "a", objective: "I can…", status: "done" }),
      lesson({ id: "b" }),
      lesson({ id: "c" }),
    ];
    expect(refinePassProgress(lessons, "objective")).toEqual({
      done: 1,
      total: 3,
    });
  });

  it("offers no Flow pass — the field does not exist in this app", () => {
    // The handoff's sixth pass writes a `flowName` string we have no column for;
    // its real equivalent is the lesson's SECTION list, a document rather than a
    // pickable value. Pinned so a later "conformance" pass cannot add a select
    // that silently writes nothing.
    expect(REFINE_PASSES.map((p) => p.key)).toEqual([
      "objective",
      "standards",
      "duration",
      "assessment",
    ]);
  });
});

// ── 3. The rendered tab's readiness contract ─────────────────────────────────

const LOADING = 'role="status" aria-busy="true"';
const ERROR_COPY = "Couldn’t load your plan";
const VACANT = "No lessons in this unit yet.";

async function render(lessons: Lesson[]): Promise<string> {
  const mod = (await import("@/components/year-v2/unit-tabs")) as unknown as {
    RefineTab: ComponentType<RefineTabProps>;
  };
  return renderToStaticMarkup(
    createElement(mod.RefineTab, { lessons, onPlan: () => {} }),
  );
}

// Pay the component graph's cold transform ONCE, outside any measured test
// window (the same note as tests/hub-browse-empty.test.ts).
beforeAll(async () => {
  await import("@/components/year-v2/unit-tabs");
}, 120_000);

beforeEach(() => {
  store.state = "settled";
  store.edits = [];
});

describe("RefineTab — never claims a unit is empty before it knows", () => {
  it("shows a loading affordance while the hydrate is in flight", async () => {
    store.state = "pending";
    const html = await render([]);
    expect(html).not.toContain(VACANT);
    expect(html).toContain(LOADING);
    // Without the label a screen-reader user hears silence where the lie was —
    // the same falsehood moved into the accessibility layer.
    expect(html).toContain("Loading your plan");
  });

  it("reports a failed hydrate rather than an empty unit", async () => {
    store.state = "error";
    const html = await render([]);
    expect(html).not.toContain(VACANT);
    expect(html).toContain(ERROR_COPY);
  });

  it("states the unit is empty once settled and genuinely empty", async () => {
    // The failure mode opposite the one being fixed, and the likelier mistake: a
    // permanent skeleton passes every "the lie is gone" test while stranding the
    // tab loading forever.
    store.state = "settled";
    const html = await render([]);
    expect(html).toContain(VACANT);
    expect(html).not.toContain(LOADING);
  });
});

describe("RefineTab — the table itself", () => {
  it("renders one editable row per lesson", async () => {
    const html = await render([
      lesson({ id: "a", title: "Numerators" }),
      lesson({ id: "b", title: "Denominators" }),
    ]);
    expect(html).toContain("Numerators");
    expect(html).toContain("Denominators");
    expect(html).not.toContain(VACANT);
    expect(html).not.toContain(LOADING);
    // Every row's cells are labelled — at default zoom the handoff's table
    // renders unnamed controls, which is finding B7 of the plan-tab audit.
    expect(html).toContain('aria-label="Objective, lesson 1"');
    expect(html).toContain('aria-label="Minutes, lesson 2"');
  });

  it("disables a fill-down that has nothing to copy", async () => {
    // The UI half of the wipe guard: the button cannot even be clicked when the
    // source cell is empty, so the null-patch path is a backstop, not the only
    // defence.
    const html = await render([lesson({ id: "a" })]);
    const durationHeader = html.slice(html.indexOf("Min"));
    expect(durationHeader).toContain("disabled");
  });

  it("enables a fill-down once the first lesson has a value", async () => {
    const html = await render([
      lesson({ id: "a", durationMinutes: 45 }),
      lesson({ id: "b" }),
    ]);
    expect(html).toContain(
      "Copy the first lesson’s duration to every lesson in this unit",
    );
  });

  it("offers a pass for each field a teacher can fill down a column", async () => {
    const html = await render([lesson()]);
    for (const p of REFINE_PASSES) expect(html).toContain(p.label);
    expect(html).toContain("No pass");
  });

  it("shows the standards a lesson already carries, not a bare count", async () => {
    const html = await render([
      lesson({ id: "a", standards: ["5.NF.1", "5.NF.2"] }),
    ]);
    expect(html).toContain("5.NF.1");
    expect(html).toContain("+1");
  });
});

// ── 4. Rich text is never flattened by a table cell ──────────────────────────
//
// `Lesson.title` and `Lesson.objective` are RICH TEXT: the lesson workspace
// edits the objective through a contenteditable (`objectiveHtml`,
// LessonWorkspace.tsx:172) and PlanningTabs stores `I can ${html}`. An `<input>`
// cannot hold HTML, so binding `value={l.objective}` and writing
// `e.target.value` back renders the literal tags and DESTROYS the markup on the
// first keystroke — silently, with no error and no undo prompt.
//
// These tests exist because the defect is INVISIBLE to every other check:
// the mock fixtures carry no markup, so the local dev server, the live probe and
// every other test in this file all look correct while the bug sits there. Only
// a fixture that actually contains a tag can see it.

describe("RefineTab — a cell refuses to flatten formatting it cannot hold", () => {
  const RICH = "I can <em>compare</em> two fractions";

  it("renders a formatted objective read-only, not as an editable input", async () => {
    const html = await render([lesson({ id: "a", objective: RICH })]);
    expect(html).toContain("readonly");
    expect(html).toContain('aria-readonly="true"');
  });

  it("shows the stripped text, never the raw tags", async () => {
    const html = await render([lesson({ id: "a", objective: RICH })]);
    expect(html).toContain("I can compare two fractions");
    // The literal markup must not reach the teacher as visible text. React
    // escapes `<em>` to `&lt;em&gt;` in an attribute, so THAT is the shape a
    // regression would take — assert against the escaped form, not the raw one,
    // or the check silently never fires.
    expect(html).not.toContain("&lt;em&gt;");
  });

  it("says WHY the cell is read-only rather than looking broken", async () => {
    // A dead input with no explanation reads as a bug. CLAUDE.md §4 requires a
    // disabled control to explain itself.
    const html = await render([lesson({ id: "a", objective: RICH })]);
    expect(html).toContain("formatted text, read-only here");
    expect(html).toContain("Open the lesson in the Lesson Planner");
  });

  it("keeps a plain-text objective fully editable", async () => {
    // The anti-overshoot check, and the one that matters most: if `isPlainText`
    // were ever inverted or over-eager, EVERY cell would go read-only and the
    // tab would lose its entire purpose while still passing the three tests
    // above.
    const html = await render([
      lesson({ id: "a", objective: "I can compare two fractions" }),
    ]);
    expect(html).toContain('aria-label="Objective, lesson 1"');
    expect(html).not.toContain('aria-readonly="true"');
  });

  it("treats a title carrying markup the same way", async () => {
    const html = await render([
      lesson({ id: "a", title: "Fractions <strong>review</strong>" }),
    ]);
    expect(html).toContain("Fractions review");
    expect(html).toContain('aria-readonly="true"');
  });

  it("does not mistake a bare ampersand or angle bracket for markup", async () => {
    // `stripHtml` decodes entities, so a value containing a LITERAL "<" or "&"
    // must still compare equal to itself after stripping — otherwise a lesson
    // titled "Fractions & decimals" would go read-only for no reason.
    const html = await render([
      lesson({ id: "a", title: "Fractions & decimals: 1 < 2" }),
    ]);
    expect(html).not.toContain('aria-readonly="true"');
  });
});
