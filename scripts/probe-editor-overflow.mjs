// scripts/probe-editor-overflow.mjs — reproduce the owner-reported bug:
// "the lesson text input box is not resizing correctly and so is going
// outside the view". Loads /daily at the user's viewport, selects a lesson,
// then walks the lesson pane's DOM reporting every element whose right edge
// escapes its scrollport (scrollWidth > clientWidth chain).
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3133";
const OUT = path.resolve(process.cwd(), "docs/screenshots/overflow-probe");
mkdirSync(OUT, { recursive: true });

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
// The owner's screenshot is 1727px wide (a ~1727x970 window).
await page.setViewportSize({ width: 1727, height: 970 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);

// Select the first lesson so the detail pane opens.
const row = page.locator('[data-planner-item^="lesson:"]').first();
const rbox = await row.boundingBox();
await page.mouse.click(rbox.x + rbox.width * 0.4, rbox.y + 12);
await page.waitForTimeout(1500);

async function snapshotOverflow(label) {
  const report = await page.evaluate(() => {
    // Find the lesson detail card root.
    const band = document.querySelector('[class*="_band_"]');
    const root = band?.closest('[class*="_root_"]');
    if (!root) return { error: "no lesson detail root found" };
    const out = [];
    const vw = document.documentElement.clientWidth;
    const walk = (el, depth) => {
      const r = el.getBoundingClientRect();
      const overflowingScroll = el.scrollWidth > el.clientWidth + 1;
      const offscreen = r.right > vw + 1;
      if (overflowingScroll || offscreen) {
        out.push({
          depth,
          cls: (typeof el.className === "string" ? el.className : "")
            .split(" ")
            .slice(0, 3)
            .join(" "),
          tag: el.tagName,
          rect: { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) },
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        });
      }
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(root.parentElement ?? root, 0);
    // Also capture the key geometry: dock columns, root, body, column, workspace, a phase.
    const g = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return {
        l: Math.round(b.left),
        r: Math.round(b.right),
        w: Math.round(b.width),
        scrollW: e.scrollWidth,
        clientW: e.clientWidth,
        zoom: getComputedStyle(e).zoom,
      };
    };
    const cols = [...document.querySelectorAll("[data-slot]")].map((c) => ({
      slot: c.dataset.slot,
      pinned: c.dataset.pinned,
      collapsed: c.dataset.collapsed,
      mode: c.dataset.mode,
      rect: (() => {
        const b = c.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) };
      })(),
      flexGrow: getComputedStyle(c).flexGrow,
    }));
    return {
      viewportW: vw,
      cols,
      root: g('[class*="lesson-detail_root_"], [class*="_root_"]'),
      band: g('[class*="_band_"]'),
      body: g('[class*="_body_"]'),
      column: g('[class*="_column_"]'),
      workspace: g('[class*="workspace"]'),
      phase: g('[class*="lesson-flow_phase__"]'),
      editor: g('[contenteditable="true"]'),
      overflows: out,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(report, null, 1));
  await page.screenshot({ path: path.join(OUT, `${label}.png`) });
  return report;
}

await snapshotOverflow("01-initial");

await browser.close();
console.log("\nDONE");
