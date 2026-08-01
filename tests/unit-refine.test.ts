import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  REFINE_ENTER_COLUMNS,
  REFINE_FLOW_GROUPS,
  REFINE_PASSES,
  refineCompleteness,
  refineFieldSet,
  refineFillCoalesceKey,
  refineFillDescriptors,
  refineFillPatch,
  refineFlowApply,
  refineFlowFill,
  refineFlowFillMessage,
  refineFlowOf,
  refineFlowSetWrite,
  refineFlowUndoable,
  refinePassBanner,
  refinePassProgress,
} from "@/lib/unit-refine";
import {
  instantiateSections,
  type LessonSectionContent,
} from "@/lib/lesson-flow";
import { LESSON_TEMPLATE_BY_ID } from "@/lib/lesson-templates";
import type { Lesson, LessonAssessment } from "@/lib/types";
import type { RefineTabProps } from "@/components/year-v2/unit-tabs";

// 30s, matching the other mount-based suites. This file renders real components
// and drives real clicks, which is a few hundred ms of honest work per test —
// enough to breach vitest's 5s default when a dozen lanes share the machine.
// This suite timed out repeatedly during the Flow-column work while passing
// 101/101 in isolation. It does NOT mask a hang: every test here fails on an
// ASSERTION, never a timeout, when the behaviour under test is mutated out.
vi.setConfig({ testTimeout: 30000 });

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
  /** Per-lesson sections the mocked `getSections` serves. Set by a test that
   *  cares; every other lesson gets an empty list, which `refineFlowOf` reads
   *  as "no flow yet" — the state a lesson with nothing to lose is in. */
  sections: {} as Record<string, LessonSectionContent[]>,
}));

// `editLesson` is a no-op on purpose. A static render fires no events, so no
// write can ever reach it — an array capturing calls here would only ever be
// empty, and an unasserted capture makes the suite read as if it tested the
// write path when nothing does. The writes are asserted as DATA instead, in the
// `refineFillDescriptors` block above.
// `setSections` is a no-op for the same reason as `editLesson`. The Flow
// column's writes are asserted as DATA in the `refineFlowFill` block below,
// where the destructive case can be seeded with real phase content — which a
// static render, firing no change event, could never reach.
vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    editLesson: () => {},
    describeStandard: (code: string) => code,
    mergeStandards: () => {},
    getSections: (id: string) => store.sections[id] ?? [],
    setSections: () => {},
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

describe("refineFillDescriptors — a fill-down is ONE undo step", () => {
  // The invariant RefineTab's fillDown documents: N writes, one coalesce key,
  // one timestamp, so the store folds them into a SINGLE undo step. It cannot be
  // observed through the component — `renderToStaticMarkup` fires no events, so
  // the handler never runs — which is why the writes are produced as DATA here
  // and the component only forwards them.
  const UNIT = [
    lesson({ id: "a", durationMinutes: 45, standards: ["5.NF.1"] }),
    lesson({ id: "b" }),
    lesson({ id: "c" }),
    lesson({ id: "d" }),
  ];

  it("writes every lesson but the source, which IS the source", () => {
    const d = refineFillDescriptors(UNIT, "duration", 1000);
    expect(d.map((x) => x.id)).toEqual(["b", "c", "d"]);
    expect(d.every((x) => x.patch.durationMinutes === 45)).toBe(true);
  });

  it("folds into one undo step: a single coalesce key and a single timestamp", () => {
    // Twelve keys (or twelve timestamps) means twelve presses of ⌘Z to undo one
    // click — and no way for the teacher to know how many they are owed.
    const d = refineFillDescriptors(UNIT, "duration", 1000);
    expect(d.length).toBeGreaterThan(1);
    expect(new Set(d.map((x) => x.coalesce.key)).size).toBe(1);
    expect(new Set(d.map((x) => x.coalesce.ts)).size).toBe(1);
    expect(d[0].coalesce.key).toBe(refineFillCoalesceKey("duration"));
  });

  it("uses a key distinct from the per-cell typing key, so a fill is its own step", () => {
    // `edit()` coalesces on `lesson:<id>:<field>`. If a fill-down reused that,
    // it would merge into whatever the teacher was typing a moment earlier and
    // one ⌘Z would undo both.
    const key = refineFillDescriptors(UNIT, "duration", 1000)[0].coalesce.key;
    expect(key).not.toMatch(/^lesson:/);
    expect(refineFillCoalesceKey("standards")).not.toBe(
      refineFillCoalesceKey("duration"),
    );
  });

  it("dispatches NOTHING when there is nothing to copy", () => {
    // The wipe guard, at the dispatch layer: an empty source cell must produce
    // zero writes, not N writes of `undefined` down the column.
    expect(refineFillDescriptors([lesson({ id: "a" }), lesson({ id: "b" })], "duration", 1)).toEqual([]);
    expect(refineFillDescriptors([], "duration", 1)).toEqual([]);
    expect(refineFillDescriptors([lesson({ id: "a", durationMinutes: 45 })], "duration", 1)).toEqual([]);
  });

  it("gives each lesson its OWN arrays, never one shared reference", () => {
    // A shared `standards` array would make a later edit to one lesson silently
    // mutate every lesson the fill touched.
    const d = refineFillDescriptors(UNIT, "standards", 1000);
    expect(d).toHaveLength(3);
    expect(d[0].patch.standards).toEqual(["5.NF.1"]);
    expect(d[0].patch.standards).not.toBe(d[1].patch.standards);
    expect(d[0].patch.standards).not.toBe(UNIT[0].standards);
  });
});

