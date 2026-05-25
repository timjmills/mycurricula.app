// scripts/probe-year-dual-mount.mjs — verify the CSS-only dual-mount switch.
//
// At phone (400px): YearMobile wrapper visible; YearView wrapper aria-hidden
// AND display:none (computed style).
// At desktop (1280px): inverse.
// Captures console warnings/errors and flags any "hydration" warning.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const OUT_DIR = resolve(process.cwd(), "docs/screenshots/year-dual-mount-fix");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "desktop", width: 1280, height: 900 },
];

async function seedAuth(context) {
  const seed = await context.newPage();
  const url = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`;
  await seed.goto(url, { waitUntil: "domcontentloaded" });
  await seed.close();
}

async function inspect(page) {
  return await page.evaluate(() => {
    // Identify wrappers by their content: locate <YearView> and <YearMobile>
    // through their direct DOM children. Both wrappers are the children of
    // a fragment-like provider, so we walk all elements with aria-hidden
    // attribute that are direct children of <main> or its first wrapper.
    // Find both wrappers: traverse <main> looking for direct DIVs that
    // contain a YearView/YearMobile h1.
    const allDivs = Array.from(document.querySelectorAll("div"));
    const wrappers = allDivs
      .filter((el) => {
        const cls = el.className?.toString() ?? "";
        return /desktopOnly|phoneOnly|year-page/i.test(cls);
      })
      .map((el) => {
        const cs = window.getComputedStyle(el);
        return {
          className: el.className?.toString() ?? "",
          ariaHidden: el.getAttribute("aria-hidden"),
          display: cs.display,
          visibility: cs.visibility,
          firstChildTag: el.firstElementChild?.tagName ?? null,
          rect: (() => {
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height) };
          })(),
        };
      });

    const h1s = Array.from(document.querySelectorAll("h1")).map((h) => ({
      text: h.textContent?.trim().slice(0, 80) ?? "",
      hiddenByAria: !!h.closest('[aria-hidden="true"]'),
      visible:
        h.getBoundingClientRect().width > 0 &&
        h.getBoundingClientRect().height > 0,
    }));

    return { wrappers, h1s };
  });
}

const browser = await chromium.launch({ headless: true });

try {
  for (const tier of TIERS) {
    console.log(
      `\n──── ${tier.name.toUpperCase()} ${tier.width}x${tier.height} ────`,
    );
    const context = await browser.newContext({
      viewport: { width: tier.width, height: tier.height },
      deviceScaleFactor: 1,
    });
    await seedAuth(context);

    const page = await context.newPage();
    const consoleMsgs = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      consoleMsgs.push({ type: msg.type(), text: msg.text() });
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // Confirm CSS module rule is actually loaded: search the page's
    // stylesheets for a `.desktopOnly` rule. Helps distinguish "CSS
    // 404'd in dev" from "CSS loaded but selector mismatched".
    const cssState = await page.evaluate(() => {
      const out = { rules: [], styleSheetCount: 0, errors: [] };
      out.styleSheetCount = document.styleSheets.length;
      for (const ss of document.styleSheets) {
        try {
          for (const rule of ss.cssRules ?? []) {
            const text = rule.cssText ?? "";
            if (/desktopOnly|phoneOnly/i.test(text)) {
              out.rules.push(text.slice(0, 240));
            }
          }
        } catch (e) {
          out.errors.push(e.message);
        }
      }
      return out;
    });
    console.log(
      `  cssRules: ${cssState.rules.length}  (stylesheets=${cssState.styleSheetCount})`,
    );
    for (const r of cssState.rules) console.log(`    ${r}`);

    const info = await inspect(page);
    console.log("  wrappers:");
    for (const w of info.wrappers) {
      console.log(
        `    cls=${w.className.includes("desktopOnly") ? "desktopOnly" : "phoneOnly"}  aria-hidden=${w.ariaHidden}  display=${w.display}  child=${w.firstChildTag}`,
      );
    }
    console.log(`  h1Count=${info.h1s.length}`);
    for (const h of info.h1s) {
      console.log(
        `    "${h.text}" hiddenByAria=${h.hiddenByAria} visible=${h.visible}`,
      );
    }

    // Filter console for hydration-related messages
    const hydration = consoleMsgs.filter(
      (m) =>
        /hydrat/i.test(m.text) ||
        /didn't match/i.test(m.text) ||
        /mismatch/i.test(m.text),
    );
    console.log(
      `  consoleMsgs total=${consoleMsgs.length}  hydration=${hydration.length}  pageErrors=${pageErrors.length}`,
    );
    if (hydration.length > 0) {
      for (const h of hydration) {
        console.log(`    [HYDRATION ${h.type}] ${h.text.slice(0, 240)}`);
      }
    }
    // Print warnings/errors verbatim to catch anything unexpected
    for (const m of consoleMsgs) {
      if (m.type === "error" || m.type === "warning") {
        console.log(`    [${m.type}] ${m.text.slice(0, 240)}`);
      }
    }
    for (const e of pageErrors) {
      console.log(`    [pageerror] ${e.slice(0, 240)}`);
    }

    await page.screenshot({
      path: resolve(OUT_DIR, `${tier.name}.png`),
      fullPage: true,
    });

    await page.close();
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\nScreenshots → ${OUT_DIR}`);
