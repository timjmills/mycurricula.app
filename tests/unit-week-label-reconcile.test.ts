// unit-week-label-reconcile.test.ts — the week label must SURVIVE the write.
//
// ── THE BUG THIS PINS ─────────────────────────────────────────────────────
// A band drag on the Plan timeline writes `startWeek` / `endWeek` through
// `UnitPatch`. `Unit.weeks` — the display collapse ("Wk 20–25") — is
// deliberately NOT in `UnitPatch` (lib/planner/source.ts): a caller must not be
// able to supply a label that disagrees with the numbers. Both sources
// therefore RE-DERIVE it on the row they return (supabase-source `mapUnitRow`,
// mock-source `updateUnitFields`) through the one shared formatter.
//
// The write queue then reconciled that row into the catalog through a
// PROJECTION — `reconcile(unitId, unitToPatch(updated))` — and the reducer
// shallow-merged the projection. `weeks` is not a `UnitPatch` key, so the
// freshly-derived label was DISCARDED IN TRANSIT and the catalog kept the old
// one for the rest of the session (nothing re-hydrates units mid-session; there
// is no realtime subscription). Seven read surfaces render `unit.weeks` — Units
// browse, /year, the left filter panel, the Resource Wall scope meta, and hub
// browse SORTS by it — so the app looked half-applied: the timeline moved, every
// label did not.
//
// ── WHY THIS TEST DRIVES THE REAL PATH ────────────────────────────────────
// A test that calls the formatter directly PASSES while the bug is live: the
// formatter was never wrong. The defect is transport — the canonical value is
// computed correctly and then thrown away one layer above the seam. So the
// assertions below run a write through the REAL queue and the REAL reducer and
// then read the catalog, which is what the seven surfaces read.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// planner-store imports the client facade, whose server-action module pulls the
// server-only Supabase source (next/headers). The reducer under test never
// touches persistence — stub the facade so the import chain stays node-safe.
vi.mock("@/lib/planner/client", () => ({ plannerClient: {} }));

import { createUnitWriteQueue } from "@/lib/planner/unit-write-queue";
import { unitWeeksLabel, type UnitPatch } from "@/lib/planner/source";
import { plannerMockSource } from "@/lib/planner/mock-source";
import { weeksLabel } from "@/lib/plan-timeline";
import {
  buildNeedsAttention,
  buildUnitLibrary,
} from "@/lib/plan-timeline/library";
import {
  historyReducer,
  type HistoryReducerState,
  type PlannerDoc,
} from "@/lib/planner-store";
import type { Lesson, Subject, Unit } from "@/lib/types";

/** Flush microtasks + the queue's promise boundary. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const DOC: PlannerDoc = { lessons: [], sections: {}, cellLayouts: {} };

function stateWith(units: Unit[]): HistoryReducerState {
  return {
    history: { past: [], present: DOC, future: [] },
    lastCoalesceKey: null,
    lastCoalesceTs: 0,
    lastChange: null,
    hydration: "ready",
    hydratedForOwner: null,
    catalog: { subjects: [], units, standards: {}, activeGradeId: "g5" },
  };
}

/** A minimal `PlannerDataSource` face — only the mutator this exercises. */
interface UnitWriter {
  updateUnitFields: (id: string, p: UnitPatch, o: string) => Promise<Unit>;
}

/** Drive one confirmed unit write through the REAL queue → REAL reducer, with a
 *  REAL source doing the confirming, and hand back the catalog unit the seven
 *  `unit.weeks` read surfaces would render.
 *
 *  This mirrors the provider's wiring (lib/planner-store.tsx — the queue's
 *  `reconcile` dep dispatching `reconcileUnitRow`). Nothing here re-derives the
 *  label: the source computes it and this asserts it SURVIVED the trip. */
