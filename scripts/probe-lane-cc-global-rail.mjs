// scripts/probe-lane-cc-global-rail.mjs — Lane CC audit probe.
//
// Verifies the GlobalRail (promoted from components/daily/IconRail) now
// appears on EVERY planner route, with context-specific buttons (Today,
// Schedule trigger) gated to /daily only.
//
// Routes checked: /weekly /daily /year /catch-up /schedule /subject/math.
// Screenshots at three viewport tiers (phone/tablet/desktop) for each
// route to document the rail behavior responsively.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN required");
  process.exit(2);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "docs/screenshots/lane-cc-global-rail");
mkdirSync(OUT, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const ROUTES = [
  { path: "/weekly", id: "weekly" },
  { path: "/daily", id: "daily" },
  { path: "/year", id: "year" },
  { path: "/catch-up", id: "catch-up" },
  { path: "/schedule", id: "schedule" },
  { path: "/subject/math", id: "subject-math" },
];

const browser = await chromium.launch();
const context = await browser.newContext();

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const report = [];
let exit = 0;

for (const route of ROUTES) {
  for (const tier of TIERS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: tier.width, height: tier.height });
    try {
      await page.goto(`${BASE}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(800);

      // Probe DOM: do we see the GlobalRail nav?
      const railVisible = await page.evaluate(() => {
        // Look for nav with aria-label that matches the rail
        const navs = Array.from(document.querySelectorAll("nav"));
        const rail = navs.find((n) => {
          const label = n.getAttribute("aria-label") ?? "";
          return (
            label === "Daily view navigation" || label === "Planner navigation"
          );
        });
        if (!rail) return { found: false };
        const rect = rail.getBoundingClientRect();
        // Inspect data-context children to know which buttons render.
        const items = Array.from(rail.querySelectorAll("[data-context]"));
        const contexts = items.map((i) => ({
          context: i.getAttribute("data-context"),
          // Some "items" are the gear wrapper; others are <li>s
          tag: i.tagName.toLowerCase(),
        }));
        return {
          found: true,
          ariaLabel: rail.getAttribute("aria-label"),
          width: rect.width,
          height: rect.height,
          visible: rect.width > 0 && rect.height > 0,
          contextCounts: contexts.reduce((acc, c) => {
            acc[c.context] = (acc[c.context] ?? 0) + 1;
            return acc;
          }, {}),
        };
      });

      const screenshot = resolve(OUT, `${route.id}__${tier.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });

      report.push({
        route: route.path,
        tier: tier.name,
        railVisible,
        screenshot,
      });

      const expectVisible = tier.width >= 481; // CSS hides at <=480
      const railOk = expectVisible
        ? railVisible.found && railVisible.visible
        : true;
      const onDaily = route.path.startsWith("/daily");
      const dailyContextCount = railVisible.contextCounts?.daily ?? 0;
      const dailyContextOk =
        (onDaily && dailyContextCount === 2) ||
        (!onDaily && dailyContextCount === 0);

      if (!railOk || !dailyContextOk) {
        console.error(
          `FAIL ${route.path} @ ${tier.name}: rail=${railOk} dailyCtx=${dailyContextOk}`,
        );
        exit = 1;
      } else {
        console.log(`OK   ${route.path} @ ${tier.name}`);
      }
    } catch (err) {
      console.error(`ERROR ${route.path} @ ${tier.name}: ${err.message}`);
      exit = 1;
    } finally {
      await page.close();
    }
  }
}

writeFileSync(resolve(OUT, "_findings.json"), JSON.stringify(report, null, 2));

await browser.close();
process.exit(exit);
