// scripts/probe-f3-predicate.mjs — can the id-list chunking be replaced by a
// direct predicate, and does it return the same answer?
//
// Three hydrate reads chunk a 1254-id `.in(...)` list into 150-id batches.
// Chunking exists for URL LENGTH, not correctness (see `chunkedIn`). If the same
// rows can be selected by a column the server already knows, the id list — and
// therefore the chunking — is avoidable entirely.
//
// Schema, read from the live PostgREST OpenAPI:
//   personal_core_lesson_event_copies … HAS grade_level_id  → predicate possible
//   lesson_sections                   … HAS grade_level_id  → predicate possible
//   completion_status                 … has NO grade column → teacher-only
//
// EQUALITY IS THE POINT, NOT SPEED. A predicate that returns a different row set
// is not an optimisation, it is the silent-truncation bug this repo has already
// shipped. So each arm is compared on the keys the consuming code actually reads
// (`copyByMaster.get(master.id)` / `complByMaster.get(master.id)` /
// `sections[lesson.id]`, supabase-source.ts) RESTRICTED TO THE LOADED MASTER SET
// — a superset outside that set is inert by construction and is reported
// separately rather than counted as a difference.
//
// READ-ONLY: every request is a GET.
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
const URL_BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
const IN_CHUNK_SIZE = 150;
const RUNS = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 3);

const get = async (path) => {
  const res = await fetch(`${URL_BASE}/${path}`, { headers: H });
  const text = await res.text();
  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {}
  return { rows: Array.isArray(rows) ? rows : [], bytes: Buffer.byteLength(text), status: res.status };
};
const chunk = (xs, n) => {
  const out = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
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
/** Cursor-paged read, exactly as pagedSelect does it. */
async function paged(build, cursorCol) {
  const rows = [];
  let after = null;
  let trips = 0;
  for (;;) {
    trips++;
    const r = await get(build(after));
    rows.push(...r.rows);
    if (r.rows.length < 1000 || r.status >= 400) break;
    after = r.rows[r.rows.length - 1][cursorCol];
    if (trips > 20) break;
  }
  return { rows, trips };
}

const teacher = (await get(`teachers?select=id,default_grade_level_id&email=eq.${encodeURIComponent(env.CLAUDE_USER_EMAIL)}`)).rows[0];
const gradeId = teacher.default_grade_level_id;

// The loaded master set — the only ids whose rows the consuming code ever reads.
const master = await paged(
  (after) =>
    `master_core_lesson_events?select=id&grade_level_id=eq.${gradeId}&deleted_at=is.null${after ? `&id=gt.${after}` : ""}&order=id.asc&limit=1000`,
  "id",
);
const masterIds = master.rows.map((r) => r.id);
const loaded = new Set(masterIds);
console.log(`grade=${gradeId}  loaded masters=${masterIds.length} (${master.trips} paged trips)\n`);

const CASES = [
  {
    name: "personal copies",
    key: (r) => r.master_core_lesson_event_id,
    chunked: () =>
      pool(chunk(masterIds, IN_CHUNK_SIZE), 6, (ids) =>
        get(
          `personal_core_lesson_event_copies?select=*&teacher_id=eq.${teacher.id}&master_core_lesson_event_id=in.(${ids.join(",")})&order=id.asc&limit=1000`,
        ),
      ).then((rs) => ({ rows: rs.flatMap((r) => r.rows), trips: rs.length })),
    predicate: () =>
      paged(
        (after) =>
          `personal_core_lesson_event_copies?select=*&teacher_id=eq.${teacher.id}&grade_level_id=eq.${gradeId}${after ? `&id=gt.${after}` : ""}&order=id.asc&limit=1000`,
        "id",
      ),
  },
  {
    name: "completion status",
    key: (r) => r.core_lesson_event_id,
    chunked: () =>
      pool(chunk(masterIds, IN_CHUNK_SIZE), 6, (ids) =>
        get(
          `completion_status?select=*&teacher_id=eq.${teacher.id}&core_lesson_event_id=in.(${ids.join(",")})&order=core_lesson_event_id.asc&limit=1000`,
        ),
      ).then((rs) => ({ rows: rs.flatMap((r) => r.rows), trips: rs.length })),
    // No grade column exists, so the only predicate available is the teacher —
    // which selects their completions across EVERY grade and school year.
    predicate: () =>
      paged(
        (after) =>
          `completion_status?select=*&teacher_id=eq.${teacher.id}${after ? `&core_lesson_event_id=gt.${after}` : ""}&order=core_lesson_event_id.asc&limit=1000`,
        "core_lesson_event_id",
      ),
  },
  {
    name: "lesson sections",
    key: (r) => r.owner_lesson_id,
    chunked: () =>
      pool(chunk(masterIds, IN_CHUNK_SIZE), 6, (ids) =>
        get(
          `lesson_sections?select=*&owner_lesson_id=in.(${ids.join(",")})&order=id.asc&limit=1000`,
        ),
      ).then((rs) => ({ rows: rs.flatMap((r) => r.rows), trips: rs.length })),
    predicate: () =>
      paged(
        (after) =>
          `lesson_sections?select=*&grade_level_id=eq.${gradeId}${after ? `&id=gt.${after}` : ""}&order=id.asc&limit=1000`,
        "id",
      ),
  },
];

const timings = [];
for (let run = 1; run <= RUNS; run++) {
  console.log(`── run ${run}/${RUNS} ────────────────────────────────────────`);
  const rec = {};
  for (const c of CASES) {
    const t1 = performance.now();
    const a = await c.chunked();
    const chunkedMs = Math.round(performance.now() - t1);
    const t2 = performance.now();
    const b = await c.predicate();
    const predMs = Math.round(performance.now() - t2);

    // Compare only what the consuming Map lookups can ever see.
    const inScope = (rows) => rows.filter((r) => loaded.has(c.key(r)));
    const setA = new Set(inScope(a.rows).map((r) => r.id ?? c.key(r)));
    const setB = new Set(inScope(b.rows).map((r) => r.id ?? c.key(r)));
    const missing = [...setA].filter((x) => !setB.has(x));
    const extraOutOfScope = b.rows.length - inScope(b.rows).length;

    rec[c.name] = { chunkedMs, predMs };
    console.log(
      `  ${c.name.padEnd(18)} chunked ${String(a.trips).padStart(2)} trips ${String(chunkedMs).padStart(5)}ms (${inScope(a.rows).length} in-scope rows)` +
        `  →  predicate ${String(b.trips).padStart(2)} trips ${String(predMs).padStart(5)}ms (${inScope(b.rows).length} in-scope, ${extraOutOfScope} out-of-scope)` +
        `  ${missing.length === 0 ? "SAME ROWS ✓" : `⚠ ${missing.length} ROWS LOST`}`,
    );
  }
  timings.push(rec);
  console.log("");
}

console.log("── medians ──────────────────────────────────────────────────────");
const med = (v) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)];
let totC = 0;
let totP = 0;
for (const c of CASES) {
  const ch = med(timings.map((t) => t[c.name].chunkedMs));
  const pr = med(timings.map((t) => t[c.name].predMs));
  totC += ch;
  totP += pr;
  console.log(`  ${c.name.padEnd(18)} chunked ${String(ch).padStart(5)}ms   predicate ${String(pr).padStart(5)}ms`);
}
console.log(`  ${"TOTAL".padEnd(18)} chunked ${String(totC).padStart(5)}ms   predicate ${String(totP).padStart(5)}ms`);