// ── 1b. Flow: the column that edits a document ───────────────────────────────
//
// Flow is the only cell in Refine that replaces a DOCUMENT (the lesson's phase
// list) rather than setting a value, and it is the reason the column went
// unbuilt for a wave: the naive version — the handoff's, which copies a
// `flowName` string down with no guard (ph-units.jsx:925) — becomes, against
// real section content, a 20px button that destroys a unit's lesson plans on one
// click. Every test below exists for that one failure mode.
//
// The fixtures are built by the REAL `instantiateSections`, not by hand. A
// hand-written section list proves the derivation recognises a shape I
// imagined; only the real seeder proves it recognises the shape the app
// actually creates — the same blind spot the sanitizer test in block 4 closes.

const GRADUAL = LESSON_TEMPLATE_BY_ID["gradual-release"];
const MINIMAL = LESSON_TEMPLATE_BY_ID["minimal"];

/** A pristine section list, exactly as a freshly seeded lesson carries it. */
function seeded(t = GRADUAL): LessonSectionContent[] {
  return instantiateSections(t);
}

function withResources(count: number, t = GRADUAL): LessonSectionContent[] {
  const s = seeded(t);
  for (let i = 0; i < count; i += 1) {
    s[i % s.length].resources.push({
      id: `res-${i}`,
      type: "link",
      label: `Resource ${i}`,
    });
  }
  return s;
}

describe("refineFlowOf — reads the flow off the sections", () => {
  it("names the flow a real seeded lesson is on", () => {
    // The control the whole feature rests on. If this cannot recognise the
    // seeder's own output, every lesson reads "Custom", every cell locks, and
    // the column is inert while every guard test below still passes.
    const flow = refineFlowOf(seeded());
    expect(flow.templateId).toBe("gradual-release");
    expect(flow.label).toBe("Gradual Release");
    expect(flow.lock).toBe(null);
  });

  it("recognises every built-in flow, not just the default", () => {
    for (const group of REFINE_FLOW_GROUPS) {
      for (const o of group.options) {
        const t = LESSON_TEMPLATE_BY_ID[o.id];
        expect(refineFlowOf(instantiateSections(t)).templateId, o.id).toBe(o.id);
      }
    }
  });

  it("treats a lesson with no sections as free to take one", () => {
    // Not a refusal: a lesson with no phases has nothing a flow change could
    // destroy, so this is the safest write in the column.
    expect(refineFlowOf([])).toEqual({
      templateId: null,
      label: "—",
      lock: null,
    });
  });

  it("keeps NO PHASES and NO MATCHING FLOW as two different answers", () => {
    // The null-vs-empty confusion, in the shape it would take here. Both states
    // have `templateId: null`, which is the whole trap — a predicate that
    // collapsed them would either lock an empty lesson out of the column
    // forever ("Custom", refused, with nothing to lose) or hand a hand-built
    // structure to the fill-down as freely writable. They differ on the only
    // field that decides a write: `lock`.
    const empty = refineFlowOf([]);
    const custom = (() => {
      const s = seeded();
      s[0].heading = "My own phase";
      return refineFlowOf(s);
    })();
    expect(empty.templateId).toBe(custom.templateId); // both null — the trap
    expect(empty.lock).toBe(null); // …and writable
    expect(custom.lock).toBe("custom"); // …versus refused
    expect(empty.label).not.toBe(custom.label); // and they READ differently

    // The third state, for contrast: a real flow, named and writable.
    expect(refineFlowOf(seeded()).templateId).toBe("gradual-release");
  });

  it("attached resources do NOT lock the cell", () => {
    // The decision that makes the column usable at all. The seed path
    // distributes a lesson's own `resources` across its sections
    // (planner-store.tsx `buildInitialSections`), so if resources were a
    // refusal, nearly every real lesson would refuse. They are carried instead
    // — see `refineFlowApply`.
    expect(refineFlowOf(withResources(3)).lock).toBe(null);
  });
});

describe("refineFlowOf — refuses what a flow change cannot carry", () => {
  it("locks a lesson whose phase holds prose", () => {
    const s = seeded();
    s[1].body = "<p>Model 3/4 on the number line, then ask for a wrong one.</p>";
    expect(refineFlowOf(s).lock).toBe("written");
  });

  it("does NOT lock on an empty rich-text wrapper", () => {
    // The anti-overshoot pair, and a real shape: every contenteditable in this
    // app emits `<p></p>` the moment it is focused. Locking on that would
    // refuse any lesson a teacher had merely clicked into — indistinguishable,
    // from the outside, from a guard that works.
    const s = seeded();
    s[1].body = "<p></p>";
    expect(refineFlowOf(s).lock).toBe(null);
  });

  it("locks a lesson whose phases carry a delivery status", () => {
    const s = seeded();
    s[0].status = "done";
    expect(refineFlowOf(s).lock).toBe("delivered");
  });

  it("locks a structure the teacher built by hand", () => {
    for (const mutate of [
      // A renamed phase.
      (s: LessonSectionContent[]) => {
        s[0].heading = "Warm-up";
      },
      // A re-timed phase.
      (s: LessonSectionContent[]) => {
        s[0].minutes = 25;
      },
      // A recoloured phase.
      (s: LessonSectionContent[]) => {
        s[0].color = "--ink-500";
      },
      // A phase added by hand.
      (s: LessonSectionContent[]) => {
        s.push({
          id: "extra",
          templateSectionId: null,
          heading: "Extra",
          prompt: "",
          body: "",
          resources: [],
        });
      },
      // A phase deleted.
      (s: LessonSectionContent[]) => {
        s.pop();
      },
      // Phases reordered.
      (s: LessonSectionContent[]) => {
        s.reverse();
      },
    ]) {
      const s = seeded();
      mutate(s);
      const flow = refineFlowOf(s);
      expect(flow.lock).toBe("custom");
      expect(flow.label).toBe("Custom");
      expect(flow.templateId).toBe(null);
    }
  });

  it("reports the WRITING lock ahead of the custom one", () => {
    // A lesson someone wrote in is usually also restructured, and "you wrote in
    // these phases" is the reason the teacher can act on. "This doesn't match a
    // template" reads as a bug in the app rather than a fact about their
    // lesson.
    const s = seeded();
    s[0].heading = "Warm-up";
    s[1].body = "<p>Real content.</p>";
    expect(refineFlowOf(s).lock).toBe("written");
  });

  it("still knows which flow a LOCKED lesson is on", () => {
    // Being unable to CHANGE a lesson's flow says nothing about being unable to
    // read it — and `refineFlowFill` reads the first lesson's flow whether or
    // not that lesson is locked.
    const s = seeded();
    s[1].body = "<p>Real content.</p>";
    expect(refineFlowOf(s).templateId).toBe("gradual-release");
    expect(refineFlowOf(s).label).toBe("Gradual Release");
  });
});

