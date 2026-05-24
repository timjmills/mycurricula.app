// Find elements whose right edge is closest to the doc's scrollWidth.
// These are the actual culprits expanding the document width.

import { chromium } from "playwright";

const BASE = process.env.RESPONSIVE_CHECK_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const WIDTH = Number(process.env.AUDIT_WIDTH ?? 1280);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const report = await page.evaluate((viewportWidth) => {
  const doc = document.documentElement;
  const docScrollWidth = doc.scrollWidth;
  const allEls = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  let count = 0;
  while (node && count < 5000) {
    count++;
    if (!(node instanceof HTMLElement)) { node = walker.nextNode(); continue; }
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.right > viewportWidth + 0.5) {
      // For each overflowing element, walk up its ancestors and check
      // if any has overflow-x: hidden/auto/scroll. If so, the element is
      // contained and shouldn't contribute to doc scrollWidth.
      let containedBy = null;
      let p = node.parentElement;
      while (p) {
        const ovx = getComputedStyle(p).overflowX;
        if (ovx === "hidden" || ovx === "auto" || ovx === "scroll" || ovx === "clip") {
          containedBy = `${p.tagName.toLowerCase()}.${(p.className?.toString() || "").split(/\s+/)[0]} (ovx=${ovx})`;
          break;
        }
        p = p.parentElement;
      }
      allEls.push({
        cls: (node.className?.toString() || "").split(/\s+/).slice(0, 2).join(" "),
        tag: node.tagName,
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        containedBy: containedBy || "(none)",
      });
    }
    node = walker.nextNode();
  }
  // Sort by right edge descending — what's pushing the doc widest.
  allEls.sort((a, b) => b.right - a.right);
  // Filter to UNCONTAINED elements (the ones actually pushing scrollWidth).
  const uncontained = allEls.filter((e) => e.containedBy === "(none)");
  return { docScrollWidth, totalOverflowing: allEls.length, uncontained: uncontained.slice(0, 15), contained_sample: allEls.slice(0, 5) };
}, WIDTH);

console.log(JSON.stringify(report, null, 2));

await browser.close();
