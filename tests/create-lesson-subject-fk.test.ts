// Regression guard for the 2026-07-31 lesson-creation outage.
//
// WHAT BROKE. `createLesson` computed the FK it was about to insert:
//
//     const subjectUuid = slugToUuid("subject", input.subject);
//
// on the premise, stated in the comment above it, that "the importer keys
// subjects by the slug-derived uuid, so the deterministic bridge resolves it
// without a round-trip". That is true ONLY of the originally-seeded grade.
// Every grade minted since the multi-workspace cutover carries RANDOM subject
// uuids, so the derived value matched no row and every insert died on
// `personal_authored_lessons_subject_id_fkey`. Measured against prod: all eight
// locked subject slugs hashed to uuids appearing ZERO times in
// `public.subjects`. The teacher saw "Couldn't add the lesson — check your
// connection and try again", which points at the network for a foreign-key bug.
//
// WHY THIS TEST IS SOURCE-TEXT, and what that buys. The real assertion —
// "the inserted subject_id is a row that exists" — needs a live Postgres with
// two differently-keyed grades; that belongs in the DB harness and is listed as
// a todo at the bottom. What is cheap and durable here is guarding the SHAPE of
// the fix, because the failure mode was a plausible-looking one-liner that read
// as an optimisation. Anyone reintroducing it trips this at authoring time.
//
// It is a guard, not proof of correctness. Do not let it stand in for the DB
// test; a passing suite here is consistent with the resolution being wrong in
// ways only a real insert can reveal.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = join(__dirname, "..", "lib", "planner", "supabase-source.ts");
const raw = readFileSync(SOURCE, "utf8");

/** Strip whole-line comments. The docblock added by the fix QUOTES the removed
 *  `slugToUuid("subject", …)` call verbatim so the next reader knows what not to
 *  do — so an unstripped scan finds it and every assertion below inverts. */
function stripLineComments(ts: string): string {
  return ts
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

/** createLesson's body, sliced by its two unique neighbouring method heads. */
function createLessonBody(ts: string): string {
  const start = ts.indexOf("async createLesson(");
  const end = ts.indexOf("async softDeleteLesson(");
  if (start < 0 || end < 0 || end <= start) return "";
  return ts.slice(start, end);
}

const code = stripLineComments(raw);
const body = createLessonBody(code);

describe("createLesson — subject FK resolution (outage regression guard)", () => {
  it("slices a non-empty createLesson body (the detector is not vacuous)", () => {
    // Every assertion below is over `body`. An empty slice would pass them all
    // by finding nothing, so this is the load-bearing precondition.
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("personal_authored_lessons");
  });

  it("NEVER derives subject_id from a slug hash", () => {
    // The exact regression. A derived FK is unresolvable against any grade whose
    // subjects were not minted by the importer.
    expect(body).not.toMatch(/slugToUuid\(\s*["']subject["']/);
  });

  it("resolves the subject against the grade's REAL rows before inserting", () => {
    const insertAt = body.indexOf(".insert(");
    expect(insertAt).toBeGreaterThan(-1);
    const beforeInsert = body.slice(0, insertAt);
    // The lookup must precede the insert — resolving afterwards cannot inform
    // the value being written.
    expect(beforeInsert).toContain("loadSubjectIndex(client, grade)");
  });

  it("refuses zero-or-many matches instead of taking the first", () => {
    // `subjects` carries no uniqueness constraint on (grade_level_id, scope,
    // colour), so first-wins could file a lesson under a wrong-but-plausible
    // row. A refusal is the correct failure.
    expect(body).toMatch(/matches\.length\s*!==\s*1/);
    expect(body).not.toMatch(/matches\[0\]\s*\?\?/);
  });

  it("validates the grade before querying with it", () => {
    // Without this, an unresolved grade queries subjects with "" and reports
    // "no subject", sending the reader after the wrong bug.
    expect(body).toMatch(/if\s*\(!grade\s*\|\|\s*!isUuid\(grade\)\)/);
  });

  it("keeps table names and ids OUT of the thrown message, and IN the server log", () => {
    // The throw crosses a Next.js server-action boundary. Prod redacts it to a
    // digest, but that redaction is not a reason to put schema detail in the
    // string. Diagnostics belong in console.error, server-side.
    const throwsIn = body.match(/throw new Error\([\s\S]*?\);/g) ?? [];
    expect(throwsIn.length).toBeGreaterThan(0);
    for (const t of throwsIn) {
      expect(t).not.toContain("public.subjects");
      expect(t).not.toMatch(/\$\{grade\}/);
    }
    expect(body).toContain("[planner] createLesson subject resolve failed");
  });

  it("SELF-TEST: the detectors flag the OLD code and clear the NEW", () => {
    // A guard nobody has seen fail is not evidence. Run the same detectors over
    // a synthetic body carrying the exact regression, including the trap that
    // the fix's own docblock quotes the removed call.
    const OLD = [
      "  async createLesson(input, ownerId, gradeLevelId) {",
      "    const grade = gradeLevelId ?? input.gradeLevelId;",
      '    const subjectUuid = slugToUuid("subject", input.subject);',
      '    const res = await client.from("personal_authored_lessons").insert(row);',
      "  },",
      "  async softDeleteLesson(lessonId, ownerId) {},",
    ].join("\n");
    const oldBody = createLessonBody(stripLineComments(OLD));
    expect(oldBody).toMatch(/slugToUuid\(\s*["']subject["']/); // detector FIRES
    expect(oldBody).not.toContain("loadSubjectIndex(client, grade)");

    // And the comment trap: a body whose ONLY mention of the bad call is inside
    // a comment must read as CLEAN, or the guard fails the fix it is protecting.
    const COMMENTED = [
      "  async createLesson(input, ownerId, gradeLevelId) {",
      '    // was: slugToUuid("subject", input.subject) — see the outage note',
      "    const { uuidToSubjectId } = await loadSubjectIndex(client, grade);",
      '    const res = await client.from("personal_authored_lessons").insert(row);',
      "  },",
      "  async softDeleteLesson(lessonId, ownerId) {},",
    ].join("\n");
    const cleanBody = createLessonBody(stripLineComments(COMMENTED));
    expect(cleanBody).not.toMatch(/slugToUuid\(\s*["']subject["']/);
    expect(cleanBody).toContain("loadSubjectIndex(client, grade)");
  });
});

describe("the same premise elsewhere — recorded, not yet fixed", () => {
  it("the unit arm STILL hashes a slug (documented, inert on every live path)", () => {
    // Deliberately asserts the CURRENT state rather than the desired one, so the
    // debt is visible in the suite instead of only in a comment. `addLesson`
    // hardcodes `unit: ""`, so nothing reaches it today — but a lesson filed by
    // unit slug would fail its FK exactly as the subject arm did.
    //
    // WHEN YOU FIX IT: flip this to `.not.toMatch(...)` and delete this note.
    expect(body).toMatch(/slugToUuid\(\s*["']unit["']/);
    expect(raw).toContain("THE SUBJECT BUG'S TWIN, STILL LIVE");
  });
});

describe("needs a DB harness (two grades, differently keyed)", () => {
  it.todo("an insert into a RANDOM-uuid grade lands the grade's real subject row");
  it.todo("an insert into the seeded slug-derived grade still resolves correctly");
  it.todo("a grade with two team subjects sharing a slug REFUSES rather than guessing");
  it.todo("a personal-scope subject row is never selected (scope='team' filter)");
});
