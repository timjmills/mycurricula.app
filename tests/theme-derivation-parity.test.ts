import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  deriveTone,
  APP_THEMES,
  FRAME_VALUES,
  GLASS_VALUES,
  BG_VALUES,
  DIM_VALUES,
} from "@/lib/theme-values";
import type { AppTheme, ThemeBg, ThemeDim, ThemeGlass, ThemeTone } from "@/lib/theme-values";

// ═══════════════════════════════════════════════════════════════════════════
// THREE-DERIVATION PARITY, MADE MECHANICAL — and the five-surface lockstep.
//
// WHAT WAS WRONG WITH THE COVERAGE THIS REPLACES.
// `tests/theme-values.test.ts` asserts deriveTone with SEVEN HAND-WRITTEN
// cases. Hand-picked cases test the author's mental model, not the function:
// they pass by construction on the branches the author remembered. The
// cross-product in that file (:46-52) is real but covers only the COOKIE
// CODEC — it never reaches the tone derivation. And no test in the repo
// imported or executed `lib/theme-init.tsx` at all, so the boot script — one
// of the three places tone is derived — was entirely unexercised.
//
// THE LATENT FRAGILITY THAT MOTIVATED THIS. The boot replica omits
// deriveTone's explicit `dim === "dim" → dark` branch and reaches the same
// answer only by FALLING THROUGH to its final `else tone = "dark"`. That is
// correct today and provable below — but it is correct by accident of ordering
// rather than by construction, so any future edit that changes the fall-through
// default silently desynchronises boot paint from SSR paint. A cross-product
// guard converts "correct today" into "cannot drift undetected".
//
// WHY THIS EXECUTES THE REAL SCRIPT RATHER THAN A TRANSCRIPTION.
// `THEME_INIT_SCRIPT` is a module-private template literal, not an export. The
// tempting move is to export it; this file deliberately does NOT, because
// `lib/theme-init.tsx` is on CLAUDE.md §4's five-surface lockstep list and is
// not this lane's to edit. Instead the script is READ FROM SOURCE and executed
// against stubbed globals. That is strictly stronger than a re-typed copy: a
// transcription tests the transcription (the same mistake this lane already
// made once, with an @supports fallback measured from a retyped expression
// rather than from the shipped CSS).
//
// The source path is redirectable via MC_THEME_INIT_PATH so the counterfactual
// in scripts/… can point the suite at a MUTATED COPY and prove these
// assertions actually go red — without ever mutating the shared working tree,
// which several lanes are live in.
// ═══════════════════════════════════════════════════════════════════════════

const REPO = path.resolve(__dirname, "..");
const read = (rel: string): string =>
  fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(REPO, rel), "utf8");

// Every source this suite reads is redirectable, for one reason: the
// counterfactual has to prove each assertion can actually go red, and this repo
// is a SHARED working tree with several lanes live in it. Mutating a real file
// — even transiently, even with a restore — races them. Redirecting to a
// mutated temp copy proves the same thing and touches nothing.
const THEME_INIT_PATH = process.env.MC_THEME_INIT_PATH ?? "lib/theme-init.tsx";
const MIGRATION_PATH =
  process.env.MC_MIGRATION_PATH ?? "supabase/migrations/20260624120000_v2_theme_axes.sql";
const PROBE_PATH = process.env.MC_PROBE_PATH ?? "scripts/probe-theme-wave.mjs";
const LAYOUT_PATH = process.env.MC_LAYOUT_PATH ?? "app/layout.tsx";

/** Blank comments while preserving line count, so a prose mention of a token
 *  can never satisfy an assertion about the code. Line numbers stay true. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** Extract the THEME_INIT_SCRIPT template literal from the real source file. */
function bootScriptSource(): string {
  const src = read(THEME_INIT_PATH);
  const marker = "const THEME_INIT_SCRIPT = `";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`THEME_INIT_SCRIPT not found in ${THEME_INIT_PATH}`);
  const bodyStart = start + marker.length;
  // The script contains no backticks of its own, so the next one closes it.
  const end = src.indexOf("`", bodyStart);
  if (end < 0) throw new Error("unterminated THEME_INIT_SCRIPT template literal");
  return src.slice(bodyStart, end);
}

interface BootResult {
  theme?: string;
  frame?: string;
  glass?: string;
  bg?: string;
  dim?: string;
  tone?: string;
}

