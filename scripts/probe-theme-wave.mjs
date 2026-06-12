// theme-wave-probe.mjs — one-off verification for the 6-theme wave.
// Screenshots every theme (+ Follow-system under dark emulation) on
// /weekly /daily /settings/appearance, checks the boot script painted the
// right data-theme at DCL AND that it survives hydration (the
// flash-back-to-default trap), and runs a WCAG contrast audit on the Night
// token pairs using browser-resolved colors (covers color-mix()).
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

const THEMES = [
  { id: "paper", seed: "paper" },
  { id: "cloud", seed: "cloud" },
  { id: "night", seed: "night" },
  { id: "mint", seed: "mint" },
  { id: "sky", seed: "sky" },
  { id: "blossom", seed: "blossom" },
  { id: "system-dark", seed: "system", colorScheme: "dark", expect: "night" },
];
const ROUTES = [
  { slug: "weekly", path: "/weekly" },
  { slug: "daily", path: "/daily" },
  { slug: "appearance", path: "/settings/appearance" },
];

// Responsive tiers for the picker card (BUILD_STANDARD three-tier contract);
// run for paper + night only — the picker layout doesn't vary by palette.
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
    } catch {}
  }, t.seed);

  for (const r of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    let atDcl = null;
    let after = null;
    let err = null;
    try {
      await page.goto(`${BASE}${r.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      atDcl = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.waitForTimeout(2500); // hydration + mirror effect window
      after = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.screenshot({
        path: path.join(OUT_DIR, `${t.id}__${r.slug}.png`),
      });
    } catch (e) {
      err = e.message.slice(0, 200);
    }
    const expect = t.expect ?? t.seed;
    results.push({
      theme: t.id,
      route: r.slug,
      atDcl,
      after,
      ok: !err && atDcl === expect && after === expect,
      errs: errors.length,
      err,
    });
    await page.close();
  }

  // Picker-card responsive tiers (paper + night only).
  if (t.id === "paper" || t.id === "night") {
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

await browser.close();

console.log(`\nShots: ${OUT_DIR}`);
console.log("\ntheme         route       dcl       after     ok    errs");
console.log("-".repeat(60));
for (const r of results) {
  console.log(
    r.theme.padEnd(14),
    r.route.padEnd(11),
    String(r.atDcl).padEnd(9),
    String(r.after).padEnd(9),
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
console.log(`\ncontrast failures: ${fails}`);
console.log(`route checks failed: ${results.filter((r) => !r.ok).length}`);
