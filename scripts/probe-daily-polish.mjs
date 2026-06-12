// scripts/probe-daily-polish.mjs — verify the audit-driven polish fixes:
//   1. navigator click-jump clears the sticky toolbar (head fully visible)
//   2. the jumped-to phase card carries the .phaseCurrent treatment
//   3. clearing minutes leaves a "+ min" way back (hover-revealed)
//   4. footer "Add a lesson phase" scrolls + opens rename ready to type
//   5. Shift+ArrowRight reorders planning tabs from the keyboard
//   6. live rail badge: checking a to-do off ticks the count down
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
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
    console.log(`FAIL  ${name} — threw: ${String(e).slice(0, 180)}`);
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
const row = page.locator('[data-planner-item^="lesson:"]').first();
const rbox = await row.boundingBox();
await page.mouse.click(rbox.x + rbox.width * 0.4, rbox.y + 12);
await page.waitForTimeout(1200);

// ── 1+2. Jump clears toolbar + current treatment ────────────────────────
await step("jump offset + phaseCurrent", async () => {
  const items = page.locator('nav[aria-label="Lesson phases"] [role="button"]');
  const n = await items.count();
  // Last PHASE item (the final [role=button] is "Add phase" — a <button>,
  // not role=button div… count both shapes and pick a real phase).
  const target = items.nth(Math.max(0, n - 1));
  const label = await target.getAttribute("aria-label");
  await target.click();
  await page.waitForTimeout(1400);
  const m = await page.evaluate(() => {
    const toolbar = document.querySelector(
      '[role="toolbar"][aria-label="Text formatting"]',
    );
    const focused = document.activeElement;
    if (!focused?.hasAttribute("data-flow-section"))
      return { ok: false, why: "focus not on a phase row" };
    const tb = toolbar.getBoundingClientRect();
    const fr = focused.getBoundingClientRect();
    return {
      ok: true,
      headBelowToolbar: fr.top >= tb.bottom - 2,
      toolbarBottom: Math.round(tb.bottom),
      phaseTop: Math.round(fr.top),
      isCurrent: [...focused.classList].some((c) => c.includes("phaseCurrent")),
    };
  });
  info(`jump target "${label}": ${JSON.stringify(m)}`);
  log(
    m.ok && m.headBelowToolbar,
    `jumped phase head lands BELOW the sticky toolbar (top ${m.phaseTop} ≥ toolbar bottom ${m.toolbarBottom})`,
  );
  log(m.ok && m.isCurrent, "jumped phase card carries .phaseCurrent");
  await page.screenshot({ path: path.join(OUT, "polish-current-phase.png") });
});

// ── 3. "+ min" way back ──────────────────────────────────────────────────
await step("minutes way back", async () => {
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
  await page.waitForTimeout(500);
  await phase.hover();
  const addMin = phase.locator('button[aria-label^="No planned length"]');
  log((await addMin.count()) === 1, '"+ min" ghost exists after clearing');
  await addMin.click();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const restored = await phase
    .locator('[aria-label^="Planned length: 10"]')
    .count();
  log(restored === 1, '"+ min" → input → minutes restored to 10');
});

// ── 4. Footer add-phase: scroll + rename-ready ───────────────────────────
await step("footer add rename-ready", async () => {
  const footerAdd = page.getByRole("button", { name: "Add a lesson phase" });
  log(
    (await footerAdd.count()) === 1,
    'footer button reads "Add a lesson phase"',
  );
  await footerAdd.click();
  await page.waitForTimeout(900);
  const state = await page.evaluate(() => {
    const ae = document.activeElement;
    return {
      tag: ae?.tagName,
      isRenameInput:
        ae?.tagName === "INPUT" &&
        (ae.getAttribute("aria-label") ?? "").startsWith("Rename phase"),
      selected:
        ae?.tagName === "INPUT"
          ? ae.selectionEnd - ae.selectionStart === ae.value.length
          : false,
      value: ae?.value,
    };
  });
  info(`after footer add: ${JSON.stringify(state)}`);
  log(state.isRenameInput, "new phase opens its rename input");
  log(state.selected, "rename input text is select-all (type to replace)");
  await page.keyboard.type("Polish Probe Phase");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  // Clean up: delete the probe phase.
  const probePhase = page.locator(
    '[data-flow-section][data-flow-title="Polish Probe Phase"]',
  );
  await probePhase.hover();
  await probePhase
    .locator('button[aria-label^="Delete phase"]')
    .click({ force: true });
  await page.waitForTimeout(500);
  log((await probePhase.count()) === 0, "probe phase cleaned up via delete");
});

// ── 5. Keyboard tab reorder ──────────────────────────────────────────────
await step("Shift+Arrow tab reorder", async () => {
  const tabs = page.locator('[aria-label="Lesson planning"] [role="tab"]');
  const names = async () =>
    (await tabs.allTextContents()).map((t) => t.trim().slice(0, 10));
  const before = await names();
  await tabs.nth(0).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(400);
  const after = await names();
  log(
    before[0] === after[1] && before[1] === after[0],
    `Shift+ArrowRight swaps tabs (${before[0]}|${before[1]} → ${after[0]}|${after[1]})`,
  );
  await page.keyboard.press("Shift+ArrowLeft");
  await page.waitForTimeout(400);
  const restored = await names();
  log(
    JSON.stringify(restored) === JSON.stringify(before),
    "Shift+ArrowLeft restores the order",
  );
});

// ── 6. Live rail badge ───────────────────────────────────────────────────
await step("live to-do badge", async () => {
  const slot = page.locator('[data-slot="right"]');
  // Open the To-do tab, read the badge, check one item off, re-read.
  const todoTab = slot.getByRole("tab", { name: /to-?do/i }).first();
  if ((await todoTab.count()) > 0) await todoTab.click();
  await page.waitForTimeout(600);
  const collapse = slot.locator('button[aria-label^="Collapse column"]');
  await collapse.click();
  await page.waitForTimeout(500);
  const badge = slot.locator('[class*="railBadge"]').first();
  const before = parseInt((await badge.textContent()) ?? "0", 10);
  const reopen = slot
    .locator('button[aria-label^="Open To-do"]:visible')
    .first();
  await reopen.click();
  await page.waitForTimeout(600);
  const firstTodo = slot.locator('[role="checkbox"]').first();
  await firstTodo.click();
  await page.waitForTimeout(500);
  await slot.locator('button[aria-label^="Collapse column"]').click();
  await page.waitForTimeout(500);
  const after = parseInt((await badge.textContent()) ?? "0", 10);
  log(
    after === before - 1,
    `checking a to-do off ticks the rail badge down (${before} → ${after})`,
  );
  // Restore: expand, uncheck, leave expanded.
  await slot
    .locator('button[aria-label^="Open To-do"]:visible')
    .first()
    .click();
  await page.waitForTimeout(500);
  await slot.locator('[role="checkbox"]').first().click();
  await page.waitForTimeout(300);
});

await browser.close();
console.log(
  failures === 0 ? "\nALL POLISH CHECKS PASSED" : `\n${failures} FAILURES`,
);
process.exit(failures === 0 ? 0 : 1);
