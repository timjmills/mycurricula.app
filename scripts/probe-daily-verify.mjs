// scripts/probe-daily-verify.mjs — live verification of the 6.11.26 /daily
// redesign (PR #15), the sweep the cloud build environment could not run.
//
// Per tier (phone 360 / tablet 768 / desktop 1280):
//   - no document-level horizontal scroll, before AND after opening a lesson
//   - screenshots of the day pane and the lesson detail
// Desktop interactions:
//   - agenda navigator (nav[aria-label="Lesson phases"]) present, items listed
//   - planning tabs present; tab click moves selection
//   - sticky RtToolbar present ([role="toolbar"][aria-label="Text formatting"])
//   - phase status chip click-to-cycle, then cycled back to the original
//   - Templates menu opens and closes
// Phone:
//   - page-wide touch-target sampling (informational), plus a hard gate on
//     this PR's surfaces: no control below 44px in both axes, counting the
//     Button primitive's ≤900px ::before hit-area inflation
//
// Usage:  node scripts/probe-daily-verify.mjs   (PROBE_BASE overrides the URL)

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
if (!token) {
  console.error("CLAUDE_BYPASS_TOKEN not found");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";
const OUT = path.resolve(process.cwd(), "docs/screenshots/daily-verify");
mkdirSync(OUT, { recursive: true });

let failures = 0;
function log(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}
const info = (msg) => console.log(`INFO  ${msg}`);

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(2000);
await boot.close();

const page = await context.newPage();

async function hscroll(label) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  log(m.sw <= m.cw + 1, `${label}: no document h-scroll (${m.sw} vs ${m.cw})`);
}

// Land on /daily and make sure a day with lessons is selected (today may be
// a non-school day — walk the weekday pills until lesson rows appear).
async function gotoDaily() {
  await page.goto(`${BASE}/daily`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  let count = await page.locator('[data-planner-item^="lesson:"]').count();
  if (count > 0) return count;
  const pills = page.getByRole("button", {
    name: /^(sun|mon|tue|wed|thu|fri|sat)/i,
  });
  const n = await pills.count();
  for (let i = 0; i < n; i++) {
    await pills
      .nth(i)
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(900);
    count = await page.locator('[data-planner-item^="lesson:"]').count();
    if (count > 0) return count;
  }
  return count;
}

// Click a lesson row's header band (top strip), avoiding inner controls.
async function openFirstLesson() {
  const row = page.locator('[data-planner-item^="lesson:"]').first();
  const box = await row.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
  await page.waitForTimeout(1200);
  return true;
}

// ── Desktop (1280×900): layout + every interaction ─────────────────────────
await page.setViewportSize({ width: 1280, height: 900 });
const desktopLessons = await gotoDaily();
log(
  desktopLessons > 0,
  `desktop: day with lessons found (${desktopLessons} rows)`,
);
await hscroll("desktop day pane");
await page.screenshot({ path: path.join(OUT, "desktop-day.png") });

await openFirstLesson();
await page.screenshot({ path: path.join(OUT, "desktop-detail.png") });
await hscroll("desktop with lesson detail open");

const navEl = page.locator('nav[aria-label="Lesson phases"]');
log((await navEl.count()) === 1, "desktop: agenda navigator rendered");
const navItems = await navEl
  .locator("a,button,[role='link'],[role='button']")
  .count();
info(`agenda navigator interactive items: ${navItems}`);

const tabsPanel = page.locator('[aria-label="Lesson planning"]');
log((await tabsPanel.count()) >= 1, "desktop: planning-tabs panel rendered");
const tabs = page.locator('[aria-label="Lesson planning"] [role="tab"]');
const tabCount = await tabs.count();
info(`planning tabs: ${tabCount}`);
if (tabCount >= 2) {
  const before = await tabs.evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-selected")),
  );
  await tabs.nth(1).click();
  await page.waitForTimeout(500);
  const after = await tabs.evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-selected")),
  );
  log(
    after[1] === "true" && JSON.stringify(before) !== JSON.stringify(after),
    "desktop: clicking a planning tab moves selection",
  );
  await tabs.nth(0).click();
  await page.waitForTimeout(300);
}

const toolbar = page.locator('[role="toolbar"][aria-label="Text formatting"]');
log((await toolbar.count()) === 1, "desktop: sticky RtToolbar rendered");
info(`toolbar buttons: ${await toolbar.locator("button").count()}`);

