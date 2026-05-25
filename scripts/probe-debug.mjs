// scripts/probe-debug.mjs — dump the bar's right-side children at 400px.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext();

const bs = await context.newPage();
await bs.goto(
  `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`,
  { waitUntil: "networkidle" },
);
await bs.close();

const page = await context.newPage();
await page.setViewportSize({ width: 400, height: 800 });
await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("header");
await page.waitForTimeout(500);

const dump = await page.evaluate(() => {
  const header = document.querySelector("header");
  const out = [];
  for (const child of header.children) {
    const r = child.getBoundingClientRect();
    out.push({
      tag: child.tagName,
      cls: child.className,
      visible: r.width > 0 && r.height > 0,
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      computedDisplay: getComputedStyle(child).display,
      html: child.outerHTML.substring(0, 80),
    });
  }
  return out;
});

console.log("Top bar direct children at 400px:\n");
for (const d of dump) {
  const mark = d.visible ? "[v]" : "[H]";
  console.log(
    `${mark} ${d.tag}.${d.cls.substring(0, 40)} d=${d.computedDisplay} L=${d.left} R=${d.right} W=${d.width}`,
  );
  console.log(`    ${d.html}`);
}

await browser.close();
