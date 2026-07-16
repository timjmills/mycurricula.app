// app/api/standards/frameworks/route.ts
//
// GET /api/standards/frameworks — the framework CATALOG (176 rows, small enough to
// load whole) plus the caller's selection state, for the FrameworkBrowser (settings
// + onboarding) and the tagging picker's framework filter.
// Returns: { frameworks, effectiveIds, schoolDefaults, overrides, usingDefault }
//   frameworks      — every active framework the caller may see (RLS-scoped)
//   effectiveIds    — the caller's effective set (school default ± overrides)
//   schoolDefaults  — framework ids the school admin set as the default
//   overrides       — the caller's personal { frameworkId, enabled } overrides
//   usingDefault    — true when the caller has configured NOTHING (no school default,
//                     no enabled override) and effectiveIds therefore came from the
//                     featured-frameworks fallback. The picker uses this to show a
//                     "pick yours in Settings to narrow these" hint.
// All degrade to [] / false for an unauthenticated/onboarding caller (no session yet).

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
    // Configured = (school default ± my overrides). It's empty when the school set
    // no default AND I enabled no framework of my own (disabled overrides only
    // subtract, so they can't make an empty set non-empty). When configured is
    // empty but effectiveIds is not, the DB fell back to the featured set.
    const configuredEmpty =
      schoolDefaults.length === 0 && !overrides.some((o) => o.enabled);
    const usingDefault = configuredEmpty && effectiveIds.length > 0;
    return NextResponse.json({
      frameworks,
      effectiveIds,
      schoolDefaults,
      overrides,
      usingDefault,
    });
  } catch {
    // Catalog read is RLS-gated; on any failure return an empty, well-formed shape
    // so the browser renders its empty state rather than erroring.
    return NextResponse.json({
      frameworks: [],
      effectiveIds: [],
      schoolDefaults: [],
      overrides: [],
      usingDefault: false,
    });
  }
}
