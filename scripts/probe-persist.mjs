// Targeted probe: confirm school-week toggle persists.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3001";
const KEY = "mycurricula:team:school-week-days";
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
p.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("[PE]", e.message));
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForSelector("#school-week-preset");
await p.waitForTimeout(800);

console.log("LS BEFORE:", await p.evaluate((k) => localStorage.getItem(k), KEY));
console.log("Preset BEFORE:", await p.inputValue("#school-week-preset"));

await p.selectOption("#school-week-preset", "monFri");
await p.waitForTimeout(500);

console.log("LS AFTER:", await p.evaluate((k) => localStorage.getItem(k), KEY));
console.log("Preset AFTER:", await p.inputValue("#school-week-preset"));

// Also test: click a chip directly.
console.log("\n-- Click Friday chip --");
const wasChecked = await p.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button[role='switch']"))
    .find((x) => (x.getAttribute("aria-label") ?? "").startsWith("Friday"));
  return b?.getAttribute("aria-checked");
});
console.log("Friday checked BEFORE click:", wasChecked);
await p.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button[role='switch']"))
    .find((x) => (x.getAttribute("aria-label") ?? "").startsWith("Friday"));
  if (b) b.click();
});
await p.waitForTimeout(500);
console.log("LS after Friday click:", await p.evaluate((k) => localStorage.getItem(k), KEY));
const afterClick = await p.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button[role='switch']"))
    .find((x) => (x.getAttribute("aria-label") ?? "").startsWith("Friday"));
  return b?.getAttribute("aria-checked");
});
console.log("Friday checked AFTER click:", afterClick);

await p.evaluate((k) => localStorage.removeItem(k), KEY);
await browser.close();
