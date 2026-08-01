// Regression guard for the 2026-08-01 silent-truncation data loss (task #48).
//
// WHAT BROKE. PostgREST caps every response at the project's `db-max-rows` —
// measured on this project as EXACTLY 1000, enforced globally (`.range(0,4999)`
// still returns 1000). The cap is applied SILENTLY: HTTP 200, a partial body,
// and a `content-range: 0-999/1069` header nothing read. `listLessons` issued
// one unwindowed, unpaginated read of `master_core_lesson_events` for the whole
// school year, so on the beta grade the deployed app received exactly 1000 of
// the 1069 matching lessons. Every lesson from week 34 to week 37 reached NO
// surface — Weekly, Daily, Year, Catch-Up, Print — with no error.
//
// WHY THIS TEST IS BEHAVIOURAL, NOT SOURCE-TEXT. The bug is invisible in a diff
// (the missing thing is a loop that was never written) and invisible to any
// fixture under 1000 rows. So the fake client below reproduces the ONE property
// that matters — it truncates any result longer than the ceiling, exactly as
// PostgREST does — and the fixture deliberately CROSSES that boundary: 1069
// master rows spanning weeks 1–37, with the 1000-row cut falling inside week 35.
// A fixture that sat under the ceiling would pass against the broken code.
//
// THE FAKE IS DELIBERATELY HOSTILE about ordering. Postgres does not promise to
// break ties in a non-unique ORDER BY the same way twice, so a paginated read
// that leans on tie stability can skip and duplicate rows in production while
// passing against a tidy in-memory fake. `SHUFFLE_TIES` therefore permutes rows
// that compare equal on the requested ordering, differently on every request.
// The tests below assert every id comes back EXACTLY once, so a read that
// paginated on a non-unique key fails here rather than in front of a teacher.
//
// SEEN RED: against the pre-fix `listLessons`, "reads every lesson past the
// 1000-row ceiling" failed with `expected 1000 to be 1069`, the week assertion
// with `expected 35 to be 37`, and the paging assertion with `expected 1 to be
// greater than 1`. The leaf tests passed in the same run — the positive control
// that the harness was not simply erroring out.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNotTruncated,
  pagedSelect,
  PlannerReadTruncatedError,
  POSTGREST_MAX_ROWS,
  type PageRequest,
  type PageResult,
} from "@/lib/planner/paged-read";

// ── A fake PostgREST that enforces the row ceiling ───────────────────────────
// Deliberately minimal: only the builder surface `listLessons` actually uses.
// The behaviours it models faithfully are the silent cap and unstable tie
// ordering.

type Row = Record<string, unknown>;

/** Rows the fake serves, per table. Reassigned per test. */
let store: Record<string, Row[]> = {};
/** Every page the fake served, for the "did it actually paginate" assertions. */
let pageLog: { table: string; after: unknown; returned: number }[] = [];
/** Bumped per request so equal-comparing rows permute between pages. */
let requestSeq = 0;

class FakeQuery implements PromiseLike<PageResult<Row>> {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private wantCount = false;
  private cursor: unknown = null;

