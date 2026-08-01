import { describe, it, expect, vi, beforeEach } from "vitest";

import { mountReact } from "./mount-react";
import type { Lesson, Subject, Unit } from "@/lib/types";

// `rescheduleUnit` — what a unit-band DRAG actually writes, and the refusal
// that stands between a Reading drag and a rewritten Math unit.
//
// WHY THIS FILE EXISTS. The function was WHOLLY untested. `tests/plan-timeline-drag.test.ts`
// pins the drag MATHS and `tests/plan-timeline-authoring.test.ts` pins whether
// the drag AFFORDANCE renders — neither goes anywhere near the write. The gap
// mattered most at one line:
//
//   the store's unit seam is keyed by `unitId` ALONE (its reducer resolves the
//   row with `units.findIndex(u => u.id === action.unitId)`), and a unit slug
//   is unique only WITHIN a subject. Under the mock these ids are slugs and
//   DO collide — lib/mock ships a "u-1" under more than one subject. So a drag
//   on Reading's "u-1" would have re-scheduled MATH's "u-1": a silent,
//   team-wide, wrong edit to shared curriculum, produced by a gesture whose
//   only feedback is a bar sliding sideways. `rescheduleUnit` refuses that
//   write and says why. Nothing tested the refusal.
//
// HOW IT IS DRIVEN. `rescheduleUnit` is an inner `useCallback`, not an export,
// so it is reachable only through the prop PlanTimeline hands to
// `TimelineCanvas`. That component is stubbed here with a keyboard-free button
// per scenario that calls the REAL callback with fixed arguments — so the
// wiring under test is PlanTimeline's own (`onRescheduleUnit={rescheduleUnit}`)
// and the body under test is the shipped one. Nothing about the guard, the
// patch shape or the copy is duplicated in this file.
//
// A REAL MOUNT is required twice over: the callback closes over refs that only
// exist after an effect, and the click has to reach a live handler.
// `renderToStaticMarkup` provides neither.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  units: [] as Unit[],
  /** Every `editUnitFields` call, in order. */
  patches: [] as { unitId: string; patch: Record<string, unknown> }[],
  /** Whether the write seam reports success. */
  writeOk: true,
}));

const toasts = vi.hoisted(() => ({
  /** Every message shown, in order. */
  messages: [] as string[],
  /** The undo callback offered with the LAST toast, if any. */
  lastUndo: null as null | (() => void),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: Object.fromEntries(store.subjects.map((s) => [s.id, s])),
    units: store.units,
    getSections: () => [],
    // FAITHFUL TO THE REAL SEAM, and that is the whole point of the collision
    // test: planner-store's reducer resolves the target with
    // `units.findIndex(u => u.id === action.unitId)` — by id ALONE, with no
    // subject in the predicate. This mock applies the patch the same way, IN
    // PLACE (so the callback's `unitsRef` sees it without a re-render), which
    // is what makes a colliding write land on the wrong subject's unit here
    // exactly as it would in the app.
    editUnitFields: (
      unitId: string,
      patch: Record<string, unknown>,
      done?: (ok: boolean) => void,
    ) => {
      store.patches.push({ unitId, patch });
      if (store.writeOk) {
        const target = store.units.find((u) => u.id === unitId);
        if (target) Object.assign(target, patch);
      }
      done?.(store.writeOk);
    },
  }),
  usePlannerDataState: () => "settled",
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({
    week: 3,
    currentWeek: 3,
    currentWeekBasis: "in-range",
    editMode: "master",
  }),
}));

vi.mock("@/lib/undo-toast", () => ({
  useUndoToastOptional: () => ({
    showUndoToast: (t: { message: string; onUndo?: () => void }) => {
      toasts.messages.push(t.message);
      toasts.lastUndo = t.onUndo ?? null;
    },
  }),
}));

// The seam. Each button invokes the REAL `rescheduleUnit` with one scenario's
// arguments; nothing else about the canvas is exercised or asserted.
const RESCHEDULES: {
  label: string;
  args: [string, string, { start: number; end: number }, string];
}[] = [
  ["math-move", ["math", "u-1", { start: 5, end: 6 }, "move"]],
  ["reading-move", ["reading", "u-1", { start: 5, end: 6 }, "move"]],
  ["math-resize", ["math", "u-1", { start: 1, end: 4 }, "resize"]],
  ["math-noop", ["math", "u-1", { start: 1, end: 2 }, "move"]],
  ["ghost-move", ["math", "does-not-exist", { start: 5, end: 6 }, "move"]],
  ["noweeks-move", ["math", "u-nw", { start: 5, end: 6 }, "move"]],
].map(([label, args]) => ({
  label: label as string,
  args: args as [string, string, { start: number; end: number }, string],
}));

vi.mock("@/components/hub-v2/timeline/TimelineCanvas", async () => {
  const { createElement: h } = await import("react");
  return {
    TimelineCanvas: ({
      onRescheduleUnit,
    }: {
      onRescheduleUnit: (
        subject: string,
        unitId: string,
        next: { start: number; end: number },
        kind: string,
      ) => void;
    }) =>
      h(
        "div",
        null,
        RESCHEDULES.map((r) =>
          h(
            "button",
            {
              key: r.label,
              type: "button",
              onClick: () => onRescheduleUnit(...r.args),
            },
            r.label,
          ),
        ),
      ),
  };
});

