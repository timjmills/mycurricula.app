import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement, type ComponentType, type ReactNode } from "react";

import type { Lesson, Subject } from "@/lib/types";
import { mountReact } from "./mount-react";

// A real react-dom/client mount is slow (a few hundred ms each) and slower still
// under the full suite's parallel load. Raised deliberately; every test here
// fails on an ASSERTION, never a timeout, when the behaviour under test is
// mutated out — see the mutation split recorded at the bottom of this file.
vi.setConfig({ testTimeout: 30000 });

// Task #31 — "/daily?lesson=<id> does not navigate to the lesson's date; it
// lands on an empty out-of-year week."
//
// WHY A MOUNT TEST AND NOT A BROWSER RUN. The report was filed from a live pass
// against the shared dev server. Re-measured on 2026-08-01 that server could not
// hydrate at all — `ChunkLoadError: Loading chunk app/(planner)/layout failed`,
// no React fiber on any node after 150s — so on that page NOTHING driven by an
// effect ran, and "the deep link did nothing" was indistinguishable from "no
// client code ran". The sibling `?date=` deep link, which calls
// router.replace("/daily") on EVERY path, also left its query string in place:
// the tell that the page was inert rather than the resolver broken.
//
// This file answers the question without that instrument. It mounts the SHIPPED
// DailyView over the REAL AppStateProvider (so `week` moves through the real
// setWeek / weekTouchedRef path, not a stand-in), and reads where the day
// surface ended up.
//
// WHAT IT PINS
//   1. The FIRST render — server HTML, no effects — is already the lesson's
//      week + day. This is the fix for #31; everything the teacher sees before
//      hydration comes from here.
//   2. That markup hydrates without a mismatch (with a positive control proving
//      the detector fires).
//   3. A cold `?lesson=` load lands on the lesson's week + day, with the lesson
//      in the rendered slice — from a week that is NOT the landing week.
//   4. The same when the document arrives AFTER mount (the Supabase shape: the
//      first render sees zero lessons; PR #27's resolver must re-run and land).
//   5. The consumed `?lesson=` is stripped only after the seed commits.
//   6. CONTROL, in this same file: with no deep link the view stays on the
//      landing week. Without it, "the view is on the target week" would also
//      pass if the landing week happened to be it — nothing could fail.

const store = vi.hoisted(() => ({
  lessons: [] as Lesson[],
  hydration: "settled" as "loading" | "settled" | "empty" | "error",
}));

const nav = vi.hoisted(() => ({ replaced: [] as string[], pushed: [] as string[] }));

// Whether the Daily Schedule rail is mounted (the pill's state).
const rail = vi.hoisted(() => ({ on: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => void nav.pushed.push(href),
    replace: (href: string) => void nav.replaced.push(href),
    prefetch: () => {},
    back: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/daily",
  useSearchParams: () => new URLSearchParams(),
}));

const SUBJECTS = [
  { id: "math", name: "Math", cls: "math", color: "var(--subj-1)" },
] as unknown as Subject[];

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    lastChange: null,
    subjectById: Object.fromEntries(SUBJECTS.map((s) => [s.id, s])),
    subjects: SUBJECTS,
    hydration: store.hydration,
    addLesson: async () => null,
    setLessonStatus: () => {},
    units: [],
  }),
  usePlannerDataState: () => "settled",
  scrollPlannerItemIntoView: () => {},
}));

