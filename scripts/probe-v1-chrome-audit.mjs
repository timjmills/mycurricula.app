/**
 * Evidence capture for the "v1 chrome still showing" audit.
 *
 * The user reports a LEFT SIDE PANEL on the live site that is not in the v2
 * design. Source reading cannot settle that — a layout can render something the
 * code makes look conditional. So this renders PRODUCTION and records, per route:
 * a full-page screenshot, and an inventory of what actually occupies the left
 * edge of the viewport.
 *
 * READ-ONLY: navigation and measurement only. No clicks that persist, no writes.
 * teacher_preferences is aborted so a stray theme-sync cannot touch the account.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState, redact } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "https://mycurricula.app");
const WIDTH = Number(arg("width", "1440"));
const OUT = path.join(process.cwd(), "docs/screenshots/v1-chrome-audit");
mkdirSync(OUT, { recursive: true });

const ROUTES = ["/weekly", "/daily", "/year", "/planner"];

const browser = await chromium.launch({ channel: "chrome" });
let state;
try {
  state = await authedStorageState(browser, { base: BASE, next: "/weekly", timeout: 120000, settleMs: 2500 });
} catch (e) {
  console.error("AUTH FAILED:", redact(String(e)));
  await browser.close();
  process.exit(2);
}
const ctx = await browser.newContext({ storageState: state, viewport: { width: WIDTH, height: 900 } });
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
const page = await ctx.newPage();

const report = [];
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  // Wait for real data, not just markup — an unhydrated page misrepresents the
  // chrome (panels can mount late).
  await page
    .waitForFunction(
      () => document.querySelectorAll('[data-planner-item^="lesson:"]').length > 0,
      null,
      { timeout: 120000, polling: 1000 },
    )
    .catch(() => {});
  await page.waitForTimeout(3000);

  // WHAT IS ACTUALLY AT THE LEFT EDGE. Hit-test a vertical line ~24px in, down
  // the viewport, and walk up to the nearest identifiable container. That
  // answers "what is this panel" without guessing from class names alone.
  const leftEdge = await page.evaluate(() => {
    const seen = new Map();
    for (let y = 120; y < window.innerHeight - 40; y += 40) {
      const el = document.elementFromPoint(24, y);
      if (!el) continue;
      let n = el;
      let label = "";
      while (n && n !== document.body) {
        const cls = typeof n.className === "string" ? n.className : "";
        const id = n.id ? `#${n.id}` : "";
        const aria = n.getAttribute?.("aria-label");
        const role = n.getAttribute?.("role");
        if (aria || role === "navigation" || /nav|rail|side|panel|filter/i.test(cls) || id) {
          label = `${n.tagName.toLowerCase()}${id}${aria ? `[aria-label="${aria}"]` : ""}${role ? `[role=${role}]` : ""} .${cls.split(/\s+/).slice(0, 3).join(".")}`;
          break;
        }
        n = n.parentElement;
      }
      if (!label) label = `${el.tagName.toLowerCase()} .${(typeof el.className === "string" ? el.className : "").split(/\s+/)[0]}`;
      const box = n && n.getBoundingClientRect ? n.getBoundingClientRect() : null;
      const key = label;
      if (!seen.has(key)) seen.set(key, { label, width: box ? Math.round(box.width) : null, left: box ? Math.round(box.left) : null });
    }
    return [...seen.values()];
  });

  // Named v1 suspects, asserted by presence rather than inferred from the flag.
  const suspects = await page.evaluate(() => ({
    sideNav: document.querySelectorAll('[class*="sidenav" i], [class*="side-nav" i]').length,
    globalRail: document.querySelectorAll('[class*="rail" i]').length,
    leftFilterPanel: document.querySelectorAll('[class*="filter" i][class*="panel" i], [class*="leftfilter" i]').length,
    topBarV1: document.querySelectorAll('[class*="topbar" i]').length,
    masterBanner: document.querySelectorAll('[class*="masterbanner" i]').length,
    consoleTabs: [...document.querySelectorAll("a,button")]
      .map((b) => b.textContent?.trim())
      .filter((t) => ["Day", "Week", "Year", "Plan", "Post", "Teach"].includes(t ?? "")),
  }));

  console.log(`\n${route}`);
  console.log(`  left-edge occupants:`);
  for (const l of leftEdge) console.log(`    ${l.label}  (w=${l.width} left=${l.left})`);
  console.log(`  suspects: ${JSON.stringify(suspects)}`);

  const file = path.join(OUT, `${route.replace(/\//g, "") || "root"}-${WIDTH}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.push({ route, width: WIDTH, leftEdge, suspects, screenshot: file });
}

writeFileSync(path.join(OUT, `report-${WIDTH}.json`), JSON.stringify(report, null, 2));
console.log(`\nartifacts → ${OUT}`);
await browser.close();
