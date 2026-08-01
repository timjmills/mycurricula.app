import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  HANDOFF_SLOTS,
  SUBJECT_SLOTS,
  LIGHT_SURFACE,
  DARK_SURFACE,
  NON_TEXT_MIN,
  TEXT_MIN,
  contrastRatio,
  deriveSubjectRoles,
  hexToLch,
  lchToHex,
  type SubjectRoles,
} from "@/lib/subject-color";
import { SUBJECT_SWATCHES } from "@/lib/palette-data";

// Pins the OKLCh subject-colour derivation (lib/subject-color.ts) and the three
// places its 60 values are consumed.
//
// WHAT IS ACTUALLY AT STAKE. Deriving these values is a USER-APPROVED OVERRIDE
// of CLAUDE.md §4a ("the handoff is authoritative for look"), granted on ONE
// condition: the derivation must reproduce the handoff BYTE-FOR-BYTE wherever
// the handoff already cleared its contrast floor. A derivation that satisfies
// every ratio while quietly restyling the values that were already fine has
// failed the brief — so "every ratio passes" is the WEAKER half of this file
// and the anchoring assertions are the point of it.

const SLOTS = SUBJECT_SLOTS.map((_, i) => i);
const label = (i: number) => `subj-${i + 1}`;

/** The floor a role must clear, and against what. Solids and brights are
 *  deliberately NOT re-themed by tone (app/tokens.css, the data-tone="dark"
 *  block), so ONE value serves both surfaces — a two-sided band, which is why
 *  the checks below are `every`, not `some`. */
const passesFloor = (role: keyof SubjectRoles, slot: SubjectRoles): boolean => {
  if (role === "solid" || role === "bright") {
    return (
      contrastRatio(slot[role], LIGHT_SURFACE) >= NON_TEXT_MIN &&
      contrastRatio(slot[role], DARK_SURFACE) >= NON_TEXT_MIN
    );
  }
  if (role === "ink") return contrastRatio(slot.ink, slot.tint) >= TEXT_MIN;
  // The tint is a fill with no floor of its own; it is judged by whether its ink
  // can sit on it, which is the `ink` case above.
  return true;
};