  constructor(private readonly table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }
  /** The year-scope `or(...)`. This fixture resolves no active school year, so
   *  the branch that builds it never runs; kept so the surface is total. */
  or(expr: string) {
    void expr;
    return this;
  }
  gt(col: string, v: string) {
    this.cursor = v;
    this.filters.push((r) => String(r[col]) > v);
    return this;
  }
  gte(col: string, v: number) {
    this.filters.push((r) => (r[col] as number) >= v);
    return this;
  }
  lte(col: string, v: number) {
    this.filters.push((r) => (r[col] as number) <= v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  range(from: number, to: number) {
    // Offset paging is NOT what the fixed code does; if it reappears the tests
    // should say so rather than quietly accommodate it.
    throw new Error(
      `range(${from}, ${to}) on ${this.table}: offset paging is unsafe here —` +
        ` see lib/planner/paged-read.ts. Page by cursor.`,
    );
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private run(): PageResult<Row> {
    const seq = requestSeq++;
    let rows = (store[this.table] ?? []).filter((r) =>
      this.filters.every((f) => f(r)),
    );
    // SHUFFLE_TIES: rotate first, then stable-sort. Rows that compare EQUAL on
    // the requested ordering therefore come back in a different order on every
    // request — which is all Postgres promises — while rows the ordering does
    // separate stay correctly ordered.
    if (rows.length > 1) {
      const k = seq % rows.length;
      rows = [...rows.slice(k), ...rows.slice(0, k)];
    }
    if (this.orderBy.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const o of this.orderBy) {
          const av = a[o.col] as number | string;
          const bv = b[o.col] as number | string;
          if (av !== bv) return (av > bv ? 1 : -1) * (o.asc ? 1 : -1);
        }
        return 0;
      });
    }
    const count = rows.length; // what `content-range`'s total would report
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    // THE BUG, reproduced: PostgREST caps the page and says nothing.
    if (rows.length > POSTGREST_MAX_ROWS) {
      rows = rows.slice(0, POSTGREST_MAX_ROWS);
    }
    pageLog.push({
      table: this.table,
      after: this.cursor,
      returned: rows.length,
    });
    return { data: rows, error: null, count: this.wantCount ? count : null };
  }

  maybeSingle() {
    const res = this.run();
    return Promise.resolve({ data: res.data?.[0] ?? null, error: null });
  }
  then<R1, R2 = never>(
    onOk?: ((v: PageResult<Row>) => R1 | PromiseLike<R1>) | null,
    onErr?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onOk, onErr);
  }
}

const fakeClient = {
  from: (table: string) => new FakeQuery(table),
  rpc: () => Promise.resolve({ data: null, error: null }),
};

vi.mock("@/lib/supabase/helpers", () => ({
  sb: () => Promise.resolve(fakeClient),
  makeUnwrap:
    (scope: string) =>
    (res: { data: unknown; error: { message: string } | null }, ctx: string) => {
      if (res.error)
        throw new Error(`${scope} ${ctx} failed: ${res.error.message}`);
      if (res.data == null) throw new Error(`${scope} ${ctx} returned no data.`);
      return res.data;
    },
  makeUnwrapMaybe:
    (scope: string) =>
    (res: { data: unknown; error: { message: string } | null }, ctx: string) => {
      if (res.error)
        throw new Error(`${scope} ${ctx} failed: ${res.error.message}`);
      return res.data;
    },
  withSharedServerClient: <T,>(fn: () => Promise<T>) => fn(),
}));

const GRADE = "grade-under-test";
const OWNER = "teacher-under-test";

/** 1069 master rows over weeks 1–37 — the production shape, and the point is
 *  that it CROSSES the ceiling: 29 rows/week through week 36 puts row 1000
 *  inside week 35, so weeks 35–37 exist only past the cut.
 *
 *  `display_order_within_day` repeats heavily by design (0..28 per week), so
 *  the domain ordering is FAR from unique — which is what makes the tie-shuffle
 *  above bite. */
function seedMasters(): Row[] {
  const rows: Row[] = [];
  let n = 0;
  for (let week = 1; week <= 37; week++) {
    const perWeek = week === 37 ? 25 : 29;
    for (let i = 0; i < perWeek; i++) {
      rows.push({
        id: `m-${String(n).padStart(5, "0")}`,
        grade_level_id: GRADE,
        unit_id: "u-1",
        subject_id: "s-1",
        week_number: week,
        day_of_week: "sun",
        title: `Lesson ${n}`,
        directions: "",
        learning_objectives: "",
        notes: "",
        resources: [],
        standards: [],
        display_order_within_day: i,
        differentiation: null,
        deleted_at: null,
        taught_at: null,
        duration_minutes: null,
        assessment_kind: null,
        assessment_title: null,
        assessment_purpose: null,
        assessment_notes: null,
        builds: null,
        prep: null,
        fw_data: null,
        fw_id: null,
        carried: null,
      });
      n++;
    }
  }
  return rows;
}

