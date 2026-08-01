// scripts/probe-f3-chunk-cost.mjs — the serial chunk loop, priced.
//
// `chunkedIn` (lib/planner/supabase-source.ts) slices a large id set into
// 150-id batches and runs them in a `for` loop with an `await` inside, so the
// batches execute STRICTLY ONE AFTER ANOTHER. Three hydrate reads go through it:
//
//   • personal_core_lesson_event_copies   keyed by every master lesson id
//   • completion_status                   keyed by every master lesson id
//   • lesson_sections (the sections batch) keyed by every lesson id
//
// For the beta grade that is ~26 sequential round trips inside the single
// "one round trip, not six" bundle call. This script replays them against the
// production database BOTH WAYS — serial exactly as the code does it, and with
// the chunks overlapped — and reports the difference.
//
// READ-ONLY: every request is a GET. Concurrency is bounded so the replay does
// not behave like a load test against a live teacher's database.
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
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = env.CLAUDE_USER_EMAIL;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const IN_CHUNK_SIZE = 150; // mirrors supabase-source.ts
const RUNS = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 3);
// The bounded-parallel arm's width. 6 is deliberately modest: the point is to
// show the shape of the win, not to find the maximum a pooler will accept.
const WIDTH = Number(process.argv.find((a) => a.startsWith("--width="))?.split("=")[1] ?? 6);

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

/** Run `fn` over `items` with at most `width` in flight. width=1 is the serial
 *  arm — the same code path, so the two arms differ only in overlap. */
async function pool(items, width, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── Resolve the grade + the id sets the chunked reads are keyed by ──────────
const teacherRes = await get(
  `teachers?select=id,default_grade_level_id&email=eq.${encodeURIComponent(EMAIL)}`,
);
const teacher = teacherRes.rows[0];
const gradeId = teacher.default_grade_level_id;
const unitRes = await get(`units?select=id&grade_level_id=eq.${gradeId}`);
const unitIds = unitRes.rows.map((u) => u.id);

// Every master lesson id in the grade — the key set for two of the three
// chunked reads. Paged the same way the real read is.
let masterIds = [];
let after = null;
for (;;) {
  const cursor = after ? `&id=gt.${after}` : "";
  const r = await get(
    `master_core_lesson_events?select=id&unit_id=in.(${unitIds.join(",")})${cursor}&order=id.asc&limit=1000`,
  );
  masterIds.push(...r.rows.map((x) => x.id));
  if (r.rows.length < 1000) break;
  after = r.rows[r.rows.length - 1].id;
}

console.log(`grade=${gradeId}  units=${unitIds.length}  master lessons=${masterIds.length}`);
console.log(
  `chunk size=${IN_CHUNK_SIZE} → ` +
    `copies=${chunk(masterIds, IN_CHUNK_SIZE).length} chunks, ` +
    `completion=${chunk(masterIds, IN_CHUNK_SIZE).length} chunks, ` +
    `sections=${chunk(masterIds, IN_CHUNK_SIZE).length} chunks\n`,
);

// Column names + the teacher scope mirror lib/planner/supabase-source.ts's
// `listLessons` / `getSectionsBatch` exactly, so the replay is the same query
// shape the hydrate issues — only the transport differs.
const READS = [
  {
    name: "personal_core_lesson_event_copies",
    ids: masterIds,
    url: (ids) =>
      `personal_core_lesson_event_copies?select=*&teacher_id=eq.${teacher.id}&master_core_lesson_event_id=in.(${ids.join(",")})&order=id.asc&limit=1000`,
  },
  {
    name: "completion_status",
    ids: masterIds,
    url: (ids) =>
      `completion_status?select=*&teacher_id=eq.${teacher.id}&core_lesson_event_id=in.(${ids.join(",")})&order=core_lesson_event_id.asc&limit=1000`,
  },
  {
    name: "lesson_sections (sections batch)",
    ids: masterIds,
    url: (ids) =>
      `lesson_sections?select=*&owner_lesson_id=in.(${ids.join(",")})&order=id.asc&limit=1000`,
  },
];

const results = [];
for (let run = 1; run <= RUNS; run++) {
  console.log(`── run ${run}/${RUNS} ─────────────────────────────────────────`);
  const rec = { run, serial: {}, parallel: {} };
  for (const read of READS) {
    const chunks = chunk(read.ids, IN_CHUNK_SIZE);
    for (const [arm, width] of [
      ["serial", 1],
      ["parallel", WIDTH],
    ]) {
      const t0 = performance.now();
      const out = await pool(chunks, width, (ids) => get(read.url(ids)));
      const ms = Math.round(performance.now() - t0);
      const rows = out.reduce((a, r) => a + r.rows.length, 0);
      const bad = out.filter((r) => r.status >= 400).length;
      rec[arm][read.name] = { ms, rows, chunks: chunks.length, bad };
      console.log(
        `  ${arm.padEnd(9)} ${String(ms).padStart(6)}ms  ${chunks.length} chunks  ${rows} rows` +
          (bad ? `  ⚠ ${bad} FAILED` : "") +
          `  ${read.name}`,
      );
    }
  }
  const serialTotal = Object.values(rec.serial).reduce((a, r) => a + r.ms, 0);
  const parallelTotal = Object.values(rec.parallel).reduce((a, r) => a + r.ms, 0);
  rec.serialTotal = serialTotal;
  rec.parallelTotal = parallelTotal;
  console.log(
    `  ── chunked reads total: serial=${serialTotal}ms  parallel(width=${WIDTH})=${parallelTotal}ms  ` +
      `saved=${serialTotal - parallelTotal}ms (${((1 - parallelTotal / serialTotal) * 100).toFixed(0)}%)\n`,
  );
  results.push(rec);
}

// Row equality across the two arms is the correctness half of the claim: a
// faster read that returns fewer rows is the truncation bug this repo has
// already shipped once.
console.log("── ROW-COUNT EQUALITY (serial vs parallel) ──────────────────────");
let mismatch = false;
for (const read of READS) {
  const s = [...new Set(results.map((r) => r.serial[read.name].rows))];
  const p = [...new Set(results.map((r) => r.parallel[read.name].rows))];
  const ok = s.length === 1 && p.length === 1 && s[0] === p[0];
  if (!ok) mismatch = true;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${read.name}: serial=${s.join("/")} parallel=${p.join("/")}`);
}
const st = results.map((r) => r.serialTotal).sort((a, b) => a - b);
const pt = results.map((r) => r.parallelTotal).sort((a, b) => a - b);
console.log(
  `\n  serial   min/med/max: ${st[0]} / ${st[Math.floor(st.length / 2)]} / ${st[st.length - 1]} ms`,
);
console.log(
  `  parallel min/med/max: ${pt[0]} / ${pt[Math.floor(pt.length / 2)]} / ${pt[pt.length - 1]} ms`,
);
if (mismatch) console.log("\n⚠ ROW COUNTS DIFFER — do not treat the speedup as free.");
