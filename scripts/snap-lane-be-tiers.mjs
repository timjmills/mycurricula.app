// scripts/snap-lane-be-tiers.mjs — three-tier responsive snapshots for
// /weekly and /daily, the two most-trafficked routes. Confirms the clock
// chip + page header lay out correctly at phone / tablet / desktop.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required");
  process.exit(2);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-be-clock-titles");
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  ["weekly", "/weekly"],
  ["daily", "/daily"],
];

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();

for (const tier of TIERS) {
  const ctx = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
  });
  // Seed bypass cookie per context.
  const seed = await ctx.newPage();
  await seed.goto(
    `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`,
    { waitUntil: "networkidle" },
  );
  await seed.close();

  for (const [name, path] of ROUTES) {
    const page = await ctx.newPage();
    console.log(`-> ${name} @ ${tier.name} (${tier.width}x${tier.height})`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForLoadState("networkidle", { timeout: 20000 });
    } catch {}
    try {
      await page.waitForFunction(
        () => {
          const els = document.querySelectorAll('[role="status"]');
          for (const el of els) {
            const text = (el.textContent ?? "").trim();
            if (/AM|PM/i.test(text) && /·/.test(text)) return true;
          }
          return false;
        },
        null,
        { timeout: 25000 },
      );
    } catch {}
    await page.waitForTimeout(600);
    const out = resolve(
      OUT_DIR,
      `${name}__${tier.name}-${tier.width}x${tier.height}.png`,
    );
    await page.screenshot({ path: out, fullPage: false });
    console.log(`   saved ${out}`);
    await page.close();
  }
  await ctx.close();
}

await browser.close();
console.log("done");
