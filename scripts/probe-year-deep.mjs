// scripts/probe-year-deep.mjs — focused follow-up probes.
//
// Investigates:
//   1. Lane D aria-hidden subtree effectiveness — are both h1s still
//      reachable via screen-reader? heading enumeration in the a11y tree
//      (Playwright accessibility snapshot).
//   2. Tooltip on disabled Filters button — does it actually appear on hover?
//      (Tooltips with `disabled` buttons often suppressed in browsers.)
//   3. Today button at desktop — does it move scroll back to center?
//   4. Progression toggle at desktop — does role="radio" click actually swap?
//   5. Hydration mismatch source on desktop (server-rendered with isPhone=false)
//   6. Layout gap from removed YearSidebar
//   7. Print stylesheet emulation: media=print → does roadmap re-flow?
//   8. Personal/Master toggle reachability + flip effect on /year

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/year-audit");
mkdirSync(OUT_DIR, { recursive: true });

const findings = {};

async function seedAuth(context) {
  const seed = await context.newPage();
  const url = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`;
  await seed.goto(url, { waitUntil: "domcontentloaded" });
  await seed.close();
}

const browser = await chromium.launch({ headless: true });

// ── DESKTOP ─────────────────────────────────────────────────────────
{
  const tier = "desktop";
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await seedAuth(context);
  const page = await context.newPage();
  const consoleAll = [];
  page.on("console", (m) => consoleAll.push({ type: m.type(), text: m.text().slice(0, 300) }));
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Note: left filter panel is shown by default — try to close so we can
  // exercise primary controls. Find the collapse button.
  const collapseBtn = await page.$('button[aria-label*="Collapse"], button[aria-label*="Close"][aria-label*="filter"]');
  if (collapseBtn) {
    await collapseBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // 1. Heading enumeration via DOM, filtered by aria-hidden subtree
  const desktopHeadings = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    return all.map((h) => ({
      level: parseInt(h.tagName.slice(1), 10),
      text: h.textContent?.trim().slice(0, 60) ?? "",
      inAriaHidden: !!h.closest('[aria-hidden="true"]'),
      visible: h.getBoundingClientRect().width > 0,
    }));
  });
  findings.desktop_headings = desktopHeadings;
  findings.desktop_yearly_heading_count = desktopHeadings.filter((h) => /Yearly View/i.test(h.text) && !h.inAriaHidden).length;

  // 2. Visible h1 layout — is the h1 in the visible tree the desktop view?
  const h1Layout = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("h1")).map((h) => {
      const wrapper = h.closest("[aria-hidden]");
      return {
        text: h.textContent?.trim(),
        wrapperAriaHidden: wrapper?.getAttribute("aria-hidden") ?? null,
        wrapperDisplay: wrapper ? getComputedStyle(wrapper).display : null,
        bb: h.getBoundingClientRect().width > 0,
      };
    });
  });
  findings.desktop_h1_layout = h1Layout;

  // 3. Layout gap from removed YearSidebar — is there leftover empty space at left?
  const layoutGap = await page.evaluate(() => {
    const body = document.querySelector('[class*="YearView_body"]');
    const content = document.querySelector('[class*="YearView_contentArea"]');
    if (!body || !content) return null;
    const br = body.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    return {
      bodyLeft: Math.round(br.left),
      bodyWidth: Math.round(br.width),
      contentLeft: Math.round(cr.left),
      contentWidth: Math.round(cr.width),
      gapLeft: Math.round(cr.left - br.left),
      childCount: body.childElementCount,
    };
  });
  findings.desktop_layoutGap = layoutGap;

  // 4. Today button click + measure scroll change properly
  await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    if (el) el.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const beforeToday = await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    return el?.scrollLeft ?? 0;
  });
  await page.click('button[aria-label="Go to today"]');
  await page.waitForTimeout(1000);
  const afterToday = await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    return el?.scrollLeft ?? 0;
  });
  findings.desktop_today = { before: beforeToday, after: afterToday, moved: afterToday !== beforeToday };

  // 5. Hover Filters disabled — does tooltip appear?
  const filtersBtn = await page.$('button[aria-label*="Filters"]');
  await filtersBtn.hover({ force: true });
  await page.waitForTimeout(700);
  const tooltipState = await page.evaluate(() => {
    const tips = document.querySelectorAll('[role="tooltip"]');
    return Array.from(tips).map((t) => ({
      text: t.textContent?.trim(),
      visible: t.getBoundingClientRect().width > 0 && getComputedStyle(t).visibility !== "hidden",
    }));
  });
  findings.desktop_filtersTooltip = tooltipState;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);

  // 6. Click "Progression" toggle — confirm radio role activates
  const progRadio = await page.$('[role="radio"][aria-label*="Progression"], button[aria-label*="Progression"]');
  if (progRadio) {
    await progRadio.click({ force: true });
    await page.waitForTimeout(800);
    const inProgression = await page.evaluate(() => document.body.innerText.includes("LESSON STATUS"));
    findings.desktop_progressionAfterClick = inProgression;
    // toggle back
    const roadRadio = await page.$('[role="radio"][aria-label*="Roadmap"], button[aria-label*="Roadmap"]');
    if (roadRadio) await roadRadio.click({ force: true });
    await page.waitForTimeout(500);
  }

  // 7. Personal/Master toggle: flip Master and see master banner appear, then return
  const masterBtn = await page.$('button[aria-label*="Master mode"]');
  if (masterBtn) {
    await masterBtn.click();
    await page.waitForTimeout(700);
    const masterBannerVisible = await page.evaluate(() => {
      const banner = document.querySelector('[class*="masterBanner"], [class*="MasterBanner"], [class*="master-banner"]');
      return banner ? banner.getBoundingClientRect().height > 0 : false;
    });
    findings.desktop_masterBanner = masterBannerVisible;
    await page.screenshot({ path: resolve(OUT_DIR, "desktop-master-mode.png"), fullPage: false });
    const personalBtn = await page.$('button[aria-label*="Personal mode"]');
    if (personalBtn) await personalBtn.click();
    await page.waitForTimeout(300);
  }

  // 8. Print-media emulation: does it re-flow?
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT_DIR, "desktop-print-emulated.png"), fullPage: true });
  const printAudit = await page.evaluate(() => {
    const tl = document.querySelector('[class*="timelineScroll"]');
    return {
      timelineWidth: tl ? tl.scrollWidth : 0,
      timelineClient: tl ? tl.clientWidth : 0,
      timelineOverflow: tl ? getComputedStyle(tl).overflowX : null,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
  findings.desktop_printAudit = printAudit;
  await page.emulateMedia({ media: null });

  // 9. Tab keyboard nav — count Tab stops on /year and detect off-screen
  await page.click("body"); // reset focus
  const tabStops = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        label:
          el.getAttribute("aria-label") ??
          el.textContent?.trim().slice(0, 30) ??
          "",
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        offscreenY: r.y < 0 || r.y > window.innerHeight,
        offscreenX: r.x < 0 || r.x > window.innerWidth,
      };
    });
    if (stop) tabStops.push(stop);
  }
  findings.desktop_tabStops = {
    count: tabStops.length,
    offscreen: tabStops.filter((s) => s.offscreenX || s.offscreenY).length,
    last10: tabStops.slice(-10),
  };

  findings.desktop_console = consoleAll.filter((c) => c.type === "error" || c.type === "warning");

  await page.close();
  await context.close();
}

// ── PHONE: confirm h1 visibility, sticky chrome, swipe scroll, list rendering ──
{
  const context = await browser.newContext({
    viewport: { width: 400, height: 800 },
    hasTouch: true,
    isMobile: true,
  });
  await seedAuth(context);
  const page = await context.newPage();
  const consoleAll = [];
  page.on("console", (m) => consoleAll.push({ type: m.type(), text: m.text().slice(0, 200) }));
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Heading enumeration via DOM
  const phoneHeadings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => ({
      level: parseInt(h.tagName.slice(1), 10),
      text: h.textContent?.trim().slice(0, 60) ?? "",
      inAriaHidden: !!h.closest('[aria-hidden="true"]'),
      visible: h.getBoundingClientRect().width > 0,
    }));
  });
  findings.phone_headings = phoneHeadings;
  findings.phone_yearly_heading_count = phoneHeadings.filter((h) => /Yearly View/i.test(h.text) && !h.inAriaHidden).length;

  // Confirm YearMobile is the visible variant
  const phoneState = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("h1"));
    return all.map((h) => {
      const wrapper = h.closest("[aria-hidden]");
      return {
        text: h.textContent?.trim(),
        ariaHidden: wrapper?.getAttribute("aria-hidden") ?? null,
        cls: h.className,
        visible: h.getBoundingClientRect().width > 0,
      };
    });
  });
  findings.phone_h1 = phoneState;

  // Personal/Master toggle still reachable at phone?
  const masterBtnInfo = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label*="Master mode"]');
    if (!b) return { exists: false };
    const r = b.getBoundingClientRect();
    return {
      exists: true,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      inViewport: r.x >= 0 && r.right <= window.innerWidth && r.y >= 0 && r.bottom <= window.innerHeight,
    };
  });
  findings.phone_masterBtn = masterBtnInfo;

  // Subject cards rendered? Count
  const cardCount = await page.evaluate(() => {
    return document.querySelectorAll('[class*="YearMobile_list"] li, [class*="YearMobile"] [class*="card"]').length;
  });
  findings.phone_cardCount = cardCount;

  // Phone: is the desktop YearView still in the DOM (bundle / a11y concern)?
  const desktopStillMounted = await page.evaluate(() => {
    const dt = document.querySelectorAll('[class*="YearView_page"]').length;
    const mb = document.querySelectorAll('[class*="YearMobile_root"]').length;
    return { desktopCount: dt, mobileCount: mb };
  });
  findings.phone_bothMounted = desktopStillMounted;

  await page.screenshot({ path: resolve(OUT_DIR, "phone-detail.png"), fullPage: true });

  findings.phone_console = consoleAll.filter((c) => c.type === "error" || c.type === "warning");

  await page.close();
  await context.close();
}

// ── TABLET: tooltip on disabled button ───────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  await seedAuth(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const filtersBtn = await page.$('button[aria-label*="Filters"]');
  await filtersBtn.hover({ force: true });
  await page.waitForTimeout(800);
  const tooltipState = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="tooltip"], [data-tooltip]'))
      .map((t) => ({
        text: t.textContent?.trim(),
        role: t.getAttribute("role"),
        visible: t.getBoundingClientRect().width > 0 && getComputedStyle(t).visibility !== "hidden",
      }));
  });
  findings.tablet_filtersTooltip = tooltipState;

  // CurriculumFilter checkbox toggle — does it actually filter lanes?
  const cfBtn = await page.$('button:has-text("Curriculum")');
  if (cfBtn) {
    const lanesBefore = await page.evaluate(() => document.querySelectorAll('[data-lane-subject]').length);
    await cfBtn.click();
    await page.waitForTimeout(500);
    // Uncheck Reading
    const readingCheck = await page.$('label:has-text("Reading") input[type="checkbox"]');
    if (readingCheck) {
      await readingCheck.click();
      await page.waitForTimeout(400);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const lanesAfter = await page.evaluate(() => document.querySelectorAll('[data-lane-subject]').length);
    findings.tablet_curriculumFilterEffect = { before: lanesBefore, after: lanesAfter, filtered: lanesAfter < lanesBefore };
  }

  await page.close();
  await context.close();
}

await browser.close();
writeFileSync(resolve(process.cwd(), "year-audit-deep.json"), JSON.stringify(findings, null, 2));
console.log("Deep probe complete. Wrote year-audit-deep.json");
console.log(JSON.stringify(findings, null, 2));
