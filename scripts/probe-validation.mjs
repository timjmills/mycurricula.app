// Validate academic-year edge cases: clamping + min/max span + invalid date.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3020";
const KEYS = {
  acadStart: "mycurricula:team:academic-year-start",
  acadEnd: "mycurricula:team:academic-year-end",
};

const browser = await chromium.launch();
const ctx = await browser.newContext();

const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const p = await ctx.newPage();
await p.setViewportSize({ width: 1280, height: 900 });

// Case 1: end < start. Set start to a date after end; the hook should clamp.
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForSelector("#academic-year-start", { timeout: 30000 });
await p.waitForTimeout(500);

await p.locator("#academic-year-start").fill("2026-01-01");
await p.locator("#academic-year-end").fill("2025-12-01"); // end < start
await p.waitForTimeout(400);
const start1 = await p.inputValue("#academic-year-start");
const end1 = await p.inputValue("#academic-year-end");
const week1 = await p.$eval("[aria-live='polite']", (el) => el.textContent ?? "");
console.log("Case 1 (end<start):");
console.log(`  start=${start1}, end=${end1}`);
console.log(`  weekText=${week1.replace(/\s+/g, " ").trim()}`);

// Case 2: 5-day span (< MIN).
await p.locator("#academic-year-start").fill("2026-01-01");
await p.locator("#academic-year-end").fill("2026-01-06");
await p.waitForTimeout(400);
const start2 = await p.inputValue("#academic-year-start");
const end2 = await p.inputValue("#academic-year-end");
console.log("Case 2 (5-day span):");
console.log(`  start=${start2}, end=${end2}`);

// Case 3: 100-week span (> MAX).
await p.locator("#academic-year-start").fill("2026-01-01");
await p.locator("#academic-year-end").fill("2028-01-01");
await p.waitForTimeout(400);
const start3 = await p.inputValue("#academic-year-start");
const end3 = await p.inputValue("#academic-year-end");
console.log("Case 3 (100-week span):");
console.log(`  start=${start3}, end=${end3}`);

// Cleanup.
await p.evaluate(
  (keys) => {
    for (const k of Object.values(keys)) localStorage.removeItem(k);
  },
  KEYS,
);

await browser.close();
