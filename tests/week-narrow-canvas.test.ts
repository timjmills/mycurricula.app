import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";

import { mountReact } from "./mount-react";

vi.setConfig({ testTimeout: 30000 });

// TWO thresholds, TWO questions. The bug this pins was one threshold answering
// both:
//
//     const showList = isNarrow || viewMode === "list";   // isNarrow = ≤900px
//
// That forced the List canvas for EVERY viewport ≤900px, which is the whole
// tablet tier as well as every phone — the three Week canvases were UNMOUNTED,
// not restyled, and a teacher who had chosen Grid was silently overridden. The
// justification written above it argued "a 5-column timeline at 360–900px is
// unusable" — true, and about the SCHEDULE TIMELINE, a different branch
// (`showSchedule`). The gate was reasoned for one canvas and applied to four.
//
// The split (user decision, 2026-08-01):
//   < 600px    List is still FORCED — a multi-day grid does not fit, and the
//              un-forced layout clipped "Expand all", the Grid|List toggle and
//              the Monday column at 375px (CLAUDE.md §4 forbids both the
//              off-screen control and the document-level horizontal scroll).
//   600–900px  the teacher's CHOSEN canvas renders, un-overridden.
//   > 900px    unchanged.
//   the SCHEDULE TIMELINE keeps the 900px gate throughout — that rationale was
//   always about its own canvas, and /schedule is the phone/tablet entry.
//
// So these tests drive a real VIEWPORT WIDTH through a matchMedia that actually
// evaluates the max-width query, rather than mocking each hook's boolean. A
// test that stubbed `usePhoneViewport` to true/false directly would pass just
// as happily if the shell were wired to the WRONG query — which is precisely
// the failure being guarded against.
//
// The canvases are mocked to bare markers on purpose: this is a test about
// which branch the shell TAKES, and mounting the real grids would make it a
// test about them instead.

const state = vi.hoisted(() => ({
  viewMode: "grid" as "grid" | "list",
  scheduleMode: false,
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    week: 12,
    currentWeek: 12,
    currentWeekBasis: "date",
    search: "",
    filters: { subjects: [], units: [], statuses: [], standards: [] },
    viewMode: state.viewMode,
    setViewMode: () => {},
    selectedLessonId: null,
    setSelectedLessonId: () => {},
    setSelectedDay: () => {},
    includeAllEvents: false,
  }),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: [],
    subjects: [],
    subjectById: {},
    addLesson: async () => null,
    lastChange: null,
  }),
  usePlannerDataState: () => "settled",
  scrollPlannerItemIntoView: () => {},
}));

vi.mock("@/lib/weekly-schedule-state", () => ({
  useWeeklyScheduleMode: () => ({
    setMode: () => {},
    scheduleMode: state.scheduleMode,
    events: "lessons",
    setEvents: () => {},
  }),
  WeeklyScheduleProvider: ({ children }: { children: unknown }) => children,
}));

// ── The canvases, as markers ──────────────────────────────────────────────
vi.mock("@/components/list", () => ({
  WeeklyList: () => createElement("div", null, "CANVAS:LIST"),
}));
vi.mock("@/components/weekly/WeekColumns", () => ({
  WeekColumns: () => createElement("div", null, "CANVAS:PAPER"),
}));
vi.mock("@/components/week-v2", () => ({
  WeekA: () => createElement("div", null, "CANVAS:GLASS"),
  WeekC: () => createElement("div", null, "CANVAS:COLOR"),
}));
vi.mock("@/components/schedule", () => ({
  ScheduleTimeline: () => createElement("div", null, "CANVAS:SCHEDULE"),
}));

// ── Everything the shell mounts around the canvas, stubbed to nothing ─────
vi.mock("@/components/daily", () => ({ IconRail: () => null }));
vi.mock("@/components/grid", () => ({ WeekNavigator: () => null }));
vi.mock("@/components/weekly/WeeklyViewControls", () => ({
  WeeklyViewControls: () => null,
}));
vi.mock("@/components/weekly/WeekGridSkeleton", () => ({
  WeekGridSkeleton: () => createElement("div", null, "CANVAS:SKELETON"),
}));
vi.mock("@/components/weekly/WeekEditBoard", () => ({
  WeekEditBoard: () => createElement("div", null, "CANVAS:EDIT"),
}));
vi.mock("@/components/weekly/WeeklyRailDrawer", () => ({
  WeeklyRailDrawer: () => null,
}));
vi.mock("@/components/year-v2/workspace-host", () => ({
  getUnitWorkspaceTarget: () => null,
  useUnitWorkspace: () => ({ open: () => {}, close: () => {}, target: null }),
}));
vi.mock("@/lib/edit-mode-state", () => ({ useViewEditMode: () => false }));
// NOT mocked, deliberately: `@/lib/use-phone-viewport` runs for real against
// the width below, so these tests fail if the shell is pointed at the wrong
// media query rather than merely at the wrong boolean.
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ frame: "paper" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/weekly",
}));

const { WeeklyShell } = await import("@/components/weekly/WeeklyShell");