beforeEach(() => {
  pageLog = [];
  requestSeq = 0;
  store = {
    master_core_lesson_events: seedMasters(),
    // Everything else empty: no school resolves, so no school-year scoping and
    // no standards index — the master read is isolated as the subject.
    subjects: [],
    units: [],
    grade_framework_assignments: [],
    standards: [],
    teachers: [],
    schools: [],
    grade_levels: [],
    school_years: [],
    personal_authored_lessons: [],
    personal_core_lesson_event_copies: [],
    completion_status: [],
  };
});

describe("listLessons vs the PostgREST row ceiling", () => {
  it("the fixture actually crosses the ceiling (guard on the guard)", () => {
    expect(store.master_core_lesson_events.length).toBe(1069);
    expect(store.master_core_lesson_events.length).toBeGreaterThan(
      POSTGREST_MAX_ROWS,
    );
  });

  it("CONTROL: the pre-fix query shape loses weeks 36–37 against this fake", async () => {
    // The positive control for everything below. It runs the read exactly as it
    // was written before the fix — one request, no cursor — so it shows the
    // fake genuinely reproduces the bug rather than the assertions passing for
    // some unrelated reason. Matches what production did on 2026-08-01: 1000
    // rows back, and the tail of the school year simply gone.
    const res = await fakeClient
      .from("master_core_lesson_events")
      .select("*")
      .eq("grade_level_id", GRADE)
      .is("deleted_at", null)
      .order("week_number", { ascending: true })
      .order("display_order_within_day", { ascending: true });
    expect(res.data?.length).toBe(POSTGREST_MAX_ROWS);
    const weeks = new Set(res.data?.map((r) => r.week_number as number));
    expect(Math.max(...weeks)).toBe(35);
    expect(weeks.has(36)).toBe(false);
    expect(weeks.has(37)).toBe(false);
  });

  it("reads every lesson past the 1000-row ceiling, each exactly once", async () => {
    const { plannerSupabaseSource } = await import(
      "@/lib/planner/supabase-source"
    );
    const lessons = await plannerSupabaseSource.listLessons(GRADE, OWNER);
    expect(lessons.length).toBe(1069);
    // No duplicates — the other half of "paginated correctly". Under the
    // tie-shuffling fake, an offset-paged read fails this.
    expect(new Set(lessons.map((l) => l.id)).size).toBe(1069);
  });

  it("keeps the weeks that live past the cut (34–37)", async () => {
    const { plannerSupabaseSource } = await import(
      "@/lib/planner/supabase-source"
    );
    const lessons = await plannerSupabaseSource.listLessons(GRADE, OWNER);
    const weeks = new Set(lessons.map((l) => l.week));
    expect(Math.max(...weeks)).toBe(37);
    for (const w of [34, 35, 36, 37]) expect(weeks.has(w)).toBe(true);
    expect(lessons.filter((l) => l.week === 37).length).toBe(25);
  });

  it("still returns lessons in week / position order", async () => {
    // Cursor paging orders by `id` on the wire, so the domain order has to be
    // restored in memory. If that regressed, every week view would scramble.
    const { plannerSupabaseSource } = await import(
      "@/lib/planner/supabase-source"
    );
    const lessons = await plannerSupabaseSource.listLessons(GRADE, OWNER);
    for (let i = 1; i < lessons.length; i++) {
      const prev = lessons[i - 1];
      const cur = lessons[i];
      expect(prev.week <= cur.week).toBe(true);
    }
  });

  it("gets there by cursor paging, not one oversized request", async () => {
    const { plannerSupabaseSource } = await import(
      "@/lib/planner/supabase-source"
    );
    await plannerSupabaseSource.listLessons(GRADE, OWNER);
    const masterPages = pageLog.filter(
      (p) => p.table === "master_core_lesson_events",
    );
    expect(masterPages.length).toBeGreaterThan(1);
    expect(masterPages[0].after).toBe(null); // first page: no lower bound
    expect(masterPages[1].after).toBeTruthy(); // second page: bounded by a cursor
  });

  it("a grade UNDER the ceiling still reads in a single page", async () => {
    // Positive control for the paging assertion above: the loop must not add a
    // round-trip to every small grade.
    store.master_core_lesson_events = seedMasters().slice(0, 400);
    const { plannerSupabaseSource } = await import(
      "@/lib/planner/supabase-source"
    );
    const lessons = await plannerSupabaseSource.listLessons(GRADE, OWNER);
    expect(lessons.length).toBe(400);
    expect(
      pageLog.filter((p) => p.table === "master_core_lesson_events").length,
    ).toBe(1);
  });
});

