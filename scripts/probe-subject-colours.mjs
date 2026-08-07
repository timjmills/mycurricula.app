// scripts/probe-subject-colours.mjs — §4b live QA for the derived subject scale
// (task #44), the handoff slot conformance fix (task #50), and the strict
// decorative-colour rule (wave F1).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. A unit test can only assert that
// `app/tokens.css` contains a string. This asks the BROWSER what a subject
// colour actually resolves to after the whole cascade — every theme override,
// every `data-tone` branch, every `color-mix()` — and measures contrast on
// those resolved values in the four appearance conditions the tone contract
// branches on: Photo-Dim, Photo-Bright, Wash and Night.
//
// ── WHAT WAS WRONG WITH IT, AND WHY THAT MATTERED ──────────────────────────
//
// THIS PROBE NEVER READ A SUBJECT. It resolved `--subj-1 … --subj-15` and
// graded those, which says nothing whatever about whether MATH is on slot 1.
// Every one of its 392 assertions would have gone green with all eight subjects
// rotated onto each other's slots — the single failure this file's own header
// claimed to be the live backstop for (tests/subject-slot-map.test.ts:106
// names it as exactly that). It is now fixed by asserting the two live values
// against each other:
//
//     getComputedStyle(div.cp-subj.math).getPropertyValue("--c")
//         must equal
//     getComputedStyle(:root).getPropertyValue("--subj-1")
//
// keyed by an INLINE transcription of CLAUDE.md §4's map. Deliberately not
// imported from lib/subject-color.ts or lib/palette-data.ts: an oracle taken
// from the code under test proves only that the app agrees with itself.
//
// COLOUR PARSING IS THE TRAP THIS FILE IS BUILT AROUND. Chrome returns
// `color(srgb 0.66 0.57 0.25)` for some of these — 0–1 floats — while others
// come back as `rgb(168 146 64)` — 0–255. A scraper that reads the numbers out
// of the string conflates the two and INFLATES every ratio (it has already
// happened on this repo). Every colour here is therefore resolved THROUGH THE
// CANVAS: `ctx.fillStyle = value` then `getImageData`, which hands back 0–255
// bytes whatever the input syntax was.
//
// THE EXIT-CODE CONTRACT (three states, because two cannot tell the difference
// between "verified clean" and "could not look"):
//
//     0  every intended cell was measured and every assertion passed
//     1  a real failure — an assertion that ran, and failed
//     2  the INSTRUMENT is blind: a cell could not be measured (the appearance
//        axis did not apply, the colour never settled, a picker was
//        unreachable), or zero assertions ran
//
// A cell that could not be measured is NEVER silently graded. The old code did
// the opposite: it `check()`ed the derived tone, so a condition that failed to
// apply produced a FINDING about the product rather than a finding about the
// run. On this machine that is a live hazard — `.env.local` points at
// production Supabase and the synced account's saved preferences can override
// the seeded ones — so "the axis did not apply" is a routine event and must
// report as ABSENT, not as red.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-subject-colours.mjs
//        PROBE_BASE   defaults to http://localhost:3014
//        PROBE_MUTATE `math:5` — repaint one subject onto the wrong slot in the
//                     page, to prove the map assertion can actually fail.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLoginOnPage, requireToken } from "./lib/auth.mjs";

// Imported dynamically so a Node without TypeScript type stripping fails with
// an actionable message instead of an opaque ERR_UNKNOWN_FILE_EXTENSION at
// parse time. A §4b gate that cannot start looks identical to a §4b gate that
// was skipped, which is the more expensive of the two failures.
//
// NOTE what is and is not taken from here. `SUBJECT_SLOTS` supplies the fifteen
// slot HEXES (the task-#44 derivation check — "is --subj-7 the colour the
// derivation says it is"), and the two contrast floors. It is NOT used for the
// subject→slot map; see the header.
const { SUBJECT_SLOTS, NON_TEXT_MIN, TEXT_MIN } = await import(
  new URL("../lib/subject-color.ts", import.meta.url).href
).catch((err) => {
  console.error(
    `Could not load lib/subject-color.ts (running Node ${process.versions.node}).\n` +
      "This probe imports TypeScript directly and needs Node >= 22.18, or an\n" +
      "older Node run with --experimental-strip-types.\n" +
      `Underlying error: ${err?.message ?? err}`,
  );
  process.exit(1);
});

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/f1-colour-sweep");
await mkdir(OUT, { recursive: true });

