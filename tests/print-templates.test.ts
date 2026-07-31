import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement, type ComponentType, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import type { Lesson, Subject, Unit } from "@/lib/types";
import type { Weekday } from "@/lib/use-school-week";

// Regression tests for the two print templates — /weekly/print and /year/print.
//
// WHY PRINT GETS ITS OWN GATE. CLAUDE.md §2 makes "print- and paper-friendly"
// a core product principle, and paper is the one surface with NO recourse: a
// teacher standing in front of a class holding a sheet cannot re-query, cannot
// scroll, and cannot tell that anything is missing. So the failure mode these
// tests pin is not "looks wrong" — it is CONTENT SILENTLY ABSENT FROM PAPER.
// Four independent ways the templates dropped a lesson without a mark on the
// page:
//
//   1. The weekly grid derived its column count from `WEEK_DAYS` in lib/mock —
//      a literal Sun–Thu array — while its own comment claimed it "respects
//      the school-week configuration". On a six-day school week every lesson
//      with `day >= 5` fell off the right edge of the loop. On a Mon–Fri
//      school every column was MISLABELLED, which is worse than blank: the
//      sheet is confidently wrong.
//   2. Neither `archived` nor the store's real catalog was consulted on the
//      weekly side. Archived (soft-deleted) lessons printed as live plan; and
//      because both templates iterated the MOCK subject/unit catalogs, any
//      subject outside the eight mock ids had no row at all and any custom
//      unit printed as a raw database id.
//   3. /weekly/print accepted no `?week=` param, so every cold load printed
//      whatever week the store happened to be sitting on.
//   4. /year/print had no hydration guard whatsoever. The Supabase hydrate
//      takes 11–16s, during which the document is legitimately empty — so
//      printing in that window emitted a complete, confident, all-"—" year.
//
// HOW THESE RUN. vitest is `environment: "node"`, but `react-dom/server`
// renders to a STRING in node with no jsdom and no new dependency — the same
// technique as tests/hub-browse-empty.test.ts. So these assert against the
// shipped components' real output rather than a re-implementation of their
// logic in the test.
//
// The hooks below are mocked because none of them is reachable in a static
// render: they are React contexts (`usePlanner`, `useAppState`, `useLabels`)
// or post-mount effects (`useSchoolWeek`, `useAcademicYear`, whose SSR value
// is pinned to a default precisely so hydration matches). Mocking
// `useSchoolWeek` rather than `useOrderedWeekdays` is deliberate: it leaves
// lib/week-order.ts REAL, so the test exercises the whole
// configured-week → ordered-columns chain the template is supposed to use.

// ── Mocked stores ─────────────────────────────────────────────────────────

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  subjectById: {} as Record<string, Subject>,
  units: [] as Unit[],
  unitById: {} as Record<string, Unit>,
  week: 12,
  curriculumLabel: "",
  schoolWeek: ["sun", "mon", "tue", "wed", "thu"] as Weekday[],
  // The left filter panel + top-bar search. /weekly/print shares the (planner)
  // layout with /weekly, so an in-app navigation preserves these — which is why
  // the sheet reads them rather than printing the whole unfiltered week.
  filters: {
    subjects: [] as string[],
    units: [] as string[],
    statuses: [] as string[],
    standards: [] as string[],
    showHolidays: true,
  },
  search: "",
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: store.subjectById,
    units: store.units,
    unitById: store.unitById,
  }),
  usePlannerDataState: () => store.state,
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({
    week: store.week,
    currentUser: { curriculumLabel: store.curriculumLabel },
    filters: store.filters,
    search: store.search,
  }),
}));

vi.mock("@/lib/labels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/labels")>()),
  useLabels: () => ({
    subject: "Subject",
    unit: "Unit",
    week: "Week",
    lesson: "Lesson",
    section: "Section",
  }),
}));

vi.mock("@/lib/use-school-week", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-school-week")>()),
  useSchoolWeek: () => ({
    days: store.schoolWeek,
    setDays: () => {},
    saveState: { status: "idle" as const },
  }),
}));

