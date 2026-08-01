// tests/read-ceiling-outside-planner.test.ts — task #51.
//
// The same silent-truncation class as task #48, in the four reads that live
// OUTSIDE lib/planner. PostgREST caps every response at this project's
// `db-max-rows` (measured: exactly 1000) and says nothing — HTTP 200, a partial
// body, a `content-range` header nothing reads.
//
// WHY THE FIXTURES ARE BIG. Every fixture here deliberately CROSSES the
// ceiling. A fixture under 1000 rows passes against the broken code, so it
// proves nothing; each suite below therefore states the row count that puts it
// past the cut. The fake client models the one property that matters (a silent
// cap) plus unstable tie ordering, so a read that paginated on a NON-UNIQUE
// cursor fails here rather than in front of a teacher.
//
// THE HEADLINE. `app/api/standards/facets/route.ts` asked for 12,000 rows via
// `.limit(12_000)` and received 1000, with no `.order()` — so the tagging
// picker's Stage/Subject/Strand dropdowns were built from an arbitrary,
// non-deterministic 1000-row slice. Measured on production 2026-08-01 against
// the beta school's default scope (4 frameworks, 2508 banded rows): 17 of the
// 29 Stage values reached the dropdown.
//
// SEEN RED — all four fixes reverted to their pre-task-#51 form in one run,
// 10 failed / 5 passed:
//   • facets, all stages     "expected 12 to be 29"   ← the headline
//   • facets, determinism    "expected 12 to be 29"   (two calls, different 12)
//   • facets, scope control  "expected 12 to be 29"
//   • teach single board     "expected 1000 to be 1200"
//   • teach persist          "expected 1000 to be 1200"  ← the data-loss one
//   • teach multi-board      "expected [299,300,300,101] to deeply equal
//                             [300,300,300,300]"      ← widgets off later boards
//   • teach page-scan        "expected +0 to be 1"    (findWidget never resolved)
//   • resolveStandardsByIds  "expected 1000 to be 1500"
//   • validateStandardIds    "expected 1000 to be 1500"
//   • resolveCodesToStandardIds "expected 1000 to be 1400"
// The 5 that PASSED in that same run are the positive controls (the rpc path,
// the unauthenticated caller, the absent widget, the widget-less board, the
// forged id) — which is what rules out "the harness was simply erroring out".
// Restored to green afterwards: 15/15.
//
// THREE TESTS ARE NOT PART OF THAT RED EVIDENCE, and it would be dishonest to
// imply otherwise: the rpc-argument test, the requested-vs-effective
// intersection test, and the 503 test were added after the red run, in response
// to review. They cover behaviour the pre-fix route did not have at all (there
// was no RPC call and no error status), so "red against the unfixed code" is
// not a meaningful claim for them. Each is paired with a positive control
// instead. Current state: 18/18 green.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { POSTGREST_MAX_ROWS } from "@/lib/planner/paged-read";

// ── A fake PostgREST that enforces the row ceiling ───────────────────────────
// Modelled on tests/planner-read-ceiling.test.ts. Deliberately re-declared
// rather than imported: that file is a test module owned by another lane, and
// importing it would execute its suites.

type Row = Record<string, unknown>;

let store: Record<string, Row[]> = {};
/** Every page the fake served — the "did it actually paginate" evidence. */
let pageLog: { table: string; after: unknown; returned: number }[] = [];
/** Every rpc the code under test issued, with its arguments. */
let rpcLog: { fn: string; args: unknown }[] = [];
/** Handlers for rpc names the code under test calls. */
let rpcHandlers: Record<
  string,
  (args: Record<string, unknown>) => { data: unknown; error: unknown }
> = {};
/** Bumped per request so equal-comparing rows permute between pages. */
let requestSeq = 0;

class FakeQuery implements PromiseLike<unknown> {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private wantCount = false;
  private wantHead = false;
  private cursor: unknown = null;

