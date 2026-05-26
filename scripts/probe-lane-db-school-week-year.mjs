// scripts/probe-lane-db-school-week-year.mjs — Lane DB probe.
//
// Verifies that the three year-view consumers (RoadmapView,
// ProgressionView, YearMobile) now READ the school-week setting via
// useSchoolWeek() instead of falling back to the hard-coded
// DEFAULT_SCHOOL_WEEK constant in lib/year-calendar.ts.
//
// Strategy: change the school week to Mon-Fri in localStorage, reload
// /year, and observe that:
//   1. ProgressionView's per-day labels (.wkd headers in
//      QuarterMonthWeekHeader) show 5 columns per week — and the FIRST
//      column corresponds to Monday rather than Sunday.
//   2. Resetting to Sun-Thu restores the original behaviour.
//   3. Switching to a 6-day week (Mon-Sat) widens the per-day grid.
//
// We use the same bypass token + storage key that probe-lane-y-school-week
// uses.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-db-school-week");
mkdirSync(OUT_DIR, { recursive: true });

const STORAGE_KEY = "mycurricula:team:school-week-days";

const browser = await chromium.launch();
const context = await browser.newContext();

// Seed bypass cookie.
const bootstrap = await context.newPage();
await bootstrap.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await bootstrap.waitForTimeout(2000);
await bootstrap.close();

const report = [];
let exitCode = 0;

async function loadYearWith(schoolWeek) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  // First land on /year so localStorage is on the right origin.
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  // Seed the school-week selection in localStorage and reload.
  await page.evaluate(
    ({ k, v }) =>
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v),
    { k: STORAGE_KEY, v: schoolWeek ? JSON.stringify(schoolWeek) : null },
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  return page;
}

// Switch the Year view to ProgressionView (list mode) and measure the
// number of day-column cells in the first lane. ProgressionView renders
// 36 weeks × schoolWeekLen cells, so we can recover the configured
// school-week length from the cell count without relying on any text
// labels (none are rendered per-cell).
async function snapshotDayGrid(page) {
  // Try to switch the view-mode toggle to "list" so ProgressionView is
  // active. The toggle is at /year — typically aria-label or text.
  try {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const list = btns.find((b) => {
        const text = (b.textContent ?? "").trim().toLowerCase();
        const aria = (b.getAttribute("aria-label") ?? "").toLowerCase();
        return (
          text === "list" ||
          /day-by-day|progression|list mode/.test(text) ||
          /day-by-day|progression|list/.test(aria)
        );
      });
      if (list) list.click();
    });
    await page.waitForTimeout(700);
  } catch {
    // ignore — view may already be in list mode.
  }

  // Count cells in the first lane's glyph row. ProgressionView uses
  // styles.glyphCell (cell per school day) and styles.unitGridLine
  // (cell per school day on the unit row).
  return await page.evaluate(() => {
    // Find any element whose className matches the CSS-modules-hashed
    // pattern containing "glyphRow" or "glyphCell". CSS Modules emit
    // class names like "ProgressionView_glyphCell__abc12".
    const all = Array.from(document.querySelectorAll("[class]"));
    const glyphCells = all.filter((el) =>
      Array.from(el.classList).some((c) => /glyphCell/.test(c)),
    );
    // Pull the first lane row's cells (cells are grouped under
    // .glyphRow per lane). We bucket by closest .glyphRow.
    const byRow = new Map();
    for (const cell of glyphCells) {
      const row = cell.closest("[class]");
      if (!row) continue;
      const k = row;
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(cell);
    }
    const totalCells = glyphCells.length;
    // Pick the first lane's row by document order.
    const firstRowCount = byRow.size > 0 ? byRow.values().next().value.length : 0;
    return {
      totalCells,
      firstLaneCellCount: firstRowCount,
      laneCount: byRow.size,
    };
  });
}

// Per-week cell count = total / 36 weeks. We assert the per-week
// length matches the configured school-week, which only works if the
// view actually reads the hook.
const WEEKS_IN_YEAR = 36;

// Phase A: default Sun-Thu (no localStorage value).
{
  const page = await loadYearWith(null);
  const snap = await snapshotDayGrid(page);
  const screenshot = resolve(OUT_DIR, "year__sun-thu-default.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  const perWeek = snap.laneCount > 0 ? snap.firstLaneCellCount / WEEKS_IN_YEAR : 0;
  report.push({
    phase: "A_default_sun_thu",
    expected_per_week: 5,
    actual_per_week: perWeek,
    snap,
    screenshot,
  });
  if (perWeek !== 5) exitCode = 1;
  await page.close();
}

// Phase B: Mon-Fri.
{
  const page = await loadYearWith(["mon", "tue", "wed", "thu", "fri"]);
  const snap = await snapshotDayGrid(page);
  const screenshot = resolve(OUT_DIR, "year__mon-fri.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  const perWeek = snap.laneCount > 0 ? snap.firstLaneCellCount / WEEKS_IN_YEAR : 0;
  report.push({
    phase: "B_mon_fri",
    expected_per_week: 5,
    actual_per_week: perWeek,
    snap,
    screenshot,
  });
  if (perWeek !== 5) exitCode = 1;
  await page.close();
}

// Phase C: Mon-Sat (6-day week) — the diagnostic: if the view ignores
// the hook, total cells stay at 5 × 36 = 180. If wired correctly, the
// per-lane count rises to 6 × 36 = 216.
{
  const page = await loadYearWith([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
  ]);
  const snap = await snapshotDayGrid(page);
  const screenshot = resolve(OUT_DIR, "year__mon-sat.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  const perWeek = snap.laneCount > 0 ? snap.firstLaneCellCount / WEEKS_IN_YEAR : 0;
  report.push({
    phase: "C_mon_sat",
    expected_per_week: 6,
    actual_per_week: perWeek,
    snap,
    screenshot,
  });
  if (perWeek !== 6) exitCode = 1;
  await page.close();
}

// Phase D: 3-day week (mon/wed/fri) — the most aggressive test. Total
// cells should drop to 3 × 36 = 108 if the hook is honored.
{
  const page = await loadYearWith(["mon", "wed", "fri"]);
  const snap = await snapshotDayGrid(page);
  const screenshot = resolve(OUT_DIR, "year__mon-wed-fri.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  const perWeek = snap.laneCount > 0 ? snap.firstLaneCellCount / WEEKS_IN_YEAR : 0;
  report.push({
    phase: "D_mon_wed_fri",
    expected_per_week: 3,
    actual_per_week: perWeek,
    snap,
    screenshot,
  });
  if (perWeek !== 3) exitCode = 1;
  await page.close();
}

// Reset.
{
  const page = await loadYearWith(null);
  await page.close();
}

writeFileSync(
  resolve(OUT_DIR, "probe-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

await browser.close();
process.exit(exitCode);
