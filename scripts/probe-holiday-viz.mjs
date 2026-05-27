// Targeted probe: F#20 holiday overlay extension to /weekly and /daily.
// Seeds a holiday on Mon (2026-01-19) for CURRENT_WEEK=12, then captures
// screenshots of /weekly grid mode, /weekly list mode, and /daily.

import { chromium } from "playwright";
import fs from "node:fs";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = process.env.PROBE_BASE ?? "http://localhost:3001";
const KEYS = {
  acadStart: "mycurricula:team:academic-year-start",
  acadEnd: "mycurricula:team:academic-year-end",
  holidays: "mycurricula:team:holidays",
  // viewMode is shared on AppState - persisted under app-state's key.
  // We set the holiday only — viewMode toggling is handled via the UI.
};

const OUT_DIR = "docs/screenshots/holiday-viz";
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext();

const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.evaluate(
  ({ KEYS }) => {
    localStorage.setItem(KEYS.acadStart, "2025-11-02");
    localStorage.setItem(KEYS.acadEnd, "2026-07-12");
    // CURRENT_WEEK=12 → Sun=2026-01-18, Mon=2026-01-19, etc.
    localStorage.setItem(
      KEYS.holidays,
      JSON.stringify([
        {
          id: "h1",
          date: "2026-01-19",
          name: "Eid al-Fitr",
        },
      ]),
    );
  },
  { KEYS },
);
await boot.close();

const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[PE]", e.message));
await p.setViewportSize({ width: 1400, height: 900 });

// /weekly grid mode
await p.goto(`${BASE}/weekly`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForTimeout(2500);
const weeklyDebug = await p.evaluate(() => ({
  holidayColumns: document.querySelectorAll("[class*='holidayColumn']").length,
  holidayPills: document.querySelectorAll("[class*='dayHeadHolidayPill']").length,
  holidayHeaders: document.querySelectorAll("[class*='dayHeadHoliday']").length,
}));
console.log("WEEKLY GRID:", JSON.stringify(weeklyDebug));
await p.screenshot({
  path: `${OUT_DIR}/weekly-grid-holiday.png`,
  fullPage: false,
});

// /weekly LIST mode — click the topbar ToggleGroup option labelled "List".
const listClicked = await p.evaluate(() => {
  // Find role="radio" with aria-label="List".
  const candidates = Array.from(
    document.querySelectorAll('[role="radio"]'),
  );
  const listBtn = candidates.find(
    (el) => (el.getAttribute("aria-label") ?? "") === "List",
  );
  if (listBtn) {
    listBtn.click();
    return true;
  }
  return false;
});
console.log("LIST CLICKED:", listClicked);
await p.waitForTimeout(1500);
const weeklyListDebug = await p.evaluate(() => ({
  daySectionsHoliday: document.querySelectorAll(
    "[class*='daySectionHoliday']",
  ).length,
  holidayPills: document.querySelectorAll("[class*='holidayPill']").length,
}));
console.log("WEEKLY LIST:", JSON.stringify(weeklyListDebug));
await p.screenshot({
  path: `${OUT_DIR}/weekly-list-holiday.png`,
  fullPage: false,
});

// /daily
await p.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForTimeout(2500);
// Switch to Monday (day index 1) so the holiday banner shows.
await p.evaluate(() => {
  const monBtn = document.getElementById("daily-tab-1");
  if (monBtn) monBtn.click();
});
await p.waitForTimeout(800);
const dailyDebug = await p.evaluate(() => ({
  holidayBanner: document.querySelectorAll("[class*='holidayBanner']").length,
  weekStripHolidayDots: document.querySelectorAll(
    "[class*='weekStripHolidayDot']",
  ).length,
  weekStripPillHoliday: document.querySelectorAll(
    "[class*='weekStripPillHoliday']",
  ).length,
}));
console.log("DAILY:", JSON.stringify(dailyDebug));
await p.screenshot({
  path: `${OUT_DIR}/daily-holiday.png`,
  fullPage: false,
});

await browser.close();
console.log("Done.");
