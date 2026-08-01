import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson, Subject } from "@/lib/types";

// Two "add a resource" affordances did not open the app's resource composer.
//
//   • components/weekly/weekly-lesson-card.tsx — the expanded Week card's
//     "Add resource" opened NO dialog. It called addSectionResource(lesson.id,
//     sections[0]?.id ?? lesson.id, {type:"link", label:"New resource"}) — a
//     blind placeholder row with no URL, title or body, silently filed into
//     whichever section happened to be first.
//   • components/daily/planning-tabs/PlanningTabs.tsx — the Day planning
//     panel's Resources pane was READ-ONLY, with no add affordance at all.
//
// Both now open the shared composer (components/composer) for their lesson.
//
// These render the SHIPPED components rather than a helper, following
// tests/day-post-action.test.ts: vitest runs `environment: "node"` with no
// jsdom, but `react-dom/server` renders to a STRING there, so the assertions
// are about the real components' real output.
//
// EVERY ABSENCE ASSERTION IS PAIRED WITH A POSITIVE CONTROL in the same
// evaluation. An absence assertion alone fails open: a component that throws,
// renders nothing, or silently changes its markup would satisfy "the old
// placeholder string is gone" while proving nothing about the fix.

// ── Store + composer doubles ────────────────────────────────────────────────

const store = vi.hoisted(() => ({
  subjectById: {} as Record<string, Subject>,
  units: [] as unknown[],
  // Sections for the lesson under test — the OTHER resource seam.
  sections: [] as unknown[],
  // Every store WRITE either surface provokes. The old Week-card handler wrote
  // a placeholder resource the instant the button was clicked; the composer
  // must write NOTHING until its own Add commits, so both stay empty across a
  // click in the mount tests below.
  addSectionResourceCalls: [] as unknown[],
  editLessonCalls: [] as unknown[],
}));

// 30s, matching the other mount-based suites. The click tests below drive a
// real react-dom mount; that is a few hundred ms of honest work and breaches
// vitest's 5s default whenever several lanes share the machine. It does not
// mask a hang — every test here fails on an ASSERTION, never a timeout, when
// the wiring under test is mutated out.
vi.setConfig({ testTimeout: 30000 });

// The Week card now renders <LessonKebabMenu>, which calls useRouter() for the
// handoff's Plan / Teach / Post / Planner destinations. Without this the mount
// throws "invariant expected app router to be mounted" and every click test in
// this file fails for a reason that has nothing to do with the composer.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/weekly",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    subjectById: store.subjectById,
    units: store.units,
    getSections: () => store.sections,
    addSectionResource: (...args: unknown[]) => {
      store.addSectionResourceCalls.push(args);
    },
    editLesson: (...args: unknown[]) => {
      store.editLessonCalls.push(args);
    },
    describeStandard: () => undefined,
    mergeStandards: () => {},
    bumpLesson: () => {},
    archiveLesson: () => {},
    unarchiveLesson: () => {},
    restoreLesson: () => {},
    relocateLesson: () => {},
    duplicateLesson: () => {},
    setLessonStatus: () => {},
  }),
  usePlannerDataState: () => "settled",
  scrollPlannerItemIntoView: () => {},
  useCatalogOptional: () => ({
    describeStandard: () => undefined,
    subjectById: store.subjectById,
  }),
}));

// The composer seam. `composerAvailable` flips the provider's presence so the
// SAME assertions can be run with and without it — that pairing is what makes
// the "no button when no provider" assertion mean something.
const composerMock = vi.hoisted(() => ({
  available: true,
  opens: [] as { lessonId: string; mode?: string; sectionId?: string }[],
}));

vi.mock("@/components/composer", () => ({
  useComposerOptional: () =>
    composerMock.available
      ? {
          openComposer: (opts: {
            lesson: { id: string };
            mode?: string;
            initialSectionId?: string;
          }) => {
            composerMock.opens.push({
              lessonId: opts.lesson.id,
              mode: opts.mode,
              sectionId: opts.initialSectionId,
            });
          },
          closeComposer: () => {},
          openResMenu: () => {},
          closeResMenu: () => {},
        }
      : null,
}));

// The Week card reads the appearance axes + its subject color from providers
// no test mounts. Both throw outside their provider, and neither is what these
// assert — stub the two hooks and keep the rest of each module real.
vi.mock("@/lib/theme", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTheme: () => ({ style: "calm", frame: "glass" }),
}));

vi.mock("@/lib/palette", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSubjectColor: () => ({
    stripe: "var(--subj-1)",
    tint: "var(--subj-1-tint)",
    ink: "var(--subj-1-ink)",
    bright: "var(--subj-1-bright)",
  }),
}));

