// scripts/probe-year-zoom.mjs — verify Year week-column-width tightening.
//
// Loads /year at desktop 1280 with the bypass token, then:
//   • measures how many week-header cells are visible in the timeline viewport
//   • captures the rendered week column width
//   • screenshots the page for visual diff against the prior desktop.png
//
// Writes: docs/screenshots/year-zoom/desktop-after.png + a short report to
// stdout. Run with CLAUDE_BYPASS_TOKEN env var.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const OUT_DIR = resolve(process.cwd(), "docs/screenshots/year-zoom");
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
context.setDefaultNavigationTimeout(60000);
context.setDefaultTimeout(60000);

const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("[browser err]", msg.text());
});
// go straight to the bypass auth endpoint with next=/year; it sets the cookie
// and redirects to /year in the same browsing context.
await page.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  { waitUntil: "networkidle" },
);

// confirm we landed on /year, not the login redirect
const finalUrl = page.url();
console.log("Final URL after auth:", finalUrl);

// poll until the timelineScroll element has non-zero width (CSS attached &
// laid out). Dev server can be slow to deliver CSS-module chunks.
const ok = await page
  .waitForFunction(
    () => {
      const el = document.querySelector('[class*="timelineScroll"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 200;
    },
    { timeout: 30000, polling: 250 },
  )
  .catch(() => null);
if (!ok) console.warn("timelineScroll never got width — capturing anyway");
await page.waitForTimeout(500);

const measurement = await page.evaluate(() => {
  // Find the shared horizontal scroll container — it's the timelineScroll
  // div. Use the QuarterMonthWeekHeader grid to count visible week cells.
  const scroll = document.querySelector('[data-route="year"]');
  if (!scroll) return null;

  // Find all rendered week cells (header row 2).
  const allWeekCells = Array.from(
    document.querySelectorAll(
      '[class*="QuarterMonthWeekHeader_weekCell"], [class*="weekCell"]',
    ),
  );

  // Get viewport-visible cells in the timeline scroll.
  const scrollContainer = document.querySelector('[class*="timelineScroll"]');
  if (!scrollContainer) return { weekCount: allWeekCells.length };

  const scRect = scrollContainer.getBoundingClientRect();
  const visible = allWeekCells.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > scRect.left && r.left < scRect.right && r.width > 0;
  });

  const cellWidths = visible.map((el) =>
    Math.round(el.getBoundingClientRect().width),
  );

  // Read CSS var if present
  const computed = getComputedStyle(scrollContainer);

  return {
    totalWeekCells: allWeekCells.length,
    visibleWeekCellCount: visible.length,
    avgCellWidth:
      cellWidths.length > 0
        ? Math.round(cellWidths.reduce((a, b) => a + b, 0) / cellWidths.length)
        : null,
    cellWidthSample: cellWidths.slice(0, 5),
    scrollContainerWidth: Math.round(scRect.width),
    contentScrollWidth: scrollContainer.scrollWidth,
  };
});

console.log("Year /year zoom measurement @ 1280×900:");
console.log(JSON.stringify(measurement, null, 2));

await page.screenshot({
  path: resolve(OUT_DIR, "desktop-after.png"),
  fullPage: false,
});
await page.screenshot({
  path: resolve(OUT_DIR, "desktop-after-fullpage.png"),
  fullPage: true,
});

// also a "timeline only" crop for the diff
const tlBox = await page.evaluate(() => {
  const el = document.querySelector('[class*="timelineScroll"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
console.log("Timeline bbox:", tlBox);
if (tlBox && tlBox.width > 0 && tlBox.height > 0) {
  await page.screenshot({
    path: resolve(OUT_DIR, "desktop-after-timeline.png"),
    clip: {
      x: Math.max(0, tlBox.x),
      y: Math.max(0, tlBox.y),
      width: Math.min(1280 - Math.max(0, tlBox.x), tlBox.width),
      height: Math.min(900 - Math.max(0, tlBox.y), tlBox.height),
    },
  });
}

await browser.close();
console.log(`\nScreenshots written to: ${OUT_DIR}`);