vi.mock("@/lib/use-academic-year", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-academic-year")>()),
  // A fixed 36-week band starting 2026-08-16 so the month sections and their
  // "Wk N" headers are deterministic regardless of when the suite runs.
  useAcademicYear: () => ({
    start: new Date(2026, 7, 16),
    end: new Date(2027, 3, 30),
    setRange: () => {},
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

/**
 * A subject id the `SubjectId` union does not list.
 *
 * That union is a type-level fiction: it enumerates the eight mock fixture
 * subjects, while the store hydrates whatever subjects a real school defined.
 * The cast is the honest way to write the case the templates got wrong —
 * widening the union app-wide is a separate change and not this lane's.
 */
function SUBJ(id: string): Lesson["subject"] {
  return id as Lesson["subject"];
}

function subject(id: string, name: string, cls = id): Subject {
  return { id, name, cls, icon: name[0] } as unknown as Subject;
}

function unit(id: string, subjectId: string, name: string): Unit {
  return { id, subject: subjectId, name, weeks: "Wk 1" } as unknown as Unit;
}

function lesson(patch: Partial<Lesson> & { id: string }): Lesson {
  return {
    subject: "math",
    unit: "u-math-1",
    title: "Untitled",
    objective: "",
    preview: "",
    directions: "",
    notes: "",
    resources: [],
    standards: [],
    week: 12,
    day: 0,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: null,
    status: "not_done",
    commentCount: 0,
    unreadComments: 0,
    tasks: [],
    ...patch,
  } as Lesson;
}

const MATH = subject("math", "Math");
const READING = subject("reading", "Reading");
/** A subject that exists in NO mock fixture — the whole point. A school that
 *  adds "Robotics" has a row on screen and, before this fix, no row on paper. */
const ROBOTICS = subject("robotics", "Robotics");

const U_MATH = unit("u-math-1", "math", "Unit 3 · Fractions on a Number Line");
/** Likewise: a unit id that UNIT_BY_ID in lib/mock has never heard of. */
const U_CUSTOM = unit("u-custom-9", "robotics", "Unit 1 · Line Following");

const LOADING = 'role="status" aria-busy="true"';
const ERROR_COPY = "Couldn’t load your plan";

function setCatalog(subjects: Subject[], units: Unit[]): void {
  store.subjects = subjects;
  store.subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]));
  store.units = units;
  store.unitById = Object.fromEntries(units.map((u) => [u.id, u]));
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.week = 12;
  store.curriculumLabel = "";
  store.schoolWeek = ["sun", "mon", "tue", "wed", "thu"];
  store.filters = {
    subjects: [],
    units: [],
    statuses: [],
    standards: [],
    showHolidays: true,
  };
  store.search = "";
  setCatalog([MATH, READING], [U_MATH]);
});

// ── Renderers ─────────────────────────────────────────────────────────────

/**
 * Render /weekly/print's page module.
 *
 * The route is being converted from a bare client page into the server-page +
 * client-view split that `/weekly/page.tsx` already uses, because THAT is how
 * this codebase reads a `?week=` search param (the repo deliberately avoids
 * `useSearchParams`, see components/daily/LessonDetail.tsx:282). This helper
 * accepts both shapes so every assertion below fails for its OWN reason
 * against the unmodified template rather than an import error: the async
 * (server) shape is awaited with searchParams, the legacy sync shape is
 * rendered as an element and simply ignores the params — which is exactly the
 * defect the `?week=` cases assert on.
 */
async function renderWeekly(
  params: Record<string, string> = {},
): Promise<string> {
  const mod = await import("@/app/(planner)/weekly/print/page");
  const Page = mod.default as unknown as (p: unknown) => unknown;
  const out =
    Page.constructor.name === "AsyncFunction"
      ? await Page({ searchParams: Promise.resolve(params) })
      : createElement(Page as ComponentType);
  return renderToStaticMarkup(out as ReactElement);
}

async function renderYear(): Promise<string> {
  const mod = await import("@/app/(planner)/year/print/page");
  return renderToStaticMarkup(
    createElement(mod.default as unknown as ComponentType),
  );
}

// Pay both print pages' cold transform ONCE, outside any test's measured
// window. See the same note in tests/archive-school-years.test.ts: the first
// dynamic import of each route's module graph costs more than the default
// 5000ms testTimeout, so whichever test happened to reach a given page first
// timed out on warm-up cost rather than on anything it asserts. The per-test
// budget stays at the default so it still guards the render.
beforeAll(async () => {
  await import("@/app/(planner)/weekly/print/page");
  await import("@/app/(planner)/year/print/page");
}, 120_000);

