// Guards the CONSUMER CONTRACT on the completion read in
// `lib/planner/supabase-source.ts` → `listLessons`.
//
// ── WHAT IS BEING GUARDED, AND WHY IT NEEDS A TEST AT ALL ────────────────────
// That read used to select `completion_status` by a chunked `.in(...)` over the
// grade's whole master-id set — 8 round trips to fetch 4 rows. It now selects by
// `teacher_id` alone, because the table HAS NO GRADE COLUMN (verified against
// the live schema: id, teacher_id, core_lesson_event_id, status,
// reason_not_done, is_public, updated_at).
//
// So the result is a DELIBERATE SUPERSET: every completion the teacher has, in
// every grade and every school year. That is safe for exactly one reason —
// the rows are only ever used to build a map keyed by `core_lesson_event_id`
// and read back via `.get(<a loaded master id>)`. A key nobody looks up costs a
// map entry and nothing else.
//
// It stops being safe the moment anyone COUNTS, ITERATES, SUMS or RENDERS those
// rows, because then another grade's completions are reported as this grade's —
// a cross-grade leak in an app whose CLAUDE.md §6 rule is "never assume a single
// grade". That is a FUTURE-CONSUMER risk: nothing today does it, the code is
// correct, and a behavioural test of today's output cannot express "and nobody
// may start doing this". So this suite pins the contract structurally.
//
// SEEN RED: adding `const n = complRows.length;` to `listLessons` fails
// "complRows is never counted, iterated, or spread"; changing the read's filter
// back and forth is caught by the filter test.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync("lib/planner/supabase-source.ts", "utf8");

/** The body of `listLessons`, where both reads and all their consumers live. */
function listLessonsBody(): string {
  const start = SOURCE.indexOf("async listLessons(");
  expect(start).toBeGreaterThan(-1);
  // Ends at the next top-level method on the source object literal.
  const end = SOURCE.indexOf("\n  async ", start + 10);
  return SOURCE.slice(start, end > start ? end : SOURCE.length);
}

/** The same body with comments removed.
 *
 *  COMMENTS MUST NOT COUNT AS CONSUMERS — and this is not a detail: the block
 *  documenting the contract names `complRows` twice, so a naive count over the
 *  raw source reported 4 mentions and the contract test failed against correct
 *  code. A guard that trips on its own documentation trains people to weaken it.
 *  Stripping first means the assertion is about CODE, which is what the contract
 *  is about. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("completion read — superset is lookup-only", () => {
  const body = listLessonsBody();

  it("is selected by teacher_id, with no grade filter available", () => {
    // Documents the premise the whole contract rests on. If someone adds a
    // grade column and filters by it, this test should be deleted along with
    // the contract — but they must notice the contract first.
    const read = body.slice(body.indexOf('.from("completion_status")'));
    expect(read).toContain('.eq("teacher_id", ownerId)');
    // The `teacher_id` filter is ALSO what makes `core_lesson_event_id` a
    // unique cursor (UNIQUE (teacher_id, core_lesson_event_id)). Losing it
    // silently breaks pagination, not just scoping.
    expect(read.slice(0, 600)).toContain(
      '.order("core_lesson_event_id"',
    );
  });

  it("complRows is never counted, iterated, or spread", () => {
    // The consumer contract itself. `complRows` may only be read into a map.
    const forbidden = [
      /complRows\.length/,
      /complRows\.map\(/,
      /complRows\.filter\(/,
      /complRows\.reduce\(/,
      /complRows\.forEach\(/,
      /complRows\.some\(/,
      /complRows\.every\(/,
      /complRows\.find\(/,
      /complRows\.sort\(/,
      /complRows\.slice\(/,
      /\.\.\.complRows/,
    ];
    const code = codeOnly(body);
    const violations = forbidden
      .filter((re) => re.test(code))
      .map((re) => String(re));
    expect(violations).toEqual([]);
  });

  it("complRows is consumed ONLY by building the master-keyed map", () => {
    // Every mention of `complRows` must be either its declaration or the
    // `for (const c of complRows)` that fills `complByMaster`. Anything else is
    // a new consumer that has not been checked against the contract.
    const mentions = [...codeOnly(body).matchAll(/complRows/g)].length;
    expect(mentions).toBe(2); // the destructured binding, and the map fill
    expect(body).toMatch(/for \(const c of complRows\) complByMaster\.set\(/);
  });

  it("the map is read only by master id", () => {
    // `.get(...)` calls on the map must be keyed by a loaded master row's id.
    const gets = [...body.matchAll(/complByMaster\.get\(([^)]*)\)/g)].map(
      (m) => m[1].trim(),
    );
    expect(gets.length).toBeGreaterThan(0);
    for (const arg of gets) expect(arg).toMatch(/^(master|m)\.id$/);
  });
});

describe("copies read — the id list is load-bearing, not incidental", () => {
  const body = listLessonsBody();

  it("still scopes personal copies by the loaded master ids", () => {
    // A `grade_level_id` predicate here would be 8 round trips cheaper and is
    // NOT safe: the column is nullable, no constraint ties it to the master's
    // grade, and the trigger that maintains it derives it from the COPY'S OWN
    // unit — so a copy whose unit moves to another grade (or to a unit with a
    // null grade) drops out of the result while its master is still loaded.
    // That is a teacher's own fork disappearing with no error.
    //
    // Verified read-only against production 2026-08-01: grade_level_id
    // IS NULLABLE; pg_constraint has no check relating it to the master; the
    // trigger body is
    // `new.grade_level_id := (select grade_level_id from units where id = new.unit_id)`.
    const read = body.slice(
      body.indexOf('.from("personal_core_lesson_event_copies")'),
    );
    expect(read.slice(0, 400)).toContain(
      '.in("master_core_lesson_event_id", ids)',
    );
    expect(read.slice(0, 400)).not.toContain('.eq("grade_level_id"');
  });

  it("routes that id list through chunkedIn, which bounds the URL", () => {
    expect(body).toMatch(/chunkedIn<PersonalCopyRow>\(\s*masterIds/);
  });
});
