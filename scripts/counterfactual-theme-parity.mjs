// COUNTERFACTUAL RUNNER for tests/theme-derivation-parity.test.ts.
//
//   node scripts/counterfactual-theme-parity.mjs
//   → exit 0 if every mutation turned the PREDICTED assertion red; 1 otherwise.
//
// ── WHAT IT MUTATES, AND WHAT IT RESTORES ──────────────────────────────────
// It mutates NOTHING in the working tree, so there is nothing to restore and no
// `finally` cleanup to get wrong. Each case COPIES one source file to a fresh
// temp dir, patches the COPY, and points the suite at it through the
// `MC_THEME_INIT_PATH` / `MC_MIGRATION_PATH` / `MC_PROBE_PATH` /
// `MC_LAYOUT_PATH` env redirects that the test reads. That is deliberate: this
// is a SHARED checkout with several lanes live in it, and a mutate-then-restore
// script races them — an interrupted run would leave someone else's file
// corrupted. The only artifact written under the repo is `.cf-result.json`
// (vitest's JSON reporter output), which is disposable.
//
// The four files it copies and patches:
//   lib/theme-init.tsx                                (M1, M2, M3)
//   supabase/migrations/20260624120000_v2_theme_axes.sql (M4, M5)
//   scripts/probe-theme-wave.mjs                      (M6)
//   app/layout.tsx                                    (M7)
//
// ── WHAT EACH CASE EXPECTS TO GO RED ───────────────────────────────────────
// Every case carries an `expect` field naming the assertion that MUST fail —
// declared in this file, in advance, not decided after reading the output. The
// runner reports three distinct outcomes, and only the first is a pass:
//   ✓ the predicted assertion went red
//   ⚠ a DIFFERENT assertion went red  → a FINDING, not a pass
//   ✗ nothing went red               → the guard does not catch that mutation
//
// That third outcome is not hypothetical. M7 (deleting `data-tone={ssrTone}`)
// initially failed to go red, because the assertion was
// `expect(layout).toContain("data-tone")` and app/layout.tsx:107 mentions
// "data-tone" in a PROSE COMMENT — so the substring check was satisfied by the
// comment and asserted nothing about what the server renders. The test now
// strips comments and requires the `data-x={` attribute form. Naming the
// expected assertion up front is the only reason that was caught.
//
// ── ONE MUTATED PROPERTY PER RUN ───────────────────────────────────────────
// Cases never compose. Two simultaneous mutations can turn the same assertion
// red for either reason, and the run then proves neither.
//
// A guard that has never been SEEN to fail is not evidence. This repo has
// shipped several instruments that reported success they had not earned, so the
// bar here is: for each mutation, NAME the assertion expected to go red BEFORE
// running it, and treat a DIFFERENT assertion going red as a finding rather
// than a pass.
//
// Two traps this runner is built against:
//   • CRLF. The working tree is CRLF; an anchor written with \n silently fails
//     to match, the patch is a no-op, vitest then reports GREEN against the
//     UNMODIFIED file, and the run reads as "the guard cannot fail". Every
//     anchor here is matched EOL-insensitively and a miss is a hard exit.
//   • Shared tree. Several lanes are live in this checkout, so nothing mutates
//     a real file: each case copies the source to a temp dir, mutates the copy,
//     and points the suite at it via the MC_*_PATH env redirects.
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const REPO = process.cwd();
const TEST = "tests/theme-derivation-parity.test.ts";
/** Vitest's own ESM entry, run directly by `process.execPath` so no shell,
 *  PATH lookup or .cmd shim sits between this script and the runner. */
const VITEST_BIN = join(REPO, "node_modules", "vitest", "vitest.mjs");

