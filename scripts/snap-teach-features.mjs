// scripts/snap-teach-features.mjs — per-feature review shots for the Phase 3
// interactive widget library + board backgrounds. LOCAL-ONLY; requires
// `next dev` on :3000 and a TEMPORARY "/teach" in PUBLIC_PATHS (revert before
// commit). Each widget tile is captured as an element screenshot (named by its
// header kicker), plus a few interactive "after" states and the three
// background-picker tabs.
//
// Output → docs/screenshots/teach-features/*.png   ·   Usage: node scripts/snap-teach-features.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../docs/screenshots/teach-features");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";
const settle = (p, ms = 600) => p.waitForTimeout(ms);
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const report = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
});
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/teach`, { waitUntil: "networkidle", timeout: 60000 });
await settle(page, 1800);

const seen = new Set();

/** The WidgetShell root for a kicker = nearest ancestor whose class contains
 *  the CSS-module `_tile__` chunk (tileHeader/tileBody don't match). */
function tileFor(kicker) {
  return page
    .getByText(kicker, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"_tile__")][1]');
}

async function captureBoard(boardTitle, interactions = {}) {
  const tab = page
    .getByRole("tab", { name: new RegExp(boardTitle, "i") })
    .first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click().catch(() => {});
    await settle(page, 1100);
  }
  // Kickers present on this board, in DOM order.
  const kickers = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[class*="kicker"]').forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t) out.push(t);
    });
    return [...new Set(out)];
  });
  for (const kicker of kickers) {
    if (seen.has(kicker)) continue;
    seen.add(kicker);
    const base = slug(kicker) || `widget-${seen.size}`;
    const tile = tileFor(kicker);
    if (!(await tile.count().catch(() => 0))) continue;
    await tile.scrollIntoViewIfNeeded().catch(() => {});
    await tile.hover().catch(() => {});
    await settle(page, 250);
    await tile.screenshot({ path: `${OUT}/${base}.png` }).catch(() => {});
    report.push(`${base}.png`);

    const fn = interactions[kicker];
    if (fn) {
      try {
        await fn(tile);
        await settle(page, 900);
        await tile.screenshot({ path: `${OUT}/${base}--active.png` });
        report.push(`${base}--active.png`);
      } catch {
        /* best-effort */
      }
    }
  }
}

const btn = (tile, name) =>
  tile.getByRole("button", { name }).first().click({ force: true });
const nth = (tile, i) => tile.getByRole("button").nth(i).click({ force: true });

await captureBoard("Warm-Up", {
  "VISUAL TIMER": (t) => btn(t, /start|play/i),
  AGENDA: (t) => nth(t, 0),
});
await captureBoard("Mini Lesson", {
  "NAME PICKER": (t) => btn(t, /shuffle|pick/i),
  "QUICK POLL": (t) => nth(t, 0),
});
await captureBoard("Guided Practice", {
  "TRAFFIC LIGHT": (t) => nth(t, 0),
  "WORK SYMBOLS": (t) => nth(t, 1),
  SCOREBOARD: (t) => btn(t, /\+|point|add/i),
});
await captureBoard("Centers", {
  DICE: (t) => btn(t, /roll/i),
  STOPWATCH: (t) => btn(t, /start|play/i),
});
await captureBoard("Exit Ticket", {});

// ── Background picker: open board settings, shoot each tab ───────────────────
const gear = page
  .getByRole("button", { name: /board settings|settings/i })
  .first();
if (await gear.isVisible().catch(() => false)) {
  await gear.click().catch(() => {});
  await settle(page, 700);
  const dialog = page.getByRole("dialog").first();
  for (const tabName of ["Colours", "Patterns", "Gradients"]) {
    const t = dialog
      .getByRole("tab", { name: new RegExp(tabName, "i") })
      .first();
    if (await t.isVisible().catch(() => false)) {
      await t.click().catch(() => {});
      await settle(page, 500);
      await dialog.screenshot({
        path: `${OUT}/background-${slug(tabName)}.png`,
      });
      report.push(`background-${slug(tabName)}.png`);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
}

await browser.close();
console.log("\n=== FEATURE SHOTS ===");
for (const r of report) console.log(r);
console.log(`\nconsole/page errors: ${errors.length}`);
if (errors.length)
  for (const e of errors.slice(0, 8)) console.log(`  [err] ${e}`);
