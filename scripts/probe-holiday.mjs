// Targeted probe: holiday overlay on /year.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3020";
const KEYS = {
  acadStart: "mycurricula:team:academic-year-start",
  acadEnd: "mycurricula:team:academic-year-end",
  holidays: "mycurricula:team:holidays",
};

const browser = await chromium.launch();
const ctx = await browser.newContext();

const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
// Seed storage BEFORE visiting /year.
await boot.evaluate(({ KEYS }) => {
  localStorage.setItem(KEYS.acadStart, "2025-11-02");
  localStorage.setItem(KEYS.acadEnd, "2026-07-12");
  localStorage.setItem(
    KEYS.holidays,
    JSON.stringify([
      {
        id: "h1",
        date: "2026-01-19",
        name: "Test Holiday Wk12",
      },
    ]),
  );
}, { KEYS });
await boot.close();

const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[PE]", e.message));
await p.setViewportSize({ width: 1400, height: 900 });
await p.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3000);

// Look for `.holiday` overlays plus inspect the bar children.
const debug = await p.evaluate(() => {
  const bars = Array.from(document.querySelectorAll("[class*='UnitBar_bar']"));
  return {
    barCount: bars.length,
    holidaysInUnitBars: bars.reduce((acc, b) => {
      const overlays = b.querySelectorAll(".holiday, [class*='holiday']");
      return acc + overlays.length;
    }, 0),
    allHolidayClass: document.querySelectorAll(".holiday").length,
    holidayByModuleClass: document.querySelectorAll("[class*='UnitBar_holiday']").length,
  };
});

const lsHolidays = await p.evaluate(
  (k) => localStorage.getItem(k),
  KEYS.holidays,
);
console.log("LS holidays:", lsHolidays);
console.log("DEBUG:", JSON.stringify(debug, null, 2));

await p.screenshot({
  path: "docs/screenshots/lane-bj-audit/year-holiday-debug.png",
  fullPage: false,
});

await browser.close();
