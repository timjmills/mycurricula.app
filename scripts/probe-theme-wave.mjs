// theme-wave-probe.mjs — per-wave verification for the v2 appearance engine
// (LOCKSTEP surface #5 of the frozen value matrix —
// docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md).
//
// Screenshots every v2 theme (+ Follow-system under dark emulation) on
// /weekly /daily /settings/appearance, checks the boot script painted the right
// data-theme at DCL AND that it survives hydration (the flash-back-to-default
// trap), asserts the v2 axes (frame/glass/bg/dim) + the DERIVED data-tone, and
// runs a WCAG contrast audit on the Night token pairs using browser-resolved
// colors (covers color-mix()).
//
// W2-4 LIVE additions: the engine now renders a `.stage` host wired to the
// default handoff photo (/stage/p1.webp via data-stage-photo + --stage-photo),
// so the probe also (a) asserts the .stage host + a real url(...) --stage-photo
// on the photo default, (b) drives the data-tone DERIVATION matrix (§4) by
// seeding the persisted axis keys + reloading — night→dark, wash→light,
// photo+dim→dark, photo+bright→light, photo+normal→AUTO (polled to a concrete,
// STABLE light|dark — the live luminance proof), and (c) screenshots the
// frame×glass×bg corners as live-QA artifacts. New assertions are additive and
// the probe exits nonzero on any real failure.
//
// THE FROZEN v2 MATRIX (must stay byte-identical to lib/theme.tsx guard arrays,
// lib/theme-init.tsx literals, the SQL CHECK, and app/layout.tsx SSR attrs):
//   frame ∈ glass | paper | color    (default glass)
//   glass ∈ dark  | light            (default dark)
//   bg    ∈ photo | wash             (default photo)
//   dim   ∈ dim   | normal | bright  (default normal)
//   theme ∈ clear | night | honey | blossom | mint | sky | off  (+ system)  (default clear)
//   tone  ∈ light | dark             (DERIVED — never persisted)
//
// Usage: CLAUDE_BYPASS_TOKEN=… node theme-wave-probe.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = path.resolve(process.env.TEMP ?? ".", "theme-wave-shots");
await mkdir(OUT_DIR, { recursive: true });

// ── The five LOCKSTEP value lists (mirror lib/theme.tsx guards exactly) ──────
const FRAME_VALUES = ["glass", "paper", "color"];
const GLASS_VALUES = ["dark", "light"];
const BG_VALUES = ["photo", "wash"];
const DIM_VALUES = ["dim", "normal", "bright"];
const THEME_VALUES = ["clear", "night", "honey", "blossom", "mint", "sky", "off"];
const TONE_VALUES = ["light", "dark"];

// v2 defaults (mirror app/layout.tsx SSR attrs + theme.tsx DEFAULT_*).
const DEFAULTS = { frame: "glass", glass: "dark", bg: "photo", dim: "normal" };

// One row per v2 theme. `expect` is the resolved data-theme; the v1 legacy
// values paper/cloud are also seeded to confirm the boot-script remap → clear.
const THEMES = [
  { id: "clear", seed: "clear", expect: "clear" },
  { id: "night", seed: "night", expect: "night" },
  { id: "honey", seed: "honey", expect: "honey" },
  { id: "blossom", seed: "blossom", expect: "blossom" },
  { id: "mint", seed: "mint", expect: "mint" },
  { id: "sky", seed: "sky", expect: "sky" },
  { id: "off", seed: "off", expect: "off" },
  // v1 legacy remap — paper|cloud must boot as clear.
  { id: "v1-paper", seed: "paper", expect: "clear" },
  { id: "v1-cloud", seed: "cloud", expect: "clear" },
  { id: "system-dark", seed: "system", colorScheme: "dark", expect: "night" },
];
const ROUTES = [
  { slug: "weekly", path: "/weekly" },
  { slug: "daily", path: "/daily" },
  { slug: "appearance", path: "/settings/appearance" },
];

// Responsive tiers for the picker card (BUILD_STANDARD three-tier contract);
// run for clear + night only — the picker layout doesn't vary by theme.
const PICKER_TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
];

const browser = await chromium.launch({ channel: "chrome" });

// Auth boot once to harvest cookies, reused per themed context.
const authCtx = await browser.newContext();
const boot = await authCtx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await boot.waitForTimeout(2000);
const cookies = await authCtx.cookies();
await authCtx.close();

const results = [];
let contrastReport = null;

