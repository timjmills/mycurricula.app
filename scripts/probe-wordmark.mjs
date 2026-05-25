// scripts/probe-wordmark.mjs — Task #27 verification probe.
//
// Confirms the top-bar wordmark renders "MyCurricula" + the teacher's free-text
// curriculumLabel (FALLBACK_USER seeds "Grade 5") at desktop 1280 and phone 400.
//
// Usage:  CLAUDE_BYPASS_TOKEN=… node scripts/probe-wordmark.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/wordmark-task-27");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Seed bypass session cookie.
const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`;
await bootstrap.goto(bypassUrl, { waitUntil: "networkidle" });
await bootstrap.close();

let exitCode = 0;
const report = [];

for (const tier of TIERS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: tier.width, height: tier.height });
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header", { timeout: 10000 });
  await page.waitForTimeout(400);

  // Wordmark: read the visible text of the home link.
  const wordmarkLink = page.locator('a[aria-label="MyCurricula home"]').first();
  const wordmarkText = (await wordmarkLink.innerText()).trim();
  const wordmarkVisible = await wordmarkLink.isVisible();

  // Specifically inspect the grade suffix span (it has the .wordmarkGrade class
  // — we locate it by sibling-of-MyCurricula).
  const gradeSpan = wordmarkLink.locator("span").nth(1);
  const gradeText = (await gradeSpan.innerText().catch(() => "")).trim();
  const gradeVisible = await gradeSpan.isVisible().catch(() => false);

  const screenshotPath = resolve(
    OUT_DIR,
    `wordmark__${tier.name}__${tier.width}x${tier.height}.png`,
  );
  await page.screenshot({
    path: screenshotPath,
    clip: { x: 0, y: 0, width: tier.width, height: 60 },
  });

  const expected = "MyCurricula Grade 5";
  const passed =
    wordmarkText === expected && gradeVisible && gradeText === "Grade 5";
  if (!passed) exitCode = 1;

  report.push({
    tier: tier.name,
    viewport: `${tier.width}x${tier.height}`,
    wordmarkVisible,
    wordmarkText,
    gradeVisible,
    gradeText,
    expected,
    passed,
    screenshot: screenshotPath,
  });

  await page.close();
}

await browser.close();

for (const r of report) {
  console.log(`\n=== ${r.tier} (${r.viewport}) ===`);
  console.log(`  wordmark visible: ${r.wordmarkVisible}`);
  console.log(`  wordmark text:    ${JSON.stringify(r.wordmarkText)}`);
  console.log(`  grade visible:    ${r.gradeVisible}`);
  console.log(`  grade text:       ${JSON.stringify(r.gradeText)}`);
  console.log(`  expected:         ${JSON.stringify(r.expected)}`);
  console.log(`  result:           ${r.passed ? "PASS" : "FAIL"}`);
  console.log(`  screenshot →      ${r.screenshot}`);
}

console.log("\nexit code:", exitCode);
process.exit(exitCode);
