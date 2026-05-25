// scripts/snap-lane-be.mjs — minimal Playwright snapshot pass for Lane BE.
//
// Boots Chromium once, seeds the bypass cookie, visits each planner
// route at desktop 1280×900, waits for the clock chip to show a real
// time (AM/PM), and saves a screenshot. Visits each route in its own
// fresh page so dev-mode HMR resets between routes don't affect the
// snapshot.

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
  ["year", "/year"],
  ["catch-up", "/catch-up"],
  ["subject", "/subject/math"],
  ["schedule", "/schedule"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

// Seed bypass cookie
const seed = await ctx.newPage();
await seed.goto(
  `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`,
  { waitUntil: "networkidle" },
);
await seed.close();

for (const [name, path] of ROUTES) {
  const page = await ctx.newPage();
  console.log(`-> ${name} (${path})`);
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 45000 });
  } catch {}
  // Wait for the clock to show a real time (AM/PM marker).
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
      { timeout: 45000 },
    );
    console.log(`   clock OK`);
  } catch {
    console.log(`   clock timeout — taking screenshot anyway`);
  }
  // Extra settle to let any final layout shifts complete.
  await page.waitForTimeout(800);
  // Check h1
  const h1s = await page.$$eval("h1", (nodes) =>
    nodes.map((n) => (n.textContent ?? "").trim()),
  );
  console.log(`   h1s: ${JSON.stringify(h1s)}`);

  const out = resolve(OUT_DIR, `${name}__1280x900.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`   saved ${out}`);
  await page.close();
}

await browser.close();
console.log("done");
