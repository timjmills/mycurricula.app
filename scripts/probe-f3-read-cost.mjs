// scripts/probe-f3-read-cost.mjs — WHERE THE ~9 SECONDS ACTUALLY GO.
//
// The prod waterfall says the planner's ONE bundled server action takes 8.3–10.5 s
// wall-clock. That number is a total; it does not say whether the cost is network
// latency, row volume, payload bytes, or a serial chain inside the bundle. This
// script decomposes it by replaying each read the bundle performs, against the
// SAME production database, timing each and reporting rows + bytes.
//
// READ-ONLY. Every request below is a GET. Nothing here writes, and nothing here
// issues DDL — per the standing rule that agents never mutate the production DB.
//
// WHAT THIS IS NOT: it is not the server action's own timing. It runs from this
// machine, not from the Cloudflare Worker, so its LATENCY baseline differs (a
// Worker sits closer to the database). Read the ROW COUNTS, the BYTES, and the
// RELATIVE cost of each read as the signal; read the absolute milliseconds as an
// upper bound that includes this machine's round trip to Supabase.
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

async function get(path, { count = false, label = path } = {}) {
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/${path}`, {
    headers: count ? { ...H, Prefer: "count=exact" } : H,
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {}
  const range = res.headers.get("content-range");
  return {
    label,
    ms: Math.round(ms),
    status: res.status,
    rows: Array.isArray(rows) ? rows.length : 0,
    bytes: Buffer.byteLength(text),
    total: range ? range.split("/")[1] : null,
    data: rows,
  };
}

const show = (r) =>
  console.log(
    `  ${String(r.ms).padStart(6)}ms  ${String(r.rows).padStart(5)} rows  ` +
      `${String((r.bytes / 1024).toFixed(1)).padStart(9)} KB  ${r.label}` +
      (r.total ? `  (total=${r.total})` : "") +
      (r.status !== 200 && r.status !== 206 ? `  STATUS=${r.status}` : ""),
  );

console.log("── Resolving the beta teacher + grade ───────────────────────────");
const teacher = await get(
  `teachers?select=id,default_grade_level_id,school_id,active_school_id&email=eq.${encodeURIComponent(EMAIL)}`,
  { label: "teachers (by bypass email)" },
);
show(teacher);
const t = teacher.data[0];
if (!t) {
  console.error("Could not resolve the bypass teacher — aborting.");
  process.exit(1);
}
let gradeId = t.default_grade_level_id;
if (!gradeId) {
  const asg = await get(
    `teacher_grade_assignments?select=grade_level_id,created_at&teacher_id=eq.${t.id}&order=created_at.asc`,
    { label: "teacher_grade_assignments" },
  );
  show(asg);
  gradeId = asg.data[0]?.grade_level_id;
}
console.log(
  `  teacher=${t.id}  school=${t.school_id}  active_school=${t.active_school_id}  grade=${gradeId}\n`,
);

console.log("── The reads one hydrate performs, timed individually ────────────");
const reads = [];
const timeIt = async (path, label, opts) => {
  const r = await get(path, { label, ...opts });
  show(r);
  reads.push(r);
  return r;
};

// 1. grade resolution (serial — everything below waits on it)
await timeIt(`grade_levels?select=id,school_id&id=eq.${gradeId}`, "grade_levels (resolve)");

// 2. the four "parallel" primary reads
await timeIt(
  `subjects?select=*&grade_level_id=eq.${gradeId}&scope=eq.team&order=display_order.asc`,
  "subjects",
  { count: true },
);
await timeIt(`units?select=*&grade_level_id=eq.${gradeId}`, "units", { count: true });

const gfa = await timeIt(
  `grade_framework_assignments?select=framework_id&grade_level_id=eq.${gradeId}`,
  "grade_framework_assignments",
  { count: true },
);
const fw = gfa.data.map((r) => r.framework_id);
if (fw.length) {
  // standards is PAGED at 1000 — replay every page the read would take.
  let after = null;
  let page = 0;
  let standardsRows = 0;
  let standardsBytes = 0;
  let standardsMs = 0;
  for (;;) {
    page++;
    const cursor = after ? `&id=gt.${after}` : "";
    const r = await get(
      `standards?select=id,code,description&framework_id=in.(${fw.join(",")})${cursor}&order=id.asc&limit=1000`,
      { label: `standards page ${page}` },
    );
    show(r);
    reads.push(r);
    standardsRows += r.rows;
    standardsBytes += r.bytes;
    standardsMs += r.ms;
    if (r.rows < 1000) break;
    after = r.data[r.data.length - 1].id;
    if (page > 12) break;
  }
  console.log(
    `    → standards TOTAL: ${page} round trips, ${standardsRows} rows, ${(standardsBytes / 1024).toFixed(1)} KB, ${standardsMs}ms\n`,
  );
}

// 3. listLessons — FOUR paged table reads, not one
const lessonTables = [
  ["master_core_lesson_events", `unit_id=in.(SELECT)`],
  ["personal_authored_lessons", null],
  ["personal_core_lesson_event_copies", null],
  ["completion_status", null],
];
const units = await get(`units?select=id&grade_level_id=eq.${gradeId}`, { label: "unit ids" });
const unitIds = units.data.map((u) => u.id);
console.log(`  (${unitIds.length} units scope the lesson reads)`);

let lessonTotalMs = 0;
let lessonTotalRows = 0;
let lessonTotalBytes = 0;
let lessonTrips = 0;
for (const [table] of lessonTables) {
  let after = null;
  let page = 0;
  for (;;) {
    page++;
    lessonTrips++;
    const scope =
      table === "master_core_lesson_events"
        ? `unit_id=in.(${unitIds.join(",")})`
        : table === "completion_status"
          ? `teacher_id=eq.${t.id}`
          : `grade_level_id=eq.${gradeId}`;
    const cursor = after ? `&id=gt.${after}` : "";
    const r = await get(`${table}?select=*&${scope}${cursor}&order=id.asc&limit=1000`, {
      label: `${table} page ${page}`,
    });
    show(r);
    reads.push(r);
    lessonTotalMs += r.ms;
    lessonTotalRows += r.rows;
    lessonTotalBytes += r.bytes;
    if (r.rows < 1000 || r.status >= 400) break;
    after = r.data[r.data.length - 1].id;
    if (page > 12) break;
  }
}
console.log(
  `    → listLessons TOTAL: ${lessonTrips} round trips, ${lessonTotalRows} rows, ${(lessonTotalBytes / 1024).toFixed(1)} KB, ${lessonTotalMs}ms\n`,
);

// 4. the sections batch — keyed by EVERY lesson id
const master = await get(
  `master_core_lesson_events?select=id&unit_id=in.(${unitIds.join(",")})&limit=2000`,
  { label: "lesson ids for the sections batch" },
);
const lessonIds = master.data.map((r) => r.id);
console.log(`  (batching sections for ${lessonIds.length} lesson ids)`);
let secAfter = null;
let secPage = 0;
let secRows = 0;
let secBytes = 0;
let secMs = 0;
for (;;) {
  secPage++;
  const cursor = secAfter ? `&id=gt.${secAfter}` : "";
  const r = await get(
    `lesson_sections?select=*&lesson_id=in.(${lessonIds.slice(0, 1069).join(",")})${cursor}&order=id.asc&limit=1000`,
    { label: `lesson_sections page ${secPage}` },
  );
  show(r);
  reads.push(r);
  secRows += r.rows;
  secBytes += r.bytes;
  secMs += r.ms;
  if (r.rows < 1000 || r.status >= 400) break;
  secAfter = r.data[r.data.length - 1].id;
  if (secPage > 12) break;
}
console.log(
  `    → lesson_sections TOTAL: ${secPage} round trips, ${secRows} rows, ${(secBytes / 1024).toFixed(1)} KB, ${secMs}ms\n`,
);

const totalMs = reads.reduce((a, r) => a + r.ms, 0);
const totalBytes = reads.reduce((a, r) => a + r.bytes, 0);
console.log("── TOTALS ───────────────────────────────────────────────────────");
console.log(`  round trips : ${reads.length}`);
console.log(`  summed time : ${totalMs}ms  (serial upper bound)`);
console.log(`  payload     : ${(totalBytes / 1024 / 1024).toFixed(2)} MB uncompressed`);
console.log(
  `  slowest     : ${reads
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
    .map((r) => `${r.label}=${r.ms}ms`)
    .join(", ")}`,
);
