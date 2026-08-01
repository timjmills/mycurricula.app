import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// ── The mock-fixture ratchet ────────────────────────────────────────────────
//
// PROBLEM
// ───────
// `lib/mock/` holds two very different kinds of thing behind one barrel:
//
//   • CATALOG / IDENTITY — a fixture standing in for real TENANT data. The
//     subject list, the unit list, the teacher roster, `ME` (the signed-in
//     user!), the school week, the timetable, "which week is now". A live
//     surface importing one of these renders the beta school's data for
//     EVERY tenant, and no feature flag switches it off. This is the class
//     the user called "v1 remnants".
//
//   • SAMPLE CONTENT — genuinely illustrative material with no tenant
//     meaning (todo tags, shoutbox chatter, starter board templates).
//     Harmless, and useful while surfaces are still being built.
//
// A one-time sweep does not hold: the class keeps growing back. This test is
// the RATCHET that stops it growing while the sweep shrinks it.
//
// WHY A NAMED-EXPORT BAN, NOT A MODULE BAN
// ────────────────────────────────────────
// A blanket "no importing lib/mock" rule would flag 89 files, including ones
// whose only sin is a pure string formatter (`formatStandardCode` is a regex
// over a standards code — no fixture data at all). A guard that is mostly
// noise gets disabled, and then it guards nothing. Banning the ~22 identity-
// bearing *names* flags 84 files and every one of them is a real finding.
//
// The distinction is what the export CARRIES, never how it is spelled. A
// name-shape heuristic (ban the SCREAMING_SNAKE constants, allow the
// camelCase functions) looks tempting and is wrong: `lessonTime()` is
// camelCase but closes over `SUBJECT_TIME`, a hard-coded beta-school
// timetable, so it hands every tenant the same period times. Likewise
// `dateForWeekDay()` closes over a fictional calendar anchor and
// `describeStandard()` reads the fixture standards map. They are banned;
// `formatStandardCode` is not. Hence the explicit lists below.
//
// HOW IT RATCHETS
// ───────────────
// `toEqual(ALLOWLIST)` is EXACT equality, not a subset check. So:
//   • adding a new offending import fails (the list grew), and
//   • fixing an offender without deleting its allowlist line ALSO fails.
// The list can therefore only shrink, and only deliberately.

const repoRoot = path.resolve(__dirname, "..");

/**
 * Every tracked .ts/.tsx under app/, components/ and lib/.
 *
 * Enumerated with a bare `git ls-files` + a filter in JS rather than git
 * pathspecs. `git ls-files "lib/**\/*.ts"` looks like it covers lib/ but
 * silently requires at least one intermediate directory — it returns the 80
 * nested files and MISSES all 173 top-level `lib/*.ts`, which is where
 * `lib/palette.tsx`, `lib/app-state.tsx` and `lib/day-status.ts` live. A
 * guard blind to two thirds of lib/ is worse than no guard, so the globbing
 * happens here where it can be read.
 *
 * ── TRACKED IS NOT THE SAME AS PRESENT, IN BOTH DIRECTIONS (2026-08-01) ─────
 * A bare `git ls-files` enumerates the INDEX, and the index disagrees with the
 * disk in two ways that both mattered while the retired Day frames were being
 * deleted:
 *
 *   • Still listed, already gone. A file deleted in the working tree but not
 *     yet staged is still in the index, and `readCode` threw ENOENT and took
 *     the whole guard down with it. Red rather than silently under-scanning is
 *     the right direction, but it is red for the wrong reason and points at the
 *     wrong line. A path that does not exist cannot import anything, so it is
 *     not a source file — dropping it cannot hide an offender.
 *
 *   • Present, not listed at all. A file that is NEW and not yet staged was
 *     invisible to this guard entirely, so a fresh live surface could import
 *     `SUBJECT_BY_ID` and pass right up until someone ran `git add`. That is
 *     the same blind spot CLAUDE.md §4a names for the code-review gate
 *     ("untracked (`??`) files … would be invisible to the reviewer"), and it
 *     is worst at exactly the moment the guard is meant to earn its keep: while
 *     the offending code is being written. `--others --exclude-standard` adds
 *     them, honouring .gitignore, so build output and node_modules stay out.
 */
