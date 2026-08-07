import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";

// A CONTROL MAY NOT CLAIM A MODE THE BODY DOES NOT SHOW.
//
// Below 600px WeeklyShell forces the WeeklyList canvas
// (`showList = isPhoneViewport || viewMode === "list"`) but only `isNarrow` was
// passed to <WeeklyViewControls>, so the header toggle went on reporting the
// STORED viewMode. A teacher whose stored choice was Grid saw the Grid segment
// lit above a list, a screen reader was told "Grid, checked" while List
// rendered, and pressing Grid did nothing at all — ToggleGroup never fires
// onChange for the option that is already active, so the press was a silent
// no-op with no way to tell it apart from a broken handler. Found live at 375px
// (docs/qa/2026-08-02-week.md, MAJOR 1).
//
// The same file had ALREADY refused to ship this exact failure for Schedule
// (dropped below 900px, "would let the control claim a mode the body never
// shows"). The reasoning simply was not carried across when the phone gate
// landed, which is why the tests below assert the RULE at both breakpoints
// rather than the one symptom.
//
// ── Two levels, because either alone passes the broken code ───────────────
//
//   1. The CONTROL, driven by its prop. Pins what the toggle reports and
//      offers, and — the invariant `68e2f5f` exists to protect — that it never
//      writes the stored preference: the override is read-side only, so
//      widening the viewport gives the teacher their Grid back.
//
//   2. The SHELL, driven by a real viewport width through a real matchMedia.
//      This is the one that catches the actual bug. A prop-level test passes
//      happily against a shell that never passes the prop — which is precisely
//      the state master shipped in. So these mount WeeklyShell, let
//      `usePhoneViewport` run for real, and assert the CANVAS and the CONTROL
//      agree. Wiring the shell to the wrong query (isNarrow, 900px) fails them
//      too, since 768px must show Grid on both sides.
//
// The canvases are mocked to bare markers: this is a test about which branch
// renders and what the header says about it, not about the grids themselves.

const state = vi.hoisted(() => ({
  viewMode: "grid" as "grid" | "list",
  scheduleMode: false,
  /** Every setViewMode call. Must stay EMPTY — the gates are read-side only. */
  writes: [] as string[],
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    week: 12,
    currentWeek: 12,
    currentWeekBasis: "date",
    search: "",
    filters: { subjects: [], units: [], statuses: [], standards: [] },
    viewMode: state.viewMode,
    setViewMode: (v: string) => {
      state.writes.push(v);
      state.viewMode = v as "grid" | "list";
    },
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

// ── The shell's surroundings ──────────────────────────────────────────────
// WeekNavigator renders its `actions` slot and nothing else. Stubbing it to
// `null` (as tests/week-narrow-canvas.test.ts does) would leave
// <WeeklyViewControls> created-but-never-invoked, and every header assertion
// below would be vacuously true.
vi.mock("@/components/grid", () => ({
  WeekNavigator: ({ actions }: { actions?: ReactNode }) =>
    createElement("div", { "data-navigator": "true" }, actions),
}));
// next/link needs an app-router context this harness has no way to supply, and
// the two links in the actions slot are not what is under test.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href?: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/daily", () => ({ IconRail: () => null }));
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
// the width below, so the shell tests fail if it is wired to the wrong media
// query rather than merely to the wrong boolean.
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ frame: "paper" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/weekly",
}));

const { WeeklyViewControls } = await import(
  "@/components/weekly/WeeklyViewControls"
);
const { WeeklyShell } = await import("@/components/weekly/WeeklyShell");

/**
 * A matchMedia that really EVALUATES `(max-width: Npx)` against a simulated
 * width, so the 599.98px phone query and the 900px narrow query both resolve
 * from one source of truth. Anything else THROWS — an unmodelled query quietly
 * answering "no" is how a gate stops being tested without anyone noticing.
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

interface Radio {
  label: string;
  checked: string | null;
}

/**
 * The "Weekly view mode" radiogroup's options, in DOM order. Scoped to that
 * group by aria-label so the schedule-scope group (a second radiogroup on the
 * same row) can never be read by mistake.
 *
 * Returns null when the group is absent — distinguishing "the group rendered
 * with these options" from "nothing rendered at all", which every assertion
 * below depends on.
 */
function viewRadios(html: string, root: Element | null): Radio[] | null {
  if (root === null) {
    // A mount that rendered nothing would satisfy every "Grid is absent"
    // assertion. Surface it as a distinct answer rather than an empty list.
    expect(html.length).toBeGreaterThan(0);
    return null;
  }
  return Array.from(root.querySelectorAll('[role="radio"]')).map((el) => ({
    label: (el.textContent ?? "").trim(),
    checked: el.getAttribute("aria-checked"),
  }));
}

const GROUP = '[role="radiogroup"][aria-label="Weekly view mode"]';

beforeEach(() => {
  state.viewMode = "grid";
  state.scheduleMode = false;
  state.writes = [];
});

