// scripts/gen-planner-sql.mjs — emit ready-to-paste SQL for the mock units +
// standards + lessons, using the SAME deterministic slug->uuid the app's
// Supabase source expects. Output → scripts/_planner-data.sql (idempotent:
// on conflict do nothing). Run: node scripts/gen-planner-sql.mjs

import { writeFileSync } from "node:fs";
import { register } from "node:module";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, "..");

// ESM resolve hook: add `.ts` to extensionless relative fixture imports (the
// mock fixtures import each other as `./units`). Mirrors scripts/import-mock-planner.mjs.
const HOOK_SRC = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[a-z0-9]+$/i.test(specifier)) {
    const cand = specifier + ".ts";
    try {
      const u = new URL(cand, context.parentURL);
      if (existsSync(fileURLToPath(u))) return next(cand, context);
    } catch {}
  }
  return next(specifier, context);
}
`;
register(
  "data:text/javascript," + encodeURIComponent(HOOK_SRC),
  pathToFileURL(REPO_ROOT + "/"),
);

// Dynamic imports AFTER the hook is registered.
const { slugToUuid } = await import("../lib/planner/id-bridge.ts");
const { UNITS } = await import("../lib/mock/units.ts");
const { STANDARDS } = await import("../lib/mock/standards.ts");
const { LESSONS } = await import("../lib/mock/lessons.ts");

const GRADE = "00000000-0000-0000-0000-0000000000b5"; // seeded Grade 5
const WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const SUBJECT_ID = {
  math: "00000000-0000-0000-0000-0000000005d1",
  reading: "00000000-0000-0000-0000-0000000005d2",
  writing: "00000000-0000-0000-0000-0000000005d3",
  grammar: "00000000-0000-0000-0000-0000000005d4",
  spelling: "00000000-0000-0000-0000-0000000005d5",
  ufli: "00000000-0000-0000-0000-0000000005d6",
  explorers: "00000000-0000-0000-0000-0000000005d7",
  sel: "00000000-0000-0000-0000-0000000005d8",
};

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const jq = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

let out = `-- Planner data (units + standards + lessons). Idempotent.
-- Generated from lib/mock by scripts/gen-planner-sql.mjs.

`;

out += "-- Units\n";
for (const u of Object.values(UNITS)) {
  const id = slugToUuid("unit", u.id);
  const m =
    String(u.weeks).match(/(\d+)\D+(\d+)/) || String(u.weeks).match(/(\d+)/);
  const startW = m ? Number(m[1]) : 1;
  const endW = m && m[2] ? Number(m[2]) : startW;
  out += `insert into units (id, grade_level_id, subject_id, name, start_week, end_week)
  values (${q(id)}, ${q(GRADE)}, ${q(SUBJECT_ID[u.subject])}, ${q(u.name)}, ${startW}, ${endW})
  on conflict (id) do nothing;\n`;
}

const FW = slugToUuid("framework", "ccss");
out += `\n-- Standards framework (CCSS) + grade assignment\n`;
out += `insert into standards_frameworks (id, name, short_code, provenance)
  values (${q(FW)}, 'Common Core State Standards', 'CCSS', 'catalog')
  on conflict (id) do nothing;\n`;
out += `insert into grade_framework_assignments (id, grade_level_id, framework_id)
  values (${q(slugToUuid("framework", "gfa:ccss"))}, ${q(GRADE)}, ${q(FW)})
  on conflict (id) do nothing;\n`;

out += `\n-- Standards\n`;
for (const [code, desc] of Object.entries(STANDARDS)) {
  const id = slugToUuid("standard", code);
  out += `insert into standards (id, framework_id, grade_level_id, code, description)
  values (${q(id)}, ${q(FW)}, ${q(GRADE)}, ${q(code)}, ${q(desc)})
  on conflict (id) do nothing;\n`;
}

out += `\n-- Lessons (master core lesson events)\n`;
let n = 0;
for (const l of LESSONS) {
  if (l.isPersonal) continue;
  n++;
  const id = slugToUuid("lesson", l.id);
  const unitId = slugToUuid("unit", l.unit);
  const subjId = SUBJECT_ID[l.subject];
  const wd = WEEKDAY[l.day] ?? "sun";
  const objectives = l.objective ? [l.objective] : [];
  const stdUuids = (l.standards || []).map((c) => slugToUuid("standard", c));
  const stdArr =
    stdUuids.length > 0
      ? `array[${stdUuids.map((u) => q(u)).join(", ")}]::uuid[]`
      : `'{}'::uuid[]`;
  out += `insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values (${q(id)}, ${q(unitId)}, ${q(subjId)}, ${l.week}, ${q(wd)}::weekday, ${q(l.title)}, ${q(l.directions || "")}, ${jq(objectives)}, ${q(l.notes || "")}, ${jq(l.resources || [])}, ${stdArr}, ${l.day})
  on conflict (id) do nothing;\n`;
}

out += `\n-- Done: ${Object.values(UNITS).length} units, ${Object.keys(STANDARDS).length} standards, ${n} lessons.\n`;

writeFileSync(resolvePath(REPO_ROOT, "scripts/_planner-data.sql"), out);
console.log(
  `Wrote scripts/_planner-data.sql — ${Object.values(UNITS).length} units, ${Object.keys(STANDARDS).length} standards, ${n} lessons.`,
);