// Resources + Chat start HIDDEN in the Day planning panel
// (planning-tabs-state.ts: DEFAULT_HIDDEN = ["chat","resources"]) — a teacher
// adds them from the "+" menu. Open the Resources pane by default so these
// tests exercise it; everything else in the state module stays real.
vi.mock("@/components/daily/planning-tabs/planning-tabs-state", async (
  importOriginal,
) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const resourcesOpen = () => ({
    order: [...(actual.TOOL_KEYS as string[])],
    hidden: [] as string[],
    active: "resources",
  });
  return {
    ...actual,
    DEFAULT_HIDDEN: [] as string[],
    defaultPlanningTabsState: resourcesOpen,
    // `readPlanningTabs` must be overridden TOO, not just the default state.
    // It calls `defaultPlanningTabsState()` internally — a module-local call
    // this mock cannot intercept — so under a real mount (where `window`
    // exists) it would read the empty harness localStorage and hand back the
    // REAL defaults, with Resources hidden and no button to click.
    readPlanningTabs: resourcesOpen,
  };
});

// DOMPurify reports unsupported against linkedom's window, and sanitizeHtml
// correctly REFUSES to return unsanitized HTML rather than degrade — so a real
// mount of the Week card throws inside its objective/notes memo. Sanitization
// is not what these assert; pass the fixture HTML through untouched.
vi.mock("@/lib/sanitize-html", () => ({
  sanitizeHtml: (html: string) => html,
  stripHtml: (html: string) => (html ?? "").replace(/<[^>]*>/g, ""),
}));

// The unit pop-in reaches for a workspace host context no test provides.
vi.mock("@/components/unit-chip", () => ({ UnitChip: () => null }));

// The day-scoped chat pulls mock fixtures + its own state; not under test.
vi.mock("@/components/daily/Shoutbox", () => ({ Shoutbox: () => null }));

const { WeeklyLessonCard } = await import(
  "@/components/weekly/weekly-lesson-card"
);
const { PlanningTabs } = await import(
  "@/components/daily/planning-tabs/PlanningTabs"
);

// ── Fixtures ────────────────────────────────────────────────────────────────

const SUBJECT: Subject = {
  id: "math",
  name: "Math",
  slot: 1,
  icon: "ma",
  color: "subj-1",
} as unknown as Subject;

/** A lesson whose ONLY resource lives on the lesson-level seam
 *  (`Lesson.resources`) — exactly where the composer's default "Whole lesson"
 *  routing commits. Before the fix neither surface could see this row. */
function lessonWithLessonLevelResource(): Lesson {
  return {
    id: "L1",
    subject: "math",
    unit: "U1",
    title: "Fractions",
    objective: "I can compare fractions",
    preview: "Compare fractions with unlike denominators",
    directions: "",
    notes: "",
    week: 1,
    day: 0,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: "none",
    status: "not_done",
    standards: [],
    tasks: [],
    resources: [
      { type: "link", label: "Fraction wall PDF", url: "https://ex.com/fw" },
    ],
  } as unknown as Lesson;
}

beforeEach(() => {
  store.subjectById = { math: SUBJECT };
  store.units = [];
  store.sections = [];
  store.addSectionResourceCalls = [];
  store.editLessonCalls = [];
  composerMock.available = true;
  composerMock.opens = [];
});