const WEEKLY_CSS = new URL(
  "../app/(planner)/weekly/print/print.module.css",
  import.meta.url,
);
const YEAR_CSS = new URL(
  "../app/(planner)/year/print/print.module.css",
  import.meta.url,
);

// ══ /weekly/print ═════════════════════════════════════════════════════════

describe("/weekly/print — the configured school week, not a hard-coded Sun–Thu", () => {
  it("labels the columns from the school's configured week", async () => {
    // A Mon–Fri school. The unmodified template reads WEEK_DAYS_SHORT from
    // lib/mock and prints SUN…THU over Mon–Fri data: every column mislabelled,
    // and nothing on the page says so.
    store.schoolWeek = ["mon", "tue", "wed", "thu", "fri"];
    const html = await renderWeekly();
    expect(html).toContain("Mon");
    expect(html).toContain("Fri");
    expect(html).not.toContain("Sun");
  });

  it("prints every day of a six-day week", async () => {
    // The one that loses content outright: dayCount came from a five-element
    // literal, so the sixth column was never emitted and the lessons in it
    // vanished with no mark on the sheet.
    store.schoolWeek = ["sun", "mon", "tue", "wed", "thu", "fri"];
    store.lessons = [
      lesson({ id: "l-sun", day: 0, title: "Place value review" }),
      lesson({ id: "l-fri", day: 5, title: "Friday problem solving" }),
    ];
    const html = await renderWeekly();
    expect(html).toContain("Friday problem solving");
  });

  it("never drops a lesson that sits outside the configured week", async () => {
    // The school shrank its week (or a lesson predates the change), leaving a
    // lesson on a day index the grid has no column for. Dropping it silently is
    // the same data-loss bug one level down, so it gets an explicit column.
    store.schoolWeek = ["sun", "mon", "tue", "wed", "thu"];
    store.lessons = [
      lesson({ id: "l-orphan", day: 5, title: "Saturday enrichment" }),
    ];
    const html = await renderWeekly();
    expect(html).toContain("Saturday enrichment");
    expect(html).toContain("Unscheduled");
  });
});

describe("/weekly/print — archived lessons are not the plan", () => {
  it("omits soft-deleted lessons", async () => {
    // Every live surface guards on this (WeeklyShell.tsx:701, WeekColumns.tsx:229,
    // WeekA/WeekC) and so does /year/print. Only /weekly/print printed the
    // teacher's deleted lessons back at them as though they were scheduled.
    store.lessons = [
      lesson({ id: "l-live", day: 0, title: "Live lesson" }),
      lesson({
        id: "l-gone",
        day: 1,
        title: "Deleted lesson",
        archived: true,
      }),
    ];
    const html = await renderWeekly();
    expect(html).toContain("Live lesson");
    expect(html).not.toContain("Deleted lesson");
  });

  it("treats a week whose only lessons are archived as empty, honestly", async () => {
    store.lessons = [
      lesson({ id: "l-gone", day: 1, title: "Deleted lesson", archived: true }),
    ];
    const html = await renderWeekly();
    expect(html).not.toContain("Deleted lesson");
    expect(html).toContain("No lessons");
  });
});

