// scripts/probe-daily-spec-live.mjs — live conformance sweep for the 6.11.26
// daily-view handoff's "Interactions & Behavior summary" table (README).
// Every step is guarded: a failure logs FAIL and the sweep continues.
//
//   1.  [ / ] toggle left/right columns; guarded while typing in an input
//   2.  splitter: keyboard resize, pointer drag, double-click reset
//   3.  collapse column -> 50px icon rail -> rail icon re-expands + activates
//   4.  rail badges (to-do count / chat dot)
//   5.  layout persistence across reload (+ which localStorage keys)
//   6.  phase rename + minutes edit, reflected in the agenda navigator
//   7.  agenda item: name/time on separate lines; time line hidden when empty
//   8.  planning tab close + re-add via "+ Add a tool"
//   9.  planning tab drag-reorder (persisted)
//   10. phase drag-reorder (flow + navigator stay in sync)
//   11. Templates menu apply + Undo toast
//
// Usage: node scripts/probe-daily-spec-live.mjs   (PROBE_BASE overrides URL)

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
const OUT = path.resolve(process.cwd(), "docs/screenshots/daily-verify/spec");
mkdirSync(OUT, { recursive: true });

let failures = 0;
function log(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}
const info = (msg) => console.log(`INFO  ${msg}`);
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name} — threw: ${String(e).slice(0, 200)}`);
  }
}

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
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);

// Open a lesson so the center column is the lesson detail.
await step("open lesson", async () => {
  const row = page.locator('[data-planner-item^="lesson:"]').first();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
  await page.waitForTimeout(1200);
});

const slot = (k) => page.locator(`[data-slot="${k}"]`);
const collapsed = async (k) =>
  (await slot(k).getAttribute("data-collapsed")) === "true";

// ── 1. Keyboard [ / ] ───────────────────────────────────────────────────────
await step("[ / ] shortcuts", async () => {
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  const l0 = await collapsed("left");
  await page.keyboard.press("[");
  await page.waitForTimeout(450);
  log(
    (await collapsed("left")) === !l0,
    `"[" toggles left column (${l0} → ${!l0})`,
  );
  await page.keyboard.press("[");
  await page.waitForTimeout(450);
  log((await collapsed("left")) === l0, `"[" toggles left column back`);

  const r0 = await collapsed("right");
  await page.keyboard.press("]");
  await page.waitForTimeout(450);
  log(
    (await collapsed("right")) === !r0,
    `"]" toggles right column (${r0} → ${!r0})`,
  );
  await page.keyboard.press("]");
  await page.waitForTimeout(450);
  log((await collapsed("right")) === r0, `"]" toggles right column back`);

  // Guard: focused inside an editable field, [ must NOT toggle. (A rich-text
  // body is always present; the minutes INPUT only exists mid-edit.)
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  const lBefore = await collapsed("left");
  await page.keyboard.press("[");
  await page.waitForTimeout(350);
  log(
    (await collapsed("left")) === lBefore,
    `"[" ignored while typing in an editor`,
  );
  await page.keyboard.press("Backspace");
  await page.locator("body").click({ position: { x: 5, y: 400 } });
});

// ── 2. Splitters ────────────────────────────────────────────────────────────
await step("splitter resize/reset", async () => {
  const sep = page.locator('[role="separator"][data-on="true"]').first();
  log((await sep.count()) === 1, "an enabled splitter separator exists");
  const wOf = async (k) =>
    slot(k).evaluate((el) => el.getBoundingClientRect().width);

  const before = await wOf("center");
  const box = await sep.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(
      box.x + box.width / 2 - i * 10,
      box.y + box.height / 2,
      { steps: 2 },
    );
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await wOf("center");
  log(
    Math.abs(after - before) > 40,
    `splitter pointer-drag resizes (center ${Math.round(before)} → ${Math.round(after)})`,
  );

  await sep.dblclick();
  await page.waitForTimeout(400);
  const reset = await wOf("center");
  log(
    Math.abs(reset - before) < 24,
    `double-click splitter resets widths (center back to ~${Math.round(before)}, got ${Math.round(reset)})`,
  );

  await sep.focus();
  const kBefore = await wOf("center");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  const kAfter = await wOf("center");
  log(Math.abs(kAfter - kBefore) > 10, "splitter keyboard arrows resize");
  await sep.dblclick();
  await page.waitForTimeout(300);
});

// ── 3+4. Collapse → rail → icons + badges ──────────────────────────────────
await step("rail collapse/expand + badges", async () => {
  const collapseBtn = page
    .locator('[data-slot="right"] button[aria-label^="Collapse column"]')
    .first();
  log((await collapseBtn.count()) === 1, "right column has a Collapse control");
  await collapseBtn.click();
  await page.waitForTimeout(500);
  log(await collapsed("right"), "right column collapses");
  const railW = await slot("right").evaluate(
    (el) => el.getBoundingClientRect().width,
  );
  info(`collapsed rail width: ${Math.round(railW)}px (spec: 50px)`);
  await page.screenshot({ path: path.join(OUT, "rail-collapsed.png") });

  const icons = slot("right").locator('button[aria-label^="Open "]');
  const iconNames = await icons.evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label")),
  );
  info(`rail icons: ${iconNames.join(" | ")}`);
  log(
    iconNames.some((n) => /to-?do/i.test(n)) &&
      iconNames.some((n) => /resource/i.test(n)) &&
      iconNames.some((n) => /chat/i.test(n)),
    "rail shows one icon per inner side-panel tab (Resources / To-do / Chat)",
  );

  const badgeText = await slot("right")
    .locator('[class*="railBadge"], [class*="badge"]')
    .allTextContents()
    .catch(() => []);
  info(`rail badge contents: ${JSON.stringify(badgeText)}`);

  // ":visible" matters — hidden in-panel buttons share the "Open " prefix.
  const target = slot("right")
    .locator('button[aria-label^="Open To-do"]:visible')
    .first();
  await target.click();
  await page.waitForTimeout(500);
  log(
    !(await collapsed("right")),
    "clicking a rail icon re-expands the column",
  );
  const activeTab = await slot("right")
    .locator('[role="tab"][aria-selected="true"], [class*="active"]')
    .allTextContents()
    .catch(() => []);
  info(
    `right panel active inner tab after rail click: ${JSON.stringify(activeTab.slice(0, 4))}`,
  );
});

// ── 5. Persistence across reload ───────────────────────────────────────────
await step("layout persistence", async () => {
  await page.keyboard.press("[");
  await page.waitForTimeout(400);
  const leftCollapsed = await collapsed("left");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  info(`localStorage keys: ${keys.join(", ")}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  log(
    (await collapsed("left")) === leftCollapsed,
    `left-column collapsed state survives reload (${leftCollapsed})`,
  );
  if (leftCollapsed) {
    await page.keyboard.press("[");
    await page.waitForTimeout(400);
  }
});

