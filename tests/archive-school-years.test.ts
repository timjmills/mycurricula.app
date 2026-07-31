import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Regression tests for the /archive FABRICATED-RECORDS defect.
//
// THE DEFECT. lib/archive/school-years.ts shipped a module-level `FIXTURE` and
// `useSchoolYears()` returned it unconditionally — there was no data source in
// the file at all. Every teacher, at every school, in their very first year, was
// shown a sealed volume reading "2025–2026 · 8 units · 15 lessons · 40 weeks"
// and a current-year card reading "2026–2027 · 35 units · 185 lessons", next to
// a live CTA into their real /weekly.
//
// This is a worse class than the false-empty bugs fixed elsewhere in this
// session. A false-empty says "you have nothing" when you have something. This
// said "HERE IS YOUR RECORD" and printed invented numbers — a teacher could
// reasonably conclude last year's plan had been archived and was retrievable,
// when nothing was ever archived and no code path can archive anything.
//
// Two independently checkable falsehoods, from a read of the production DB on
// 2026-07-31:
//   • The beta school's live year actually holds 49 units / 1239 lessons. The
//     card said 35 / 185 — wrong even for the one school the numbers were
//     copied from, and wrong for every other school by construction.
//   • `school_years` has NO archive column; "archived" is expressible only as
//     `!is_active`, and prod contains a school whose ONLY year row is
//     `is_active = false` with zero content. Under a naive `!is_active` read
//     that teacher would be shown NO current year and one sealed volume of a
//     year they never taught. So the archive shelf cannot be sourced honestly
//     at all yet — the correct behavior is to assert nothing.
//
// THE CONTRACT PINNED HERE. The surface may print a number only when it can
// source it; it may claim an archived year only when something real produced
// one. Counts come from the planner store (the teacher's actual lessons/units),
// gated on `usePlannerDataState()` so a 11–16s Supabase hydrate is never
// rendered as a count of zero; the year label/span/weeks come from
// `useAcademicYear()`, the single academic-year value the rest of the app
// (/year roadmap, current-week resolver) already runs on.
//
// WHY THESE RENDER THE COMPONENT. Same reasoning as tests/hub-browse-empty.ts:
// vitest runs `environment: "node"`, but `react-dom/server` renders to a STRING
// with no jsdom and no new dependency — so these assert against the shipped
// component's real output, not a paraphrase of it.

import * as archive from "@/lib/archive/school-years";

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as { archived?: boolean }[],
  units: [] as { archived?: boolean }[],
  subjects: [] as { id: string; name: string; cls: string }[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    units: store.units,
    subjects: store.subjects,
  }),
  usePlannerDataState: () => store.state,
}));

// The academic year is pinned so the assertions below are stable numbers rather
// than functions of today's date (the real hook's default is derived from
// `new Date()`). The real hook is exercised by /year and its own callers; what
// matters here is that /archive READS it instead of inventing a year.
const YEAR_START = new Date(2026, 7, 30); // 2026-08-30
const YEAR_END = new Date(2027, 5, 24); // 2027-06-24

vi.mock("@/lib/use-academic-year", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-academic-year")>()),
  useAcademicYear: () => ({
    start: YEAR_START,
    end: YEAR_END,
    setStart: () => {},
    setEnd: () => {},
  }),
}));

const MATH = { id: "math", name: "Math", cls: "math" };
const READING = { id: "reading", name: "Reading", cls: "reading" };

/** The <Skeleton> loading affordance — also the marker that a fix has not
 *  overshot into stranding a settled surface on a permanent skeleton. */
const LOADING = 'role="status" aria-busy="true"';

/** Strings the fixture used to assert. None may appear for a teacher whose
 *  store holds no such thing. The en dash is deliberate: an ASCII-hyphen
 *  matcher would silently never fire, which is exactly how a vacuous "not
 *  reproduced" gets reported. */
const FIXTURE_YEAR = "2025–2026";
/** The sealed volume's "Archived" eyebrow as a TEXT NODE. Matched that way on
 *  purpose: a bare "Archived" substring also hits the section's
 *  `aria-label="Archived years"`, which is chrome and must survive. */
const FIXTURE_ARCHIVED_EYEBROW = />Archived</;

async function render(): Promise<string> {
  const { ArchiveScreen } = await import("@/components/archive/ArchiveScreen");
  return renderToStaticMarkup(createElement(ArchiveScreen));
}

/** Read a rendered <Stat> by its label, e.g. statOf(html, "units") → "49".
 *  Returns null when the stat is absent — which is itself a pass condition for
 *  the states where no number may be printed. */
function statOf(html: string, label: string): string | null {
  const m = new RegExp(
    `<span[^>]*>(\\d+)</span><span[^>]*>${label}</span>`,
  ).exec(html);
  return m ? m[1] : null;
}