/**
 * Install a matchMedia that really EVALUATES `(max-width: Npx)` against a
 * simulated viewport width, so both the 600px phone query and the 900px narrow
 * query resolve from the same single source of truth: the width.
 *
 * Anything that is not a max-width query THROWS rather than defaulting to
 * `matches: false` — an unmodelled query answering "no" is how a gate silently
 * stops being tested.
 */
function setViewportWidth(px: number): void {
  (globalThis as unknown as { window: Window }).window.matchMedia = ((
    query: string,
  ) => {
    const max = /^\(max-width:\s*([\d.]+)px\)$/.exec(query);
    if (!max) {
      throw new Error(
        `test matchMedia models only (max-width: Npx); got "${query}"`,
      );
    }
    return {
      matches: px <= Number(max[1]),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  state.viewMode = "grid";
  state.scheduleMode = false;
});

/** Mount at a width, return the markup, always unmounting. */
async function htmlAt(px: number): Promise<string> {
  const h = await mountReact(WeeklyShell as never);
  try {
    setViewportWidth(px);
    await h.render({} as never);
    const html = h.html();
    // CONTROL: a canvas really rendered. Without this, "no CANVAS:LIST" is
    // equally true of a shell that rendered nothing at all.
    expect(html).toMatch(/CANVAS:(PAPER|LIST|SCHEDULE|SKELETON|EDIT)/);
    return html;
  } finally {
    await h.unmount();
  }
}

describe("Weekly forces List on PHONES only, not the whole ≤900px tier", () => {
  it("forces List at 375px even when the teacher chose Grid", async () => {
    // The clipped-controls tier. A multi-day grid does not fit here, so the
    // force survives the split.
    const html = await htmlAt(375);
    expect(html).toContain("CANVAS:LIST");
    expect(html).not.toContain("CANVAS:PAPER");
  });

  it("still forces List at 599px — the last phone width", async () => {
    // PHONE_MQ is `(max-width: 599.98px)`; 599 is inside it.
    const html = await htmlAt(599);
    expect(html).toContain("CANVAS:LIST");
    expect(html).not.toContain("CANVAS:PAPER");
  });

  it("renders the chosen canvas at 600px — the first tablet width", async () => {
    // The boundary the user picked. One px wider than the test above and the
    // override is gone.
    const html = await htmlAt(600);
    expect(html).toContain("CANVAS:PAPER");
    expect(html).not.toContain("CANVAS:LIST");
  });

  it("renders the chosen canvas at 768px (tablet), NOT the forced List", async () => {
    const html = await htmlAt(768);
    expect(html).toContain("CANVAS:PAPER");
    expect(html).not.toContain("CANVAS:LIST");
  });

  it("renders the chosen canvas at 900px — narrow, but not a phone", async () => {
    // 900 is INSIDE NARROW_MQ. If the List force were still reading `isNarrow`
    // this width would return List, so this is the test that separates the two
    // queries.
    const html = await htmlAt(900);
    expect(html).toContain("CANVAS:PAPER");
    expect(html).not.toContain("CANVAS:LIST");
  });

  it("renders the chosen canvas at 1024px (desktop, unchanged)", async () => {
    const html = await htmlAt(1024);
    expect(html).toContain("CANVAS:PAPER");
    expect(html).not.toContain("CANVAS:LIST");
  });

  it("honours a CHOSEN List at tablet width", async () => {
    // The force is gone above 600px, but List must remain reachable by choice —
    // the fix must not swap one forced canvas for another in either direction.
    state.viewMode = "list";
    const html = await htmlAt(768);
    expect(html).toContain("CANVAS:LIST");
    expect(html).not.toContain("CANVAS:PAPER");
  });

  it("honours a CHOSEN List on a phone (same canvas, by choice not force)", async () => {
    state.viewMode = "list";
    const html = await htmlAt(375);
    expect(html).toContain("CANVAS:LIST");
  });
});

describe("The SCHEDULE timeline keeps the 900px gate", () => {
  it("withholds the timeline at 768px (tablet) — the canvas renders instead", async () => {
    // The half of the old rationale that was always about its own canvas: a
    // 5-column timeline is unusable across 360–900px and /schedule is the
    // phone/tablet entry. Splitting the List threshold must NOT have let the
    // timeline through on a tablet.
    state.scheduleMode = true;
    const html = await htmlAt(768);
    expect(html).not.toContain("CANVAS:SCHEDULE");
    expect(html).toContain("CANVAS:PAPER");
  });

  it("withholds the timeline at 900px — the last narrow width", async () => {
    state.scheduleMode = true;
    const html = await htmlAt(900);
    expect(html).not.toContain("CANVAS:SCHEDULE");
    expect(html).toContain("CANVAS:PAPER");
  });

  it("withholds the timeline at 375px, falling to the forced List", async () => {
    state.scheduleMode = true;
    const html = await htmlAt(375);
    expect(html).not.toContain("CANVAS:SCHEDULE");
    expect(html).toContain("CANVAS:LIST");
  });

  it("renders the timeline at 901px, the first non-narrow width", async () => {
    // The positive control for the three above: the branch is reachable, so its
    // absence below means the gate fired rather than the branch being broken.
    state.scheduleMode = true;
    const html = await htmlAt(901);
    expect(html).toContain("CANVAS:SCHEDULE");
  });
});
