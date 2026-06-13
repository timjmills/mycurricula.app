// lib/standards/catalog.ts — the worldwide standards-framework catalog.
//
// Source of truth: lib/standards/frameworks-catalog.json (174 frameworks — incl. all US states — from
// the 2026-06-12 deep-research pass — see docs/research-k12-standards-
// frameworks-2026-06-12.md). The JSON doubles as the Supabase seed for
// `standards_frameworks` (docs/standards-catalog-schema-proposal.sql), so the
// field names deliberately mirror the proposed snake_case columns.
//
// This module is the read-only query layer the StandardsPicker filters
// against: search by name/code/authority, narrow by app subject and grade,
// and group with pinned frameworks first (pin state lives in
// lib/standards/pinned.ts).

import catalogJson from "./frameworks-catalog.json";
import type { SubjectId } from "@/lib/types";
import { STANDARD_ITEMS, type StandardItem } from "./items";

// ── Catalog types (parity with standards_frameworks columns) ───────────────

/** Subject-coverage slugs used by the catalog (broader than the app's eight
 *  subjects — a framework can cover domains the app doesn't teach). */
export type CatalogSubjectSlug =
  | "ela"
  | "math"
  | "science"
  | "social_studies"
  | "arts"
  | "pe_health"
  | "languages"
  | "computing"
  | "religious_values"
  | "sel"
  | "vocational"
  | "cross_curricular"
  | "all_subjects";

export interface FrameworkSourceLink {
  label: string;
  url: string;
}

/** One catalog framework. Snake_case mirrors the proposed DB columns so the
 *  same JSON seeds Supabase without a mapping layer. */
export interface FrameworkCatalogEntry {
  short_code: string;
  name: string;
  authority?: string;
  country_code?: string | null;
  subdivision_code?: string;
  region:
    | "north_america"
    | "europe"
    | "mena"
    | "asia_pacific"
    | "africa"
    | "latin_america"
    | "global";
  framework_kind:
    | "standards"
    | "national_curriculum"
    | "international_programme"
    | "proprietary_curriculum"
    | "subject_framework"
    | "accreditation"
    | "assessment_framework";
  parent_short_code?: string;
  grade_range?: string;
  subject_scope: CatalogSubjectSlug[];
  has_item_codes?: boolean;
  coding_scheme?: string;
  current_version?: string;
  version_year?: number;
  reform_status?: string;
  licence?: string;
  commercial_use:
    | "open"
    | "open_attribution"
    | "non_commercial"
    | "permission_required"
    | "member_only"
    | "unverified";
  licence_notes?: string;
  machine_readable?: string[];
  source_links?: FrameworkSourceLink[];
  catalog_notes?: string;
}

const CATALOG = (catalogJson as { frameworks: FrameworkCatalogEntry[] })
  .frameworks;

/** Every framework, in seed order (regions grouped). */
export function allFrameworks(): readonly FrameworkCatalogEntry[] {
  return CATALOG;
}

const BY_CODE: ReadonlyMap<string, FrameworkCatalogEntry> = new Map(
  CATALOG.map((f) => [f.short_code, f]),
);

export function getFramework(
  shortCode: string,
): FrameworkCatalogEntry | undefined {
  return BY_CODE.get(shortCode);
}

// ── App-subject → catalog-slug bridge ──────────────────────────────────────
// The app's eight subjects collapse onto the catalog's broader slugs: the
// four literacy subjects + UFLI are all `ela`; Explorers spans science and
// social studies. Grade-scoping note: this mapping is subject-shape only and
// carries no grade assumption.

const SUBJECT_TO_SLUGS: Record<SubjectId, readonly CatalogSubjectSlug[]> = {
  math: ["math"],
  reading: ["ela"],
  writing: ["ela"],
  grammar: ["ela"],
  spelling: ["ela"],
  ufli: ["ela"],
  explorers: ["science", "social_studies"],
  sel: ["sel"],
};

/** Does this framework cover the given app subject? `all_subjects` and
 *  `cross_curricular` frameworks match every subject. */
