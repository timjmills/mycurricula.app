// scripts/probe-daily-refs.mjs — verify the Tooltip ref-composition fix:
// the behaviors that depend on callers' own ref maps surviving the clone.
//   1. agenda nav drag inserts at the pointer MIDPOINT (itemRefs) — with
//      broken refs the drag always appends to the end
//   2. planning-tab ArrowRight moves FOCUS to the next tab (tabBtnRefs)
//   3. Shift+ArrowRight keeps focus with the moved tab
//   4. planning "+ Add a tool": Escape returns focus to the + (addBtnRef)
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

// ── 1. Nav drag inserts at midpoint, not at the end ─────────────────────
const navItems = page.locator(
  'nav[aria-label="Lesson phases"] [aria-label^="Phase "]',
);
const names = async () =>
  (await navItems.allTextContents()).map((t) =>
    t.replace(/^\d+/, "").trim().slice(0, 14),
  );
const before = await names();
// Drag item 1 to between items 2 and 3 (drop on item 3's TOP half).
const src = await navItems.nth(0).boundingBox();
const dst = await navItems.nth(2).boundingBox();
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await page.mouse.down();
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2 + 10, {
  steps: 3,
});
await page.mouse.move(dst.x + dst.width / 2, dst.y + 6, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(700);
const after = await names();
log(
  after[1] === before[0] &&
    after[after.length - 1] === before[before.length - 1],
  `nav drag inserts at the midpoint, not the end (${before[0]} → slot 2; last item unchanged: ${JSON.stringify(after)})`,
);
// restore: drag it back to the front (drop on item 1's top half)
{
  const s2 = await navItems.nth(1).boundingBox();
  const d2 = await navItems.nth(0).boundingBox();
  await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2);
  await page.mouse.down();
  await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2 - 10, {
    steps: 3,
  });
  await page.mouse.move(d2.x + d2.width / 2, d2.y + 4, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const restored = await names();
  log(
    JSON.stringify(restored) === JSON.stringify(before),
    "nav order restored",
  );
}

// ── 2+3. Tab arrow focus + Shift+Arrow focus follow ─────────────────────
const tabs = page.locator('[aria-label="Lesson planning"] [role="tab"]');
await tabs.nth(0).focus();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const focusedTab = await page.evaluate(() => {
  const ae = document.activeElement;
  return ae?.getAttribute("role") === "tab" ? ae.textContent?.trim() : null;
});
const tab1Text = (await tabs.nth(1).textContent())?.trim();
log(
  focusedTab === tab1Text,
  `ArrowRight moves focus to the next tab ("${focusedTab}" === "${tab1Text}")`,
);
await page.keyboard.press("Shift+ArrowLeft");
await page.waitForTimeout(400);
const focusAfterMove = await page.evaluate(() =>
  document.activeElement?.textContent?.trim(),
);
log(
  focusAfterMove === tab1Text,
  `Shift+ArrowLeft keeps focus with the moved tab ("${focusAfterMove}")`,
);
// restore order
await page.keyboard.press("Shift+ArrowRight");
await page.waitForTimeout(300);

// ── 4. Add-tool menu Escape returns focus to the trigger ────────────────
const add = page.locator('button[aria-label^="Add a tool"]').first();
await add.click();
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const focusBackOnAdd = await page.evaluate(
  () => document.activeElement?.getAttribute("aria-label") ?? null,
);
log(
  focusBackOnAdd === "Add a tool",
  `Escape returns focus to the + trigger ("${focusBackOnAdd}")`,
);

await browser.close();
console.log(
  failures === 0 ? "\nALL REF CHECKS PASSED" : `\n${failures} FAILURES`,
);
process.exit(failures === 0 ? 0 : 1);
