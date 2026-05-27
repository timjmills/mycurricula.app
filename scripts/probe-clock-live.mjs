// scripts/probe-clock-live.mjs — verify the inline Clock renders on the deployed site
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
});
const page = await ctx.newPage();
await page.goto("https://mycurricula.app/weekly", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const clocks = Array.from(document.querySelectorAll('[class*="Clock_"], [data-testid*="clock"], [class*="clock"]'));
  const weekLabel = document.querySelector('[class*="weekLabel"]');
  return {
    clockCount: clocks.length,
    clocks: clocks.map((c) => ({
      cls: c.className,
      text: c.textContent?.trim().slice(0, 50) ?? "",
      rect: c.getBoundingClientRect(),
      display: getComputedStyle(c).display,
      visibility: getComputedStyle(c).visibility,
    })),
    weekLabel: weekLabel ? {
      text: weekLabel.textContent?.trim(),
      rect: weekLabel.getBoundingClientRect(),
    } : null,
    weekLabelNextSibling: weekLabel?.nextElementSibling?.outerHTML?.slice(0, 200) ?? null,
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: "docs/screenshots/clock-live-probe.png", clip: { x: 0, y: 0, width: 1600, height: 80 } });
await browser.close();
