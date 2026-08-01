// planner-hydrate-bundle.test.ts — the contract of `buildPlannerHydrateBundle`,
// the single-invocation planner document load.
//
// THE BUG IT EXISTS FOR. The store's hydrate read six things through
// `plannerClient`, four of them inside a `Promise.all`. Under the Supabase flag
// every one of those is a Next Server Action, and Next runs client-initiated
// server actions ONE AT A TIME — so the `Promise.all` was parallel in the source
// and strictly serial on the wire (measured on production: six POSTs with −1 to
// −5 ms hand-off gaps, in array order, zero overlapping pairs). Replaying the
// same six requests concurrently rather than serially cut ~9.4 s to ~4.5 s.
//
// The first test below is the one that would have caught it, and it is the only
// one that can be checked WITHOUT a browser: the four catalog reads must all be
// IN FLIGHT before any of them settles. A serial implementation fails it on the
// first assertion.

import { describe, expect, it, vi } from "vitest";

import {
  buildPlannerHydrateBundle,
  type PlannerHydrateBundle,
} from "@/lib/planner/hydrate-bundle";
import { plannerMockSource } from "@/lib/planner/mock-source";
import type { PlannerDataSource } from "@/lib/planner/source";
import type { Lesson } from "@/lib/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER = "owner-uuid";
const GRADE = "grade-uuid";

function lesson(id: string): Lesson {
  return {
    id,
    subject: "math",
    unit: "u1",
    week: 1,
    day: 0,
    title: id,
  } as Lesson;
}

/** A deferred promise, so a test controls exactly when a read settles. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (and any `await` chain built from them) drain. */
async function settleMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

// ── The fix: the four catalog reads genuinely overlap ─────────────────────────

describe("buildPlannerHydrateBundle — concurrency", () => {
  it("has all four catalog reads IN FLIGHT before any of them settles", async () => {
    const started: string[] = [];
    const grade = deferred<string | null>();
    const lessons = deferred<Lesson[]>();
    const subjects = deferred<unknown[]>();
    const units = deferred<unknown[]>();
    const standards = deferred<Record<string, string>>();
    const sections = deferred<Record<string, unknown[]>>();

    const source = {
      getActiveGradeLevelId: () => {
        started.push("grade");
        return grade.promise;
      },
      listLessons: () => {
        started.push("lessons");
        return lessons.promise;
      },
      listSubjects: () => {
        started.push("subjects");
        return subjects.promise;
      },
      listUnits: () => {
        started.push("units");
        return units.promise;
      },
      listStandards: () => {
        started.push("standards");
        return standards.promise;
      },
      getSectionsBatch: () => {
        started.push("sections");
        return sections.promise;
      },
    } as unknown as PlannerDataSource;

    const bundle = buildPlannerHydrateBundle(source, OWNER);

    // The grade is a genuine dependency of the other four (they are all
    // grade-scoped), so it is legitimately serial — and it is the ONLY one.
    await settleMicrotasks();
    expect(started).toEqual(["grade"]);

    grade.resolve(GRADE);
    await settleMicrotasks();

    // THE ASSERTION THE OLD PATH FAILED. Nothing has resolved yet, and all four
    // catalog reads have nevertheless been issued. A serial implementation would
    // be sitting on ["grade", "lessons"] here.
    expect(started).toEqual([
      "grade",
      "lessons",
      "subjects",
      "units",
      "standards",
    ]);

    // Sections must NOT start until the lessons are known — it is keyed on their
    // ids, so it is a real dependency, not an avoidable serialisation.
    expect(started).not.toContain("sections");

    lessons.resolve([lesson("l1")]);
    subjects.resolve([]);
    units.resolve([]);
    standards.resolve({});
    await settleMicrotasks();
    expect(started).toContain("sections");

    sections.resolve({});
    const result = await bundle;
    expect(result.gradeLevelId).toBe(GRADE);
    expect(result.lessons).toHaveLength(1);
  });

  it("issues each read EXACTLY once — no N+1, no duplicate catalog read", async () => {
    const calls: Record<string, number> = {};
    const count = (k: string) => {
      calls[k] = (calls[k] ?? 0) + 1;
    };
    const source = {
      getActiveGradeLevelId: async () => (count("grade"), GRADE),
      listLessons: async () => (count("lessons"), [lesson("a"), lesson("b")]),
      listSubjects: async () => (count("subjects"), []),
      listUnits: async () => (count("units"), []),
      listStandards: async () => (count("standards"), {}),
      getSections: async () => (count("getSections"), []),
      getSectionsBatch: async () => (count("sections"), {}),
    } as unknown as PlannerDataSource;

    await buildPlannerHydrateBundle(source, OWNER);

    expect(calls).toEqual({
      grade: 1,
      lessons: 1,
      subjects: 1,
      units: 1,
      standards: 1,
      sections: 1,
    });
    // The per-lesson read must never be reached from a hydrate — that N+1 is
    // what `getSectionsBatch` replaced.
    expect(calls.getSections).toBeUndefined();
  });
});

