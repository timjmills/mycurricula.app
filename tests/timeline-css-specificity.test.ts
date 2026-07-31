// timeline-css-specificity.test.ts — the standing guard against the CSS trap
// that killed three separate rules in this stylesheet on 2026-07-31.
//
// WHY A GENERAL GUARD AND NOT A THIRD SPECIFIC ASSERTION. The trap has one
// cause and three faces, and each face was found only after it shipped:
//
//   1  `.cp-root button` (app/tokens.css:1128) is (0,1,1); a single-class
//      module rule is (0,1,0). The axis-scroll arrows computed to 5.1 × 28px.
//   2  A DOUBLED base beats a single-class override inside a `@media` block —
//      media queries add no specificity — so the coarse-pointer bump was inert.
//   3  A doubled base also beats a single-class MODIFIER on the same element.
//      `.rowDot` (0,1,0) lost `position`, `transform`, `width` and `height` to
//      `.dot.dot` (0,2,0); only `flex` survived, because it is the one property
//      the base does not declare. The list's row dot rendered as a lane mark:
//      absolutely positioned, dragged up-and-left by translate(-50%,-50%), 22px
//      of it clipped away by its own `overflow:hidden` row and overlapping the
//      lesson title by 22px on a coarse pointer
//      (scripts/probe-timeline-row-dot.mjs, seen to fail before the fix).
//
// tests/plan-timeline-controls.test.ts pins face 1 for the five classes that
// were known to be affected. This file pins ALL THREE for EVERY class in the
// stylesheet, derived from the stylesheet and the components themselves, so a
// class added tomorrow is covered without anyone remembering to add it here.
//
// WHAT THIS FILE CANNOT DO. It reasons about specificity, not about layout —
// vitest runs `environment: "node"` with no jsdom, so there is no cascade and
// no geometry to measure here, and an assertion that claimed otherwise would be
// theatre. The rendered consequence is measured in Chrome by
// scripts/probe-timeline-row-dot.mjs. This file is the tripwire; that is the
// instrument.
//
// SEEN TO FAIL. Reverting `.rowDot.rowDot` to `.rowDot` in
// components/hub-v2/timeline/timeline.module.css turns `mechanism 3` red with:
//   `.rowDot` is composed onto the same element as `.dot`, and both declare
//   position/transform/width/height, but `.dot` is written with 2 class
//   repetitions and `.rowDot` with 1 — the modifier is dead.
// Reverting `.dot.dot[data-dim]` to `.dot[data-dim]` turns `mechanism 1/2` red.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(
  new URL("../components/hub-v2/timeline/", import.meta.url),
);
const CSS_PATH = `${DIR}timeline.module.css`;
const CSS = readFileSync(CSS_PATH, "utf8");

/* ────────────────────────────────────────────────────────────────────────────
   A very small CSS reader.
   Only what this guard needs: every declaration block's selector list, its
   source offset, and the NAMES of the properties it declares (values are
   irrelevant — the question is only ever "do these two rules fight over the
   same property"). At-rules are walked into rather than skipped, because face 2
   of the trap lives entirely inside `@media`.
   ──────────────────────────────────────────────────────────────────────────── */

interface Rule {
  /** The full selector list, as written. */
  selector: string;
  /** Byte offset of the selector in the ORIGINAL file — the source order key. */
  index: number;
  /** `@media (...)` if the rule is nested in one, else null. For reporting. */
  atRule: string | null;
  /** Declared property names, lower-cased. */
  props: Set<string>;
}

/** Blank out comments PRESERVING LENGTH, so every offset still lines up with
 *  the real file — this stylesheet names its own selectors in prose, and a
 *  prose mention is not a rule. */
const MASKED = CSS.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

