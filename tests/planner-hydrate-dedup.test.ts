// planner-hydrate-dedup.test.ts — the SECOND half of the hydrate fix, stated as
// a checkable claim rather than a hope.
//
// THE CLAIM. `sb()` built a new Supabase client per call, and the planner
// repository's per-request memos are WeakMaps keyed on that client object. So
// across six separate server actions every memo missed, and one document load
// re-read the same reference tables: `subjects` 3×, `units` 2×, the standards
// pair 2×, and `grade_levels` + `school_years` 2×. Running the reads inside one
// `withSharedServerClient` scope should collapse each of those to 1.
//
// THE INSTRUMENT. A fake Supabase client that records every `.from(table)` and
// resolves every query to an empty result. That is enough: this test is about
// HOW MANY reads are issued, not what they return, and an empty result drives
// every read down its shortest path (which, if anything, UNDERCOUNTS the
// duplication — the standards table itself is never reached because the grade
// resolves to zero frameworks).
//
// The unscoped half is the control. If it did not show the duplicates, the
// scoped half proving they are gone would be meaningless.

import { describe, expect, it, vi, beforeEach } from "vitest";

const seen = vi.hoisted(() => ({ tables: [] as string[], clients: 0 }));

/** A PostgREST query builder that accepts any chain and resolves empty. */
function builder(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: unknown) => void) =>
            Promise.resolve({ data: [], error: null }).then(res);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    seen.clients += 1;
    return {
      from: (table: string) => {
        seen.tables.push(table);
        return builder();
      },
      rpc: async () => ({ data: null, error: null }),
    };
  },
}));

import { withSharedServerClient } from "@/lib/supabase/helpers";
import { plannerSupabaseSource } from "@/lib/planner/supabase-source";

const GRADE = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";

/** The four catalog reads a hydrate performs, exactly as the bundle issues them. */
function catalogReads() {
  return Promise.all([
    plannerSupabaseSource.listLessons(GRADE, OWNER),
    plannerSupabaseSource.listSubjects(GRADE),
    plannerSupabaseSource.listUnits(GRADE),
    plannerSupabaseSource.listStandards(GRADE),
  ]);
}

function countOf(table: string): number {
  return seen.tables.filter((t) => t === table).length;
}

describe("hydrate reference reads", () => {
  beforeEach(() => {
    seen.tables = [];
    seen.clients = 0;
  });

  // THE CONTROL. This is today's behaviour on the six-action path: each method
  // resolves its own client, so nothing memoizes across them.
  it("duplicates the reference tables when every read builds its own client", async () => {
    await catalogReads();

    expect(seen.clients).toBe(4);
    // subjects: listLessons + listSubjects + listUnits.
    expect(countOf("subjects")).toBe(3);
    // units: listLessons + listUnits.
    expect(countOf("units")).toBe(2);
    // the standards pair: listLessons + listStandards.
    expect(countOf("grade_framework_assignments")).toBe(2);
    // the active-school-year resolution: listLessons + listUnits.
    expect(countOf("grade_levels")).toBe(2);
    // `school_years` is deliberately NOT asserted: the fake grade row resolves
    // to no school, so the resolver returns before reaching it. On a real grade
    // it is the second half of the same duplicated pair.
    expect(countOf("school_years")).toBe(0);
  });

  // THE CLAIM. One shared client → the client-keyed memos hit → each reference
  // table is read exactly once for the whole document load.
  it("reads each reference table EXACTLY once inside a shared-client scope", async () => {
    await withSharedServerClient(catalogReads);

    expect(seen.clients).toBe(1);
    expect(countOf("subjects")).toBe(1);
    expect(countOf("units")).toBe(1);
    expect(countOf("grade_framework_assignments")).toBe(1);
    expect(countOf("grade_levels")).toBe(1);
  });

  // The memo must not outlive the scope: a second load is a second request and
  // has to see the database again, not a cached catalog from minutes ago.
  it("does not carry a memo across scopes", async () => {
    await withSharedServerClient(catalogReads);
    const first = countOf("subjects");
    await withSharedServerClient(catalogReads);

    expect(first).toBe(1);
    expect(countOf("subjects")).toBe(2);
    expect(seen.clients).toBe(2);
  });

  // `augmentStandardsIndex` mutates the index IN PLACE to add out-of-grade
  // codes. Sharing ONE index object between `listLessons` and `listStandards`
  // would make what `listStandards` returned depend on which finished first, so
  // the memo caches the READ and hands out per-caller copies.
  it("gives each caller its own standards index despite sharing the read", async () => {
    await withSharedServerClient(async () => {
      const [a, b] = await Promise.all([
        plannerSupabaseSource.listStandards(GRADE),
        plannerSupabaseSource.listStandards(GRADE),
      ]);
      expect(a).not.toBe(b);
      (a as Record<string, string>)["INJECTED"] = "x";
      expect(b).not.toHaveProperty("INJECTED");
      expect(countOf("grade_framework_assignments")).toBe(1);
    });
  });
});
