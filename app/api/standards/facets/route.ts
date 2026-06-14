// app/api/standards/facets/route.ts
//
// GET /api/standards/facets?frameworkIds=a,b — the distinct band_label segments
// (Stage / Subject / Strand) for the given frameworks, to populate the tagging
// picker's filter dropdowns. Scope is intersected with the caller's effective set.
// Returns: { stages: string[]; subjects: string[]; strands: string[] }
//
// band_label is "Stage · Subject · Strand" (Strand optional). PostgREST has no
// DISTINCT, so we select band_label for the scope (hard-capped) and dedupe the
// segments server-side — cheap because callers pass one (or a few) frameworks.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ROW_CAP = 12_000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ stages: [], subjects: [], strands: [] });
  }

  const { data: effData } = await client.rpc("teacher_effective_framework_ids");
  const effIds = (effData as unknown[] | null ?? [])
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
    return NextResponse.json({ stages: [], subjects: [], strands: [] });
  }

  const { data, error } = await client
    .from("standards")
    .select("band_label")
    .in("framework_id", scope)
    .not("band_label", "is", null)
    .limit(ROW_CAP);
  if (error) {
    return NextResponse.json({ stages: [], subjects: [], strands: [] });
  }

  const stages = new Set<string>();
  const subjects = new Set<string>();
  const strands = new Set<string>();
  for (const r of (data ?? []) as { band_label: string | null }[]) {
    const parts = (r.band_label ?? "").split(" · ");
    if (parts[0]?.trim()) stages.add(parts[0].trim());
    if (parts[1]?.trim()) subjects.add(parts[1].trim());
    if (parts[2]?.trim()) strands.add(parts[2].trim());
  }
  const sort = (s: Set<string>): string[] =>
    [...s].sort((a, b) => a.localeCompare(b));
  return NextResponse.json({
    stages: sort(stages),
    subjects: sort(subjects),
    strands: sort(strands),
  });
}
