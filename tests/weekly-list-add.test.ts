import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mountReact } from "./mount-react";

// 30s, matching the other mount-based suites — a real mount plus a click
// sequence breaches vitest's 5s default under parallel lane load. Not a hang
// mask: these fail on an ASSERTION when the behaviour is mutated out.
vi.setConfig({ testTimeout: 30000 });
import type { Lesson, Subject } from "@/lib/types";

// WeeklyList had no way to add a lesson — on the surface that most teachers
// are the only one they can reach.
//
// The QA finding was "the Week add affordance does not exist below 900px", and
// read literally that sounds like a breakpoint bug in one of the three Week
// frames. It is not — it is a bug in this CANVAS, and it has two independent
// causes. That matters for this file because only one of them is guaranteed to
// be true when you read it.
//
//   1. WIDTH-INDEPENDENT, and permanent: `WeeklyShell`'s `showList` is true
//      whenever the teacher picks List from the Grid|List toggle, at ANY
//      viewport. A desktop teacher in List mode had no add affordance at all.
//      No report mentioned this half. It is the reason the fix belongs to the
//      canvas rather than to a breakpoint, and it does not depend on any
//      other change.
//
//   2. THE ≤900px GATE: `showList = isNarrow || viewMode === "list"` returned
//      <WeeklyList /> below 900px for EVERY frame, unmounting all three frames'
//      add affordances on every phone and tablet. Whether that gate still
//      exists depends on a SEPARATE change to `WeeklyShell.tsx` that may or may
//      not have landed alongside this. Nothing below asserts it — these tests
//      are about what THIS component offers, which is true either way.
//
// This pins BOTH halves of the fix, because half of it is a false pass:
//   1. the trigger renders in EVERY configured school day — a single add
//      button somewhere on the surface would satisfy a naive "is there an Add"
//      assertion while leaving the other days dead; and
//   2. it renders in a day with NO lessons, which is the case that motivates
//      the finding. An add row that only appears once a day already has a
//      lesson cannot bootstrap an empty week.
//
// The day count is deliberately NOT five. CLAUDE.md §6 forbids hard-coding the
// school week, so the fixture runs a THREE-day week: an affordance derived
// from a hard-coded weekday set would render five triggers here and fail
// loudly rather than silently agreeing with a 5-day fixture.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  /** Every `addLesson` call, in order — READ by the wiring block at the bottom. */
  added: [] as { subject: string; week: number; day: number }[],
  /** Set when addLesson should report failure (returns null). */
  failNext: false,
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    addLesson: async (draft: { subject: string; week: number; day: number }) => {
      store.added.push({
        subject: draft.subject,
        week: draft.week,
        day: draft.day,
      });
      return store.failNext ? null : { id: `new-${store.added.length}` };
    },
  }),
  // Read by <PlannerEmpty> (the empty-day state). "settled" so the empty day
  // renders its real copy rather than a hydrate skeleton — this suite is about
  // the add affordance, and a skeleton would hide the day sections entirely.
  usePlannerDataState: () => "settled",
  scrollPlannerItemIntoView: () => {},
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    week: 12,
    setSelectedDay: () => {},
    setSelectedLessonId: () => {},
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

// A THREE-day school week — see the header note. `index` is the value a
// lesson's `day` field must equal to land in that section.
const WEEKDAYS = [
  { token: "sun", index: 0, label: "Sun", longLabel: "Sunday" },
  { token: "mon", index: 1, label: "Mon", longLabel: "Monday" },
  { token: "tue", index: 2, label: "Tue", longLabel: "Tuesday" },
];

vi.mock("@/lib/week-order", () => ({
  useOrderedWeekdays: () => WEEKDAYS,
}));

vi.mock("@/lib/use-day-holiday", () => ({
  useHolidaysByDay: () => new Map(),
}));

vi.mock("@/lib/labels", () => ({
  useLabels: () => ({ lesson: "Lesson", week: "Week", unit: "Unit" }),
}));

// The row is not what this asserts, and it reaches for palette context this
// test does not provide.
vi.mock("@/components/list/ListRow", () => ({
  ListRow: () => null,
}));

const { WeeklyList } = await import("@/components/list/WeeklyList");

const SUBJECT = {
  id: "math",
  name: "Math",
  cls: "math",
  color: "var(--subj-1)",
} as unknown as Subject;

