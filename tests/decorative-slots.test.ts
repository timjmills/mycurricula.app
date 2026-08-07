import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  UNOWNED_SLOTS,
  TEAM_OWNED_SLOTS,
  SLOT_HUE_NAMES,
  CARD_WASH_TINTS,
  CARD_WASH_NAMES,
  isUnownedSlot,
  slotSwatches,
  unownedSlotVar,
  type UnownedSlot,
} from "@/lib/card-wash";
import { DEFAULT_SUBJECT_MAPPING } from "@/lib/palette-data";
import { TEXT_COLORS } from "@/components/rich-text/rich-text-editor";
import { TEXT_SWATCHES } from "@/components/lesson-editor/FloatingBar";
import { TOOL_META } from "@/components/daily/planning-tabs/PlanningTabs";

// THE STRICT COLOUR RULE, pinned.
//
// Colour in this app is information, never decoration (CLAUDE.md §4), and the
// subject→slot map is TEAM-WIDE MEANING rather than a teacher preference. The
// consequence nobody had written down: anything a teacher picks for a reason
// that is *not* "this is that subject" — a card wash, a word coloured in a note,
// a planning-tab accent, a legend glyph — must come from the slots no subject
// owns. Otherwise one screen shows the same hue meaning two things, and the
// stripe vocabulary a teacher learned stops being reliable.
//
// Every decorative picker in the app had drifted the other way: the rich-text
// ramp offered exactly the eight team slots, the floating bar five of them, the
// planning tabs four, the Year legend two plus a raw `--explorers` alias. Each
// drift was individually defensible ("it was appearance-preserving") and
// collectively meant a teacher could colour a word in Writing's pink.
//
// WHAT EACH LAYER PROVES, because none of them is sufficient alone:
//   • `tsc` — `unownedSlotVar`/`slotSwatches` take the `UnownedSlot` literal
//     union, so naming a subject's slot through them is a compile error.
//   • this file — the shared list is the right list, it still matches the LIVE
//     subject map, and the three importable pickers offer only unowned slots.
//   • the source scan below — catches the one thing the types cannot: a literal
//     `var(--subj-13)` written straight into a style attribute, bypassing the
//     helpers entirely. That is exactly how the Year legend's star got there.
//   • scripts/probe-subject-colours.mjs — the RENDERED result in a browser.
//
// tests/subject-slot-map.test.ts owns the other half of the contract (that the
// eight subjects sit on their handoff slots). This file must never restate it.

/** The seven, transcribed independently of the module under test. Written out
 *  rather than derived so a bad edit to `UNOWNED_SLOTS` cannot make its own
 *  assertion agree with it. */
const EXPECTED_UNOWNED = [3, 4, 6, 8, 11, 14, 15];

