// Probe key element dimensions to figure out why the grid is overflowing.
import { chromium } from "playwright";

const BASE = process.env.RESPONSIVE_CHECK_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const WIDTH = Number(process.env.AUDIT_WIDTH ?? 1280);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
const page = await context.newPage();
await page.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const probes = [
    "html",
    "body",
    ".cp-root",
    "main",
    "header",
    'aside[class*="LeftFilterPanel"]',
    'aside[class*="left-filter-panel"]',
    'div[class*="WeeklyShell_page"]',
    'div[class*="WeeklyShell_bodyRow"]',
    'div[class*="WeeklyShell_body__"]',
    'div[class*="WeeklyShell_gridSlot"]',
    'div[class*="WeeklyGrid_page"]',
    'div[class*="WeeklyGrid_scroll"]',
    'div[class*="WeeklyGrid_grid__"]',
  ];
  return probes.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, found: false };
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      tag: el.tagName,
      cls:
        typeof el.className === "string"
          ? el.className.split(/\s+/).slice(0, 2).join(" ")
          : "",
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      right: Math.round(rect.right),
      display: cs.display,
      flex: cs.flex,
      gridTemplateColumns: cs.gridTemplateColumns,
      minWidth: cs.minWidth,
      overflow: cs.overflow,
      overflowX: cs.overflowX,
    };
  });
});

for (const r of result) {
  if (!r.found && r.left == null) {
    console.log(`MISSING ${r.sel}`);
    continue;
  }
  console.log(
    `${r.sel.padEnd(45)} left=${String(r.left).padStart(4)} w=${String(r.width).padStart(4)} ${r.display ?? ""} ${r.gridTemplateColumns ? "grid-cols=[" + r.gridTemplateColumns.slice(0, 60) + "]" : ""} ${r.minWidth ? "min-w=" + r.minWidth : ""} ${r.overflowX ? "ovx=" + r.overflowX : ""}`,
  );
}

await browser.close();
