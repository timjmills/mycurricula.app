// app/api/standards/facets/route.ts
//
// GET /api/standards/facets?frameworkIds=a,b — the distinct band_label segments
// (Stage / Subject / Strand) for the given frameworks, to populate the tagging
// picker's filter dropdowns. Scope is intersected with the caller's effective set.
// Returns: { stages: string[]; subjects: string[]; strands: string[] }
//
// band_label is "Stage · Subject · Strand" (Strand optional).
//
// WHY THIS IS AN RPC AND NOT A SELECT (task #51, measured on production
// 2026-08-01). The previous implementation selected `band_label` for the whole
// scope with `.limit(12_000)` and deduped in JS. Two bugs, one silent:
//
//   1. PostgREST caps every response at `db-max-rows`, which is 1000 on this
//      project and is applied to `.limit(12_000)` exactly as it is to a bare
//      select. The author asked for 12,000 rows and got 1000 — a `.limit()`
//      ABOVE the ceiling reads like a deliberate bound and provides none.
//   2. The query had no `.order()`, so the 1000 rows that did come back were an
//      arbitrary slice in whatever order the plan happened to emit.
//
//   Measured effect on the beta school's default scope (4 configured
//   frameworks, 2508 banded rows): the dropdowns offered 17 Stage values out of
//   the 29 that exist. Twelve filter options were missing, and which twelve was
//   not stable between requests.
//
//   Pagination is the wrong fix here. The read exists only to compute a few
//   dozen DISTINCT labels, and a single framework in this catalog holds up to
//   76,968 banded rows — 77 sequential round-trips to populate a dropdown. So
//   the DISTINCT is pushed into Postgres (`standards_band_facets`), which
//   returns ONE row of three pre-split, pre-deduped, pre-sorted arrays. An
//   array-valued single row cannot be truncated by a ROW ceiling at all, which
//   is the property that makes this immune rather than merely under the limit.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  assertNotTruncated,
  pagedSelect,
  type PageRequest,
  type PageResult,
} from "@/lib/planner/paged-read";

export const runtime = "nodejs";

type Facets = { stages: string[]; subjects: string[]; strands: string[] };

const EMPTY: Facets = { stages: [], subjects: [], strands: [] };

/** The band_label segment separator — a MIDDLE DOT with spaces, exactly as the
 *  ingest writes it. Must stay in lockstep with the `split_part` delimiter in
 *  the `standards_band_facets` migration. */
const BAND_SEP = " · ";

/** `{ count: "exact" }` on the first page only — the total rides along on the
 *  same round-trip and makes completeness checkable. Mirrors the planner's
 *  private `countOpt`; duplicated rather than exported across the seam. */
const countOpt = (page: PageRequest): { count: "exact" } | undefined =>
  page.withCount ? { count: "exact" } : undefined;

const sortUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/** Split `band_label` rows into the three facet lists. Shared by the RPC path
 *  (which pre-splits in SQL but is re-normalised here for safety) and the
 *  fallback path. */
function facetsFromLabels(labels: Iterable<string | null>): Facets {
  const stages: string[] = [];
  const subjects: string[] = [];
  const strands: string[] = [];
  for (const label of labels) {
    const parts = (label ?? "").split(BAND_SEP);
    if (parts[0]?.trim()) stages.push(parts[0].trim());
    if (parts[1]?.trim()) subjects.push(parts[1].trim());
    if (parts[2]?.trim()) strands.push(parts[2].trim());
  }
  return {
    stages: sortUnique(stages),
    subjects: sortUnique(subjects),
    strands: sortUnique(strands),
  };
}

