import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson, Subject } from "@/lib/types";

// 30s, matching the other mount-based suites. Rendering the real shell breaches
// vitest's 5s default under parallel lane load. Not a hang mask: every test
// here fails on an ASSERTION when the /weekly gate is mutated out.
vi.setConfig({ testTimeout: 30000 });

// /weekly must not answer a lesson click with a right panel.
//
// The user's instruction was "I don't want any right panel on the weekly view
// — a click should expand the lesson". THREE surfaces could produce one, and
// this file pins the one that lives outside <WeeklyShell> and is therefore the
// easiest to miss: the shell-level <RightPanel>, mounted on EVERY planner
// route by app/(planner)/layout.tsx. Its /weekly gate used to read
//
//     if (selectedLessonId && !weeklyDrawerBand)
//       return <LessonDetailPanel lessonId={selectedLessonId} />;
//
// so selecting a card on a >1280px viewport popped a lesson-detail panel that
// no code inside components/weekly/ can see or suppress.
//
// ── Why this file is mostly positive controls ─────────────────────────────
// The headline assertion is an ABSENCE ("no lesson panel on /weekly"), and an
// absence assertion FAILS OPEN: it passes just as happily against a RightPanel
// that renders nothing at all, against mocks that made the component throw
// early, and against a typo'd marker string that could never match anything.
// So every absence here is paired, IN THE SAME RUN, with a positive control
// that must produce the very marker the absence looks for:
//
//   • /daily + a selected lesson MUST render the lesson panel — proves the
//     component, the mocks, and the marker string all work, so the /weekly
//     absence is a fact about /weekly and not about this test.
//   • /weekly + todoPanelOpen MUST render the to-do list — proves removing the
//     lesson panel did not take the To-dos icon down with it. That icon lives
//     in the GlobalRail on every route; if the /weekly gate returned a blanket
//     null, clicking it would do nothing and a real control would have gone
//     silently dead behind a correct-looking panel removal.
//
// Rendered via `react-dom/server` (vitest runs `environment: "node"`; no jsdom,
// no new dependency) — the same technique as tests/week-columns-add.test.ts.
// SSR is the right instrument here rather than a coincidence: `weeklyDrawerBand`
// initialises to false and is only raised by a post-mount matchMedia effect, so
// a server render reproduces exactly the >1280px desktop case where the old
// gate DID mount the panel.

const state = vi.hoisted(() => ({
  pathname: "/weekly",
  selectedLessonId: null as string | null,
  todoPanelOpen: false,
  commentsPanelOpen: false,
}));

const LESSON: Lesson = {
  id: "l-1",
  subject: "math",
  unit: "u-1",
  week: 12,
  day: 0,
  title: "Comparing fractions",
  preview: "Warm-up, then partner work.",
  objective: "Compare fractions with unlike denominators.",
  directions: "",
  notes: "",
  status: "not_done",
  standards: [],
  tasks: [],
  resources: [],
} as unknown as Lesson;

const SUBJECT: Subject = {
  id: "math",
  name: "Math",
  cls: "math",
} as unknown as Subject;

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    selectedLessonId: state.selectedLessonId,
    setSelectedLessonId: () => {},
    todoPanelOpen: state.todoPanelOpen,
    commentsPanelOpen: state.commentsPanelOpen,
    toggleTodoPanel: () => {},
    toggleCommentsPanel: () => {},
  }),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: [LESSON],
    subjectById: { math: SUBJECT },
    describeStandard: () => null,
  }),
}));

// The panel bodies read the mock fixture directly for to-dos and tags.
vi.mock("@/lib/mock", () => ({
  TODOS: [
    {
      id: "t-1",
      title: "Print the fraction strips",
      scope: "personal",
      done: false,
      due: null,
      tags: [],
    },
  ],
  TAG_BY_ID: {},
  LESSONS: [LESSON],
  LESSON_BY_ID: { "l-1": LESSON },
}));

/** The lesson-detail panel's root carries this; nothing else does. */
const LESSON_PANEL = 'aria-label="Lesson detail';
/** The to-do panel's root. */
const TODO_PANEL = 'aria-label="To-do list"';

async function render(): Promise<string> {
  const { RightPanel } = await import("@/components/shell/right-panel");
  return renderToStaticMarkup(createElement(RightPanel));
}

describe("/weekly renders no lesson-detail right panel", () => {
  beforeEach(() => {
    state.pathname = "/weekly";
    state.selectedLessonId = null;
    state.todoPanelOpen = false;
    state.commentsPanelOpen = false;
  });

  it("POSITIVE CONTROL — /daily with a selected lesson still opens the lesson panel", async () => {
    state.pathname = "/daily";
    state.selectedLessonId = "l-1";
    const html = await render();
    // If this fails, every absence assertion below is meaningless: it would
    // mean the marker, the mocks, or the component is broken, not that
    // /weekly is clean.
    expect(html).toContain(LESSON_PANEL);
  });

  it("/weekly with a selected lesson renders NO lesson-detail panel", async () => {
    state.pathname = "/weekly";
    state.selectedLessonId = "l-1";
    const html = await render();
    expect(html).not.toContain(LESSON_PANEL);
    // Not merely "no lesson panel" — nothing at all, so no other right-hand
    // surface quietly took its place.
    expect(html).toBe("");
  });

  it("/weekly?lesson= deep links land on the same panel-free surface", async () => {
    // The deep-link read path sets selectedLessonId on mount exactly like a
    // click does (WeeklyShell's initialLink effect), so a link shared into the
    // week must not be the one way back to a right panel.
    state.pathname = "/weekly";
    state.selectedLessonId = "l-1";
    expect(await render()).not.toContain(LESSON_PANEL);
  });

  it("POSITIVE CONTROL — the To-dos icon still opens its panel on /weekly", async () => {
    state.pathname = "/weekly";
    state.todoPanelOpen = true;
    const html = await render();
    expect(html).toContain(TODO_PANEL);
  });

  it("POSITIVE CONTROL — To-dos still works on /weekly WITH a lesson selected", async () => {
    // The removed rail used to be the /weekly home for To-dos, so the
    // interesting case is both flags live at once: the lesson must not
    // resurrect a panel, and the to-do list must still win.
    state.pathname = "/weekly";
    state.todoPanelOpen = true;
    state.selectedLessonId = "l-1";
    const html = await render();
    expect(html).toContain(TODO_PANEL);
    expect(html).not.toContain(LESSON_PANEL);
  });
});