// Pay the component graph's cold transform ONCE, outside any test's measured
// window. `render()` imports ArchiveScreen dynamically (the doMock cases below
// need it re-importable), and that first import pulls a large React module graph
// through vitest's transform — on this repo it alone exceeds the default 5000ms
// testTimeout, so the FIRST test in the file timed out while every later test
// passed on the warm cache. That is a harness artifact, not a product signal:
// left unwarmed it fails a different test depending on ordering and on how much
// transform contention the rest of the suite is creating, which is exactly the
// kind of noise that gets a real finding dismissed as flake. The per-test 5000ms
// budget is deliberately left alone so it still guards render cost itself.
beforeAll(async () => {
  await import("@/components/archive/ArchiveScreen");
}, 120_000);

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.units = [];
  store.subjects = [MATH, READING];
});

describe("/archive never asserts an archived year it cannot source", () => {
  it("shows no sealed volume for a school in its first year", async () => {
    const html = await render();
    expect(html).not.toContain(FIXTURE_YEAR);
    expect(html).not.toMatch(FIXTURE_ARCHIVED_EYEBROW);
  });

  it("reaches the empty state instead — previously unreachable code", async () => {
    // ArchiveScreen has always carried a correct empty branch; the fixture made
    // `archived.length` permanently 1, so it could never render.
    const html = await render();
    expect(html.toLowerCase()).toContain("sealed");
    expect(html).toMatch(/isn’t available|not available|nothing (is |has been )?sealed/i);
  });

  it("does not claim a count of archived years", async () => {
    // "0 years archived" is still an assertion about the teacher's data made by
    // a surface with no read seam. The honest surface makes no count claim.
    const html = await render();
    expect(html).not.toMatch(/\d+\s+years? archived/);
  });

  it("keeps the shelf heading in every state, so the page never looks broken", async () => {
    for (const state of ["pending", "error", "settled"] as const) {
      store.state = state;
      expect(await render()).toContain("Curriculum Archive");
    }
  });
});

describe("/archive prints the teacher's real counts or none at all", () => {
  it("counts the store's lessons and units, not the fixture's", async () => {
    store.lessons = [{}, {}, { archived: true }];
    store.units = [{}, { archived: true }];
    const html = await render();
    expect(statOf(html, "lessons")).toBe("2");
    expect(statOf(html, "units")).toBe("1");
    // The fixture's numbers, pinned so a revert is caught by name.
    expect(statOf(html, "lessons")).not.toBe("185");
    expect(statOf(html, "units")).not.toBe("35");
  });

  it("derives the week count from the academic year, not a hardcoded 40", async () => {
    // 2026-08-30 → 2027-06-24 is 298 days: ceil(298/7) + 1 = 44 inclusive week
    // columns, the same arithmetic /year's roadmap lays out (weeksInRange).
    expect(statOf(await render(), "weeks")).toBe("44");
  });

  it("prints no count while the hydrate is in flight", async () => {
    // Over Supabase the hydrate takes 11–16s and the document is legitimately
    // empty for that whole window. Printing "0 units" there is the false-empty
    // bug; printing "35 units" is the fabrication bug. Print neither.
    store.state = "pending";
    const html = await render();
    expect(statOf(html, "units")).toBeNull();
    expect(statOf(html, "lessons")).toBeNull();
    expect(html).toContain(LOADING);
  });

  it("prints no count when the hydrate FAILED, and says so", async () => {
    store.state = "error";
    const html = await render();
    expect(statOf(html, "units")).toBeNull();
    expect(statOf(html, "lessons")).toBeNull();
    expect(html).toMatch(/couldn’t load|could not load/i);
  });

  it("still prints real counts once settled — the anti-overshoot check", async () => {
    // The opposite failure, and the likelier mistake: a permanent skeleton
    // passes every "the lie is gone" assertion while stranding the surface.
    store.lessons = [{}, {}, {}];
    store.units = [{}];
    const html = await render();
    expect(statOf(html, "lessons")).toBe("3");
    expect(html).not.toContain(LOADING);
  });

  it("labels the year from the academic-year setting", async () => {
    expect(await render()).toContain("2026–2027");
  });

  it("takes its subject spine from the store, not a hardcoded eight", async () => {
    const html = await render();
    expect(html).toContain("Math");
    expect(html).toContain("Reading");
    expect(html).not.toContain("Spelling");
  });
});

