// Diagnose why the /year blue header band appears to stop mid-timeline.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = process.env.PROBE_BASE ?? "https://mycurricula.app";
const OUT = resolve(process.cwd(), "docs/screenshots/year-blue-band");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// Find every QuarterMonthWeekHeader instance (there may be one per active subject)
const headers = await page.evaluate(() => {
  const all = Array.from(
    document.querySelectorAll('[class*="QuarterMonthWeekHeader_header"]'),
  );
  return all.map((h, i) => {
    const rect = h.getBoundingClientRect();
    const cs = getComputedStyle(h);
    const months = Array.from(h.querySelectorAll('[class*="monthCell"]')).map(
      (m) => ({
        label: m.textContent?.trim(),
        rect: {
          x: m.getBoundingClientRect().x,
          w: m.getBoundingClientRect().width,
        },
      }),
    );
    return {
      idx: i,
      cls: h.className,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      bg: cs.backgroundImage,
      bgSize: cs.backgroundSize,
      gridTemplateColumns: getComputedStyle(h.children[0] ?? h)
        .gridTemplateColumns,
      monthsCount: months.length,
      monthLabels: months.map((m) => m.label),
      ariaHidden:
        h.closest("[aria-hidden]")?.getAttribute("aria-hidden") ?? null,
      parentDisplay: getComputedStyle(h.parentElement).display,
    };
  });
});
console.log(JSON.stringify(headers, null, 2));

// Screenshot the top of /year
await page.screenshot({
  path: resolve(OUT, "top.png"),
  clip: { x: 0, y: 0, width: 1280, height: 400 },
});
console.log("→ saved top.png");

await browser.close();
