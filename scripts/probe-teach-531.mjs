// scripts/probe-teach-531.mjs — responsive probe for the 5.31 Teach Boards &
// Widgets work. Boots the claude bypass, visits /teach at the three contract
// tiers (360 / 768 / 1280), and reports document-level horizontal scroll +
// captures a screenshot per tier.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-teach-531.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = path.resolve("docs/screenshots/teach-531");
const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();

const TEACH_URL = `${BASE}/teach?claude=${encodeURIComponent(TOKEN)}`;

let anyScroll = false;
for (const tier of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: tier.width, height: tier.height });
  await page.goto(TEACH_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    url: location.pathname,
  }));
  const overflow = m.scrollW > m.clientW + 1;
  if (overflow) anyScroll = true;
  console.log(
    `${tier.name.padEnd(8)} ${tier.width}px → path=${m.url} scrollW=${m.scrollW} clientW=${m.clientW} hOverflow=${overflow ? "YES ⚠" : "no"}`,
  );
  await page.screenshot({
    path: path.join(OUT_DIR, `teach__${tier.name}.png`),
    fullPage: false,
  });
  await page.close();
}

await browser.close();
console.log(anyScroll ? "RESULT: horizontal scroll detected" : "RESULT: no document-level horizontal scroll at any tier");
process.exit(anyScroll ? 2 : 0);