// The day canvas, the edit split, and the rails are not what this asserts —
// stub them to a probe that REPORTS the slice DailyView handed down. A stub that
// rendered nothing would let every assertion below pass vacuously, so it prints
// the week, the day, and the ids into the markup where the test can read them.
vi.mock("@/components/day-v2", () => ({
  DayViewV2: (props: {
    week: number;
    day: number;
    dayLessons: Lesson[];
    onShiftDay: (d: 1 | -1) => void;
  }) =>
    createElement(
      "div",
      {
        "data-probe-canvas": "1",
        "data-week": String(props.week),
        "data-day": String(props.day),
        "data-ids": props.dayLessons.map((l) => l.id).join(","),
      },
      // The real canvas's day-forward arrow, reduced to the seam DailyView
      // owns. One test needs a REAL navigation, not a simulated state write.
      createElement(
        "button",
        { onClick: () => props.onShiftDay(1) },
        "probe-next-day",
      ),
    ),
}));
vi.mock("@/components/daily/DayEditSplit", () => ({ DayEditSplit: () => null }));
vi.mock("@/components/daily/IconRail", () => ({ IconRail: () => null }));
vi.mock("@/components/daily/AddEventForm", () => ({ AddEventForm: () => null }));
vi.mock("@/components/daily/daily-schedule-pill", () => ({
  DailySchedulePill: () => null,
}));
// The Schedule rail is NOT stubbed to nothing: DailyView passes it the resolved
// week explicitly (it would otherwise read the shared one and sit beside the
// right day headed with the wrong week). A `() => null` stub could not tell a
// correct prop from a deleted one — the fix would be untested (Codex gate,
// Medium). This probe reports what it was handed.
vi.mock("@/components/schedule", () => ({
  ScheduleDayPane: (props: { day: number; week?: number }) =>
    createElement("div", {
      "data-probe-rail": "1",
      "data-rail-week": String(props.week),
      "data-rail-day": String(props.day),
    }),
}));

// The rail only mounts when the Daily Schedule pill is ON; the real hook reads
// it from localStorage after mount, which no server render can reach.
vi.mock("@/lib/daily-schedule-state", () => ({
  useDailyScheduleMode: () => ({
    scheduleMode: rail.on,
    setScheduleMode: () => {},
  }),
}));
// next/link prefetches through requestIdleCallback, which reads `self` — absent
// under vitest's node environment. The breadcrumb only needs to render its text.
vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href?: string }) =>
    createElement("a", { href }, children),
}));

// AppStateProvider opens a Supabase browser client in a mount effect to resolve
// the signed-in teacher's name. No credentials exist under vitest, and the
// identity is irrelevant here — stub the client to a signed-out session.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));
vi.mock("@/components/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children),
  Tooltip: ({ children }: { children?: ReactNode }) => children ?? null,
}));

const { DailyView } = await import("@/components/daily/DailyView");
const { AppStateProvider } = await import("@/lib/app-state");
const { LabelsProvider } = await import("@/lib/labels");
const { EditModeProvider } = await import("@/lib/edit-mode-state");

// ── Fixtures ────────────────────────────────────────────────────────────────

function lesson(id: string, week: number, day: number): Lesson {
  return {
    id,
    subject: "math",
    unit: "u1",
    title: `${id} title`,
    objective: "",
    week,
    day,
    status: "planned",
    archived: false,
    modified: false,
    moved: false,
    isPersonal: false,
    resources: [],
    standards: [],
  } as unknown as Lesson;
}

// The deep-link target must live somewhere the view does NOT already open on,
// or every assertion below passes without the deep link doing anything. The
// landing week is not a constant — it is derived from the configured academic
// year against TODAY, so hard-coding "week 7 is far away" makes this file quietly
// date-dependent: on the day the school year reaches week 7 the controls break,
// and the deep-link tests start proving nothing. Measure the landing position
// instead, and place the target relative to it (Codex gate, Medium).
let FAR: Lesson;
let LANDING: { week: number; day: number };
const NEAR = lesson("near-1", 1, 0);

// DailyView's props are a DEFAULTED parameter (`props: DailyViewProps = {}`),
// which types the component as taking no props at all under createElement. The
// cast restores the prop it really accepts; the shape is checked against the
// real interface by the app's own callsite (app/(planner)/daily/page.tsx).
const DailyViewC = DailyView as unknown as ComponentType<{
  initialLessonId?: string;
}>;

/** DailyView under the REAL app-state provider — `week` moves (or fails to)
 *  through the same setWeek / weekTouchedRef path the app ships. */
