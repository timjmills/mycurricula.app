// scripts/probe-f3-bundle-shape.mjs — the WHOLE hydrate read, both shapes,
// end to end against production.
//
// The component probes priced individual reads. This one replays the actual
// dependency graph `buildPlannerHydrateBundle` executes, so the number is a
// wall clock for the bundle rather than a sum of parts:
//
//   grade
//     → Promise.all [ listLessons, standards, subjects, units ]
//         listLessons = master (paged) → Promise.all [ copies, completion, authored ]
//     → sections batch
//
// OLD: copies + completion + sections each chunk the grade's 1254 master ids at
//      150/batch and run the batches in a `for` loop with an `await` inside.
// NEW: copies and completion select by predicate (no id list at all); sections
//      still chunks, but the batches overlap at width 6.
//
// READ-ONLY: every request is a GET. Concurrency is bounded.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const B = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
const RUNS = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 3);
const CHUNK = 150;

let trips = 0;
const get = async (p) => {
  trips++;
  const r = await fetch(`${B}/${p}`, { headers: H });
  const t = await r.text();
  let rows = [];
  try {
    rows = JSON.parse(t);
  } catch {}
  return { rows: Array.isArray(rows) ? rows : [], bytes: Buffer.byteLength(t) };
};
const chunk = (xs, n) => {
  const o = [];
  for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n));
  return o;
};
async function pool(items, width, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
async function paged(build, cursor) {
  const rows = [];
  let after = null;
  for (let i = 0; i < 25; i++) {
    const r = await get(build(after));
    rows.push(...r.rows);
    if (r.rows.length < 1000) break;
    after = r.rows[r.rows.length - 1][cursor];
  }
  return rows;
}

const teacher = (
  await get(`teachers?select=id,default_grade_level_id&email=eq.${encodeURIComponent(env.CLAUDE_USER_EMAIL)}`)
).rows[0];
const G = teacher.default_grade_level_id;
const T = teacher.id;

const readMaster = () =>
  paged(
    (a) =>
      `master_core_lesson_events?select=*&grade_level_id=eq.${G}&deleted_at=is.null${a ? `&id=gt.${a}` : ""}&order=id.asc&limit=1000`,
    "id",
  );
const readStandards = async () => {
  const fw = (await get(`grade_framework_assignments?select=framework_id&grade_level_id=eq.${G}`)).rows.map(
    (r) => r.framework_id,
  );
  if (!fw.length) return [];
  return paged(
    (a) =>
      `standards?select=id,code,description&framework_id=in.(${fw.join(",")})${a ? `&id=gt.${a}` : ""}&order=id.asc&limit=1000`,
    "id",
  );
};
const readSubjects = () => get(`subjects?select=*&grade_level_id=eq.${G}&scope=eq.team&order=display_order.asc`);
const readUnits = () => get(`units?select=*&grade_level_id=eq.${G}`);
const readAuthored = () =>
  paged((a) => `personal_authored_lessons?select=*&owner_id=eq.${T}${a ? `&id=gt.${a}` : ""}&order=id.asc&limit=1000`, "id");

/** OLD: serial chunk loop over the master-id list. */
const chunkedSerial = (ids, url) =>
  pool(chunk(ids, CHUNK), 1, (c) => get(url(c)));
/** NEW: the same chunks, overlapped. */
const chunkedParallel = (ids, url) => pool(chunk(ids, CHUNK), 6, (c) => get(url(c)));

const copiesChunkUrl = (c) =>
  `personal_core_lesson_event_copies?select=*&teacher_id=eq.${T}&master_core_lesson_event_id=in.(${c.join(",")})&order=id.asc&limit=1000`;
const complChunkUrl = (c) =>
  `completion_status?select=*&teacher_id=eq.${T}&core_lesson_event_id=in.(${c.join(",")})&order=core_lesson_event_id.asc&limit=1000`;
const sectionsChunkUrl = (c) =>
  `lesson_sections?select=*&owner_lesson_id=in.(${c.join(",")})&order=id.asc&limit=1000`;

async function shape(kind) {
  trips = 0;
  const t0 = performance.now();
  // grade resolve (serial gate on everything below)
  await get(`grade_levels?select=id,school_id&id=eq.${G}`);

  const listLessons = async () => {
    const master = await readMaster();
    const ids = master.map((m) => m.id);
    if (kind === "old") {
      await Promise.all([
        chunkedSerial(ids, copiesChunkUrl),
        chunkedSerial(ids, complChunkUrl),
        readAuthored(),
      ]);
    } else {
      await Promise.all([
        // COPIES KEEP THE ID LIST — the grade predicate is unsafe (nullable,
        // trigger-derived from the copy's own unit). Chunked, but overlapped.
        chunkedParallel(ids, copiesChunkUrl),
        paged(
          (a) =>
            `completion_status?select=*&teacher_id=eq.${T}${a ? `&core_lesson_event_id=gt.${a}` : ""}&order=core_lesson_event_id.asc&limit=1000`,
          "core_lesson_event_id",
        ),
        readAuthored(),
      ]);
    }
    return ids;
  };

  const [ids] = await Promise.all([listLessons(), readStandards(), readSubjects(), readUnits()]);
  // sections batch — still chunked in both shapes; only the overlap differs.
  if (kind === "old") await chunkedSerial(ids, sectionsChunkUrl);
  else await chunkedParallel(ids, sectionsChunkUrl);

  return { ms: Math.round(performance.now() - t0), trips, lessons: ids.length };
}

const res = { old: [], new: [] };
for (let r = 1; r <= RUNS; r++) {
  const o = await shape("old");
  const n = await shape("new");
  res.old.push(o);
  res.new.push(n);
  console.log(
    `run ${r}: OLD ${String(o.ms).padStart(5)}ms / ${o.trips} round trips   →   NEW ${String(n.ms).padStart(5)}ms / ${n.trips} round trips   (lessons ${o.lessons} vs ${n.lessons} ${o.lessons === n.lessons ? "✓" : "⚠ DIFFER"})`,
  );
}
const med = (v) => v.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(v.length / 2)];
console.log(
  `\nmedian:  OLD ${med(res.old)}ms (${res.old[0].trips} trips)   NEW ${med(res.new)}ms (${res.new[0].trips} trips)` +
    `   —  ${Math.round((1 - med(res.new) / med(res.old)) * 100)}% faster, ${res.old[0].trips - res.new[0].trips} fewer round trips`,
);
console.log(
  `lesson count identical across every run: ${new Set([...res.old, ...res.new].map((x) => x.lessons)).size === 1 ? "YES" : "NO — INVESTIGATE"}`,
);