// Re-open the lesson after reload.
await step("re-open lesson", async () => {
  const row = page.locator('[data-planner-item^="lesson:"]').first();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
  await page.waitForTimeout(1200);
});

// ── 6. Phase rename + minutes edit reflected in navigator ──────────────────
// (Hover-revealed controls; the corrected mechanics — double-click the title,
// click the "Planned length" chip to open the input — live in
// probe-daily-spec-live2.mjs steps B + C, which cover these behaviors.)
await step("phase rename + minutes", async () => {
  const phase = page.locator("[data-flow-section]").first();
  await phase.hover();
  const title = phase.locator("[data-flow-title], h3, h4").first();
  await title.dblclick();
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Probe Renamed Phase");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const navHasName = await page
    .locator('nav[aria-label="Lesson phases"]')
    .textContent();
  log(
    navHasName.includes("Probe Renamed Phase"),
    "rename reflects in the agenda navigator",
  );

  await phase.hover();
  await phase.locator('[aria-label^="Planned length:"]').first().click();
  const minInput = phase
    .locator('input[aria-label^="Phase length in minutes"]')
    .first();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Control+a");
  await page.keyboard.type("25");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const navText = await page
    .locator('nav[aria-label="Lesson phases"]')
    .textContent();
  log(
    navText.includes("25 min"),
    'minutes edit reflects as "25 min" in navigator',
  );
});

// ── 7. Agenda two-line layout + empty-minutes hiding ───────────────────────
await step("agenda text layout", async () => {
  const item = page
    .locator('nav[aria-label="Lesson phases"] [aria-label^="Phase 1"]')
    .first();
  const layout = await item.evaluate((el) => {
    const name = el.querySelector('[class*="agendaName"], [class*="name"]');
    const time = el.querySelector('[class*="agendaTime"], [class*="time"]');
    if (!name) return { ok: false, why: "no name node" };
    const nr = name.getBoundingClientRect();
    const tr = time ? time.getBoundingClientRect() : null;
    return {
      ok: true,
      twoLines: tr ? tr.top >= nr.bottom - 2 : null,
      timeText: time ? time.textContent : null,
    };
  });
  info(`agenda item layout: ${JSON.stringify(layout)}`);
  log(
    layout.ok && (layout.twoLines === null || layout.twoLines === true),
    "agenda name and time render on separate lines",
  );

  // Clear minutes → time line must disappear entirely (no dangling "·").
  // Open the input via the "Planned length" chip (hover-revealed flow).
  const phase = page.locator("[data-flow-section]").first();
  await phase.hover();
  await phase.locator('[aria-label^="Planned length:"]').first().click();
  const minInput = phase
    .locator('input[aria-label^="Phase length in minutes"]')
    .first();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const itemText = await page
    .locator('nav[aria-label="Lesson phases"] [aria-label^="Phase 1"]')
    .first()
    .textContent();
  log(
    !/min|·/.test(itemText.replace(/^[0-9]+/, "")),
    `empty minutes hides the time line (item text: "${itemText.trim().slice(0, 40)}")`,
  );
  // restore — minutes is null now, so the way back is the "+ min" ghost.
  await phase.hover();
  await phase.locator('button[aria-label^="No planned length"]').click();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
});

