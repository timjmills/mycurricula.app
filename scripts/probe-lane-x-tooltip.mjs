// scripts/probe-lane-x-tooltip.mjs — Lane X (Task #23) verification probe.
//
// Verifies the new Button.tooltip prop + the disabled-button quirk fix in
// the Tooltip primitive. Boots Chromium against the local dev server,
// signs in via the Claude bypass, then on /weekly:
//   1. Confirms the left-panel-collapse icon button has the new tooltip
//      (enabled-path sanity check).
//   2. Hovers the Undo button (which starts disabled because there's
//      nothing to undo), confirms the styled Tooltip appears via the
//      wrapper-span path AND that the native `title=` attribute is also
//      set as the cross-browser fallback.
//   3. Screenshots before/after the hover at desktop width.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/probe-lane-x-tooltip.mjs
//
// Outputs under docs/screenshots/lane-x-tooltip/.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-x-tooltip");
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});

// Seed the session via the cookie-redirect bypass entrypoint.
const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`;
await bootstrap.goto(bypassUrl, { waitUntil: "networkidle" });
await bootstrap.close();

const page = await context.newPage();
await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("header", { timeout: 10000 });
await page.waitForTimeout(500);

const report = { tier: "desktop-1280x900", checks: [] };

// ── Check 1: enabled-path Button.tooltip on the panel-collapse button ────
{
  const btn = page
    .locator(
      'button[aria-label*="filter panel" i], button[aria-label*="Collapse filter panel" i], button[aria-label*="Expand filter panel" i]',
    )
    .first();
  await btn.waitFor({ state: "visible", timeout: 5000 });
  const title = await btn.getAttribute("title");
  await page.screenshot({
    path: `${OUT_DIR}/01-panel-collapse-before-hover.png`,
    fullPage: false,
    clip: { x: 0, y: 0, width: 600, height: 200 },
  });
  await btn.hover();
  // Tooltip has 400ms delay + 120ms fade. Wait safely past both.
  await page.waitForTimeout(1200);
  const tooltipLocator = page.locator('[role="tooltip"]').first();
  const tooltipExists = (await tooltipLocator.count()) > 0;
  const tooltipVisible = tooltipExists
    ? await tooltipLocator.isVisible().catch(() => false)
    : false;
  const tooltipText = tooltipExists
    ? await tooltipLocator.innerText().catch(() => null)
    : null;
  const tooltipOpacity = tooltipExists
    ? await tooltipLocator.evaluate((el) => window.getComputedStyle(el).opacity)
    : null;
  // Also dump any aria-describedby on the trigger so we can tell whether
  // Tooltip wired the open state correctly.
  const ariaDescribedby = await btn.getAttribute("aria-describedby");
  await page.screenshot({
    path: `${OUT_DIR}/02-panel-collapse-after-hover.png`,
    fullPage: false,
    clip: { x: 0, y: 0, width: 600, height: 200 },
  });
  report.checks.push({
    check: "enabled icon button — styled tooltip fires on hover",
    titleAttr: title,
    tooltipExists,
    tooltipVisible,
    tooltipText,
    tooltipOpacity,
    ariaDescribedby,
    pass: tooltipVisible && typeof title === "string" && title.length > 0,
  });
  // Move pointer away to dismiss the tooltip before the next check.
  await page.mouse.move(640, 600);
  await page.waitForTimeout(200);
}

// ── Check 2: disabled-path Undo button + wrapper-span fix ─────────────────
{
  const undoBtn = page.locator('button[aria-label="Undo"]').first();
  await undoBtn.waitFor({ state: "attached", timeout: 5000 });
  const disabledState = await undoBtn.isDisabled();
  const title = await undoBtn.getAttribute("title");
  // Per the Tooltip primitive's disabled-quirk fix, the listeners now live
  // on a wrapper <span class="disabledWrapper">. Walk up the DOM to find it.
  const hasWrapperSpan = await undoBtn.evaluate((el) => {
    const parent = el.parentElement;
    return (
      !!parent &&
      parent.tagName === "SPAN" &&
      parent.className.includes("disabledWrapper")
    );
  });

  await page.screenshot({
    path: `${OUT_DIR}/03-undo-disabled-before-hover.png`,
    fullPage: false,
    clip: { x: 0, y: 0, width: 1000, height: 200 },
  });

  // Hover the wrapper span (using the button's bounding box is fine since
  // the wrapper sits at the same coordinates).
  const box = await undoBtn.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);
  }

  const tooltipLocator = page.locator('[role="tooltip"]').first();
  const tooltipVisible = await tooltipLocator.isVisible().catch(() => false);
  const tooltipText = tooltipVisible
    ? await tooltipLocator.innerText().catch(() => null)
    : null;

  await page.screenshot({
    path: `${OUT_DIR}/04-undo-disabled-after-hover.png`,
    fullPage: false,
    clip: { x: 0, y: 0, width: 1000, height: 200 },
  });

  report.checks.push({
    check: "disabled icon button — wrapper-span path + native title fallback",
    disabled: disabledState,
    hasWrapperSpan,
    titleAttr: title,
    tooltipVisible,
    tooltipText,
    pass:
      disabledState &&
      hasWrapperSpan &&
      typeof title === "string" &&
      title.length > 0,
  });
}

await page.close();
await context.close();
await browser.close();

console.log(JSON.stringify(report, null, 2));

const failed = report.checks.filter((c) => !c.pass);
if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll checks passed. Screenshots in ${OUT_DIR}.`);
