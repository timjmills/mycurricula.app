// unit-assessments.test.ts — the B3 unit-assessment data layer: the pure
// mappers (lib/planner/unit-assessments.ts), the in-memory seam round-trip
// (lib/planner/mock-source.ts), and static locks over the migration
// (supabase/migrations/20260729120000_unit_assessments.sql) + the Supabase
// seam's SELECT list.
//
// Shaped after tests/track-b-workspace-fields.test.ts (the migration/column
// snapshot technique) and tests/planner-unit-fields.test.ts (the mock seam
// round-trip). The Supabase implementation itself needs a live DB, so the
// runtime RLS behaviour is recorded as it.todo at the end rather than faked.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  sortUnitAssessments,
  unitAssessmentColumns,
  unitAssessmentFromRow,
  type UnitAssessmentRow,
} from "@/lib/planner/unit-assessments";
import { plannerMockSource } from "@/lib/planner/mock-source";
import type { UnitAssessment } from "@/lib/types";

// ALL THREE migrations, concatenated in timestamp order, so the locks below
// describe the schema that is actually DEPLOYED rather than an intermediate one.
// Pinning only the first file was a FALSE GUARD: 20260729140000 drops the
// `unit_assessments_write` FOR ALL policy that a lock still asserted, so this
// suite stayed green while production carried entirely different policies.
const MIGRATION_DIR = join(__dirname, "..", "supabase", "migrations");
const MIGRATION_FILES = [
  "20260729120000_unit_assessments.sql",
  "20260729130000_unit_assessments_anon_revoke.sql",
  "20260729140000_unit_assessments_policy_split.sql",
];
const SOURCE = join(__dirname, "..", "lib", "planner", "supabase-source.ts");

const sql = MIGRATION_FILES.map((f) =>
  readFileSync(join(MIGRATION_DIR, f), "utf8"),
).join("\n");
const src = readFileSync(SOURCE, "utf8");

/** Strip SQL line comments so text assertions never match prose. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

/** All three migrations. Use for EXISTENCE checks ("this statement was written
 *  at some point"). Counting occurrences across it is meaningless — it contains
 *  superseded statements as well as current ones. */
const code = stripComments(sql);

/** ONLY the newest migration, which defines the CURRENT policy + RPC shape. Use
 *  for anything that counts or asserts a final state, so a lock can never be
 *  satisfied by DDL that a later file has already replaced. */
const latest = stripComments(
  readFileSync(join(MIGRATION_DIR, MIGRATION_FILES[2]), "utf8"),
);

/** The table's column set, in the order the migration declares it. This array
 *  is the SINGLE source the snapshot locks below compare against — the
 *  migration's DDL on one side, the seam's SELECT list on the other. */
const COLUMNS = [
  "id",
  "unit_id",
  "kind",
  "title",
  "purpose",
  "notes",
  "display_order",
] as const;

// ───────────────────────────────────────────────────────────────────────────
// The pure mapper — row → domain
// ───────────────────────────────────────────────────────────────────────────