function Host(props: { initialLessonId?: string }): ReactNode {
  return createElement(
    LabelsProvider,
    null,
    createElement(
      EditModeProvider,
      null,
      createElement(AppStateProvider, null, createElement(DailyViewC, props)),
    ),
  );
}

interface Landed {
  week: number | null;
  day: number | null;
  ids: string[];
  crumb: string;
}

function landed(h: { query: (s: string) => Element | null; html: () => string }): Landed {
  const el = h.query("[data-probe-canvas]");
  const idsAttr = el?.getAttribute("data-ids") ?? "";
  const crumbEl = h.query("nav[aria-label='Breadcrumb']");
  return {
    week: el ? Number(el.getAttribute("data-week")) : null,
    day: el ? Number(el.getAttribute("data-day")) : null,
    ids: idsAttr ? idsAttr.split(",") : [],
    crumb: (crumbEl?.textContent ?? "").replace(/\s+/g, " ").trim(),
  };
}

beforeAll(async () => {
  // Measure where the view lands with NO deep link and no document, then place
  // the target five weeks away on a different day. `data-*` comes from the day
  // canvas stub, so this reads the shipped derivation, not a duplicate of it.
  const { renderToStaticMarkup } = await import("react-dom/server");
  store.lessons = [];
  const probe = renderToStaticMarkup(createElement(Host, {}));
  const week = Number(/data-week="(\d+)"/.exec(probe)?.[1]);
  const day = Number(/data-day="(\d+)"/.exec(probe)?.[1]);
  // A probe that read nothing would silently make every "it moved" assertion
  // meaningless, so fail loudly instead.
  expect(Number.isInteger(week)).toBe(true);
  expect(Number.isInteger(day)).toBe(true);
  LANDING = { week, day };
  // Five weeks BACK where there is room, forward only near the start of the
  // year. Always adding five would put the target past the end of the academic
  // year in its final weeks — a position no real lesson can occupy, which would
  // quietly stop exercising the date-backed route (Codex gate, Low). A week
  // that has already happened is always inside the year.
  //
  // Day 0 and day 1 exist in every configured school week (the shortest the
  // product supports is still multi-day), so the day is in range whatever the
  // team's week is, and it always differs from the landing day.
  FAR = lesson("far-1", week > 5 ? week - 5 : week + 5, day === 0 ? 1 : 0);
  expect(FAR.week).not.toBe(LANDING.week);
  expect(FAR.day).not.toBe(LANDING.day);
});

beforeEach(() => {
  store.lessons = [NEAR, FAR];
  store.hydration = "settled";
  nav.replaced.length = 0;
  nav.pushed.length = 0;
});

