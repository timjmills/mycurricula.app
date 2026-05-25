import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const TOK = encodeURIComponent(TOKEN);
const OUT = resolve(process.cwd(), "docs/screenshots/year-audit");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function tier(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3000/year?claude=${TOK}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(800);
  await page.goto(`http://localhost:3000/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 1. Default (auto-centered on today)
  await page.screenshot({
    path: resolve(OUT, `lane-k-FIXED-${label}-1-default.png`),
    fullPage: false,
  });

  // 2. Scroll all the way left
  await page.evaluate(() => {
    const ts = document.querySelector('[class*="timelineScroll"]');
    if (ts) ts.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(OUT, `lane-k-FIXED-${label}-2-start.png`),
    fullPage: false,
  });

  // 3. Scroll all the way right
  await page.evaluate(() => {
    const ts = document.querySelector('[class*="timelineScroll"]');
    if (ts) ts.scrollLeft = ts.scrollWidth;
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(OUT, `lane-k-FIXED-${label}-3-end.png`),
    fullPage: false,
  });

  // 4. Switch to progression mode
  const progBtn = await page.$('button[aria-label*="Progression"]');
  if (progBtn) {
    await progBtn.click();
    await page.waitForTimeout(800);
    // Scroll partway
    await page.evaluate(() => {
      const ts = document.querySelector('[class*="timelineScroll"]');
      if (ts) ts.scrollLeft = 2000;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(OUT, `lane-k-FIXED-${label}-4-progression-mid.png`),
      fullPage: false,
    });
  }

  await page.close();
  await ctx.close();
}

await tier(1280, 900, "desktop");
await tier(768, 1024, "tablet");
await browser.close();
console.log("Screenshots saved to", OUT);