describe("/weekly/print — prints the week it was asked for", () => {
  it("honours ?week=", async () => {
    // Without this the route printed CURRENT_WEEK on every cold load, so a
    // teacher who navigated to week 7 and hit print got week 12 on paper.
    store.week = 12;
    store.lessons = [
      lesson({ id: "l-7", week: 7, day: 0, title: "Week seven lesson" }),
      lesson({ id: "l-12", week: 12, day: 0, title: "Week twelve lesson" }),
    ];
    const html = await renderWeekly({ week: "7" });
    expect(html).toContain("Week seven lesson");
    expect(html).not.toContain("Week twelve lesson");
    expect(html).toContain("Week 7");
  });

  it("falls back to the planner's week when ?week= is absent or junk", async () => {
    store.week = 12;
    store.lessons = [
      lesson({ id: "l-12", week: 12, day: 0, title: "Week twelve lesson" }),
    ];
    expect(await renderWeekly()).toContain("Week twelve lesson");
    expect(await renderWeekly({ week: "not-a-number" })).toContain(
      "Week twelve lesson",
    );
    expect(await renderWeekly({ week: "-3" })).toContain("Week twelve lesson");
  });

  it("refuses a HALF-numeric ?week= rather than silently truncating it", async () => {
    // `Number.parseInt` stops at the first non-digit, so the obvious
    // implementation reads "7oops" as 7, "7.9" as 7 and "1e2" as 1 — a
    // corrupted link then prints a week nobody asked for, under a header
    // confidently naming it. Only a whole-string match is safe.
    store.week = 12;
    store.lessons = [
      lesson({ id: "l-7", week: 7, day: 0, title: "Week seven lesson" }),
      lesson({ id: "l-1", week: 1, day: 0, title: "Week one lesson" }),
      lesson({ id: "l-12", week: 12, day: 0, title: "Week twelve lesson" }),
    ];
    for (const junk of ["7oops", "7.9", "1e2", " 7", "07x", "0", "+7"]) {
      const html = await renderWeekly({ week: junk });
      expect(html, `?week=${junk}`).toContain("Week twelve lesson");
      expect(html, `?week=${junk}`).not.toContain("Week seven lesson");
      expect(html, `?week=${junk}`).not.toContain("Week one lesson");
    }
  });

  it("narrows to ?subject= when asked, and says so on the sheet", async () => {
    store.lessons = [
      lesson({ id: "l-m", subject: "math", day: 0, title: "Math lesson" }),
      lesson({ id: "l-r", subject: "reading", day: 0, title: "Reading lesson" }),
    ];
    const html = await renderWeekly({ subject: "math" });
    expect(html).toContain("Math lesson");
    expect(html).not.toContain("Reading lesson");
    // A filtered sheet that does not announce the filter is a sheet a teacher
    // will read as "this is the whole week".
    expect(html).toContain("filtered");
  });
});

describe("/weekly/print — prints what the teacher is looking at", () => {
  // /weekly/print sits under the SAME app/(planner)/layout.tsx as /weekly, so a
  // client-side navigation from the new toolbar link preserves
  // <AppStateProvider>. The teacher's filters and search are still in the store
  // — the page just never read them, which is how "I filtered to Math, hit
  // Print, got the whole unfiltered week" happened.
  beforeEach(() => {
    store.lessons = [
      lesson({ id: "l-m", subject: "math", day: 0, title: "Math lesson" }),
      lesson({ id: "l-r", subject: "reading", day: 1, title: "Reading lesson" }),
    ];
  });

  it("honours the left panel's subject filter", async () => {
    store.filters.subjects = ["math"];
    const html = await renderWeekly();
    expect(html).toContain("Math lesson");
    expect(html).not.toContain("Reading lesson");
  });

  it("names every active narrowing on the sheet", async () => {
    // A narrowed sheet that stays silent is the more dangerous lie: a teacher
    // reads a printout as the whole week by default. And a bare "filtered"
    // would not tell them WHAT is missing.
    store.filters.subjects = ["math"];
    store.filters.statuses = ["done"];
    store.search = "fractions";
    const html = await renderWeekly({});
    expect(html).toContain("filtered to");
    expect(html).toContain("Math");
    expect(html).toContain("Done");
    expect(html).toContain("fractions");
  });

  it("honours a status filter", async () => {
    store.lessons = [
      lesson({ id: "a", day: 0, title: "Finished lesson", status: "done" }),
      lesson({ id: "b", day: 1, title: "Pending lesson", status: "not_done" }),
    ];
    store.filters.statuses = ["done"];
    const html = await renderWeekly();
    expect(html).toContain("Finished lesson");
    expect(html).not.toContain("Pending lesson");
  });

  it("honours the top-bar search, over rich-text fields", async () => {
    store.lessons = [
      lesson({ id: "a", day: 0, title: "<b>Fractions</b> on a line" }),
      lesson({ id: "b", day: 1, title: "Place value" }),
    ];
    store.search = "  FRACTIONS ";
    const html = await renderWeekly();
    // Markup-stripped before matching: a raw includes over "<b>Fractions</b>"
    // is a coin flip on where the tags land.
    expect(html).toContain("Fractions");
    expect(html).not.toContain("Place value");
  });

  it("lets ?subject= WIN over the store's subject filter", async () => {
    // Precedence: the URL is an explicit instruction (a bookmark, a pasted
    // link); the store is the ambient state. A cold load has no store to read,
    // so the param has to be able to override.
    store.filters.subjects = ["reading"];
    const html = await renderWeekly({ subject: "math" });
    expect(html).toContain("Math lesson");
    expect(html).not.toContain("Reading lesson");
  });

  it("prints the whole week when nothing is filtered", async () => {
    const html = await renderWeekly();
    expect(html).toContain("Math lesson");
    expect(html).toContain("Reading lesson");
    expect(html).not.toContain("filtered to");
  });
});