describe("the Week view toggle reports the canvas that is actually showing", () => {
  it("reports List — not the stored Grid — while the phone gate holds", async () => {
    const h = await mountReact(WeeklyViewControls);
    try {
      await h.render({ isPhoneViewport: true });
      const radios = viewRadios(h.html(), h.query(GROUP));

      // The group rendered (so the absence of Grid below is a fact about the
      // option, not about the mount) and offers ONLY List.
      expect(radios).not.toBeNull();
      expect(radios).toEqual([{ label: "List", checked: "true" }]);

      // Both halves of the fix, stated separately from the shape above:
      // the Grid option is gone, AND the reported value moved with it. Had only
      // the option been dropped, `value` would still be "grid", matching no
      // option, and List would read aria-checked="false".
      expect(radios?.some((r) => r.label === "Grid")).toBe(false);
      expect(radios?.find((r) => r.label === "List")?.checked).toBe("true");
    } finally {
      await h.unmount();
    }
  });

  it("leaves the stored preference alone, and restores it when the gate lifts", async () => {
    // THE INVARIANT `68e2f5f` PROTECTS. The phone force is a render-time
    // override, never a write: a teacher who picked Grid on a tablet and opened
    // the week on a phone must get Grid back on the way home, not List.
    const h = await mountReact(WeeklyViewControls);
    try {
      await h.render({ isPhoneViewport: true });
      expect(state.viewMode).toBe("grid"); // untouched under the override
      expect(state.writes).toEqual([]); // and nothing was persisted

      // Widen — the same mount, the same store, one prop changed.
      await h.render({ isPhoneViewport: false });
      const radios = viewRadios(h.html(), h.query(GROUP));

      expect(radios).toEqual([
        { label: "Grid", checked: "true" },
        { label: "List", checked: "false" },
        { label: "Schedule", checked: "false" },
      ]);
      expect(state.writes).toEqual([]);
    } finally {
      await h.unmount();
    }
  });

  it("still reports a DELIBERATE List choice as List on a phone", async () => {
    // The override must not be visible as a change when there is nothing to
    // override: a teacher who chose List sees exactly what they chose.
    state.viewMode = "list";
    const h = await mountReact(WeeklyViewControls);
    try {
      await h.render({ isPhoneViewport: true });
      expect(viewRadios(h.html(), h.query(GROUP))).toEqual([
        { label: "List", checked: "true" },
      ]);
      expect(state.writes).toEqual([]);
    } finally {
      await h.unmount();
    }
  });

  it("keeps dropping Schedule on the narrow tier, and reports grid/list there", async () => {
    // The precedent this fix was modelled on, pinned in the same file so a
    // future change to one gate cannot quietly undo the other. 600–900px: no
    // Schedule option, but Grid is a real choice again.
    state.scheduleMode = true;
    const h = await mountReact(WeeklyViewControls);
    try {
      await h.render({ isNarrow: true, isPhoneViewport: false });
      expect(viewRadios(h.html(), h.query(GROUP))).toEqual([
        { label: "Grid", checked: "true" },
        { label: "List", checked: "false" },
      ]);
    } finally {
      await h.unmount();
    }
  });
});

describe("WeeklyShell hands the toggle the SAME width answers the canvas uses", () => {
  /**
   * Mount the shell at a width and report what the canvas and the header each
   * say. The pairing is the point: a control that agrees with the canvas cannot
   * be lying about it.
   */
  async function shellAt(
    px: number,
  ): Promise<{ canvas: string; radios: Radio[] | null }> {
    const h = await mountReact(WeeklyShell);
    try {
      setViewportWidth(px);
      await h.render({} as never);
      const html = h.html();
      // CONTROL: a canvas really mounted, so "not PAPER" below cannot be a
      // shell that rendered nothing.
      const canvas = /CANVAS:(PAPER|LIST|SCHEDULE|SKELETON|EDIT|GLASS|COLOR)/
        .exec(html)?.[1];
      expect(canvas).toBeDefined();
      return { canvas: canvas as string, radios: viewRadios(html, h.query(GROUP)) };
    } finally {
      await h.unmount();
    }
  }

  it("at 375px the forced List canvas and the header agree", async () => {
    // THE REGRESSION TEST. Drop `isPhoneViewport` from the callsite and this
    // fails: the canvas is List while the header still lights Grid.
    const { canvas, radios } = await shellAt(375);
    expect(canvas).toBe("LIST");
    expect(radios).toEqual([{ label: "List", checked: "true" }]);
    expect(state.writes).toEqual([]);
  });

  it("at 599px — the last phone width — they still agree", async () => {
    const { canvas, radios } = await shellAt(599);
    expect(canvas).toBe("LIST");
    expect(radios).toEqual([{ label: "List", checked: "true" }]);
  });

  it("at 600px the stored Grid renders AND the header offers Grid again", async () => {
    // One pixel wider. If the controls were wired to the 900px narrow query
    // instead of the 600px phone query, the canvas here would be Grid while the
    // header still showed List-only — the same lie, mirrored.
    const { canvas, radios } = await shellAt(600);
    expect(canvas).toBe("PAPER");
    expect(radios).toEqual([
      { label: "Grid", checked: "true" },
      { label: "List", checked: "false" },
    ]);
  });

  it("at 768px (tablet) the stored Grid still renders and is reported", async () => {
    const { canvas, radios } = await shellAt(768);
    expect(canvas).toBe("PAPER");
    expect(radios?.find((r) => r.label === "Grid")?.checked).toBe("true");
    // Schedule stays gated at 900, so the tablet tier shows two options.
    expect(radios?.map((r) => r.label)).toEqual(["Grid", "List"]);
  });

  it("at 1024px all three options are back and Grid is reported", async () => {
    const { canvas, radios } = await shellAt(1024);
    expect(canvas).toBe("PAPER");
    expect(radios).toEqual([
      { label: "Grid", checked: "true" },
      { label: "List", checked: "false" },
      { label: "Schedule", checked: "false" },
    ]);
  });

  it("crossing 375 → 768 never wrote the preference", async () => {
    // The end-to-end form of the invariant: the phone visit leaves no trace, so
    // the tablet visit finds the teacher's own choice intact.
    await shellAt(375);
    expect(state.writes).toEqual([]);
    expect(state.viewMode).toBe("grid");

    const { canvas } = await shellAt(768);
    expect(canvas).toBe("PAPER");
    expect(state.writes).toEqual([]);
  });
});