describe("/daily?lesson= deep link", () => {
  it("CONTROL — with no deep link the view stays on the landing week", async () => {
    const h = await mountReact(Host);
    try {
      await h.render({});
      const where = landed(h);
      // The landing position is whatever the configured academic year resolves
      // to today; what matters is that it is NOT the target's, because every
      // assertion below is "the view moved TO the target".
      expect(where.week).toBe(LANDING.week);
      expect(where.week).not.toBe(FAR.week);
      expect(where.ids).not.toContain(FAR.id);
    } finally {
      await h.unmount();
    }
  });

  it("the FIRST render is already the lesson's day — no effect required", async () => {
    // THE FIX FOR TASK #31. Everything else in this file measures the state
    // AFTER effects have run, which is a moment a teacher does not experience
    // first: the server HTML, and every client frame until hydration completes,
    // come earlier. renderToStaticMarkup runs NO effects, so it renders exactly
    // that window — and it is the window the bug report describes ("lands on an
    // empty out-of-year week"). On this app hydration is seconds, not frames.
    const { renderToStaticMarkup } = await import("react-dom/server");

    const linked = renderToStaticMarkup(
      createElement(Host, { initialLessonId: FAR.id }),
    );
    expect(linked).toContain(`data-week="${FAR.week}"`);
    expect(linked).toContain(`data-day="${FAR.day}"`);
    expect(linked).toContain(FAR.id);
    expect(linked).toContain(`Week ${FAR.week}`);

    // CONTROL — the same render with no deep link is NOT on that week, so the
    // assertions above are reading the deep link and not a constant.
    const plain = renderToStaticMarkup(createElement(Host, {}));
    expect(plain).not.toContain(`data-week="${FAR.week}"`);
    expect(plain).not.toContain(FAR.id);
  });

  it("the Schedule rail describes the SAME week the day canvas does", async () => {
    // Two surfaces on one screen: the day canvas and, when the pill is on, the
    // Schedule rail. The rail reads the SHARED week unless it is told otherwise,
    // so on a deep link it would head "WEEK <default>" beside the linked
    // lesson's day for the whole pre-hydration window — the app contradicting
    // itself. Asserted on the FIRST render, which is where it would show.
    rail.on = true;
    try {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup(
        createElement(Host, { initialLessonId: FAR.id }),
      );
      expect(html).toContain('data-probe-rail="1"'); // the rail really mounted
      expect(html).toContain(`data-rail-week="${FAR.week}"`);
      expect(html).toContain(`data-rail-day="${FAR.day}"`);
      // CONTROL — with no deep link it follows the shared landing week, so the
      // assertions above read the hand-off and not a hard-coded prop.
      const plain = renderToStaticMarkup(createElement(Host, {}));
      expect(plain).toContain(`data-rail-week="${LANDING.week}"`);
    } finally {
      rail.on = false;
    }
  });

  it("hydrates that server HTML without a mismatch", async () => {
    // The static render above proves the SERVER lands on the lesson. It cannot
    // prove the CLIENT's first render agrees — a seed that reached one and not
    // the other would render the right week and still tear on hydration (Codex
    // gate, Medium). So: render the markup, hydrate it with the same props over
    // the same document, and watch for a recoverable error.
    //
    // An "and nothing was reported" assertion fails open, so the same run
    // includes a POSITIVE CONTROL that hydrates DIFFERENT props over the same
    // markup. If that one reports nothing either, the detector is dead and both
    // halves are void.
    // renderToString, NOT renderToStaticMarkup: hydration needs the text-node
    // separator comments that only the hydratable renderer emits, and this is
    // what Next actually ships. Static markup tears on adjacent text ("Week"
    // + " " + the number) for reasons that have nothing to do with the seed.
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(
      createElement(Host, { initialLessonId: FAR.id }),
    );

    // Borrow the harness's DOM globals + teardown rather than installing a
    // second copy (a leaked `window` would make every later SSR assertion in
    // the suite run in a client environment — see tests/mount-react.ts).
    const h = await mountReact(() => null);
    try {
      const { hydrateRoot } = await import("react-dom/client");
      const { act } = await import("react");

      const hydrate = async (props: { initialLessonId?: string }) => {
        const errors: string[] = [];
        const host = document.createElement("div");
        host.innerHTML = html;
        document.body.appendChild(host);
        let root: { unmount: () => void } | null = null;
        await act(async () => {
          root = hydrateRoot(host, createElement(Host, props), {
            onRecoverableError: (e: unknown) =>
              void errors.push(String((e as Error)?.message ?? e)),
          });
        });
        await act(async () => {
          (root as unknown as { unmount: () => void } | null)?.unmount();
        });
        host.remove();
        return errors;
      };

      const matched = await hydrate({ initialLessonId: FAR.id });
      const mismatched = await hydrate({}); // POSITIVE CONTROL

      expect(mismatched.length).toBeGreaterThan(0); // the detector works…
      expect(matched).toEqual([]); // …and it stayed quiet for the real case
    } finally {
      await h.unmount();
    }
  });

  it("lands on the lesson's week and day, with the lesson in the day's slice", async () => {
    const h = await mountReact(Host);
    try {
      await h.render({ initialLessonId: FAR.id });
      const where = landed(h);
      expect(where.week).toBe(FAR.week);
      expect(where.day).toBe(FAR.day);
      expect(where.ids).toContain(FAR.id);
      // The teacher-visible statement of the same fact.
      expect(where.crumb).toContain(`Week ${FAR.week}`);
    } finally {
      await h.unmount();
    }
  });

  it("lands when the document arrives AFTER mount (the Supabase shape)", async () => {
    store.lessons = [];
    store.hydration = "loading";
    const h = await mountReact(Host);
    try {
      await h.render({ initialLessonId: FAR.id });
      // Nothing to resolve yet — and the resolver must NOT have given up.
      expect(landed(h).ids).toEqual([]);

      store.lessons = [NEAR, FAR];
      store.hydration = "settled";
      await h.render({ initialLessonId: FAR.id });

      const where = landed(h);
      expect(where.week).toBe(FAR.week);
      expect(where.day).toBe(FAR.day);
      expect(where.ids).toContain(FAR.id);
      // …and the RESOLVER is what landed it, not the render seed coasting. The
      // strip only fires once `seededFor` has committed, so a `/daily` replace
      // is the observable proof the effect re-ran on the late document rather
      // than the canvas merely looking right (Codex gate, Medium: the assertion
      // above is render-derived and, taken alone, would not separate the two).
      expect(nav.replaced).toContain("/daily");
    } finally {
      await h.unmount();
    }
  });

  it("a late document never yanks a teacher who has already navigated", async () => {
    // The deep link is armed but unresolvable — the document has not arrived
    // (the Supabase path, where that can take seconds). The teacher gets bored
    // and steps forward a day. When the document finally lands, the resolver
    // must NOT haul them back to the linked lesson: they made a navigation, and
    // silently undoing it is worse than not landing at all.
    store.lessons = [];
    store.hydration = "loading";
    const h = await mountReact(Host);
    try {
      await h.render({ initialLessonId: FAR.id });
      const before = landed(h);
      await h.click((el) => el.textContent === "probe-next-day");
      const afterNav = landed(h);
      expect(afterNav.day).not.toBe(before.day); // the click really moved it

      store.lessons = [NEAR, FAR];
      store.hydration = "settled";
      await h.render({ initialLessonId: FAR.id });

      const after = landed(h);
      expect(after.week).toBe(afterNav.week);
      expect(after.day).toBe(afterNav.day);
    } finally {
      await h.unmount();
    }
  });

  it("re-arms after a cancellation — the SAME link clicked again still lands", async () => {
    // The follow-on to the test above, and the half a latch usually gets wrong.
    // `seedCancelledRef` is what stops a late document yanking the teacher back;
    // if it does not CLEAR, the second click on the same link is dead — the
    // resolver settles the id without moving anything and the teacher stares at
    // wherever they happened to be. A ref survives re-renders, so nothing about
    // the mount resets it: only the effect's `!initialLessonId` arm does, on the
    // render after the consumed query is stripped.
    //
    // Sequenced on ONE mount on purpose. A fresh mount would re-arm trivially
    // (refs die with the tree) and prove nothing about the clearing.
    store.lessons = [];
    store.hydration = "loading";
    const h = await mountReact(Host);
    try {
      await h.render({ initialLessonId: FAR.id });
      await h.click((el) => el.textContent === "probe-next-day"); // cancels
      const parked = landed(h);
      expect(parked.week).not.toBe(FAR.week); // really not on the target

      // The document arrives; the cancellation holds (the previous test's rule).
      store.lessons = [NEAR, FAR];
      store.hydration = "settled";
      await h.render({ initialLessonId: FAR.id });
      expect(landed(h).week).toBe(parked.week);

      // The consumed query is stripped — the app's own next render carries no
      // `?lesson=`, which is the moment the re-arm is supposed to happen.
      await h.render({});
      // …and now the SAME link again. This is the second click.
      await h.render({ initialLessonId: FAR.id });

      const where = landed(h);
      expect(where.week).toBe(FAR.week);
      expect(where.day).toBe(FAR.day);
      expect(where.ids).toContain(FAR.id);
    } finally {
      await h.unmount();
    }
  });

  it("an id that is not in the document leaves the view where it was", async () => {
    // A stale bookmark, a deleted lesson, a link from another teacher's grade.
    // Two ways to get this wrong, and the render-time seed could introduce
    // either: navigate somewhere arbitrary, or strand the page armed forever so
    // a LATER real deep link in the same mount is ignored.
    const h = await mountReact(Host);
    try {
      await h.render({ initialLessonId: "no-such-lesson" });
      const where = landed(h);
      expect(where.week).toBe(LANDING.week);
      // It gave up rather than staying armed: the URL-strip effect only fires
      // once the resolver has SETTLED the id, so a `/daily` replace is the
      // observable proof the latch closed.
      expect(nav.replaced).toContain("/daily");

      // …and having given up, it still honours a real link afterwards.
      await h.render({});
      await h.render({ initialLessonId: FAR.id });
      expect(landed(h).week).toBe(FAR.week);
    } finally {
      await h.unmount();
    }
  });

  it("strips the consumed ?lesson= only after the seed has committed", async () => {
    const h = await mountReact(Host);
    try {
      await h.render({ initialLessonId: FAR.id });
      expect(nav.replaced).toContain("/daily");
      // …and the strip did not cost the seed.
      expect(landed(h).week).toBe(FAR.week);
    } finally {
      await h.unmount();
    }
  });
});