describe("refineFlowApply — a flow change moves resources, never drops them", () => {
  it("carries every attached resource onto the new phases", () => {
    const before = withResources(7);
    const after = refineFlowApply(before, MINIMAL);
    const ids = (s: readonly LessonSectionContent[]) =>
      s.flatMap((x) => x.resources.map((r) => r.id)).sort();
    expect(after).toHaveLength(MINIMAL.sections.length);
    expect(ids(after)).toEqual(ids(before));
  });

  it("reuses the resources' own ids rather than re-minting them", () => {
    // A re-mint reads downstream as delete-plus-create; anything keyed off a
    // resource id (dedup, the composer's edit target) would lose track of it.
    const before = withResources(2);
    const after = refineFlowApply(before, MINIMAL);
    expect(after.flatMap((s) => s.resources.map((r) => r.label))).toContain(
      "Resource 0",
    );
  });

  it("does not mutate the list it was given", () => {
    const before = withResources(4);
    const snapshot = JSON.stringify(before);
    refineFlowApply(before, MINIMAL);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("produces a list the derivation reads back as the new flow", () => {
    // The round-trip: apply → derive must return the flow that was applied, or
    // the cell would show "Custom" immediately after a successful pick.
    expect(refineFlowOf(refineFlowApply(seeded(), MINIMAL)).templateId).toBe(
      "minimal",
    );
  });
});

describe("refineFlowFill — the fill-down that must not destroy a unit", () => {
  const SECTIONS: Record<string, LessonSectionContent[]> = {};
  const sectionsOf = (id: string): LessonSectionContent[] => SECTIONS[id] ?? [];
  const UNIT = [
    lesson({ id: "a" }),
    lesson({ id: "b" }),
    lesson({ id: "c" }),
    lesson({ id: "d" }),
  ];
  const PROSE = "<p>Model 3/4 on the number line, then ask for a wrong one.</p>";

  beforeEach(() => {
    // a — the source, on Gradual Release.
    SECTIONS.a = seeded(GRADUAL);
    // b — pristine and on a DIFFERENT flow, so it is a genuine target.
    SECTIONS.b = seeded(MINIMAL);
    // c — the lesson this whole feature is designed around: real writing in a
    // phase, which no flow change can carry anywhere.
    SECTIONS.c = seeded(MINIMAL);
    SECTIONS.c[1].body = PROSE;
    // d — already on the source's flow.
    SECTIONS.d = seeded(GRADUAL);
  });

  it("SKIPS the lesson with writing, and its writing survives the fill", () => {
    // THE TEST THIS FEATURE EXISTS TO PASS. Not "c is absent from writes" —
    // that is an absence assertion and fails open if `refineFlowFill` returned
    // nothing at all. It asserts the POSITIVE control in the same run (b IS
    // rewritten, so the fill demonstrably ran) and then applies every write the
    // fill produced to the store the way the component does, and reads c's
    // phase back out.
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.templateId).toBe("gradual-release");
    expect(fill.writes.map((w) => w.id)).toEqual(["b"]);
    expect(fill.skipped).toBe(1);

    for (const w of fill.writes) SECTIONS[w.id] = w.next;

    expect(SECTIONS.c[1].body).toBe(PROSE);
    expect(refineFlowOf(SECTIONS.c).templateId).toBe("minimal");
    // Positive control: the fill really did rewrite something.
    expect(refineFlowOf(SECTIONS.b).templateId).toBe("gradual-release");
  });

  it("skips a lesson whose phases carry a delivery status", () => {
    SECTIONS.c[1].body = "";
    SECTIONS.c[0].status = "progress";
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.writes.map((w) => w.id)).toEqual(["b"]);
    expect(fill.skipped).toBe(1);
  });

  it("skips a hand-built structure", () => {
    SECTIONS.c[1].body = "";
    SECTIONS.c[0].heading = "My own phase";
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.skipped).toBe(1);
    expect(fill.writes.map((w) => w.id)).toEqual(["b"]);
  });

  it("never writes the source lesson, and never a lesson already on the flow", () => {
    // `a` is the source; `d` already matches. Writing either burns an undo step
    // and re-mints every section id for no change a teacher asked for.
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.writes.map((w) => w.id)).not.toContain("a");
    expect(fill.writes.map((w) => w.id)).not.toContain("d");
  });

  it("copies FROM a locked source — a lock is about writing, not reading", () => {
    SECTIONS.a[0].body = PROSE;
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.templateId).toBe("gradual-release");
    expect(fill.writes.map((w) => w.id)).toEqual(["b"]);
  });

  it("has nothing to copy when the source is on no built-in flow", () => {
    SECTIONS.a[0].heading = "My own phase";
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.templateId).toBe(null);
    expect(fill.writes).toEqual([]);
    // And nothing is reported as skipped either — the fill never got as far as
    // looking at the other lessons, and saying "3 skipped" would blame them for
    // a source-side problem.
    expect(fill.skipped).toBe(0);
  });

  it("has nothing to copy from a source with no sections at all", () => {
    delete SECTIONS.a;
    expect(refineFlowFill(UNIT, sectionsOf).writes).toEqual([]);
  });

  it("returns nothing for an empty unit rather than throwing", () => {
    expect(refineFlowFill([], sectionsOf)).toEqual({
      templateId: null,
      label: "",
      writes: [],
      skipped: 0,
    });
  });

  it("captures the PRE-write section list, so Undo restores the real thing", () => {
    // The toast's Undo replays `previous`. Captured at fill time on purpose: by
    // the time Undo is clicked the store holds the NEW list, so a re-read would
    // "restore" exactly what is being undone — an undo button that does
    // nothing, which is worse than none.
    const fill = refineFlowFill(UNIT, sectionsOf);
    const w = fill.writes[0];
    expect(refineFlowOf(w.previous).templateId).toBe("minimal");
    expect(refineFlowOf(w.next).templateId).toBe("gradual-release");

    for (const x of fill.writes) SECTIONS[x.id] = x.next;
    for (const x of fill.writes) SECTIONS[x.id] = x.previous;
    expect(refineFlowOf(SECTIONS.b).templateId).toBe("minimal");
  });

  it("gives each write its own arrays, never one shared reference", () => {
    SECTIONS.c[1].body = "";
    SECTIONS.d = seeded(MINIMAL);
    const fill = refineFlowFill(UNIT, sectionsOf);
    expect(fill.writes.length).toBeGreaterThan(1);
    expect(fill.writes[0].next).not.toBe(fill.writes[1].next);
    expect(fill.writes[0].next[0]).not.toBe(fill.writes[1].next[0]);
  });
});

