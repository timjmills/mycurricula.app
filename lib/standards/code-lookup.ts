// lib/standards/code-lookup.ts — code → real standard UUID resolution.
//
// WHY THIS EXISTS (the R1 fix). Lessons store `standards uuid[]`, but the domain
// model carries standard CODES (slugs like `5.NBT.A.1`). The old write path used
// `slugToUuid("standard", code)` to mint the uuid — which is WRONG for the live
// catalog: the 1.11M ingested `standards.id` were NOT minted that way, so that
// path would persist uuids that match no row. It was only ever latent because no
// UI wrote catalog standards onto lessons. This module replaces that with a real
// DB lookup: code → the actual `standards.id`.
//
// SCOPING + SAFETY. Resolution is constrained to the caller's EFFECTIVE framework
// set (public.teacher_effective_framework_ids(), the same scope the tagging picker
// searches within), so a code resolves unambiguously (codes are unique per
// framework) and a teacher can only ever tag standards from their own frameworks.
// A code that does not resolve within that set is DROPPED — we never fabricate a
// uuid. Codes are treated as opaque strings (the catalog uses a non-ASCII hyphen
// U+2010 in some codes; no normalisation).
//
// Takes the request-scoped server client as a param (never imports a client),
// so it is safe to call from lib/planner/supabase-source.ts under the caller's RLS.

import type { ServerClient } from "@/lib/supabase/helpers";
import {
  assertNotTruncated,
  POSTGREST_MAX_ROWS,
} from "@/lib/planner/paged-read";

// ── Row-ceiling safety (task #51) ────────────────────────────────────────────
// PostgREST caps every response at this project's `db-max-rows` (1000) SILENTLY:
// HTTP 200, a partial body, and a `content-range` header nothing reads. Every
// lookup in this module is an `.in(...)` over a caller-supplied array, so the
// result size is set by the CALLER, not by anything in this file — which is
// exactly the shape that grows past a ceiling without anyone noticing.
//
// The consequence here is worse than a short list. An id that fails to come back
// is indistinguishable from an id that does not exist, so `validateStandardIds`
// would DROP it from a write and `resolveStandardsByIds` would leave it
// unresolved for `standardUuidsToCodes` to drop — silently deleting a teacher's
// standard tags. These functions exist to prevent that exact loss.
//
// THE GUARANTEE. `id` is the PRIMARY KEY of `standards`, so `.in("id", chunk)`
// returns AT MOST `chunk.length` rows. Chunking below the ceiling therefore
// makes truncation impossible by construction rather than merely unlikely — it
// does not depend on how much data exists or on how the caller grew.
// (Chunking also keeps the request URL well under PostgREST's length limit,
// which a few thousand inlined uuids would otherwise blow past.)

/** Ids per `.in()` request. Deliberately WELL below {@link POSTGREST_MAX_ROWS}:
 *  a chunk of exactly 1000 would return 1000 rows on a full match, which is
 *  indistinguishable from a truncated response. Half the ceiling leaves the
 *  distinction unambiguous and still keeps the round-trip count low. */
const ID_CHUNK = Math.floor(POSTGREST_MAX_ROWS / 2);

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The caller's effective framework ids (school default ± personal overrides). */
export async function effectiveFrameworkIds(
  client: ServerClient,
): Promise<string[]> {
  // CEILING NOTE (task #51). This RPC is SETOF uuid, so PostgREST caps it at
  // 1000 like any other row-returning read — and a truncated effective set is
  // worse than a short list: `resolveCodesToStandardIds` would then resolve a
  // code against an incomplete framework candidate set and could pick the wrong
  // framework's standard. It is NOT paginated because it cannot exceed the
  // number of frameworks that exist: 176 in the catalog on 2026-08-01, and the
  // RPC returns a subset of `standards_frameworks`. The guard is here so that
  // if the catalog ever passes 1000 this fails LOUDLY instead of quietly
  // narrowing every teacher's scope.
  //
  // `{ count: "exact" }` rides along on the same round-trip and makes the guard
  // EXACT rather than a comparison against the 1000 heuristic — which is the
  // only form that would also catch a db-max-rows that had been LOWERED.
  const { data, error, count } = await client.rpc(
    "teacher_effective_framework_ids",
    {},
    { count: "exact" },
  );
  if (error || !data) return [];
  assertNotTruncated(
    data as unknown[],
    "teacher effective framework ids",
    count,
  );
  // setof uuid → PostgREST may return scalars or { teacher_effective_framework_ids }
  return (data as unknown[])
    .map((el) =>
      typeof el === "string"
        ? el
        : ((el as Record<string, unknown>)?.teacher_effective_framework_ids ??
            Object.values(el as object)[0]),
    )
    .filter((x): x is string => typeof x === "string");
}

/** Validate caller-supplied standard UUIDs against the catalog. Returns the subset
 *  of `ids` that name a REAL `standards` row — order preserved, duplicates
 *  collapsed. This is the EXACT, collision-free write path: the tagging picker
 *  already knows each picked standard's real id, so persistence carries the id
 *  directly instead of re-resolving an ambiguous code (codes are unique only PER
 *  framework — `S1` exists in both AERO and WIDA-ELD).
 *
 *  EXISTENCE, not effective-set, is the check here on purpose. Effective-set
 *  scoping is enforced at DISCOVERY (the search route only surfaces standards in
 *  the teacher's frameworks, so only in-scope ids can be newly added). Requiring
 *  effective-set membership on WRITE would silently DROP a pre-existing tag whose
 *  framework the teacher later removed — data loss on an unrelated curation. RLS
 *  already gates the lesson row; the standards array is the teacher's own data and
 *  the catalog is public-read, so existence is the right integrity check (it still
 *  rejects forged / non-existent uuids). */