export function frameworkCoversSubject(
  fw: FrameworkCatalogEntry,
  subject: SubjectId,
): boolean {
  if (
    fw.subject_scope.includes("all_subjects") ||
    fw.subject_scope.includes("cross_curricular")
  ) {
    return true;
  }
  // Defensive `?? []`: the 8 subjects are locked team-wide so the Record is
  // complete today, but a future SubjectId added without updating this map
  // must degrade to "matches nothing", never crash the picker mid-render.
  return (SUBJECT_TO_SLUGS[subject] ?? []).some((slug) =>
    fw.subject_scope.includes(slug),
  );
}

// ── Human labels ───────────────────────────────────────────────────────────

export const REGION_LABELS: Record<FrameworkCatalogEntry["region"], string> = {
  north_america: "North America",
  europe: "Europe",
  mena: "Middle East & North Africa",
  asia_pacific: "Asia-Pacific",
  africa: "Africa",
  latin_america: "Latin America",
  global: "International programmes",
};

/** Short ingestion-status line for the picker's framework meta row. */
export const COMMERCIAL_USE_LABELS: Record<
  FrameworkCatalogEntry["commercial_use"],
  string
> = {
  open: "Open licence",
  open_attribution: "Open (attribution)",
  non_commercial: "Non-commercial licence",
  permission_required: "Licence required",
  member_only: "Member schools only",
  unverified: "Licence unverified",
};

// ── Search + filter ────────────────────────────────────────────────────────

export interface FrameworkFilter {
  /** Free-text query — matches framework name/code/authority AND item
   *  codes/descriptions (a hit on either surfaces the framework). */
  query?: string;
  /** Narrow to frameworks covering this app subject. */
  subject?: SubjectId | null;
  /** Narrow to frameworks with taggable items for this grade ("K", "1"–"12").
   *  Frameworks without bundled items pass (the catalog can't know). */
  grade?: string | null;
}

function matchesQuery(fw: FrameworkCatalogEntry, q: string): boolean {
  const hay = `${fw.short_code} ${fw.name} ${fw.authority ?? ""}`.toLowerCase();
  if (hay.includes(q)) return true;
  const items = STANDARD_ITEMS[fw.short_code];
  return (
    items?.some(
      (it) =>
        it.code.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q),
    ) ?? false
  );
}

/** Items for a framework after subject/grade/query narrowing. Returns [] for
 *  frameworks with no bundled item set. */
export function filterItems(
  shortCode: string,
  filter: FrameworkFilter,
): StandardItem[] {
  const items = STANDARD_ITEMS[shortCode] ?? [];
  const q = filter.query?.trim().toLowerCase() ?? "";
  return items.filter((it) => {
    if (
      filter.grade &&
      it.grades.length > 0 &&
      !it.grades.includes(filter.grade)
    ) {
      return false;
    }
    if (filter.subject) {
      const slugs = SUBJECT_TO_SLUGS[filter.subject] ?? [];
      const subjectOk =
        it.subjects.length === 0 ||
        it.subjects.some(
          (s) =>
            s === "cross_curricular" ||
            s === "all_subjects" ||
            slugs.includes(s),
        );
      if (!subjectOk) return false;
    }
    if (q) {
      const hit =
        it.code.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

/** Frameworks passing the filter, pinned-first. Pinned frameworks keep the
 *  caller's pin order (most-recently-pinned semantics belong to the hook);
 *  the rest keep catalog (region-grouped) order. */
export function filterFrameworks(
  filter: FrameworkFilter,
  pinned: readonly string[],
): { pinned: FrameworkCatalogEntry[]; rest: FrameworkCatalogEntry[] } {
  const q = filter.query?.trim().toLowerCase() ?? "";
  const passes = (fw: FrameworkCatalogEntry): boolean => {
    if (filter.subject && !frameworkCoversSubject(fw, filter.subject)) {
      return false;
    }
    // The grade filter narrows ITEM lists only (see filterItems) — it never
    // hides a framework. Bundled item sets are sample-depth (the beta
    // grade's band), so "no grade-N items yet" must not contradict the
    // framework's own grade_range by vanishing it (review M-1).
    if (q && !matchesQuery(fw, q)) return false;
    return true;
  };
  const pinnedSet = new Set(pinned);
  const pinnedOut: FrameworkCatalogEntry[] = [];
  for (const code of pinned) {
    const fw = BY_CODE.get(code);
    if (fw && passes(fw)) pinnedOut.push(fw);
  }
  const rest = CATALOG.filter(
    (fw) => !pinnedSet.has(fw.short_code) && passes(fw),
  );
  return { pinned: pinnedOut, rest };
}