describe("anchoring — the handoff survives wherever it was already legible", () => {
  // The expected split, stated as a literal so a future change to the recipe
  // cannot quietly widen its own blast radius and still pass. If this number
  // moves, the derivation restyled something, and that is a decision for the
  // user, not a test to update.
  it("keeps 41 of the 60 handoff values byte-identical and moves 19", () => {
    let kept = 0;
    let moved = 0;
    SUBJECT_SLOTS.forEach((slot, i) => {
      for (const role of ["solid", "tint", "ink", "bright"] as const) {
        if (slot[role] === HANDOFF_SLOTS[i][role]) kept++;
        else moved++;
      }
    });
    expect({ kept, moved }).toEqual({ kept: 41, moved: 19 });
  });

  it.each(SLOTS)("%# reproduces every passing handoff value on subj-N", (i) => {
    // The operative rule, per role rather than in aggregate: a handoff value
    // that already cleared its floor must come back untouched. Aggregate counts
    // can be satisfied by moving one value and keeping another, so this asserts
    // the actual property on each of the four roles.
    for (const role of ["solid", "tint", "ink", "bright"] as const) {
      if (!passesFloor(role, HANDOFF_SLOTS[i])) continue;
      expect(SUBJECT_SLOTS[i][role], `${label(i)} ${role}`).toBe(
        HANDOFF_SLOTS[i][role],
      );
    }
  });

  it("moves every handoff value that FAILED its floor", () => {
    // The converse, and the reason the override was granted at all. Without
    // this, a derivation that returned the handoff unchanged in every case
    // would pass every assertion above while fixing nothing.
    const stillOnAFailingValue: string[] = [];
    SUBJECT_SLOTS.forEach((slot, i) => {
      for (const role of ["solid", "bright", "ink"] as const) {
        if (!passesFloor(role, HANDOFF_SLOTS[i]) && slot[role] === HANDOFF_SLOTS[i][role]) {
          stillOnAFailingValue.push(`${label(i)} ${role}`);
        }
      }
    });
    expect(stillOnAFailingValue).toEqual([]);
  });

  it("names exactly which values moved", () => {
    // The ledger, in the test rather than in a comment, so the review question
    // "what did this change on screen?" has one answer that cannot go stale.
    const moved: string[] = [];
    SUBJECT_SLOTS.forEach((slot, i) => {
      for (const role of ["solid", "tint", "ink", "bright"] as const) {
        if (slot[role] !== HANDOFF_SLOTS[i][role]) {
          moved.push(`${label(i)} ${role} ${HANDOFF_SLOTS[i][role]} -> ${slot[role]}`);
        }
      }
    });
    expect(moved).toEqual([
      "subj-1 solid #dcc674 -> #a89240",
      "subj-1 bright #e8bb17 -> #b48f00",
      "subj-2 solid #dca574 -> #be8858",
      "subj-2 bright #e87917 -> #e4750f",
      "subj-3 solid #dc8274 -> #d57b6d",
      "subj-6 solid #c77ac7 -> #c578c5",
      "subj-8 bright #7147d1 -> #774ed8",
      "subj-9 bright #4751d1 -> #4f5cdc",
      "subj-10 solid #7a9ec7 -> #7396bf",
      "subj-11 solid #7ab8c7 -> #5f9cab",
      "subj-11 bright #47b6d1 -> #2ba0bb",
      "subj-12 solid #7ac7b8 -> #53a092",
      "subj-12 bright #47d1b6 -> #00a68e",
      "subj-13 solid #7ac79b -> #56a278",
      "subj-13 bright #47d183 -> #00a95f",
      "subj-14 solid #7ac77a -> #58a459",
      "subj-14 bright #47d147 -> #03ab15",
      "subj-15 solid #9ac77a -> #749f54",
      "subj-15 bright #81d147 -> #59a602",
    ]);
  });

  it.each(SLOTS)("%# keeps a moved value's hue, so the subject stays itself", (i) => {
    // Anchoring is not only about the values that did not move. A repair that
    // reached its floor by swinging the hue would technically pass every
    // contrast check while turning teal into blue on every board in the school.
    // The solver only ever moves lightness (and clips chroma to stay in sRGB),
    // so hue drift here should be rounding-scale.
    for (const role of ["solid", "bright"] as const) {
      if (SUBJECT_SLOTS[i][role] === HANDOFF_SLOTS[i][role]) continue;
      const before = hexToLch(HANDOFF_SLOTS[i][role])[2];
      const after = hexToLch(SUBJECT_SLOTS[i][role])[2];
      let drift = Math.abs(after - before);
      if (drift > 180) drift = 360 - drift; // the ±180° seam
      expect(drift, `${label(i)} ${role} hue drift`).toBeLessThan(2);
    }
  });

  it.each(SLOTS)("%# moves no further than the floor requires", (i) => {
    // "Anchor first, then fix" has a second half nothing else here would catch:
    // a repair that overshoots is just as much a silent restyle as one that
    // moves a passing value. Stepping a repaired value BACK toward its handoff
    // lightness must break the floor again — if it does not, the solver went
    // past the minimum.
    for (const role of ["solid", "bright"] as const) {
      const shipped = SUBJECT_SLOTS[i][role];
      if (shipped === HANDOFF_SLOTS[i][role]) continue;
      const [Lship, C, h] = hexToLch(shipped);
      const Lhandoff = hexToLch(HANDOFF_SLOTS[i][role])[0];
      // One step back along the line from the shipped value to the handoff one.
      const backwards = Lship + Math.sign(Lhandoff - Lship) * 0.012;
      const candidate = lchToHex([backwards, C, h]);
      const stillPasses =
        contrastRatio(candidate, LIGHT_SURFACE) >= NON_TEXT_MIN &&
        contrastRatio(candidate, DARK_SURFACE) >= NON_TEXT_MIN;
      expect(stillPasses, `${label(i)} ${role} overshot: ${candidate} also passes`).toBe(
        false,
      );
    }
  });
});

describe("the floors the derivation exists to guarantee", () => {
  it.each(SLOTS)("%# solid and bright clear 3:1 on BOTH surfaces", (i) => {
    for (const role of ["solid", "bright"] as const) {
      const hex = SUBJECT_SLOTS[i][role];
      expect(
        contrastRatio(hex, LIGHT_SURFACE),
        `${label(i)} ${role} ${hex} on light ${LIGHT_SURFACE}`,
      ).toBeGreaterThanOrEqual(NON_TEXT_MIN);
      expect(
        contrastRatio(hex, DARK_SURFACE),
        `${label(i)} ${role} ${hex} on dark ${DARK_SURFACE}`,
      ).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    }
  });

  it.each(SLOTS)("%# ink clears AA on its own tint", (i) => {
    const { ink, tint } = SUBJECT_SLOTS[i];
    expect(contrastRatio(ink, tint), `${label(i)} ${ink} on ${tint}`).toBeGreaterThanOrEqual(
      TEXT_MIN,
    );
  });

  it("proves the old palette would have failed these same checks", () => {
    // A negative control. Every assertion above passes trivially against a
    // derivation that is right AND against a contrast function that is broken
    // in the generous direction — this repo has shipped a probe that inflated
    // ratios by conflating 0–1 floats with 0–255 channels. Running the same
    // maths over the ORIGINAL handoff must therefore produce the ten solid
    // failures the whole task was raised for. If this comes back empty, the
    // instrument is wrong, not the palette.
    const failures = HANDOFF_SLOTS.flatMap((slot, i) =>
      (["solid", "bright"] as const)
        .filter((role) => !passesFloor(role, slot))
        .map((role) => `${label(i)} ${role}`),
    );
    const solidFailures = failures.filter((f) => f.endsWith("solid"));
    expect(solidFailures).toHaveLength(10);
    expect(solidFailures).toContain("subj-1 solid"); // gold, the 1.70:1 case
    expect(contrastRatio("#dcc674", LIGHT_SURFACE)).toBeCloseTo(1.7, 1);
  });
});

