import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { mountReact } from "./mount-react";
import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";
// Imported statically, from the BARREL the app itself imports — `vi.mock` is
// hoisted above this, so the mocks below still apply. A dynamic `await
// import()` inside the first test instead charged that module graph's ~10s
// transform to that test's 5s timeout, which reads as a failing assertion.
import {
  YearShell,
  YearB,
  buildLanes,
  parseYearPreview,
  type YearPreview,
} from "@/components/year-v2";

// /year — data-state honesty, default routing, the ?preview= switch, and the
// YearB candidate surface.
//
// FOUR THINGS ARE PINNED HERE.
//
//   1. NO FRAME SPEAKS ABOUT A PLAN IT HAS NOT LOADED. Nothing under /year
//      consulted `usePlannerDataState`, so through the 11–16s Supabase hydrate
//      every frame rendered off an empty document — YearA a confident
//      "0% complete" (YearA.tsx :172), TimelineYear a complete blank timeline.
//      A wrong NUMBER is worse than an absent list: a teacher cannot tell it
//      from a year they have not seeded. The guard lives in YearShell, above
//      the frame branch, so one call covers every frame including the frozen
//      TimelineYear. This is the part that ships regardless of any design
//      decision.
//   2. DEFAULT ROUTING IS UNCHANGED — paper stays on TimelineYear. The 7.21
//      handoff moves paper to the subject-led views
//      (`source-home/app.jsx:522`, `ViewSet = { A: ViewsA, B: ViewsC, C: ViewsC }`),
//      but on Year paper is currently the RICHEST frame, so adopting it
//      literally would remove capability. That is the user's call, not a
//      refactor's.
//   3. THE ?preview= SWITCH — the non-destructive way both candidates get on
//      screen for comparison. The route parses the param and hands it down as
//      a prop (the /weekly pattern), so BOTH halves are provable here: the
//      parse, and the routing it drives.
//   4. THE YearB CANDIDATE — the 7.2 Frame-B row shape
//      (`source-home/views-b.jsx` :90-124), its honesty under an unhydrated
//      store, and the invariant that every unit stays REACHABLE as a real
//      <button> opening the unit workspace.
//
// WHY IT RENDERS THE COMPONENTS rather than a pure helper: vitest runs
// `environment: "node"`, but `react-dom/server` renders to a STRING there with
// no jsdom and no new dependency (the worked example is
// tests/hub-browse-empty.test.ts). So these assert against the shipped tree.
//
// Assertions key off DATA ATTRIBUTES and visible text, never class names: CSS
// modules resolve here to build-hashed names (`_root_578729`), so a class-name
// matcher would break on an unrelated rebuild and prove nothing when it passed.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  units: [] as Unit[],
}));

const theme = vi.hoisted(() => ({ frame: "paper" as string }));
/** The GLOBAL standards filter, shared with Weekly through app-state. */
const appState = vi.hoisted(() => ({ standards: [] as string[] }));
const opened = vi.hoisted(() => ({ calls: [] as [string, string][] }));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: Object.fromEntries(store.subjects.map((s) => [s.id, s])),
    units: store.units,
    unitById: Object.fromEntries(store.units.map((u) => [u.id, u])),
  }),
  usePlannerDataState: () => store.state,
}));

vi.mock("@/lib/theme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/theme")>()),
  useTheme: () => ({ frame: theme.frame }),
}));

vi.mock("@/components/year-v2/workspace-host", () => ({
  useUnitWorkspace: () => ({
    openUnitWorkspace: (s: string, u: string) => opened.calls.push([s, u]),
    closeUnitWorkspace: () => {},
  }),
  useUnitWorkspaceTarget: () => null,
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({
    week: 1,
    filters: {
      subjects: [],
      units: [],
      statuses: [],
      standards: appState.standards,
      showHolidays: true,
    },
    updateFilters: () => {},
  }),
}));

vi.mock("@/lib/use-academic-year", () => ({
  useAcademicYear: () => ({
    start: new Date(2025, 7, 24),
    end: new Date(2026, 5, 25),
  }),
}));

