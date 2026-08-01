import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as paletteData from "@/lib/palette-data";
import { DEFAULT_SUBJECT_MAPPING } from "@/lib/palette-data";

// Pins the subject → colour-slot map against the v2 design handoff.
//
// WHY THIS FILE EXISTS. The map is not styling — CLAUDE.md §4 makes it
// TEAM-WIDE MEANING ("the subject→slot map is not a teacher preference"), so a
// subject on the wrong slot is a correctness bug: two teachers looking at the
// same stripe would have to agree on what it means. Four of the eight subjects
// had drifted off the handoff (writing, spelling, ufli, sel), and the drift was
// invisible because nothing asserted the map.
//
// THE AUTHORITY, and why it is transcribed rather than parsed. The handoff's
// authority chain (CLAUDE.md §4a) puts the runnable mockup's own data above the
// prose. All four handoff sources agree on the map below:
//
//   Documents/Claude Design/6.24.26 design_handoff_v2_site/source/data.js:7-14
//   Documents/Claude Design/7.21.26 Design Handoff Update/source-home/data.js:7-14
//   …/6.24.26 design_handoff_v2_site/design-system/V2 Framework.md:184-193
//   CLAUDE.md §4 ("the locked, team-wide subject→slot map")
//
// The handoff is NOT read at test time: `Documents/` is reference material the
// app must never import (CLAUDE.md §6), and it is not guaranteed to be present
// in every checkout or CI image. A test that read it would fail-open (skip, or
// silently compare against nothing) exactly where it is most needed. It is
// transcribed here instead, with the citations above, so updating it is a
// deliberate edit against a named source.
const HANDOFF_SLOTS = {
  math: "subj-1",
  ufli: "subj-2",
  writing: "subj-5",
  grammar: "subj-7",
  spelling: "subj-9",
  reading: "subj-10",
  sel: "subj-12",
  explorers: "subj-13",
} as const;

const SUBJECTS = Object.keys(HANDOFF_SLOTS) as (keyof typeof HANDOFF_SLOTS)[];

const TOKENS_PATH = fileURLToPath(
  new URL("../app/tokens.css", import.meta.url),
);
const tokensCss = readFileSync(TOKENS_PATH, "utf8");

describe("the subject → slot map matches the v2 handoff", () => {
  it("is the map the runtime resolves", () => {
    // DEFAULT_SUBJECT_MAPPING is the map every live read path actually uses:
    // PaletteProvider seeds it, `useSubjectColor` closes over it, and
    // `resolveSubjectColor` falls back to it. If this is wrong, the rendered
    // colour is wrong no matter what any other constant says.
    expect(DEFAULT_SUBJECT_MAPPING).toEqual(HANDOFF_SLOTS);
  });

  it("is the only subject→slot map in the palette module", () => {
    // A second constant, V2_SUBJECT_SLOTS, used to hold the handoff values
    // alongside the divergent default, unread by any callsite. Two tables and
    // one reader is how the original divergence survived unnoticed, so this
    // pins that there is again exactly one. A new map added next to the live
    // one — the shape of the old mistake — fails here.
    const maps = Object.entries(paletteData).filter(
      ([, v]) =>
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        SUBJECTS.every((s) => typeof (v as Record<string, unknown>)[s] === "string"),
    );
    expect(maps.map(([k]) => k)).toEqual(["DEFAULT_SUBJECT_MAPPING"]);
  });
});

