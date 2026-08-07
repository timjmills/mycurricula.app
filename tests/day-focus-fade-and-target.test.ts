// day-focus-fade-and-target.test.ts — two standing guards over the Day focus
// card's stylesheet, both of them tripwires for regressions that a rendering
// test in this harness CANNOT see.
//
// WHY SOURCE TEXT AND NOT A RENDER. vitest runs `environment: "node"`: there is
// no cascade, no viewport and no geometry here, so nothing in this process can
// compute a contrast ratio or a box height. The measurements that decided both
// values were taken in Chrome (`.probe-day-laneD.mjs`, results in
// docs/screenshots/f2-day/contrast-before.json / -after.json and qa-after.json)
// and are quoted in the stylesheet beside each rule. This file exists so that
// re-introducing either mistake fails in CI rather than waiting for the next
// audit — it is the tripwire, the probe is the instrument, and neither is a
// substitute for the other.
//
// ── GUARD 1 · the fades that failed AA ──────────────────────────────────────
// `.dcTl` (11px/800 eyebrow) shipped at `opacity: .82` and `.dcStepMin` (the
// per-phase minutes) at `.78`. Measured in Frame A glass with the element's own
// opacity composited into the foreground, across 8 subjects × 4 backdrops, the
// two light backdrops failed on EVERY subject — 3.68–4.13 and 3.56–4.00
// against a 4.5 floor — and photo-dim failed on two. An opacity ladder taken on
// the same render (0.78→3.49 … 0.94→4.28, 1.0→4.61 for the worst case) says no
// fade clears the floor, so this asserts the absence of the property rather
// than a particular value: any fade is the bug.
//
// ── GUARD 2 · the touch target ──────────────────────────────────────────────
// `.selectTitle` is a lesson row's keyboard/AT selection control and its reset
// gives it `padding: 0`. Measured live at 375px it was 31px tall — under
// CLAUDE.md §4's 44px floor — while three siblings in the same stylesheet
// (`.vaFinish`, `.addRowNew`, `.addRowEvent`) already had the floor. It is an
// easy one to leave out again, because the rule that grants it is a *list*.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DAY_CSS = readFileSync(
  fileURLToPath(new URL("../components/day-v2/day-v2.module.css", import.meta.url)), // prettier-ignore
  "utf8",
);
const ATOMS_CSS = readFileSync(
  fileURLToPath(new URL("../components/planner-v2/atoms.module.css", import.meta.url)), // prettier-ignore
  "utf8",
);

/** Strip comments so a value quoted in prose is never mistaken for a
 *  declaration. This is the difference between a guard and a grep: the
 *  stylesheet's own notes cite `opacity: .82` and `min-height: 44px` by name. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every declaration block whose selector list mentions `.<name>` as a whole
 *  class token, anywhere in the file — inside `@media` included, since that is
 *  where a fade could be quietly reinstated for one tier. */
function blocksFor(css: string, name: string): { selector: string; body: string }[] { // prettier-ignore
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const token = new RegExp(`\\.${name}(?![\\w-])`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(css))) !== null) {
    const selector = m[1].trim();
    if (selector.startsWith("@")) continue; // at-rule preludes carry no decls
    if (token.test(selector)) out.push({ selector, body: m[2] });
  }
  return out;
}

/** The declared value of `prop` in a block, or null. */
function decl(body: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(body);
  return m ? m[1].trim() : null;
}

describe("Day focus card — the fades that failed AA stay gone", () => {
  for (const name of ["dcTl", "dcStepMin"]) {
    it(`.${name} declares no opacity anywhere in day-v2.module.css`, () => {
      const blocks = blocksFor(DAY_CSS, name);
      // A zero-block result would make the assertion below vacuously true —
      // exactly how an absence-test fails open. Pin that the class still
      // exists before pinning what it does not declare.
      expect(blocks.length).toBeGreaterThan(0);

      const faded = blocks
        .map((b) => ({ selector: b.selector, opacity: decl(b.body, "opacity") }))
        .filter((b) => b.opacity !== null && parseFloat(b.opacity!) < 1);

      expect(
        faded,
        `.${name} is 11–12px white text on the card's translucent inner fill; ` +
          `every fade measured below the 4.5 floor in Frame A on the wash and ` +
          `photo-bright backdrops. See the note beside the rule.`,
      ).toEqual([]);
    });
  }

  it("the phase name is still typographically ahead of the minutes", () => {
    // The fade WAS the hierarchy between `.dcStepMin` and `.dcStepLabel`, and
    // removing it without replacing it would leave two runs 0.5px apart at the
    // same weight. Weight is the replacement, and it costs nothing under WCAG
    // (the maths is per-pixel colour, not stroke width). If someone equalises
    // them, the strip flattens — so pin the relationship, not the numbers.
    const min = blocksFor(DAY_CSS, "dcStepMin").find((b) =>
      decl(b.body, "font-weight"),
    );
    const step = blocksFor(DAY_CSS, "dcStep").find(
      (b) => decl(b.body, "font-weight") && /^\.dcStep$/.test(b.selector),
    );
    expect(min, "dcStepMin declares no font-weight").toBeTruthy();
    expect(step, ".dcStep declares no font-weight").toBeTruthy();
    expect(
      parseInt(decl(min!.body, "font-weight")!, 10),
    ).toBeLessThan(parseInt(decl(step!.body, "font-weight")!, 10));
  });
});

describe("lesson-row select control — the 44px touch floor", () => {
  it("grants .selectTitle at least 44px on coarse pointers and the phone/tablet tiers", () => {
    // The floor lives in ONE media block in this stylesheet; find it by its
    // condition rather than by position, so reordering the file cannot make
    // this pass against the wrong rule.
    const css = stripComments(ATOMS_CSS);
    const start = css.search(
      /@media\s*\(any-pointer:\s*coarse\)\s*,\s*\(max-width:\s*900px\)/,
    );
    expect(start, "the touch-target media block is gone or its condition changed").toBeGreaterThan(-1); // prettier-ignore

    // Walk to the matching close brace — the block nests rules, so a naive
    // `indexOf("}")` would stop at the first inner rule.
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);

    const rule = blocksFor(block, "selectTitle").find((b) =>
      decl(b.body, "min-height"),
    );
    expect(
      rule,
      ".selectTitle has no min-height inside the touch-target block. It is a " +
        "lesson row's keyboard/AT selection control with `padding: 0`; " +
        "measured 31px at 375px, against CLAUDE.md §4's 44px floor.",
    ).toBeTruthy();
    expect(parseFloat(decl(rule!.body, "min-height")!)).toBeGreaterThanOrEqual(44); // prettier-ignore

    // A bare `min-height` on a `display: block` button grows the box downward
    // and leaves the text pinned to the top — the hit area and the thing a
    // finger aims at end up in different places. Centring is part of the fix.
    expect(decl(rule!.body, "align-items")).toBe("center");
  });

  it("still covers the three controls that already had the floor", () => {
    // The rule is a selector LIST, and the way this regresses is someone
    // rewriting the list and dropping a name. All four travel together.
    for (const name of ["vaFinish", "addRowNew", "addRowEvent", "selectTitle"]) {
      const has = blocksFor(ATOMS_CSS, name).some(
        (b) => parseFloat(decl(b.body, "min-height") ?? "0") >= 44,
      );
      expect(has, `.${name} lost its 44px floor`).toBe(true);
    }
  });
});