describe("refineFlowSetWrite — the guard between the paint and the click", () => {
  // The cell decides whether to render a live select at RENDER time and acts on
  // it at CLICK time, and the store moves in between: a background hydrate
  // lands, or the teacher writes a phase in the Lesson Planner and comes back
  // to a select the last paint left behind. Without a re-read at write time,
  // that stale select replaces a list that has since acquired writing.
  it("writes the new flow when the lesson is still pristine", () => {
    // The positive control. Without it the two refusals below pass just as well
    // against a function hard-coded to return null, which would make the whole
    // column inert.
    const next = refineFlowSetWrite(seeded(GRADUAL), "minimal");
    expect(next).not.toBe(null);
    expect(refineFlowOf(next!).templateId).toBe("minimal");
  });

  it("refuses when the lesson acquired writing after the cell was painted", () => {
    const s = seeded(GRADUAL);
    s[1].body = "<p>Written between the paint and the click.</p>";
    expect(refineFlowSetWrite(s, "minimal")).toBe(null);
  });

  it("refuses when a phase was marked started after the cell was painted", () => {
    const s = seeded(GRADUAL);
    s[0].status = "progress";
    expect(refineFlowSetWrite(s, "minimal")).toBe(null);
  });

  it("refuses a template id no built-in owns, rather than writing an empty list", () => {
    // Refusing beats guessing: the guess replaces a real section list with
    // nothing at all.
    expect(refineFlowSetWrite(seeded(GRADUAL), "not-a-flow")).toBe(null);
  });
});

