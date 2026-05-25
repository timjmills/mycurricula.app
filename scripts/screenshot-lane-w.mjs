// Simple screenshot capture for Lane W settings. Focused on the visual
// verification — keeps each iteration in a fresh page to avoid the
// dev-server reload races that plague the longer Playwright probe.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-w-settings");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext();

// Seed cookies once via the cookie-redirect bypass; warm up routes too.
const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await boot.waitForTimeout(2000);
// One warm-up visit per route. Dev compiles each on first hit.
for (const url of [
  "/settings/curriculum",
  "/settings/appearance",
  "/settings/catch-up",
  "/settings/lesson-templates",
  "/settings",
]) {
  await boot.goto(`${BASE}${url}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await boot.waitForTimeout(800);
}
await boot.close();

for (const tier of TIERS) {
  for (const url of [
    "/settings/curriculum",
    "/settings/appearance",
    "/settings",
  ]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.goto(`${BASE}${url}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    // Let the landing redirect resolve.
    if (url === "/settings") {
      for (let i = 0; i < 40; i++) {
        const p = new URL(page.url()).pathname;
        if (/\/settings\/[a-z-]+$/.test(p)) break;
        await page.waitForTimeout(250);
      }
    }
    await page.waitForSelector("nav[aria-label='Settings sections']", {
      timeout: 30000,
    });
    await page.waitForTimeout(800);
    const slug = url === "/settings" ? "landing" : url.split("/").pop();
    const path = resolve(
      OUT_DIR,
      `settings-${slug}__${tier.name}-${tier.width}x${tier.height}.png`,
    );
    await page.screenshot({ path, fullPage: true });
    console.log("ok", tier.name, url, "→", page.url());
    await page.close();
  }
}

await browser.close();
console.log("Done.");
