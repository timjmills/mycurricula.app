// scripts/probe-quick.mjs — minimal page-content diagnostic.

import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext();

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const p = await context.newPage();
p.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForTimeout(2000);

const found = await p.evaluate(() => {
  const ids = ["curriculum-label", "school-months-preset", "school-week-preset", "academic-year-start", "academic-year-end", "holiday-date", "holiday-name"];
  return ids.map((id) => ({ id, found: !!document.getElementById(id) }));
});
console.log("\nID-presence map:");
for (const f of found) console.log(`  ${f.found ? "[OK]" : "[--]"} #${f.id}`);

const titleText = await p.title();
const headings = await p.$$eval("h1, h2, h3", (els) =>
  els.map((e) => `${e.tagName}: ${e.textContent?.trim()}`),
);
console.log(`\ntitle: ${titleText}`);
console.log("headings:");
for (const h of headings) console.log(`  ${h}`);

await browser.close();
