// scripts/probe-daily-viewmode.mjs — the list-view trap (owner report
// 2026-06-12): /daily READ the global viewMode but offered no setter, so a
// teacher who chose List on Weekly landed on Daily with no way back to the
// grid. Asserts:
//   1. the header control is a real RADIOGROUP (no button fallback — the
//      a11y contract is part of the assertion) and round-trips Grid⇄List,
//      including by arrow key
//   2. it exists in BOTH modes at 360 / 768 / 1280 with no document
//      h-scroll (a second segmented control must not overflow the header)
//   3. a reload deliberately RESETS to grid (viewMode is session state) —
//      asserted, not assumed
//   4. the original trap path via CLIENT-SIDE nav (Weekly: List → in-app
//      link to Daily → list mode ASSERTED → recovered via the new toggle)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";

let failures = 0;
function log(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
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

const group = () => page.getByRole("radiogroup", { name: "Daily layout" });
const radio = (label) => group().getByRole("radio", { name: label });
const checkedLabel = async () =>
  (
    await group().locator('[role="radio"][aria-checked="true"]').textContent()
  )?.trim();
const gridVisible = async () =>
  (await page.locator('[data-slot="center"]').count()) > 0;
const listVisible = async () =>
  (await page.locator('[class*="listModeBody"]').count()) > 0;
const noHScroll = async () =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );

// ── 1. Radiogroup contract + Grid → List → Grid (click + arrow key) ────
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
log(await gridVisible(), "starts in grid mode (dock slots present)");
log((await group().count()) === 1, "Daily layout RADIOGROUP present");
log((await radio("Grid").count()) === 1, "Grid is a role=radio option");
log((await radio("List").count()) === 1, "List is a role=radio option");

await radio("List").click();
await page.waitForTimeout(1200);
log(await listVisible(), "List click switches to the list layout");
log(
  (await checkedLabel()) === "List",
  `List radio is aria-checked (checked: "${await checkedLabel()}")`,
);
log(
  (await group().count()) === 1,
  "toggle STILL present in list mode (the way back exists)",
);

// Arrow-key path back to Grid (radiogroup keyboard contract).
await page
  .locator('[aria-label="Daily layout"] [role="radio"][aria-checked="true"]')
  .focus();
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(1200);
log(await gridVisible(), "ArrowLeft on the radiogroup restores grid mode");
log((await checkedLabel()) === "Grid", "Grid radio is aria-checked again");

// ── 2. Header reachability at the three tiers, in BOTH modes ───────────
for (const [w, h] of [
  [360, 740],
  [768, 1024],
  [1280, 900],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(700);
  log(await noHScroll(), `${w}px: no document h-scroll with the new toggle`);
  log(
    await group().isVisible(),
    `${w}px: Daily layout toggle visible in grid mode`,
  );
  await radio("List").click();
  await page.waitForTimeout(900);
  log(await group().isVisible(), `${w}px: toggle still visible in LIST mode`);
  log(await noHScroll(), `${w}px: no h-scroll in list mode`);
  await radio("Grid").click();
  await page.waitForTimeout(900);
}

// ── 3. Reload resets to grid (session-state semantics, asserted) ───────
await page.setViewportSize({ width: 1440, height: 900 });
await radio("List").click();
await page.waitForTimeout(900);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
log(
  (await gridVisible()) && (await checkedLabel()) === "Grid",
  "reload resets to grid (viewMode is session state by design)",
);

// ── 4. The original trap, via CLIENT-SIDE navigation ───────────────────
await page.goto(`${BASE}/weekly`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
await page
  .getByRole("radiogroup", { name: "Weekly view mode" })
  .getByRole("radio", { name: "List" })
  .click();
await page.waitForTimeout(900);
// In-app nav keeps the provider mounted — the state travels with us.
await page.getByRole("link", { name: "Daily" }).first().click();
await page.waitForTimeout(2500);
log(
  await listVisible(),
  "TRAP REPRODUCED: Weekly-set List carries into /daily via in-app nav",
);
await radio("Grid").click();
await page.waitForTimeout(1200);
log(
  await gridVisible(),
  "TRAP FIXED: the header toggle recovers the grid from list mode",
);

await browser.close();
console.log(
  failures === 0 ? "\nALL VIEWMODE CHECKS PASSED" : `\n${failures} FAILURES`,
);
process.exit(failures === 0 ? 0 : 1);
