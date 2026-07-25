// subjects-personal-visibility.test.ts — the personal-course privacy boundary.
//
// A user decision locked on 2026-07-17: inside a team workspace a PERSONAL
// course is INVISIBLE to teammates, and control over it sits with the CREATOR
// plus a SCHOOL ADMIN. The table policies written in the initial schema do close
// to the opposite on both halves — `subjects_read` carries an unscoped
// `or is_grade_lead(grade_level_id)` arm, so a lead reads every personal course
// in the grade, while `subjects_update`/`subjects_delete` gate personal rows on
// `owner_id = auth.uid()` alone, so the admin has no control at all.
//
// Static locks, because the runtime behaviour needs a live database and this
// repo's hard rule is that agents never touch one. What can be checked without a
// database is that the SQL we ship expresses the decision — and, just as
// importantly, that the REASONING which makes the fix safe is recorded rather
// than rediscovered.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_DIR = join(__dirname, "..", "supabase", "migrations");
const FIX = "20260731120000_subjects_personal_visibility.sql";
const INITIAL = "20260518102823_initial_schema.sql";
const RPCS = "20260717120000_course_sharing_rpcs.sql";

function read(file: string): string {
  return readFileSync(join(MIGRATION_DIR, file), "utf8");
}
/** Comment-stripped, whitespace-collapsed, for predicate assertions. */
function sql(file: string): string {
  return read(file)
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ");
}

/** The `using (...)` expression of a named policy, whitespace-collapsed. */
function policyUsing(source: string, name: string): string {
  const i = source.indexOf(`create policy ${name} on subjects`);
  if (i < 0) return "";
  const from = source.indexOf("using (", i);
  if (from < 0) return "";
  // Balance parens from the opening one so a nested call doesn't truncate it.
  let depth = 0;
  const start = source.indexOf("(", from);
  for (let j = start; j < source.length; j += 1) {
    if (source[j] === "(") depth += 1;
    else if (source[j] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, j).trim();
    }
  }
  return "";
}

describe("the defect this migration corrects is real at HEAD", () => {
  // A lock that cannot fail is not a lock. These pin the BEFORE state, so if
  // someone ever rewrites the initial schema in place, this file fails loudly
  // rather than quietly guarding nothing.
  const initial = sql(INITIAL);

  it("initial_schema's subjects_read has an UNSCOPED grade-lead arm", () => {
    const expr = policyUsing(initial, "subjects_read");
    expect(expr).toContain("is_grade_lead(grade_level_id)");
    // Unscoped: the lead arm is not guarded by any `scope =` test.
    expect(expr).toMatch(/or is_grade_lead\(grade_level_id\)\s*$/);
  });

  it("initial_schema's subjects_update/delete give personal rows to the owner ONLY", () => {
    for (const name of ["subjects_update", "subjects_delete"]) {
      const expr = policyUsing(initial, name);
      expect(expr, name).toContain("scope = 'personal' and owner_id = auth.uid()");
      expect(expr, name).not.toContain("is_school_admin");
      expect(expr, name).not.toContain("is_grade_school_admin");
    }
  });
});

describe("FIX 1 — a personal course becomes invisible", () => {
  const fixed = sql(FIX);

  it("re-creates subjects_read WITHOUT the grade-lead arm", () => {
    const expr = policyUsing(fixed, "subjects_read");
    expect(expr).toContain("scope = 'team' and can_read_grade(grade_level_id)");
    expect(expr).toContain("scope = 'personal' and owner_id = auth.uid()");
    expect(expr).not.toContain("is_grade_lead");
  });

  it("adds NO admin read arm — control is not visibility", () => {
    // The decision said invisible. An admin acts through the SECURITY DEFINER
    // sharing RPCs; granting them SELECT here would hand every admin a general
    // read over their teammates' private planning.
    const expr = policyUsing(fixed, "subjects_read");
    expect(expr).not.toContain("is_school_admin");
    expect(expr).not.toContain("is_grade_school_admin");
  });

  it("records WHY dropping the arm removes no legitimate access", () => {
    // is_grade_lead(g) strictly implies can_read_grade(g), so for team courses
    // the arm is redundant and for personal ones it is the whole defect. That
    // implication is the safety argument; if it is ever not written down, the
    // next reader has to re-derive it before they dare touch the policy.
    const prose = read(FIX);
    expect(prose).toMatch(/is_grade_lead\(g\).{0,40}(implies|IMPLIES)/);
    expect(prose).toContain("can_read_grade");
  });
});

