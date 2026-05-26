// scripts/probe-lane-bj.mjs — Lane BJ audit probe.
//
// Exercises the Wave 1B Curriculum-settings sections against real DOM
// behavior, captures screenshots at three viewport tiers, and asserts the
// concrete behaviors the user pointed out (cross-tab sync, persistence,
// holiday-week grey-out on /year).

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required");
  process.exit(2);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3020";
const OUT = resolve(process.cwd(), "docs/screenshots/lane-bj-audit");
mkdirSync(OUT, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const KEYS = {
  schoolWeek: "mycurricula:team:school-week-days",
  acadStart: "mycurricula:team:academic-year-start",
  acadEnd: "mycurricula:team:academic-year-end",
  holidays: "mycurricula:team:holidays",
};

const browser = await chromium.launch();
const context = await browser.newContext();

// Bootstrap: claude-login
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await boot.waitForTimeout(1500);
// Reset all storage keys to known state.
await boot.evaluate(
  (keys) => {
    for (const k of Object.values(keys)) localStorage.removeItem(k);
  },
  KEYS,
);
await boot.close();

const report = [];
let exit = 0;

// ── 1. Three-tier responsive snapshot + chip touch-target audit ─────────
for (const tier of TIERS) {
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on("console", (m) =>
    consoleMsgs.push({ type: m.type(), text: m.text() }),
  );
  await page.setViewportSize({ width: tier.width, height: tier.height });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(600);

  const dims = await page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const overflows =
    dims.docScrollWidth > tier.width + 1 ||
    dims.bodyScrollWidth > tier.width + 1;
  if (overflows) exit = 1;

  const hydrationWarnings = consoleMsgs.filter((m) =>
    /hydration|did not match|mismatch/i.test(m.text),
  );
  if (hydrationWarnings.length > 0) exit = 1;

  // Touch-target audit: every interactive control inside the page main.
  const controls = await page.$$eval(
    "main button, main input, main select, main a, main [role='switch']",
    (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          type: el.getAttribute("type"),
          aria: el.getAttribute("aria-label") ?? el.getAttribute("title"),
          h: Math.round(r.height),
          w: Math.round(r.width),
          visible: r.width > 0 && r.height > 0,
        };
      }),
  );
  const undersized = controls.filter(
    (c) => c.visible && (c.h < 44 || c.w < 44),
  );

  await page.screenshot({
    path: resolve(OUT, `curriculum__${tier.name}-${tier.width}x${tier.height}.png`),
    fullPage: true,
  });

  report.push({
    phase: "tier",
    tier: tier.name,
    dims,
    overflows,
    hydrationWarnings: hydrationWarnings.length,
    controlsTotal: controls.length,
    controlsVisible: controls.filter((c) => c.visible).length,
    undersizedCount: undersized.length,
    undersizedSample: undersized.slice(0, 6),
  });

  await page.close();
}

// ── 2. School-week toggle persists ───────────────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(500);

  await page.selectOption("#school-week-preset", "monFri");
  await page.waitForTimeout(300);

  const ls1 = await page.evaluate(
    (k) => localStorage.getItem(k),
    KEYS.schoolWeek,
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(500);
  const presetAfter = await page.inputValue("#school-week-preset");

  report.push({
    phase: "school-week-persistence",
    lsAfterToggle: ls1,
    presetAfterReload: presetAfter,
    ok: ls1 != null && presetAfter === "monFri",
  });
  if (!(ls1 != null && presetAfter === "monFri")) exit = 1;

  await page.evaluate((k) => localStorage.removeItem(k), KEYS.schoolWeek);
  await page.close();
}

// ── 3. Academic year date inputs + week count readout ───────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#academic-year-start", { timeout: 30000 });
  await page.waitForTimeout(500);

  const startBefore = await page.inputValue("#academic-year-start");
  const endBefore = await page.inputValue("#academic-year-end");

  // Set a 36-week range.
  await page.fill("#academic-year-start", "2026-08-02");
  await page.fill("#academic-year-end", "2027-04-10");
  await page.waitForTimeout(400);

  const weekText = await page.$eval(
    "[aria-live='polite']",
    (el) => el.textContent ?? "",
  );

  const lsStart = await page.evaluate(
    (k) => localStorage.getItem(k),
    KEYS.acadStart,
  );
  const lsEnd = await page.evaluate(
    (k) => localStorage.getItem(k),
    KEYS.acadEnd,
  );

  report.push({
    phase: "academic-year",
    startBefore,
    endBefore,
    lsStart,
    lsEnd,
    weekText,
  });

  await page.evaluate(
    (keys) => {
      for (const k of Object.values(keys)) localStorage.removeItem(k);
    },
    KEYS,
  );
  await page.close();
}

