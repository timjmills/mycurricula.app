// One-shot DOM probe to introspect whether LeftFilterPanel is in the
// DOM tree on /subject/math, and if not, why.

import { chromium } from "playwright";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const TOK = encodeURIComponent(process.env.CLAUDE_BYPASS_TOKEN);
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/subject?claude=${TOK}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(3000);
// Also wait for SubjectView to render so the page is fully hydrated.
await page.waitForSelector('nav[aria-label="Subject switcher"]', { timeout: 30000 });
await page.waitForTimeout(1500);
console.log("final URL:", page.url());
const result = await page.evaluate(() => {
  const asides = Array.from(document.querySelectorAll("aside"));
  return asides.map((a) => ({
    ariaLabel: a.getAttribute("aria-label"),
    className: a.className,
    rect: a.getBoundingClientRect(),
    childCount: a.children.length,
  }));
});
console.log(JSON.stringify(result, null, 2));

const navs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("nav,aside")).map((n) => ({
    tag: n.tagName,
    aria: n.getAttribute("aria-label"),
    class: n.className.slice(0, 80),
    rect: n.getBoundingClientRect(),
  }));
});
console.log("\nALL nav/aside:");
console.log(JSON.stringify(navs, null, 2));

await browser.close();