/** Match an anchor regardless of CRLF/LF, and fail HARD if it is absent. */
function patch(src, anchorLiteral, replacement, label) {
  // Build an EOL-insensitive pattern from the literal.
  const esc = anchorLiteral.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(esc.replace(/\r?\n/g, "\\r?\\n"));
  if (!pattern.test(src)) {
    console.error(`\n✗ ANCHOR MISS [${label}] — pattern not found:\n${anchorLiteral}\n`);
    console.error("Refusing to run the suite: a no-op patch would report GREEN");
    console.error("against the unmodified file and read as 'the guard cannot fail'.");
    process.exit(1);
  }
  const out = src.replace(pattern, replacement);
  if (out === src) {
    console.error(`\n✗ PATCH WAS A NO-OP [${label}]`);
    process.exit(1);
  }
  return out;
}

const CASES = [
  {
    id: "M1",
    file: "lib/theme-init.tsx",
    env: "MC_THEME_INIT_PATH",
    what: "boot script: drop the `bg === wash → light` branch",
    expect: "agrees on every (theme × glass × bg × dim) combination",
    // DECLARED COLLATERAL. Mutating the boot script's tone derivation breaks
    // every assertion that exercises that derivation, and these two do — the
    // sentinel case and the v1 remap both run tone through the same code. They
    // are legitimate consequences, not coupling.
    //
    // Be honest about provenance: these were OBSERVED first and justified
    // second, not predicted blind. That is weaker evidence than the primary
    // `expect`, and it is why they are listed explicitly rather than the check
    // being loosened to "one or more reds". Declaring them keeps the rule sharp
    // — any red OUTSIDE this set still fails the case, so future drift shows up.
    alsoExpect: [
      "the `system` sentinel resolves via prefers-color-scheme, both ways",
      "the v1 paper|cloud themes remap to clear and still derive in parity",
    ],
    anchor: `    else if (b === "wash") tone = "light";`,
    replace: `    else if (b === "__never__") tone = "light";`,
  },
  {
    id: "M2",
    file: "lib/theme-init.tsx",
    env: "MC_THEME_INIT_PATH",
    what: "boot script: flip the FALL-THROUGH default dark → light",
    // This is the whole point of the exercise: the boot replica omits
    // deriveTone's explicit `dim === "dim" → dark` branch and is correct only
    // by falling through to this default. If flipping it does NOT go red, the
    // fall-through is not actually load-bearing and the documented fragility is
    // wrong.
    expect: "agrees on every (theme × glass × bg × dim) combination",
    // Same derivation, so the v1 remap case rides along. See M1 on provenance.
    alsoExpect: [
      "the v1 paper|cloud themes remap to clear and still derive in parity",
    ],
    anchor: `    else tone = "dark";`,
    replace: `    else tone = "light";`,
  },
  {
    id: "M3",
    file: "lib/theme-init.tsx",
    env: "MC_THEME_INIT_PATH",
    what: "boot script: drop `color` from the frames array",
    expect: "surface 2 — the boot script's inline arrays match the canonical guards",
    // Removing a value from the boot array also stops the boot populating that
    // axis, so the "executes and populates every axis attribute" case goes red
    // too. Expected. See M1 on provenance.
    alsoExpect: ["executes and populates every axis attribute"],
    anchor: `var frames = ["glass","paper","color"];`,
    replace: `var frames = ["glass","paper"];`,
  },
  {
    id: "M4",
    file: "supabase/migrations/20260624120000_v2_theme_axes.sql",
    env: "MC_MIGRATION_PATH",
    what: "SQL: drop `color` from the frame CHECK",
    expect: "surface 3 — the SQL CHECK constraints match the canonical guards",
    anchor: `check (frame is null or frame in ('glass', 'paper', 'color'));`,
    replace: `check (frame is null or frame in ('glass', 'paper'));`,
  },
  {
    id: "M5",
    file: "supabase/migrations/20260624120000_v2_theme_axes.sql",
    env: "MC_MIGRATION_PATH",
    what: "SQL: sneak an unlisted value into the theme CHECK",
    expect: "surface 3 — the theme CHECK is a documented SUPERSET, not an exact match",
    anchor: `    'paper', 'cloud',`,
    replace: `    'paper', 'cloud', 'pastel',`,
  },
  {
    id: "M6",
    file: "scripts/probe-theme-wave.mjs",
    env: "MC_PROBE_PATH",
    what: "probe: drop `bright` from DIM_VALUES",
    expect: "surface 5 — the wave probe's arrays match the canonical guards",
    anchor: `const DIM_VALUES = ["dim", "normal", "bright"];`,
    replace: `const DIM_VALUES = ["dim", "normal"];`,
  },
  {
    id: "M7",
    file: "app/layout.tsx",
    env: "MC_LAYOUT_PATH",
    what: "layout: stop emitting data-tone",
    expect: "surface 4 — app/layout.tsx emits every axis and DERIVES tone rather than guessing",
    anchor: `      data-tone={ssrTone}`,
    replace: `      data-XXXX={ssrTone}`,
  },
];

