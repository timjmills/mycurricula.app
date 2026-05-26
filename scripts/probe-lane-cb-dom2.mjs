import { chromium } from "playwright";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
const TOK = encodeURIComponent(process.env.CLAUDE_BYPASS_TOKEN);
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("console", (m) => console.log("[browser]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.setViewportSize({ width: 1280, height: 900 });
// First hit /subject?claude= to seed cookie, then go directly to /subject/math
await page.goto(`${BASE}/subject?claude=${TOK}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(1500);
console.log("URL after first nav:", page.url());
await page.goto(`${BASE}/subject/math`, { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("URL after second nav:", page.url());
// SAMPLE 1: immediately after DOMContentLoaded
const beforeHydration = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("aside")).map((a) => ({
    aria: a.getAttribute("aria-label"),
    cls: a.className.slice(0, 80),
    inDOM: true,
  }));
});
console.log("BEFORE hydration aside count:", beforeHydration.length);
console.log(JSON.stringify(beforeHydration, null, 2));

await page.waitForTimeout(3000);

const afterHydration = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("aside")).map((a) => ({
    aria: a.getAttribute("aria-label"),
    cls: a.className.slice(0, 80),
    inDOM: true,
  }));
});
console.log("\nAFTER hydration aside count:", afterHydration.length);
console.log(JSON.stringify(afterHydration, null, 2));

// Count Settings links
const settingsLinks = await page.locator('a[aria-label="Settings"]').count();
console.log("\nSettings link count:", settingsLinks);

// Find the "Collapse filter panel" button in the top-bar and click it to
// toggle (off then on) — this should re-mount the LeftFilterPanel if the
// issue is a hydration-stomp where the panel was hidden.
const toggleBtn = page.locator('button[aria-label*="filter panel" i]').first();
if ((await toggleBtn.count()) > 0) {
  console.log("\nFound filter-panel toggle:", await toggleBtn.getAttribute("aria-label"));
  await toggleBtn.click();
  await page.waitForTimeout(500);
  console.log("After click 1 aria-label:", await toggleBtn.getAttribute("aria-label"));
}
const asideNow = await page.locator('aside[aria-label="Filters"]').count();
console.log("aside count after toggle:", asideNow);
const settingsNow = await page.locator('a[aria-label="Settings"]').count();
console.log("Settings link count after toggle:", settingsNow);

if (asideNow > 0) {
  const box = await page.locator('aside[aria-label="Filters"]').first().boundingBox();
  console.log("Panel box:", box);
  const settingsBox = await page
    .locator('aside[aria-label="Filters"] a[aria-label="Settings"]')
    .first()
    .boundingBox()
    .catch(() => null);
  console.log("Settings link in panel box:", settingsBox);
  await page.screenshot({ path: "docs/screenshots/lane-cb-settings/_subject_after_toggle__1280x900.png", fullPage: false });
}

await browser.close();