// ── 8. Planning tab close + re-add ──────────────────────────────────────────
await step("tab close + re-add", async () => {
  const tabs = page.locator('[aria-label="Lesson planning"] [role="tab"]');
  const before = await tabs.count();
  const close = page.locator('button[aria-label^="Close Standards"]').first();
  log((await close.count()) === 1, "Standards tab has a close button");
  await close.click();
  await page.waitForTimeout(500);
  log((await tabs.count()) === before - 1, "closing a tab removes it");
  const add = page.locator('button[aria-label^="Add a tool"]').first();
  await add.click();
  await page.waitForTimeout(400);
  const menuItem = page
    .locator(
      '[role="menu"] >> text=Standards, [role="menuitem"]:has-text("Standards")',
    )
    .first();
  const altItem = page.getByRole("menuitem", { name: /standards/i }).first();
  const pick = (await altItem.count()) ? altItem : menuItem;
  await pick.click();
  await page.waitForTimeout(500);
  log(
    (await tabs.count()) === before,
    "re-adding from the + menu restores the tab",
  );
});

// ── 9. Planning tab drag-reorder ────────────────────────────────────────────
await step("tab drag-reorder", async () => {
  const tabs = page.locator('[aria-label="Lesson planning"] [role="tab"]');
  const names = async () =>
    (await tabs.allTextContents()).map((t) => t.trim().slice(0, 14));
  const order0 = await names();
  const a = await tabs.nth(0).boundingBox();
  const b = await tabs.nth(1).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, {
    steps: 3,
  });
  await page.mouse.move(b.x + b.width * 0.9, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const order1 = await names();
  log(
    JSON.stringify(order0) !== JSON.stringify(order1),
    `tab drag-reorder changes order (${order0[0]}|${order0[1]} → ${order1[0]}|${order1[1]})`,
  );
});

// ── 10. Phase drag-reorder (flow + navigator in sync) ──────────────────────
await step("phase drag-reorder", async () => {
  const grips = page.locator('[aria-label^="Drag to reorder phase"]');
  log((await grips.count()) >= 2, "phase drag grips exist");
  const navOrder = async () =>
    (
      await page
        .locator('nav[aria-label="Lesson phases"] [aria-label^="Phase "]')
        .allTextContents()
    ).map((t) => t.trim().slice(0, 16));
  const before = await navOrder();
  const g1 = await grips.nth(0).boundingBox();
  const p2 = await page.locator("[data-flow-section]").nth(1).boundingBox();
  await page.mouse.move(g1.x + g1.width / 2, g1.y + g1.height / 2);
  await page.mouse.down();
  await page.mouse.move(g1.x + g1.width / 2, g1.y + 12, { steps: 3 });
  await page.mouse.move(p2.x + 40, p2.y + p2.height - 8, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await navOrder();
  log(
    JSON.stringify(before) !== JSON.stringify(after),
    `phase drag-reorder updates the navigator (${before[0]} → ${after[0]})`,
  );
  await page.screenshot({ path: path.join(OUT, "after-phase-reorder.png") });
});

// ── 11. Templates apply + Undo toast ────────────────────────────────────────
await step("templates + undo", async () => {
  const tmpl = page.getByRole("button", { name: /templates/i }).first();
  await tmpl.click();
  await page.waitForTimeout(400);
  const item = page.locator('[role="menu"] [role="menuitem"]').first();
  const label = (await item.textContent())?.trim();
  await item.click();
  await page.waitForTimeout(700);
  // The Undo BUTTON is the toast's load-bearing affordance (a live clock
  // also carries role="status", so text-matching the first status node lies).
  const undoVisible = await page
    .getByRole("button", { name: /undo/i })
    .first()
    .isVisible()
    .catch(() => false);
  log(undoVisible, `applying template "${label}" surfaces an Undo affordance`);
  await page.screenshot({ path: path.join(OUT, "template-toast.png") });
  const undo = page.getByRole("button", { name: /undo/i }).first();
  if ((await undo.count()) > 0) {
    await undo.click();
    await page.waitForTimeout(600);
    const navText = await page
      .locator('nav[aria-label="Lesson phases"]')
      .textContent();
    log(
      navText.includes("Probe Renamed Phase") || navText.includes("10 min"),
      "Undo restores the pre-template phases",
    );
  } else {
    log(false, "Undo button present in toast");
  }
});

await page.screenshot({ path: path.join(OUT, "final-state.png") });
await browser.close();
console.log(
  failures === 0 ? "\nALL SPEC CHECKS PASSED" : `\n${failures} FAILURES`,
);
process.exit(failures === 0 ? 0 : 1);