// ── The leaf itself ──────────────────────────────────────────────────────────

describe("pagedSelect", () => {
  type IdRow = { id: string };
  const idOf = (r: IdRow) => r.id;
  /** Ids sort lexicographically in the same order as their index. */
  const idAt = (i: number) => `r-${String(i).padStart(6, "0")}`;

  /** A cursor-paged server holding `total` rows and capping every response at
   *  `ceiling`. `mutate` runs between pages so mid-read writes can be modelled. */
  function server(
    total: number,
    ceiling: number,
    mutate?: (rows: IdRow[], page: number) => IdRow[],
  ) {
    const state = {
      rows: Array.from({ length: total }, (_, i) => ({ id: idAt(i) })),
      pages: 0,
      calls: [] as (string | null)[],
    };
    const run = ({ after, limit, withCount }: PageRequest) => {
      if (mutate && state.pages > 0)
        state.rows = mutate(state.rows, state.pages);
      state.calls.push(after);
      const count = state.rows.length;
      const slice = state.rows
        .filter((r) => after == null || r.id > after)
        .slice(0, Math.min(limit, ceiling));
      state.pages++;
      return Promise.resolve({
        data: slice,
        error: null,
        count: withCount ? count : null,
      } as PageResult<IdRow>);
    };
    return { run, state };
  }

  /** A faithful cursor server whose CURSOR COLUMN is not unique: `dupes` rows
   *  all carry cursor "a", the rest "b". It applies `.gt` correctly, which is
   *  the point — a real PostgREST skips PAST every duplicate of the boundary
   *  value rather than repeating it, so the rows are lost silently. */
  function nonUniqueCursorServer(dupes: number, rest: number) {
    const rows = [
      ...Array.from({ length: dupes }, (_, i) => ({ id: `d${i}`, k: "a" })),
      ...Array.from({ length: rest }, (_, i) => ({ id: `e${i}`, k: "b" })),
    ];
    return ({ after, limit, withCount }: PageRequest) =>
      Promise.resolve({
        data: rows
          .filter((r) => after == null || r.k > after)
          .slice(0, Math.min(limit, POSTGREST_MAX_ROWS)),
        error: null,
        count: withCount ? rows.length : null,
      } as PageResult<{ id: string; k: string }>);
  }

  it("returns the complete set when it crosses the ceiling", async () => {
    const rows = await pagedSelect("test read", idOf, server(1069, 1000).run);
    expect(rows.length).toBe(1069);
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 1069 }, (_, i) => idAt(i)),
    );
  });

  it("crosses an EXACT multiple of the ceiling without stopping early", async () => {
    // The nastiest boundary: 2000 rows means page 2 comes back full and page 3
    // comes back empty. A loop that trusted "short page ⇒ done" would be right
    // here by luck; one that trusts the count is right by construction.
    expect((await pagedSelect("t", idOf, server(2000, 1000).run)).length).toBe(
      2000,
    );
  });

  it("works when the server ceiling is LOWER than the page size", async () => {
    // Ceiling-agnostic by construction: the cursor comes from the rows that
    // actually arrived, never from the count that was asked for.
    const s = server(1200, 500);
    expect((await pagedSelect("t", idOf, s.run)).length).toBe(1200);
    expect(s.state.calls[1]).toBe(idAt(499));
  });

  it("does not mistake a SHORT page for the end of the set", async () => {
    // With a ceiling of 500 and a set of 800, page 1 is short of `pageSize` —
    // and a loop that read "short ⇒ done" would agree with itself while the
    // server still held 300 rows behind the cap.
    const s = server(800, 500);
    expect((await pagedSelect("t", idOf, s.run)).length).toBe(800);
    expect(s.state.calls.length).toBeGreaterThan(1);
  });

  it("makes exactly one request when the set fits in one page", async () => {
    const s = server(42, 1000);
    expect((await pagedSelect("t", idOf, s.run)).length).toBe(42);
    expect(s.state.calls.length).toBe(1);
  });

  it("asks for the count once, on the first page only", async () => {
    const seen: boolean[] = [];
    const s = server(1500, 1000);
    await pagedSelect<IdRow>("t", idOf, (p) => {
      seen.push(p.withCount);
      return s.run(p);
    });
    expect(seen).toEqual([true, false]);
  });

  // ── Mid-read writes: the reason this is a cursor and not an offset ─────────

  it("a row INSERTED below the cursor mid-read is NOT in this scan", async () => {
    // Pinning the documented limit rather than hiding it: this is a scan, not a
    // snapshot. The inserted row sorts below the cursor, so `.gt` has already
    // moved past it; it appears on the next hydrate. What must NOT happen is a
    // duplicate or a lost tail, which is what the offset version did.
    const s = server(1069, 1000, (rows, page) =>
      page === 1 ? [{ id: "r-000000-a" }, ...rows] : rows,
    );
    const rows = await pagedSelect("list master lessons", idOf, s.run);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).not.toContain("r-000000-a"); // the documented miss
    expect(ids).toContain(idAt(1068)); // and the tail is intact
    expect(ids.length).toBe(1069);
  });

  it("loses nothing when a row is DELETED ahead of the cursor mid-read", async () => {
    // The case that motivates keyset paging. With offsets, deleting row 3 after
    // page 1 slides row 1000 down to 999, so page 2 starts past it and that
    // lesson silently disappears — the exact bug this file exists to fix.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = server(1069, 1000, (rows, page) =>
      page === 1 ? rows.filter((r) => r.id !== idAt(3)) : rows,
    );
    const rows = await pagedSelect("list master lessons", idOf, s.run);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    // Everything that still exists came back: 1069 minus the one deleted row,
    // which was already read on page 1.
    expect(ids.length).toBe(1069);
    expect(ids).toContain(idAt(1000));
    expect(ids).toContain(idAt(1068));
    err.mockRestore();
  });

  it("reports, but does not fail, a deficit caused by a mid-read delete", async () => {
    // Count said 1069; by page 2 rows past the cursor had been deleted. The read
    // is complete for what exists now, so failing hydrate over it would be a
    // worse bug than the one being fixed — but it must not pass silently. The
    // re-count is what tells this apart from rows being LOST.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = server(1069, 1000, (rows, page) =>
      page === 1 ? rows.slice(0, 1010) : rows,
    );
    const rows = await pagedSelect("list master lessons", idOf, s.run);
    expect(rows.length).toBe(1010);
    expect(err).toHaveBeenCalledOnce();
    expect(String(err.mock.calls[0][0])).toMatch(/table now holds 1010/);
    err.mockRestore();
  });

  // ── Failure modes that must be loud ───────────────────────────────────────

  it("THROWS on a NON-UNIQUE cursor rather than return the rows it kept", async () => {
    // The failure mode a naive cursor loop hides. The server here honours `.gt`
    // FAITHFULLY, which is exactly why the rows vanish: 1200 rows share cursor
    // "a", so `.gt("a")` on page 2 skips every one of them that did not fit in
    // page 1 and jumps straight to "b". Nothing repeats, nothing errors — the
    // read just comes back short, which is the original bug wearing a new hat.
    await expect(
      pagedSelect<{ id: string; k: string }>(
        "list master lessons",
        (r) => r.k,
        nonUniqueCursorServer(1200, 50),
      ),
    ).rejects.toThrow(/cursor that did not increase/);
  });

  it("THROWS when the page builder uses .gte instead of .gt", async () => {
    // The off-by-one that looks harmless and duplicates a lesson: page 2 starts
    // ON the boundary row rather than after it, so that row is served twice and
    // `rows.length` overshoots the count — a read that would otherwise report
    // success while handing the planner a duplicate.
    const all = Array.from({ length: 1069 }, (_, i) => ({ id: idAt(i) }));
    await expect(
      pagedSelect<IdRow>("list master lessons", idOf, ({ after, limit, withCount }) =>
        Promise.resolve({
          data: all
            .filter((r) => after == null || r.id >= after) // .gte — the bug
            .slice(0, Math.min(limit, POSTGREST_MAX_ROWS)),
          error: null,
          count: withCount ? all.length : null,
        }),
      ),
    ).rejects.toThrow(/cursor that did not increase/);
  });

  it("a duplicate STRADDLING a page boundary is invisible to the page check, and the deficit catches it", async () => {
    // Pinning where detection actually lives. Row 999 and row 1000 share cursor
    // "dup": page 1 ends on "dup", `.gt("dup")` skips its twin, and NEITHER page
    // ever contains a repeat — so the within-page check cannot see it. What
    // catches it is the count deficit, and only because nothing compensated for
    // the loss. The database uniqueness constraint is the real guarantee; this
    // test exists so nobody mistakes the page check for one.
    const rows = [
      ...Array.from({ length: 999 }, (_, i) => ({ k: `a-${idAt(i)}` })),
      { k: "dup" },
      { k: "dup" }, // the twin, on the far side of the boundary
      ...Array.from({ length: 50 }, (_, i) => ({ k: `z-${idAt(i)}` })),
    ];
    await expect(
      pagedSelect<{ k: string }>(
        "list master lessons",
        (r) => r.k,
        ({ after, limit, withCount }) =>
          Promise.resolve({
            data: rows
              .filter((r) => after == null || r.k > after)
              .slice(0, Math.min(limit, POSTGREST_MAX_ROWS)),
            error: null,
            count: withCount ? rows.length : null,
          }),
      ),
    ).rejects.toBeInstanceOf(PlannerReadTruncatedError);
  });

  it("does not stop early when a bulk insert lands above the cursor mid-read", async () => {
    // `expected` is the total as of page 1, so arithmetic alone can be
    // satisfied while pre-existing tail rows are still unread. Here 1500 rows
    // are inserted above the cursor after page 1: `rows.length` sails past the
    // 1069 the count promised while ~1069 original rows remain. Stopping on a
    // FULL page is what would lose them.
    const s = server(1069, 1000, (rows, page) =>
      page === 1
        ? [
            ...rows,
            ...Array.from({ length: 1500 }, (_, i) => ({
              id: `z-${String(i).padStart(6, "0")}`,
            })),
          ]
        : rows,
    );
    const rows = await pagedSelect("list master lessons", idOf, s.run);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(rows.length); // still no duplicates
    expect(ids.has(idAt(1068))).toBe(true); // the ORIGINAL tail survived
    expect(rows.length).toBe(1069 + 1500);
  });

  it("THROWS when the page builder forgets its .gt filter", async () => {
    // The other easy wiring bug: a builder that ignores `page.after` serves the
    // same first page forever.
    await expect(
      pagedSelect<IdRow>("list master lessons", idOf, ({ withCount }) =>
        Promise.resolve({
          data: Array.from({ length: 1000 }, (_, i) => ({ id: idAt(i) })),
          error: null,
          count: withCount ? 5000 : null,
        }),
      ),
    ).rejects.toThrow(/cursor that did not increase/);
  });

  it("THROWS when the deficit re-count itself fails (unknown ≠ complete)", async () => {
    // A server that hands over 1020 of its 1069 rows and then goes quiet, and
    // whose re-count is unavailable. Completeness is UNKNOWN, and unknown must
    // never be reported as complete.
    let page = 0;
    await expect(
      pagedSelect<IdRow>(
        "list master lessons",
        idOf,
        ({ after, limit, withCount }) => {
          if (limit === 0)
            return Promise.resolve({
              data: null,
              error: { message: "recount down" },
              count: null,
            });
          const all = Array.from({ length: 1069 }, (_, i) => ({ id: idAt(i) }));
          const served = all
            .filter((r) => after == null || r.id > after)
            .slice(0, page === 0 ? 1000 : page === 1 ? 20 : 0);
          page++;
          return Promise.resolve({
            data: served,
            error: null,
            count: withCount ? 1069 : null,
          });
        },
      ),
    ).rejects.toBeInstanceOf(PlannerReadTruncatedError);
  });

  it("THROWS rather than return a partial set it cannot finish", async () => {
    // A server that dribbles one row per request no matter the page size. The
    // loop cannot converge, so it must fail loudly — never hand back the rows
    // it did get as though they were the whole set.
    await expect(
      pagedSelect<IdRow>("list master lessons", idOf, ({ after, withCount }) =>
        Promise.resolve({
          data: [{ id: idAt(after == null ? 0 : Number(after.slice(2)) + 1) }],
          error: null,
          count: withCount ? 10_000 : null,
        }),
      ),
    ).rejects.toBeInstanceOf(PlannerReadTruncatedError);
  });

  it("still completes when the server reports no count, and says so", async () => {
    // Without a count nothing can VERIFY the read, so the loop falls back to
    // empty-page termination — sound at any ceiling — and logs that the
    // verification was unavailable rather than implying it passed.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = server(1300, 1000);
    const rows = await pagedSelect<IdRow>("t", idOf, (p) =>
      s.run(p).then((r) => ({ ...r, count: null })),
    );
    expect(rows.length).toBe(1300);
    expect(String(err.mock.calls[0][0])).toMatch(
      /completeness cannot be verified/,
    );
    err.mockRestore();
  });

  it("propagates a transport error instead of returning a partial set", async () => {
    await expect(
      pagedSelect<IdRow>("list master lessons", idOf, () =>
        Promise.resolve({ data: null, error: { message: "boom" }, count: null }),
      ),
    ).rejects.toThrow(/list master lessons failed: boom/);
  });
});