/** CLAUDE.md §4's locked, team-wide subject→slot map — TRANSCRIBED, not
 *  imported. This is the probe's oracle, and an oracle read out of the module
 *  under test is not an oracle. Sources agreeing on these values:
 *    CLAUDE.md §4 ("the locked, team-wide subject→slot map")
 *    Documents/…/6.24.26 design_handoff_v2_site/source/data.js:7-14
 *    …/design-system/V2 Framework.md:184-193
 *  The same eight pairs are pinned statically in tests/subject-slot-map.test.ts;
 *  that file checks the SOURCE, this one checks the rendered cascade. */
const HANDOFF_SUBJECT_SLOTS = {
  math: 1,
  ufli: 2,
  writing: 5,
  grammar: 7,
  spelling: 9,
  reading: 10,
  sel: 12,
  explorers: 13,
};

/** The seven slots no team subject owns, and their hue names — the strict rule
 *  every decorative picker must obey (lib/card-wash). Transcribed here for the
 *  same reason as the map above. */
const UNOWNED_SLOTS = [3, 4, 6, 8, 11, 14, 15];
const UNOWNED_NAMES = {
  3: "Coral",
  4: "Rose",
  6: "Magenta",
  8: "Violet",
  11: "Cyan",
  14: "Leaf",
  15: "Lime",
};

/** The four conditions the tone contract branches on (CLAUDE.md §4).
 *  Cookie shape: v1.frame.glass.bg.theme.dim.style.palette — see
 *  lib/theme-values.ts encodeThemeAxesCookie. Appearance is seeded by COOKIE,
 *  never by clicking through Settings: `.env.local` points at production
 *  Supabase and the theme-sync path writes `teacher_preferences` back.
 *
 *  THE COOKIE ALONE IS NOT ENOUGH, and this cost a run. The cookie seeds the SSR
 *  attributes, but `lib/theme.tsx` treats localStorage as the source of truth and
 *  SELF-HEALS the cookie from it after hydration — so a probe that sets only the
 *  cookie measures the bypass account's saved preferences, silently, and reports
 *  them as whatever condition it thought it asked for. (Observed: a `dim` cookie
 *  hydrating to `data-tone="light"`.) Both are seeded below — and because even
 *  both can lose to a synced preference, the derived tone is checked as a
 *  PRECONDITION, not as an assertion. */
const CONDITIONS = [
  {
    id: "photo-dim",
    axes: "v1.glass.dark.photo.clear.dim.vivid.normal",
    store: { theme: "clear", "theme-frame": "glass", "theme-glass": "dark", "theme-bg": "photo", "theme-dim": "dim" },
    tone: "dark",
  },
  {
    id: "photo-bright",
    axes: "v1.glass.light.photo.clear.bright.vivid.normal",
    store: { theme: "clear", "theme-frame": "glass", "theme-glass": "light", "theme-bg": "photo", "theme-dim": "bright" },
    tone: "light",
  },
  {
    id: "wash",
    axes: "v1.glass.light.wash.clear.normal.vivid.normal",
    store: { theme: "clear", "theme-frame": "glass", "theme-glass": "light", "theme-bg": "wash", "theme-dim": "normal" },
    tone: "light",
    /** The condition that also sweeps the non-Appearance routes. One is enough:
     *  the map assertion compares two values that move together under every
     *  tone, so re-running it in four tones on four routes buys repetition, not
     *  coverage — while four extra cold dev compiles per route buys minutes. */
    sweepRoutes: true,
  },
  {
    id: "night",
    axes: "v1.glass.dark.photo.night.normal.vivid.normal",
    store: { theme: "night", "theme-frame": "glass", "theme-glass": "dark", "theme-bg": "photo", "theme-dim": "normal" },
    tone: "dark",
  },
];

/** Routes swept beyond /settings/appearance, and what each is there to prove. */
const SWEEP_ROUTES = [
  { path: "/weekly", why: "the primary lesson surface" },
  { path: "/daily", why: "the day pane + planning tabs" },
  { path: "/post", why: "the Resource Wall's card-colour picker" },
];

const failures = [];
const notes = [];
let assertions = 0;
function check(label, cond, detail = "") {
  assertions++;
  // Attribute the assertion to the cell currently open, so a cell's count is
  // its OWN work and not its children's — a route that asserted nothing itself
  // must not look measured because a picker nested inside it did.
  if (currentCell) currentCell.n += 1;
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
}
const info = (label, detail = "") =>
  notes.push(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);

/* ── the coverage ledger ───────────────────────────────────────────────────
 * Every cell this run INTENDED to measure is declared before it is attempted,
 * and closed as either scored or unmeasured. Without this, "0 failures" and
 * "measured nothing" print identically — the failure mode this repo has shipped
 * more than once. Reconciled at the end; any unmeasured cell forces exit 2. */
