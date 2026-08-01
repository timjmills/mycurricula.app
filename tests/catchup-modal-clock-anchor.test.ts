import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement, type ReactNode } from "react";

import type { Lesson, Subject, Unit } from "@/lib/types";
import { mountReact } from "./mount-react";
import { weeksInRange } from "@/lib/year-calendar";
import { CatchUpModalHost } from "@/components/catchup-v2";
import {
  closeCatchupModal,
  openCatchupModal,
} from "@/components/catchup-v2/modal-state";

// A real react-dom/client mount is slow; raised deliberately. Every assertion
// here fails on the ASSERTION, never a timeout, when the behaviour is mutated
// out — see the mutation split recorded at the bottom of this file.
vi.setConfig({ testTimeout: 30000 });

// Task #41, THE CALLSITE HALF.
//
// WHY THIS FILE EXISTS, stated plainly because it is the whole point.
// tests/catchup-scope.test.ts pins the pure functions in lib/catchup-scope and
// pins them well: 33 of its assertions go red against the unfixed module. But
// the bug was never IN that module. It was at the callsite —
// CatchUpModal.tsx passed `useAppState().week`, the BROWSED week, where the
// clock belonged. Reproducing the original defect where it actually lived:
//
//   -  week: todayIsInConfiguredYear(currentWeekBasis) ? currentWeek : null,
//   +  week: todayIsInConfiguredYear(currentWeekBasis) ? week : null,
//
// left the scope suite at 43 passed, 0 red. The redesign that replaced
// `planScope(scope, all, currentWeek, todayCol)` with a `ScopeToday` object
// makes the bug HARDER to express — there is no loose `currentWeek: number`
// parameter left to hand the wrong number to — but "harder" is not
// "impossible": the callsite can still put the wrong value in the right-shaped
// field, and nothing in the suite noticed. Only the live probe caught it, and a
// live probe does not run on every commit.
//
// So this file mounts the SHIPPED CatchUpModalHost and reads what the surface
// renders. It does not re-implement the memo — a test that rebuilt `scopeToday`
// itself would stay green against a reverted fix, which is the failure mode it
// is here to prevent.
//
// WHY THE "This week" CHIP AND NOT "Today". `ScopeToday` has two halves and
// they fail independently: `week` comes from `currentWeek` + `currentWeekBasis`,
// `day` from `todayColumnIndex(new Date(), …)` — the real clock. "Today" needs
// both, so a test built on it would assert nothing on any day when today is not
// in the configured school week (the harness gets the Sun–Thu default, so every
// Friday and Saturday). "This week" needs only `week`, which is exactly the half
// the defect corrupted, and is therefore stable on every day of the year.

const store = vi.hoisted(() => ({
  /** `useAppState().week` — the FOCUSED week the teacher is paging through. */
  browsedWeek: 13,
  /** `useAppState().currentWeek` — where the CLOCK is. */
  clockWeek: 12,
  /** `useAppState().currentWeekBasis` — whether that is a derivation or a clamp. */
  basis: "in-range" as "in-range" | "before-start" | "after-end" | "unconfigured",
  /** Days spanned by the configured academic year. Only the year-end test
   *  narrows it; every other test gets a window wide enough that the year's
   *  edge is nowhere near the clock and cannot interfere. */
  yearSpanDays: 300,
  /** Every `relocateLesson(id, target, keepOriginal)` the surface issued. A
   *  recorder rather than a no-op because the Reschedule tests below are about
   *  WHICH WEEK gets written — a value the rendered HTML never shows. */
  relocations: [] as Array<{
    id: string;
    target: { day?: number; subject?: string; week?: number };
    keepOriginal: boolean;
  }>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/weekly",
  useSearchParams: () => new URLSearchParams(),
}));

// The two fields are deliberately DIFFERENT numbers. Making them differ is the
// entire experiment: with `week === currentWeek` the mutation at the top of
// this file would be invisible, and every assertion below would pass against
// the bug.
vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    week: store.browsedWeek,
    currentWeek: store.clockWeek,
    currentWeekBasis: store.basis,
  }),
}));

// The ONE mock that stands in for real config rather than for a hook the node
// environment cannot run. `useAcademicYear` reads localStorage in a post-mount
// effect, and the harness installs `window` per mount — so a test cannot write
// the year before the component reads it. Mocking the hook is also the honest
// scope: what is under test is CatchUpModal's arithmetic against the year's
// LENGTH, not lib/use-academic-year's storage lifecycle, which has its own
// suite. `weeksInRange` is NOT mocked — the bound the component checks is the
// same function every calendar surface counts columns with.
vi.mock("@/lib/use-academic-year", () => ({
  useAcademicYear: () => {
    const start = new Date();
    return {
      start,
      end: new Date(start.getTime() + store.yearSpanDays * 24 * 60 * 60 * 1000),
      setStart: () => {},
      setEnd: () => {},
    };
  },
}));