describe("/weekly/print — the real catalog, not lib/mock", () => {
  it("prints a subject the mock fixtures have never heard of", async () => {
    setCatalog([MATH, ROBOTICS], [U_MATH, U_CUSTOM]);
    store.lessons = [
      lesson({
        id: "l-rob",
        subject: SUBJ("robotics"),
        unit: "u-custom-9",
        day: 0,
        title: "Line following intro",
      }),
    ];
    const html = await renderWeekly();
    expect(html).toContain("Robotics");
    expect(html).toContain("Line following intro");
  });

  it("still prints a lesson whose subject is missing from the catalog", async () => {
    // Belt under the braces: an orphaned subject id must not be a silent drop
    // either. It prints under its raw id rather than disappearing.
    setCatalog([MATH], [U_MATH]);
    store.lessons = [
      lesson({
        id: "l-orphan-subj",
        subject: SUBJ("geology"),
        day: 0,
        title: "Rock cycle",
      }),
    ];
    expect(await renderWeekly()).toContain("Rock cycle");
  });
});

describe("/weekly/print — what a teacher actually needs on paper", () => {
  beforeEach(() => {
    store.lessons = [
      lesson({
        id: "l-rich",
        day: 0,
        title: "Comparing fractions",
        objective: "I can compare two fractions with unlike denominators.",
        notes: "Pull the small group before we start.",
        status: "carried",
        reasonNotDone: "Fire drill ate the block.",
        moved: "across-weeks",
        modified: true,
        isPersonal: true,
      }),
    ];
  });

  it("carries the objective — the sentence the lesson is actually about", async () => {
    expect(await renderWeekly()).toContain(
      "I can compare two fractions with unlike denominators.",
    );
  });

  it("carries the teacher's own note", async () => {
    expect(await renderWeekly()).toContain(
      "Pull the small group before we start.",
    );
  });

  it("names the statuses the old sheet dropped", async () => {
    // The old sheet rendered a bare 4px dot for `done` and `partial` and
    // nothing at all for carried / skipped — so a carried-over lesson printed
    // indistinguishably from one that went perfectly.
    expect(await renderWeekly()).toContain("Carried over");
    store.lessons = [
      lesson({ id: "l-skip", day: 0, title: "Skipped one", status: "skipped" }),
    ];
    expect(await renderWeekly()).toContain("Skipped");
  });

  it("leaves an untaught lesson unmarked rather than stamping it 'Not done'", async () => {
    // Most lessons on a forward-looking weekly sheet have not happened yet.
    // Marking every one of them is noise that buries the four states that
    // actually change what a teacher does.
    store.lessons = [
      lesson({ id: "l-future", day: 0, title: "Next week's work" }),
    ];
    expect(await renderWeekly()).not.toContain("Not done");
  });

  it("explains WHY a lesson did not happen", async () => {
    expect(await renderWeekly()).toContain("Fire drill ate the block.");
  });

  it("marks a moved lesson, so the fork model survives the printer", async () => {
    expect(await renderWeekly()).toContain("Moved from another week");
  });

  it("prints a legend, because paper has no tooltips", async () => {
    const html = await renderWeekly();
    expect(html).toContain("Done");
    expect(html).toContain("your personal");
  });

  it("renders a rich-text title as text on the SERVER too", async () => {
    // The old stripHtml built a <div> and read textContent — a no-op when
    // `document` is undefined, i.e. in every server render. So an RTE-authored
    // title printed with its tags showing.
    store.lessons = [
      lesson({ id: "l-html", day: 0, title: "<b>Comparing</b> fractions" }),
    ];
    const html = await renderWeekly();
    expect(html).toContain("Comparing");
    expect(html).not.toContain("&lt;b&gt;");
  });
});