async function writeThroughTheRealPath(
  source: UnitWriter,
  units: Unit[],
  unitId: string,
  patch: UnitPatch,
): Promise<Unit> {
  let state = stateWith(units);
  const queue = createUnitWriteQueue({
    updateUnitFields: (id, p) => source.updateUnitFields(id, p, "owner-1"),
    reconcile: (id, unit) => {
      state = historyReducer(state, {
        type: "reconcileUnitRow",
        unitId: id,
        unit,
      });
    },
    canWrite: () => true,
    onError: () => {},
  });
  queue.enqueue(unitId, patch);
  await tick();
  const found = state.catalog.units.find((u) => u.id === unitId);
  if (!found) throw new Error(`unit ${unitId} vanished from the catalog`);
  return found;
}

describe("a confirmed unit write reconciles the CANONICAL row (weeks included)", () => {
  it("mock source: a band drag to Wk 20–25 updates Unit.weeks, not just the numbers", async () => {
    const units = await plannerMockSource.listUnits("g5");
    const before = units.find((u) => u.id === "u-m3");
    // The fixture's label BEFORE the drag. (`listUnits` returns the full-year
    // superset, where Math Unit 3 is seeded "Wk 11–16".)
    expect(before?.weeks).toBe("Wk 11–16");

    const after = await writeThroughTheRealPath(
      plannerMockSource,
      units,
      "u-m3",
      { startWeek: 20, endWeek: 25 },
    );

    expect(after.startWeek).toBe(20);
    expect(after.endWeek).toBe(25);
    // THE ASSERTION. The label the seven read surfaces render must agree with
    // the numbers the timeline renders.
    expect(after.weeks).toBe("Wk 20–25");
  });

  it("mock source: a ONE-WEEK unit reads 'Wk 12', never 'Wk 12–12'", async () => {
    const units = await plannerMockSource.listUnits("g5");
    const after = await writeThroughTheRealPath(
      plannerMockSource,
      units,
      "u-r2",
      { startWeek: 12, endWeek: 12 },
    );
    expect(after.weeks).toBe("Wk 12");
  });

  // ── THE SUPABASE ARM ────────────────────────────────────────────────────
  // The whole point of the `PlannerDataSource` seam is that the two paths
  // cannot diverge, so a fix that holds only for the mock is not a fix. There
  // is no database in this env, so the Supabase arm is pinned in two halves
  // that together cover it end to end:
  //
  //   1. TRANSPORT (below): the queue + reducer preserve whatever canonical
  //      row a source returns — proved with a source that behaves the way
  //      `supabase-source.ts` does: it persists the COLUMNS, re-reads them, and
  //      RE-DERIVES the label (never echoing a caller-supplied one, which it
  //      could not do anyway — `weeks` is not a `UnitPatch` key).
  //   2. DERIVATION (the next describe): a static assertion that
  //      `supabase-source.ts` really does return through `reloadUnit` →
  //      `mapUnitRow` → `unitWeeksLabel`.
  it("supabase-shaped source: the re-derived label survives the trip too", async () => {
    // A stand-in for the `units` TABLE — columns only, no label column, exactly
    // as the schema has it (`units.start_week` / `end_week`; `weeks` exists
    // nowhere in Postgres).
    const row = { start_week: 9, end_week: 14 };
    const supabaseShaped: UnitWriter = {
      async updateUnitFields(_id, patch) {
        if (patch.startWeek !== undefined) row.start_week = patch.startWeek;
        if (patch.endWeek !== undefined) row.end_week = patch.endWeek;
        // ← `mapUnitRow`: the label is DERIVED from the re-read row.
        return {
          id: "u-sb",
          subject: "math",
          name: "Unit 3",
          weeks: unitWeeksLabel(row.start_week, row.end_week),
          startWeek: row.start_week,
          endWeek: row.end_week,
          shade: 2,
        };
      },
    };
    const seeded: Unit[] = [
      {
        id: "u-sb",
        subject: "math",
        name: "Unit 3",
        weeks: "Wk 9–14",
        startWeek: 9,
        endWeek: 14,
        shade: 2,
      },
    ];

    const after = await writeThroughTheRealPath(
      supabaseShaped,
      seeded,
      "u-sb",
      {
        startWeek: 20,
        endWeek: 25,
      },
    );
    expect(after.weeks).toBe("Wk 20–25");
    expect(after.startWeek).toBe(20);

    const oneWeek = await writeThroughTheRealPath(
      supabaseShaped,
      seeded,
      "u-sb",
      { startWeek: 12, endWeek: 12 },
    );
    expect(oneWeek.weeks).toBe("Wk 12");
  });

  it("BOTH sources land on the same label for the same write", async () => {
    // The seam's contract, stated as an equality rather than twice as a
    // literal: flag OFF and flag ON must not disagree about one write.
    const mockUnits = await plannerMockSource.listUnits("g5");
    const viaMock = await writeThroughTheRealPath(
      plannerMockSource,
      mockUnits,
      "u-w3",
      { startWeek: 20, endWeek: 25 },
    );
    const row = { start_week: 1, end_week: 2 };
    const viaSupabaseShaped = await writeThroughTheRealPath(
      {
        async updateUnitFields(_id, patch) {
          if (patch.startWeek !== undefined) row.start_week = patch.startWeek;
          if (patch.endWeek !== undefined) row.end_week = patch.endWeek;
          return {
            id: "u-w3",
            subject: "writing",
            name: "Personal Narrative",
            weeks: unitWeeksLabel(row.start_week, row.end_week),
            startWeek: row.start_week,
            endWeek: row.end_week,
            shade: 2,
          };
        },
      },
      [
        {
          id: "u-w3",
          subject: "writing",
          name: "Personal Narrative",
          weeks: "Wk 1–2",
          startWeek: 1,
          endWeek: 2,
          shade: 2,
        },
      ],
      "u-w3",
      { startWeek: 20, endWeek: 25 },
    );
    expect(viaMock.weeks).toBe(viaSupabaseShaped.weeks);
    expect(viaMock.weeks).toBe("Wk 20–25");
  });
});

