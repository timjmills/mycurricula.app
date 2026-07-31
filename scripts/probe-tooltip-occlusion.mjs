// scripts/probe-tooltip-occlusion.mjs — READ-ONLY.
//
// Measures one thing seen in the §4b production screenshots: the onboarding
// tooltip that opens on the appearance gear renders OVER the console nav
// (Day · Week · Year · Plan · Post · Teach), and the nav bleeds THROUGH it.
//
// Why a dedicated probe rather than an eyeball on the screenshot: "it looks
// like it overlaps" is not a finding, and a translucent panel is exactly the
// case where a screenshot is ambiguous — you cannot tell from pixels whether
// the nav is showing through the bubble or beside it. So this measures the
// rectangles and resolves the painted colours instead of describing them.
//
// STRICTLY READ-ONLY: navigate, focus, measure. No clicks, no typing, no
// network writes. Focus is not an interaction the app persists, and
// focus-opening is documented behaviour (CLAUDE.md §4: the tooltip surfaces on
// hover AND keyboard focus), so a keyboard user tabbing to this control
// reproduces exactly what is measured here.
//
// Usage:
//   node scripts/probe-tooltip-occlusion.mjs --base=https://mycurricula.app

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

const TIERS = [
  { name: "375", width: 375, height: 812, coarse: true },
  { name: "768", width: 768, height: 1024, coarse: true },
  { name: "1440", width: 1440, height: 900, coarse: false },
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
  // No theme-sync read or write, and no data mutation, on a real account.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.route(/supabase\.co\//, (r) => {
    const m = r.request().method().toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return r.continue();
    if (/\/auth\/v1\/token(\?|$)/.test(r.request().url())) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000); // production hydrates fast; this is slack

  // The trigger: the appearance gear beside the view title.
  const gear = page
    .locator('button[aria-label*="ppearance" i], button[title*="ppearance" i]')
    .first();
  const has = await gear.count();
  if (!has) {
    results.push({ tier: tier.name, error: "appearance trigger not found" });
    await ctx.close();
    continue;
  }
  await gear.focus();
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const bubble = document.querySelector('[class*="Tooltip_tooltip"], [role="tooltip"]');
    if (!bubble) return { bubble: false };
    const br = bubble.getBoundingClientRect();

    // The console nav — the primary route switcher.
    const nav =
      document.querySelector(".views.console") ||
      document.querySelector('[class*="views"][class*="console"]') ||
      document.querySelector("nav");
    const nr = nav ? nav.getBoundingClientRect() : null;

    const overlap = (a, b) => {
      if (!a || !b) return 0;
      const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return w * h;
    };

    // Which nav items does the bubble actually cover? Hit-test their centres:
    // a rectangle intersection is not proof the control is unusable, but
    // elementFromPoint landing on the tooltip IS.
    const covered = [];
    const items = nav ? [...nav.querySelectorAll("a, button, [role='tab']")] : [];
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const blocked = !!top && top !== el && !el.contains(top) && !!top.closest('[class*="Tooltip_tooltip"], [role="tooltip"]');
      if (blocked) covered.push((el.textContent || "").trim().slice(0, 12));
    }

    // Is the panel opaque? A translucent bubble lets the nav bleed through,
    // which is what makes both layers unreadable at once. Resolve the PAINTED
    // colour, not the token: getComputedStyle can hand back color-mix()/oklab.
    const cs = getComputedStyle(bubble);
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:-9999px;background:${cs.backgroundColor}`;
    document.body.appendChild(probe);
    const painted = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const alpha = (() => {
      const mm = painted.match(/rgba?\(([^)]+)\)/);
      if (!mm) return null;
      const parts = mm[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return parts.length >= 4 ? parts[3] : 1;
    })();

    return {
      bubble: true,
      bubbleRect: { x: Math.round(br.left), y: Math.round(br.top), w: Math.round(br.width), h: Math.round(br.height) },
      navRect: nr ? { x: Math.round(nr.left), y: Math.round(nr.top), w: Math.round(nr.width), h: Math.round(nr.height) } : null,
      overlapPx: Math.round(overlap(br, nr)),
      navAreaPx: nr ? Math.round(nr.width * nr.height) : null,
      overlapPctOfNav: nr && nr.width * nr.height > 0 ? Math.round((overlap(br, nr) / (nr.width * nr.height)) * 100) : null,
      coveredNavItems: covered,
      navItemCount: items.length,
      backgroundColor: painted,
      alpha,
      viewportW: window.innerWidth,
      bubbleWidthPctOfViewport: Math.round((br.width / window.innerWidth) * 100),
    };
  });

  results.push({ tier: tier.name, ...m });
  await page.screenshot({ path: path.join(OUT, `tooltip-occlusion-${tier.name}.png`) });
  console.log(`\n${tier.name}px:`, JSON.stringify(m, null, 2));
  await ctx.close();
}

writeFileSync(
  path.join(OUT, "tooltip-occlusion.json"),
  JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2),
);
console.log(`\nwrote ${path.join(OUT, "tooltip-occlusion.json")}`);
await browser.close();
