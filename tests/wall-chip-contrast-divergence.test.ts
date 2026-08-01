import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A TRIPWIRE FOR A DELIBERATE DIVERGENCE FROM THE DESIGN HANDOFF.
//
// components/resource-wall-v2/Section.module.css `.tag` (the /post section
// chip) does NOT use the handoff's number, on purpose:
//
//   handoff  resource-wall.css:276 — label mixes the subject 62% into #1c1b2e
//   shipped  Section.module.css    — label mixes the subject 48% into --ink-900
//
// At 62%, measured against this chip's own 14% subject fill, four of the eight
// locked subjects fail WCAG AA: gold 3.65:1, teal 4.01:1, green 4.05:1,
// apricot 4.26:1. The label is 11px bold — SMALL text, so the floor is 4.5:1,
// not 3:1. CLAUDE.md §4 makes AA non-negotiable and outranks the handoff on
// this one value. At 48% the worst case is gold 5.17:1.
//
// WHY A TEST AND NOT ONLY A COMMENT. The rule already carries a thorough
// comment (Section.module.css:194-210) and that comment is correctly placed.
// But §4a/§4b handoff-FIDELITY work is explicitly chartered to hunt for values
// that disagree with the handoff and reconcile them — which is precisely the
// motion that would "restore" 62% and silently reintroduce four AA failures.
// A reviewer diffing toward the handoff sees a number that matches the source
// of truth they were told to follow. This file is the thing that objects.
//
// DIRECTIONAL, NOT EXACT — deliberately. The assertions are `<=`, not `===`.
// Lowering either percentage moves TOWARD more contrast, so the accessibility
// lane (task #38, photo-bright) can keep tuning downward without tripping this;
// only a move back toward the handoff's weaker value fails. A test that pinned
// `=== 48` would block a legitimate improvement, and would then be deleted by
// whoever it blocked — taking the protection with it.
//
// WHAT THIS FILE CANNOT DO, stated so nobody reads it as more than it is:
// it pins the LITERAL VALUES in the stylesheet. It does not compute a contrast
// ratio — vitest runs `environment: "node"` with no jsdom, so there is no
// cascade, no resolved custom properties, and no rendered color here. Any
// ratio arithmetic in this file would be theatre. The measured ratios above
// came from the browser; re-measure there, not here.

const CSS_PATH = join(
  process.cwd(),
  "components",
  "resource-wall-v2",
  "Section.module.css",
);

/** Strip CSS comments BEFORE parsing. The `.tag` rule is heavily commented and
 *  those comments contain semicolons and the word `background`, so splitting a
 *  raw rule body on `;` mangles the declarations. The first version of this
 *  guard skipped this step and all three assertions failed on `undefined` —
 *  loudly, which is the only reason it was caught rather than passing vacuously
 *  on a rule it had never actually read. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The declarations of the first `.tag { ... }` rule (the light-tone base). */