const coverage = [];
/** The cell `check()` currently attributes to. Cells nest one level (a picker
 *  check inside a route sweep), so opening one stashes its parent and closing
 *  restores it. */
let currentCell = null;
const declare = (id, what) => {
  const cell = { id, what, status: "pending", reason: "", n: 0, parent: currentCell };
  coverage.push(cell);
  currentCell = cell;
  return cell;
};
const close = (cell) => {
  currentCell = cell.parent ?? null;
};
const scored = (cell) => {
  // A cell that ran but asserted nothing is BLIND, not clean. This is the whole
  // "0/0 must not exit 0" rule, applied per cell rather than only in aggregate.
  if (cell.n === 0) {
    cell.status = "unmeasured";
    cell.reason = "ran but made zero assertions";
  } else {
    cell.status = "scored";
  }
  close(cell);
};
const unmeasured = (cell, reason) => {
  cell.status = "unmeasured";
  cell.reason = reason;
  notes.push(`ABSENT  ${cell.id} — ${reason}`);
  close(cell);
};

/* ── in-page helpers, injected once per context ───────────────────────────── */
const PAGE_HELPERS = () => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });

  /** ANY CSS colour syntax → [r,g,b] 0–255, resolved by the engine rather than
   *  parsed. Returns null when the value is not a colour the engine accepts,
   *  so an unresolvable token fails LOUDLY instead of scoring as black. */
  window.__toRgb = (value) => {
    if (!value || !value.trim()) return null;
    ctx.clearRect(0, 0, 1, 1);
    // A sentinel fill first: if `value` is invalid, fillStyle keeps the
    // sentinel and we can tell "invalid" from "genuinely that colour".
    ctx.fillStyle = "#ff00ff";
    ctx.fillStyle = value;
    if (ctx.fillStyle === "#ff00ff" && !/^#ff00ff$/i.test(value.trim())) return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };

  const lin = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  window.__lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  window.__ratio = (a, b) => {
    const [x, y] = [window.__lum(a), window.__lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  /** The colour actually BEHIND `el` — walk ancestors until one paints a fully
   *  opaque background. A translucent glass panel over a photo has no single
   *  backdrop, so this reports what it found AND whether it had to give up. */
  window.__backdrop = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = /^rgba?\(([^)]+)\)/.exec(bg);
      if (!m) continue;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const alpha = parts.length > 3 ? parts[3] : 1;
      if (alpha >= 0.999) {
        return { rgb: [parts[0], parts[1], parts[2]], opaque: true, from: n.tagName + "." + n.className };
      }
    }
    return { rgb: null, opaque: false, from: null };
  };

  /** A SYNTHETIC subject probe: the `.cp-subj.<id>` class the whole app paints
   *  subject colour through, attached to the live document so it inherits the
   *  real cascade — every theme override, the PaletteCssBridge's injected rule,
   *  the tone branch. Off-screen and pointer-inert so it cannot disturb layout
   *  or a screenshot.
   *
   *  WHY SYNTHETIC AT ALL. A route with no lessons paints no subject stripe,
   *  and localhost is routinely in that state — so keying the map assertion on
   *  a real card would make the check silently vanish exactly when the fixture
   *  data is thin. The synthetic node resolves the SAME rules; where a real
   *  painted element exists it is read as well, and the two must agree. */
  window.__subjectVars = (id, names) => {
    const el = document.createElement("div");
    el.className = `cp-subj ${id}`;
    el.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none";
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {};
    for (const n of names) out[n] = window.__toRgb(cs.getPropertyValue(n));
    el.remove();
    return out;
  };
};

const hex = (rgb) =>
  rgb ? "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("") : "null";

/* ── settle gate ───────────────────────────────────────────────────────────
 * This app hydrates in 5–30s on a cold dev route, and the subject colour a page
 * shows BEFORE the PaletteCssBridge mounts comes from a different rule than the
 * one it shows after (tokens.css's static `.cp-subj.math { --c: var(--math) }`
 * fallback vs the bridge's injected `--c: var(--subj-1)`). Sampling early reads
 * the fallback and reports it as the answer.
 *
 * Gated on SIGNALS, never on a timer: the bridge's own <style> being present in
 * the document, and then the resolved colour holding still across two reads a
 * second apart. A gate that gives up returns false, and the caller records the
 * cell as unmeasured rather than grading whatever it happened to catch. */