/** Coerce one RPC array column to `string[]`, tolerating a null/absent column. */
const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Hard budget on the fallback scan, in ROWS.
 *
 *  WHY A BUDGET AND NOT JUST "PAGE UNTIL DONE" (raised by the paged-read author,
 *  and it is the real operational risk in this file). Each page is one
 *  subrequest, and this app runs on Cloudflare Workers, where a single
 *  invocation has a bounded subrequest allowance. A framework in this catalog
 *  holds 76,968 banded rows — 77 subrequests for one dropdown — and a school
 *  that configured several large frameworks could ask for far more. So an
 *  unbounded fallback does not degrade gracefully when the migration is
 *  missing; it degrades into a Worker that runs out of subrequests, which is a
 *  harder failure to read than the one it replaced.
 *
 *  25,000 rows = 25 pages, which covers every realistic scope measured on
 *  2026-08-01 (the beta school's 4 frameworks are 2,508 rows / 3 pages; the
 *  featured fallback's 14 frameworks are ~7,400 / 8 pages) with room to spare,
 *  and refuses the pathological one instead of trying it. */
const FALLBACK_MAX_ROWS = 25_000;

/** FALLBACK ONLY — used when `standards_band_facets` is not present in the
 *  database (i.e. the migration has not been applied yet).
 *
 *  Reads every banded row in scope by cursor page and dedupes in JS. Correct but
 *  O(rows/1000) round-trips, which is precisely why it is not the primary path.
 *  It exists so the route is never SILENTLY WRONG in the window before the
 *  migration lands — a slow-but-complete answer beats a fast-but-partial one,
 *  and `pagedSelect` throws rather than truncating if it ever cannot finish.
 *
 *  It opens with a HEAD count, which is free of the very bug this task is about:
 *  `{ count: "exact", head: true }` returns no rows, so a row ceiling cannot
 *  touch it. One cheap subrequest decides whether the expensive ones are
 *  affordable at all.
 *
 *  CURSOR SAFETY: pages on `standards.id`, the table's PRIMARY KEY. Unique
 *  unconditionally, so it stays a valid cursor no matter how the `framework_id`
 *  / `band_label` filters are later changed. */
async function facetsByPagedScan(
  client: Awaited<ReturnType<typeof createClient>>,
  scope: string[],
): Promise<Facets> {
  const probe = await client
    .from("standards")
    .select("id", { count: "exact", head: true })
    .in("framework_id", scope)
    .not("band_label", "is", null);
  if (probe.error) {
    throw new Error(`facets fallback pre-count failed: ${probe.error.message}`);
  }
  if ((probe.count ?? 0) > FALLBACK_MAX_ROWS) {
    throw new Error(
      `facets fallback would need ${Math.ceil((probe.count ?? 0) / 1000)} paged` +
        ` reads for ${probe.count} rows across ${scope.length} framework(s),` +
        ` over the ${FALLBACK_MAX_ROWS}-row budget. This scope REQUIRES the` +
        ` standards_band_facets migration — the fallback is a stopgap for small` +
        ` scopes, not a substitute for the RPC.`,
    );
  }

  type Row = { id: string; band_label: string | null };
  const rows = await pagedSelect<Row>(
    "standards band facets fallback scan",
    (row) => row.id,
    (page) => {
      let q = client
        .from("standards")
        .select("id, band_label", countOpt(page))
        .in("framework_id", scope)
        .not("band_label", "is", null);
      if (page.after != null) q = q.gt("id", page.after);
      return q
        .order("id", { ascending: true })
        .limit(page.limit) as unknown as PromiseLike<PageResult<Row>>;
    },
  );
  return facetsFromLabels(rows.map((r) => r.band_label));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json(EMPTY);
  }

  // Same ceiling note as `lib/standards/code-lookup.ts#effectiveFrameworkIds`:
  // SETOF uuid is row-capped too, and a truncated effective set silently
  // narrows scope. Bounded by the catalog (176 frameworks on 2026-08-01), so
  // guarded rather than paginated — with the exact count so the guard does not
  // rest on the 1000 heuristic.
  const { data: effData, count: effCount } = await client.rpc(
    "teacher_effective_framework_ids",
    {},
    { count: "exact" },
  );
  assertNotTruncated(
    (effData as unknown[] | null) ?? [],
    "teacher effective framework ids",
    effCount,
  );
  const effIds = ((effData as unknown[] | null) ?? [])
    .map((el) =>
      typeof el === "string"
        ? el
        : ((el as Record<string, unknown>)?.teacher_effective_framework_ids ??
            Object.values(el as object)[0]),
    )
    .filter((x): x is string => typeof x === "string");

  const requested = (req.nextUrl.searchParams.get("frameworkIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const scope =
    requested.length > 0 ? requested.filter((id) => effIds.includes(id)) : effIds;
  if (scope.length === 0) {
    return NextResponse.json(EMPTY);
  }

  // PRIMARY PATH — DISTINCT in Postgres, one row back, no row ceiling in play.
  const rpc = await client.rpc("standards_band_facets", {
    p_framework_ids: scope,
  });
  if (!rpc.error) {
    // `returns table(...)` arrives as a one-element array of column objects;
    // a set-returning shape with zero rows means "no bands in scope".
    const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
      | Record<string, unknown>
      | null
      | undefined;
    return NextResponse.json({
      stages: sortUnique(asStrings(row?.stages)),
      subjects: sortUnique(asStrings(row?.subjects)),
      strands: sortUnique(asStrings(row?.strands)),
    } satisfies Facets);
  }

  // The RPC failed. Do NOT fall through to a capped select — that is the bug
  // this file was rewritten to remove. Page the scan instead, and say loudly
  // why the slow path is running so a missing migration cannot hide as latency.
  console.error(
    `[standards/facets] standards_band_facets RPC unavailable (${rpc.error.message}).` +
      ` Falling back to a paged scan of ${scope.length} framework(s) — correct but` +
      ` one round-trip per 1000 rows. Apply the standards_band_facets migration.`,
  );
  try {
    return NextResponse.json(await facetsByPagedScan(client, scope));
  } catch (err) {
    // BOTH paths failed. Do not answer 200 with empty facets: an empty 200 is
    // indistinguishable from "this scope genuinely has no bands", which is the
    // same silent-emptiness this task exists to remove — one layer up. A 5xx
    // makes the outage visible in the network tab and to monitoring. The picker
    // degrades identically either way (it already coerces a missing array to
    // `[]`), so nothing regresses for the teacher; only the diagnosis improves.
    console.error(
      `[standards/facets] paged fallback failed: ${(err as Error).message}`,
    );
    return NextResponse.json(
      { ...EMPTY, error: "facets_unavailable" },
      { status: 503 },
    );
  }
}
