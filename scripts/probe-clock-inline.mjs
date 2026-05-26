// scripts/probe-clock-inline.mjs — verify Clock inline in top-bar.
//
// Boots Chromium against the local dev server, signs in via the Claude
// bypass cookie-redirect, and probes /weekly at three viewport widths
// (400 / 768 / 1280). For each tier captures:
//   • Whether the Clock element renders inside the top-bar header
//   • Clock's position relative to the Week N label
//   • Whether the Master/Personal toggle remains visible (RES-CRIT-002)
//   • Whether the document horizontally overflows (RES-CRIT-001)
//   • Screenshot under docs/screenshots/clock-inline/
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… PROBE_BASE=http://localhost:3002 node scripts/probe-clock-inline.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/clock-inline");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Seed bypass cookie via the cookie-redirect endpoint.
const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`;
await bootstrap.goto(bypassUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
// Wait for the weekly route to actually render after the bypass redirect
// completes (the endpoint sets cookies then 302s).
await bootstrap.waitForSelector("header", { timeout: 60000 });
await bootstrap.close();

let exitCode = 0;
const report = [];

for (const tier of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: tier.width, height: tier.height });
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header", { timeout: 10000 });
  // Long enough that the Clock's useEffect post-mount tick has fired and
  // swapped the SSR "—" placeholder for the real "Sun · May 26 / 9:42 AM".
  await page.waitForTimeout(2500);

  // Find the clock inside the header. We use role="status" inside header.
  const clockLoc = page.locator('header [role="status"]');
  const clockCount = await clockLoc.count();
  let clockInBar = false;
  let clockBox = null;
  let clockText = null;
  for (let i = 0; i < clockCount; i += 1) {
    const c = clockLoc.nth(i);
    const visible = await c.isVisible();
    if (visible) {
      clockBox = await c.boundingBox();
      clockText = await c.textContent();
      clockInBar = true;
      break;
    }
  }

  // Find the week label — span with aria-label starting with "Current week:"
  const weekLoc = page.locator('header span[aria-label^="Current week"]');
  const weekVisible = await weekLoc.first().isVisible().catch(() => false);
  const weekBox = weekVisible ? await weekLoc.first().boundingBox() : null;

  // Master toggle visibility check (RES-CRIT-002)
  const masterLoc = page.locator('[role="radiogroup"][aria-label="Edit mode"]');
  const masterVisible = await masterLoc.first().isVisible().catch(() => false);

  // Document horizontal overflow check (RES-CRIT-001)
  const docOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  });

  // Bar overflow check
  const bar = page.locator("header").first();
  const scrollWidth = await bar.evaluate((el) => el.scrollWidth);

  // Verify clock is to the right of week label (when both visible)
  let clockRightOfWeek = null;
  if (weekBox && clockBox) {
    clockRightOfWeek = clockBox.x >= weekBox.x + weekBox.width - 4;
  }

  // Hover the clock to check the tooltip surfaces
  let tooltipText = null;
  if (clockInBar && clockBox) {
    await page.mouse.move(clockBox.x + clockBox.width / 2, clockBox.y + clockBox.height / 2);
    await page.waitForTimeout(600);
    const tt = page.locator('[role="tooltip"]');
    const ttCount = await tt.count();
    if (ttCount > 0) {
      tooltipText = await tt.first().textContent();
    }
  }

  const screenshotPath = resolve(
    OUT_DIR,
    `clock-inline__${tier.name}__${tier.width}x${tier.height}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: false, clip: { x: 0, y: 0, width: tier.width, height: 80 } });

  if (docOverflow) exitCode = 1;

  report.push({
    tier: tier.name,
    viewport: `${tier.width}x${tier.height}`,
    clockInBar,
    clockText: clockText ? clockText.trim() : null,
    clockBox: clockBox ? { x: Math.round(clockBox.x), y: Math.round(clockBox.y), w: Math.round(clockBox.width), h: Math.round(clockBox.height) } : null,
    weekVisible,
    weekBox: weekBox ? { x: Math.round(weekBox.x), y: Math.round(weekBox.y), w: Math.round(weekBox.width), h: Math.round(weekBox.height) } : null,
    clockRightOfWeek,
    masterVisible,
    docOverflow,
    barScrollWidth: scrollWidth,
    tooltipText,
    screenshot: screenshotPath,
  });

  await page.close();
}

await browser.close();

// Render report
for (const r of report) {
  console.log(`\n=== ${r.tier} (${r.viewport}) ===`);
  console.log(`  clock in top-bar: ${r.clockInBar}, text="${r.clockText}"`);
  console.log(`  clock box: ${r.clockBox ? JSON.stringify(r.clockBox) : "n/a"}`);
  console.log(`  week label visible: ${r.weekVisible}, box: ${r.weekBox ? JSON.stringify(r.weekBox) : "n/a"}`);
  console.log(`  clock to right of week? ${r.clockRightOfWeek}`);
  console.log(`  Master/Personal toggle visible: ${r.masterVisible}`);
  console.log(`  doc horizontal overflow: ${r.docOverflow}`);
  console.log(`  bar.scrollWidth=${r.barScrollWidth} (viewport=${r.viewport.split("x")[0]})`);
  console.log(`  tooltip: ${r.tooltipText ? `"${r.tooltipText}"` : "(none)"}`);
  console.log(`  screenshot → ${r.screenshot}`);
}

console.log("\nexit code:", exitCode);
process.exit(exitCode);
