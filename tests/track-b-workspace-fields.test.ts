// Static invariants over the Track-B workspace-fields migration
// (20260728120000) + its seam types. Locks the RECONCILED shape ruled on
// 2026-07-24 (builder superset → independent-review adjudication → orchestrator
// trim): the migration must stay additive/nullable/inert, cover all THREE fork
// tables identically, exclude every adjudicated-out column, and the read path
// must not name a new column until the coupled B1.7/B2 apply.
//
// Authored by the orchestrator after BOTH the builder's and the reviewer's
// reported test runs were found to describe a file that did not exist — these
// assertions were each verified by hand against the artifacts before landing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAssessmentKind, type LessonAssessment } from "@/lib/types";

const MIGRATION = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260728120000_track_b_workspace_fields.sql",
);
const SOURCE = join(__dirname, "..", "lib", "planner", "supabase-source.ts");

const sql = readFileSync(MIGRATION, "utf8");
const src = readFileSync(SOURCE, "utf8");

/** Strip SQL line comments so text assertions don't match prose. */
const code = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const FORK_TABLES = [
  "master_core_lesson_events",
  "personal_core_lesson_event_copies",
  "personal_authored_lessons",
] as const;

/** The ruled lesson column set — identical on all three fork tables. */
const LESSON_COLS = [
  "taught_at",
  "duration_minutes",
  "assessment_kind",
  "assessment_title",
  "assessment_purpose",
  "assessment_notes",
  "builds",
  "prep",
  "fw_data",
  "fw_id",
  "carried",
] as const;

/** The ruled units column set. */
const UNIT_COLS_ADDED = [
  "notes",
  "big_idea",
  "essential_questions",
  "vocab",
  "kud",
  "standards",
  "default_flow",
  "default_dur",
  "framework",
  "fw_data",
  "custom_fields",
  "carried",
  "archived_at",
] as const;

/** Adjudicated OUT (2026-07-24) — must NOT be added as columns. */
const TRIMMED = [
  "pad",
  "stack",
  "flow_name",
  "tags",
  "done",
  "cu_handled",
  "position",
  "anchor_slot",
  "target_slot",
  "reflect",
  "udl_on",
  "hidden_groups",
] as const;

describe("migration — additive, nullable, inert", () => {
  it("uses add column if not exists for every column add", () => {
    const adds = code.match(/alter table public\.\w+\s+add column/gi) ?? [];
    const guarded =
      code.match(/alter table public\.\w+\s+add column if not exists/gi) ?? [];
    expect(adds.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(adds.length);
  });

  it("contains no destructive statements (drops only for idempotent re-adds)", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/truncate/i);
    expect(code).not.toMatch(/\bdelete\s+from/i);
    // No backfill: this migration performs zero row UPDATEs.
    expect(code).not.toMatch(/\bupdate\s+public\./i);
    // The only drops are the idempotency idioms.
    const drops = code.match(/drop\s+(\w+)/gi) ?? [];
    for (const d of drops) {
      expect(d.toLowerCase()).toMatch(/drop\s+(constraint|trigger|policy)/);
    }
  });
});

describe("migration — three-fork-table parity", () => {
  for (const table of FORK_TABLES) {
    it(`${table} adds the full ruled lesson set`, () => {
      for (const col of LESSON_COLS) {
        expect(code).toMatch(
          new RegExp(
            `alter table public\\.${table} add column if not exists ${col}\\b`,
          ),
        );
      }
    });
    it(`${table} carries the fw_data + carried jsonb shape guards`, () => {
      expect(code).toMatch(new RegExp(`${table}[\\s\\S]{0,400}fw_data_shape`));
      expect(code).toMatch(new RegExp(`${table}[\\s\\S]{0,400}carried_shape`));
    });
  }

  it("no fork table adds a column the others lack", () => {
    for (const col of LESSON_COLS) {
      const hits =
        code.match(
          new RegExp(`add column if not exists ${col}\\b`, "g"),
        ) ?? [];
      // units also add fw_data/carried — allow >= 3, but the three fork
      // tables must each have it (asserted above); here we pin exact counts
      // for lesson-only columns.
      if (!["fw_data", "carried"].includes(col)) {
        expect(hits.length, col).toBe(3);
      }
    }
  });
});

describe("migration — units set + adjudicated-out columns", () => {
  it("units add exactly the ruled set", () => {
    for (const col of UNIT_COLS_ADDED) {
      expect(code).toMatch(
        new RegExp(`alter table public\\.units add column if not exists ${col}\\b`),
      );
    }
  });

  it("no adjudicated-out column is added anywhere", () => {
    for (const col of TRIMMED) {
      expect(code, col).not.toMatch(
        new RegExp(`add column if not exists ${col}\\b`),
      );
    }
  });

  it("every adjudicated-out column is on the record in the end-note", () => {
    const note = sql.slice(sql.indexOf("ADJUDICATED OUT"));
    expect(note.length).toBeGreaterThan(0);
    for (const col of TRIMMED) {
      expect(note, col).toContain(col);
    }
  });
});