describe("the Supabase source DERIVES the label on the row it returns", () => {
  // Static, because there is no database here — but the two facts that make the
  // flag-ON arm work are both single lines of source, and a rename that broke
  // either would otherwise only be discovered in production.
  const src = readFileSync(
    join(__dirname, "..", "lib", "planner", "supabase-source.ts"),
    "utf8",
  );

  it("mapUnitRow derives `weeks` through the ONE shared formatter", () => {
    expect(src).toContain("unitWeeksLabel(row.start_week, row.end_week)");
    // Imported from the seam, not redefined locally.
    expect(src).toContain("unitWeeksLabel");
    expect(src).not.toMatch(/function\s+unitWeeksLabel/);
  });

  it("updateUnitFields returns a RE-READ row, not the caller's patch", () => {
    // `reloadUnit` is the only thing between the UPDATE and the return value,
    // and it maps through `mapUnitRow` — so the label the store reconciles is
    // always freshly derived from the persisted columns.
    expect(src).toMatch(/async updateUnitFields[\s\S]*?return reloadUnit\(/);
    expect(src).toMatch(/async function reloadUnit[\s\S]*?return mapUnitRow\(/);
  });
});

describe("reconcileUnitRow is a SWAP, and the catalog keeps identity", () => {
  it("replaces a stale derived field instead of merging around it", () => {
    const stale: Unit = {
      id: "u1",
      subject: "math",
      name: "Old name",
      weeks: "Wk 9–14",
      startWeek: 9,
      endWeek: 14,
      shade: 2,
      notes: "removed upstream",
    };
    const canonical: Unit = {
      id: "u1",
      subject: "math",
      name: "New name",
      weeks: "Wk 20–25",
      startWeek: 20,
      endWeek: 25,
      shade: 2,
    };
    const next = historyReducer(stateWith([stale]), {
      type: "reconcileUnitRow",
      unitId: "u1",
      unit: canonical,
    });
    const got = next.catalog.units[0];
    expect(got.weeks).toBe("Wk 20–25");
    expect(got.name).toBe("New name");
    // A MERGE would have kept `notes` the server no longer has. A swap does not.
    expect(got.notes).toBeUndefined();
  });

  it("pins the CALLER-VISIBLE id — a source that returns a uuid can't orphan a slug-keyed unit", () => {
    // supabase-source hashes a fixture SLUG → uuid before writing, then maps the
    // reloaded row back AS that uuid. Adopting it would break every reference
    // that still names the slug (`lesson.unit`, activeUnitBySubject, the lanes).
    const next = historyReducer(
      stateWith([
        { id: "u-m3", subject: "math", name: "U", weeks: "Wk 9–14", shade: 2 },
      ]),
      {
        type: "reconcileUnitRow",
        unitId: "u-m3",
        unit: {
          id: "3f0c8a9e-0000-4000-8000-000000000000",
          subject: "math",
          name: "U",
          weeks: "Wk 20–25",
          startWeek: 20,
          endWeek: 25,
          shade: 2,
        },
      },
    );
    expect(next.catalog.units[0].id).toBe("u-m3"); // identity preserved
    expect(next.catalog.units[0].weeks).toBe("Wk 20–25"); // content adopted
  });

  it("no-ops (same state ref) when the unit id is not in the catalog", () => {
    const before = stateWith([
      { id: "u1", subject: "math", name: "U", weeks: "Wk 1", shade: 2 },
    ]);
    const next = historyReducer(before, {
      type: "reconcileUnitRow",
      unitId: "nope",
      unit: { id: "nope", subject: "math", name: "X", weeks: "Wk 2", shade: 2 },
    });
    expect(next).toBe(before);
  });

  // TWO POINTS, not one. The guard below is an EQUALITY check, so a test that
  // only asserted the mismatch case would also pass against a reducer that
  // no-ops on every reconcile — the failure mode that would silently reinstate
  // the whole stale-label bug this file exists to pin. The matching-subject
  // case is the control: it must still SWAP.
  it("swaps when the confirmed row is the same subject (the control)", () => {
    const next = historyReducer(
      stateWith([
        { id: "u1", subject: "math", name: "U", weeks: "Wk 1", shade: 2 },
      ]),
      {
        type: "reconcileUnitRow",
        unitId: "u1",
        unit: {
          id: "u1",
          subject: "math",
          name: "Renamed",
          weeks: "Wk 20–25",
          shade: 2,
        },
      },
    );
    expect(next.catalog.units[0].weeks).toBe("Wk 20–25");
    expect(next.catalog.units[0].name).toBe("Renamed");
  });

  it("REFUSES the swap when the confirmed row belongs to another subject", () => {
    // `id` is deliberately pinned, so an id mismatch is expected and cannot be
    // used to detect a mistargeted row. `subject` can: `UnitPatch` has no
    // `subject` key, so no legitimate write moves a unit between subjects.
    // Swapping here would write a READING unit's name, weeks and big idea into
    // the teacher's MATH unit.
    const before = stateWith([
      { id: "u1", subject: "math", name: "Place Value", weeks: "Wk 1", shade: 2 },
    ]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const next = historyReducer(before, {
      type: "reconcileUnitRow",
      unitId: "u1",
      unit: {
        id: "u1",
        subject: "reading",
        name: "Character Study",
        weeks: "Wk 20–25",
        shade: 2,
      },
    });
    spy.mockRestore();
    expect(next).toBe(before); // same ref — nothing was written at all
    expect(next.catalog.units[0].name).toBe("Place Value");
    expect(next.catalog.units[0].subject).toBe("math");
  });

  it("never touches the document or either history stack", () => {
    const before = stateWith([
      { id: "u1", subject: "math", name: "U", weeks: "Wk 1", shade: 2 },
    ]);
    const next = historyReducer(before, {
      type: "reconcileUnitRow",
      unitId: "u1",
      unit: { id: "u1", subject: "math", name: "U", weeks: "Wk 2", shade: 2 },
    });
    expect(next.history.present).toBe(before.history.present);
    expect(next.history.past).toBe(before.history.past);
    expect(next.history.future).toBe(before.history.future);
    expect(next.catalog.units).not.toBe(before.catalog.units);
  });
});

// ── ONE FORMATTER, FOR REAL THIS TIME ─────────────────────────────────────
// `source.ts` claimed "ONE formatter" while `drag.ts` carried a byte-identical
// copy and THREE callsites spelled the label inline with no `start === end`
// branch — so a one-week unit read "Wk 12" on its card and "Wk 12–12" in the
// timeline drawer, the timeline list and the Needs Attention triage. The
// fixtures reach that case today (lib/mock/units.ts ships spelling's List 12 as
// `weeks: "Wk 12"`), so this was live, not theoretical.
describe("every week-range label goes through the ONE formatter", () => {
  it("plan-timeline's `weeksLabel` IS `unitWeeksLabel` — the same function, not a copy", () => {
    expect(weeksLabel).toBe(unitWeeksLabel);
  });

  it("the one-week case is 'Wk 12' at the formatter", () => {
    expect(weeksLabel(12, 12)).toBe("Wk 12");
    expect(weeksLabel(20, 25)).toBe("Wk 20–25");
    expect(weeksLabel(20, 25)).toContain("–"); // EN DASH, not a hyphen
    expect(weeksLabel(20, 25)).not.toContain("-");
  });

  it("Needs Attention renders a one-week unit as 'Wk 12', never 'Wk 12–12'", () => {
    const subject = { id: "math", name: "Math" } as unknown as Subject;
    const oneWeek = {
      id: "u-s4",
      subject: "math",
      name: "List 12 · Greek Roots",
      weeks: "Wk 12",
      startWeek: 12,
      endWeek: 12,
      shade: 3,
    } as Unit;

    // (a) the off-axis row — a range with no place in the configured year.
    const offAxis = buildNeedsAttention(
      [],
      buildUnitLibrary({
        subjects: [subject],
        units: [{ ...oneWeek, startWeek: 99, endWeek: 99, weeks: "Wk 99" }],
        lessons: [],
        schoolWeekLen: 5,
        axisLength: 50, // 10 weeks — week 99 is off the axis
        now: null,
      }),
    ).find((i) => i.kind === "off_axis_unit");
    expect(offAxis?.detail).toContain("Wk 99,");
    expect(offAxis?.detail).not.toContain("Wk 99–99");

    // (b) the outside-range row — a lesson dated outside its unit's week.
    const stray = {
      id: "l1",
      subject: "math",
      unit: "u-s4",
      title: "Roots review",
      week: 30,
      day: 0,
      status: "not_done",
      objective: "I can",
      resources: [{ id: "r" }],
      standards: ["S1"],
      archived: false,
      modified: false,
      moved: null,
    } as unknown as Lesson;
    const outside = buildNeedsAttention(
      [],
      buildUnitLibrary({
        subjects: [subject],
        units: [oneWeek],
        lessons: [stray],
        schoolWeekLen: 5,
        axisLength: 200,
        now: null,
      }),
    ).find((i) => i.kind === "outside_range");
    expect(outside?.detail).toContain("dated outside Wk 12.");
    expect(outside?.detail).not.toContain("Wk 12–12");
  });

  it("no timeline surface spells the label inline any more", () => {
    // The three inline literals that had no `start === end` branch. A static
    // check because rendering these two components needs the whole hub shell —
    // and because the failure mode is a re-introduced literal, which is exactly
    // what source text can see.
    for (const rel of [
      ["components", "hub-v2", "timeline", "TimelineDrawer.tsx"],
      ["components", "hub-v2", "timeline", "TimelineList.tsx"],
      ["lib", "plan-timeline", "library.ts"],
    ]) {
      const text = readFileSync(join(__dirname, "..", ...rel), "utf8");
      // Strip comments — the prose above each callsite QUOTES the old literal.
      const code = text
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(
        code,
        `${rel.join("/")} still builds a week-range label inline`,
      ).not.toMatch(/Wk \$\{[^}]*\}[–-]\$\{/);
    }
  });
});
