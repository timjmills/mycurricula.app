// scripts/snap-teach.mjs — preview-screenshot harness for the /teach route.
//
// LOCAL-ONLY. Captures the composed Teach workspace at three viewport tiers
// in both center modes (board grid + full-bleed resource canvas), plus an
// optional Present-mode shot. Requires `next dev` running on :3000.
//
// AUTH: /teach is gated by the Supabase auth middleware. To run this against
// a local dev server with no Supabase configured, temporarily make the route
// reachable — either authenticate via the Claude bypass (CLAUDE_BYPASS_TOKEN
// + a real Supabase), or, for a throwaway local preview, temporarily add
// "/teach" to PUBLIC_PATHS in lib/supabase/middleware.ts and REVERT it before
// committing. NEVER commit that gate edit — it would expose the route on the
// remote.
//
// Output → docs/screenshots/teach-preview/*.png
//
// Usage:  node scripts/snap-teach.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../docs/screenshots/teach-preview");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";
const WIDTHS = [1280, 768, 390];
const report = [];

function attachConsole(page, tag) {
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`  [console:${t}] (${tag}) ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`  [pageerror] (${tag}) ${err.message}`);
  });
}

async function settle(page, ms = 1500) {
  await page.waitForTimeout(ms);
}

const browser = await chromium.launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
  });

  // ── Board mode ────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();
    attachConsole(page, `board@${width}`);
    let status = "ok";
    try {
      await page.goto(`${BASE}/teach`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      // Wait for the workspace shell to mount.
      await page
        .getByText(/Teach|Resources|Boards/i)
        .first()
        .waitFor({ timeout: 30000 })
        .catch(() => {});
      await settle(page);
      const boardVisible = await page
        .locator(
          '[class*="boardGrid" i], [class*="cellGrid" i], [class*="widget" i]',
        )
        .first()
        .isVisible()
        .catch(() => false);
      const railVisible = (await page.getByLabel(/Right panel/i).count()) > 0;
      const lessonsVisible = await page
        .getByText(/Equivalent fractions warm-up/i)
        .first()
        .isVisible()
        .catch(() => false);
      status = `boardWidgets=${boardVisible} rightRail=${railVisible} lessonList=${lessonsVisible}`;
      const file = `${OUT}/board__${width}.png`;
      await page.screenshot({ path: file, fullPage: true });
      report.push({ shot: `board__${width}.png`, status });
    } catch (err) {
      report.push({
        shot: `board__${width}.png`,
        status: `FAILED: ${err.message}`,
      });
    }
    await page.close();
  }

  // ── Resource mode (click the magnify affordance on the first resource) ──────
  {
    const page = await ctx.newPage();
    attachConsole(page, `resource@${width}`);
    try {
      await page.goto(`${BASE}/teach`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await settle(page, 2000);

      // On phone/tablet the right panel may be collapsed; open the Resources
      // module if a toggle exists. Try clicking a "Resources" tab/control.
      const resourcesTab = page
        .getByRole("tab", { name: /resources/i })
        .first();
      if (await resourcesTab.isVisible().catch(() => false)) {
        await resourcesTab.click().catch(() => {});
        await settle(page, 600);
      }

      // The magnify button on lesson m-12-0's first resource ("Fraction Basics")
      // is labelled "Open Fraction Basics large". Fall back to any "Open … large".
      let magnify = page
        .getByRole("button", { name: /Open .* large/i })
        .first();
      if (!(await magnify.isVisible().catch(() => false))) {
        // Hover the first resource card to surface the hover-only affordance.
        const card = page.locator('[class*="card"]').first();
        await card.hover().catch(() => {});
        await settle(page, 400);
        magnify = page.getByRole("button", { name: /Open .* large/i }).first();
      }

      let clicked = false;
      if (await magnify.isVisible().catch(() => false)) {
        await magnify.click({ force: true }).catch(() => {});
        clicked = true;
      }
      await settle(page, 2000);

      const canvasVisible = await page
        .locator('[class*="resourceCanvas"], [class*="resourceStage"], iframe')
        .first()
        .isVisible()
        .catch(() => false);
      const status = clicked
        ? `magnifyClicked=true canvas=${canvasVisible}`
        : `magnifyClicked=false (button not found)`;
      const file = `${OUT}/resource__${width}.png`;
      await page.screenshot({ path: file, fullPage: true });
      report.push({ shot: `resource__${width}.png`, status });
    } catch (err) {
      report.push({
        shot: `resource__${width}.png`,
        status: `FAILED: ${err.message}`,
      });
    }
    await page.close();
  }

  await ctx.close();
}

// ── Present mode @1280 (optional) ────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  attachConsole(page, "present@1280");
  try {
    await page.goto(`${BASE}/teach`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await settle(page, 2000);
    const present = page.getByRole("button", { name: /present/i }).first();
    let clicked = false;
    if (await present.isVisible().catch(() => false)) {
      await present.click().catch(() => {});
      clicked = true;
    } else {
      // Fall back to the keyboard shortcut.
      await page.keyboard.press("Meta+p").catch(() => {});
      clicked = true;
    }
    await settle(page, 1800);
    const file = `${OUT}/present__1280.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.push({
      shot: "present__1280.png",
      status: `presentTriggered=${clicked}`,
    });
  } catch (err) {
    report.push({
      shot: "present__1280.png",
      status: `FAILED: ${err.message}`,
    });
  }
  await page.close();
  await ctx.close();
}

await browser.close();

console.log("\n=== SCREENSHOT REPORT ===");
for (const r of report) console.log(`${r.shot}\t${r.status}`);