for (const t of THEMES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: t.colorScheme ?? "light",
  });
  await ctx.addCookies(cookies);
  await ctx.addInitScript((seed) => {
    try {
      localStorage.setItem("mycurricula:user:theme", seed);
      // Seed the LWW stamp too (see KEY.stamp) so a remote row can't override.
      localStorage.setItem(
        "mycurricula:user:theme-updated-at",
        String(Date.now() + 300000),
      );
    } catch {}
  }, t.seed);

  for (const r of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    let atDcl = null;
    let after = null;
    let axes = null;
    let err = null;
    try {
      await page.goto(`${BASE}${r.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      atDcl = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.waitForTimeout(2500); // hydration + mirror effect window
      after = await page.evaluate(() => document.documentElement.dataset.theme);
      // Snapshot the full v2 axis set after hydration (the mirror effect has run).
      // Additive (W2-4 LIVE): also capture whether the .stage host is mounted and
      // whether --stage-photo resolves to a real url(...) — the default photo is
      // wired via app/layout.tsx (data-stage-photo + the --stage-photo CSS var).
      axes = await page.evaluate(() => {
        const ds = document.documentElement.dataset;
        const photoVar = getComputedStyle(document.documentElement)
          .getPropertyValue("--stage-photo")
          .trim();
        return {
          frame: ds.frame,
          glass: ds.glass,
          bg: ds.bg,
          dim: ds.dim,
          tone: ds.tone,
          // data-style must NOT be emitted on the v2 DOM path.
          style: ds.style ?? null,
          // W2-4 live wiring (additive — see stageOk below).
          stageHost: !!document.querySelector(".stage"),
          stagePhoto: photoVar,
        };
      });
      await page.screenshot({
        path: path.join(OUT_DIR, `${t.id}__${r.slug}.png`),
      });
    } catch (e) {
      err = e.message.slice(0, 200);
    }
    const expect = t.expect ?? t.seed;
    // The seed only touches the theme key, so every other axis stays at its v2
    // default. data-tone is DERIVED: clear/honey/blossom/mint/sky/off over the
    // default Photo+normal resolve to dark; Night also resolves to dark — so the
    // expected tone here is "dark" for every seeded theme at the defaults.
    const expectTone = "dark";
    // W2-4 LIVE wiring: the .stage host must mount and, at the photo default
    // (every seeded theme here keeps bg=photo), --stage-photo must resolve to a
    // real url(...) — not `none`/empty. Additive: strengthens, never weakens.
    const stageOk =
      !!axes &&
      axes.stageHost === true &&
      typeof axes.stagePhoto === "string" &&
      /^url\(/i.test(axes.stagePhoto) &&
      !/^url\(\s*["']?none["']?\s*\)/i.test(axes.stagePhoto);
    const axesOk =
      !!axes &&
      axes.frame === DEFAULTS.frame &&
      axes.glass === DEFAULTS.glass &&
      axes.bg === DEFAULTS.bg &&
      axes.dim === DEFAULTS.dim &&
      TONE_VALUES.includes(axes.tone) &&
      axes.tone === expectTone &&
      axes.style === null && // data-style dropped from the v2 DOM path
      stageOk;
    results.push({
      theme: t.id,
      route: r.slug,
      atDcl,
      after,
      axes,
      ok: !err && atDcl === expect && after === expect && axesOk,
      errs: errors.length,
      err,
    });
    await page.close();
  }

  // Picker-card responsive tiers (clear + night only).
  if (t.id === "clear" || t.id === "night") {
    for (const tier of PICKER_TIERS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: tier.width, height: tier.height });
      try {
        await page.goto(`${BASE}/settings/appearance`, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        await page.waitForTimeout(1500);
        const hScroll = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
              document.documentElement.clientWidth ||
            document.body.scrollWidth > document.body.clientWidth,
        );
        await page.screenshot({
          path: path.join(OUT_DIR, `${t.id}__appearance-${tier.name}.png`),
        });
        results.push({
          theme: t.id,
          route: `appearance-${tier.name}`,
          atDcl: t.expect ?? t.seed,
          after: hScroll ? "H-SCROLL!" : t.expect ?? t.seed,
          ok: !hScroll,
          errs: 0,
          err: null,
        });
      } catch (e) {
        results.push({
          theme: t.id,
          route: `appearance-${tier.name}`,
          atDcl: null,
          after: null,
          ok: false,
          errs: 0,
          err: e.message.slice(0, 200),
        });
      }
      await page.close();
    }
  }

  // Contrast audit once, on the Night /weekly page.
  if (t.id === "night" && !contrastReport) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/weekly`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(1500);
    contrastReport = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      // Canvas readback resolves ANY computed color (rgb, oklch, color(),
      // color-mix results) to sRGB bytes — getComputedStyle alone serializes
      // color-mix() to oklch()/color() strings that a regex can't parse.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const cctx = canvas.getContext("2d", { willReadFrequently: true });
      const resolve = (expr) => {
        probe.style.color = "";
        probe.style.color = expr;
        const computed = getComputedStyle(probe).color;
        if (!computed) return null;
        cctx.clearRect(0, 0, 1, 1);
        cctx.fillStyle = "#000";
        cctx.fillStyle = computed;
        cctx.fillRect(0, 0, 1, 1);
        const d = cctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (fg, bg) => {
        const a = lum(fg);
        const b = lum(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const pairs = [
        ["--ink", "--surface", 4.5],
        ["--body", "--surface", 4.5],
        ["--muted", "--surface", 4.5],
        ["--faint", "--surface", 3.0],
        ["--logo-tld", "--surface", 3.0],
        ["--brand-500", "--surface", 3.0],
        ["--danger", "--surface", 3.0],
        ["--progress", "--surface", 3.0],
        ["--done", "--surface", 3.0],
        ["--warn", "--surface", 3.0],
        ["--selection-fg", "--selection-bg", 4.5],
        ["--logo-text", "--canvas", 4.5],
        // Ink on saturated solids (Codex gate finding 1).
        ["--on-solid", "--brand-500", 3.0],
        ["--on-solid", "--brand-600", 4.5],
        ["--on-solid", "--danger", 3.0],
        // Brand tint/deep pair on Night (Codex gate finding 2).
        ["--brand-700", "--brand-50", 4.5],
        ["--ink-900", "--brand-50", 4.5],
        ["--brand-700", "--surface", 3.0],
        ["--honey-600", "--honey-50", 4.5],
        // Chrome-accent tier (per-theme chrome wave).
        ["--on-solid", "--chrome-accent", 4.5],
        ["--on-solid", "--chrome-accent-strong", 4.5],
        ["--chrome-accent-deep", "--chrome-accent-soft", 4.5],
      ];
      for (let n = 1; n <= 15; n++) {
        pairs.push([`--subj-${n}-ink`, `--subj-${n}-tint`, 4.5]);
      }
      for (const tag of ["pink", "blue", "red", "gray", "amber", "green"]) {
        pairs.push([`--tag-${tag}-fg`, `--tag-${tag}-bg`, 4.5]);
      }
      const out = [];
      for (const [fgTok, bgTok, min] of pairs) {
        const fg = resolve(`var(${fgTok})`);
        const bg = resolve(`var(${bgTok})`);
        if (!fg || !bg) {
          out.push({ pair: `${fgTok} on ${bgTok}`, ratio: null, min, pass: false });
          continue;
        }
        const rr = ratio(fg, bg);
        out.push({
          pair: `${fgTok} on ${bgTok}`,
          ratio: Math.round(rr * 100) / 100,
          min,
          pass: rr >= min,
        });
      }
      probe.remove();
      return out;
    });
    await page.close();
  }
  await ctx.close();
}

// ── data-tone DERIVATION matrix (WAVE-2-VALUE-MATRIX.md §4) ─────────────────
// Now that the engine is LIVE, drive the axes by SEEDING the persisted
// localStorage keys (the same boot+load+derive path the app uses) and reload,
// then assert the resulting DERIVED data-tone. We seed (never write
// document.documentElement.dataset.* directly) because tone is React-derived:
// a raw dataset write would set the attribute but NOT re-run deriveTone, and
// the next state change would clobber it. Seeding + reload exercises the real
// derivation (incl. the post-mount luminance sample for photo+normal).
//
// The localStorage axis keys mirror lib/theme.tsx (FRAME/GLASS/BG/DIM/THEME_KEY).
const KEY = {
  theme: "mycurricula:user:theme",
  frame: "mycurricula:user:theme-frame",
  glass: "mycurricula:user:theme-glass",
  bg: "mycurricula:user:theme-bg",
  dim: "mycurricula:user:theme-dim",
  // Local write stamp for the synced triple (W3.1 last-writer-wins). EVERY
  // seed block must set this alongside the axis keys, or an authenticated
  // run's remote teacher_preferences row out-times the seed and the provider
  // re-applies the remote look after hydration (the pre-W3.1 exit-1: boot
  // paints the seeded theme, hydration flips it back). Seeded as
  // Date.now() + 5min: each case's heal-push rewrites the row with a SERVER
  // updated_at, so a plain now() in the next case could lose under clock
  // skew; the margin out-times it. Contexts are ephemeral — no leakage.
  //
  // ⚠ SIDE EFFECT on authenticated + NEXT_PUBLIC_THEME_SYNC=1 runs: those
  // heal-pushes WRITE each seeded triple into the signed-in account's
  // teacher_preferences row — after the run, the account's saved look is the
  // last case's seed. Run against the QA/bypass account (never a real
  // teacher's) or with sync off.
  stamp: "mycurricula:user:theme-updated-at",
};

// Matrix §4 rules (first match wins): night→dark; glass=light→light; wash→light;
// photo+dim→dark; photo+bright→light; photo+normal→AUTO (a real photo MUST
// resolve to a concrete light|dark via luminance — the W2-4 live proof).
// `auto:true` marks the case that polls for the post-mount luminance result.
const TONE_CASES = [
  { id: "night", seed: { theme: "night", glass: "dark", bg: "photo", dim: "normal" }, expectTone: "dark" },
  // White-frosted register forces light even on a photo+normal that would
  // otherwise sample dark (Wave-2 re-audit MAJOR — glass now feeds deriveTone).
  { id: "glass-light", seed: { theme: "clear", glass: "light", bg: "photo", dim: "normal" }, expectTone: "light" },
  // Night still wins over the White-frosted register (night is the only dark theme).
  { id: "night-over-glass-light", seed: { theme: "night", glass: "light", bg: "photo", dim: "normal" }, expectTone: "dark" },
  { id: "wash", seed: { theme: "clear", glass: "dark", bg: "wash", dim: "normal" }, expectTone: "light" },
  { id: "photo-dim", seed: { theme: "clear", glass: "dark", bg: "photo", dim: "dim" }, expectTone: "dark" },
  { id: "photo-bright", seed: { theme: "clear", glass: "dark", bg: "photo", dim: "bright" }, expectTone: "light" },
  // photo+normal: AUTO. expectTone is whatever the real /stage/p1.webp luminance
  // yields — assert only that it is a CONCRETE, STABLE light|dark (not absent).
  { id: "photo-normal-auto", seed: { theme: "clear", glass: "dark", bg: "photo", dim: "normal" }, auto: true },
];

const toneResults = [];
for (const c of TONE_CASES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addCookies(cookies);
  await ctx.addInitScript(
    ({ keys, seed }) => {
      try {
        if (seed.theme) localStorage.setItem(keys.theme, seed.theme);
        if (seed.glass) localStorage.setItem(keys.glass, seed.glass);
        if (seed.bg) localStorage.setItem(keys.bg, seed.bg);
        if (seed.dim) localStorage.setItem(keys.dim, seed.dim);
        localStorage.setItem(keys.stamp, String(Date.now() + 300000));
      } catch {}
    },
    { keys: KEY, seed: c.seed },
  );
  const page = await ctx.newPage();
  let tone = null;
  let stable = null;
  let err = null;
  try {
    await page.goto(`${BASE}/weekly`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    if (c.auto) {
      // Poll for the post-mount luminance sample to resolve, then confirm it is
      // STABLE across a follow-up read (the AUTO path executed, not a transient).
      let last = null;
      for (let i = 0; i < 30; i++) {
        last = await page.evaluate(() => document.documentElement.dataset.tone);
        if (TONE_VALUES.includes(last)) break;
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(400);
      const again = await page.evaluate(
        () => document.documentElement.dataset.tone,
      );
      tone = again;
      stable = last === again && TONE_VALUES.includes(again);
    } else {
      await page.waitForTimeout(2500); // hydration + derive window
      tone = await page.evaluate(() => document.documentElement.dataset.tone);
      stable = true;
    }
    await page.screenshot({
      path: path.join(OUT_DIR, `tone__${c.id}.png`),
    });
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  // AUTO case passes on any concrete + stable tone; fixed cases must match.
  const ok = c.auto
    ? !err && TONE_VALUES.includes(tone) && stable === true
    : !err && tone === c.expectTone;
  toneResults.push({ id: c.id, expect: c.auto ? "light|dark(auto)" : c.expectTone, tone, stable, ok, err });
  await page.close();
  await ctx.close();
}

// ── Frame × Glass × Background corners (live-QA artifacts) ──────────────────
// Screenshot the matrix corners so the §4b live-QA has artifacts. Seed each
// corner's axes via localStorage + reload. These are SCREENSHOT artifacts +
// a light axis-applied sanity check (frame/glass/bg painted as seeded); they do
// not re-assert tone (covered above). Missing surfaces log a skip, not a crash.
const CORNER_CASES = [
  { id: "glass-dark-photo", frame: "glass", glass: "dark", bg: "photo", theme: "clear" },
  { id: "glass-light-photo", frame: "glass", glass: "light", bg: "photo", theme: "clear" },
  { id: "paper-photo", frame: "paper", glass: "dark", bg: "photo", theme: "honey" },
  { id: "paper-wash", frame: "paper", glass: "dark", bg: "wash", theme: "night" },
  { id: "color-photo", frame: "color", glass: "dark", bg: "photo", theme: "blossom" },
  { id: "color-wash", frame: "color", glass: "light", bg: "wash", theme: "mint" },
];
const cornerResults = [];
for (const c of CORNER_CASES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addCookies(cookies);
  await ctx.addInitScript(
    ({ keys, seed }) => {
      try {
        localStorage.setItem(keys.theme, seed.theme);
        localStorage.setItem(keys.frame, seed.frame);
        localStorage.setItem(keys.glass, seed.glass);
        localStorage.setItem(keys.bg, seed.bg);
        localStorage.setItem(keys.stamp, String(Date.now() + 300000));
      } catch {}
    },
    { keys: KEY, seed: c },
  );
  const page = await ctx.newPage();
  let applied = null;
  let err = null;
  try {
    await page.goto(`${BASE}/settings/appearance`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(2500);
    applied = await page.evaluate(() => {
      const ds = document.documentElement.dataset;
      return { frame: ds.frame, glass: ds.glass, bg: ds.bg, theme: ds.theme, tone: ds.tone };
    });
    await page.screenshot({
      path: path.join(OUT_DIR, `corner__${c.id}.png`),
    });
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  const ok =
    !err &&
    !!applied &&
    applied.frame === c.frame &&
    applied.glass === c.glass &&
    applied.bg === c.bg &&
    TONE_VALUES.includes(applied.tone);
  cornerResults.push({ id: c.id, applied, ok, err });
  await page.close();
  await ctx.close();
}

// ── Chrome-accent audit across the light themes ────────────────────────────
// Night's chrome pairs ride the main audit above; the light themes each
// define their own --chrome-accent solids, so every one needs the AA check.
const CHROME_PAIRS = [
  ["--on-solid", "--chrome-accent", 4.5],
  ["--on-solid", "--chrome-accent-strong", 4.5],
  ["--chrome-accent-deep", "--chrome-accent-soft", 4.5],
];
const chromeAudit = [];
for (const theme of ["clear", "honey", "mint", "sky", "blossom"]) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 700 },
  });
  await ctx.addCookies(cookies);
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("mycurricula:user:theme", t);
      localStorage.setItem(
        "mycurricula:user:theme-updated-at",
        String(Date.now() + 300000),
      );
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/weekly`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(1200);
  const rows = await page.evaluate((pairs) => {
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const cctx = canvas.getContext("2d", { willReadFrequently: true });
    const resolve = (expr) => {
      probe.style.color = "";
      probe.style.color = expr;
      const computed = getComputedStyle(probe).color;
      if (!computed) return null;
      cctx.clearRect(0, 0, 1, 1);
      cctx.fillStyle = "#000";
      cctx.fillStyle = computed;
      cctx.fillRect(0, 0, 1, 1);
      const d = cctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const lum = ([r, g, b]) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const out = [];
    for (const [fgTok, bgTok, min] of pairs) {
      const fg = resolve(`var(${fgTok})`);
      const bg = resolve(`var(${bgTok})`);
      if (!fg || !bg) {
        out.push({ pair: `${fgTok} on ${bgTok}`, ratio: null, min, pass: false });
        continue;
      }
      const a = lum(fg);
      const b = lum(bg);
      const rr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      out.push({
        pair: `${fgTok} on ${bgTok}`,
        ratio: Math.round(rr * 100) / 100,
        min,
        pass: rr >= min,
      });
    }
    probe.remove();
    return out;
  }, CHROME_PAIRS);
  for (const r of rows) chromeAudit.push({ theme, ...r });
  await ctx.close();
}

// ── W2-WAVE2 RENDER-PAINT GATE (the live-QA contract) ──────────────────────
// The v2 background-stage engine was rendering logic-correctly but NOT visibly
// painting, and the older checks above missed it (they read data-* attrs +
// --stage-photo, never the actual paint). This gate asserts the CONTRACT the
// parallel render-path fix establishes — the invariants that make the stage
// VISIBLE — across a route × viewport-width matrix:
//
//   A. THEME-TINT MOUNTED — exactly one `.theme-tint` (aria-hidden) exists and
//      is a descendant of <html> (mounted as a <body> child).
//   B. STAGE NOT OCCLUDED — `.stage` exists; `getComputedStyle(body)
//      .backgroundImage === 'none'`; body has NO opaque background-color hiding
//      the fixed z-index:-2 stage. (<html> keeps the --canvas base; not checked.)
//   C. PHOTO ACTUALLY PAINTS — with data-bg="photo": `--stage-photo` on <html>
//      contains `url(`, AND getComputedStyle(stage,'::before').backgroundImage
//      contains both `url(` and the photo filename. data-bg="wash" still renders
//      (its ::before backgroundImage is non-'none').
//   D. FINAL ROUTE — run on a real app route (/weekly), not just the bare root.
//   E. SAMPLING SIDE-EFFECT — photo + dim="normal": poll for the async luminance
//      sample to resolve data-tone to a concrete light|dark (matrix §4 AUTO).
//   F. RESPONSIVE — the core stage/theme-tint asserts at 390, 768, 1280 px.
//
// These are ADDITIVE assertions. They may not be GREEN until the render-path
// fix lands — that's expected; the gate proves the engine paints once it does.
// Fallback only — the C-assert derives the EXPECTED basename from the live
// --stage-photo (see photoBasename below) so it can't drift from
// DEFAULT_STAGE_PHOTO (lib/stage-photo.ts). Re-audit #3 / Codex L1.
const PHOTO_FILENAME = "p1.webp"; // DEFAULT_STAGE_PHOTO basename (fallback)
const PAINT_WIDTHS = [390, 768, 1280]; // F. responsive tiers
// D. a real app route + a fallback if /weekly 404s in this environment.
const PAINT_ROUTE = "/weekly";
const PAINT_ROUTE_FALLBACK = "/";

// One in-page evaluation harvests every paint fact for the CURRENT data-bg.
// Returns the values; the Node side does the asserting so failure messages can
// name the width/route/axis. data-tone polling for the AUTO sample is done via a
// separate evaluate loop (reuses the TONE_VALUES helper, like the §4 matrix).
function collectPaintFacts() {
  const html = document.documentElement;
  const body = document.body;
  const tints = document.querySelectorAll(".theme-tint");
  const tint = tints[0] ?? null;
  const stage = document.querySelector(".stage");
  const bodyCS = getComputedStyle(body);
  const stagePhoto = getComputedStyle(html).getPropertyValue("--stage-photo").trim();
  const stageBeforeBg = stage
    ? getComputedStyle(stage, "::before").backgroundImage
    : null;
  return {
    bg: html.dataset.bg ?? null,
    tone: html.dataset.tone ?? null,
    dim: html.dataset.dim ?? null,
    // A.
    tintCount: tints.length,
    tintInHtml: !!tint && html.contains(tint),
    tintAriaHidden: tint ? tint.getAttribute("aria-hidden") : null,
    // B.
    stageExists: !!stage,
    bodyBgImage: bodyCS.backgroundImage,
    bodyBgColor: bodyCS.backgroundColor,
    // C.
    stagePhoto,
    stageBeforeBg,
  };
}

// An opaque body background-color would occlude the negative-z stage. Treat
// transparent / fully-transparent rgba(...,0) as "not opaque"; any other
// resolved color is opaque. (Browsers serialize transparent to rgba(0,0,0,0).)
function bodyBgIsOpaque(color) {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === "transparent" || c === "none") return false;
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,/]+/).map((s) => s.trim());
    // alpha is the 4th component when present; 0 alpha = not opaque.
    if (parts.length >= 4 && Number.parseFloat(parts[3]) === 0) return false;
    return true; // rgb(...) or rgba with nonzero alpha → opaque
  }
  // Any other non-empty color keyword/function counts as opaque.
  return true;
}

