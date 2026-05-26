// scripts/probe-lane-cb-settings.mjs — Lane CB verification probe.
//
// Boots Chromium against the local dev server, signs in via the Claude
// bypass cookie-redirect endpoint, and probes the LeftFilterPanel
// Settings link at three viewport widths (360 / 768 / 1280). Reports:
//   • whether the Settings link is present + visible
//   • its bounding box (used to confirm ≥44×44 hit target via ::before)
//   • its href
//   • the panel itself's display state (the panel is display:none ≤900px)
//   • full-viewport screenshot for visual review
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… PROBE_BASE=http://localhost:3001 node scripts/probe-lane-cb-settings.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Pull CLAUDE_BYPASS_TOKEN from .env.local if not already in the
// process env — saves the caller having to inline the secret.
loadEnv({ path: ".env.local" });

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required (set in .env.local).");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3001";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-cb-settings");
mkdirSync(OUT_DIR, { recursive: true });

// Three responsive tiers per CLAUDE.md §4 (phone/tablet/desktop).
// The LeftFilterPanel renders on every planner route except /daily* and
// at ≤900px viewports (display:none in the module CSS). We exercise
// both /weekly (the canonical case where the panel is open by default)
// and /subject (where SubjectView intentionally auto-closes the panel
// on mount, so we have to expand it via the top-bar toggle first).
const TIERS = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const ROUTES = ["/weekly", "/subject"];

const browser = await chromium.launch();
const context = await browser.newContext();

// We use the `?claude=<TOKEN>` URL-param convention on every navigation
// (lib/claude-bypass.ts handles this in middleware). No separate
// cookie-bootstrap step needed — every probe URL carries the token.
const TOK = encodeURIComponent(TOKEN);

let exitCode = 0;
const report = [];

