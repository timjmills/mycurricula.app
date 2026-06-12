// scripts/gen-standards-catalog-sql.mjs — generate the standards-catalog seed.
//
// Reads lib/standards/frameworks-catalog.json (174 frameworks) and the bundled
// taggable item sets (lib/standards/items.ts), and emits IDEMPOTENT seed SQL at
// supabase/seed-standards-catalog.sql using the SAME deterministic slug→uuid
// bridge as the app's Supabase source (lib/planner/id-bridge.ts):
//   framework id = slugToUuid("framework", short_code)
//   standard  id = slugToUuid("standard",  code)
//
// Because standard ids are derived from the CODE alone, the upsert naturally
// RE-HOMES the legacy mock-importer CCSS rows (framework slug "ccss") into the
// split CCSS-ELA / CCSS-MATH catalog frameworks — same row ids, new
// framework_id. The legacy "ccss" framework is then deactivated and its
// grade assignments replaced by the bundled defaults.
//
// CONFLICT-TARGET PRECONDITION: upserts target the deterministic ids, which
// assumes every existing catalog row was created under the same id regime
// (the mock importer + this seed). A hand-inserted catalog row that reuses a
// short_code or standard code under a DIFFERENT id would trip the secondary
// unique constraints (uq_catalog_framework_short_code / (framework_id, code))
// without arming `on conflict (id)` — the transaction then aborts safely with
// no partial writes; remove the stray row and rerun.
//
// Usage:
//   npx tsx scripts/gen-standards-catalog-sql.mjs
//   → review supabase/seed-standards-catalog.sql
//   → apply AFTER supabase/migrations/20260612200000_standards_catalog.sql
//     (supabase db push first, then run the seed in the SQL editor or psql).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { slugToUuid } = await import("../lib/planner/id-bridge.ts");
const { STANDARD_ITEMS } = await import("../lib/standards/items.ts");
const catalog = (
  await import("../lib/standards/frameworks-catalog.json", {
    with: { type: "json" },
  })
).default;

// ── SQL literal helpers ─────────────────────────────────────────────────────

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qOrNull = (s) => (s === undefined || s === null ? "null" : q(s));
const intOrNull = (n) => (typeof n === "number" ? String(n) : "null");
const boolSql = (b) => (b ? "true" : "false");
const textArray = (arr) =>
  arr && arr.length > 0
    ? `array[${arr.map(q).join(",")}]::text[]`
    : "'{}'::text[]";
const jsonb = (v) => `${q(JSON.stringify(v ?? []))}::jsonb`;

// ── Frameworks ──────────────────────────────────────────────────────────────

const frameworks = catalog.frameworks;
const fwId = (shortCode) => slugToUuid("framework", shortCode);
const knownCodes = new Set(frameworks.map((f) => f.short_code));

let out = `-- supabase/seed-standards-catalog.sql — GENERATED, do not hand-edit.
-- Regenerate: npx tsx scripts/gen-standards-catalog-sql.mjs
-- Source: lib/standards/frameworks-catalog.json (${frameworks.length} frameworks)
--         + lib/standards/items.ts bundled taggable sets.
-- Idempotent: frameworks/standards upsert on their deterministic ids
-- (lib/planner/id-bridge.ts uuidv5); grade assignments insert-if-absent.
-- APPLY AFTER migrations/20260612200000_standards_catalog.sql and BEFORE
-- enabling NEXT_PUBLIC_PLANNER_USE_SUPABASE for standards tagging.

begin;

`;

// Pass 1 — every framework WITHOUT parent linkage (parents may appear later
// in the file than their children; linking happens in pass 2).
out += `-- ── Frameworks (${frameworks.length}) ─────────────────────────────\n`;
for (const f of frameworks) {
  const jurisdiction = f.subdivision_code ?? f.country_code ?? f.region;
  out += `insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  (${q(fwId(f.short_code))}, ${q(f.name)}, ${q(f.short_code)}, ${qOrNull(jurisdiction)},
   ${qOrNull(f.catalog_notes ?? f.coding_scheme)}, 'catalog', 3,
   ${qOrNull(f.authority)}, ${qOrNull(f.country_code)}, ${qOrNull(f.subdivision_code)},
   ${qOrNull(f.region)}, ${q(f.framework_kind)}::framework_type,
   ${qOrNull(f.grade_range)}, ${textArray(f.subject_scope)}, ${boolSql(f.has_item_codes)},
   ${qOrNull(f.coding_scheme)}, ${qOrNull(f.current_version)}, ${intOrNull(f.version_year)},
   ${qOrNull(f.reform_status)}, ${qOrNull(f.licence)}, ${q(f.commercial_use)}::framework_commercial_use,
   ${qOrNull(f.licence_notes)}, ${textArray(f.machine_readable)}, ${jsonb(f.source_links)},
   ${qOrNull(f.catalog_notes)})
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
`;
}

