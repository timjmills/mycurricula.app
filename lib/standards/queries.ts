// lib/standards/queries.ts — the standards/framework repository seam.
//
// CLAUDE.md §3 convention: typed READ helpers for the standards UX live here.
// SERVER-ONLY (imports lib/supabase/server → next/headers cookies): call from
// Server Components / Route Handlers / Server Actions only. Every read runs under
// the caller's session, so Row-Level Security is the gate — a teacher reads the
// catalog (provenance='catalog') plus their own school's uploaded frameworks, and
// only their own school_frameworks / teacher_frameworks rows. Never service-role.
//
// The framework CATALOG is small (176 rows) so we load it whole and let the client
// group/filter/search. Only the 1.11M-row `standards` table needs a server search
// (app/api/standards/search/route.ts).

import { createClient } from "@/lib/supabase/server";
import { makeUnwrap } from "@/lib/supabase/helpers";

const unwrap = makeUnwrap("Standards repository");

/** A catalog framework, trimmed to what the browser + settings need. */
export interface FrameworkSummary {
  id: string;
  name: string;
  shortCode: string;
  region: string | null;
  /** Catalog taxonomy bucket (national_curriculum, subject_framework, …). */
  frameworkKind: string | null;
  isFeatured: boolean;
  jurisdiction: string | null;
  gradeRange: string | null;
  subjectScope: string[];
  hasItemCodes: boolean;
  description: string | null;
}

interface FrameworkRow {
  id: string;
  name: string;
  short_code: string;
  region: string | null;
  framework_kind: string | null;
  is_featured: boolean;
  jurisdiction: string | null;
  grade_range: string | null;
  subject_scope: string[] | null;
  has_item_codes: boolean | null;
  description: string | null;
}

const FRAMEWORK_COLS =
  "id, name, short_code, region, framework_kind, is_featured, jurisdiction, grade_range, subject_scope, has_item_codes, description";

function mapFramework(r: FrameworkRow): FrameworkSummary {
  return {
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    region: r.region,
    frameworkKind: r.framework_kind,
    isFeatured: r.is_featured === true,
    jurisdiction: r.jurisdiction,
    gradeRange: r.grade_range,
    subjectScope: Array.isArray(r.subject_scope) ? r.subject_scope : [],
    hasItemCodes: r.has_item_codes === true,
    description: r.description,
  };
}

/** Every active framework the caller may see (catalog + own school's uploads).
 *  Returned flat, featured-first then region then name — the client groups it. */
export async function listFrameworkCatalog(): Promise<FrameworkSummary[]> {
  const client = await createClient();
  const res = await client
    .from("standards_frameworks")
    .select(FRAMEWORK_COLS)
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("region", { ascending: true })
    .order("name", { ascending: true });
  const rows = unwrap(res, "list framework catalog") as FrameworkRow[];
  return rows.map(mapFramework);
}

/** The caller's EFFECTIVE framework ids (school default ± personal overrides). */
export async function getEffectiveFrameworkIds(): Promise<string[]> {
  const client = await createClient();
  const { data, error } = await client.rpc("teacher_effective_framework_ids");
  if (error || !data) return [];
  return (data as unknown[])
    .map((el) =>
      typeof el === "string"
        ? el
        : ((el as Record<string, unknown>)?.teacher_effective_framework_ids ??
            Object.values(el as object)[0]),
    )
    .filter((x): x is string => typeof x === "string");
}

/** Framework ids the school admin has set as the school default. RLS scopes to
 *  the caller's own school. */
export async function getSchoolFrameworkDefaults(): Promise<string[]> {
  const client = await createClient();
  const res = await client
    .from("school_frameworks")
    .select("framework_id, display_order")
    .order("display_order", { ascending: true });
  if (res.error) return [];
  return ((res.data ?? []) as { framework_id: string }[]).map(
    (r) => r.framework_id,
  );
}

/** The caller's personal overrides on top of the school default. */
export async function getTeacherFrameworkOverrides(): Promise<
  { frameworkId: string; enabled: boolean }[]
> {
  const client = await createClient();
  const res = await client
    .from("teacher_frameworks")
    .select("framework_id, enabled");
  if (res.error) return [];
  return ((res.data ?? []) as { framework_id: string; enabled: boolean }[]).map(
    (r) => ({ frameworkId: r.framework_id, enabled: r.enabled === true }),
  );
}

/** Who's asking — teacher id, school id, and whether they administer the school.
 *  Mirrors getCallerInfo in app/settings/team/actions.ts; used to gate the
 *  team-scoped school-default section. */
export interface StandardsCaller {
  teacherId: string;
  schoolId: string | null;
  isSchoolAdmin: boolean;
}

export async function getStandardsCaller(): Promise<StandardsCaller | null> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const teacherRes = await client
    .from("teachers")
    .select("school_id")
    .eq("id", user.id)
    .maybeSingle();
  const schoolId = (teacherRes.data?.school_id as string | undefined) ?? null;
  const adminRes = await client
    .from("school_admins")
    .select("teacher_id")
    .eq("teacher_id", user.id);
  const isSchoolAdmin =
    Array.isArray(adminRes.data) && adminRes.data.length > 0;
  return { teacherId: user.id, schoolId, isSchoolAdmin };
}