const LESSON = {
  id: "m-12-0",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  preview: "",
  directions: "",
  week: 12,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [],
  standards: [],
} as unknown as Lesson;

/** Occurrences of `needle` in `haystack`. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The add trigger's visible label — `<span>+</span><span>Add</span>…`. */
const ADD_TRIGGER = ">Add</span>";

beforeEach(() => {
  store.lessons = [];
  store.subjects = [SUBJECT];
  store.added.length = 0;
  store.failNext = false;
});

describe("WeeklyList — the canvas every frame collapses to can add a lesson", () => {
  it("renders one add trigger per configured school day", () => {
    const html = renderToStaticMarkup(createElement(WeeklyList));
    expect(count(html, ADD_TRIGGER)).toBe(WEEKDAYS.length);
  });

  it("renders the add trigger in a day with NO lessons", () => {
    // Every day is empty here, so any trigger at all proves the affordance does
    // not depend on existing content.
    store.lessons = [];
    const html = renderToStaticMarkup(createElement(WeeklyList));
    expect(count(html, ADD_TRIGGER)).toBe(WEEKDAYS.length);
  });

  it("still renders one per day when only one day is populated", () => {
    store.lessons = [LESSON];
    const html = renderToStaticMarkup(createElement(WeeklyList));
    expect(count(html, ADD_TRIGGER)).toBe(WEEKDAYS.length);
  });

  it("gives the trigger a tooltip that says what it accomplishes", () => {
    // CLAUDE.md §4: a non-obvious control explains its OUTCOME, not its label.
    const html = renderToStaticMarkup(createElement(WeeklyList));
    expect(html).toContain("Add a lesson to this day");
  });

  it("gives each day's trigger its own accessible name", () => {
    // Without the per-day suffix all three triggers are byte-identical, and a
    // screen-reader user hears "Add" three times with no way to tell the days
    // apart. The visible label stays "+ Add"; the day rides in an sr-only span.
    const html = renderToStaticMarkup(createElement(WeeklyList));
    for (const day of WEEKDAYS) {
      expect(html).toContain(`to ${day.longLabel}`);
    }
  });
});

// ── Which DAY each trigger adds to ──────────────────────────────────────────
//
// THE HOLE THE COUNTING TESTS ABOVE LEAVE. The three triggers differ only in an
// sr-only suffix, so a count is satisfied by three triggers all wired to
// `handleQuickAdd(0)`. That is not hypothetical: the callsite reads
// `onQuickAdd={() => void handleQuickAdd(dayIndex)}` inside a `.map`, and
// closing over the wrong variable is the classic way that line goes wrong.
// Every assertion above would still pass while Monday's and Tuesday's Add
// buttons silently created Sunday lessons — a lesson landing on the wrong day
// with no error anywhere. `tests/week-columns-add.test.ts` exists because that
// exact bug shipped once.
//
// Only a real click can see the argument.

/** Matcher for the nth (0-based) add trigger in document order. */
function nthAddTrigger(n: number): (el: Element) => boolean {
  let seen = -1;
  return (el) => {
    if (!(el.textContent ?? "").startsWith("+Add")) return false;
    seen += 1;
    return seen === n;
  };
}

const NEW_LESSON_ROW = (el: Element): boolean =>
  (el.textContent ?? "").startsWith("+New lesson");

/** The row this surface deliberately does NOT offer — see the test below. */
const EVENT_ROW = (el: Element): boolean =>
  (el.textContent ?? "").includes("Non-instructional event");

/**
 * Count buttons matching, ACROSS THE WHOLE DOCUMENT and without clicking.
 *
 * Two reasons this exists rather than `h.html()` or `h.click()`:
 *   · the menu is portaled to <body>, so the harness's container-scoped
 *     `html()` and `query()` cannot see it at all; and
 *   · `h.click()` is destructive here — clicking a row closes the menu, so
 *     using a click to prove a row is PRESENT consumes the state the next
 *     assertion needs.
 */
function countButtons(match: (el: Element) => boolean): number {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    match(b as unknown as Element),
  ).length;
}

const MENU_IS_OPEN = (): boolean => countButtons(NEW_LESSON_ROW) > 0;