const SUBJECTS = [
  { id: "math", name: "Math", cls: "math", color: "var(--subj-1)" },
] as unknown as Subject[];

const UNITS: Unit[] = [
  { id: "u-m3", subject: "math", name: "Fractions", weeks: "Wk 11–16", shade: 2 },
];

/** Two uncovered lessons, one in the CLOCK's week and one in the BROWSED week.
 *  Both are inside `deriveCatchupItems`' horizon (`lesson.week <= browsedWeek`),
 *  so both reach the surface and the chip has to CHOOSE — which is what makes
 *  this value-vs-value rather than an absence. */
const LESSONS = [
  {
    id: "l-clock",
    subject: "math",
    unit: "u-m3",
    week: 12,
    day: 0,
    title: "CLOCK-WEEK-LESSON",
    preview: "",
    objective: "",
    status: "not_done",
    standards: [],
    resources: [],
    reasonNotDone: "",
    isPersonal: false,
    modified: false,
    archived: false,
  },
  {
    id: "l-browsed",
    subject: "math",
    unit: "u-m3",
    week: 13,
    day: 0,
    title: "BROWSED-WEEK-LESSON",
    preview: "",
    objective: "",
    status: "not_done",
    standards: [],
    resources: [],
    reasonNotDone: "",
    isPersonal: false,
    modified: false,
    archived: false,
  },
  {
    // Early in the year, so it stays inside the horizon when the teacher pages
    // BACK behind the clock — the arrangement in which the Reschedule defect
    // wrote a lesson into the PAST. The two lessons above are both at or after
    // the clock and cannot reach that state.
    id: "l-early",
    subject: "math",
    unit: "u-m3",
    week: 3,
    day: 0,
    title: "EARLY-WEEK-LESSON",
    preview: "",
    objective: "",
    status: "not_done",
    standards: [],
    resources: [],
    reasonNotDone: "",
    isPersonal: false,
    modified: false,
    archived: false,
  },
] as unknown as Lesson[];

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: LESSONS,
    subjectById: Object.fromEntries(SUBJECTS.map((s) => [s.id, s])),
    subjects: SUBJECTS,
    units: UNITS,
    describeStandard: (code: string) => code,
    setLessonStatus: () => {},
    relocateLesson: (
      id: string,
      target: { day?: number; subject?: string; week?: number },
      keepOriginal: boolean,
    ) => {
      store.relocations.push({ id, target, keepOriginal });
    },
    bumpLesson: () => {},
  }),
  usePlannerDataState: () => "settled",
  scrollPlannerItemIntoView: () => {},
}));

vi.mock("@/lib/catchup-state", () => ({
  useCatchup: () => ({ actions: new Map() }),
}));

// `useSchoolWeek` / `useOrderedWeekdays` are NOT mocked. They are SSR-safe and
// fall back to the Sun–Thu default with an empty localStorage, which the
// harness provides — so the configured week here is the real one the app would
// use, not a stand-in that could drift from it.

/**
 * The modal portals into `document.querySelector(".cp-root") ?? document.body`.
 * Giving the harness's own container that class keeps the portal INSIDE the
 * mount, so `html()` sees it and the assertions read the mounted tree rather
 * than a document-wide search that could pick up a leaked previous mount.
 */
function Tree(): ReactNode {
  return createElement("div", { className: "cp-root" }, createElement(CatchUpModalHost));
}

let live: Awaited<ReturnType<typeof mountReact<Record<string, never>>>> | null =
  null;

/** Mount with the modal OPEN. `open` is singleton module state, not a prop, so
 *  it is flushed through `act` like any other external store write. */
async function mountOpen() {
  live = await mountReact(Tree);
  await live.render({});
  await act(async () => {
    openCatchupModal();
  });
  return live;
}

// Teardown in afterEach, never inline: a failed `expect` throws, so an inline
// unmount is skipped on exactly the path where the leak matters. The open flag
// is module state and outlives the mount.
afterEach(async () => {
  if (live) {
    const dom = live;
    live = null;
    await dom.unmount();
  }
  closeCatchupModal();
  store.browsedWeek = 13;
  store.clockWeek = 12;
  store.basis = "in-range";
  store.yearSpanDays = 300;
  store.relocations.length = 0;
});

