import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement, type ReactNode } from "react";

import type { Lesson, Subject, Unit } from "@/lib/types";
import { mountReact } from "./mount-react";
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
] as unknown as Lesson[];

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: LESSONS,
    subjectById: Object.fromEntries(SUBJECTS.map((s) => [s.id, s])),
    subjects: SUBJECTS,
    units: UNITS,
    describeStandard: (code: string) => code,
    setLessonStatus: () => {},
    relocateLesson: () => {},
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
