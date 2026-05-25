// scripts/probe-year-hscroll.mjs — verify horizontal-scroll lane-card behaviour
//
// Loads /year at desktop 1280, scrolls .timelineScroll horizontally to the right
// by ~1500px (well into the year), then screenshots + measures whether the
// lane-card column on the left remains visible after the scroll.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/probe-year-hscroll.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "docs/screenshots/year-hscroll-bug");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
});
const page = await ctx.newPage();

console.log("→ navigate /year (desktop 1280)");
await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500); // settle hydration

// Find the horizontal scroll container.
const scrollSelector = await page.evaluate(() => {
  const candidates = Array.from(
    document.querySelectorAll(
      '[class*="timelineScroll"], [class*="scrollWrap"]',
    ),
  );
  return candidates.map((el) => ({
    cls: el.className,
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
    rect: el.getBoundingClientRect(),
  }));
});
console.log("scroll candidates:", JSON.stringify(scrollSelector, null, 2));

// Initial screenshot
await page.screenshot({
  path: resolve(OUT, "initial.png"),
  fullPage: false,
});
console.log("→ saved initial.png");

// Read first lane-card position at scrollLeft=0
const before = await page.evaluate(() => {
  const lanes = Array.from(
    document.querySelectorAll(
      '[class*="subjectHead"], [class*="laneCard"], [class*="LaneCard"]',
    ),
  );
  return lanes.slice(0, 3).map((el) => ({
    cls: el.className,
    text: el.textContent?.slice(0, 30) ?? "",
    rect: el.getBoundingClientRect(),
  }));
});
console.log("\n=== BEFORE horizontal scroll ===");
console.log(JSON.stringify(before, null, 2));

// Scroll the timeline horizontally
await page.evaluate(() => {
  const el = document.querySelector('[class*="timelineScroll"]');
  if (el) el.scrollLeft = 1500;
});
await page.waitForTimeout(500);

// Re-read positions after scroll
const after = await page.evaluate(() => {
  const lanes = Array.from(
    document.querySelectorAll(
      '[class*="subjectHead"], [class*="laneCard"], [class*="LaneCard"]',
    ),
  );
  return lanes.slice(0, 3).map((el) => ({
    cls: el.className,
    text: el.textContent?.slice(0, 30) ?? "",
    rect: el.getBoundingClientRect(),
  }));
});
console.log("\n=== AFTER scrollLeft=1500 ===");
console.log(JSON.stringify(after, null, 2));

await page.screenshot({
  path: resolve(OUT, "scrolled-1500.png"),
  fullPage: false,
});
console.log("→ saved scrolled-1500.png");

// Final verdict
const allOnscreen = after.every(
  (l) => l.rect.left >= 0 && l.rect.right <= 1280,
);
console.log("\n=== VERDICT ===");
console.log(
  `Lane cards on-screen after h-scroll: ${allOnscreen ? "YES (sticky working)" : "NO (BUG CONFIRMED — lanes scrolled off-screen)"}`,
);

await browser.close();
process.exit(allOnscreen ? 0 : 1);