function readRules(
  text: string,
  start: number,
  end: number,
  atRule: string | null,
  out: Rule[],
): void {
  let i = start;
  let preludeStart = start;
  while (i < end) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(preludeStart, i).trim();
      // Find the matching close brace.
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const bodyStart = i + 1;
      const bodyEnd = j - 1;
      if (prelude.startsWith("@")) {
        // An at-rule WITH a block: walk into it. `@media` and `@supports` hold
        // rules; `@keyframes` holds percentage selectors, which carry no class
        // and so contribute nothing either way.
        readRules(text, bodyStart, bodyEnd, prelude, out);
      } else if (prelude) {
        const props = new Set<string>();
        for (const decl of text.slice(bodyStart, bodyEnd).split(";")) {
          const colon = decl.indexOf(":");
          if (colon < 0) continue;
          const name = decl.slice(0, colon).trim().toLowerCase();
          // A nested block's leftovers would land here as junk; a real property
          // name is a plain identifier (or a `--custom` one).
          if (/^-{0,2}[a-z][a-z0-9-]*$/.test(name)) props.add(name);
        }
        out.push({
          selector: prelude,
          index: preludeStart + (text.slice(preludeStart, i).length - text.slice(preludeStart, i).trimStart().length),
          atRule,
          props,
        });
      }
      i = j;
      preludeStart = i;
      continue;
    }
    if (ch === "}") {
      i++;
      preludeStart = i;
      continue;
    }
    i++;
  }
}

const RULES: Rule[] = [];
readRules(MASKED, 0, MASKED.length, null, RULES);

/** The line a rule starts on, for a failure message a human can act on. */
const lineOf = (index: number) => CSS.slice(0, index).split("\n").length;

/* ────────────────────────────────────────────────────────────────────────────
   Selector analysis.
   ──────────────────────────────────────────────────────────────────────────── */

interface Simple {
  rule: Rule;
  /** One selector out of the rule's comma list, as written. */
  text: string;
  /** `""`, `"::before"`, … — a rule only ever competes within its own group. */
  pseudoElement: string;
  /** True when the selector is a SINGLE compound (no descendant/child/sibling
   *  combinator). Contextual selectors are deliberately out of scope: an
   *  ancestor qualifier is a considered escalation, not the accident this file
   *  hunts. Stated as a limitation rather than hidden. */
  bare: boolean;
  /** class name → how many times it is repeated in the SUBJECT compound. */
  repeats: Map<string, number>;
  /** The selector's real specificity — what actually decides the cascade. */
  spec: [number, number, number];
}

const COMBINATOR = /[\s>+~]/;

/**
 * CSS specificity as (ids, classes+attributes+pseudo-classes, types+pseudo-elements).
 *
 * REAL ARITHMETIC, not a count of how many times a class is repeated. The
 * difference is not academic: `.dot.dot[data-state="taught"]::before` is
 * (0,3,1) and `.rowDot.rowDot::before` would be (0,2,1), so a modifier written
 * to the file's own doubling convention STILL loses to an attribute-qualified
 * base. A guard that only counted repetitions would score that pair as fine —
 * green against a real instance of the bug, which is worse than no guard.
 *
 * `:not()` / `:has()` contribute the MAX specificity of their arguments and
 * nothing for themselves, per selectors-4. `:is()` / `:where()` are refused
 * outright by a test above rather than mis-scored here.
 */
export function specificity(sel: string): [number, number, number] {
  let s = sel;
  const acc: [number, number, number] = [0, 0, 0];
  // Functional pseudo-classes first: recurse, then blank the whole call out so
  // the outer scan cannot double-count what is inside the parentheses.
  s = s.replace(/:(?:not|has)\(([^()]*)\)/g, (_all, inner: string) => {
    let best: [number, number, number] = [0, 0, 0];
    for (const arg of inner.split(",")) {
      const c = specificity(arg.trim());
      if (c[0] * 10000 + c[1] * 100 + c[2] > best[0] * 10000 + best[1] * 100 + best[2]) best = c;
    }
    acc[0] += best[0];
    acc[1] += best[1];
    acc[2] += best[2];
    return " ";
  });
  // Pseudo-ELEMENTS before pseudo-classes — `::before` must not be read as a
  // `:before` pseudo-class, which would score it in the wrong column.
  s = s.replace(/::[a-zA-Z-]+/g, () => {
    acc[2] += 1;
    return " ";
  });
  s = s.replace(/\[[^\]]*\]/g, () => {
    acc[1] += 1;
    return " ";
  });
  s = s.replace(/#[A-Za-z_][A-Za-z0-9_-]*/g, () => {
    acc[0] += 1;
    return " ";
  });
  s = s.replace(/\.[A-Za-z_][A-Za-z0-9_-]*/g, () => {
    acc[1] += 1;
    return " ";
  });
  s = s.replace(/:[a-zA-Z-]+/g, () => {
    acc[1] += 1;
    return " ";
  });
  for (const t of s.split(/[\s>+~]+/)) if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(t)) acc[2] += 1;
  return acc;
}