function sourceFiles(): string[] {
  const ls = (...args: string[]): string[] =>
    execFileSync("git", ["ls-files", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\n")
      .map((s) => s.trim());

  const seen = new Set([...ls(), ...ls("--others", "--exclude-standard")]);
  return [...seen]
    .filter((p) => /^(app|components|lib)\//.test(p) && /\.tsx?$/.test(p))
    .filter((p) => existsSync(path.join(repoRoot, p)))
    .sort();
}

/**
 * Identity-bearing exports of `lib/mock`. Importing one of these into a live
 * surface substitutes fixture data for tenant data.
 */
const BANNED = new Set([
  // Subject catalog
  "SUBJECTS",
  "SUBJECT_BY_ID",
  // Unit catalog
  "UNITS",
  "ALL_UNITS",
  "UNIT_BY_ID",
  // Teacher roster + the signed-in user
  "TEACHERS",
  "TEACHER_BY_ID",
  "ME",
  // The school week — CLAUDE.md §6: never hard-code the weekday set
  "WEEK_DAYS",
  "WEEK_DAYS_SHORT",
  // "Which week is now" + the lesson corpus keyed to it
  "CURRENT_WEEK",
  "LESSONS",
  "LESSON_BY_ID",
  "lessonsForWeek", // closes over LESSONS
  // Standards catalog
  "STANDARDS",
  "describeStandard", // reads STANDARDS
  // The timetable — CLAUDE.md §6: never hard-code the daily schedule
  "SCHEDULE",
  "SUBJECT_TIME",
  "lessonTime", // closes over SUBJECT_TIME
  // Calendar dates, anchored to a fictional term start
  "dateForWeekDay",
  "dateNumberForWeekDay",
  // Tenant identifier
  "MOCK_GRADE_LEVEL_ID",
]);

/**
 * Sample content — illustrative, no tenant meaning. Allowed anywhere.
 * Listed explicitly (rather than "anything not banned") so that a NEW export
 * appearing in lib/mock cannot slip through unclassified; see the
 * "classifies every imported name" test below.
 */
const SAMPLE_CONTENT = new Set([
  "DEFAULT_BOARD_TITLES",
  "BOARDS",
  "buildDefaultBoardSet",
  "TEAM_LIBRARY_BOARDS",
  "STARTER_TEMPLATES",
  "DAILY_NOTES",
  "notesForDay",
  "SHOUTBOX_MESSAGES",
  "shoutboxForDay",
  "ShoutboxMessage",
  "formatStandardCode", // pure regex over a code string
  "TAGS",
  "TAG_BY_ID",
  "TODOS",
]);

/**
 * Files allowed to import anything from lib/mock.
 *
 * `lib/mock/**` cross-imports its own fixtures. The two `mock-source.ts`
 * files are the mock DATA-SOURCE ADAPTERS sitting behind the Supabase
 * flags — serving fixtures is the entire point of them, and they are the
 * sanctioned place for a live surface's data to come from when the flag is
 * off.
 */
const EXEMPT = (rel: string) =>
  rel.startsWith("lib/mock/") ||
  rel === "lib/planner/mock-source.ts" ||
  rel === "lib/teach/mock-source.ts";

/** `import`/`export … from "<spec>"`. `[\s\S]` so multi-line braces match. */
const IMPORT_STMT = /\b(?:import|export)\b([\s\S]*?)\bfrom\s*["']([^"']+)["']/g;

/**
 * A lib/mock specifier in either shape. The relative form is used only
 * inside lib/ (`./mock`, `./mock/subjects`, `../mock`) and accounts for a
 * quarter of the hits — matching only the `@/` alias would leave the whole
 * lib/ half of the problem invisible.
 */
const MOCK_SPECIFIER = /^(?:@\/lib\/mock|(?:\.{1,2}\/)+mock)(?:\/|$)/;

/** Drop comments, so a file may still EXPLAIN the banned pattern in prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function readCode(rel: string): string {
  return stripComments(readFileSync(path.join(repoRoot, rel), "utf8"));
}

interface Hit {
  /** Named bindings pulled from lib/mock, `type` and `as` aliases resolved. */
  names: string[];
  /** `import type { … }` — erased at build time, so it carries no data. */
  typeOnly: boolean;
  /** A namespace or default import, which hides which names are used. */
  wildcard: boolean;
}

/** Split out from mockImports so the Gate B control can feed it a literal. */
function parseImports(code: string): Hit[] {
  const hits: Hit[] = [];
  IMPORT_STMT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_STMT.exec(code)) !== null) {
    const [, clause, spec] = m;
    if (!MOCK_SPECIFIER.test(spec)) continue;
    // The `[\s\S]*?` above can otherwise run from a stray `export` keyword in
    // the body across to a later import's `from`, pulling braces out of a
    // function body. A real import/export clause is only bindings, braces and
    // `as` — never a semicolon, an assignment or a call.
    if (/[;=()]/.test(clause)) continue;
    const typeOnly = /^\s*type\b/.test(clause);
    const braced = clause.match(/\{([\s\S]*?)\}/);
    if (!braced) {
      hits.push({ names: [], typeOnly, wildcard: true });
      continue;
    }
    const names = braced[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim());
    hits.push({ names, typeOnly, wildcard: false });
  }
  return hits;
}

