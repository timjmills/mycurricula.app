// scripts/probe-lane-dc-settings-clock.mjs — Lane DC verification probe.
//
// Audit major F#5: the Clock must render on /settings/* routes (the
// planner top-bar isn't mounted there). This probe loads the dev
// server, signs in via the Claude bypass, and screenshots each of the
// five settings routes at three viewport tiers (360 / 768 / 1280),
// while also checking:
//   • Clock chip is present in the DOM ([role="status"][title*="date"])
//   • Document does not horizontally overflow at any tier
//   • No console hydration warnings
//
// Output:
//   docs/screenshots/lane-dc-settings-clock/<route>__<tier>.png

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-dc-settings-clock");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const ROUTES = [
  { name: "settings-landing", url: "/settings" },
  { name: "settings-curriculum", url: "/settings/curriculum" },
  { name: "settings-appearance", url: "/settings/appearance" },
  { name: "settings-catch-up", url: "/settings/catch-up" },
  { name: "settings-lesson-templates", url: "/settings/lesson-templates" },
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Bootstrap via the bypass cookie endpoint.
const bootstrap = await context.newPage();
await bootstrap.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await bootstrap.waitForTimeout(1500);
// Warm-up each route so dev-mode compile lag doesn't trip timeouts later.
for (const r of ROUTES) {
  await bootstrap.goto(`${BASE}${r.url}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await bootstrap.waitForTimeout(600);
}
await bootstrap.close();

let exitCode = 0;
const report = [];

for (const tier of TIERS) {
  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleMessages = [];
    page.on("console", (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.goto(`${BASE}${route.url}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    // Allow landing redirect to resolve.
    if (route.url === "/settings") {
      for (let i = 0; i < 40; i++) {
        const u = new URL(page.url());
        if (/\/settings\/[a-z-]+$/.test(u.pathname)) break;
        await page.waitForTimeout(150);
      }
    }
    await page.waitForSelector("nav[aria-label='Settings sections']", {
      timeout: 30000,
    });
    await page.waitForTimeout(800); // give Clock time to hydrate

    // Clock detection — the chip is role="status" with title text
    // containing "date and time".
    const clockInfo = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('[role="status"]'),
      );
      const clock = nodes.find((n) =>
        /date and time/i.test(n.getAttribute("title") ?? ""),
      );
      if (!clock) return { present: false };
      const rect = clock.getBoundingClientRect();
      return {
        present: true,
        text: clock.textContent?.trim() ?? "",
        rect: {
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });

    const dims = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    const overflowsViewport =
      dims.docScrollWidth > tier.width + 1 ||
      dims.bodyScrollWidth > tier.width + 1;
    if (overflowsViewport) exitCode = 1;
    if (!clockInfo.present) exitCode = 1;

    const hydrationWarnings = consoleMessages.filter((m) =>
      /hydration|did not match|mismatch/i.test(m.text),
    );
    if (hydrationWarnings.length > 0) exitCode = 1;

    const screenshotPath = resolve(
      OUT_DIR,
      `${route.name}__${tier.name}-${tier.width}x${tier.height}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });

    report.push({
      tier: tier.name,
      route: route.name,
      requestedUrl: route.url,
      finalUrl: page.url(),
      viewport: `${tier.width}x${tier.height}`,
      clock: clockInfo,
      overflowsViewport,
      dims,
      hydrationWarningCount: hydrationWarnings.length,
      screenshot: screenshotPath,
    });

    await page.close();
  }
}

writeFileSync(
  resolve(OUT_DIR, "probe-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

await browser.close();
process.exit(exitCode);