describe("refineFlowUndoable — Undo refuses what the fill would have refused", () => {
  const SECTIONS: Record<string, LessonSectionContent[]> = {};
  const sectionsOf = (id: string): LessonSectionContent[] => SECTIONS[id] ?? [];
  const UNIT = [lesson({ id: "a" }), lesson({ id: "b" }), lesson({ id: "c" })];

  beforeEach(() => {
    SECTIONS.a = seeded(GRADUAL);
    SECTIONS.b = seeded(MINIMAL);
    SECTIONS.c = seeded(MINIMAL);
  });

  it("undoes a write the teacher has not touched since", () => {
    const fill = refineFlowFill(UNIT, sectionsOf);
    for (const w of fill.writes) SECTIONS[w.id] = w.next;
    expect(refineFlowUndoable(fill.writes, sectionsOf).map((w) => w.id)).toEqual(
      fill.writes.map((w) => w.id),
    );
  });

  it("REFUSES a lesson written into between the fill and the Undo", () => {
    // The second data-loss path, and the one only a stateful sequence can find:
    // fill → teacher opens a rewritten lesson and types → teacher clicks Undo.
    // Restoring the captured `previous` there destroys the newer writing in
    // order to repair the older change.
    const fill = refineFlowFill(UNIT, sectionsOf);
    for (const w of fill.writes) SECTIONS[w.id] = w.next;
    expect(fill.writes.length).toBe(2);

    const touched = fill.writes[0].id;
    const PROSE = "<p>Typed while the toast was still up.</p>";
    SECTIONS[touched] = SECTIONS[touched].map((s, i) =>
      i === 1 ? { ...s, body: PROSE } : s,
    );

    const undoable = refineFlowUndoable(fill.writes, sectionsOf);
    expect(undoable.map((w) => w.id)).toEqual([fill.writes[1].id]);

    // And the property the filter exists for, asserted on the data rather than
    // on the filter: replaying the undoable set leaves the new writing alone.
    for (const w of undoable) SECTIONS[w.id] = w.previous;
    expect(SECTIONS[touched][1].body).toBe(PROSE);
    // Positive control in the same run — the untouched lesson really did revert.
    expect(refineFlowOf(SECTIONS[fill.writes[1].id]).templateId).toBe("minimal");
  });

  it("survives a fresh array with identical content — a hydrate is not an edit", () => {
    // `===` would have been the cheap check, and it would call every lesson
    // "changed" the moment the store handed out a new array (every reducer pass
    // does, and a hydrate replaces the whole map). Undo would then silently do
    // nothing, which looks exactly like a broken button.
    const fill = refineFlowFill(UNIT, sectionsOf);
    for (const w of fill.writes)
      SECTIONS[w.id] = w.next.map((s) => ({ ...s, resources: [...s.resources] }));
    expect(refineFlowUndoable(fill.writes, sectionsOf)).toHaveLength(
      fill.writes.length,
    );
  });

  it("refuses a lesson whose phase status changed after the fill", () => {
    const fill = refineFlowFill(UNIT, sectionsOf);
    for (const w of fill.writes) SECTIONS[w.id] = w.next;
    const id = fill.writes[0].id;
    SECTIONS[id] = SECTIONS[id].map((s, i) =>
      i === 0 ? { ...s, status: "done" as const } : s,
    );
    expect(refineFlowUndoable(fill.writes, sectionsOf).map((w) => w.id)).not.toContain(
      id,
    );
  });

  it("refuses a lesson whose resource was RENAMED, id unchanged", () => {
    // The composer edits a resource in place and keeps its id, so an
    // id-and-position check would call a renamed or re-pointed link
    // "unchanged" and let Undo roll the rename away. Seeded through a real
    // fill so the resource travels the carry path first.
    SECTIONS.b[0].resources.push({
      id: "r1",
      type: "link",
      label: "Fraction strips",
      url: "https://example.org/a",
    });
    const fill = refineFlowFill(UNIT, sectionsOf);
    for (const w of fill.writes) SECTIONS[w.id] = w.next;

    // Control: the carried resource really did land on the rewritten lesson,
    // or the assertion below would pass because there was nothing to compare.
    const carried = SECTIONS.b.flatMap((s) => s.resources);
    expect(carried.map((r) => r.id)).toContain("r1");
    expect(refineFlowUndoable(fill.writes, sectionsOf).map((w) => w.id)).toContain(
      "b",
    );

    SECTIONS.b = SECTIONS.b.map((s) => ({
      ...s,
      resources: s.resources.map((r) =>
        r.id === "r1" ? { ...r, label: "Fraction strips (revised)" } : r,
      ),
    }));
    expect(refineFlowUndoable(fill.writes, sectionsOf).map((w) => w.id)).not.toContain(
      "b",
    );
  });

  it("refuses a lesson whose resources moved after the fill", () => {
    const fill = refineFlowFill(UNIT, sectionsOf);
    for (const w of fill.writes) SECTIONS[w.id] = w.next;
    const id = fill.writes[0].id;
    SECTIONS[id] = SECTIONS[id].map((s, i) =>
      i === 0
        ? { ...s, resources: [{ id: "r-new", type: "link", label: "New" }] }
        : s,
    );
    expect(refineFlowUndoable(fill.writes, sectionsOf).map((w) => w.id)).not.toContain(
      id,
    );
  });
});

