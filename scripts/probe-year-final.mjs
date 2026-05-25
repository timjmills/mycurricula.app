// scripts/probe-year-final.mjs — final, narrower probes.
// Focus: print emulation, Today click in a fresh page, master toggle effect,
// keyboard nav, layout gap from removed sidebar, dev console errors.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/year-audit");
mkdirSync(OUT_DIR, { recursive: true });

async function seedAuth(context) {
  const seed = await context.newPage();
  await seed.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
    { waitUntil: "domcontentloaded" },
  );
  await seed.close();
}

const out = {};
const browser = await chromium.launch({ headless: true });

// DESKTOP — fresh page, no extra prior interactions
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await seedAuth(context);
  const page = await context.newPage();
  const consoleErrs = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200));
    if (m.type() === "warning") consoleErrs.push("WARN:" + m.text().slice(0, 200));
  });
  const pageErrs = [];
  page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 200)));

  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Initial state — does roadmap render lanes?
  const initial = await page.evaluate(() => ({
    lanes: document.querySelectorAll('[data-lane-subject]').length,
    h1Count: document.querySelectorAll("h1").length,
    h1VisibleCount: Array.from(document.querySelectorAll("h1")).filter(
      (h) => h.getBoundingClientRect().width > 0,
    ).length,
    bodyHeight: document.body.scrollHeight,
    docScroll: document.documentElement.scrollWidth,
    docClient: document.documentElement.clientWidth,
    timelineScrollWidth:
      document.querySelector('[class*="timelineScroll"]')?.scrollWidth ?? 0,
    timelineClientWidth:
      document.querySelector('[class*="timelineScroll"]')?.clientWidth ?? 0,
  }));
  out.desktop_initial = initial;
  console.log("desktop initial:", initial);

  // Layout gap: is there leftover whitespace where the YearSidebar used to be?
  const layout = await page.evaluate(() => {
    const body = document.querySelector('[class*="YearView_body"]');
    const content = document.querySelector(
      '[class*="YearView_contentArea"]',
    );
    if (!body || !content) return null;
    const br = body.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    return {
      bodyLeft: Math.round(br.left),
      bodyWidth: Math.round(br.width),
      contentLeft: Math.round(cr.left),
      contentWidth: Math.round(cr.width),
      gapLeft: Math.round(cr.left - br.left),
      bodyChildren: body.childElementCount,
    };
  });
  out.desktop_layout = layout;
  console.log("desktop layout:", layout);

  // Print emulation — capture how timeline behaves on paper
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(500);
  const printAudit = await page.evaluate(() => {
    const tl = document.querySelector('[class*="timelineScroll"]');
    return {
      tlScrollWidth: tl?.scrollWidth ?? 0,
      tlClientWidth: tl?.clientWidth ?? 0,
      tlOverflowX: tl ? getComputedStyle(tl).overflowX : null,
      printStyleSheets: document.styleSheets.length,
    };
  });
  out.desktop_print = printAudit;
  console.log("desktop print:", printAudit);
  await page.screenshot({
    path: resolve(OUT_DIR, "desktop-print-2.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: null });

  // Master toggle effect — does it show banner?
  const masterBtn = await page.$('button[aria-label*="Master mode"]');
  if (masterBtn) {
    await masterBtn.click({ force: true });
    await page.waitForTimeout(800);
    const bannerCheck = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          const t = el.textContent?.trim() ?? "";
          return /changes here affect the whole team|heads up/i.test(t);
        })
        .slice(0, 5);
      return all.map((el) => ({
        tag: el.tagName,
        cls: el.className?.toString().slice(0, 60) ?? "",
        textPreview: el.textContent?.trim().slice(0, 80) ?? "",
        visible: el.getBoundingClientRect().height > 0,
      }));
    });
    out.desktop_master_banner = bannerCheck;
    console.log("desktop master banner:", bannerCheck);
    await page.screenshot({
      path: resolve(OUT_DIR, "desktop-master-2.png"),
      fullPage: false,
    });
    const personalBtn = await page.$('button[aria-label*="Personal mode"]');
    if (personalBtn) await personalBtn.click({ force: true });
    await page.waitForTimeout(400);
  }

  // Today click test (collapse left-filter-panel first)
  const collapse = await page.$('button[aria-label*="Collapse"]');
  if (collapse) {
    await collapse.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }

  // Reset scroll, click Today
  await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    if (el) el.scrollLeft = 0;
  });
  await page.waitForTimeout(200);
  const beforeT = await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    return el?.scrollLeft ?? 0;
  });
  const todayBtn = await page.$('button[aria-label="Go to today"]');
  if (todayBtn) {
    await todayBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  const afterT = await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    return el?.scrollLeft ?? 0;
  });
  out.desktop_today = { before: beforeT, after: afterT, moved: afterT > beforeT };
  console.log("desktop today:", out.desktop_today);

  out.desktop_console = consoleErrs;
  out.desktop_pageErrs = pageErrs;
  console.log("desktop console errors:", consoleErrs.length, "pageerr:", pageErrs.length);

  await page.close();
  await context.close();
}

// PHONE — confirm Lane D h1 aria-hidden behavior + check for desktop leak
{
  const context = await browser.newContext({
    viewport: { width: 400, height: 800 },
  });
  await seedAuth(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const phoneState = await page.evaluate(() => {
    return {
      h1s: Array.from(document.querySelectorAll("h1")).map((h) => ({
        text: h.textContent?.trim(),
        inAriaHidden: !!h.closest('[aria-hidden="true"]'),
        visible: h.getBoundingClientRect().width > 0,
      })),
      mobileMounted:
        document.querySelectorAll('[class*="YearMobile_root"]').length > 0,
      desktopMounted:
        document.querySelectorAll('[class*="YearView_page"]').length > 0,
      // both wrappers in DOM with display:contents/none?
      bothWrappers:
        document.querySelectorAll('[aria-hidden="true"]').length,
    };
  });
  out.phone_state = phoneState;
  console.log("phone state:", phoneState);

  await page.close();
  await context.close();
}

await browser.close();
writeFileSync(
  resolve(process.cwd(), "year-audit-final.json"),
  JSON.stringify(out, null, 2),
);
console.log("\nDone — wrote year-audit-final.json");
