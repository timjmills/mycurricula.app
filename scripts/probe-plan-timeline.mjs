// probe-plan-timeline.mjs — live QA for the Plan tab's timeline landing
// (CLAUDE.md §4b). Method B: screenshot key moments at the three device tiers,
// with a browser-console error check on each.
//
// WHAT IT MEASURES, AND WHAT IT CANNOT. Localhost runs the MOCK planner path,
// so the store settles instantly and the pending/error branches are UNREACHABLE
// in a browser here. Those are proven deterministically instead, in
// tests/plan-timeline-empty.test.ts. This probe covers what only a real browser
// can answer: does the canvas lay out, does the document scroll sideways, are
// the marks reachable and named, and does anything throw.
//
//   node scripts/probe-plan-timeline.mjs
//
// Env: PROBE_BASE (default http://localhost:3010).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const OUT = "docs/screenshots/plan-timeline";
mkdirSync(OUT, { recursive: true });

const ALL_TIERS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 834, height: 1112, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];
// PROBE_TIERS=desktop runs ONE tier in ONE browser context. That matters for
// attribution, not convenience: this repo's dev server is shared with several
// concurrently-writing lanes, and a Next rebuild landing between two contexts
// of the same run can straddle the RSC payload and the client bundle, which
// surfaces as a hydration warning that belongs to the rebuild, not the page.
// Re-run a suspected console finding on a single tier before believing it.
const TIERS = process.env.PROBE_TIERS
  ? ALL_TIERS.filter((t) => process.env.PROBE_TIERS.split(",").includes(t.name))
  : ALL_TIERS;

const findings = [];
const record = (tier, level, msg) => {
  findings.push({ tier, level, msg });
  console.log(`[${level}] ${tier}: ${msg}`);
};

const firstLine = (s) => String(s).split("\n")[0].slice(0, 180);

/**
 * Grade a console message.
 *
 * ONE KNOWN INSTRUMENT ARTIFACT is demoted to INFO rather than left to shout
 * MAJOR on every run: a hydration mismatch whose ONLY difference is
 * `caret-color` on the hub's search <input>. Nothing in this repo sets
 * `caret-color` — `grep -rn caret --include=*.css --include=*.tsx` finds no
 * such declaration — and React's own message names "a browser extension …
 * which messes with the HTML before React loaded" as a cause. The probe drives
 * `channel: "chrome"`, i.e. the real Chrome install, so that is the fit.
 *
 * Demoting is the lesser risk here ONLY because the match is this narrow: any
 * hydration warning naming any other property still reports MAJOR. A probe that
 * reports a permanent phantom finding gets its whole output ignored, which is
 * how a real finding goes unread.
 */
function classifyConsole(text) {
  if (!/hydrated but some/i.test(text)) return "MAJOR";
  // React prints the offending node with the differing props on `+`/`-` lines.
  // Collect every one and demote ONLY if `caret-color` is the whole story.
  const diffs = [...String(text).matchAll(/^\s*[+-]\s+(\S+?)=/gm)].map((m) => m[1]);
  const styleDiffs = [...String(text).matchAll(/^\s*[+-]\s+style=\{\{([^}]*)\}\}/gm)].map(
    (m) => m[1],
  );
  const nonStyle = diffs.filter((d) => d !== "style");
  if (nonStyle.length > 0) return "MAJOR";
  if (styleDiffs.length === 0) return "MAJOR"; // evidence absent → do not demote
  return styleDiffs.every((s) => /^\s*caret-color\s*:/.test(s)) ? "INFO" : "MAJOR";
}

const browser = await chromium.launch({ channel: "chrome" });

