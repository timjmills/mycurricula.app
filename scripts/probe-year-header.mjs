// Quick inspection of /year header rendering — diagnose why the blue band
// appears to stop at Wk 15.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/year", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const header = document.querySelector(
    '[class*="QuarterMonthWeekHeader_header"]',
  );
  const monthRow = document.querySelector(
    '[class*="QuarterMonthWeekHeader_monthRow"]',
  );
  const months = Array.from(
    document.querySelectorAll('[class*="QuarterMonthWeekHeader_monthCell"]'),
  );
  const weeks = Array.from(
    document.querySelectorAll('[class*="QuarterMonthWeekHeader_weekCell"]'),
  );
  return {
    headerWidth: header?.getBoundingClientRect().width,
    headerClasses: header?.className ?? null,
    monthRowWidth: monthRow?.getBoundingClientRect().width,
    monthsCount: months.length,
    weeksCount: weeks.length,
    monthLabels: months.map((m) => ({
      label: m.textContent?.trim(),
      rect: m.getBoundingClientRect(),
    })),
    hasChameleon: header?.className?.includes("chameleon"),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
