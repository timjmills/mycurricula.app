import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// THE §4 LEGIBILITY CONTRACT, ASSERTED OVER THE STYLESHEET SOURCE.
//
// CLAUDE.md §4: "branch on `data-tone`, never on the theme." The failure this
// guards is not hypothetical — it shipped, and it was measured:
//
//   components/boards/TeachChooser.module.css forced `--on-solid` (white) on
//   `[data-bg="photo"]` with no tone branch. That was correct while glass+photo
//   always painted a DARK stage scrim. Commit 3121908 added the light-tone veil
//   that turns the Photo-Bright stage nearly white, and the rule kept painting
//   white on it: `.cardSub` measured **1.00:1** and `.prompt` **1.18:1** on the
//   running app — worse than the 1.13:1 that opened the ticket the veil was
//   fixing. Evidence: docs/qa/2026-08-07-photo-bright-remeasure.md §4.2 and the
//   pixel crop CROP-teachchooser-photo-bright.png, where both strings render as
//   ghost outlines.
//
// A contrast bug is invisible to a unit test — there is no DOM, no compositor
// and no photograph here. What IS testable, and what would have caught this at
// author time, is the STRUCTURAL precondition: a rule keyed on an appearance
// axis that is not tone, setting a tone-FIXED ink, with nothing to flip it.
// Same idiom as tests/fork-diff-reachability.test.ts's structural section,
// including its positive controls that each file is the one we think it is.
//
// The classification is derived from the token file rather than hard-coded, so
// it cannot drift: any custom property redefined inside the `data-tone="dark"`
// block IS tone-aware, and everything else (a literal hex, `rgba(255,…)`,
// `var(--on-solid)`) is tone-FIXED.

const REPO = path.resolve(__dirname, "..");
const read = (rel: string): string =>
  fs.readFileSync(path.join(REPO, rel), "utf8");

// ── tone-aware token set, derived from app/tokens.css ──────────────────────

/**
 * Every custom property redefined under `:root[data-tone="dark"]`. A `var()`
 * reference to one of these carries its own tone flip, so a rule that sets ink
 * only from these tokens satisfies the contract at the VALUE level and needs no
 * tone branch in its selector.
 */
function toneAwareTokens(): Set<string> {
  const src = read("app/tokens.css");
  const anchor = src.indexOf(':root[data-tone="dark"]');
  if (anchor < 0) return new Set();
  // Walk from the block's `{` to its matching `}`.
  const open = src.indexOf("{", anchor);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = src.slice(open, end);
  const out = new Set<string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:/gi)) out.add(m[1]);
  return out;
}

const TONE_AWARE = toneAwareTokens();

// ── CSS scanning ───────────────────────────────────────────────────────────

/** Blank comments but keep newlines, so reported line numbers stay true. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/**
 * The appearance axes whose value does NOT determine a tone, so a rule keyed on
 * one still owes an explicit tone branch.
 *
 * ⚠ `data-frame` IS MATCHED BY VALUE, NOT BY NAME, and that is load-bearing.
 * `components/lesson-flow/resource-tile.module.css` uses a component-local
 * `data-frame` whose values are `video|slides|document|image|url` — the
 * resource TYPE, an entirely different axis that happens to share a name. Ten
 * of its rules pin a literal ink, none of them is an appearance-axis rule, and
 * a scan keyed on the attribute name alone reports all ten as violations.
 * Restricting the match to the three appearance values (`FRAME_VALUES`,
 * lib/theme-values.ts:77) separates them structurally — there is no allowlist
 * entry to go stale, and no way for the exemption to widen on its own.
 */
