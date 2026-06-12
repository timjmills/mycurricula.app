// scripts/probe-daily-hitareas.mjs — computed-style inspection of the
// touch-compensation patterns at 360px: rect, box-sizing, padding, and
// the ::before/::after pseudo geometry for each suspect control.
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
await boot.waitForTimeout(2000);
await boot.close();

const page = await context.newPage();
await page.setViewportSize({ width: 360, height: 740 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const box = await row.boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const sel = {
    phaseDel: 'button[aria-label^="Delete phase"]',
    chipGrip: 'button[aria-label^="Drag to move resource"]',
    resChipOpen: 'button[aria-label^="Open Fraction"]',
    resChipDel: 'button[aria-label^="Remove resource"]',
    tabClose: 'button[aria-label^="Close Objective"]',
    phaseResAdd: 'button[aria-label^="Add a resource to this phase"]',
    statusChip: 'button[aria-label^="Phase status"]',
    dragGrip: 'button[aria-label^="Drag to reorder phase"]',
  };
  const out = {};
  for (const [name, s] of Object.entries(sel)) {
    const e = document.querySelector(s);
    if (!e) {
      out[name] = "NOT FOUND";
      continue;
    }
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const after = getComputedStyle(e, "::after");
    const before = getComputedStyle(e, "::before");
    out[name] = {
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      boxSizing: cs.boxSizing,
      padding: cs.padding,
      margin: cs.margin,
      width: cs.width,
      height: cs.height,
      after:
        after.content !== "none"
          ? `content pos=${after.position} inset=${after.inset} min=${after.minWidth}/${after.minHeight}`
          : "none",
      before:
        before.content !== "none"
          ? `content pos=${before.position} inset=${before.inset} min=${before.minWidth}/${before.minHeight}`
          : "none",
    };
  }
  return out;
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
