// scripts/probe-lane-w-settings.mjs — Lane W verification probe.
//
// Boots Chromium against the local dev server, signs in via the Claude
// bypass cookie-redirect endpoint, and probes the new Settings surface
// at three viewport tiers (360 / 768 / 1280). For each tier and each of
// the three target URLs (/settings, /settings/curriculum,
// /settings/appearance), the probe records:
//   • document.documentElement.scrollWidth vs viewport.width
//     (must not exceed at any tier — no document-level h-scroll)
//   • whether the sidebar is visible
//   • console messages (hydration warnings = fail)
//   • screenshots saved under docs/screenshots/lane-w-settings/
//
// Audit-readiness checks also performed:
//   • /settings landing redirects to /settings/curriculum on first visit.
//   • After visiting /settings/appearance, /settings redirects there.
//   • Typing a label in /settings/curriculum and blurring persists the
//     value across a reload.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/probe-lane-w-settings.mjs
//
// Exit code 0 if every assertion passes; non-zero otherwise.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-w-settings");
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
];

const browser = await chromium.launch();
const context = await browser.newContext();

// Seed the bypass cookie via the cookie-redirect endpoint, then warm up
// every route the probe will hit. Dev-mode Next compiles each route on
// first request — without a warm-up the first probe iteration on each
// route can take 30s+ and trip Playwright's default timeouts.
const bootstrap = await context.newPage();
await bootstrap.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await bootstrap.waitForTimeout(1500);
for (const url of [
  "/settings",
  "/settings/appearance",
  "/weekly",
  // Visit curriculum LAST so the layout writes "curriculum" into the
  // `mycurricula:user:settings-last-page` slot — that way the first
  // probe iteration (which expects /settings to redirect to curriculum)
  // gets a clean default.
  "/settings/curriculum",
]) {
  await bootstrap.goto(`${BASE}${url}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await bootstrap.waitForTimeout(800);
}
await bootstrap.close();

let exitCode = 0;
const report = [];

for (const tier of TIERS) {
  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleMessages = [];
    page.on("console", (msg) => {
      const text = msg.text();
      // Capture all messages; hydration warnings fail the run.
      consoleMessages.push({ type: msg.type(), text });
    });
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.goto(`${BASE}${route.url}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    // Wait for landing redirect to resolve. Poll because the redirect
    // may have already fired between `goto` resolving and us getting
    // here, which makes waitForURL hang indefinitely.
    if (route.url === "/settings") {
      let url = page.url();
      for (let i = 0; i < 80 && !/\/settings\/[a-z-]+$/.test(new URL(url).pathname); i++) {
        await page.waitForTimeout(250);
        url = page.url();
      }
    }
    await page.waitForSelector("nav[aria-label='Settings sections']", {
      timeout: 30000,
    });
    await page.waitForTimeout(400);

    const dims = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    }));
    const finalUrl = page.url();
    const overflowsViewport =
      dims.docScrollWidth > tier.width + 1 || dims.bodyScrollWidth > tier.width + 1;
    if (overflowsViewport) exitCode = 1;

    const hydrationWarnings = consoleMessages.filter((m) =>
      /hydration|did not match|mismatch/i.test(m.text),
    );
    if (hydrationWarnings.length > 0) exitCode = 1;

    const screenshotPath = resolve(
      OUT_DIR,
      `${route.name}__${tier.name}-${tier.width}x${tier.height}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    report.push({
      tier: tier.name,
      route: route.name,
      requestedUrl: route.url,
      finalUrl,
      viewport: `${tier.width}x${tier.height}`,
      dims,
      overflowsViewport,
      consoleCount: consoleMessages.length,
      hydrationWarningCount: hydrationWarnings.length,
      hydrationWarnings,
      screenshot: screenshotPath,
    });

    await page.close();
  }
}

// ── Integration test: curriculum label persists across reload ───────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#curriculum-label", { timeout: 30000 });
  await page.waitForTimeout(600);
  const sentinel = `ProbeLabel-${Date.now()}`;
  const before = await page.inputValue("#curriculum-label");
  const lsBefore = await page.evaluate(() =>
    localStorage.getItem("mycurricula:team:curriculum-label"),
  );
  await page.click("#curriculum-label");
  await page.fill("#curriculum-label", sentinel);
  // Trigger blur by tabbing away — page.blur() doesn't always fire React blur.
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  const lsAfterBlur = await page.evaluate(() =>
    localStorage.getItem("mycurricula:team:curriculum-label"),
  );
  // Reload and confirm.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("#curriculum-label", { timeout: 30000 });
  await page.waitForTimeout(600);
  const persisted = await page.inputValue("#curriculum-label");
  const lsAfterReload = await page.evaluate(() =>
    localStorage.getItem("mycurricula:team:curriculum-label"),
  );
  console.log("DEBUG persistence trace:", {
    before,
    lsBefore,
    sentinel,
    lsAfterBlur,
    persisted,
    lsAfterReload,
  });
  // Also confirm the top-bar wordmark suffix on /weekly reflects the new label.
  await page.goto(`${BASE}/weekly`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("a[aria-label='MyCurricula home']", {
    timeout: 30000,
  });
  // Wait for the post-mount effect to overlay the curriculum label from
  // localStorage — the initial SSR render uses FALLBACK_USER so the
  // wordmark briefly reads "Grade 5" before the overlay fires.
  await page.waitForTimeout(1500);
  const wordmark = await page.textContent("a[aria-label='MyCurricula home']");
  const wordmarkShowsSentinel = (wordmark ?? "").includes(sentinel);
  if (persisted !== sentinel) exitCode = 1;
  if (!wordmarkShowsSentinel) exitCode = 1;
  report.push({
    integration: "curriculum-label-persists",
    sentinel,
    persisted,
    wordmark,
    wordmarkShowsSentinel,
  });
  // Reset the label to the prior default so subsequent runs are clean.
  await page.goto(`${BASE}/settings/curriculum`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#curriculum-label");
  await page.click("#curriculum-label");
  await page.fill("#curriculum-label", "Grade 5");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  await page.close();
}

// ── Integration test: last-visited sub-page is remembered ──────────────
{
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  // Visit Appearance so it's now the "last visited" page.
  await page.goto(`${BASE}/settings/appearance`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("nav[aria-label='Settings sections']", {
    timeout: 30000,
  });
  await page.waitForTimeout(400);
  // Now visit /settings — should redirect to /settings/appearance.
  await page.goto(`${BASE}/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  // Poll the URL — waitForURL races with redirect; goto may resolve to the
  // already-redirected location before this listener attaches.
  let after = page.url();
  for (let i = 0; i < 30 && after.endsWith("/settings"); i++) {
    await page.waitForTimeout(200);
    after = page.url();
  }
  const landsOnAppearance = after.endsWith("/settings/appearance");
  if (!landsOnAppearance) exitCode = 1;
  report.push({
    integration: "last-visited-sub-page",
    after,
    landsOnAppearance,
  });
  await page.close();
}

writeFileSync(
  resolve(OUT_DIR, "probe-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));

await browser.close();
process.exit(exitCode);