describe("WeeklyList — each day's trigger adds to ITS OWN day", () => {
  it("passes the section's day index, not a shared one", async () => {
    const h = await mountReact(WeeklyList as never);
    try {
      await h.render({} as never);

      for (let i = 0; i < WEEKDAYS.length; i += 1) {
        await h.click(nthAddTrigger(i));
        await h.click(NEW_LESSON_ROW);
      }

      // VACUITY GUARD FIRST: a matcher that silently matched nothing, or a menu
      // that never opened, would leave `added` empty and make every claim below
      // an assertion about nothing. `mountReact.click` throws on no match, but
      // the count is the cheap belt-and-braces.
      expect(store.added).toHaveLength(WEEKDAYS.length);

      // THE PROPERTY: the nth trigger adds to the nth configured school day.
      expect(store.added.map((a) => a.day)).toEqual(
        WEEKDAYS.map((d) => d.index),
      );
      // And it carries the browsed week, not a default.
      expect(store.added.every((a) => a.week === 12)).toBe(true);
    } finally {
      await h.unmount();
    }
  });

  it("offers the row that saves, and not the one that cannot", async () => {
    // ABSENCE ASSERTION + ITS POSITIVE CONTROL, in one run. "no event row" is
    // vacuously true of a menu that never opened, so the control is the New
    // lesson row: the same open menu must be SEEN to contain it. Only then does
    // the absence of the event row mean anything.
    //
    // The event row is omitted on this surface on purpose. It opens a form
    // whose submit can only report "Events can’t be saved yet" — the schedule
    // store has no addBlock action (components/daily/AddEventForm.tsx:182-199).
    // The other frames accept that dead end; this canvas is the ONLY way a
    // phone or tablet teacher can add anything, which is the worst place in the
    // app to promise something that discards their input.
    // Measured through `click`, NOT through `h.html()`. The menu is portaled to
    // document.body (AddLessonMenu's `createPortal`), and the harness's `html()`
    // returns the mount CONTAINER's innerHTML — so the menu is genuinely absent
    // from it even when open, and an `expect(html).not.toContain(…)` here would
    // pass no matter what the menu contained. `click` searches the whole
    // document and THROWS when nothing matches, so it can see the portal and it
    // cannot silently match nothing. (The first version of this test asserted on
    // `html()` and its control failed — which is the control working.)
    const h = await mountReact(WeeklyList as never);
    try {
      await h.render({} as never);
      await h.click(nthAddTrigger(0));

      // CONTROL, first: the New lesson row must be reachable and must really
      // fire. Without this the absence below is a claim about a menu that may
      // never have opened.
      expect(MENU_IS_OPEN()).toBe(true);
      await h.click(NEW_LESSON_ROW);
      expect(store.added).toHaveLength(1);

      // THE CLOSE, ASSERTED — not assumed. This is the step whose absence made
      // an earlier version of this test vacuous: it went straight to "reopen",
      // and if selecting a row did NOT close the menu then that click closed an
      // already-open menu, so the event-row assertion below ran against NO OPEN
      // MENU and would have passed against a menu offering the event row
      // prominently. Same class as the three instrument defects in the probe —
      // a control that the failure mode also satisfies is not a control.
      expect(MENU_IS_OPEN()).toBe(false);

      // Now reopen, and prove the menu is really open again BEFORE asserting
      // what it does not contain. Checked by counting, not by clicking:
      // clicking a row would close the menu and consume the state under test.
      await h.click(nthAddTrigger(0));
      expect(MENU_IS_OPEN()).toBe(true);

      // THE ABSENCE, against a menu now demonstrably open.
      expect(countButtons(EVENT_ROW)).toBe(0);
    } finally {
      await h.unmount();
    }
  });

  // ── WHY THERE IS NO FOCUS TEST HERE ───────────────────────────────────────
  // Focus-on-open and focus-restore-on-close are REAL requirements (the menu is
  // portaled to <body>, so Tab from the trigger walks past it rather than into
  // it, and a keyboard-only teacher could open the add menu and never reach
  // "New lesson"). They are verified in a real browser by
  // `scripts/probe-week-add-responsive.mjs` PART D.
  //
  // They are NOT verified here because THIS HARNESS CANNOT SEE FOCUS. linkedom
  // exposes an `HTMLElement.focus()` function but never updates
  // `document.activeElement` — measured: it stays `undefined` after a focus()
  // call on a mounted button. A focus assertion written here would therefore
  // fail against correct code, and — the worse direction — any assertion
  // massaged until it passed would be measuring something other than focus.
  // Wrong instrument; the browser is the right one.

  it("wires the trigger to the menu for assistive tech", async () => {
    // A portaled popup is not adjacent to its trigger in the DOM, so the
    // relationship has to be stated: aria-expanded (state) + aria-controls
    // (which element). `role="group"` deliberately, NOT `role="menu"` — a menu
    // obliges menuitem children with roving arrow-key focus, and claiming those
    // semantics without implementing them is worse than not claiming them.
    const h = await mountReact(WeeklyList as never);
    try {
      await h.render({} as never);
      await h.click(nthAddTrigger(0));

      const trigger = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").startsWith("+Add"),
      );
      const controls = trigger?.getAttribute("aria-controls");
      expect(trigger?.getAttribute("aria-expanded")).toBe("true");
      expect(controls).toBeTruthy();
      // CONTROL: the id must actually resolve to the open menu, not merely be
      // present — a dangling aria-controls is worse than none.
      const target = document.getElementById(controls as string);
      expect(target).toBeTruthy();
      expect((target?.textContent ?? "").includes("New lesson")).toBe(true);
      expect(target?.getAttribute("role")).toBe("group");
    } finally {
      await h.unmount();
    }
  });

  it("surfaces a failed add AFTER the menu has closed", async () => {
    // The menu closes optimistically on selection (before the round-trip
    // resolves), which is right for a phone — but it means the failure path has
    // to report somewhere the menu no longer is. The error lives on the WRAPPER,
    // outside the portal, so it survives the close. Without this, an optimistic
    // close would have traded an overlay for a silent failure.
    store.failNext = true;
    const h = await mountReact(WeeklyList as never);
    try {
      await h.render({} as never);
      await h.click(nthAddTrigger(0));
      await h.click(NEW_LESSON_ROW);

      expect(MENU_IS_OPEN()).toBe(false); // the menu really is gone…
      expect(store.added).toHaveLength(1); // …the add really was attempted…
      expect(h.html()).toContain("Couldn’t add the lesson"); // …and it is visible.
    } finally {
      store.failNext = false;
      await h.unmount();
    }
  });

  it("closes on an outside press — the only exit a touch device has", async () => {
    // WHY THIS MATTERS HERE SPECIFICALLY. AddLessonMenu's other two exits are
    // Escape and the menu's own `onMouseLeave`, and both are keyboard- or
    // mouse-only: a touch device fires no `mouseleave` and has no Esc key. That
    // was survivable while the Week frames were the only callsites, because
    // none of them renders below 900px. WeeklyList is the canvas every frame
    // collapses to AT ≤900px, so shipping the menu here without an outside-press
    // exit would strand a phone teacher in an open menu whose only way out is to
    // create a lesson they did not want.
    //
    // Measured through `click` for the same reason as the test above: the menu
    // is portaled to document.body, where `h.html()` cannot see it.
    const h = await mountReact(WeeklyList as never);
    try {
      await h.render({} as never);
      await h.click(nthAddTrigger(0));

      // CONTROL: with the menu open the row IS reachable. Without this, the
      // rejection below would also be satisfied by a menu that never opened.
      await h.click(NEW_LESSON_ROW);
      expect(store.added).toHaveLength(1);

      await h.click(nthAddTrigger(0)); // reopen — choosing a row closed it
      // A press on something that is neither the trigger nor the menu. Dispatched
      // on <body> and bubbling, so the capture-phase listener on `document` sees
      // it on the way down.
      // `window.Event`, not the bare global: the mount runs over linkedom, and a
      // Node-realm Event cannot be dispatched into a linkedom tree ("Cannot set
      // property eventPhase"). Same reason mountReact builds its own click event
      // from `dom.window`.
      // Inside `act` because the listener is a PLAIN DOM listener, not one of
      // React's delegated handlers: its `setOpen(false)` lands outside React's
      // event context, so without an explicit flush the re-render is still
      // queued when the next assertion reads the tree. (`mountReact` sets
      // IS_REACT_ACT_ENVIRONMENT, so `act` is available and deterministic —
      // preferable to sleeping on the scheduler.)
      await act(async () => {
        document.body.dispatchEvent(
          new window.Event("pointerdown", { bubbles: true }),
        );
      });

      await expect(h.click(NEW_LESSON_ROW)).rejects.toThrow("no button matched");
      // And nothing was created by the dismissal itself.
      expect(store.added).toHaveLength(1);
    } finally {
      await h.unmount();
    }
  });
});
