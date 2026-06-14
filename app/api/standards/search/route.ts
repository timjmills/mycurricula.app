// app/api/standards/search/route.ts
//
// POST /api/standards/search — server-side search of the 1.11M-row `standards`
// catalog for the tagging picker. MUST be server-side (cannot ship 1.11M rows to
// the client). Results are ALWAYS constrained to the caller's EFFECTIVE framework
// set (public.teacher_effective_framework_ids()) — defence in depth on top of RLS,
// so a teacher can only ever search within their own chosen frameworks even though
// RLS alone would let them read any catalog standard.
//
// Body: { frameworkIds?: string[]; stage?; subject?; strand?; q?; limit?; offset? }
//   frameworkIds — optional client narrowing; intersected with the effective set.
//   stage/subject/strand — band_label segment filters ("Stage · Subject · Strand").
//   q — free-text substring over code OR description (trigram-backed).
// Returns: { rows: StandardHit[]; hasMore: boolean }
//
// No zod in this project — inputs are hand-validated. User strings are escaped
// before going into ilike patterns / the PostgREST .or() filter string.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 30;

interface StandardHit {
  id: string;
  frameworkId: string;
  shortCode: string | null;
  code: string;
  description: string | null;
  bandLabel: string | null;
}

/** Escape LIKE wildcards so a user value is matched literally inside ilike. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/** Strip characters that would break the PostgREST .or() filter string syntax,
 *  then escape LIKE wildcards. `*` is the .or() wildcard, so it is removed too. */
function sanitizeOrTerm(s: string): string {
  return escapeLike(s.replace(/[,()*]/g, " ")).trim();
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
}

function asTrimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Effective framework set — the hard scope. Empty → nothing to search.
  const { data: effData, error: effErr } = await client.rpc(
    "teacher_effective_framework_ids",
  );
  if (effErr) {
    return NextResponse.json({ error: "Scope lookup failed." }, { status: 500 });
  }
  const effIds = (effData as unknown[] | null ?? [])
    .map((el) =>
      typeof el === "string"
        ? el
        : ((el as Record<string, unknown>)?.teacher_effective_framework_ids ??
            Object.values(el as object)[0]),
    )
    .filter((x): x is string => typeof x === "string");
  if (effIds.length === 0) {
    return NextResponse.json({ rows: [], hasMore: false });
  }

  // Intersect any client-provided narrowing with the effective set.
  const requested = asStringArray(body.frameworkIds);
  const scope =
    requested.length > 0
      ? requested.filter((id) => effIds.includes(id))
      : effIds;
  if (scope.length === 0) {
    return NextResponse.json({ rows: [], hasMore: false });
  }

  const stage = asTrimmed(body.stage);
  const subject = asTrimmed(body.subject);
  const strand = asTrimmed(body.strand);
  const q = asTrimmed(body.q);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(body.limit) ? Number(body.limit) : DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number.isFinite(body.offset) ? Number(body.offset) : 0);

  let query = client
    .from("standards")
    .select("id, framework_id, code, description, band_label, standards_frameworks(short_code)")
    .in("framework_id", scope);

  // band_label = "Stage · Subject · Strand" (Strand optional) — segment filters,
  // anchored to a whole segment so e.g. a Subject value can't match text sitting
  // in the Strand position. Stage is the first segment; Strand is the last; Subject
  // is the middle, bounded by " · " on the left and by either " · " (a Strand
  // follows) OR end-of-string (no Strand) on the right — hence the two-pattern OR.
  if (stage) query = query.ilike("band_label", `${escapeLike(stage)} · %`);
  if (subject) {
    const s = sanitizeOrTerm(subject);
    if (s)
      query = query.or(
        `band_label.ilike.* · ${s} · *,band_label.ilike.* · ${s}`,
      );
  }
  if (strand) query = query.ilike("band_label", `% · ${escapeLike(strand)}`);

  if (q) {
    const term = sanitizeOrTerm(q);
    if (term) query = query.or(`code.ilike.*${term}*,description.ilike.*${term}*`);
  }

  // Stable order + offset paging with limit+1 to detect "has more".
  query = query
    .order("framework_id", { ascending: true })
    .order("code", { ascending: true })
    .range(offset, offset + limit); // inclusive → limit+1 rows

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }

  type Row = {
    id: string;
    framework_id: string;
    code: string;
    description: string | null;
    band_label: string | null;
    standards_frameworks: { short_code: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const hasMore = rows.length > limit;
  const hits: StandardHit[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    frameworkId: r.framework_id,
    shortCode: r.standards_frameworks?.short_code ?? null,
    code: r.code,
    description: r.description,
    bandLabel: r.band_label,
  }));

  return NextResponse.json({ rows: hits, hasMore });
}