/** Execute the real boot script against stubbed globals and return what it
 *  wrote to `document.documentElement.dataset`. */
function runBoot(
  stored: Record<string, string>,
  opts: { prefersDark?: boolean } = {},
): BootResult {
  const dataset: Record<string, string> = {};
  const store = { ...stored };
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  };
  const documentStub = { documentElement: { dataset } };
  const matchMedia = () => ({ matches: opts.prefersDark ?? false });
  // `vm.runInNewContext` rather than `new Function`, for a testing reason as
  // much as a hygiene one: a new context exposes ONLY the globals supplied
  // here, so if the boot script ever starts reaching for something unstubbed it
  // fails loudly with a ReferenceError. Under `new Function` that same
  // reference would silently resolve against Node's real global and the test
  // would keep passing while measuring something other than the browser's
  // behaviour.
  vm.runInNewContext(bootScriptSource(), {
    document: documentStub,
    localStorage,
    matchMedia,
  });
  return dataset as BootResult;
}

const KEY = {
  theme: "mycurricula:user:theme",
  frame: "mycurricula:user:theme-frame",
  glass: "mycurricula:user:theme-glass",
  bg: "mycurricula:user:theme-bg",
  dim: "mycurricula:user:theme-dim",
};

describe("boot script — the instrument itself", () => {
  // A harness that silently fails to execute the script would make every
  // parity assertion below vacuously true. These prove it runs and writes.
  it("executes and populates every axis attribute", () => {
    const out = runBoot({
      [KEY.theme]: "clear",
      [KEY.frame]: "color",
      [KEY.glass]: "dark",
      [KEY.bg]: "photo",
      [KEY.dim]: "bright",
    });
    expect(out.theme).toBe("clear");
    expect(out.frame).toBe("color");
    expect(out.glass).toBe("dark");
    expect(out.bg).toBe("photo");
    expect(out.dim).toBe("bright");
    expect(out.tone).toBeDefined();
  });

  it("is reading a script of plausible size (not an empty match)", () => {
    const src = bootScriptSource();
    expect(src.length).toBeGreaterThan(600);
    expect(src).toContain("dataset.tone");
  });

  it("falls back to defaults for unrecognised stored values", () => {
    const out = runBoot({
      [KEY.theme]: "not-a-theme",
      [KEY.frame]: "not-a-frame",
      [KEY.glass]: "nope",
      [KEY.bg]: "nope",
      [KEY.dim]: "nope",
    });
    expect(out.theme).toBe("clear");
    expect(out.frame).toBe("glass");
    expect(out.glass).toBe("dark");
    expect(out.bg).toBe("photo");
    expect(out.dim).toBe("normal");
  });
});

describe("deriveTone parity — boot script vs canonical, FULL cross-product", () => {
  it("agrees on every (theme × glass × bg × dim) combination", () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const theme of APP_THEMES)
      for (const glass of GLASS_VALUES)
        for (const bg of BG_VALUES)
          for (const dim of DIM_VALUES) {
            const boot = runBoot({
              [KEY.theme]: theme,
              [KEY.frame]: "glass",
              [KEY.glass]: glass,
              [KEY.bg]: bg,
              [KEY.dim]: dim,
            });
            // The boot script paints BEFORE the async photo-luminance sample,
            // so its equivalent call always passes autoTone = null.
            const canonical = deriveTone(theme, glass, bg, dim, null);
            checked += 1;
            if (boot.tone !== canonical) {
              mismatches.push(
                `theme=${theme} glass=${glass} bg=${bg} dim=${dim} → boot=${boot.tone} canonical=${canonical}`,
              );
            }
          }
    // Positive control on the sweep itself: 7 × 2 × 2 × 3 = 84.
    expect(checked).toBe(
      APP_THEMES.length * GLASS_VALUES.length * BG_VALUES.length * DIM_VALUES.length,
    );
    expect(checked).toBe(84);
    expect(mismatches, `\n${mismatches.join("\n")}\n`).toEqual([]);
  });

  it("the `system` sentinel resolves via prefers-color-scheme, both ways", () => {
    const dark = runBoot({ [KEY.theme]: "system", [KEY.bg]: "wash" }, { prefersDark: true });
    expect(dark.theme).toBe("night");
    expect(dark.tone).toBe("dark");
    const light = runBoot({ [KEY.theme]: "system", [KEY.bg]: "wash" }, { prefersDark: false });
    expect(light.theme).toBe("clear");
    expect(light.tone).toBe(deriveTone("clear", "dark", "wash", "normal", null));
  });

  it("the v1 paper|cloud themes remap to clear and still derive in parity", () => {
    for (const legacy of ["paper", "cloud"]) {
      for (const bg of BG_VALUES)
        for (const dim of DIM_VALUES) {
          const boot = runBoot({ [KEY.theme]: legacy, [KEY.bg]: bg, [KEY.dim]: dim });
          expect(boot.theme).toBe("clear");
          expect(boot.tone).toBe(deriveTone("clear", "dark", bg, dim, null));
        }
    }
  });
});