// Pass 2 — parent linkage (state variants → AC9, AEFE → FR-PROG, …).
out += `\n-- ── Framework lineage ───────────────────────────────────────────\n`;
for (const f of frameworks) {
  if (!f.parent_short_code) continue;
  if (!knownCodes.has(f.parent_short_code)) {
    throw new Error(`${f.short_code}: dangling parent ${f.parent_short_code}`);
  }
  out += `update standards_frameworks set parent_framework_id = ${q(fwId(f.parent_short_code))} where id = ${q(fwId(f.short_code))};\n`;
}

// ── Bundled standards items ─────────────────────────────────────────────────
// Upserting on the deterministic id re-homes the legacy mock-importer CCSS
// rows (same codes ⇒ same ids) under the split CCSS-ELA / CCSS-MATH
// frameworks, preserving every existing lesson's standards uuid[].

const bandLabel = (grades) => {
  if (!grades || grades.length === 0) return null;
  if (grades.length === 1)
    return grades[0] === "K" ? "Kindergarten" : `Grade ${grades[0]}`;
  return `Grades ${grades[0]}–${grades[grades.length - 1]}`;
};
const itemKind = (fwShort) =>
  fwShort === "CCSS-SMP"
    ? "practice"
    : fwShort === "IB-ATL"
      ? "category"
      : "standard";

let itemCount = 0;
out += `\n-- ── Taggable standards items ────────────────────────────────────\n`;
for (const [short, items] of Object.entries(STANDARD_ITEMS)) {
  if (!knownCodes.has(short))
    throw new Error(`items for unknown framework ${short}`);
  out += `\n-- ${short} (${items.length})\n`;
  for (const it of items) {
    itemCount++;
    out += `insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values (${q(slugToUuid("standard", it.code))}, ${q(fwId(short))}, null, ${q(it.code)}, ${q(it.description)}, ${qOrNull(bandLabel(it.grades))}, ${q(itemKind(short))})
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;\n`;
  }
}

// ── Legacy mock-importer framework ("ccss") retirement ─────────────────────
const legacy = slugToUuid("framework", "ccss");
out += `
-- ── Legacy mock-importer CCSS framework: retire after re-home ───────────────
-- Its standards rows were re-homed above (same deterministic ids). Drop its
-- grade assignments (replaced by the defaults below) and deactivate the row.
delete from grade_framework_assignments where framework_id = ${q(legacy)};
update standards_frameworks set is_active = false where id = ${q(legacy)};
`;

// ── Default grade assignments ───────────────────────────────────────────────
const DEFAULT_FWS = ["CCSS-ELA", "CCSS-MATH", "CCSS-SMP", "NGSS", "IB-ATL"];
out += `
-- ── Default framework assignments for every existing grade ──────────────────
-- (matches the picker's default pins + IB-ATL; leads can unassign in Settings)
insert into grade_framework_assignments (id, grade_level_id, framework_id, display_order)
select gen_random_uuid(), gl.id, fw.fid, fw.ord
from grade_levels gl
cross join (values
  ${DEFAULT_FWS.map((s, i) => `(${q(fwId(s))}::uuid, ${i})`).join(",\n  ")}
) as fw(fid, ord)
on conflict (grade_level_id, framework_id) do nothing;

commit;

-- Done: ${frameworks.length} frameworks, ${itemCount} standards items,
-- ${DEFAULT_FWS.length} default assignments per grade.
`;

const dest = path.resolve(here, "../supabase/seed-standards-catalog.sql");
writeFileSync(dest, out);
console.log(
  `Wrote supabase/seed-standards-catalog.sql — ${frameworks.length} frameworks, ${itemCount} items, defaults: ${DEFAULT_FWS.join(", ")}`,
);
