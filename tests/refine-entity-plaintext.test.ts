// C1 — a plain sentence carrying an ENTITY must stay editable in Refine.
//
// The shipped guard was `stripHtml(value) === value.trim()`, which reads the
// `stripHtml(escapeHtml(t)) === t.trim()` contract (lib/html-text.ts:11)
// backwards. `stripHtml` does two things and only the first is about markup: it
// strips tags AND THEN DECODES ENTITIES. So the equality also failed for every
// plain value containing an entity, and those cells rendered read-only with the
// explanation "formatted text, read-only here" — false, and permanent. None of
// the three fixtures below are exotic:
//
//   • `escapeHtml` emits `&amp;` / `&#39;` / `&quot;` BY DESIGN (html-text.ts:33)
//   • every contenteditable in the app serialises a typed "&" as `&amp;` and
//     consecutive spaces as `&nbsp;`; `sanitizeHtml` re-serialises the same way
//   • a bare `<` … `>` pair in prose is stripped as though it were a tag
//
// Fixed in d908049 by testing for a TAG directly. This file is the regression
// net under that fix.
//
// ── WHY THIS FILE EXISTS ALONGSIDE tests/unit-refine.test.ts ────────────────
// That file already covers these three strings (`:915`, committed). It is NOT
// duplicated here for its own sake — it is re-stated with the control it is
// missing. Its loop asserts only:
//
//     expect(html).not.toContain('aria-readonly="true"')
//
// which is a bare absence assertion: if `render()` returned "" or the row never
// reached the markup, it passes having tested nothing. Its own neighbour at
// `:903` carries exactly that control and explains why. Every absence assertion
// below is therefore paired with a positive control, and the whole block is
// backed by a harness proof (the last test) showing this render really can emit
// the attribute the others assert is absent.
//
// Kept separate rather than appended because tests/unit-refine.test.ts was
// live-modified by the Flow-column lane at authoring time (2026-08-01).

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson } from "@/lib/types";
import type { RefineTabProps } from "@/components/year-v2/unit-tabs";

const store = vi.hoisted(() => ({ state: "settled" as string }));

// Same no-op write path as tests/unit-refine.test.ts, for the same reason: a
// static render fires no events, so nothing can ever reach `editLesson`. These
// assertions are all about RENDERED output, which is what a static render is
// actually good for.
vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    editLesson: () => {},
    describeStandard: (code: string) => code,
    mergeStandards: () => {},
    getSections: () => [],
    setSections: () => {},
  }),
  usePlannerDataState: () => store.state,
}));

vi.mock("@/components/composer", () => ({
  useComposerOptional: () => null,
}));

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    subject: "math",
    unit: "u1",
    title: "Fractions on a number line",
    objective: "",
    directions: "",
    notes: "",
    resources: [],
    standards: [],
    week: 1,
    day: 0,
    isPersonal: false,
    status: "not_done",
    reasonNotDone: "",
    modified: false,
    moved: "none",
    archived: false,
    ...over,
  } as unknown as Lesson;
}

async function render(lessons: Lesson[]): Promise<string> {
  const mod = (await import("@/components/year-v2/unit-tabs")) as unknown as {
    RefineTab: ComponentType<RefineTabProps>;
  };
  return renderToStaticMarkup(
    createElement(mod.RefineTab, { lessons, onPlan: () => {} }),
  );
}

/** The read-only marker the guard emits, and the label proving the title cell
 *  reached the markup at all (RefineTab.tsx:761 — `Title, lesson ${i + 1}`). */
const READ_ONLY = 'aria-readonly="true"';
const TITLE_CELL = 'aria-label="Title, lesson 1"';

/** Plain text that the OLD predicate misread as markup. */
const PLAIN_WITH_ENTITY = [
  ["an escaped ampersand", "Fractions &amp; decimals"],
  ["a non-breaking space", "a&nbsp;b"],
  ["bare angle brackets in prose", "if a < b > c then"],
] as const;