export async function validateStandardIds(
  client: ServerClient,
  ids: string[],
): Promise<string[]> {
  const unique = [
    ...new Set(ids.filter((u) => typeof u === "string" && u.length > 0)),
  ];
  if (unique.length === 0) return [];
  // CHUNKED (task #51). Today's callers pass one lesson's `standards` array
  // (currently ≤ 5 uuids), but nothing in the signature bounds it, and the
  // failure mode of exceeding the ceiling here is a SILENT DROP on a write.
  const ok = new Set<string>();
  for (const batch of chunk(unique, ID_CHUNK)) {
    const { data, error } = await client
      .from("standards")
      .select("id")
      .in("id", batch);
    if (error || !data) return [];
    for (const r of data as { id: string }[]) ok.add(r.id);
  }
  // Preserve caller order; drop anything that didn't validate.
  return ids.filter((u) => ok.has(u));
}

/** Resolve standard CODES → real `standards.id`, scoped to the caller's effective
 *  frameworks. Order-preserving; unresolved codes are dropped (never fabricated).
 *  AMBIGUITY: a code shared by two effective frameworks resolves to the first by
 *  framework_id order — use `validateStandardIds` (exact, id-based) for writes from
 *  the tagging picker; this code path is the fallback for callers without ids. */
export async function resolveCodesToStandardIds(
  client: ServerClient,
  codes: string[],
): Promise<string[]> {
  const unique = [
    ...new Set(codes.filter((c) => typeof c === "string" && c.length > 0)),
  ];
  if (unique.length === 0) return [];
  const effIds = await effectiveFrameworkIds(client);
  if (effIds.length === 0) return [];
  // CHUNKED (task #51, additional finding). Unlike the id lookups above, `code`
  // is NOT unique across the table — `standards` is UNIQUE (framework_id, code),
  // so one code can return one row PER effective framework. The worst case is
  // therefore codes × frameworks, not codes, and a fixed chunk size would not
  // bound it. Size the chunk against the actual framework count so the product
  // stays under the ceiling by construction.
  //
  // Chunking by CODE (not by framework) is what keeps the ambiguity rule intact:
  // every row for a given code lands in that code's single chunk, so the
  // documented "first by framework_id order" resolution still sees the complete
  // candidate set for each code.
  const perChunk = Math.max(
    1,
    Math.floor((POSTGREST_MAX_ROWS - 100) / Math.max(1, effIds.length)),
  );
  const byCode = new Map<string, string>();
  for (const batch of chunk(unique, perChunk)) {
    const { data, error, count } = await client
      .from("standards")
      .select("id, code, framework_id", { count: "exact" })
      .in("code", batch)
      .in("framework_id", effIds)
      .order("framework_id", { ascending: true });
    if (error || !data) return [];
    // Belt-and-braces: the chunk arithmetic above should make this unreachable,
    // but a wrong `effIds` count or a future filter change could put it back in
    // range. A partial result here DROPS standard tags on a write, so fail loud
    // rather than quietly resolve fewer codes than were asked for. The exact
    // count makes the check ceiling-INDEPENDENT: "fewer rows than the database
    // says match" is a truncation whatever db-max-rows happens to be.
    const rows = assertNotTruncated(
      data as { id: string; code: string }[],
      "resolve standard codes",
      count,
    );
    for (const row of rows) {
      if (!byCode.has(row.code)) byCode.set(row.code, row.id);
    }
  }
  return codes
    .map((c) => byCode.get(c))
    .filter((x): x is string => typeof x === "string");
}

/** Resolve specific standard UUIDs → { code, description } (lazy describe for
 *  tags outside the grade's baseline catalog). Order/coverage best-effort. */
export async function resolveStandardsByIds(
  client: ServerClient,
  ids: string[],
): Promise<{ id: string; code: string; description: string | null }[]> {
  const unique = [...new Set(ids.filter((u) => typeof u === "string" && u))];
  if (unique.length === 0) return [];
  // CHUNKED (task #51). The array size is set by the CALLER
  // (`augmentStandardsIndex` in lib/planner/supabase-source.ts), which passes
  // every standard uuid referenced across a WHOLE lesson set that is missing
  // from the grade's baseline index. That is small only while the teacher's
  // effective frameworks are a superset of the grade's assignments; remove a
  // framework in settings and every tag from it becomes "missing" at once, so
  // the array scales with the curriculum rather than with one lesson.
  //
  // Measured on production 2026-08-01: 110 distinct standard uuids across all
  // 1254 master lessons, so this is NOT crossing the ceiling today. It is fixed
  // because the bound is the caller's to break and the failure is silent — an
  // unresolved uuid is dropped by `standardUuidsToCodes`, i.e. the tag vanishes
  // on reload, which is the precise data loss this lookup exists to prevent.
  const out: { id: string; code: string; description: string | null }[] = [];
  for (const batch of chunk(unique, ID_CHUNK)) {
    const { data, error } = await client
      .from("standards")
      .select("id, code, description")
      .in("id", batch);
    if (error || !data) return [];
    out.push(
      ...(data as { id: string; code: string; description: string | null }[]),
    );
  }
  return out;
}