describe("the unowned-slot list is the complement of the team map", () => {
  it("is exactly the seven slots", () => {
    expect([...UNOWNED_SLOTS].sort((a, b) => a - b)).toEqual(EXPECTED_UNOWNED);
  });

  it("does not overlap the team-owned slots, and together they cover 1–15", () => {
    const owned = new Set<number>(TEAM_OWNED_SLOTS);
    expect(UNOWNED_SLOTS.filter((n) => owned.has(n))).toEqual([]);
    expect(
      [...TEAM_OWNED_SLOTS, ...UNOWNED_SLOTS].sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("tracks the LIVE subject map, not a snapshot of it", () => {
    // THE DRIFT GUARD, and the reason this file imports palette-data at all.
    // `TEAM_OWNED_SLOTS` is transcribed in lib/card-wash (it is on a client hot
    // path and must not pull the palette module in), so nothing at runtime
    // stops the two from disagreeing. If a subject is ever re-pointed onto,
    // say, slot 4, every decorative picker in the app starts offering that
    // subject's hue and no other test notices. This is where that fails.
    const liveSlots = Object.values(DEFAULT_SUBJECT_MAPPING)
      .map((slot) => Number(/^subj-(\d+)$/.exec(slot)?.[1]))
      .sort((a, b) => a - b);
    // Positive control: an unparseable slot format would yield NaNs and make
    // the comparison below meaningless in a way that still looks like a diff.
    expect(liveSlots.every(Number.isInteger)).toBe(true);
    expect(liveSlots.length).toBe(8);
    expect([...TEAM_OWNED_SLOTS].sort((a, b) => a - b)).toEqual(liveSlots);
  });
});

describe("hue names cover the offered slots and nothing else", () => {
  it("names every unowned slot", () => {
    for (const slot of UNOWNED_SLOTS) {
      expect(SLOT_HUE_NAMES[slot], `--subj-${slot}`).toBeTypeOf("string");
      expect(SLOT_HUE_NAMES[slot]!.length).toBeGreaterThan(0);
    }
  });

  it("carries no name for a slot that is not offered", () => {
    // A stale name is how a picker ends up labelling the wrong hue after a slot
    // leaves the list — the swatch moves, the word stays.
    expect(Object.keys(SLOT_HUE_NAMES).map(Number).sort((a, b) => a - b)).toEqual(
      EXPECTED_UNOWNED,
    );
  });

  it("gives each offered slot a DISTINCT name", () => {
    const names = UNOWNED_SLOTS.map((n) => SLOT_HUE_NAMES[n]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the card-wash aliases pointing at the same objects", () => {
    // Aliases, not copies — see lib/card-wash. Identity is the assertion: two
    // equal-but-separate arrays would drift on the next edit, which is the bug
    // the whole module exists to prevent.
    expect(CARD_WASH_TINTS).toBe(UNOWNED_SLOTS);
    expect(CARD_WASH_NAMES).toBe(SLOT_HUE_NAMES);
  });
});

describe("the shared helpers refuse an owned slot", () => {
  it("isUnownedSlot answers for every slot on the scale", () => {
    const owned = new Set<number>(TEAM_OWNED_SLOTS);
    for (let n = 1; n <= 15; n++) {
      expect(isUnownedSlot(n), `--subj-${n}`).toBe(!owned.has(n));
    }
  });

  it("slotSwatches builds the full row from the unowned scale", () => {
    const row = slotSwatches();
    expect(row.map((s) => s.slot)).toEqual([...UNOWNED_SLOTS]);
    for (const s of row) {
      expect(isUnownedSlot(s.slot)).toBe(true);
      expect(s.label).toBe(SLOT_HUE_NAMES[s.slot]);
      expect(s.variable).toBe(`--subj-${s.slot}`);
    }
  });

  it("slotSwatches THROWS on an owned slot reaching it as a bare number", () => {
    // The type stops a TS caller; this is the runtime backstop for a value that
    // arrived through an `as` cast, from untyped JS, or from stored data. It
    // must throw rather than skip: a picker silently one swatch short is a
    // fault nobody reports, and the offending slot would still be in the code.
    for (const owned of TEAM_OWNED_SLOTS) {
      expect(() => slotSwatches([owned as UnownedSlot]), `--subj-${owned}`)
        .toThrow(/owned by a team subject/);
    }
  });

  it("unownedSlotVar builds a var() reference, never a resolved colour", () => {
    expect(unownedSlotVar(3)).toBe("var(--subj-3)");
    expect(unownedSlotVar(14, "-bright")).toBe("var(--subj-14-bright)");
    expect(unownedSlotVar(8, "-tint")).toBe("var(--subj-8-tint)");
    expect(unownedSlotVar(11, "-ink")).toBe("var(--subj-11-ink)");
  });
});

/** Every `--subj-<n>` a value names, wherever it appears in the string. */
const slotsNamedBy = (value: string): number[] =>
  [...value.matchAll(/--subj-(\d+)/g)].map((m) => Number(m[1]));

describe("every importable decorative picker offers only unowned slots", () => {
  // These three are the pickers whose data can be imported directly, so the
  // assertion is on what the component actually renders rather than on what its
  // source file happens to contain.
  const pickers: [string, { label: string; variable?: string; color?: string }[]][] = [
    ["rich-text-editor TEXT_COLORS", TEXT_COLORS],
    ["lesson-editor FloatingBar TEXT_SWATCHES", TEXT_SWATCHES],
    ["daily PlanningTabs TOOL_META", Object.values(TOOL_META)],
  ];

  it.each(pickers)("%s names no team-owned slot", (_name, entries) => {
    const named = entries.flatMap((e) =>
      slotsNamedBy(`${e.variable ?? ""} ${e.color ?? ""}`),
    );
    // POSITIVE CONTROL. Every one of these three is supposed to carry subject
    // slots; if a refactor moved the colours somewhere this can't see, `named`
    // goes empty and `every()` passes vacuously — the exact fail-open shape
    // this repo keeps paying for.
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !isUnownedSlot(n))).toEqual([]);
  });

  it("the rich-text ramp is the ink entries plus the full unowned scale", () => {
    expect(TEXT_COLORS.map((s) => s.variable)).toEqual([
      "--ink-900",
      "--ink-700",
      "--ink-500",
      ...UNOWNED_SLOTS.map((n) => `--subj-${n}`),
    ]);
    // Hue-named, never subject-named: a label a subject remap can falsify was
    // the original defect here ("Spelling pink").
    for (const s of TEXT_COLORS) {
      const slot = slotsNamedBy(s.variable)[0];
      if (slot !== undefined) expect(s.label).toBe(SLOT_HUE_NAMES[slot]);
    }
  });

  it("the floating bar offers a SUBSET of the same scale, still hue-named", () => {
    const slots = TEXT_SWATCHES.flatMap((s) => slotsNamedBy(s.variable));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every(isUnownedSlot)).toBe(true);
    expect(new Set(slots).size).toBe(slots.length);
    for (const s of TEXT_SWATCHES) {
      const slot = slotsNamedBy(s.variable)[0];
      if (slot !== undefined) expect(s.label).toBe(SLOT_HUE_NAMES[slot]);
    }
  });
});

describe("no decorative surface hard-codes a team slot in its source", () => {
  // WHAT THIS CATCHES THAT THE TYPES CANNOT. `unownedSlotVar` makes the wrong
  // slot a compile error only for callers that USE it. Writing
  // `stroke="var(--subj-13)"` straight into JSX bypasses the helper entirely
  // and typechecks perfectly — which is literally how the Year legend's star
  // came to be painted in Explorers green. Only reading the source finds it.
  const FILES = [
    "components/rich-text/rich-text-editor.tsx",
    "components/lesson-editor/FloatingBar.tsx",
    "components/daily/planning-tabs/PlanningTabs.tsx",
    "components/year/ProgressionView.tsx",
    "components/resources/ResourceCardFace.tsx",
    "components/resource-wall-v2/Card.tsx",
  ];

  /** Source with COMMENTS REMOVED.
   *
   *  Scanning raw source flagged this very file set on its first run — the note
   *  above `StarIcon` explaining that it *used to* read `var(--explorers)` is a
   *  perfect match for the pattern hunting that string. A scan that cannot tell
   *  code from prose either produces red for correct code or, worse, teaches
   *  the next person to delete the explanation to make the test pass.
   *
   *  KNOWN LIMIT: a regex, not a parser, so a `//` inside a string literal
   *  truncates that line. Acceptable here because the risk is one-directional
   *  and guarded — over-stripping can only make the scan miss something, and
   *  `keeps the code while dropping the prose` below asserts on a fixture that
   *  it does neither, while `each file is readable and non-empty` asserts the
   *  stripped result is still substantially the file. */
  const codeOf = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("the scan's own pattern actually matches", () => {
    // INSTRUMENT CHECK, not a formality. Every assertion below is an ABSENCE,
    // and an absence-assertion whose pattern has stopped matching passes
    // silently and forever. Prove the pattern finds both shapes on a fixture
    // before trusting it to find none in the files.
    expect(slotsNamedBy('stroke="var(--subj-13)"')).toEqual([13]);
    expect(slotsNamedBy("background: var(--subj-5-tint)")).toEqual([5]);
    expect(slotsNamedBy("var(--subj-1) var(--subj-2-ink)")).toEqual([1, 2]);
    expect(slotsNamedBy("var(--ink-900)")).toEqual([]);
    // A template literal is deliberately NOT a hit: `var(--subj-${n}-tint)`
    // renders whatever the audited list holds, so flagging it would be noise.
    expect(slotsNamedBy("var(--subj-${n}-tint)")).toEqual([]);
  });

  it("the comment stripper keeps the code while dropping the prose", () => {
    // The other half of the instrument check. Both scans below assert an
    // ABSENCE, so an over-eager stripper would make them pass by deleting the
    // very lines they exist to read.
    const fixture = [
      "// was var(--explorers) and var(--subj-13)",
      "/* block: var(--math) var(--subj-1) */",
      'const a = "var(--subj-13)"; // trailing var(--subj-1)',
      "const url = \"https://x/y\";",
    ].join("\n");
    const stripped = fixture
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(slotsNamedBy(stripped)).toEqual([13]); // only the real code line
    expect(stripped).toContain("https://x/y"); // a URL survives
  });

  it("each file is readable and still substantially itself after stripping", () => {
    // A renamed or moved file, or a stripper that ate the file, would make
    // every scan below trivially clean.
    for (const rel of FILES) {
      const raw = readFileSync(
        fileURLToPath(new URL(`../${rel}`, import.meta.url)),
        "utf8",
      );
      expect(raw.length, rel).toBeGreaterThan(500);
      expect(codeOf(rel).length / raw.length, `${rel} survived stripping`)
        .toBeGreaterThan(0.3);
    }
  });

  it.each(FILES)("%s names no team-owned slot in a literal", (rel) => {
    const owned = slotsNamedBy(codeOf(rel)).filter((n) => !isUnownedSlot(n));
    expect(owned).toEqual([]);
  });

  it.each(FILES)("%s uses no raw subject ALIAS for colour", (rel) => {
    // The doubly-wrong shape: `var(--explorers)` is both a subject's colour AND
    // a name that repaints itself whenever the team remaps that subject. These
    // files carry no subject identity, so any alias in them is a decorative
    // borrow.
    const aliases = Object.keys(DEFAULT_SUBJECT_MAPPING);
    const found = aliases.filter((a) =>
      new RegExp(`var\\(\\s*--${a}(?:-[a-z]+)?\\s*\\)`).test(codeOf(rel)),
    );
    expect(found).toEqual([]);
  });
});
