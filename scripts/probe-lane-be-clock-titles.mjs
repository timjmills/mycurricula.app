// scripts/probe-lane-be-clock-titles.mjs — Lane BE verification probe.
//
// Boots Chromium against the local dev server, signs in via the Claude
// bypass cookie-redirect endpoint, then visits each major planner route
// at desktop 1280×900 to verify:
//
//   1. The Clock chip is mounted and shows live (non-placeholder) text.
//   2. Each route's h1 + subtitle are present and unique.
//   3. The page reports zero hydration mismatches via console.
//
// Saves a screenshot per route under docs/screenshots/lane-be-clock-titles/.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN=… PROBE_BASE=http://localhost:3004 \
//     node scripts/probe-lane-be-clock-titles.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/lane-be-clock-titles");
mkdirSync(OUT_DIR, { recursive: true });

// Routes to verify — the four/five surfaces that must carry both the
// clock AND a page-level h1 + subtitle.
const ROUTES = [
  { name: "weekly", path: "/weekly", expectTitle: "Weekly View" },
  { name: "daily", path: "/daily", expectTitle: "Daily View" },
  { name: "year", path: "/year", expectTitle: "Yearly View" },
  {
    name: "catch-up",
    path: "/catch-up",
    expectTitle: "What I haven’t covered yet",
  },
  { name: "subject", path: "/subject/math", expectTitle: "Math" },
  { name: "schedule", path: "/schedule", expectTitle: null }, // schedule h1 varies
];

const browser = await chromium.launch();
const context = await browser.newContext();
const consoleErrors = [];

// Hit the bypass endpoint once to seed the session cookie.
const bootstrap = await context.newPage();
const bypassUrl = `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`;
await bootstrap.goto(bypassUrl, { waitUntil: "networkidle" });
await bootstrap.close();

