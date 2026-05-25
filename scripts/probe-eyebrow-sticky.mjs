// Verifies Task #19 + blue-band follow-up:
//   1. The QuarterMonthWeekHeader eyebrow rail cell pins sticky-left when
//      the .timelineScroll container is panned horizontally (Task #19).
//   2. The chameleon gradient (active-subject blue/etc background) extends
//      across all visible weeks instead of cutting off mid-timeline at
//      the sticky .header's viewport-clipped width (follow-up fix).
//
// Run: node scripts/probe-eyebrow-sticky.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN env var required");
  process.exit(1);
}
const TOK = encodeURIComponent(TOKEN);
const OUT_EYEBROW = resolve(
  process.cwd(),
  "docs/screenshots/eyebrow-rail-sticky",
);
const OUT_BAND = resolve(process.cwd(), "docs/screenshots/year-blue-band");
mkdirSync(OUT_EYEBROW, { recursive: true });
mkdirSync(OUT_BAND, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await page.goto(`http://localhost:3000/year?claude=${TOK}`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(3500);

// Helper: read the eyebrow railCell rect + computed styles
async function probe() {
  return await page.evaluate(() => {
    const ts = document.querySelector('[class*="timelineScroll"]');
    // The top-level header inside .timelineScroll (single sticky one)
    const header = ts?.querySelector(
      ':scope > [class*="QuarterMonthWeekHeader_header"]',
    );
    const rail = header?.querySelector('[class*="railCell"]');
    const dateSpan = Array.from(rail?.querySelectorAll("span") ?? []).find(
      (s) => s.textContent.trim() === "DATE",
    );
    if (!header || !rail) return null;
    const rRect = rail.getBoundingClientRect();
    const hRect = header.getBoundingClientRect();
    const cs = getComputedStyle(rail);
    // Find a sticky-left LaneCard wrapper for overlap check
    const laneWrappers = Array.from(
      ts?.querySelectorAll('div[style*="sticky"]') ?? [],
    ).filter((d) => d.style.left === "0px");
    const laneRect = laneWrappers[0]?.getBoundingClientRect();
    // Read a month-row background for chameleon-fill verification
    const monthRow = header.querySelector('[class*="monthRow"]');
    const mRect = monthRow?.getBoundingClientRect();
    const monthCS = monthRow ? getComputedStyle(monthRow) : null;
    return {
      ts: {
        scrollLeft: ts.scrollLeft,
        scrollWidth: ts.scrollWidth,
        clientWidth: ts.clientWidth,
      },
      header: { left: hRect.left, width: hRect.width },
      rail: {
        left: rRect.left,
        top: rRect.top,
        w: rRect.width,
        h: rRect.height,
        position: cs.position,
        z: cs.zIndex,
        bg: cs.backgroundColor,
        dateVisible: !!dateSpan,
      },
      laneWrapper: laneRect ? { left: laneRect.left, w: laneRect.width } : null,
      monthRow: mRect
        ? {
            left: mRect.left,
            w: mRect.width,
            bgImage: monthCS?.backgroundImage,
          }
        : null,
    };
  });
}

// ── BEFORE: scrollLeft = 0 ────────────────────────────────────────────
await page.evaluate(() => {
  const ts = document.querySelector('[class*="timelineScroll"]');
  if (ts) ts.scrollLeft = 0;
});
await page.waitForTimeout(400);
const before = await probe();
console.log("BEFORE (scrollLeft=0):", JSON.stringify(before, null, 2));
await page.screenshot({
  path: resolve(OUT_EYEBROW, "1-before-scrollLeft-0.png"),
  fullPage: false,
});
await page.screenshot({
  path: resolve(OUT_BAND, "before-0.png"),
  fullPage: false,
});

// ── AFTER: scrollLeft = 1500 ──────────────────────────────────────────
await page.evaluate(() => {
  const ts = document.querySelector('[class*="timelineScroll"]');
  if (ts) ts.scrollLeft = 1500;
});
await page.waitForTimeout(400);
const after = await probe();
console.log("AFTER  (scrollLeft=1500):", JSON.stringify(after, null, 2));
await page.screenshot({
  path: resolve(OUT_EYEBROW, "2-after-scrollLeft-1500.png"),
  fullPage: false,
});
await page.screenshot({
  path: resolve(OUT_BAND, "after-1500.png"),
  fullPage: false,
});

// ── Pan to the right edge ─────────────────────────────────────────────
await page.evaluate(() => {
  const ts = document.querySelector('[class*="timelineScroll"]');
  if (ts) ts.scrollLeft = ts.scrollWidth;
});
await page.waitForTimeout(400);
const atEnd = await probe();
console.log("AT END:", JSON.stringify(atEnd, null, 2));
await page.screenshot({
  path: resolve(OUT_EYEBROW, "3-after-scrollLeft-max.png"),
  fullPage: false,
});

await page.close();
await ctx.close();
await browser.close();

// ── Assertions ────────────────────────────────────────────────────────
// The rail.left value of "pinned" is NOT 0 in viewport coordinates — it
// equals the left offset of the .timelineScroll container (the page
// sidebar / chrome before the scroll area, ~264px at 1280×900). The fix
// is correct iff rail.left stays at that anchor as scrollLeft changes.
const pass = {
  eyebrow_sticky: after && after.rail.position === "sticky",
  eyebrow_pinned: after && Math.abs(after.rail.left - before.rail.left) < 2,
  eyebrow_pinned_at_end:
    atEnd && Math.abs(atEnd.rail.left - before.rail.left) < 2,
  eyebrow_z3: after && (after.rail.z === "3" || after.rail.z === 3),
  eyebrow_overlaps_lane:
    after &&
    after.laneWrapper &&
    Math.abs(after.rail.left - after.laneWrapper.left) < 2,
  chameleon_spans:
    after && after.monthRow && after.monthRow.w >= after.ts.scrollWidth - 250,
};
console.log("RESULTS", JSON.stringify(pass, null, 2));
const overallOk = Object.values(pass).every(Boolean);
console.log(overallOk ? "PASS" : "FAIL");
process.exit(overallOk ? 0 : 1);