/** Click a scope chip by its exact visible label. `mountReact.click` throws
 *  when nothing matches, so a renamed chip fails loudly instead of silently
 *  asserting against the default scope. */
const pickScope = (dom: NonNullable<typeof live>, label: string) =>
  dom.click((el) => el.textContent?.trim() === label);

describe("CatchUpModal anchors its scope chips to the clock, not the browsed week", () => {
  it("'This week' shows the CLOCK's week while the planner browses another", async () => {
    const dom = await mountOpen();

    // POSITIVE CONTROL, first and in the same mount: both lessons are on the
    // surface under the default "Everything" scope. Without this, the
    // assertion below would also pass on a modal that rendered nothing at all,
    // or one whose horizon had dropped the browsed week's lesson — neither of
    // which has anything to do with the anchor.
    const everything = dom.html();
    expect([
      everything.includes("CLOCK-WEEK-LESSON"),
      everything.includes("BROWSED-WEEK-LESSON"),
    ]).toEqual([true, true]);

    await pickScope(dom, "This week");

    // The discriminator. Both candidates were available a moment ago; the chip
    // must keep the clock's and drop the browsed one. Asserted as a pair in one
    // expression so neither half can be read alone.
    const thisWeek = dom.html();
    expect([
      thisWeek.includes("CLOCK-WEEK-LESSON"),
      thisWeek.includes("BROWSED-WEEK-LESSON"),
    ]).toEqual([true, false]);
  });

  it("follows the CLOCK when the clock moves, with the browsed week somewhere else again", async () => {
    // The same property from the other side, and with the two numbers still
    // DISTINCT — an arrangement where `week === currentWeek` cannot tell the
    // fields apart, so it would pass against the defect and prove nothing. Here
    // the clock is on 13 and the planner is browsing 14: the answer must be the
    // week-13 lesson, and under the defect it would be week 14's, which is
    // nothing at all.
    store.clockWeek = 13;
    store.browsedWeek = 14;
    const dom = await mountOpen();

    // Control first, in the same mount: the horizon (≤ 14) still holds both
    // lessons, so both answers remain available to choose between.
    const everything = dom.html();
    expect([
      everything.includes("CLOCK-WEEK-LESSON"),
      everything.includes("BROWSED-WEEK-LESSON"),
    ]).toEqual([true, true]);

    await pickScope(dom, "This week");
    const clockOn13 = dom.html();
    expect([
      clockOn13.includes("BROWSED-WEEK-LESSON"), // the wk13 lesson IS now the clock's
      clockOn13.includes("CLOCK-WEEK-LESSON"), // the wk12 one is not
    ]).toEqual([true, false]);
  });

  it("says it does not know, rather than 'all caught up', when today is outside the year", async () => {
    // The other half of the same line: `currentWeekBasis` is a CLAMP here, so
    // `currentWeek` is "showing Week 1", not where now is. Dropping the guard
    // would silently anchor the chip to a clamp.
    store.basis = "before-start";
    store.clockWeek = 1;
    const dom = await mountOpen();
    await pickScope(dom, "This week");

    const html = dom.html();
    expect([
      html.includes("isn’t inside your school year"),
      html.includes("All caught up"),
      html.includes("CLOCK-WEEK-LESSON"),
      html.includes("BROWSED-WEEK-LESSON"),
    ]).toEqual([true, false, false, false]);
  });

  it("CONTROL — 'Everything' is unaffected by the anchor in every one of those states", async () => {
    // Proves the three assertions above are about the CLOCK-ANCHORED chips and
    // not about the modal having stopped rendering. Same out-of-year state as
    // the previous test, where the surface is at its emptiest.
    store.basis = "before-start";
    store.clockWeek = 1;
    const dom = await mountOpen();

    const html = dom.html();
    expect([
      html.includes("CLOCK-WEEK-LESSON"),
      html.includes("BROWSED-WEEK-LESSON"),
      html.includes("isn’t inside your school year"),
    ]).toEqual([true, true, false]);
  });
});

// ── Reschedule: the same conflation, but it WRITES ──────────────────────────
//
// Task #55. The row's Reschedule action promises, in its own tooltip, to "Move
// this lesson forward to next week so it lands back on the calendar". It was
// implemented as `relocateLesson(id, { week: week + 1 })` — `week` being the
// BROWSED week. So "next week" meant "the week after whichever one you are
// looking at", and the modal is reachable from the global Tools menu on routes
// that show no week at all.
//
// The destination is not visible in the rendered HTML, so these tests read the
// recorded `relocateLesson` call. Every case below fixes ONE clock week and
// varies the browsed week: the target must not move. That is the whole property,
// and it is the one a `focusedWeek` rename would otherwise have to be trusted
// to preserve by hand.

