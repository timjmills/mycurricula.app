// scripts/snap-daily-previews.mjs — pristine preview set: the built /daily at
// the three tiers + key states, and the 6.11.26 prototype for side-by-side.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";
const OUT = path.resolve(
  process.cwd(),
  "docs/screenshots/daily-verify/previews",
);
mkdirSync(OUT, { recursive: true });
const PROTO = path.resolve(
  process.cwd(),
  "Documents/Claude Design/6.11.26 design_handoff_daily_view/Daily View (redesign).html",
);

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

// Prototype reference at 1440.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("file://" + PROTO.replace(/\\/g, "/"), {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, "0-prototype-1440.png") });

// Built app, same viewport.
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const box = await row.boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, "1-app-1440-detail.png") });

// Templates menu open.
const tmpl = page.getByRole("button", { name: /templates/i }).first();
await tmpl.click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "2-app-templates-menu.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Right column collapsed to rail.
await page
  .locator('[data-slot="right"] button[aria-label^="Collapse column"]')
  .first()
  .click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "3-app-rail-collapsed.png") });
await page
  .locator('[data-slot="right"] button[aria-label^="Expand column"]')
  .first()
  .click();
await page.waitForTimeout(500);

// Tablet + phone.
await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "4-app-768-tablet.png") });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "5-app-390-phone.png") });

await browser.close();
console.log("previews written to " + OUT);