describe("assertNotTruncated", () => {
  it("with a count, catches a truncation the ceiling heuristic cannot see", () => {
    // The reason call sites pass `count: "exact"`. If `db-max-rows` were
    // LOWERED to 500, a 500-row result is a truncation that the
    // exactly-1000 fallback would wave straight through.
    const rows = Array.from({ length: 500 }, (_, i) => i);
    expect(() => assertNotTruncated(rows, "list units", 900)).toThrow(
      PlannerReadTruncatedError,
    );
  });

  it("with a count, accepts a complete read of any size", () => {
    const rows = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => i);
    // Exactly on the ceiling, but the database agrees that is all of them.
    expect(assertNotTruncated(rows, "list units", POSTGREST_MAX_ROWS)).toBe(
      rows,
    );
  });

  it("throws on a result sitting exactly on the ceiling", () => {
    const rows = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => i);
    expect(() => assertNotTruncated(rows, "list units")).toThrow(
      PlannerReadTruncatedError,
    );
  });

  it("passes anything under the ceiling straight through", () => {
    const rows = Array.from({ length: POSTGREST_MAX_ROWS - 1 }, (_, i) => i);
    expect(assertNotTruncated(rows, "list units")).toBe(rows);
  });

  it("names the read, so the error says WHICH query was truncated", () => {
    const rows = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => i);
    expect(() => assertNotTruncated(rows, "list standards")).toThrow(
      /list standards/,
    );
  });
});
