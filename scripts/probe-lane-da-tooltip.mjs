// scripts/probe-lane-da-tooltip.mjs — Lane DA tooltip-finish verification.
//
// Probes tooltip coverage on /schedule and /settings/catch-up after
// Lane DA's sweep of the 5 files that Lane Z missed.

import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

const ROUTES = [
  { name: "schedule", path: "/schedule" },
  { name: "settings-catch-up", path: "/settings/catch-up" },
];

const browser = await chromium.launch();
const context = await browser.newContext();

const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/weekly?claude=${encodeURIComponent(TOKEN)}`;
await bootstrap.goto(bypassUrl, { waitUntil: "networkidle" });
await bootstrap.close();

for (const route of ROUTES) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  const url = `${BASE}${route.path}?claude=${encodeURIComponent(TOKEN)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 30000 });
  } catch {
    // continue
  }
  await page.waitForTimeout(800);

  const stats = await page.evaluate(() => {
    const headerHost = document.querySelector('[role="banner"], header');
    const inHeader = (el) => headerHost?.contains(el) ?? false;

    const buttons = Array.from(document.querySelectorAll("button"));
    const roleButtons = Array.from(
      document.querySelectorAll('[role="button"]'),
    );
    const all = [...buttons, ...roleButtons].filter((b) => !inHeader(b));

    const hasTooltip = (el) =>
      (el.getAttribute("title") || "").length > 0 ||
      (el.getAttribute("aria-describedby") || "").length > 0 ||
      el.hasAttribute("data-tooltip-trigger");

    const withTip = all.filter(hasTooltip);
    const missing = all.filter((el) => !hasTooltip(el));
    const missingDetails = missing.slice(0, 10).map((el) => ({
      tag: el.tagName,
      cls: (el.className || "").toString().slice(0, 60),
      label: (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .slice(0, 50),
    }));
    return {
      total: all.length,
      covered: withTip.length,
      missing: all.length - withTip.length,
      coverage: all.length ? (withTip.length / all.length) * 100 : 0,
      missingDetails,
    };
  });

  console.log(
    `${route.path.padEnd(28)} ${stats.covered}/${stats.total} (${stats.coverage.toFixed(0)}%)  missing=${stats.missing}`,
  );
  if (stats.missingDetails.length) {
    console.log("  Missing samples:");
    for (const d of stats.missingDetails) {
      console.log(`    - ${d.tag} .${d.cls} :: "${d.label}"`);
    }
  }
  await page.close();
}

await browser.close();
