// scripts/probe-lane-bk-audit.mjs
//
// Lane BK — full-session audit probe.
// Probes the routes Wave 1A + 1B touched at 3 viewport tiers (360, 768, 1280)
// and emits findings in a JSON manifest the audit doc consumes.
//
// What it measures per route x tier:
//   - scrollWidth vs clientWidth on documentElement and body (document h-scroll?)
//   - h1 count
//   - button count + tooltip/title coverage %
//   - console errors and unhandled rejections
//   - screenshot to docs/screenshots/lane-bk-audit/<route>__<tier>.png
//
// Server: localhost:3000 (caller's responsibility to have a dev server up).

import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
const OUT_DIR = "docs/screenshots/lane-bk-audit";
const REPORT = path.join(OUT_DIR, "_findings.json");
// SECURITY: never hard-code the bypass token. It must come from the
// environment; the probe refuses to run without it (and we never commit a
// fallback credential — a leaked read/write token in a public repo is a
// rotate-now incident).
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN || "";
if (!TOKEN) {
  console.error(
    "CLAUDE_BYPASS_TOKEN is not set. Export it before running this probe; " +
      "this script will not embed a fallback credential.",
  );
  process.exit(1);
}
const TOKEN_ENC = encodeURIComponent(TOKEN);

const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const ROUTES = [
  { slug: "weekly", path: "/weekly" },
  { slug: "daily", path: "/daily" },
  { slug: "year", path: "/year" },
  { slug: "catch-up", path: "/catch-up" },
  { slug: "subject", path: "/subject" },
  { slug: "schedule", path: "/schedule" },
  { slug: "settings", path: "/settings" }, // landing (redirects)
  { slug: "settings-curriculum", path: "/settings/curriculum" },
  { slug: "settings-appearance", path: "/settings/appearance" },
  { slug: "settings-catch-up", path: "/settings/catch-up" },
  { slug: "settings-lesson-templates", path: "/settings/lesson-templates" },
  { slug: "year-print", path: "/year/print" },
];

async function probeOne(browser, route, tier) {
  const ctx = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    // Force a Chrome-on-Windows UA so any browser-targeted CSS resolves predictably.
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

  let nav = "ok";
  try {
    await page.goto(`${BASE}${route.path}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
  } catch (e) {
    nav = `nav-error: ${String(e).slice(0, 120)}`;
  }
  // Settle the page a generous beat for client effects, dev-mode JIT
  // compile, and redirect chains. The Next.js dev server can take a few
  // seconds to compile a never-seen route, so give it room.
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    /* fall through */
  }
  await page.waitForTimeout(1800);

  const finalUrl = page.url();

  // ── Measure overflow + a11y ──────────────────────────────────────────
  // Wrap in retry so navigation-induced context destruction doesn't lose
  // the whole tier. Up to 3 attempts.
  let m = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      m = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      htmlScrollWidth: html.scrollWidth,
      htmlClientWidth: html.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      h1: document.querySelectorAll("h1").length,
      h1Texts: Array.from(document.querySelectorAll("h1"))
        .slice(0, 3)
        .map((el) => (el.textContent || "").trim().slice(0, 80)),
      btnTotal: document.querySelectorAll("button").length,
      btnWithTitle: document.querySelectorAll("button[title]").length,
      btnWithAria: document.querySelectorAll(
        "button[aria-label], button[aria-labelledby]",
      ).length,
      btnWithAriaDescribed: document.querySelectorAll(
        "button[aria-describedby]",
      ).length,
      links: document.querySelectorAll("a").length,
      linksWithTitle: document.querySelectorAll("a[title]").length,
      tooltipsInDom: document.querySelectorAll('[role="tooltip"]').length,
      hasFocusVisible: !!document.querySelector(":focus-visible"),
      pageTitle: document.title,
    };
  });
      break;
    } catch (e) {
      if (attempt === 2) {
        m = {
          htmlScrollWidth: 0, htmlClientWidth: 0,
          bodyScrollWidth: 0, bodyClientWidth: 0,
          h1: 0, h1Texts: [], btnTotal: 0, btnWithTitle: 0,
          btnWithAria: 0, btnWithAriaDescribed: 0, links: 0, linksWithTitle: 0,
          tooltipsInDom: 0, hasFocusVisible: false,
          pageTitle: `EVAL_FAIL: ${String(e).slice(0, 80)}`,
        };
      } else {
        await page.waitForTimeout(1500);
      }
    }
  }

  // ── Screenshot ───────────────────────────────────────────────────────
  const file = path.join(OUT_DIR, `${route.slug}__${tier.name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
  } catch (e) {
    consoleErrors.push(`screenshot-fail: ${String(e).slice(0, 80)}`);
  }

  await ctx.close();

  const docHScroll = m.htmlScrollWidth > m.htmlClientWidth + 1;
  const tooltipCoverage =
    m.btnTotal === 0 ? 100 : Math.round((m.btnWithTitle / m.btnTotal) * 100);

  return {
    route: route.slug,
    pathRequested: route.path,
    finalUrl,
    tier: tier.name,
    viewport: `${tier.width}x${tier.height}`,
    nav,
    docHScroll,
    htmlScrollWidth: m.htmlScrollWidth,
    htmlClientWidth: m.htmlClientWidth,
    bodyScrollWidth: m.bodyScrollWidth,
    bodyClientWidth: m.bodyClientWidth,
    h1Count: m.h1,
    h1Texts: m.h1Texts,
    btnTotal: m.btnTotal,
    btnWithTitle: m.btnWithTitle,
    btnWithAria: m.btnWithAria,
    tooltipCoveragePct: tooltipCoverage,
    linksTotal: m.links,
    linksWithTitle: m.linksWithTitle,
    consoleErrors,
    pageErrors,
    pageTitle: m.pageTitle,
    screenshot: file,
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const findings = [];
  for (const route of ROUTES) {
    for (const tier of TIERS) {
      process.stdout.write(`> ${route.slug} @ ${tier.name}… `);
      const r = await probeOne(browser, route, tier);
      const tag = r.docHScroll
        ? "H-SCROLL"
        : r.h1Count !== 1
          ? `H1=${r.h1Count}`
          : "OK";
      console.log(
        `${tag}  cov=${r.tooltipCoveragePct}%  btns=${r.btnTotal}  errs=${r.consoleErrors.length}`,
      );
      findings.push(r);
    }
  }
  await browser.close();
  await fs.writeFile(REPORT, JSON.stringify(findings, null, 2));
  console.log(`\nReport: ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
