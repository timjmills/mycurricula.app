// scripts/probe-rails-drag.mjs — Wave 1.5 Lane FA verification probe.
//
// Boots Chromium against the local dev server, signs in via the Claude
// bypass cookie-redirect endpoint, and verifies that:
//   1. Both icon rails are present on every planner route.
//   2. Default layout: every icon on the LEFT rail, RIGHT rail shows the
//      "Drag icons here" empty-state hint.
//   3. Simulating a drag of an icon from LEFT → RIGHT via direct
//      localStorage write + reload causes the icon to render on the
//      RIGHT rail after the reload (verifying persistence).
//   4. Reverting localStorage back to defaults restores the original
//      arrangement.
//   5. The bottom-pinned settings slot still renders on the left rail
//      when settings is on that side.
//
// Usage:
//   $env:CLAUDE_BYPASS_TOKEN='…'; node scripts/probe-rails-drag.mjs
//
// Saves a screenshot of /weekly with one icon moved to the right rail
// under docs/screenshots/rails-drag/.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3002";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/rails-drag");
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = ["/weekly", "/daily", "/year", "/subject"];

const browser = await chromium.launch();
const context = await browser.newContext();

// Bootstrap session cookie.
const bootstrap = await context.newPage();
await bootstrap.goto(
  `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`,
  { waitUntil: "networkidle" },
);
await bootstrap.close();

let exitCode = 0;

function logHeading(s) {
  console.log("\n=== " + s + " ===");
}

// --------------------------------------------------------------------------
// Test 1 — Both rails present on every planner route, default layout
// --------------------------------------------------------------------------

logHeading("Test 1 — Both rails present (default layout)");

for (const route of ROUTES) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);

  const leftRail = await page.locator('nav[aria-label*="navigation"]').first();
  const rightRail = await page.locator('nav[aria-label*="right rail"]');
  const leftPresent = (await leftRail.count()) > 0;
  const rightPresent = (await rightRail.count()) > 0;
  const leftIcons = await page
    .locator(
      'nav[aria-label*="navigation"]:not([aria-label*="right"]) [data-rail-icon]',
    )
    .count();
  const rightIcons = await page
    .locator('nav[aria-label*="right rail"] [data-rail-icon]')
    .count();
  const emptyHint = await page
    .locator('nav[aria-label*="right rail"]')
    .innerText()
    .catch(() => "");

  console.log(
    `  ${route.padEnd(10)} left=${leftPresent}(${leftIcons} icons) right=${rightPresent}(${rightIcons} icons) emptyHint="${emptyHint.replace(/\s+/g, " ").trim()}"`,
  );

  if (!leftPresent || !rightPresent) {
    console.log("    FAIL — rail missing");
    exitCode = 1;
  }
  if (leftIcons === 0) {
    console.log("    FAIL — left rail has no icons");
    exitCode = 1;
  }

  await page.close();
}

// --------------------------------------------------------------------------
// Test 2 — Simulate moving an icon (write localStorage) and verify it
// renders on the RIGHT rail after reload.
// --------------------------------------------------------------------------

logHeading(
  "Test 2 — Move `todos` from LEFT → RIGHT via localStorage, reload, verify",
);

const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);

// Capture default state — screenshot
await page.screenshot({
  path: resolve(OUT_DIR, "01-default.png"),
  fullPage: false,
});

// Write a custom arrangement to localStorage.
await page.evaluate(() => {
  const layout = {
    left: [
      "today",
      "schedule",
      "comments",
      "resources",
      "year",
      "voice",
      "settings",
    ],
    right: ["todos"],
    hidden: [],
  };
  window.localStorage.setItem(
    "mycurricula:user:rail-layout",
    JSON.stringify(layout),
  );
});

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const leftIconIds = await page
  .locator(
    'nav[aria-label*="navigation"]:not([aria-label*="right"]) [data-rail-icon]',
  )
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-rail-icon")));