const AXIS_KEYED =
  /\[data-bg=|\[data-theme=|\[data-frame=["']?(?:glass|paper|color)["']?[\]"']/;
/** Selectors that already determine the tone. `data-dim` decides it on the photo
 *  path; `data-glass` is the Frame-A register, which CLAUDE.md §4 defines as
 *  flipping "a panel's fill AND its text together" — so a rule keyed on it picks
 *  its own ink legitimately. `night` is the one theme whose tone is fixed by
 *  construction.
 *
 *  ⚠ `off` USED TO BE IN THIS LIST AND WAS WRONG (§4a finding, 2026-08-07).
 *  `data-theme="off"` is Photo — the ungraded photo — and its tone is derived
 *  from `data-dim`: Dim/Normal → dark, Bright → light. So `[data-theme="off"]
 *  .x { color: #fff }` is white ink that can land on a light Photo-Bright
 *  surface: precisely the bug this file exists to catch, waved through by the
 *  guard itself. Only `night` forces a tone.
 *
 *  `data-frame` IS NOW SCANNED (2026-08-10, task #16). It was the last
 *  appearance axis outside the sweep, and the three reasons it stayed out have
 *  each been resolved rather than carried forward:
 *    • THE NAME COLLISION IS REAL AND IS HANDLED BY VALUE-MATCHING, not by an
 *      allowlist — see AXIS_KEYED below. `resource-tile.module.css` has ten
 *      rules on a component-local `data-frame` (`video|slides|document|image|
 *      url`); matching only `glass|paper|color` excludes all ten structurally,
 *      so there is no exemption that could go stale.
 *    • THE DORMANT VOCABULARY IS GONE. `.glass-dark`, `.fr-title`,
 *      `.fr-eyebrow`, `.badge`, `.chip.now` and the rest — 99 rules no .tsx
 *      could match — were DELETED from app/themes.css on 2026-08-09, and their
 *      allowlist entry went with them.
 *    • THE THIRD REASON WAS NEVER TRUE, and correcting it is the point of this
 *      paragraph. The old note exempted WeekC's tone-fixed ink on the grounds
 *      that "Frame C forces light tone". FRAME C HAS NEVER FORCED A TONE.
 *      `deriveTone(resolved, glass, bg, dim, autoTone)` (lib/theme-values.ts
 *      :168, re-exported through lib/theme.tsx) takes theme, glass register,
 *      background and dim — `data-frame` is not a parameter at all. A Frame C
 *      surface renders in dark tone under Night, or under Photo-Dim, exactly
 *      like every other frame. An exemption resting on that claim would have
 *      waved through precisely the bug this file exists to catch.
 *
 *      WeekC's `.tile { color: #fff }` is nonetheless NOT a violation, for a
 *      different and much stronger reason: its FILL IS TONE-INDEPENDENT. The
 *      tile paints `var(--sc-solid)` → `var(--sc-solid-2)`, both derived from
 *      `--c` alone with no tone branch anywhere in their definition
 *      (app/tokens.css), so the surface under that white ink is the same deep
 *      subject solid in both tones — 5.34:1 at the worst of 15 slots, measured.
 *      Tone-fixed ink on a tone-fixed fill is a matched pair; the contract's
 *      failure mode is a fill that MOVES while the ink does not.
 *
 *      (It is also outside the scan's reach either way, and the distinction
 *      matters to anyone extending this file: WeekC is selected in TSX by
 *      `frame === "color"`, not by a CSS attribute selector, so no rule in
 *      WeekC.module.css names `[data-frame]` at all. The scan sees CSS-level
 *      branching only — a whole stylesheet chosen in React is invisible to it.) */
const TONE_DETERMINED =
  /\[data-tone=|\[data-dim=|\[data-glass=|\[data-theme=["']?night["']?\]/;
const INK_PROP =
  /(?:^|[;{\s])(?:-webkit-text-fill-color|color)\s*:\s*([^;}]+)/g;

/** `inherit` / `currentColor` / `transparent` / `unset` pin no tone. */
const NEUTRAL =
  /^(inherit|currentcolor|transparent|unset|initial|revert|none)$/i;

/** A colour written out rather than referenced. `\(` is required after a
 *  function name so `color-mix(in oklab, …)` is not mistaken for a literal. */
const LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:white|black|red|blue|green|yellow|silver|gray|grey|orange|purple)\b/i;

/**
 * True when `value` can change with the tone — i.e. it names no literal colour
 * and every token it references is one the dark block redefines. A literal hex,
 * an `rgba(255,…)`, or `var(--on-solid)` (defined once, never flipped) is
 * tone-FIXED. A `color-mix()` of tone-aware tokens flips with them and passes.
 */
function toneAware(value: string): boolean {
  const v = value.trim();
  if (NEUTRAL.test(v)) return true;
  if (LITERAL.test(v)) return false;
  const vars = [...v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
  if (vars.length === 0) return false;
  return vars.every((t) => TONE_AWARE.has(t));
}

type Rule = { selector: string; body: string; line: number; index: number };

/** Leaf declaration blocks only (no nested `{`), with at-rule preludes skipped. */
function leafRules(src: string): Rule[] {
  const clean = stripComments(src);
  const out: Rule[] = [];
  const stack: { selStart: number; bodyStart: number }[] = [];
  let selStart = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === "{") {
      stack.push({ selStart, bodyStart: i + 1 });
      selStart = i + 1;
    } else if (ch === "}") {
      const frame = stack.pop();
      if (frame) {
        const body = clean.slice(frame.bodyStart, i);
        if (!body.includes("{")) {
          const selector = clean
            .slice(frame.selStart, frame.bodyStart - 1)
            .trim();
          if (selector && !selector.startsWith("@")) {
            out.push({
              selector: selector.replace(/\s+/g, " "),
              body,
              line: clean.slice(0, frame.selStart).split("\n").length,
              index: frame.selStart,
            });
          }
        }
      }
      selStart = i + 1;
    }
  }
  return out;
}

/** Class names named anywhere in a selector. */
const classesOf = (sel: string): string[] =>
  [...sel.matchAll(/\.([a-z0-9_-]+)/gi)].map((m) => m[1]);

type Violation = {
  file: string;
  line: number;
  selector: string;
  value: string;
};

/**
 * Every axis-keyed rule that pins a tone-FIXED ink and is not rescued either by
 * its own selector or by a LATER tone-branched rule for the same class in the
 * same file. That last clause matters: day-v2.module.css sets `color:#fff` on
 * `[data-bg="photo"] .wkarrow` and then overrides it on
 * `[data-bg="photo"][data-tone="light"] .wkarrow` — a two-rule pair that
 * satisfies the contract, and a scanner without this check would call it a bug.
 */
function scan(file: string): Violation[] {
  const src = read(file);
  const rules = leafRules(src);
  const out: Violation[] = [];
  for (const rule of rules) {
    if (!AXIS_KEYED.test(rule.selector)) continue;
    if (TONE_DETERMINED.test(rule.selector)) continue;
    for (const m of rule.body.matchAll(INK_PROP)) {
      const value = m[1].trim();
      if (toneAware(value)) continue;
      const cls = classesOf(rule.selector);
      const covered =
        cls.length > 0 &&
        rules.some(
          (r) =>
            r.index > rule.index &&
            TONE_DETERMINED.test(r.selector) &&
            cls.every((c) => new RegExp(`\\.${c}\\b`).test(r.selector)) &&
            /(?:^|[;{\s])(?:-webkit-text-fill-color|color)\s*:/.test(r.body),
        );
      if (covered) continue;
      out.push({
        file,
        line: rule.line,
        selector: rule.selector.slice(0, 140),
        value,
      });
    }
  }
  return out;
}

/** Every stylesheet the APP ships. `Documents/` is the design handoff — never
 *  imported (CLAUDE.md §5, §6) — and is excluded on purpose. */
function appStylesheets(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(next);
      else if (e.name.endsWith(".css")) out.push(next);
    }
  };
  walk("app");
  walk("components");
  walk("styles");
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · The instrument must be seen to work, in BOTH directions
// ═══════════════════════════════════════════════════════════════════════════

describe("the scanner itself", () => {
  it("derives a non-trivial tone-aware token set from tokens.css", () => {
    // If this set came back empty every var() would read as tone-FIXED and the
    // suite would fail everywhere for the wrong reason; if it came back
    // universal nothing would ever be flagged.
    expect(TONE_AWARE.size).toBeGreaterThan(20);
    expect(TONE_AWARE.has("--ink-500")).toBe(true);
    expect(TONE_AWARE.has("--ink-900")).toBe(true);
    expect(TONE_AWARE.has("--surface")).toBe(true);
    // --on-solid is white in BOTH ramps: it is the token the shipped bug used.
    expect(TONE_AWARE.has("--on-solid")).toBe(false);
  });

  it("treats the frame axis as axis-keyed, and the resource-tile one as not", () => {
    // Without this the `data-frame` widening is a silent no-op: a regex that
    // matched nothing would leave every test in this file green while the axis
    // it claims to cover went unscanned. Both directions are asserted.
    expect(AXIS_KEYED.test('[data-frame="color"] .card')).toBe(true);
    expect(AXIS_KEYED.test('[data-frame="glass"][data-bg="photo"] .x')).toBe(
      true,
    );
    expect(AXIS_KEYED.test(":global([data-frame='paper']) .vcDetail")).toBe(
      true,
    );
    // The resource-TYPE axis of the same name — must stay invisible to the scan.
    expect(AXIS_KEYED.test('.tile[data-frame="video"] .frame')).toBe(false);
    expect(AXIS_KEYED.test('.previewFrame[data-frame="document"]')).toBe(false);
    // And the corpus really does contain frame-keyed rules to scan, so this is
    // not a guard over an empty set.
    const framed = appStylesheets().filter((f) =>
      /\[data-frame=["']?(?:glass|paper|color)/.test(stripComments(read(f))),
    );
    expect(framed.length).toBeGreaterThan(1);
    expect(framed).toContain("app/themes.css");
  });

  it("classifies values the way the contract does", () => {
    expect(toneAware("var(--ink-600)")).toBe(true);
    expect(toneAware("inherit")).toBe(true);
    expect(toneAware("var(--on-solid)")).toBe(false);
    expect(toneAware("#fff")).toBe(false);
    expect(toneAware("rgba(255, 255, 255, 0.9)")).toBe(false);
    expect(toneAware("var(--ink-600, #fff)")).toBe(false);
    // A color-mix of tone-aware tokens flips with them, so it passes; one that
    // mixes in a fixed hue does not.
    expect(
      toneAware("color-mix(in srgb, var(--ink-900) 75%, var(--ink-500))"),
    ).toBe(true);
    expect(toneAware("color-mix(in srgb, var(--ink-900) 75%, #fff)")).toBe(
      false,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · The regression that shipped — asserted directly, on the file
// ═══════════════════════════════════════════════════════════════════════════

describe("TeachChooser hero copy honours the tone (the 1.00:1 white-on-white)", () => {
  const FILE = "components/boards/TeachChooser.module.css";

  it("is the file we think it is", () => {
    const src = read(FILE);
    expect(src).toContain(".prompt {");
    expect(src).toContain(".cardSub {");
    expect(src).toContain("background: var(--surface)");
  });

  it("never pins white ink on the photo axis without a tone branch", () => {
    // The exact shape of the bug: `[data-bg="photo"]` (no tone) → --on-solid.
    expect(scan(FILE)).toEqual([]);
  });

  it("carries BOTH arms — dark tone gets light ink, light tone gets dark ink", () => {
    const src = stripComments(read(FILE));
    const arm = (tone: string): string => {
      const re = new RegExp(
        `\\[data-bg="photo"\\]\\[data-tone="${tone}"\\]\\)\\s*\\.prompt\\s*\\{([^}]*)\\}`,
      );
      const m = src.match(re);
      expect(m, `no [data-tone="${tone}"] arm for .prompt`).not.toBeNull();
      return m![1];
    };
    // Dark stage → white ink (unchanged from before the veil landed).
    expect(arm("dark")).toContain("var(--on-solid)");
    // Light stage (the veil) → dark ink. Fixing one direction only is half a
    // contract: white-on-white and ink-on-dark are the same bug mirrored.
    const light = arm("light");
    expect(light).toContain("var(--ink-");
    expect(light).not.toContain("--on-solid");
  });

  it("stops forcing photo ink on .cardSub, which sits on an OPAQUE card", () => {
    // .cardSub is inside `.card.card { background: var(--surface) }`. The photo
    // never reaches it, so any photo-keyed override of its colour is both
    // unnecessary and — once the veil turned the stage white — the 1.00:1.
    const src = stripComments(
      read("components/boards/TeachChooser.module.css"),
    );
    for (const rule of leafRules(src)) {
      if (!/\.cardSub\b/.test(rule.selector)) continue;
      expect(
        AXIS_KEYED.test(rule.selector),
        `.cardSub must not be styled off an appearance axis: ${rule.selector}`,
      ).toBe(false);
    }
  });
});

describe("BoardLibrary controls that sit on the bare stage", () => {
  const FILE = "components/teach/library/BoardLibrary.module.css";

  it("is the file we think it is", () => {
    const src = read(FILE);
    expect(src).toContain(".sortLabel {");
    expect(src).toContain(".teamLibraryTitle {");
  });

  it("never pins a tone-fixed ink on an appearance axis", () => {
    expect(scan(FILE)).toEqual([]);
  });

  it("does not use a raw accent hue as small text", () => {
    // --wf-purple-accent (#7c5cf6) is 4.40:1 on --surface-warm and 3.36:1 on
    // the dark one: it fails AA on BOTH tones at 16px/800 (not WCAG-large,
    // which needs >=18.66px). It must be mixed toward the ink ramp, which also
    // makes it self-inverting because --ink-900 flips.
    const src = stripComments(read(FILE));
    const m = src.match(/\.teamLibraryTitle\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/color:\s*var\(--wf-purple-accent\)\s*;/);
    expect(m![1]).toContain("--ink-900");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · The whole tier — a repo-wide guard with an explicit, reasoned allowlist
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Known axis-keyed, tone-fixed ink rules that are NOT bugs today, each with the
 * reason it is exempt. Anything not on this list is a new violation and fails.
 *
 * All of these live in files this lane does not own; they are recorded here so
 * the sweep result is durable rather than a paragraph in a report, and so the
 * next one to appear is caught rather than joining an unexamined pile.
 */
const ALLOWLIST: { file: string; selector: RegExp; why: string }[] = [
  // NOT listed, deliberately: `app/chrome.css:910` `.home[data-bg="ambient"]
  // .hero-quote`. A coarser grep flags it, but its values are `var(--ink)` /
  // `var(--ink-soft)` — both redefined in the dark block — so it satisfies the
  // contract at the value level. (It is separately DEAD: `data-bg` is
  // `photo|wash`; `ambient` is the v1 spelling that folded to `wash`,
  // themes.css:21. That is a cleanup, not a legibility bug.)
  // REMOVED 2026-08-09, and the removal is the point. This entry exempted the
  // "DORMANT TIER" in app/themes.css: the ported handoff frame vocabulary
  // (.card / .lane / .chip / .badge / .fr-chrome / .fr-title / .fr-eyebrow /
  // .fr-strip / .metapill), which no .tsx renders because this app styles its
  // surfaces with CSS Modules and those selectors name bare global classes.
  // Those 99 rules were DELETED rather than left exempt, so the entry stopped
  // matching anything and the "no stale exemptions" test below failed — which
  // is precisely the job that test exists to do.
  //
  // Two findings the entry carried, kept here so they are not lost with it:
  //   • Its bare-root member survives the deletion and is now TONE-BRANCHED
  //     (`[data-frame="glass"][data-bg="photo"][data-tone="dark"]` + a light
  //     arm on `var(--ink)`), so it satisfies the contract in its own selector
  //     and needs no exemption.
  //   • The earlier claim that the un-branched form was "armed app-wide, inert
  //     only because every component sets its own ink" was WRONG.
  //     `app/globals.css` `body { color: var(--ink) }` is unconditional and
  //     sits on the ancestor of every rendered node, so it blocks inheritance
  //     from <html> outright. Measured under Photo-Bright: <html> computed
  //     rgb(244,246,251) while <body>, a bare injected div, and a bare span in
  //     #main-content all computed rgb(28,27,46).
  // Also NOT listed: `app/themes.css:1668` `.home[data-bg="photo"]
  // .lesson-menu button svg`. It sets `var(--accent)`, which the dark block
  // redefines, so it is tone-aware by value. (It is dormant besides —
  // `.lesson-menu` / `.toolspop` have no .tsx consumer.)
];

describe("no NEW axis-keyed rule pins a tone-fixed ink", () => {
  it("the allowlist is exhaustive — every hit is either fixed or reasoned", () => {
    const files = appStylesheets();
    // Positive control on the corpus itself: a sweep that scanned nothing would
    // pass this suite trivially, which is the classic fail-open QA instrument.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("components/boards/TeachChooser.module.css");
    expect(files).toContain("app/themes.css");

    const unexplained: string[] = [];
    for (const f of files) {
      for (const v of scan(f)) {
        const ok = ALLOWLIST.some(
          (a) => a.file === v.file && a.selector.test(v.selector),
        );
        if (!ok)
          unexplained.push(
            `${v.file}:${v.line}  ${v.selector}  →  color: ${v.value}`,
          );
      }
    }
    expect(unexplained, `\n${unexplained.join("\n")}\n`).toEqual([]);
  });

  it("every allowlist entry still matches something (no stale exemptions)", () => {
    // An allowlist that outlives its hits quietly widens; each entry has to
    // keep earning its place.
    const all = appStylesheets().flatMap((f) => scan(f));
    for (const a of ALLOWLIST) {
      expect(
        all.some((v) => v.file === a.file && a.selector.test(v.selector)),
        `stale allowlist entry: ${a.file} ${a.selector} — delete it`,
      ).toBe(true);
    }
  });
});