/** Run vitest against the suite and return { failed:[names], total }.
 *
 *  THE REPORT FILE IS PER-INVOCATION AND MUST BE FRESH. An earlier version wrote
 *  every run to a fixed `.cf-result.json` in the repo root and swallowed launch
 *  failures, which gave this script the exact defect it exists to detect: if
 *  vitest died before writing a report (missing dep, bad startup, interrupt),
 *  the previous run's file was still there and got parsed as this run's result —
 *  a stale GREEN baseline, or a mutation credited as "correctly detected", with
 *  no error anywhere. A verification instrument that cannot fail is worse than
 *  no instrument, and this one is supposed to be the proof that other guards
 *  can fail.
 *
 *  The shared-checkout half matters just as much: several agents run in this one
 *  working tree, so a repo-local report can be overwritten by a concurrent run
 *  between vitest finishing and readFileSync — silently attributing one
 *  mutation's result to another. Both are fixed by writing into a fresh temp
 *  directory per invocation and refusing to proceed without a readable report. */
function runSuite(env) {
  const outDir = mkdtempSync(join(tmpdir(), "cf-theme-"));
  const outFile = join(outDir, "result.json");
  // Start from a CLEAN redirect set every run. `{ ...process.env }` alone would
  // inherit any MC_*_PATH left in the shell — which would silently point the
  // "canonical" baseline, or an unrelated case's untouched surfaces, at some
  // other file. The baseline would then come back green without ever having
  // tested the repository sources: a pass the run did not earn, which is the one
  // outcome this script exists to make impossible.
  const clean = { ...process.env };
  for (const k of ["MC_THEME_INIT_PATH", "MC_MIGRATION_PATH", "MC_PROBE_PATH", "MC_LAYOUT_PATH"]) {
    delete clean[k];
  }
  try {
    try {
      // NO SHELL. This used to be `npx … { shell: true }`, which joins argv on
      // spaces and re-parses it: a temp path under a profile like
      // "C:\Users\Jane Smith\…" would split `--outputFile=` mid-argument, and a
      // TMP containing shell metacharacters would be interpreted rather than
      // passed. Either way the run fails or does something unintended — in a
      // script whose only job is to be trustworthy. Invoking vitest's own JS
      // entry point with the current node binary removes the shell, the PATH
      // lookup and the .cmd-shim indirection in one step, and is portable.
      execFileSync(
        process.execPath,
        [VITEST_BIN, "run", TEST, "--reporter=json", `--outputFile=${outFile}`],
        { cwd: REPO, env: { ...clean, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      /* A non-zero exit is EXPECTED when the mutation bites, so it cannot be
         treated as an error here. The report's existence is what separates
         "tests ran and some failed" from "vitest never started" — which is
         precisely why the check below is not optional. */
    }
    let raw;
    try {
      raw = JSON.parse(readFileSync(outFile, "utf8"));
    } catch (err) {
      throw new Error(
        `vitest produced no readable JSON report at ${outFile} — it almost certainly ` +
          `failed to start. Refusing to report a result rather than parsing a stale ` +
          `one. Underlying error: ${err.message}`,
      );
    }
    const failed = [];
    for (const suite of raw.testResults ?? []) {
      for (const t of suite.assertionResults ?? []) {
        if (t.status === "failed") failed.push(t.title);
      }
    }
    const total = raw.numTotalTests ?? 0;
    if (total === 0) {
      throw new Error(
        "vitest reported 0 total tests — the suite did not run. A run that " +
          "executes nothing reports zero failures, which is indistinguishable " +
          "from a passing baseline unless it is caught here.",
      );
    }
    return { failed, total };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

console.log("═══ BASELINE — unmutated, must be fully GREEN ═══");
const base = runSuite({});
console.log(`   ${base.total} tests, ${base.failed.length} failed`);
if (base.failed.length !== 0) {
  console.error("✗ baseline is not green; fix that before trusting any counterfactual");
  console.error(base.failed.join("\n"));
  process.exit(1);
}
console.log("   BASELINE GREEN ✓\n");

let allOK = true;
for (const c of CASES) {
  console.log(`═══ ${c.id} — ${c.what}`);
  console.log(`   PREDICTED RED (named before running): "${c.expect}"`);

  const dir = mkdtempSync(join(tmpdir(), `mc-cf-${c.id}-`));
  let res;
  try {
    const dest = join(dir, basename(c.file));
    copyFileSync(join(REPO, c.file), dest);
    const src = readFileSync(dest, "utf8");
    writeFileSync(dest, patch(src, c.anchor, c.replace, c.id), "utf8");
    console.log("   PATCH APPLIED");
    res = runSuite({ [c.env]: dest });
  } finally {
    // Disposable means disposed. Without this every run leaks a copy of a
    // source file into the system temp dir, which contradicts the script's
    // own "only artifact is temporary" claim.
    rmSync(dir, { recursive: true, force: true });
  }
  const hit = res.failed.includes(c.expect);
  if (res.failed.length === 0) {
    console.log(`   ✗ NO TEST FAILED — the guard did NOT catch this mutation.`);
    allOK = false;
  } else if (hit) {
    // The predicted assertion went red — necessary, but NOT sufficient.
    //
    // This script's whole premise is "name the assertion you expect to fail
    // BEFORE running, and if a different one goes red that is a finding, not a
    // pass." An earlier version printed extra failures as a parenthetical and
    // still scored the case ✓, which quietly exempted itself from its own rule:
    // a mutation that ALSO broke three unrelated assertions read as a clean
    // result. That hides both over-coupled tests and mutations with a wider
    // blast radius than intended — and it is the same shape as the M7 bug this
    // script exists to have caught (an assertion that could not fail).
    //
    // So the bar is EXACTLY the predicted assertion and nothing else. An extra
    // red is not noise to be logged; it means the case did not demonstrate what
    // it claimed, and it fails.
    const declared = new Set([c.expect, ...(c.alsoExpect ?? [])]);
    const undeclared = res.failed.filter((f) => !declared.has(f));
    if (undeclared.length === 0) {
      const n = (c.alsoExpect ?? []).length;
      console.log(`   ✓ RED as predicted${n ? `, plus ${n} declared collateral` : `, and ONLY that assertion`}`);
    } else {
      console.log(`   ⚠ AN UNDECLARED ASSERTION WENT RED — that is a FINDING, not a pass.`);
      console.log(`     predicted:  ${c.expect}`);
      if ((c.alsoExpect ?? []).length) console.log(`     declared:   ${c.alsoExpect.join(" | ")}`);
      console.log(`     UNDECLARED: ${undeclared.join(" | ")}`);
      console.log(`     Either the mutation is broader than intended, or those`);
      console.log(`     assertions are coupled to something they should not be.`);
      allOK = false;
    }
  } else {
    console.log(`   ⚠ WRONG ASSERTION WENT RED — that is a FINDING, not a pass.`);
    console.log(`     expected: ${c.expect}`);
    console.log(`     actual:   ${res.failed.join(" | ")}`);
    allOK = false;
  }
  console.log("");
}

console.log(allOK ? "ALL COUNTERFACTUALS BEHAVED AS PREDICTED ✓" : "SOME COUNTERFACTUALS DID NOT ✗");
process.exit(allOK ? 0 : 1);
