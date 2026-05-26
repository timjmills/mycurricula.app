// scripts/probe-lane-y-school-week.mjs — Lane Y school-week probe.
//
// Verifies that /settings/curriculum's new School-week section:
//   1. Renders at phone / tablet / desktop without document h-scroll.
//   2. Toggling a weekday chip persists to localStorage under
//      `mycurricula:team:school-week-days`.
//   3. The selection survives a page reload.
//   4. Picking a preset updates the visual chip state.
//   5. The "at least 1 day must remain selected" guard blocks the
//      last-chip deselection.
//
// Screenshots saved under docs/screenshots/lane-y-school-week/.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/probe-lane-y-school-week.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-y-school-week");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const STORAGE_KEY = "mycurricula:team:school-week-days";

const browser = await chromium.launch();
const context = await browser.newContext();

// Seed bypass cookie + warm up routes.
const bootstrap = await context.newPage();
await bootstrap.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await bootstrap.waitForTimeout(1500);
await bootstrap.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await bootstrap.waitForTimeout(800);
// Reset storage to a known default before the run.
await bootstrap.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
await bootstrap.close();

let exitCode = 0;
const report = [];

// ── 1. Responsive + visual snapshot at three tiers ─────────────────────
for (const tier of TIERS) {
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (m) =>
    consoleMessages.push({ type: m.type(), text: m.text() }),
  );
  await page.setViewportSize({ width: tier.width, height: tier.height });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(400);

  const dims = await page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const overflows =
    dims.docScrollWidth > tier.width + 1 ||
    dims.bodyScrollWidth > tier.width + 1;
  if (overflows) exitCode = 1;

  const hydrationWarnings = consoleMessages.filter((m) =>
    /hydration|did not match|mismatch/i.test(m.text),
  );
  if (hydrationWarnings.length > 0) exitCode = 1;

  // Measure the smallest weekday-chip touch target.
  const chipSizes = await page.$$eval(
    "fieldset legend",
    (legends) => {
      const target = Array.from(legends).find((l) =>
        /Weekdays your school runs/i.test(l.textContent ?? ""),
      );
      if (!target) return [];
      const fs = target.closest("fieldset");
      if (!fs) return [];
      const chips = fs.querySelectorAll("button[role='switch']");
      return Array.from(chips).map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, label: c.getAttribute("aria-label") };
      });
    },
  );
  const undersized = chipSizes.filter((c) => c.h < 44 || c.w < 44);
  if (undersized.length > 0) exitCode = 1;

  const screenshotPath = resolve(
    OUT_DIR,
    `curriculum__${tier.name}-${tier.width}x${tier.height}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  report.push({
    phase: "responsive",
    tier: tier.name,
    viewport: `${tier.width}x${tier.height}`,
    dims,
    overflows,
    hydrationWarnings: hydrationWarnings.length,
    chipCount: chipSizes.length,
    undersizedChipCount: undersized.length,
    smallestChip: chipSizes.reduce(
      (acc, c) => (c.h < acc.h || c.w < acc.w ? c : acc),
      chipSizes[0] ?? { w: 0, h: 0 },
    ),
    screenshot: screenshotPath,
  });

  await page.close();
}

// ── 2. Toggle persists across reload ───────────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(400);

  // Default = Sun..Thu. Toggle "fri" ON and "sun" OFF.
  const toggleByLabel = async (substr) => {
    await page.evaluate((s) => {
      const btns = Array.from(
        document.querySelectorAll("button[role='switch']"),
      );
      const t = btns.find((b) =>
        (b.getAttribute("aria-label") ?? "").startsWith(s),
      );
      if (t) t.click();
    }, substr);
    await page.waitForTimeout(150);
  };
  await toggleByLabel("Friday");
  await toggleByLabel("Sunday");

  const lsAfter = await page.evaluate(
    (k) => localStorage.getItem(k),
    STORAGE_KEY,
  );

  // Reload and check the same chips render in the new state.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(600);

  const chipStates = await page.evaluate(() => {
    const btns = Array.from(
      document.querySelectorAll("button[role='switch']"),
    );
    return btns
      .filter((b) =>
        /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/.test(
          b.getAttribute("aria-label") ?? "",
        ),
      )
      .map((b) => ({
        label: b.getAttribute("aria-label"),
        checked: b.getAttribute("aria-checked") === "true",
      }));
  });
  const presetAfter = await page.inputValue("#school-week-preset");

  // Expected: Mon, Tue, Wed, Thu, Fri checked; Sun, Sat unchecked.
  const expectChecked = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const ok = chipStates.every((c) => {
    const isExpected = expectChecked.some((w) =>
      (c.label ?? "").startsWith(w),
    );
    return c.checked === isExpected;
  });
  if (!ok) exitCode = 1;
  if (presetAfter !== "monFri") exitCode = 1;

  report.push({
    phase: "persistence",
    lsAfter,
    chipStates,
    presetAfter,
    persistedCorrectly: ok,
  });

  // Reset to default for the next probe.
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.close();
}

// ── 3. Preset picker updates chip state ─────────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(400);

  await page.selectOption("#school-week-preset", "monSat");
  await page.waitForTimeout(200);
  const chips = await page.evaluate(() => {
    const btns = Array.from(
      document.querySelectorAll("button[role='switch']"),
    );
    return btns
      .filter((b) =>
        /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/.test(
          b.getAttribute("aria-label") ?? "",
        ),
      )
      .map((b) => ({
        label: b.getAttribute("aria-label"),
        checked: b.getAttribute("aria-checked") === "true",
      }));
  });
  const sunChecked = chips.find((c) => (c.label ?? "").startsWith("Sunday"))
    ?.checked;
  const satChecked = chips.find((c) => (c.label ?? "").startsWith("Saturday"))
    ?.checked;
  const monSatOk = sunChecked === false && satChecked === true;
  if (!monSatOk) exitCode = 1;
  report.push({
    phase: "preset-mon-sat",
    chips,
    monSatOk,
  });

  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.close();
}

// ── 4. Last-remaining-day guard ─────────────────────────────────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  // Seed a single-day selection.
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.evaluate(
    ({ k, v }) => localStorage.setItem(k, v),
    { k: STORAGE_KEY, v: JSON.stringify(["wed"]) },
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#school-week-preset", { timeout: 30000 });
  await page.waitForTimeout(500);

  // Try to deselect Wednesday — should be a no-op.
  await page.evaluate(() => {
    const b = Array.from(
      document.querySelectorAll("button[role='switch']"),
    ).find((x) =>
      (x.getAttribute("aria-label") ?? "").startsWith("Wednesday"),
    );
    if (b) b.click();
  });
  await page.waitForTimeout(200);
  const lsStillOne = await page.evaluate(
    (k) => localStorage.getItem(k),
    STORAGE_KEY,
  );
  const wedStillChecked = await page.evaluate(() => {
    const b = Array.from(
      document.querySelectorAll("button[role='switch']"),
    ).find((x) =>
      (x.getAttribute("aria-label") ?? "").startsWith("Wednesday"),
    );
    return b?.getAttribute("aria-checked") === "true";
  });
  if (!wedStillChecked) exitCode = 1;
  report.push({
    phase: "min-one-day-guard",
    lsStillOne,
    wedStillChecked,
  });

  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.close();
}

writeFileSync(
  resolve(OUT_DIR, "probe-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

await browser.close();
process.exit(exitCode);