async function settle(page, { timeoutMs = 60000 } = {}) {
  const started = Date.now();
  let bridgeSeen = false;
  let last = null;
  let stableSince = null;
  while (Date.now() - started < timeoutMs) {
    const sample = await page.evaluate(() => {
      const bridge = [...document.querySelectorAll("style")].some(
        (s) => s.textContent && /\.cp-subj\.[a-z-]+\s*\{[^}]*--sc\s*:/.test(s.textContent),
      );
      const vars = window.__subjectVars("math", ["--c"]);
      return { bridge, c: vars["--c"] ? vars["--c"].join(",") : null };
    });
    if (sample.bridge) bridgeSeen = true;
    if (bridgeSeen && sample.c && sample.c === last) {
      // Two equal reads ≥1s apart with the bridge mounted.
      if (stableSince && Date.now() - stableSince >= 1000) {
        return { ok: true, ms: Date.now() - started, value: sample.c };
      }
      if (!stableSince) stableSince = Date.now();
    } else {
      stableSince = null;
    }
    last = sample.c;
    await page.waitForTimeout(1000);
  }
  return {
    ok: false,
    ms: Date.now() - started,
    reason: bridgeSeen
      ? "subject colour never held still (palette still settling)"
      : "PaletteCssBridge <style> never appeared (page did not hydrate)",
  };
}

/* ── assertions ────────────────────────────────────────────────────────────*/

/** THE ASSERTION THIS PROBE EXISTED WITHOUT. For each subject, the colour the
 *  `.cp-subj` cascade actually produces must be the colour of the slot the
 *  handoff assigns it — two independently resolved LIVE values, compared. */
async function assertSubjectMap(page, cellId) {
  const live = await page.evaluate(
    ({ map }) => {
      const root = getComputedStyle(document.documentElement);
      const out = {};
      for (const [id, slot] of Object.entries(map)) {
        const v = window.__subjectVars(id, ["--c", "--cl", "--cd", "--sc", "--sct", "--sci"]);
        out[id] = {
          slot,
          got: v,
          want: {
            solid: window.__toRgb(root.getPropertyValue(`--subj-${slot}`)),
            tint: window.__toRgb(root.getPropertyValue(`--subj-${slot}-tint`)),
            ink: window.__toRgb(root.getPropertyValue(`--subj-${slot}-ink`)),
          },
          // Every OTHER slot's solid, so a miss can name the slot it landed on
          // instead of only saying "not what we wanted".
          all: Object.fromEntries(
            Array.from({ length: 15 }, (_, i) => [
              i + 1,
              window.__toRgb(root.getPropertyValue(`--subj-${i + 1}`)),
            ]),
          ),
        };
      }
      return out;
    },
    { map: HANDOFF_SUBJECT_SLOTS },
  );

  for (const [id, r] of Object.entries(live)) {
    const eq = (a, b) => a && b && a.join() === b.join();
    const landedOn = Object.entries(r.all).find(([, v]) => eq(v, r.got["--c"]))?.[0];
    check(
      `[${cellId}] ${id} paints slot ${r.slot} (--c)`,
      eq(r.got["--c"], r.want.solid),
      `--c ${hex(r.got["--c"])}${landedOn && String(landedOn) !== String(r.slot) ? ` = slot ${landedOn}` : ""}, --subj-${r.slot} ${hex(r.want.solid)}`,
    );
    check(
      `[${cellId}] ${id} fill + ink stay on slot ${r.slot}`,
      eq(r.got["--cl"], r.want.tint) && eq(r.got["--cd"], r.want.ink),
      `--cl ${hex(r.got["--cl"])} vs ${hex(r.want.tint)} · --cd ${hex(r.got["--cd"])} vs ${hex(r.want.ink)}`,
    );
    check(
      // The bridge dual-emits a v1 trio and a v2 trio from one mapping; a
      // half-applied edit that moved one and not the other would show a
      // subject in two different colours depending on which surface read it.
      `[${cellId}] ${id}'s v1 and v2 trios agree`,
      eq(r.got["--c"], r.got["--sc"]) &&
        eq(r.got["--cl"], r.got["--sct"]) &&
        eq(r.got["--cd"], r.got["--sci"]),
      `--c ${hex(r.got["--c"])} / --sc ${hex(r.got["--sc"])}`,
    );
  }

  // A REAL painted element, where the route has one — the synthetic node proves
  // the rules resolve, this proves the app actually uses them.
  const real = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".cp-subj")].filter((el) =>
      [...el.classList].some((c) => c !== "cp-subj"),
    );
    return els.slice(0, 40).map((el) => ({
      subject: [...el.classList].find((c) => c !== "cp-subj"),
      c: window.__toRgb(getComputedStyle(el).getPropertyValue("--c")),
    }));
  });
  if (real.length === 0) {
    info(`[${cellId}] no real .cp-subj element on this route (synthetic only)`);
    return;
  }
  const mismatches = real.filter((r) => {
    const want = live[r.subject]?.got["--c"];
    return want && r.c && want.join() !== r.c.join();
  });
  check(
    `[${cellId}] all ${real.length} real .cp-subj elements match the synthetic probe`,
    mismatches.length === 0,
    mismatches.map((m) => `${m.subject}=${hex(m.c)}`).join(", "),
  );
}