const { PlanTimeline } = await import(
  "@/components/hub-v2/timeline/PlanTimeline"
);

// ── Fixtures ────────────────────────────────────────────────────────────────

function subject(id: string, name: string): Subject {
  return { id, name, cls: `s-${id}`, icon: name[0] } as unknown as Subject;
}

/** THE COLLISION FIXTURE: two subjects, one unit slug. Legitimate data — unit
 *  ids are namespaced by subject — and fatal to any resolution keyed on the
 *  bare id. */
const MATH_U1 = {
  id: "u-1",
  subject: "math",
  name: "Math · Place Value",
  weeks: "Wk 1–2",
  startWeek: 1,
  endWeek: 2,
  shade: 2,
} as unknown as Unit;

const READING_U1 = {
  id: "u-1",
  subject: "reading",
  name: "Reading · Realistic Fiction",
  weeks: "Wk 3–4",
  startWeek: 3,
  endWeek: 4,
  shade: 2,
} as unknown as Unit;

/** A unit with NO stored week range — the branch that must offer no Undo. */
const NO_WEEKS = {
  id: "u-nw",
  subject: "math",
  name: "Math · Unscheduled",
  weeks: "",
  shade: 2,
} as unknown as Unit;

function lesson(over: Partial<Lesson> & Pick<Lesson, "id">): Lesson {
  return {
    subject: "math",
    unit: "u-1",
    title: "Rounding",
    week: 1,
    day: 0,
    status: "not_done",
    objective: "I can round",
    resources: [{ id: "r" }],
    standards: ["S1"],
    archived: false,
    modified: false,
    moved: null,
    ...over,
  } as unknown as Lesson;
}

async function mount(): Promise<{
  click: (label: string) => Promise<void>;
  unmount: () => Promise<void>;
}> {
  const h = await mountReact(PlanTimeline as never);
  await h.render({ query: "", onOpenDoc: () => {} } as never);
  return {
    click: async (label) => {
      await h.click((el) => el.textContent === label);
    },
    unmount: h.unmount,
  };
}

beforeEach(() => {
  store.subjects = [subject("math", "Math"), subject("reading", "Reading")];
  // CLONED per test: `editUnitFields` above patches in place, so sharing the
  // fixture objects would let one test's write decide the next test's answer.
  store.units = [{ ...MATH_U1 }, { ...NO_WEEKS }];
  store.lessons = [lesson({ id: "l1" })];
  store.patches = [];
  store.writeOk = true;
  toasts.messages = [];
  toasts.lastUndo = null;
});

// ── 1. The write a drag performs ────────────────────────────────────────────

describe("rescheduleUnit — the write a unit drag performs", () => {
  it("patches ONLY the two week numbers, and says what moved", async () => {
    const h = await mount();
    try {
      await h.click("math-move");

      // `Unit.weeks` is the DISPLAY collapse, derived by whichever source
      // confirms the write. A caller that supplied it too would let the mock
      // and the Supabase path disagree about the same write.
      expect(store.patches).toEqual([
        { unitId: "u-1", patch: { startWeek: 5, endWeek: 6 } },
      ]);
      expect(toasts.messages).toHaveLength(1);
      expect(toasts.messages[0]).toContain("Math · Place Value");
      expect(toasts.messages[0]).toContain("moved to");
    } finally {
      await h.unmount();
    }
  });

  it("calls a RESIZE 'now runs', not 'moved to'", async () => {
    // The two gestures have different consequences and the copy is the only
    // thing that tells them apart after the fact.
    const h = await mount();
    try {
      await h.click("math-resize");
      expect(toasts.messages[0]).toContain("now runs");
      expect(toasts.messages[0]).not.toContain("moved to");
    } finally {
      await h.unmount();
    }
  });

  it("writes NOTHING when the range did not actually change", async () => {
    // A drag that lands back where it started is the commonest gesture on this
    // surface. Writing it would burn an undo step, touch shared curriculum, and
    // show a toast reporting a move that did not happen.
    const h = await mount();
    try {
      await h.click("math-noop");
      expect(store.patches).toEqual([]);
      expect(toasts.messages).toEqual([]);
    } finally {
      await h.unmount();
    }
  });

  it("writes NOTHING for a unit id that does not resolve", async () => {
    const h = await mount();
    try {
      await h.click("ghost-move");
      expect(store.patches).toEqual([]);
      expect(toasts.messages).toEqual([]);
    } finally {
      await h.unmount();
    }
  });

  it("counts the lessons the move leaves behind, in the toast", async () => {
    // The divergence a week-granularity drag CREATES: the bar moves, the
    // lessons do not. "Moved" alone gives a teacher nothing to judge an undo by.
    store.lessons = [
      lesson({ id: "l1", week: 1 }),
      lesson({ id: "l2", week: 1 }),
    ];
    const h = await mount();
    try {
      await h.click("math-move"); // → weeks 5–6; both lessons stay in week 1
      expect(toasts.messages[0]).toContain("2 lessons still dated outside");
    } finally {
      await h.unmount();
    }
  });
});

