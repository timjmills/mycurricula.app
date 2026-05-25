// scripts/probe-year-touch-targets.mjs — Lane F verification probe.
//
// Loads /year at phone (400px) and tablet (768px), measures the
// StatusFilterBar pills + clear button, opens the MonthPicker and
// measures its items. Asserts each target meets the CLAUDE.md §4 ≥44px
// rule on both axes (or at least min-height ≥44 for vertical-only fixes).
//
// Run: node scripts/probe-year-touch-targets.mjs

import { chromium } from "playwright";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
];

async function seedAuth(context) {
  const seed = await context.newPage();
  const url = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`;
  await seed.goto(url, { waitUntil: "domcontentloaded" });
  await seed.close();
}

async function probeTier(browser, tier) {
  const context = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
  });
  await seedAuth(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });

  // StatusFilterBar pill measurements (visible only). At phone the bar
  // may be hidden by YearMobile, but the controls we own must still be
  // queryable in the DOM when rendered.
  const pillData = await page.evaluate(() => {
    const pills = Array.from(document.querySelectorAll("button[aria-pressed]"))
      .filter((b) => {
        // Skip elements inside aria-hidden subtrees (desktop YearView at phone).
        if (b.closest('[aria-hidden="true"]')) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: b.textContent?.trim().slice(0, 24) ?? "",
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
    const clearBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      /clear all status filters/i.test(b.getAttribute("aria-label") ?? ""),
    );
    let clearRect = null;
    if (clearBtn && clearBtn.getBoundingClientRect().width > 0) {
      const r = clearBtn.getBoundingClientRect();
      clearRect = { w: Math.round(r.width), h: Math.round(r.height) };
    }
    return { pills, clearRect };
  });

  // MonthPicker: click its summary, then measure list items.
  let monthItems = [];
  const summary = page.locator('summary[aria-label*="Jump to month"]').first();
  if ((await summary.count()) > 0 && (await summary.isVisible())) {
    await summary.click();
    await page.waitForTimeout(150);
    monthItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[role="menuitem"]'))
        .filter((b) => b.getBoundingClientRect().width > 0)
        .slice(0, 3)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            label: b.textContent?.trim().slice(0, 24) ?? "",
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        });
    });
  }

  await context.close();
  return { tier: tier.name, pillData, monthItems };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const tier of TIERS) {
    results.push(await probeTier(browser, tier));
  }
  await browser.close();

  let allOk = true;
  for (const r of results) {
    console.log(`\n== ${r.tier} ==`);
    console.log("StatusFilterBar pills:");
    for (const p of r.pillData.pills) {
      const ok = p.h >= 44 && p.w >= 44;
      if (!ok) allOk = false;
      console.log(`  ${ok ? "OK " : "FAIL"} "${p.label}" ${p.w}x${p.h}`);
    }
    if (r.pillData.clearRect) {
      const ok = r.pillData.clearRect.h >= 44;
      if (!ok) allOk = false;
      console.log(
        `Clear filters btn (min-height only): ${ok ? "OK " : "FAIL"} ${r.pillData.clearRect.w}x${r.pillData.clearRect.h}`,
      );
    }
    if (r.monthItems.length > 0) {
      console.log("MonthPicker items (first 3):");
      for (const m of r.monthItems) {
        const ok = m.h >= 44;
        if (!ok) allOk = false;
        console.log(`  ${ok ? "OK " : "FAIL"} "${m.label}" ${m.w}x${m.h}`);
      }
    } else {
      console.log("MonthPicker: not rendered at this tier (skipped)");
    }
  }
  console.log(`\nOverall: ${allOk ? "PASS" : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
})();
