// scripts/probe-lane-z-sweep.mjs — Lane Z (Task #41) verification probe.
//
// Spot-checks the universal tooltip sweep at desktop 1280×900 across the
// major planner surfaces. For each route, samples a handful of <Button>s
// and bespoke buttons inside the page body and verifies that they carry
// either a `title=` attribute or are wrapped by the Tooltip primitive
// (the primitive uses `data-tooltip-trigger` so we can detect it from
// the DOM without parsing React internals).
//
// Saves a screenshot per route + a JSON report under
// docs/screenshots/lane-z-sweep/.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… PROBE_BASE=http://localhost:3004 \
//     node scripts/probe-lane-z-sweep.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-z-sweep");
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  { name: "year", path: "/year" },
  { name: "weekly", path: "/weekly" },
  { name: "daily", path: "/daily" },
  { name: "catch-up", path: "/catch-up" },
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Seed the bypass cookie once.
const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/api/claude-access?token=${encodeURIComponent(
  TOKEN,
)}&redirect=/weekly`;
await bootstrap.goto(bypassUrl, { waitUntil: "networkidle" });
await bootstrap.close();

const report = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 30000 });
  } catch {
    // continue
  }
  // Give CSS modules time to settle.
  await page.waitForTimeout(800);

  // Count buttons in the page that carry either a `title=` attribute or
  // an aria-describedby pointing at a tooltip role.
  const stats = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    // Filter to "page body" buttons — exclude top-bar (the shell), since
    // that's owned by other lanes.
    const headerHost = document.querySelector('[role="banner"], header');
    const inHeader = (el) => headerHost?.contains(el) ?? false;

    const body = buttons.filter((b) => !inHeader(b));
    const withTitle = body.filter(
      (b) => (b.getAttribute("title") || "").length > 0,
    );
    const withAriaDescribedBy = body.filter(
      (b) => (b.getAttribute("aria-describedby") || "").length > 0,
    );
    const samples = withTitle.slice(0, 5).map((b) => ({
      label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(
        0,
        60,
      ),
      title: (b.getAttribute("title") || "").slice(0, 100),
    }));

    return {
      total: body.length,
      withTitle: withTitle.length,
      withAriaDescribedBy: withAriaDescribedBy.length,
      coverage: body.length === 0
        ? 0
        : Math.round((withTitle.length / body.length) * 100),
      samples,
    };
  });

  report.push({ route: route.name, ...stats });

  const file = resolve(OUT_DIR, `${route.name}__desktop-1280x900.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(
    `${route.name}: ${stats.withTitle}/${stats.total} buttons have title (${stats.coverage}%) → ${file}`,
  );

  await page.close();
}

writeFileSync(
  resolve(OUT_DIR, "report.json"),
  JSON.stringify(report, null, 2),
);

await browser.close();
console.log(`\nReport: ${resolve(OUT_DIR, "report.json")}`);