function mockImports(rel: string): Hit[] {
  return parseImports(readCode(rel));
}

/** rel → the banned names it pulls in, for every non-exempt source file. */
function findOffenders(): Map<string, string[]> {
  const found = new Map<string, Set<string>>();
  for (const rel of sourceFiles()) {
    if (EXEMPT(rel)) continue;
    for (const hit of mockImports(rel)) {
      // A namespace/default import hides the member names, so it defeats a
      // named ban outright — treated as an offence in its own right.
      if (hit.wildcard) {
        if (!found.has(rel)) found.set(rel, new Set());
        found.get(rel)!.add("* (namespace or default import)");
        continue;
      }
      if (hit.typeOnly) continue; // types are erased; they carry no fixture
      for (const n of hit.names) {
        if (!BANNED.has(n)) continue;
        if (!found.has(rel)) found.set(rel, new Set());
        found.get(rel)!.add(n);
      }
    }
  }
  return new Map(
    [...found.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([rel, names]) => [rel, [...names].sort()]),
  );
}

// ── The allowlist ───────────────────────────────────────────────────────────
//
// Generated from the tree, not guessed (see findOffenders above). Every entry
// is a live surface reading beta-school fixture data. THIS LIST MUST ONLY
// SHRINK. When you fix a file, delete its line here in the same commit — the
// exact-equality assertion below fails if you don't.
//
// ── THE ONE TIME IT GREW, 2026-08-01, and why ──────────────────────────────
// `components/day-v2/Day{A,B,C}.tsx` are back on this list. They were deleted
// when /daily consolidated to a single Day view, which shrank the list for
// free — the mock imports did not get fixed, the files just stopped existing.
// The user then asked for the three views back ("keep all three of the views
// until later"), so the files returned and their pre-existing, unchanged mock
// imports returned with them.
//
// That is a restoration to the pre-deletion baseline, not new debt: no line
// here is a surface that did not already carry it. It is recorded rather than
// quietly re-added because a ratchet that moves backwards without an
// explanation is not a ratchet. The three are scheduled for deletion — when the
// user decides what to merge or drop, these lines go with the files (see
// components/day-v2/DayViewV2.tsx). Nothing else may use this precedent: a NEW
// surface reading fixtures still fails, which is the whole point.
const ALLOWLIST: readonly string[] = [
  "app/(planner)/post/PostClient.tsx",
  "app/(planner)/weekly/print/WeeklyPrintSheet.tsx",
  "app/settings/page.tsx",
  "app/settings/schedule/page.tsx",
  "components/appearance/live-preview.tsx",
  "components/appearance/subject-colors.tsx",
  "components/boards/BoardsHome.tsx",
  "components/boards/OpenInBoardDialog.tsx",
  "components/boards/TeachChooser.tsx",
  "components/chrome/ChromeClock.tsx",
  "components/daily/DayEditSplit.tsx",
  "components/daily/LessonDetail.tsx",
  "components/daily/Shoutbox.tsx",
  "components/day-v2/DayA.tsx",
  "components/day-v2/DayB.tsx",
  "components/day-v2/DayC.tsx",
  "components/day-v2/DayFocus.tsx",
  "components/home/rows.tsx",
  "components/list/DailyList.tsx",
  "components/resource-wall-v2/ResourceWall.tsx",
  "components/schedule/ScheduleBlock.tsx",
  "components/schedule/ScheduleRow.tsx",
  "components/shell/SearchResults.tsx",
  "components/shell/right-panel.tsx",
  "components/teach-v2/LessonRail.tsx",
  "components/teach-v2/TeachV2Shell.tsx",
  "components/teach/TeachWorkspace.tsx",
  "components/teach/left/modules/LessonCardModule.tsx",
  "components/teach/left/modules/LessonListModule.tsx",
  "components/teach/left/modules/NotesModule.tsx",
  "components/teach/library/BoardLibraryModule.tsx",
  "components/teach/library/RepeatScheduleEditor.tsx",
  "components/week-v2/WeekC.tsx",
  "components/weekly/WeekEditBoard.tsx",
  "components/weekly/WeeklyShellV1.tsx",
  "components/weekly/weekly-lesson-card.tsx",
  "lib/app-state.tsx",
  "lib/day-status.ts",
  "lib/deep-links.ts",
  "lib/home/today.ts",
  "lib/onboarding-state.tsx",
  "lib/onboarding-v2-shape.ts",
  "lib/palette.tsx",
  "lib/planner-store.tsx",
  "lib/planner/supabase-source.ts",
  "lib/realtime-presence.ts",
  "lib/search-index.ts",
  "lib/standards/items.ts",
  "lib/subject-order.ts",
  "lib/subjects/row.ts",
  "lib/teach/use-lesson-boards.ts",
  "lib/use-account-settings.ts",
  "lib/use-schedule-settings.ts",
  "lib/use-subject-settings.ts",
  "lib/use-visible-subjects.ts",
  "lib/week-edit-periods.ts",
];