  constructor(private readonly table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.wantHead = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  /** `.not(col, "is", null)` — the only `not` form these reads use. */
  not(col: string, op: string, val: unknown) {
    if (op !== "is") throw new Error(`fake: unsupported not(${op})`);
    this.filters.push((r) => (r[col] ?? null) !== val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }
  or(expr: string) {
    void expr;
    return this;
  }
  gt(col: string, v: string) {
    this.cursor = v;
    this.filters.push((r) => String(r[col]) > v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  range(from: number, to: number) {
    // Offset paging is unsafe across separate transactions (a delete before the
    // boundary SKIPS a row). If it ever reappears the tests should say so.
    throw new Error(
      `range(${from}, ${to}) on ${this.table}: offset paging is unsafe —` +
        ` page by cursor (lib/planner/paged-read.ts).`,
    );
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private run(): { data: Row[] | null; error: null; count: number | null } {
    const seq = requestSeq++;
    let rows = (store[this.table] ?? []).filter((r) =>
      this.filters.every((f) => f(r)),
    );
    // SHUFFLE_TIES: rotate, then stable-sort. Rows equal on the requested
    // ordering come back differently on every request — all Postgres promises.
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
    if (this.wantHead) {
      return { data: [], error: null, count };
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    // THE BUG, reproduced: PostgREST caps the page and says nothing.
    if (rows.length > POSTGREST_MAX_ROWS) rows = rows.slice(0, POSTGREST_MAX_ROWS);
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
    onOk?: ((v: unknown) => R1 | PromiseLike<R1>) | null,
    onErr?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onOk, onErr);
  }
}

const fakeClient = {
  from: (table: string) => new FakeQuery(table),
  rpc: (fn: string, args?: Record<string, unknown>) => {
    rpcLog.push({ fn, args });
    const handler = rpcHandlers[fn];
    return Promise.resolve(
      handler
        ? handler(args ?? {})
        : { data: null, error: { message: `fake: no rpc ${fn}` } },
    );
  },
  auth: {
    getUser: () =>
      Promise.resolve({ data: { user: { id: "teacher-1" } }, error: null }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(fakeClient),
}));

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

beforeEach(() => {
  store = {};
  pageLog = [];
  rpcLog = [];
  rpcHandlers = {};
  requestSeq = 0;
});

/** Pages actually served for a table — >1 proves the read paginated rather than
 *  happening to fit. */
const pagesFor = (table: string) =>
  pageLog.filter((p) => p.table === table).length;

/** Total rows a table's reads actually delivered. Exactly `POSTGREST_MAX_ROWS`
 *  is the signature of an unpaginated read that hit the ceiling. */
const rowsSeen = (table: string) =>
  pageLog
    .filter((p) => p.table === table)
    .reduce((sum, p) => sum + p.returned, 0);

// ─────────────────────────────────────────────────────────────────────────────
// FINDING 1 — GET /api/standards/facets
// ─────────────────────────────────────────────────────────────────────────────
//
// Fixture: 2508 banded rows across 4 frameworks — the beta school's real shape,
// measured on production. 29 distinct Stage values, and the 1000-row cut falls
// inside them, so a truncated read can only ever see a prefix.

const FW = ["fw-1", "fw-2", "fw-3", "fw-4"];

/** 2508 rows over 29 stages, in CONTIGUOUS blocks of ~86.
 *
 *  The block layout is load-bearing, and an earlier version of this fixture got
 *  it wrong: with stages interleaved (`i % 29`) every stage appears inside the
 *  first 1000 rows, so a truncated read still reports all 29 and the test passes
 *  against the broken code. Production does not look like that — a framework's
 *  rows arrive grouped by band, so the cut lands mid-catalog and whole stages
 *  fall off the end. Contiguous blocks reproduce that: the 1000-row cut leaves
 *  12 stages visible and 17 unreachable. */
function seedStandardsBands(): Row[] {
  const rows: Row[] = [];
  const perStage = Math.ceil(2508 / 29);
  for (let i = 0; i < 2508; i++) {
    const stage = `Stage ${String(Math.floor(i / perStage)).padStart(2, "0")}`;
    const subject = i % 2 === 0 ? "Mathematics" : "English";
    rows.push({
      id: `s-${String(i).padStart(6, "0")}`,
      framework_id: FW[i % FW.length],
      band_label: `${stage} · ${subject} · Strand ${i % 3}`,
      code: `C-${i}`,
      description: `d${i}`,
    });
  }
  return rows;
}

describe("standards facets — the .limit(12_000) that delivered 1000", () => {
  beforeEach(() => {
    store = { standards: seedStandardsBands() };
    rpcHandlers.teacher_effective_framework_ids = () => ({
      data: FW.map((id) => ({ teacher_effective_framework_ids: id })),
      error: null,
    });
  });

  async function callFacets(): Promise<{
    stages: string[];
    subjects: string[];
    strands: string[];
  }> {
    const { GET } = await import("@/app/api/standards/facets/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/standards/facets"),
    );
    return res.json();
  }

  it("offers every Stage in scope, not the ceiling's arbitrary prefix", async () => {
    // The RPC is absent here on purpose: this exercises the fallback, which is
    // the path that has to be complete during the window before the migration
    // lands. 2508 fixture rows > the 1000 ceiling, so a capped read cannot pass.
    const facets = await callFacets();
    expect(facets.stages.length).toBe(29);
    // Named, not just counted: the last stage exists only past the 1000-row cut.
    expect(facets.stages).toContain("Stage 28");
    expect(pagesFor("standards")).toBeGreaterThan(1);
  });

  it("returns the SAME options on repeated calls (the missing .order())", async () => {
    // The old read had no ORDER BY, so which 1000 rows came back varied. The
    // fake's tie-shuffle reproduces that; a deterministic read is unaffected.
    const a = await callFacets();
    const b = await callFacets();
    expect(a.stages).toEqual(b.stages);
    expect(a.stages.length).toBe(29);
  });

  it("prefers the DISTINCT rpc and then never touches the standards table", async () => {
    // The primary path: one row of pre-deduped arrays, immune to a ROW ceiling
    // however large the framework is (production has one with 76,968 banded rows).
    // The handler ANSWERS FROM ITS ARGUMENT rather than returning a constant,
    // so the test also pins the scope actually sent. A route that passed the
    // wrong ids (or none) would change the result instead of passing anyway.
    rpcHandlers.standards_band_facets = (args) => {
      const ids = args.p_framework_ids as string[];
      return {
        data: [
          {
            stages: [...ids].reverse().map((id) => `Stage of ${id}`),
            subjects: ["Maths"],
            strands: [],
          },
        ],
        error: null,
      };
    };
    const facets = await callFacets();
    // Sorted by the route, and exactly the 4 effective frameworks — not more.
    expect(facets.stages).toEqual(FW.map((id) => `Stage of ${id}`));
    expect(pagesFor("standards")).toBe(0);
    const call = rpcLog.find((r) => r.fn === "standards_band_facets");
    expect(call).toBeDefined();
    expect(
      (call?.args as { p_framework_ids: string[] }).p_framework_ids,
    ).toEqual(FW);
  });

  it("sends only the INTERSECTION of requested and effective frameworks", async () => {
    // Scope is an authorisation boundary, not a convenience: the RPC is
    // deliberately scope-agnostic (see the migration's comment), so this route
    // is the only thing standing between a caller-supplied framework id and the
    // catalog. A requested id outside the effective set must be dropped here.
    rpcHandlers.standards_band_facets = () => ({
      data: [{ stages: [], subjects: [], strands: [] }],
      error: null,
    });
    const { GET } = await import("@/app/api/standards/facets/route");
    const { NextRequest } = await import("next/server");
    await GET(
      new NextRequest(
        `http://localhost/api/standards/facets?frameworkIds=${FW[1]},fw-not-mine`,
      ),
    );
    const call = rpcLog.find((r) => r.fn === "standards_band_facets");
    expect(
      (call?.args as { p_framework_ids: string[] }).p_framework_ids,
    ).toEqual([FW[1]]);
  });

  it("answers 503, not an empty 200, when BOTH read paths fail", async () => {
    // An empty 200 is indistinguishable from "this scope has no bands" — the
    // same silent emptiness this task removes, one layer up.
    store.standards = [];
    const { GET } = await import("@/app/api/standards/facets/route");
    const { NextRequest } = await import("next/server");
    const spy = vi
      .spyOn(fakeClient, "from")
      .mockImplementation((() => {
        throw new Error("transport down");
      }) as never);
    const res = await GET(
      new NextRequest("http://localhost/api/standards/facets"),
    );
    spy.mockRestore();
    expect(res.status).toBe(503);
  });

  it("refuses the fallback rather than storm the Worker's subrequest budget", async () => {
    // Each fallback page is one Cloudflare Worker subrequest, and a single
    // invocation has a bounded allowance. One framework in this catalog holds
    // 76,968 banded rows — 77 subrequests for one dropdown. So the fallback
    // must REFUSE a scope it cannot afford, not attempt it and exhaust the
    // Worker: that failure is harder to read than the truncation it replaced.
    // 26,000 rows is just over the 25,000-row budget.
    store.standards = Array.from({ length: 26_000 }, (_, i) => ({
      id: `s-${String(i).padStart(7, "0")}`,
      framework_id: FW[0],
      band_label: `Stage ${i % 5} · Maths · S`,
    }));
    const { GET } = await import("@/app/api/standards/facets/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/standards/facets"),
    );
    expect(res.status).toBe(503);
    // And it refused CHEAPLY — the head-count decided it, so no page was ever
    // fetched. A guard that pages 25 times before giving up has not helped.
    expect(pagesFor("standards")).toBe(0);
  });

  it("POSITIVE CONTROL — a scope just UNDER the budget still completes", async () => {
    // Pairs with the refusal above: without it, a fallback that refused
    // everything would pass that test while helping nobody.
    store.standards = Array.from({ length: 2_400 }, (_, i) => ({
      id: `s-${String(i).padStart(7, "0")}`,
      framework_id: FW[0],
      band_label: `Stage ${Math.floor(i / 100)} · Maths · S`,
    }));
    const facets = await callFacets();
    expect(facets.stages.length).toBe(24);
    expect(pagesFor("standards")).toBeGreaterThan(1);
  });

  it("POSITIVE CONTROL — an empty scope really is a 200, not a 503", async () => {
    // Pairs with the test above: without it, a route that answered 503 for
    // everything would look correct. A genuinely band-less scope is not an error.
    store.standards = [];
    rpcHandlers.standards_band_facets = () => ({
      data: [{ stages: [], subjects: [], strands: [] }],
      error: null,
    });
    const { GET } = await import("@/app/api/standards/facets/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/standards/facets"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stages: [],
      subjects: [],
      strands: [],
    });
  });

  it("POSITIVE CONTROL — an out-of-scope framework really is excluded", async () => {
    // Guards the assertions above from passing for the wrong reason: if the
    // route ignored scope entirely, the counts would still look right. This
    // fails if the scope filter stops working, so "29 stages" means "29 stages
    // that were actually in scope".
    store.standards = [
      ...seedStandardsBands(),
      {
        id: "s-999999",
        framework_id: "fw-not-mine",
        band_label: "Stage ZZ · Other · X",
      },
    ];
    const facets = await callFacets();
    expect(facets.stages).not.toContain("Stage ZZ");
    expect(facets.stages.length).toBe(29);
  });

  it("POSITIVE CONTROL — an unauthenticated caller gets empty facets", async () => {
    const spy = vi
      .spyOn(fakeClient.auth, "getUser")
      .mockResolvedValueOnce({ data: { user: null }, error: null } as never);
    expect(await callFacets()).toEqual({
      stages: [],
      subjects: [],
      strands: [],
    });
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINDINGS 2 + 3 — lib/teach/supabase-source.ts
// ─────────────────────────────────────────────────────────────────────────────

/** `resolveOwnerId` rejects any non-uuid before it can reach an RLS column, so
 *  the fixture owner has to be a real uuid. */
const OWNER = "00000000-0000-4000-8000-000000000011";
const LESSON = "00000000-0000-4000-8000-000000000abc";

const BOARD_BASE = {
  grade_level_id: "g-1",
  subject_id: "s-1",
  master_core_lesson_event_id: null as string | null,
  owner_id: OWNER,
  scope: "personal",
  title: "Board",
  tint: null,
  display_order_within_lesson: 0,
  template_id: null,
  pages: null as unknown,
  board_theme: null,
  repeat: null,
  tags: null,
  background: null,
  size: null,
  whiteboard: false,
  ephemeral: false,
  library_visibility: "private",
  published_by: null,
  source_board_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function widget(id: string, boardId: string, order: number): Row {
  return {
    id,
    board_id: boardId,
    type: "text",
    title: "w",
    grid_row: 0,
    grid_col: 0,
    grid_rowspan: 1,
    grid_colspan: 1,
    canvas: { x: 0, y: 0, w: 320, h: 200 },
    appearance: null,
    display_order_within_board: order,
    pinned: false,
    config: {},
    state: {},
    persistence_override: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("teach widget reads — truncation drops widgets OFF boards", () => {
  it("loads all 1200 widgets on ONE board (widgets-per-board is uncapped)", async () => {
    // lib/teach/limits.ts caps boards at 50 per teacher and defines NO widget
    // cap, so a single board can exceed the ceiling on its own. Chunking by
    // board id alone would not have caught this — hence paging WITHIN a chunk.
    const boardId = "b-solo";
    store = {
      boards: [{ ...BOARD_BASE, id: boardId }],
      widgets: Array.from({ length: 1200 }, (_, i) =>
        widget(`w-${String(i).padStart(5, "0")}`, boardId, i),
      ),
    };
    const { supabaseTeachSource } = await import("@/lib/teach/supabase-source");
    const board = await supabaseTeachSource.getBoard(boardId);
    expect(board?.widgets.length).toBe(1200);
    expect(pagesFor("widgets")).toBeGreaterThan(1);
    // Every widget exactly once — a non-unique cursor would duplicate or skip.
    expect(new Set(board?.widgets.map((w) => w.id)).size).toBe(1200);
  });

  it("DATA LOSS — a save after a truncated read must not persist the emptiness", async () => {
    // THE ONE THAT LOSES A TEACHER'S WORK. `commitPages` syncs the widgets table
    // by full delete-then-insert of page 0, and a FLAT board's page 0 is
    // synthesised from the widget rows the read returned. So a mutation after a
    // truncated read writes the truncated set back and PERMANENTLY deletes the
    // remainder — a read bug becoming a write bug. `addPage` is the cheapest
    // trigger; upsertWidgetOnPage and deletePage go through the same chokepoint.
    const boardId = "b-flat";
    store = {
      boards: [{ ...BOARD_BASE, id: boardId, pages: null }],
      widgets: Array.from({ length: 1200 }, (_, i) =>
        widget(`w-${String(i).padStart(5, "0")}`, boardId, i),
      ),
    };
    const committed: { pages: unknown; widgets: unknown }[] = [];
    rpcHandlers.teach_commit_board_pages = (args) => {
      committed.push({ pages: args.p_pages, widgets: args.p_widgets });
      return { data: null, error: null };
    };
    const { supabaseTeachSource } = await import("@/lib/teach/supabase-source");
    await supabaseTeachSource.addPage(boardId, "Page 2");

    expect(committed.length).toBe(1);
    // The page-0 mirror written back must carry all 1200 widgets. At 1000 the
    // teacher has just lost 200 widgets to a routine "add a page".
    expect((committed[0].widgets as unknown[]).length).toBe(1200);
    const pages = committed[0].pages as { widgets: unknown[] }[];
    expect(pages[0].widgets.length).toBe(1200);
  });

  it("does not drop widgets off the LATER boards of a multi-board read", async () => {
    // 4 boards x 300 widgets = 1200. Truncation does not drop boards; it drops
    // the widgets of whichever boards fall past the cut, so those boards render
    // EMPTY while looking perfectly healthy.
    const ids = ["b-1", "b-2", "b-3", "b-4"];
    store = {
      boards: ids.map((id, i) => ({
        ...BOARD_BASE,
        id,
        master_core_lesson_event_id: LESSON,
        display_order_within_lesson: i,
      })),
      widgets: ids.flatMap((id, b) =>
        Array.from({ length: 300 }, (_, i) =>
          widget(`w-${b}-${String(i).padStart(4, "0")}`, id, i),
        ),
      ),
    };
    const { supabaseTeachSource } = await import("@/lib/teach/supabase-source");
    const boards = await supabaseTeachSource.listBoardsForLesson(LESSON, OWNER);
    expect(boards.length).toBe(4);
    // Asserted as an array, not in a loop: the failure then SHOWS which boards
    // came back empty rather than stopping at the first one.
    expect(boards.map((b) => b.widgets.length)).toEqual([300, 300, 300, 300]);
  });

  it("finds a widget on a non-page-0 page past the board scan's ceiling", async () => {
    // Finding 3: the `findWidget` fallback scans `boards where pages is not
    // null` with NO owner/scope/grade/lesson filter — bounded only by RLS. Team
    // boards are per-lesson and a grade-year is ~1254 lessons. Truncation makes
    // findWidget throw "Widget not found" for a widget that exists.
    const target = "w-scan-target";
    const boards: Row[] = [];
    for (let i = 0; i < 1100; i++) {
      const id = `bs-${String(i).padStart(5, "0")}`;
      boards.push({
        ...BOARD_BASE,
        id,
        // The target lives on page 1 of the LAST board, i.e. past the cut.
        pages: [
          { id: `${id}-p0`, order: 0, widgets: [] },
          {
            id: `${id}-p1`,
            order: 1,
            widgets:
              i === 1099
                ? [
                    {
                      id: target,
                      boardId: id,
                      type: "text",
                      title: "t",
                      position: { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
                      canvas: { x: 0, y: 0, w: 320, h: 200 },
                      displayOrder: 0,
                      pinned: false,
                      config: {},
                      state: {},
                    },
                  ]
                : [],
          },
        ],
      });
    }
    store = { boards, widgets: [] };
    const committed: unknown[] = [];
    rpcHandlers.teach_commit_board_pages = (args) => {
      committed.push(args.p_pages);
      return { data: null, error: null };
    };
    const { supabaseTeachSource } = await import("@/lib/teach/supabase-source");
    // deleteWidget routes through findWidget; it resolves or it throws.
    await expect(
      supabaseTeachSource.deleteWidget(target),
    ).resolves.not.toThrow();
    expect(committed.length).toBe(1);
    // THE DETERMINISTIC ASSERTION. Whether a truncated scan happens to include
    // the target board depends on where the cut falls, so "it resolved" alone is
    // a coin-flip against the broken code. How many board rows the scan actually
    // received is not: an unpaginated read returns exactly the 1000-row ceiling,
    // a paginated one returns all 1100.
    expect(rowsSeen("boards")).toBe(1100);
    expect(pagesFor("boards")).toBeGreaterThan(1);
  });

  it("POSITIVE CONTROL — a genuinely absent widget still fails to resolve", async () => {
    // Pairs with the assertion above. `deleteWidget` swallows "Widget not
    // found" on purpose (it is idempotent), so the control uses `moveWidget`,
    // which propagates — otherwise a findWidget that "resolved" everything, or
    // a fake that never errored, would look like a pass.
    store = {
      boards: [{ ...BOARD_BASE, id: "b-x", pages: [] }],
      widgets: [],
    };
    const { supabaseTeachSource } = await import("@/lib/teach/supabase-source");
    await expect(supabaseTeachSource.moveWidget("w-nope", 1, 1)).rejects.toThrow(
      /Widget not found/,
    );
    // …and the idempotent delete really is the lenient one, so the assertion
    // above ("resolves") is not vacuous for the wrong reason.
    await expect(
      supabaseTeachSource.deleteWidget("w-nope"),
    ).resolves.toBeUndefined();
  });

  it("POSITIVE CONTROL — a board with no widgets reads as empty, not missing", async () => {
    store = { boards: [{ ...BOARD_BASE, id: "b-empty" }], widgets: [] };
    const { supabaseTeachSource } = await import("@/lib/teach/supabase-source");
    const board = await supabaseTeachSource.getBoard("b-empty");
    expect(board).not.toBeNull();
    expect(board?.widgets).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINDING 4 (+ the code lookup next to it) — lib/standards/code-lookup.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("standards id/code lookups — an unresolved id is a DELETED tag", () => {
  /** 1500 catalog rows; the lookups below ask for all of them at once. */
  function seedCatalog(n: number, frameworks: string[]): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < n; i++) {
      for (const fw of frameworks) {
        rows.push({
          id: `${fw}:std-${String(i).padStart(5, "0")}`,
          framework_id: fw,
          code: `C-${String(i).padStart(5, "0")}`,
          description: `desc ${i}`,
          band_label: null,
        });
      }
    }
    return rows;
  }

  it("resolves 1500 ids — truncation here silently deletes standard tags", async () => {
    // `augmentStandardsIndex` passes every standard uuid across a WHOLE lesson
    // set that is missing from the grade baseline. Production is at 110 today
    // (measured 2026-08-01), but remove a framework in settings and every tag
    // from it becomes missing at once. An id that fails to resolve is DROPPED by
    // standardUuidsToCodes — the tag vanishes on reload.
    store = { standards: seedCatalog(1500, ["fw-1"]) };
    const { resolveStandardsByIds } = await import(
      "@/lib/standards/code-lookup"
    );
    const ids = (store.standards as Row[]).map((r) => r.id as string);
    const out = await resolveStandardsByIds(fakeClient as never, ids);
    expect(out.length).toBe(1500);
    expect(new Set(out.map((r) => r.id)).size).toBe(1500);
  });

  it("validates 1500 ids on a write without dropping any", async () => {
    store = { standards: seedCatalog(1500, ["fw-1"]) };
    const { validateStandardIds } = await import("@/lib/standards/code-lookup");
    const ids = (store.standards as Row[]).map((r) => r.id as string);
    expect((await validateStandardIds(fakeClient as never, ids)).length).toBe(
      1500,
    );
  });

  it("resolves codes when codes x frameworks crosses the ceiling", async () => {
    // `code` is unique only PER framework (standards has UNIQUE(framework_id,
    // code)), so one code returns one row per effective framework. 1400 codes x
    // 7 frameworks = 9800 candidate rows for 1400 answers — a fixed chunk size
    // would not have bounded this.
    const frameworks = ["fw-1", "fw-2", "fw-3", "fw-4", "fw-5", "fw-6", "fw-7"];
    store = { standards: seedCatalog(1400, frameworks) };
    rpcHandlers.teacher_effective_framework_ids = () => ({
      data: frameworks.map((id) => ({ teacher_effective_framework_ids: id })),
      error: null,
    });
    const { resolveCodesToStandardIds } = await import(
      "@/lib/standards/code-lookup"
    );
    const codes = Array.from(
      { length: 1400 },
      (_, i) => `C-${String(i).padStart(5, "0")}`,
    );
    const out = await resolveCodesToStandardIds(fakeClient as never, codes);
    expect(out.length).toBe(1400);
    // Ambiguity rule preserved: lowest framework_id wins for every code.
    expect(out.every((id) => id.startsWith("fw-1:"))).toBe(true);
  });

  it("POSITIVE CONTROL — a forged id is still rejected, and order is kept", async () => {
    // Without this, a lookup that returned its input unchanged would satisfy
    // every count assertion above.
    store = { standards: seedCatalog(5, ["fw-1"]) };
    const { validateStandardIds } = await import("@/lib/standards/code-lookup");
    const real = (store.standards as Row[]).map((r) => r.id as string);
    const out = await validateStandardIds(fakeClient as never, [
      real[2],
      "fw-1:std-99999",
      real[0],
    ]);
    expect(out).toEqual([real[2], real[0]]);
  });
});