// Phase status chip — click-to-cycle, then cycle back to the original value.
const chip = page.locator('button[aria-label^="Phase status:"]').first();
if ((await chip.count()) === 0) {
  log(false, "desktop: phase status chip present");
} else {
  const start = await chip.getAttribute("aria-label");
  await chip.click();
  await page.waitForTimeout(400);
  const next = await chip.getAttribute("aria-label");
  log(next !== start, `status chip cycles ("${start}" → "${next}")`);
  let guard = 0;
  while ((await chip.getAttribute("aria-label")) !== start && guard++ < 5) {
    await chip.click();
    await page.waitForTimeout(400);
  }
  log(
    (await chip.getAttribute("aria-label")) === start,
    "status chip restored to original value",
  );
}

// Templates menu opens + closes.
const tmpl = page.getByRole("button", { name: /templates/i }).first();
if ((await tmpl.count()) === 0) {
  log(false, "desktop: Templates button present");
} else {
  await tmpl.click();
  await page.waitForTimeout(500);
  const menuOpen = await page
    .locator('[role="menu"], [role="listbox"]')
    .count();
  log(menuOpen >= 1, "desktop: Templates menu opens");
  await page.screenshot({ path: path.join(OUT, "desktop-templates.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  log(
    (await page.locator('[role="menu"], [role="listbox"]').count()) === 0,
    "desktop: Templates menu closes on Escape",
  );
}

// ── Tablet (768×1024) ───────────────────────────────────────────────────────
await page.setViewportSize({ width: 768, height: 1024 });
const tabletLessons = await gotoDaily();
log(
  tabletLessons > 0,
  `tablet: day with lessons found (${tabletLessons} rows)`,
);
await hscroll("tablet day pane");
await page.screenshot({ path: path.join(OUT, "tablet-day.png") });
await openFirstLesson();
await hscroll("tablet with lesson detail open");
await page.screenshot({ path: path.join(OUT, "tablet-detail.png") });

// ── Phone (360×740) ─────────────────────────────────────────────────────────
await page.setViewportSize({ width: 360, height: 740 });
const phoneLessons = await gotoDaily();
log(phoneLessons > 0, `phone: day with lessons found (${phoneLessons} rows)`);
await hscroll("phone day pane");
await page.screenshot({ path: path.join(OUT, "phone-day.png") });

// Touch-target sampling: primary interactive controls in the day pane.
const targets = await page.evaluate(() => {
  const els = Array.from(
    document.querySelectorAll('button, [role="button"], [role="tab"], a[href]'),
  )
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
    })
    .slice(0, 40);
  return els.map((e) => {
    const r = e.getBoundingClientRect();
    return {
      label:
        e.getAttribute("aria-label") ||
        (e.textContent || "").trim().slice(0, 30),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
});
const small = targets.filter((t) => t.h < 44 || t.w < 44);
info(
  `phone touch targets sampled: ${targets.length}; below 44px in either axis: ${small.length} (page-wide, informational — includes pre-existing chrome)`,
);
for (const t of small.slice(0, 10))
  info(`  small target: "${t.label}" ${t.w}×${t.h}`);

await openFirstLesson();
await hscroll("phone with lesson detail open");
await page.screenshot({ path: path.join(OUT, "phone-detail.png") });

// Hard gate, scoped to THIS PR's surfaces (navigator, planning tabs, phase
// rows, sticky toolbar): fail any control small in BOTH axes — an
// unmistakable violation. One-generous-axis controls (full-width rows) are
// reported above informationally; the 44px contract targets primary actions.
// The Button primitive inflates sm/md hit areas to 44×44 with a ::before
// overlay on ≤900px viewports (Button.module.css, BUILD_STANDARD §8) —
// getBoundingClientRect can't see it, so count the pseudo-element too.
const prSurfaceSmall = await page.evaluate(() => {
  const roots = document.querySelectorAll(
    'nav[aria-label="Lesson phases"], [aria-label="Lesson planning"], [role="toolbar"][aria-label="Text formatting"], [data-flow-section]',
  );
  const bad = [];
  for (const root of roots) {
    for (const e of root.querySelectorAll(
      'button, [role="button"], [role="tab"], a[href]',
    )) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const ps = getComputedStyle(e, "::before");
      const inflated =
        ps.content !== "none" &&
        ps.position === "absolute" &&
        parseFloat(ps.minWidth) >= 44 &&
        parseFloat(ps.minHeight) >= 44;
      if (!inflated && r.width < 44 && r.height < 44) {
        bad.push({
          label:
            e.getAttribute("aria-label") ||
            (e.textContent || "").trim().slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
  }
  return bad;
});
log(
  prSurfaceSmall.length === 0,
  `phone: no PR-surface control below 44px in both axes (${prSurfaceSmall.length} found)`,
);
for (const t of prSurfaceSmall.slice(0, 10))
  info(`  PR-surface small target: "${t.label}" ${t.w}×${t.h}`);

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