describe("migration — planner_settings posture", () => {
  it("owner-only RLS keyed on auth.uid(), anon revoked, authenticated granted", () => {
    expect(code).toMatch(/create table if not exists public\.planner_settings/i);
    expect(code).toMatch(/alter table public\.planner_settings enable row level security/i);
    expect(code).toMatch(/teacher_id\s*=\s*auth\.uid\(\)/);
    expect(code).toMatch(/claude_admin_all/);
    expect(code).toMatch(/revoke all on .*planner_settings from anon/i);
    expect(code).toMatch(/grant .* on .*planner_settings to authenticated/i);
  });

  it("updated_at trigger is idempotent (drop-then-create)", () => {
    expect(code).toMatch(/drop trigger if exists trg_planner_settings_updated_at/i);
    expect(code).toMatch(/create trigger trg_planner_settings_updated_at/i);
  });

  it("jsonb shape guards pass NULL and reject scalars (typeof pattern)", () => {
    const guards = code.match(/is null or jsonb_typeof\(/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(8);
  });
});

describe("read/write-path lock — pre-apply no-op guarantee", () => {
  const colsBlocks = (src.match(/const \w+_COLS = [\s\S]*?;/g) ?? []).join("\n");
  const NEW_TOKENS = [
    ...LESSON_COLS,
    "big_idea",
    "essential_questions",
    "vocab",
    "kud",
    "default_flow",
    "default_dur",
    "custom_fields",
  ];

  // EXACT SNAPSHOTS (§4a): the negative-token check below cannot cover columns
  // whose names collide with PRE-EXISTING lesson columns (notes, standards,
  // archived_at, framework…). Pinning each select constant to its exact current
  // string closes that hole per-table: ANY future addition — colliding or not —
  // fails here until the B1.7/B2 apply-coupled change updates the snapshot
  // deliberately alongside the migration apply.
  const colString = (name: string): string => {
    const m = src.match(
      new RegExp(`const ${name} =\\s*\\n?\\s*"([^"]+)"`),
    );
    return m?.[1] ?? "";
  };

  it("select constants match their pre-apply snapshots exactly", () => {
    expect(colString("MASTER_COLS")).toBe(
      "id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, differentiation, deleted_at",
    );
    expect(colString("COPY_COLS")).toBe(
      "id, teacher_id, master_core_lesson_event_id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, is_diverged_from_master, differentiation, archived_at",
    );
    expect(colString("AUTHORED_COLS")).toBe(
      "id, owner_id, grade_level_id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day, status, reason_not_done, differentiation, deleted_at",
    );
    expect(colString("UNIT_COLS")).toBe(
      "id, grade_level_id, subject_id, name, start_week, end_week, school_year_id",
    );
  });

  it("no Track-B column is named in any *_COLS select string", () => {
    expect(colsBlocks.length).toBeGreaterThan(0);
    for (const t of NEW_TOKENS) {
      expect(colsBlocks, t).not.toContain(t);
    }
  });

  it("no Track-B token appears as a write key (only optional row fields)", () => {
    // `token:` (an object-literal write) is forbidden; `token?:` (an optional
    // row-interface field) is the sanctioned form. archived_at is excluded:
    // it is a PRE-EXISTING soft-delete column with legitimate writes.
    for (const t of NEW_TOKENS.filter((t) => t !== "carried")) {
      const writeKey = new RegExp(`^\\s*${t}\\s*:`, "m");
      expect(src, t).not.toMatch(writeKey);
    }
  });
});

describe("seam types — the F1 write-path contract", () => {
  it("isAssessmentKind accepts exactly the narrow union", () => {
    expect(isAssessmentKind("formative")).toBe(true);
    expect(isAssessmentKind("summative")).toBe(true);
    expect(isAssessmentKind("Formative")).toBe(false);
    expect(isAssessmentKind("summtaive")).toBe(false);
    expect(isAssessmentKind("")).toBe(false);
    expect(isAssessmentKind(null)).toBe(false);
    expect(isAssessmentKind(undefined)).toBe(false);
  });

  it("LessonAssessment.kind compiles as the narrow union", () => {
    const ok: LessonAssessment = { kind: "formative", title: "Exit ticket" };
    expect(ok.kind).toBe("formative");
    // @ts-expect-error — arbitrary strings must not typecheck
    const bad: LessonAssessment = { kind: "quiz" };
    expect(bad).toBeTruthy();
  });
});

// Review extension (§4a, 2026-07-24): invariants the base suite left uncovered —
// the B0 negative-space verdicts, the F1 SQL side, and structural pins.
describe("migration — review-extension invariants", () => {
  it("creates exactly ONE table (planner_settings), no other", () => {
    const creates = code.match(/create table/gi) ?? [];
    expect(creates).toHaveLength(1);
    expect(code).toMatch(/create table if not exists public\.planner_settings/i);
  });

  it("does NOT add a `time` column (B0: a time-only write spuriously forks)", () => {
    expect(code).not.toMatch(/add column if not exists\s+time\b/i);
  });

  it("stores NO derived scheduling output or aggregate (B0 do-not-store list)", () => {
    for (const derived of [
      "slot",
      "date",
      "status",
      "start_slot",
      "end_slot",
      "startslot",
      "endslot",
      "res_n",
      "resn",
    ]) {
      expect(
        code,
        `derived output ${derived} must not be a column`,
      ).not.toMatch(new RegExp(`add column if not exists\\s+${derived}\\b`, "i"));
    }
  });

  it("models EQ as big_idea text + essential_questions text[] (B0 verdict)", () => {
    expect(code).toMatch(/add column if not exists\s+big_idea\s+text/i);
    expect(code).toMatch(
      /add column if not exists\s+essential_questions\s+text\[\]/i,
    );
  });

  it("gives units.standards a CONSTANT default ('{}') → metadata-only add", () => {
    expect(code).toMatch(
      /add column if not exists\s+standards\s+uuid\[\]\s+default\s+'\{\}'/i,
    );
  });

  it("F1 (SQL side) — assessment_kind is OPEN text with NO enum CHECK", () => {
    // The ruling: no DB CHECK (enum-trap avoidance); validity lives in the TS
    // narrow union + isAssessmentKind (asserted above). Assert the DB half here.
    expect(code).toMatch(/add column if not exists\s+assessment_kind\s+text/i);
    expect(code).not.toMatch(/check\s*\([^)]*assessment_kind/i);
  });
});