/** Values that really do carry a tag and MUST stay locked. */
const REALLY_RICH = ["<b>bold</b>", "<p>x</p>", "a<br/>b", "x</p>"] as const;

beforeAll(async () => {
  await import("@/components/year-v2/unit-tabs");
}, 120_000);

beforeEach(() => {
  store.state = "settled";
});

describe("Refine — an entity is plain text, not formatting (C1)", () => {
  it.each(PLAIN_WITH_ENTITY)(
    "keeps a title carrying %s editable",
    async (_why, title) => {
      const html = await render([lesson({ id: "a", title })]);
      // CONTROL FIRST. `not.toContain` passes vacuously against an empty
      // string, so prove the title cell rendered before trusting its absence.
      expect(html, `row never rendered: ${title}`).toContain(TITLE_CELL);
      expect(html, `plain title locked read-only: ${title}`).not.toContain(
        READ_ONLY,
      );
    },
  );

  it.each(REALLY_RICH)("still locks %s, which really is markup", async (title) => {
    // The anti-overshoot pair. Loosening the predicate must not turn it into
    // "everything is editable" — that restores the original data-loss bug,
    // where a plain <input> flattens stored markup on the first keystroke.
    const html = await render([lesson({ id: "a", title })]);
    expect(html, `rich title left editable: ${title}`).toContain(READ_ONLY);
  });

  it("CONTROL: this harness really can emit the read-only marker", async () => {
    // THE PROOF THE ABSENCE ASSERTIONS DEPEND ON, and the check the committed
    // version of this block does not have. Every "stays editable" test above is
    // `not.toContain(READ_ONLY)` — which would pass for all three fixtures if
    // this render simply never emitted that attribute for ANY input (a changed
    // attribute name, a store mock that strands the tab in `pending`, a
    // component that stopped rendering rows). Feeding a value that MUST lock
    // and seeing the marker appear is what makes the absences mean something.
    const rich = await render([
      lesson({ id: "a", title: "Fractions <strong>review</strong>" }),
    ]);
    expect(rich).toContain(READ_ONLY);

    // …and the same render emits an editable title cell for plain text, so both
    // states are reachable through this harness — not just one.
    const plain = await render([lesson({ id: "a", title: "Fractions" })]);
    expect(plain).toContain(TITLE_CELL);
    expect(plain).not.toContain(READ_ONLY);
  });

  it("documents the OLD predicate misclassifying all three fixtures", async () => {
    // WHY THE MUTATION IS EXPECTED TO GO RED, proved against the REAL
    // `stripHtml` rather than asserted from memory. The shipped guard was
    // `stripHtml(v) === v.trim()`; this shows that equality is false for every
    // fixture above — so restoring it locks all three cells and the three
    // "keeps a title … editable" tests fail together.
    //
    // Independent of RefineTab, so it stays GREEN under that mutation: it
    // describes the mechanism, it does not test the component. If it ever goes
    // red, `stripHtml` stopped decoding entities and this whole file's premise
    // needs re-reading.
    const { stripHtml } = await import("@/lib/html-text");
    const oldPredicate = (v: string): boolean => stripHtml(v) === v.trim();

    for (const [why, title] of PLAIN_WITH_ENTITY) {
      expect(oldPredicate(title), `old predicate accepted ${why}`).toBe(false);
    }
    // And the string the old predicate DID get right — the one member of the
    // family that passed, which is what made the broken guard look correct.
    expect(oldPredicate("Fractions & decimals: 1 < 2")).toBe(true);
  });

  it("CONTROL: the fixtures reach the predicate as written, un-decoded", async () => {
    // A subtler fail-open: if the harness or JSX decoded `&amp;` to `&` before
    // the guard saw it, the entity fixtures would be testing a string the bug
    // never applied to. React escapes "&" in an attribute, so the stored entity
    // surfaces as `&amp;amp;` — assert the raw sequence survived to the markup.
    const html = await render([
      lesson({ id: "a", title: "Fractions &amp; decimals" }),
    ]);
    expect(html).toContain("Fractions &amp;amp; decimals");
  });
});
