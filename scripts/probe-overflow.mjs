// scripts/probe-overflow.mjs — confirm document-level horizontal scroll
// behavior at the three tiers.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const context = await browser.newContext();
const bs = await context.newPage();
await bs.goto(
  `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`,
  { waitUntil: "networkidle" },
);
await bs.close();

for (const t of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: t.width, height: t.height });
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header");
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const header = document.querySelector("header");
    return {
      htmlScrollWidth: html.scrollWidth,
      htmlClientWidth: html.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      headerScrollWidth: header?.scrollWidth ?? null,
      headerClientWidth: header?.clientWidth ?? null,
      windowInnerWidth: window.innerWidth,
      hasHScroll:
        html.scrollWidth > html.clientWidth ||
        body.scrollWidth > body.clientWidth,
      computedHtmlOverflowX: getComputedStyle(html).overflowX,
      computedBodyOverflowX: getComputedStyle(body).overflowX,
      computedHeaderOverflowX: header
        ? getComputedStyle(header).overflowX
        : null,
    };
  });
  console.log(`\n${t.name} ${t.width}x${t.height}`);
  for (const [k, v] of Object.entries(info)) {
    console.log(`  ${k}: ${v}`);
  }
  await page.close();
}

await browser.close();
