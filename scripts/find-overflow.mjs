// scripts/find-overflow.mjs — single-shot Playwright probe.
// Reports the elements that extend past the viewport at a given width,
// so we know exactly what's causing the doc to overflow.

import { chromium } from "playwright";

const BASE = process.env.RESPONSIVE_CHECK_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const PATH = process.env.AUDIT_PATH ?? "/weekly";
const WIDTH = Number(process.env.AUDIT_WIDTH ?? 1280);

if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: 900 },
});

// Seed session via cookie-redirect endpoint.
const page = await context.newPage();
await page.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=${encodeURIComponent(PATH)}`,
  { waitUntil: "networkidle" },
);

await page.waitForTimeout(800);

const report = await page.evaluate((viewportWidth) => {
  const doc = document.documentElement;
  const widest = [];
  // Walk every element. Track those whose right edge is past viewport.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  let count = 0;
  while (node && count < 5000) {
    count += 1;
    if (!(node instanceof HTMLElement)) {
      node = walker.nextNode();
      continue;
    }
    const rect = node.getBoundingClientRect();
    const right = rect.left + rect.width;
    if (rect.width > 0 && right > viewportWidth + 0.5) {
      const cls = node.className && typeof node.className === "string"
        ? node.className.split(/\s+/).slice(0, 3).join(" ")
        : "";
      widest.push({
        tag: node.tagName,
        id: node.id || "",
        cls,
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        right: Math.round(right),
        overflow: Math.round(right - viewportWidth),
      });
    }
    node = walker.nextNode();
  }
  // Sort: largest overflow first (the elements pushing the doc widest).
  widest.sort((a, b) => b.overflow - a.overflow);
  return {
    docScrollWidth: doc.scrollWidth,
    docClientWidth: doc.clientWidth,
    elementCount: count,
    widest: widest.slice(0, 25),
  };
}, WIDTH);

console.log(JSON.stringify(report, null, 2));

await browser.close();