describe("deriveTone — the canonical function's own contract", () => {
  it("is total and returns only light|dark across the full autoTone product", () => {
    const autoTones: (ThemeTone | null)[] = [null, "light", "dark"];
    let checked = 0;
    for (const theme of APP_THEMES)
      for (const glass of GLASS_VALUES)
        for (const bg of BG_VALUES)
          for (const dim of DIM_VALUES)
            for (const auto of autoTones) {
              const tone = deriveTone(theme, glass, bg, dim, auto);
              expect(["light", "dark"]).toContain(tone);
              checked += 1;
            }
    expect(checked).toBe(84 * 3);
  });

  it("autoTone can ONLY matter on photo + normal, with glass=dark and theme≠night", () => {
    // This pins the rule the boot script is allowed to skip: everywhere else the
    // earlier branches decide, so boot (autoTone=null) and provider agree.
    const differing: string[] = [];
    for (const theme of APP_THEMES)
      for (const glass of GLASS_VALUES)
        for (const bg of BG_VALUES)
          for (const dim of DIM_VALUES) {
            const a = deriveTone(theme, glass, bg, dim, "light");
            const b = deriveTone(theme, glass, bg, dim, "dark");
            if (a !== b) differing.push(`${theme}/${glass}/${bg}/${dim}`);
          }
    expect(differing.sort()).toEqual(
      APP_THEMES.filter((t) => t !== "night")
        .map((t) => `${t}/dark/photo/normal`)
        .sort(),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FIVE-SURFACE ALLOWLIST LOCKSTEP (CLAUDE.md §4).
//
// Change one, change all. The surfaces carry the axis value lists in five
// different LANGUAGES — TypeScript arrays, a JS string inside a template
// literal, SQL `in (…)` lists, JSX attributes, and a probe's own consts — so
// nothing but an explicit cross-check can catch a drift between them.
// ═══════════════════════════════════════════════════════════════════════════

/** Pull `["a","b"]` style literals out of arbitrary source text. */
function arrayLiteralAfter(src: string, anchor: string): string[] {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error(`anchor not found: ${anchor}`);
  const open = src.indexOf("[", i);
  const close = src.indexOf("]", open);
  if (open < 0 || close < 0) throw new Error(`no array literal after: ${anchor}`);
  return [...src.slice(open + 1, close).matchAll(/["']([a-z0-9-]+)["']/gi)].map((m) => m[1]);
}

/** Pull an SQL `in ('a', 'b')` list for a named CHECK constraint. */
function sqlCheckValues(src: string, constraint: string): string[] {
  const i = src.indexOf(`add constraint ${constraint}`);
  if (i < 0) throw new Error(`constraint not found: ${constraint}`);
  const open = src.indexOf("in (", i);
  const close = src.indexOf("))", open);
  if (open < 0 || close < 0) throw new Error(`no in(...) list for ${constraint}`);
  return [...src.slice(open, close).matchAll(/'([a-z0-9-]+)'/gi)].map((m) => m[1]);
}

describe("five-surface allowlist lockstep", () => {
  it("surface 2 — the boot script's inline arrays match the canonical guards", () => {
    const boot = bootScriptSource();
    expect(arrayLiteralAfter(boot, "var themes =")).toEqual([...APP_THEMES]);
    expect(arrayLiteralAfter(boot, "var frames =")).toEqual([...FRAME_VALUES]);
    // glass / bg / dim are validated inline rather than via a named var.
    expect(arrayLiteralAfter(boot, "theme-glass")).toEqual([...GLASS_VALUES]);
    expect(arrayLiteralAfter(boot, "theme-bg")).toEqual([...BG_VALUES]);
    expect(arrayLiteralAfter(boot, "theme-dim")).toEqual([...DIM_VALUES]);
  });

  it("surface 3 — the SQL CHECK constraints match the canonical guards", () => {
    const sql = read(MIGRATION_PATH);
    expect(sqlCheckValues(sql, "teacher_preferences_frame_chk")).toEqual([...FRAME_VALUES]);
    expect(sqlCheckValues(sql, "teacher_preferences_glass_chk")).toEqual([...GLASS_VALUES]);
    expect(sqlCheckValues(sql, "teacher_preferences_bg_chk")).toEqual([...BG_VALUES]);
    expect(sqlCheckValues(sql, "teacher_preferences_dim_chk")).toEqual([...DIM_VALUES]);
  });

  it("surface 3 — the theme CHECK is a documented SUPERSET, not an exact match", () => {
    // Deliberately NOT equality. The theme constraint accepts the v2 set PLUS
    // the v1 legacy names and the `system` sentinel, so that an in-flight v1
    // write is not rejected mid-rollout (migration §3). Asserting equality here
    // would be wrong and would fail on correct code — but an unconstrained
    // superset would let any junk value in, so the EXTRAS are pinned exactly.
    const sql = read(MIGRATION_PATH);
    const accepted = new Set(sqlCheckValues(sql, "teacher_preferences_theme_chk"));
    for (const t of APP_THEMES) expect(accepted.has(t), `theme CHECK rejects ${t}`).toBe(true);
    const extras = [...accepted].filter((v) => !APP_THEMES.includes(v as AppTheme)).sort();
    expect(extras).toEqual(["cloud", "paper", "system"]);
  });

  it("surface 5 — the wave probe's arrays match the canonical guards", () => {
    const probe = read(PROBE_PATH);
    expect(arrayLiteralAfter(probe, "const FRAME_VALUES")).toEqual([...FRAME_VALUES]);
    expect(arrayLiteralAfter(probe, "const BG_VALUES")).toEqual([...BG_VALUES]);
    expect(arrayLiteralAfter(probe, "const DIM_VALUES")).toEqual([...DIM_VALUES]);
    expect(arrayLiteralAfter(probe, "const THEME_VALUES")).toEqual([...APP_THEMES]);
  });

  it("surface 4 — app/layout.tsx emits every axis and DERIVES tone rather than guessing", () => {
    // layout.tsx carries no value LISTS to compare — it renders whatever the
    // validated cookie produced. What is assertable, and what actually matters,
    // is that it emits all six attributes and obtains tone from the canonical
    // function rather than re-implementing it. Said plainly because a
    // value-equality assertion here would be theatre.
    // ⚠ COMMENTS ARE STRIPPED FIRST, AND THE ATTRIBUTE FORM `data-x={` IS
    // REQUIRED. The first version of this assertion used
    // `expect(layout).toContain("data-tone")` — and the counterfactual caught it
    // as VACUOUS: deleting the real `data-tone={ssrTone}` attribute left the
    // test GREEN, because app/layout.tsx:107 mentions "data-tone" in a PROSE
    // COMMENT and that satisfied the substring check. A guard answered by a
    // comment asserts nothing about what the server actually renders.
    const layout = stripComments(read(LAYOUT_PATH));
    for (const attr of ["data-frame", "data-glass", "data-bg", "data-theme", "data-dim", "data-tone"]) {
      expect(layout, `app/layout.tsx no longer RENDERS ${attr}={…}`).toMatch(
        new RegExp(`${attr}=\\{`),
      );
    }
    expect(layout).toMatch(/deriveTone\(\s*ssrTheme/);
    expect(layout).toContain("axes.glass");
    expect(layout).toContain("axes.bg");
    expect(layout).toContain("axes.dim");
  });

  it("the canonical guards themselves are non-empty and duplicate-free", () => {
    // Positive control on the comparison target: if these were empty, every
    // lockstep assertion above would compare [] to [] and pass.
    for (const [name, vals] of [
      ["APP_THEMES", APP_THEMES],
      ["FRAME_VALUES", FRAME_VALUES],
      ["GLASS_VALUES", GLASS_VALUES],
      ["BG_VALUES", BG_VALUES],
      ["DIM_VALUES", DIM_VALUES],
    ] as const) {
      expect(vals.length, `${name} is empty`).toBeGreaterThan(1);
      expect(new Set(vals).size, `${name} has duplicates`).toBe(vals.length);
    }
    expect(APP_THEMES.length).toBe(7);
  });
});
