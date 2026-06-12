// scripts/probe-zoom-chain.mjs — walk up from the lesson band and report
// every ancestor's class, computed zoom/width/flex, and rect. Pins down why
// the .root zoom:0.8/width:125% compensation isn't scaling.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3133";

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
await page.setViewportSize({ width: 1727, height: 970 });
await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const rbox = await row.boundingBox();
await page.mouse.click(rbox.x + rbox.width * 0.4, rbox.y + 12);
await page.waitForTimeout(1500);

const chain = await page.evaluate(() => {
  const ua = navigator.userAgent;
  const band = document.querySelector('[class*="lesson-detail_band_"]');
  if (!band) return { error: "no band" };
  const out = [];
  let el = band;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    out.push({
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 90),
      zoom: cs.zoom,
      width: cs.width,
      flex: `${cs.flexGrow} ${cs.flexShrink} ${cs.flexBasis}`,
      rect: { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) },
    });
    el = el.parentElement;
  }
  // Does the stylesheet rule itself exist? Search all sheets for "zoom".
  const zoomRules = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const scan = (list, media) => {
      for (const r of list) {
        if (r.cssRules) {
          scan(r.cssRules, r.media?.mediaText ?? media);
        } else if (r.style && r.style.zoom) {
          zoomRules.push({
            sel: r.selectorText,
            zoom: r.style.zoom,
            width: r.style.width,
            media: media ?? null,
          });
        }
      }
    };
    scan(rules, null);
  }
  return { ua, chain: out, zoomRules };
});
console.log(JSON.stringify(chain, null, 1));
await browser.close();
