// scripts/probe-uxa.mjs — per-wave responsive audit probe.
//
// Captures full-page screenshots of every primary route at three viewport
// tiers (360, 768, 1280) and reports per-route horizontal-scroll status.
// Output: docs/screenshots/uxa-2026-05-27/<wave>/<route>__<tier>.png
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/probe-uxa.mjs [wave]
//   wave defaults to "wave-0-baseline"

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const WAVE = process.argv[2] ?? "wave-0-baseline";

const OUT_DIR = path.resolve(
  "docs/screenshots/uxa-2026-05-27",
  WAVE.replace(/[^a-zA-Z0-9_-]/g, "-"),
);

const ROUTES = [
  { slug: "weekly", path: "/weekly" },
  { slug: "daily", path: "/daily" },
  { slug: "year", path: "/year" },
  { slug: "subject", path: "/subject/math" },
  { slug: "schedule", path: "/schedule" },
  { slug: "catch-up", path: "/catch-up" },
  { slug: "settings-curriculum", path: "/settings/curriculum" },
];

const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();

// Bootstrap auth via the claude-login route so the bypass cookie is set
// on the context before any probed page loads.
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const results = [];

for (const route of ROUTES) {
  for (const tier of TIERS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: tier.width, height: tier.height });

    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") {
        consoleErrors.push(`console.error: ${m.text().slice(0, 200)}`);
      }
    });

    let loadErr = null;
    try {
      await page.goto(`${BASE}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(900);
    } catch (e) {
      loadErr = e.message;
    }

    const info = loadErr
      ? null
      : await page.evaluate(() => {
          const html = document.documentElement;
          const body = document.body;
          return {
            htmlScrollWidth: html.scrollWidth,
            htmlClientWidth: html.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            bodyClientWidth: body.clientWidth,
            hasHScroll:
              html.scrollWidth > html.clientWidth ||
              body.scrollWidth > body.clientWidth,
          };
        });

    const screenshotPath = path.join(OUT_DIR, `${route.slug}__${tier.name}.png`);
    if (!loadErr) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    results.push({
      route: route.path,
      tier: tier.name,
      width: tier.width,
      hasHScroll: info?.hasHScroll ?? null,
      htmlScrollWidth: info?.htmlScrollWidth ?? null,
      htmlClientWidth: info?.htmlClientWidth ?? null,
      consoleErrorCount: consoleErrors.length,
      loadErr,
      screenshot: loadErr ? null : screenshotPath,
    });

    await page.close();
  }
}

await browser.close();

// Report
const fmt = (v) => (v === null || v === undefined ? "—" : String(v));
console.log(`\nProbe wave: ${WAVE}`);
console.log(`Output dir: ${OUT_DIR}\n`);
console.log(
  "route".padEnd(28),
  "tier".padEnd(8),
  "hScroll".padEnd(8),
  "scrollW".padEnd(9),
  "clientW".padEnd(9),
  "errs".padEnd(5),
  "load",
);
console.log("-".repeat(80));
let hScrollHits = 0;
let loadErrs = 0;
for (const r of results) {
  if (r.hasHScroll) hScrollHits++;
  if (r.loadErr) loadErrs++;
  console.log(
    r.route.padEnd(28),
    r.tier.padEnd(8),
    fmt(r.hasHScroll).padEnd(8),
    fmt(r.htmlScrollWidth).padEnd(9),
    fmt(r.htmlClientWidth).padEnd(9),
    fmt(r.consoleErrorCount).padEnd(5),
    r.loadErr ? "FAIL" : "ok",
  );
}
console.log("\nSummary:");
console.log(`  screenshots: ${results.filter((r) => r.screenshot).length}`);
console.log(`  load errors: ${loadErrs}`);
console.log(`  hScroll hits: ${hScrollHits}`);
console.log("");
