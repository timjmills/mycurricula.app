// scripts/probe-year-collapsed.mjs — re-capture screenshots with the left
// filter panel collapsed so the year content is unobscured. Also confirm
// Today, Roadmap/Progression, and Master toggle work after collapse.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/year-audit");
mkdirSync(OUT_DIR, { recursive: true });

async function seedAuth(context) {
  const seed = await context.newPage();
  await seed.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
    { waitUntil: "domcontentloaded" },
  );
  await seed.close();
}

const browser = await chromium.launch({ headless: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

for (const tier of TIERS) {
  const context = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
  });
  await seedAuth(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // Try collapse filter panel
  const collapseBtn = await page.$('button[aria-label*="Collapse"]');
  if (collapseBtn) {
    await collapseBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // Confirm timeline lanes are now visible
  const laneCount = await page.evaluate(() => {
    return document.querySelectorAll('[data-lane-subject]').length;
  });
  console.log(`${tier.name}: lanes=${laneCount}`);

  await page.screenshot({
    path: resolve(OUT_DIR, `${tier.name}-collapsed.png`),
    fullPage: false,
  });

  // Click Master toggle
  const masterBtn = await page.$('button[aria-label*="Master mode"]');
  if (masterBtn) {
    await masterBtn.click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: resolve(OUT_DIR, `${tier.name}-master.png`),
      fullPage: false,
    });
    // toggle back
    const pb = await page.$('button[aria-label*="Personal mode"]');
    if (pb) await pb.click({ force: true });
    await page.waitForTimeout(300);
  }

  // Today button works after collapse?
  const todayBtn = await page.$('button[aria-label="Go to today"]');
  if (todayBtn && tier.name !== "phone") {
    await page.evaluate(() => {
      const el = document.querySelector('[class*="timelineScroll"]');
      if (el) el.scrollLeft = 0;
    });
    await page.waitForTimeout(200);
    await todayBtn.click().catch(() => {});
    await page.waitForTimeout(800);
    const scroll = await page.evaluate(() => {
      const el = document.querySelector('[class*="timelineScroll"]');
      return el?.scrollLeft ?? 0;
    });
    console.log(`${tier.name}: today scroll=${scroll}`);
  }

  // Print emulation
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(OUT_DIR, `${tier.name}-print.png`),
    fullPage: true,
  });
  await page.emulateMedia({ media: null });

  await page.close();
  await context.close();
}

await browser.close();
console.log("Done");
