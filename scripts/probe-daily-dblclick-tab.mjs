// scripts/probe-daily-dblclick-tab.mjs — isolated: double-clicking a side
// slot's tab collapses that column to its rail (handoff §3).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(2000);
await boot.close();

const page = await context.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);

const slot = page.locator('[data-slot="right"]');
const tab = slot.locator('button[class*="slotTab"]').first();
console.log("tab found:", await tab.count());

// 1. Native Playwright double-click.
await tab.dblclick();
await page.waitForTimeout(600);
let collapsed = (await slot.getAttribute("data-collapsed")) === "true";
console.log(`native dblclick → collapsed=${collapsed}`);

if (!collapsed) {
  // 2. JS-dispatched dblclick on the same node.
  await tab.evaluate((el) =>
    el.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    ),
  );
  await page.waitForTimeout(600);
  collapsed = (await slot.getAttribute("data-collapsed")) === "true";
  console.log(`JS-dispatched dblclick → collapsed=${collapsed}`);
}

console.log(
  collapsed
    ? "PASS  double-click collapse works (see which path above)"
    : "FAIL  double-click collapse broken on both paths",
);
await browser.close();
process.exit(collapsed ? 0 : 1);
