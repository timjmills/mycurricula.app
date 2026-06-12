// scripts/probe-daily-jump.mjs — does the agenda navigator click-jump
// actually scroll/focus the target phase, given the data-flow-section
// hydration mismatch? Decisive user-facing check.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const box = await row.boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
await page.waitForTimeout(1500);

// Compare DOM anchor ids vs the navigator's store ids, then click the FIRST
// agenda item (an existing template-seeded phase — the hydration-sensitive
// case; the trailing item is "+ Add phase", which mutates the store) and
// require focus to land on that exact phase row.
const domIds = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-flow-section]")).map((e) =>
    e.getAttribute("data-flow-section"),
  ),
);
console.log("DOM anchor ids:", domIds.join(", "));

const items = page.locator(
  'nav[aria-label="Lesson phases"] [role="button"], nav[aria-label="Lesson phases"] button, nav[aria-label="Lesson phases"] a',
);
const n = await items.count();
console.log("agenda items:", n);
if (n === 0 || domIds.length === 0) {
  console.log("FAIL  no agenda items / DOM anchors found");
  await browser.close();
  process.exit(1);
}
const target = items.nth(0);
await target.click();
await page.waitForTimeout(900);

const result = await page.evaluate(() => {
  const ae = document.activeElement;
  return {
    activeTag: ae?.tagName,
    activeFlowSection: ae?.getAttribute?.("data-flow-section") ?? null,
    activeTitle: ae?.getAttribute?.("data-flow-title") ?? null,
  };
});
console.log("after click-jump:", JSON.stringify(result));
const ok = result.activeFlowSection === domIds[0];
console.log(
  ok
    ? "PASS  click-jump moved focus to the first phase row"
    : "FAIL  click-jump did NOT focus the first phase row",
);
await browser.close();
process.exit(ok ? 0 : 1);