describe("a subject the handoff never drew — the reason this is a recipe", () => {
  // The decisive argument for deriving rather than hand-tuning: when a school
  // invents its own subject there is no authored hex and no designer in the
  // loop. A hue must be enough on its own.
  const HUES = Array.from({ length: 36 }, (_, k) => k * 10 - 180);

  it.each(HUES)("hue %s produces four roles that all clear their floors", (hue) => {
    const roles = deriveSubjectRoles(hue);
    for (const role of ["solid", "bright"] as const) {
      expect(contrastRatio(roles[role], LIGHT_SURFACE), `${role} light`).toBeGreaterThanOrEqual(
        NON_TEXT_MIN,
      );
      expect(contrastRatio(roles[role], DARK_SURFACE), `${role} dark`).toBeGreaterThanOrEqual(
        NON_TEXT_MIN,
      );
    }
    expect(contrastRatio(roles.ink, roles.tint), "ink on tint").toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

describe("the three places these 60 values are consumed stay in lockstep", () => {
  const tokensCss = readFileSync(
    fileURLToPath(new URL("../app/tokens.css", import.meta.url)),
    "utf8",
  );

  /** Every declaration of `--<name>`, keyed on the PROPERTY NAME so a
   *  redeclaration in any syntax is seen. Same rule and the same reasoning as
   *  tests/subject-slot-map.test.ts: a value-shaped pattern would silently skip
   *  a shadowing override and leave a passing test over a wrong render. */
  const declarationsOf = (name: string): string[] =>
    [
      ...tokensCss.matchAll(new RegExp(`(?:^|[{;\\s])--${name}\\s*:([^;{}]*);`, "gm")),
    ].map((m) => m[1].trim());

  it("finds every declaration it is about to assert on", () => {
    // Instrument health as its own visible check rather than an inference from
    // unrelated red: if the pattern stopped matching, every case below would
    // compare undefined to a string and fail for the wrong reason.
    const missing = SLOTS.flatMap((i) =>
      ["", "-tint", "-ink", "-bright"]
        .filter((suffix) => declarationsOf(`subj-${i + 1}${suffix}`).length === 0)
        .map((suffix) => `--subj-${i + 1}${suffix}`),
    );
    expect(missing).toEqual([]);
  });

  it.each(SLOTS)("%# app/tokens.css carries the derived values for subj-N", (i) => {
    for (const [suffix, role] of [
      ["", "solid"],
      ["-tint", "tint"],
      ["-ink", "ink"],
      ["-bright", "bright"],
    ] as const) {
      const decls = declarationsOf(`subj-${i + 1}${suffix}`);
      // `-tint` and `-ink` are legitimately redeclared under
      // :root[data-tone="dark"] as color-mix() recipes off the solid, so only
      // the FIRST (`:root`) declaration is the literal the derivation owns.
      expect(decls[0], `--subj-${i + 1}${suffix}`).toBe(SUBJECT_SLOTS[i][role]);
    }
  });

  it("lib/palette-data.ts's SUBJECT_SWATCHES carries the same values", () => {
    // The Appearance picker paints these AND prints the hex next to the swatch
    // (components/appearance/palette-reference.tsx). A stylesheet-only edit
    // would have shown a teacher a colour and a code the app renders nowhere.
    expect(
      SUBJECT_SWATCHES.map((s) => ({
        id: s.id,
        normal: s.normal,
        bright: s.bright,
        tint: s.tint,
        deep: s.deep,
      })),
    ).toEqual(
      SUBJECT_SLOTS.map((slot, i) => ({
        id: `subj-${i + 1}`,
        normal: slot.solid,
        bright: slot.bright,
        tint: slot.tint,
        deep: slot.ink,
      })),
    );
  });

  it("keeps the Team caution glow at the literal CLAUDE.md §2 documents", () => {
    // CLAUDE.md §2 names #E8179B in prose as the master-mode caution colour, and
    // §4 identifies it as --subj-5-bright. Prose cannot be kept in lockstep by a
    // type, so it is asserted: if a future recipe change moves this value, this
    // fails and CLAUDE.md gets updated deliberately instead of going quietly
    // wrong.
    expect(SUBJECT_SLOTS[4].bright).toBe("#e8179b");
  });
});