// ── CLICK TESTS — what the render tests above CANNOT catch ─────────────────
//
// The renderToStaticMarkup tests assert that a button EXISTS. That is not the
// same as it being wired correctly: a composer opened on the wrong lesson, in
// the wrong mode, or pre-filed into a guessed section would render an
// identical button and keep every one of them green.
//
// These mount for real over linkedom (tests/mount-react.ts) so React's
// delegated click handler actually fires, and assert the EXACT payload the
// callsite hands the composer — plus that the click writes NOTHING to the
// store, which is the behavioural difference between the old blind
// addSectionResource and a composer that commits on save.
describe("click wiring — the exact composer payload", () => {
  it("Week card opens the composer on ITS lesson, whole-lesson, writing nothing", async () => {
    // A section EXISTS — so `sections[0]?.id` is a real value the old code
    // would have filed into. Without this the sectionId assertion could pass
    // for the wrong reason (nothing to guess).
    store.sections = [{ id: "S1", heading: "Warm up", resources: [] }];

    const { mountReact } = await import("./mount-react");
    const h = await mountReact(WeeklyLessonCard);
    try {
      await h.render({ lesson: lessonWithLessonLevelResource(), expanded: true });
      await h.click(
        (el) => el.getAttribute("aria-label") === "Add a resource to this lesson",
      );

      // The payload — lesson identity, mode, and the ABSENCE of a section
      // guess. `sections` is non-empty below, so a callsite that reverted to
      // sections[0] would fail on `sectionId` while every render test passed.
      expect(composerMock.opens).toEqual([
        { lessonId: "L1", mode: "resource", sectionId: undefined },
      ]);

      // Nothing committed on open. The OLD handler wrote a placeholder here.
      expect(store.addSectionResourceCalls).toHaveLength(0);
      expect(store.editLessonCalls).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });

  it("Day pane opens the composer on ITS lesson, whole-lesson, writing nothing", async () => {
    store.sections = [{ id: "S1", heading: "Warm up", resources: [] }];

    const { mountReact } = await import("./mount-react");
    const h = await mountReact(PlanningTabs);
    try {
      await h.render({ lesson: lessonWithLessonLevelResource() });
      await h.click(
        (el) => el.getAttribute("aria-label") === "Add a resource to this lesson",
      );

      expect(composerMock.opens).toEqual([
        { lessonId: "L1", mode: "resource", sectionId: undefined },
      ]);
      expect(store.addSectionResourceCalls).toHaveLength(0);
      expect(store.editLessonCalls).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });
});

// ── DEFECT 1 — the expanded Week card ───────────────────────────────────────

describe("Week card — expanded 'Add resource'", () => {
  it("renders the add affordance, promising composer routing not first-section filing", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyLessonCard, {
        lesson: lessonWithLessonLevelResource(),
        expanded: true,
      }),
    );

    // POSITIVE CONTROL — the card really rendered its expanded body. Without
    // this, every assertion below would pass on an empty string.
    expect(html).toContain("Fractions");
    expect(html).toContain("Add resource");

    // The button's PROMISE is the part a server render can check. The old
    // tooltip committed the teacher to the old blind behavior — "drops into
    // the first section" — which is exactly what the composer replaced.
    expect(html).toContain("you choose where it files");
    expect(html).not.toContain("drops into the first section");
  });

  // NOT PROVABLE HERE, AND DELIBERATELY NOT FAKED: that CLICKING the button
  // calls openComposer. vitest runs `environment: "node"` with no jsdom, so
  // there is no click to dispatch and renderToStaticMarkup discards handlers.
  // An `expect(addSectionResourceCalls).toHaveLength(0)` here would PASS
  // against the OLD code too — the old handler only wrote on click, never on
  // render — so it would assert nothing while looking like coverage. The
  // click→openComposer binding is verified in the browser instead.

  it("shows a lesson-level resource — the seam the composer commits to", () => {
    // The card previously derived its list from SECTIONS ONLY
    // (lessonResources(getSections(id))), so a "Whole lesson" commit — the
    // composer's default routing — landed in Lesson.resources and rendered
    // NOWHERE on the card. The teacher added a resource and saw nothing.
    const html = renderToStaticMarkup(
      createElement(WeeklyLessonCard, {
        lesson: lessonWithLessonLevelResource(),
        expanded: true,
      }),
    );

    expect(html).toContain("Fraction wall PDF");
  });

  it("hides the affordance when neither composer nor editor is reachable", () => {
    composerMock.available = false;

    const html = renderToStaticMarkup(
      createElement(WeeklyLessonCard, {
        lesson: lessonWithLessonLevelResource(),
        expanded: true,
      }),
    );

    // POSITIVE CONTROL — the card still rendered; only the button is gone.
    // A crash or empty render would otherwise satisfy the absence below.
    expect(html).toContain("Fractions");
    expect(html).not.toContain("Add resource");
  });
});

// ── DEFECT 2 — the Day planning panel's Resources pane ──────────────────────

describe("Day planning panel — Resources pane", () => {
  it("renders an add affordance instead of a read-only list", () => {
    const html = renderToStaticMarkup(
      createElement(PlanningTabs, { lesson: lessonWithLessonLevelResource() }),
    );

    // POSITIVE CONTROL — the Resources pane itself rendered.
    expect(html).toContain("Fraction wall PDF");
    expect(html).toContain("Add resource");
  });

  it("shows section-attached resources — the pane's false empty", () => {
    // The pane read ONLY `lesson.resources`, so a lesson whose resources all
    // live on its SECTIONS rendered "No resources attached to this lesson
    // yet." — a false empty, on a lesson that had one.
    store.sections = [
      {
        id: "S1",
        heading: "Warm up",
        resources: [
          { id: "r1", type: "link", label: "Number talk slides", url: "https://ex.com/nt" },
        ],
      },
    ];

    const lesson = lessonWithLessonLevelResource();
    (lesson as unknown as { resources: unknown[] }).resources = [];

    const html = renderToStaticMarkup(createElement(PlanningTabs, { lesson }));

    expect(html).toContain("Number talk slides");
    expect(html).not.toContain("No resources attached to this lesson yet");
  });

  it("omits the add affordance when no composer provider is mounted", () => {
    composerMock.available = false;

    const html = renderToStaticMarkup(
      createElement(PlanningTabs, { lesson: lessonWithLessonLevelResource() }),
    );

    // POSITIVE CONTROL — the pane rendered its list; only the button is gone.
    expect(html).toContain("Fraction wall PDF");
    expect(html).not.toContain("Add resource");
  });
});
