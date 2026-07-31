// scripts/probe-tooltip-legibility.mjs — READ-ONLY.
//
// Follow-up to probe-tooltip-occlusion.mjs, which established the geometry (the
// tooltip covers 83% of the console nav's area at 375, 53% at 768) and the panel
// alpha (rgba(10,10,12,0.94) — near-opaque), and that clicks still pass through
// (the bubble is `pointer-events: none`, so elementFromPoint skips it).
//
// What geometry CANNOT answer is what a teacher actually sees, because
// `z-index: 9000` on the tooltip versus `--z-topbar: 30` on the bar predicts one
// thing and the screenshots appear to show another. Reasoning about stacking
// contexts is exactly the kind of plausible-but-unverified step that has
// produced false findings all day, so this measures the PAINTED PIXELS instead:
// screenshot the region, decode it in-page on a canvas, and read the composited
// colours back. No token maths, no color-mix()/oklab guessing, no eyeballing.
//
// STRICTLY READ-ONLY: navigate, focus, screenshot, measure.

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "https://mycurricula.app");
const OUT = path.resolve(process.cwd(), "docs/screenshots/4b-consolidated");
mkdirSync(OUT, { recursive: true });

/** WCAG relative luminance + contrast, on sRGB 0–255. */
const lum = ([r, g, b]) => {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return +((x + 0.05) / (y + 0.05)).toFixed(2);
};

const TIERS = [
  { name: "375", width: 375, height: 812, coarse: true },
  { name: "768", width: 768, height: 1024, coarse: true },
];

const results = [];
const browser = await chromium.launch({ channel: "chrome" });
const storageState = await authedStorageState(browser, {
  base: BASE,
  next: "/year",
  timeout: 90000,
  settleMs: 2500,
});

for (const tier of TIERS) {
  const ctx = await browser.newContext({
    storageState,
    ...(tier.coarse
      ? { ...devices["iPhone 14 Pro"], viewport: { width: tier.width, height: tier.height } }
      : { viewport: { width: tier.width, height: tier.height } }),
  });
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.route(/supabase\.co\//, (r) => {
    const m = r.request().method().toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return r.continue();
    if (/\/auth\/v1\/token(\?|$)/.test(r.request().url())) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000);

  const gear = page
    .locator('button[aria-label*="ppearance" i], button[title*="ppearance" i]')
    .first();
  if (!(await gear.count())) {
    results.push({ tier: tier.name, error: "appearance trigger not found" });
    await ctx.close();
    continue;
  }

  // BASELINE first: the same nav, with no tooltip open. Without it there is no
  // way to say the tooltip changed anything — a low contrast reading on its own
  // could just be how the nav always looks.
  const navBox = await page.evaluate(() => {
    const nav =
      document.querySelector(".views.console") ||
      document.querySelector('[class*="views"][class*="console"]') ||
      document.querySelector("nav");
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    const items = [...nav.querySelectorAll("a, button, [role='tab']")]
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { label: (el.textContent || "").trim().slice(0, 10), x: b.left, y: b.top, w: b.width, h: b.height };
      })
      .filter((i) => i.w > 0);
    return { x: r.left, y: r.top, w: r.width, h: r.height, items };
  });
  if (!navBox) {
    results.push({ tier: tier.name, error: "console nav not found" });
    await ctx.close();
    continue;
  }

  const clip = {
    x: Math.max(0, Math.floor(navBox.x)),
    y: Math.max(0, Math.floor(navBox.y)),
    width: Math.min(Math.ceil(navBox.w), tier.width - Math.floor(navBox.x)),
    height: Math.ceil(navBox.h),
  };

  /** Screenshot a region, decode it on a canvas in-page, and sample. Returns the
   *  darkest and lightest pixel in each item's box — for text on a panel those
   *  approximate glyph and background, which is what a contrast ratio needs. */
  const sample = async (tag) => {
    const buf = await page.screenshot({ clip });
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    return page.evaluate(
      async ({ dataUrl, clip, items }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        // The screenshot is in DEVICE pixels; the rects are in CSS pixels.
        const scale = img.naturalWidth / clip.width;
        const out = [];
        for (const it of items) {
          const sx = Math.max(0, Math.round((it.x - clip.x) * scale));
          const sy = Math.max(0, Math.round((it.y - clip.y) * scale));
          const sw = Math.min(Math.round(it.w * scale), c.width - sx);
          const sh = Math.min(Math.round(it.h * scale), c.height - sy);
          if (sw <= 0 || sh <= 0) continue;
          const d = g.getImageData(sx, sy, sw, sh).data;
          let dark = [255, 255, 255];
          let light = [0, 0, 0];
          let dl = 2;
          let ll = -1;
          for (let i = 0; i < d.length; i += 4) {
            const px = [d[i], d[i + 1], d[i + 2]];
            const l = (0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]) / 255;
            if (l < dl) { dl = l; dark = px; }
            if (l > ll) { ll = l; light = px; }
          }
          out.push({ label: it.label, dark, light });
        }
        return out;
      },
      { dataUrl, clip, items: navBox.items },
    );
  };

  await page.mouse.move(5, 400); // ensure nothing is hovered
  await page.waitForTimeout(600);
  const before = await sample("before");
  await page.screenshot({ path: path.join(OUT, `tooltip-legibility-${tier.name}-closed.png`), clip });

  await gear.focus();
  await page.waitForTimeout(1200);
  const after = await sample("after");
  await page.screenshot({ path: path.join(OUT, `tooltip-legibility-${tier.name}-open.png`), clip });

  const rows = before.map((b, i) => {
    const a = after[i] ?? b;
    return {
      label: b.label,
      closed: { dark: b.dark, light: b.light, contrast: contrast(b.dark, b.light) },
      open: { dark: a.dark, light: a.light, contrast: contrast(a.dark, a.light) },
    };
  });
  results.push({ tier: tier.name, clip, rows });
  console.log(`\n── ${tier.name}px ──`);
  for (const r of rows)
    console.log(
      `  ${r.label.padEnd(8)} closed ${String(r.closed.contrast).padStart(6)}:1   open ${String(r.open.contrast).padStart(6)}:1   ` +
        `${r.open.contrast < 4.5 ? "← BELOW AA (4.5:1)" : ""}`,
    );
  await ctx.close();
}

writeFileSync(
  path.join(OUT, "tooltip-legibility.json"),
  JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2),
);
console.log(`\nwrote ${path.join(OUT, "tooltip-legibility.json")}`);
await browser.close();