// Derive the photo basename from a `url(...)` value so the C-assert verifies the
// .stage::before paints the SAME photo --stage-photo points at, rather than a
// hardcoded literal that could drift from DEFAULT_STAGE_PHOTO. Falls back to the
// static default basename when the url can't be parsed. (Re-audit #3 / Codex L1.)
function photoBasename(urlValue, fallback) {
  if (typeof urlValue === "string") {
    const m = urlValue.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    if (m && m[1]) {
      const base = m[1].split(/[?#]/)[0].split("/").filter(Boolean).pop();
      if (base) return base;
    }
  }
  return fallback;
}

const paintResults = [];
function recordPaint(axis, width, route, bg, ok, detail) {
  paintResults.push({ axis, width, route, bg, ok, detail });
}

{
  // Resolve the real route once. Fall back to "/" if /weekly 404s here OR if
  // auth bounces us to /login: an unauthenticated env answers /weekly with a
  // 307→/login that Playwright silently follows to a 200, which would make the
  // paint gate test /login while believing it tested /weekly (false confidence).
  // Detect the redirect by the FINAL landing URL, not just the status code.
  let paintRoute = PAINT_ROUTE;
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(`${BASE}${PAINT_ROUTE}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      const landedOnLogin = /\/login(\?|$)/.test(page.url());
      if ((resp && resp.status() === 404) || landedOnLogin) {
        paintRoute = PAINT_ROUTE_FALLBACK;
      }
    } catch {
      paintRoute = PAINT_ROUTE_FALLBACK;
    }
    await page.close();
    await ctx.close();
  }

  // F × D: the core stage/theme-tint + photo-paint asserts at every width, on
  // the real route. Default axes keep bg=photo (DEFAULTS.bg), so this also
  // covers C-photo. We then flip bg=wash and re-load to cover C-wash.
  for (const width of PAINT_WIDTHS) {
    // ---- PHOTO (default axes) ----
    {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addCookies(cookies);
      const page = await ctx.newPage();
      let facts = null;
      let err = null;
      try {
        await page.goto(`${BASE}${paintRoute}`, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        await page.waitForTimeout(2500); // hydration + mount window
        facts = await page.evaluate(collectPaintFacts);
      } catch (e) {
        err = e.message.slice(0, 200);
      }
      const where = `w=${width} route=${paintRoute} bg=photo`;
      if (err || !facts) {
        recordPaint("LOAD", width, paintRoute, "photo", false, err ?? "no facts");
      } else {
        // A. THEME-TINT MOUNTED
        recordPaint(
          "A:theme-tint-mounted",
          width,
          paintRoute,
          "photo",
          facts.tintCount === 1 && facts.tintInHtml === true,
          `count=${facts.tintCount} inHtml=${facts.tintInHtml} aria-hidden=${facts.tintAriaHidden} (${where})`,
        );
        // B. STAGE NOT OCCLUDED
        recordPaint(
          "B:stage-not-occluded",
          width,
          paintRoute,
          "photo",
          facts.stageExists === true &&
            facts.bodyBgImage === "none" &&
            !bodyBgIsOpaque(facts.bodyBgColor),
          `stage=${facts.stageExists} bodyBgImage=${facts.bodyBgImage} bodyBgColor=${facts.bodyBgColor} (${where})`,
        );
        // C. PHOTO ACTUALLY PAINTS
        const photoVarOk = /url\(/i.test(facts.stagePhoto);
        const expectedPhoto = photoBasename(facts.stagePhoto, PHOTO_FILENAME);
        const beforeOk =
          typeof facts.stageBeforeBg === "string" &&
          /url\(/i.test(facts.stageBeforeBg) &&
          facts.stageBeforeBg.includes(expectedPhoto);
        recordPaint(
          "C:photo-paints",
          width,
          paintRoute,
          "photo",
          facts.bg === "photo" && photoVarOk && beforeOk,
          `--stage-photo=${facts.stagePhoto} expect=${expectedPhoto} ::before=${(facts.stageBeforeBg ?? "null").slice(0, 120)} (${where})`,
        );
      }
      await page.close();
      await ctx.close();
    }

    // ---- WASH (C: wash still renders) ----
    {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addCookies(cookies);
      await ctx.addInitScript(
        ({ keys, theme }) => {
          try {
            localStorage.setItem(keys.theme, theme);
            localStorage.setItem(keys.bg, "wash");
            localStorage.setItem(keys.stamp, String(Date.now() + 300000));
          } catch {}
        },
        { keys: KEY, theme: "clear" },
      );
      const page = await ctx.newPage();
      let facts = null;
      let err = null;
      try {
        await page.goto(`${BASE}${paintRoute}`, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        await page.waitForTimeout(2500);
        facts = await page.evaluate(collectPaintFacts);
      } catch (e) {
        err = e.message.slice(0, 200);
      }
      const where = `w=${width} route=${paintRoute} bg=wash`;
      if (err || !facts) {
        recordPaint("LOAD", width, paintRoute, "wash", false, err ?? "no facts");
      } else {
        // A + B still hold under wash.
        recordPaint(
          "A:theme-tint-mounted",
          width,
          paintRoute,
          "wash",
          facts.tintCount === 1 && facts.tintInHtml === true,
          `count=${facts.tintCount} inHtml=${facts.tintInHtml} (${where})`,
        );
        recordPaint(
          "B:stage-not-occluded",
          width,
          paintRoute,
          "wash",
          facts.stageExists === true &&
            facts.bodyBgImage === "none" &&
            !bodyBgIsOpaque(facts.bodyBgColor),
          `stage=${facts.stageExists} bodyBgImage=${facts.bodyBgImage} bodyBgColor=${facts.bodyBgColor} (${where})`,
        );
        // C-wash: data-bg="wash" still renders — ::before backgroundImage non-'none'.
        recordPaint(
          "C:wash-renders",
          width,
          paintRoute,
          "wash",
          facts.bg === "wash" &&
            typeof facts.stageBeforeBg === "string" &&
            facts.stageBeforeBg !== "none",
          `bg=${facts.bg} ::before=${(facts.stageBeforeBg ?? "null").slice(0, 120)} (${where})`,
        );
      }
      await page.close();
      await ctx.close();
    }
  }

  // E. SAMPLING SIDE-EFFECT — photo + dim="normal" (the AUTO matrix §4 case):
  // poll for the async luminance sample to resolve data-tone to a concrete,
  // stable light|dark. Run once at the desktop width, on the real route.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(
      ({ keys }) => {
        try {
          localStorage.setItem(keys.theme, "clear");
          localStorage.setItem(keys.bg, "photo");
          localStorage.setItem(keys.dim, "normal");
          localStorage.setItem(keys.stamp, String(Date.now() + 300000));
        } catch {}
      },
      { keys: KEY },
    );
    const page = await ctx.newPage();
    let tone = null;
    let stable = null;
    let err = null;
    try {
      await page.goto(`${BASE}${paintRoute}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      // Reuse the §4 AUTO poll shape: wait for a concrete tone, confirm stable.
      let last = null;
      for (let i = 0; i < 30; i++) {
        last = await page.evaluate(() => document.documentElement.dataset.tone);
        if (TONE_VALUES.includes(last)) break;
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(400);
      const again = await page.evaluate(
        () => document.documentElement.dataset.tone,
      );
      tone = again;
      stable = last === again && TONE_VALUES.includes(again);
    } catch (e) {
      err = e.message.slice(0, 200);
    }
    recordPaint(
      "E:auto-tone-sampled",
      1280,
      paintRoute,
      "photo",
      !err && TONE_VALUES.includes(tone) && stable === true,
      `tone=${tone} stable=${stable}${err ? `  ${err}` : ""} (photo+dim=normal route=${paintRoute})`,
    );
    await page.close();
    await ctx.close();
  }
}

await browser.close();

console.log(`\nShots: ${OUT_DIR}`);
console.log(
  "\ntheme         route       dcl       after     axes(frame/glass/bg/dim/tone)        ok    errs",
);
console.log("-".repeat(96));
for (const r of results) {
  const axes = r.axes
    ? `${r.axes.frame}/${r.axes.glass}/${r.axes.bg}/${r.axes.dim}/${r.axes.tone}`
    : "—";
  console.log(
    r.theme.padEnd(14),
    r.route.padEnd(11),
    String(r.atDcl).padEnd(9),
    String(r.after).padEnd(9),
    axes.padEnd(36),
    (r.ok ? "OK" : "FAIL").padEnd(5),
    String(r.errs) + (r.err ? `  ${r.err}` : ""),
  );
}
console.log("\nNight contrast audit (AA):");
let fails = 0;
for (const c of contrastReport ?? []) {
  if (!c.pass) fails++;
  console.log(
    `${c.pass ? "  ok  " : "  FAIL"} ${String(c.ratio).padEnd(6)} >= ${c.min}  ${c.pair}`,
  );
}
console.log("\nChrome-accent audit, light themes (AA):");
for (const c of chromeAudit) {
  if (!c.pass) fails++;
  console.log(
    `${c.pass ? "  ok  " : "  FAIL"} ${c.theme.padEnd(8)} ${String(c.ratio).padEnd(6)} >= ${c.min}  ${c.pair}`,
  );
}

console.log("\ndata-tone derivation matrix (WAVE-2-VALUE-MATRIX.md §4):");
for (const t of toneResults) {
  console.log(
    `${t.ok ? "  ok  " : "  FAIL"} ${t.id.padEnd(20)} expect=${String(t.expect).padEnd(16)} got=${String(t.tone).padEnd(6)} stable=${t.stable}${t.err ? `  ${t.err}` : ""}`,
  );
}
console.log("\nframe × glass × bg corners (artifacts + axis-applied check):");
for (const c of cornerResults) {
  const a = c.applied
    ? `${c.applied.frame}/${c.applied.glass}/${c.applied.bg}/${c.applied.theme}/${c.applied.tone}`
    : "—";
  console.log(
    `${c.ok ? "  ok  " : "  FAIL"} ${c.id.padEnd(20)} applied=${a.padEnd(36)}${c.err ? `  ${c.err}` : ""}`,
  );
}

console.log(
  "\nrender-paint gate (theme-tint / stage-occlusion / photo paint / AUTO tone) — route × width:",
);
for (const p of paintResults) {
  console.log(
    `${p.ok ? "  ok  " : "  FAIL"} ${String(p.axis).padEnd(22)} w=${String(p.width).padEnd(4)} bg=${String(p.bg).padEnd(5)} ${p.ok ? "" : `${p.detail}`}`,
  );
}

const routeFails = results.filter((r) => !r.ok).length;
const toneFails = toneResults.filter((t) => !t.ok).length;
const cornerFails = cornerResults.filter((c) => !c.ok).length;
const paintFails = paintResults.filter((p) => !p.ok).length;
console.log(`\ncontrast failures: ${fails}`);
console.log(`route checks failed: ${routeFails}`);
console.log(`tone-derivation checks failed: ${toneFails}`);
console.log(`corner checks failed: ${cornerFails}`);
console.log(`render-paint gate checks failed: ${paintFails}`);
if (paintFails > 0) {
  console.log("\nrender-paint FAILURES (axis @ width/route/bg):");
  for (const p of paintResults.filter((x) => !x.ok)) {
    console.log(`  - ${p.axis}  @ w=${p.width} route=${p.route} bg=${p.bg}: ${p.detail}`);
  }
}

// Exit nonzero on any real failure (contrast / route / tone / corner / paint)
// so CI + the live-QA pass treat a regression as a hard failure.
const totalFails = fails + routeFails + toneFails + cornerFails + paintFails;
if (totalFails > 0) process.exitCode = 1;
