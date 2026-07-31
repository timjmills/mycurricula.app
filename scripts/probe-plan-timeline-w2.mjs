// probe-plan-timeline-w2.mjs — live QA for the Plan timeline's Wave-2
// additions: zoom, the Units|Lessons + Timeline|List switches, the library
// drawer, and unit-band drag authoring (CLAUDE.md §4b). Method B — screenshot
// key moments at the three device tiers with a console check on each.
//
// WHAT ONLY A BROWSER CAN ANSWER, and is therefore what this measures:
//   • Does the zoom slider's floor actually hold? The whole point of resolving
//     `--tl-col` through `max()` is that an inline value cannot beat the
//     coarse-pointer override — and that is a CASCADE fact, not a JS one. A
//     unit test cannot see it; only a real layout can.
//   • Does a real pointer drag move a real band by whole weeks?
//   • Do the new controls stay ≥44px and keep the document from scrolling
//     sideways at 390 / 834 / 1440?
//
// WHAT IT CANNOT: the Personal→Team gate's write path (localhost runs the MOCK
// planner, and the RLS refusal is server-side) and the pending/error branches.
// Both are proven deterministically in tests/plan-timeline-authoring.test.ts
// and tests/plan-timeline-empty.test.ts. An absence-assertion in a browser
// FAILS OPEN against a surface still hydrating, so every check below runs only
// after the `data-mounted` gate.
//
//   node scripts/probe-plan-timeline-w2.mjs
//
// Env: PROBE_BASE (default http://localhost:3010), PROBE_TIERS (csv).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const OUT = "docs/screenshots/plan-timeline-w2";
mkdirSync(OUT, { recursive: true });

const ALL_TIERS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 834, height: 1112, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];
const TIERS = process.env.PROBE_TIERS
  ? ALL_TIERS.filter((t) => process.env.PROBE_TIERS.split(",").includes(t.name))
  : ALL_TIERS;

const findings = [];
const record = (tier, level, msg) => {
  findings.push({ tier, level, msg });
  console.log(`[${level}] ${tier}: ${msg}`);
};
const firstLine = (s) => String(s).split("\n")[0].slice(0, 180);

/** Same demotion rule as probe-plan-timeline.mjs — see its doc comment for why
 *  a caret-color-only hydration diff is an extension artifact and not a bug. */
function classifyConsole(text) {
  if (!/hydrated but some/i.test(text)) return "MAJOR";
  const diffs = [...String(text).matchAll(/^\s*[+-]\s+(\S+?)=/gm)].map((m) => m[1]);
  const styleDiffs = [...String(text).matchAll(/^\s*[+-]\s+style=\{\{([^}]*)\}\}/gm)].map(
    (m) => m[1],
  );
  if (diffs.filter((d) => d !== "style").length > 0) return "MAJOR";
  if (styleDiffs.length === 0) return "MAJOR";
  return styleDiffs.every((s) => /^\s*caret-color\s*:/.test(s)) ? "INFO" : "MAJOR";
}

const browser = await chromium.launch({ channel: "chrome" });