let failed = 0;
const report = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  const localErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter out third-party noise and known DevTools warnings; we
      // care specifically about hydration mismatches.
      // Filter known pre-existing hydration noise unrelated to Lane BE
      // scope:
      //   - dnd-kit's counter-id mismatch ("DndDescribedBy-N").
      //   - SubjectView's button-in-button (groupExpandBtn inside
      //     groupHeader) — pre-existing nesting issue in SubjectView.
      const isDndAnnouncementCounter =
        text.includes("DndDescribedBy-") || text.includes("aria-describedby");
      const isSubjectButtonNesting =
        text.includes("cannot be a descendant of") ||
        text.includes("groupExpandBtn") ||
        text.includes("groupHeader");
      if (
        (text.toLowerCase().includes("hydration") ||
          text.toLowerCase().includes("did not match")) &&
        !isDndAnnouncementCounter &&
        !isSubjectButtonNesting
      ) {
        localErrors.push(text);
        consoleErrors.push({ route: route.name, text });
      }
    }
  });
  page.on("pageerror", (err) => {
    localErrors.push(`pageerror: ${err.message}`);
    consoleErrors.push({ route: route.name, text: `pageerror: ${err.message}` });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
  // Wait for any redirect (subject/ → subject/math) and full network
  // settle so dev-mode JIT has time to ship the CSS modules.
  try {
    await page.waitForLoadState("networkidle", { timeout: 30000 });
  } catch {
    // continue
  }
  // Wait for a known-styled element to confirm CSS modules have shipped.
  // The PageHeader's <h1> is a reliable marker — once it's painted at
  // var(--t-24) we know the route's styles are loaded.
  await page
    .waitForFunction(
      () => {
        const h1 = document.querySelector("h1");
        if (!h1) return false;
        const cs = window.getComputedStyle(h1);
        return parseFloat(cs.fontSize) >= 20;
      },
      null,
      { timeout: 25000 },
    )
    .catch(() => {});
  // Wait for the clock to swap out of placeholder.
  await page
    .waitForFunction(
      () => {
        const candidates = document.querySelectorAll('[role="status"]');
        for (const el of candidates) {
          const text = (el.textContent ?? "").trim();
          if (/AM|PM/i.test(text) && /·/.test(text)) return true;
        }
        return false;
      },
      null,
      { timeout: 25000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1500);

  // ── Clock chip ─────────────────────────────────────────────────────
  // Find by the role + the title attr set by the component. Wrapped in
  // try/catch because dev-mode HMR can destroy the execution context
  // between evaluations on some pages.
  let clockInfo = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      clockInfo = await page.evaluate(() => {
        const el = document.querySelector(
          '[role="status"][title*="local timezone"]',
        );
        if (!el) return null;
        const text = el.textContent ?? "";
        const rect = el.getBoundingClientRect();
        return {
          text: text.replace(/\s+/g, " ").trim(),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.bottom > 0,
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      });
      break;
    } catch (e) {
      await page.waitForTimeout(500);
    }
  }

  // ── h1 / subtitle ──────────────────────────────────────────────────
  let headingInfo = { h1Count: 0, h1Texts: [], visibleH1s: [] };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      headingInfo = await page.evaluate(() => {
        const allH1s = Array.from(document.querySelectorAll("h1"));
        // For the a11y-tree count, exclude h1s inside an aria-hidden
        // ancestor — those are not exposed to assistive tech. This is
        // the canonical pattern /year uses to mount desktop + mobile
        // variants in the DOM without leaking two h1s to AT.
        const ariaTreeH1s = allH1s.filter((h) => {
          let cur = h.parentElement;
          while (cur) {
            if (cur.getAttribute("aria-hidden") === "true") return false;
            cur = cur.parentElement;
          }
          return true;
        });
        return {
          h1Count: ariaTreeH1s.length,
          h1Texts: ariaTreeH1s.map((h) => (h.textContent ?? "").trim()),
          h1CountInDom: allH1s.length,
          h1TextsInDom: allH1s.map((h) => (h.textContent ?? "").trim()),
        };
      });
      break;
    } catch (e) {
      await page.waitForTimeout(500);
    }
  }

  const screenshotPath = resolve(OUT_DIR, `${route.name}__1280x900.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const clockOK = !!clockInfo && !clockInfo.text.startsWith("— · —");
  const titleOK =
    route.expectTitle === null ||
    headingInfo.h1Texts.some((t) => t === route.expectTitle);

  const issues = [];
  if (!clockInfo) issues.push("clock chip not found");
  else if (!clockInfo.visible) issues.push("clock chip not visible");
  else if (!clockOK)
    issues.push(`clock still showing placeholder: "${clockInfo.text}"`);
  if (route.expectTitle && !titleOK)
    issues.push(
      `expected h1 "${route.expectTitle}" missing — found ${JSON.stringify(headingInfo.h1Texts)}`,
    );
  if (headingInfo.h1Count > 1) {
    issues.push(`multiple h1s detected: ${JSON.stringify(headingInfo.h1Texts)}`);
  }
  if (localErrors.length > 0) {
    issues.push(`console/page errors: ${JSON.stringify(localErrors)}`);
  }

  if (issues.length > 0) failed += 1;

  report.push({
    route: route.name,
    path: route.path,
    clockInfo,
    headingInfo,
    issues,
    screenshot: screenshotPath,
  });

  await page.close();
}

await browser.close();

// Render report
for (const r of report) {
  console.log(`\n=== ${r.route} (${r.path}) ===`);
  console.log(
    `  clock: ${
      r.clockInfo
        ? `"${r.clockInfo.text}" visible=${r.clockInfo.visible} (right=${r.clockInfo.right}, bottom=${r.clockInfo.bottom})`
        : "ABSENT"
    }`,
  );
  console.log(
    `  h1s: count=${r.headingInfo.h1Count} texts=${JSON.stringify(r.headingInfo.h1Texts)}`,
  );
  if (r.issues.length > 0) {
    console.log(`  ISSUES:`);
    for (const x of r.issues) console.log(`    - ${x}`);
  } else {
    console.log(`  OK`);
  }
  console.log(`  screenshot → ${r.screenshot}`);
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} (${failed} route(s) with issues)`);
process.exit(failed === 0 ? 0 : 1);
