// scripts/probe-daily-border-check.mjs — computed border/padding/background
// on the dashed + pill buttons, to see how far the .cp-root button reset
// actually reaches.
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

const out = await page.evaluate(() => {
  const pick = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return "NOT FOUND";
    const cs = getComputedStyle(e);
    return {
      border: `${cs.borderTopStyle} ${cs.borderTopWidth}`,
      padding: cs.padding,
      bg: cs.backgroundColor,
    };
  };
  return {
    addPhaseBtn: pick('button[class*="addPhaseBtn"]'),
    tmplBtn: pick('button[class*="tmplBtn"]'),
    agendaAdd: pick('button[class*="agendaAdd"]'),
    statusChip: pick('button[aria-label^="Phase status"]'),
    tabsAdd: pick('button[aria-label^="Add a tool"]'),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
