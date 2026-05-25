// Lane J — quick screenshot of /year desktop after the LaneCard refactor.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = process.env.PROBE_BASE ?? "http://localhost:3004";
const OUT = resolve(process.cwd(), "docs/screenshots/lane-j-subject-button");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});

const seed = await context.newPage();
await seed.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  {
    waitUntil: "domcontentloaded",
  },
);
await seed.close();

const page = await context.newPage();
await page.goto(`${BASE}/year`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({
  path: resolve(OUT, "year-desktop-1280.png"),
  fullPage: true,
});

// Capture just the lane column for a tight comparison.
const laneShot = await page.$(".lanes, [class*='lanes']");
if (laneShot) {
  await laneShot.screenshot({ path: resolve(OUT, "year-lanes-region.png") });
}

// Toggle progression view and capture
const progBtn = await page.$('button[aria-label*="Progression"]');
if (progBtn) {
  await progBtn.click();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: resolve(OUT, "year-desktop-progression.png"),
    fullPage: true,
  });
}

// Compare reference: /weekly subject row label
await page.goto(`${BASE}/weekly`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({
  path: resolve(OUT, "weekly-desktop-reference.png"),
  fullPage: false,
});

console.log("Wrote screenshots to", OUT);
await browser.close();
