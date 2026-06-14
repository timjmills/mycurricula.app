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

/** The caller's effective framework ids (school default ± personal overrides). */
export async function effectiveFrameworkIds(
  client: ServerClient,
): Promise<string[]> {
  const { data, error } = await client.rpc("teacher_effective_framework_ids");
  if (error || !data) return [];
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
  const { data, error } = await client
    .from("standards")
    .select("id")
    .in("id", unique);
  if (error || !data) return [];
  const ok = new Set((data as { id: string }[]).map((r) => r.id));
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
  const { data, error } = await client
    .from("standards")
    .select("id, code, framework_id")
    .in("code", unique)
    .in("framework_id", effIds)
    .order("framework_id", { ascending: true });
  if (error || !data) return [];
  const byCode = new Map<string, string>();
  for (const row of data as { id: string; code: string }[]) {
    if (!byCode.has(row.code)) byCode.set(row.code, row.id);
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
  const { data, error } = await client
    .from("standards")
    .select("id, code, description")
    .in("id", unique);
  if (error || !data) return [];
  return data as { id: string; code: string; description: string | null }[];
}
