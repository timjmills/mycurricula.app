// scripts/probe-card-panel.mjs — verify the Weekly card-click → lesson-panel flow.
//
// Desktop (1440px, inline-rail band):
//   1. Click a lesson card → chip expands AND the shell LessonDetailPanel mounts.
//   2. Click the same card's header again → chip collapses AND the panel closes.
//   3. Click card, then click empty canvas → chip collapses AND the panel closes.
//   4. Click card, press "Go to lesson" → navigates to /daily.
// Drawer band (1100px):
//   5. Click a card → WeeklyRailDrawer opens, shell panel does NOT double-mount.
//
// Usage:  node scripts/probe-card-panel.mjs   (reads CLAUDE_BYPASS_TOKEN from .env.local)

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
if (!token) {
  console.error("CLAUDE_BYPASS_TOKEN not found");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

let failures = 0;
function log(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const page = await context.newPage();

async function state() {
  return page.evaluate(() => {
    const panel = document.querySelector(
      '[role="complementary"][aria-label^="Lesson detail"]',
    );
    // The drawer renders role="dialog" (WeeklyRailDrawer).
    const drawer = document.querySelector('[role="dialog"]');
    // An expanded card's header band (div[role="button"]) is labeled
    // "Collapse lesson".
    const expanded = document.querySelectorAll(
      '[aria-label="Collapse lesson"]',
    );
    return {
      panelOpen: panel !== null,
      drawerOpen: drawer !== null,
      expandedCount: expanded.length,
      path: location.pathname,
    };
  });
}

// Click the card's header band (top strip), avoiding inner buttons.
async function clickCardHeader(card) {
  const box = await card.boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + 10);
}

// ── Desktop band (1440px) ──────────────────────────────────────────────────
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/weekly`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('[data-planner-item^="lesson:"]', {
  timeout: 30000,
});
await page.waitForTimeout(1000);

const card = page.locator('[data-planner-item^="lesson:"]').first();

// 1. Click → expand + panel.
await clickCardHeader(card);
await page.waitForTimeout(700);
let s = await state();
log(s.expandedCount === 1, `click expands the card (expanded=${s.expandedCount})`);
log(s.panelOpen, `click opens the lesson detail panel (panelOpen=${s.panelOpen})`);
await page.screenshot({
  path: "docs/screenshots/probe-card-panel-desktop-open.png",
});

// 2. Click the same header again → collapse + close.
await clickCardHeader(card);
await page.waitForTimeout(700);
s = await state();
log(
  s.expandedCount === 0,
  `second click collapses the card (expanded=${s.expandedCount})`,
);
log(!s.panelOpen, `second click closes the panel (panelOpen=${s.panelOpen})`);

// 3. Open again, then click empty canvas (corner cell, top-left of the grid).
await clickCardHeader(card);
await page.waitForTimeout(500);
s = await state();
log(s.panelOpen, `re-open before click-off works (panelOpen=${s.panelOpen})`);
const corner = await page
  .locator('[class*="cornerCell"]')
  .first()
  .boundingBox();
await page.mouse.click(corner.x + 10, corner.y + 10);
await page.waitForTimeout(700);
s = await state();
log(
  s.expandedCount === 0,
  `click-off collapses the card (expanded=${s.expandedCount})`,
);
log(!s.panelOpen, `click-off closes the panel (panelOpen=${s.panelOpen})`);

// 4. Open again, capture WHICH lesson the panel is showing, then press
//    "Go to lesson" → /daily and prove Daily selected THAT same lesson.
await clickCardHeader(card);
await page.waitForTimeout(500);

// Capture the clicked lesson's STABLE id (data-planner-item="lesson:<id>") —
// the strongest assertion is by id, since titles can repeat across lessons.
const targetId =
  (await card.getAttribute("data-planner-item"))?.replace(/^lesson:/, "") ??
  null;

// Also read the panel's lesson title from the complementary region's aria-label
// ("Lesson detail: <TITLE>") as a human-readable cross-check.
const panelTitle = await page.evaluate(() => {
  const panel = document.querySelector(
    '[role="complementary"][aria-label^="Lesson detail"]',
  );
  const label = panel?.getAttribute("aria-label") ?? "";
  return label.replace(/^Lesson detail:\s*/, "").trim();
});
log(panelTitle.length > 0, `read panel lesson title (panelTitle="${panelTitle}")`);

const goBtn = page.getByRole("button", { name: "Go to lesson" });
log((await goBtn.count()) === 1, "panel shows a Go to lesson button");
await goBtn.click();
// Generous timeout — dev-mode compiles /daily on first visit. The button
// navigates via the ?lesson= deep link (then DailyView replaces to /daily).
let navOk = true;
try {
  await page.waitForURL(/\/daily/, { timeout: 30000 });
} catch {
  navOk = false;
}
// Wait for the deep-link resolver to settle: exactly one selected row present
// in the Daily list. Polled (not a fixed sleep) so the assertion is robust to
// dev-compile latency and the post-hydration retry path of the resolver.
let selectedTitle = null;
try {
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-planner-item^="lesson:"][class*="lessonRowSelected"]',
      ).length === 1,
    { timeout: 30000 },
  );
} catch {
  // Leave selectedTitle null → the equality assertion below reports FAIL with
  // the count, rather than throwing and aborting the rest of the probe.
}
await page.waitForTimeout(500);
s = await state();
log(navOk, `Go to lesson navigates to /daily (path=${s.path})`);

// Exactly one Daily row must be selected, and its title must equal the panel's.
// Because the Daily list only renders the currently-selected DAY's lessons, a
// selected row carrying the panel's title can ONLY be present if the view also
// switched to the day that contains it — so this one check proves both the
// correct lesson selection AND the day sync.
const selInfo = await page.evaluate(() => {
  const rows = document.querySelectorAll(
    '[data-planner-item^="lesson:"][class*="lessonRowSelected"]',
  );
  if (rows.length !== 1) return { count: rows.length, title: null, id: null };
  const id =
    rows[0].getAttribute("data-planner-item")?.replace(/^lesson:/, "") ?? null;
  // Prefer the plain title span; fall back to parsing the select button's
  // aria-label ("<Subject>: <TITLE>, <status>").
  const span = rows[0].querySelector('[class*="lessonTitle"]');
  let title = span?.textContent?.trim() ?? null;
  if (!title) {
    const btn = rows[0].querySelector("button[aria-pressed]");
    const label = btn?.getAttribute("aria-label") ?? "";
    const m = label.match(/^[^:]*:\s*(.*),\s*[^,]*$/);
    title = m ? m[1].trim() : null;
  }
  return { count: rows.length, title, id };
});
selectedTitle = selInfo.title;
log(
  selInfo.count === 1,
  `exactly one Daily row is selected (selectedCount=${selInfo.count})`,
);
// Strong check: the selected Daily row's id must equal the clicked lesson's id.
log(
  targetId !== null && selInfo.id === targetId,
  `Daily selected the SAME lesson id (target=${targetId} selected=${selInfo.id})`,
);
log(
  selectedTitle !== null && selectedTitle === panelTitle,
  `Daily selected the deep-linked lesson + synced its day ` +
    `(panelTitle="${panelTitle}" selectedTitle="${selectedTitle}")`,
);
// The deep link must land Daily's detail pane on THE clicked lesson, and the
// read-only shell panel must NOT remain mounted alongside it.
log(
  !s.panelOpen,
  `shell lesson panel unmounts after the hand-off (panelOpen=${s.panelOpen})`,
);
await page.screenshot({
  path: "docs/screenshots/probe-card-panel-daily-landing.png",
});

// ── Drawer band (1100px) ───────────────────────────────────────────────────
await page.setViewportSize({ width: 1100, height: 800 });
await page.goto(`${BASE}/weekly`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('[data-planner-item^="lesson:"]', {
  timeout: 30000,
});
await page.waitForTimeout(1000);
await clickCardHeader(page.locator('[data-planner-item^="lesson:"]').first());
await page.waitForTimeout(800);
s = await state();
log(s.drawerOpen, `drawer band: card click opens the drawer (drawerOpen=${s.drawerOpen})`);
log(
  !s.panelOpen,
  `drawer band: shell panel does NOT double-mount (panelOpen=${s.panelOpen})`,
);
await page.screenshot({
  path: "docs/screenshots/probe-card-panel-drawer-band.png",
});

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
