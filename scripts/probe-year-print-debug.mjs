import { chromium } from "playwright";
import { readFileSync } from "node:fs";
let TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^CLAUDE_BYPASS_TOKEN=(.+)$/m);
  if (m) TOKEN = m[1].trim();
}
const BASE = "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const seed = await ctx.newPage();
await seed.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year/print`,
  { waitUntil: "domcontentloaded" },
);
await seed.close();
const page = await ctx.newPage();
await page.goto(`${BASE}/year/print`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const check = await page.evaluate(() => {
  const printRoot = document.querySelector("[data-print-view]");
  const header = document.querySelector("header");
  const aside = document.querySelector("aside");
  return {
    printRootHTML: printRoot?.outerHTML?.slice(0, 120),
    hasPrintRootAttr: printRoot
      ? printRoot.hasAttribute("data-print-view")
      : false,
    bodyHasMatches: !!document.body.matches(":has([data-print-view])"),
    headerDisplay: header ? getComputedStyle(header).display : "none",
    asideDisplay: aside ? getComputedStyle(aside).display : "none",
    headerVisible: header ? header.getBoundingClientRect().height > 0 : false,
    asideVisible: aside ? aside.getBoundingClientRect().height > 0 : false,
  };
});
console.log(JSON.stringify(check, null, 2));
await browser.close();