const rank = (a: [number, number, number]) => a[0] * 10000 + a[1] * 100 + a[2];
const showSpec = (a: [number, number, number]) => `(${a[0]},${a[1]},${a[2]})`;

/** What `.cp-root button` (app/tokens.css:1128) costs to beat. */
const RESET_SPECIFICITY: [number, number, number] = [0, 1, 1];

function analyse(rule: Rule): Simple[] {
  const out: Simple[] = [];
  for (const raw of splitSelectorList(rule.selector)) {
    const text = raw.trim();
    if (!text) continue;
    const pm = text.match(/::[a-z-]+/);
    const pseudoElement = pm ? pm[0] : "";
    const withoutPseudo = pseudoElement ? text.split(pseudoElement).join("") : text;
    // The SUBJECT compound is the last one — the element the rule actually
    // styles. Splitting on combinators outside brackets/parens keeps
    // `[data-x="a b"]` and `:not(a b)` intact.
    const compounds = splitCompounds(withoutPseudo);
    const subject = compounds[compounds.length - 1] ?? "";
    const repeats = new Map<string, number>();
    for (const m of subject.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
      repeats.set(m[1], (repeats.get(m[1]) ?? 0) + 1);
    }
    out.push({
      rule,
      text,
      pseudoElement,
      bare: compounds.length === 1 && !COMBINATOR.test(withoutPseudo.trim()),
      repeats,
      spec: specificity(text),
    });
  }
  return out;
}

/** Split on top-level commas only (`:not(a, b)` must survive intact). */
function splitSelectorList(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  parts.push(buf);
  return parts;
}

/** Split a complex selector into compounds on top-level combinators. */
function splitCompounds(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s.trim()) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && COMBINATOR.test(ch)) {
      if (buf) parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) parts.push(buf);
  return parts;
}

const SIMPLES: Simple[] = RULES.flatMap(analyse);

/* ────────────────────────────────────────────────────────────────────────────
   What the components actually put on an element.
   Read from the TSX, not from a hand-kept list: the point of this file is that
   nobody has to remember to update it.
   ──────────────────────────────────────────────────────────────────────────── */

interface Usage {
  file: string;
  /** The JSX tag the className sits on — `button` is the one that meets the
   *  `.cp-root button` reset. */
  tag: string;
  /** The `styles.X` names composed onto that one element, in written order. */
  classes: string[];
}

function readUsages(): Usage[] {
  const out: Usage[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".tsx"))) {
    const src = readFileSync(`${DIR}${file}`, "utf8");
    for (const m of src.matchAll(/className=/g)) {
      const at = m.index;
      // The enclosing element is the nearest `<tag` before the attribute.
      const before = src.slice(0, at);
      const tagMatch = [...before.matchAll(/<([A-Za-z][A-Za-z0-9.]*)/g)].pop();
      const tag = tagMatch ? tagMatch[1] : "?";
      // The attribute value: a balanced `{…}` expression or a quoted string.
      const rest = src.slice(at + "className=".length);
      let value = "";
      if (rest[0] === "{") {
        let depth = 0;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "{") depth++;
          else if (rest[i] === "}") {
            depth--;
            if (depth === 0) {
              value = rest.slice(0, i + 1);
              break;
            }
          }
        }
      } else {
        const q = rest[0];
        const end = rest.indexOf(q, 1);
        value = end < 0 ? "" : rest.slice(0, end + 1);
      }
      const classes = [...value.matchAll(/styles\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(
        (c) => c[1],
      );
      if (classes.length) out.push({ file, tag, classes });
    }
  }
  return out;
}