for (const tier of TIERS) {
  // Phone/tablet emulation needs isMobile AND a device scale factor, or the
  // viewport lies about what a real device reports.
  const context = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    isMobile: tier.mobile,
    hasTouch: tier.mobile,
    deviceScaleFactor: tier.mobile ? 3 : 1,
  });

  // Kept WHOLE. `classifyConsole` reads the attribute diff React prints far
  // down the message, so truncating on capture would grade a string with the
  // evidence cut off — and the verdict would then depend on where the cut
  // landed, which is not a verdict at all. Truncation happens at print time.
  const consoleErrors = [];
  context.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  context.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e)}`));

  try {
    await bypassLogin(context, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
    const page = await context.newPage();
    await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
    // The hub hydrates slowly under a cold dev compile; wait for the canvas
    // rather than a fixed sleep, and fail loudly if it never arrives.
    await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
    // HYDRATION GATE — not a nicety. The markup above is SERVER-rendered, and
    // this repo's dev hydrate runs 5–9s. Everything below that asserts an
    // ABSENCE (no today line, no holiday column, no fork mark) would otherwise
    // be measuring HTML whose client effects have not run, and would report a
    // working feature as missing — which is precisely what the first version of
    // this probe did. `data-mounted` flips in PlanTimeline's mount effect.
    const hydrated = await page
      .waitForSelector("[data-mounted]", { timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    if (!hydrated) {
      // Say so and skip, rather than emit absence-findings that cannot be true.
      record(tier.name, "CRITICAL", "timeline never hydrated within 90s — measurements skipped");
      continue;
    }
    await page.waitForTimeout(800);

    const m = await page.evaluate(() => {
      const lanes = [...document.querySelectorAll("[data-lane-subject]")];
      const dots = [...document.querySelectorAll("button[aria-label]")].filter((b) =>
        /Taught|Planned|Needs work|Missed/.test(b.getAttribute("aria-label") ?? ""),
      );
      const bands = [...document.querySelectorAll("button[title*='Opens its unit planner']")];
      const scroller = lanes[0]?.closest("[class*='scroller']") ?? null;
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        lanes: lanes.length,
        laneSubjects: lanes.map((l) => l.getAttribute("data-lane-subject")),
        dots: dots.length,
        bands: bands.length,
        unnamedDots: dots.filter((d) => !(d.getAttribute("aria-label") ?? "").trim()).length,
        forkMarked: document.querySelectorAll("[data-lane-subject] [data-fork]").length,
        todayLine: document.querySelectorAll("[class*='todayLine']").length,
        holidayCols: document.querySelectorAll("[class*='holiday']").length,
        // The document must NEVER scroll sideways; the canvas may.
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mainOverflow: (() => {
          const el = document.querySelector("#main-content");
          return el ? el.scrollWidth - el.clientWidth : null;
        })(),
        scrollerScrolls: scroller ? scroller.scrollWidth > scroller.clientWidth : null,
        scrollerLeft: scroller ? Math.round(scroller.scrollLeft) : null,
        smallestDot: dots.length
          ? dots.map(box).reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b))
          : null,
        smallestBandH: bands.length ? Math.min(...bands.map((b) => box(b).h)) : null,
        laneLabelSticky: (() => {
          const l = document.querySelector("[class*='laneLabel']");
          return l ? getComputedStyle(l).position : null;
        })(),
      };
    });

    console.log(`\n=== ${tier.name} (${tier.width}px) ===`);
    console.log(JSON.stringify(m, null, 1));

    if (m.lanes === 0) record(tier.name, "CRITICAL", "no lanes rendered");
    if (m.dots === 0) record(tier.name, "MAJOR", "no lesson dots rendered");
    if (m.bands === 0) record(tier.name, "MAJOR", "no unit bands rendered");
    if (m.unnamedDots > 0)
      record(tier.name, "MAJOR", `${m.unnamedDots} dots without an accessible name`);
    if (m.docOverflow > 1)
      record(tier.name, "CRITICAL", `document scrolls sideways by ${m.docOverflow}px`);
    if (m.mainOverflow != null && m.mainOverflow > 1)
      record(tier.name, "CRITICAL", `#main-content scrolls sideways by ${m.mainOverflow}px`);
    if (m.scrollerScrolls === false)
      record(tier.name, "MINOR", "the canvas does not scroll — axis may be truncated");
    if (m.laneLabelSticky !== "sticky")
      record(tier.name, "MAJOR", `lane label is ${m.laneLabelSticky}, not sticky`);
    if (tier.mobile && m.smallestDot && (m.smallestDot.w < 44 || m.smallestDot.h < 44))
      record(
        tier.name,
        "MAJOR",
        `dot target ${m.smallestDot.w}x${m.smallestDot.h} < 44px (CLAUDE.md §4)`,
      );
    if (m.scrollerLeft === 0 && m.todayLine > 0)
      record(tier.name, "MINOR", "canvas did not scroll to today on mount");

    await page.screenshot({
      path: `${OUT}/timeline-${tier.name}-${tier.width}.png`,
      fullPage: false,
    });

    // Interaction: open a unit from a band, then close back out.
    const band = page.locator("button[title*='Opens its unit planner']").first();
    if ((await band.count()) > 0) {
      await band.click();
      // WAIT ON THE CONDITION, never a fixed sleep. A 2500 ms sleep here
      // reported "band click opened nothing" three runs running while the
      // unit-explorer chunk was cold-compiling — a false failure that reads
      // exactly like a real one. Time out generously, THEN assert; an
      // instrument that can only fail fast fails open.
      await page
        .waitForSelector("[aria-modal='true'], [data-doctab-active]", { timeout: 60000 })
        .catch(() => {});
      await page.waitForTimeout(800);
      const opened = await page.evaluate(() => ({
        dialogs: document.querySelectorAll("[aria-modal='true']").length,
        docTabs: document.querySelectorAll("[data-doctab-active]").length,
      }));
      console.log(`band click →`, JSON.stringify(opened));
      if (opened.dialogs > 1)
        record(tier.name, "CRITICAL", `${opened.dialogs} aria-modal dialogs after band click`);
      if (opened.dialogs === 0 && opened.docTabs === 0)
        record(tier.name, "MAJOR", "band click opened nothing");
      await page.screenshot({ path: `${OUT}/band-click-${tier.name}.png` });
    } else {
      record(tier.name, "MAJOR", "no band to click");
    }

    // Keyboard reachability — the whole reason bands/dots are <button>s
    // (the handoff's equivalents are pointer-only; audit B6).
    //
    // The band click above navigated the hub to the unit DOC pane, which
    // unmounts the timeline. Escape closes the explorer modal but leaves the
    // doc tab active, so the canvas is still gone — go Home first, or this
    // check queries a subtree that no longer exists and reports "not
    // focusable" about an element that is simply not on screen.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const home = page.locator("[data-hub-home]").first();
    if ((await home.count()) > 0) {
      await home.click();
      await page.waitForTimeout(1200);
    }
    if (tier.name === "desktop") {
      await page.waitForSelector("[data-lane-subject] button", { timeout: 60000 });
      const focusable = await page.evaluate(() => {
        const marks = [...document.querySelectorAll("[data-lane-subject] button")];
        const band = marks.find((b) => /Opens its unit planner/.test(b.getAttribute("title") ?? ""));
        const dot = marks.find((b) => /Opens the lesson/.test(b.getAttribute("title") ?? ""));
        const check = (el) => {
          if (!el) return null;
          el.focus();
          return {
            focused: document.activeElement === el,
            name: el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "",
          };
        };
        return { band: check(band), dot: check(dot) };
      });
      console.log("keyboard focus →", JSON.stringify(focusable));
      if (!focusable?.band?.focused)
        record(tier.name, "MAJOR", "unit bands are not keyboard-focusable");
      if (!focusable?.dot?.focused)
        record(tier.name, "MAJOR", "lesson dots are not keyboard-focusable");
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
