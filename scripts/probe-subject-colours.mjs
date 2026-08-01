// scripts/probe-subject-colours.mjs — §4b live QA for the derived subject scale
// (task #44) and the handoff slot conformance fix (task #50).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. A unit test can only assert that
// `app/tokens.css` contains a string. This asks the BROWSER what a subject
// colour actually resolves to after the whole cascade — every theme override,
// every `data-tone` branch, every `color-mix()` — and measures contrast on
// those resolved values in the four appearance conditions the tone contract
// branches on: Photo-Dim, Photo-Bright, Wash and Night.
//
// COLOUR PARSING IS THE TRAP THIS FILE IS BUILT AROUND. Chrome returns
// `color(srgb 0.66 0.57 0.25)` for some of these — 0–1 floats — while others
// come back as `rgb(168 146 64)` — 0–255. A scraper that reads the numbers out
// of the string conflates the two and INFLATES every ratio (it has already
// happened on this repo). Every colour here is therefore resolved THROUGH THE
// CANVAS: `ctx.fillStyle = value` then `getImageData`, which hands back 0–255
// bytes whatever the input syntax was. The run carries a control for that
// (`#ffffff` must round-trip to 255,255,255 and a bare `oklch()` must not
// silently fall back to black), and exits non-zero if the control fails, if any
// check fails, or if it made ZERO assertions.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-subject-colours.mjs
//        PROBE_BASE defaults to http://localhost:3014

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLoginOnPage, requireToken } from "./lib/auth.mjs";

// Imported dynamically so a Node without TypeScript type stripping fails with
// an actionable message instead of an opaque ERR_UNKNOWN_FILE_EXTENSION at
// parse time. A §4b gate that cannot start looks identical to a §4b gate that
// was skipped, which is the more expensive of the two failures.
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
const OUT = path.resolve("docs/screenshots/subject-colours");
await mkdir(OUT, { recursive: true });

/** The four conditions the tone contract branches on (CLAUDE.md §4).
 *  Cookie shape: v1.frame.glass.bg.theme.dim.style.palette — see
 *  lib/theme-values.ts encodeThemeAxesCookie. Appearance is seeded by COOKIE,
 *  never by clicking through Settings: `.env.local` points at production
 *  Supabase and the theme-sync path writes `teacher_preferences` back. */
//
// THE COOKIE ALONE IS NOT ENOUGH, and this cost a run. The cookie seeds the SSR
// attributes, but `lib/theme.tsx` treats localStorage as the source of truth and
// SELF-HEALS the cookie from it after hydration — so a probe that sets only the
// cookie measures the bypass account's saved preferences, silently, and reports
// them as whatever condition it thought it asked for. (Observed: a `dim` cookie
// hydrating to `data-tone="light"`.) Both are seeded below.
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
  },
  {
    id: "night",
    axes: "v1.glass.dark.photo.night.normal.vivid.normal",
    store: { theme: "night", "theme-frame": "glass", "theme-glass": "dark", "theme-bg": "photo", "theme-dim": "normal" },
    tone: "dark",
  },
];

const failures = [];
const notes = [];
let assertions = 0;
function check(label, cond, detail = "") {
  assertions++;
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
}
const info = (label, detail = "") =>
  notes.push(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);

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
};

const hex = (rgb) =>
  "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

const browser = await chromium.launch({ channel: "chrome" });

