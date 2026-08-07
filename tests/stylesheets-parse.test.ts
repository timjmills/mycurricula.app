// stylesheets-parse.test.ts — every app stylesheet must actually PARSE.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// On 2026-08-07 `app/tokens.css` was committed to the working tree with a
// malformed comment. Every route on the dev server returned 500 — the whole
// app was down — while `npx tsc --noEmit`, `npm run lint` and the FULL
// `npm run test` (159 files, 2998 tests) all ran green. Two separate agents
// gated green against a site that would not boot.
//
// The gap is structural, not an oversight: vitest never puts a stylesheet
// through the Next CSS pipeline. `tokens.css` is imported by `app/layout.tsx`,
// but nothing in the suite renders that layout through a bundler, so a CSS
// syntax error is invisible to every gate we run before committing. It
// surfaces only in a browser, and only once someone loads a page.
//
// That is this repo's signature failure mode — a check that passes for a
// reason unrelated to its subject — so the fix is a check that reads the CSS
// as CSS.
//
// ── THE BUG THAT PROMPTED IT, because it will happen again ────────────────
// The comment contained the token `--amb-*/--duo-*`. The `*/` in the middle
// TERMINATES the comment, so everything after it was parsed as CSS and postcss
// failed with `Unknown word read`. It reads as perfectly ordinary prose to a
// human, and the reported error line pointed several lines PAST the real
// cause, which is why the first agent to look at it concluded the region was
// well-formed. Writing about wildcard token families (`--amb-*`, `--subj-*`)
// in comments is routine here, so `-*/` is a shape this codebase reaches for
// naturally. The second test below targets it by name.
//
// Uses postcss directly — already a dependency (Tailwind's own toolchain), so
// this adds nothing to install and asks the same parser Next would.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

/** Absolute path to a repo-relative file. */
const repo = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Every stylesheet the app ships, discovered rather than listed.
 *
 * A hard-coded list is the version of this test that silently stops covering
 * the file someone adds next — the same "silently narrower guard" failure the
 * suite has been bitten by before. `app/*.css` plus every CSS Module under
 * `components/` is the full surface today.
 */
function collectStylesheets(): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(repo("app"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".css")) out.push(`app/${entry.name}`);
  }

  const walk = (dir: string): void => {
    for (const entry of readdirSync(repo(dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else if (entry.name.endsWith(".css")) out.push(`${dir}/${entry.name}`);
    }
  };
  walk("components");

  return out.sort();
}

const STYLESHEETS = collectStylesheets();

describe("every app stylesheet parses", () => {
  // A positive control on the corpus itself. Without it, a discovery bug that
  // returned [] would make every assertion below vacuously true and this file
  // would report success while checking nothing — which is precisely the class
  // of failure it was written to end.
  it("finds a plausible corpus to check", () => {
    expect(STYLESHEETS.length).toBeGreaterThan(50);
    expect(STYLESHEETS).toContain("app/tokens.css");
    expect(STYLESHEETS).toContain("app/themes.css");
    expect(STYLESHEETS).toContain("app/chrome.css");
  });

  it.each(STYLESHEETS)("%s", (rel) => {
    const css = readFileSync(repo(rel), "utf8");
    // postcss throws a CssSyntaxError carrying line/column. Surfacing its
    // message verbatim matters: the raw error is what makes the break
    // findable, and this one reports a position PAST the true cause.
    expect(() => postcss.parse(css, { from: repo(rel) })).not.toThrow();
  });
});

describe("no comment closes itself early", () => {
  /**
   * A comment terminator cannot appear inside a CSS comment — it ends it. The
   * parse test above already catches the case where the escaping text happens
   * to be invalid CSS, but NOT the case where it happens to be VALID: then the
   * comment ends early, the prose becomes live rules, and the file parses
   * cleanly while meaning something nobody wrote. That variant is silent, so it
   * gets its own assertion rather than relying on luck.
   *
   * The pattern is a wildcard token family immediately followed by a slash
   * (hyphen, star, slash) rather than any terminator, because a legitimate
   * comment ending looks identical and a naive search would flag every comment
   * in the repo.
   *
   * NOTE TO WHOEVER EDITS THIS FILE: the offending sequence is deliberately
   * never written literally in any comment here. Doing so terminates the
   * comment you are reading. That is not hypothetical — the first draft of
   * this guard spelled it out on this very line and failed to compile, so the
   * test written to catch the bug was taken down by the bug. Describe it, or
   * put it in a string literal as the regex below does.
   */
  it.each(STYLESHEETS)("%s", (rel) => {
    const css = readFileSync(repo(rel), "utf8");
    const offenders: string[] = [];

    // Scan the RAW source, not comment bodies.
    //
    // The first version of this walked comments and tested each body for the
    // pattern, which CANNOT EVER FIRE: the body slice ends at the first
    // terminator, so the very characters being hunted are always just past its
    // end. It shipped as 273 assertions that were structurally incapable of
    // failing, and a mutation is the only reason that is known — arm A caught
    // the planted bug and this arm stayed green, which is what exposed it.
    //
    // Raw scanning has no such hole and, measured across all 273 stylesheets
    // today, no false positives either: a real comment terminator in this
    // repo is always preceded by whitespace or a box-drawing rule, never by a
    // hyphen. A comment that legitimately ends right after a wildcard token is
    // the same hazard wearing different clothes and should be rewritten too.
    const SEQ = "-" + "*" + "/";
    let at = css.indexOf(SEQ);
    while (at >= 0) {
      const line = css.slice(0, at).split("\n").length;
      offenders.push(
        `${rel}:${line} — "${SEQ}" ends a CSS comment early. ` +
          `Write "--amb-* and --duo-*", not the two joined by a slash.`,
      );
      at = css.indexOf(SEQ, at + SEQ.length);
    }

    expect(offenders, `\n${offenders.join("\n")}\n`).toEqual([]);
  });
});
