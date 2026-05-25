// scripts/probe-year.mjs — comprehensive /year audit probe.
//
// Runs Chromium against the local dev server at three viewport tiers,
// captures structural facts, screenshots, button/link dimensions,
// heading hierarchy, sticky chrome ratio, h-scroll, console errors,
// and exercises interactive controls (clicks Today, MonthPicker,
// CurriculumFilter, Roadmap/Progression toggle, StatusFilterBar,
// LaneCard minimize chevrons, disabled Filters/Export, timeline
// horizontal scroll, etc.).
//
// Writes:
//   docs/screenshots/year-audit/{phone,tablet,desktop}.png
//   docs/screenshots/year-audit/<tier>-<scene>.png  (post-interaction)
//   year-audit-probe.json — machine-readable findings

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

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const findings = { tiers: {}, errors: [] };

async function seedAuth(context) {
  const seed = await context.newPage();
  const url = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`;
  const r = await seed.goto(url, { waitUntil: "domcontentloaded" });
  await seed.close();
  return r?.status() ?? 0;
}

async function auditPage(page) {
  return await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const h1s = Array.from(document.querySelectorAll("h1")).map((h) => ({
      text: h.textContent?.trim().slice(0, 80) ?? "",
      ariaHidden: h.closest("[aria-hidden]")?.getAttribute("aria-hidden") ?? null,
      visible:
        h.getBoundingClientRect().width > 0 &&
        h.getBoundingClientRect().height > 0,
    }));
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    ).map((h) => ({
      level: parseInt(h.tagName.slice(1), 10),
      text: h.textContent?.trim().slice(0, 80) ?? "",
      hidden: !!h.closest('[aria-hidden="true"]'),
    }));
    const buttons = Array.from(
      document.querySelectorAll(
        'button, a, [role="button"], [role="tab"], [role="radio"], [role="checkbox"]',
      ),
    )
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          tag: b.tagName,
          role: b.getAttribute("role"),
          label:
            b.getAttribute("aria-label") ??
            b.textContent?.trim().slice(0, 40) ??
            "",
          w: Math.round(r.width),
          h: Math.round(r.height),
          disabled:
            b.hasAttribute("disabled") ||
            b.getAttribute("aria-disabled") === "true",
        };
      });
    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      hasHorizontalScroll: doc.scrollWidth > doc.clientWidth + 1,
      bodyScrollHeight: body.scrollHeight,
      h1Count: h1s.length,
      h1s,
      headings,
      buttons,
      // sticky chrome height (top-bar) — measure offsetHeight of any
      // header with position sticky/fixed in the viewport's top region.
      stickyChromeHeight: (() => {
        const fixedish = Array.from(document.querySelectorAll("header, [class*='topBar'], [class*='top-bar']"));
        let h = 0;
        for (const el of fixedish) {
          const r = el.getBoundingClientRect();
          if (r.top < 30 && r.height > 0) h = Math.max(h, r.height);
        }
        return h;
      })(),
    };
  });
}

async function probeTier(browser, tier) {
  const tierFindings = {
    tier: tier.name,
    width: tier.width,
    height: tier.height,
    nav: null,
    audit: null,
    smallButtons: [],
    hScroll: null,
    h1s: null,
    stickyOverflowPctPhone: null,
    consoleErrors: [],
    pageErrors: [],
    interactions: {},
    timelineWidth: null,
    hexLeakage: null,
  };

  const context = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    deviceScaleFactor: 1,
  });

  const seedStatus = await seedAuth(context);
  tierFindings.nav = { seedStatus };

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error")
      tierFindings.consoleErrors.push(msg.text().slice(0, 200));
    if (msg.type() === "warning")
      tierFindings.consoleErrors.push("WARN: " + msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => {
    tierFindings.pageErrors.push(err.message.slice(0, 200));
  });

  let resp;
  try {
    resp = await page.goto(`${BASE}/year`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
  } catch (e) {
    tierFindings.nav.error = e.message;
  }
  tierFindings.nav.status = resp?.status() ?? 0;

  await page.waitForTimeout(1200);

  // Full-page screenshot baseline
  await page.screenshot({
    path: resolve(OUT_DIR, `${tier.name}.png`),
    fullPage: true,
  });

  const audit = await auditPage(page);
  tierFindings.audit = audit;
  tierFindings.hScroll = audit.hasHorizontalScroll;
  tierFindings.h1s = audit.h1s;

  // sticky chrome %
  tierFindings.stickyOverflowPctPhone =
    tier.name === "phone"
      ? Math.round((audit.stickyChromeHeight / tier.height) * 100)
      : null;

  // touch-target audit — small buttons that are NOT in aria-hidden subtrees
  tierFindings.smallButtons = audit.buttons
    .filter((b) => (b.w < 44 || b.h < 44) && !b.disabled)
    .map((b) => ({ label: b.label, w: b.w, h: b.h, role: b.role, tag: b.tag }));

  // measure the timeline scroll container width vs scrollWidth
  const timelineMeasure = await page.evaluate(() => {
    const el = document.querySelector('[class*="timelineScroll"]');
    if (!el) return null;
    return {
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      hasInternalHScroll: el.scrollWidth > el.clientWidth + 1,
    };
  });
  tierFindings.timelineWidth = timelineMeasure;

  // hex leakage check: scan inline styles of all elements
  tierFindings.hexLeakage = await page.evaluate(() => {
    const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
    const found = [];
    const els = document.querySelectorAll("[style]");
    for (const el of els) {
      const s = el.getAttribute("style") ?? "";
      const m = s.match(hexRe);
      if (m) {
        found.push({
          tag: el.tagName,
          cls: el.className?.toString().slice(0, 60) ?? "",
          hex: m.join(","),
        });
      }
    }
    return found.slice(0, 10);
  });

  // ── INTERACTIONS ────────────────────────────────────────────────────
  const interactions = {};

  // 1. Filters button (should be disabled)
  try {
    const filtersBtn = await page.$('button[aria-label*="Filters"]');
    if (filtersBtn) {
      const before = await audit.docScrollWidth;
      await filtersBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      const aft = await auditPage(page);
      interactions.filtersClick = {
        exists: true,
        disabled: await filtersBtn.isDisabled(),
        ariaDisabled: await filtersBtn.getAttribute("aria-disabled"),
        domChanged: aft.docScrollWidth !== before,
      };
    } else {
      interactions.filtersClick = { exists: false };
    }
  } catch (e) {
    interactions.filtersClick = { error: e.message };
  }

  // 2. Export button (should be disabled)
  try {
    const exportBtn = await page.$('button[aria-label*="Export"]');
    if (exportBtn) {
      await exportBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      interactions.exportClick = {
        exists: true,
        disabled: await exportBtn.isDisabled(),
        ariaDisabled: await exportBtn.getAttribute("aria-disabled"),
      };
    } else {
      interactions.exportClick = { exists: false };
    }
  } catch (e) {
    interactions.exportClick = { error: e.message };
  }

  // 3. Tooltip on Filters (hover)
  try {
    const filtersBtn = await page.$('button[aria-label*="Filters"]');
    if (filtersBtn) {
      await filtersBtn.hover();
      await page.waitForTimeout(400);
      // tooltip portal might be at body root
      const tooltipText = await page.evaluate(() => {
        const tips = document.querySelectorAll(
          '[role="tooltip"], [class*="tooltip"], [class*="Tooltip"]',
        );
        return Array.from(tips)
          .map((t) => t.textContent?.trim())
          .filter(Boolean)
          .slice(0, 3);
      });
      interactions.filtersTooltip = tooltipText;
      await page.mouse.move(0, 0);
    }
  } catch (e) {
    interactions.filtersTooltip = { error: e.message };
  }

  // 4. Today button
  try {
    const todayBtn = await page.$('button[aria-label="Go to today"]');
    if (todayBtn) {
      const before = await page.evaluate(() => {
        const el = document.querySelector('[class*="timelineScroll"]');
        return el?.scrollLeft ?? 0;
      });
      // First scroll the timeline so we can detect movement
      await page.evaluate(() => {
        const el = document.querySelector('[class*="timelineScroll"]');
        if (el) el.scrollLeft = 0;
      });
      await page.waitForTimeout(100);
      await todayBtn.click();
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => {
        const el = document.querySelector('[class*="timelineScroll"]');
        return el?.scrollLeft ?? 0;
      });
      interactions.todayBtn = { before, after, moved: after > before };
    }
  } catch (e) {
    interactions.todayBtn = { error: e.message };
  }

  // 5. Roadmap | Progression toggle
  try {
    const progressionBtn = await page.$('button[aria-label*="Progression"], [role="radio"][aria-label*="Progression"]');
    if (progressionBtn) {
      const before = await page.evaluate(() => {
        return document.body.innerText.includes("LESSON STATUS");
      });
      await progressionBtn.click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => {
        return document.body.innerText.includes("LESSON STATUS");
      });
      interactions.progressionToggle = { before, after, switched: !before && after };
      // screenshot in progression mode
      await page.screenshot({
        path: resolve(OUT_DIR, `${tier.name}-progression.png`),
        fullPage: false,
      });
      // toggle back
      const roadmapBtn = await page.$('button[aria-label*="Roadmap"], [role="radio"][aria-label*="Roadmap"]');
      if (roadmapBtn) {
        await roadmapBtn.click();
        await page.waitForTimeout(400);
      }
    } else {
      interactions.progressionToggle = { exists: false };
    }
  } catch (e) {
    interactions.progressionToggle = { error: e.message };
  }

  // 6. StatusFilterBar — click "Completed"
  try {
    const completedChip = await page.$('button:has-text("Completed"), [role="checkbox"]:has-text("Completed")');
    if (completedChip) {
      await completedChip.click();
      await page.waitForTimeout(300);
      interactions.statusFilter = { clickedCompleted: true };
    }
  } catch (e) {
    interactions.statusFilter = { error: e.message };
  }

  // 7. LaneCard minimize chevrons
  try {
    const minimizeBtns = await page.$$('button[aria-label*="Minimize"]');
    interactions.minimizeBtns = { count: minimizeBtns.length };
    if (minimizeBtns.length > 0) {
      await minimizeBtns[0].click();
      await page.waitForTimeout(400);
      const restoreCount = (await page.$$('button[aria-label*="Restore"]')).length;
      interactions.minimizeBtns.afterMinimizeRestores = restoreCount;
      // Restore back
      const restoreBtn = await page.$('button[aria-label*="Restore"]');
      if (restoreBtn) {
        await restoreBtn.click();
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    interactions.minimizeBtns = { error: e.message };
  }

  // 8. MonthPicker
  try {
    const monthBtn = await page.$('button[aria-label*="month" i], button[aria-haspopup="listbox"], button[aria-haspopup="menu"]');
    if (monthBtn) {
      await monthBtn.click();
      await page.waitForTimeout(500);
      const popoverItems = await page.$$('[role="menuitem"], [role="option"], button[data-month]');
      interactions.monthPicker = {
        opened: popoverItems.length > 0,
        itemCount: popoverItems.length,
      };
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  } catch (e) {
    interactions.monthPicker = { error: e.message };
  }

  // 9. CurriculumFilter button (open the popover)
  try {
    const cfBtn = await page.$('button:has-text("Curriculum"), button[aria-label*="curriculum" i], button[aria-label*="subject" i]');
    if (cfBtn) {
      await cfBtn.click();
      await page.waitForTimeout(500);
      const checkboxes = await page.$$('[role="dialog"] [role="checkbox"], [role="dialog"] input[type="checkbox"], [class*="popover"] input[type="checkbox"]');
      interactions.curriculumFilter = {
        opened: checkboxes.length > 0,
        checkboxCount: checkboxes.length,
      };
      // close
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  } catch (e) {
    interactions.curriculumFilter = { error: e.message };
  }

  // 10. Sticky chrome — measure if QuarterMonthWeekHeader stays at top during scroll
  try {
    await page.evaluate(() => {
      const el = document.querySelector('[class*="timelineScroll"]');
      if (el) el.scrollLeft = 1000;
    });
    await page.waitForTimeout(300);
    const stickyCheck = await page.evaluate(() => {
      const header = document.querySelector(
        '[class*="QuarterMonthWeekHeader"], [class*="quarterMonthWeekHeader"]',
      );
      if (!header) return { exists: false };
      const r = header.getBoundingClientRect();
      const parent = document.querySelector('[class*="timelineScroll"]');
      const pr = parent?.getBoundingClientRect();
      return {
        exists: true,
        top: Math.round(r.top),
        parentTop: pr ? Math.round(pr.top) : null,
        sticky: pr ? Math.abs(r.top - pr.top) < 2 : false,
      };
    });
    interactions.stickyHeader = stickyCheck;

    // Screenshot scrolled
    await page.screenshot({
      path: resolve(OUT_DIR, `${tier.name}-scrolled.png`),
      fullPage: false,
    });
  } catch (e) {
    interactions.stickyHeader = { error: e.message };
  }

  // 11. Scroll to end of timeline — rightmost month visible?
  try {
    await page.evaluate(() => {
      const el = document.querySelector('[class*="timelineScroll"]');
      if (el) el.scrollLeft = el.scrollWidth - el.clientWidth;
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: resolve(OUT_DIR, `${tier.name}-scrolled-end.png`),
      fullPage: false,
    });
    interactions.scrolledEnd = true;
  } catch (e) {
    interactions.scrolledEnd = { error: e.message };
  }

  tierFindings.interactions = interactions;

  await page.close();
  await context.close();
  findings.tiers[tier.name] = tierFindings;
  return tierFindings;
}

const browser = await chromium.launch({ headless: true });

try {
  for (const tier of TIERS) {
    console.log(`\n──── ${tier.name.toUpperCase()} ${tier.width}x${tier.height} ────`);
    const r = await probeTier(browser, tier);
    console.log(
      `  hScroll=${r.hScroll}  h1s=${r.h1s?.length ?? "?"}  smallBtns=${r.smallButtons.length}  consoleErr=${r.consoleErrors.length}  pageErr=${r.pageErrors.length}`,
    );
    if (r.timelineWidth) {
      console.log(
        `  timeline: client=${r.timelineWidth.clientWidth} scroll=${r.timelineWidth.scrollWidth} hScroll=${r.timelineWidth.hasInternalHScroll}`,
      );
    }
    console.log(
      `  interactions: ${Object.keys(r.interactions).filter((k) => r.interactions[k]).length} attempted`,
    );
  }
} finally {
  await browser.close();
}

writeFileSync(
  resolve(process.cwd(), "year-audit-probe.json"),
  JSON.stringify(findings, null, 2),
);
console.log("\nWrote year-audit-probe.json + screenshots to", OUT_DIR);
