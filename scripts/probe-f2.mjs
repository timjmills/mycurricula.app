// Probe F2 fix: unit end date label should be the last instructional day.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3020";
const browser = await chromium.launch();
const ctx = await browser.newContext();

const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.evaluate(() => {
  // Seed academic year aligned with the mock fixture anchor.
  localStorage.setItem("mycurricula:team:academic-year-start", "2025-11-02");
  localStorage.setItem("mycurricula:team:academic-year-end", "2026-07-12");
});
await boot.close();

const p = await ctx.newPage();
await p.setViewportSize({ width: 1400, height: 900 });
await p.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForSelector("[class*='UnitBar_bar']", { timeout: 30000 });
await p.waitForTimeout(2500);

const ariaLabels = await p.$$eval(
  "[class*='UnitBar_bar']",
  (els) => els.map((el) => el.getAttribute("aria-label")),
);
for (const l of ariaLabels.slice(0, 6)) console.log("•", l);

await browser.close();