const USAGES = readUsages();

/** The greatest number of times a class is repeated in any BARE rule of a given
 *  pseudo-element group. This is the currency of the whole trap: the fix is
 *  always "repeat the class more times", never "add an ancestor". */
function maxRepeat(cls: string, pseudo: string): number {
  let n = 0;
  for (const s of SIMPLES) {
    if (!s.bare || s.pseudoElement !== pseudo) continue;
    n = Math.max(n, s.repeats.get(cls) ?? 0);
  }
  return n;
}

function bareRules(cls: string, pseudo: string): Simple[] {
  return SIMPLES.filter(
    (s) => s.bare && s.pseudoElement === pseudo && (s.repeats.get(cls) ?? 0) > 0,
  );
}

const PSEUDO_GROUPS = [...new Set(SIMPLES.map((s) => s.pseudoElement))];

/* ──────────────────────────────────────────────────────────────────────────── */

describe("timeline.module.css — the reader itself", () => {
  // THE POSITIVE CONTROL for every assertion below. A parser that silently
  // produced nothing would make this whole file a green no-op, which is the
  // exact fails-open shape the stylesheet's own header warns about.
  it("parsed a plausible stylesheet and a plausible set of components", () => {
    expect(RULES.length, "no rules parsed").toBeGreaterThan(80);
    expect(SIMPLES.length).toBeGreaterThan(RULES.length);
    expect(USAGES.length, "no className usages found in the .tsx files").toBeGreaterThan(30);
    // The three known-doubled anchors, found by the parser rather than asserted
    // by grep — if the reader stops seeing these, it has stopped seeing anything.
    expect(maxRepeat("dot", "")).toBe(2);
    expect(maxRepeat("band", "")).toBe(2);
    expect(maxRepeat("row", "")).toBe(2);
    // And it can see inside a media query, which is where face 2 lives.
    expect(RULES.some((r) => r.atRule?.startsWith("@media"))).toBe(true);
  });

  it("contains no selector this reader cannot reason about", () => {
    // `:is()` / `:where()` change how specificity is computed, and this reader
    // does not model them. Rather than quietly mis-scoring such a selector, the
    // guard refuses it — the day one is introduced, this test says so.
    const unsupported = SIMPLES.filter((s) => /:is\(|:where\(/.test(s.text));
    expect(
      unsupported.map((s) => `${s.text} (line ${lineOf(s.rule.index)})`),
      ":is()/:where() need the reader taught about them before this guard can score them",
    ).toEqual([]);
  });
});

describe("the specificity calculator itself", () => {
  // THE GUARD'S OWN ARITHMETIC, checked against hand-computed values. Every
  // verdict below is a comparison of two of these tuples, so a calculator that
  // was quietly wrong would make the whole file agree with itself and with
  // nothing else. These are the shapes this stylesheet actually contains.
  it.each([
    [".dot", [0, 1, 0]],
    [".dot.dot", [0, 2, 0]],
    [".dot.dot::before", [0, 2, 1]],
    ['.dot.dot[data-state="taught"]::before', [0, 3, 1]],
    [".dot.dot:hover::before", [0, 3, 1]],
    [".rowDot.rowDot", [0, 2, 0]],
    [".cp-root button", [0, 1, 1]],
    ['.card[data-lens="lessons"] .dot.dot::before', [0, 4, 1]],
    [".zoomReset.zoomReset:not(:disabled):hover", [0, 4, 0]],
    ["button", [0, 0, 1]],
    ["#id .a", [1, 1, 0]],
  ])("scores `%s`", (sel, want) => {
    expect(specificity(sel as string)).toEqual(want);
  });

  it("ranks the pair that caused the defect the right way round", () => {
    // The whole bug in one assertion.
    expect(rank(specificity(".rowDot"))).toBeLessThan(rank(specificity(".dot.dot")));
    expect(rank(specificity(".rowDot.rowDot"))).toEqual(rank(specificity(".dot.dot")));
    // And the blind spot that repetition-counting would have missed.
    expect(rank(specificity(".rowDot.rowDot::before"))).toBeLessThan(
      rank(specificity('.dot.dot[data-state="taught"]::before')),
    );
  });
});

describe("mechanism 1/2 — a doubled class must be doubled EVERYWHERE", () => {
  // NOTE ON WHAT KIND OF CHECK THIS IS. Unlike the two below, this one compares
  // REPETITION COUNTS, not specificity — deliberately. It enforces the file's
  // written convention (see the header of timeline.module.css): once a class is
  // doubled, it is doubled everywhere. That is stricter than the cascade
  // strictly requires, and it can in principle object to a legitimate
  // `.X[data-y]` (0,2,0) sitting beside `.X.X` (0,2,0). It has no such case
  // today, and the failure mode is a LOUD false positive rather than a silent
  // pass — which is the right way round for a convention check.
  // Face 1 is the `.cp-root button` reset; face 2 is the same rule re-declared
  // single-class inside a media query, which adds no specificity and is
  // therefore dead on arrival. One check covers both: within a pseudo-element
  // group, a class is either doubled in every bare rule or in none.
  const cases: { cls: string; pseudo: string }[] = [];
  for (const pseudo of PSEUDO_GROUPS) {
    for (const cls of new Set(SIMPLES.flatMap((s) => [...s.repeats.keys()]))) {
      if (maxRepeat(cls, pseudo) >= 2) cases.push({ cls, pseudo });
    }
  }

  it("found doubled classes to check", () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  it.each(cases)("`.$cls` ($pseudo) is never written single-class", ({ cls, pseudo }) => {
    const want = maxRepeat(cls, pseudo);
    const offenders = bareRules(cls, pseudo)
      .filter((s) => (s.repeats.get(cls) ?? 0) < want)
      .map(
        (s) =>
          `line ${lineOf(s.rule.index)}: \`${s.text}\`${s.rule.atRule ? ` inside ${s.rule.atRule}` : ""} — repeats .${cls} ${s.repeats.get(cls)}x, needs ${want}x`,
      );
    expect(
      offenders,
      `\`.${cls}\` is doubled elsewhere, so these rules are DEAD (a media query adds no specificity)`,
    ).toEqual([]);
  });
});

describe("mechanism 1 — a class on a <button> must out-specify `.cp-root button`", () => {
  // `.cp-root button` is (0,1,1). A single-class rule is (0,1,0) and loses its
  // padding, border, background, font-size and cursor without a word.
  const buttonClasses = [
    ...new Set(
      USAGES.filter((u) => u.tag === "button").flatMap((u) => u.classes),
    ),
  ].filter((cls) => bareRules(cls, "").length > 0);

  it("found button classes to check", () => {
    expect(buttonClasses.length).toBeGreaterThan(3);
  });

  it.each(buttonClasses)("`.%s` out-specifies the reset", (cls) => {
    // Only the properties the reset actually takes. A class whose rule sets
    // nothing but layout has nothing to lose to it, and demanding doubling
    // there would be cargo cult.
    const RESET = new Set([
      "font-family",
      "font-size",
      "color",
      "background",
      "background-color",
      "border",
      "border-width",
      "border-color",
      "border-style",
      "padding",
      "cursor",
    ]);
    // SPECIFICITY, not repetition count. `.row:hover` is (0,2,0) and already
    // beats the reset without being doubled — scoring it by repetitions called
    // that a defect, which is a guard crying wolf about correct code. The
    // question is only ever "does this rule out-rank (0,1,1)".
    const exposed = bareRules(cls, "").filter(
      (s) =>
        rank(s.spec) <= rank(RESET_SPECIFICITY) &&
        [...s.rule.props].some(
          (p) => RESET.has(p) || p.startsWith("padding-") || p.startsWith("border-"),
        ),
    );
    expect(
      exposed.map(
        (s) =>
          `line ${lineOf(s.rule.index)}: \`${s.text}\` ${showSpec(s.spec)} sets ${[...s.rule.props].join(", ")}`,
      ),
      `\`.${cls}\` is on a <button>; these rules do not out-rank \`.cp-root button\` ${showSpec(RESET_SPECIFICITY)} and lose those properties to it`,
    ).toEqual([]);
  });
});

describe("mechanism 3 — a modifier must out-rank the base it is composed onto", () => {
  // `${styles.dot} ${styles.rowDot}` puts both classes on ONE element. Every
  // property they both declare resolves by specificity first and source order
  // second — so a modifier written with fewer class repetitions than its base
  // is dead, and a modifier written ABOVE its base is dead too.
  const pairs: { base: string; modifier: string; where: string }[] = [];
  for (const u of USAGES) {
    for (let i = 0; i < u.classes.length; i++) {
      for (let j = i + 1; j < u.classes.length; j++) {
        pairs.push({
          base: u.classes[i],
          modifier: u.classes[j],
          where: `${u.file} <${u.tag}>`,
        });
      }
    }
  }

  it("found composed class pairs to check", () => {
    // If this ever hits zero the whole describe block is vacuous — which is
    // precisely how a dead rule survives a green suite.
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.some((p) => p.base === "dot" && p.modifier === "rowDot")).toBe(true);
    expect(pairs.some((p) => p.base === "dot" && p.modifier === "legendDot")).toBe(true);
  });

  it.each(pairs)(
    "`.$modifier` beats `.$base` for every property they share ($where)",
    ({ base, modifier }) => {
      const problems: string[] = [];
      for (const pseudo of PSEUDO_GROUPS) {
        for (const b of bareRules(base, pseudo)) {
          for (const m of bareRules(modifier, pseudo)) {
            // Only properties BOTH rules set can be lost. A modifier that
            // declares something its base does not (`.rowDot`'s `flex`) applies
            // regardless — which is exactly why the dead rule looked alive.
            const shared = [...m.rule.props].filter((p) => b.rule.props.has(p));
            if (!shared.length) continue;
            // SPECIFICITY, not repetition count — an attribute-qualified base
            // like `.dot.dot[data-state="taught"]::before` (0,3,1) beats a
            // correctly-doubled `.rowDot.rowDot::before` (0,2,1), and a guard
            // that counted only repetitions would score that pair as fine.
            const bs = rank(b.spec);
            const ms = rank(m.spec);
            if (ms < bs) {
              problems.push(
                `line ${lineOf(m.rule.index)} \`${m.text}\` ${showSpec(m.spec)} loses ${shared.join(", ")} to line ${lineOf(b.rule.index)} \`${b.text}\` ${showSpec(b.spec)}`,
              );
            } else if (ms === bs && m.rule.index < b.rule.index) {
              problems.push(
                `line ${lineOf(m.rule.index)} \`${m.text}\` is declared ABOVE line ${lineOf(b.rule.index)} \`${b.text}\` at equal specificity ${showSpec(m.spec)}, so it loses ${shared.join(", ")} on source order`,
              );
            }
          }
        }
      }
      expect(
        problems,
        `\`.${modifier}\` is composed onto the same element as \`.${base}\``,
      ).toEqual([]);
    },
  );
});

describe("the row dot specifically — the defect this guard was written for", () => {
  it("declares `.rowDot` doubled, below `.dot.dot`, and reaches the markup", () => {
    expect(CSS).toContain(".rowDot.rowDot");
    expect(CSS).not.toMatch(/^\.rowDot\s*\{/m);
    const dot = bareRules("dot", "").map((s) => s.rule.index);
    const rowDot = bareRules("rowDot", "").map((s) => s.rule.index);
    expect(rowDot.length).toBeGreaterThan(0);
    expect(Math.min(...rowDot)).toBeGreaterThan(Math.max(...dot));
    // And the composition is really there — a stylesheet fix that no element
    // carries is not a fix.
    const list = readFileSync(`${DIR}TimelineList.tsx`, "utf8");
    expect(list).toContain("${styles.dot} ${styles.rowDot}");
  });
});
