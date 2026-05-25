// scripts/probe-year-print.mjs — verify /year/print renders as a vertical
// month-stack and the print emulation suppresses planner shell chrome.
//
// Outputs: docs/screenshots/year-print/{desktop.png, print-emulation.png,
//          preview.pdf, audit.json}
//
// Usage:
//   PROBE_BASE=http://localhost:3000 CLAUDE_BYPASS_TOKEN=… node scripts/probe-year-print.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

// Pull the bypass token from .env.local if not in the env (Windows shells
// don't auto-export, and the docs/5.24.26 claude-access.md flow expects it
// passed as a URL param to /auth/claude-login).
let TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  try {
    const env = readFileSync(".env.local", "utf8");
    const m = env.match(/^CLAUDE_BYPASS_TOKEN=(.+)$/m);
    if (m) TOKEN = m[1].trim();
  } catch {
    // ignore — will fail below if still missing
  }
}
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN missing from env and .env.local");
  process.exit(1);
}

const OUT_DIR = resolve(process.cwd(), "docs/screenshots/year-print");
mkdirSync(OUT_DIR, { recursive: true });

async function seedAuth(context) {
  const seed = await context.newPage();
  await seed.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year/print`,
    { waitUntil: "domcontentloaded" },
  );
  await seed.close();
}

const out = {};
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await seedAuth(context);
  const page = await context.newPage();

  const consoleErrs = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200));
  });
  const pageErrs = [];
  page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 200)));

  await page.goto(`${BASE}/year/print`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Screen state — counts of sections + structure check
  const screen = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("section"));
    const monthTitles = sections.map(
      (s) => s.querySelector("h2")?.textContent?.trim() ?? "?",
    );
    const tables = sections.map((s) => {
      const t = s.querySelector("table");
      if (!t) return null;
      return {
        cols: t.querySelectorAll("thead th").length,
        rows: t.querySelectorAll("tbody tr").length,
        cells: t.querySelectorAll("tbody td").length,
      };
    });
    const printRoot = document.querySelector("[data-print-view]");
    // Shell chrome should be suppressed by globals.css :has() cascade
    const shellChrome = {
      header:
        !!document.querySelector("header") &&
        document.querySelector("header").offsetParent !== null,
      aside:
        !!document.querySelector("aside") &&
        document.querySelector("aside").offsetParent !== null,
    };
    return {
      hasPrintRoot: !!printRoot,
      sectionCount: sections.length,
      monthTitles,
      tables,
      shellChromeVisible: shellChrome,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
  out.screen = screen;
  console.log("screen:", JSON.stringify(screen, null, 2));

  // Screenshot — screen mode
  await page.screenshot({
    path: resolve(OUT_DIR, "desktop.png"),
    fullPage: true,
  });

  // Print emulation — confirm rules apply
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);

  const printAudit = await page.evaluate(() => {
    const actions = document.querySelector("[class*='actions']");
    const monthSections = document.querySelectorAll("[class*='monthSection']");
    // Read computed style of first month-section: page-break-before
    const firstSection = monthSections[0];
    const secondSection = monthSections[1];
    return {
      sections: monthSections.length,
      actionsHidden: actions && getComputedStyle(actions).display === "none",
      firstSectionBreakBefore: firstSection
        ? getComputedStyle(firstSection).breakBefore
        : null,
      secondSectionBreakBefore: secondSection
        ? getComputedStyle(secondSection).breakBefore
        : null,
    };
  });
  out.print = printAudit;
  console.log("print:", JSON.stringify(printAudit, null, 2));

  // Screenshot — print mode. fullPage on a multi-page print stack can blow
  // past Chromium's max screenshot size; constrain to viewport instead.
  await page.screenshot({
    path: resolve(OUT_DIR, "print-emulation.png"),
    fullPage: false,
  });

  // PDF — landscape, the actual paper output
  await page.pdf({
    path: resolve(OUT_DIR, "preview.pdf"),
    landscape: true,
    format: "Letter",
    printBackground: true,
    margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
  });

  await page.emulateMedia({ media: null });

  out.consoleErrs = consoleErrs;
  out.pageErrs = pageErrs;

  writeFileSync(
    resolve(OUT_DIR, "audit.json"),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log("\nWrote:");
  console.log(" -", resolve(OUT_DIR, "desktop.png"));
  console.log(" -", resolve(OUT_DIR, "print-emulation.png"));
  console.log(" -", resolve(OUT_DIR, "preview.pdf"));
  console.log(" -", resolve(OUT_DIR, "audit.json"));
} finally {
  await browser.close();
}
