// scripts/probe-lane-dd-schedule-global.mjs — Lane DD audit probe.
//
// Verifies the Schedule trigger appears in the GlobalRail on every primary
// planner route AND that clicking it opens the SchedulePanel side-drawer
// on each one. Audit F#8 — Schedule unreachable except from /daily.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required");
  process.exit(2);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "docs/screenshots/lane-dd-schedule-global");
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { path: "/weekly", id: "weekly" },
  { path: "/daily", id: "daily" },
  { path: "/year", id: "year" },
  { path: "/catch-up", id: "catch-up" },
  { path: "/subject/math", id: "subject-math" },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

let pass = 0;
let fail = 0;
const failures = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(800);

    // Look for the Schedule trigger button (aria-label "Open schedule panel"
    // when closed). The GlobalRail nav exposes it as an icon Button.
    const triggerVisible = await page.evaluate(() => {
      const btn = document.querySelector(
        'button[aria-label^="Open schedule panel"]',
      );
      if (!btn) return { found: false };
      const r = btn.getBoundingClientRect();
      return {
        found: true,
        ariaLabel: btn.getAttribute("aria-label"),
        ariaPressed: btn.getAttribute("aria-pressed"),
        visible: r.width > 0 && r.height > 0,
      };
    });

    if (!triggerVisible.found || !triggerVisible.visible) {
      fail += 1;
      failures.push(`${route.path}: trigger NOT visible (${JSON.stringify(triggerVisible)})`);
      await page.screenshot({
        path: resolve(OUT, `${route.id}__no-trigger.png`),
      });
      await page.close();
      continue;
    }

    // Click the trigger — should open the drawer.
    await page.click('button[aria-label^="Open schedule panel"]');
    await page.waitForTimeout(500);

    // Verify the drawer (role="dialog" aria-modal="true") is mounted + visible.
    const drawerOpen = await page.evaluate(() => {
      const dialog = document.querySelector(
        'div[role="dialog"][aria-modal="true"]',
      );
      if (!dialog) return { found: false };
      const r = dialog.getBoundingClientRect();
      return {
        found: true,
        visible: r.width > 0 && r.height > 0,
        width: r.width,
        height: r.height,
      };
    });

    // Also verify aria-pressed flipped on the trigger.
    const triggerPressed = await page.evaluate(() => {
      const btn = document.querySelector(
        'button[aria-label^="Close schedule panel"], button[aria-label^="Open schedule panel"]',
      );
      return btn?.getAttribute("aria-pressed");
    });

    const screenshot = resolve(OUT, `${route.id}__open.png`);
    await page.screenshot({ path: screenshot, fullPage: false });

    if (drawerOpen.found && drawerOpen.visible && triggerPressed === "true") {
      pass += 1;
      console.log(
        `[PASS] ${route.path} — trigger visible, drawer ${Math.round(drawerOpen.width)}×${Math.round(drawerOpen.height)}, aria-pressed=true`,
      );
    } else {
      fail += 1;
      failures.push(
        `${route.path}: drawer didn't open. drawer=${JSON.stringify(drawerOpen)} pressed=${triggerPressed}`,
      );
    }

    // Verify there is EXACTLY ONE SchedulePanel mount in the DOM.
    const dialogCount = await page.evaluate(() => {
      return document.querySelectorAll('div[role="dialog"][aria-modal="true"]')
        .length;
    });
    if (dialogCount > 1) {
      fail += 1;
      failures.push(`${route.path}: ${dialogCount} dialog mounts (duplicate)`);
    }
  } catch (e) {
    fail += 1;
    failures.push(`${route.path}: threw ${e.message}`);
  }
  await page.close();
}

await browser.close();

console.log(`\nResult: ${pass} pass / ${fail} fail`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  -", f);
  process.exit(1);
}
process.exit(0);
