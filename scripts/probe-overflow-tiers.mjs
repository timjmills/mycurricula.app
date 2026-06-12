// scripts/probe-overflow-tiers.mjs — post-fix verification at the CLAUDE.md
// responsive tiers + the owner's 1727px viewport: no document-level
// horizontal scroll, and the lesson card fits its dock column.
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

let failures = 0;
function assert(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}

const page = await context.newPage();

async function checkTier(w, h, label) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/daily`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2200);
  // Select a lesson if the planner list is visible (desktop/tablet); on
  // phone the day list may need a tap-through — best-effort.
  const row = page.locator('[data-planner-item^="lesson:"]').first();
  if (await row.count()) {
    const rbox = await row.boundingBox();
    if (rbox) {
      await page.mouse.click(rbox.x + rbox.width * 0.4, rbox.y + 12);
      await page.waitForTimeout(1200);
    }
  }
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const band = document.querySelector('[class*="lesson-detail_band_"]');
    const root = band?.closest('[class*="lesson-detail_root_"]');
    const col = root?.closest("[data-slot]");
    const r = (e) => {
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) };
    };
    return {
      docScrollX: doc.scrollWidth > doc.clientWidth + 1,
      docW: doc.clientWidth,
      docScrollW: doc.scrollWidth,
      root: r(root),
      col: r(col),
      zoom: root ? getComputedStyle(root).zoom : null,
    };
  });
  console.log(`\n--- ${label} (${w}x${h}) ---`);
  console.log(JSON.stringify(m));
  assert(
    !m.docScrollX,
    `${label}: no document-level horizontal scroll (doc ${m.docScrollW} <= ${m.docW})`,
  );
  if (m.root && m.col) {
    assert(
      m.root.r <= m.col.r + 2 && m.root.l >= m.col.l - 2,
      `${label}: lesson card fits its dock column (card ${m.root.l}-${m.root.r}, col ${m.col.l}-${m.col.r})`,
    );
  } else {
    console.log(`${label}: lesson detail not visible at this tier (ok on phone)`);
  }
  await page.screenshot({ path: path.join(OUT, `tier-${w}.png`) });
}

await checkTier(1727, 970, "owner viewport");
await checkTier(1280, 900, "desktop");
await checkTier(768, 950, "tablet");
await checkTier(400, 800, "phone");

await browser.close();
console.log(failures === 0 ? "\nALL TIER CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
