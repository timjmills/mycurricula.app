// scripts/probe-daily-right-panel.mjs — reproduce the daily right-panel bug.
//
// Tests BOTH grid and list view modes (the latter is where the user
// reported the bug — wide right rail covering the content area).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const LABEL = process.env.LABEL ?? "before";
const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const OUT_DIR = path.resolve(
  process.cwd(),
  "docs/screenshots/daily-right-panel-bug",
);
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();
const bs = await context.newPage();
await bs.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/daily`,
  { waitUntil: "networkidle" },
);
await bs.close();

async function probe(page, t, modeLabel) {
  const info = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const listModeBody = document.querySelector('[class*="listModeBody"]');
    const dailyList = document.querySelector(
      "h1.cp-list-h1, [class*='dailyList'], [class*='DailyList']",
    );
    // Find DailyList by searching for the main list element
    const dlHeading = Array.from(document.querySelectorAll("h1")).find((h) =>
      /sunday|monday|tuesday|wednesday|thursday/i.test(h.textContent || ""),
    );
    const dailyListContainer =
      dlHeading?.closest('[class*="dailyList"]') ??
      dlHeading?.parentElement?.parentElement;
    const aside = document.querySelector('aside[aria-label*="esources"]');
    const stackedHeader = document.querySelector('[class*="stackedHeader"]');
    const tabStrip = document.querySelector('[class*="tabStrip"]');

    function rectOf(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }

    return {
      html: { scrollWidth: html.scrollWidth, clientWidth: html.clientWidth },
      body: { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth },
      hasHScroll:
        html.scrollWidth > html.clientWidth ||
        body.scrollWidth > body.clientWidth,
      lsRailMode: window.localStorage.getItem("mycurricula:rail-mode"),
      listModeBody: rectOf(listModeBody),
      dailyListContainer: rectOf(dailyListContainer),
      asideRail: rectOf(aside),
      stackedHeaderVisible: !!stackedHeader,
      tabStripVisible: !!tabStrip,
    };
  });
  console.log(
    `\n${modeLabel} | ${t.name} ${t.width}x${t.height}  label=${LABEL}`,
  );
  for (const [k, v] of Object.entries(info)) {
    console.log(`  ${k}:`, JSON.stringify(v));
  }
  const file = path.join(
    OUT_DIR,
    `${LABEL}__${modeLabel}__${t.name}-${t.width}x${t.height}.png`,
  );
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  -> screenshot: ${file}`);
}

for (const t of TIERS) {
  // ── GRID mode (default) ────────────────────────────────────────
  const page = await context.newPage();
  await page.setViewportSize({ width: t.width, height: t.height });
  await page.goto(`${BASE}/daily`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await probe(page, t, "grid-tabbed");
  await page.close();

  // ── LIST mode ─────────────────────────────────────────────────
  // Switch to list view by setting viewMode in app-state via a click
  // on the "List" button in the top bar.
  const pageList = await context.newPage();
  await pageList.setViewportSize({ width: t.width, height: t.height });
  await pageList.goto(`${BASE}/daily`, { waitUntil: "networkidle" });
  await pageList.waitForTimeout(800);
  // Click the List view button
  try {
    await pageList.click('button:has-text("List"):not([aria-label*="esson"])', {
      timeout: 1500,
    });
    console.log(`  ${t.name}: clicked List view`);
  } catch (e) {
    // Try by aria-label
    try {
      await pageList.click('[aria-label*="List view"i]', { timeout: 1500 });
    } catch {
      console.log(`  ${t.name}: no List button found`);
    }
  }
  await pageList.waitForTimeout(600);
  await probe(pageList, t, "list-tabbed");
  await pageList.close();

  // ── LIST mode + STACKED rail ─────────────────────────────────
  const pageLS = await context.newPage();
  await pageLS.setViewportSize({ width: t.width, height: t.height });
  await pageLS.addInitScript(() => {
    try {
      window.localStorage.setItem("mycurricula:rail-mode", "stacked");
    } catch {}
  });
  await pageLS.goto(`${BASE}/daily`, { waitUntil: "networkidle" });
  await pageLS.waitForTimeout(800);
  try {
    await pageLS.click('button:has-text("List"):not([aria-label*="esson"])', {
      timeout: 1500,
    });
  } catch {
    try {
      await pageLS.click('[aria-label*="List view"i]', { timeout: 1500 });
    } catch {}
  }
  await pageLS.waitForTimeout(600);
  await probe(pageLS, t, "list-stacked");
  await pageLS.close();
}

await browser.close();