for (const route of ROUTES) {
  for (const tier of TIERS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.goto(`${BASE}${route}?claude=${TOK}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000, // first dev-compile can take 20–30s per route.
    });
    await page.waitForTimeout(2000); // let the panel + hydration settle.

    // SubjectView intentionally closes the left filter panel on mount
    // (components/subject/SubjectView.tsx ~line 986). To verify the
    // Settings affordance Lane CB adds INSIDE the panel header we have
    // to expand the panel first on /subject — the top-bar Collapse/
    // Expand toggle owns that. On /weekly the panel is open by default,
    // so the toggle isn't needed but the click is a safe no-op (it
    // will only find the "Expand filter panel" button when the panel
    // is actually collapsed).
    // The panel only shows ≥901px (CSS .panel @ ≤900 → display:none),
    // so we skip the toggle on phone/tablet — the panel never appears
    // there even when leftPanelOpen is true.
    if (tier.width > 900) {
      const toggle = page
        .locator('button[aria-label="Expand filter panel"]')
        .first();
      if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
        await toggle.click();
        await page.waitForTimeout(400);
      }
    }

    // Locate the LeftFilterPanel aside + Settings link.
    const panel = page.locator('aside[aria-label="Filters"]').first();
    const panelCount = await panel.count();
    let panelVisible = false;
    let panelBox = null;
    if (panelCount > 0) {
      panelVisible = await panel.isVisible().catch(() => false);
      if (panelVisible) {
        panelBox = await panel.boundingBox();
      }
    }

    const settingsLink = page.locator(
      'aside[aria-label="Filters"] a[aria-label="Settings"]',
    ).first();
    const linkCount = await settingsLink.count();
    let linkVisible = false;
    let linkBox = null;
    let href = null;
    if (linkCount > 0) {
      linkVisible = await settingsLink.isVisible().catch(() => false);
      href = await settingsLink.getAttribute("href").catch(() => null);
      if (linkVisible) {
        linkBox = await settingsLink.boundingBox();
      }
    }

    // Document-level horizontal scroll guard (CLAUDE.md §4).
    const docScrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const horizScroll = docScrollWidth > tier.width + 1;
    if (horizScroll) exitCode = 1;

    // Tier-specific expectations:
    //   • phone (360) + tablet (768): panel display:none — link should NOT
    //     be visible (panel is suppressed below 900px per existing CSS).
    //   • desktop (1280): link must be visible, href must be /settings,
    //     and the visible/hit box must satisfy ≥44 via ::before inflation
    //     (the bounding box of the <a> itself will be smaller, but the
    //     pseudo-element provides the pointer surface — we can't directly
    //     measure it via boundingBox, so we sanity-check by clicking the
    //     center of the visible label and confirming navigation).
    const expectedVisible = tier.width > 900;
    if (linkVisible !== expectedVisible) {
      console.warn(
        `  EXPECTATION MISMATCH: ${route} @ ${tier.name} — link visible=${linkVisible}, expected=${expectedVisible}`,
      );
      exitCode = 1;
    }

    // Take the verification screenshot FIRST — with the panel still
    // expanded and the Settings link visible — so the artifact in the
    // PR shows what a teacher will actually see. Then click the link
    // to confirm navigation; SubjectView re-closes the panel on
    // re-mount, so a click-then-screenshot order would hide the link.
    const safeRoute = route.replace(/[\/]/g, "_") || "_root";
    const screenshotPath = resolve(
      OUT_DIR,
      `${safeRoute}__${tier.name}__${tier.width}x${tier.height}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Also take a tight close-up of the filter-panel header on desktop
    // so the Settings affordance is unmistakable in the review artifact.
    if (tier.width > 900 && linkBox) {
      const closeupPath = resolve(
        OUT_DIR,
        `${safeRoute}__${tier.name}__header-closeup.png`,
      );
      await page.screenshot({
        path: closeupPath,
        clip: { x: 50, y: 45, width: 260, height: 70 },
      });
    }

    // On desktop (where the panel + link are visible), confirm the
    // link navigates to /settings by following it in a SECOND page —
    // that way the screenshot above stays untouched.
    let navigatedTo = null;
    if (expectedVisible && linkVisible) {
      const verifyPage = await context.newPage();
      await verifyPage.setViewportSize({ width: tier.width, height: tier.height });
      await verifyPage.goto(`${BASE}${route}?claude=${TOK}`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await verifyPage.waitForTimeout(2000);
      // Expand the panel first.
      const t = verifyPage
        .locator('button[aria-label="Expand filter panel"]')
        .first();
      if ((await t.count()) > 0 && (await t.isVisible())) {
        await t.click();
        await verifyPage.waitForTimeout(400);
      }
      const verifyLink = verifyPage
        .locator('aside[aria-label="Filters"] a[aria-label="Settings"]')
        .first();
      if (await verifyLink.isVisible()) {
        // Use Promise.all to capture the navigation triggered by the
        // anchor click; this gives a reliable URL even when /settings
        // does an internal redirect to /settings/curriculum.
        await Promise.all([
          verifyPage.waitForURL(/\/settings/, { timeout: 60000 }).catch(() => null),
          verifyLink.click(),
        ]);
        await verifyPage.waitForTimeout(500);
        navigatedTo = new URL(verifyPage.url()).pathname;
      }
      await verifyPage.close();
    }

    report.push({
      route,
      tier: tier.name,
      viewport: `${tier.width}x${tier.height}`,
      panelVisible,
      panelBox: panelBox
        ? { w: Math.round(panelBox.width), h: Math.round(panelBox.height) }
        : null,
      linkPresent: linkCount > 0,
      linkVisible,
      linkBox: linkBox
        ? {
            w: Math.round(linkBox.width),
            h: Math.round(linkBox.height),
            x: Math.round(linkBox.x),
            y: Math.round(linkBox.y),
          }
        : null,
      href,
      navigatedTo,
      docScrollWidth,
      horizScroll,
      screenshot: screenshotPath,
    });

    await page.close();
  }
}

await browser.close();

for (const r of report) {
  console.log(`\n=== ${r.route} @ ${r.tier} (${r.viewport}) ===`);
  console.log(
    `  panel: visible=${r.panelVisible} box=${
      r.panelBox ? `${r.panelBox.w}x${r.panelBox.h}` : "n/a"
    }`,
  );
  console.log(
    `  link : present=${r.linkPresent} visible=${r.linkVisible} href=${r.href}` +
      (r.linkBox
        ? ` box=${r.linkBox.w}x${r.linkBox.h} @(${r.linkBox.x},${r.linkBox.y})`
        : ""),
  );
  if (r.navigatedTo !== null) {
    console.log(`  nav  : click → ${r.navigatedTo}`);
  }
  console.log(
    `  scroll: docScrollWidth=${r.docScrollWidth} horizScroll=${r.horizScroll}`,
  );
  console.log(`  screenshot → ${r.screenshot}`);
}

console.log("\nexit code:", exitCode);
process.exit(exitCode);