// ── Mutation split, RE-MEASURED 2026-08-01 (each mutant applied, run, reverted;
//    10 tests total, so every line below reads "N failed | M passed") ──────────
//
//   MUTANT A — the render-time seed removed (`viewWeek = week`, `viewDay =
//   selectedDay`), i.e. the code as it stood when #31 was filed:  3 failed | 7 passed
//     RED   the FIRST render is already the lesson's day
//     RED   the Schedule rail describes the SAME week the day canvas does
//     RED   hydrates that server HTML without a mismatch  (its positive control
//           needs the seed to produce a divergence to detect)
//     GREEN the five effect-driven tests — which is the point: they passed on
//           the unfixed code too, so they could never have caught this.
//
//   MUTANT B — PR #27's effect seed removed (`setWeek(target.week)` /
//   `setSelectedDay(target.day)`):
//     RED   lands on the lesson's week and day
//     RED   lands when the document arrives AFTER mount
//     RED   strips the consumed ?lesson= only after the seed has committed
//     GREEN the two first-render tests — the render seed alone does not move the
//           SHARED week, so the effect is still load-bearing and still pinned.
//
//   MUTANT G — the resolver's deps narrowed to `[initialLessonId, seededFor]`,
//   i.e. it stops watching the document (the §4a gate proposed this as a live
//   defect; it is not one — the shipped deps are
//   `[initialLessonId, lessons, hydration, seededFor]` — but the mutant is worth
//   keeping because it is the failure the render seed could most plausibly
//   MASK: the canvas would look right while the shared week never moved):  1 | 9
//     RED   lands when the document arrives AFTER mount
//     GREEN everything else.
//
//   MUTANT D — `week={viewWeek}` dropped from the Schedule rail:
//     RED   the Schedule rail describes the SAME week the day canvas does
//     GREEN everything else.
//
//   MUTANT C — the seed cancellation in handleShiftDay removed:  1 | 9
//     RED   a late document never yanks a teacher who has already navigated
//           (the resolver hauled the view back to the linked lesson's week)
//     GREEN everything else.
//
//   MUTANT E — `seedCancelledRef.current = null` dropped from the resolver's
//   re-arm branch (the latch closes and never opens):  1 | 9
//     RED   re-arms after a cancellation — the SAME link clicked again still lands
//     GREEN everything else — including MUTANT C's test, which is why the two
//           halves of the latch need separate tests: "it cancels" and "the
//           cancellation expires" fail independently, and only the second one
//           makes a teacher's second click dead.
//
//   MUTANT F — the resolver's give-up branch removed (`if (hydration === "error"
//   || (lessons.length > 0 && …))`), so an unresolvable id stays armed:  1 | 9
//     RED   an id that is not in the document leaves the view where it was
//     GREEN everything else.