/** The strict decorative rule, on the RENDERED picker: every swatch a wash
 *  picker offers must be one of the seven unowned slots, hue-named. */
async function assertWashPicker(page, cellId) {
  // ITS OWN CELL. Folding this into the route's cell would mean an unreachable
  // picker marked the whole route unmeasured and threw away the subject-map
  // assertions that DID run there — losing a real result to report an absence.
  const cell = declare(`${cellId} wash-picker`, "the wall's card-colour swatches");
  const opened = await page.evaluate(() => {
    const trigger = document.querySelector('button[aria-label="Card colour"]');
    if (!trigger) return { found: false };
    trigger.click();
    return { found: true };
  });
  if (!opened.found) {
    unmeasured(cell, "no card-colour trigger on the page (no wall cards rendered)");
    return;
  }
  await page.waitForTimeout(500);
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label^="Card colour "]')].map((e) =>
      e.getAttribute("aria-label").replace(/^Card colour /, ""),
    ),
  );
  if (labels.length === 0) {
    unmeasured(cell, "card-colour trigger clicked but no swatches appeared");
    return;
  }
  const expected = UNOWNED_SLOTS.map((n) => UNOWNED_NAMES[n]);
  check(
    `[${cellId}] the wall wash picker offers exactly the ${expected.length} unowned slots`,
    labels.length === expected.length && expected.every((n) => labels.includes(n)),
    `offered [${labels.join(", ")}], expected [${expected.join(", ")}]`,
  );
  check(
    `[${cellId}] no wash swatch is named for a team subject's hue`,
    // The old list offered Gold/Apricot/Pink/Purple/Periwinkle/Blue/Teal/Green
    // — every one a team subject's colour. Named explicitly so the regression
    // is caught by the label a teacher actually reads.
    !labels.some((l) =>
      ["Gold", "Apricot", "Pink", "Purple", "Periwinkle", "Blue", "Teal", "Green"].includes(l),
    ),
    labels.join(", "),
  );
  scored(cell);
}

