#!/usr/bin/env node
// scripts/import-mock-planner.mjs — load the lib/mock planner fixtures into a
// real Supabase project so the DB isn't empty (Phase 1B importer, ultraplan §5).
//
// **What it does**
//   Idempotently upserts the mock curriculum graph into the live tables, in FK
//   order, using DETERMINISTIC uuid v5 primary keys derived from each fixture's
//   mock slug (via lib/planner/id-bridge.ts `slugToUuid`). Re-running is stable:
//   the same slug always maps to the same uuid, so a second run UPDATEs the same
//   rows instead of inserting duplicates. This is also exactly the id mapping the
//   Supabase planner source expects, so the imported rows resolve back to the
//   slug ids the UI uses.
//
//   Import order (FK-safe):
//     1. subjects                        (lib/mock/subjects.ts)
//     2. units                           (lib/mock/units.ts)
//     3. standards_frameworks            (one synthesized CCSS catalog framework)
//     4. standards                       (lib/mock/standards.ts, code → description)
//     5. grade_framework_assignments     (assign CCSS to the active grade)
//     6. master_core_lesson_events       (lib/mock/lessons.ts LESSONS[])
//
//   The seeded school + active Grade 5 + active school year already exist (from
//   supabase/seed.sql); this script resolves them by query rather than assuming
//   their fixed UUIDs, so it survives a re-seed with different ids. It also
//   provisions a dev teacher + grade assignment when CLAUDE_USER_EMAIL is set,
//   closing the Part-B RLS gap for local testing.
//
// **Privacy (CLAUDE.md §11.4 / ultraplan §4)**
//   Planner rows carry NO student names. The mock fixtures only reference first
//   names inside free-text `notes` (e.g. "Pull aside Aya…"); those are teacher
//   notes, not structured student fields. This importer NEVER writes any column
//   named for a student, and asserts the master-event payload has no student-*
//   key before upserting.
//
// **Safety**
//   Refuses to run without NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
//   or if the URL is the dummy placeholder. Service-role bypasses RLS — only run
//   against a dev/seed database, never prod without the runbook's explicit step
//   (docs/SUPABASE_SETUP.md §3 / ultraplan §9 step 4).
//
// **Usage**
//   node scripts/import-mock-planner.mjs
//
//   Node 22.18+ strips TypeScript types natively, so the .ts fixtures import
//   directly. A small in-process resolve hook (registered below) teaches Node's
//   ESM resolver to add the `.ts` extension to the fixtures' extensionless
//   relative imports (`from "./units"`). No tsx / ts-node dependency required.

import { readFileSync } from "node:fs";
import { register } from "node:module";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { slugToUuid } from "../lib/planner/id-bridge.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, "..");

// ── ESM resolve hook: add `.ts` to extensionless relative fixture imports ────
// The mock fixtures import each other as `./units` etc. Node's ESM resolver
// requires explicit extensions, so register a tiny hook that retries `<spec>.ts`
// when an extensionless relative specifier exists on disk as a .ts file.
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