vi.mock("@/lib/notebook-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notebook-state")>()),
  useNotebookState: () => ({
    activeNotebooks: [{ gradeLevelId: "g5", name: "Grade 5" }],
    activeNotebookId: "g5",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/year",
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

function subject(id: string, name: string): Subject {
  return { id, name, cls: id, icon: name[0] } as unknown as Subject;
}

function unit(id: string, subj: string, name: string, weeks: string): Unit {
  return { id, subject: subj, name, weeks } as unknown as Unit;
}

let lessonSeq = 0;
function lesson(
  subj: string,
  unitId: string,
  status: string,
  week: number,
  standards: string[] = [],
) {
  lessonSeq += 1;
  return {
    id: `l${lessonSeq}`,
    subject: subj,
    unit: unitId,
    title: `Lesson ${lessonSeq}`,
    week,
    day: 0,
    status,
    archived: false,
    modified: false,
    resources: [],
    standards,
  } as unknown as Lesson;
}

const MATH = subject("math", "Math");
const READING = subject("reading", "Reading");

/**
 * Math: three units, deliberately one of each progress state —
 *   u1 Place Value  2/2 done   → a full segment
 *   u2 Fractions    1/2 done   → the partial segment, and the "Now:" unit
 *   u3 Geometry     0/2 done   → an empty segment
 * so the subject is 3/6 = 50% taught. Reading holds one skipped lesson, which
 * is the only lesson carrying a status the "done" maths must not count.
 */
function seed() {
  lessonSeq = 0;
  store.subjects = [MATH, READING];
  store.units = [
    unit("u1", "math", "Unit 1 · Place Value", "Wk 1"),
    unit("u2", "math", "Unit 2 · Fractions", "Wk 5"),
    unit("u3", "math", "Unit 3 · Geometry", "Wk 9"),
    unit("r1", "reading", "Unit 1 · Novels", "Wk 1"),
  ];
  store.lessons = [
    lesson("math", "u1", "done", 1),
    lesson("math", "u1", "done", 2),
    // Only this lesson carries 5.NF.1 — so a standards filter on that code must
    // leave exactly one unit standing across the whole year.
    lesson("math", "u2", "done", 5, ["5.NF.1"]),
    lesson("math", "u2", "planned", 6),
    lesson("math", "u3", "planned", 9),
    lesson("math", "u3", "planned", 10),
    lesson("reading", "r1", "skipped", 1),
  ];
}

/** The whole /year route, at a given frame and (optionally) a preview. */
function renderYear(frame: string, preview: YearPreview = null): string {
  theme.frame = frame;
  return renderToStaticMarkup(createElement(YearShell, { preview }));
}

/**
 * <YearB> on its own, over the same lane derivation the shell feeds it. Kept
 * separate from the routed render so the component's contract is pinned even
 * if the preview that reaches it is renamed or retired.
 */
function renderB(): string {
  return renderToStaticMarkup(
    createElement(YearB, {
      lanes: buildLanes(store.subjects, store.lessons, store.units),
      onOpenUnit: (s: SubjectId, u: string) => opened.calls.push([s, u]),
    }),
  );
}

/** Markers unique to the pre-v2 surface (TimelineYear.tsx root + heading). */
const TIMELINE_ROOT = "data-scope=";
const TIMELINE_HEADING = "Yearly View";

const LOADING = 'role="status" aria-busy="true"';
const ERROR_COPY = "Couldn’t load your plan";

beforeEach(() => {
  store.state = "settled";
  opened.calls = [];
  appState.standards = [];
  seed();
});

describe("/year — no frame speaks about a plan it has not loaded", () => {
  // The defect this closes: nothing under /year consulted usePlannerDataState,
  // so through the 11–16s Supabase hydrate every frame rendered off an empty
  // document. YearA painted "0% complete" (YearA.tsx :172) beside "No units
  // planned yet." (:177-181) and TimelineYear painted a complete blank
  // timeline. That is a wrong NUMBER, not an absent list — strictly worse than
  // the false-empties, because a teacher cannot tell it from a real empty year.
  it.each(["glass", "paper", "color"])(
    "shows a labelled skeleton, not a plan, while %s is hydrating",
    (frame) => {
      store.state = "pending";
      const html = renderYear(frame);
      expect(html).toContain(LOADING);
      expect(html).toContain("Loading your plan");
      // The two specific lies, pinned by their exact rendered form.
      expect(html).not.toContain("% complete");
      expect(html).not.toContain("No units planned yet.");
      expect(html).not.toContain(TIMELINE_HEADING);
    },
  );

  it.each(["glass", "paper", "color"])(
    "reports a failed hydrate on %s rather than an empty year",
    (frame) => {
      // A hydrate that THREW leaves the same empty document, permanently. The
      // frames would have called that a fully-planned-but-untaught year.
      store.state = "error";
      const html = renderYear(frame);
      expect(html).toContain(ERROR_COPY);
      expect(html).not.toContain("% complete");
      expect(html).not.toContain(TIMELINE_HEADING);
    },
  );

  it.each(["glass", "color"])(
    "still renders the real %s frame once settled",
    (frame) => {
      // The anti-overshoot half: a guard that never lifts stops the page
      // working, which is worse than the bug. Paper is covered below.
      store.state = "settled";
      const html = renderYear(frame);
      expect(html).toContain(`data-year-frame="${frame}"`);
      expect(html).not.toContain(LOADING);
      expect(html).not.toContain(ERROR_COPY);
    },
  );

  it("exposes the unsettled state as an attribute, for the live probe", () => {
    store.state = "pending";
    expect(renderYear("paper")).toContain('data-year-state="pending"');
    store.state = "error";
    expect(renderYear("paper")).toContain('data-year-state="error"');
  });
});

describe("YearShell — default routing is unchanged", () => {
  it("keeps paper on TimelineYear when no preview is requested", () => {
    // The 7.21 handoff moves paper to the subject-led view, but on Year paper
    // is currently the RICHEST frame, so that is a live product question. Until
    // it is answered the default must not move.
    const html = renderYear("paper");
    expect(html).toContain(TIMELINE_ROOT);
    expect(html).not.toContain('data-year-frame="paper"');
  });

  it("routes glass and colour to their own frames", () => {
    expect(renderYear("glass")).toContain('data-year-frame="glass"');
    expect(renderYear("color")).toContain('data-year-frame="color"');
  });
});

describe("?preview= — parsing the parameter", () => {
  it("recognises the two candidate paper Years", () => {
    expect(parseYearPreview("subject-led")).toBe("subject-led");
    expect(parseYearPreview("frame-b")).toBe("frame-b");
  });

  it("takes the first value when the param is repeated", () => {
    // Next hands repeated params as string[]; this scheme is single-valued,
    // the same convention /weekly and /daily use.
    expect(parseYearPreview(["frame-b", "subject-led"])).toBe("frame-b");
  });

  it("falls back to today's Year on anything unrecognised", () => {
    // A typo must not blank the page — the default IS the working surface.
    for (const raw of [
      undefined,
      "",
      "subjectled",
      "SUBJECT-LED",
      "timeline",
      " frame-b",
      [] as string[],
    ]) {
      expect(parseYearPreview(raw)).toBeNull();
    }
  });
});

describe("?preview= — the non-destructive comparison switch", () => {
  it("puts the 7.21 subject-led Year on paper", () => {
    // The 7.21 target: `ViewSet = { A: ViewsA, B: ViewsC, C: ViewsC }` — paper
    // adopts the subject-led views, which is what <YearC/> already is.
    const html = renderYear("paper", "subject-led");
    expect(html).toContain('data-year-frame="color"');
    expect(html).toContain("data-year-cluster=");
    expect(html).not.toContain(TIMELINE_ROOT);
  });

  it("puts the Frame-B progress list on paper", () => {
    const html = renderYear("paper", "frame-b");
    expect(html).toContain('data-year-frame="paper"');
    expect(html).toContain("data-year-pill");
    expect(html).not.toContain(TIMELINE_ROOT);
  });

  it("replaces today's Year rather than rendering beside it", () => {
    // Two Years on one screen would still satisfy a "the candidate rendered"
    // assertion, so the absence is checked as its own claim above and here.
    for (const p of ["subject-led", "frame-b"] as const) {
      expect(renderYear("paper", p)).not.toContain(TIMELINE_HEADING);
    }
  });

  it("is scoped to paper — glass and colour keep their own frames", () => {
    // 7.21 leaves glass on ViewsA, and the colour frame already IS the
    // subject-led view; forcing the param on either would misrepresent the
    // mapping the user is being asked to judge.
    expect(renderYear("glass", "subject-led")).toContain(
      'data-year-frame="glass"',
    );
    expect(renderYear("glass", "frame-b")).toContain('data-year-frame="glass"');
    expect(renderYear("color", "frame-b")).toContain('data-year-frame="color"');
  });

  it("never outranks the data-state guard", () => {
    // A preview must not become a back door to the confident-0% bug: an
    // unhydrated store says nothing about the year on ANY candidate.
    store.state = "pending";
    for (const p of ["subject-led", "frame-b"] as const) {
      const html = renderYear("paper", p);
      expect(html).toContain(LOADING);
      expect(html).not.toContain("% complete");
      expect(html).not.toContain("data-year-pill");
    }
  });
});

describe("YearB — the handoff's Frame-B row (views-b.jsx :90-124)", () => {
  it("renders one row per subject, keyed by subject id", () => {
    const html = renderB();
    expect(html).toContain('data-year-row="math"');
    expect(html).toContain('data-year-row="reading"');
  });

  it("names the subject in full", () => {
    const html = renderB();
    expect(html).toContain("Math");
    expect(html).toContain("Reading");
  });

  it('carries the "Now:" current-unit line', () => {
    // The handoff's rule (views-b.jsx :98): the first PARTIALLY taught unit
    // wins — not the first unit, and not the first untaught one.
    const html = renderB();
    expect(html).toContain("Now: Fractions");
    expect(html).not.toContain("Now: Place Value");
  });

  it("falls through to the first untaught unit when nothing is in progress", () => {
    store.lessons = store.lessons.filter((l) => l.subject !== "math");
    store.lessons.push(lesson("math", "u1", "planned", 1));
    const html = renderB();
    expect(html).toContain("Now: Place Value");
  });

  it("names the last unit once every unit is finished", () => {
    store.lessons = [
      lesson("math", "u1", "done", 1),
      lesson("math", "u2", "done", 5),
      lesson("math", "u3", "done", 9),
      lesson("reading", "r1", "done", 1),
    ];
    const html = renderB();
    expect(html).toContain("Now: Geometry");
  });

  it("shows the subject's % taught, lesson-weighted like every other frame", () => {
    // 3 done of 6 math lessons. Pinned because the handoff averages the UNIT
    // fractions instead (2/3 = 67%); this build deliberately keeps the shared
    // lane derivation so paper, glass and colour never quote three numbers.
    const html = renderB();
    expect(html).toContain(">50%<");
    expect(html).toContain(">0%<");
  });

  it("renders one track segment per unit, in the right state", () => {
    const html = renderB();
    // Four units across the two subjects, one segment each — and the three
    // math units are deliberately one of each state, so a segment that
    // defaulted to a single fill would show up here.
    expect(html.match(/data-year-seg=/g) ?? []).toHaveLength(4);
    expect(html).toContain('data-year-seg="done"');
    expect(html).toContain('data-year-seg="partial"');
    expect(html.match(/data-year-seg="todo"/g) ?? []).toHaveLength(2);
  });

  it("labels the track for screen readers, since the fill is the only cue", () => {
    const html = renderB();
    expect(html).toContain('aria-label="Math: 50% of the year taught"');
    expect(html).toContain('aria-label="Reading: 0% of the year taught"');
  });
});

describe("YearB — every unit stays reachable in the unit workspace", () => {
  it("renders each unit as a real button, not a decorative pill", () => {
    // The load-bearing invariant. A <span> here would look identical and strand
    // the paper frame with no route to the workspace — the regression the old
    // YearShell comment existed to prevent.
    const html = renderB();
    const pills = html.match(/data-year-pill/g) ?? [];
    expect(pills).toHaveLength(4);
    for (const label of ["Place Value", "Fractions", "Geometry", "Novels"]) {
      expect(html).toContain(label);
    }
    // Each pill is a <button type="button">, so it is keyboard-operable and
    // announces as an action.
    expect(html).toMatch(/<button[^>]*type="button"[^>]*data-year-pill/);
  });

  it("labels every pill with the full unit name for touch long-press", () => {
    const html = renderB();
    expect(html).toContain('title="Unit 2 · Fractions"');
  });

  it("marks only started units as started, for the tinted-pill ink", () => {
    const html = renderB();
    // u1 (100%) and u2 (50%) are started; u3 and r1 are not.
    expect(html.match(/data-started=""/g) ?? []).toHaveLength(2);
  });

  it("opens the unit the teacher actually pressed, under ITS OWN subject", async () => {
    // WHAT THE THREE TESTS ABOVE CANNOT SEE. They establish that four pills
    // render and that each is a real <button> — the markup half of
    // "every unit stays reachable". The other half is where the button GOES,
    // and `renderToStaticMarkup` fires no events, so `opened.calls` (declared at
    // the top of this file and pushed to by `onOpenUnit`) could never be
    // anything but empty. Four pills wired to one unit, or to none, passed
    // every assertion in this describe.
    //
    // The subject argument is the part worth pinning hardest. Unit ids are
    // unique only WITHIN a subject (the rule lib/wall-scope.ts is built on), so
    // a pill that reports its LANE's subject correctly for Math and wrongly for
    // Reading opens a different unit's plan with no error anywhere. Reading's
    // "r1" is in the fixture precisely so a hard-coded "math" fails here.
    const h = await mountReact(YearB);
    try {
      await h.render({
        lanes: buildLanes(store.subjects, store.lessons, store.units),
        onOpenUnit: (s: SubjectId, u: string) => opened.calls.push([s, u]),
      } as never);

      for (const name of [
        "Place Value",
        "Fractions",
        "Geometry",
        "Novels",
      ]) {
        // `mountReact.click` throws when nothing matches, so a pill that
        // stopped rendering fails here rather than quietly reducing the list.
        await h.click((el) => (el.textContent ?? "").includes(name));
      }

      expect(opened.calls).toEqual([
        ["math", "u1"],
        ["math", "u2"],
        ["math", "u3"],
        ["reading", "r1"],
      ]);
    } finally {
      await h.unmount();
    }
  });
});

describe("YearB — the surface never lies while the plan is loading", () => {
  it("shows a labelled loading affordance instead of a plausible empty year", () => {
    // The Supabase hydrate leaves an empty document in flight for 11–16s.
    // Rendering the rows off it would show every subject at 0% with no current
    // unit — a wrong plan rather than an obvious blank.
    store.state = "pending";
    const html = renderB();
    expect(html).toContain(LOADING);
    expect(html).toContain("Loading your plan");
    expect(html).not.toContain("Now:");
    expect(html).not.toContain(">0%<");
  });

  it("reports a failed hydrate rather than an empty curriculum", () => {
    store.state = "error";
    const html = renderB();
    expect(html).toContain(ERROR_COPY);
    expect(html).not.toContain("No units planned yet.");
    expect(html).not.toContain("Now:");
  });

  it("states the year is empty once settled and genuinely empty", () => {
    store.state = "settled";
    store.units = [];
    store.lessons = [];
    const html = renderB();
    expect(html).toContain("No units planned yet.");
    expect(html).not.toContain(LOADING);
  });

  it("does not show the stat dashboard over an unhydrated store", () => {
    // Stat cards are the same lie in numbers: "0 done · 0% complete" reads as
    // a fact about the teacher's year, not as "still loading".
    store.state = "pending";
    const html = renderB();
    expect(html).not.toContain("COMPLETE");
    expect(html).not.toContain("STANDARDS");
  });

  it("keeps the year/grade caption visible in every state", () => {
    for (const state of ["pending", "error", "settled"] as const) {
      store.state = state;
      expect(renderB()).toContain("2025–2026 · Grade 5");
    }
  });

  it("still renders the real rows once settled — the guard hides nothing", () => {
    // The opposite failure, and the likelier mistake: a permanent skeleton
    // passes every "the lie is gone" test while stranding the surface forever.
    const html = renderB();
    expect(html).toContain('data-year-row="math"');
    expect(html).not.toContain(LOADING);
    expect(html).not.toContain(ERROR_COPY);
  });
});

describe("YearB — the capabilities carried over from TimelineYear", () => {
  it("keeps the stat dashboard", () => {
    const html = renderB();
    expect(html).toContain("COMPLETE");
    expect(html).toContain("STANDARDS");
    expect(html).toContain("SKIPPED");
  });

  it("keeps the year filters control", () => {
    const html = renderB();
    expect(html).toContain("Filters &amp; View");
  });

  it("narrows the year to an active standard", () => {
    // The facet is not decoration: the popover paints active standard chips and
    // a "filters are on" badge from this same global state, so a filter that
    // does not narrow anything is a control lying about its own effect. Only
    // one lesson in the fixture carries 5.NF.1.
    appState.standards = ["5.NF.1"];
    const html = renderB();
    expect(html.match(/data-year-pill/g) ?? []).toHaveLength(1);
    expect(html).toContain("Fractions");
    expect(html).not.toContain("Place Value");
    expect(html).not.toContain("Geometry");
    // The subjects with nothing matching say so, rather than reading as a year
    // that was never planned.
    expect(html).toContain("No units match the current view.");
    expect(html).not.toContain("No units planned yet.");
  });

  it("never counts an archived lesson toward progress", () => {
    // The store keeps soft-deleted rows in `lessons`. If they reached the lane
    // derivation, a deleted-but-done lesson would inflate the segment fill, the
    // % and the "Now:" pick, while the stat cards and the standards coverage —
    // which filter archived out — quoted different numbers on the same screen.
    // The shared derivation already drops them (lib/year-v2-data.unitLessons);
    // pinned here so that stays true.
    store.lessons = [
      lesson("math", "u1", "done", 1),
      { ...lesson("math", "u1", "done", 2), archived: true } as Lesson,
      { ...lesson("math", "u2", "done", 5), archived: true } as Lesson,
      lesson("math", "u2", "planned", 6),
      lesson("reading", "r1", "planned", 1),
    ];
    const html = renderB();
    // Math: u1 is 1/1 done, u2 is 0/1. Counting the two archived rows would
    // make it 3/4 (75%) with u2 partially taught.
    expect(html).toContain(">50%<");
    expect(html).not.toContain(">75%<");
    expect(html).toContain("Now: Fractions");
    expect(html.match(/data-year-seg="done"/g) ?? []).toHaveLength(1);
  });

  it("leaves every unit standing when no standard is selected", () => {
    // The anti-overshoot half: an always-on predicate would pass the test above
    // while hiding the whole year.
    expect(renderB().match(/data-year-pill/g) ?? []).toHaveLength(4);
  });

  // NOT ASSERTED, deliberately: that the Grid|List switch is hidden
  // (`showViewToggle={false}` — Frame B has one layout, so the toggle would be
  // an inert control). The popover BODY only renders while it is open, and a
  // static render cannot open it, so any "the switch is absent" matcher passes
  // over markup that never contained the switch either way. That is a check
  // that cannot fail, which is worse than no check. It is verified live
  // instead, by opening the popover on /year.
});