describe("refineFlowFillMessage — says what it did NOT do", () => {
  it("names the skip count and why, not just the successes", () => {
    // A fill-down that touched 7 of 12 rows and reported "done" leaves the
    // teacher to discover the other five by opening them.
    const msg = refineFlowFillMessage({
      templateId: "gradual-release",
      label: "Gradual Release",
      writes: [
        { id: "b", next: [], previous: [] },
        { id: "c", next: [], previous: [] },
      ],
      skipped: 3,
    });
    expect(msg).toContain("2 lessons");
    expect(msg).toContain("3 lessons left alone");
  });

  it("still explains itself when it wrote nothing at all", () => {
    const msg = refineFlowFillMessage({
      templateId: "minimal",
      label: "Minimal",
      writes: [],
      skipped: 1,
    });
    expect(msg).toContain("No lesson needed");
    expect(msg).toContain("1 lesson left alone");
  });

  it("says nothing about skips when there were none", () => {
    const msg = refineFlowFillMessage({
      templateId: "minimal",
      label: "Minimal",
      writes: [{ id: "b", next: [], previous: [] }],
      skipped: 0,
    });
    expect(msg).toBe("Flow set to “Minimal” on 1 lesson.");
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

// ── 2b. `assessment: null` — the value both guards were not written for ──────
//
// FOLDED IN from tests/unit-refine-null-assessment.test.ts (authored by
// `guard-test`, kept separate only because this file was open in another lane),
// verbatim apart from reusing this file's `lesson()` factory. The fix itself
// lives in two arms of lib/unit-refine.ts: `refineFieldSet`'s `!= null` and
// `rawFillPatch`'s `== null`.
//
// Both guards tested `=== undefined` / `!== undefined`, which is right for the
// field's DECLARED type (`assessment?: LessonAssessment`) and for every hydrated
// lesson (`assessmentFromRow` normalises the read path to `undefined`). It is
// not right for `null`, and `null` is one keystroke away: a hand-built lesson, a
// fixture, a JSON round-trip, or any mock source that spells "absent" the other
// way.
//
// The two failures COMPOUND, which is why they are pinned together:
//   1. `refineFieldSet` returned `null !== undefined` → TRUE, so an empty
//      assessment counted as PLANNED — in the row's dot AND the pass counter,
//      for which that function is the single source of truth.
//   2. `rawFillPatch`'s guard let `null` past and then spread it: `{ ...null }`
//      is `{}`, so the patch became `{ assessment: {} }`, which `clonePatch`
//      keeps because an empty object is truthy. One click wrote an empty
//      assessment to every other lesson in the unit — and (1) then counted each
//      as filled, so the counter agreed with the lie.
//
// The same family as the Flow fill-down in block 1b: a bulk action writing
// silently across a unit.

/** `assessment` is typed `LessonAssessment | undefined`, so TypeScript will not
 *  let a test write `null` directly — which is exactly why the bug survived
 *  review. The cast is the point of the test, not a workaround: it reproduces
 *  what an untyped mock, a JSON parse, or a hand-built row actually delivers. */
const NULL_ASSESSMENT = null as unknown as LessonAssessment | undefined;
const REAL_ASSESSMENT = {
  kind: "formative",
  title: "Exit ticket",
} as LessonAssessment;

describe("refineFieldSet — a null assessment is a GAP, not a plan", () => {
  it("does not count `assessment: null` as filled", () => {
    // The regression. Under `!== undefined` this returned true and the Refine
    // row painted a filled dot over an empty field.
    expect(
      refineFieldSet(lesson({ assessment: NULL_ASSESSMENT }), "assessment"),
    ).toBe(false);
  });

  it("still does not count an absent assessment as filled", () => {
    // Control: the case the original guard got right must stay right. Without
    // this, a fix that returned `false` unconditionally would pass the test
    // above while breaking the whole field.
    expect(refineFieldSet(lesson({}), "assessment")).toBe(false);
  });

  it("still counts a real assessment as filled", () => {
    // The other anti-overshoot control — `!= null` must not have narrowed the
    // predicate into "never filled".
    expect(
      refineFieldSet(lesson({ assessment: REAL_ASSESSMENT }), "assessment"),
    ).toBe(true);
  });

  it("still counts an assessment object with NO kind (the unclassified bucket)", () => {
    // DELIBERATE, and load-bearing: lib/unit-refine.ts documents that a
    // kind-less assessment counts, so a two-way formative/summative split
    // cannot quietly drop a real one. `null` had to stop counting WITHOUT
    // taking this with it — the two look alike from a truthiness check and do
    // not mean the same thing.
    expect(
      refineFieldSet(
        lesson({ assessment: {} as LessonAssessment }),
        "assessment",
      ),
    ).toBe(true);
  });
});

describe("refineFillPatch — a null source copies NOTHING, not an empty object", () => {
  it("returns null when the source lesson's assessment is null", () => {
    // Under the old `=== undefined` guard this returned `{ assessment: {} }`.
    expect(
      refineFillPatch(
        [lesson({ id: "a", assessment: NULL_ASSESSMENT }), lesson({ id: "b" })],
        "assessment",
      ),
    ).toBeNull();
  });

  it("still returns null for an absent assessment", () => {
    expect(
      refineFillPatch([lesson({ id: "a" }), lesson({ id: "b" })], "assessment"),
    ).toBeNull();
  });

  it("still copies a real assessment, as a fresh object", () => {
    // Anti-overshoot + the aliasing guard `clonePatch` exists for: N lessons
    // must not share one assessment object.
    const patch = refineFillPatch(
      [lesson({ id: "a", assessment: REAL_ASSESSMENT }), lesson({ id: "b" })],
      "assessment",
    );
    expect(patch?.assessment).toEqual(REAL_ASSESSMENT);
    expect(patch?.assessment).not.toBe(REAL_ASSESSMENT);
  });
});

describe("refineFillDescriptors — the user-facing consequence of the null", () => {
  it("writes NOTHING to the other lessons when the source assessment is null", () => {
    // This is the assertion that matters: `refineFillDescriptors` is what the
    // button dispatches, and it calls `rawFillPatch` directly. Before the fix
    // this produced one descriptor PER remaining lesson, each carrying
    // `{ assessment: {} }` — a silent write to every lesson in the unit.
    expect(
      refineFillDescriptors(
        [
          lesson({ id: "a", assessment: NULL_ASSESSMENT }),
          lesson({ id: "b" }),
          lesson({ id: "c" }),
        ],
        "assessment",
        1_000,
      ),
    ).toEqual([]);
  });

  it("still writes to every lesson but the source when there IS something to copy", () => {
    // The control that stops the assertion above passing vacuously. If
    // `refineFillDescriptors` returned `[]` for everything — a plausible
    // over-correction — the test above would pass while the feature was dead.
    const descriptors = refineFillDescriptors(
      [
        lesson({ id: "a", assessment: REAL_ASSESSMENT }),
        lesson({ id: "b" }),
        lesson({ id: "c" }),
      ],
      "assessment",
      1_000,
    );
    expect(descriptors.map((d) => d.id)).toEqual(["b", "c"]);
    for (const d of descriptors)
      expect(d.patch.assessment).toEqual(REAL_ASSESSMENT);
  });

  it("SELF-TEST: `{ ...null }` really is `{}` — the mechanism the guard missed", () => {
    // Pins the language behaviour the bug rode in on, so a reader of this file
    // does not have to take the explanation on trust. If this ever stops being
    // true the reasoning above needs rewriting, not the code.
    expect({ ...(null as unknown as object) }).toEqual({});
    // …and an empty object is truthy, which is why `clonePatch`'s
    // `if (patch.assessment)` did not catch it either.
    expect(Boolean({})).toBe(true);
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

  it("offers no Flow pass — the counter would be vacuous", () => {
    // Flow IS a column now (block 1b), but not a pass, and the reason is the
    // data rather than the handoff. `buildInitialSections` seeds every lesson
    // from the default flow at creation, so a Flow pass counter would read
    // "12 of 12 done" the moment a unit exists — the same vacuous-meter defect
    // tests/unit-refine-tab.test.ts pins as BUG 1, which tells a teacher to
    // stop working on a column nobody has touched. The handoff can count its
    // `flowName` because that starts null (pw-data.js:84).
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
  store.sections = {};
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

describe("RefineTab — the Flow column", () => {
  it("renders a Flow header between Standards and Min, as the handoff has it", async () => {
    // ph-units.jsx:944-946 — Standard, Flow, Min. Position is checked by index
    // rather than mere presence: a Flow column appended after Planned would
    // satisfy a `toContain` and be wrong in the one way a teacher would notice.
    store.sections.a = seeded();
    const html = await render([lesson({ id: "a" })]);
    const head = html.slice(0, html.indexOf("</thead>"));
    expect(head.indexOf("Standards")).toBeLessThan(head.indexOf(">Flow<"));
    expect(head.indexOf(">Flow<")).toBeLessThan(head.indexOf(">Min<"));
  });

  it("shows the flow a lesson is on, selected", async () => {
    store.sections.a = seeded();
    const html = await render([lesson({ id: "a" })]);
    expect(html).toContain('aria-label="Flow, lesson 1"');
    // React renders a controlled <select>'s value as `selected` on the option.
    expect(html).toMatch(/<option[^>]*value="gradual-release"[^>]*selected/);
  });

  it("offers every built-in flow, grouped", async () => {
    store.sections.a = seeded();
    const html = await render([lesson({ id: "a" })]);
    for (const g of REFINE_FLOW_GROUPS) {
      expect(html).toContain(`label="${g.label}"`);
      for (const o of g.options) expect(html).toContain(`value="${o.id}"`);
    }
  });

  it("renders the cell READ-ONLY on a lesson whose phases hold writing", async () => {
    // The UI half of the data-loss guard. A live select here would let a
    // teacher replace twelve phases of their own writing from a table cell.
    const s = seeded();
    s[1].body = "<p>Model 3/4 on the number line.</p>";
    store.sections.a = s;
    const html = await render([lesson({ id: "a" })]);
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain("already have writing in them");
    // And it is still an <input>, not a disabled <select>: a disabled control
    // is not focusable, registers no cell, and would stall an Enter run on the
    // row above it.
    expect(html).not.toContain("<select disabled");
  });

  it("keeps the cell live on a pristine lesson — the anti-overshoot pair", async () => {
    // If the lock predicate were ever inverted or over-eager, EVERY Flow cell
    // would go read-only and the column would lose its purpose while the test
    // above still passed.
    store.sections.a = seeded();
    const html = await render([lesson({ id: "a" })]);
    expect(html).toContain('aria-label="Flow, lesson 1"');
    expect(html).not.toContain('aria-readonly="true"');
  });

  it("disables the Flow fill-down when the first lesson is on no built-in flow", async () => {
    const s = seeded();
    s[0].heading = "My own phase";
    store.sections.a = s;
    store.sections.b = seeded();
    const html = await render([lesson({ id: "a" }), lesson({ id: "b" })]);
    expect(html).toContain("isn’t on one of the built-in flows");
  });

  it("enables it once the first lesson is on one", async () => {
    store.sections.a = seeded();
    store.sections.b = seeded();
    const html = await render([lesson({ id: "a" }), lesson({ id: "b" })]);
    expect(html).toContain(
      "Put every lesson in this unit on the first lesson’s flow",
    );
    expect(html).not.toContain("isn’t on one of the built-in flows");
  });

  it("warns in the caption that Flow replaces phases", async () => {
    // The table's accessible name is the only place the read-only Flow cell's
    // rule is stated BEFORE a teacher hits it.
    store.sections.a = seeded();
    const html = await render([lesson({ id: "a" })]);
    expect(html).toContain("Flow replaces the lesson’s phases");
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

  it("catches markup shaped the way the app's OWN editor stores it", async () => {
    // CLOSES THE FIXTURE BLIND SPOT. Every other test in this block feeds a
    // hand-written string, which proves the guard catches markup I imagined —
    // not markup the app produces. The real path is:
    //   contenteditable → sanitizeHtml() on emit (rich-text-editor.tsx:55)
    //   → handleObjective stores `I can ${html}` (LessonWorkspace.tsx:198-204)
    // so this runs a realistic execCommand-bold payload through the REAL
    // sanitizer and asserts the stored shape trips `isPlainText`. If the
    // sanitizer's allowlist ever changed to emit something `stripHtml` treats as
    // plain, this fails — and the data-loss bug would otherwise be live again
    // with every hand-written test still green.
    const { sanitizeHtml } = await import("@/lib/sanitize-html");
    const emitted = sanitizeHtml("<b>compare</b> two fractions");
    const stored = `I can ${emitted}`;

    // Control: the sanitizer really did keep an inline tag. Without this the
    // assertion below could pass because the payload was stripped to plain text
    // upstream — a vacuous pass.
    expect(emitted).toMatch(/<[a-z]/i);

    const html = await render([lesson({ id: "a", objective: stored })]);
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain("I can compare two fractions");
  });

  it("does not mistake a bare ampersand or angle bracket for markup", async () => {
    // THE CONTROL this assertion used to lack. `not.toContain` passes vacuously
    // if the row never rendered at all, so prove the title reached the markup
    // first — React escapes "&" in an attribute, so `&amp;` is the shape to
    // look for, not the raw character.
    const html = await render([
      lesson({ id: "a", title: "Fractions & decimals: 1 < 2" }),
    ]);
    expect(html).toContain("Fractions &amp; decimals");
    expect(html).not.toContain('aria-readonly="true"');
  });

  it("never locks a plain sentence carrying an entity or a bare angle bracket", async () => {
    // The case above was the ONE string the old `stripHtml(v) === v.trim()`
    // predicate happened to get right, and it made the guard look correct while
    // it locked every value below.
    //
    // `stripHtml` DECODES entities, so any entity made a plain sentence compare
    // unequal to itself and the cell rendered `aria-readonly="true"` with the
    // false explanation "formatted text, read-only here" — a teacher could
    // never edit that title in Refine again. None of these are exotic:
    // `escapeHtml` (lib/html-text.ts:33) emits `&amp;`/`&#39;`/`&quot;` BY
    // DESIGN, and every contenteditable in the app serialises a typed "&" as
    // `&amp;` and consecutive spaces as `&nbsp;` (sanitizeHtml runs the string
    // through DOMPurify, which re-serialises the same way).
    for (const title of [
      "Fractions &amp; decimals", // what a rich-text editor stores for "&"
      "a&nbsp;b", // what contenteditable stores for two spaces
      "if a < b > c then", // bare angle brackets, no tag anywhere
    ]) {
      const html = await render([lesson({ id: "a", title })]);
      // CONTROL — prove the cell reached the markup before trusting the
      // absence. Without it this loop passes if the row never rendered at all,
      // which is this repo's signature fail-open; the neighbouring case above
      // already carries its control and says why.
      expect(html, `row never rendered: ${title}`).toContain(
        'aria-label="Title, lesson 1"',
      );
      expect(html, `plain title locked read-only: ${title}`).not.toContain(
        'aria-readonly="true"',
      );
    }
  });

  it("still locks a value that really does carry a tag", async () => {
    // The anti-overshoot pair for the test above: loosening the predicate must
    // not turn it into "everything is editable", which would restore the
    // original data-loss bug (a plain <input> flattening stored markup on the
    // first keystroke).
    for (const title of ["<b>bold</b>", "<p>x</p>", "a<br/>b", "x</p>"]) {
      const html = await render([lesson({ id: "a", title })]);
      expect(html, `markup left editable: ${title}`).toContain(
        'aria-readonly="true"',
      );
    }
  });
});

// ── 5. The pass banner never promises a keyboard run the column cannot make ──
//
// The counter above the table used to append " — Enter jumps to the next
// lesson" to EVERY unfinished pass. It is true of three of the four: `advance`
// walks a column by looking up `${column}:${row + 1}` in the ref map that
// `registerCell` fills, and the Standards cell is a <button> that opens the
// tagging picker — it registers nothing, so Enter there ACTIVATES the button and
// opens a modal. `REFINE_PASSES` already knew (its Standards tip omits the
// sentence the objective and duration tips carry); the banner overrode it.
//
// Asserted against the pure builder because the banner only renders once a pass
// is CHOSEN, and `renderToStaticMarkup` fires no change event — a rendered
// assertion could only ever see the resting state, which has no banner at all.

describe("refinePassBanner — the Enter claim matches the column", () => {
  it("promises Enter only on the columns that register a cell", () => {
    for (const field of ["objective", "duration", "assessment"] as const) {
      expect(
        refinePassBanner(field, { done: 1, total: 4 }),
        `${field} pass`,
      ).toContain("Enter jumps to the next lesson");
    }
  });

  it("does NOT promise Enter on the Standards pass", () => {
    const banner = refinePassBanner("standards", { done: 1, total: 4 });
    expect(banner).not.toContain("Enter");
    // Not merely silent: the teacher is told what DOES fill the column, or the
    // pass reads as a highlighted column with no way in.
    expect(banner).toContain("open a cell");
  });

  it("still counts the pass, on every field", () => {
    for (const p of REFINE_PASSES) {
      expect(refinePassBanner(p.key, { done: 2, total: 7 })).toContain(
        `${p.label}: 2 of 7 done`,
      );
    }
  });

  it("drops the how-to once the pass is finished", () => {
    // Nothing left to walk to, so a keyboard instruction is noise.
    const banner = refinePassBanner("objective", { done: 4, total: 4 });
    expect(banner).toBe("Objectives: 4 of 4 done");
  });
});

describe("REFINE_ENTER_COLUMNS agrees with the component's real ref map", () => {
  it("lists exactly the columns RefineTab registers a cell for", async () => {
    // A PROVENANCE CHECK, and provenance checks are where this repo has been
    // burned: a bare-word grep matched a file's own header comment and was read
    // as the capability. This one matches the CALL — `registerCell("x", ` — with
    // the trailing comma and argument that only a call site has, so a mention in
    // prose ("registerCell covers title/objective") cannot satisfy it. It also
    // asserts a non-empty result first, so a rename that makes the regex match
    // nothing fails loudly instead of passing with two empty sets.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL(
        "../components/year-v2/unit-tabs/RefineTab.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const registered = [
      ...src.matchAll(/registerCell\("([a-z]+)",\s*i\)/g),
    ].map((m) => m[1]);
    expect(registered.length).toBeGreaterThan(0);
    expect([...new Set(registered)].sort()).toEqual(
      [...REFINE_ENTER_COLUMNS].sort(),
    );
  });
});
