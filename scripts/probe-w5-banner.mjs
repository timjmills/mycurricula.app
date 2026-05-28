// scripts/probe-w5-banner.mjs — W5-E2 banner-at-360px probe.
//
// Loads /daily at 360x800, flips the top-bar Personal | Team-Curriculum
// toggle into Team Curriculum, waits for the master banner to settle into
// its persistent strip, then captures the viewport.
//
// Output:
//   docs/screenshots/uxa-2026-05-27/w5-e2-banner-360.png         (persistent)
//   docs/screenshots/uxa-2026-05-27/w5-e2-banner-360-headsup.png (heads-up)
//
// Also dumps the banner's measured rect so we can see whether it wraps.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

const OUT_DIR = path.resolve("docs/screenshots/uxa-2026-05-27");
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();

// Bootstrap auth
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1200);
await boot.close();

const page = await context.newPage();
await page.setViewportSize({ width: 360, height: 800 });
await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
console.log("Page URL:", page.url());
console.log("Page title:", await page.title());
const allBtnCount = await page.locator("button").count();
console.log("Total buttons:", allBtnCount);
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log("Body text (first 400 chars):", bodyText);

// Locate and click the Team Curriculum option in the edit-mode toggle.
// Use partial match — em-dash encoding can break exact-string CSS attr matches.
const teamBtn = page.locator(
  'button[aria-label^="Team Curriculum mode"]',
);
const cnt = await teamBtn.count();
console.log(`Team button matches: ${cnt}`);
if (cnt === 0) {
  // Dump all buttons for debugging.
  const all = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .map((b) => ({
        ariaLabel: b.getAttribute("aria-label"),
        text: (b.textContent ?? "").slice(0, 40),
      }))
      .filter((b) => b.ariaLabel?.includes("mode") || b.text?.includes("Team"))
  );
  console.log("Candidate buttons:", JSON.stringify(all, null, 2));
}
await teamBtn.first().waitFor({ state: "visible", timeout: 5000 });
await teamBtn.first().click();
// Move the mouse far from the toggle BEFORE the heads-up screenshot so the
// toggle's tooltip doesn't paint over the banner area (the original code
// only moved it before the persistent screenshot). Codex-gate finding W5-E2-L
// 2026-05-28.
await page.mouse.move(180, 600);
await page.waitForTimeout(400);

// Dump banner-related DOM for debugging
const post = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("*"));
  const matches = all
    .filter((el) => {
      const t = el.textContent ?? "";
      return t.includes("Heads up") && el.children.length < 10;
    })
    .slice(0, 5)
    .map((el) => ({
      tag: el.tagName,
      role: el.getAttribute("role"),
      cls: el.className?.toString().slice(0, 100),
      text: el.textContent?.slice(0, 80),
      visible: el.getBoundingClientRect().height > 0,
    }));
  return matches;
});
console.log("Banner candidates:", JSON.stringify(post, null, 2));

// Heads-up phase: capture immediately (within the 3s window).
await page.waitForTimeout(350);

const measureBanner = async (label) => {
  const m = await page.evaluate(() => {
    // Banner has text starting with "Heads up" — narrow to that element.
    const candidates = Array.from(
      document.querySelectorAll('[role="alert"], [role="status"]'),
    );
    const el = candidates.find((c) =>
      (c.textContent ?? "").includes("Heads up"),
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // Sanity-check: the banner is the high-consequence safety affordance.
    // If it's painted at 0px height or hidden, treat that as a probe
    // FAILURE — the test surface is broken.
    if (r.height === 0 || cs.display === "none" || cs.visibility === "hidden") {
      return { __broken: true, height: r.height, display: cs.display };
    }
    return {
      role: el.getAttribute("role"),
      text: el.textContent,
      width: Math.round(r.width),
      height: Math.round(r.height),
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      whiteSpace: cs.whiteSpace,
      // Look at the actual text-span height vs the icon's intrinsic 18/14
      // — a wrapped span ends up taller than a single-line one.
    };
  });
  console.log(`\n${label}:`, JSON.stringify(m, null, 2));
  if (m === null) {
    console.error(`FAIL: ${label} — no banner with "Heads up" text found.`);
    process.exit(1);
  }
  if (m.__broken) {
    console.error(`FAIL: ${label} — banner painted at height=${m.height}, display=${m.display}.`);
    process.exit(1);
  }
  return m;
};

await measureBanner("HEADS-UP phase");
await page.screenshot({
  path: path.join(OUT_DIR, "w5-e2-banner-360-headsup.png"),
  fullPage: false,
});

// Persistent phase — move the mouse far from any tooltip-triggering region
// so the screenshot shows the banner unobstructed by a hover popover.
await page.mouse.move(180, 600);
await page.waitForTimeout(400);
await page.waitForTimeout(3000);
await measureBanner("PERSISTENT phase");
await page.screenshot({
  path: path.join(OUT_DIR, "w5-e2-banner-360.png"),
  fullPage: false,
});

await browser.close();
console.log("\nScreenshots written to", OUT_DIR);