/** Click a row's action pill by its aria-label (`"<Action>: <title>"`). Throws
 *  when nothing matches, so a relabelled pill fails loudly. */
const clickAction = (
  dom: NonNullable<typeof live>,
  action: string,
  title: string,
) => dom.click((el) => el.getAttribute("aria-label") === `${action}: ${title}`);

describe("CatchUpModal reschedules relative to the clock, not the browsed week", () => {
  it("targets the week after TODAY's — the same answer from two different browsed weeks", async () => {
    // Both halves in ONE evaluation, because the property is INVARIANCE and a
    // single reading cannot express it. The clock sits on 12 in both, so the
    // only correct answer is 13 twice. Under the defect these are 14 and 21 —
    // a pair that differs from each other, which is exactly what makes the
    // assertion a discriminator rather than a spot check.
    store.clockWeek = 12;
    store.browsedWeek = 13;
    let dom = await mountOpen();
    await clickAction(dom, "Reschedule", "CLOCK-WEEK-LESSON");
    await dom.unmount();
    live = null;
    closeCatchupModal();

    store.browsedWeek = 20; // clock unchanged; only the paging moved
    dom = await mountOpen();
    await clickAction(dom, "Reschedule", "CLOCK-WEEK-LESSON");

    expect(store.relocations.map((r) => r.target.week)).toEqual([13, 13]);
    // Same lesson, and a MOVE rather than a copy — a `keepOriginal` of true
    // would leave the gap in place and quietly duplicate the lesson.
    expect(store.relocations.map((r) => [r.id, r.keepOriginal])).toEqual([
      ["l-clock", false],
      ["l-clock", false],
    ]);
  });

  it("does not bury a lesson in the PAST when the teacher has paged back behind today", async () => {
    // The harmful shape, stated as a date rather than an offset. Today is week
    // 12; the teacher is reviewing week 5 and triaging a week-3 gap. `week + 1`
    // sends it to week 6 — seven weeks BEHIND today, still uncovered, and the
    // row leaves the list (6 > the week-5 horizon) so the write looks like it
    // worked. The destination must be a genuinely future week.
    store.clockWeek = 12;
    store.browsedWeek = 5;
    const dom = await mountOpen();

    // CONTROL, same mount: the row is actually on screen and inside the
    // horizon. Without it the click below could throw for an unrelated reason
    // and the failure would read as a scheduling bug.
    expect(dom.html().includes("EARLY-WEEK-LESSON")).toBe(true);

    await clickAction(dom, "Reschedule", "EARLY-WEEK-LESSON");

    const target = store.relocations[0]?.target.week;
    expect(target).toBe(13);
    // Asserted independently of the exact number, because "not in the past" is
    // the property that matters and it must not depend on 13 staying 13.
    expect(target !== undefined && target > store.clockWeek).toBe(true);
  });

  it("refuses to guess — and says why — when today is outside the configured year", async () => {
    // `currentWeekBasis` is a CLAMP here, so `currentWeek` is "showing Week 1",
    // not where now is. There is no defensible "next week", and this action
    // MOVES a team-visible lesson, so it disables rather than writing a guess.
    store.basis = "before-start";
    store.clockWeek = 1;
    store.browsedWeek = 13;
    const dom = await mountOpen();

    const html = dom.html();
    const pill = [...(html.matchAll(/<button[^>]*aria-label="Reschedule[^>]*>/g))].map(
      (m) => m[0],
    );

    // POSITIVE CONTROL for the absence assertion, in the same evaluation: Mark
    // taught needs no clock and must still be live. A modal that rendered no
    // pills at all would satisfy "Reschedule is disabled" while proving nothing.
    const taught = [...html.matchAll(/<button[^>]*aria-label="Mark taught[^>]*>/g)].map(
      (m) => m[0],
    );
    expect([
      pill.length > 0,
      pill.every((p) => p.includes(`aria-disabled="true"`)),
      taught.length > 0,
      taught.some((t) => t.includes(`aria-disabled="true"`)),
    ]).toEqual([true, true, true, false]);

    // The disabled control explains itself (CLAUDE.md §4) rather than sitting
    // there dead.
    expect(html).toContain("outside this curriculum’s academic year");

    // And nothing was written. Paired with the control above so the emptiness
    // cannot be satisfied by a surface that simply never rendered the row.
    await clickAction(dom, "Mark taught", "EARLY-WEEK-LESSON");
    expect(store.relocations).toEqual([]);
  });

  it("refuses at the LAST week of the year rather than placing a lesson off the calendar", async () => {
    // From the §4a review gate. `currentWeek + 1` is only a real destination
    // while a next week exists. In the final configured week it is
    // `totalWeeks + 1`, which no surface draws — the Weekly navigator, the Year
    // columns and `dateForWeekDay` all count `weeksInRange(start, end)` — so the
    // lesson would not be rescheduled, it would vanish.
    //
    // A THREE-week year with the clock in its last column. Both numbers are
    // relative to the span, never to a date, so this keeps its meaning on any
    // run day. `weeksInRange` is real, so 3 here is the same 3 the Year view
    // would draw.
    // 10 days ⇒ 3 week columns under `weeksInRange`'s ceil(+1) convention, and
    // comfortably inside the (7, 14] band so millisecond jitter between the
    // mock's `new Date()` and this one cannot flip the count. Asserted rather
    // than assumed just below.
    store.yearSpanDays = 10;
    store.basis = "in-range"; // NOT a clamp — this arm is about the year's edge
    store.clockWeek = 3; // the last of the three columns
    // Browsed == clock here, deliberately. The browsed/clock DISTINCTION is the
    // subject of the three tests above; this one is about the year's edge, and
    // a browsed week outside a three-week year would be an incoherent state
    // that no teacher can reach. It also has to be ≥ 3 or the week-3 fixture
    // falls outside `deriveCatchupItems`' horizon and no row renders at all —
    // which is exactly what the EARLY-WEEK-LESSON control below catches.
    store.browsedWeek = 3;

    // THE PREMISE, asserted rather than assumed. If `weeksInRange`'s convention
    // ever changes, `clockWeek` stops being the last column and every assertion
    // below would quietly pass for the wrong reason.
    const spanStart = new Date();
    expect(
      weeksInRange(
        spanStart,
        new Date(spanStart.getTime() + store.yearSpanDays * 24 * 60 * 60 * 1000),
      ),
    ).toBe(store.clockWeek);

    const dom = await mountOpen();
    const html = dom.html();
    const pills = [
      ...html.matchAll(/<button[^>]*aria-label="Reschedule[^>]*>/g),
    ].map((m) => m[0]);

    // Controls in the same evaluation: a week-3 clock IS in range and the rows
    // ARE on screen, so what refuses here is the year's edge — not the clamp
    // arm above firing again (its wording must be absent), and not an empty
    // modal (which would satisfy "all disabled" with nothing to disable).
    expect([
      pills.length > 0,
      pills.every((p) => p.includes(`aria-disabled="true"`)),
      html.includes("EARLY-WEEK-LESSON"),
      html.includes("last week of the school year"),
      html.includes("outside this curriculum’s academic year"),
    ]).toEqual([true, true, true, true, false]);
  });
});

// ── Mutation split, measured against this file ──────────────────────────────
//
// 1. THE DEFECT VERBATIM, at components/catchup-v2/CatchUpModal.tsx:521 —
//      -  week: todayIsInConfiguredYear(currentWeekBasis) ? currentWeek : null,
//      +  week: todayIsInConfiguredYear(currentWeekBasis) ? week : null,
//    → 2 failed, 2 passed.
//      FAIL  'This week' shows the CLOCK's week while the planner browses another
//            AssertionError: expected [ false, true ] to deeply equal [ true, false ]
//      FAIL  follows the CLOCK when the clock moves, …
//            AssertionError: expected [ false, false ] to deeply equal [ true, false ]
//    The two that pass are the out-of-year arm — where the guard returns null
//    whichever field is read, so the defect genuinely cannot show there — and
//    the "Everything" control, which is what a control is for.
//
// 2. DROPPING THE BASIS GUARD —
//      -  week: todayIsInConfiguredYear(currentWeekBasis) ? currentWeek : null,
//      +  week: currentWeek,
//    → 1 failed, 3 passed: the out-of-year arm, printing "All caught up" where
//      it must print that it does not know.
//      AssertionError: expected [ false, true, false, false ]
//                      to deeply equal [ true, false, false, false ]
//
// Both restored by inverse edit — never `git checkout`, which resolves against
// HEAD and would take sibling lanes' uncommitted work with it. `git status`
// confirmed the file byte-identical to HEAD afterwards, and all 4 pass again.
//
// A NOTE ON HOW THE SECOND TEST WAS FIRST WRITTEN, because it is the same trap
// this file exists to close. Its first draft set `clockWeek` and `browsedWeek`
// BOTH to 13. With the two numbers equal, mutation 1 is unobservable — the test
// passed against the defect and contributed nothing, and the split was 1 failed
// rather than 2. Two fields only distinguish themselves when they hold
// different values.