// ── tiny .env.local parser (mirrors scripts/check-supabase.mjs) ──────────────
function loadEnvLocal() {
  const path = resolvePath(REPO_ROOT, ".env.local");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Don't clobber a value already exported in the real environment.
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ── placeholder detection (subset of check-supabase.mjs) ─────────────────────
const PLACEHOLDER_PATTERNS = [
  /your-?project/i,
  /your-?service/i,
  /example\.com/i,
  /^dummy/i,
  /changeme/i,
  /<.*>/,
  /xxxx/i,
];
const looksLikePlaceholder = (v) =>
  PLACEHOLDER_PATTERNS.some((re) => re.test(v));

const RUNBOOK =
  "See docs/SUPABASE_SETUP.md §2 (env) + §3 (schema/seed). Set the three Supabase " +
  "env vars in .env.local, apply migrations + seed, then re-run this importer.";

function die(msg) {
  console.error(`\nimport-mock-planner: ${msg}\n\n${RUNBOOK}\n`);
  process.exit(1);
}

// ── weekday enum mapping (mock day index 0–4 → schema `weekday`) ─────────────
// CLAUDE.md: 0 = Sunday … 4 = Thursday (the beta school's Sun–Thu week). The
// `weekday` enum is sun|mon|tue|wed|thu|fri|sat. Index past 4 still maps so the
// importer never assumes a 5-day week.
const WEEKDAY_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function weekdayForIndex(day) {
  const wd = WEEKDAY_BY_INDEX[day];
  if (!wd) throw new Error(`day index ${day} out of weekday range 0–6`);
  return wd;
}

// ── per-table counters ───────────────────────────────────────────────────────
function makeCounter() {
  return { inserted: 0, updated: 0 };
}

/** Upsert rows on the PK, counting how many already existed (→ updated) vs are
 *  new (→ inserted). We probe existing ids first so the printed counts are
 *  honest on a re-run; the upsert itself is the idempotent write. */
async function upsertCounted(admin, table, rows, counter) {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  const { data: existing, error: selErr } = await admin
    .from(table)
    .select("id")
    .in("id", ids);
  if (selErr) throw new Error(`select ${table}: ${selErr.message}`);
  const existingIds = new Set((existing ?? []).map((r) => r.id));

  const { error: upErr } = await admin
    .from(table)
    .upsert(rows, { onConflict: "id" });
  if (upErr) throw new Error(`upsert ${table}: ${upErr.message}`);

  for (const r of rows) {
    if (existingIds.has(r.id)) counter.updated += 1;
    else counter.inserted += 1;
  }
}

// ── privacy assertion (ultraplan §4 / CLAUDE.md §11.4) ───────────────────────
// No row written by this importer may carry a student-identifying column. The
// mock has none structurally; this guards against a future fixture/mapper drift.
const STUDENT_KEY = /student|pupil|learner/i;
function assertNoStudentFields(rows, table) {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (STUDENT_KEY.test(key)) {
        throw new Error(
          `privacy violation: ${table} row would write student field "${key}" — refusing.`,
        );
      }
    }
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    die(
      "missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. " +
        "Both are required (service-role is server-only — never NEXT_PUBLIC_).",
    );
  }
  if (looksLikePlaceholder(url) || looksLikePlaceholder(serviceKey)) {
    die(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY still hold dummy " +
        "placeholder values. Point them at a real Supabase project first.",
    );
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && !/localhost|127\.0\.0\.1/.test(u.hostname)) {
      die(`NEXT_PUBLIC_SUPABASE_URL must be https (got ${u.protocol}).`);
    }
  } catch {
    die(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`);
  }

  // Dynamic-import the TS fixtures (type-stripped + .ts-resolved by the hook).
  const fileUrl = (rel) => pathToFileURL(resolvePath(REPO_ROOT, rel)).href;
  const { SUBJECTS } = await import(fileUrl("lib/mock/subjects.ts"));
  const { UNITS } = await import(fileUrl("lib/mock/units.ts"));
  const { STANDARDS } = await import(fileUrl("lib/mock/standards.ts"));
  const { LESSONS } = await import(fileUrl("lib/mock/lessons.ts"));

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Resolve the seeded school / active grade / active school year ──────────
  const { data: school, error: schoolErr } = await admin
    .from("schools")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (schoolErr) die(`querying schools failed: ${schoolErr.message}`);
  if (!school)
    die("no school row found — apply supabase/seed.sql first (§3 runbook).");

  const { data: grade, error: gradeErr } = await admin
    .from("grade_levels")
    .select("id, name, is_active")
    .eq("school_id", school.id)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (gradeErr) die(`querying grade_levels failed: ${gradeErr.message}`);
  if (!grade)
    die(
      `no active grade_level for school "${school.name}" — apply the seed (§3).`,
    );

  const { data: schoolYear, error: syErr } = await admin
    .from("school_years")
    .select("id, label, is_active")
    .eq("school_id", school.id)
    .eq("is_active", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (syErr) die(`querying school_years failed: ${syErr.message}`);
  if (!schoolYear)
    die(`no active school_year for school "${school.name}" — apply the seed.`);

  const gradeId = grade.id;
  const schoolYearId = schoolYear.id;
  console.log(
    `Target: school "${school.name}" · grade "${grade.name}" · year "${schoolYear.label}"`,
  );

  // ── 1. subjects ────────────────────────────────────────────────────────────
  // The 8 locked team subjects already exist from the seed keyed by FIXED seed
  // uuids. We upsert them again under the DETERMINISTIC slug-derived uuid so the
  // planner source's slug→uuid bridge resolves them. (Seed rows are harmless
  // duplicates; the source reads via the bridge ids.) display_order matches the
  // fixture array order; `color` carries the stable palette slug.
  const cSubjects = makeCounter();
  const subjectRows = SUBJECTS.map((s, i) => ({
    id: slugToUuid("subject", s.id),
    grade_level_id: gradeId,
    name: s.name,
    color: s.id, // palette slug (math, reading, …) per seed.sql convention
    display_order: i,
    scope: "team",
    default_pacing: "synchronized",
  }));
  assertNoStudentFields(subjectRows, "subjects");
  await upsertCounted(admin, "subjects", subjectRows, cSubjects);

  // ── 2. units ─────────────────────────────────────────────────────────────
  // One active unit per subject (lib/mock/units.ts). start_week/end_week are
  // not in the mock's free-text "Wk 9–14" label in a structured form; we derive
  // a best-effort numeric span from the label, defaulting to the current week
  // window when unparseable. The label drives the UI today; the numeric span is
  // schema-required (not-null) infrastructure.
  const cUnits = makeCounter();
  const unitRows = Object.values(UNITS).map((u) => {
    const span = parseWeekSpan(u.weeks);
    return {
      id: slugToUuid("unit", u.id),
      grade_level_id: gradeId,
      subject_id: slugToUuid("subject", u.subject),
      school_year_id: schoolYearId,
      name: u.name,
      start_week: span.start,
      end_week: span.end,
    };
  });
  assertNoStudentFields(unitRows, "units");
  await upsertCounted(admin, "units", unitRows, cUnits);

  // ── 3. standards_frameworks (synthesized CCSS catalog framework) ───────────
  // The mock has no explicit framework — every standard code is CCSS-shaped
  // (5.NF.B.3, RL.5.3, …). Synthesize one catalog CCSS framework so the
  // standards have a parent FK and the grade has something to assign.
  const cFrameworks = makeCounter();
  const ccssFrameworkId = slugToUuid("framework", "ccss");
  const frameworkRows = [
    {
      id: ccssFrameworkId,
      name: "Common Core State Standards",
      short_code: "CCSS",
      jurisdiction: "United States",
      provenance: "catalog",
      max_depth: 4,
    },
  ];
  assertNoStudentFields(frameworkRows, "standards_frameworks");
  await upsertCounted(
    admin,
    "standards_frameworks",
    frameworkRows,
    cFrameworks,
  );

  // ── 4. standards (code → description) ──────────────────────────────────────
  const cStandards = makeCounter();
  const standardRows = Object.entries(STANDARDS).map(([code, description]) => ({
    id: slugToUuid("standard", code),
    framework_id: ccssFrameworkId,
    grade_level_id: gradeId,
    code,
    description,
    description_translations: { en: description },
  }));
  assertNoStudentFields(standardRows, "standards");
  await upsertCounted(admin, "standards", standardRows, cStandards);

  // ── 5. grade_framework_assignments (assign CCSS to the active grade) ───────
  const cGfa = makeCounter();
  const gfaRows = [
    {
      // Deterministic id from the (grade, framework) pair so re-runs are stable.
      id: slugToUuid("framework", `gfa:${gradeId}:ccss`),
      grade_level_id: gradeId,
      framework_id: ccssFrameworkId,
      display_order: 0,
    },
  ];
  assertNoStudentFields(gfaRows, "grade_framework_assignments");
  await upsertCounted(admin, "grade_framework_assignments", gfaRows, cGfa);

  // ── 6. master_core_lesson_events ──────────────────────────────────────────
  // Map the flat mock Lesson → master_core_lesson_events columns:
  //   day (0–4)        → day_of_week enum value
  //   week             → week_number
  //   objective        → learning_objectives jsonb array (single-element)
  //   directions/notes → directions / notes text
  //   resources        → resources jsonb (the lightweight inline shape)
  //   standards (codes)→ standards uuid[] via slugToUuid("standard", code)
  //
  // We import only non-personal, non-archived master lessons here. Personal
  // forks (isPersonal) belong in personal_core_lesson_event_copies, which is
  // per-teacher and out of scope for a seed importer. Tasks/comments are UI/
  // collaboration concerns not modelled on the master event row.
  //
  // `grade_level_id` is the denormalized tenant key added by migration
  // 20260604120000_planner_scale_hardening (ultraplan §1/§3 wave 1). Every
  // master event's unit is upserted above under this same `gradeId` (units
  // resolve to the active grade), so each lesson's grade is exactly `gradeId`.
  // Populating it on import keeps the hot-path RLS/index (`master_events_read`
  // filtering on the local column instead of a unit→grade join) correct from
  // the first seed, with no separate backfill needed for imported rows.
  const cLessons = makeCounter();
  const masterRows = LESSONS.filter((l) => !l.isPersonal && !l.archived).map(
    (l, i) => ({
      id: slugToUuid("lesson", l.id),
      unit_id: slugToUuid("unit", UNITS[l.subject].id),
      grade_level_id: gradeId,
      subject_id: slugToUuid("subject", l.subject),
      week_number: l.week,
      day_of_week: weekdayForIndex(l.day),
      title: l.title,
      directions: l.directions || null,
      learning_objectives: l.objective ? [l.objective] : [],
      notes: l.notes || null,
      resources: l.resources ?? [],
      standards: (l.standards ?? []).map((code) =>
        slugToUuid("standard", code),
      ),
      display_order_within_day: i,
    }),
  );
  assertNoStudentFields(masterRows, "master_core_lesson_events");
  await upsertCounted(admin, "master_core_lesson_events", masterRows, cLessons);

  // ── Optional: provision a dev teacher + grade assignment (Part-B gap) ──────
  // When CLAUDE_USER_EMAIL is set we resolve/ensure that auth user and upsert a
  // teachers + teacher_grade_assignments row so the seeded planner is readable
  // under RLS for local testing. Mirrors the auth-path provisioning helper.
  const cTeachers = makeCounter();
  const cAssignments = makeCounter();
  const devEmail = process.env.CLAUDE_USER_EMAIL;
  if (devEmail) {
    try {
      const teacherId = await resolveAuthUserId(admin, devEmail);
      if (teacherId) {
        const teacherRows = [
          {
            id: teacherId,
            school_id: school.id,
            email: devEmail,
            display_name: devEmail.split("@")[0] || "Teacher",
            default_view: "weekly",
            completion_privacy: "private",
            default_grade_level_id: gradeId,
          },
        ];
        assertNoStudentFields(teacherRows, "teachers");
        await upsertCounted(admin, "teachers", teacherRows, cTeachers);

        const assignmentRows = [
          {
            id: slugToUuid("framework", `tga:${teacherId}:${gradeId}`),
            teacher_id: teacherId,
            grade_level_id: gradeId,
            role: "teacher",
          },
        ];
        await upsertCounted(
          admin,
          "teacher_grade_assignments",
          assignmentRows,
          cAssignments,
        );
      } else {
        console.warn(
          `  (dev teacher) no auth user for ${devEmail}; skipped. ` +
            "Sign in once (or run the bypass) to create the auth user, then re-run.",
        );
      }
    } catch (err) {
      console.warn(
        `  (dev teacher) provisioning skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  const line = (label, c) =>
    console.log(
      `  ${label.padEnd(28)} ${String(c.inserted).padStart(4)} inserted  ${String(c.updated).padStart(4)} updated`,
    );
  console.log("\nImport complete:");
  line("subjects", cSubjects);
  line("units", cUnits);
  line("standards_frameworks", cFrameworks);
  line("standards", cStandards);
  line("grade_framework_assignments", cGfa);
  line("master_core_lesson_events", cLessons);
  if (devEmail) {
    line("teachers (dev)", cTeachers);
    line("teacher_grade_assignments", cAssignments);
  }
  console.log("");
}

/** Best-effort parse of a "Wk 9–14" / "Wk 12" style label into {start,end}.
 *  Falls back to a 1-week span at the current week when unparseable; the
 *  numeric span is schema-required but the human label drives the UI. */
function parseWeekSpan(label) {
  const nums = String(label ?? "")
    .replace(/[–—]/g, "-") // normalize en/em dashes to hyphen
    .match(/\d+/g);
  if (!nums || nums.length === 0) return { start: 1, end: 1 };
  const start = parseInt(nums[0], 10);
  const end = nums.length > 1 ? parseInt(nums[1], 10) : start;
  return { start, end: Math.max(start, end) };
}

/** Resolve an auth user id by email via the admin API. Returns null if absent. */
async function resolveAuthUserId(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  const found = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return found?.id ?? null;
}

main().catch((err) => {
  console.error(
    `\nimport-mock-planner: FAILED — ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
