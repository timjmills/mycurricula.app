// scripts/responsive-check.mjs — Playwright responsive audit.
//
// Runs Chromium headless against the deployed mycurricula.app, signs
// in via the Claude bypass (cookie-redirect endpoint), and captures
// screenshots of every important planner surface at three viewport
// widths. Failures + structural anomalies (document horizontal scroll,
// missing key elements, console errors) are reported to stdout.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… node scripts/responsive-check.mjs
//
// Output:
//   docs/screenshots/<slug>__<width>x<height>.png
//   ./responsive-report.txt — human-readable findings

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.RESPONSIVE_CHECK_BASE ?? "https://mycurricula.app";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const OUT_DIR = resolve(process.cwd(), "docs/screenshots");
mkdirSync(OUT_DIR, { recursive: true });

// Three viewport tiers per BUILD_STANDARD §8.
const TIERS = [
  { name: "phone", width: 400, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

// Each scenario covers a route + optional pre-action that sets the
// inline pill state via localStorage. The shell reads the pill on
// mount, so seeding localStorage before navigation gives us the
// "schedule mode on" variants without driving the UI by hand.
const SCENARIOS = [
  { slug: "weekly", path: "/weekly", setup: { /* defaults */ } },
  {
    slug: "weekly-schedule",
    path: "/weekly",
    setup: {
      "mycurricula:weekly-schedule-mode": "schedule",
      "mycurricula:weekly-schedule-include-events": "all",
    },
  },
  {
    slug: "weekly-schedule-lessons-only",
    path: "/weekly",
    setup: {
      "mycurricula:weekly-schedule-mode": "schedule",
      "mycurricula:weekly-schedule-include-events": "lessons",
    },
  },
  { slug: "daily", path: "/daily", setup: {} },
  {
    slug: "daily-schedule-rail",
    path: "/daily",
    setup: { "mycurricula:daily-schedule-mode": "schedule" },
  },
  { slug: "schedule-tab", path: "/schedule", setup: {} },
  { slug: "catch-up", path: "/catch-up", setup: {} },
  { slug: "year", path: "/year", setup: {} },
  { slug: "settings-appearance", path: "/settings/appearance", setup: {} },
  { slug: "settings-catch-up", path: "/settings/catch-up", setup: {} },
];

// ── Helpers ──────────────────────────────────────────────────────────

function logLine(...parts) {
  console.log(parts.join(""));
  reportLines.push(parts.join(""));
}

const reportLines = [];

/** Page-level audit: returns a small bag of structural facts. */
async function pageAudit(page) {
  return await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      hasHorizontalScroll: doc.scrollWidth > doc.clientWidth + 1,
      title: document.title,
      bodyText: body.innerText.slice(0, 200).replace(/\s+/g, " "),
    };
  });
}

// ── Main ─────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

try {
  for (const tier of TIERS) {
    logLine(
      "\n──── ",
      tier.name.toUpperCase(),
      " (",
      tier.width,
      "x",
      tier.height,
      ") ─────────────────",
    );

    const context = await browser.newContext({
      viewport: { width: tier.width, height: tier.height },
      deviceScaleFactor: 2,
      // Use the cookie-redirect login to seed the Supabase session
      // cookies into the context. The first navigation hits the login
      // endpoint and lands on the next path with cookies attached.
    });

    // Console errors collected per-page.
    const consoleErrors = [];
    context.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Seed the Claude session on this context. We do one navigation to
    // the login endpoint per context so every subsequent page in this
    // tier shares the cookies. The browser will follow the 307 to
    // `/weekly` automatically.
    const seedPage = await context.newPage();
    const seedUrl = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`;
    const seedResp = await seedPage.goto(seedUrl, {
      waitUntil: "domcontentloaded",
    });
    if (!seedResp || seedResp.status() >= 400) {
      logLine(
        "    SEED FAILED status=",
        seedResp?.status(),
        " url=",
        seedResp?.url(),
      );
      await seedPage.close();
      await context.close();
      continue;
    }
    await seedPage.close();

    for (const scenario of SCENARIOS) {
      const tierConsole = [];
      const page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") tierConsole.push(msg.text());
      });

      // Seed any pill-state localStorage values before navigation.
      const setupEntries = Object.entries(scenario.setup);
      if (setupEntries.length > 0) {
        // localStorage needs an origin context, so visit the origin
        // once before setting, then navigate to the real path.
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await page.evaluate((entries) => {
          for (const [k, v] of entries) {
            try {
              window.localStorage.setItem(k, v);
            } catch {}
          }
        }, setupEntries);
      }

      const target = `${BASE}${scenario.path}`;
      let resp;
      try {
        resp = await page.goto(target, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
      } catch (err) {
        logLine(
          "  ",
          scenario.slug,
          " — NAV FAILED: ",
          err instanceof Error ? err.message : String(err),
        );
        await page.close();
        continue;
      }

      // Let any client-side hydration + media-query layout finish.
      await page.waitForTimeout(800);

      const audit = await pageAudit(page);
      const screenshotPath = resolve(
        OUT_DIR,
        `${scenario.slug}__${tier.name}-${tier.width}x${tier.height}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: false });

      const tag = audit.hasHorizontalScroll ? "[H-SCROLL]" : "[OK]";
      logLine(
        "  ",
        tag.padEnd(12),
        scenario.slug.padEnd(36),
        " status=",
        String(resp?.status() ?? "?").padStart(3),
        " doc=",
        String(audit.docScrollWidth).padStart(4),
        "/",
        String(audit.docClientWidth).padStart(4),
        " title=",
        JSON.stringify(audit.title.slice(0, 50)),
      );

      if (tierConsole.length > 0) {
        for (const err of tierConsole.slice(0, 3)) {
          logLine("        console.error: ", err.slice(0, 120));
        }
      }

      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

logLine("\nScreenshots written to ", OUT_DIR);
writeFileSync(
  resolve(process.cwd(), "responsive-report.txt"),
  reportLines.join("\n"),
);