describe("/weekly/print — never a confident sheet over an unloaded plan", () => {
  it("shows a loading affordance while the hydrate is in flight", async () => {
    store.state = "pending";
    const html = await renderWeekly();
    expect(html).not.toContain("No lessons");
    expect(html).toContain(LOADING);
  });

  it("reports a failed hydrate rather than an empty week", async () => {
    store.state = "error";
    const html = await renderWeekly();
    expect(html).not.toContain("No lessons");
    expect(html).toContain(ERROR_COPY);
  });
});

// ══ /year/print ═══════════════════════════════════════════════════════════

describe("/year/print — never a confident year over an unloaded plan", () => {
  it("does not emit a full all-empty matrix while the hydrate is in flight", async () => {
    // This template had no data-state guard AT ALL. Printing during the 11–16s
    // Supabase hydrate produced a complete, correct-looking, entirely blank
    // year plan — the most expensive false document in the app.
    store.state = "pending";
    const html = await renderYear();
    expect(html).toContain(LOADING);
    expect(html).not.toContain("Wk 1</th>");
  });

  it("reports a failed hydrate rather than an empty year", async () => {
    store.state = "error";
    const html = await renderYear();
    expect(html).toContain(ERROR_COPY);
    expect(html).not.toContain("Wk 1</th>");
  });

  it("still renders the matrix once settled", async () => {
    // The anti-overshoot check: a permanent skeleton passes every "the lie is
    // gone" assertion while making the route useless.
    store.state = "settled";
    store.lessons = [lesson({ id: "l-1", week: 1, day: 0 })];
    const html = await renderYear();
    expect(html).toContain("Wk 1");
    expect(html).not.toContain(LOADING);
  });
});

describe("/year/print — the real catalog, not lib/mock", () => {
  it("gives a non-mock subject a row", async () => {
    setCatalog([MATH, ROBOTICS], [U_MATH, U_CUSTOM]);
    store.lessons = [
      lesson({
        id: "l-rob",
        subject: SUBJ("robotics"),
        unit: "u-custom-9",
        week: 1,
        day: 0,
      }),
    ];
    expect(await renderYear()).toContain("Robotics");
  });

  it("resolves a custom unit's NAME instead of printing its raw id", async () => {
    setCatalog([MATH, ROBOTICS], [U_MATH, U_CUSTOM]);
    store.lessons = [
      lesson({
        id: "l-rob",
        subject: SUBJ("robotics"),
        unit: "u-custom-9",
        week: 1,
        day: 0,
      }),
    ];
    const html = await renderYear();
    expect(html).toContain("Line Following");
    expect(html).not.toContain("u-custom-9");
  });

  it("still prints a lesson whose subject is missing from the catalog", async () => {
    setCatalog([MATH], [U_MATH]);
    store.lessons = [
      lesson({
        id: "l-orphan-subj",
        subject: SUBJ("geology"),
        unit: "u-math-1",
        week: 1,
        day: 0,
      }),
    ];
    expect(await renderYear()).toContain("geology");
  });
});

describe("/year/print — coverage, the question the Year view exists to answer", () => {
  it("reports how many of a unit's lessons are already done", async () => {
    setCatalog([MATH], [U_MATH]);
    store.lessons = [
      lesson({ id: "a", week: 1, day: 0, status: "done" }),
      lesson({ id: "b", week: 1, day: 1, status: "done" }),
      lesson({ id: "c", week: 1, day: 2, status: "not_done" }),
    ];
    const html = await renderYear();
    expect(html).toContain("3 lessons");
    expect(html).toContain("2 done");
  });

  it("keeps excluding archived lessons from the counts", async () => {
    setCatalog([MATH], [U_MATH]);
    store.lessons = [
      lesson({ id: "a", week: 1, day: 0, status: "done" }),
      lesson({ id: "b", week: 1, day: 1, status: "done", archived: true }),
    ];
    expect(await renderYear()).toContain("1 lesson");
  });
});

