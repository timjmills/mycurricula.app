// app/api/standards/frameworks/route.ts
//
// GET /api/standards/frameworks — the framework CATALOG (176 rows, small enough to
// load whole) plus the caller's selection state, for the FrameworkBrowser (settings
// + onboarding) and the tagging picker's framework filter.
// Returns: { frameworks, effectiveIds, schoolDefaults, overrides }
//   frameworks      — every active framework the caller may see (RLS-scoped)
//   effectiveIds    — the caller's effective set (school default ± overrides)
//   schoolDefaults  — framework ids the school admin set as the default
//   overrides       — the caller's personal { frameworkId, enabled } overrides
// All four degrade to [] for an unauthenticated/onboarding caller (no session yet).

import { NextResponse } from "next/server";
import {
  listFrameworkCatalog,
  getEffectiveFrameworkIds,
  getSchoolFrameworkDefaults,
  getTeacherFrameworkOverrides,
} from "@/lib/standards/queries";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const [frameworks, effectiveIds, schoolDefaults, overrides] =
      await Promise.all([
        listFrameworkCatalog(),
        getEffectiveFrameworkIds(),
        getSchoolFrameworkDefaults(),
        getTeacherFrameworkOverrides(),
      ]);
    return NextResponse.json({
      frameworks,
      effectiveIds,
      schoolDefaults,
      overrides,
    });
  } catch {
    // Catalog read is RLS-gated; on any failure return an empty, well-formed shape
    // so the browser renders its empty state rather than erroring.
    return NextResponse.json({
      frameworks: [],
      effectiveIds: [],
      schoolDefaults: [],
      overrides: [],
    });
  }
}
