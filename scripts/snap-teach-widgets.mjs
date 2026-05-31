// scripts/snap-teach-widgets.mjs — preview harness for the Phase 3 interactive
// widget library + board backgrounds. LOCAL-ONLY; requires `next dev` on :3000
// and a TEMPORARY "/teach" entry in PUBLIC_PATHS (revert before committing).
//
// Captures each seeded board (Warm-Up / Guided Practice / Centers / Exit Ticket)
// at 1280 + 390, plus the board-settings background picker. Reports console
// errors and horizontal-scroll per shot.
//
// Output → docs/screenshots/teach-widgets/*.png   ·   Usage: node scripts/snap-teach-widgets.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../docs/screenshots/teach-widgets");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";
const report = [];
const browser = await chromium.launch();

async function settle(page, ms = 1200) {
  await page.waitForTimeout(ms);
}

async function shoot(page, name) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const horiz = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  report.push({ shot: name, horiz, errs: errs.length });
  return errs;
}

for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/teach`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await settle(page, 1800);
  await shoot(page, `01-default__${width}`);

  // Click each board pill by its title to surface the new widget mixes.
  for (const title of ["Guided Practice", "Centers", "Exit Ticket"]) {
    const pill = page
      .getByRole("tab", { name: new RegExp(title, "i") })
      .first();
    if (await pill.isVisible().catch(() => false)) {
      await pill.click().catch(() => {});
      await settle(page, 1300);
      await shoot(
        page,
        `${title.replace(/\s+/g, "-").toLowerCase()}__${width}`,
      );
    } else {
      report.push({
        shot: `${title}__${width}`,
        horiz: "n/a",
        errs: "pill-not-found",
      });
    }
  }

  // Open board settings (gear) → background picker, at desktop only.
  if (width === 1280) {
    const gear = page
      .getByRole("button", { name: /board settings|settings/i })
      .first();
    if (await gear.isVisible().catch(() => false)) {
      await gear.click().catch(() => {});
      await settle(page, 800);
      await shoot(page, `background-picker__${width}`);
    } else {
      report.push({
        shot: `background-picker`,
        horiz: "n/a",
        errs: "gear-not-found",
      });
    }
  }

  report.push({
    shot: `CONSOLE_ERRORS__${width}`,
    horiz: "",
    errs: errors.length,
  });
  if (errors.length)
    for (const e of errors.slice(0, 6)) console.log(`  [err@${width}] ${e}`);
  await page.close();
  await ctx.close();
}

await browser.close();
console.log("\n=== WIDGET SNAPSHOT REPORT ===");
for (const r of report)
  console.log(`${r.shot}\thoriz=${r.horiz}\terrs=${r.errs}`);
