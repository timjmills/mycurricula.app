// scripts/probe-topbar.mjs — task #91 verification probe.
//
// Boots Chromium against the local dev server, signs in via the Claude
// bypass cookie-redirect endpoint, and probes /weekly at three viewport
// widths (400 / 768 / 1280). Reports:
//   • bar.scrollWidth vs viewport.width (must not exceed)
//   • each named right-cluster control's getBoundingClientRect().right
//   • whether the More button is present
//   • whether Master/Personal toggle is visible
//   • screenshot under docs/screenshots/topbar-overflow/
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/probe-topbar.mjs
//
// Exit code 0 if every control's right ≤ viewport.width; non-zero otherwise.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/topbar-overflow");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

// Named controls to inspect, with the aria-label or selector we expect.
const RIGHT_CLUSTER_CONTROLS = [
  { name: "Master/Personal toggle", sel: '[role="radiogroup"][aria-label="Edit mode"]' },
  { name: "Search trigger", sel: "[data-search-trigger]" },
  { name: "To-do button", sel: 'button[aria-label*="to-do panel" i]' },
  { name: "Comments button", sel: 'button[aria-label*="comments panel" i]' },
  { name: "Profile avatar", sel: 'a[aria-label*="Profile settings"]' },
  { name: "Sign out button", sel: 'button[aria-label="Sign out"]' },
  { name: "More button", sel: 'button[aria-label*="more controls menu" i]' },
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Hit the bypass cookie-redirect once to seed the session cookie.
const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`;
await bootstrap.goto(bypassUrl, { waitUntil: "networkidle" });
await bootstrap.close();

let exitCode = 0;
const report = [];

for (const tier of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: tier.width, height: tier.height });
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header", { timeout: 10000 });
  // Give the bar a beat to settle (sticky chrome, font load, etc.)
  await page.waitForTimeout(300);

  const bar = await page.locator("header").first();
  const barBox = await bar.boundingBox();
  const scrollWidth = await bar.evaluate((el) => el.scrollWidth);

  const measurements = [];
  for (const c of RIGHT_CLUSTER_CONTROLS) {
    // Some controls (More button, Profile) render twice in the DOM —
    // once inside the Wide trigger and once inside the Narrow trigger —
    // with the same selector but only one is visible per tier. Walk all
    // matches and pick the visible one.
    const locs = page.locator(c.sel);
    const count = await locs.count();
    if (count === 0) {
      measurements.push({ name: c.name, present: false });
      continue;
    }
    let visibleBox = null;
    for (let i = 0; i < count; i += 1) {
      const loc = locs.nth(i);
      if (await loc.isVisible()) {
        visibleBox = await loc.boundingBox();
        break;
      }
    }
    measurements.push({
      name: c.name,
      present: true,
      visible: visibleBox !== null,
      right: visibleBox ? Math.round(visibleBox.x + visibleBox.width) : null,
      width: visibleBox ? Math.round(visibleBox.width) : null,
      height: visibleBox ? Math.round(visibleBox.height) : null,
    });
  }

  // Verify no control's right edge exceeds the viewport.
  for (const m of measurements) {
    if (m.visible && m.right && m.right > tier.width) {
      exitCode = 1;
    }
  }

  // Test menu open behavior at narrower tiers — walk all More buttons
  // and pick the visible one (Wide vs Narrow renders both exist in DOM).
  let menuProbe = null;
  if (tier.width <= 1280) {
    const moreLocs = page.locator('button[aria-label*="more controls menu" i]');
    const moreCount = await moreLocs.count();
    let visibleMore = null;
    for (let i = 0; i < moreCount; i += 1) {
      const m = moreLocs.nth(i);
      if (await m.isVisible()) {
        visibleMore = m;
        break;
      }
    }
    if (visibleMore) {
      await visibleMore.click();
      await page.waitForTimeout(150);
      const menuVisible = await page.locator('[role="menu"]').isVisible();
      const items = await page
        .locator('[role="menu"] [role="menuitem"]')
        .count();
      menuProbe = { menuVisible, items };
      // Close with Esc and confirm.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      const menuStillVisible = await page
        .locator('[role="menu"]')
        .isVisible()
        .catch(() => false);
      menuProbe.escClosed = !menuStillVisible;
    }
  }

  const screenshotPath = resolve(
    OUT_DIR,
    `after__${tier.name}__${tier.width}x${tier.height}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: false, clip: { x: 0, y: 0, width: tier.width, height: 60 } });

  report.push({
    tier: tier.name,
    viewport: `${tier.width}x${tier.height}`,
    barScrollWidth: scrollWidth,
    barClientWidth: barBox ? Math.round(barBox.width) : null,
    barOverflowsViewport: scrollWidth > tier.width + 1,
    measurements,
    menuProbe,
    screenshot: screenshotPath,
  });

  await page.close();
}

await browser.close();

// Render report.
for (const r of report) {
  console.log(`\n=== ${r.tier} (${r.viewport}) ===`);
  console.log(
    `  bar scrollWidth=${r.barScrollWidth}, clientWidth=${r.barClientWidth}, overflows? ${r.barOverflowsViewport}`,
  );
  for (const m of r.measurements) {
    if (!m.present) {
      console.log(`  [absent] ${m.name}`);
    } else if (!m.visible) {
      console.log(`  [hidden] ${m.name}`);
    } else {
      console.log(
        `  [shown ] ${m.name} right=${m.right} (${m.width}x${m.height})`,
      );
    }
  }
  if (r.menuProbe) {
    console.log(
      `  menu: visible=${r.menuProbe.menuVisible} items=${r.menuProbe.items} escClosed=${r.menuProbe.escClosed}`,
    );
  }
  console.log(`  screenshot → ${r.screenshot}`);
}

console.log("\nexit code:", exitCode);
process.exit(exitCode);