const REMEDY = [
  "",
  "A live surface must not read tenant data from lib/mock. Use instead:",
  "  • subjects / units / lessons / standards → usePlanner() (lib/planner-store)",
  "  • the school week + weekday labels       → useSchoolWeek() (lib/use-school-week)",
  "  • the signed-in teacher (ME, TEACHERS)   → currentUser",
  "  • period times / dates (lessonTime, …)   → the schedule + calendar config",
  "",
  "If the import is genuinely sample content with no tenant meaning, add the",
  "export to SAMPLE_CONTENT in this file and say why in the commit message.",
].join("\n");

const format = (m: Map<string, string[]>) =>
  [...m.entries()].map(([rel, names]) => `  ${rel} → ${names.join(", ")}`).join("\n");

describe("lib/mock is not wired into live surfaces", () => {
  it("has no offender outside the allowlist, and no stale allowlist entry", () => {
    const offenders = findOffenders();
    const actual = [...offenders.keys()];

    const added = actual.filter((r) => !ALLOWLIST.includes(r));
    const fixed = ALLOWLIST.filter((r) => !actual.includes(r));

    // Exact equality is the ratchet: a NEW offender fails, and so does a
    // FIXED one still listed. The list can only shrink, and only on purpose.
    expect(
      actual,
      [
        added.length
          ? `NEW mock-fixture imports in live surfaces:\n${format(
              new Map(added.map((r) => [r, offenders.get(r)!])),
            )}\n${REMEDY}`
          : "",
        fixed.length
          ? `These files no longer import mock fixtures — delete them from ` +
            `ALLOWLIST in tests/no-mock-in-live-surfaces.test.ts:\n` +
            fixed.map((r) => `  ${r}`).join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).toEqual([...ALLOWLIST]);
  });

  it("classifies every name imported from lib/mock", () => {
    // Forward guard against decay. The ban is a fixed list of names, so a NEW
    // export added to lib/mock would be invisible to it. This fails the moment
    // an unclassified name is imported into a live surface, forcing the
    // catalog-vs-sample-content call to be made rather than defaulted.
    const unknown: string[] = [];
    for (const rel of sourceFiles()) {
      if (EXEMPT(rel)) continue;
      for (const hit of mockImports(rel)) {
        for (const n of hit.names) {
          if (!BANNED.has(n) && !SAMPLE_CONTENT.has(n)) unknown.push(`${rel} → ${n}`);
        }
      }
    }
    expect(
      unknown,
      `Unclassified lib/mock export(s). Add each name to BANNED (it stands in ` +
        `for real tenant data) or to SAMPLE_CONTENT (illustrative only) in ` +
        `tests/no-mock-in-live-surfaces.test.ts:\n${unknown.join("\n")}`,
    ).toEqual([]);
  });

  it("detects every import shape (Gate B — a control on the instrument)", () => {
    // If the specifier regex or the statement parser silently stopped
    // matching, the ratchet above would pass VACUOUSLY with an empty offender
    // set — the failure mode where a guard reports success it did not earn.
    //
    // The control is a literal rather than a named source file on purpose:
    // the whole point of the sweep is to delete these imports from real
    // files, so any live file pinned here is a control the sweep itself
    // eventually deletes, and the check would then fail for a reason that has
    // nothing to do with the parser. (That is exactly what happened when this
    // was first written against components/year/YearView.tsx.)
    const fixture = `
      import { SUBJECTS } from "@/lib/mock";
      import { CURRENT_WEEK } from "@/lib/mock/lessons";
      import { UNITS } from "./mock";
      import { TEACHERS } from "./mock/teachers";
      import { ME } from "../mock";
      import { STANDARDS } from "../../mock/standards";
      import {
        WEEK_DAYS,
        WEEK_DAYS_SHORT as SHORT,
      } from "@/lib/mock";
      import type { ShoutboxMessage } from "@/lib/mock";
      import * as everything from "@/lib/mock";
      import { useState } from "react";
      import { somethingElse } from "@/lib/mocked-thing";
    `;
    const hits = parseImports(fixture);
    const names = hits.flatMap((h) => h.names);

    // Both specifier shapes, at every depth, including the multi-line and
    // `as`-aliased forms.
    expect(names).toEqual(
      expect.arrayContaining([
        "SUBJECTS",
        "CURRENT_WEEK",
        "UNITS",
        "TEACHERS",
        "ME",
        "STANDARDS",
        "WEEK_DAYS",
        "WEEK_DAYS_SHORT",
        "ShoutboxMessage",
      ]),
    );
    // A type-only import is recognised AS type-only (it carries no fixture).
    expect(hits.find((h) => h.names.includes("ShoutboxMessage"))?.typeOnly).toBe(true);
    // A namespace import is caught, since it hides the member names.
    expect(hits.some((h) => h.wildcard)).toBe(true);
    // Non-mock specifiers are not swept up — "@/lib/mocked-thing" must not
    // match the lib/mock prefix.
    expect(names).not.toContain("useState");
    expect(names).not.toContain("somethingElse");
  });

  it("flags a namespace import, which would otherwise defeat a named ban", () => {
    const offenders = parseImports(`import * as mock from "@/lib/mock";`);
    expect(offenders[0]?.wildcard).toBe(true);
  });

  it("ignores banned names that appear only in comments", () => {
    // Comments are stripped before matching, so a file may still EXPLAIN the
    // banned pattern in prose without tripping the guard — otherwise the
    // documentation of the rule would violate the rule.
    const commentedOut = `
      // import { SUBJECTS } from "@/lib/mock";
      /* The old code read:
         import { CURRENT_WEEK } from "@/lib/mock";
         …replaced by usePlanner(). */
      import { usePlanner } from "@/lib/planner-store";
    `;
    expect(parseImports(stripComments(commentedOut))).toEqual([]);

    // …but a real import on a line that also carries a trailing comment is
    // still caught, so "hide it behind a comment" is not an escape hatch.
    const trailing = `import { SUBJECTS } from "@/lib/mock"; // TODO: replace`;
    expect(parseImports(stripComments(trailing)).flatMap((h) => h.names)).toContain(
      "SUBJECTS",
    );
  });

  it("enumerates top-level lib/ files, which a `lib/**` pathspec misses", () => {
    // The bug called out in sourceFiles(). lib/palette.tsx is top-level and is
    // a real offender; if enumeration regressed to a `**` pathspec it would
    // vanish from the sweep and the ratchet would quietly loosen.
    const files = sourceFiles();
    expect(files).toContain("lib/palette.tsx");
    expect(files).toContain("lib/day-status.ts");
    expect(files.length).toBeGreaterThan(600);
  });
});