// ── The branches, each one moved from the store rather than re-decided ────────

describe("buildPlannerHydrateBundle — branches", () => {
  function spySource(over: Partial<PlannerDataSource> = {}) {
    return {
      getActiveGradeLevelId: vi.fn(async () => GRADE),
      listLessons: vi.fn(async () => [lesson("l1")]),
      listSubjects: vi.fn(async () => []),
      listUnits: vi.fn(async () => []),
      listStandards: vi.fn(async () => ({})),
      getSectionsBatch: vi.fn(async () => ({})),
      ...over,
    } as unknown as PlannerDataSource &
      Record<string, ReturnType<typeof vi.fn>>;
  }

  it("returns the empty bundle for a falsy owner WITHOUT touching the backend", async () => {
    const src = spySource();

    const bundle = await buildPlannerHydrateBundle(src, "");

    expect(bundle.gradeLevelId).toBeNull();
    expect(src.getActiveGradeLevelId).not.toHaveBeenCalled();
    expect(src.listLessons).not.toHaveBeenCalled();
  });

  it("stops at the grade when the teacher has none — and reads nothing else", async () => {
    const src = spySource({
      getActiveGradeLevelId: vi.fn(async () => null),
    } as Partial<PlannerDataSource>);

    const bundle = await buildPlannerHydrateBundle(src, OWNER);

    expect(bundle.gradeLevelId).toBeNull();
    expect(bundle.lessons).toEqual([]);
    expect(bundle.sectionsFailed).toBe(false);
    expect(src.listLessons).not.toHaveBeenCalled();
    expect(src.listSubjects).not.toHaveBeenCalled();
  });

  // The cold-start deadlock guard: an empty DOCUMENT is not an empty CATALOG. A
  // freshly-provisioned workspace has subjects/units before it has a lesson, and
  // dropping them leaves no unit workspace and a silently no-op quick-add.
  it("returns the CATALOG for a grade with zero lessons, and skips the sections batch", async () => {
    const src = spySource({
      listLessons: vi.fn(async () => []),
      listSubjects: vi.fn(async () => [{ id: "math" }]),
    } as unknown as Partial<PlannerDataSource>);

    const bundle = await buildPlannerHydrateBundle(src, OWNER);

    expect(bundle.gradeLevelId).toBe(GRADE);
    expect(bundle.lessons).toEqual([]);
    expect(bundle.subjects).toEqual([{ id: "math" }]);
    expect(src.getSectionsBatch).not.toHaveBeenCalled();
    expect(bundle.sectionsFailed).toBe(false);
  });

  // The `resolveGrade` contract, preserved in its new home: a FAILED lookup must
  // propagate so the store paints "error". Swallowing it to null renders a false
  // "empty" plan — a total outage that reads as "all caught up".
  it("PROPAGATES a grade-lookup failure (never a false empty)", async () => {
    const src = spySource({
      getActiveGradeLevelId: vi.fn(async () => {
        throw new Error("backend down");
      }),
    } as unknown as Partial<PlannerDataSource>);

    await expect(buildPlannerHydrateBundle(src, OWNER)).rejects.toThrow(
      "backend down",
    );
  });

  it("PROPAGATES a primary catalog-read failure (a partial document is never presented as whole)", async () => {
    const src = spySource({
      listUnits: vi.fn(async () => {
        throw new Error("units read failed");
      }),
    } as unknown as Partial<PlannerDataSource>);

    await expect(buildPlannerHydrateBundle(src, OWNER)).rejects.toThrow(
      "units read failed",
    );
  });

  // The asymmetry that keeps a decoration from blanking the planner: sections
  // are SUPPLEMENTARY, so their failure is reported, never thrown.
  it("does NOT propagate a sections failure — the document survives, flagged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const src = spySource({
        getSectionsBatch: vi.fn(async () => {
          throw new Error("sections rpc exploded");
        }),
      } as unknown as Partial<PlannerDataSource>);

      const bundle = await buildPlannerHydrateBundle(src, OWNER);

      expect(bundle.lessons).toHaveLength(1);
      expect(bundle.sections).toEqual({});
      expect(bundle.sectionsFailed).toBe(true);
      // The real error is logged where it is still intact (server-side on the
      // Supabase path) — only the flag crosses the action boundary.
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  // The raw message must NOT ride back to the browser: Next redacts an uncaught
  // server-action error, and returning `err.message` as DATA would route a
  // Postgres message (table + column names) around that redaction.
  it("carries no error text across the boundary — only a boolean", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const src = spySource({
        getSectionsBatch: vi.fn(async () => {
          throw new Error('relation "lesson_sections" does not exist');
        }),
      } as unknown as Partial<PlannerDataSource>);

      const bundle = await buildPlannerHydrateBundle(src, OWNER);
      expect(JSON.stringify(bundle)).not.toContain("lesson_sections");
    } finally {
      err.mockRestore();
    }
  });
});