for (const tier of TIERS) {
  const context = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    isMobile: tier.mobile,
    hasTouch: tier.mobile,
    deviceScaleFactor: tier.mobile ? 3 : 1,
  });
  const consoleErrors = [];
  context.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  context.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e)}`));

  try {
    await bypassLogin(context, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
    const page = await context.newPage();
    await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
    const hydrated = await page
      .waitForSelector("[data-mounted]", { timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    if (!hydrated) {
      record(tier.name, "CRITICAL", "timeline never hydrated within 90s — measurements skipped");
      continue;
    }
    await page.waitForTimeout(800);
    console.log(`\n=== ${tier.name} (${tier.width}px) ===`);

    // ── 1. Zoom, and the floor that must survive it ────────────────────────
    const zoom = page.locator("#tl-zoom");
    if ((await zoom.count()) === 0) {
      record(tier.name, "MAJOR", "no zoom control rendered");
    } else {
      const before = await measureColumn(page);
      // Drive it to its MINIMUM. On a coarse pointer the slider's own `min` is
      // the 44px floor it read off the canvas; the assertion is that the
      // resolved column never drops below it whatever the control says.
      const min = Number(await zoom.getAttribute("min"));
      const max = Number(await zoom.getAttribute("max"));
      await zoom.fill(String(min));
      await page.waitForTimeout(250);
      const atMin = await measureColumn(page);
      await zoom.fill(String(max));
      await page.waitForTimeout(250);
      const atMax = await measureColumn(page);
      console.log(
        `zoom → min=${min} max=${max} col: default ${before} · atMin ${atMin} · atMax ${atMax}`,
      );
      if (!(atMax > atMin + 1))
        record(tier.name, "MAJOR", `zoom does not widen the columns (${atMin} → ${atMax})`);
      if (tier.mobile && atMin < 43.5)
        record(
          tier.name,
          "MAJOR",
          `zoomed column ${atMin}px breaches the 44px touch floor (CLAUDE.md §4)`,
        );
      // The dot's HIT area is what a finger has to land on, not the column.
      const hit = await smallestDotBox(page);
      if (tier.mobile && hit && (hit.w < 44 || hit.h < 44))
        record(tier.name, "MAJOR", `dot target ${hit.w}x${hit.h} < 44px at minimum zoom`);
      await page.screenshot({ path: `${OUT}/zoom-min-${tier.name}.png` });
      // Reset, so the later measurements are of the default surface.
      const reset = page.getByRole("button", { name: /Return the timeline to its default/ });
      if ((await reset.count()) > 0) await reset.first().click();
      await page.waitForTimeout(250);
    }

    // ── 2. The two switches ────────────────────────────────────────────────
    const lensGroup = page.getByRole("radiogroup", { name: "What the plan shows" });
    const modeGroup = page.getByRole("radiogroup", { name: "How the plan is drawn" });
    if ((await lensGroup.count()) === 0) record(tier.name, "MAJOR", "no Units|Lessons lens switch");
    if ((await modeGroup.count()) === 0) record(tier.name, "MAJOR", "no Timeline|List switch");

    if ((await lensGroup.count()) > 0) {
      await lensGroup.getByRole("radio", { name: "Lessons" }).click();
      await page.waitForTimeout(300);
      const lens = await page.evaluate(
        () => document.querySelector("[data-lens]")?.getAttribute("data-lens") ?? null,
      );
      if (lens !== "lessons")
        record(tier.name, "MAJOR", `lens switch did not take (data-lens=${lens})`);
      // The lens is EMPHASIS, never a filter: both bands and dots must survive
      // it. A switch that hid half the canvas would be an interaction trap —
      // a teacher could not click what they could not see.
      const survived = await page.evaluate(() => ({
        bands: document.querySelectorAll("[data-lane-subject] [class*='timeline_band__']").length,
        dots: document.querySelectorAll("[data-lane-subject] [class*='timeline_dot__']").length,
      }));
      console.log("lens=lessons →", JSON.stringify(survived));
      if (survived.bands === 0) record(tier.name, "MAJOR", "Lessons lens removed the unit bands");
      if (survived.dots === 0) record(tier.name, "MAJOR", "Lessons lens removed the lesson dots");
      await page.screenshot({ path: `${OUT}/lens-lessons-${tier.name}.png` });
      await lensGroup.getByRole("radio", { name: "Units" }).click();
      await page.waitForTimeout(250);
    }

    if ((await modeGroup.count()) > 0) {
      await modeGroup.getByRole("radio", { name: "List" }).click();
      await page.waitForTimeout(500);
      const list = await page.evaluate(() => {
        // MODULE-PREFIXED. `[class*='row_']` also matches
        // `Tooltip_arrow__hash` ("ar-row_"), whose 5px arrow then reported as
        // the shortest "row" on the page — an instrument manufacturing a
        // touch-target finding out of a tooltip.
        const rows = [...document.querySelectorAll("li > [class*='timeline_row__']")];
        const doc = document.documentElement;
        return {
          rows: rows.length,
          shortestRow: rows.length
            ? Math.min(...rows.map((r) => Math.round(r.getBoundingClientRect().height)))
            : null,
          docOverflow: doc.scrollWidth - doc.clientWidth,
        };
      });
      console.log("mode=list →", JSON.stringify(list));
      if (list.rows === 0) record(tier.name, "MAJOR", "List mode rendered no rows");
      if (list.docOverflow > 1)
        record(tier.name, "CRITICAL", `List mode: document scrolls sideways by ${list.docOverflow}px`);
      if (tier.mobile && list.shortestRow !== null && list.shortestRow < 44)
        record(tier.name, "MAJOR", `List row ${list.shortestRow}px < 44px touch target`);
      await page.screenshot({ path: `${OUT}/list-${tier.name}.png`, fullPage: false });
      await modeGroup.getByRole("radio", { name: "Timeline" }).click();
      await page.waitForTimeout(400);
    }

    // ── 3. The library drawer ──────────────────────────────────────────────
    const drawerBtn = page.getByRole("button", { name: /Library/ }).first();
    if ((await drawerBtn.count()) === 0) {
      record(tier.name, "MAJOR", "no library drawer");
    } else {
      await drawerBtn.click();
      await page.waitForTimeout(500);
      const drawer = await page.evaluate(() => {
        const body = document.querySelector("[class*='drawerBody']");
        const doc = document.documentElement;
        return {
          open: !!body,
          rows: body ? body.querySelectorAll("li").length : 0,
          scrollsInternally: body ? body.scrollHeight > body.clientHeight + 1 : null,
          docOverflow: doc.scrollWidth - doc.clientWidth,
        };
      });
      console.log("drawer →", JSON.stringify(drawer));
      if (!drawer.open) record(tier.name, "MAJOR", "drawer toggle did not open the panel");
      if (drawer.docOverflow > 1)
        record(tier.name, "CRITICAL", `drawer: document scrolls sideways by ${drawer.docOverflow}px`);
      await page.screenshot({ path: `${OUT}/drawer-${tier.name}.png` });
      await drawerBtn.click();
      await page.waitForTimeout(300);
    }

    // ── 4. Drag authoring — the Personal gate, then a real drag in Team ────
    // Desktop only. The gesture is available on touch too, but a synthetic
    // touch drag proves less than a pointer one and the gate is the part that
    // matters most.
    if (tier.name === "desktop") {
      const gatedOff = await page.evaluate(
        () => document.querySelectorAll("[data-draggable]").length,
      );
      const teamBtn = page.getByRole("button", { name: "Team Curriculum" }).first();
      if ((await teamBtn.count()) === 0) {
        record(tier.name, "MINOR", "no Team Curriculum toggle found — drag check skipped");
      } else {
        await teamBtn.click();
        await page.waitForTimeout(900);
        const gatedOn = await page.evaluate(
          () => document.querySelectorAll("[data-draggable]").length,
        );
        console.log(`drag gate → personal:${gatedOff} team:${gatedOn}`);
        if (gatedOn === 0) {
          record(tier.name, "MAJOR", "no draggable bands even in Team Curriculum mode");
        } else {
          if (gatedOff > 0)
            record(tier.name, "MAJOR", `${gatedOff} bands were draggable in Personal mode`);
          const drag = await dragFirstBand(page);
          console.log("drag →", JSON.stringify(drag));
          if (drag.error) {
            record(tier.name, "MAJOR", `band drag failed: ${drag.error}`);
          } else {
            if (drag.afterLeft === null)
              record(tier.name, "MAJOR", `band "${drag.name}" vanished after the drag`);
            else if (drag.beforeLeft === drag.afterLeft)
              record(tier.name, "MAJOR", "band did not move after a drag");
            else {
              const shift = drag.afterLeft - drag.beforeLeft;
              // A week-granularity commit of a two-week gesture must land on a
              // WEEK boundary near the target — not merely somewhere to the
              // right. Half a week of tolerance covers the quantiser's rounding
              // and a clamp at the end of the year.
              const off = Math.abs(shift - drag.expectedShift);
              if (off > drag.expectedShift / 4)
                record(
                  tier.name,
                  "MINOR",
                  `band moved ${shift}px for a ~${drag.expectedShift}px two-week drag (clamped, or the quantiser is off)`,
                );
            }
            // The gesture must NOT also open the unit — the click-suppression
            // path. A drag that re-schedules AND navigates away is worse than
            // one that does neither.
            if (drag.dialogs > 0 || drag.docTabs > 0)
              record(tier.name, "MAJOR", "the drag also opened the unit planner");
            if (!drag.toast)
              record(tier.name, "MINOR", "no toast confirmed the reschedule");
          }
          await page.screenshot({ path: `${OUT}/drag-${tier.name}.png` });
        }
        // Leave the session in Personal mode — a probe must not strand the
        // shared dev session in the mode that shows the team caution glow.
        const personalBtn = page.getByRole("button", { name: "Personal" }).first();
        if ((await personalBtn.count()) > 0) await personalBtn.click();
        await page.waitForTimeout(400);
      }
    }

    for (const e of [...new Set(consoleErrors)].slice(0, 6)) {
      record(tier.name, classifyConsole(e), `console: ${firstLine(e)}`);
    }
  } catch (err) {
    record(tier.name, "CRITICAL", `probe threw: ${String(err.message ?? err).slice(0, 300)}`);
  } finally {
    await context.close();
  }
}

await browser.close();

console.log("\n================ SUMMARY ================");
if (findings.length === 0) console.log("No findings.");
for (const f of findings) console.log(`${f.level.padEnd(9)} ${f.tier.padEnd(8)} ${f.msg}`);
console.log(`screenshots → ${OUT}`);
process.exit(findings.some((f) => f.level === "CRITICAL" || f.level === "MAJOR") ? 1 : 0);

// ── helpers ────────────────────────────────────────────────────────────────

/** The USED width of one day column, measured — never read off `--tl-col`,
 *  which is declared as a `max()` expression and parses to NaN. */
function measureColumn(page) {
  return page.evaluate(() => {
    const day = document.querySelector("[data-tl-day]");
    return day ? Math.round(day.getBoundingClientRect().width * 10) / 10 : 0;
  });
}

function smallestDotBox(page) {
  return page.evaluate(() => {
    const dots = [...document.querySelectorAll("[data-lane-subject] [class*='timeline_dot__']")];
    if (dots.length === 0) return null;
    return dots
      .map((d) => {
        const r = d.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })
      .reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
  });
}

/** Drag the first draggable band right by roughly two school weeks and report
 *  what moved. Uses real mouse events, not `dispatchEvent`: the handler runs on
 *  pointer capture plus window listeners, and a synthesised event skips the
 *  capture path entirely — which is where the bugs live. */
async function dragFirstBand(page) {
  const band = page.locator("[data-draggable]").first();
  if ((await band.count()) === 0) return { error: "no draggable band" };
  const box = await band.boundingBox();
  if (!box) return { error: "band has no box" };
  // IDENTIFY THE BAND, do not re-query position zero. Bands are laid out in
  // start-slot order, so a successful reschedule REORDERS them — comparing
  // `[data-draggable]` before and after would compare two different units and
  // report a 1300px "move" for a two-week drag. The unit's own name is the
  // stable handle.
  const name = await band.evaluate(
    (el) => el.querySelector("[class*='timeline_bandName__']")?.textContent ?? "",
  );
  if (!name) return { error: "band has no readable name" };
  const col = await measureColumn(page);
  const weekPx = col * 5; // ~one school week; two weeks is a clear, safe move
  const beforeLeft = Math.round(box.x);

  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
  await page.mouse.down();
  // Several small steps, not one jump: the handler thresholds on travel and
  // one teleporting move would exercise a code path a hand never produces.
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      box.x + Math.min(24, box.width / 2) + (weekPx * 2 * i) / 6,
      box.y + box.height / 2,
      { steps: 2 },
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);

  return page
    .evaluate(
      ({ name, weekPx }) => {
        const b = [...document.querySelectorAll("[data-draggable]")].find(
          (el) =>
            (el.querySelector("[class*='timeline_bandName__']")?.textContent ??
              "") === name,
        );
        return {
          name,
          afterLeft: b ? Math.round(b.getBoundingClientRect().x) : null,
          // The gesture was a two-week drag; a week-granularity commit should
          // land within half a week of that. Reported rather than asserted on
          // exactly, because a clamp at either end of the year is a legitimate
          // reason to move less.
          expectedShift: Math.round(weekPx * 2),
          dialogs: document.querySelectorAll("[aria-modal='true']").length,
          docTabs: document.querySelectorAll("[data-doctab-active]").length,
          toast:
            document.querySelector("[role='status']")?.textContent?.trim() ??
            null,
        };
      },
      { name, weekPx },
    )
    .then((r) => ({ ...r, beforeLeft }));
}