describe("the static tokens.css aliases match the same map", () => {
  // app/tokens.css carries a second copy of the map as `--writing: var(--subj-5)`
  // aliases. It is the SSR/no-JS fallback and the value the `.cp-subj` classes
  // resolve against, so it can diverge from the TS map without any test noticing
  // — which is how the two drifted apart in the first place.

  /** Every declaration of a custom property, matched on the PROPERTY NAME only
   *  and returning each raw value.
   *
   *  Matching the name rather than the value is what makes the count
   *  trustworthy. A shadowing override that wins the cascade is only caught if
   *  it is SEEN, and CSS lets the same declaration be written many ways —
   *  `var( --subj-2 )`, `var(--subj-2, var(--subj-5))`, a comment mid-value. A
   *  value-shaped pattern silently skips those, leaving one matching `:root`
   *  declaration and a passing test while the browser renders the old slot.
   *  Keyed on the name, ANY redeclaration in ANY syntax lands in this list and
   *  trips the exactly-once assertion; the canonical shape is then checked
   *  separately, on the value. `--writing` does not match `--writing-light`,
   *  since the name must be followed directly by optional space and a colon.
   *
   *  NOT line-anchored: `:root { --writing: var(--subj-2); }` written on one
   *  line is a perfectly ordinary override, and an `^\s*` anchor would not see
   *  it. The name must instead be preceded by a declaration boundary — start of
   *  file, whitespace, `{` or `;` — which still prevents matching the tail of a
   *  longer property name like `--x--writing`. The value stops at `;`, `{` or
   *  `}` so a match cannot run past the end of its own declaration.
   *
   *  KNOWN LIMIT: this is a regex, not a CSS parser, so a CSS comment placed
   *  between the property name and its colon would evade it. That is not a
   *  shape anyone writes, and a CSS parser would mean a new dependency
   *  (CLAUDE.md §6). The backstop for the whole class is the live check —
   *  resolving the computed custom properties in a real browser in both tones,
   *  which is cascade-accurate by construction. */
  const declarationsOf = (name: string): string[] =>
    [
      ...tokensCss.matchAll(
        new RegExp(`(?:^|[{;\\s])--${name}\\s*:([^;{}]*);`, "gm"),
      ),
    ].map((m) => m[1].trim());

  /** The slot ids named by those declarations, for the canonical
   *  `var(--subj-N)` form. A declaration in any other shape yields `null`, so
   *  it fails the comparison rather than vanishing from it. */
  const aliasSlots = (name: string): (string | null)[] =>
    declarationsOf(name).map((v) => {
      const m = v.match(/^var\(\s*--(subj-\d+)\s*\)$/);
      return m ? m[1] : null;
    });

  it("declares each of the eight aliases exactly once", () => {
    // Two jobs in one assertion, and both matter:
    //
    // POSITIVE CONTROL — if the pattern stopped matching (a reformat, a renamed
    // alias) every per-subject check below would compare undefined to a string.
    // Those would fail rather than pass, but only by accident; asserting the
    // parse found something first makes the instrument's own health a separate,
    // visible check instead of an inference from unrelated red.
    //
    // NO-SHADOW — exactly one declaration means no later block can re-point a
    // subject to its old slot behind the checks below. Without this, the map
    // could be right at :root and wrong in Night, and this file would be silent.
    const counts = Object.fromEntries(
      SUBJECTS.map((s) => [s, declarationsOf(s).length]),
    );
    expect(counts).toEqual(
      Object.fromEntries(SUBJECTS.map((s) => [s, 1])),
    );
  });

  it.each(SUBJECTS)("maps --%s to its handoff slot", (subject) => {
    expect(aliasSlots(subject)).toEqual([HANDOFF_SLOTS[subject]]);
  });

  it("leaves the seeded personal subjects on slots no team subject owns", () => {
    // components/appearance/subject-colors.tsx seeds two demo personal subjects
    // so the Personal scope has something to show. They pick from the SAME
    // fifteen slots, so a team remap can silently land a team subject on top of
    // one — which is how the picker came to demonstrate Afternoon Circle in
    // SEL's teal, and Morning Meeting in Maths' gold. Colour is team-wide
    // meaning (CLAUDE.md §4), so a shared swatch on the very page that explains
    // subject colour is a correctness bug, not a cosmetic one.
    //
    // Read as TEXT rather than imported: the file is a React component pulling
    // in @/components/ui, and this suite runs in the node environment. Matching
    // the object literal keeps the assertion on the real source.
    const source = readFileSync(
      fileURLToPath(new URL("../components/appearance/subject-colors.tsx", import.meta.url)),
      "utf8",
    );
    const block = /const PERSONAL_DEFAULT_MAPPING[^=]*=\s*\{([^}]*)\}/.exec(source);
    expect(block, "PERSONAL_DEFAULT_MAPPING not found — did it move or get renamed?").not.toBeNull();
    const seeded = [...block![1].matchAll(/"([\w-]+)"\s*:\s*"(subj-\d+)"/g)].map((m) => ({
      subject: m[1],
      slot: m[2],
    }));
    // Positive control: an empty parse would make the overlap check vacuous.
    expect(seeded.length).toBeGreaterThan(0);
    const teamSlots = new Set<string>(Object.values(HANDOFF_SLOTS));
    expect(seeded.filter((s) => teamSlots.has(s.slot))).toEqual([]);
  });

  it.each(SUBJECTS)(
    "keeps --%s's tint/ink/bright companions on that same slot",
    (subject) => {
      // A half-applied edit — the solid moved but `-light`/`-deep`/`-bright`
      // left behind — would render a pink stripe over an apricot fill with
      // apricot text. Each companion must name the SAME slot number as the
      // solid, so this catches the partial edit that the map assertions alone
      // would pass.
      const slot = HANDOFF_SLOTS[subject];
      for (const [suffix, tokenSuffix] of [
        ["light", "tint"],
        ["deep", "ink"],
        ["bright", "bright"],
      ] as const) {
        // Same name-keyed rule as the solid above: every declaration is seen
        // whatever syntax it uses, so a later override cannot shadow this one
        // unnoticed, and the single surviving value must name the same slot.
        const found = declarationsOf(`${subject}-${suffix}`).map((v) => {
          const m = v.match(
            new RegExp(`^var\\(\\s*--(subj-\\d+)-${tokenSuffix}\\s*\\)$`),
          );
          return m ? m[1] : null;
        });
        expect(found, `--${subject}-${suffix}`).toEqual([slot]);
      }
    },
  );
});