describe("unitAssessmentFromRow — row → domain", () => {
  const base: UnitAssessmentRow = {
    id: "ua-1",
    unit_id: "u-m3",
    kind: "formative",
    title: "Pre-test",
    purpose: "baseline",
    notes: "10 questions",
    display_order: 2,
  };

  it("maps every column onto its domain field", () => {
    expect(unitAssessmentFromRow(base)).toEqual({
      id: "ua-1",
      unitId: "u-m3",
      kind: "formative",
      title: "Pre-test",
      purpose: "baseline",
      notes: "10 questions",
      position: 2,
    });
  });

  it("accepts both kinds of the narrow union", () => {
    expect(unitAssessmentFromRow({ ...base, kind: "summative" }).kind).toBe(
      "summative",
    );
  });

  it("DROPS an invalid stored kind to undefined (the un-CHECKed column gate)", () => {
    // The column is deliberately open text, so a legacy import or a direct SQL
    // write can leave garbage there. It must not leak into the panel's
    // formative/summative filters as an unmatched value.
    for (const bad of ["quiz", "Formative", "SUMMATIVE", "", null, undefined]) {
      const mapped = unitAssessmentFromRow({
        ...base,
        kind: bad as string | null | undefined,
      });
      expect(mapped.kind, String(bad)).toBeUndefined();
      // The rest of the row still survives — a bad kind never takes the whole
      // assessment down with it.
      expect(mapped.title).toBe("Pre-test");
    }
  });

  it("maps NULL text columns to undefined (a cleared field reads as absent)", () => {
    const mapped = unitAssessmentFromRow({
      id: "ua-2",
      unit_id: "u-m3",
      kind: null,
      title: null,
      purpose: null,
      notes: null,
      display_order: 0,
    });
    expect(mapped).toEqual({
      id: "ua-2",
      unitId: "u-m3",
      kind: undefined,
      title: undefined,
      purpose: undefined,
      notes: undefined,
      position: 0,
    });
  });

  it("defaults a missing display_order to 0 rather than NaN/undefined", () => {
    expect(
      unitAssessmentFromRow({ id: "ua-3", unit_id: "u-m3" }).position,
    ).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The pure mapper — patch → columns
// ───────────────────────────────────────────────────────────────────────────

describe("unitAssessmentColumns — patch → columns", () => {
  it("emits only the keys PRESENT in the patch", () => {
    expect(unitAssessmentColumns({ title: "Final" })).toEqual({
      title: "Final",
    });
  });

  it("an EMPTY patch produces no columns (a no-op write)", () => {
    expect(unitAssessmentColumns({})).toEqual({});
  });

  it("a present-but-undefined key CLEARS to null (not skipped)", () => {
    // This is the whole reason the mapper uses `in patch` rather than
    // `!== undefined`: emptying a field in the editor sends the key with an
    // undefined value, and it must write NULL.
    expect(
      unitAssessmentColumns({
        title: undefined,
        purpose: undefined,
        notes: undefined,
      }),
    ).toEqual({ title: null, purpose: null, notes: null });
  });

  it("an ABSENT key is never written (an unrelated edit can't wipe a field)", () => {
    const cols = unitAssessmentColumns({ notes: "just notes" });
    expect("title" in cols).toBe(false);
    expect("purpose" in cols).toBe(false);
    expect("kind" in cols).toBe(false);
  });

  it("validates kind — a valid one persists, an invalid one writes NULL", () => {
    expect(unitAssessmentColumns({ kind: "formative" })).toEqual({
      kind: "formative",
    });
    expect(unitAssessmentColumns({ kind: "summative" })).toEqual({
      kind: "summative",
    });
    expect(
      unitAssessmentColumns({
        kind: "quiz" as UnitAssessment["kind"],
        title: "kept",
      }),
    ).toEqual({ kind: null, title: "kept" });
    expect(unitAssessmentColumns({ kind: undefined })).toEqual({ kind: null });
  });

  it("NEVER emits an identity or ordering column", () => {
    // id / unit_id are set once at create; display_order moves only through
    // reorderUnitAssessments. A patch must not be able to smuggle any of them in.
    const cols = unitAssessmentColumns({
      kind: "summative",
      title: "t",
      purpose: "p",
      notes: "n",
    } as never);
    expect(Object.keys(cols).sort()).toEqual([
      "kind",
      "notes",
      "purpose",
      "title",
    ]);
  });

  it("round-trips through fromRow (write then read is lossless)", () => {
    const written = unitAssessmentColumns({
      kind: "summative",
      title: "Final",
      purpose: "mastery",
      notes: "essay",
    });
    const back = unitAssessmentFromRow({
      id: "ua-9",
      unit_id: "u-m3",
      display_order: 1,
      ...written,
    });
    expect(back).toEqual({
      id: "ua-9",
      unitId: "u-m3",
      kind: "summative",
      title: "Final",
      purpose: "mastery",
      notes: "essay",
      position: 1,
    });
  });
});

describe("sortUnitAssessments", () => {
  const a = (id: string, position: number): UnitAssessment => ({
    id,
    unitId: "u-m3",
    position,
  });

  it("orders by position", () => {
    expect(
      sortUnitAssessments([a("c", 2), a("a", 0), a("b", 1)]).map((x) => x.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("breaks a position tie by id, so the order is TOTAL and stable", () => {
    expect(
      sortUnitAssessments([a("z", 0), a("m", 0), a("b", 0)]).map((x) => x.id),
    ).toEqual(["b", "m", "z"]);
  });

  it("is pure — the input array is not mutated", () => {
    const input = [a("c", 2), a("a", 0)];
    sortUnitAssessments(input);
    expect(input.map((x) => x.id)).toEqual(["c", "a"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The mock seam — a real backend within the session (the flag-OFF path)
// ───────────────────────────────────────────────────────────────────────────

const OWNER = "teacher-1";
// Distinct unit ids per test so the module-level mock store can't leak state
// between cases (the store is a singleton for the process, by design).
const U1 = "test-unit-crud";
const U2 = "test-unit-order";
const U3 = "test-unit-scope";
const U4 = "test-unit-clear";
const U5 = "test-unit-sparse";
const U6 = "test-unit-kindless";

describe("mock source — unit assessments round-trip", () => {
  it("starts empty, and every requested unit gets a key", async () => {
    const map = await plannerMockSource.listUnitAssessments([U1, "unknown"]);
    expect(map[U1]).toEqual([]);
    // "read, none" must be distinguishable from "not read" — so an unknown unit
    // is present with an empty array, not missing.
    expect(map).toHaveProperty("unknown");
    expect(map.unknown).toEqual([]);
  });

  it("an empty id list short-circuits to {}", async () => {
    expect(await plannerMockSource.listUnitAssessments([])).toEqual({});
  });

  it("creates, reads back, updates, and deletes", async () => {
    const created = await plannerMockSource.createUnitAssessment(
      U1,
      { kind: "formative", title: "Pre-test", purpose: "baseline" },
      OWNER,
    );
    expect(created.unitId).toBe(U1);
    expect(created.kind).toBe("formative");
    expect(created.position).toBe(0);
    expect(created.id).toBeTruthy();

    const listed = (await plannerMockSource.listUnitAssessments([U1]))[U1];
    expect(listed).toHaveLength(1);
    expect(listed?.[0]).toEqual(created);

    const updated = await plannerMockSource.updateUnitAssessment(
      created.id,
      { title: "Pre-test (revised)" },
      OWNER,
    );
    expect(updated.title).toBe("Pre-test (revised)");
    // An absent key is untouched — kind/purpose survive a title-only edit.
    expect(updated.kind).toBe("formative");
    expect(updated.purpose).toBe("baseline");
    expect(updated.position).toBe(0);

    await plannerMockSource.deleteUnitAssessment(created.id, OWNER);
    expect((await plannerMockSource.listUnitAssessments([U1]))[U1]).toEqual([]);
  });

  it("a present-but-undefined key clears the stored field", async () => {
    const created = await plannerMockSource.createUnitAssessment(
      U4,
      { kind: "summative", title: "Final", notes: "essay" },
      OWNER,
    );
    const cleared = await plannerMockSource.updateUnitAssessment(
      created.id,
      { notes: undefined },
      OWNER,
    );
    expect(cleared.notes).toBeUndefined();
    expect(cleared.title).toBe("Final");
    expect(cleared.kind).toBe("summative");
  });

  it("an invalid kind is dropped on write, the rest of the edit persists", async () => {
    const created = await plannerMockSource.createUnitAssessment(
      U4,
      { kind: "quiz" as UnitAssessment["kind"], title: "Odd one" },
      OWNER,
    );
    expect(created.kind).toBeUndefined();
    expect(created.title).toBe("Odd one");
  });

  it("creates append LAST and reorder rewrites the sequence", async () => {
    const a = await plannerMockSource.createUnitAssessment(
      U2,
      { title: "A" },
      OWNER,
    );
    const b = await plannerMockSource.createUnitAssessment(
      U2,
      { title: "B" },
      OWNER,
    );
    const c = await plannerMockSource.createUnitAssessment(
      U2,
      { title: "C" },
      OWNER,
    );
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);

    const reordered = await plannerMockSource.reorderUnitAssessments(
      U2,
      [c.id, a.id, b.id],
      OWNER,
    );
    expect(reordered.map((x) => x.title)).toEqual(["C", "A", "B"]);
    expect(reordered.map((x) => x.position)).toEqual([0, 1, 2]);

    // …and it persists to the next read.
    const after = (await plannerMockSource.listUnitAssessments([U2]))[U2];
    expect(after?.map((x) => x.title)).toEqual(["C", "A", "B"]);
  });

  it("ORDERING SURVIVES A DELETE — a new create still lands last", async () => {
    // The regression this pins: deriving the next position from the row COUNT
    // collides with a survivor after a middle delete (0,1,2 → delete 1 → count
    // is 2, which the row at 2 already holds), so the new row would NOT append.
    // MAX+1 keeps "append" true for any gap pattern.
    const a = await plannerMockSource.createUnitAssessment(
      U5,
      { title: "A" },
      OWNER,
    );
    const b = await plannerMockSource.createUnitAssessment(
      U5,
      { title: "B" },
      OWNER,
    );
    const c = await plannerMockSource.createUnitAssessment(
      U5,
      { title: "C" },
      OWNER,
    );
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);

    await plannerMockSource.deleteUnitAssessment(b.id, OWNER);

    const d = await plannerMockSource.createUnitAssessment(
      U5,
      { title: "D" },
      OWNER,
    );
    // Strictly greater than every survivor — no collision with C at position 2.
    expect(d.position).toBeGreaterThan(c.position);
    const listed = (await plannerMockSource.listUnitAssessments([U5]))[U5];
    expect(listed?.map((x) => x.title)).toEqual(["A", "C", "D"]);
  });

  it("positions stay SPARSE after a delete (documented, not compacted)", async () => {
    const positions = (await plannerMockSource.listUnitAssessments([U5]))[
      U5
    ]?.map((x) => x.position);
    // A, C, D — C keeps its original 2 and D is 3; nothing renumbered to close
    // the gap left by B. If a future tranche adds compaction, this test is the
    // deliberate conversation about it.
    expect(positions).toEqual([0, 2, 3]);
  });

  it("a reorder COMPACTS a sparse sequence back to dense 0…n-1", async () => {
    const before = (await plannerMockSource.listUnitAssessments([U5]))[U5] ?? [];
    const reordered = await plannerMockSource.reorderUnitAssessments(
      U5,
      before.map((x) => x.id),
      OWNER,
    );
    expect(reordered.map((x) => x.position)).toEqual([0, 1, 2]);
    // The visible order is unchanged — compaction is not a reshuffle.
    expect(reordered.map((x) => x.title)).toEqual(before.map((x) => x.title));
  });

  it("a delete removes EVERY field, not just the kind (no orphaned text)", async () => {
    // The prototype's bug: nulling `kind` left purpose/notes stranded, and they
    // resurfaced later. A row-based model must delete the whole row.
    const created = await plannerMockSource.createUnitAssessment(
      U6,
      {
        kind: "summative",
        title: "End of unit",
        purpose: "mastery",
        notes: "orphan bait",
      },
      OWNER,
    );
    await plannerMockSource.deleteUnitAssessment(created.id, OWNER);
    const remaining = (await plannerMockSource.listUnitAssessments([U6]))[U6];
    expect(remaining).toEqual([]);
    // No row survives carrying the text behind a nulled kind.
    expect(remaining?.some((x) => x.notes === "orphan bait")).toBe(false);
  });

  it("an assessment with NO kind is a legitimate, round-tripping row", async () => {
    // Absent kind is a real state — a teacher titles an assessment before
    // deciding formative vs summative. It must persist, re-read, and survive an
    // unrelated edit; it must never be defaulted or dropped.
    const created = await plannerMockSource.createUnitAssessment(
      U6,
      { title: "Undecided", purpose: "TBD" },
      OWNER,
    );
    expect(created.kind).toBeUndefined();
    expect(created.title).toBe("Undecided");

    const listed = (await plannerMockSource.listUnitAssessments([U6]))[U6];
    expect(listed).toHaveLength(1);
    expect(listed?.[0]?.kind).toBeUndefined();

    // An unrelated edit leaves it unclassified rather than coercing a default.
    const edited = await plannerMockSource.updateUnitAssessment(
      created.id,
      { notes: "still deciding" },
      OWNER,
    );
    expect(edited.kind).toBeUndefined();
    expect(edited.title).toBe("Undecided");

    // And it can be classified later, then UNclassified again.
    const classified = await plannerMockSource.updateUnitAssessment(
      created.id,
      { kind: "formative" },
      OWNER,
    );
    expect(classified.kind).toBe("formative");
    const uncleared = await plannerMockSource.updateUnitAssessment(
      created.id,
      { kind: undefined },
      OWNER,
    );
    expect(uncleared.kind).toBeUndefined();
    expect(uncleared.title).toBe("Undecided");
    await plannerMockSource.deleteUnitAssessment(created.id, OWNER);
  });

  it("reorder REJECTS ids belonging to another unit, leaving both units untouched", async () => {
    const mine = await plannerMockSource.createUnitAssessment(
      U3,
      { title: "mine" },
      OWNER,
    );
    const foreign = await plannerMockSource.createUnitAssessment(
      U4,
      { title: "foreign" },
      OWNER,
    );
    const foreignBefore = (await plannerMockSource.listUnitAssessments([U4]))[
      U4
    ]?.find((x) => x.id === foreign.id);

    // THROWS, matching `reorder_unit_assessments` (migration 20260729140000),
    // which raises on any id that is not an assessment of the target unit. The
    // mock previously ignored them — that let a stale or malformed client request
    // look like a clean success on the flag-OFF path while production rejected
    // it, which is the exact drift the mock exists to prevent.
    await expect(
      plannerMockSource.reorderUnitAssessments(
        U3,
        [foreign.id, mine.id],
        OWNER,
      ),
    ).rejects.toThrow(/not assessments of unit/);

    // Rejected means NOTHING moved — the foreign row keeps its position…
    const foreignAfter = (await plannerMockSource.listUnitAssessments([U4]))[
      U4
    ]?.find((x) => x.id === foreign.id);
    expect(foreignAfter?.position).toBe(foreignBefore?.position);
    // …and U3's list still contains only its own row.
    const scoped = (await plannerMockSource.listUnitAssessments([U3]))[U3];
    expect(scoped?.map((x) => x.id)).toEqual([mine.id]);
  });

  it("reorder REJECTS duplicate ids", async () => {
    // Duplicates make the RPC's join non-deterministic, so it raises rather than
    // picking arbitrarily. The mock mirrors that.
    const a = await plannerMockSource.createUnitAssessment(
      U3,
      { title: "dup-a" },
      OWNER,
    );
    await expect(
      plannerMockSource.reorderUnitAssessments(U3, [a.id, a.id], OWNER),
    ).rejects.toThrow(/duplicate ids/);
    await plannerMockSource.deleteUnitAssessment(a.id, OWNER);
  });

  it("throws on an unknown assessment id (update + delete are not silent)", async () => {
    await expect(
      plannerMockSource.updateUnitAssessment(
        "no-such-id",
        { title: "x" },
        OWNER,
      ),
    ).rejects.toThrow(/Unit assessment not found/);
    await expect(
      plannerMockSource.deleteUnitAssessment("no-such-id", OWNER),
    ).rejects.toThrow(/Unit assessment not found/);
  });

  it("a deleted assessment cannot be deleted twice (no false success)", async () => {
    const created = await plannerMockSource.createUnitAssessment(
      U1,
      { title: "transient" },
      OWNER,
    );
    await plannerMockSource.deleteUnitAssessment(created.id, OWNER);
    await expect(
      plannerMockSource.deleteUnitAssessment(created.id, OWNER),
    ).rejects.toThrow(/Unit assessment not found/);
  });

  it("returned rows are fresh objects — a caller mutation never leaks in", async () => {
    const created = await plannerMockSource.createUnitAssessment(
      U1,
      { title: "original" },
      OWNER,
    );
    created.title = "leaked";
    const reread = (await plannerMockSource.listUnitAssessments([U1]))[
      U1
    ]?.find((x) => x.id === created.id);
    expect(reread?.title).toBe("original");
    await plannerMockSource.deleteUnitAssessment(created.id, OWNER);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Static locks — the migration ↔ the seam's SELECT list
// ───────────────────────────────────────────────────────────────────────────

describe("migration ↔ seam column lock", () => {
  it("the seam's SELECT list matches its snapshot exactly", () => {
    const m = src.match(/const UNIT_ASSESSMENT_COLS =\s*\n?\s*"([^"]+)"/);
    expect(m?.[1]).toBe(
      "id, unit_id, kind, title, purpose, notes, display_order",
    );
  });

  it("every column the seam SELECTs is declared by the migration", () => {
    const m = src.match(/const UNIT_ASSESSMENT_COLS =\s*\n?\s*"([^"]+)"/);
    const selected = (m?.[1] ?? "").split(",").map((c) => c.trim());
    expect(selected).toEqual([...COLUMNS]);

    // The create-table body is the authority on what exists.
    const body = code.slice(
      code.indexOf("create table if not exists public.unit_assessments"),
    );
    const ddl = body.slice(0, body.indexOf(");") + 2);
    for (const col of selected) {
      expect(ddl, col).toMatch(new RegExp(`^\\s*${col}\\s+\\S`, "m"));
    }
  });

  it("the seam SELECTs no DB-managed timestamp (nothing maps them)", () => {
    const m = src.match(/const UNIT_ASSESSMENT_COLS =\s*\n?\s*"([^"]+)"/);
    expect(m?.[1]).not.toContain("created_at");
    expect(m?.[1]).not.toContain("updated_at");
  });

  it("the pure mapper's row type covers exactly the selected columns", () => {
    // A compile-time echo of the lock above: this literal must typecheck as a
    // full row, so adding a column to the SELECT without widening
    // UnitAssessmentRow (or vice versa) is caught by tsc, not just at runtime.
    const row: Required<UnitAssessmentRow> = {
      id: "x",
      unit_id: "u",
      kind: "formative",
      title: "t",
      purpose: "p",
      notes: "n",
      display_order: 0,
    };
    expect(Object.keys(row).sort()).toEqual([...COLUMNS].sort());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Static locks — the migration's posture
// ───────────────────────────────────────────────────────────────────────────

describe("migration — additive + idempotent", () => {
  it("creates exactly ONE table, guarded", () => {
    const creates = code.match(/create table/gi) ?? [];
    expect(creates).toHaveLength(1);
    expect(code).toMatch(
      /create table if not exists public\.unit_assessments/i,
    );
  });

  it("alters NO existing table (purely additive)", () => {
    // The only `alter table` permitted is the RLS enable on the new table.
    const alters = code.match(/alter table [^\n;]+/gi) ?? [];
    for (const a of alters) {
      expect(a.toLowerCase()).toContain("public.unit_assessments");
    }
    expect(code).not.toMatch(/add column/i);
  });

  it("contains no destructive statement (drops only for the idempotency idiom)", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/truncate/i);
    expect(code).not.toMatch(/\bdelete\s+from/i);
    expect(code).not.toMatch(/\bupdate\s+public\.(?!unit_assessments a)/i);
    for (const d of code.match(/drop\s+(\w+)/gi) ?? []) {
      expect(d.toLowerCase()).toMatch(/drop\s+(trigger|policy)/);
    }
  });

  it("guards the index + trigger for re-run safety", () => {
    expect(code).toMatch(
      /create index if not exists idx_unit_assessments_unit/i,
    );
    expect(code).toMatch(
      /drop trigger if exists trg_unit_assessments_updated_at/i,
    );
    expect(code).toMatch(/create trigger trg_unit_assessments_updated_at/i);
  });

  it("takes no advisory lock and performs no backfill", () => {
    expect(code).not.toMatch(/pg_advisory\w*\s*\(/i);
  });
});

describe("migration — the unit linkage", () => {
  it("keys on units(id) with on delete cascade (the sibling convention)", () => {
    expect(code).toMatch(
      /unit_id\s+uuid\s+not null\s+references public\.units\(id\) on delete cascade/i,
    );
  });

  it("carries NO denormalized grade/subject column (drift hazard — see end-note)", () => {
    // Grade scoping rides the unit FK. If a future tranche denormalizes, it must
    // also add a re-derive path on `units` writes — this lock forces that
    // conversation instead of letting a stale copy appear silently.
    const body = code.slice(
      code.indexOf("create table if not exists public.unit_assessments"),
    );
    const ddl = body.slice(0, body.indexOf(");") + 2);
    expect(ddl).not.toMatch(/grade_level_id/);
    expect(ddl).not.toMatch(/subject_id/);
  });

  it("makes every content column nullable; only the structural pair is NOT NULL", () => {
    const body = code.slice(
      code.indexOf("create table if not exists public.unit_assessments"),
    );
    const ddl = body.slice(0, body.indexOf(");") + 2);
    for (const col of ["kind", "title", "purpose", "notes"]) {
      expect(ddl, col).toMatch(new RegExp(`^\\s*${col}\\s+text,\\s*$`, "m"));
    }
    expect(ddl).toMatch(/display_order\s+integer not null default 0/i);
  });

  it("F1 — kind is OPEN text with NO enum CHECK (the silent-write trap)", () => {
    expect(code).not.toMatch(/check\s*\([^)]*kind/i);
    expect(code).not.toMatch(/create type .*assessment/i);
  });

  it("has NO unique constraint on (unit_id, display_order)", () => {
    // A reorder passes through transient duplicates; uniqueness would abort it.
    expect(code).not.toMatch(/unique\s*\(\s*unit_id/i);
  });
});

describe("migration — RLS posture", () => {
  it("enables RLS on the new table", () => {
    expect(code).toMatch(
      /alter table public\.unit_assessments enable row level security/i,
    );
  });

  it("mirrors units_read's tenancy predicate (can_read_grade through the unit)", () => {
    expect(code).toMatch(
      /create policy unit_assessments_read on public\.unit_assessments for select using/i,
    );
    expect(code).toMatch(/can_read_grade\(u\.grade_level_id\)/);
  });

  it("has NO `for all` write policy — that would also grant SELECT", () => {
    // The whole point of 20260729140000. RLS policies are PERMISSIVE and OR
    // together, and `FOR ALL ... USING` covers SELECT too — so a FOR ALL write
    // policy silently widened the read gate to
    // `can_read_grade OR can_edit_subject_master OR is_grade_lead`.
    // The DROP must come AFTER the original CREATE in timestamp order — the
    // concatenation still contains the superseded statement, so a bare
    // "does not match" would be checking the wrong thing.
    // LAST occurrence of each, not the first: 20260729120000 uses the repo's
    // idempotent drop-then-create idiom, so its OWN drop precedes its create.
    // What matters is that the final word on this policy is a drop.
    const lastIndexOf = (re: RegExp): number => {
      const all = [...code.matchAll(new RegExp(re.source, "gi"))];
      return all.length === 0 ? -1 : (all[all.length - 1].index ?? -1);
    };
    const created = lastIndexOf(
      /create policy unit_assessments_write on public\.unit_assessments for all/,
    );
    const dropped = lastIndexOf(
      /drop policy if exists unit_assessments_write on public\.unit_assessments/,
    );
    expect(created).toBeGreaterThan(-1);
    expect(dropped).toBeGreaterThan(created);
    // And nothing re-creates it afterwards.
    expect(latest).not.toMatch(
      /create policy unit_assessments_write on public\.unit_assessments for all/i,
    );
  });

  it("expresses writes as command-specific INSERT / UPDATE / DELETE policies", () => {
    expect(code).toMatch(
      /create policy unit_assessments_insert on public\.unit_assessments for insert/i,
    );
    expect(code).toMatch(
      /create policy unit_assessments_update on public\.unit_assessments for update/i,
    );
    expect(code).toMatch(
      /create policy unit_assessments_delete on public\.unit_assessments for delete/i,
    );
  });

  it("mirrors units_write's tenancy predicate on every write command", () => {
    const predicate =
      /can_edit_subject_master\(u\.subject_id\) or is_grade_lead\(u\.grade_level_id\)/g;
    // insert WITH CHECK (1) + update USING (1) + update WITH CHECK (1) +
    // delete USING (1). The update's WITH CHECK is the one that stops a writer
    // moving a row into a unit they cannot edit.
    expect(latest.match(predicate) ?? []).toHaveLength(4);
  });

  it("scopes every write-policy subquery to the row's own unit", () => {
    // insert + update using + update check + delete (the SELECT policy lives in
    // the first migration and is asserted separately).
    const hits = latest.match(/u\.id = unit_assessments\.unit_id/g) ?? [];
    expect(hits).toHaveLength(4);
  });

  it("revokes the reorder RPC's EXECUTE from anon BY NAME", () => {
    // Revoking from PUBLIC does not remove a grant `anon` holds in its own
    // right via Supabase's default privileges — verified true against the live
    // catalog after the first apply, which is why 20260729130000 exists.
    expect(code).toMatch(
      /revoke execute on function public\.reorder_unit_assessments\(uuid, uuid\[\]\) from anon/i,
    );
  });

  it("makes the reorder RPC reject duplicate and foreign ids", () => {
    // Previously both were silently ignored, so a stale client request could
    // report a clean success while doing something other than asked.
    expect(code).toMatch(/raise exception[\s\S]{0,120}duplicate ids/i);
    expect(code).toMatch(/raise exception[\s\S]{0,160}not assessments of unit/i);
  });

  it("carries the claude_admin_all escape hatch, drop-then-create", () => {
    expect(code).toMatch(
      /drop policy if exists "claude_admin_all" on public\.unit_assessments/i,
    );
    expect(code).toMatch(/using \(public\.is_claude_admin\(\)\)/i);
    expect(code).toMatch(/with check \(public\.is_claude_admin\(\)\)/i);
  });

  it("every policy is idempotent (drop-then-create)", () => {
    const created = code.match(/create policy "?(\w+)"?/g) ?? [];
    expect(created.length).toBeGreaterThanOrEqual(3);
    for (const c of created) {
      const name = c.replace(/create policy "?/, "").replace(/"$/, "");
      expect(code, name).toMatch(
        new RegExp(`drop policy if exists "?${name}"?`, "i"),
      );
    }
  });

  it("REVOKES anon and GRANTS authenticated (grants, not just policies)", () => {
    // Postgres' default ACLs would otherwise leave anon with SELECT — RLS is the
    // gate, but the grant is what decides who may even attempt an operation.
    expect(code).toMatch(/revoke all on public\.unit_assessments from anon/i);
    expect(code).toMatch(
      /grant select, insert, update, delete on public\.unit_assessments to authenticated/i,
    );
  });
});

describe("migration — the reorder RPC", () => {
  it("is SECURITY INVOKER (not definer — no privilege escalation)", () => {
    expect(code).toMatch(
      /create or replace function public\.reorder_unit_assessments/i,
    );
    expect(code).toMatch(/security invoker/i);
    expect(code).not.toMatch(/security definer/i);
  });

  it("pins search_path with pg_temp named LAST", () => {
    // `set search_path = public` alone leaves pg_temp implicitly FIRST, so a
    // caller's temp table could shadow public.units inside the body (the repo's
    // known Critical). Naming pg_temp last pins it to lowest priority.
    expect(code).toMatch(/set search_path = public, pg_temp/);
    expect(code).not.toMatch(/set search_path = public\s*$/m);
  });

  it("scopes the UPDATE to the requested unit (no cross-unit reorder)", () => {
    expect(code).toMatch(/a\.unit_id = p_unit_id/);
  });

  it("writes a 0-based order from the array position", () => {
    expect(code).toMatch(/with ordinality/i);
    expect(code).toMatch(/\(x\.ord - 1\)::integer/);
  });

  it("returns the affected row count so a denied reorder is detectable", () => {
    expect(code).toMatch(/returns integer/i);
    expect(code).toMatch(/get diagnostics v_count = row_count/i);
  });

  it("revokes EXECUTE from public and grants it to authenticated", () => {
    // A function's EXECUTE defaults to PUBLIC, which would expose it to `anon`.
    expect(code).toMatch(
      /revoke execute on function public\.reorder_unit_assessments\(uuid, uuid\[\]\) from public/i,
    );
    expect(code).toMatch(
      /grant execute on function public\.reorder_unit_assessments\(uuid, uuid\[\]\) to authenticated/i,
    );
  });

  it("tolerates a null id array (coalesced, not a crash)", () => {
    expect(code).toMatch(/coalesce\(p_ids, '\{\}'::uuid\[\]\)/);
  });
});

describe("seam — the Supabase implementation's failure discipline", () => {
  const block = src.slice(
    src.indexOf("async listUnitAssessments"),
    src.indexOf("// ── Section + resource mutations"),
  );

  it("the unit-assessment seam block is present", () => {
    expect(block.length).toBeGreaterThan(0);
  });

  it("update / delete / reorder each assert rows-affected and throw on zero", () => {
    // PostgREST reports an RLS-filtered UPDATE/DELETE as a successful zero-row
    // statement, so without these guards an unauthorized write reads as success.
    expect(block).toContain(
      "unit assessment write affected no rows for assessment",
    );
    expect(block).toContain(
      "unit assessment delete affected no rows for assessment",
    );
    expect(block).toContain(
      "reorder unit assessments affected no rows for unit",
    );
  });

  it("reorder goes through the ATOMIC rpc, never N updates", () => {
    expect(block).toContain('client.rpc("reorder_unit_assessments"');
  });

  it("create appends at MAX(display_order)+1, never at the row COUNT", () => {
    // The count form collides with a survivor after a middle delete (positions
    // are sparse). Locked here because the mock covers the behaviour but the
    // Supabase path can only be pinned statically without a DB harness.
    expect(block).toContain('.order("display_order", { ascending: false })');
    expect(block).toContain("(maxRow?.display_order ?? -1) + 1");
    expect(block).not.toContain('count: "exact"');
  });

  it("delete removes the whole row (no soft-null / soft-delete)", () => {
    expect(block).toContain(".delete()");
    // No column-nulling stand-in for a delete, and no soft-delete filter.
    expect(block).not.toMatch(/deleted_at|archived_at/);
  });

  it("resolves a caller unit id to a db uuid, as updateUnitFields does", () => {
    const hits = block.match(/slugToUuid\("unit", unitId\)/g) ?? [];
    // listUnitAssessments + createUnitAssessment + reorderUnitAssessments
    expect(hits).toHaveLength(3);
  });

  it("maps through the pure leaf in both directions (no inline mapping)", () => {
    expect(block).toContain("unitAssessmentFromRow(");
    expect(block).toContain("unitAssessmentColumns(");
  });
});

// Runtime invariants that need a live DB harness — recorded, not faked.
describe("unit_assessments runtime behavior (needs a DB harness)", () => {
  it.todo("anon cannot select unit_assessments (grant revoked)");
  it.todo(
    "a teacher who can read a unit's grade can SELECT its assessments, and no others'",
  );
  it.todo(
    "a teacher who is neither subject master nor grade lead has INSERT/UPDATE/DELETE filtered to 0 rows",
  );
  it.todo("deleting a unit cascades away its assessments");
  // These record the CURRENT contract (20260729140000). The earlier wording
  // here — "ignores ids belonging to a different unit (returns a short count)" —
  // described the behaviour that migration replaced. A todo naming the wrong
  // contract is worse than no todo: this list is what the commit message points
  // at as the honest record of what is unproven.
  it.todo(
    "reorder_unit_assessments RAISES on an id belonging to a different unit",
  );
  it.todo("reorder_unit_assessments RAISES on duplicate ids");
  it.todo(
    "reorder_unit_assessments raises for an unauthorized caller (RLS hides every row, so the ownership check finds none)",
  );
  it.todo(
    "anon cannot execute reorder_unit_assessments (EXECUTE revoked by name)",
  );
  it.todo("updated_at advances on every UPDATE (shared trigger)");
});
