// security-definer-search-path.test.ts — the pg_temp pin, locked statically.
//
// A SECURITY DEFINER function declared `set search_path = public` leaves the
// caller's `pg_temp` schema IMPLICITLY FIRST, so a temp table named after a real
// relation shadows it inside a body running with the owner's privileges. This
// repo has already recorded that as a Critical once (cb83e46). The correct pin
// names pg_temp explicitly, LAST: `set search_path = public, pg_temp`.
//
// Two things are locked here, and they are different:
//   1. NO NEW OFFENDERS. Every SECURITY DEFINER function DEFINED in a migration
//      newer than the back-fill must pin pg_temp itself. The back-fill is a
//      one-time sweep; it cannot see a function written after it.
//   2. THE BACK-FILL STAYS NARROW. It must key off the exact setting
//      `search_path=public` — never "every definer function" — or it would
//      WEAKEN `is_claude_admin()`, which uses the stricter empty search path.
//
// Static text analysis, deliberately: the runtime effect needs a live database,
// and this repo's hard rule is that agents never touch one. What CAN be checked
// without a database is that the SQL we ship says the right thing.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_DIR = join(__dirname, "..", "supabase", "migrations");
const BACKFILL = "20260730120000_security_definer_search_path_backfill.sql";

const FILES = readdirSync(MIGRATION_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // timestamp-prefixed → lexical sort IS apply order

/** Strip SQL line comments so text assertions never match prose. */
function code(file: string): string {
  return readFileSync(join(MIGRATION_DIR, file), "utf8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

/**
 * Every `create [or replace] function` in `sql`, with the header text between
 * the closing paren of the argument list and the body marker (`as $`), which is
 * where `security definer` and `set search_path` live.
 */
function definitions(
  sql: string,
): { name: string; header: string; definer: boolean }[] {
  const out: { name: string; header: string; definer: boolean }[] = [];
  // `[\s\S]` rather than `.` + the `s` flag: the repo's tsconfig target predates
  // dotAll, and a lock test must compile everywhere the suite does.
  const re =
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)([\s\S]{0,800}?)\bas\b\s*\$/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const header = m[3];
    out.push({
      name: m[1],
      header,
      definer: /security\s+definer/i.test(header),
    });
  }
  return out;
}

/**
 * Is this `set search_path = …` value safe?
 *
 * PRESENCE IS NOT ENOUGH, and that distinction is the whole point. The defect is
 * that pg_temp resolves FIRST; `search_path = pg_temp, public` names pg_temp and
 * is exactly as vulnerable as omitting it. A `.includes("pg_temp")` check waves
 * that straight through. So: split the list and require pg_temp to be LAST.
 *
 * The EMPTY path (`''` / `""`) is accepted as stricter still — nothing is
 * searched, so every name inside the body must be schema-qualified. That is what
 * `is_claude_admin()` uses.
 */
export function pinsPgTempLast(raw: string): boolean {
  const value = raw.trim().replace(/;\s*$/, "");
  if (/^(''|"")$/.test(value)) return true; // the empty path — strictest
  const parts = value
    .split(",")
    .map((p) => p.trim().replace(/^['"]|['"]$/g, ""))
    .filter((p) => p.length > 0);
  return parts.length > 0 && parts[parts.length - 1] === "pg_temp";
}

describe("pinsPgTempLast — the rule the locks below enforce", () => {
  it("accepts the canonical pin", () => {
    expect(pinsPgTempLast("public, pg_temp")).toBe(true);
  });

  it("accepts the empty path (stricter than pg_temp-last)", () => {
    expect(pinsPgTempLast("''")).toBe(true);
    expect(pinsPgTempLast('""')).toBe(true);
  });

  it("REJECTS pg_temp first — the failure a presence check waves through", () => {
    // Identical vulnerability to omitting it: pg_temp still resolves first.
    expect(pinsPgTempLast("pg_temp, public")).toBe(false);
  });

  it("REJECTS pg_temp in the middle", () => {
    expect(pinsPgTempLast("public, pg_temp, extensions")).toBe(false);
  });

  it("REJECTS a bare `public`", () => {
    expect(pinsPgTempLast("public")).toBe(false);
  });

  it("tolerates trailing semicolons and stray whitespace", () => {
    expect(pinsPgTempLast("  public ,  pg_temp ;  ")).toBe(true);
  });
});

describe("the back-fill migration", () => {
  const sql = code(BACKFILL);

  it("exists and is the newest migration at authoring time", () => {
    expect(FILES).toContain(BACKFILL);
  });

  it("re-pins to `public, pg_temp` — pg_temp named LAST", () => {
    // Naming pg_temp FIRST is no better than omitting it.
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).not.toMatch(/search_path\s*=\s*pg_temp\s*,/i);
  });

  it("the runbook's verification checks the LAST element, not mere presence", () => {
    // A `like '%pg_temp%'` verification reports all-clear on
    // `search_path = pg_temp, public` — a live hole signed off as fixed. The
    // query must index the FINAL element of the split path and compare it.
    const prose = readFileSync(join(MIGRATION_DIR, BACKFILL), "utf8");
    // The presence form must not appear as a PREDICATE. (The prose above the
    // runbook names `like '%pg_temp%'` while explaining why it is wrong, so the
    // check is on the negated WHERE-clause form, not the bare phrase.)
    expect(prose).not.toMatch(/not\s+like\s+'%pg_temp%'/);
    // The last-element idiom, whitespace/comment-prefix tolerant.
    expect(prose.replace(/\s|^--/gm, "")).toContain(
      "(string_to_array(path,','))[array_length(string_to_array(path,','),1)])<>'pg_temp'",
    );
  });

  it("the runbook excuses the empty path WITHOUT nesting quote characters", () => {
    // The empty search path is stored as `""`. Writing that literally inside a
    // shell-quoted `--linked "..."` argument nests quotes three deep, and one
    // wrong escape makes the clause stop matching — is_claude_admin() then gets
    // reported as unsafe and "expect zero rows" becomes untrustworthy. chr()
    // sidesteps every quoting layer, so the guard is that the query strips
    // quotes by code point and then tests for the empty string.
    const prose = readFileSync(join(MIGRATION_DIR, BACKFILL), "utf8");
    expect(prose).toContain("chr(34)");
    expect(prose).toContain("chr(39)");
    expect(prose.replace(/\s|^--/gm, "")).toContain("path<>''");
    // No backslash-escaped quote literals anywhere in the runbook SQL.
    expect(prose).not.toContain('\\"\\"');
  });

  it("selects ONLY functions whose setting is exactly `search_path=public`", () => {
    // The narrowness is the safety property. A blanket sweep over every
    // SECURITY DEFINER function would overwrite is_claude_admin()'s empty
    // search path — which is STRICTER than pg_temp-last — and quietly weaken it.
    expect(sql).toContain("'search_path=public' = any (p.proconfig)");
    expect(sql).toContain("p.prosecdef");
  });

  it("resolves each signature through pg_proc rather than transcribing it", () => {
    // Several targets take composite enum args across multiple lines; a
    // hand-written `alter function` list is how one silently targets a
    // signature that does not exist.
    expect(sql).toContain("oid::regprocedure");
  });

  it("carries an apply runbook and does not apply itself", () => {
    const prose = readFileSync(join(MIGRATION_DIR, BACKFILL), "utf8");
    expect(prose).toMatch(/AUTHORED, NOT APPLIED/);
    expect(prose).toMatch(/ORCHESTRATOR \+ USER ONLY/);
  });
});

describe("no NEW SECURITY DEFINER function may skip the pin", () => {
  // The back-fill is a one-time sweep over what existed when it was written. A
  // function DEFINED after it is invisible to it, so the pin has to be in the
  // definition itself — this is the guard that makes that non-optional.
  const newer = FILES.filter((f) => f > BACKFILL);

  it.each(newer.length > 0 ? newer : ["(no newer migrations yet)"])(
    "%s pins pg_temp on every SECURITY DEFINER function it defines",
    (file) => {
      if (!FILES.includes(file)) return; // the placeholder case
      for (const def of definitions(code(file))) {
        if (!def.definer) continue;
        const sp = /set\s+search_path\s*(?:=|to)\s*([^\n]+)/i.exec(def.header);
        expect(sp, `${file} → ${def.name}: no search_path at all`).not.toBeNull();
        expect(
          pinsPgTempLast(sp?.[1] ?? ""),
          `${file} → ${def.name}: search_path is "${(sp?.[1] ?? "").trim()}" — pg_temp must be the LAST entry (or the path must be empty)`,
        ).toBe(true);
      }
    },
  );
});

describe("the historical offenders are real (the back-fill has work to do)", () => {
  it("finds SECURITY DEFINER functions defined with a bare `search_path = public`", () => {
    // If this ever returns zero, either every definition has been rewritten in
    // place (and the back-fill is dead code that should be deleted) or the
    // detector broke. Both are worth failing on: a lock that cannot fail is not
    // a lock.
    const offenders: string[] = [];
    for (const file of FILES) {
      if (file === BACKFILL) continue;
      for (const def of definitions(code(file))) {
        if (!def.definer) continue;
        const sp = /set\s+search_path\s*(?:=|to)\s*([^\n]+)/i.exec(def.header);
        const value = (sp?.[1] ?? "").trim();
        if (/^public\s*$/.test(value)) offenders.push(`${file}:${def.name}`);
      }
    }
    expect(offenders.length).toBeGreaterThan(0);
  });

  it("is_claude_admin is created with the EMPTY path and re-pinned separately", () => {
    // Its CREATE uses `set search_path to ''`, so Part 1's `search_path=public`
    // filter deliberately does not match it — it needs its own statement.
    const src = code("20260607120000_claude_access_log_reconcile.sql");
    const def = definitions(src).find((d) => d.name === "is_claude_admin");
    expect(def).toBeDefined();
    expect(def?.definer).toBe(true);
    expect(def?.header).toMatch(/set\s+search_path\s+to\s+''/i);
  });

  it("Part 2 re-pins is_claude_admin to pg_catalog, pg_temp — NOT public", () => {
    // `''` is the STRICTER setting: nothing resolves unqualified. Moving it to
    // `public, pg_temp` would grant visibility of every table in public that
    // this function neither has nor needs — a widening dressed as hardening.
    // `pg_catalog, pg_temp` grants nothing (pg_catalog is always searched
    // anyway) while naming pg_temp explicitly LAST, which is the actual fix.
    const sql = code(BACKFILL);
    expect(sql).toContain(
      "alter function public.is_claude_admin() set search_path = pg_catalog, pg_temp",
    );
    expect(sql).not.toMatch(/is_claude_admin\(\)\s*set search_path = public/);
  });

  it("covers is_claude_admin so the verification has NO expected exceptions", () => {
    // "Expect zero rows except this one" is exactly where the next real
    // regression hides. The runbook promises zero rows, full stop — which only
    // holds because Part 2 exists.
    const prose = readFileSync(join(MIGRATION_DIR, BACKFILL), "utf8");
    expect(prose).toMatch(/ZERO rows/);
    expect(prose).toMatch(/no expected exceptions/i);
  });
});