// ── The mock path must be unchanged — this is how we know ────────────────────
// Localhost runs the mock source (NEXT_PUBLIC_PLANNER_USE_SUPABASE is unset), so
// the bundle executes IN THE BROWSER against `plannerMockSource` with no server
// action at all. This pins that it produces exactly what the six individual mock
// calls produced, so the flag-OFF path is byte-identical to before the change.

describe("buildPlannerHydrateBundle — mock-source parity", () => {
  it("equals the six individual mock reads it replaces", async () => {
    const gradeLevelId = await plannerMockSource.getActiveGradeLevelId(OWNER);
    expect(gradeLevelId).toBeTruthy();
    const [lessons, subjects, units, standards] = await Promise.all([
      plannerMockSource.listLessons(gradeLevelId!, OWNER),
      plannerMockSource.listSubjects(gradeLevelId!),
      plannerMockSource.listUnits(gradeLevelId!),
      plannerMockSource.listStandards(gradeLevelId!),
    ]);
    const sections = await plannerMockSource.getSectionsBatch(
      lessons.map((l) => l.id),
      OWNER,
    );

    const bundle: PlannerHydrateBundle = await buildPlannerHydrateBundle(
      plannerMockSource,
      OWNER,
    );

    expect(bundle.gradeLevelId).toBe(gradeLevelId);
    expect(bundle.lessons).toEqual(lessons);
    expect(bundle.subjects).toEqual(subjects);
    expect(bundle.units).toEqual(units);
    expect(bundle.standards).toEqual(standards);
    expect(bundle.sections).toEqual(sections);
    expect(bundle.sectionsFailed).toBe(false);
    // Non-trivial: a parity check over empty fixtures would pass against a stub
    // that returns nothing.
    expect(bundle.lessons.length).toBeGreaterThan(0);
    expect(bundle.subjects.length).toBeGreaterThan(0);
  });
});