// ── 2. The same-slug refusal ────────────────────────────────────────────────

describe("rescheduleUnit — a colliding unit id is refused, never guessed", () => {
  it("does not write when another subject carries the same unit id", async () => {
    store.units = [{ ...MATH_U1 }, { ...READING_U1 }, { ...NO_WEEKS }];
    const h = await mount();
    try {
      await h.click("reading-move");

      // THE WHOLE POINT: no patch at all. The store's seam takes only the id,
      // so this write would have landed on MATH's unit — a different subject's
      // shared curriculum, silently re-scheduled by a Reading gesture.
      expect(store.patches, "a colliding write reached the store").toEqual([]);
      // And it is REFUSED OUT LOUD. A silent no-op reads as a broken drag and
      // the teacher tries again.
      expect(toasts.messages).toHaveLength(1);
      expect(toasts.messages[0]).toContain("Could not re-plan");
      expect(toasts.messages[0]).toContain("same id");
    } finally {
      await h.unmount();
    }
  });

  it("names the RIGHT unit in the refusal — the one that was dragged", async () => {
    // Resolving the name off the bare id would print "Math · Place Value" in a
    // message about a Reading drag, which is the same bug wearing a label.
    store.units = [{ ...MATH_U1 }, { ...READING_U1 }, { ...NO_WEEKS }];
    const h = await mount();
    try {
      await h.click("reading-move");
      expect(toasts.messages[0]).toContain("Reading · Realistic Fiction");
      expect(toasts.messages[0]).not.toContain("Math · Place Value");
    } finally {
      await h.unmount();
    }
  });

  it("STILL WRITES the unit the id DOES resolve to, in the very same collision", async () => {
    // THE ANTI-OVERSHOOT DIRECTION, and it is deliberately run against the
    // collision fixture rather than a clean one. A guard that refused any
    // colliding id outright would pass both tests above while stopping BOTH
    // subjects' units from ever being dragged again — a whole surface disabled
    // by one duplicate slug.
    //
    // The rule is narrower than that: the store resolves by `findIndex`, so the
    // FIRST unit carrying the id is the one a write reaches. For Math that IS
    // the unit being dragged, so the write is safe and proceeds; for Reading it
    // is not, so the write is refused. One fixture, both answers.
    store.units = [{ ...MATH_U1 }, { ...READING_U1 }, { ...NO_WEEKS }];
    const h = await mount();
    try {
      await h.click("reading-move");
      expect(store.patches, "the unreachable one is refused").toEqual([]);

      await h.click("math-move");
      expect(store.patches, "the reachable one still writes").toEqual([
        { unitId: "u-1", patch: { startWeek: 5, endWeek: 6 } },
      ]);
      expect(toasts.messages.at(-1)).toContain("Math · Place Value");
      expect(toasts.messages.at(-1)).not.toContain("same id");
    } finally {
      await h.unmount();
    }
  });
});

// ── 3. The undo it offers, and the one it refuses to offer ──────────────────

describe("rescheduleUnit — the undo is real or it is absent", () => {
  it("offers an undo that restores the ORIGINAL range", async () => {
    const h = await mount();
    try {
      await h.click("math-move");
      expect(toasts.lastUndo, "no undo was offered").toBeTypeOf("function");

      store.patches = [];
      toasts.lastUndo?.();

      // The unit is still at 5–6 in the fixture (the mock store does not apply
      // patches), which is what the stale guard compares against — so the undo
      // proceeds and writes the range back.
      expect(store.patches).toEqual([
        { unitId: "u-1", patch: { startWeek: 1, endWeek: 2 } },
      ]);
    } finally {
      await h.unmount();
    }
  });

  it("offers NO undo for a unit that had no week range to return to", async () => {
    // `start_week` / `end_week` are NOT NULL, so "back to having no weeks" is
    // not a state this patch can express. An Undo that silently did something
    // else would be worse than no Undo — and this is the one control on the
    // surface whose entire job is to be trustworthy.
    const h = await mount();
    try {
      await h.click("noweeks-move");
      // CONTROL: the write itself DID happen, so the missing undo is a
      // deliberate omission rather than the whole action having been skipped.
      expect(store.patches).toEqual([
        { unitId: "u-nw", patch: { startWeek: 5, endWeek: 6 } },
      ]);
      expect(toasts.messages).toHaveLength(1);
      expect(toasts.lastUndo).toBeNull();
    } finally {
      await h.unmount();
    }
  });

  it("reports a REFUSED write instead of showing a success toast", async () => {
    // An RLS denial, or a mode flip between the gesture and the write. Silent,
    // the bar sits where the drag put it and the teacher believes it saved.
    store.writeOk = false;
    const h = await mount();
    try {
      await h.click("math-move");
      expect(toasts.messages).toHaveLength(1);
      expect(toasts.messages[0]).toContain("was not saved");
      expect(toasts.messages[0]).not.toContain("moved to");
      expect(toasts.lastUndo).toBeNull();
    } finally {
      await h.unmount();
    }
  });
});
