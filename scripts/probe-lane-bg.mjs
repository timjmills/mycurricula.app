// scripts/probe-lane-bg.mjs — Lane BG audit probe (subject-filtered chameleon calendars).
//
// Verifies the new SubjectCalendar stack above the /year main roadmap:
//   1. Default state (no filter): zero extra calendars.
//   2. Filter to Math only: ONE math-tinted calendar above the roadmap.
//   3. Filter to Math + Reading: TWO calendars (math + reading).
//   4. Filter back to all 8: zero extras.
//
// Captures screenshots at three viewport tiers for the Math-only state.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required");
  process.exit(2);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "docs/screenshots/lane-bg");
mkdirSync(OUT, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Bootstrap login via the claude bypass token. We use `commit` so we
// don't wait for the redirected /year page to fully load — the
// set-cookie happens on the 307 itself, so the auth session is live
// in `context` as soon as the redirect arrives.
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(2000);
await boot.close();

const report = [];
let exit = 0;

/**
 * Drive the curriculum filter popover to select exactly the given
 * subject ids. Strategy:
 *   - Open the popover (button labeled "Select the curriculum").
 *   - Use JS to dispatch click events on the checkboxes directly.
 *   - Close popover.
 */
async function setFilter(page, targetIds) {
  const ALL = ["math", "reading", "writing", "grammar", "spelling", "ufli", "explorers", "sel"];

  // Open the popover using Playwright's auto-waiting locator API. The
  // trigger button carries the text "Select the curriculum"; locator+click
  // handles hydration timing for us.
  await page.getByRole("button", { name: /Select the curriculum/i }).click();

  // Verify portal is mounted by checking for at least one cf-* checkbox.
  await page.waitForSelector("#cf-math", { timeout: 15000 });

  // Read current checkbox states and click only the ones that need flipping.
  // The CurriculumFilter component refuses to drop to an empty set, so we
  // ensure the FIRST click in the sequence ADDS a subject before removing.
  // Easiest: figure out a safe ordering — add all targets first, then remove
  // non-targets.
  for (const sid of ALL) {
    if (targetIds.includes(sid)) {
      // Ensure it is checked.
      const checked = await page.$eval(`#cf-${sid}`, (el) => el.checked);
      if (!checked) {
        await page.click(`#cf-${sid}`);
        await page.waitForTimeout(80);
      }
    }
  }
  for (const sid of ALL) {
    if (!targetIds.includes(sid)) {
      const checked = await page.$eval(`#cf-${sid}`, (el) => el.checked);
      if (checked) {
        await page.click(`#cf-${sid}`);
        await page.waitForTimeout(80);
      }
    }
  }

  // Close the popover by pressing Escape (avoids needing a precise trigger
  // selector again).
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function selectAll(page) {
  const ALL = ["math", "reading", "writing", "grammar", "spelling", "ufli", "explorers", "sel"];
  await page.getByRole("button", { name: /Select the curriculum/i }).click();
  await page.waitForSelector("#cf-math", { timeout: 15000 });
  for (const sid of ALL) {
    const checked = await page.$eval(`#cf-${sid}`, (el) => el.checked);
    if (!checked) {
      await page.click(`#cf-${sid}`);
      await page.waitForTimeout(80);
    }
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function countSubjectCalendars(page) {
  // SubjectCalendar uses a section[aria-label*='subject calendar'].
  return await page.$$eval(
    "section[aria-label$='subject calendar']",
    (els) => els.length,
  );
}

// ── Scenario 1: Default state (no filter applied) ──────────────────────
{
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[scenario1 pageerror]", e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  // Dev-server cold-compile of /year can take 20-40s on first visit.
  await page.waitForSelector('[data-route="year"]', { timeout: 90000 });
  await page.waitForTimeout(3000);

  const n = await countSubjectCalendars(page);
  report.push({ phase: "default-no-filter", calendarCount: n, ok: n === 0 });
  if (n !== 0) exit = 1;

  await page.screenshot({
    path: resolve(OUT, "01-default-no-filter.png"),
    fullPage: false,
  });
  await page.close();
}

// ── Scenario 2: Filter to Math only ────────────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForSelector('[data-route="year"]', { timeout: 60000 });
  await page.waitForTimeout(3000);

  await setFilter(page, ["math"]);
  await page.waitForTimeout(800);

  const n = await countSubjectCalendars(page);
  report.push({ phase: "math-only", calendarCount: n, ok: n === 1 });
  if (n !== 1) exit = 1;

  // Verify the math calendar has the cp-subj.math cascade.
  const hasMathCascade = await page.$$eval(
    "section[aria-label$='subject calendar']",
    (els) => els.map((el) => el.className).join("|"),
  );
  report.push({ phase: "math-only-classes", classes: hasMathCascade });

  for (const tier of TIERS) {
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.waitForTimeout(600);
    const dims = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    const overflows =
      dims.docScrollWidth > tier.width + 1 ||
      dims.bodyScrollWidth > tier.width + 1;
    if (overflows) exit = 1;
    report.push({
      phase: "math-only-tier",
      tier: tier.name,
      dims,
      overflows,
    });
    await page.screenshot({
      path: resolve(OUT, `02-math-only__${tier.name}-${tier.width}.png`),
      fullPage: false,
    });
  }
  await page.close();
}

// ── Scenario 3: Filter to Math + Reading ───────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForSelector('[data-route="year"]', { timeout: 60000 });
  await page.waitForTimeout(3000);

  await setFilter(page, ["math", "reading"]);
  await page.waitForTimeout(800);

  const n = await countSubjectCalendars(page);
  report.push({ phase: "math-reading", calendarCount: n, ok: n === 2 });
  if (n !== 2) exit = 1;

  await page.screenshot({
    path: resolve(OUT, "03-math-reading.png"),
    fullPage: false,
  });
  await page.close();
}

// ── Scenario 4: Filter back to all 8 (the "None"->"All" round trip) ───
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForSelector('[data-route="year"]', { timeout: 60000 });
  await page.waitForTimeout(3000);

  await setFilter(page, ["math"]);
  await page.waitForTimeout(400);
  await selectAll(page);
  await page.waitForTimeout(800);

  const n = await countSubjectCalendars(page);
  report.push({ phase: "all-8-back-to-default", calendarCount: n, ok: n === 0 });
  if (n !== 0) exit = 1;

  await page.screenshot({
    path: resolve(OUT, "04-all-8.png"),
    fullPage: false,
  });
  await page.close();
}

writeFileSync(
  resolve(OUT, "probe-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
console.log(`\nEXIT: ${exit}`);

await browser.close();
process.exit(exit);