describe("FIX 2 — deliberately NOT made, and the reason is recorded", () => {
  const fixed = sql(FIX);

  it("does NOT re-create subjects_update or subjects_delete", () => {
    // The obvious fix — OR-in a school-admin arm — was written and REMOVED.
    // Postgres applies the SELECT policy to an UPDATE/DELETE that has to read
    // the row to find it (every statement with a WHERE clause, which PostgREST
    // always sends). So an admin who cannot SELECT a personal course cannot
    // target it for UPDATE or DELETE either: the admin arms would have been
    // INERT — a policy that reads like a granted capability and grants nothing.
    // Shipping that is the exact class of lie this pass exists to remove.
    expect(fixed).not.toContain("create policy subjects_update");
    expect(fixed).not.toContain("create policy subjects_delete");
  });

  it("ships no helper function that nothing uses", () => {
    // is_grade_school_admin() was written for those arms and removed with them.
    // Dead DDL on a security-sensitive table is worse than no DDL.
    expect(fixed).not.toContain("is_grade_school_admin");
    expect(fixed).not.toContain("create or replace function");
  });

  it("explains WHY the RLS route cannot express admin control", () => {
    const prose = read(FIX).replace(/\s|^--/gm, "");
    expect(prose).toContain("SELECTpolicytoanUPDATEorDELETE");
    expect(prose).toContain("INERT");
  });

  it("names the mechanism that WOULD work, so the gap is not silent", () => {
    // The codebase already does this for sharing: share_course /
    // unshare_course / list_course_sharing are SECURITY DEFINER and give an
    // admin the management view without any RLS read.
    const prose = read(FIX).replace(/\s|^--/gm, "");
    expect(prose).toContain("SECURITYDEFINERRPCs");
    expect(prose).toContain("list_course_sharing");
    expect(prose).toContain("DEFERRED");
  });

  it("does not claim in its title or summary to have fixed control", () => {
    const prose = read(FIX);
    expect(prose).toMatch(/control is unchanged/i);
  });
});

describe("the migration is safe to re-apply and leaves insert alone", () => {
  const fixed = sql(FIX);

  it("drops subjects_read before creating it (idempotent)", () => {
    expect(fixed).toContain("drop policy if exists subjects_read on subjects");
  });

  it("does not touch subjects_insert", () => {
    // Already correct: a teacher creates their own personal course in a grade
    // they belong to. Rewriting it would be unreviewed churn on a write path.
    expect(fixed).not.toContain("create policy subjects_insert");
  });

  it("is authored-not-applied and says so", () => {
    const prose = read(FIX);
    expect(prose).toMatch(/AUTHORED, NOT APPLIED/);
    expect(prose).toMatch(/ORCHESTRATOR \+ USER ONLY/);
  });
});

describe("the RPC layer already agreed — this is the table catching up", () => {
  it("course_sharing_rpcs states the personal-is-invisible model in its header", () => {
    // Cited so the fix reads as reconciliation rather than reinterpretation:
    // two layers have been describing different products, and the RPCs are the
    // one that matches the user's decision.
    const prose = read(RPCS);
    expect(prose).toMatch(/PERSONAL course is invisible to teammates/i);
    expect(prose).toMatch(/subjects_read: personal → owner only/);
  });

  it("the RPCs authorize on owner OR school admin — the shape FIX 2 mirrors", () => {
    const prose = read(RPCS);
    expect(prose).toContain("is_school_admin");
    expect(prose).toMatch(/owner_id = auth\.uid\(\)\s+OR\s+is_school_admin/i);
  });
});