const rightIconIds = await page
  .locator('nav[aria-label*="right rail"] [data-rail-icon]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-rail-icon")));

console.log("  left icons after reload:  " + JSON.stringify(leftIconIds));
console.log("  right icons after reload: " + JSON.stringify(rightIconIds));

if (!rightIconIds.includes("todos")) {
  console.log("    FAIL — `todos` did not appear on right rail");
  exitCode = 1;
} else {
  console.log("    PASS — `todos` persisted to right rail across reload");
}
if (leftIconIds.includes("todos")) {
  console.log("    FAIL — `todos` still on left rail after move");
  exitCode = 1;
}

// Snapshot the moved state.
await page.screenshot({
  path: resolve(OUT_DIR, "02-todos-on-right.png"),
  fullPage: false,
});

// --------------------------------------------------------------------------
// Test 3 — Click semantics still work after the layout change
// (the moved Todos button on the right rail should still toggle the panel).
// --------------------------------------------------------------------------

logHeading("Test 3 — Click semantics preserved on moved icon");

// Click the Todos button (now on the right rail).
const todosBtnOnRight = page.locator(
  'nav[aria-label*="right rail"] [data-rail-icon="todos"] button',
);
const btnCount = await todosBtnOnRight.count();
console.log("  Todos button on right rail count:", btnCount);

if (btnCount > 0) {
  await todosBtnOnRight.first().click();
  await page.waitForTimeout(300);
  // The todo right-side panel should be open now.
  const todoPanelVisible = await page
    .locator('[aria-label="To-do list"]')
    .isVisible()
    .catch(() => false);
  console.log("  After click: to-do panel visible? " + todoPanelVisible);
  if (!todoPanelVisible) {
    console.log("    FAIL — clicking moved Todos button did not open panel");
    exitCode = 1;
  } else {
    console.log("    PASS — onClick behavior preserved across rails");
  }
  // Close it.
  await todosBtnOnRight.first().click();
  await page.waitForTimeout(200);
}

// --------------------------------------------------------------------------
// Test 4 — Move it back, settings still bottom-pinned
// --------------------------------------------------------------------------

logHeading("Test 4 — Reset to defaults, verify bottom-pinned settings");

await page.evaluate(() => {
  window.localStorage.removeItem("mycurricula:user:rail-layout");
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);

const settingsInBottom = await page
  .locator('[data-rail-pinned="true"] [data-rail-icon="settings"]')
  .count();
console.log("  settings icon in bottom-pinned slot: " + settingsInBottom);
if (settingsInBottom === 0) {
  console.log("    FAIL — settings missing from bottom-pinned slot");
  exitCode = 1;
} else {
  console.log("    PASS — settings still pinned at the bottom of left rail");
}

await page.screenshot({
  path: resolve(OUT_DIR, "03-reset-default.png"),
  fullPage: false,
});

// --------------------------------------------------------------------------
// Test 4b — Hidden bucket: write a layout that hides an icon, verify it
// renders on neither rail.
// --------------------------------------------------------------------------

logHeading("Test 4b — Hide an icon (move to `hidden` side)");

await page.evaluate(() => {
  const layout = {
    left: [
      "today",
      "schedule",
      "todos",
      "comments",
      "resources",
      "year",
      "settings",
    ],
    right: [],
    hidden: ["voice"],
  };
  window.localStorage.setItem(
    "mycurricula:user:rail-layout",
    JSON.stringify(layout),
  );
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const leftAfterHide = await page
  .locator(
    'nav[aria-label*="navigation"]:not([aria-label*="right"]) [data-rail-icon]',
  )
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-rail-icon")));
const rightAfterHide = await page
  .locator('nav[aria-label*="right rail"] [data-rail-icon]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-rail-icon")));
console.log("  left ids after hide:  " + JSON.stringify(leftAfterHide));
console.log("  right ids after hide: " + JSON.stringify(rightAfterHide));
if (leftAfterHide.includes("voice") || rightAfterHide.includes("voice")) {
  console.log("    FAIL — `voice` should be hidden but appears in a rail");
  exitCode = 1;
} else {
  console.log("    PASS — `voice` correctly hidden from both rails");
}

// --------------------------------------------------------------------------
// Test 4c — Right-click on an icon opens the RailContextMenu
// --------------------------------------------------------------------------

logHeading("Test 4c — Right-click opens context menu");

// Reset to defaults so the test is deterministic.
await page.evaluate(() => {
  window.localStorage.removeItem("mycurricula:user:rail-layout");
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

const todayLi = page.locator(
  'nav[aria-label*="navigation"]:not([aria-label*="right"]) [data-rail-icon="today"]',
);
const todayCount = await todayLi.count();
console.log("  today icon count:", todayCount);
if (todayCount > 0) {
  // Right-click the icon's li.
  await todayLi.first().click({ button: "right" });
  await page.waitForTimeout(300);
  const menuVisible = await page
    .locator('[role="menu"][aria-label*="placement" i]')
    .isVisible()
    .catch(() => false);
  console.log("  context menu visible after right-click: " + menuVisible);
  if (!menuVisible) {
    console.log("    FAIL — context menu did not appear");
    exitCode = 1;
  } else {
    console.log("    PASS — context menu opened");
    // Find the "Move to right rail" item and click it.
    const moveRight = page.locator(
      '[role="menuitem"]:has-text("Move to right rail")',
    );
    if ((await moveRight.count()) > 0 && (await moveRight.isEnabled())) {
      await moveRight.click();
      await page.waitForTimeout(400);
      const rightHasToday = await page
        .locator('nav[aria-label*="right rail"] [data-rail-icon="today"]')
        .count();
      console.log(
        "  after picking move-to-right, today on right? " + (rightHasToday > 0),
      );
      if (rightHasToday === 0) {
        console.log("    FAIL — menu pick did not move icon");
        exitCode = 1;
      } else {
        console.log("    PASS — context-menu action moved the icon");
      }
    } else {
      console.log("    FAIL — Move-to-right menu item not found");
      exitCode = 1;
    }
  }
}

// --------------------------------------------------------------------------
// Test 5 — Empty-state hint visible when right rail is empty
// --------------------------------------------------------------------------

logHeading("Test 5 — Empty-state hint visible by default");

// Reset to defaults first so the right rail is empty.
await page.evaluate(() => {
  window.localStorage.removeItem("mycurricula:user:rail-layout");
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

const hintText = await page
  .locator('nav[aria-label*="right rail"]')
  .innerText();
console.log("  right rail text: " + JSON.stringify(hintText));
if (!hintText.toLowerCase().includes("drag icons here")) {
  console.log("    FAIL — empty-state hint not visible");
  exitCode = 1;
} else {
  console.log("    PASS — empty-state hint visible");
}

// --------------------------------------------------------------------------
// Final screenshot — show a non-default arrangement for the report.
// --------------------------------------------------------------------------

logHeading("Final screenshot");
await page.evaluate(() => {
  const layout = {
    left: ["today", "schedule", "comments", "resources", "settings"],
    right: ["todos", "year"],
    hidden: ["voice"],
  };
  window.localStorage.setItem(
    "mycurricula:user:rail-layout",
    JSON.stringify(layout),
  );
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.screenshot({
  path: resolve(OUT_DIR, "04-final-arrangement.png"),
  fullPage: false,
});
console.log(
  "  saved screenshot showing left=[today,schedule,comments,resources,settings] right=[todos,year] hidden=[voice]",
);

await page.close();
await browser.close();

console.log("\nexit code: " + exitCode);
process.exit(exitCode);