for (const cond of CONDITIONS) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(PAGE_HELPERS);
  await context.addInitScript((store) => {
    for (const [k, v] of Object.entries(store)) {
      try {
        window.localStorage.setItem(`mycurricula:user:${k}`, v);
      } catch {
        /* storage disabled — the cookie still seeds SSR, and the tone check
           below will fail loudly rather than silently measuring the wrong one */
      }
    }
  }, cond.store);
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
  // The first-run gate can park a probe on /onboarding; navigate explicitly so
  // an unexpected landing surfaces as a failed check rather than as a page that
  // simply has no subject colour on it.
  await page.goto(`${BASE}/settings/appearance`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await page.waitForTimeout(6000); // this app hydrates slowly; see the repo's dev-hydration lesson

  /* ── CONTROL — is the instrument itself sound? ─────────────────────────── */
  const failuresBeforeControl = failures.length;
  const control = await page.evaluate(() => ({
    white: window.__toRgb("#ffffff"),
    black: window.__toRgb("#000000"),
    oklch: window.__toRgb("oklch(0.7 0.1 200)"),
    garbage: window.__toRgb("not-a-colour"),
    srgbFn: window.__toRgb("color(srgb 0.6588 0.5725 0.251)"),
  }));
  check(
    `[${cond.id}] CONTROL canvas resolves a plain hex exactly`,
    JSON.stringify(control.white) === "[255,255,255]" &&
      JSON.stringify(control.black) === "[0,0,0]",
    `white=${JSON.stringify(control.white)} black=${JSON.stringify(control.black)}`,
  );
  check(
    `[${cond.id}] CONTROL oklch() resolves and does NOT fall back to black`,
    control.oklch !== null && !(control.oklch[0] === 0 && control.oklch[1] === 0 && control.oklch[2] === 0),
    `oklch(0.7 0.1 200) -> ${JSON.stringify(control.oklch)}`,
  );
  check(
    `[${cond.id}] CONTROL an invalid colour returns null rather than a number`,
    control.garbage === null,
    `-> ${JSON.stringify(control.garbage)}`,
  );
  check(
    // The exact conflation that has inflated ratios here before: color(srgb …)
    // carries 0–1 floats. Scraped naively it reads as near-black; resolved
    // through the canvas it is the mid-tone it actually is.
    `[${cond.id}] CONTROL color(srgb 0–1 floats) resolve to 0–255, not to ~0`,
    control.srgbFn !== null && control.srgbFn[0] > 150,
    `-> ${JSON.stringify(control.srgbFn)} (a string-scraper would read 0.66 as 0)`,
  );
  // A BROKEN INSTRUMENT must not produce findings — but only the CONTROL is
  // grounds to stop. Breaking on `failures.length` would abandon the remaining
  // conditions the moment the first one found a real defect, which is the
  // opposite of what a QA pass is for.
  if (failures.length > failuresBeforeControl) {
    console.error("CONTROL FAILED — aborting before any finding is reported.");
    break;
  }

  /* ── the derived tone ─────────────────────────────────────────────────── */
  const tone = await page.evaluate(() => document.documentElement.dataset.tone);
  check(`[${cond.id}] derives data-tone="${cond.tone}"`, tone === cond.tone, `got "${tone}"`);

  /* ── every token, resolved through the live cascade ───────────────────── */
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
  check(`[${cond.id}] all 60 subject tokens resolve to a colour`, unresolved.length === 0, unresolved.join(", "));

  const surface = resolved.__surface;
  info(`[${cond.id}] --surface resolves to ${hex(surface)}`);

  // Light tone must reproduce the stylesheet literals exactly; dark tone
  // re-derives tint/ink via color-mix, so only solids/brights are compared.
  for (let n = 1; n <= 15; n++) {
    const slot = SUBJECT_SLOTS[n - 1];
    for (const [suffix, role] of [["", "solid"], ["-bright", "bright"]]) {
      const got = resolved[`--subj-${n}${suffix}`];
      check(
        `[${cond.id}] --subj-${n}${suffix} is the derived value`,
        got && hex(got) === slot[role],
        `expected ${slot[role]}, live ${got ? hex(got) : "null"}`,
      );
    }
    if (cond.tone === "light") {
      for (const [suffix, role] of [["-tint", "tint"], ["-ink", "ink"]]) {
        const got = resolved[`--subj-${n}${suffix}`];
        check(
          `[${cond.id}] --subj-${n}${suffix} is the handoff value`,
          got && hex(got) === slot[role],
          `expected ${slot[role]}, live ${got ? hex(got) : "null"}`,
        );
      }
    }
  }

  /* ── contrast, on the LIVE resolved values against the LIVE surface ───── */
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
      `[${cond.id}] subj-${n} solid >= ${NON_TEXT_MIN}:1 on the live surface`,
      ratios[n].solid >= NON_TEXT_MIN,
      ratios[n].solid.toFixed(2),
    );
    check(
      `[${cond.id}] subj-${n} bright >= ${NON_TEXT_MIN}:1 on the live surface`,
      ratios[n].bright >= NON_TEXT_MIN,
      ratios[n].bright.toFixed(2),
    );
    check(
      `[${cond.id}] subj-${n} ink >= ${TEXT_MIN}:1 on its own tint`,
      ratios[n].inkOnTint >= TEXT_MIN,
      ratios[n].inkOnTint.toFixed(2),
    );
  }

  /* ── a real painted element, not just a custom property ───────────────── */
  const painted = await page.evaluate(() => {
    // The Appearance page's palette reference paints each slot as a swatch and
    // prints its hex. Sample whatever actually has a subject colour painted on
    // it, with the backdrop it is really sitting on.
    const els = [...document.querySelectorAll("*")].filter((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const rgb = window.__toRgb(bg);
      if (!rgb) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 12 && r.height >= 12 && r.width <= 80 && r.height <= 80;
    });
    return els.slice(0, 400).map((el) => {
      const rgb = window.__toRgb(getComputedStyle(el).backgroundColor);
      const back = window.__backdrop(el);
      return {
        rgb,
        backdrop: back.rgb,
        opaque: back.opaque,
        // Identify the element AND the ancestor that supplied the backdrop:
        // "2.87:1" is not actionable without knowing what it was sitting on.
        where: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`,
        backdropFrom: back.from ? String(back.from).slice(0, 60) : null,
        ratio: back.rgb ? window.__ratio(rgb, back.rgb) : null,
      };
    });
  });
  // Which of the painted swatches are one of our 15 solids?
  const solidHexes = new Set(SUBJECT_SLOTS.map((s) => s.solid));
  const subjectSwatches = painted.filter((p) => p.rgb && solidHexes.has(hex(p.rgb)));
  check(
    `[${cond.id}] the Appearance page really paints the derived solids`,
    subjectSwatches.length >= 8,
    `${subjectSwatches.length} elements painted with one of the 15 derived solids`,
  );
  const worstPainted = subjectSwatches
    .filter((p) => p.ratio !== null)
    .sort((a, b) => a.ratio - b.ratio)[0];
  if (worstPainted) {
    check(
      `[${cond.id}] worst painted swatch clears ${NON_TEXT_MIN}:1 on its real backdrop`,
      worstPainted.ratio >= NON_TEXT_MIN,
      `${hex(worstPainted.rgb)} on ${hex(worstPainted.backdrop)} = ${worstPainted.ratio.toFixed(2)} · swatch ${worstPainted.where} · backdrop from ${worstPainted.backdropFrom}`,
    );
    // Every distinct backdrop a subject solid was found sitting on. The floor
    // in lib/subject-color.ts is stated against --surface; if a solid is
    // routinely painted on something else, that reference is the thing to
    // revisit, and this is the evidence for it.
    const backdrops = [...new Set(subjectSwatches.filter((p) => p.backdrop).map((p) => hex(p.backdrop)))];
    info(`[${cond.id}] subject solids were painted on backdrops: ${backdrops.join(", ")}`);
  } else {
    check(`[${cond.id}] found a painted swatch with an opaque backdrop to measure`, false);
  }

  // Reported, not asserted: the abort in the route handler IS the guarantee, so
  // a check here would be a tautology that always passes — the shape this repo
  // has already shipped as a fake gate. The count is diagnostic: a non-zero
  // number means the app really did try to persist the seeded appearance.
  info(`[${cond.id}] teacher_preferences writes intercepted and aborted: ${blockedWrites}`);
  info(`[${cond.id}] console errors: ${consoleErrors.length}`, consoleErrors.slice(0, 3).join(" | "));

  await page.screenshot({ path: path.join(OUT, `appearance-${cond.id}-1440.png`), fullPage: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `appearance-${cond.id}-375.png`), fullPage: true });
  await context.close();
}

await browser.close();

console.log(notes.join("\n"));
if (failures.length) console.error("\n" + failures.join("\n"));
console.log(`\n${assertions} assertions · ${failures.length} failed`);
// A probe that asserted nothing must never exit 0.
if (assertions === 0) {
  console.error("FAILURE: zero assertions ran");
  process.exit(1);
}
process.exit(failures.length ? 1 : 0);