// ── 4. Holiday add → /year overlay renders ──────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#holiday-date", { timeout: 30000 });
  await page.waitForTimeout(500);

  // Seed academic year so the holiday falls inside.
  await page.evaluate(
    ({ k1, k2, v1, v2 }) => {
      localStorage.setItem(k1, v1);
      localStorage.setItem(k2, v2);
    },
    {
      k1: KEYS.acadStart,
      k2: KEYS.acadEnd,
      v1: "2025-11-02",
      v2: "2026-07-12",
    },
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#holiday-date", { timeout: 30000 });
  await page.waitForTimeout(300);

  // page.fill() doesn't always trigger React's onChange for type=date.
  // Focus the input then type via keyboard so React picks up the change.
  // Pick a date in the middle of the academic year so it lands in unit
  // ranges (the mock fixture has units starting around week 1-10 and
  // running through week 30+).
  await page.locator("#holiday-date").focus();
  await page.locator("#holiday-date").fill("2026-01-19"); // week 12 of 2025-11-02 start
  await page.locator("#holiday-name").focus();
  await page.locator("#holiday-name").fill("Winter Break");
  await page.waitForTimeout(200);
  // Submit the form via Enter on the name field — exercises form-level
  // submit, which is what teachers actually do.
  await page.locator("#holiday-name").press("Enter");
  await page.waitForTimeout(500);

  const lsHolidays = await page.evaluate(
    (k) => localStorage.getItem(k),
    KEYS.holidays,
  );

  // Navigate to /year and check holiday overlay exists. Wait for unit
  // bars to render so the overlay selectors have something to match.
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("[class*='UnitBar_bar']", { timeout: 30000 });
  await page.waitForTimeout(2500);

  const overlayCount = await page.$$eval(
    "[class*='UnitBar_holiday'], .holiday",
    (els) => els.length,
  );

  await page.screenshot({
    path: resolve(OUT, "year__after-holiday.png"),
    fullPage: false,
  });

  report.push({
    phase: "holiday-overlay",
    lsHolidays,
    overlayCount,
    ok: overlayCount > 0,
  });
  if (!(overlayCount > 0)) exit = 1;

  await page.evaluate(
    (keys) => {
      for (const k of Object.values(keys)) localStorage.removeItem(k);
    },
    KEYS,
  );
  await page.close();
}

// ── 5. Change academic year start in settings → /year week count shifts ─
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  const stripText1 = await page.$eval(
    "[class*='statStrip'], [class*='StatStrip']",
    (el) => el.textContent ?? "",
  ).catch(() => "");

  // Set a much shorter year and reload.
  await page.evaluate(
    ({ k1, k2, v1, v2 }) => {
      localStorage.setItem(k1, v1);
      localStorage.setItem(k2, v2);
    },
    {
      k1: KEYS.acadStart,
      k2: KEYS.acadEnd,
      v1: "2026-01-01",
      v2: "2026-08-01",
    },
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const stripText2 = await page.$eval(
    "[class*='statStrip'], [class*='StatStrip']",
    (el) => el.textContent ?? "",
  ).catch(() => "");

  report.push({
    phase: "academic-year-affects-year-view",
    statStripBefore: stripText1,
    statStripAfter: stripText2,
    different: stripText1 !== stripText2,
  });

  await page.evaluate(
    (keys) => {
      for (const k of Object.values(keys)) localStorage.removeItem(k);
    },
    KEYS,
  );
  await page.close();
}

// ── 6. Cross-tab sync via storage event ─────────────────────────────────
{
  const a = await context.newPage();
  const b = await context.newPage();
  await a.setViewportSize({ width: 1280, height: 900 });
  await b.setViewportSize({ width: 1280, height: 900 });

  await a.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await b.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await a.waitForSelector("#school-week-preset", { timeout: 30000 });
  await b.waitForSelector("#school-week-preset", { timeout: 30000 });
  await a.waitForTimeout(400);
  await b.waitForTimeout(400);

  // Change preset in tab A; tab B should pick it up via storage event.
  await a.selectOption("#school-week-preset", "monSat");
  await a.waitForTimeout(500);
  await b.waitForTimeout(500);

  const presetA = await a.inputValue("#school-week-preset");
  const presetB = await b.inputValue("#school-week-preset");

  report.push({
    phase: "cross-tab-sync",
    presetA,
    presetB,
    syncedAcrossTabs: presetA === presetB && presetA === "monSat",
  });
  if (!(presetA === presetB && presetA === "monSat")) exit = 1;

  await a.evaluate((k) => localStorage.removeItem(k), KEYS.schoolWeek);
  await a.close();
  await b.close();
}

writeFileSync(
  resolve(OUT, "probe-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
console.log(`\nEXIT: ${exit}`);

await browser.close();
process.exit(exit);