/** The same rule on the rich-text font-colour ramp. */
async function assertTextColourPicker(page, cellId) {
  const cell = declare(`${cellId} text-colour-ramp`, "the rich-text font-colour swatches");
  const group = await page.evaluate(() => {
    const g = document.querySelector('[aria-label="Text color palette"]');
    if (!g) return null;
    return [...g.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
  });
  if (!group || group.length === 0) {
    unmeasured(
      cell,
      "the rich-text toolbar's colour palette is not open on this route " +
        "(it needs a mounted non-chromeless editor — see the coverage note)",
    );
    return;
  }
  const hues = group.filter((l) => l && !/^Ink /.test(l));
  const expected = UNOWNED_SLOTS.map((n) => UNOWNED_NAMES[n]);
  check(
    `[${cellId}] the rich-text ramp's hues are exactly the unowned slots`,
    hues.length === expected.length && expected.every((n) => hues.includes(n)),
    `offered [${hues.join(", ")}], expected [${expected.join(", ")}]`,
  );
  scored(cell);
}

/* ── run ───────────────────────────────────────────────────────────────────*/

const MUTATE = process.env.PROBE_MUTATE ?? "";
if (MUTATE) {
  info(
    "MUTATION MODE",
    `${MUTATE} — a subject is being repainted onto the wrong slot in-page to ` +
      "prove the map assertion fails. A clean exit here is a BROKEN PROBE.",
  );
}

const browser = await chromium.launch({ channel: "chrome" });
let controlBroken = false;

for (const cond of CONDITIONS) {
  if (controlBroken) break;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(PAGE_HELPERS);
  await context.addInitScript((store) => {
    for (const [k, v] of Object.entries(store)) {
      try {
        window.localStorage.setItem(`mycurricula:user:${k}`, v);
      } catch {
        /* storage disabled — the cookie still seeds SSR, and the tone
           precondition below records ABSENT rather than measuring the wrong one */
      }
    }
  }, cond.store);
  // The mutation is injected as a page-level override so it survives every
  // navigation and beats the bridge on specificity — the closest in-page
  // equivalent of the app shipping the wrong map.
  if (MUTATE) {
    const [subject, slot] = MUTATE.split(":");
    await context.addInitScript(
      ({ subject, slot }) => {
        const apply = () => {
          const s = document.createElement("style");
          s.id = "__probe_mutation";
          s.textContent = `.cp-subj.${subject} { --c: var(--subj-${slot}) !important; --sc: var(--subj-${slot}) !important; }`;
          document.head.appendChild(s);
        };
        if (document.head) apply();
        else document.addEventListener("DOMContentLoaded", apply);
      },
      { subject, slot },
    );
  }
  await context.addCookies([
    { name: "mc-theme-axes", value: cond.axes, url: BASE },
  ]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  const landed = await bypassLoginOnPage(page, {
    base: BASE,
    next: "/settings/appearance",
    // /auth/claude-login is a cold dev route; its FIRST compile on this repo has
    // been measured past a minute under concurrent-lane load, and a hop that
    // times out reports as "nothing rendered", which is indistinguishable from
    // a real defect.
    timeout: 240000,
  });
  info(`[${cond.id}] bypass landed on ${landed.landedOn}`);

  // `.env.local` points at PRODUCTION Supabase and lib/theme-sync.ts pushes the
  // active axes back to `teacher_preferences`. Seeding an appearance for a
  // measurement must not upsert it onto the shared bypass account, so every
  // WRITE to that table is aborted here. Registered PAGE-level and only AFTER
  // the login hop: a context-level handler installed before it would observe the
  // bypass URL, which carries the token (scripts/lib/auth.mjs).
  let blockedWrites = 0;
  await page.route(/teacher_preferences/, (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") return route.continue();
    blockedWrites += 1;
    return route.abort();
  });

  const routes = [
    { path: "/settings/appearance", full: true },
    ...(cond.sweepRoutes ? SWEEP_ROUTES.map((r) => ({ ...r, full: false })) : []),
  ];

  for (const route of routes) {
    const cellId = `${cond.id} ${route.path}`;
    const cell = declare(cellId, route.why ?? "the appearance reference page");

    // The first-run gate can park a probe on /onboarding; navigate explicitly so
    // an unexpected landing surfaces as a recorded absence rather than as a page
    // that simply has no subject colour on it.
    await page.goto(`${BASE}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 240000,
    });

    const landedPath = new URL(page.url()).pathname;
    if (landedPath !== route.path) {
      unmeasured(cell, `navigation landed on ${landedPath}, not ${route.path}`);
      continue;
    }

    const s = await settle(page);
    if (!s.ok) {
      unmeasured(cell, `${s.reason} (gave up after ${(s.ms / 1000).toFixed(0)}s)`);
      continue;
    }
    info(`[${cellId}] settled after ${(s.ms / 1000).toFixed(1)}s`);

    /* ── CONTROL — is the instrument itself sound? ───────────────────────── */
    const control = await page.evaluate(() => ({
      white: window.__toRgb("#ffffff"),
      black: window.__toRgb("#000000"),
      oklch: window.__toRgb("oklch(0.7 0.1 200)"),
      garbage: window.__toRgb("not-a-colour"),
      srgbFn: window.__toRgb("color(srgb 0.6588 0.5725 0.251)"),
      synthetic: window.__subjectVars("math", ["--c"])["--c"],
    }));
    const controlOk =
      JSON.stringify(control.white) === "[255,255,255]" &&
      JSON.stringify(control.black) === "[0,0,0]" &&
      control.oklch !== null &&
      !(control.oklch[0] === 0 && control.oklch[1] === 0 && control.oklch[2] === 0) &&
      control.garbage === null &&
      control.srgbFn !== null &&
      control.srgbFn[0] > 150 &&
      // NEW CONTROL, and the one that matters most now: the synthetic
      // `.cp-subj` node must resolve to SOMETHING. If `--c` came back null the
      // map assertions below would compare null to null and pass — a probe
      // measuring nothing while reporting eight green subjects.
      control.synthetic !== null;
    if (!controlOk) {
      // A BROKEN INSTRUMENT must not produce findings. This is an instrument
      // fault, so it is an ABSENCE, not a FAILURE — reporting it as red would
      // send someone hunting a product bug that is not there.
      unmeasured(
        cell,
        `CONTROL failed: white=${JSON.stringify(control.white)} oklch=${JSON.stringify(control.oklch)} ` +
          `garbage=${JSON.stringify(control.garbage)} srgb=${JSON.stringify(control.srgbFn)} ` +
          `synthetic --c=${JSON.stringify(control.synthetic)}`,
      );
      controlBroken = true;
      break;
    }

    /* ── PRECONDITION: did the appearance axis actually apply? ───────────── */
    const applied = await page.evaluate(() => ({
      tone: document.documentElement.dataset.tone,
      theme: document.documentElement.dataset.theme,
      bg: document.documentElement.dataset.bg,
    }));
    if (applied.tone !== cond.tone) {
      // NOT a finding about the product. On this machine the bypass account's
      // synced preferences can beat both the cookie and the seeded localStorage,
      // and grading that as a failure has produced phantom defects before.
      unmeasured(
        cell,
        `appearance axis did not apply: wanted data-tone="${cond.tone}", got ` +
          `"${applied.tone}" (theme=${applied.theme} bg=${applied.bg}) — the ` +
          "synced account preference likely won; not graded",
      );
      continue;
    }

    /* ── THE SUBJECT MAP, live ───────────────────────────────────────────── */
    await assertSubjectMap(page, cellId);

    if (route.path === "/post") await assertWashPicker(page, cellId);
    if (route.path === "/daily") {
      // Best effort, and its own cell: the ramp only exists while a
      // non-chromeless editor's colour menu is open, which needs a lesson to be
      // selected. Recorded as ABSENT (exit 2) rather than skipped when the
      // route has no lesson — "could not look" must never read as "looked and
      // it was fine".
      await assertTextColourPicker(page, cellId);
    }

    if (route.full) {
      /* ── every token, resolved through the live cascade ───────────────── */
      const resolved = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const out = {};
        for (let n = 1; n <= 15; n++) {
          for (const suffix of ["", "-tint", "-ink", "-bright"]) {
            const name = `--subj-${n}${suffix}`;
            out[name] = window.__toRgb(cs.getPropertyValue(name));
          }
        }
        out.__surface = window.__toRgb(cs.getPropertyValue("--surface"));
        return out;
      });

      const unresolved = Object.entries(resolved).filter(([, v]) => v === null).map(([k]) => k);
      check(`[${cellId}] all 60 subject tokens resolve to a colour`, unresolved.length === 0, unresolved.join(", "));

      const surface = resolved.__surface;
      info(`[${cellId}] --surface resolves to ${hex(surface)}`);

      // Light tone must reproduce the stylesheet literals exactly; dark tone
      // re-derives tint/ink via color-mix, so only solids/brights are compared.
      for (let n = 1; n <= 15; n++) {
        const slot = SUBJECT_SLOTS[n - 1];
        for (const [suffix, role] of [["", "solid"], ["-bright", "bright"]]) {
          const got = resolved[`--subj-${n}${suffix}`];
          check(
            `[${cellId}] --subj-${n}${suffix} is the derived value`,
            got && hex(got) === slot[role],
            `expected ${slot[role]}, live ${hex(got)}`,
          );
        }
        if (cond.tone === "light") {
          for (const [suffix, role] of [["-tint", "tint"], ["-ink", "ink"]]) {
            const got = resolved[`--subj-${n}${suffix}`];
            check(
              `[${cellId}] --subj-${n}${suffix} is the handoff value`,
              got && hex(got) === slot[role],
              `expected ${slot[role]}, live ${hex(got)}`,
            );
          }
        }
      }

      /* ── contrast, on the LIVE resolved values against the LIVE surface ─ */
      const ratios = await page.evaluate((r) => {
        const out = {};
        for (let n = 1; n <= 15; n++) {
          out[n] = {
            solid: window.__ratio(r[`--subj-${n}`], r.__surface),
            bright: window.__ratio(r[`--subj-${n}-bright`], r.__surface),
            inkOnTint: window.__ratio(r[`--subj-${n}-ink`], r[`--subj-${n}-tint`]),
          };
        }
        return out;
      }, resolved);

      for (let n = 1; n <= 15; n++) {
        check(
          `[${cellId}] subj-${n} solid >= ${NON_TEXT_MIN}:1 on the live surface`,
          ratios[n].solid >= NON_TEXT_MIN,
          ratios[n].solid.toFixed(2),
        );
        check(
          `[${cellId}] subj-${n} bright >= ${NON_TEXT_MIN}:1 on the live surface`,
          ratios[n].bright >= NON_TEXT_MIN,
          ratios[n].bright.toFixed(2),
        );
        check(
          `[${cellId}] subj-${n} ink >= ${TEXT_MIN}:1 on its own tint`,
          ratios[n].inkOnTint >= TEXT_MIN,
          ratios[n].inkOnTint.toFixed(2),
        );
      }

      /* ── the reference table, counted EXACTLY ─────────────────────────── */
      // Was `subjectSwatches.length >= 8` over the whole page: a floor of 8 on
      // a table that paints 15 passes with seven swatches missing, and any
      // other swatch on the page (the personal-subject picker) counted toward
      // it. Scoped to the reference table and made exact — every one of the
      // fifteen solids present, once.
      const table = await page.evaluate((solids) => {
        const root = document.querySelector('[aria-label="15-color brand palette reference"]');
        if (!root) return null;
        const want = new Map(solids.map((s, i) => [s.join(), i + 1]));
        const found = [];
        for (const el of root.querySelectorAll("*")) {
          const rgb = window.__toRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const slot = want.get(rgb.join());
          if (slot) {
            const back = window.__backdrop(el);
            found.push({ slot, rgb, backdrop: back.rgb, ratio: back.rgb ? window.__ratio(rgb, back.rgb) : null });
          }
        }
        return found;
      }, Array.from({ length: 15 }, (_, i) => resolved[`--subj-${i + 1}`]));

      if (!table) {
        info(`[${cellId}] the 15-swatch palette reference is not on this page`);
      } else {
        const slotsFound = [...new Set(table.map((t) => t.slot))].sort((a, b) => a - b);
        check(
          `[${cellId}] the palette reference paints all 15 derived solids`,
          slotsFound.length === 15,
          `found slots [${slotsFound.join(", ")}] (${table.length} chips)`,
        );
        const worst = table.filter((t) => t.ratio !== null).sort((a, b) => a.ratio - b.ratio)[0];
        if (worst) {
          check(
            `[${cellId}] worst reference chip clears ${NON_TEXT_MIN}:1 on its real backdrop`,
            worst.ratio >= NON_TEXT_MIN,
            `slot ${worst.slot} ${hex(worst.rgb)} on ${hex(worst.backdrop)} = ${worst.ratio.toFixed(2)}`,
          );
        } else {
          info(`[${cellId}] no reference chip had an opaque backdrop to measure against`);
        }
      }
    }

    if (cell.status === "pending") scored(cell);

    await page.screenshot({
      path: path.join(OUT, `${cond.id}${route.path.replace(/\//g, "-")}-1440.png`),
      fullPage: true,
    });
  }

  // Reported, not asserted: the abort in the route handler IS the guarantee, so
  // a check here would be a tautology that always passes — the shape this repo
  // has already shipped as a fake gate. The count is diagnostic: a non-zero
  // number means the app really did try to persist the seeded appearance.
  info(`[${cond.id}] teacher_preferences writes intercepted and aborted: ${blockedWrites}`);
  info(`[${cond.id}] console errors: ${consoleErrors.length}`, consoleErrors.slice(0, 3).join(" | "));

  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${cond.id}-appearance-375.png`), fullPage: true });
  await context.close();
}

await browser.close();

/* ── reconcile ─────────────────────────────────────────────────────────────*/

console.log(notes.join("\n"));
if (failures.length) console.error("\n" + failures.join("\n"));

const scoredCells = coverage.filter((c) => c.status === "scored");
const blindCells = coverage.filter((c) => c.status !== "scored");
console.log("\n=== COVERAGE ===");
for (const c of coverage) {
  console.log(
    `  ${c.status === "scored" ? "measured  " : "UNMEASURED"}  ${c.id.padEnd(36)} ${
      c.status === "scored" ? `${c.n} assertions` : c.reason
    }`,
  );
}
console.log(
  `\nintended ${coverage.length} cells · scored ${scoredCells.length} · unmeasured ${blindCells.length}`,
);
console.log(`${assertions} assertions · ${failures.length} failed`);

if (failures.length) {
  console.error("\nRESULT: FAILURES (exit 1)");
  process.exit(1);
}
// A probe that asserted nothing, or could not reach part of what it set out to
// measure, must never exit 0 — "clean" and "blind" have to be distinguishable
// from the exit code alone, because that is all a CI step reads.
if (assertions === 0 || blindCells.length > 0) {
  console.error(
    `\nRESULT: INCOMPLETE (exit 2) — ${blindCells.length} cell(s) unmeasured, ${assertions} assertions ran`,
  );
  process.exit(2);
}
console.log("\nRESULT: fully verified (exit 0)");
process.exit(0);