describe("the shelf is empty, not deleted", () => {
  // The anti-overshoot check at the COMPONENT level: deleting the fixture must
  // not weld the sealed-volume shelf shut. When a rollover write path and a
  // read seam land, the design has to still be there to receive them. The hook
  // is stubbed here (and only here) because no source can produce an archived
  // year today — that is the defect's whole point.
  it("renders a sealed volume when a source supplies one", async () => {
    vi.resetModules();
    vi.doMock("@/lib/archive/school-years", () => ({
      useSchoolYears: () => ({
        state: "ready" as const,
        current: null,
        archiveSupported: true,
        archived: [
          {
            id: "y1",
            label: "2024–2025",
            startDate: "2024-08-25",
            endDate: "2025-06-19",
            isCurrent: false,
            weeks: 40,
            unitCount: 12,
            lessonCount: 96,
            subjects: [MATH],
          },
        ],
      }),
    }));
    const { ArchiveScreen } = await import(
      "@/components/archive/ArchiveScreen"
    );
    const html = renderToStaticMarkup(createElement(ArchiveScreen));
    vi.doUnmock("@/lib/archive/school-years");
    vi.resetModules();

    expect(html).toContain("2024–2025");
    expect(html).toMatch(/>Archived</);
    expect(html).toContain("96");
    expect(html).toContain("1 year archived");
    expect(html).not.toMatch(/Nothing is sealed here yet/);
  });

  it("omits a sealed year's counts rather than inventing them", async () => {
    // A source that can name a year but not count it (only `units` carries
    // `school_year_id`; lessons reach a year through their unit) must produce a
    // volume with no numbers — never a filled-in guess.
    vi.resetModules();
    vi.doMock("@/lib/archive/school-years", () => ({
      useSchoolYears: () => ({
        state: "ready" as const,
        current: null,
        archiveSupported: true,
        archived: [
          {
            id: "y1",
            label: "2024–2025",
            startDate: "2024-08-25",
            endDate: "2025-06-19",
            isCurrent: false,
            weeks: 40,
            unitCount: null,
            lessonCount: null,
            subjects: [MATH],
          },
        ],
      }),
    }));
    const { ArchiveScreen } = await import(
      "@/components/archive/ArchiveScreen"
    );
    const html = renderToStaticMarkup(createElement(ArchiveScreen));
    vi.doUnmock("@/lib/archive/school-years");
    vi.resetModules();

    expect(html).toContain("2024–2025");
    expect(html).not.toMatch(/<b>\d+<\/b>/);
    expect(statOf(html, "units")).toBeNull();
    expect(statOf(html, "lessons")).toBeNull();
    // The stats it CAN source are still shown.
    expect(statOf(html, "weeks")).toBe("40");
  });
});

describe("resolveSchoolYears — the pure decision", () => {
  const base = {
    start: YEAR_START,
    end: YEAR_END,
    lessons: [{}, {}] as { archived?: boolean }[],
    units: [{}] as { archived?: boolean }[],
    subjects: [MATH],
  };

  it("withholds every count until the data has settled", () => {
    for (const dataState of ["pending", "error"] as const) {
      const view = archive.resolveSchoolYears({ ...base, dataState });
      expect(view.state).toBe(dataState === "pending" ? "pending" : "error");
      expect(view.current?.unitCount).toBeNull();
      expect(view.current?.lessonCount).toBeNull();
    }
  });

  it("counts only live rows once settled", () => {
    const view = archive.resolveSchoolYears({
      ...base,
      dataState: "settled",
      lessons: [{}, { archived: true }],
      units: [{ archived: true }],
    });
    expect(view.state).toBe("ready");
    expect(view.current?.lessonCount).toBe(1);
    expect(view.current?.unitCount).toBe(0);
  });

  it("reports no archived years and no archive support by default", () => {
    const view = archive.resolveSchoolYears({ ...base, dataState: "settled" });
    expect(view.archived).toEqual([]);
    expect(view.archiveSupported).toBe(false);
  });

  it("keeps the span even while pending — it comes from settings, not the hydrate", () => {
    const view = archive.resolveSchoolYears({ ...base, dataState: "pending" });
    expect(view.current?.label).toBe("2026–2027");
    expect(view.current?.startDate).toBe("2026-08-30");
    expect(view.current?.endDate).toBe("2027-06-24");
    expect(view.current?.weeks).toBe(44);
  });

  it("drops archived years a caller has not declared a real source for", () => {
    // `archiveSupported` gates the shelf rather than just describing it. A
    // caller that assembles years from somewhere provisional — a cache, a
    // half-built seam, another fixture — and forgets the flag renders nothing,
    // instead of quietly re-shipping the defect this file was rewritten for.
    const view = archive.resolveSchoolYears({
      ...base,
      dataState: "settled",
      archived: [
        {
          id: "y1",
          label: "2025–2026",
          startDate: "2025-08-24",
          endDate: "2026-06-18",
          isCurrent: false,
          weeks: 40,
          unitCount: 8,
          lessonCount: 15,
          subjects: [MATH],
        },
      ],
    });
    expect(view.archived).toEqual([]);
    expect(view.archiveSupported).toBe(false);
  });

  it("labels a year that opens and closes in one calendar year without a span", () => {
    const view = archive.resolveSchoolYears({
      ...base,
      dataState: "settled",
      start: new Date(2027, 0, 4),
      end: new Date(2027, 10, 19),
    });
    expect(view.current?.label).toBe("2027");
  });

  it("passes real archived years through when a source eventually supplies them", () => {
    // The anti-overshoot check for the deletion: the shelf must not be welded
    // shut. When a rollover write path and a read seam exist, this is the wire
    // they land on.
    const sealed = {
      id: "y1",
      label: "2025–2026",
      startDate: "2025-08-24",
      endDate: "2026-06-18",
      isCurrent: false,
      weeks: 40,
      unitCount: 8,
      lessonCount: 15,
      subjects: [MATH],
    };
    const view = archive.resolveSchoolYears({
      ...base,
      dataState: "settled",
      archived: [sealed],
      archiveSupported: true,
    });
    expect(view.archived).toEqual([sealed]);
    expect(view.archiveSupported).toBe(true);
  });
});
