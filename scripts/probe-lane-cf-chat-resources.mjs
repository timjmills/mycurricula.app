// scripts/probe-lane-cf-chat-resources.mjs — Lane CF audit probe.
//
// Verifies the GlobalRail now carries Chat + Resources icons next to To-dos
// on every planner route, and that on /daily the Chat icon toggles the
// commentsPanelOpen state (aria-pressed flips on click).
//
// Routes checked: /weekly /daily /year /catch-up /schedule /subject/math.
// Screenshots captured at three viewport tiers per route.

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
const OUT = resolve(process.cwd(), "docs/screenshots/lane-cf-chat-resources");
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

      // Probe DOM: does the rail include Chat and Resources buttons?
      const railProbe = await page.evaluate(() => {
        const navs = Array.from(document.querySelectorAll("nav"));
        const rail = navs.find((n) => {
          const label = n.getAttribute("aria-label") ?? "";
          return (
            label === "Daily view navigation" || label === "Planner navigation"
          );
        });
        if (!rail) return { found: false };

        // Find Chat: aria-label or title containing "comment" (case-insensitive).
        const allInteractive = Array.from(
          rail.querySelectorAll("button, span[title], a"),
        );
        const findByText = (re) =>
          allInteractive.find((el) => {
            const aria = el.getAttribute("aria-label") ?? "";
            const title = el.getAttribute("title") ?? "";
            return re.test(aria) || re.test(title);
          });

        const chat = findByText(/comment/i);
        const resources = findByText(/resource/i);
        return {
          found: true,
          chatPresent: !!chat,
          chatTag: chat?.tagName.toLowerCase() ?? null,
          chatAriaPressed: chat?.getAttribute("aria-pressed") ?? null,
          chatAriaLabel: chat?.getAttribute("aria-label") ?? null,
          chatTitle: chat?.getAttribute("title") ?? null,
          resourcesPresent: !!resources,
          resourcesTag: resources?.tagName.toLowerCase() ?? null,
          resourcesTitle: resources?.getAttribute("title") ?? null,
        };
      });

      const screenshot = resolve(OUT, `${route.id}__${tier.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });

      // On /daily, also verify the Chat button toggles commentsPanelOpen.
      let toggleOk = true;
      if (route.path.startsWith("/daily") && tier.width >= 481) {
        const before = await page.evaluate(() => {
          const btn = document.querySelector(
            'nav[aria-label="Daily view navigation"] button[aria-label*="comments panel" i]',
          );
          return btn?.getAttribute("aria-pressed") ?? null;
        });
        await page
          .locator(
            'nav[aria-label="Daily view navigation"] button[aria-label*="comments panel" i]',
          )
          .first()
          .click({ timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => {
          const btn = document.querySelector(
            'nav[aria-label="Daily view navigation"] button[aria-label*="comments panel" i]',
          );
          return btn?.getAttribute("aria-pressed") ?? null;
        });
        toggleOk = before !== after;
        report.push({
          route: route.path,
          tier: tier.name,
          toggleBefore: before,
          toggleAfter: after,
          toggleOk,
        });
      }

      const expectVisible = tier.width >= 481; // CSS hides at <=480
      const baseline = expectVisible
        ? railProbe.found &&
          railProbe.chatPresent &&
          railProbe.resourcesPresent
        : true;

      report.push({
        route: route.path,
        tier: tier.name,
        railProbe,
        screenshot,
        baseline,
        toggleOk,
      });

      if (!baseline || !toggleOk) {
        console.error(
          `FAIL ${route.path} @ ${tier.name}: baseline=${baseline} toggleOk=${toggleOk}`,
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
