// Capture /year at three tiers post-fix.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3020";
const OUT = resolve(process.cwd(), "docs/screenshots/lane-bj-audit");
mkdirSync(OUT, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext();

const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
// Seed holidays + academic year so the visuals exercise the new code.
await boot.evaluate(() => {
  localStorage.setItem("mycurricula:team:academic-year-start", "2025-11-02");
  localStorage.setItem("mycurricula:team:academic-year-end", "2026-07-12");
  localStorage.setItem(
    "mycurricula:team:holidays",
    JSON.stringify([
      { id: "h1", date: "2026-01-19", name: "Winter Break" },
      { id: "h2", date: "2026-03-23", name: "Spring Break" },
    ]),
  );
});
await boot.close();

for (const tier of TIERS) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: tier.width, height: tier.height });
  await p.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.waitForTimeout(2500);
  await p.screenshot({
    path: resolve(OUT, `year-with-holidays__${tier.name}-${tier.width}x${tier.height}.png`),
    fullPage: false,
  });
  await p.close();
}

await browser.close();