// ══ The second readiness axis: the configured calendar ════════════════════

describe("both templates — paper is withheld until the calendar has settled", () => {
  // `useSchoolWeek` and `useAcademicYear` are both SSR-safe the same way: the
  // server render and the FIRST client render use a default, and the school's
  // real configuration arrives in a post-mount effect. Correct for hydration,
  // dangerous for paper — inside that window a Mon–Fri school's sheet is
  // labelled Sun–Thu and a six-day school's Friday lessons are filed under
  // "Unscheduled", both confidently and both permanently once printed.
  //
  // A pre-effect render is exactly what `renderToStaticMarkup` produces, so it
  // is the right instrument for this: the markup below IS the unready window.
  it.each([
    ["weekly", () => renderWeekly()],
    ["year", () => renderYear()],
  ])(
    "%s marks itself not-ready before any effect has run",
    async (_name, render) => {
      store.lessons = [lesson({ id: "l-1", week: 12, day: 0 })];
      const html = await render();
      expect(html).toContain('data-print-ready="false"');
      // The disabled button is the visible half…
      expect(html).toContain("disabled");
      // …and this is the half that survives Ctrl+P, which ignores the button
      // entirely. Without it the guard is decoration.
      expect(html).toContain("print again");
    },
  );

  it.each([
    ["weekly", () => renderWeekly()],
    ["year", () => renderYear()],
  ])(
    "%s does not tell a FAILED load to wait and try again",
    async (_name, render) => {
      // A failed hydrate leaves the same not-ready state as a slow one, but
      // "wait for the grid and print again" is an instruction that can never
      // resolve — and it hides the fact that anything went wrong at all.
      store.state = "error";
      const html = await render();
      expect(html).toContain("could not be loaded");
      expect(html).not.toContain("still loading");
      // And the paper must not be mistaken for a record of an empty week/year.
      expect(html).toContain("is incomplete");
    },
  );

  it.each([
    ["weekly", () => renderWeekly()],
    ["year", () => renderYear()],
  ])("%s still says 'loading' when it IS loading", async (_name, render) => {
    store.state = "pending";
    const html = await render();
    expect(html).toContain("still loading");
    expect(html).not.toContain("could not be loaded");
  });

  it("weekly prints the school week it actually used", async () => {
    // The mitigation for the one window `mounted` cannot close (the deployed
    // path's async week read). A wrong sheet that states its assumption is a
    // recoverable error; a wrong sheet that states nothing is not.
    store.schoolWeek = ["mon", "tue", "wed", "thu", "fri"];
    const html = await renderWeekly();
    expect(html).toContain("School week: Mon, Tue, Wed, Thu, Fri");
  });

  it("year prints the academic range its week numbering came from", async () => {
    const html = await renderYear();
    expect(html).toContain("Academic year:");
    expect(html).toContain("2026");
    expect(html).toContain("2027");
  });

  it.each([
    ["weekly", WEEKLY_CSS],
    ["year", YEAR_CSS],
  ])("%s hides the sheet on paper while not ready", (_name, url) => {
    const css = readFileSync(url, "utf8");
    // The behaviour lives entirely in CSS, so this is where it has to be
    // asserted: the notice appears and the sheet disappears, print-only.
    expect(css).toMatch(
      /@media print\s*\{[\s\S]*\.page\[data-print-ready="false"\]\s+\.sheet\s*\{\s*display:\s*none/,
    );
    expect(css).toMatch(
      /\.page\[data-print-ready="false"\]\s+\.notReady\s*\{\s*display:\s*block/,
    );
  });
});

// ══ Page-break integrity ══════════════════════════════════════════════════

describe("both templates — a table sliced across pages keeps its header", () => {
  // Not renderable assertions: `display: table-header-group` is what makes a
  // browser repeat <thead> on every continuation page, and without it page 2 of
  // a long sheet is a wall of unlabelled columns. Asserted against the
  // stylesheet source because the behaviour lives entirely in CSS.
  it.each([
    ["weekly", WEEKLY_CSS],
    ["year", YEAR_CSS],
  ])("%s print repeats <thead> on continuation pages", (_name, url) => {
    const css = readFileSync(url, "utf8");
    expect(css).toContain("table-header-group");
  });
});