function tagDeclarations(rawCss: string): string[] {
  const css = stripComments(rawCss);
  // Match `.tag` as a whole selector — not `.tagRow`, not `.tags`.
  const start = css.search(/^\.tag\s*\{/m);
  expect(
    start,
    "`.tag` rule not found in Section.module.css — the chip was renamed or the " +
      "file moved. Re-point this guard rather than deleting it; the divergence " +
      "it protects is an AA requirement, not a style preference.",
  ).toBeGreaterThan(-1);
  // Slice from AFTER the opening brace. Splitting the whole rule on `;` leaves
  // the selector glued to the FIRST declaration (`.tag {\n  background: …`), so
  // a lookup for whichever property happens to come first silently returns
  // undefined. In this stylesheet `display` is first, so the bug was invisible
  // against the real file and only the synthetic fixture below exposed it.
  const open = css.indexOf("{", start) + 1;
  const end = css.indexOf("}", open);
  return css
    .slice(open, end)
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
}

/** The declaration for `prop`, or undefined. */
function decl(decls: string[], prop: string): string | undefined {
  return decls.find((d) => new RegExp(`^${prop}\\s*:`).test(d));
}

/** The subject percentage from a `color-mix(in oklab, var(--sc…) N%, …)`.
 *  `var(--sc, var(--brand-500))` nests parentheses, so this anchors on the
 *  `--sc` token and takes the first percentage after it rather than trying to
 *  balance parens with a regex. */
function mixPercent(d: string): number {
  const m = d.match(/--sc\b[\s\S]*?(\d+(?:\.\d+)?)%/);
  expect(m, `no subject color-mix percentage found in: ${d}`).not.toBeNull();
  return Number(m![1]);
}

describe("/post section chip — the deliberate 48% divergence from the handoff", () => {
  const decls = tagDeclarations(readFileSync(CSS_PATH, "utf8"));

  it("keeps the label mix at or below 48% subject (handoff says 62% — do NOT restore it)", () => {
    const colorDecl = decl(decls, "color");
    expect(colorDecl, "`.tag` declares no `color`").toBeDefined();

    const pct = mixPercent(colorDecl!);
    expect(
      pct,
      `.tag label mixes the subject ${pct}% into --ink-900. The handoff's 62% ` +
        `fails WCAG AA on gold (3.65:1), teal (4.01), green (4.05) and apricot ` +
        `(4.26) against this chip's own 14% fill, at 11px bold where the floor ` +
        `is 4.5:1. CLAUDE.md §4 outranks the handoff here. If you raised this ` +
        `to match the handoff, revert it. If you are deliberately re-tuning ` +
        `contrast, LOWER it — this guard only objects to weakening.`,
    ).toBeLessThanOrEqual(48);
  });

  it("keeps the fill at or below 14% subject — the pair the ratio was measured against", () => {
    // The 48% was measured AGAINST this fill. Raising the fill re-tints the
    // backdrop the label sits on and invalidates the measurement, so the pair
    // has to move together or not at all.
    const bgDecl = decl(decls, "background");
    expect(bgDecl, "`.tag` declares no `background`").toBeDefined();

    const pct = mixPercent(bgDecl!);
    expect(
      pct,
      `.tag fill mixes the subject ${pct}% into --surface. The label's 48% was ` +
        `measured against a 14% fill; raising the fill darkens the backdrop and ` +
        `invalidates that measurement. Re-measure in the browser before moving ` +
        `either number.`,
    ).toBeLessThanOrEqual(14);
  });
});

// SEEN TO FAIL — WITHOUT EDITING A FILE ANOTHER LANE IS HOLDING.
//
// The usual proof is to revert the value in the stylesheet and watch this go
// red. That was NOT safe here: Section.module.css is uncommitted-dirty, being
// edited RIGHT NOW by the accessibility lane (task #38), and a mutate-then-
// restore would race their in-flight write. So the guard is proven against a
// synthetic fixture instead — the same parser, the same comparison, fed the
// handoff's own numbers, asserted to be REJECTED.
//
// This is strictly stronger than a one-shot manual mutation in one respect:
// it runs on every CI run, so the guard cannot rot into a tautology that
// passes because its parser silently stopped finding the rule.
describe("the guard itself rejects the handoff's values", () => {
  const HANDOFF_FIXTURE = `
.tag {
  /* a comment containing background: and a ; to exercise comment-stripping */
  background: color-mix(in oklab, var(--sc, var(--brand-500)) 20%, var(--surface));
  color: color-mix(in oklab, var(--sc, var(--brand-500)) 62%, var(--ink-900));
}
`;

  it("catches the 62% label mix that fails AA on four subjects", () => {
    const d = tagDeclarations(HANDOFF_FIXTURE);
    expect(mixPercent(decl(d, "color")!)).toBe(62);
    // 62 > 48 — the real assertion above would fail on this input.
    expect(mixPercent(decl(d, "color")!)).toBeGreaterThan(48);
  });

  it("catches a fill raised above the 14% the ratio was measured against", () => {
    const d = tagDeclarations(HANDOFF_FIXTURE);
    expect(mixPercent(decl(d, "background")!)).toBe(20);
    expect(mixPercent(decl(d, "background")!)).toBeGreaterThan(14);
  });

  it("parses declarations rather than comment prose", () => {
    // The fixture's comment contains `background:` and a semicolon. If comment
    // stripping regressed, `decl(…, "background")` would return the comment and
    // mixPercent would throw or read the wrong number — the exact failure the
    // first draft of this file had.
    const d = tagDeclarations(HANDOFF_FIXTURE);
    expect(d.some((x) => x.includes("comment containing"))).toBe(false);
    expect(decl(d, "background")).toMatch(/^background:\s*color-mix/);
  });
});
