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
import {
  isAssessmentKind,
  type Lesson,
  type LessonAssessment,
  type Unit,
  type UnitKud,
  type UnitVocabItem,
} from "@/lib/types";

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

// Review extension 2 (§4a follow-up, 2026-07-24): the nullable + advisory-lock
// negatives, full-field type construction (real B2 regression value), and the
// intended DB-harness coverage as it.todo.
describe("migration — nullable adds + no advisory lock", () => {
  it("adds NO NOT NULL column (a NOT NULL add would fail on a populated table)", () => {
    // Every Track-B column is nullable; `standards uuid[] default '{}'` carries a
    // CONSTANT default but is still nullable. (planner_settings.updated_at NOT NULL
    // DEFAULT now() is a CREATE TABLE column def on an empty table, not an add.)
    expect(code).not.toMatch(/add column if not exists[^;]*not null/i);
  });

  it("takes NO advisory lock (no backfill → no pg_advisory CALL)", () => {
    // Match the CALL form so it never trips on prose; `code` is comment-stripped too.
    expect(code).not.toMatch(/pg_advisory\w*\s*\(/i);
  });
});

describe("seam types — full Unit + Lesson literals exercise every Track-B field", () => {
  it("a full Unit constructs with all 13 editable workspace fields", () => {
    const vocab: UnitVocabItem[] = [
      { term: "numerator" },
      { term: "denominator", definition: "the number below the line" },
    ];
    const kud: UnitKud = {
      know: ["fraction vocabulary"],
      understand: ["fractions represent parts of a whole"],
      doGoal: ["add fractions with unlike denominators"],
    };
    const unit: Unit = {
      id: "u-m3",
      subject: "math",
      name: "Fractions",
      weeks: "Wk 9–14",
      shade: 2,
      notes: "Front-load vocabulary in week 9.",
      bigIdea: "Fractions describe equal parts of a whole.",
      essentialQuestions: ["How do we compare unlike fractions?"],
      vocab,
      kud,
      standardIds: ["00000000-0000-0000-0000-000000000001"],
      framework: "aero",
      frameworkData: { central_idea: "Part–whole relationships" },
      customFields: { pacing_notes: "extend if needed" },
      carried: {},
      defaultFlow: "Gradual release",
      defaultDuration: 45,
      archived: false,
    };
    expect(unit.vocab?.[1]?.definition).toBe("the number below the line");
    expect(unit.kud?.doGoal).toHaveLength(1);
    expect(unit.defaultFlow).toBe("Gradual release");
    expect(unit.defaultDuration).toBe(45);
    expect(unit.archived).toBe(false);
  });

  it("a full Lesson constructs with every Track-B rich field", () => {
    const lesson: Lesson = {
      id: "l-m3-01",
      subject: "math",
      unit: "u-m3",
      title: "Compare unlike fractions",
      objective: "I can compare fractions with unlike denominators.",
      preview: "Warm-up + guided practice.",
      directions: "Work through the number-line model.",
      notes: "Watch for denominator confusion.",
      resources: [],
      standards: ["4.NF.A.2"],
      week: 11,
      day: 2,
      isPersonal: false,
      pendingMaster: false,
      reasonNotDone: "",
      modified: false,
      moved: null,
      status: "not_done",
      commentCount: 0,
      unreadComments: 0,
      tasks: [],
      // ── Track-B fields — every one exercised ──
      taughtAt: "2026-07-24T09:00:00.000Z",
      assessment: {
        kind: "formative",
        title: "Exit ticket",
        purpose: "fluency check",
        notes: "3 problems",
      },
      frameworkData: { line_of_inquiry: "equivalence" },
      frameworkId: "pyp",
      durationMinutes: 45,
      builds: "Unit assessment — Fractions",
      prep: "Print number-line strips.",
      carried: { legacy_field: "kept across a framework switch" },
    };
    expect(lesson.taughtAt).toContain("2026-07-24");
    expect(lesson.assessment?.kind).toBe("formative");
    expect(isAssessmentKind(lesson.assessment?.kind)).toBe(true);
    expect(lesson.frameworkId).toBe("pyp");
    expect(lesson.durationMinutes).toBe(45);
    expect(lesson.builds).toContain("Fractions");
    expect(lesson.prep).toContain("number-line");
    expect(lesson.carried).toBeDefined();
  });
});

describe("planner_settings / units runtime behavior (needs a DB harness)", () => {
  it.todo("a teacher reads/writes ONLY their own planner_settings row (owner RLS)");
  it.todo("anon cannot select or write planner_settings (grant revoked)");
  it.todo("a scalar write to units.vocab / kud / fw_data is rejected by the shape CHECK");
  it.todo("a scalar write to a fork table's fw_data / carried is rejected");
  it.todo("a NULL write to every new Track-B column is accepted (all nullable)");
  it.todo("editing units.big_idea updates only that unit and forks no lesson");
  it.todo(
    "writing a personal copy's taught_at leaves the master row's taught_at untouched",
  );
});
